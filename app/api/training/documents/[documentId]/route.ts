
import { NextResponse } from "next/server";

import { graphRequest } from "@/lib/sharepoint/graph";
import {
  requireTrainingUser,
  trainingApiError,
  userCanReviewTraining,
} from "@/lib/training/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

type GraphDriveItemWithDownloadUrl = {
  id?: string;
  name?: string;
  "@microsoft.graph.downloadUrl"?: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

async function retry<T>(
  operation: () => Promise<T>,
  attempts = 2,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, 150 * attempt),
        );
      }
    }
  }

  throw lastError;
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  try {
    const { documentId } = await context.params;

    const { service, identity } =
      await requireTrainingUser(request);

    const { data: document, error: documentError } =
      await service
        .from("employee_training_documents")
        .select("*")
        .eq("id", documentId)
        .maybeSingle();

    if (documentError) {
      throw new Error(documentError.message);
    }

    if (!document) {
      return NextResponse.json(
        {
          error:
            "Training document could not be found.",
        },
        { status: 404 },
      );
    }

    const { data: record, error: recordError } =
      await service
        .from("employee_training_records")
        .select(
          "id,employee_id,training_type_id,workflow_status",
        )
        .eq("id", document.training_record_id)
        .maybeSingle();

    if (recordError) {
      throw new Error(recordError.message);
    }

    if (!record) {
      return NextResponse.json(
        {
          error: "Training record could not be found.",
        },
        { status: 404 },
      );
    }

    let allowed =
      identity.employeeId === record.employee_id;

    if (!allowed) {
      const { data: trainingType } =
        await service
          .from("training_types")
          .select("category_id")
          .eq("id", record.training_type_id)
          .maybeSingle();

      allowed = await userCanReviewTraining({
        service,
        identity,
        trainingTypeId:
          clean(record.training_type_id) || null,
        categoryId:
          clean(trainingType?.category_id) || null,
      });
    }

    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "You do not have access to this Training document.",
        },
        { status: 403 },
      );
    }

    /*
     * IMPORTANT:
     * Do not proxy the actual evidence bytes through this Next.js route.
     *
     * The old implementation downloaded the file inside the server route.
     * For SharePoint that means Microsoft Graph returns a temporary download
     * target and the Node/serverless fetch then has to follow that large-file
     * redirect. That is the path which can surface the generic:
     *
     *   { "error": "fetch failed" }
     *
     * Instead:
     *   - TTTracker authenticates + authorises here.
     *   - Supabase staging gets a 5-minute signed URL.
     *   - SharePoint gets Microsoft's short-lived pre-authenticated
     *     @microsoft.graph.downloadUrl.
     *   - The client follows that URL directly.
     *
     * Browser fetch() and the mobile apiFetch() both follow redirects, so the
     * existing website Training verification viewer remains compatible.
     */

    if (clean(document.staging_path)) {
      const bucket =
        clean(document.staging_bucket) ||
        "training-staging";

      const signed = await retry(async () => {
        const { data, error } = await service.storage
          .from(bucket)
          .createSignedUrl(
            clean(document.staging_path),
            300,
            {
              download:
                clean(document.generated_file_name) ||
                clean(document.original_file_name) ||
                "training-document",
            },
          );

        if (error || !data?.signedUrl) {
          throw new Error(
            error?.message ||
              "Could not create a secure Training evidence link.",
          );
        }

        return data.signedUrl;
      });

      return NextResponse.redirect(signed, {
        status: 307,
        headers: {
          "Cache-Control": "private, no-store",
        },
      });
    }

    const driveId =
      clean(document.sharepoint_drive_id);
    const itemId =
      clean(document.sharepoint_item_id);

    if (driveId && itemId) {
      const driveItem = await retry(() =>
        graphRequest<GraphDriveItemWithDownloadUrl>(
          `/drives/${encodeURIComponent(
            driveId,
          )}/items/${encodeURIComponent(itemId)}`,
          {
            method: "GET",
          },
        ),
      );

      const downloadUrl = clean(
        driveItem["@microsoft.graph.downloadUrl"],
      );

      if (!downloadUrl) {
        throw new Error(
          "SharePoint did not return a temporary download URL for this Training document.",
        );
      }

      return NextResponse.redirect(downloadUrl, {
        status: 307,
        headers: {
          "Cache-Control": "private, no-store",
        },
      });
    }

    /*
     * Very old records may only have a web URL. Keep this fallback, but
     * current controlled Training records should always have drive + item IDs.
     */
    if (clean(document.sharepoint_web_url)) {
      return NextResponse.redirect(
        clean(document.sharepoint_web_url),
        {
          status: 307,
          headers: {
            "Cache-Control": "private, no-store",
          },
        },
      );
    }

    return NextResponse.json(
      {
        error:
          "This Training document has no available file.",
      },
      { status: 404 },
    );
  } catch (error) {
    console.error(
      "Training document delivery failed:",
      error,
    );

    const apiError = trainingApiError(error);

    return NextResponse.json(
      {
        error: apiError.message,
      },
      {
        status: apiError.status,
      },
    );
  }
}

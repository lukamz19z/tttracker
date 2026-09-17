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

type GraphPreviewDriveItem = {
  id: string;
  name?: string;
  file?: {
    mimeType?: string;
  };
  "@microsoft.graph.downloadUrl"?: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function contentDisposition(fileName: string) {
  const safe = fileName.replace(/["\r\n]/g, "_");
  return `inline; filename="${safe}"`;
}

function documentFileName(document: {
  generated_file_name?: unknown;
  original_file_name?: unknown;
}) {
  return (
    clean(document.generated_file_name) ||
    clean(document.original_file_name) ||
    "training-document"
  );
}

function documentMimeType(document: { mime_type?: unknown }) {
  return clean(document.mime_type) || "application/octet-stream";
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { documentId } = await context.params;
    const requestUrl = new URL(request.url);
    const previewMode = requestUrl.searchParams.get("mode") === "preview";

    const { service, identity } = await requireTrainingUser(request);

    const { data: document, error: documentError } = await service
      .from("employee_training_documents")
      .select("*")
      .eq("id", documentId)
      .maybeSingle();

    if (documentError) {
      throw new Error(documentError.message);
    }

    if (!document) {
      return NextResponse.json(
        { error: "Training document could not be found." },
        { status: 404 },
      );
    }

    const { data: record, error: recordError } = await service
      .from("employee_training_records")
      .select("id,employee_id,training_type_id,workflow_status")
      .eq("id", document.training_record_id)
      .maybeSingle();

    if (recordError) {
      throw new Error(recordError.message);
    }

    if (!record) {
      return NextResponse.json(
        { error: "Training record could not be found." },
        { status: 404 },
      );
    }

    let allowed = identity.employeeId === record.employee_id;

    if (!allowed) {
      const { data: type, error: typeError } = await service
        .from("training_types")
        .select("category_id")
        .eq("id", record.training_type_id)
        .maybeSingle();

      if (typeError) {
        throw new Error(typeError.message);
      }

      allowed = await userCanReviewTraining({
        service,
        identity,
        trainingTypeId: clean(record.training_type_id) || null,
        categoryId: clean(type?.category_id) || null,
      });
    }

    if (!allowed) {
      return NextResponse.json(
        { error: "You do not have access to this Training document." },
        { status: 403 },
      );
    }

    const fileName = documentFileName(document);
    const mimeType = documentMimeType(document);

    /*
     * PREVIEW MODE
     *
     * The mobile app cannot hand an authenticated TTTracker API request
     * directly to the device/browser PDF viewer because that external viewer
     * does not carry the user's Supabase bearer token.
     *
     * Instead, return a short-lived HTTPS URL that can be opened directly:
     *
     * - staged evidence -> Supabase Storage signed URL
     * - published evidence -> Microsoft Graph pre-authenticated download URL
     */
    if (previewMode) {
      const stagingPath = clean(document.staging_path);

      if (stagingPath) {
        const bucket =
          clean(document.staging_bucket) || "training-staging";

        const { data: signed, error: signedError } = await service.storage
          .from(bucket)
          .createSignedUrl(stagingPath, 300);

        if (signedError || !clean(signed?.signedUrl)) {
          throw new Error(
            signedError?.message ||
              "A secure preview URL could not be created for the staged Training document.",
          );
        }

        return NextResponse.json(
          {
            url: signed.signedUrl,
            fileName,
            mimeType,
            source: "staging",
          },
          {
            status: 200,
            headers: {
              "Cache-Control": "private, no-store",
            },
          },
        );
      }

      const driveId = clean(document.sharepoint_drive_id);
      const itemId = clean(document.sharepoint_item_id);

      if (driveId && itemId) {
        const driveItem = await graphRequest<GraphPreviewDriveItem>(
          `/drives/${encodeURIComponent(
            driveId,
          )}/items/${encodeURIComponent(itemId)}`,
        );

        const downloadUrl = clean(
          driveItem["@microsoft.graph.downloadUrl"],
        );

        if (downloadUrl) {
          return NextResponse.json(
            {
              url: downloadUrl,
              fileName: clean(driveItem.name) || fileName,
              mimeType:
                clean(driveItem.file?.mimeType) || mimeType,
              source: "sharepoint",
            },
            {
              status: 200,
              headers: {
                "Cache-Control": "private, no-store",
              },
            },
          );
        }
      }

      /*
       * Legacy fallback:
       * Some older Training rows may only have a SharePoint web URL and no
       * stored drive/item IDs. Return that rather than failing the mobile
       * preview completely. It may ask the user to sign into Microsoft.
       */
      const sharePointWebUrl = clean(document.sharepoint_web_url);

      if (/^https:\/\//i.test(sharePointWebUrl)) {
        return NextResponse.json(
          {
            url: sharePointWebUrl,
            fileName,
            mimeType,
            source: "sharepoint-web",
          },
          {
            status: 200,
            headers: {
              "Cache-Control": "private, no-store",
            },
          },
        );
      }

      return NextResponse.json(
        {
          error:
            "This Training document does not have a staged file or published SharePoint file available for preview.",
        },
        { status: 404 },
      );
    }

    /*
     * NORMAL WEBSITE / API BEHAVIOUR
     *
     * Preserve the existing behaviour for callers that are not requesting
     * mode=preview.
     */
    if (clean(document.staging_path)) {
      const bucket =
        clean(document.staging_bucket) || "training-staging";

      const { data: file, error: downloadError } = await service.storage
        .from(bucket)
        .download(document.staging_path);

      if (downloadError || !file) {
        throw new Error(
          downloadError?.message ||
            "The staged document could not be loaded.",
        );
      }

      return new Response(await file.arrayBuffer(), {
        status: 200,
        headers: {
          "Content-Type":
            clean(document.mime_type) ||
            file.type ||
            "application/octet-stream",
          "Content-Disposition": contentDisposition(fileName),
          "Cache-Control": "private, no-store",
        },
      });
    }

    if (clean(document.sharepoint_web_url)) {
      return NextResponse.redirect(document.sharepoint_web_url);
    }

    /*
     * If a published record has Graph IDs but no saved web URL, still let
     * ordinary callers retrieve the file through Microsoft Graph.
     */
    const driveId = clean(document.sharepoint_drive_id);
    const itemId = clean(document.sharepoint_item_id);

    if (driveId && itemId) {
      const driveItem = await graphRequest<GraphPreviewDriveItem>(
        `/drives/${encodeURIComponent(
          driveId,
        )}/items/${encodeURIComponent(itemId)}`,
      );

      const downloadUrl = clean(
        driveItem["@microsoft.graph.downloadUrl"],
      );

      if (downloadUrl) {
        return NextResponse.redirect(downloadUrl);
      }
    }

    return NextResponse.json(
      { error: "This Training document has no available file." },
      { status: 404 },
    );
  } catch (error) {
    const apiError = trainingApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

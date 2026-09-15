import { NextResponse } from "next/server";

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

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function contentDisposition(fileName: string) {
  const safe = fileName.replace(/["\r\n]/g, "_");
  return `inline; filename="${safe}"`;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { documentId } = await context.params;
    const { service, identity } = await requireTrainingUser(request);

    const { data: document, error: documentError } = await service
      .from("employee_training_documents")
      .select("*")
      .eq("id", documentId)
      .maybeSingle();

    if (documentError) throw new Error(documentError.message);

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

    if (recordError) throw new Error(recordError.message);

    if (!record) {
      return NextResponse.json(
        { error: "Training record could not be found." },
        { status: 404 },
      );
    }

    let allowed = identity.employeeId === record.employee_id;

    if (!allowed) {
      const { data: type } = await service
        .from("training_types")
        .select("category_id")
        .eq("id", record.training_type_id)
        .maybeSingle();

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

    if (clean(document.staging_path)) {
      const bucket =
        clean(document.staging_bucket) || "training-staging";

      const { data: file, error: downloadError } = await service.storage
        .from(bucket)
        .download(document.staging_path);

      if (downloadError || !file) {
        throw new Error(
          downloadError?.message || "The staged document could not be loaded.",
        );
      }

      return new Response(await file.arrayBuffer(), {
        status: 200,
        headers: {
          "Content-Type":
            clean(document.mime_type) ||
            file.type ||
            "application/octet-stream",
          "Content-Disposition": contentDisposition(
            clean(document.generated_file_name) ||
              clean(document.original_file_name) ||
              "training-document",
          ),
          "Cache-Control": "private, no-store",
        },
      });
    }

    if (clean(document.sharepoint_web_url)) {
      return NextResponse.redirect(document.sharepoint_web_url);
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

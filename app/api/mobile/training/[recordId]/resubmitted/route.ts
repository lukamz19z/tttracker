import { NextRequest, NextResponse } from "next/server";

import { mobileApiError, requireMobilePermission } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ recordId: string }>;
};

type TrainingDocumentRow = {
  id: string;
  staging_bucket: string | null;
  staging_path: string | null;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { recordId } = await context.params;
    const { service, identity } = await requireMobilePermission(request, "mobile.training");
    const body = (await request.json()) as { newRecordId?: string };
    const newRecordId = String(body.newRecordId ?? "").trim();

    if (!recordId || !newRecordId || !identity.employeeId) {
      return NextResponse.json({ error: "The Training resubmission could not be identified." }, { status: 400 });
    }

    const [oldResult, newResult] = await Promise.all([
      service
        .from("employee_training_records")
        .select("id,employee_id,training_type_id,workflow_status,supersedes_record_id")
        .eq("id", recordId)
        .eq("employee_id", identity.employeeId)
        .maybeSingle(),
      service
        .from("employee_training_records")
        .select("id,employee_id,training_type_id")
        .eq("id", newRecordId)
        .eq("employee_id", identity.employeeId)
        .maybeSingle(),
    ]);

    if (oldResult.error) throw new Error(oldResult.error.message);
    if (newResult.error) throw new Error(newResult.error.message);

    if (!oldResult.data || !newResult.data) {
      return NextResponse.json({ error: "Training record could not be found." }, { status: 404 });
    }

    if (
      oldResult.data.training_type_id !== newResult.data.training_type_id ||
      oldResult.data.workflow_status !== "changes_required"
    ) {
      return NextResponse.json({ error: "Only a matching changes-required record can be replaced this way." }, { status: 409 });
    }

    const { data: documents, error: documentError } = await service
      .from("employee_training_documents")
      .select("id,staging_bucket,staging_path")
      .eq("training_record_id", recordId)
      .eq("active", true);

    if (documentError) throw new Error(documentError.message);

    const rows = (documents ?? []) as TrainingDocumentRow[];
    const byBucket = new Map<string, string[]>();

    for (const document of rows) {
      if (!document.staging_bucket || !document.staging_path) continue;
      const paths = byBucket.get(document.staging_bucket) ?? [];
      paths.push(document.staging_path);
      byBucket.set(document.staging_bucket, paths);
    }

    for (const [bucket, paths] of byBucket) {
      if (paths.length) {
        const { error } = await service.storage.from(bucket).remove(paths);
        if (error) console.warn("Old Training staging files could not be removed", error);
      }
    }

    const now = new Date().toISOString();

    const { error: documentsUpdateError } = await service
      .from("employee_training_documents")
      .update({ active: false })
      .eq("training_record_id", recordId);

    if (documentsUpdateError) throw new Error(documentsUpdateError.message);

    const { error: recordUpdateError } = await service
      .from("employee_training_records")
      .update({
        current_version: false,
        superseded_at: now,
        superseded_by_record_id: newRecordId,
        record_status: "superseded",
        updated_at: now,
      })
      .eq("id", recordId)
      .eq("employee_id", identity.employeeId);

    if (recordUpdateError) throw new Error(recordUpdateError.message);

    return NextResponse.json({ success: true });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { requirePeopleContext, peopleRead, peopleError } from "@/lib/people/server";
import { uploadDocument, documentError } from "@/lib/documents/service";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const org = (await requirePeopleContext(request.nextUrl.searchParams.get("organisation"))).organisation.organisationId;
    const id = request.nextUrl.searchParams.get("id") ?? "";
    const result = await peopleRead(org, "document_access", { filter: { id } });
    if (!result?.rows?.length) throw new Error("PEOPLE_RECORD_NOT_FOUND");
    return NextResponse.json({ name: result.rows[0].name, url: `/api/documents/${encodeURIComponent(id)}?organisation=${encodeURIComponent(org)}&mode=preview` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    unstable_rethrow(error);
    const safe = peopleError(error);
    return NextResponse.json({ error: safe.error }, { status: safe.status });
  }
}

export async function POST(request: NextRequest) {
  let bytes: Uint8Array | undefined;
  let failedOrganisation = "";
  let failedRecord = "";
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new Error("PEOPLE_PERMISSION_DENIED");
    const form = await request.formData();
    const context = await requirePeopleContext(String(form.get("organisation") ?? ""));
    failedOrganisation = context.organisation.organisationId;
    if (!context.permissions?.["training.edit"]) throw new Error("PEOPLE_PERMISSION_DENIED");
    const person = String(form.get("person_id") ?? "");
    const record = String(form.get("record_id") ?? "");
    failedRecord = record;
    const file = form.get("file");
    const side = String(form.get("side") ?? "single");
    if (!(file instanceof File) || !["application/pdf", "image/png", "image/jpeg"].includes(file.type) || !["single", "front", "back"].includes(side) || file.size > 10485760) throw new Error("TRAINING_FILE_INVALID");
    const scope = await peopleRead(context.organisation.organisationId, "document_scope", { personId: person, filter: { id: record } });
    // Fail before any Graph write when the deployment has not received the
    // central metadata migration. Never fall back to another storage provider.
    const schema = await createSupabaseAdmin().from("v2_people_documents").select("sharepoint_item_id").limit(0);
    if (schema.error) throw new Error("TRAINING_SCHEMA_NOT_READY");
    const display = String(scope.person.display_name), names = display.trim().split(/\s+/);
    bytes = new Uint8Array(await file.arrayBuffer());
    const document = await uploadDocument({ organisationId: context.organisation.organisationId, actorId: context.userId, permissions: context.permissions ?? {} }, {
      context: "training", entityType: "training", entityId: record, personId: person,
      relationshipTypeId: scope.person.relationship_type_id, side: side as "single" | "front" | "back",
      values: { person_id: person, employee_number: String(scope.person.employee_number ?? ""), person_display_name: display,
        first_name: names[0] ?? "", last_name: names.slice(1).join(" "), training_type: String(scope.training.name),
        training_category: String(scope.training.category ?? ""), training_option: String(scope.training.option_name ?? ""), document_side: side === "front" ? "Front" : side === "back" ? "Back" : "Single",
        issue_date: String(scope.training.issue_date ?? ""), expiry_date: String(scope.training.expiry_date ?? ""),
        document_type: "Training evidence", document_category: "Training", year: String(new Date().getUTCFullYear()), month: String(new Date().getUTCMonth() + 1).padStart(2, "0") },
    }, { name: file.name, mime: file.type, bytes }, String(form.get("document_id") ?? "") || undefined);
    const result = await (await createSupabaseServer()).rpc("tttracker_v2_attach_training_document", {
      p_org: context.organisation.organisationId, p_document: document.id, p_record: record,
    });
    if (result.error || !result.data?.id) throw new Error("TRAINING_DOCUMENT_LINK_FAILED");
    return NextResponse.json(result.data);
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : "";
    console.error("Training evidence upload failed", { code: /^(DOCUMENT_|TRAINING_|PEOPLE_|INTEGRATION_)[A-Z_]+$/.test(message) ? message : "TRAINING_UPLOAD_FAILED" });
    if (failedOrganisation && failedRecord && (/^(DOCUMENT_|INTEGRATION_)[A-Z_]+$/.test(message) || message === "TRAINING_DOCUMENT_LINK_FAILED")) {
      try {
        const session = await createSupabaseServer();
        await session.rpc("tttracker_v2_people_write", {
          p_organisation_id: failedOrganisation,
          p_action: "training_upload_failed",
          p_id: failedRecord,
          p_data: { code: message },
        });
      } catch {
        // The submission remains a non-operational draft even if this status
        // update is unavailable. Never turn an upload error into success.
      }
    }
    if (/^(PEOPLE_|TRAINING_)/.test(message)) {
      const safe = peopleError(error);
      return NextResponse.json({ error: safe.error }, { status: safe.status });
    }
    return NextResponse.json(documentError(error), { status: 422 });
  } finally { bytes?.fill(0); }
}

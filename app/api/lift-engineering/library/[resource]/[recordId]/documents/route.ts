import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";
import { uploadLiftLibrarySource } from "@/lib/lift-engineering/sharepoint";

const ownerTables: Record<string, { table: string; documentField: "source_document" | "source_documents" }> = {
  charts: { table: "lift_load_charts", documentField: "source_document" },
  "crane-revisions": { table: "lift_crane_profile_revisions", documentField: "source_document" },
  "configuration-revisions": { table: "lift_crane_configuration_revisions", documentField: "source_document" },
  "rigging-revisions": { table: "lift_rigging_item_revisions", documentField: "source_document" },
  "template-revisions": { table: "lift_tower_template_revisions", documentField: "source_documents" },
};

export async function POST(request: Request, context: { params: Promise<{ resource: string; recordId: string }> }) {
  try {
    const { user, service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const { resource, recordId } = await context.params; const owner = ownerTables[resource];
    if (!owner) return NextResponse.json({ error: "Lift Engineering document owner type was not found." }, { status: 404 });
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > 30 * 1024 * 1024) liftInvalid("Choose a source document up to 30 MB.");
    const { data: row, error: readError } = await service.from(owner.table).select(`id,${owner.documentField}`).eq("id", recordId).maybeSingle();
    if (readError) throw new Error(readError.message); if (!row) return NextResponse.json({ error: "Library revision was not found." }, { status: 404 });
    const { driveId, folderId, uploaded } = await uploadLiftLibrarySource({ fileName: file.name, content: new Uint8Array(await file.arrayBuffer()), contentType: file.type || "application/octet-stream" });
    const document = { fileName: uploaded.name, driveId, folderId, itemId: uploaded.id, webUrl: uploaded.webUrl ?? null, mimeType: file.type || null, sizeBytes: file.size, uploadedAt: new Date().toISOString() };
    const previous = (row as Record<string, unknown>)[owner.documentField];
    const next = owner.documentField === "source_documents" ? [...(Array.isArray(previous) ? previous : []), document] : document;
    const { error: updateError } = await service.from(owner.table).update({ [owner.documentField]: next }).eq("id", recordId);
    if (updateError) throw new Error(`Source document uploaded but its library reference could not be saved: ${updateError.message}`);
    const { error: indexError } = await service.from("lift_documents").insert({ owner_kind: resource, owner_id: recordId, owner_revision_id: recordId,
      document_type: "source", file_name: uploaded.name, sharepoint_drive_id: driveId, sharepoint_item_id: uploaded.id,
      sharepoint_folder_id: folderId, sharepoint_web_url: uploaded.webUrl ?? null, source_document: document, created_by: user.id });
    if (indexError) throw new Error(`Source document uploaded and linked, but document index save failed: ${indexError.message}`);
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

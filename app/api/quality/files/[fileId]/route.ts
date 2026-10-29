import { NextResponse } from "next/server";
import { qualityWorkflowAccess } from "@/lib/quality/workflow-access";
import { atomicQualityError } from "@/lib/quality/atomic-error";
import { qualityApiError } from "@/lib/quality/server";
import { deleteDriveItem } from "@/lib/sharepoint/graph";

export async function DELETE(request: Request, context: { params: Promise<{ fileId: string }> }) {
  try {
    const { service, user } = await qualityWorkflowAccess(request);
    const { fileId } = await context.params;
    const body = await request.json();
    if (body.confirm !== true) return NextResponse.json({ error: "Confirm deleting this photo." }, { status: 400 });
    const begun = await service.rpc("begin_v1_quality_photo_delete", { p_file: fileId, p_actor: user.id, p_reason: String(body.reason || "Duplicate or unwanted evidence") });
    if (begun.error) { const result = atomicQualityError(begun.error); return NextResponse.json({ error: result.message }, { status: result.status }); }
    const audit = begun.data;
    if (!audit?.file_snapshot) throw new Error("Controlled photo deletion returned no storage snapshot.");
    if (!audit.completed_at) {
      const file = audit.file_snapshot;
      if (!file.sharepoint_drive_id) throw new Error("Evidence storage reference is missing. Deletion is pending reconciliation.");
      for (const itemId of new Set<string>([file.sharepoint_item_id, file.annotated_sharepoint_item_id].filter(Boolean))) {
        try { await deleteDriveItem({ driveId: file.sharepoint_drive_id, itemId }); }
        catch (error) { if (!/\(404\b/.test(error instanceof Error ? error.message : "")) throw error; }
      }
      const finished = await service.rpc("finish_v1_quality_photo_delete", { p_file: fileId, p_actor: user.id });
      if (finished.error) throw new Error(finished.error.message);
    }
    return NextResponse.json({ deleted: true });
  } catch (error) { const result = qualityApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

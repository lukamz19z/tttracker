import { NextRequest, NextResponse } from "next/server";
import { invalidLadder, ladderAccess, ladderError, ladderUuid } from "@/lib/assets/ladder-server";
import { ensureEquipmentSharePointFolder, equipmentLabel, loadEquipmentDocumentTypes, loadEquipmentRecord } from "@/lib/assets/equipment-sharepoint";

type Context = { params: Promise<{ equipmentId: string }> };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest, context: Context) {
  try {
    const { service, canEdit } = await ladderAccess(request);
    const { equipmentId } = await context.params;
    if (!ladderUuid.test(equipmentId)) invalidLadder("Choose a valid ladder.");
    const item = await loadEquipmentRecord({ service, equipmentType: "ladder", equipmentId });
    const [documents, documentTypes, sharePoint, supersedes, supersededBy] = await Promise.all([
      service.from("equipment_documents").select("*").eq("equipment_type", "ladder").eq("equipment_id", equipmentId).order("created_at", { ascending: false }),
      loadEquipmentDocumentTypes({ service, equipmentType: "ladder" }),
      service.from("equipment_sharepoint_links").select("*").eq("equipment_type", "ladder").eq("equipment_id", equipmentId).maybeSingle(),
      item.supersedes_ladder_id ? service.from("equipment_ladders").select("id,ladder_number").eq("id", item.supersedes_ladder_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      service.from("equipment_ladders").select("id,ladder_number").eq("supersedes_ladder_id", equipmentId).maybeSingle(),
    ]);
    for (const result of [documents, sharePoint, supersedes, supersededBy]) if (result.error) throw new Error(`Ladder detail query failed: ${result.error.message}`);
    return NextResponse.json({ equipmentType: "ladder", equipmentId, item, label: equipmentLabel("ladder", item), documents: documents.data, documentTypes, sharePoint: sharePoint.data, canManage: canEdit, ladderRelations: { supersedes: supersedes.data, supersededBy: supersededBy.data } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return ladderError(error); }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const { service } = await ladderAccess(request, true);
    const { equipmentId } = await context.params;
    if (!ladderUuid.test(equipmentId)) invalidLadder("Choose a valid ladder.");
    const result = await ensureEquipmentSharePointFolder({ service, equipmentType: "ladder", equipmentId });
    return NextResponse.json({ sharePoint: { sharepoint_web_url: result.itemFolder.webUrl } });
  } catch (error) { return ladderError(error); }
}

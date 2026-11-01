import { NextRequest, NextResponse } from "next/server";
import { mobileApiError, requireMobilePermission } from "@/lib/mobile/server";
import { notifyMissingMaterialEvent } from "@/lib/materials/missing-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const clean = (value: unknown) => String(value ?? "").trim();

export async function POST(request: NextRequest) {
  try {
    const { service, identity } = await requireMobilePermission(request, "mobile.materials");
    const body = await request.json() as Record<string, unknown>;
    const projectId = clean(body.projectId), towerId = clean(body.towerId), issueKey = clean(body.issueKey), clientMutationId = clean(body.clientMutationId);
    const quantity = Number(body.quantity);
    if (!projectId || !towerId || !issueKey || !clientMutationId || !Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: "Project, tower, item, positive quantity and mutation ID are required." }, { status: 400 });
    const { data: access, error: accessError } = await service.from("project_access").select("user_id").eq("project_id", projectId).eq("user_id", identity.userId).maybeSingle();
    if (accessError) throw new Error(accessError.message);
    if (!access) return NextResponse.json({ error: "You do not have access to this project." }, { status: 403 });
    const { data: sourceItem, error: itemError } = await service.from("tower_material_event_items").select("event_id").eq("issue_key", issueKey).maybeSingle();
    if (itemError) throw new Error(itemError.message);
    if (!sourceItem) return NextResponse.json({ error: "Excess material item was not found." }, { status: 404 });
    const result = await service.rpc("tttracker_v1_collect_excess_material", {
      p_project_id: projectId, p_tower_id: towerId, p_issue_key: issueKey, p_quantity: quantity,
      p_client_mutation_id: clientMutationId, p_user_id: identity.userId,
      p_location: clean(body.location) || null, p_reference: clean(body.reference) || null,
      p_notes: clean(body.notes) || null, p_occurred_at: clean(body.occurredAt) || new Date().toISOString(),
    });
    if (result.error) throw new Error(result.error.message);
    const collection = result.data as { event_id: string; duplicate: boolean; remaining_quantity: number; total_quantity: number; collected_quantity: number };
    if (!collection.duplicate) await notifyMissingMaterialEvent({
      service, projectId, sourceEventId: collection.event_id, issueEventId: sourceItem.event_id,
      kind: collection.remaining_quantity <= 0 ? "excess_resolved" : "excess_partial_collection",
      actorUserId: identity.userId, totalQuantity: collection.total_quantity,
      receivedQuantity: quantity, remainingQuantity: collection.remaining_quantity,
      deliveryReference: clean(body.reference) || null,
    });
    return NextResponse.json({ ok: true, collection });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

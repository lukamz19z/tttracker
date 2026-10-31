import { NextRequest, NextResponse } from "next/server";
import { mobileApiError, requireMobilePermission } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const clean = (value: unknown) => String(value ?? "").trim();
const numberValue = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };

export async function POST(request: NextRequest) {
  try {
    const { service, identity } = await requireMobilePermission(request, "mobile.materials");
    const body = await request.json() as { issueKey?: unknown; quantity?: unknown; notes?: unknown; clientMutationId?: unknown; deliveryReference?: unknown; occurredAt?: unknown };
    const issueKey = clean(body.issueKey);
    const quantity = numberValue(body.quantity);
    const mutationId = clean(body.clientMutationId);
    if (!issueKey || quantity <= 0 || !mutationId) return NextResponse.json({ error: "Issue key, positive received quantity and mutation ID are required." }, { status: 400 });

    const { data: issue, error: issueError } = await service.from("tower_material_event_items").select("id,event_id,issue_key").eq("issue_key", issueKey).maybeSingle();
    if (issueError) throw new Error(issueError.message);
    if (!issue) return NextResponse.json({ error: "Missing-material item not found." }, { status: 404 });
    const { data: parent, error: parentError } = await service.from("tower_material_events").select("id,project_id,tower_id,event_type").eq("id", issue.event_id).maybeSingle();
    if (parentError) throw new Error(parentError.message);
    if (!parent || parent.event_type !== "missing") return NextResponse.json({ error: "This item is not a missing-material record." }, { status: 400 });
    const { data: access, error: accessError } = await service.from("project_access").select("project_id").eq("project_id", parent.project_id).eq("user_id", identity.userId).maybeSingle();
    if (accessError) throw new Error(accessError.message);
    if (!access) return NextResponse.json({ error: "You do not have access to this project." }, { status: 403 });

    const result = await service.rpc("tttracker_v1_record_material_receipt", {
      p_project_id: parent.project_id,
      p_tower_id: parent.tower_id,
      p_issue_key: issueKey,
      p_quantity: quantity,
      p_client_mutation_id: mutationId,
      p_received_by_user_id: identity.userId,
      p_delivery_reference: clean(body.deliveryReference) || null,
      p_notes: clean(body.notes) || null,
      p_occurred_at: clean(body.occurredAt) || new Date().toISOString(),
    });
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ ok: true, receipt: result.data });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

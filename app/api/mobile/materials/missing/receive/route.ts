import { NextRequest, NextResponse } from "next/server";
import { mobileApiError, requireMobilePermission } from "@/lib/mobile/server";
import { notifyMissingMaterialEvent } from "@/lib/materials/missing-notifications";
import { configuredMaterialUsers } from "@/lib/materials/configured-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const clean = (value: unknown) => String(value ?? "").trim();
const numberValue = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const { service, identity } = await requireMobilePermission(request, "mobile.materials");
    const body = await request.json() as { projectId?: unknown; issueKey?: unknown; quantity?: unknown; notes?: unknown; clientMutationId?: unknown; deliveryReference?: unknown; occurredAt?: unknown; notifyUserIds?: unknown };
    const issueKey = clean(body.issueKey);
    const requestedProjectId = clean(body.projectId);
    const quantity = numberValue(body.quantity);
    const mutationId = clean(body.clientMutationId);
    if (body.notifyUserIds !== undefined && !Array.isArray(body.notifyUserIds)) {
      return NextResponse.json({ error: "Notify users must be supplied as a list." }, { status: 400 });
    }
    if (!issueKey || quantity <= 0 || !mutationId) return NextResponse.json({ error: "Issue key, positive received quantity and mutation ID are required." }, { status: 400 });
    if (!issueKey.startsWith("pending:") && !UUID.test(issueKey)) return NextResponse.json({ error: "The missing-material item ID is invalid. Refresh the Materials list and retry." }, { status: 400 });

    let issueQuery = service.from("tower_material_event_items").select("id,event_id,issue_key,quantity").eq("issue_key", issueKey);
    if (requestedProjectId && issueKey.startsWith("pending:")) {
      const { data: pendingEvent, error: pendingError } = await service.from("tower_material_events").select("id").eq("project_id", requestedProjectId).eq("client_mutation_id", issueKey.slice("pending:".length)).maybeSingle();
      if (pendingError) throw new Error(pendingError.message);
      if (pendingEvent) issueQuery = service.from("tower_material_event_items").select("id,event_id,issue_key,quantity").eq("event_id", pendingEvent.id);
    }
    const { data: issue, error: issueError } = await issueQuery.maybeSingle();
    if (issueError) throw new Error(issueError.message);
    if (!issue) return NextResponse.json({ error: "Missing-material item not found." }, { status: 404 });
    const { data: parent, error: parentError } = await service.from("tower_material_events").select("id,project_id,tower_id,event_type").eq("id", issue.event_id).maybeSingle();
    if (parentError) throw new Error(parentError.message);
    if (!parent || parent.event_type !== "missing") return NextResponse.json({ error: "This item is not a missing-material record." }, { status: 400 });
    const { data: access, error: accessError } = await service.from("project_access").select("project_id").eq("project_id", parent.project_id).eq("user_id", identity.userId).maybeSingle();
    if (accessError) throw new Error(accessError.message);
    if (!access) return NextResponse.json({ error: "You do not have access to this project." }, { status: 403 });

    const notifyUserIds = Array.isArray(body.notifyUserIds)
      ? [...new Set(body.notifyUserIds.map(clean).filter(Boolean))]
      : [];
    if (notifyUserIds.length) {
      const configuredUsers = await configuredMaterialUsers(service, parent.project_id);
      const eligibleIds = new Set(configuredUsers.map(person => person.id));
      if (notifyUserIds.some(id => !eligibleIds.has(id))) {
        return NextResponse.json({ error: "Notify users must come from this project's configured Materials Notification Users." }, { status: 400 });
      }
    }

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
    if (result.error) {
      if (/remain outstanding|already fully received/i.test(result.error.message)) return NextResponse.json({ error: result.error.message, conflict: true }, { status: 409 });
      throw new Error(result.error.message);
    }
    const receipt = result.data as { event_id: string; duplicate?: boolean; remaining_quantity?: number; issue_status?: string };
    const { error: recipientsError } = await service.from("tower_material_events")
      .update({ notify_user_ids: notifyUserIds })
      .eq("id", receipt.event_id)
      .eq("project_id", parent.project_id);
    if (recipientsError) throw new Error(`Receipt was recorded but Notify recipients could not be saved: ${recipientsError.message}`);
    let remaining = Number(receipt.remaining_quantity);
    if (!Number.isFinite(remaining)) {
      const [{ data: receiptRows, error: receiptRowsError }, { data: receiptEventRows, error: receiptEventError }] = await Promise.all([
        service.from("tower_material_event_items").select("event_id,quantity").eq("source_issue_key", issueKey),
        service.from("tower_material_events").select("id").eq("project_id", parent.project_id).in("event_type", ["found_received", "transfer_received"]),
      ]);
      if (receiptRowsError || receiptEventError) throw new Error(receiptRowsError?.message || receiptEventError?.message);
      const receiptEventIds = new Set((receiptEventRows || []).map(row => row.id));
      const received = (receiptRows || []).filter(row => receiptEventIds.has(row.event_id)).reduce((sum, row) => sum + Number(row.quantity || 0), 0);
      remaining = Math.max(Number(issue.quantity || 0) - received, 0);
    }
    const totalQuantity = Number(issue.quantity || 0);
    await notifyMissingMaterialEvent({
      service,
      projectId: parent.project_id,
      sourceEventId: receipt.event_id,
      issueEventId: parent.id,
      kind: remaining > 0 ? "partial_receipt" : "full_receipt",
      actorUserId: identity.userId,
      totalQuantity,
      receivedQuantity: totalQuantity - remaining,
      remainingQuantity: remaining,
      deliveryReference: clean(body.deliveryReference) || null,
      notifyUserIds,
      includeIssueRecipients: false,
    });
    let issueStatus = receipt.issue_status;
    if (!issueStatus || receipt.duplicate) {
      const { data: refreshedIssue, error: refreshError } = await service.from("tower_material_events").select("issue_status").eq("id", parent.id).maybeSingle();
      if (refreshError) throw new Error(refreshError.message);
      issueStatus = refreshedIssue?.issue_status || issueStatus;
    }
    if (remaining <= 0 && issueStatus === "resolved") {
      await notifyMissingMaterialEvent({ service, projectId: parent.project_id, sourceEventId: parent.id, kind: "resolved", actorUserId: identity.userId });
    }
    return NextResponse.json({ ok: true, receipt: { ...receipt, remaining_quantity: remaining } });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

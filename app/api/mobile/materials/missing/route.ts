import { NextRequest, NextResponse } from "next/server";
import { mobileApiError, requireMobilePermission } from "@/lib/mobile/server";
import { notifyMissingMaterialEvent } from "@/lib/materials/missing-notifications";
import { normalizeMissingMaterialType } from "@/mobile/lib/materials/canonical-material-type";
import { configuredMaterialUsers } from "@/lib/materials/configured-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const clean = (value: unknown) => String(value ?? "").trim();
const positive = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : 0; };

export async function POST(request: NextRequest) {
  try {
    const { service, identity } = await requireMobilePermission(request, "mobile.materials");
    const body = await request.json() as Record<string, unknown>;
    const projectId = clean(body.projectId);
    const towerId = clean(body.towerId);
    const clientMutationId = clean(body.clientMutationId);
    const issueType = clean(body.issueType) === "excess" ? "excess" : "missing";
    const quantity = positive(body.quantity);
    const description = clean(body.description);
    const assignedToUserId = clean(body.assignedToUserId) || null;
    const notifyUserIds = Array.isArray(body.notifyUserIds) ? body.notifyUserIds.map(clean).filter(Boolean) : [];
    if (!projectId || !towerId || !clientMutationId || !quantity || !description) {
      return NextResponse.json({ error: "Project, tower, item, quantity and mutation ID are required." }, { status: 400 });
    }
    const [{ data: tower, error: towerError }, { data: access, error: accessError }] = await Promise.all([
      service.from("towers").select("id,project_id").eq("id", towerId).eq("project_id", projectId).maybeSingle(),
      service.from("project_access").select("project_id").eq("project_id", projectId).eq("user_id", identity.userId).maybeSingle(),
    ]);
    if (towerError || accessError) throw new Error(towerError?.message || accessError?.message);
    if (!tower) return NextResponse.json({ error: "Tower was not found in this project." }, { status: 404 });
    if (!access) return NextResponse.json({ error: "You do not have access to this project." }, { status: 403 });
    const requestedUsers = [...new Set([...(assignedToUserId ? [assignedToUserId] : []), ...notifyUserIds])];
    if (requestedUsers.length) {
      const eligibleIds = new Set((await configuredMaterialUsers(service, projectId)).map(user => user.id));
      if (assignedToUserId && !eligibleIds.has(assignedToUserId)) return NextResponse.json({ error: "Assign To must be selected from this project's configured Materials users." }, { status: 400 });
      if (notifyUserIds.some(id => !eligibleIds.has(id))) return NextResponse.json({ error: "Additional recipients must be selected from this project's configured Materials users." }, { status: 400 });
    }
    if (requestedUsers.length) {
      const { data: userAccess, error: userAccessError } = await service.from("project_access").select("user_id").eq("project_id", projectId).in("user_id", requestedUsers);
      if (userAccessError) throw new Error(userAccessError.message);
      if ((userAccess || []).length !== requestedUsers.length) return NextResponse.json({ error: "One or more selected users do not have access to this project." }, { status: 400 });
    }
    const result = await service.rpc(issueType === "excess" ? "tttracker_v1_create_excess_material" : "tttracker_v1_create_missing_material", {
      p_project_id: projectId,
      p_tower_id: towerId,
      p_client_mutation_id: clientMutationId,
      p_user_id: identity.userId,
      p_item: {
        sourceTable: clean(body.sourceTable) || null,
        sourceRecordId: clean(body.sourceRecordId) || null,
        // Legacy clients sent the display category here (for example "steel").
        // Normalize at the API boundary; the configured category is separate.
        materialType: normalizeMissingMaterialType({sourceTable:body.sourceTable,sourceRecordId:body.sourceRecordId,linkedType:body.materialType,category:body.category}),
        boltSize: clean(body.boltSize) || null,
        itemReference: clean(body.itemReference) || description,
        description,
        quantity,
        unit: clean(body.unit) || "ea",
        notes: clean(body.itemNotes) || null,
        category: clean(body.category) || "Other",
        specification: clean(body.specification) || null,
        segment: clean(body.segment) || null,
        memberNumber: clean(body.memberNumber) || null,
        drawingNumber: clean(body.drawingNumber) || null,
      },
      p_urgency: issueType === "missing" ? clean(body.urgency) || null : null,
      p_required_by: issueType === "missing" ? clean(body.requiredBy) || null : null,
      p_notes: clean(body.notes) || null,
      ...(issueType === "excess" ? { p_location: clean(body.location) || null, p_disposition: clean(body.disposition) || null } : {}),
      p_occurred_at: clean(body.occurredAt) || new Date().toISOString(),
    });
    if (result.error) throw new Error(result.error.message);
    const issue = result.data as { event_id: string; issue_key: string; duplicate: boolean };
    if (!issue.duplicate) {
      const { error: assignmentError } = await service.from("tower_material_events").update({ assigned_to_user_id: assignedToUserId, notify_user_ids: notifyUserIds }).eq("id", issue.event_id).eq("project_id", projectId);
      if (assignmentError) throw new Error(`Missing material was saved but assignment could not be applied: ${assignmentError.message}`);
    }
    if (!issue.duplicate) await notifyMissingMaterialEvent({ service, projectId, sourceEventId: issue.event_id, kind: issueType === "excess" ? "excess_raised" : "raised", actorUserId: identity.userId });
    return NextResponse.json({ ok: true, issue });
  } catch (error) {
    if (error instanceof Error && /tower_material_event_items_material_type_check/.test(error.message)) {
      return NextResponse.json({ error: "This material category could not be saved. The report is still available to retry; refresh Materials and try again." }, { status: 400 });
    }
    const apiError = mobileApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

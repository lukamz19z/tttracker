import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireMaterialsContext, validateMaterialsRequest, materialsErrorResponse } from "@/lib/materials/security";
import { materialActorUserId } from "@/lib/materials/project-actor";

type Context = { params: Promise<{ projectId: string; issueId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const { projectId, issueId } = await context.params;
    const body = await request.json();
    const project = await requireMaterialsContext(projectId, String(body.organisationId ?? "") || null, "manage_issues");
    await validateMaterialsRequest(project, { ...body, issueId });
    const admin = createSupabaseAdmin();
    const organisationId = project.dataOrganisationId;

    const { data: issue, error: issueError } = await admin.from("v2_material_issues")
      .select("id,unit,material_item_id,bundle_id,tower_id")
      .eq("id", issueId)
      .eq("project_id", projectId)
      .single();
    if (issueError) throw new Error(issueError.message);

    // These are the issue's historical origin links. A later movement must not
    // require today's material location/packing to still match that origin.
    await validateMaterialsRequest(project, { issueId, towerId: issue.tower_id });
    await validateMaterialsRequest(project, { issueId, materialItemId: issue.material_item_id });
    await validateMaterialsRequest(project, { issueId, bundleId: issue.bundle_id });
    const eventType = String(body.eventTypeKey ?? "note");
    const quantity = Math.max(Number(body.quantity ?? 0), 0);
    const occurredAt = body.occurredAt || new Date().toISOString();
    const destinationTowerId = body.destinationTowerId || issue.tower_id || null;
    const destinationLocationId = body.destinationLocationId || null;
    await validateMaterialsRequest(project, { ...body, destinationTowerId, destinationLocationId });

    const { data: event, error } = await admin.from("v2_material_issue_events").insert({
      organisation_id: organisationId,
      project_id: projectId,
      issue_id: issueId,
      event_type_key: eventType,
      quantity,
      unit: String(body.unit ?? issue.unit ?? "ea"),
      source_type_key: body.sourceTypeKey || null,
      source_tower_id: body.sourceTowerId || null,
      source_location_id: body.sourceLocationId || null,
      destination_tower_id: destinationTowerId,
      destination_location_id: destinationLocationId,
      docket_id: body.docketId || null,
      reference: body.reference || null,
      notes: body.notes || null,
      occurred_at: occurredAt,
      created_by: materialActorUserId(project),
    }).select("id").single();
    if (error) throw new Error(error.message);

    if (["received", "found_received", "replacement_received", "transfer_received"].includes(eventType) && quantity > 0) {
      const { error: movementError } = await admin.from("v2_material_movements").insert({
        organisation_id: organisationId,
        project_id: projectId,
        material_item_id: issue.material_item_id,
        bundle_id: issue.bundle_id,
        issue_id: issueId,
        movement_type_key: "issue_resolution",
        quantity,
        unit: String(body.unit ?? issue.unit ?? "ea"),
        source_type_key: body.sourceTypeKey || null,
        source_tower_id: body.sourceTowerId || null,
        source_location_id: body.sourceLocationId || null,
        destination_tower_id: destinationTowerId,
        destination_location_id: destinationLocationId,
        docket_id: body.docketId || null,
        status: "received",
        reference: body.reference || null,
        notes: body.notes || null,
        moved_by: materialActorUserId(project),
        moved_at: occurredAt,
        received_by: materialActorUserId(project),
        received_at: occurredAt,
        origin_organisation_id: organisationId,
        visibility_scope: "origin_only",
      });
      if (movementError) throw new Error(movementError.message);

      const { error: issueLocationError } = await admin.from("v2_material_issues").update({
        current_tower_id: destinationTowerId,
        current_location_id: destinationLocationId,
        updated_at: new Date().toISOString(),
      }).eq("id", issueId).eq("project_id", projectId);
      if (issueLocationError) throw new Error(issueLocationError.message);
    }

    await admin.rpc("tttracker_v2_recalculate_material_issue", { p_issue_id: issueId });
    return NextResponse.json({ ok: true, event });
  } catch (error) {
    return materialsErrorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireMaterialsContext, validateMaterialsRequest, materialsErrorResponse } from "@/lib/materials/security";
import { materialActorUserId } from "@/lib/materials/project-actor";

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const body = await request.json();
    const project = await requireMaterialsContext(projectId, String(body.organisationId ?? "") || null, "manage_movements");
    await validateMaterialsRequest(project, body);
    const admin = createSupabaseAdmin();
    const orgId = project.dataOrganisationId;

    if (!body.materialItemId && !body.bundleId) throw new Error("Select a material item or bundle.");
    if (!(Number(body.quantity) > 0)) throw new Error("Quantity must be greater than zero.");

    const { data, error } = await admin.from("v2_material_movements").insert({
      organisation_id: orgId,
      project_id: projectId,
      material_item_id: body.materialItemId || null,
      bundle_id: body.bundleId || null,
      issue_id: body.issueId || null,
      movement_type_key: String(body.movementTypeKey ?? "transfer"),
      quantity: Number(body.quantity),
      unit: String(body.unit ?? "ea"),
      source_type_key: body.sourceTypeKey || null,
      source_tower_id: body.sourceTowerId || null,
      source_location_id: body.sourceLocationId || null,
      destination_tower_id: body.destinationTowerId || null,
      destination_location_id: body.destinationLocationId || null,
      docket_id: body.docketId || null,
      status: String(body.status ?? "in_transit"),
      reference: body.reference || null,
      notes: body.notes || null,
      moved_by: materialActorUserId(project),
      moved_at: body.movedAt || new Date().toISOString(),
      origin_organisation_id: orgId,
      visibility_scope: "origin_only",
    }).select("id").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, movement: data });
  } catch (error) {
    return materialsErrorResponse(error);
  }
}

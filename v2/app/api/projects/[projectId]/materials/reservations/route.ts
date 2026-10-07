import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireMaterialsContext, validateMaterialsRequest, materialsErrorResponse } from "@/lib/materials/security";
import { materialActorUserId } from "@/lib/materials/project-actor";

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const body = await request.json();
    const project = await requireMaterialsContext(projectId, String(body.organisationId ?? "") || null, "manage_reservations");
    await validateMaterialsRequest(project, body);
    const admin = createSupabaseAdmin();
    if (!body.materialItemId && !body.bundleId) throw new Error("Select a material item or bundle.");
    if (!(Number(body.quantity) > 0)) throw new Error("Quantity must be greater than zero.");

    const { data, error } = await admin.from("v2_material_reservations").insert({
      organisation_id: project.dataOrganisationId,
      project_id: projectId,
      material_item_id: body.materialItemId || null,
      bundle_id: body.bundleId || null,
      issue_id: body.issueId || null,
      source_tower_id: body.sourceTowerId || null,
      source_location_id: body.sourceLocationId || null,
      destination_tower_id: body.destinationTowerId || null,
      destination_location_id: body.destinationLocationId || null,
      quantity: Number(body.quantity),
      unit: String(body.unit ?? "ea"),
      status: "reserved",
      reserved_by: materialActorUserId(project),
      expires_at: body.expiresAt || null,
      metadata: { notes: body.notes || null },
    }).select("id").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, reservation: data });
  } catch (error) {
    return materialsErrorResponse(error);
  }
}

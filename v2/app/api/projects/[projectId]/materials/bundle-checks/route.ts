import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireMaterialsContext, validateMaterialsRequest, materialsErrorResponse } from "@/lib/materials/security";
import { materialActorUserId } from "@/lib/materials/project-actor";

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const body = await request.json();
    const project = await requireMaterialsContext(projectId, String(body.organisationId ?? "") || null, "check_bundles");
    if (!body.bundleId || !body.towerId) throw new Error("Select a bundle and tower.");
    await validateMaterialsRequest(project, body);
    const admin = createSupabaseAdmin();
    const status = String(body.status ?? "not_checked");
    const cleared = status === "not_checked";
    const payload = {
      organisation_id: project.dataOrganisationId,
      project_id: projectId,
      tower_id: body.towerId,
      bundle_id: body.bundleId,
      status,
      quantity_received: cleared
        ? 0
        : Math.max(Number(body.quantityReceived ?? 0), 0),
      checked_by: cleared ? null : materialActorUserId(project),
      checked_at: cleared ? null : new Date().toISOString(),
      delivery_item_id: cleared ? null : body.deliveryItemId || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin.from("v2_material_bundle_checks").upsert(payload, { onConflict: "bundle_id" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return materialsErrorResponse(error);
  }
}

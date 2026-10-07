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
    await validateMaterialsRequest(project, body);
    const admin = createSupabaseAdmin();
    const materialItemId = String(body.materialItemId ?? "").trim();
    if (!materialItemId) throw new Error("Select a member before saving its check.");

    const { data: item, error: itemError } = await admin.from("v2_material_register")
      .select("id,tower_id,bundle_id,item_reference")
      .eq("id", materialItemId)
      .eq("project_id", projectId)
      .eq("material_kind", "member")
      .single();
    if (itemError) throw new Error(itemError.message);
    if (!item.tower_id || !item.bundle_id) throw new Error("This member must be linked to a tower and bundle before it can be checked off.");

    await validateMaterialsRequest(project, { materialItemId: item.id, towerId: item.tower_id, bundleId: item.bundle_id });
    const payload = {
      organisation_id: project.dataOrganisationId,
      project_id: projectId,
      tower_id: item.tower_id,
      bundle_id: item.bundle_id,
      material_item_id: item.id,
      member_reference: item.item_reference,
      status: String(body.status ?? "not_checked"),
      notes: body.notes || null,
      checked_by: materialActorUserId(project),
      checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await admin.from("v2_material_member_checks").upsert(payload, { onConflict: "bundle_id,member_reference" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return materialsErrorResponse(error);
  }
}

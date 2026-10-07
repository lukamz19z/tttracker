import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireMaterialsContext, validateMaterialsRequest, materialsErrorResponse } from "@/lib/materials/security";

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const body = await request.json();
    const project = await requireMaterialsContext(projectId, String(body.organisationId ?? "") || null, "manage_movements");
    await validateMaterialsRequest(project, body);
    const admin = createSupabaseAdmin();
    const name = String(body.name ?? "").trim();
    if (!name) throw new Error("Location name is required.");

    const { data, error } = await admin.from("v2_material_locations").insert({
      organisation_id: project.dataOrganisationId,
      project_id: projectId,
      location_type_key: String(body.locationTypeKey ?? "other"),
      code: String(body.code ?? "").trim() || null,
      name,
      tower_id: body.towerId || null,
      is_active: true,
      metadata: {},
    }).select("id,location_type_key,code,name,tower_id").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, location: data });
  } catch (error) {
    return materialsErrorResponse(error);
  }
}

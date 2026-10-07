import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireMaterialsContext, materialsErrorResponse } from "@/lib/materials/security";
import { isRecord } from "@/lib/materials/import-validation";
import { profileApplicability } from "@/lib/materials/applicability";
type Context = { params: Promise<{ projectId: string }> };
export async function POST(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const body: unknown = await request.json();
    if (!isRecord(body)) throw new Error("Expected a profile object.");
    const project = await requireMaterialsContext(projectId, typeof body.organisationId === "string" ? body.organisationId : null, "import");
    if (typeof body.name !== "string" || !body.name.trim() || typeof body.sourceRole !== "string" || !isRecord(body.mapping) || !Object.values(body.mapping).every(value=>typeof value === "string") || !isRecord(body.defaults)) throw new Error("Profile name, source role, mapping and defaults are required.");
    const category = body.defaults.import_category_key;
    if (!["members","bundles","bolts","packers"].includes(String(category))) throw new Error("Invalid profile category.");
    const options = isRecord(body.defaults.import_options) ? body.defaults.import_options : {};
    const rule = category === "members" && body.mapping.applicable_towers ? profileApplicability(body.defaults) : undefined;
    if (rule && (!rule.delimiter || rule.delimiter.length>5)) throw new Error("Configure a valid applicability delimiter.");
    const { data, error } = await createSupabaseAdmin().rpc("tttracker_v2_save_material_import_profile", {
      p_project_id:projectId,p_organisation_id:project.dataOrganisationId,p_actor_id:project.workspace.userId,p_name:body.name.trim(),p_source_role:body.sourceRole,
      p_mapping:body.mapping,p_defaults:{...body.defaults,import_options:{...options,applicability:rule}},
    });
    if(error) throw new Error(`Materials profile save failed: ${error.message}`);
    if(typeof data !== "string") throw new Error("Materials profile save returned no ID.");
    return NextResponse.json({ok:true,profileId:data});
  } catch(error) { return materialsErrorResponse(error); }
}

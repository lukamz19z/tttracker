import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireMaterialsContext, validateMaterialsRequest, materialsErrorResponse } from "@/lib/materials/security";
import { isRecord, uuidPattern } from "@/lib/materials/import-validation";
type Context = { params: Promise<{ projectId: string }> };
export async function POST(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const body: unknown = await request.json();
    if (!isRecord(body)) throw new Error("Expected a reconciliation request object.");
    const project = await requireMaterialsContext(projectId, typeof body.organisationId === "string" ? body.organisationId : null, "import");
    await validateMaterialsRequest(project, body);
    const ids = body.towerIds;
    if (ids !== undefined && (!Array.isArray(ids) || !ids.length || !ids.every(id => typeof id === "string" && uuidPattern.test(id)))) throw new Error("Invalid reconciliation tower scope.");
    const { data, error } = await createSupabaseAdmin().rpc("tttracker_v2_reconcile_material_requirements", {
      p_project_id: projectId, p_organisation_id: project.dataOrganisationId, p_actor_id: project.workspace.userId, p_tower_ids: ids ?? null,
    });
    if (error) throw new Error(`Atomic Materials reconciliation failed: ${error.message}`);
    if (!isRecord(data) || data.ok !== true) throw new Error("Materials reconciliation RPC returned no successful result.");
    return NextResponse.json(data);
  } catch (error) { return materialsErrorResponse(error); }
}

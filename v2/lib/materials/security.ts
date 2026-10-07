import "server-only";
import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { requireProjectContext } from "@/lib/projects/project-context";
import { ProjectAccessError } from "@/lib/projects/access";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { MaterialsSecurityError, requireMaterialsPermission, requireMaterialRecordAccess, type MaterialsCapability } from "./access-policy";
import { validateMaterialRelationships, type RelatedRecord } from "./relationship-security";

export async function requireMaterialsContext(projectId: string, organisationId: string | null, capability: MaterialsCapability = "view") {
  const context = await requireProjectContext(projectId, organisationId, "materials");
  requireMaterialsPermission(context.access, capability);
  return context;
}
export async function validateMaterialsRequest(context: Awaited<ReturnType<typeof requireMaterialsContext>>, body: Record<string, unknown>) {
  const admin = createSupabaseAdmin();
  const read = async (table: string, id: string): Promise<RelatedRecord | null> => {
    const { data, error } = await admin.from(table).select("*").eq("id", id)
      .eq("project_id", context.project.id).eq("organisation_id", context.dataOrganisationId).maybeSingle();
    if (error) throw new Error("MATERIALS_RELATIONSHIP_LOOKUP_FAILED");
    if (!data) return null;
    requireMaterialRecordAccess(context.access, table, id);
    return data as RelatedRecord;
  };
  const records = await validateMaterialRelationships(body, read);
  if (body.driverUserId) {
    const { data: host, error } = await admin.from("v2_project_users").select("user_id")
      .eq("project_id", context.project.id).eq("organisation_id", context.dataOrganisationId)
      .eq("user_id", body.driverUserId).eq("status", "active").maybeSingle();
    const { data: organisationMember, error: organisationError } = await admin.from("organisation_users").select("user_id")
      .eq("organisation_id", context.dataOrganisationId).eq("user_id", body.driverUserId).eq("status", "active").maybeSingle();
    const { data: partyUsers, error: partyError } = await admin.from("v2_project_party_users").select("project_party_id")
      .eq("project_id", context.project.id).eq("user_id", body.driverUserId).eq("status", "active");
    if (error || organisationError || partyError) throw new Error("MATERIALS_RELATIONSHIP_LOOKUP_FAILED");
    let activeParty = false;
    if (partyUsers?.length) {
      const { data: parties, error: partiesError } = await admin.from("v2_project_parties").select("id")
        .eq("project_id", context.project.id).eq("status", "active").eq("portal_enabled", true)
        .in("id", partyUsers.map((row) => row.project_party_id));
      if (partiesError) throw new Error("MATERIALS_RELATIONSHIP_LOOKUP_FAILED");
      activeParty = Boolean(parties?.length);
    }
    if (!(host && organisationMember) && !activeParty) throw new MaterialsSecurityError("MATERIALS_RELATIONSHIP_INVALID", 422);
  }
  return records;
}
export function materialsErrorResponse(error: unknown) {
  unstable_rethrow(error);
  const status = error instanceof MaterialsSecurityError || error instanceof ProjectAccessError ? error.status : 400;
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "MATERIALS_REQUEST_FAILED" }, { status });
}

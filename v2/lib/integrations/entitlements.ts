import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
export async function resolveOrganisationEntitlement(organisation: string, provider: "sharepoint" | "xero") {
  const { data, error } = await createSupabaseAdmin().rpc("tttracker_v2_integration_entitlement", { p_organisation_id: organisation, p_provider: provider });
  if (error || !data || typeof data.enabled !== "boolean") throw new Error("INTEGRATION_ENTITLEMENT_UNAVAILABLE");
  return { enabled: data.enabled === true && data.available === true, source: String(data.source) };
}
export async function requireIntegrationEntitlement(organisation: string, provider: "sharepoint" | "xero", requireChecked = false) {
  if (!(await resolveOrganisationEntitlement(organisation, provider)).enabled) throw new Error("INTEGRATION_NOT_ENTITLED");
  if (requireChecked) {
    const { data, error } = await createSupabaseAdmin().from("v2_integrations").select("entitlement_check_required").eq("organisation_id", organisation).eq("provider", provider).maybeSingle();
    if (error) throw new Error("INTEGRATION_ENTITLEMENT_UNAVAILABLE");
    if (data?.entitlement_check_required) throw new Error("INTEGRATION_CONNECTION_CHECK_REQUIRED");
  }
}

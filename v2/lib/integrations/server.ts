import "server-only";
import { requireWorkspacePermission } from "@/lib/workspace/context";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
export async function integrationContext(org: string | null, provider: "sharepoint" | "xero", action: "view" | "manage") {
  const context = await requireWorkspacePermission(org, `integrations.${provider}.${action}`);
  if (context.projectOnly) throw new Error("INTEGRATION_ACCESS_DENIED");
  return { context, org: context.organisation.organisationId, admin: createSupabaseAdmin() };
}
export async function integrationAudit(org: string,id: string,actor: string,action: string,target?: string,result="success") {
  const {error} = await createSupabaseAdmin().from("v2_integration_audit").insert({organisation_id:org,integration_id:id,actor_id:actor,action,target_id:target,result});
  if (error) throw new Error("INTEGRATION_AUDIT_UNAVAILABLE");
}
export function integrationError(error: unknown) {
  const code = error instanceof Error && /^INTEGRATION_[A-Z_]+$/.test(error.message) ? error.message : "INTEGRATION_ACTION_FAILED";
  const messages: Record<string,string> = {
    INTEGRATION_SETUP_REQUIRED: "External application registration is not configured.",
    INTEGRATION_SITE_PERMISSION_REQUIRED: "Site permission required. Ask your Microsoft administrator to grant access to this site, then verify again.",
    INTEGRATION_RUNTIME_PERMISSIONS_UNSAFE: "Microsoft runtime permissions exceed the approved Sites.Selected boundary.",
    INTEGRATION_SCOPE_INVALID: "The selected record does not belong to this connection.",
    INTEGRATION_TENANT_INVALID: "Enter a valid Microsoft tenant ID.",
    INTEGRATION_RATE_LIMITED: "The provider is busy. Retry after the cooldown.",
    INTEGRATION_CREDENTIAL_STORAGE_UNAVAILABLE: "Secure integration credential storage is not configured.",
    INTEGRATION_ADDITIONAL_PERMISSION_REQUIRED: "Additional Xero permission is required. Update Xero Permissions.",
    INTEGRATION_XERO_PERMISSION_REQUIRED: "A Xero user with the required Payroll or Projects access must authorise this feature.",
    INTEGRATION_RECONNECT_REQUIRED: "The connection has expired or been removed. Reconnect the integration.",
    INTEGRATION_REFRESH_BUSY: "Another request is refreshing this connection. Retry shortly.",
    INTEGRATION_TENANT_REMAP_REQUIRED: "This connection uses a different Xero organisation. Existing mappings must be explicitly reset before changing organisations.",
    INTEGRATION_REMOTE_DISCONNECT_REQUIRED: "TTTracker access is disabled. Remove the app connection in Xero to finish remote disconnection.",
    INTEGRATION_REVIEW_REQUIRED: "This evidence must be approved before SharePoint storage.",
  };
  return { code, message: messages[code] ?? "Unable to complete this integration action. Check access and configuration, then retry." };
}
export async function loadIntegration(org: string,provider: string) {
  const {data,error} = await createSupabaseAdmin().from("v2_integrations").select("*").eq("organisation_id",org).eq("provider",provider).maybeSingle();
  if(error) throw new Error("INTEGRATION_SCHEMA_REQUIRED");
  return data;
}

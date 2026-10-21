import "server-only";
import { requireWorkspacePermission } from "@/lib/workspace/context";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireIntegrationEntitlement } from "./entitlements";
export async function integrationContext(org: string | null, provider: "sharepoint" | "xero", action: "view" | "manage") {
  const context = await requireWorkspacePermission(org, `integrations.${provider}.${action}`);
  if (context.projectOnly) throw new Error("INTEGRATION_ACCESS_DENIED");
  if (action === "manage") await requireIntegrationEntitlement(context.organisation.organisationId, provider);
  return { context, org: context.organisation.organisationId, admin: createSupabaseAdmin() };
}
export async function integrationAudit(org: string,id: string,actor: string | null,action: string,target?: string,result="success") {
  const {error} = await createSupabaseAdmin().from("v2_integration_audit").insert({organisation_id:org,integration_id:id,actor_id:actor,action,target_id:target,result});
  if (error) throw new Error("INTEGRATION_AUDIT_UNAVAILABLE");
}
export function integrationError(error: unknown) {
  const code = error instanceof Error && /^INTEGRATION_[A-Z_]+$/.test(error.message) ? error.message : "INTEGRATION_ACTION_FAILED";
  const messages: Record<string,string> = {
    INTEGRATION_SETUP_WRONG_TENANT:"Microsoft returned a different tenant. Sign in with the administrator for the Microsoft organisation already connected to TTTracker.",
    INTEGRATION_MICROSOFT_CONSENT_MISSING:"Microsoft administrator consent is missing or was declined. Approve the setup application's delegated permission in your tenant, then retry.",
    INTEGRATION_SETUP_APP_NOT_INSTALLED:"The TTTracker SharePoint Setup enterprise application is not installed/consented in this Microsoft tenant. Your Microsoft administrator must approve it.",
    INTEGRATION_SETUP_DELEGATED_SCOPE_MISSING:"Microsoft did not grant Sites.FullControl.All Delegated to the setup session. Verify the setup app's delegated permission and administrator consent.",
    INTEGRATION_SETUP_OBJECT_ID_MISSING:"Microsoft did not return the required user object ID. Restart authorisation with the updated OpenID profile scope; do not reconnect the normal Microsoft connection.",
    INTEGRATION_SETUP_SIGNATURE_INVALID:"The Microsoft ID-token signature could not be verified. Check Microsoft signing-key availability and retry; site grants were not attempted.",
    INTEGRATION_SETUP_ISSUER_INVALID:"The Microsoft ID-token issuer does not match your connected Microsoft tenant. Site grants were blocked.",
    INTEGRATION_SETUP_AUDIENCE_INVALID:"The Microsoft ID token was issued for a different application. Check the separate setup application's client ID and callback configuration.",
    INTEGRATION_SETUP_CLIENT_INVALID:"The Microsoft ID-token authorised client does not match TTTracker's setup application. Site grants were blocked.",
    INTEGRATION_SETUP_NONCE_INVALID:"The Microsoft setup session nonce did not match. Restart site authorisation in the same TTTracker browser session.",
    INTEGRATION_SETUP_PKCE_INVALID:"Microsoft rejected the setup session's PKCE verifier. Restart site authorisation in the same browser session.",
    INTEGRATION_SETUP_TOKEN_TIME_INVALID:"The Microsoft ID token is expired or its timestamps are invalid. Check server time and restart site authorisation.",
    INTEGRATION_SETUP_ID_TOKEN_MISSING:"Microsoft did not return an ID token for the setup session. Verify OpenID sign-in configuration.",
    INTEGRATION_SETUP_ACCESS_TOKEN_MISSING:"Microsoft did not return a delegated Graph access token. Verify setup application consent.",
    INTEGRATION_SETUP_TOKEN_MALFORMED:"Microsoft returned an unreadable ID token. Site grants were not attempted.",
    INTEGRATION_SETUP_TOKEN_EXCHANGE_FAILED:"Microsoft could not complete the setup code exchange. Check the setup credential, redirect URI and Microsoft sign-in diagnostics.",
    INTEGRATION_SITE_MEMBER_ACCESS_REQUIRED:"The Microsoft setup user could not access this site. Confirm target-site membership/access and the correct site URL. Site access denial does not prove whether the user holds an administrator role.",
    INTEGRATION_SESSION_INVALID: "Your TTTracker sign-in session changed or could not be verified. Restart Microsoft site authorisation from your current session.",
    INTEGRATION_MICROSOFT_SETUP_REQUIRED: "Interactive SharePoint authorisation is unavailable until TTTracker's separate Microsoft setup application is configured. Contact TTTracker or use Advanced / Manual Setup.",
    INTEGRATION_MICROSOFT_ADMIN_REQUIRED: "Microsoft administrator required. A SharePoint Administrator or suitably authorised administrator who is a member of this site must complete authorisation.",
    INTEGRATION_MICROSOFT_APPROVAL_REQUIRED: "Administrator approval required. Approve the TTTracker SharePoint Setup application in Microsoft Entra, then retry authorisation.",
    INTEGRATION_SETUP_IDENTITY_INVALID: "Microsoft setup identity could not be verified for your organisation's tenant. Retry with the correct Microsoft organisation administrator.",
    INTEGRATION_SITE_GRANT_UPGRADE_REQUIRED: "An existing read grant requires a Microsoft administrator to upgrade it to write through manual setup. Microsoft does not support this update through the delegated setup API.",
    INTEGRATION_SITE_REVOCATION_MANUAL_REQUIRED: "Native revocation is unavailable: Microsoft's site permission delete API requires application FullControl. TTTracker does not request it. Ask your Microsoft administrator to revoke the selected grant through approved administrator tooling.",
    INTEGRATION_SETUP_RETRY_REQUIRED: "The interactive setup session reached its time limit. Retry the remaining sites; successful grants are retained.",
    INTEGRATION_RESOURCE_NOT_FOUND: "Microsoft could not find this SharePoint site. Check the site URL and administrator access.",
    INTEGRATION_NAME_REQUIRED: "Enter a name and the required filename template.",
    INTEGRATION_LOCATION_IMMUTABLE: "Create a new location to change its site, library or root. Existing folder links are retained.",
    INTEGRATION_TOKEN_INVALID: "The template contains a token unavailable for this document context.",
    INTEGRATION_TOKEN_VALUE_MISSING: "This record does not provide a required folder token. Use a record-compatible rule.",
    INTEGRATION_TRIGGER_UNAVAILABLE: "Select a folder creation trigger supported by this document context.",
    INTEGRATION_ROUTING_AMBIGUOUS: "More than one routing rule matches. Set distinct priorities or applicability.",
    INTEGRATION_BATCH_LIMIT: "Select fewer records for this operation, then process the next batch.",
    INTEGRATION_ACCESS_DENIED: "You do not have permission to perform this integration operation.",
    INTEGRATION_TENANT_NOT_CONNECTED: "Connect Microsoft 365 before configuring your SharePoint site.",
    INTEGRATION_LIBRARY_REQUIRED: "Select and save a verified document library first.",
    INTEGRATION_LIBRARY_UNAVAILABLE: "The selected document library is no longer available. Load the authorised site's libraries and select a valid library.",
    INTEGRATION_DESTINATION_ACCESS_REQUIRED: "Save an active destination with a valid inherited access profile before finishing setup.",
    INTEGRATION_CONFIGURATION_CHANGE_CONFIRMATION_REQUIRED: "Confirm the site or library change before replacing the active configuration. Existing files and history will be retained.",
    INTEGRATION_NOT_ENTITLED: "This integration is not included in the organisation's current subscription. Existing external data remains unchanged.",
    INTEGRATION_CONNECTION_CHECK_REQUIRED: "Test the connection before resuming integration operations.",
    INTEGRATION_ENTITLEMENT_UNAVAILABLE: "Integration availability could not be checked. Retry shortly.",
    INTEGRATION_SITE_URL_INVALID: "Enter the HTTPS URL of your SharePoint site, without query parameters.",
    INTEGRATION_ROOT_REQUIRED: "A configured root folder is not accessible. Create it in SharePoint or update the destination, then test again.",
    INTEGRATION_TEST_CLEANUP_REQUIRED: "The connection test file could not be safely removed. Ask your Microsoft administrator to remove the TTTracker connection test file.",
    INTEGRATION_TENANT_CHANGE_REQUIRES_DISCONNECT: "This connection belongs to a different Microsoft tenant. Existing destinations must be explicitly remapped before switching tenants.",
    INTEGRATION_SETUP_REQUIRED: "External application registration is not configured.",
    INTEGRATION_SITE_PERMISSION_REQUIRED: "Site permission required. Ask your Microsoft administrator to grant access to this site, then verify again.",
    INTEGRATION_RUNTIME_PERMISSIONS_UNSAFE: "Microsoft runtime permissions exceed the approved Sites.Selected boundary.",
    INTEGRATION_SCOPE_INVALID: "The selected record does not belong to this connection.",
    INTEGRATION_TENANT_INVALID: "Microsoft did not return a valid organisation tenant. Retry Connect Microsoft 365.",
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

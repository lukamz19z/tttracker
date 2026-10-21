import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { microsoftDiagnostics, providerReadiness } from "@/lib/integrations/readiness";
import { integrationOrigin } from "@/lib/integrations/presentation";
import { verifyMicrosoftTenant } from "@/lib/integrations/sharepoint";
import { microsoftSetupReadiness } from "@/lib/integrations/sharepoint-setup";
export type PlatformProvider = "sharepoint" | "xero";
export async function platformProviderReadiness(provider: PlatformProvider) {
  const readiness = await providerReadiness(provider, true);
  let callbackUrl: string | null = null;
  try { callbackUrl = new URL(`/api/integrations/${provider}/callback`, integrationOrigin(process.env.NEXT_PUBLIC_APP_URL, process.env.NODE_ENV)).toString(); } catch { /* Invalid deployment origin: no URL to expose. */ }
  const diagnostics = provider === "sharepoint" ? microsoftDiagnostics() : {
    applicationIdReady: !!process.env.TTTRACKER_XERO_CLIENT_ID,
    clientCredentialReady: !!process.env.TTTRACKER_XERO_CLIENT_SECRET,
    callbackReady: !!callbackUrl,
  };
  const environment = process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV || (process.env.NODE_ENV !== "production" ? "development" : "production");
  return { provider, status: readiness.connectReady ? "Ready" : "Setup Required", ready: readiness.connectReady,
    setupApplication: provider === "sharepoint" ? microsoftSetupReadiness() : null,
    applicationIdReady: diagnostics.applicationIdReady, credentialReady: diagnostics.clientCredentialReady,
    callbackReady: !!callbackUrl, callbackUrl, environment, kmsReady: provider === "xero" ? readiness.kmsReady === true : null,
    expectedPermission: provider === "sharepoint" ? "Sites.Selected" : "Configured feature-specific OAuth scopes",
    environmentMatched: provider !== "xero" || process.env.TTTRACKER_XERO_ENVIRONMENT === environment,
    credentialVerificationAvailable: provider === "sharepoint" && !!process.env.TTTRACKER_MICROSOFT_PLATFORM_DIRECTORY_ID };
}
export async function platformIntegrationWorkspace() {
  const db = createSupabaseAdmin();
  return Promise.all((["sharepoint", "xero"] as const).map(async provider => {
    const [readiness, connected, attention, healthy] = await Promise.all([
      platformProviderReadiness(provider),
      db.from("v2_integrations").select("id", { count: "exact", head: true }).eq("provider", provider).eq("status", "connected"),
      db.from("v2_integrations").select("id", { count: "exact", head: true }).eq("provider", provider).eq("status", "attention_required"),
      db.from("v2_integrations").select("id", { count: "exact", head: true }).eq("provider", provider).eq("status", "connected").is("error_category", null).not("last_success_at", "is", null),
    ]);
    if (connected.error || attention.error || healthy.error) throw new Error("PLATFORM_INTEGRATION_SUMMARY_UNAVAILABLE");
    return { ...readiness, connectedOrganisations: connected.count ?? 0, attentionOrganisations: attention.count ?? 0, healthyOrganisations: healthy.count ?? 0 };
  }));
}
export async function platformIntegrationHealth(provider: PlatformProvider) {
  const readiness = await platformProviderReadiness(provider);
  let credentialVerified = false;
  let message = readiness.ready ? "Platform configuration prerequisites passed. Customer connections remain separate." : "Platform setup is incomplete. Configure the missing prerequisites in the deployment environment.";
  if (provider === "sharepoint" && readiness.ready) {
    const directory = process.env.TTTRACKER_MICROSOFT_PLATFORM_DIRECTORY_ID;
    if (directory) {
      try { await verifyMicrosoftTenant(directory); credentialVerified = true; message = "TTTracker application token verified in the platform application's directory. No customer site was accessed."; }
      catch { return { ...readiness, status: "Attention Required", ready: false, credentialVerified: false, message: "Microsoft application credential or Sites.Selected authority could not be verified. Check the platform application directory, credential and consent.", checkedAt: new Date().toISOString() }; }
    } else message = "Configuration prerequisites passed. Live credential verification requires the operator's application directory in server deployment configuration; no customer tenant is used.";
  }
  if (provider === "xero") message = readiness.ready ? "OAuth configuration and integration KMS readiness passed. Xero client credentials are validated during customer OAuth; no customer account was accessed." : message;
  return { ...readiness, credentialVerified, message, checkedAt: new Date().toISOString() };
}
export type PlatformIntegrationWorkspace = Awaited<ReturnType<typeof platformIntegrationWorkspace>>;

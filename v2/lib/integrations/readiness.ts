import "server-only";
import { microsoftConfig } from "./sharepoint";
import { xeroConfig } from "./xero";
import { integrationCredentialReady } from "./credential-crypto";
import { integrationOrigin } from "./presentation";

export function microsoftDiagnostics() {
  let callbackReady = false;
  try { integrationOrigin(process.env.NEXT_PUBLIC_APP_URL, process.env.NODE_ENV); callbackReady = true; } catch { /* Missing/invalid origin only. */ }
  return { applicationIdReady: !!process.env.TTTRACKER_MICROSOFT_CLIENT_ID, clientCredentialReady: !!process.env.TTTRACKER_MICROSOFT_CLIENT_SECRET, callbackReady, sitesSelectedEnforced: true };
}

export async function providerReadiness(provider: "sharepoint" | "xero", manage: boolean) {
  let configured = false;
  try { if (provider === "sharepoint") microsoftConfig(); else xeroConfig(); configured = true; } catch { /* Safe configuration status only. */ }
  const kmsReady = provider === "xero" && configured && manage ? await integrationCredentialReady() : null;
  return { configured, callbackReady: configured, clientCredentialReady: configured, oauthReady: provider === "xero" && configured, kmsReady, connectReady: configured && (provider === "sharepoint" || kmsReady === true) };
}

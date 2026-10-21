import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { integrationContext, integrationAudit, integrationError } from "@/lib/integrations/server";
import { connectedMicrosoft, siteUrl, verifyCandidateSite } from "@/lib/integrations/sharepoint-locations";
import { microsoftConfig } from "@/lib/integrations/sharepoint";
import { setupCallbackPath, withMicrosoftSetupSession, safeSetupDiagnostics,microsoftOAuthFailure,type SetupDiagnostics } from "@/lib/integrations/sharepoint-setup";
import { integrationSessionHash } from "@/lib/integrations/session-binding";
export const runtime = "nodejs";
export const maxDuration = 240;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const equal = (a: string, b: string) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export async function GET(request: NextRequest) {
  let organisation = "", outcome = "site_authorisation_failed";
  try {
    const [org, state, verifier, nonce] = (request.cookies.get("tt-sharepoint-setup")?.value ?? "").split(".");
    if (!/^[a-f0-9-]{36}$/i.test(org ?? "") || !state || !verifier || !nonce || !equal(state, request.nextUrl.searchParams.get("state") ?? "")) throw new Error("INTEGRATION_STATE_INVALID");
    organisation = org;
    const { admin, context } = await integrationContext(org, "sharepoint", "manage");
    const consumed = await admin.rpc("tttracker_v2_consume_integration_state", { p_hash: hash(state), p_org: org, p_actor: context.userId, p_provider: "sharepoint_setup" });
    if (consumed.error || !consumed.data) throw new Error("INTEGRATION_STATE_INVALID");
    const record = consumed.data, payload = record.setup_payload;
    if(payload?.session_hash !== await integrationSessionHash(context.userId))throw new Error("INTEGRATION_SESSION_INVALID");
    const connection = await connectedMicrosoft(org);
    if (connection.id !== record.integration_id || connection.tenant_id !== record.expected_tenant || payload?.operation !== "authorise" || payload.runtime_id !== microsoftConfig().clientId || payload.nonce_hash !== hash(nonce) || payload.challenge !== createHash("sha256").update(verifier).digest("base64url")) throw new Error("INTEGRATION_SCOPE_INVALID");
    const candidates: { id: string; site_url: string }[] = payload.sites;
    if (!Array.isArray(candidates) || !candidates.length || candidates.length > 20) throw new Error("INTEGRATION_SCOPE_INVALID");
    const rows = await admin.from("v2_sharepoint_sites").select("id,site_url").eq("organisation_id", org).eq("integration_id", connection.id).eq("is_active", true).in("id", candidates.map(s => s.id));
    if (rows.error || rows.data?.length !== candidates.length || candidates.some(c => !rows.data?.some(s => s.id === c.id && s.site_url === c.site_url))) throw new Error("INTEGRATION_SCOPE_INVALID");
    const results: { id: string; status: string; message: string; code?:string; diagnostics?:SetupDiagnostics }[] = [];
    try {
      if (request.nextUrl.searchParams.has("error")) {
        const number=/AADSTS(\d+)/.exec(request.nextUrl.searchParams.get("error_description")??"")?.[1];
        throw new Error(number?microsoftOAuthFailure({error_codes:[Number(number)]}):"INTEGRATION_MICROSOFT_CONSENT_MISSING");
      }
      const code = request.nextUrl.searchParams.get("code");
      if (!code || code.length > 16384) throw new Error("INTEGRATION_STATE_INVALID");
      await withMicrosoftSetupSession(connection.tenant_id, code, verifier, nonce, async graph => {
        const deadline=Date.now()+170000;
        await integrationAudit(org, connection.id, context.userId, "microsoft_admin_setup_callback_completed");
        for (const candidate of candidates) {
          try {
            if(graph.diagnostics){graph.diagnostics.administrator="Not checked";graph.diagnostics.siteMembership="Not checked";}
            if(Date.now()>=deadline)throw new Error("INTEGRATION_SETUP_RETRY_REQUIRED");
            // Resolving with the tenant-bound delegated token proves the site is
            // accessible in this customer's directory; browser site IDs are ignored.
            const site = await graph.resolve(siteUrl(candidate.site_url));
            const permission = await graph.grant(site.id, payload.runtime_id);
            const saved = await admin.from("v2_sharepoint_sites").update({ site_id: site.id, runtime_permission_id: permission.id, permission_status: "authorised", verified_at: null, last_error: null }).eq("organisation_id", org).eq("integration_id", connection.id).eq("id", candidate.id);
            if (saved.error) throw new Error("INTEGRATION_STATUS_SAVE_FAILED");
            await integrationAudit(org, connection.id, context.userId, "site_grant_succeeded", candidate.id);
            const verification = await verifyCandidateSite(org, candidate.id, context.userId,AbortSignal.timeout(Math.max(1,Math.min(15000,deadline-Date.now()))));
            if (verification.status === "Verified") results.push({ id: candidate.id, status: "Verified", message: "Authorised and verified using TTTracker's Sites.Selected runtime application.",diagnostics:safeSetupDiagnostics({diagnostics:graph.diagnostics}) });
            else {
              const retained = await admin.from("v2_sharepoint_sites").update({ permission_status: "authorised", verified_at: null }).eq("organisation_id", org).eq("id", candidate.id);
              if (retained.error) throw new Error("INTEGRATION_STATUS_SAVE_FAILED");
              results.push({ id: candidate.id, status: "Authorised", message: "Microsoft grant succeeded. Runtime access is not verified yet; check permission again after propagation.",diagnostics:safeSetupDiagnostics({diagnostics:graph.diagnostics}) });
            }
          } catch (error) {
            const safe = integrationError(error);
            await integrationAudit(org, connection.id, context.userId, "site_grant_failed", candidate.id, safe.code);
            results.push({ id: candidate.id, status: "Attention Required", message: safe.message,code:safe.code,diagnostics:{...safeSetupDiagnostics({diagnostics:graph.diagnostics}),...safeSetupDiagnostics(error)} });
          }
        }
      });
    } catch (error) {
      const safe = integrationError(error);
      for (const site of candidates) if(!results.some(r=>r.id===site.id)) results.push({ id: site.id, status: "Attention Required", message: safe.message,code:safe.code,diagnostics:safeSetupDiagnostics(error) });
      await integrationAudit(org, connection.id, context.userId, "microsoft_admin_setup_failed", undefined, safe.code);
    }
    const saved = await admin.from("v2_integration_oauth_states").update({ setup_results: results }).eq("state_hash", hash(state)).eq("organisation_id", org).eq("actor_id", context.userId);
    if (saved.error) throw new Error("INTEGRATION_STATUS_SAVE_FAILED");
    outcome = "site_authorisation";
  } catch { /* No code, provider response or token is logged or returned. */ }
  const destination = new URL("/workspace/settings/integrations/sharepoint", request.nextUrl.origin);
  if (organisation) destination.searchParams.set("organisation", organisation);
  destination.searchParams.set("result", outcome);
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set("tt-sharepoint-setup", "", { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", maxAge: 0, path: setupCallbackPath });
  return response;
}

import "server-only";
import { createRemoteJWKSet, jwtVerify, decodeJwt } from "jose";
import { integrationOrigin } from "./presentation";
import { microsoftConfig, tenantId, graphFailure } from "./sharepoint";
import { siteUrl } from "./sharepoint-locations";

export const setupCallbackPath = "/api/integrations/sharepoint/site-authorisation/callback";
export const setupScope = "openid profile https://graph.microsoft.com/Sites.FullControl.All";
export function microsoftSetupReadiness() {
  let callbackUrl: string | null = null;
  try { callbackUrl = new URL(setupCallbackPath, integrationOrigin(process.env.NEXT_PUBLIC_APP_URL, process.env.NODE_ENV)).toString(); } catch { /* Safe diagnostic only. */ }
  const applicationIdReady = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(process.env.TTTRACKER_MICROSOFT_SETUP_CLIENT_ID ?? "");
  const credentialReady = !!process.env.TTTRACKER_MICROSOFT_SETUP_CLIENT_SECRET;
  const distinctIdentity = applicationIdReady && process.env.TTTRACKER_MICROSOFT_SETUP_CLIENT_ID?.toLowerCase() !== process.env.TTTRACKER_MICROSOFT_CLIENT_ID?.toLowerCase();
  return { ready: applicationIdReady && credentialReady && !!callbackUrl && distinctIdentity, applicationIdReady, credentialReady, callbackUrl, callbackReady: !!callbackUrl, distinctIdentity, expectedPermission: "Sites.FullControl.All — Delegated" };
}
function setupConfig() {
  const readiness = microsoftSetupReadiness();
  const runtime = microsoftConfig(), clientId = process.env.TTTRACKER_MICROSOFT_SETUP_CLIENT_ID, clientSecret = process.env.TTTRACKER_MICROSOFT_SETUP_CLIENT_SECRET;
  if (!readiness.ready || !readiness.callbackUrl || !clientId || !clientSecret) throw new Error("INTEGRATION_MICROSOFT_SETUP_REQUIRED");
  tenantId(runtime.clientId);
  return { clientId, clientSecret, callback: readiness.callbackUrl };
}
export function setupAuthorisationUrl(tenant: string, state: string, nonce: string, challenge: string) {
  const config = setupConfig();
  const url = new URL(`https://login.microsoftonline.com/${tenantId(tenant)}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.callback, response_type: "code", response_mode: "query", scope: setupScope, state, nonce, code_challenge: challenge, code_challenge_method: "S256", prompt: "consent" }).toString();
  return url.toString();
}
export type SitePermission = { id: string; roles?: string[]; grantedToIdentities?: { application?: { id?: string } }[]; grantedToIdentitiesV2?: { application?: { id?: string } }[] };
export function runtimePermissions(permissions: SitePermission[], runtimeId: string) {
  return permissions.filter(p => [...p.grantedToIdentities ?? [], ...p.grantedToIdentitiesV2 ?? []].some(i => i.application?.id?.toLowerCase() === runtimeId.toLowerCase()));
}

// Only an authorization-code exchange can create this client. No client-credentials
// or refresh-token path exists for the setup identity, including background workers.
export type SetupDiagnostics = Record<string,string>;
export function safeSetupDiagnostics(error:unknown):SetupDiagnostics {
  const source=error&&typeof error==="object"&&"diagnostics" in error?error.diagnostics:null;
  if(!source||typeof source!=="object")return {};
  const keys=["setupClientId","expectedTenantId","returnedTenantId","tenantMatch","signature","issuer","audience","nonce","pkce","adminConsent","delegatedScope","servicePrincipal","administrator","siteMembership","objectId","accessTokenTenant","accessTokenClient"];
  const values=["Configured","Not available","Not checked","Yes","No","Valid","Invalid","Not verified","Present","Missing","Match","Mismatch","Valid (code exchange succeeded)","Present (Microsoft issued tokens)","Present (delegated permission issued)","Failed (grant API denied)","Failed (site access denied)","Passed (site resolution succeeded)","Passed (grant API succeeded)"];
  return Object.fromEntries(Object.entries(source).filter(([key,value])=>keys.includes(key)&&typeof value==="string"&&(values.includes(value)||((key==="expectedTenantId"||key==="returnedTenantId")&&/^[a-f0-9-]{36}$/i.test(value)))));
}
export function setupFailure(code:string,diagnostics:SetupDiagnostics): Error & {diagnostics:SetupDiagnostics} {
  return Object.assign(new Error(code),{diagnostics:{...diagnostics}});
}
export function microsoftOAuthFailure(value:unknown) {
  const codes=value&&typeof value==="object"&&"error_codes" in value?value.error_codes:[];
  const has=(n:number)=>Array.isArray(codes)&&codes.includes(n);
  return has(65001)||has(65004)?"INTEGRATION_MICROSOFT_CONSENT_MISSING":has(700016)||has(7000229)?"INTEGRATION_SETUP_APP_NOT_INSTALLED":has(501481)?"INTEGRATION_SETUP_PKCE_INVALID":"INTEGRATION_SETUP_TOKEN_EXCHANGE_FAILED";
}
export async function withMicrosoftSetupSession<T>(tenant: string, code: string, verifier: string, nonce: string, operation: (graph: SetupGraph) => Promise<T>): Promise<T> {
  const config = setupConfig(), directory = tenantId(tenant);
  const diagnostics:SetupDiagnostics={setupClientId:"Configured",expectedTenantId:directory,returnedTenantId:"Not available",tenantMatch:"Not checked",signature:"Not checked",issuer:"Not checked",audience:"Not checked",nonce:"Not checked",pkce:"Not checked",adminConsent:"Not checked",delegatedScope:"Not checked",servicePrincipal:"Not checked",administrator:"Not checked",siteMembership:"Not checked",objectId:"Not checked",accessTokenTenant:"Not available",accessTokenClient:"Not available"};
  function fail(code:string):never{throw setupFailure(code,diagnostics);}
  let accessToken = "";
  try {
    const response = await fetch(`https://login.microsoftonline.com/${directory}/oauth2/v2.0/token`, { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000), body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: config.callback, scope: setupScope }) });
    if (!response.ok) {
      const failure=microsoftOAuthFailure(await response.json().catch(()=>null));
      if(failure==="INTEGRATION_MICROSOFT_CONSENT_MISSING")diagnostics.adminConsent="Missing";
      if(failure==="INTEGRATION_SETUP_APP_NOT_INSTALLED")diagnostics.servicePrincipal="Missing";
      if(failure==="INTEGRATION_SETUP_PKCE_INVALID")diagnostics.pkce="Invalid";
      fail(failure);
    }
    diagnostics.pkce="Valid (code exchange succeeded)";
    diagnostics.servicePrincipal="Present (Microsoft issued tokens)";
    const result: { access_token?: string; id_token?: string; scope?: string } = await response.json();
    diagnostics.delegatedScope=result.scope?.split(" ").some(s=>s==="Sites.FullControl.All"||s==="https://graph.microsoft.com/Sites.FullControl.All")?"Present":"Missing";
    if (!result.id_token) fail("INTEGRATION_SETUP_ID_TOKEN_MISSING");
    if (!result.access_token) fail("INTEGRATION_SETUP_ACCESS_TOKEN_MISSING");
    // Decode only a safe GUID for diagnostics. It is not trusted until signature
    // verification completes; no raw token or arbitrary claim string is retained.
    try {const unverified=decodeJwt(result.id_token);if(typeof unverified.tid==="string"&&/^[a-f0-9-]{36}$/i.test(unverified.tid))diagnostics.returnedTenantId=unverified.tid;}catch{fail("INTEGRATION_SETUP_TOKEN_MALFORMED");}
    const keys = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${directory}/discovery/v2.0/keys`), { timeoutDuration: 10000 });
    let payload;
    try {({payload}=await jwtVerify(result.id_token,keys,{algorithms:["RS256"],maxTokenAge:"10m",clockTolerance:30}));diagnostics.signature="Valid";}
    catch(error){const name=error instanceof Error&&"code" in error?String(error.code):"";diagnostics.signature=name==="ERR_JWS_SIGNATURE_VERIFICATION_FAILED"?"Invalid":"Not verified";fail(name==="ERR_JWT_EXPIRED"||name==="ERR_JWT_CLAIM_VALIDATION_FAILED"?"INTEGRATION_SETUP_TOKEN_TIME_INVALID":"INTEGRATION_SETUP_SIGNATURE_INVALID");}
    diagnostics.tenantMatch=payload.tid===directory?"Yes":"No";
    diagnostics.issuer=payload.iss===`https://login.microsoftonline.com/${directory}/v2.0`?"Valid":"Invalid";
    diagnostics.audience=(payload.aud===config.clientId||Array.isArray(payload.aud)&&payload.aud.includes(config.clientId))?"Valid":"Invalid";
    diagnostics.nonce=payload.nonce===nonce?"Valid":"Invalid";
    diagnostics.objectId=typeof payload.oid==="string"&&!!payload.oid?"Present":"Missing";
    if(payload.tid!==directory)fail("INTEGRATION_SETUP_WRONG_TENANT");
    if(diagnostics.issuer!=="Valid")fail("INTEGRATION_SETUP_ISSUER_INVALID");
    if(diagnostics.audience!=="Valid")fail("INTEGRATION_SETUP_AUDIENCE_INVALID");
    if(diagnostics.nonce!=="Valid")fail("INTEGRATION_SETUP_NONCE_INVALID");
    if(diagnostics.objectId!=="Present")fail("INTEGRATION_SETUP_OBJECT_ID_MISSING");
    if(!payload.exp)fail("INTEGRATION_SETUP_TOKEN_TIME_INVALID");
    if(payload.azp!==undefined&&payload.azp!==config.clientId)fail("INTEGRATION_SETUP_CLIENT_INVALID");
    if(diagnostics.delegatedScope!=="Present")fail("INTEGRATION_SETUP_DELEGATED_SCOPE_MISSING");
    diagnostics.adminConsent="Present (delegated permission issued)";
    // Access tokens are opaque to this client and validated by Graph. For JWT
    // responses, inspect only tenant/client equality for safe diagnostics.
    try {const claims=decodeJwt(result.access_token);diagnostics.accessTokenTenant=claims.tid===directory?"Match":"Mismatch";diagnostics.accessTokenClient=(claims.azp??claims.appid)===config.clientId?"Match":"Mismatch";}catch{/* Opaque/encrypted tokens are legitimate; Graph remains the authority. */}
    accessToken = result.access_token;
    const graph = new SetupGraph(() => accessToken,diagnostics);
    return await operation(graph);
  } finally { accessToken = ""; }
}
export class SetupGraph {
  private deadline = Date.now() + 160000;
  constructor(private bearer: () => string, public diagnostics:SetupDiagnostics={}) {}
  private async request<T>(path: string, method = "GET", body?: object): Promise<T> {
    if (!/^\/sites\//.test(path) || !this.bearer()) throw new Error("INTEGRATION_SCOPE_INVALID");
    for (let attempt = 0; attempt < 3; attempt++) {
      if (Date.now() > this.deadline) throw new Error("INTEGRATION_SETUP_RETRY_REQUIRED");
      const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, { method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${this.bearer()}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (response.ok) return response.status === 204 ? undefined as T : await response.json();
      if (response.status === 403) {
        if(method==="POST"||path.includes("/permissions")){this.diagnostics.administrator="Failed (grant API denied)";throw setupFailure("INTEGRATION_MICROSOFT_ADMIN_REQUIRED",this.diagnostics);}
        this.diagnostics.siteMembership="Failed (site access denied)";
        throw setupFailure("INTEGRATION_SITE_MEMBER_ACCESS_REQUIRED",this.diagnostics);
      }
      try { graphFailure(response.status, response.headers.get("Retry-After")); }
      catch (error) {
        const delay = error instanceof Error && "retryAfter" in error ? Number(error.retryAfter) * 1000 : 0;
        if (attempt < 2 && delay > 0 && delay <= 5000 && Date.now() + delay < this.deadline) { await new Promise(resolve => setTimeout(resolve, delay)); continue; }
        throw error;
      }
    }
    throw new Error("INTEGRATION_SETUP_RETRY_REQUIRED");
  }
  async resolve(url: string) {
    const expected = siteUrl(url), parsed = new URL(expected);
    const site = await this.request<{ id: string; webUrl: string }>(`/sites/${parsed.hostname}:${parsed.pathname.split("/").map(p => encodeURIComponent(decodeURIComponent(p))).join("/")}`);
    if (siteUrl(site.webUrl).toLowerCase() !== expected.toLowerCase() || !site.id?.toLowerCase().startsWith(parsed.hostname.toLowerCase() + ",") || !/^[a-z0-9.-]+\.sharepoint\.com,[a-f0-9-]{36},[a-f0-9-]{36}$/i.test(site.id)) throw new Error("INTEGRATION_SCOPE_INVALID");
    this.diagnostics.siteMembership="Passed (site resolution succeeded)";
    return site;
  }
  async permissions(site: string) {
    const result: SitePermission[] = [];
    let path: string | undefined = `/sites/${encodeURIComponent(site)}/permissions`;
    for (let page = 0; path && page < 10; page++) {
      const value: { value: SitePermission[]; "@odata.nextLink"?: string } = await this.request(path);
      if (!Array.isArray(value.value)) throw new Error("INTEGRATION_ACTION_FAILED");
      result.push(...value.value); path = undefined;
      if (value["@odata.nextLink"]) {
        const next = new URL(value["@odata.nextLink"]);
        if (next.origin !== "https://graph.microsoft.com" || decodeURIComponent(next.pathname) !== `/v1.0/sites/${site}/permissions`) throw new Error("INTEGRATION_SCOPE_INVALID");
        path = next.pathname.slice(5) + next.search;
      }
    }
    if (path) throw new Error("INTEGRATION_BATCH_LIMIT");
    return result;
  }
  async grant(site: string, runtimeId: string) {
    let existing = runtimePermissions(await this.permissions(site), runtimeId);
    if (existing.some(p => p.roles?.some(r => ["write", "owner", "fullcontrol", "manage"].includes(r.toLowerCase())))) return existing.find(p => p.roles?.some(r => ["write", "owner", "fullcontrol", "manage"].includes(r.toLowerCase())))!;
    // Microsoft does not document delegated PATCH/DELETE support. Never escalate
    // to application FullControl or delete an existing read grant behind the user.
    if (existing.length) throw new Error("INTEGRATION_SITE_GRANT_UPGRADE_REQUIRED");
    try {
      const permission = await this.request<SitePermission>(`/sites/${encodeURIComponent(site)}/permissions`, "POST", { roles: ["write"], grantedToIdentities: [{ application: { id: runtimeId, displayName: "TTTracker" } }] });
      if (!permission.id) throw new Error("INTEGRATION_ACTION_FAILED");
      this.diagnostics.administrator="Passed (grant API succeeded)";
      return permission;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "INTEGRATION_CONFLICT") throw error;
      existing = runtimePermissions(await this.permissions(site), runtimeId);
      const permission = existing.find(p => p.roles?.includes("write"));
      if (!permission) throw error;
      this.diagnostics.administrator="Passed (grant API succeeded)";
      return permission;
    }
  }
}

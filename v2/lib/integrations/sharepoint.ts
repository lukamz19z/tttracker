import "server-only";

export type SharePointScope = { tenant_id: string; site_id?: string; drive_id?: string };
export type DriveItem = { id: string; name: string; eTag?: string; webUrl?: string; folder?: object };
export function microsoftConfig() {
  const clientId = process.env.TTTRACKER_MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.TTTRACKER_MICROSOFT_CLIENT_SECRET;
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !clientSecret || !origin || !/^https:\/\//.test(origin))
    throw new Error("INTEGRATION_SETUP_REQUIRED");
  return { clientId, clientSecret, origin: new URL(origin).origin };
}
export function tenantId(value: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))
    throw new Error("INTEGRATION_TENANT_INVALID");
  return value.toLowerCase();
}
export function graphFailure(status: number, retryAfter: string | null = null): never {
  const code = status === 401 ? "RECONNECT_REQUIRED" : status === 403 ? "SITE_PERMISSION_REQUIRED" : status === 404 ? "RESOURCE_NOT_FOUND" : status === 409 ? "CONFLICT" : status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE";
  const error = new Error(`INTEGRATION_${code}`);
  if (status === 429) Object.assign(error, { retryAfter: Math.min(3600, Math.max(1, Number(retryAfter) || 30)) });
  throw error;
}
async function token(scope: SharePointScope) {
  const config = microsoftConfig();
  const response = await fetch(`https://login.microsoftonline.com/${tenantId(scope.tenant_id)}/oauth2/v2.0/token`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
  });
  if (!response.ok) graphFailure(response.status);
  const result = await response.json();
  if (typeof result.access_token !== "string") throw new Error("INTEGRATION_AUTH_FAILED");
  // This token was obtained directly from the configured Microsoft TLS endpoint,
  // not accepted from the browser. Reject accidental broad runtime grants.
  const claims = JSON.parse(Buffer.from(result.access_token.split(".")[1], "base64url").toString());
  if (claims.tid !== tenantId(scope.tenant_id) || (claims.azp ?? claims.appid) !== config.clientId ||
      !Array.isArray(claims.roles) || claims.roles.length !== 1 || claims.roles[0] !== "Sites.Selected")
    throw new Error("INTEGRATION_RUNTIME_PERMISSIONS_UNSAFE");
  return result.access_token as string;
}
const segment = (value: string) => encodeURIComponent(value);
export async function graphForSite(scope: SharePointScope) {
  const bearer = await token(scope);
  async function request(path: string, init: RequestInit = {}) {
    if (!path.startsWith("/sites/") && !path.startsWith("/drives/")) throw new Error("INTEGRATION_SCOPE_INVALID");
    if (scope.site_id && path.startsWith("/sites/") && !path.startsWith(`/sites/${segment(scope.site_id)}`)) throw new Error("INTEGRATION_SCOPE_INVALID");
    if (path.startsWith("/drives/") && (!scope.drive_id || !path.startsWith(`/drives/${segment(scope.drive_id)}/`))) throw new Error("INTEGRATION_SCOPE_INVALID");
    const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, { ...init, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(30000), headers: { ...init.headers, Authorization: `Bearer ${bearer}` } });
    if (!response.ok) graphFailure(response.status, response.headers.get("Retry-After"));
    return response;
  }
  return {
    site: async () => (await request(`/sites/${segment(scope.site_id!)}`)).json(),
    drives: async () => {
      const result = await (await request(`/sites/${segment(scope.site_id!)}/drives?$select=id,name,driveType`)).json();
      // Site libraries are normally small; no arbitrary provider-supplied nextLink fetch.
      if (result["@odata.nextLink"]) throw new Error("INTEGRATION_LIBRARY_LIMIT");
      return result.value as { id: string; name: string; driveType: string }[];
    },
    metadata: async (id: string) => (await request(`/drives/${segment(scope.drive_id!)}/items/${segment(id)}`)).json() as Promise<DriveItem>,
    root: async () => (await request(`/drives/${segment(scope.drive_id!)}/root`)).json() as Promise<DriveItem>,
    child: async (parent:string,name:string):Promise<DriveItem|null>=>{
      if(!name||/[\/\\<>:"|?*\x00-\x1f]/.test(name)||name.includes(".."))throw new Error("INTEGRATION_PATH_INVALID");
      try{return await (await request(`/drives/${segment(scope.drive_id!)}/items/${segment(parent)}:/${segment(name)}`)).json();}
      catch(error){if(error instanceof Error&&error.message==="INTEGRATION_RESOURCE_NOT_FOUND")return null;throw error;}
    },
    ensureFolder: async (parent: string, name: string): Promise<DriveItem> => {
      if (!name || /[\/\\<>:"|?*\x00-\x1f]/.test(name) || name === "." || name === "..") throw new Error("INTEGRATION_PATH_INVALID");
      const path = `/drives/${segment(scope.drive_id!)}/items/${segment(parent)}:/${segment(name)}`;
      try {
        const existing = await (await request(path)).json();
        if (!existing.folder) throw new Error("INTEGRATION_CONFLICT");
        return existing;
      } catch (error) { if (!(error instanceof Error) || error.message !== "INTEGRATION_RESOURCE_NOT_FOUND") throw error; }
      try { return await (await request(`/drives/${segment(scope.drive_id!)}/items/${segment(parent)}/children`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }) })).json(); }
      catch (error) {
        if (!(error instanceof Error) || error.message !== "INTEGRATION_CONFLICT") throw error;
        const existing = await (await request(path)).json();
        if (!existing.folder) throw new Error("INTEGRATION_CONFLICT");
        return existing;
      }
    },
    upload: async (parent: string, filename: string, bytes: Uint8Array, existing?: { id: string; etag: string }): Promise<DriveItem> => {
      if (bytes.byteLength > 10 * 1024 * 1024 || /[\/\\<>:"|?*\x00-\x1f]/.test(filename)) throw new Error("INTEGRATION_FILE_INVALID");
      const path = existing ? `/drives/${segment(scope.drive_id!)}/items/${segment(existing.id)}/content` : `/drives/${segment(scope.drive_id!)}/items/${segment(parent)}:/${segment(filename)}:/content?@microsoft.graph.conflictBehavior=fail`;
      return (await request(path, { method: "PUT", headers: { "Content-Type": "application/octet-stream", ...(existing ? { "If-Match": existing.etag } : {}) }, body: Buffer.from(bytes) })).json();
    },
    download: async (id: string) => {
      // Graph redirects content to a short-lived provider URL. Never forward Graph bearer.
      const response = await fetch(`https://graph.microsoft.com/v1.0/drives/${segment(scope.drive_id!)}/items/${segment(id)}/content`, { headers: { Authorization: `Bearer ${bearer}` }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30000) });
      if (response.status !== 302) graphFailure(response.status);
      const location = response.headers.get("location");
      if (!location || new URL(location).protocol !== "https:") throw new Error("INTEGRATION_PROVIDER_UNAVAILABLE");
      const content = await fetch(location, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000) });
      if (!content.ok || Number(content.headers.get("content-length")) > 10 * 1024 * 1024) throw new Error("INTEGRATION_FILE_INVALID");
      const reader = content.body?.getReader(); if (!reader) throw new Error("INTEGRATION_PROVIDER_UNAVAILABLE");
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) { const {value,done} = await reader.read(); if (done) break; size += value.length; if (size > 10*1024*1024) {await reader.cancel();throw new Error("INTEGRATION_FILE_INVALID");} chunks.push(value); }
      return Buffer.concat(chunks);
    },
  };
}

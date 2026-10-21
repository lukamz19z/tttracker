import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { integrationContext, integrationAudit, integrationError } from "@/lib/integrations/server";
import { connectedMicrosoft } from "@/lib/integrations/sharepoint-locations";
import { microsoftConfig } from "@/lib/integrations/sharepoint";
import { setupAuthorisationUrl, setupCallbackPath } from "@/lib/integrations/sharepoint-setup";
import { integrationSessionHash } from "@/lib/integrations/session-binding";

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new Error("INTEGRATION_ACCESS_DENIED");
    const body = await request.json();
    const { org, admin, context } = await integrationContext(body.organisation, "sharepoint", "manage");
    const connection = await connectedMicrosoft(org);
    if (body.operation === "revoke") throw new Error("INTEGRATION_SITE_REVOCATION_MANUAL_REQUIRED");
    if (body.operation && body.operation !== "authorise") throw new Error("INTEGRATION_SCOPE_INVALID");
    if (!Array.isArray(body.sites) || !body.sites.length || body.sites.length > 20 || body.sites.some((id: unknown) => typeof id !== "string" || !/^[a-f0-9-]{36}$/i.test(id))) throw new Error("INTEGRATION_BATCH_LIMIT");
    const ids = [...new Set(body.sites as string[])];
    const selected = await admin.from("v2_sharepoint_sites").select("id,site_url").eq("organisation_id", org).eq("integration_id", connection.id).eq("is_active", true).in("id", ids);
    if (selected.error || selected.data?.length !== ids.length) throw new Error("INTEGRATION_SCOPE_INVALID");
    const state = randomBytes(32).toString("base64url"), nonce = randomBytes(32).toString("base64url"), verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const url = setupAuthorisationUrl(connection.tenant_id, state, nonce, challenge);
    const sessionHash = await integrationSessionHash(context.userId);
    const saved = await admin.from("v2_integration_oauth_states").insert({ state_hash: createHash("sha256").update(state).digest("hex"), organisation_id: org, integration_id: connection.id, actor_id: context.userId, provider: "sharepoint_setup", expires_at: new Date(Date.now() + 10 * 60000).toISOString(), expected_tenant: connection.tenant_id, setup_operation_id: randomUUID(), setup_payload: { operation: "authorise", sites: selected.data, session_hash: sessionHash, nonce_hash: createHash("sha256").update(nonce).digest("hex"), challenge, runtime_id: microsoftConfig().clientId } });
    if (saved.error) throw new Error("INTEGRATION_STATE_SAVE_FAILED");
    await integrationAudit(org, connection.id, context.userId, "site_authorisation_requested");
    for (const id of ids) await integrationAudit(org, connection.id, context.userId, "site_selected_for_authorisation", id);
    const response = NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
    // No Microsoft token: short-lived, HttpOnly PKCE/state/nonce cookie binds this
    // browser session, while the DB state binds authenticated actor and organisation.
    response.cookies.set("tt-sharepoint-setup", `${org}.${state}.${verifier}.${nonce}`, { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", maxAge: 600, path: setupCallbackPath });
    return response;
  } catch (error) { return NextResponse.json(integrationError(error), { status: 403 }); }
}

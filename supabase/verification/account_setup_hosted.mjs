// Controlled V2 Dev verification: no emails; all temporary tenant/account records are removed.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const dependency = createRequire(import.meta.url);
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const values = Object.fromEntries(
  fs
    .readFileSync(path.join(root, "v2/.env.local"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [
        line.slice(0, index).trim(),
        line
          .slice(index + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ""),
      ];
    }),
);
assert.equal(
  new URL(values.NEXT_PUBLIC_SUPABASE_URL).hostname,
  "ycfhzqvdonwohjvcqxby.supabase.co",
  "Controlled test is restricted to V2 Dev",
);
const { createClient } = dependency(
  path.join(root, "v2/node_modules/@supabase/supabase-js"),
);
const { createBrowserClient, createServerClient } = dependency(
  path.join(root, "v2/node_modules/@supabase/ssr"),
);
const ts = dependency(path.join(root, "v2/node_modules/typescript"));
const admin = createClient(
  values.NEXT_PUBLIC_SUPABASE_URL,
  values.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
function load(file) {
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync(path.join(root, file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
  new Function("require", "exports", code)((name) => {
    if (name === "server-only") return {};
    if (name === "@/lib/supabase/admin")
      return { createSupabaseAdmin: () => admin };
    if (name.startsWith("@/")) return load(`v2/${name.slice(2)}.ts`);
    if (name.startsWith("."))
      return load(
        path.relative(
          root,
          path.resolve(path.dirname(path.join(root, file)), `${name}.ts`),
        ),
      );
    return dependency(name);
  }, exports);
  return exports;
}
const { completeInvitationSetup } = load("v2/lib/invitations/account-setup.ts");
const { establishSetupSession } = load("v2/lib/auth/setup-session.ts");
const { mapSetupAuthError } = load("v2/lib/auth/setup-errors.ts");
const fixtureCode = `SETUP-CHECK-${crypto.randomUUID()}`;
const fixtureEmail = `setup-check-${crypto.randomUUID()}@example.invalid`;
let organisationId = null,
  userId = null,
  browser = null,
  server = null;
function check(response, label) {
  if (response.error)
    throw new Error(
      `${label} failed (${response.error.code ?? "error"}); details withheld`,
    );
  return response.data;
}
try {
  const actors = check(
    await admin
      .from("v2_platform_admins")
      .select("user_id")
      .eq("status", "active")
      .in("role", ["owner", "admin"])
      .limit(1),
    "Operator lookup",
  );
  assert.ok(actors[0]);
  organisationId = check(
    await admin
      .from("organisations")
      .insert({
        code: fixtureCode,
        name: "Temporary account setup verification",
      })
      .select("id")
      .single(),
    "Temporary organisation",
  ).id;
  const roleId = check(
    await admin.rpc("tttracker_v2_platform_invitation", {
      p_actor: actors[0].user_id,
      p_action: "bootstrap",
      p_organisation_id: organisationId,
    }),
    "Role bootstrap",
  ).roleId;
  const invitationId = check(
    await admin.rpc("tttracker_v2_platform_invitation", {
      p_actor: actors[0].user_id,
      p_action: "create",
      p_organisation_id: organisationId,
      p_role_id: roleId,
      p_email: fixtureEmail,
    }),
    "Invitation creation",
  ).invitationId;
  const policyId = check(
    await admin
      .from("v2_permissions")
      .select("id")
      .eq("permission_code", "organisation.settings.configure")
      .single(),
    "Permission lookup",
  ).id;
  check(
    await admin
      .from("v2_role_permissions")
      .update({ allowed: false })
      .eq("role_id", roleId)
      .eq("permission_id", policyId),
    "Custom deny",
  );
  const link = check(
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: fixtureEmail,
      options: {
        redirectTo: `${values.NEXT_PUBLIC_APP_URL}/onboarding?invitation=${invitationId}`,
      },
    }),
    "Controlled link generation",
  );
  userId = link.user.id;
  check(
    await admin
      .from("v2_organisation_invitations")
      .update({ auth_user_id: userId })
      .eq("id", invitationId),
    "Recipient binding",
  );
  assert.equal(
    new URL(link.properties.action_link).hostname,
    new URL(values.NEXT_PUBLIC_SUPABASE_URL).hostname,
  );
  const verified = await fetch(link.properties.action_link, {
    redirect: "manual",
  });
  assert.equal(verified.status, 303);
  const location = verified.headers.get("location");
  assert.ok(location);
  const fragment = new URLSearchParams(new URL(location).hash.slice(1));
  assert.ok(fragment.get("access_token"));
  globalThis.document = {
    visibilityState: "visible",
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.window = {
    document: globalThis.document,
    location: { href: location, hash: new URL(location).hash },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const cookies = new Map();
  const cookieMethods = {
    getAll: () =>
      [...cookies]
        .filter(([, value]) => value)
        .map(([name, value]) => ({ name, value })),
    setAll: (items) =>
      items.forEach(({ name, value }) => cookies.set(name, value)),
  };
  browser = createBrowserClient(
    values.NEXT_PUBLIC_SUPABASE_URL,
    values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { isSingleton: false, cookies: cookieMethods },
  );
  assert.equal(
    (await browser.auth.initialize()).error?.name,
    "AuthPKCEGrantCodeExchangeError",
  );
  let clean = false;
  assert.equal(
    await establishSetupSession(browser, location, () => (clean = true)),
    null,
  );
  assert.equal(clean, true);
  server = createServerClient(
    values.NEXT_PUBLIC_SUPABASE_URL,
    values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { cookies: cookieMethods },
  );
  assert.equal(
    check(await server.auth.getUser(), "Cookie session").user.id,
    userId,
  );
  let outcome = await completeInvitationSetup(
    server,
    invitationId,
    "12345",
    "12345",
  );
  assert.equal(outcome.error.code, "PASSWORD_TOO_SHORT");
  assert.equal(
    check(
      await admin
        .from("v2_organisation_invitations")
        .select("status")
        .eq("id", invitationId)
        .single(),
      "Pending status",
    ).status,
    "pending",
  );
  const weak = await server.auth.updateUser({ password: "12345" });
  assert.equal(weak.error?.code, "weak_password");
  assert.equal(mapSetupAuthError(weak.error).code, "PASSWORD_TOO_SHORT");
  assert.equal(
    check(await server.auth.getUser(), "Session after Auth rejection").user.id,
    userId,
  );
  const password = `Aa1!${crypto.randomUUID()}`;
  outcome = await completeInvitationSetup(
    server,
    invitationId,
    password,
    "mismatch",
  );
  assert.equal(outcome.error.code, "PASSWORD_MISMATCH");
  outcome = await completeInvitationSetup(
    server,
    invitationId,
    password,
    password,
  );
  assert.equal(outcome.ok, true);
  assert.equal(
    check(
      await admin
        .from("organisation_users")
        .select("status")
        .eq("organisation_id", organisationId)
        .eq("user_id", userId)
        .single(),
      "Membership",
    ).status,
    "active",
  );
  const assignments = check(
    await admin
      .from("v2_user_role_assignments")
      .select("role_id,status")
      .eq("organisation_id", organisationId)
      .eq("user_id", userId),
    "Role assignment",
  );
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].role_id, roleId);
  assert.equal(assignments[0].status, "active");
  assert.equal(
    (await completeInvitationSetup(server, invitationId, password, password))
      .error.code,
    "INVITATION_ALREADY_USED",
  );
  assert.equal(
    check(
      await admin
        .from("v2_role_permissions")
        .select("allowed")
        .eq("role_id", roleId)
        .eq("permission_id", policyId)
        .single(),
      "Preserved custom deny",
    ).allowed,
    false,
  );
  console.log(
    "PASS: live generated link, PKCE reproduction, durable cookie session, short/mismatched password retry without resend, Auth weak-password rejection, active membership, one intended-role assignment, accepted retry and preserved custom deny.",
  );
} finally {
  await browser?.auth.stopAutoRefresh();
  browser?.auth.broadcastChannel?.close();
  await server?.auth.stopAutoRefresh();
  server?.auth.broadcastChannel?.close();
  delete globalThis.window;
  delete globalThis.document;
  if (organisationId)
    check(
      await admin
        .from("organisations")
        .delete()
        .eq("id", organisationId)
        .eq("code", fixtureCode),
      "Temporary organisation cleanup",
    );
  if (userId) {
    assert.equal(
      check(
        await admin.auth.admin.getUserById(userId),
        "Cleanup identity verification",
      ).user.email,
      fixtureEmail,
    );
    check(
      await admin.auth.admin.deleteUser(userId),
      "Temporary auth account cleanup",
    );
  }
  console.log(
    "Temporary organisation, invitation, membership, role and Auth account removed. No email sent.",
  );
}

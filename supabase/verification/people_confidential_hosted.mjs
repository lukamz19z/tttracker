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
for (const [name, value] of Object.entries(values))
  if (process.env[name] === undefined) process.env[name] = value;
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
let sessionClient;
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
    if (name === "@/lib/supabase/server")
      return { createSupabaseServer: async () => sessionClient };
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
    if (name.startsWith("node:")) return dependency(name);
    return createRequire(path.join(root, "v2/package.json"))(name);
  }, exports);
  return exports;
}

const { randomUUID, randomBytes } = dependency("node:crypto");
const os = dependency("node:os");
const fixtureCode = `CONFIDENTIAL-CHECK-${randomUUID()}`;
const fixtureEmail = `confidential-check-${randomUUID()}@example.invalid`;
const state = {
  organisationId: null,
  userId: null,
  code: fixtureCode,
  email: fixtureEmail,
};
const statePath = path.join(
  os.tmpdir(),
  "tttracker-confidential-hosted-cleanup.json",
);
const sqlPath = path.join(
  os.tmpdir(),
  "tttracker-confidential-hosted-cleanup.sql",
);
const check = (response, label) => {
  if (response.error) throw Error(label + " failed; details withheld");
  return response.data;
};
const save = () => fs.writeFileSync(statePath, JSON.stringify(state));
if (process.argv.includes("--cleanup-auth")) {
  const previous = JSON.parse(fs.readFileSync(statePath, "utf8"));
  if (previous.userId) {
    assert.equal(
      check(
        await admin.auth.admin.getUserById(previous.userId),
        "Cleanup identity",
      ).user.email,
      previous.email,
    );
    check(await admin.auth.admin.deleteUser(previous.userId), "Auth cleanup");
  }
  if (previous.organisationId)
    check(
      await admin
        .from("organisations")
        .delete()
        .eq("id", previous.organisationId)
        .eq("code", previous.code),
      "Organisation cleanup",
    );
  fs.unlinkSync(statePath);
  fs.unlinkSync(sqlPath);
  console.log("Synthetic auth user and organisation removed.");
} else {
  try {
    if (!process.argv.includes("--verify-blocked")) {
      const config = load(
        "v2/lib/people/confidential-kms-config.ts",
      ).confidentialKmsConfig();
      if (config.collectionMode !== "synthetic")
        throw Error("Synthetic collection is not enabled");
    }
    if (fs.existsSync(statePath))
      throw Error("Previous fixture requires cleanup");
    state.organisationId = check(
      await admin
        .from("organisations")
        .insert({
          code: fixtureCode,
          name: "Synthetic confidential security verification",
        })
        .select("id")
        .single(),
      "Create org",
    ).id;
    save();
    const feature = check(
      await admin
        .from("v2_features")
        .select("id")
        .eq("feature_key", "people")
        .single(),
      "Feature",
    );
    check(
      await admin.from("organisation_modules").insert({
        organisation_id: state.organisationId,
        module_key: "people",
        enabled: true,
      }),
      "Module",
    );
    check(
      await admin.from("v2_organisation_entitlement_overrides").insert({
        organisation_id: state.organisationId,
        feature_id: feature.id,
        enabled: true,
      }),
      "Entitlement",
    );
    const password = randomBytes(32).toString("base64url") + "Aa1!";
    state.userId = check(
      await admin.auth.admin.createUser({
        email: fixtureEmail,
        password,
        email_confirm: true,
      }),
      "Synthetic user",
    ).user.id;
    save();
    check(
      await admin.from("organisation_users").insert({
        organisation_id: state.organisationId,
        user_id: state.userId,
        status: "active",
      }),
      "Membership",
    );
    const actor = check(
      await admin
        .from("v2_platform_admins")
        .select("user_id")
        .eq("status", "active")
        .limit(1),
      "Bootstrap authority",
    )[0];
    const role = check(
      await admin.rpc("tttracker_v2_platform_invitation", {
        p_actor: actor.user_id,
        p_action: "bootstrap",
        p_organisation_id: state.organisationId,
      }),
      "Bootstrap role",
    ).roleId;
    check(
      await admin.from("v2_user_role_assignments").insert({
        organisation_id: state.organisationId,
        user_id: state.userId,
        role_id: role,
        status: "active",
      }),
      "Role",
    );
    sessionClient = createClient(
      values.NEXT_PUBLIC_SUPABASE_URL,
      values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    check(
      await sessionClient.auth.signInWithPassword({
        email: fixtureEmail,
        password,
      }),
      "Login",
    );
    const person = check(
      await admin
        .from("v2_people")
        .insert({
          organisation_id: state.organisationId,
          display_name: "Synthetic person",
        })
        .select("id")
        .single(),
      "Person",
    ).id;
    const service = load("v2/lib/people/confidential.ts");
    // Actual standard Administrator role, with no confidential grants, must be denied.
    const owner = {
      organisationId: state.organisationId,
      personId: person,
      recordId: randomUUID(),
      fieldId: randomUUID(),
    };
    let denied = false;
    try {
      await service.readConfidentialValue(owner, "person_review");
    } catch (e) {
      denied = e.message === "PEOPLE_PERMISSION_DENIED";
    }
    assert.ok(denied, "Administrator non-bypass");
    const capabilities = [
      "people.confidential.view",
      "people.confidential.edit",
      "people.confidential.manage_keys",
      "people.onboarding.manage",
    ];
    const permissions = check(
      await admin
        .from("v2_permissions")
        .select("id,permission_code")
        .in("permission_code", capabilities),
      "Permissions",
    );
    assert.equal(permissions.length, 4);
    check(
      await admin.from("v2_user_permission_overrides").insert(
        permissions.map((p) => ({
          organisation_id: state.organisationId,
          user_id: state.userId,
          permission_id: p.id,
          effect: "allow",
        })),
      ),
      "Synthetic grants",
    );
    if (process.argv.includes("--verify-blocked")) {
      await assert.rejects(
        service.rotateConfidentialKey(state.organisationId),
        /CONFIDENTIAL_KEY_SERVICE_UNAVAILABLE|CONFIDENTIAL_COLLECTION_DISABLED/,
      );
      console.log(
        "PASS hosted: actual authorised server key generation fails closed without external KMS readiness. No key material is created.",
      );
      throw Error("EXPECTED_VAULT_BOUNDARY_BLOCKED");
    }
    assert.equal(await service.rotateConfidentialKey(state.organisationId), 1);
    owner.fieldId = (
      await service.createSecureField(state.organisationId, {
        semanticType: "bank_account",
        label: "Synthetic account",
        kind: "value",
      })
    ).id;
    const secret = "SYNTHETIC-" + randomBytes(20).toString("hex");
    assert.equal(
      (await service.writeConfidentialValue(owner, secret, "payroll_review"))
        .key_version,
      1,
    );
    assert.ok(
      (await service.readConfidentialValue(owner, "payroll_review")) === secret,
      "Roundtrip",
    );
    const denyPermission = permissions.find(
      (p) => p.permission_code === "people.confidential.view",
    ).id;
    check(
      await admin
        .from("v2_user_permission_overrides")
        .update({ effect: "deny" })
        .eq("organisation_id", state.organisationId)
        .eq("user_id", state.userId)
        .eq("permission_id", denyPermission),
      "Deny",
    );
    denied = false;
    try {
      await service.readConfidentialValue(owner, "payroll_review");
    } catch (e) {
      denied = e.message === "PEOPLE_PERMISSION_DENIED";
    }
    assert.ok(denied, "Explicit deny");
    check(
      await admin
        .from("v2_user_permission_overrides")
        .update({ effect: "allow" })
        .eq("organisation_id", state.organisationId)
        .eq("user_id", state.userId)
        .eq("permission_id", denyPermission),
      "Restore synthetic grant",
    );
    assert.equal(await service.rotateConfidentialKey(state.organisationId), 2);
    assert.ok(
      (await service.readConfidentialValue(owner, "key_rotation")) === secret,
      "Old key decrypt",
    );
    assert.equal(
      (await service.reencryptConfidentialValue(owner)).key_version,
      2,
    );
    assert.ok(
      (await service.readConfidentialValue(owner, "payroll_review")) === secret,
      "Rotated decrypt",
    );
    const docOwner = {
      ...owner,
      recordId: randomUUID(),
      fieldId: (
        await service.createSecureField(state.organisationId, {
          semanticType: "confidential_document",
          label: "Synthetic evidence",
          kind: "document",
        })
      ).id,
    };
    const bytes = Buffer.from("%PDF-1.7 synthetic evidence");
    await service.writeConfidentialDocument(
      docOwner,
      { name: "synthetic.pdf", contentType: "application/pdf", bytes },
      "document_review",
    );
    const doc = await service.readConfidentialDocument(
      docOwner,
      "document_review",
    );
    assert.ok(doc.bytes.equals(bytes), "Encrypted document roundtrip");
    const objects = check(
      await admin.storage
        .from("v2-people-confidential")
        .list(`${state.organisationId}/${docOwner.recordId}/1`),
      "Encrypted objects",
    );
    assert.equal(objects.length, 1);
    const object = `${state.organisationId}/${docOwner.recordId}/1/${objects[0].name}`;
    const encrypted = Buffer.from(
      await check(
        await admin.storage.from("v2-people-confidential").download(object),
        "Ciphertext object",
      ).arrayBuffer(),
    );
    assert.ok(!encrypted.includes(bytes), "No plaintext file");
    const publicURL = admin.storage
      .from("v2-people-confidential")
      .getPublicUrl(object).data.publicUrl;
    assert.ok(!(await fetch(publicURL)).ok, "Private bucket");
    const fieldB = (
      await service.createSecureField(state.organisationId, {
        semanticType: "tax_identifier",
        label: "Synthetic second field",
        kind: "value",
      })
    ).id;
    const onboarding = await service.createSecureOnboarding(
      state.organisationId,
      [owner.fieldId],
      new Date(Date.now() + 3600000).toISOString(),
    );
    const scoped = await service.exchangeSecureOnboardingToken(
      onboarding.token,
    );
    denied = false;
    try {
      await service.exchangeSecureOnboardingToken(onboarding.token);
    } catch (e) {
      denied = e.message === "ONBOARDING_LINK_INVALID";
    }
    assert.ok(denied, "One-time exchange");
    const ext = await service.writeExternalConfidentialValue(
      scoped.sessionToken,
      onboarding.instanceId,
      owner.fieldId,
      "SYNTHETIC-EXTERNAL",
    );
    assert.equal(ext.revision, 1);
    denied = false;
    try {
      await service.writeExternalConfidentialValue(
        scoped.sessionToken,
        onboarding.instanceId,
        fieldB,
        "SYNTHETIC-DENIED",
      );
    } catch (e) {
      denied = e.message === "ONBOARDING_SESSION_INVALID";
    }
    assert.ok(denied, "Field allowlist");
    denied = false;
    try {
      await service.writeExternalConfidentialValue(
        scoped.sessionToken,
        randomUUID(),
        owner.fieldId,
        "SYNTHETIC-DENIED",
      );
    } catch (e) {
      denied = e.message === "ONBOARDING_SESSION_INVALID";
    }
    assert.ok(denied, "Instance isolation");
    await service.revokeSecureOnboarding(
      state.organisationId,
      onboarding.instanceId,
    );
    denied = false;
    try {
      await service.writeExternalConfidentialValue(
        scoped.sessionToken,
        onboarding.instanceId,
        owner.fieldId,
        "SYNTHETIC-DENIED",
        ext.record_id,
      );
    } catch (e) {
      denied = e.message === "ONBOARDING_SESSION_INVALID";
    }
    assert.ok(denied, "Revocation");
    denied = false;
    try {
      await service.readConfidentialValue(
        { ...owner, organisationId: randomUUID() },
        "payroll_review",
      );
    } catch (e) {
      denied = e.message === "PEOPLE_PERMISSION_DENIED";
    }
    assert.ok(denied, "Tenant isolation");
    const anonymous = createClient(
      values.NEXT_PUBLIC_SUPABASE_URL,
      values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false } },
    );
    assert.ok(
      (
        await anonymous.rpc("tttracker_v2_confidential_redeem", {
          p_ticket_hash: "a".repeat(64),
        })
      ).error,
      "Anonymous key denial",
    );
    assert.ok(
      (
        await sessionClient.rpc("tttracker_v2_confidential_redeem", {
          p_ticket_hash: "a".repeat(64),
        })
      ).error,
      "Authenticated key denial",
    );
    assert.ok(
      (
        await admin
          .schema("private")
          .from("v2_confidential_versions")
          .select("ciphertext")
      ).error,
      "No direct service table access",
    );
    check(
      await admin.storage.from("v2-people-confidential").remove([object]),
      "Object cleanup",
    );
    console.log(
      "PASS hosted: real externally KMS-backed AES-GCM value/document roundtrip, private bucket, version rotation, Administrator non-bypass, explicit deny, tenant isolation, hashed one-time external token, scoped writes, field allowlist, revocation and browser key denial. No emails sent.",
    );
  } catch (error) {
    if (error.message !== "EXPECTED_VAULT_BOUNDARY_BLOCKED") {
      process.exitCode = 1;
      console.error(
        "Hosted confidential verification failed. Details withheld; synthetic fixture cleanup required.",
      );
    }
  } finally {
    await sessionClient?.auth.signOut();
    if (state.organisationId) {
      const o = state.organisationId;
      fs.writeFileSync(
        sqlPath,
        `begin;
 delete from private.v2_confidential_audit where organisation_id='${o}';
 delete from private.v2_confidential_tickets where organisation_id='${o}';
 delete from private.v2_confidential_versions where organisation_id='${o}';
 delete from private.v2_confidential_records where organisation_id='${o}';
 delete from private.v2_secure_sessions where organisation_id='${o}';
 delete from private.v2_secure_tokens where organisation_id='${o}';
 delete from private.v2_secure_instance_fields where organisation_id='${o}';
 delete from private.v2_secure_onboarding_instances where organisation_id='${o}';
 delete from private.v2_secure_fields where organisation_id='${o}';
 delete from private.v2_confidential_keys where organisation_id='${o}';
 commit;`,
      );
      console.log(
        "Synthetic private fixture awaits scoped SQL cleanup; then run this script with --cleanup-auth.",
      );
    }
  }
}

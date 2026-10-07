import { createRequire } from "node:module";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const ts = require(path.join(root, "v2/node_modules/typescript"));

function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync(path.join(root, file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
  new Function("require", "exports", code)((name) => {
    if (name in mocks) return mocks[name];
    if (name === "server-only") return {};
    if (name.startsWith("./"))
      return load(
        path.posix.join(path.posix.dirname(file), name) + ".ts",
        mocks,
      );
    if (name.startsWith("@/"))
      return load("v2/" + name.slice(2) + ".ts", mocks);
    return require(name);
  }, exports);
  return exports;
}

const crypto = load("v2/lib/people/confidential-crypto.ts");
const service = load("v2/lib/people/confidential.ts", {
  "@/lib/supabase/server": {},
  "@/lib/supabase/admin": {},
  "@/lib/security/status": {},
  "./confidential-kms": {},
  "./confidential-kms-config": {},
  "./confidential-readiness": {},
});
const key = "ab".repeat(32),
  secret = Buffer.from("SYNTHETIC-CONFIDENTIAL-ONLY");
const context = {
  organisation_id: "org-a",
  person_id: "person-a",
  instance_id: null,
  field_id: "field-a",
  record_id: "record-a",
  revision: 1,
  key_version: 1,
  semantic_type: "bank_account",
  kind: "value",
};
test("AES256GCM roundtrip stores no plaintext, random nonce each write", () => {
  const a = crypto.encryptConfidential(secret, key, context),
    b = crypto.encryptConfidential(secret, key, context);
  assert.ok(!JSON.stringify(a).includes(secret.toString()));
  assert.notEqual(a.nonce, b.nonce);
  assert.deepEqual(crypto.decryptConfidential(a, key, context), secret);
  assert.equal(Buffer.from(a.nonce, "base64").length, 12);
  assert.equal(Buffer.from(a.tag, "base64").length, 16);
});
test("wrong key and unknown key rejected", () => {
  const e = crypto.encryptConfidential(secret, key, context);
  assert.throws(
    () => crypto.decryptConfidential(e, "cd".repeat(32), context),
    /CONFIDENTIAL_INTEGRITY_FAILED/,
  );
  assert.throws(
    () => crypto.decryptConfidential(e, "", context),
    /CONFIDENTIAL_KEY_UNAVAILABLE/,
  );
});
for (const field of [
  "organisation_id",
  "person_id",
  "instance_id",
  "field_id",
  "record_id",
  "revision",
  "key_version",
  "semantic_type",
  "kind",
])
  test("AAD rejects substituted " + field, () => {
    const e = crypto.encryptConfidential(secret, key, context);
    assert.throws(
      () =>
        crypto.decryptConfidential(e, key, {
          ...context,
          [field]: typeof context[field] === "number" ? 2 : "other",
        }),
      /CONFIDENTIAL_INTEGRITY_FAILED/,
    );
  });
for (const field of ["ciphertext", "nonce", "tag"])
  test("tampered " + field + " fails closed", () => {
    const e = crypto.encryptConfidential(secret, key, context);
    const b = Buffer.from(e[field], "base64");
    b[0] ^= 1;
    assert.throws(
      () =>
        crypto.decryptConfidential(
          { ...e, [field]: b.toString("base64") },
          key,
          context,
        ),
      /CONFIDENTIAL_INTEGRITY_FAILED/,
    );
  });
test("rotation retains old decryptability with new version payload", () => {
  const a = crypto.encryptConfidential(secret, key, context);
  const newer = { ...context, revision: 2, key_version: 2 };
  const b = crypto.encryptConfidential(
    crypto.decryptConfidential(a, key, context),
    "cd".repeat(32),
    newer,
  );
  assert.deepEqual(
    crypto.decryptConfidential(a, key, context),
    crypto.decryptConfidential(b, "cd".repeat(32), newer),
  );
});
test("documents encrypt names/type/content and recover supported provider bytes", () => {
  const file = Buffer.from("%PDF-1.7 synthetic");
  const packed = crypto.encodeConfidentialDocument(
    "synthetic.pdf",
    "application/pdf",
    file,
  );
  const c = { ...context, kind: "document" };
  const e = crypto.encryptConfidential(packed, key, c);
  assert.ok(!Buffer.from(e.ciphertext, "base64").includes(file));
  assert.ok(
    !Buffer.from(e.ciphertext, "base64").includes(Buffer.from("synthetic.pdf")),
  );
  const d = crypto.decodeConfidentialDocument(
    crypto.decryptConfidential(e, key, c),
  );
  assert.equal(d.name, "synthetic.pdf");
  assert.deepEqual(d.bytes, file);
});
test("document format spoofing and oversize are rejected", () => {
  assert.throws(
    () =>
      crypto.encodeConfidentialDocument(
        "x.pdf",
        "application/pdf",
        Buffer.from("wrong"),
      ),
    /CONFIDENTIAL_DOCUMENT_INVALID/,
  );
  assert.throws(
    () =>
      crypto.encodeConfidentialDocument(
        "x.pdf",
        "application/pdf",
        Buffer.alloc(11 * 1024 * 1024),
      ),
    /CONFIDENTIAL_DOCUMENT_INVALID/,
  );
});
test("onboarding token entropy/hash at rest and malformed rejection", () => {
  const a = service.secureToken(),
    b = service.secureToken();
  assert.equal(a.length, 43);
  assert.notEqual(a, b);
  assert.equal(service.tokenHash(a).length, 64);
  assert.notEqual(a, service.tokenHash(a));
  assert.throws(
    () => service.tokenHash("predictable-id"),
    /ONBOARDING_LINK_INVALID/,
  );
});
test("crypto and server services do not log payloads, values or keys", () => {
  for (const file of ["confidential.ts", "confidential-crypto.ts"])
    assert.ok(
      !/console\.|JSON.stringify\(error/.test(
        fs.readFileSync(path.join(root, "v2/lib/people", file), "utf8"),
      ),
    );
});
test("server service denies unmet canonical Security Check", async () => {
  const s = load("v2/lib/people/confidential.ts", {
    "@/lib/supabase/server": { createSupabaseServer: async () => ({}) },
    "@/lib/security/status": {
      getSecurityStatus: async () => ({ complete: false }),
    },
    "./confidential-kms": {},
    "./confidential-kms-config": {},
    "./confidential-readiness": {},
    "@/lib/supabase/admin": {
      createSupabaseAdmin: () => {
        throw Error("must not be called");
      },
    },
  });
  await assert.rejects(
    s.readConfidentialValue(
      { organisationId: "a", fieldId: "f", recordId: "r" },
      "person_review",
    ),
    /SECURITY_CHECK_REQUIRED/,
  );
});
test("external exchange sets scoped HttpOnly cookie; does not return session token", async () => {
  const cookies = [];
  let sends = 0;
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  const route = load("v2/app/api/onboarding/security/exchange/route.ts", {
    "next/server": {
      NextResponse: {
        json: (body, options = {}) => ({
          body,
          ...options,
          cookies: { set: (...args) => cookies.push(args) },
        }),
      },
    },
    "@/lib/people/confidential": {
      exchangeSecureOnboardingToken: async () => {
        sends++;
        return {
          instanceId: "instance-a",
          sessionToken: "opaque",
          expiresAt: new Date(Date.now() + 1800000).toISOString(),
        };
      },
    },
  });
  const response = await route.POST(
    new Request("https://app.example.test/api/onboarding/security/exchange", {
      method: "POST",
      headers: {
        origin: "https://app.example.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: service.secureToken() }),
    }),
  );
  assert.equal(sends, 1);
  assert.equal(response.body.instanceId, "instance-a");
  assert.ok(!JSON.stringify(response.body).includes("opaque"));
  assert.equal(cookies[0][2].httpOnly, true);
  assert.equal(cookies[0][2].secure, true);
  assert.equal(cookies[0][2].sameSite, "strict");
  assert.equal(cookies[0][2].path, "/api/onboarding/security");
  const denied = await route.POST(
    new Request("https://app.example.test/api/onboarding/security/exchange", {
      method: "POST",
      headers: { origin: "https://evil.example.test" },
    }),
  );
  assert.equal(denied.status, 403);
  assert.equal(sends, 1);
});

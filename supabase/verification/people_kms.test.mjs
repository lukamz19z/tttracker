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

const { randomBytes, randomUUID } = require("node:crypto");
const configModule = load("v2/lib/people/confidential-kms-config.ts");
const region = "ap-southeast-2",
  arn =
    "arn:aws:kms:" +
    region +
    ":123456789012:key/00000000-0000-0000-0000-000000000001";
const env = {
  TTTRACKER_CONFIDENTIAL_KMS_REGION: region,
  TTTRACKER_CONFIDENTIAL_KMS_KEY_ARN: arn,
  TTTRACKER_CONFIDENTIAL_AWS_ROLE_ARN:
    "arn:aws:iam::123456789012:role/ConfidentialDevelopment",
  TTTRACKER_CONFIDENTIAL_ENVIRONMENT: "development",
  TTTRACKER_CONFIDENTIAL_VERCEL_TEAM_SLUG: "neutral-team",
  TTTRACKER_CONFIDENTIAL_VERCEL_PROJECT_NAME: "neutral-project",
  TTTRACKER_CONFIDENTIAL_VERCEL_OWNER_ID: "team_synthetic",
  TTTRACKER_CONFIDENTIAL_VERCEL_PROJECT_ID: "prj_synthetic",
  TTTRACKER_CONFIDENTIAL_COLLECTION_MODE: "synthetic",
  VERCEL_ENV: "development",
};
const config = configModule.confidentialKmsConfig(env);
const context = {
  organisation_id: randomUUID(),
  person_id: randomUUID(),
  instance_id: null,
  field_id: randomUUID(),
  record_id: randomUUID(),
  revision: 1,
  key_version: 1,
  semantic_type: "bank_account",
  kind: "value",
  crypto_format_version: 2,
  kms_key_reference: arn,
  environment: "development",
};
const crypto = load("v2/lib/people/confidential-crypto.ts");
function fixture() {
  const state = {
    calls: [],
    authority: true,
    identity: true,
    error: null,
    keyState: "Enabled",
    schema: true,
    dbCalls: 0,
    wrongKey: false,
  };
  const keys = new Map();
  class GenerateDataKeyCommand {
    constructor(input) {
      this.input = input;
      this.kind = "generate";
    }
  }
  class DecryptCommand {
    constructor(input) {
      this.input = input;
      this.kind = "decrypt";
    }
  }
  class DescribeKeyCommand {
    constructor(input) {
      this.input = input;
      this.kind = "describe";
    }
  }
  const mocks = {
    "./confidential-kms-config": { confidentialKmsConfig: () => config },
    "@vercel/oidc": {
      getVercelOidcToken: async () => {
        if (!state.identity) throw Error("secret token withheld");
        return "synthetic-token";
      },
      verifyVercelOidcToken: async (token, options) => {
        assert.equal(options.issuer, "https://oidc.vercel.com/neutral-team");
        assert.equal(
          options.subject,
          "owner:neutral-team:project:neutral-project:environment:development",
        );
        assert.equal(options.environment, "development");
        assert.equal(options.projectId, "prj_synthetic");
        assert.equal(options.ownerId, "team_synthetic");
        assert.deepEqual(options.algorithms, ["RS256"]);
        return { payload: { exp: Math.floor(Date.now() / 1000) + 60 } };
      },
    },
    "@vercel/oidc-aws-credentials-provider": {
      awsCredentialsProvider: (options) => {
        assert.equal(options.durationSeconds, 900);
        assert.equal(options.roleArn, config.roleArn);
        return async () => {
          if (!state.authority) throw Error("private credentials withheld");
          return {};
        };
      },
    },
    "@aws-sdk/client-kms": {
      GenerateDataKeyCommand,
      DecryptCommand,
      DescribeKeyCommand,
      KMSClient: class {
        constructor(options) {
          this.options = options;
          assert.equal(options.region, region);
          assert.equal(typeof options.credentials, "function");
        }
        destroy() {}
        async send(command) {
          await this.options.credentials();
          state.calls.push(command.kind);
          if (state.error)
            throw {
              name: state.error,
              message: "SYNTHETIC-SECRET must never escape",
            };
          if (command.kind === "describe")
            return {
              KeyMetadata: {
                Arn: arn,
                KeyState: state.keyState,
                KeyUsage: "ENCRYPT_DECRYPT",
                KeySpec: "SYMMETRIC_DEFAULT",
              },
            };
          if (command.kind === "generate") {
            const wrapped = randomBytes(96),
              key = randomBytes(32);
            keys.set(wrapped.toString("base64"), {
              key: Buffer.from(key),
              context: JSON.stringify(command.input.EncryptionContext),
            });
            state.lastPlaintext = key;
            return {
              KeyId: state.wrongKey ? "wrong" : command.input.KeyId,
              Plaintext: key,
              CiphertextBlob: wrapped,
            };
          }
          const known = keys.get(
            Buffer.from(command.input.CiphertextBlob).toString("base64"),
          );
          if (
            !known ||
            known.context !== JSON.stringify(command.input.EncryptionContext)
          )
            throw { name: "InvalidCiphertextException" };
          state.lastPlaintext = Buffer.from(known.key);
          return {
            KeyId: state.wrongKey ? "wrong" : command.input.KeyId,
            Plaintext: state.lastPlaintext,
          };
        }
      },
    },
    "@/lib/supabase/admin": {
      createSupabaseAdmin: () => ({
        rpc: async () => {
          state.dbCalls++;
          return {
            data: {
              crypto_format_version: state.schema ? 2 : 1,
              legacy_versions: 0,
              browser_key_release: false,
            },
            error: null,
          };
        },
      }),
    },
  };
  const kms = load("v2/lib/people/confidential-kms.ts", mocks);
  mocks["./confidential-kms"] = kms;
  return { state, kms, mocks };
}
test("config rejects missing provider, wrong account/region, alias and wrong deployment environment", () => {
  assert.throws(
    () => configModule.confidentialKmsConfig({}),
    /CONFIDENTIAL_KEY_SERVICE_UNAVAILABLE/,
  );
  for (const changes of [
    { TTTRACKER_CONFIDENTIAL_KMS_REGION: "us-east-1" },
    { VERCEL_ENV: "preview" },
    { TTTRACKER_CONFIDENTIAL_KMS_KEY_ARN: "alias/general-key" },
    {
      TTTRACKER_CONFIDENTIAL_AWS_ROLE_ARN:
        "arn:aws:iam::999999999999:role/Other",
    },
    {
      TTTRACKER_CONFIDENTIAL_ENVIRONMENT: "production",
      VERCEL_ENV: "production",
    },
  ])
    assert.throws(
      () => configModule.confidentialKmsConfig({ ...env, ...changes }),
      /CONFIDENTIAL_KEY_SERVICE_UNAVAILABLE/,
    );
});
test("production cannot opt into synthetic collection; disabled config is accepted", () => {
  assert.throws(
    () =>
      configModule.confidentialKmsConfig({
        ...env,
        TTTRACKER_CONFIDENTIAL_ENVIRONMENT: "production",
        VERCEL_ENV: "production",
      }),
    /CONFIDENTIAL_KEY_SERVICE_UNAVAILABLE/,
  );
  assert.equal(
    configModule.confidentialKmsConfig({
      ...env,
      TTTRACKER_CONFIDENTIAL_ENVIRONMENT: "production",
      VERCEL_ENV: "production",
      TTTRACKER_CONFIDENTIAL_COLLECTION_MODE: "disabled",
    }).collectionMode,
    "disabled",
  );
});
test("GenerateDataKey envelope has no plaintext DEK and SDK key buffer is wiped", async () => {
  const { kms, state } = fixture();
  const result = await kms.generateConfidentialDataKey(context);
  assert.equal(result.plaintextKey.length, 32);
  assert.equal(result.envelope.crypto_format_version, 2);
  assert.ok(
    !JSON.stringify(result.envelope).includes(
      result.plaintextKey.toString("base64"),
    ),
  );
  assert.ok(state.lastPlaintext.every((b) => b === 0));
  result.plaintextKey.fill(0);
});
test("KMS-backed AES roundtrip and per-write DEKs are distinct", async () => {
  const { kms } = fixture();
  const a = await kms.generateConfidentialDataKey(context),
    b = await kms.generateConfidentialDataKey(context);
  assert.notEqual(a.envelope.encrypted_dek, b.envelope.encrypted_dek);
  const secret = Buffer.from("SYNTHETIC-FINANCIAL-FIXTURE");
  const encrypted = crypto.encryptConfidential(secret, a.plaintextKey, context);
  a.plaintextKey.fill(0);
  b.plaintextKey.fill(0);
  const key = await kms.decryptConfidentialDataKey(a.envelope, context);
  assert.ok(crypto.decryptConfidential(encrypted, key, context).equals(secret));
  assert.ok(!Buffer.from(encrypted.ciphertext, "base64").includes(secret));
  key.fill(0);
});
test("wrong organisation, field and revision cannot unwrap envelope", async () => {
  const { kms } = fixture();
  const a = await kms.generateConfidentialDataKey(context);
  a.plaintextKey.fill(0);
  for (const change of [
    { organisation_id: randomUUID() },
    { field_id: randomUUID() },
    { revision: 2 },
  ])
    await assert.rejects(
      kms.decryptConfidentialDataKey(a.envelope, { ...context, ...change }),
      /CONFIDENTIAL_DATA_INTEGRITY_FAILED/,
    );
});
test("tampered wrapped DEK and wrong KMS key fail closed", async () => {
  const { kms, state } = fixture();
  const a = await kms.generateConfidentialDataKey(context);
  a.plaintextKey.fill(0);
  await assert.rejects(
    kms.decryptConfidentialDataKey(
      { ...a.envelope, encrypted_dek: randomBytes(96).toString("base64") },
      context,
    ),
    /CONFIDENTIAL_DATA_INTEGRITY_FAILED/,
  );
  const calls = state.calls.length;
  await assert.rejects(
    kms.decryptConfidentialDataKey(
      { ...a.envelope, kms_key_reference: arn.replace(/1$/, "2") },
      context,
    ),
    /CONFIDENTIAL_DATA_INTEGRITY_FAILED/,
  );
  assert.equal(state.calls.length, calls);
});
test("tampered GCM ciphertext fails even after authorised KMS unwrap", async () => {
  const { kms } = fixture();
  const a = await kms.generateConfidentialDataKey(context);
  const payload = crypto.encryptConfidential(
    Buffer.from("SYNTHETIC"),
    a.plaintextKey,
    context,
  );
  a.plaintextKey.fill(0);
  const key = await kms.decryptConfidentialDataKey(a.envelope, context);
  assert.throws(
    () =>
      crypto.decryptConfidential(
        { ...payload, tag: Buffer.alloc(16, 1).toString("base64") },
        key,
        context,
      ),
    /CONFIDENTIAL_INTEGRITY_FAILED/,
  );
  key.fill(0);
});
test("Supabase-only artifact attacker has no unwrap authority, even with static AWS env bait", async () => {
  const { kms, state } = fixture();
  const a = await kms.generateConfidentialDataKey(context);
  a.plaintextKey.fill(0);
  state.authority = false;
  process.env.AWS_ACCESS_KEY_ID = "SYNTHETIC-NOT-USED";
  process.env.AWS_SECRET_ACCESS_KEY = "SYNTHETIC-NOT-USED";
  try {
    await assert.rejects(
      kms.decryptConfidentialDataKey(a.envelope, context),
      /CONFIDENTIAL_KEY_SERVICE_UNAVAILABLE/,
    );
  } finally {
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
  }
});
test("no workload identity prevents any KMS command", async () => {
  const { kms, state } = fixture();
  state.identity = false;
  await assert.rejects(
    kms.generateConfidentialDataKey(context),
    /CONFIDENTIAL_KEY_SERVICE_UNAVAILABLE/,
  );
  assert.equal(state.calls.length, 0);
});
for (const [name, expected] of [
  ["AccessDeniedException", "CONFIDENTIAL_ACCESS_DENIED"],
  ["KMSInternalException", "CONFIDENTIAL_KEY_SERVICE_UNAVAILABLE"],
  ["InvalidCiphertextException", "CONFIDENTIAL_DATA_INTEGRITY_FAILED"],
])
  test("safe redaction for " + name, async () => {
    const { kms, state } = fixture();
    state.error = name;
    await assert.rejects(
      kms.generateConfidentialDataKey(context),
      (error) =>
        error.message === expected &&
        !String(error.stack).includes("SYNTHETIC-SECRET"),
    );
  });
test("disabled or wrong CMK state blocks health self-test", async () => {
  const { kms, state } = fixture();
  state.keyState = "Disabled";
  await assert.rejects(
    kms.describeConfidentialKmsKey(),
    /CONFIDENTIAL_KEY_SERVICE_UNAVAILABLE/,
  );
});
test("document envelope roundtrip and tenant binding", async () => {
  const { kms } = fixture();
  const c = { ...context, kind: "document" };
  const a = await kms.generateConfidentialDataKey(c);
  const bytes = Buffer.from("%PDF-1.7 synthetic");
  const payload = crypto.encryptConfidential(
    crypto.encodeConfidentialDocument(
      "synthetic.pdf",
      "application/pdf",
      bytes,
    ),
    a.plaintextKey,
    c,
  );
  a.plaintextKey.fill(0);
  const key = await kms.decryptConfidentialDataKey(a.envelope, c);
  assert.ok(
    crypto
      .decodeConfidentialDocument(crypto.decryptConfidential(payload, key, c))
      .bytes.equals(bytes),
  );
  key.fill(0);
});
test("envelope-generation rotation preserves old reads and creates fresh keys", async () => {
  const { kms } = fixture();
  const a = await kms.generateConfidentialDataKey(context);
  const plain = Buffer.from("SYNTHETIC");
  const payload = crypto.encryptConfidential(plain, a.plaintextKey, context);
  a.plaintextKey.fill(0);
  const oldKey = await kms.decryptConfidentialDataKey(a.envelope, context);
  const old = crypto.decryptConfidential(payload, oldKey, context);
  oldKey.fill(0);
  const c = { ...context, revision: 2, key_version: 2 };
  const b = await kms.generateConfidentialDataKey(c);
  const changed = crypto.encryptConfidential(old, b.plaintextKey, c);
  old.fill(0);
  b.plaintextKey.fill(0);
  const newKey = await kms.decryptConfidentialDataKey(b.envelope, c);
  assert.ok(crypto.decryptConfidential(changed, newKey, c).equals(plain));
  newKey.fill(0);
});
test("cached readiness checks schema and self-test; workload is rechecked", async () => {
  const { mocks, state } = fixture();
  const readiness = load("v2/lib/people/confidential-readiness.ts", mocks);
  assert.equal((await readiness.getConfidentialReadiness()).ready, true);
  const n = state.calls.length;
  assert.equal((await readiness.getConfidentialReadiness()).ready, true);
  assert.equal(state.calls.length, n);
  assert.equal(state.dbCalls, 1);
  state.identity = false;
  assert.equal((await readiness.getConfidentialReadiness()).ready, false);
});
test("missing schema or KMS failure keeps collection blocked", async () => {
  for (const setup of ["schema", "kms"]) {
    const { mocks, state } = fixture();
    if (setup === "schema") state.schema = false;
    else state.error = "AccessDeniedException";
    const readiness = load("v2/lib/people/confidential-readiness.ts", mocks);
    assert.equal((await readiness.getConfidentialReadiness()).ready, false);
  }
});
test("disabled collection never probes KMS unless explicit server health probe", async () => {
  const { mocks, state } = fixture();
  mocks["./confidential-kms-config"] = {
    confidentialKmsConfig: () => ({ ...config, collectionMode: "disabled" }),
  };
  const readiness = load("v2/lib/people/confidential-readiness.ts", mocks);
  assert.equal(
    (await readiness.getConfidentialReadiness()).reason,
    "CONFIDENTIAL_COLLECTION_DISABLED",
  );
  assert.equal(state.calls.length, 0);
  const tested = await readiness.getConfidentialReadiness(true);
  assert.equal(tested.cryptoReady, true);
  assert.equal(tested.ready, false);
});
test("KMS module has no browser import, logger, static credential provider or database key lookup", () => {
  const source = fs.readFileSync(
    path.join(root, "v2/lib/people/confidential-kms.ts"),
    "utf8",
  );
  assert.ok(source.includes('import "server-only"'));
  assert.ok(
    !/console\.|vault\.|defaultProvider|process.env.AWS_SECRET/.test(source),
  );
  assert.ok(
    !fs
      .readFileSync(
        path.join(
          root,
          "supabase/migrations/20261004190000_people_external_kms_envelopes.sql",
        ),
        "utf8",
      )
      .includes("vault.decrypted_secrets"),
  );
});

function serviceFixture(allowed=true){
 const f=fixture();let payload=null;const captured=[];
 const server={rpc:async(name,args)=>{if(!allowed)return{error:{message:'PEOPLE_PERMISSION_DENIED'}};f.action=args.p_action;return{data:{record_id:context.record_id},error:null};}};
 f.mocks['@/lib/supabase/server']={createSupabaseServer:async()=>server};
 f.mocks['@/lib/security/status']={getSecurityStatus:async()=>({complete:true})};
 f.mocks['./confidential-readiness']={requireConfidentialReadiness:async()=>{}};
 const admin={rpc:async(name,args)=>{
  if(name==='tttracker_v2_confidential_redeem')return{data:{context,payload:f.action==='read'?payload:null},error:null};
  if(name==='tttracker_v2_confidential_commit_envelope'){captured.push(args);payload={ciphertext:args.p_ciphertext,nonce:args.p_nonce,tag:args.p_tag,encrypted_dek:args.p_encrypted_dek,kms_key_reference:args.p_kms_key_reference,environment:args.p_environment,crypto_format_version:args.p_crypto_format_version,provider:'internal',object_key:null};return{data:{record_id:context.record_id,revision:1,key_version:1},error:null};}
  if(name==='tttracker_v2_external_confidential_ticket'){if(!allowed)return{error:{message:'ONBOARDING_SESSION_INVALID'}};return{data:{},error:null};}
  if(name==='tttracker_v2_confidential_result'){captured.push({audit:args.p_outcome});return{data:null,error:null};}
  throw Error('Unexpected RPC');
 }};
 f.mocks['@/lib/supabase/admin']={createSupabaseAdmin:()=>admin};
 return{...f,service:load('v2/lib/people/confidential.ts',f.mocks),captured,owner:{organisationId:context.organisation_id,personId:context.person_id,fieldId:context.field_id,recordId:context.record_id}};
}
test('server value service persists only AES ciphertext/envelope and audits read result',async()=>{
 const f=serviceFixture();const secret='SYNTHETIC-SERVICE-SECRET';await f.service.writeConfidentialValue(f.owner,secret,'person_review');assert.ok(!JSON.stringify(f.captured).includes(secret));assert.ok(f.captured[0].p_encrypted_dek);assert.equal(f.captured[0].p_crypto_format_version,2);assert.equal(f.captured[0].p_kms_key_reference,arn);
 assert.equal(await f.service.readConfidentialValue(f.owner,'person_review'),secret);assert.ok(f.captured.some(r=>r.audit==='success'));
});
test('denied TTTracker capability and invalid external scope prevent all KMS calls',async()=>{
 const f=serviceFixture(false);await assert.rejects(f.service.writeConfidentialValue(f.owner,'SYNTHETIC','person_review'),/PEOPLE_PERMISSION_DENIED/);assert.equal(f.state.calls.length,0);
 await assert.rejects(f.service.writeExternalConfidentialValue('a'.repeat(43),randomUUID(),randomUUID(),'SYNTHETIC'),/ONBOARDING_SESSION_INVALID/);assert.equal(f.state.calls.length,0);
});
test('KMS outage creates no ciphertext commit and records failure metadata only',async()=>{
 const f=serviceFixture();f.state.error='KMSInternalException';await assert.rejects(f.service.writeConfidentialValue(f.owner,'SYNTHETIC','person_review'),/CONFIDENTIAL_KEY_SERVICE_UNAVAILABLE/);assert.equal(f.captured.filter(r=>r.p_ciphertext).length,0);assert.ok(f.captured.some(r=>r.audit==='failed'));
});
test('IAM templates are exact scoped and expose only implemented KMS operations',()=>{
 const read=name=>JSON.parse(fs.readFileSync(path.join(root,'v2/infrastructure/confidential-kms',name),'utf8'));
 const trust=read('iam-trust-policy.template.json').Statement[0];assert.equal(trust.Action,'sts:AssumeRoleWithWebIdentity');assert.ok(!JSON.stringify(trust).includes('*'));assert.ok(JSON.stringify(trust).includes('environment:${ENVIRONMENT}'));
 const role=read('iam-role-policy.template.json');assert.deepEqual(role.Statement.flatMap(s=>s.Action),['kms:GenerateDataKey','kms:Decrypt','kms:DescribeKey']);assert.ok(role.Statement.every(s=>s.Resource==='${KMS_KEY_ARN}'));
 const key=read('kms-key-policy.template.json');assert.ok(!JSON.stringify(key).includes('kms:*'));assert.ok(!JSON.stringify(key).includes('ScheduleKeyDeletion'));assert.ok(key.Statement.filter(s=>s.Principal.AWS==='${CRYPTO_ROLE_ARN}').every(s=>!JSON.stringify(s.Action).includes('PutKeyPolicy')));
});

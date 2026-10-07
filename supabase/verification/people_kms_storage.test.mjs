import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const dependency = createRequire(import.meta.url);
const { PGlite } = dependency(
  process.env.PGLITE_MODULE || "@electric-sql/pglite",
);
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (name) =>
  fs.readFileSync(path.join(root, "supabase/migrations", name), "utf8");
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const table = (sql, name) =>
  sql.match(
    new RegExp(
      `create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`,
    ),
  )[0];
const fn = (sql, name) =>
  sql.match(
    new RegExp(
      `create or replace function (?:private|public)\\.${name}\\([\\s\\S]*?\\$\\$;`,
    ),
  )[0];
let db, person, field, docField;
async function user(n = 2) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id(n),
  ]);
}
async function write(action, data = {}, target = null, org = id(10)) {
  return (
    await db.query(
      "select public.tttracker_v2_people_write($1,$2,$3,$4) result",
      [org, action, target, JSON.stringify(data)],
    )
  ).rows[0].result;
}
async function list(
  area = "people",
  personId = null,
  filter = {},
  org = id(10),
  query = "",
  page = 1,
) {
  return (
    await db.query(
      "select public.tttracker_v2_people_read($1,$2,$3,$4,$5,$6) result",
      [org, area, query, page, personId, JSON.stringify(filter)],
    )
  ).rows[0].result;
}
async function allow(n, capability, effect = "allow") {
  await db.query(
    "insert into v2_user_permission_overrides(organisation_id,user_id,permission_id,effect) select $1,$2,id,$3 from v2_permissions where permission_code=$4 on conflict(organisation_id,user_id,permission_id) do update set effect=excluded.effect",
    [id(10), id(n), effect, capability],
  );
}
before(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create schema private; create schema storage; create role anon; create role authenticated; create role service_role;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  insert into auth.users(id,email,email_confirmed_at) values('${id(1)}','operator@example.test',now()),('${id(2)}','member@example.test',now()),('${id(3)}','reviewer@example.test',now()),('${id(4)}','stranger@example.test',now());
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer,allowed_mime_types text[]);
  create table storage.objects(bucket_id text,name text);
  create function private.tttracker_v2_has_feature(uuid,text) returns boolean language sql as $$select true$$;`);
  const foundation = read("20260926120515_organisation_foundation_actual.sql"),
    rbac = read("20260927054309_access_permission_engine.sql"),
    platform = read("20260927055944_platform_admin_foundation.sql");
  for (const name of ["organisations", "organisation_users"])
    await db.exec(table(foundation, name));
  for (const name of [
    "v2_resources",
    "v2_permissions",
    "v2_roles",
    "v2_role_permissions",
    "v2_user_role_assignments",
    "v2_user_permission_overrides",
  ])
    await db.exec(table(rbac, name));
  for (const name of ["v2_platform_admins", "v2_organisation_invitations"])
    await db.exec(table(platform, name));
  await db.exec(
    read("20260927103336_invitation_delivery.sql").split("create table")[0],
  );
  await db.exec(
    table(
      read("20260928101620_tenant_setup_framework.sql"),
      "v2_organisation_setup_state",
    ),
  );
  await db.exec(
    table(read("20260929110945_operations_control_centre.sql"), "v2_people"),
  );
  await db.exec(
    "create table v2_projects(id uuid primary key,organisation_id uuid,name text,code text,status text); create table organisation_modules(organisation_id uuid,module_key text,enabled boolean);",
  );
  await db.exec(fn(foundation, "tttracker_v2_is_organisation_member"));
  await db.exec(fn(rbac, "tttracker_v2_has_permission"));
  await db.exec(
    fn(
      read("20261002051838_contractor_project_parties.sql"),
      "tttracker_v2_is_active_org_member",
    ),
  );
  await db.exec(
    "create function private.tttracker_v2_is_project_member(uuid) returns boolean language sql as $$select private.tttracker_v2_is_organisation_member((select organisation_id from public.v2_projects where id=$1))$$;",
  );
  await db.exec(`insert into organisations(id,code,name) values('${id(10)}','NEUTRAL','Neutral organisation'),('${id(11)}','OTHER','Other organisation');
  insert into organisation_users(organisation_id,user_id,status) values('${id(10)}','${id(2)}','active'),('${id(10)}','${id(3)}','active');
  insert into v2_projects values('${id(20)}','${id(10)}','Project One','P1','active'),('${id(21)}','${id(11)}','Project Two','P2','active');
  insert into organisation_modules values('${id(10)}','people',true),('${id(11)}','people',true);
  insert into v2_platform_admins(user_id) values('${id(1)}');
  insert into v2_resources(resource_key,name) values('people','People'),('training','Training');
  insert into v2_permissions(resource_id,permission_code,action_key,name) select r.id,r.resource_key||'.'||a,a,a from v2_resources r cross join unnest(array['view','create','edit','configure','approve']) a;
  insert into v2_permissions(resource_id,permission_code,action_key,name) select id,'organisation.users.configure','users','Manage users' from v2_resources where resource_key='people';`);
  await db.exec(
    read("20261004090000_organisation_invitation_provisioning.sql"),
  );
  await db.exec(read("20261004130000_people_foundation.sql"));
  await db.exec(read("20261004130000_people_foundation.sql")); // additive rerun
  for (const code of [
    "people.view",
    "people.create",
    "people.edit",
    "people.archive",
    "people.configure",
    "people.crews.view",
    "people.crews.manage",
    "people.site_prestarts.view",
    "people.site_prestarts.manage",
    "training.view",
    "training.create",
    "training.edit",
    "training.configure",
    "training.approve",
    "organisation.users.configure",
  ])
    await allow(2, code);
  await allow(3, "training.approve");
  await user();
  await db.exec(`create schema vault; create schema extensions;
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    insert into auth.sessions values('${id(90)}','${id(2)}',null);
    create table vault.secrets(id uuid primary key,secret text);
    -- Functional Vault mock ONLY. Hosted tests separately verify actual managed Vault encryption.
    create view vault.decrypted_secrets as select id,substring(secret from 6) decrypted_secret from vault.secrets;
    create function vault.create_secret(text,text default null,text default '',uuid default null) returns uuid language plpgsql as $$declare k uuid:=gen_random_uuid();begin insert into vault.secrets values(k,'mock:'||$1);return k;end$$;
    create function vault.update_secret(uuid,text,text,text,uuid) returns void language sql as $$select$$;
    create function vault._crypto_aead_det_decrypt(bytea,bytea,bigint,bytea,bytea) returns bytea language sql as $$select $1$$;
    create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(repeat('ab',$1),'hex')$$;`);
  await db.exec(read("20261004170000_people_confidential_security.sql"));
  await db.exec(read("20261004173000_people_confidential_vault_gate.sql"));
  await db.exec(read("20261004190000_people_external_kms_envelopes.sql"));
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ session_id: id(90) }),
  ]);
  for (const capability of [
    "people.confidential.view",
    "people.confidential.edit",
    "people.confidential.manage_keys",
    "people.onboarding.manage",
  ])
    await allow(2, capability);
  person = (await write("create_person", { display_name: "Synthetic person" }))
    .id;
  field = (
    await config("field", {
      semantic_type: "bank_account",
      classification: "confidential",
      label: "Synthetic account",
      kind: "value",
    })
  ).id;
  docField = (
    await config("field", {
      semantic_type: "confidential_document",
      classification: "confidential",
      label: "Synthetic document",
      kind: "document",
    })
  ).id;
  await config("rotate_kms_generation", {
    kms_key_reference: kmsArn,
    environment: "development",
  });
});
after(async () => db.close());

const kmsArn =
  "arn:aws:kms:ap-southeast-2:123456789012:key/00000000-0000-0000-0000-000000000001";
const hash = (n) => String(n).padStart(64, "a");
async function config(action, data = {}) {
  return (
    await db.query(
      "select tttracker_v2_secure_configuration($1,$2,$3) result",
      [id(10), action, JSON.stringify(data)],
    )
  ).rows[0].result;
}
async function ticket(
  n,
  action = "write",
  record = id(100),
  owner = person,
  fieldId = field,
  org = id(10),
  expected = null,
) {
  return (
    await db.query(
      "select tttracker_v2_confidential_ticket($1,$2,$3,$4,$5,null,$6,$7,$8) result",
      [org, action, hash(n), record, owner, fieldId, "person_review", expected],
    )
  ).rows[0].result;
}
async function redeem(n) {
  return (
    await db.query("select tttracker_v2_confidential_redeem($1) result", [
      hash(n),
    ])
  ).rows[0].result;
}
async function commit(n, object = null) {
  return (
    await db.query(
      "select tttracker_v2_confidential_commit_envelope($1,$2,$3,$4,$5,$6,$7,$8,$9) result",
      [
        hash(n),
        "AAAAAAAAAAAAAAAA",
        "AAAAAAAAAAAAAAAAAAAAAA==",
        object ? null : "c3ludGhldGlj",
        object,
        Buffer.alloc(64, 1).toString("base64"),
        kmsArn,
        "development",
        2,
      ],
    )
  ).rows[0].result;
}
async function instance(n, fieldId = field) {
  return (
    await config("instance", {
      field_ids: [fieldId],
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      token_hash: hash(n),
    })
  ).id;
}
async function exchange(n, s) {
  return (
    await db.query("select tttracker_v2_onboarding_exchange($1,$2) result", [
      hash(n),
      hash(s),
    ])
  ).rows[0].result;
}
async function external(s, i, f, r, n) {
  return db.query(
    "select tttracker_v2_external_confidential_ticket($1,$2,$3,$4,$5)",
    [hash(s), i, f, r, hash(n)],
  );
}

test("ciphertext-only versions and metadata-only audited writes", async () => {
  await ticket(1);
  const released = await redeem(1);
  assert.equal(released.context.organisation_id, id(10));
  assert.equal(released.context.key_version, 1);
  await commit(1);
  const row = (await db.query("select * from private.v2_confidential_versions"))
    .rows[0];
  assert.equal(row.ciphertext, "c3ludGhldGlj");
  assert.equal(row.created_by, id(2));
  const audit = (
    await db.query(
      "select * from private.v2_confidential_audit where record_id=$1",
      [id(100)],
    )
  ).rows;
  assert.deepEqual(
    audit.map((a) => a.action),
    ["CONFIDENTIAL_WRITE_STARTED", "CONFIDENTIAL_WRITE"],
  );
  assert.ok(!JSON.stringify(audit).includes(row.ciphertext));
});
test("read release audited and one-time", async () => {
  await ticket(2, "read");
  assert.equal((await redeem(2)).payload.ciphertext, "c3ludGhldGlj");
  await assert.rejects(redeem(2), /CONFIDENTIAL_ACCESS_DENIED/);
});
test("browser and service role cannot read Vault or confidential tables", async () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec("set role " + role);
    try {
      await assert.rejects(
        db.query("select * from vault.decrypted_secrets"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select * from private.v2_confidential_versions"),
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
  }
});
test("browser cannot redeem encryption key", async () => {
  await db.exec("set role authenticated");
  try {
    await assert.rejects(redeem(2), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
});
test("operational user and platform administrator cannot decrypt", async () => {
  for (const actor of [1, 3]) {
    await user(actor);
    await assert.rejects(ticket(3, "read"), /PEOPLE_PERMISSION_DENIED/);
  }
  await user();
});
test("explicit deny overrides grant and already-issued ticket is rechecked", async () => {
  await ticket(4, "read");
  await allow(2, "people.confidential.view", "deny");
  await assert.rejects(redeem(4), /PEOPLE_PERMISSION_DENIED/);
  await assert.rejects(ticket(5, "read"), /PEOPLE_PERMISSION_DENIED/);
  await allow(2, "people.confidential.view");
});
test("cross organisation owner and field rejected", async () => {
  await assert.rejects(
    ticket(6, "read", id(100), person, field, id(11)),
    /PEOPLE_PERMISSION_DENIED/,
  );
  await assert.rejects(
    ticket(7, "write", id(101), id(999)),
    /CONFIDENTIAL_ACCESS_DENIED/,
  );
  await assert.rejects(
    ticket(8, "write", id(101), person, id(999)),
    /CONFIDENTIAL_FIELD_INVALID/,
  );
});
test("unknown and missing key fail closed", async () => {
  await db.exec(
    `update private.v2_confidential_keys set is_active=false where organisation_id='${id(10)}'`,
  );
  await assert.rejects(ticket(9, "write"), /CONFIDENTIAL_KEY_UNAVAILABLE/);
  await db.exec(
    `update private.v2_confidential_keys set is_active=true where organisation_id='${id(10)}' and version=1`,
  );
});
test("key rotation retains old versions and new writes use next version", async () => {
  await config("rotate_kms_generation", {
    kms_key_reference: kmsArn,
    environment: "development",
  });
  await ticket(10, "read");
  assert.equal((await redeem(10)).context.key_version, 1);
  await ticket(11);
  assert.equal((await redeem(11)).context.key_version, 2);
  await commit(11);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from private.v2_confidential_versions",
      )
    ).rows[0].n,
    2,
  );
});
test("optimistic rotation cannot overwrite concurrent replacement", async () => {
  await assert.rejects(
    ticket(12, "write", id(100), person, field, id(10), 1),
    /CONFIDENTIAL_CONCURRENT_UPDATE/,
  );
});
test("concurrent writes only one commits; duplicate commit rejected", async () => {
  await ticket(13);
  await ticket(14);
  await redeem(13);
  await redeem(14);
  await commit(13);
  await assert.rejects(commit(14), /CONFIDENTIAL_CONCURRENT_UPDATE/);
  await assert.rejects(commit(13), /CONFIDENTIAL_ACCESS_DENIED/);
});
test("confidential document requires scoped private object and audits read", async () => {
  await ticket(15, "write", id(103), person, docField);
  await redeem(15);
  await assert.rejects(
    commit(15, "wrong/object"),
    /CONFIDENTIAL_PAYLOAD_INVALID/,
  );
  const object = `${id(10)}/${id(103)}/1/${hash(15)}.bin`;
  await db.query("insert into storage.objects values($1,$2)", [
    "v2-people-confidential",
    object,
  ]);
  await commit(15, object);
  await ticket(16, "read", id(103), person, docField);
  assert.equal((await redeem(16)).payload.object_key, object);
  assert.equal(
    (
      await db.query(
        "select public from storage.buckets where id='v2-people-confidential'",
      )
    ).rows[0].public,
    false,
  );
  assert.ok(
    (
      await db.query(
        "select 1 from private.v2_confidential_audit where action='CONFIDENTIAL_DOCUMENT_READ'",
      )
    ).rows.length,
  );
});
test("semantic classification cannot be lowered regardless of label", async () => {
  await assert.rejects(
    config("field", {
      semantic_type: "bank_account",
      classification: "operational",
      label: "My account",
      kind: "value",
    }),
    /CONFIDENTIAL_FIELD_INVALID/,
  );
});
test("one-time external token hashed at rest; no Person/User provisioning", async () => {
  const before = (await db.query("select count(*)::int n from v2_people"))
    .rows[0].n;
  const i = await instance(30);
  assert.equal((await exchange(30, 31)).instance_id, i);
  await assert.rejects(exchange(30, 32), /ONBOARDING_LINK_INVALID/);
  assert.equal(
    (await db.query("select count(*)::int n from v2_people")).rows[0].n,
    before,
  );
});
test("external session can only write its configured instance and fields", async () => {
  const a = await instance(40),
    b = await instance(41);
  await exchange(40, 42);
  await external(42, a, field, id(104), 43);
  await assert.rejects(
    external(42, b, field, id(105), 44),
    /ONBOARDING_SESSION_INVALID/,
  );
  await assert.rejects(
    external(42, a, docField, id(105), 45),
    /ONBOARDING_SESSION_INVALID/,
  );
  const r = await redeem(43);
  assert.equal(r.payload, null);
  assert.equal(r.context.instance_id, a);
  await commit(43);
  const audit = (
    await db.query(
      "select external_session_id,actor_id from private.v2_confidential_audit where record_id=$1",
      [id(104)],
    )
  ).rows;
  assert.ok(audit.every((a) => a.external_session_id && !a.actor_id));
});
test("revoked instance rejects live session and issued ticket", async () => {
  const i = await instance(50);
  await exchange(50, 51);
  await external(51, i, field, id(106), 52);
  await config("revoke", { instance_id: i });
  await assert.rejects(redeem(52), /ONBOARDING_SESSION_INVALID/);
  await assert.rejects(
    external(51, i, field, id(107), 53),
    /ONBOARDING_SESSION_INVALID/,
  );
});
test("expired and invalid tokens denied; expired session denied", async () => {
  const i = await instance(60);
  await db.query(
    "update private.v2_secure_tokens set expires_at=now()-interval '1 second' where instance_id=$1",
    [i],
  );
  await assert.rejects(exchange(60, 61), /ONBOARDING_LINK_INVALID/);
  await assert.rejects(exchange(999, 61), /ONBOARDING_LINK_INVALID/);
  const j = await instance(62);
  await exchange(62, 63);
  await db.query(
    "update private.v2_secure_sessions set expires_at=now()-interval '1 second' where instance_id=$1",
    [j],
  );
  await assert.rejects(
    external(63, j, field, id(108), 64),
    /ONBOARDING_SESSION_INVALID/,
  );
});
test("external exchange is server only and cannot enumerate people/settings", async () => {
  await db.exec("set role anon");
  try {
    await assert.rejects(exchange(60, 65), /permission denied/);
    await assert.rejects(
      db.query("select * from private.v2_secure_onboarding_instances"),
      /permission denied/,
    );
  } finally {
    await db.exec("reset role");
  }
});
test("KMS envelope release contains no key, and Vault cannot re-enter the trust chain", async () => {
  await ticket(68, "read");
  await db.exec("grant select on vault.decrypted_secrets to service_role");
  const released = await redeem(68);
  assert.equal(released.key_hex, undefined);
  assert.equal(released.context.kms_key_reference, kmsArn);
  assert.equal(released.payload.crypto_format_version, 2);
  assert.ok(released.payload.encrypted_dek);
  assert.equal(
    (await db.query("select count(*)::int n from vault.secrets")).rows[0].n,
    0,
  );
  await assert.rejects(
    config("rotate_key"),
    /CONFIDENTIAL_KEY_BOUNDARY_UNAVAILABLE/,
  );
  await db.exec("revoke select on vault.decrypted_secrets from service_role");
});
test("legacy commit and a plaintext-shaped envelope are rejected", async () => {
  await ticket(69);
  await redeem(69);
  await assert.rejects(
    db.query("select tttracker_v2_confidential_commit($1,$2,$3,$4,null)", [
      hash(69),
      "AAAAAAAAAAAAAAAA",
      "AAAAAAAAAAAAAAAAAAAAAA==",
      "c3ludGhldGlj",
    ]),
    /CONFIDENTIAL_ENVELOPE_REQUIRED/,
  );
  await assert.rejects(
    db.query(
      "select tttracker_v2_confidential_commit_envelope($1,$2,$3,$4,null,null,$5,$6,2)",
      [
        hash(69),
        "AAAAAAAAAAAAAAAA",
        "AAAAAAAAAAAAAAAAAAAAAA==",
        "c3ludGhldGlj",
        kmsArn,
        "development",
      ],
    ),
    /CONFIDENTIAL_ENVELOPE_REQUIRED/,
  );
});
test("schema readiness exposes only safe metadata and no browser key release", async () => {
  const r = (await db.query("select tttracker_v2_confidential_schema() result"))
    .rows[0].result;
  assert.equal(r.crypto_format_version, 2);
  assert.equal(r.legacy_versions, 0);
  assert.equal(r.browser_key_release, false);
});
test("revoked auth session denies key release", async () => {
  await ticket(70, "read");
  await db.query("delete from auth.sessions where id=$1", [id(90)]);
  await assert.rejects(redeem(70), /CONFIDENTIAL_ACCESS_DENIED/);
});

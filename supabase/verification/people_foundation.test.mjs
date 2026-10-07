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
let db, person, otherPerson, crew, trainingType, training, prestart;
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
});
after(async () => db.close());

test("create Person without auth account and read operational register", async () => {
  person = (
    await write("create_person", {
      display_name: "Person One",
      employee_number: "W001",
      work_email: "work@example.test",
      position: "Supervisor",
      employer: "Neutral employer",
    })
  ).id;
  const row = (await list()).rows[0];
  assert.equal(row.id, person);
  assert.equal(row.account_status, "No TTTracker account");
  assert.equal(row.position, "Supervisor");
  assert.equal(
    (await db.query("select auth_user_id from v2_people where id=$1", [person]))
      .rows[0].auth_user_id,
    null,
  );
});
test("unauthorised account and other organisation denied", async () => {
  await user(4);
  await assert.rejects(list(), /PEOPLE_PERMISSION_DENIED/);
  await user();
  await assert.rejects(
    list("people", null, {}, id(11)),
    /PEOPLE_PERMISSION_DENIED/,
  );
});
test("module disabled denies reads and mutation", async () => {
  await db.exec(
    "update organisation_modules set enabled=false where organisation_id='" +
      id(10) +
      "'",
  );
  await assert.rejects(list(), /PEOPLE_PERMISSION_DENIED/);
  await assert.rejects(
    write("create_person", { display_name: "Denied" }),
    /PEOPLE_PERMISSION_DENIED/,
  );
  await db.exec(
    "update organisation_modules set enabled=true where organisation_id='" +
      id(10) +
      "'",
  );
});
test("dynamic relationship types are organisation-scoped", async () => {
  const type = (await write("type", { name: "Configured engagement" })).id;
  await write(
    "update_person",
    {
      display_name: "Person One",
      employee_number: "W001",
      relationship_type_id: type,
      employer: "Neutral employer",
      position: "Supervisor",
    },
    person,
  );
  assert.equal(
    (await list("profile", person)).rows[0].type_name,
    "Configured engagement",
  );
});
test("duplicate identifiers rejected and matching work email warns without mutation", async () => {
  await assert.rejects(
    write("create_person", {
      display_name: "Another",
      employee_number: "w001",
    }),
    /PEOPLE_IDENTIFIER_EXISTS/,
  );
  const result = await write("create_person", {
    display_name: "Different person",
    work_email: "work@example.test",
  });
  assert.equal(result.warning, "PEOPLE_POSSIBLE_DUPLICATE");
  assert.equal((await list()).total, 1);
});
test("inactivation and archive retain person history", async () => {
  await write("status_person", { status: "inactive" }, person);
  assert.equal(
    (await list("profile", person)).rows[0].employment_status,
    "inactive",
  );
  await write("status_person", { status: "archived" }, person);
  assert.equal(
    (await list("profile", person)).rows[0].employment_status,
    "archived",
  );
  await write("status_person", { status: "active" }, person);
});
test("optional user link checks active tenant membership and grants no project access", async () => {
  await assert.rejects(
    write("link_user", { user_id: id(4) }, person),
    /PEOPLE_RELATIONSHIP_INVALID/,
  );
  await write("link_user", { user_id: id(2) }, person);
  assert.equal(
    (await list("profile", person)).rows[0].account_status,
    "Active user",
  );
  await write("link_user", { user_id: "" }, person);
  assert.equal(
    (await list("profile", person)).rows[0].account_status,
    "No TTTracker account",
  );
});
test("create crew and assign/remove person preserving membership history", async () => {
  crew = (await write("crew", { name: "Crew One", leader_person_id: person }))
    .id;
  await write("crew_member", { person_id: person }, crew);
  assert.equal((await list("crews")).rows[0].member_count, 1);
  await write("crew_member", { person_id: person, remove: true }, crew);
  assert.equal((await list("crews")).rows[0].member_count, 0);
  assert.ok(
    (
      await db.query("select left_at from v2_crew_members where crew_id=$1", [
        crew,
      ])
    ).rows[0].left_at,
  );
});
test("crew association and person assignment do not create login role assignments", async () => {
  await write("person_project", { person_id: person, project_id: id(20) });
  await write("crew_project", { project_id: id(20) }, crew);
  assert.equal((await list("projects", person)).total, 1);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from v2_user_role_assignments where user_id=$1",
        [id(2)],
      )
    ).rows[0].n,
    0,
  );
});
test("cross-tenant crew/person/project relationships rejected", async () => {
  otherPerson = (
    await db.query(
      "insert into v2_people(organisation_id,display_name) values($1,$2) returning id",
      [id(11), "Other person"],
    )
  ).rows[0].id;
  await assert.rejects(
    write("crew_member", { person_id: otherPerson }, crew),
    /PEOPLE_RECORD_NOT_FOUND/,
  );
  await assert.rejects(
    write("person_project", { person_id: person, project_id: id(21) }),
    /PEOPLE_RELATIONSHIP_INVALID/,
  );
  await assert.rejects(
    write("crew", { name: "Bad leader", leader_person_id: otherPerson }),
    /PEOPLE_RELATIONSHIP_INVALID/,
  );
});
test("training expiry consumes configured rule", async () => {
  trainingType = (
    await write("training_type", {
      name: "Qualification One",
      validity_mode: "automatic",
      validity_months: 12,
      document_requirement: "none",
    })
  ).id;
  training = (
    await write("training", {
      person_id: person,
      training_type_id: trainingType,
      issue_date: "2026-01-15",
    })
  ).id;
  const row = (await list("training", person)).rows[0];
  assert.equal(row.expiry_date, "2027-01-15");
  assert.equal(row.review_status, "pending_review");
});
test("training reviewer sees submission without unrelated People private access", async () => {
  await user(3);
  const result = await list("review");
  assert.equal(result.rows[0].person_id, person);
  await assert.rejects(list("people"), /PEOPLE_PERMISSION_DENIED/);
  await assert.rejects(
    db.query("select tttracker_v2_people_classified($1,$2,'private')", [
      id(10),
      person,
    ]),
    /PEOPLE_PERMISSION_DENIED/,
  );
  await user();
});
test("approve records authenticated reviewer and immutable audit", async () => {
  await user(3);
  await write("review_training", { outcome: "approved" }, training);
  const row = (await list("training", person)).rows[0];
  assert.equal(row.review_status, "approved");
  assert.equal(row.reviewed_by, id(3));
  await assert.rejects(
    write(
      "review_training",
      { outcome: "rejected", comment: "late" },
      training,
    ),
    /TRAINING_INVALID_TRANSITION/,
  );
  await user();
});
test("reject requires reason; changes required can be resubmitted", async () => {
  const a = (
    await write("training", {
      person_id: person,
      training_type_id: trainingType,
      issue_date: "2026-02-15",
    })
  ).id;
  await assert.rejects(
    write("review_training", { outcome: "rejected" }, a),
    /TRAINING_REVIEW_COMMENT_REQUIRED/,
  );
  await write(
    "review_training",
    { outcome: "changes_required", comment: "Correct evidence" },
    a,
  );
  await write("resubmit_training", {}, a);
  await write(
    "review_training",
    { outcome: "rejected", comment: "Invalid evidence" },
    a,
  );
  assert.equal(
    (
      await db.query(
        "select review_status from v2_training_records where id=$1",
        [a],
      )
    ).rows[0].review_status,
    "rejected",
  );
});
test("linked qualifications share evidence but keep independent configured expiry", async () => {
  const linked = (
    await write("training_type", {
      name: "Qualification Two",
      validity_mode: "automatic",
      validity_months: 6,
      document_requirement: "none",
    })
  ).id;
  await write("linked_type", { linked_type_id: linked }, trainingType);
  const result = await write("training", {
    person_id: person,
    training_type_id: trainingType,
    issue_date: "2026-03-15",
  });
  const records = (
    await db.query(
      "select expiry_date::text from v2_training_records where evidence_group_id=$1 order by expiry_date",
      [result.evidence_group_id],
    )
  ).rows;
  assert.deepEqual(
    records.map((r) => r.expiry_date),
    ["2026-09-15", "2027-03-15"],
  );
});
test("front/back evidence is required for approval; document ownership checked", async () => {
  const type = (
    await write("training_type", {
      name: "Two sided licence",
      validity_mode: "never",
      document_requirement: "front_back",
    })
  ).id;
  const record = (
    await write("training", {
      person_id: person,
      training_type_id: type,
      issue_date: "2026-03-15",
    })
  ).id;
  await assert.rejects(
    write("review_training", { outcome: "approved" }, record),
    /TRAINING_DOCUMENTS_REQUIRED/,
  );
  for (const side of ["front", "back"]) {
    const key = `${id(10)}/${person}/${side}`;
    await db.query(
      "insert into storage.objects values('v2-people-evidence',$1)",
      [key],
    );
    await write("document", {
      person_id: person,
      record_id: record,
      name: `${side}.pdf`,
      side,
      storage_key: key,
      content_type: "application/pdf",
      size_bytes: 100,
    });
  }
  await write("review_training", { outcome: "approved" }, record);
  const docs = await list("documents", person);
  assert.equal(docs.total, 2);
  assert.ok(!JSON.stringify(docs).includes("storage_key"));
});
test("late paired qualification validation failure rolls back entire submission", async () => {
  const linked = (
    await write("training_type", {
      name: "Certificate required",
      validity_mode: "never",
      requires_certificate_number: true,
      document_requirement: "none",
    })
  ).id;
  await write("linked_type", { linked_type_id: linked }, trainingType);
  const count = (
    await db.query("select count(*)::int n from v2_training_records")
  ).rows[0].n;
  await assert.rejects(
    write("training", {
      person_id: person,
      training_type_id: trainingType,
      issue_date: "2026-03-15",
    }),
    /TRAINING_CERTIFICATE_REQUIRED/,
  );
  assert.equal(
    (await db.query("select count(*)::int n from v2_training_records")).rows[0]
      .n,
    count,
  );
});
test("canonical Site Prestart register supports person/project/date filters", async () => {
  prestart = (
    await write("prestart", {
      project_id: id(20),
      date: "2026-10-04",
      location: "Neutral site",
      discussion: "Site discussion",
    })
  ).id;
  await write("prestart_attendee", { person_id: person }, prestart);
  assert.equal(
    (
      await list("prestarts", person, {
        date: "2026-10-04",
        project_id: id(20),
      })
    ).total,
    1,
  );
  assert.equal(
    (await list("prestarts", person, { date: "2026-10-03" })).total,
    0,
  );
  await write("complete_prestart", {}, prestart);
  assert.equal((await list("prestarts")).rows[0].status, "completed");
  await assert.rejects(
    write("prestart_attendee", { person_id: person }, prestart),
    /PRESTART_NOT_EDITABLE/,
  );
});
test("cross-organisation Site Prestart creation rejected", async () => {
  await assert.rejects(
    write("prestart", {
      project_id: id(21),
      date: "2026-10-04",
      location: "Other site",
    }),
    /PEOPLE_RELATIONSHIP_INVALID/,
  );
});
test("operational projection excludes private legacy and arbitrary metadata", async () => {
  await db.query(
    "update v2_people set email='private@example.test',phone='PRIVATE_PHONE',metadata=$1 where id=$2",
    [JSON.stringify({ secret: "CONFIDENTIAL_VALUE" }), person],
  );
  const result = JSON.stringify(await list());
  assert.ok(!result.includes("private@example.test"));
  assert.ok(!result.includes("PRIVATE_PHONE"));
  assert.ok(!result.includes("CONFIDENTIAL_VALUE"));
});
test("private and confidential grants are separate from standard administrator defaults", async () => {
  const grants = (
    await db.query(
      "select p.permission_code from v2_role_permissions r join v2_permissions p on p.id=r.permission_id where p.permission_code like 'people.private.%' or p.permission_code like 'people.confidential.%'",
    )
  ).rows;
  assert.equal(grants.length, 0);
  await assert.rejects(
    db.query("select tttracker_v2_people_classified($1,$2,'confidential')", [
      id(10),
      person,
    ]),
    /PEOPLE_PERMISSION_DENIED/,
  );
});
test("private endpoint requires private permission and audits without values", async () => {
  await allow(2, "people.private.view");
  await allow(2, "people.private.edit");
  await db.query("select tttracker_v2_people_classified($1,$2,'private',$3)", [
    id(10),
    person,
    JSON.stringify({ personal_phone: "PRIVATE_TEST_PHONE" }),
  ]);
  const result = (
    await db.query(
      "select tttracker_v2_people_classified($1,$2,'private') result",
      [id(10), person],
    )
  ).rows[0].result;
  assert.equal(result.personal_phone, "PRIVATE_TEST_PHONE");
  const audit = (
    await db.query(
      "select context from v2_people_audit where data_area='private'",
    )
  ).rows;
  assert.ok(!JSON.stringify(audit).includes("PRIVATE_TEST_PHONE"));
  await assert.rejects(
    db.query("select tttracker_v2_people_classified($1,$2,'private')", [
      id(10),
      otherPerson,
    ]),
    /PEOPLE_RECORD_NOT_FOUND/,
  );
});
test("confidential area requires separate grant; no financial data collected", async () => {
  await allow(2, "people.confidential.view");
  const result = (
    await db.query(
      "select tttracker_v2_people_classified($1,$2,'confidential') result",
      [id(10), person],
    )
  ).rows[0].result;
  assert.equal(result.available, false);
});
test("future tenant role bootstrap never grants sensitive capabilities", async () => {
  await db.exec(
    `insert into organisations(id,code,name) values('${id(800)}','FUTURE','Future organisation');`,
  );
  await db.query("select tttracker_v2_platform_invitation($1,'bootstrap',$2)", [
    id(1),
    id(800),
  ]);
  const count = (
    await db.query(
      "select count(*)::int n from v2_role_permissions rp join v2_permissions p on p.id=rp.permission_id where rp.organisation_id=$1 and (p.permission_code like 'people.private.%' or p.permission_code like 'people.confidential.%')",
      [id(800)],
    )
  ).rows[0].n;
  assert.equal(count, 0);
});
test("People direct tables are not available to authenticated or anonymous callers", async () => {
  for (const table of [
    "v2_people",
    "v2_person_private",
    "v2_people_documents",
    "v2_training_records",
  ]) {
    assert.equal(
      (
        await db.query(
          "select has_table_privilege('authenticated',$1,'SELECT') allowed",
          [table],
        )
      ).rows[0].allowed,
      false,
    );
    assert.equal(
      (
        await db.query(
          "select has_table_privilege('anon',$1,'SELECT') allowed",
          [table],
        )
      ).rows[0].allowed,
      false,
    );
  }
});
test("search and pagination do not load the whole organisation", async () => {
  await db.exec(
    `insert into v2_people(organisation_id,display_name) select '${id(10)}','Paged person '||n from generate_series(1,45)n;`,
  );
  const result = await list("people", null, {}, id(10), "Paged person", 2);
  assert.equal(result.total, 45);
  assert.equal(result.rows.length, 20);
});

test("pending training details can change; approved records remain immutable", async () => {
  await user();
  const type = (
    await write("training_type", {
      name: "Editable training",
      validity_mode: "automatic",
      validity_months: 1,
      document_requirement: "none",
    })
  ).id;
  const record = (
    await write("training", {
      person_id: person,
      training_type_id: type,
      issue_date: "2026-01-15",
    })
  ).id;
  await write("update_training", { issue_date: "2026-01-31" }, record);
  assert.equal(
    (
      await db.query(
        "select expiry_date::text from v2_training_records where id=$1",
        [record],
      )
    ).rows[0].expiry_date,
    "2026-02-28",
  );
  await write("review_training", { outcome: "approved" }, record);
  await assert.rejects(
    write("update_training", { issue_date: "2026-02-15" }, record),
    /TRAINING_INVALID_TRANSITION/,
  );
});
test("renewal approval supersedes old validity while preserving original record and evidence", async () => {
  const type = (
    await write("training_type", {
      name: "Renewal",
      validity_mode: "automatic",
      validity_months: 12,
      document_requirement: "none",
    })
  ).id;
  const first = (
    await write("training", {
      person_id: person,
      training_type_id: type,
      issue_date: "2025-01-01",
    })
  ).id;
  await write("review_training", { outcome: "approved" }, first);
  const second = (
    await write("training", {
      person_id: person,
      training_type_id: type,
      issue_date: "2026-01-01",
    })
  ).id;
  await write("review_training", { outcome: "approved" }, second);
  const records = (
    await db.query(
      "select is_current,superseded_at from v2_training_records where id=$1",
      [first],
    )
  ).rows;
  assert.equal(records[0].is_current, false);
  assert.ok(records[0].superseded_at);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from v2_training_records where training_type_id=$1 and is_current",
        [type],
      )
    ).rows[0].n,
    1,
  );
});
test("standard organisation Administrator has no implicit confidential access", async () => {
  const role = (
    await db.query(
      "select id from v2_roles where organisation_id=$1 and code='admin'",
      [id(10)],
    )
  ).rows[0].id;
  await db.query(
    "insert into v2_user_role_assignments(organisation_id,user_id,role_id,status) values($1,$2,$3,'active')",
    [id(10), id(3), role],
  );
  await user(3);
  await assert.rejects(
    db.query("select tttracker_v2_people_classified($1,$2,'confidential')", [
      id(10),
      person,
    ]),
    /PEOPLE_PERMISSION_DENIED/,
  );
  await user();
});
test("scoped person choices let crew manager operate without granting full People register", async () => {
  await allow(3, "people.view", "deny");
  await allow(3, "people.crews.manage");
  await user(3);
  assert.ok((await list("people_choices")).rows.length);
  await assert.rejects(list(), /PEOPLE_PERMISSION_DENIED/);
  await user();
});
test("training documents reject missing storage object and cross-person relationship", async () => {
  const type = (
    await write("training_type", {
      name: "Evidence ownership",
      validity_mode: "never",
      document_requirement: "single",
    })
  ).id;
  const record = (
    await write("training", {
      person_id: person,
      training_type_id: type,
      issue_date: "2026-01-01",
    })
  ).id;
  await assert.rejects(
    write("document", {
      person_id: person,
      record_id: record,
      name: "absent.pdf",
      side: "single",
      storage_key: `${id(10)}/${person}/absent`,
      content_type: "application/pdf",
      size_bytes: 100,
    }),
    /TRAINING_DOCUMENT_NOT_FOUND/,
  );
  await assert.rejects(
    write("document", {
      person_id: otherPerson,
      record_id: record,
      name: "other.pdf",
      side: "single",
      storage_key: "other",
      content_type: "application/pdf",
      size_bytes: 100,
    }),
    /PEOPLE_RECORD_NOT_FOUND/,
  );
});
test("Site Prestart attendees are paginated canonical Person records", async () => {
  const result = await list("prestart_attendees", null, { id: prestart });
  assert.equal(result.total, 1);
  assert.equal(result.rows[0].id, person);
});
test("Person plus existing user link is atomic and does not provision roles", async () => {
  const result = await write("create_person", {
    display_name: "Linked person",
    user_id: id(2),
  });
  assert.equal(
    (await list("profile", result.id)).rows[0].account_status,
    "Active user",
  );
  const before = (await list()).total;
  await assert.rejects(
    write("create_person", {
      display_name: "Invalid account link",
      user_id: id(4),
    }),
    /PEOPLE_RELATIONSHIP_INVALID/,
  );
  assert.equal((await list()).total, before);
});

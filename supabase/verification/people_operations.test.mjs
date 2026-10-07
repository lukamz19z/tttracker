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
  await db.exec(read("20261005090000_people_operational_workflows.sql"));
  await db.exec('create table v2_daily_dockets(id uuid primary key default gen_random_uuid(),organisation_id uuid,project_id uuid,docket_date date,crew_label text)');
  await db.exec(read('20261005110000_people_daily_docket_crew_reference.sql'));
  await user();
});


after(async () => db.close());
test("crew allocation retains separate effective periods on return",async()=>{
 person=(await write('create_person',{display_name:'Worker'})).id;
 crew=(await write('crew',{name:'Crew One'})).id;
 await write('crew_member',{person_id:person,effective_at:'2026-09-01T00:00:00Z'},crew);
 await write('crew_member',{person_id:person,remove:true,effective_at:'2026-09-30T00:00:00Z'},crew);
 await write('crew_member',{person_id:person,effective_at:'2026-10-01T00:00:00Z'},crew);
 const history=await list('crew_history',null,{crew_id:crew});assert.equal(history.total,2);
 assert.ok(history.rows.some(r=>r.left_at));assert.ok(history.rows.some(r=>!r.left_at));
});
test("dynamic direct confirmation requires evidence and independent configured policy",async()=>{
 trainingType=(await write('training_type',{name:'Configured ticket',validity_mode:'never',document_requirement:'none',review_policy:'none'})).id;
 training=(await write('training',{person_id:person,training_type_id:trainingType,issue_date:'2026-09-01'})).id;
 await write('finalize_training',{},training);
 assert.equal((await list('training')).rows[0].review_status,'approved');
 assert.equal((await db.query("select count(*)::int n from v2_people_audit where action='training_direct_confirm'")).rows[0].n,1);
});
test("project matrix distinguishes required missing from optional not required",async()=>{
 await allow(2,'training.requirements.manage');
 const missing=(await write('training_type',{name:'Missing requirement',validity_mode:'never',document_requirement:'none'})).id;
 await write('person_project',{person_id:person,project_id:id(20)});
 await write('requirement',{project_id:id(20),training_type_id:missing,applies_to:'everyone'});
 const matrix=await list('matrix',null,{project_id:id(20)});
 assert.equal(matrix.rows[0].cells.find(c=>c.type_id===missing).state,'missing');
 assert.equal(matrix.rows[0].cells.find(c=>c.type_id===trainingType).state,'current');
 assert.equal((await list('requirements')).rows[0].people[0].state,'missing');
 await assert.rejects(list('matrix',null,{project_id:id(21)}),/PEOPLE_RELATIONSHIP_INVALID/);
});
test("private domains do not grant broader private or confidential access",async()=>{
 await allow(3,'people.private.safety_claims.view');await user(3);
 assert.deepEqual((await db.query('select tttracker_v2_people_private_domain($1,$2,$3) result',[id(10),person,'safety_claims'])).rows[0].result,{});
 await assert.rejects(db.query('select tttracker_v2_people_private_domain($1,$2,$3) result',[id(10),person,'employment']),/PEOPLE_PERMISSION_DENIED/);
 await user();
});

test('trusted policy uses capability and explicit deny precedence, never source label alone',async()=>{
 const type=(await write('training_type',{name:'Trusted upload type',validity_mode:'never',document_requirement:'none',review_policy:'trusted'})).id;
 const first=(await write('training',{person_id:person,training_type_id:type,issue_date:'2026-09-01'})).id;
 await write('finalize_training',{source_channel:'internal'},first);
 assert.equal((await list('training',person,{id:first})).rows[0].review_status,'pending_review');
 await allow(2,'training.confirm_without_review');
 const second=(await write('training',{person_id:person,training_type_id:type,issue_date:'2026-09-01'})).id;
 await write('finalize_training',{},second);
 assert.equal((await list('training',person,{id:second})).rows[0].review_status,'approved');
 await allow(2,'training.confirm_without_review','deny');
 const third=(await write('training',{person_id:person,training_type_id:type,issue_date:'2026-09-01'})).id;await write('finalize_training',{},third);
 assert.equal((await list('training',person,{id:third})).rows[0].review_status,'pending_review');
});
test('required policy stays pending despite trusted capability and mobile source cannot claim bypass',async()=>{
 await allow(2,'training.confirm_without_review');
 const type=(await write('training_type',{name:'Always reviewed',validity_mode:'never',document_requirement:'none',review_policy:'required'})).id;
 const rec=(await write('training',{person_id:person,training_type_id:type,issue_date:'2026-09-01'})).id;await write('finalize_training',{},rec);
 assert.equal((await list('training',person,{id:rec})).rows[0].review_status,'pending_review');
 const type2=(await write('training_type',{name:'Trusted mobile policy',validity_mode:'never',document_requirement:'none',review_policy:'trusted'})).id;
 const mobile=(await write('training',{person_id:person,training_type_id:type2,issue_date:'2026-09-01'})).id;await write('finalize_training',{source_channel:'mobile'},mobile);
 assert.equal((await list('training',person,{id:mobile})).rows[0].review_status,'pending_review');
});
test('organisation defaults apply only to inherited policy',async()=>{
 await write('review_rules',{internal:'none',mobile:'required'});
 const t=(await write('training_type',{name:'Inherited source policy',validity_mode:'never',document_requirement:'none',review_policy:'inherit'})).id;
 const r=(await write('training',{person_id:person,training_type_id:t,issue_date:'2026-09-01'})).id;await write('finalize_training',{},r);
 assert.equal((await list('training',person,{id:r})).rows[0].review_status,'approved');
 const strict=(await write('training_type',{name:'Strict overrides default',validity_mode:'never',document_requirement:'none',review_policy:'required'})).id;
 const rr=(await write('training',{person_id:person,training_type_id:strict,issue_date:'2026-09-01'})).id;await write('finalize_training',{},rr);
 assert.equal((await list('training',person,{id:rr})).rows[0].review_status,'pending_review');
});
test('linked qualifications share evidence only when selected and retain independent expiry',async()=>{
 const a=(await write('training_type',{name:'Primary qualification',validity_mode:'automatic',validity_months:36,document_requirement:'none',review_policy:'none'})).id;
 const b=(await write('training_type',{name:'Linked qualification',validity_mode:'automatic',validity_months:12,document_requirement:'none',review_policy:'none'})).id;
 await write('linked_type',{linked_type_id:b},a);
 const single=await write('training',{person_id:person,training_type_id:a,issue_date:'2026-01-01'});
 assert.equal((await db.query('select count(*)::int n from v2_training_records where evidence_group_id=$1',[single.evidence_group_id])).rows[0].n,1);
 const pair=await write('training',{person_id:person,training_type_id:a,issue_date:'2026-01-01',linked_type_ids:[b]});await write('finalize_training',{},pair.id);
 const rows=(await db.query('select expiry_date,review_status from v2_training_records where evidence_group_id=$1 order by expiry_date',[pair.evidence_group_id])).rows;
 assert.equal(rows.length,2);assert.equal(rows[0].expiry_date.toISOString().slice(0,10),'2027-01-01');assert.equal(rows[1].expiry_date.toISOString().slice(0,10),'2029-01-01');assert.ok(rows.every(r=>r.review_status==='approved'));
});
test('missing required evidence blocks group direct confirmation atomically',async()=>{
 const t=(await write('training_type',{name:'Front back licence',validity_mode:'never',document_requirement:'front_back',review_policy:'none'})).id;
 const r=(await write('training',{person_id:person,training_type_id:t,issue_date:'2026-01-01'})).id;
 await assert.rejects(write('finalize_training',{},r),/TRAINING_DOCUMENTS_REQUIRED/);
 assert.equal((await list('training',person,{id:r})).rows[0].review_status,'pending_review');
});
test('validity and review are separate; pending evidence never compliant',async()=>{
 const t=(await write('training_type',{name:'Expired pending',validity_mode:'manual',document_requirement:'none',review_policy:'required'})).id;
 const r=(await write('training',{person_id:person,training_type_id:t,issue_date:'2020-01-01',expiry_date:'2021-01-01'})).id;
 const row=(await list('training',person,{id:r})).rows[0];assert.equal(row.validity_status,'expired');assert.equal(row.review_status,'pending_review');
 const matrix=await list('matrix',person);assert.equal(matrix.rows[0].cells.find(c=>c.type_id===t).state,'pending_review');
 await write('review_training',{outcome:'rejected',comment:'Synthetic reason'},r);assert.equal((await list('review',person,{review_status:'rejected'})).rows[0].review_status,'rejected');
});
test('document configuration is tenant scoped and rejects path traversal and unsupported tokens',async()=>{
 const rule=await write('document_rule',{name:'Training root',category:'training',provider:'sharepoint',folder_template:'People/{person_id}',filename_template:'{training_type}_{year}',is_active:true});
 assert.equal((await list('document_rules')).rows[0].provider,'sharepoint');
 await assert.rejects(write('document_rule',{name:'Bad',folder_template:'../escape',filename_template:'safe'}),/PEOPLE_INVALID_PATH/);
 await assert.rejects(write('document_rule',{name:'Bad token',folder_template:'{database_expression}',filename_template:'safe'}),/PEOPLE_INVALID_PATH/);
 await assert.rejects(write('document_rule',{name:'Wrong tenant',folder_template:'safe',filename_template:'safe'},rule.id,id(11)),/PEOPLE_PERMISSION_DENIED/);
});
test('private domain deny and cross-tenant ownership prevent reads/writes',async()=>{
 await allow(2,'people.private.emergency_contact.view');await allow(2,'people.private.emergency_contact.edit');
 await db.query('select tttracker_v2_people_private_domain($1,$2,$3,$4)',[id(10),person,'emergency_contact',JSON.stringify({name:'Synthetic Contact',phone:'000'})]);
 await allow(2,'people.private.emergency_contact.view','deny');await assert.rejects(db.query('select tttracker_v2_people_private_domain($1,$2,$3)',[id(10),person,'emergency_contact']),/PEOPLE_PERMISSION_DENIED/);
 await assert.rejects(db.query('select tttracker_v2_people_private_domain($1,$2,$3,$4)',[id(10),person,'emergency_contact',JSON.stringify({bank_account:'synthetic'})]),/PEOPLE_INVALID_FIELDS/);
});
test('canonical crew project allocation and docket snapshot retain historic people',async()=>{
 await write('crew_project',{project_id:id(20),effective_at:'2026-09-01T00:00:00Z'},crew);
 const allocation=await list('crew_allocation',null,{project_id:id(20),id:crew,date:'2026-09-15'});assert.equal(allocation.rows[0].id,person);
 const docket=(await db.query('insert into v2_daily_dockets(organisation_id,project_id,docket_date,crew_id) values($1,$2,$3,$4) returning id,crew_snapshot',[id(10),id(20),'2026-09-15',crew])).rows[0];
 await write('crew_member',{person_id:person,remove:true,effective_at:'2026-10-05T00:00:00Z'},crew);
 assert.deepEqual((await db.query('select crew_snapshot from v2_daily_dockets where id=$1',[docket.id])).rows[0].crew_snapshot,docket.crew_snapshot);
 await db.query("update v2_daily_dockets set crew_snapshot='{}' where id=$1",[docket.id]);
 assert.deepEqual((await db.query('select crew_snapshot from v2_daily_dockets where id=$1',[docket.id])).rows[0].crew_snapshot,docket.crew_snapshot);
 await assert.rejects(db.query('insert into v2_daily_dockets(organisation_id,project_id,docket_date,crew_id) values($1,$2,$3,$4)',[id(10),id(21),'2026-09-15',crew]),/PEOPLE_RELATIONSHIP_INVALID/);
});
test('platform authority alone does not grant operational or private people access',async()=>{await user(1);await assert.rejects(list('training'),/PEOPLE_PERMISSION_DENIED/);await assert.rejects(list('document_rules'),/PEOPLE_PERMISSION_DENIED/);await user();});

test("Training category/class catalogue is scoped, searchable and audited",async()=>{
 await db.exec(read("20261005160000_people_training_catalogue.sql"));await db.exec(read("20261005170000_people_training_review_history.sql"));await db.exec(read("20261005190000_people_catalogue_display_summary.sql"));await user();
 const category=(await write('training_category',{name:'Configured licence group',sort_order:2})).id;
 const option=(await write('training_option',{name:'Configured class',category_id:category,sort_order:1})).id;
 const type=(await write('training_type',{name:'Classed record',category_id:category,option_ids:[option],requires_issue_date:false,validity_mode:'never',document_requirement:'none'})).id;
 assert.equal((await list('training_types',null,{id:type})).rows[0].category_id,category);
 assert.deepEqual((await list('training_types',null,{id:type})).rows[0].option_ids,[option]);
 assert.equal((await list('training_types',null,{id:type})).rows[0].option_names,'Configured class');
 const summary=(await list('training_categories')).rows.find(c=>c.id===category);assert.equal(summary.training_type_count,1);assert.equal(summary.option_count,1);
 const record=(await write('training',{person_id:person,training_type_id:type,option_id:option})).id;
 const filtered=await list('training',null,{category_id:category,option_id:option});assert.equal(filtered.total,1);assert.equal(filtered.rows[0].option_name,'Configured class');
 const crews=await list('crews');assert.ok(crews.rows.find(r=>r.id===crew)?.projects?.includes('Project One'));
 const crewHistory=await list('crew_history',null,{crew_id:crew});assert.ok(Array.isArray(crewHistory.events));assert.ok(crewHistory.events.every(e=>e.created_at&&e.actor_id));
 assert.equal((await list('training_options',null,{category_id:category,id:option})).rows[0].id,option);
 await assert.rejects(write('training_option',{name:'Bad',category_id:id(21)}),/PEOPLE_RELATIONSHIP_INVALID/);
 await db.query('insert into v2_training_categories(id,organisation_id,name) values($1,$2,$3)',[id(950),id(11),'Other tenant category']);
 await assert.rejects(write('training_option',{name:'Cross tenant',category_id:id(950)}),/PEOPLE_RELATIONSHIP_INVALID/);
 const otherCategory=(await write('training_category',{name:'Other class grouping'})).id;
 await assert.rejects(write('training_type',{name:'Mismatched class',category_id:otherCategory,option_ids:[option],validity_mode:'never',document_requirement:'none'}),/PEOPLE_RELATIONSHIP_INVALID/);
 await assert.rejects(write('document_rule',{name:'Bad category mapping',category:'training',training_category_id:id(950),folder_template:'People',filename_template:'{training_option}'}),/PEOPLE_RELATIONSHIP_INVALID/);
 const rule=(await write('document_rule',{name:'Class mapping',category:'training',training_category_id:category,folder_template:'People/{category}',filename_template:'{training_option}_{document_type}'})).id;
 assert.equal((await list('document_rules')).rows.find(r=>r.id===rule).training_category_id,category);
 await assert.rejects(write('training_category',{name:'Configured licence group'}),/PEOPLE_CONFIGURATION_DUPLICATE/);
 for(let n=0;n<23;n++)await write('training_category',{name:`Paged grouping ${n}`,sort_order:100+n});
 assert.equal((await list('training_categories',null,{},id(10),'Paged grouping',2)).rows.length,3);
 assert.equal((await db.query("select has_table_privilege('authenticated','public.v2_training_options','SELECT') allowed")).rows[0].allowed,false);
 await write('training_option',{name:'Configured class',category_id:category,is_active:false},option);
 await assert.rejects(write('training',{person_id:person,training_type_id:type,option_id:option}),/PEOPLE_RELATIONSHIP_INVALID/);
 const audit=(await db.query('select tttracker_v2_training_history($1,$2,1) result',[id(10),record])).rows[0].result;assert.ok(audit.rows.length>0);assert.ok(audit.rows.every(row=>row.occurred_at&&row.actor_id&&!row.context));
 await assert.rejects(db.query('select tttracker_v2_training_history($1,$2,1)',[id(10),id(21)]),/PEOPLE_RECORD_NOT_FOUND/);
 const scope=await list('document_scope',person,{id:record});assert.equal(scope.training.option_name,'Configured class');assert.equal(scope.training.category,'Configured licence group');
 assert.equal((await db.query('select option_id from v2_training_records where id=$1',[record])).rows[0].option_id,option);
 await allow(2,'training.configure','deny');await assert.rejects(write('training_category',{name:'Denied grouping'}),/PEOPLE_PERMISSION_DENIED/);await allow(2,'training.configure');
 await user(1);await assert.rejects(list('training_categories'),/PEOPLE_PERMISSION_DENIED/);
 await user();assert.ok((await db.query("select count(*)::int n from v2_people_audit where action='training_category' and actor_id=$1",[id(2)])).rows[0].n>0);
});

test("Site Prestart filters use canonical attendance, date range and status",async()=>{
 await user();const a=(await write('prestart',{project_id:id(20),date:'2026-10-01',location:'Earlier site'})).id;
 const b=(await write('prestart',{project_id:id(20),date:'2026-10-04',location:'Recent site'})).id;
 await write('prestart_attendee',{person_id:person},b);await write('complete_prestart',{},b);
 const rows=await list('prestarts',null,{from_date:'2026-10-03',to_date:'2026-10-05',status:'completed'});assert.deepEqual(rows.rows.map(r=>r.id),[b]);assert.ok(rows.rows[0].person_names.includes('Worker'));
 assert.equal((await list('prestarts',person,{},id(10),'Worker')).total,1);
 assert.ok((await list('prestart_people_choices')).rows.some(p=>p.id===person));
 assert.ok(!(await list('prestarts',null,{status:'completed'})).rows.some(r=>r.id===a));
 await assert.rejects(list('prestarts',null,{},id(11)),/PEOPLE_PERMISSION_DENIED/);
});

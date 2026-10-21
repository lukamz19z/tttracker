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
let db, person, trainingType;
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

  await db.exec(read('20261005160000_people_training_catalogue.sql'));
  await db.exec(read('20261005170000_people_training_review_history.sql'));
  await db.exec(read('20261005190000_people_catalogue_display_summary.sql'));
  await db.exec('alter table v2_projects add unique(organisation_id,id)');
  const central=read('20261013120000_central_sharepoint_documents.sql');
  await db.exec(central.slice(central.indexOf('alter table public.v2_people_documents'),central.indexOf('alter table public.v2_people_documents',central.indexOf('alter table public.v2_people_documents')+1)));
  await db.exec(fn(central,'tttracker_v2_attach_training_document'));
  await db.exec(read('20261013150000_training_replacement_reliability.sql'));
  await db.exec(read('20261013160000_training_upload_atomicity.sql'));
  await db.exec(read('20261013161000_training_draft_retry_metadata.sql'));
  await db.exec(read('20261013162000_training_approval_retry.sql'));
  await db.exec(read('20261013163000_training_retry_audit.sql'));
  await db.exec(read('20261013164000_training_upload_audit_code_safety.sql'));
  await db.exec(read('20261013164000_training_record_management_matrix.sql'));
  await db.exec(read('20261013180000_training_linked_review_group.sql'));
  await db.exec(read('20261013190000_training_type_owned_options.sql'));
  await db.exec(read('20261013200000_training_option_project_requirements.sql'));
  await db.exec(read('20261013210000_training_matrix_option_requirement_projection.sql'));
  await db.exec(read('20261014110000_training_replacement_choice_preview.sql'));
  person=(await write('create_person',{display_name:'Synthetic Worker',employee_number:'EMP-TEST'})).id;

});


after(async () => db.close());


async function kind(extra={}) { return (await write('training_type',{name:`Qualification ${Math.random()}`,validity_mode:'automatic',validity_months:12,requires_issue_date:true,document_requirement:'single',review_policy:'required',...extra})).id; }
async function add(type,date='2026-10-10',extra={}) { return (await write('training',{person_id:person,training_type_id:type,issue_date:date,...extra})).id; }
async function evidence(record,doc=id(990)) {
  await db.query(`insert into v2_people_documents(id,organisation_id,person_id,created_by,name,side,provider,storage_key,content_type,size_bytes,document_context,entity_type,entity_id,sharepoint_item_id) values($1::uuid,$2,$3,$4,'Certificate.jpg','single','sharepoint',($1::uuid)::text,'image/jpeg',100,'training','training',$5,($1::uuid)::text)`,[doc,id(10),person,id(2),record]);
  await db.query('select tttracker_v2_attach_training_document($1,$2,$3)',[id(10),doc,record]);return doc;
}
async function row(record) { const r=(await db.query('select * from v2_training_records where id=$1',[record])).rows[0]; if(r.expiry_date instanceof Date) r.expiry_date=r.expiry_date.toISOString().slice(0,10);return r; }
let serial=1000;
async function published(type,date='2026-10-01',extra={}) { const r=await add(type,date,extra);await evidence(r,id(serial++));await write('finalize_training',{},r);if((await row(r)).review_status!=='approved')await write('review_training',{outcome:'approved'},r);return r; }

test('exact CPR replacement: pending keeps approved old current; approval atomically supersedes old',async()=>{
 trainingType=await kind({name:'CPR'});const old=await published(trainingType),replacement=await add(trainingType);await evidence(replacement,id(serial++));
 assert.equal((await row(replacement)).expiry_date,'2027-10-10');
 await write('finalize_training',{},replacement);assert.equal((await row(old)).is_current,true);assert.equal((await row(replacement)).review_status,'pending_review');assert.equal((await row(replacement)).supersedes_record_id,old);
 assert.equal((await list('training')).rows.some(r=>r.id===old),true);assert.equal((await list('training')).rows.some(r=>r.id===replacement),true);
 assert.equal((await list('training',person)).rows.some(r=>r.id===old),true);assert.equal((await list('training',person)).rows.some(r=>r.id===replacement),true);
 await user(3);await write('review_training',{outcome:'approved'},replacement);await user();
 assert.equal((await row(old)).is_current,false);assert.ok((await row(old)).superseded_at);assert.equal((await row(old)).superseded_by_record_id,replacement);assert.equal((await row(replacement)).is_current,true);
 assert.equal((await list('training')).rows.some(r=>r.id===old),false);assert.equal((await list('training',person)).rows.some(r=>r.id===old),true);
});
test('Options / Classes belong to a Training Type and reject cross-type assignment', async () => {
  const category = (await write('training_category', { name: 'Licence', is_active: true })).id;
  const first = await kind({ name: 'Synthetic Type A', category_id: category, option_selection_mode: 'multiple', option_definitions: [{ code: 'A', name: 'Class A', is_active: true, sort_order: 0 }] });
  const second = await kind({ name: 'Synthetic Type B', category_id: category, option_selection_mode: 'single', option_definitions: [{ code: 'A', name: 'Class A', is_active: true, sort_order: 0 }] });
  const options = (await db.query('select id,training_type_id,code from v2_training_options where organisation_id=$1 and training_type_id=any($2::uuid[]) order by training_type_id', [id(10), [first, second]])).rows;
  assert.equal(options.length, 2);
  assert.notEqual(options[0].id, options[1].id);
  assert.deepEqual(new Set(options.map(row => row.training_type_id)), new Set([first, second]));
  await assert.rejects(db.query('insert into v2_training_type_options(organisation_id,training_type_id,option_id) values($1,$2,$3)', [id(10), first, options.find(row => row.training_type_id === second).id]), /TRAINING_OPTION_TYPE_MISMATCH/);
  await assert.rejects(add(second, '2026-10-10', { option_id: options.find(row => row.training_type_id === first).id }), /TRAINING_OPTION_TYPE_MISMATCH/);
  assert.equal((await db.query('select count(*)::int n from v2_training_options where organisation_id=$1 and training_type_id=$2', [id(10), first])).rows[0].n, 1);
});
test('one shared multi-Option submission creates independent canonical records in one evidence group', async () => {
  const category = (await write('training_category', { name: 'Multi-class' })).id;
  const type = await kind({ name: 'Synthetic Multi Class', category_id: category, validity_months: 12, option_selection_mode: 'multiple', option_evidence_mode: 'shared', option_definitions: [{ code: 'A', name: 'Class A', is_active: true }, { code: 'B', name: 'Class B', is_active: true }] });
  const optionIds = (await db.query('select id from v2_training_options where organisation_id=$1 and training_type_id=$2 order by code', [id(10), type])).rows.map(row => row.id);
  const first = await add(type, '2026-10-10', { option_ids: optionIds });
  const group = (await row(first)).evidence_group_id;
  const grouped = (await db.query('select id,option_id,review_status from v2_training_records where organisation_id=$1 and evidence_group_id=$2 order by option_id', [id(10), group])).rows;
  assert.equal(grouped.length, 2);
  assert.deepEqual(new Set(grouped.map(item => item.option_id)), new Set(optionIds));
  assert.equal(grouped.every(item => item.review_status === 'draft'), true);
  await evidence(first, id(serial++));
  assert.equal((await db.query('select count(*)::int n from v2_people_documents where organisation_id=$1 and evidence_group_id=$2', [id(10), group])).rows[0].n, 1);
  await write('finalize_training', {}, first);
  assert.equal((await db.query('select count(*)::int n from v2_training_records where organisation_id=$1 and evidence_group_id=$2 and review_status in (\'pending_review\',\'approved\')', [id(10), group])).rows[0].n, 2);
});
test('project Option requirement does not accept a different Option under the same Training Type', async () => {
  await allow(2, 'training.requirements.manage');
  const category = (await write('training_category', { name: 'Requirement Classes' })).id;
  const type = await kind({ name: 'Synthetic Requirement Type', category_id: category, option_selection_mode: 'multiple', option_definitions: [{ code: 'A', name: 'Class A', is_active: true }, { code: 'B', name: 'Class B', is_active: true }] });
  const options = (await db.query('select id,code from v2_training_options where organisation_id=$1 and training_type_id=$2', [id(10), type])).rows;
  const required = options.find(option => option.code === 'B').id;
  const held = options.find(option => option.code === 'A').id;
  await db.query('insert into v2_person_projects(organisation_id,person_id,project_id,ended_at) values($1,$2,$3,null)', [id(10), person, id(20)]);
  await write('requirement', { project_id: id(20), training_type_id: type, option_id: required, applies_to: 'everyone', is_active: true });
  const record = await published(type, '2026-10-10', { option_id: held });
  const result = await list('requirements', null, { project_id: id(20) });
  const requirement = result.rows.find(item => item.training_type_id === type);
  assert.equal(requirement.option_id, required);
  assert.equal(requirement.people[0].state, 'missing');
  const matrix = await list('matrix', null, { project_id: id(20), training_type_id: type });
  const cell = matrix.rows[0].cells.find(item => item.type_id === type);
  assert.equal(cell.state, 'missing');
  assert.equal(cell.required_options[0].option_id, required);
  assert.ok(record);
});
test('no-review requires actual SharePoint evidence before switching the current record',async()=>{
 const type=await kind({review_policy:'none'}),old=await published(type),r=await add(type);await assert.rejects(write('finalize_training',{},r),/DOCUMENTS_REQUIRED/);assert.equal((await row(old)).is_current,true);
 await evidence(r,id(serial++));await write('finalize_training',{},r);assert.equal((await row(old)).is_current,false);assert.equal((await row(r)).is_current,true);
});
test('required evidence failure stays upload_failed, hidden from review/register, retry reuses the same record and approval is guarded',async()=>{
 const type=await kind({name:`CPR ${serial++}`}),old=await published(type,'2026-10-01'),key=id(serial++);
 const replacement=await add(type,'2026-10-10',{submission_key:key});
 assert.equal((await row(replacement)).review_status,'draft');
 await write('training_upload_failed',{code:'INTEGRATION_SITE_PERMISSION_REQUIRED'},replacement);
 assert.equal((await row(old)).is_current,true);assert.equal((await row(replacement)).review_status,'upload_failed');
 assert.equal((await list('review')).rows.some(r=>r.id===replacement),false);
 assert.equal((await list('training')).rows.some(r=>r.id===replacement),false);
 assert.equal((await list('training_drafts')).rows.some(r=>r.id===replacement),true);
 await assert.rejects(write('review_training',{outcome:'approved'},replacement),/INVALID_TRANSITION/);
 await db.query("update v2_training_records set review_status='pending_review' where id=$1",[replacement]);
 await assert.rejects(write('review_training',{outcome:'approved'},replacement),/DOCUMENTS_REQUIRED/);
 await db.query("update v2_training_records set review_status='upload_failed' where id=$1",[replacement]);
 await assert.rejects(write('finalize_training',{},replacement),/DOCUMENTS_REQUIRED/);
 assert.equal((await row(old)).is_current,true);
 const retry=await add(type,'2026-10-10',{submission_key:key});assert.equal(retry,replacement);
 await write('training_upload_retry_started',{},retry);
 await evidence(retry,id(serial++));await write('finalize_training',{},retry);
 assert.equal((await db.query('select count(*)::int n from v2_people_documents where evidence_group_id=(select evidence_group_id from v2_training_records where id=$1)',[retry])).rows[0].n,1);
 assert.equal((await row(retry)).review_status,'pending_review');assert.equal((await row(old)).is_current,true);
 await user(3);await write('review_training',{outcome:'approved'},retry);await user();
 assert.equal((await row(old)).is_current,false);assert.equal((await row(retry)).is_current,true);
 assert.equal((await db.query("select count(*)::int n from v2_people_audit where target_id=$1 and action='training_upload_retry_started'",[retry])).rows[0].n,1);
});
test('front/back Training remains a draft until both required sides are linked',async()=>{
 const type=await kind({document_requirement:'front_back'}),r=await add(type);
 const firstDoc=id(serial++);
 await db.query(`insert into v2_people_documents(id,organisation_id,person_id,created_by,name,side,provider,storage_key,content_type,size_bytes,document_context,entity_type,entity_id,sharepoint_item_id) values($1::uuid,$2,$3,$4,'Front.jpg','front','sharepoint',($1::uuid)::text,'image/jpeg',100,'training','training',$5,($1::uuid)::text)`,[firstDoc,id(10),person,id(2),r]);
 await db.query('select tttracker_v2_attach_training_document($1,$2,$3)',[id(10),firstDoc,r]);
 await assert.rejects(write('finalize_training',{},r),/DOCUMENTS_REQUIRED/);
 assert.equal((await row(r)).review_status,'draft');
 const group=(await row(r)).evidence_group_id;
 const doc=id(serial++);
 await db.query(`insert into v2_people_documents(id,organisation_id,person_id,created_by,name,side,provider,storage_key,content_type,size_bytes,document_context,entity_type,entity_id,sharepoint_item_id) values($1::uuid,$2,$3,$4,'Back.jpg','back','sharepoint',($1::uuid)::text,'image/jpeg',100,'training','training',$5,($1::uuid)::text)`,[doc,id(10),person,id(2),r]);
 await db.query('select tttracker_v2_attach_training_document($1,$2,$3)',[id(10),doc,r]);
 await write('finalize_training',{},r);assert.equal((await row(r)).review_status,'pending_review');
 assert.equal((await row(r)).evidence_group_id,group);
});
test('rejection and changes requested preserve old; corrected replacement approval supersedes',async()=>{
 for(const outcome of ['rejected','changes_required']) { const type=await kind(),old=await published(type),r=await add(type);await evidence(r,id(serial++));await write('finalize_training',{},r);await write('review_training',{outcome,comment:'Synthetic reason'},r);assert.equal((await row(old)).is_current,true);assert.equal((await row(r)).review_status,outcome);
 if(outcome==='changes_required'){await write('resubmit_training',{},r);await write('review_training',{outcome:'approved'},r);assert.equal((await row(old)).is_current,false);} }
});
test('multiple-current and never scopes retain both records',async()=>{
 for(const extra of [{allows_multiple_current:true},{supersede_scope:'never'}]) {const type=await kind(extra),old=await published(type),r=await published(type,'2026-10-10');assert.equal((await row(old)).is_current,true);assert.equal((await row(r)).is_current,true);}
});
test('option and project matching respect null equality and organisation-owned project scope',async()=>{
 const cat=(await write('training_category',{name:'Synthetic options'})).id;
 const type=await kind({category_id:cat,option_selection_mode:'multiple',option_definitions:[{code:'A',name:'A',is_active:true},{code:'B',name:'B',is_active:true}],supersede_scope:'type_and_option'});
 const [a,b]=(await db.query('select id from v2_training_options where organisation_id=$1 and training_type_id=$2 order by code',[id(10),type])).rows.map(row=>row.id);
 const old=await published(type,'2026-10-01',{option_id:a});await published(type,'2026-10-10',{option_id:b});assert.equal((await row(old)).is_current,true);
 await published(type,'2026-10-11',{option_id:a});assert.equal((await row(old)).is_current,false);
 const scoped=await kind({supersede_scope:'type_option_and_project'}),projectOld=await published(scoped,'2026-10-01',{project_id:id(20)});
 await published(scoped,'2026-10-10');assert.equal((await row(projectOld)).is_current,true);await published(scoped,'2026-10-11',{project_id:id(20)});assert.equal((await row(projectOld)).is_current,false);
 await assert.rejects(add(scoped,'2026-10-12',{project_id:id(21)}),/RELATIONSHIP_INVALID/);
});
test('replacement preview returns current class records and explicit replace affects only selected classes',async()=>{
 const cat=(await write('training_category',{name:'Synthetic replacement classes'})).id;
 const type=await kind({category_id:cat,option_selection_mode:'multiple',allows_multiple_current:true,supersede_scope:'type_and_option',option_definitions:[
  {code:'A',name:'Class A',is_active:true},{code:'B',name:'Class B',is_active:true},{code:'C',name:'Class C',is_active:true},
 ]});
 const options=(await db.query('select code,id from v2_training_options where organisation_id=$1 and training_type_id=$2 order by code',[id(10),type])).rows;
 const byCode=Object.fromEntries(options.map((option)=>[option.code,option.id]));
 const oldA=await published(type,'2026-10-01',{option_id:byCode.A});
 const oldB=await published(type,'2026-10-01',{option_id:byCode.B});
 const preview=await list('training_replacement',person,{training_type_id:type});
 assert.deepEqual(new Set(preview.rows.map((record)=>record.id)),new Set([oldA,oldB]));
 const replacement=await add(type,'2026-10-10',{option_id:byCode.A,option_ids:[byCode.A,byCode.C],replacement_mode:'replace'});
 await evidence(replacement,id(serial++));
 await write('finalize_training',{},replacement);
 assert.equal((await row(oldA)).is_current,true);
 assert.equal((await row(oldB)).is_current,true);
 const replacementRows=(await db.query('select id,option_id,is_current,review_status from v2_training_records where organisation_id=$1 and evidence_group_id=(select evidence_group_id from v2_training_records where id=$2)',[id(10),replacement])).rows;
 assert.equal(replacementRows.find((record)=>record.option_id===byCode.A).review_status,'pending_review');
 await write('review_training',{outcome:'approved'},replacement);
 assert.equal((await row(oldA)).is_current,false);
 assert.equal((await row(oldB)).is_current,true);
 const finalRows=(await db.query('select id,option_id,is_current from v2_training_records where organisation_id=$1 and evidence_group_id=(select evidence_group_id from v2_training_records where id=$2)',[id(10),replacement])).rows;
 assert.equal(finalRows.find((record)=>record.option_id===byCode.A).is_current,true);
 assert.equal(finalRows.find((record)=>record.option_id===byCode.C).is_current,true);
});
test('multiple-current Add choice retains the exact existing record',async()=>{
 const type=await kind({allows_multiple_current:true,supersede_scope:'type'});
 const old=await published(type);
 const next=await add(type,'2026-10-10',{replacement_mode:'add',submission_key:id(serial++),option_ids:[]});
 const retryProjection=await list('training_drafts',person);
 const retryDraft=retryProjection.rows.find((record)=>record.id===next);
 assert.equal(retryDraft.replacement_mode,'add');
 assert.deepEqual(retryDraft.option_ids,[]);
 await evidence(next,id(serial++));
 await write('finalize_training',{},next);
 await write('review_training',{outcome:'approved'},next);
 assert.equal((await row(old)).is_current,true);
 assert.equal((await row(next)).is_current,true);
});
test('explicit Type-wide replacement supersedes the entire current set only after approval',async()=>{
 const cat=(await write('training_category',{name:'Synthetic Type-wide scope'})).id;
 const type=await kind({category_id:cat,option_selection_mode:'multiple',allows_multiple_current:true,supersede_scope:'type',option_definitions:[
  {code:'A',name:'Class A',is_active:true},{code:'B',name:'Class B',is_active:true},
 ]});
 const options=(await db.query('select code,id from v2_training_options where organisation_id=$1 and training_type_id=$2 order by code',[id(10),type])).rows;
 const byCode=Object.fromEntries(options.map((option)=>[option.code,option.id]));
 const oldA=await published(type,'2026-10-01',{option_id:byCode.A});
 const oldB=await published(type,'2026-10-02',{option_id:byCode.B});
 const next=await add(type,'2026-10-10',{option_id:byCode.A,option_ids:[byCode.A],replacement_mode:'replace'});
 await evidence(next,id(serial++));
 await write('finalize_training',{},next);
 assert.equal((await row(oldA)).is_current,true);
 assert.equal((await row(oldB)).is_current,true);
 await write('review_training',{outcome:'approved'},next);
 assert.equal((await row(oldA)).is_current,false);
 assert.equal((await row(oldB)).is_current,false);
 assert.equal((await row(next)).is_current,true);
});
test('submission retries return same primary record and reject changed payload; approval retries do not supersede twice',async()=>{
 const type=await kind(),key=id(serial++),payload={submission_key:key};const r=await add(type,'2026-10-10',payload),retry=await add(type,'2026-10-10',payload);assert.equal(r,retry);
 await assert.rejects(add(type,'2026-10-11',payload),/SUBMISSION_CONFLICT/);await evidence(r,id(serial++));await write('finalize_training',{},r);await write('review_training',{outcome:'approved'},r);await write('review_training',{outcome:'approved'},r);assert.equal((await row(r)).is_current,true);
});
test('First Aid + CPR use one evidence group and one file, with independent supersession and expiry',async()=>{
 const first=await kind({name:'First Aid',validity_months:36}),cpr=await kind({name:'Linked CPR',validity_months:12});await write('linked_type',{linked_type_id:cpr},first);
 const oldFirst=await published(first),oldCpr=await published(cpr),r=await add(first,'2026-10-10',{linked_type_ids:[cpr]});const doc=await evidence(r,id(serial++));
 const group=(await row(r)).evidence_group_id,linked=(await db.query('select * from v2_training_records where evidence_group_id=$1 and id<>$2',[group,r])).rows[0];
 assert.equal((await row(r)).training_type_id,first);assert.equal(linked.expiry_date.toISOString().slice(0,10),'2027-10-10');assert.equal((await row(r)).expiry_date,'2029-10-10');await write('finalize_training',{},r);
 await user(3);await write('review_training',{outcome:'approved'},r);await user();
 assert.equal((await row(linked.id)).review_status,'approved');assert.equal((await row(linked.id)).is_current,true);
 assert.equal((await row(oldCpr)).is_current,false);assert.equal((await row(oldFirst)).is_current,false);
 assert.equal((await db.query('select count(*)::int n from v2_people_documents where evidence_group_id=$1',[group])).rows[0].n,1);assert.ok(doc);
});
test('linked qualification is optional and generic for configured Training Types',async()=>{
 const typeA=await kind({name:'Synthetic Training A',validity_months:24}),typeB=await kind({name:'Synthetic Training B',validity_months:6});
 await write('linked_type',{linked_type_id:typeB},typeA);
 const withoutLink=await add(typeA,'2026-10-10');
 assert.equal((await db.query('select count(*)::int n from v2_training_records where evidence_group_id=(select evidence_group_id from v2_training_records where id=$1)',[withoutLink])).rows[0].n,1);
 const withLink=await add(typeA,'2026-10-10',{linked_type_ids:[typeB]});
 const linked=(await db.query('select id,training_type_id,expiry_date from v2_training_records where evidence_group_id=(select evidence_group_id from v2_training_records where id=$1) and id<>$1',[withLink])).rows[0];
 assert.equal(linked.training_type_id,typeB);assert.equal(linked.expiry_date.toISOString().slice(0,10),'2027-04-10');
 await write('unlink_training_type',{linked_type_id:typeB},typeA);
 assert.equal((await db.query('select count(*)::int n from v2_training_linked_types where organisation_id=$1 and training_type_id=$2 and linked_type_id=$3',[id(10),typeA,typeB])).rows[0].n,0);
});
test('one review decision applies consistently to all review-required linked records',async()=>{
 const primary=await kind({name:'Synthetic Primary'}),secondary=await kind({name:'Synthetic Secondary'});
 await write('linked_type',{linked_type_id:secondary},primary);
 const oldPrimary=await published(primary),oldSecondary=await published(secondary);
 const next=await add(primary,'2026-10-10',{linked_type_ids:[secondary]});await evidence(next,id(serial++));
 const sibling=(await db.query('select id from v2_training_records where evidence_group_id=(select evidence_group_id from v2_training_records where id=$1) and id<>$1',[next])).rows[0].id;
 await write('finalize_training',{},next);
 assert.equal((await row(sibling)).review_status,'pending_review');
 await user(3);await write('review_training',{outcome:'approved'},next);await user();
 assert.equal((await row(next)).review_status,'approved');assert.equal((await row(sibling)).review_status,'approved');
 assert.equal((await row(next)).is_current,true);assert.equal((await row(sibling)).is_current,true);
 assert.equal((await row(oldPrimary)).is_current,false);assert.equal((await row(oldSecondary)).is_current,false);
});
test('group rejection preserves each previous current Training record',async()=>{
 const primary=await kind({name:'Synthetic Review Primary'}),secondary=await kind({name:'Synthetic Review Secondary'});
 await write('linked_type',{linked_type_id:secondary},primary);
 const oldPrimary=await published(primary),oldSecondary=await published(secondary);
 const next=await add(primary,'2026-10-10',{linked_type_ids:[secondary]});await evidence(next,id(serial++));
 const group=(await row(next)).evidence_group_id;
 const sibling=(await db.query('select id from v2_training_records where evidence_group_id=$1 and id<>$2',[group,next])).rows[0].id;
 await write('finalize_training',{},next);await user(3);await write('review_training',{outcome:'rejected',comment:'Synthetic rejection'},next);await user();
 assert.equal((await row(next)).review_status,'rejected');assert.equal((await row(sibling)).review_status,'rejected');
 assert.equal((await row(oldPrimary)).is_current,true);assert.equal((await row(oldSecondary)).is_current,true);
});
test('reviewer-only preview works for current/pending/historical/rejected evidence; private and foreign evidence denied',async()=>{
 const type=await kind(),old=await published(type),r=await add(type);const doc=await evidence(r,id(serial++));await write('finalize_training',{},r);
 await user(3);assert.equal((await list('document_access',null,{id:doc})).rows[0].id,doc);await user();await write('review_training',{outcome:'rejected',comment:'Synthetic'},r);
 await user(3);assert.equal((await list('document_access',null,{id:doc})).rows[0].id,doc);
 await db.query("update v2_people_documents set classification='private' where id=$1",[doc]);await assert.rejects(list('document_access',null,{id:doc}),/NOT_FOUND/);
 await assert.rejects(list('document_access',null,{id:doc},id(11)),/PERMISSION_DENIED/);await user();assert.equal((await row(old)).is_current,true);
});
test('draft replacement retains its configured supersede candidate without changing the existing current record',async()=>{
 const type=await kind(),old=await published(type),r=await add(type);
 assert.equal((await row(r)).supersedes_record_id,old);assert.equal((await row(r)).review_status,'draft');assert.equal((await row(old)).is_current,true);
});
test('upload failure audit stores only a safe diagnostic code',async()=>{
 const type=await kind(),r=await add(type);await write('training_upload_failed',{code:'secret-token-value'},r);
 const audit=(await db.query("select context from v2_people_audit where target_id=$1 and action='training_upload_failed'",[r])).rows[0].context;
 assert.deepEqual(audit,{safe_code:'DOCUMENT_UPLOAD_FAILED'});
});

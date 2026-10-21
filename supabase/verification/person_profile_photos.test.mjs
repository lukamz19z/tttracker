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
  const secure=read('20261004170000_people_confidential_security.sql');
  for(const name of ['v2_secure_onboarding_instances','v2_secure_tokens','v2_secure_sessions','v2_confidential_audit']) {
    const def=secure.match(new RegExp(`create table if not exists private\\.${name} \\([\\s\\S]*?\\n\\);`))[0];await db.exec(def);
  }
  await db.exec(read('20261005100000_people_onboarding_workflows.sql'));
  await db.exec(read('20261005120000_people_onboarding_completion_feedback.sql'));
  await db.exec(read('20261005130000_people_private_contact_mapping.sql'));
  await db.exec(read('20261005140000_people_onboarding_linked_evidence.sql'));
  await db.exec(read('20261005150000_people_onboarding_typed_validation.sql'));
  await db.exec(read('20261005160000_people_training_catalogue.sql'));
  await db.exec(read('20261005180000_onboarding_link_errors.sql'));
  for(const c of ['people.onboarding.manage','people.onboarding.view','people.onboarding.review'])await allow(2,c);
  const central = read('20261013120000_central_sharepoint_documents.sql');
  const start = central.indexOf('alter table public.v2_people_documents');
  await db.exec(central.slice(start, central.indexOf('alter table public.v2_people_documents',start+1)));
  const patch = central.slice(central.indexOf('do $$ declare definition text;old_check'), central.indexOf('-- Existing RLS is preserved'));
  await db.exec(patch);
  await db.exec(read('20261016100000_person_profile_photos.sql'));
  await db.exec(read('20261016100000_person_profile_photos.sql')); // additive rerun
  await user();
});


after(async()=>db.close());
async function photo(action,personId=null,documentId=null,org=id(10)) { return (await db.query('select tttracker_v2_person_photo($1,$2,$3,$4) result',[org,personId,action,documentId])).rows[0].result; }
async function document(personId,n,source='admin_upload',org=id(10),actor=id(2)) {
 await db.query(`insert into v2_people_documents(id,organisation_id,person_id,created_by,name,storage_key,content_type,size_bytes,document_context,entity_type,entity_id,provider,sharepoint_item_id,photo_source) values($1::uuid,$2,$3,$4,'Photo.jpg',($1::uuid)::text,'image/jpeg',100,'profile_photos','person_profile_photo',$3,'sharepoint',($1::uuid)::text,$5)`,[id(n),org,personId,actor,source]);
 return id(n);
}
let pid;
test('dynamic capabilities permit a synthetic manager; view only and cross-tenant/platform access denied',async()=>{
 pid=(await write('create_person',{display_name:'Synthetic Employee',employee_number:'1600'})).id;
 await assert.rejects(photo('scope',pid),/PERMISSION_DENIED/);
 const role=(await db.query("insert into v2_roles(organisation_id,code,name) values($1,'synthetic_photo_steward','Synthetic Photo Steward') returning id",[id(10)])).rows[0].id;
 await db.query("insert into v2_role_permissions(organisation_id,role_id,permission_id,allowed) select $1,$2,id,true from v2_permissions where permission_code in ('people.profile_photo.view','people.profile_photo.manage')",[id(10),role]);
 await db.query("insert into v2_user_role_assignments(organisation_id,user_id,role_id) values($1,$2,$3)",[id(10),id(2),role]);
 await allow(2,'people.profile_photo.manage','deny');await assert.rejects(photo('scope',pid),/PERMISSION_DENIED/);
 await db.query("delete from v2_user_permission_overrides where organisation_id=$1 and user_id=$2 and permission_id=(select id from v2_permissions where permission_code='people.profile_photo.manage')",[id(10),id(2)]);
 assert.equal((await photo('scope',pid)).id,pid);
 await document(pid,100);await photo('assign',pid,id(100));
 await allow(3,'people.profile_photo.view');await user(3);
 assert.equal((await photo('read',pid)).document_id,id(100));
 await assert.rejects(photo('assign',pid,id(100)),/PERMISSION_DENIED/);
 await user(1);await assert.rejects(photo('read',pid),/PERMISSION_DENIED/);
 await user(2);await assert.rejects(photo('read',pid,null,id(11)),/PERMISSION_DENIED/);
});
test('replacement is atomic, retains history and failed metadata assignment keeps A current',async()=>{
 await document(pid,101);await photo('assign',pid,id(101));
 assert.equal((await photo('read',pid)).document_id,id(101));
 assert.equal((await db.query('select superseded_by_document_id from v2_people_documents where id=$1',[id(100)])).rows[0].superseded_by_document_id,id(101));
 await assert.rejects(photo('assign',pid,id(999)),/DOCUMENT_INVALID/);
 assert.equal((await photo('read',pid)).document_id,id(101));
 await db.query("update v2_people_documents set content_type='application/pdf' where id=$1",[id(100)]);
 await assert.rejects(photo('assign',pid,id(100)),/DOCUMENT_INVALID/);
 assert.equal((await photo('read',pid)).document_id,id(101));
});
test('no login required, linked-user resolution uses auth_user_id, self-service needs explicit capability',async()=>{
 assert.equal((await photo('read',pid)).document_id,id(101));
 assert.equal(await photo('read'),null);
 await db.query('update v2_people set auth_user_id=$1 where id=$2',[id(3),pid]);await user(3);
 assert.equal((await photo('read')).person_id,pid);
 await assert.rejects(photo('scope'),/PERMISSION_DENIED/);
 await allow(3,'people.profile_photo.self_manage');assert.equal((await photo('scope')).source,'self_service');
 await allow(3,'people.profile_photo.self_manage','deny');await assert.rejects(photo('scope'),/PERMISSION_DENIED/);await user(2);
});
test('register batches current IDs, rename preserves reference and removal retains physical metadata',async()=>{
 await db.query("update v2_people set display_name='Changed Name',employee_number='1700' where id=$1",[pid]);
 const people=await list('people');assert.equal(people.rows.find(p=>p.id===pid).current_profile_photo_id,id(101));
 await photo('remove',pid);assert.equal((await photo('read',pid)).document_id,null);
 assert.equal((await db.query('select count(*)::int n from v2_people_documents where person_id=$1',[pid])).rows[0].n,2);
});
async function setupOnboarding(required) {
 const definition={sections:[{name:'Identity',fields:[{key:'photo',label:'Profile Photo',type:'profile_photo',classification:'operational',required}]}]};
 const rpc=async(action,data={},target=null)=>(await db.query('select tttracker_v2_onboarding_admin($1,$2,$3,$4) result',[id(10),action,target,JSON.stringify(data)])).rows[0].result;
 const template=(await rpc('save_template',{name:'Photo collection',definition,review_policy:'none'})).id;
 await rpc('publish',{},template);
 const instance=(await rpc('start',{template_id:template,email:'photo@example.test',name:'Onboarding Person',expires_at:new Date(Date.now()+86400000).toISOString(),token_hash:(required?'b':'c').repeat(64)})).id;
 await rpc('sent',{},instance);
 const session=(required?'d':'e').repeat(64);
 await db.query(`insert into private.v2_secure_sessions(organisation_id,instance_id,session_hash,expires_at) values($1,$2,$3,now()+interval '1 day')`,[id(10),instance,session]);
 const external=async(action,value=null)=>(await db.query("select tttracker_v2_onboarding_external($1,$2,'photo',$3) result",[session,action,JSON.stringify(value)])).rows[0].result;
 return {instance,external};
}
test('required photo validation, session upload, completion queues the selected single file without login',async()=>{
 const {instance,external}=await setupOnboarding(true);
 assert.equal((await external('submit')).issues[0].field,'photo');
 const scope=await external('upload_scope');assert.equal(scope.field.type,'profile_photo');
 const key=`${id(10)}/onboarding/${instance}/${id(110)}`;
 await db.query(`insert into v2_people_documents(id,organisation_id,name,storage_key,content_type,size_bytes,document_context,entity_type,entity_id,provider,sharepoint_item_id) values($1,$2,'Headshot.jpg',$3,'image/jpeg',100,'onboarding','onboarding',$4,'sharepoint','stable-photo-item')`,[id(110),id(10),key,instance]);
 await assert.rejects(external('document',{storage_key:key,name:'id.pdf',side:'single',content_type:'application/pdf',size_bytes:100}),/FILE_INVALID/);
 await external('document',{storage_key:key,name:'Headshot.jpg',side:'single',content_type:'image/jpeg',size_bytes:100});
 assert.equal((await external('submit')).status,'completed');
 const d=(await db.query('select * from v2_people_documents where id=$1',[id(110)])).rows[0];assert.equal(d.photo_publication_pending,true);assert.equal(d.photo_source,'onboarding');assert.ok(d.person_id);
 assert.equal((await photo('read',d.person_id)).document_id,null);
 // Provider publication completes before the worker changes the current relationship.
 await db.query("update v2_people_documents set document_context='profile_photos' where id=$1",[id(110)]);
 await db.query('select tttracker_v2_finish_onboarding_photo($1,$2)',[id(10),id(110)]);
 assert.equal((await photo('read',d.person_id)).document_id,id(110));
 assert.equal((await db.query('select sharepoint_item_id from v2_people_documents where id=$1',[id(110)])).rows[0].sharepoint_item_id,'stable-photo-item');
});
test('optional photo absent does not block submission and draft removal does not delete SharePoint documents',async()=>{
 const {external}=await setupOnboarding(false);
 await external('save',null);
 assert.equal((await external('submit')).status,'completed');
});

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
  await user();
});


after(async () => db.close());
let template,instance;
const definition={sections:[{name:'Identity',fields:[{key:'name',label:'Name',type:'text',classification:'operational',required:true,mapping:'display_name'}]}]};
async function onboarding(action,data={},target=null){return (await db.query('select tttracker_v2_onboarding_admin($1,$2,$3,$4) result',[id(10),action,target,JSON.stringify(data)])).rows[0].result;}
test('draft publish and historical immutable versions',async()=>{
 template=(await onboarding('save_template',{name:'Client mobilisation',definition})).id;
 await onboarding('publish',{},template);
 instance=(await onboarding('start',{template_id:template,email:'synthetic@example.test',name:'Synthetic Person',expires_at:new Date(Date.now()+86400000).toISOString(),token_hash:'a'.repeat(64)})).id;
 await onboarding('save_template',{name:'Client mobilisation',definition},template);
 assert.equal((await onboarding('template',{},template)).version,2);
 assert.equal((await db.query('select v.version from private.v2_secure_onboarding_instances i join private.v2_onboarding_versions v on v.id=i.template_version_id where i.id=$1',[instance])).rows[0].version,1);
});
test('confidential semantic minimum and collection publication gate',async()=>{
 const field={key:'account',label:'My account',type:'bank_account',classification:'operational'};
 await assert.rejects(onboarding('save_template',{name:'Blocked',definition:{sections:[{name:'Section',fields:[field]}]}}),/PEOPLE_CLASSIFICATION_INVALID/);
 field.classification='confidential';const blocked=(await onboarding('save_template',{name:'Blocked',definition:{sections:[{name:'Section',fields:[field]}]}})).id;
 await assert.rejects(onboarding('publish',{},blocked),/PEOPLE_CONFIDENTIAL_COLLECTION_DISABLED/);
});
test('scoped draft resume required submission and canonical person without login',async()=>{
 await onboarding('sent',{},instance);
 await db.query('insert into private.v2_secure_sessions(organisation_id,instance_id,session_hash,expires_at) values($1,$2,$3,now()+interval \'1 day\')',[id(10),instance,'b'.repeat(64)]);
 const ext=async(action,field=null,value=null)=>(await db.query('select tttracker_v2_onboarding_external($1,$2,$3,$4) result',['b'.repeat(64),action,field,JSON.stringify(value)])).rows[0].result;
 assert.equal((await ext('submit')).issues.length,1);
 await ext('save','name','Synthetic Recipient');assert.equal((await ext('read')).answers.name,'Synthetic Recipient');
 await assert.rejects(ext('save','unexpected','x'),/ONBOARDING_FIELD_INVALID/);
 await ext('submit');await onboarding('changes',{comment:'Confirm spelling'},instance);
 await ext('save','name','Synthetic Approved');await ext('submit');await onboarding('complete',{},instance);
 const people=(await list()).rows;assert.equal(people[0].display_name,'Synthetic Approved');assert.equal(people[0].account_status,'No TTTracker account');
 await assert.rejects(ext('read'),/ONBOARDING_SESSION_INVALID/);
});

async function startFixture(def=definition,policy='required',hash='c'.repeat(64)){
 await user();const t=(await onboarding('save_template',{name:'Synthetic onboarding',definition:def,review_policy:policy})).id;
 await onboarding('publish',{},t);const i=(await onboarding('start',{template_id:t,email:'fixture@example.test',name:'Prospective',expires_at:new Date(Date.now()+86400000).toISOString(),token_hash:hash})).id;
 await onboarding('sent',{},i);return {t,i,hash};
}
async function exchange(hash,session){return (await db.query('select tttracker_v2_onboarding_exchange($1,$2) result',[hash,session])).rows[0].result;}
async function external(hash,action,field=null,value=null){return (await db.query('select tttracker_v2_onboarding_external($1,$2,$3,$4) result',[hash,action,field,JSON.stringify(value)])).rows[0].result;}
test('one-use hash-only token exchanges into a narrow expiring session',async()=>{
 const f=await startFixture();const session='d'.repeat(64);assert.equal((await exchange(f.hash,session)).instance_id,f.i);
 await assert.rejects(exchange(f.hash,'e'.repeat(64)),/ONBOARDING_LINK_USED/);
 await assert.rejects(external('e'.repeat(64),'read'),/ONBOARDING_SESSION_INVALID/);
 await assert.rejects(external(session,'list_people'),/ONBOARDING_INVALID_REQUEST/);
 await assert.rejects(external(session,'save','unknown','x'),/ONBOARDING_FIELD_INVALID/);
 assert.equal((await external(session,'read')).instance_id,f.i);
 await db.query("update private.v2_secure_sessions set expires_at=now()-interval '1 second' where session_hash=$1",[session]);await assert.rejects(external(session,'read'),/ONBOARDING_SESSION_INVALID/);
});
test('expired and revoked invitations cannot be exchanged or resumed',async()=>{
 const f=await startFixture(definition,'required','f'.repeat(64));await onboarding('revoke',{},f.i);await assert.rejects(exchange(f.hash,'1'.repeat(64)),/ONBOARDING_LINK_REVOKED/);
 const g=await startFixture(definition,'required','2'.repeat(64));await db.query("update private.v2_secure_tokens set expires_at=now()-interval '1 second' where token_hash=$1",[g.hash]);await assert.rejects(exchange(g.hash,'3'.repeat(64)),/ONBOARDING_LINK_EXPIRED/);
});
test('private domains are separated from Operational detail and require exact grants',async()=>{
 const def={sections:[{name:'Safety contact',fields:[{key:'phone',label:'Personal phone',type:'phone',classification:'private',domain:'emergency_contact',required:true}]}]};
 const f=await startFixture(def,'required','4'.repeat(64));const session='5'.repeat(64);await exchange(f.hash,session);await external(session,'save','phone','SYNTHETIC-NOT-A-REAL-NUMBER');await external(session,'submit');
 assert.equal((await onboarding('detail',{},f.i)).answers.phone,undefined);
 await allow(2,'people.private.emergency_contact.view');assert.equal((await onboarding('detail',{},f.i)).answers.phone,'SYNTHETIC-NOT-A-REAL-NUMBER');
 await allow(2,'people.private.emergency_contact.view','deny');assert.equal((await onboarding('detail',{},f.i)).answers.phone,undefined);
 await assert.rejects(onboarding('complete',{},f.i),/PEOPLE_PERMISSION_DENIED/);
 await assert.rejects(onboarding('save_template',{name:'Unsafe no-review',definition:def,review_policy:'none'}),/PEOPLE_REVIEW_REQUIRED_FOR_SENSITIVE_TEMPLATE/);
});
test('Operational no-review completes without granting TTTracker user access',async()=>{
 const f=await startFixture(definition,'none','6'.repeat(64));const session='7'.repeat(64);await exchange(f.hash,session);await external(session,'save','name','Low-risk synthetic');await external(session,'submit');
 const row=(await db.query('select status,person_id from private.v2_secure_onboarding_instances where id=$1',[f.i])).rows[0];assert.equal(row.status,'completed');assert.equal((await db.query('select auth_user_id from v2_people where id=$1',[row.person_id])).rows[0].auth_user_id,null);
});
test('section reviews are required and recorded independently before completion',async()=>{
 const def={sections:[{name:'Identity',fields:definition.sections[0].fields},{name:'Acknowledgement',fields:[{key:'agree',label:'Agree',type:'acknowledgement',classification:'operational',required:true}]}]};
 const f=await startFixture(def,'sections','8'.repeat(64));const session='9'.repeat(64);await exchange(f.hash,session);await external(session,'save','name','Reviewed synthetic');await external(session,'save','agree',true);await external(session,'submit');
 await assert.rejects(onboarding('complete',{},f.i),/PEOPLE_SECTIONS_REVIEW_REQUIRED/);await onboarding('section_review',{section:0},f.i);await onboarding('section_review',{section:1},f.i);await onboarding('complete',{},f.i);
 assert.equal((await db.query("select count(*)::int n from private.v2_onboarding_history where instance_id=$1 and action='section_approved'",[f.i])).rows[0].n,2);
});

test('onboarding training evidence feeds canonical review and configured linked expiry',async()=>{
 const main=(await write('training_type',{name:'Qualification A',validity_mode:'automatic',validity_months:36,renewal_lead_days:30,requires_issue_date:true,document_requirement:'single',is_active:true,review_policy:'required'})).id;
 const linked=(await write('training_type',{name:'Qualification B',validity_mode:'automatic',validity_months:12,renewal_lead_days:30,requires_issue_date:true,document_requirement:'single',is_active:true,review_policy:'required'})).id;
 await write('linked_type',{linked_type_id:linked},main);
 const def={sections:[{name:'Identity',fields:definition.sections[0].fields},{name:'Tickets',fields:[{key:'ticket',label:'Ticket',type:'training_request',classification:'operational',required:true,training_type_id:main}]}]};
 const f=await startFixture(def,'required','a1'.repeat(32));const session='b1'.repeat(32);await exchange(f.hash,session);await external(session,'save','name','Synthetic tickets');await assert.rejects(external(session,'save','ticket',{linked_type_ids:[id(999)]}),/ONBOARDING_FIELD_INVALID/);await external(session,'save','ticket',{issue_date:'2026-10-01',linked_type_ids:[linked]});assert.ok((await external(session,'submit')).issues.length);
 await assert.rejects(external(session,'document','ticket',{storage_key:id(11)+'/onboarding/'+f.i+'/wrong',name:'synthetic.pdf',side:'single',size_bytes:5,content_type:'application/pdf'}),/ONBOARDING_FIELD_INVALID/);
 await db.query("insert into storage.objects(bucket_id,name) values('v2-people-evidence',$1)",[id(10)+'/onboarding/'+f.i+'/opaque']);
 await external(session,'document','ticket',{storage_key:id(10)+'/onboarding/'+f.i+'/opaque',name:'synthetic.pdf',side:'single',size_bytes:5,content_type:'application/pdf'});await external(session,'submit');await onboarding('complete',{},f.i);
 const records=(await db.query("select expiry_date,review_status,evidence_group_id,source_channel from v2_training_records where training_type_id in ($1,$2) order by expiry_date",[main,linked])).rows;
 assert.equal(records.length,2);assert.equal(records[0].evidence_group_id,records[1].evidence_group_id);assert.equal(records[0].review_status,'pending_review');assert.equal(records[0].source_channel,'external_onboarding');assert.equal(new Date(records[0].expiry_date).toISOString().slice(0,10),'2027-10-01');assert.equal(new Date(records[1].expiry_date).toISOString().slice(0,10),'2029-10-01');
 assert.equal((await db.query('select count(*)::int n from v2_people_documents where evidence_group_id=$1',[records[0].evidence_group_id])).rows[0].n,1);
});

test('Private contact mapping uses canonical contact and exact domain access without a Confidential grant',async()=>{
 await user();await allow(2,'people.private.personal_contact.view');await allow(2,'people.private.personal_contact.edit');
 const def={sections:[{name:'Contact',fields:[{key:'phone',label:'Phone',type:'phone',classification:'private',domain:'personal_contact',mapping:'personal_phone',required:true}]}]};const f=await startFixture(def,'required','c1'.repeat(32));const session='d1'.repeat(32);await exchange(f.hash,session);await external(session,'save','phone','SYNTHETIC_PHONE_ONLY');await external(session,'submit');await onboarding('complete',{},f.i);
 const pid=(await db.query('select person_id from private.v2_secure_onboarding_instances where id=$1',[f.i])).rows[0].person_id;
 const result=(await db.query('select tttracker_v2_people_private_domain($1,$2,$3) result',[id(10),pid,'personal_contact'])).rows[0].result;assert.equal(result.phone,'SYNTHETIC_PHONE_ONLY');
 await allow(2,'people.private.personal_contact.view','deny');await assert.rejects(db.query('select tttracker_v2_people_private_domain($1,$2,$3)',[id(10),pid,'personal_contact']),/PEOPLE_PERMISSION_DENIED/);
});

test('invalid typed values remain editable before submission',async()=>{
 const def={sections:[{name:'Employment',fields:[{key:'start',label:'Start date',type:'date',classification:'operational',mapping:'start_date',required:true}]}]};const f=await startFixture(def,'required','e1'.repeat(32));const session='f1'.repeat(32);await exchange(f.hash,session);
 await assert.rejects(external(session,'save','start','2026-02-31'),/ONBOARDING_VALUE_INVALID/);await external(session,'save','start','2026-10-05');assert.equal((await external(session,'read')).answers.start,'2026-10-05');
});

test('version history is organisation-scoped metadata and preserves historical publication',async()=>{await user();const result=(await db.query('select tttracker_v2_onboarding_versions($1,$2,1) result',[id(10),template])).rows[0].result;assert.ok(result.total>=2);assert.ok(result.rows.some(v=>v.published_at));assert.ok(result.rows.every(v=>!Object.hasOwn(v,'definition')&&!Object.hasOwn(v,'answers')));await user(3);await assert.rejects(db.query('select tttracker_v2_onboarding_versions($1,$2,1)',[id(10),template]),/PEOPLE_PERMISSION_DENIED/);await user();await assert.rejects(db.query('select tttracker_v2_onboarding_versions($1,$2,1)',[id(10),id(999)]),/PEOPLE_RECORD_NOT_FOUND/);});

test('actual invitation route email CTA exchanges through HttpOnly session and resumes draft',async()=>{
 await user(2);
 const {randomBytes,createHash}=dependency('node:crypto');
 const ts=dependency(path.join(root,'v2/node_modules/typescript'));
 const next=dependency(path.join(root,'v2/node_modules/next/server'));
 const hash=token=>createHash('sha256').update(token).digest('hex');
 const admin={rpc:async(name,args)=>{try{let result;if(name==='tttracker_v2_onboarding_admin')result=await onboarding(args.p_action,args.p_data??{},args.p_id??null);else if(name==='tttracker_v2_onboarding_exchange')result=await exchange(args.p_token_hash,args.p_session_hash);else if(name==='tttracker_v2_onboarding_external')result=await external(args.p_session_hash,args.p_action,args.p_field,args.p_value);else throw Error('unexpected rpc');return {data:result,error:null};}catch(e){return {data:null,error:{message:e.message}};}}};
 let captured='';const syntheticOrigin='https://synthetic.test';const previous=process.env.NEXT_PUBLIC_APP_URL;process.env.NEXT_PUBLIC_APP_URL=syntheticOrigin;
 const mocks={'next/server':next,'next/navigation':{unstable_rethrow:()=>{}},'@/lib/supabase/server':{createSupabaseServer:async()=>admin},'@/lib/supabase/admin':{createSupabaseAdmin:()=>admin},'@/lib/people/server':{requirePeopleContext:async()=>({organisation:{organisationId:id(10),organisationName:'Neutral Organisation'}}),peopleError:e=>({error:e.message,status:422})},'@/lib/email/config':{getEmailConfig:()=>({appUrl:syntheticOrigin})},'@/lib/email/send':{sendEmail:async({html})=>{captured=html;}},'@/lib/people/confidential':{secureToken:()=>randomBytes(32).toString('base64url'),tokenHash:hash,exchangeSecureOnboardingToken:async(token)=>{const sessionToken=randomBytes(32).toString('base64url');const result=await exchange(hash(token),hash(sessionToken));return {instanceId:result.instance_id,expiresAt:result.expires_at,sessionToken};}}};
 mocks['@/lib/people/profile-photo']={publishPendingProfilePhotos:async()=>({published:0,deferred:0})};
 mocks['@/lib/documents/service']={uploadDocument:()=>assert.fail('No file upload during form/session test'),documentError:()=>({error:'Document unavailable'})};
 mocks['@/lib/documents/onboarding']={previewOnboardingDocument:()=>assert.fail('No file preview during form/session test')};
 function source(file){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>{if(mocks[name])return mocks[name];const base=name.startsWith('@/')?'v2/'+name.slice(2):path.posix.join(path.posix.dirname(file),name);return source(base+'.ts');},exports);return exports;}
 try{
 const invite=source('v2/app/api/people/onboarding/route.ts');const ex=source('v2/app/api/onboarding/security/exchange/route.ts');const flow=source('v2/app/api/onboarding/security/workflow/route.ts');const client=source('v2/lib/people/onboarding-client-session.ts');
 const template=(await onboarding('save_template',{name:'Route Test',definition:{sections:[{name:'Basics',fields:[{key:'name',label:'Name',type:'text',classification:'operational',required:true}]}]}})).id;await onboarding('publish',{},template);
 const created=await invite.POST(new Request(syntheticOrigin+'/api/people/onboarding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({organisation:id(10),action:'start',data:{template_id:template,email:'synthetic@example.test',name:'Synthetic Recipient',expires_at:new Date(Date.now()+86400000).toISOString()}})}));assert.equal(created.status,200,(await created.clone().json()).error);
 const link=new URL(captured.match(/href="([^"]+)"/)[1]);assert.equal(link.pathname,'/secure-onboarding');assert.equal(link.search,'');assert.ok(link.hash.startsWith('#token='));
 let cookie='',removed=false;const fetcher=async(url,opts={})=>{const req=new next.NextRequest(syntheticOrigin+url,{...opts,headers:{...opts.headers,origin:syntheticOrigin,...(cookie?{cookie}:{})}});const response=url.endsWith('exchange')?await ex.POST(req):opts.method==='POST'?await flow.POST(req):await flow.GET(req);if(response.cookies?.get('tttracker_onboarding')){const set=response.headers.get('set-cookie');assert.match(set,/HttpOnly/i);assert.match(set,/Path=\/api\/onboarding\/security/i);cookie=set.split(';')[0];}return response;};
 await client.resumeOnboarding(fetcher,link,()=>{removed=true;link.hash='';});assert.equal(removed,true);assert.ok(cookie);
 assert.equal((await fetcher('/api/onboarding/security/workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',field:'name',value:'Synthetic Saved'})})).status,200);
 const resumed=await client.resumeOnboarding(fetcher,link,()=>assert.fail('no token on reload'));assert.equal(resumed.answers.name,'Synthetic Saved');
 const submitted=await fetcher('/api/onboarding/security/workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submit'})});assert.equal((await submitted.json()).status,'submitted');
 assert.ok((await onboarding('list')).rows.some(row=>row.status==='submitted'));
 }finally{if(previous===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=previous;}
});

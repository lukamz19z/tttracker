import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
let db;const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
before(async()=>{db=new PGlite();await db.exec(`create schema auth;create schema private;create function private.tttracker_v2_has_permission(uuid,text) returns boolean language sql as $$select false$$;create function private.tttracker_v2_is_project_member(uuid) returns boolean language sql as $$select false$$;create table public.v2_person_types(organisation_id uuid,id uuid,unique(organisation_id,id));create table private.v2_secure_onboarding_instances(organisation_id uuid,person_id uuid,status text,created_by uuid);create role anon;create role authenticated;create role service_role;create table auth.users(id uuid primary key);create table public.organisations(id uuid primary key);create table public.v2_resources(id uuid primary key,resource_key text);create table public.v2_permissions(resource_id uuid,permission_code text unique,action_key text,name text,unique(resource_id,action_key));create table public.v2_people(organisation_id uuid,id uuid,display_name text,employee_number text,relationship_type_id uuid,unique(organisation_id,id));create table public.v2_projects(organisation_id uuid,id uuid,name text,code text,project_number text,unique(organisation_id,id));create table public.v2_people_documents(organisation_id uuid,id uuid,person_id uuid,created_by uuid,unique(organisation_id,id));insert into public.organisations values('${id(1)}'),('${id(2)}');insert into auth.users values('${id(3)}');insert into v2_resources values('${id(4)}','organisation.settings');`);await db.exec(fs.readFileSync(new URL('../migrations/20261005200000_organisation_sharepoint_integration.sql',import.meta.url),'utf8'));await db.exec(fs.readFileSync(new URL('../migrations/20261005210000_organisation_xero_integration.sql',import.meta.url),'utf8'));await db.exec(fs.readFileSync(new URL('../migrations/20261005220000_integration_provider_job_leases.sql',import.meta.url),'utf8'));await db.exec(fs.readFileSync(new URL('../migrations/20261012110000_sharepoint_verified_wizard_state.sql',import.meta.url),'utf8'));await db.exec(fs.readFileSync(new URL('../migrations/20261012130000_sharepoint_locations_provisioning.sql',import.meta.url),'utf8'));await db.exec(fs.readFileSync(new URL('../migrations/20261012143000_sharepoint_worker_attempt_metadata.sql',import.meta.url),'utf8'));await db.exec(fs.readFileSync(new URL('../migrations/20261012160000_sharepoint_interactive_site_authorisation.sql',import.meta.url),'utf8'));});
after(async()=>{await db.close();});
test('migration applies and browser roles cannot query integration state',async()=>{await db.exec('set role authenticated');await assert.rejects(db.query('select * from public.v2_integration_oauth_states'),/permission denied/);await db.exec('reset role');});
test('composite references reject cross-organisation sites',async()=>{await db.query(`insert into v2_integrations(id,organisation_id,provider) values($1,$2,'sharepoint')`,[id(5),id(1)]);await assert.rejects(db.query(`insert into v2_sharepoint_sites(organisation_id,integration_id,site_id,site_url,site_name) values($1,$2,'s','https://example.sharepoint.com','Example')`,[id(2),id(5)]),/foreign key/);});
test('OAuth state consumption validates actor, expiry and one-time reuse',async()=>{await db.query(`insert into v2_integration_oauth_states(state_hash,organisation_id,integration_id,actor_id,provider,expires_at) values('synthetic-hash',$1,$2,$3,'sharepoint',now()+interval '5 minutes')`,[id(1),id(5),id(3)]);await assert.rejects(db.query(`select tttracker_v2_consume_integration_state('synthetic-hash',$1,$2,'sharepoint')`,[id(2),id(3)]),/STATE_INVALID/);await db.query(`select tttracker_v2_consume_integration_state('synthetic-hash',$1,$2,'sharepoint')`,[id(1),id(3)]);await assert.rejects(db.query(`select tttracker_v2_consume_integration_state('synthetic-hash',$1,$2,'sharepoint')`,[id(1),id(3)]),/STATE_INVALID/);});

const envelope={ciphertext:'synthetic-ciphertext',nonce:'synthetic-nonce',tag:'synthetic-tag',encrypted_dek:'wrapped-synthetic',key_arn:'example-key',environment:'development',format:1};
test('Xero credentials are service-only and reject plaintext shadow fields',async()=>{await db.exec('set role authenticated');await assert.rejects(db.query('select * from v2_xero_credentials'),/permission denied/);await db.exec('reset role');await db.query(`insert into v2_integrations(id,organisation_id,provider) values($1,$2,'xero')`,[id(6),id(1)]);await assert.rejects(db.query(`insert into v2_xero_credentials(organisation_id,integration_id,generation,envelope,expires_at,scopes) values($1,$2,1,$3,now(),'{}')`,[id(1),id(6),JSON.stringify({...envelope,refresh_token:'SYNTHETIC-NOT-ALLOWED'})]),/check constraint/);});
test('atomic credential generation + exclusive lease prevents concurrent refresh and stale commits',async()=>{const expiry=new Date(Date.now()+3600000).toISOString();const stored=await db.query('select tttracker_v2_xero_store_credentials($1,$2,0,$3,$4,$5) ok',[id(1),id(6),JSON.stringify(envelope),expiry,['openid']]);assert.equal(stored.rows[0].ok,true);const claim=await db.query('select tttracker_v2_xero_refresh_claim($1,$2,1,$3) ok',[id(1),id(6),id(7)]);assert.equal(claim.rows[0].ok,true);const other=await db.query('select tttracker_v2_xero_refresh_claim($1,$2,1,$3) ok',[id(1),id(6),id(8)]);assert.equal(other.rows[0].ok,false);const cross=await db.query('select tttracker_v2_xero_refresh_commit($1,$2,1,$3,$4,$5,$6) ok',[id(2),id(6),id(7),JSON.stringify(envelope),expiry,['openid']]);assert.equal(cross.rows[0].ok,false);const committed=await db.query('select tttracker_v2_xero_refresh_commit($1,$2,1,$3,$4,$5,$6) ok',[id(1),id(6),id(7),JSON.stringify(envelope),expiry,['openid']]);assert.equal(committed.rows[0].ok,true);const stale=await db.query('select tttracker_v2_xero_refresh_commit($1,$2,1,$3,$4,$5,$6) ok',[id(1),id(6),id(7),JSON.stringify(envelope),expiry,['openid']]);assert.equal(stale.rows[0].ok,false);assert.equal((await db.query('select generation from v2_xero_credentials where integration_id=$1',[id(6)])).rows[0].generation,2);});

test('provider job lease ownership rejects simultaneous and cross-tenant workers',async()=>{await db.exec(`insert into v2_sharepoint_sites(id,organisation_id,integration_id,site_id,site_url,site_name) values('${id(9)}','${id(1)}','${id(5)}','synthetic-site','https://example.sharepoint.com','Example');insert into v2_integration_access_profiles(id,organisation_id,name,read_capability,manage_capability,classification) values('${id(10)}','${id(1)}','Operational','integrations.sharepoint.view','integrations.sharepoint.manage','operational');insert into v2_document_destinations(id,organisation_id,site_id,name,code,context,filename_template,access_profile_id) values('${id(11)}','${id(1)}','${id(9)}','Synthetic','synthetic','training','synthetic.pdf','${id(10)}');insert into v2_people_documents(organisation_id,id) values('${id(1)}','${id(12)}');insert into v2_document_provider_jobs(id,organisation_id,destination_id,document_id,fingerprint) values('${id(13)}','${id(1)}','${id(11)}','${id(12)}','synthetic-fingerprint');`);await assert.rejects(db.query('select tttracker_v2_claim_document_job($1,$2)',[id(2),id(13)]),/JOB_BUSY/);const claimed=await db.query('select tttracker_v2_claim_document_job($1,$2) job',[id(1),id(13)]);assert.ok(claimed.rows[0].job.lease_id);await assert.rejects(db.query('select tttracker_v2_claim_document_job($1,$2)',[id(1),id(13)]),/JOB_BUSY/);});

test('wizard schema separates verified tenant proof and rejects cross-organisation primary-site references',async()=>{
 await db.query(`insert into v2_integrations(id,organisation_id,provider) values($1,$2,'sharepoint')`,[id(12),id(2)]);
 const site=(await db.query(`insert into v2_sharepoint_sites(organisation_id,integration_id,site_id,site_url,site_name) values($1,$2,'synthetic-site','https://example.sharepoint.com/sites/Synthetic','Synthetic') returning id`,[id(2),id(12)])).rows[0];
 await assert.rejects(db.query('update v2_integrations set setup_site_id=$1 where id=$2',[site.id,id(5)]),/foreign key/);
 assert.equal((await db.query('select microsoft_tenant_verified_at from v2_integrations where id=$1',[id(12)])).rows[0].microsoft_tenant_verified_at,null);
 await db.exec(fs.readFileSync(new URL('../migrations/20261012110000_sharepoint_verified_wizard_state.sql',import.meta.url),'utf8'));
});


test('candidate sites remain unverified and locations support independent libraries with tenant-bound routing',async()=>{
 const site=(await db.query(`insert into v2_sharepoint_sites(organisation_id,integration_id,site_url,site_name) values($1,$2,'https://example.sharepoint.com/sites/Candidate','Candidate') returning *`,[id(1),id(5)])).rows[0];
 assert.equal(site.site_id,null);assert.equal(site.permission_status,'candidate');assert.equal(site.verified_at,null);
 for(let n=1;n<=3;n++)await db.query(`insert into v2_sharepoint_locations(id,organisation_id,site_id,name,drive_id,drive_name) values($1,$2,$3,$4,$4,$4)`,[id(100+n),id(1),site.id,'Library '+n]);
 assert.equal((await db.query('select count(*)::int n from v2_sharepoint_locations where site_id=$1',[site.id])).rows[0].n,3);
 await assert.rejects(db.query(`insert into v2_sharepoint_locations(organisation_id,site_id,name,drive_id,drive_name) values($1,$2,'Foreign','drive','Documents')`,[id(2),site.id]),/foreign key/);
 await assert.rejects(db.query('update v2_document_destinations set location_id=$1 where id=$2',[id(101),id(11)]),/foreign key/);
 await db.query('update v2_document_destinations set site_id=$1,location_id=$2 where id=$3',[site.id,id(101),id(11)]);
 await db.query(`insert into v2_people(organisation_id,id,display_name) values($1,$2,'Synthetic Person')`,[id(1),id(110)]);
 await db.query(`select tttracker_v2_queue_folder($1,$2,'person',$3,$4)`,[id(1),id(11),id(110),id(3)]);
 await db.query(`select tttracker_v2_queue_folder($1,$2,'person',$3,$4)`,[id(1),id(11),id(110),id(3)]);
 assert.equal((await db.query('select count(*)::int n from v2_sharepoint_folder_jobs')).rows[0].n,1);
 const claim=(await db.query(`select tttracker_v2_claim_folder_job($1,$2,'person') job`,[id(1),id(3)])).rows[0].job;assert.ok(claim.lease_id);assert.ok(claim.last_attempt_at);
 assert.equal((await db.query(`select tttracker_v2_claim_folder_job($1,$2,'person') job`,[id(1),id(3)])).rows[0].job,null);
 assert.equal((await db.query(`select tttracker_v2_folder_worker_permission($1,$2,'person',$3,$4) ok`,[id(1),id(3),id(110),id(11)])).rows[0].ok,false);
 await db.query(`select tttracker_v2_queue_folder($1,$2,'person',$3,$4)`,[id(1),id(11),id(110),id(3)]);
 await db.query(`select tttracker_v2_finish_folder_job($1,$2,$3,'existing',null,60)`,[id(1),claim.id,claim.lease_id]);
 assert.equal((await db.query('select status from v2_sharepoint_folder_jobs where id=$1',[claim.id])).rows[0].status,'pending');
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from v2_sharepoint_folder_links'),/permission denied/);await db.exec('reset role');
});


test('canonical creation events queue only configured rules and never perform Graph work',async()=>{
 await db.query(`update v2_integrations set microsoft_tenant_verified_at=now(),connected_by=$1 where id=$2`,[id(3),id(5)]);
 await db.query(`update v2_document_destinations set creation_policy='manual',rename_policy='keep' where id=$1`,[id(11)]);
 await db.query(`insert into v2_people(organisation_id,id,display_name) values($1,$2,'No automation')`,[id(1),id(120)]);
 assert.equal((await db.query('select count(*)::int n from v2_sharepoint_folder_jobs where entity_id=$1',[id(120)])).rows[0].n,0);
 await db.query(`update v2_document_destinations set creation_policy='person_created',rename_policy='rename' where id=$1`,[id(11)]);
 await db.query(`insert into v2_people(organisation_id,id,display_name) values($1,$2,'Synthetic Person')`,[id(1),id(121)]);
 await db.query(`update v2_people set display_name='Renamed Person' where id=$1`,[id(121)]);
 const jobs=await db.query('select status,revision from v2_sharepoint_folder_jobs where entity_id=$1',[id(121)]);assert.equal(jobs.rows.length,1);assert.equal(jobs.rows[0].status,'pending');assert.equal(jobs.rows[0].revision,2);
 await db.query(`update v2_document_destinations set context='projects',creation_policy='project_created' where id=$1`,[id(11)]);
 await db.query(`insert into v2_projects(organisation_id,id,name,code) values($1,$2,'Synthetic Project','P-001')`,[id(1),id(122)]);
 assert.equal((await db.query(`select count(*)::int n from v2_sharepoint_folder_jobs where entity_id=$1 and entity_kind='project'`,[id(122)])).rows[0].n,1);
 // Provider errors change the leased job, never delete the canonical project.
 const claimed=(await db.query(`select tttracker_v2_claim_folder_job($1,$2,'project') job`,[id(1),id(3)])).rows[0].job;
 await db.query(`select tttracker_v2_finish_folder_job($1,$2,$3,null,'INTEGRATION_RATE_LIMITED',45)`,[id(1),claimed.id,claimed.lease_id]);
 assert.equal((await db.query('select status from v2_sharepoint_folder_jobs where id=$1',[claimed.id])).rows[0].status,'failed');
 assert.equal((await db.query('select count(*)::int n from v2_projects where id=$1',[id(122)])).rows[0].n,1);
});


test('interactive setup extends service-only state; purpose, organisation, actor and expiry cannot be reused',async()=>{
 await db.query(`insert into v2_integration_oauth_states(state_hash,organisation_id,integration_id,actor_id,provider,expires_at,expected_tenant,setup_operation_id,setup_payload) values('setup-hash',$1,$2,$3,'sharepoint_setup',now()+interval '5 minutes','tenant-a',$4,$5)`,[id(1),id(5),id(3),id(190),JSON.stringify({sites:[{id:id(9)}],operation:'authorise'})]);
 for(const [org,actor,provider] of [[id(2),id(3),'sharepoint_setup'],[id(1),id(2),'sharepoint_setup'],[id(1),id(3),'sharepoint']]) await assert.rejects(db.query(`select tttracker_v2_consume_integration_state('setup-hash',$1,$2,$3)`,[org,actor,provider]),/STATE_INVALID/);
 const row=(await db.query(`select tttracker_v2_consume_integration_state('setup-hash',$1,$2,'sharepoint_setup') state`,[id(1),id(3)])).rows[0].state;assert.equal(row.expected_tenant,'tenant-a');assert.equal(row.setup_payload.operation,'authorise');assert.equal(row.setup_results,null);
 await assert.rejects(db.query(`select tttracker_v2_consume_integration_state('setup-hash',$1,$2,'sharepoint_setup')`,[id(1),id(3)]),/STATE_INVALID/);
 await db.query(`update v2_sharepoint_sites set permission_status='authorised',runtime_permission_id='safe-permission-reference',verified_at=null where id=$1`,[id(9)]);
 await db.exec('set role authenticated');await assert.rejects(db.query('select setup_payload,setup_results from v2_integration_oauth_states'),/permission denied/);await db.exec('reset role');
 await db.exec(fs.readFileSync(new URL('../migrations/20261012160000_sharepoint_interactive_site_authorisation.sql',import.meta.url),'utf8'));
});

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db;
before(async () => {
  db = new PGlite();
  await db.exec(`create schema auth;create schema private;create schema storage;create role anon;create role authenticated;create role service_role;
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table auth.users(id uuid primary key);insert into auth.users values('${id(3)}'),('${id(4)}');
  create function private.tttracker_v2_require_people_permission(uuid,text) returns void language plpgsql as $$begin if auth.uid() is distinct from '${id(3)}'::uuid then raise exception 'PEOPLE_PERMISSION_DENIED';end if;end$$;
  create function private.tttracker_v2_is_active_org_member(uuid,uuid) returns boolean language sql as $$select $1='${id(1)}'::uuid and $2='${id(3)}'::uuid$$;
  create function private.tttracker_v2_has_permission(uuid,text) returns boolean language sql as $$select auth.uid()='${id(3)}'::uuid$$;
  create table public.v2_permissions(permission_code text,is_active boolean);insert into v2_permissions values('training.edit',true),('training.view',true);
  create table public.v2_people_documents(id uuid primary key,organisation_id uuid,person_id uuid not null,created_by uuid not null,evidence_group_id uuid,
   name text,side text,resolved_folder text,provider text default 'internal',storage_key text,content_type text,size_bytes integer,created_at timestamptz default now(),unique(organisation_id,id));
  create table public.v2_projects(organisation_id uuid,id uuid,unique(organisation_id,id));
  create table public.v2_sharepoint_locations(organisation_id uuid,id uuid,unique(organisation_id,id));
  create table public.v2_document_destinations(organisation_id uuid,id uuid,location_id uuid,unique(organisation_id,id));
  create table public.v2_document_provider_jobs(id uuid primary key,organisation_id uuid,document_id uuid not null,destination_id uuid,fingerprint text,
   status text,site_id text,drive_id text,drive_item_id text,web_url text,etag text,synced_at timestamptz);
  create table public.v2_training_records(organisation_id uuid,id uuid,person_id uuid,review_status text,evidence_group_id uuid);
  create table public.v2_people_audit(organisation_id uuid,person_id uuid,actor_id uuid,action text,data_area text,target_id uuid);
  create table storage.objects(bucket_id text,name text);
  create table private.v2_secure_onboarding_instances(organisation_id uuid,id uuid,person_id uuid,relationship_type_id uuid);
  insert into private.v2_secure_onboarding_instances values('${id(1)}','${id(40)}',null,null);
  create function public.tttracker_v2_onboarding_external(p_session_hash text,p_action text,p_field text default null,p_value jsonb default null)
  returns jsonb language plpgsql as $$declare i private.v2_secure_onboarding_instances;f jsonb;begin
   select * into i from private.v2_secure_onboarding_instances where id='${id(40)}';f:=jsonb_build_object('classification',p_field);
   if p_action='upload_scope' then return jsonb_build_object('organisation_id',i.organisation_id,'instance_id',i.id,'field',f);end if;
   if not exists(select 1 from storage.objects where bucket_id='v2-people-evidence' and name=p_value->>'storage_key') then raise exception 'ONBOARDING_FIELD_INVALID';end if;
   return jsonb_build_object('saved',true);
  end$$;
  insert into v2_sharepoint_locations values('${id(1)}','${id(10)}'),('${id(2)}','${id(11)}');
  insert into v2_document_destinations values('${id(1)}','${id(12)}','${id(10)}');
  insert into v2_people_documents(id,organisation_id,person_id,created_by,name,storage_key) values('${id(20)}','${id(1)}','${id(5)}','${id(3)}','Legacy.pdf','legacy-key');
  insert into v2_document_provider_jobs(id,organisation_id,document_id,destination_id,status,site_id,drive_id,drive_item_id,synced_at)
   values('${id(21)}','${id(1)}','${id(20)}','${id(12)}','synced','site-a','drive-a','existing-item',now());`);
  await db.exec(fs.readFileSync(new URL('../migrations/20261013120000_central_sharepoint_documents.sql', import.meta.url), 'utf8'));
});
after(async () => { await db.close(); });

test('folder rename updates only matching organisation/entity paths and preserves stable file IDs', async () => {
  await db.query(`update v2_people_documents set destination_id=$1,resolved_folder='Employees/Old/Training' where id=$2`,[id(10),id(20)]);
  await db.query('select tttracker_v2_sync_folder_document_paths($1,$2,$3,$4,$5,$6)',[id(2),id(10),'person',id(5),'Employees/Old','Employees/New']);
  assert.equal((await db.query('select resolved_folder from v2_people_documents where id=$1',[id(20)])).rows[0].resolved_folder,'Employees/Old/Training');
  await db.query('select tttracker_v2_sync_folder_document_paths($1,$2,$3,$4,$5,$6)',[id(1),id(10),'person',id(5),'Employees/Old','Employees/New']);
  const row=(await db.query('select resolved_folder,sharepoint_item_id from v2_people_documents where id=$1',[id(20)])).rows[0];
  assert.equal(row.resolved_folder,'Employees/New/Training');assert.equal(row.sharepoint_item_id,'existing-item');
});

test('migration preserves already-published references without copying or deleting files', async () => {
  const d = (await db.query(`select * from v2_people_documents where id=$1`, [id(20)])).rows[0];
  assert.equal(d.provider, 'sharepoint'); assert.equal(d.sharepoint_item_id, 'existing-item'); assert.equal(d.storage_key, 'legacy-key');
});
test('metadata destination FK rejects cross-organisation references', async () => {
  await assert.rejects(db.query(`insert into v2_people_documents(id,organisation_id,provider,destination_id) values($1,$2,'sharepoint',$3)`, [id(22),id(1),id(11)]), /foreign key/);
});
test('one physical certificate links to the shared First Aid and CPR group; explicit deny wins', async () => {
  await db.query(`insert into v2_training_records values($1,$2,$3,'pending_review',$4),($1,$5,$3,'pending_review',$4)`, [id(1),id(30),id(5),id(31),id(32)]);
  await db.query(`insert into v2_people_documents(id,organisation_id,person_id,created_by,provider,document_context,entity_type,entity_id,sharepoint_item_id) values($1,$2,$3,$4,'sharepoint','training','training',$5,'one-certificate')`, [id(33),id(1),id(5),id(3),id(30)]);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [id(4)]);
  await assert.rejects(db.query('select tttracker_v2_attach_training_document($1,$2,$3)', [id(1),id(33),id(30)]), /PERMISSION_DENIED/);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [id(3)]);
  await db.query('select tttracker_v2_attach_training_document($1,$2,$3)', [id(1),id(33),id(30)]);
  assert.equal((await db.query('select count(*)::int n from v2_training_records r join v2_people_documents d on d.organisation_id=r.organisation_id and d.evidence_group_id=r.evidence_group_id where d.id=$1', [id(33)])).rows[0].n, 2);
  await assert.rejects(db.query('select tttracker_v2_attach_training_document($1,$2,$3)', [id(2),id(33),id(30)]), /NOT_EDITABLE/);
});
test('Onboarding requires a same-organisation SharePoint reference with matching field classification', async () => {
  const key = `${id(1)}/onboarding/${id(40)}/${id(41)}`;
  await db.query(`insert into v2_people_documents(id,organisation_id,provider,document_context,entity_type,entity_id,sharepoint_item_id,storage_key) values($1,$2,'sharepoint','onboarding','onboarding',$3,'onboarding-item',$4)`, [id(41),id(1),id(40),key]);
  assert.equal((await db.query(`select tttracker_v2_onboarding_external('session','document','operational',$1) result`, [JSON.stringify({storage_key:key})])).rows[0].result.saved, true);
  await assert.rejects(db.query(`select tttracker_v2_onboarding_external('session','document','private',$1)`, [JSON.stringify({storage_key:key})]), /FIELD_INVALID/);
  await assert.rejects(db.query(`select tttracker_v2_onboarding_external('session','document','operational',$1)`, [JSON.stringify({storage_key:'foreign/key'})]), /FIELD_INVALID/);
  const scope = (await db.query(`select tttracker_v2_onboarding_external('session','upload_scope','operational') result`)).rows[0].result;
  assert.ok('person_id' in scope); assert.equal(scope.organisation_id,id(1));
});
test('Onboarding completion inherits the same item reference without another physical upload', async () => {
  const key = `${id(1)}/onboarding/${id(40)}/${id(41)}`;
  await db.query(`insert into v2_people_documents(id,organisation_id,person_id,created_by,storage_key) values($1,$2,$3,$4,$5)`, [id(42),id(1),id(5),id(3),key]);
  const result=(await db.query('select provider,source_document_id,sharepoint_item_id from v2_people_documents where id=$1',[id(42)])).rows[0];
  assert.equal(result.provider,'sharepoint'); assert.equal(result.source_document_id,id(41)); assert.equal(result.sharepoint_item_id,'onboarding-item');
});
test('browser cannot directly read canonical generic/private document metadata or invoke worker authority', async () => {
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from v2_people_documents'),/permission denied/);
  await assert.rejects(db.query('select tttracker_v2_document_worker_authority($1,$2,$3)',[id(1),id(3),id(33)]),/permission denied/);
  await db.exec('reset role');
});
test('worker rechecks current actor and restores request identity', async () => {
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id(4)]);
  const result=(await db.query('select tttracker_v2_document_worker_authority($1,$2,$3) result',[id(1),id(3),id(33)])).rows[0].result;
  assert.equal(result['training.edit'],true);
  assert.equal((await db.query('select auth.uid() id')).rows[0].id,id(4));
  assert.equal((await db.query('select tttracker_v2_document_worker_authority($1,$2,$3) result',[id(1),id(4),id(33)])).rows[0].result,null);
});

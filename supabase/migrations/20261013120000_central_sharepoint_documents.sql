begin;
-- Extend the existing canonical evidence identity; do not copy operational data
-- into a new document database. Existing evidence-group review links are retained.
alter table public.v2_people_documents
 alter column person_id drop not null,
 alter column created_by drop not null,
 add column if not exists document_context text not null default 'training',
 add column if not exists entity_type text,
 add column if not exists entity_id uuid,
 add column if not exists project_id uuid,
 add column if not exists asset_id uuid,
 add column if not exists destination_id uuid,
 add column if not exists setup_rule_id uuid,
 add column if not exists sharepoint_site_id text,
 add column if not exists sharepoint_drive_id text,
 add column if not exists sharepoint_item_id text,
 add column if not exists sharepoint_parent_item_id text,
 add column if not exists sharepoint_web_url text,
 add column if not exists sharepoint_etag text,
 add column if not exists published_at timestamptz,
 add column if not exists updated_at timestamptz not null default now(),
 add column if not exists source_document_id uuid,
 add column if not exists superseded_by_document_id uuid,
 add column if not exists classification text not null default 'operational' check(classification in ('operational','private','confidential'));
alter table public.v2_people_documents
 add constraint v2_document_project_owner foreign key(organisation_id,project_id) references public.v2_projects(organisation_id,id),
 add constraint v2_document_destination_owner foreign key(organisation_id,destination_id) references public.v2_sharepoint_locations(organisation_id,id),
 add constraint v2_document_rule_owner foreign key(organisation_id,setup_rule_id) references public.v2_document_destinations(organisation_id,id),
 add constraint v2_document_source_owner foreign key(organisation_id,source_document_id) references public.v2_people_documents(organisation_id,id),
 add constraint v2_document_superseded_owner foreign key(organisation_id,superseded_by_document_id) references public.v2_people_documents(organisation_id,id);
create index if not exists v2_document_entity on public.v2_people_documents(organisation_id,document_context,entity_type,entity_id);

-- Preserve files already published by the old staging/sync adapter. Prefer the
-- latest successful leased publication; do not upload/backfill file contents.
with latest as (
 select distinct on(j.organisation_id,j.document_id) j.*,r.location_id
 from public.v2_document_provider_jobs j join public.v2_document_destinations r
 on r.organisation_id=j.organisation_id and r.id=j.destination_id
 where j.status='synced' and j.drive_item_id is not null and r.location_id is not null
 order by j.organisation_id,j.document_id,j.synced_at desc,j.id
)
update public.v2_people_documents d set provider='sharepoint',destination_id=j.location_id,setup_rule_id=j.destination_id,
 sharepoint_site_id=j.site_id,sharepoint_drive_id=j.drive_id,sharepoint_item_id=j.drive_item_id,
 sharepoint_web_url=j.web_url,sharepoint_etag=j.etag,published_at=j.synced_at
from latest j where d.organisation_id=j.organisation_id and d.id=j.document_id and d.sharepoint_item_id is null;

-- Reuse the existing leased provider queue. Publication jobs keep source
-- identity/revision only, never generated PDF/image bytes or bearer tokens.
alter table public.v2_document_provider_jobs
 alter column document_id drop not null,
 add column if not exists source_kind text not null default 'legacy_sync' check(source_kind in ('legacy_sync','generated','migration')),
 add column if not exists source_context text,
 add column if not exists source_entity_type text,
 add column if not exists source_entity_id uuid,
 add column if not exists source_revision text,
 add column if not exists actor_id uuid references auth.users(id),
 add column if not exists publication_document_id uuid;
alter table public.v2_document_provider_jobs add constraint v2_publication_document_owner
 foreign key(organisation_id,publication_document_id) references public.v2_people_documents(organisation_id,id);
create unique index if not exists v2_generated_publication_revision on public.v2_document_provider_jobs
 (organisation_id,source_context,source_entity_type,source_entity_id,source_revision);

-- Onboarding completion already creates training evidence relationships. Copy
-- references to the same physical item, never upload the certificate again.
create or replace function private.tttracker_v2_inherit_document_reference()
returns trigger language plpgsql security definer set search_path='' as $$
declare d public.v2_people_documents;
begin
 if new.provider='internal' then
  select * into d from public.v2_people_documents where organisation_id=new.organisation_id
   and storage_key=new.storage_key and provider='sharepoint' and sharepoint_item_id is not null
   order by created_at,id limit 1;
  if found then
   new.provider:='sharepoint';new.source_document_id:=d.id;
   new.destination_id:=d.destination_id;new.setup_rule_id:=d.setup_rule_id;
   new.sharepoint_site_id:=d.sharepoint_site_id;new.sharepoint_drive_id:=d.sharepoint_drive_id;
   new.sharepoint_item_id:=d.sharepoint_item_id;new.sharepoint_parent_item_id:=d.sharepoint_parent_item_id;
   new.sharepoint_web_url:=d.sharepoint_web_url;new.sharepoint_etag:=d.sharepoint_etag;
   new.published_at:=d.published_at;new.classification:=d.classification;
  end if;
 end if;
 return new;
end $$;
create trigger v2_inherit_document_reference before insert on public.v2_people_documents
for each row execute function private.tttracker_v2_inherit_document_reference();

-- Commit an uploaded certificate to its canonical, still-editable training
-- group atomically. Session RBAC and organisation ownership are checked again.
create or replace function public.tttracker_v2_attach_training_document(p_org uuid,p_document uuid,p_record uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.v2_training_records;d public.v2_people_documents;
begin
 perform private.tttracker_v2_require_people_permission(p_org,'training.edit');
 select * into r from public.v2_training_records where organisation_id=p_org and id=p_record for update;
 if not found or r.review_status not in ('pending_review','changes_required') then raise exception 'TRAINING_DOCUMENT_NOT_EDITABLE';end if;
 select * into d from public.v2_people_documents where organisation_id=p_org and id=p_document for update;
 if not found or d.created_by is distinct from auth.uid() or d.person_id is distinct from r.person_id
  or d.provider<>'sharepoint' or d.sharepoint_item_id is null or d.document_context<>'training'
  or d.classification<>'operational' or d.entity_id is distinct from r.id
 then raise exception 'PEOPLE_RELATIONSHIP_INVALID';end if;
 update public.v2_people_documents set evidence_group_id=r.evidence_group_id where organisation_id=p_org and id=p_document;
 insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area,target_id)
 values(p_org,r.person_id,auth.uid(),'document','operational',p_document);
 return jsonb_build_object('id',p_document);
end $$;
revoke all on function public.tttracker_v2_attach_training_document(uuid,uuid,uuid) from public,anon;
grant execute on function public.tttracker_v2_attach_training_document(uuid,uuid,uuid) to authenticated;

create or replace function public.tttracker_v2_document_worker_authority(p_org uuid,p_actor uuid,p_document uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous_claims text;previous_sub text;permissions jsonb;begin
 previous_claims:=current_setting('request.jwt.claims',true);previous_sub:=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claims',json_build_object('sub',p_actor)::text,true);perform set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
 if p_actor is null or not private.tttracker_v2_is_active_org_member(p_org,p_actor)
  or not private.tttracker_v2_has_permission(p_org,'integrations.sharepoint.manage')
  or not private.tttracker_v2_has_permission(p_org,'training.edit') or not private.tttracker_v2_has_permission(p_org,'training.view')
  or not exists(select 1 from public.v2_people_documents where organisation_id=p_org and id=p_document and document_context='training' and classification='operational')
 then permissions:=null;
 else
  select coalesce(jsonb_object_agg(permission_code,private.tttracker_v2_has_permission(p_org,permission_code)),'{}') into permissions from public.v2_permissions where is_active;
 end if;
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
 return permissions;
 exception when others then
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);return null;
end $$;
revoke all on function public.tttracker_v2_document_worker_authority(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.tttracker_v2_document_worker_authority(uuid,uuid,uuid) to service_role;

-- Generated adapters are closed by default. Only the implemented Project
-- entity boundary is enabled; new entity renderers must add their own canonical
-- record checks here before registration in the scheduler.
create or replace function public.tttracker_v2_publication_worker_authority(p_org uuid,p_actor uuid,p_job uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous_claims text;previous_sub text;permissions jsonb;j public.v2_document_provider_jobs;cap text;begin
 previous_claims:=current_setting('request.jwt.claims',true);previous_sub:=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claims',json_build_object('sub',p_actor)::text,true);perform set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
 select * into j from public.v2_document_provider_jobs where organisation_id=p_org and id=p_job and source_kind='generated' and actor_id=p_actor;
 select a.manage_capability into cap from public.v2_document_destinations r join public.v2_integration_access_profiles a
  on a.organisation_id=r.organisation_id and a.id=r.access_profile_id where r.organisation_id=p_org and r.id=j.destination_id and r.is_active and a.classification='operational';
 if j.id is null or p_actor is null or not private.tttracker_v2_is_active_org_member(p_org,p_actor) or cap is null
  or not private.tttracker_v2_has_permission(p_org,cap) or j.source_context<>'projects' or j.source_entity_type<>'project'
  or not private.tttracker_v2_has_permission(p_org,'projects.edit') or not private.tttracker_v2_is_project_member(j.source_entity_id)
  or not exists(select 1 from public.v2_projects where organisation_id=p_org and id=j.source_entity_id)
 then permissions:=null;
 else select coalesce(jsonb_object_agg(permission_code,private.tttracker_v2_has_permission(p_org,permission_code)),'{}') into permissions from public.v2_permissions where is_active;
 end if;
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);return permissions;
 exception when others then
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);return null;
end $$;
revoke all on function public.tttracker_v2_publication_worker_authority(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.tttracker_v2_publication_worker_authority(uuid,uuid,uuid) to service_role;

create or replace function public.tttracker_v2_sync_folder_document_paths(p_org uuid,p_location uuid,p_kind text,p_entity uuid,p_old text,p_new text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_old is null or p_old='' or p_new is null or p_new='' or p_kind not in ('person','project') then raise exception 'INTEGRATION_PATH_INVALID';end if;
 update public.v2_people_documents set resolved_folder=p_new||substr(resolved_folder,length(p_old)+1),updated_at=now()
 where organisation_id=p_org and destination_id=p_location and provider='sharepoint'
 and ((p_kind='person' and person_id=p_entity) or (p_kind='project' and project_id=p_entity))
 and (resolved_folder=p_old or left(resolved_folder,length(p_old)+1)=p_old||'/');
end $$;
revoke all on function public.tttracker_v2_sync_folder_document_paths(uuid,uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.tttracker_v2_sync_folder_document_paths(uuid,uuid,text,uuid,text,text) to service_role;

-- Replace only the storage proof in the existing session/field-validated
-- onboarding RPC. All form, classification and review checks remain intact.
do $$ declare definition text;old_check text;new_check text;begin
 definition:=pg_get_functiondef('public.tttracker_v2_onboarding_external(text,text,text,jsonb)'::regprocedure);
 old_check:='not exists(select 1 from storage.objects where bucket_id=''v2-people-evidence'' and name=p_value->>''storage_key'')';
 new_check:='not exists(select 1 from public.v2_people_documents d where d.organisation_id=i.organisation_id and d.entity_type=''onboarding'' and d.entity_id=i.id and d.provider=''sharepoint'' and d.sharepoint_item_id is not null and d.storage_key=p_value->>''storage_key'' and d.classification=f->>''classification'')';
 if position(old_check in definition)=0 then raise exception 'Expected onboarding storage validation not found; inspect the deployed function before applying cutover';end if;
 execute replace(definition,old_check,new_check);
 definition:=pg_get_functiondef('public.tttracker_v2_onboarding_external(text,text,text,jsonb)'::regprocedure);
 execute replace(definition,
  'jsonb_build_object(''organisation_id'',i.organisation_id,''instance_id'',i.id,''field'',f)',
  'jsonb_build_object(''organisation_id'',i.organisation_id,''instance_id'',i.id,''person_id'',i.person_id,''relationship_type_id'',i.relationship_type_id,''field'',f)');
end $$;
-- Existing RLS is preserved; generic metadata must not gain direct browser access.
revoke all on public.v2_people_documents from anon,authenticated;
notify pgrst,'reload schema';
commit;

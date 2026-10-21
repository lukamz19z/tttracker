begin;
-- Person owns only the current reference. Canonical documents retain file metadata/history.
alter table public.v2_people add column if not exists current_profile_photo_id uuid;
alter table public.v2_people_documents
 add column if not exists photo_source text check(photo_source in ('onboarding','admin_upload','self_service','project_onboarding','migration')),
 add column if not exists photo_publication_pending boolean not null default false,
 add column if not exists photo_retry_after timestamptz not null default now();
do $$ begin
 if not exists(select 1 from pg_constraint where conname='v2_person_current_photo_owner') then
 alter table public.v2_people add constraint v2_person_current_photo_owner foreign key(organisation_id,current_profile_photo_id) references public.v2_people_documents(organisation_id,id);
 end if;
end $$;
create index if not exists v2_photo_pending on public.v2_people_documents(photo_retry_after) where photo_publication_pending;
insert into public.v2_resources(resource_key,name,module_key,resource_type) values('people.profile_photo','Person Profile Photos','people','document_library') on conflict(resource_key) do nothing;
insert into public.v2_permissions(resource_id,permission_code,action_key,name)
select r.id,'people.profile_photo.'||a.key,a.key,a.name from public.v2_resources r cross join (values
 ('view','View Person profile photos'),('manage','Manage Person profile photos'),('self_manage','Change own linked Person profile photo')) a(key,name)
where r.resource_key='people.profile_photo' on conflict(permission_code) do nothing;
-- No implicit role grants: existing denies and organisation policy remain authoritative.

create or replace function private.tttracker_v2_assign_profile_photo(p_org uuid,p_person uuid,p_document uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old_id uuid;d public.v2_people_documents;
begin
 select current_profile_photo_id into old_id from public.v2_people where organisation_id=p_org and id=p_person for update;
 if not found then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
 if p_document is not null then
 select * into d from public.v2_people_documents where organisation_id=p_org and id=p_document;
 if not found or d.person_id is distinct from p_person or d.entity_type<>'person_profile_photo' or d.document_context<>'profile_photos'
 or d.photo_publication_pending or d.provider<>'sharepoint' or d.sharepoint_item_id is null or d.classification<>'operational'
 or d.side<>'single' or d.content_type not in ('image/jpeg','image/png') then raise exception 'PEOPLE_PHOTO_DOCUMENT_INVALID';end if;
 end if;
 if old_id is not distinct from p_document then return jsonb_build_object('id',p_document);end if;
 if p_document is not null then update public.v2_people_documents set superseded_by_document_id=null where organisation_id=p_org and id=p_document;end if;
 update public.v2_people set current_profile_photo_id=p_document where organisation_id=p_org and id=p_person;
 if old_id is not null and p_document is not null then
 update public.v2_people_documents set superseded_by_document_id=p_document,updated_at=now() where organisation_id=p_org and id=old_id;
 end if;
 insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area,target_id,context)
 values(p_org,p_person,p_actor,case when p_document is null then 'profile_photo_removed' when d.photo_source='onboarding' then 'profile_photo_assigned_from_onboarding' when old_id is null then 'profile_photo_uploaded' else 'profile_photo_changed' end,'operational',coalesce(p_document,old_id),jsonb_build_object('previous_document_id',old_id,'source',d.photo_source));
 return jsonb_build_object('id',p_document);
end $$;
revoke all on function private.tttracker_v2_assign_profile_photo(uuid,uuid,uuid,uuid) from public,anon,authenticated;

create or replace function public.tttracker_v2_person_photo(p_org uuid,p_person uuid default null,p_action text default 'read',p_document uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare person public.v2_people;d public.v2_people_documents;own boolean;
begin
 -- This guard never grants Platform Admin or client-party tenant access.
 if auth.uid() is null or not private.tttracker_v2_is_active_org_member(p_org,auth.uid()) then raise exception 'PEOPLE_PERMISSION_DENIED';end if;
 select * into person from public.v2_people where organisation_id=p_org and (id=p_person or (p_person is null and auth_user_id=auth.uid()));
 if not found then return null;end if;
 own:=person.auth_user_id=auth.uid();
 if p_action='read' then
 perform private.tttracker_v2_require_people_permission(p_org,'people.profile_photo.view');
 select * into d from public.v2_people_documents where organisation_id=p_org and id=person.current_profile_photo_id;
 return jsonb_build_object('person_id',person.id,'name',person.display_name,'document_id',d.id,'version',d.id,
 'can_manage',private.tttracker_v2_has_permission(p_org,'people.profile_photo.manage') or (own and private.tttracker_v2_has_permission(p_org,'people.profile_photo.self_manage')),
 'pending',exists(select 1 from public.v2_people_documents where organisation_id=p_org and person_id=person.id and photo_publication_pending));
 elsif p_action='scope' or p_action='assign' or p_action='remove' then
 if private.tttracker_v2_has_permission(p_org,'people.profile_photo.manage') then perform private.tttracker_v2_require_people_permission(p_org,'people.profile_photo.manage');
 elsif own then perform private.tttracker_v2_require_people_permission(p_org,'people.profile_photo.self_manage');
 else raise exception 'PEOPLE_PERMISSION_DENIED';end if;
 if p_action='scope' then return jsonb_build_object('id',person.id,'display_name',person.display_name,'employee_number',person.employee_number,'relationship_type_id',person.relationship_type_id,'source',case when own and not private.tttracker_v2_has_permission(p_org,'people.profile_photo.manage') then 'self_service' else 'admin_upload' end);end if;
 if p_action='assign' and not exists(select 1 from public.v2_people_documents where organisation_id=p_org and id=p_document and created_by=auth.uid() and photo_source in ('admin_upload','self_service')) then raise exception 'PEOPLE_PHOTO_DOCUMENT_INVALID';end if;
 return private.tttracker_v2_assign_profile_photo(p_org,person.id,case when p_action='remove' then null else p_document end,auth.uid());
 else raise exception 'PEOPLE_INVALID_ACTION';end if;
end $$;
revoke all on function public.tttracker_v2_person_photo(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.tttracker_v2_person_photo(uuid,uuid,text,uuid) to authenticated;

-- Existing operational projections batch photo IDs with each register query.
do $$ declare def text;begin
 def:=pg_get_functiondef('private.tttracker_v2_operational_person(public.v2_people)'::regprocedure);
 if position('current_profile_photo_id' in def)=0 then
 execute replace(def,$old$'id',p.id,$old$, $fragment$'current_profile_photo_id',case when private.tttracker_v2_has_permission(p.organisation_id,'people.profile_photo.view') then p.current_profile_photo_id end,'id',p.id,$fragment$);
 end if;
end $$;

-- Add one opt-in field type without changing any stored template definitions.
do $$ declare def text;begin
 def:=pg_get_functiondef('private.tttracker_v2_validate_template(uuid,jsonb,boolean)'::regprocedure);
 if position($fragment$'profile_photo'$fragment$ in def)=0 then
 def:=replace(def,$fragment$'document_upload','training_request'$fragment$,$fragment$'document_upload','profile_photo','training_request'$fragment$);
 def:=replace(def,$fragment$minimum:=case$fragment$, $fragment$if f->>'type'='profile_photo' and (f->>'classification'<>'operational' or coalesce(f->>'mapping','')<>'' or f ? 'condition') then raise exception 'PEOPLE_TEMPLATE_INVALID';end if;$fragment$||chr(10)||'minimum:=case');
 def:=replace(def,'end loop;end loop;', 'end loop;end loop;'||chr(10)||$fragment$if (select count(*) from jsonb_array_elements(p_definition->'sections') s cross join lateral jsonb_array_elements(s->'fields') f where f->>'type'='profile_photo')>1 then raise exception 'PEOPLE_TEMPLATE_INVALID';end if;$fragment$);
 execute def;
 end if;
 def:=pg_get_functiondef('public.tttracker_v2_onboarding_external(text,text,text,jsonb)'::regprocedure);
 if position($fragment$'profile_photo'$fragment$ in def)=0 then
 def:=replace(def,$fragment$('document_upload','training_request')$fragment$,$fragment$('document_upload','profile_photo','training_request')$fragment$);
 def:=replace(def,$fragment$f->>'type'<>'document_upload'$fragment$,$fragment$f->>'type' not in ('document_upload','profile_photo')$fragment$);
 def:=replace(def,$fragment$f->>'type'='document_upload'$fragment$,$fragment$f->>'type' in ('document_upload','profile_photo')$fragment$);
 def:=replace(def,$fragment$insert into private.v2_onboarding_documents(organisation_id$fragment$, $fragment$if f->>'type'='profile_photo' then$fragment$||chr(10)||$fragment$if p_value->>'side'<>'single' or p_value->>'content_type' not in ('image/jpeg','image/png') then raise exception 'ONBOARDING_FILE_INVALID';end if;$fragment$||chr(10)||$fragment$delete from private.v2_onboarding_documents where organisation_id=i.organisation_id and instance_id=i.id and field_key=p_field;$fragment$||chr(10)||$fragment$end if;$fragment$||chr(10)||'insert into private.v2_onboarding_documents(organisation_id');
 -- Clearing a draft photo removes only the session relationship, retaining file history.
 def:=replace(def,$fragment$if p_action in ('document','upload_scope','document_access') then$fragment$, $fragment$if p_action='save' and f->>'type'='profile_photo' then$fragment$||chr(10)||$fragment$if p_value<>'null'::jsonb then raise exception 'ONBOARDING_VALUE_INVALID';end if;delete from private.v2_onboarding_documents where organisation_id=i.organisation_id and instance_id=i.id and field_key=p_field;return jsonb_build_object('removed',true);end if;$fragment$||chr(10)||$fragment$if p_action in ('document','upload_scope','document_access') then$fragment$);
 execute def;
 end if;
 def:=pg_get_functiondef('public.tttracker_v2_onboarding_external(text,text,text,jsonb)'::regprocedure);
 if position($fragment$'recipient_name',i.recipient_name$fragment$ in def)=0 then
 execute replace(def,$fragment$'relationship_type_id',i.relationship_type_id,'field',f$fragment$,$fragment$'relationship_type_id',i.relationship_type_id,'recipient_name',i.recipient_name,'field',f$fragment$);
 end if;
end $$;

-- Completion marks the selected canonical image for durable SharePoint publication.
-- It does not change the current photo until the remote move and metadata commit succeed.
create or replace function private.tttracker_v2_queue_onboarding_photo()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='completed' and old.status is distinct from 'completed' then
 update public.v2_people_documents d set person_id=new.person_id,photo_source='onboarding',photo_publication_pending=true,photo_retry_after=now()
 from private.v2_onboarding_documents o,private.v2_onboarding_versions v
 where o.organisation_id=new.organisation_id and o.instance_id=new.id and d.organisation_id=o.organisation_id and d.storage_key=o.storage_key
 and v.organisation_id=new.organisation_id and v.id=new.template_version_id and d.provider='sharepoint' and d.document_context='onboarding'
 and exists(select 1 from jsonb_array_elements(v.definition->'sections') s cross join lateral jsonb_array_elements(s->'fields') f where f->>'key'=o.field_key and f->>'type'='profile_photo');
 end if;return new;
end $$;
drop trigger if exists v2_onboarding_profile_photo on private.v2_secure_onboarding_instances;
create trigger v2_onboarding_profile_photo after update on private.v2_secure_onboarding_instances for each row execute function private.tttracker_v2_queue_onboarding_photo();
revoke all on function private.tttracker_v2_queue_onboarding_photo() from public,anon,authenticated;

-- Narrow worker proof: a completed, explicitly configured photo field is the
-- authority for publication, never arbitrary browser or platform document IDs.
create or replace function public.tttracker_v2_onboarding_photo_authority(p_org uuid,p_document uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.v2_people_documents;i private.v2_secure_onboarding_instances;actor uuid;source_key text;
begin
 select * into d from public.v2_people_documents where organisation_id=p_org and id=p_document and photo_publication_pending and photo_source='onboarding';
 if not found then raise exception 'PEOPLE_PHOTO_DOCUMENT_INVALID';end if;
 select * into i from private.v2_secure_onboarding_instances where organisation_id=p_org and id=d.entity_id and person_id=d.person_id and status='completed';
 if not found then raise exception 'PEOPLE_PHOTO_DOCUMENT_INVALID';end if;
 if d.source_document_id is not null then select storage_key into source_key from public.v2_people_documents where organisation_id=p_org and id=d.source_document_id;else source_key:=d.storage_key;end if;
 if not exists(select 1 from private.v2_onboarding_documents o join private.v2_onboarding_versions v on v.organisation_id=o.organisation_id and v.id=i.template_version_id
 where o.organisation_id=p_org and o.instance_id=i.id and o.storage_key=source_key and exists(select 1 from jsonb_array_elements(v.definition->'sections') s cross join lateral jsonb_array_elements(s->'fields') f where f->>'key'=o.field_key and f->>'type'='profile_photo')) then raise exception 'PEOPLE_PHOTO_DOCUMENT_INVALID';end if;
 select actor_id into actor from public.v2_people_audit where organisation_id=p_org and target_id=i.id and action='onboarding_mapping_applied' order by occurred_at desc limit 1;
 actor:=coalesce(actor,i.created_by);
 if not private.tttracker_v2_is_active_org_member(p_org,actor) or not exists(select 1 from public.organisation_modules where organisation_id=p_org and module_key='people' and enabled) or not private.tttracker_v2_has_feature(p_org,'people') then raise exception 'PEOPLE_PERMISSION_DENIED';end if;
 return jsonb_build_object('actor_id',actor,'person_id',i.person_id);
end $$;
revoke all on function public.tttracker_v2_onboarding_photo_authority(uuid,uuid) from public,anon,authenticated;
grant execute on function public.tttracker_v2_onboarding_photo_authority(uuid,uuid) to service_role;

-- Worker-only atomic finalisation; audit records the completion's actor.

create or replace function public.tttracker_v2_finish_onboarding_photo(p_org uuid,p_document uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.v2_people_documents;actor uuid;current_doc uuid;
begin
 select * into d from public.v2_people_documents where organisation_id=p_org and id=p_document for update;
 if not found or not d.photo_publication_pending or d.photo_source<>'onboarding' or d.document_context<>'profile_photos' then raise exception 'PEOPLE_PHOTO_DOCUMENT_INVALID';end if;
 actor:=(public.tttracker_v2_onboarding_photo_authority(p_org,p_document)->>'actor_id')::uuid;
 select current_profile_photo_id into current_doc from public.v2_people where organisation_id=p_org and id=d.person_id for update;
 update public.v2_people_documents set photo_publication_pending=false,entity_type='person_profile_photo' where organisation_id=p_org and id=d.id;
 if d.source_document_id is not null then update public.v2_people_documents set photo_publication_pending=false where organisation_id=p_org and id=d.source_document_id and photo_source='onboarding';end if;
 -- Do not let an older delayed onboarding upload replace a newer managed photo.
 if exists(select 1 from public.v2_people_documents where organisation_id=p_org and id=current_doc and created_at>coalesce((select created_at from public.v2_people_documents where organisation_id=p_org and id=d.source_document_id),d.created_at))
 or exists(select 1 from public.v2_people_audit where organisation_id=p_org and person_id=d.person_id and action='profile_photo_removed' and occurred_at>d.created_at)
 then return jsonb_build_object('id',current_doc);end if;
 return private.tttracker_v2_assign_profile_photo(p_org,d.person_id,d.id,actor);
end $$;
revoke all on function public.tttracker_v2_finish_onboarding_photo(uuid,uuid) from public,anon,authenticated;
grant execute on function public.tttracker_v2_finish_onboarding_photo(uuid,uuid) to service_role;
do $$ declare signature text;def text;begin
 foreach signature in array array['private.tttracker_v2_sharepoint_record_event()','private.tttracker_v2_sharepoint_onboarding_event()','private.tttracker_v2_sharepoint_document_event()'] loop
 if to_regprocedure(signature) is not null then
 def:=pg_get_functiondef(to_regprocedure(signature));
 execute replace(replace(def,$fragment$('people','training','onboarding')$fragment$,$fragment$('people','profile_photos','training','onboarding')$fragment$),$fragment$('people','training')$fragment$,$fragment$('people','profile_photos','training')$fragment$);
 end if;end loop;
end $$;
notify pgrst,'reload schema';
commit;

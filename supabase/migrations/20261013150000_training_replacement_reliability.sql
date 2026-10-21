begin;
-- V2 previously had only type-wide supersession. These are product defaults,
-- not customer-specific records. Existing review/current fields stay canonical.
alter table public.v2_training_types
 add column if not exists allows_multiple_current boolean not null default false,
 add column if not exists supersede_scope text not null default 'type' check(supersede_scope in ('type','type_and_option','type_option_and_project','never'));
alter table public.v2_training_records
 add column if not exists project_id uuid,
 add column if not exists supersedes_record_id uuid,
 add column if not exists superseded_by_record_id uuid;
alter table public.v2_training_records
 add constraint v2_training_project_owner foreign key(organisation_id,project_id) references public.v2_projects(organisation_id,id),
 add constraint v2_training_previous_owner foreign key(organisation_id,supersedes_record_id) references public.v2_training_records(organisation_id,id),
 add constraint v2_training_next_owner foreign key(organisation_id,superseded_by_record_id) references public.v2_training_records(organisation_id,id);
create table public.v2_training_submissions(
 organisation_id uuid not null,actor_id uuid not null references auth.users(id),submission_key uuid not null,
 payload jsonb not null,record_id uuid not null,created_at timestamptz not null default now(),
 primary key(organisation_id,actor_id,submission_key),
 foreign key(organisation_id,record_id) references public.v2_training_records(organisation_id,id));
alter table public.v2_training_submissions enable row level security;
revoke all on public.v2_training_submissions from anon,authenticated;
grant all on public.v2_training_submissions to service_role;

create or replace function private.tttracker_v2_supersede_candidate(p_org uuid,p_person uuid,p_type uuid,p_option uuid,p_project uuid,p_exclude uuid default null)
returns uuid language sql stable security definer set search_path='' as $$
 select r.id from public.v2_training_records r join public.v2_training_types k on k.organisation_id=r.organisation_id and k.id=r.training_type_id
 where r.organisation_id=p_org and r.person_id=p_person and r.training_type_id=p_type
 and r.is_current and r.review_status='approved' and r.superseded_at is null and r.id is distinct from p_exclude
 and not k.allows_multiple_current and k.supersede_scope<>'never'
 and (k.supersede_scope='type' or r.option_id is not distinct from p_option)
 and (k.supersede_scope<>'type_option_and_project' or r.project_id is not distinct from p_project)
 order by r.issue_date desc nulls last,r.created_at desc,r.id limit 1
$$;

-- The former unique index enforced type-wide single-current even for classes
-- and multiple-current types. Preserve the invariant using configured scope.
drop index if exists public.v2_training_current_uidx;
create index if not exists v2_training_current_lookup on public.v2_training_records(organisation_id,person_id,training_type_id) where is_current;
create function private.tttracker_v2_training_current_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.is_current then
 perform pg_advisory_xact_lock(hashtextextended(new.organisation_id::text,2));
 if private.tttracker_v2_supersede_candidate(new.organisation_id,new.person_id,new.training_type_id,new.option_id,new.project_id,new.id) is not null then raise exception 'TRAINING_CURRENT_CONFLICT';end if;
 end if;return new;
end $$;
create trigger v2_training_current_guard before insert or update on public.v2_training_records for each row execute function private.tttracker_v2_training_current_guard();
revoke all on function private.tttracker_v2_training_current_guard() from public,anon,authenticated;

create or replace function private.tttracker_v2_validate_training_evidence(p_org uuid,p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.v2_training_records;k public.v2_training_types;sides text[];begin
 select * into r from public.v2_training_records where organisation_id=p_org and id=p_id;
 select * into k from public.v2_training_types where organisation_id=p_org and id=r.training_type_id;
 if r.id is null then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
 select array_agg(distinct side) into sides from public.v2_people_documents d where d.organisation_id=p_org and d.person_id=r.person_id
 and d.evidence_group_id=r.evidence_group_id and d.classification='operational' and d.provider='sharepoint' and d.sharepoint_item_id is not null;
 if k.document_requirement='none' then return;end if;
 if k.document_requirement in ('single','single_or_front_back') and 'single'=any(sides) then return;end if;
 if k.document_requirement in ('front_back','single_or_front_back') and sides @> array['front','back'] then return;end if;
 raise exception 'TRAINING_DOCUMENTS_REQUIRED';
end $$;

create or replace function private.tttracker_v2_confirm_training(p_org uuid,p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.v2_training_records;previous uuid;begin
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,2));
 select * into r from public.v2_training_records where organisation_id=p_org and id=p_id for update;
 if r.id is null then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
 if r.is_current and r.review_status='approved' then return;end if;
 if r.superseded_at is not null or r.review_status not in ('pending_review','changes_required') then raise exception 'TRAINING_INVALID_TRANSITION';end if;
 perform private.tttracker_v2_validate_training_evidence(p_org,p_id);
 previous:=private.tttracker_v2_supersede_candidate(p_org,r.person_id,r.training_type_id,r.option_id,r.project_id,r.id);
 update public.v2_training_records set is_current=false,superseded_at=now(),superseded_by_record_id=p_id where organisation_id=p_org and id=previous;
 update public.v2_training_records set is_current=true,review_status='approved',reviewed_at=now(),reviewed_by=auth.uid(),supersedes_record_id=previous where organisation_id=p_org and id=p_id;
 if previous is not null then
 insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area,target_id,context)
 values(p_org,r.person_id,auth.uid(),'training_superseded','operational',previous,jsonb_build_object('replacement_record_id',p_id));
 end if;
 -- Retain physical evidence and the evidence-group relationship. Another current
 -- qualification may use the same certificate. No archive folder policy exists.
end $$;

-- Existing review branch must use the same transactional finalizer as no-review.
do $$ declare definition text;old text;begin
 definition:=pg_get_functiondef('private.tttracker_v2_people_write_base(uuid,text,uuid,jsonb)'::regprocedure);
 old:='update public.v2_training_records set is_current=false,superseded_at=now() where organisation_id=p_organisation_id and person_id=v_person and training_type_id=v_record.training_type_id and is_current and id<>p_id;';
 if position(old in definition)=0 then raise exception 'TRAINING_REVIEW_UPGRADE_REQUIRED';end if;
 execute replace(definition,old,'perform private.tttracker_v2_confirm_training(p_organisation_id,p_id);');
end $$;

-- Preserve the existing catalogue/configuration and review policy wrapper.
alter function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) rename to tttracker_v2_people_write_training_previous;
revoke all on function public.tttracker_v2_people_write_training_previous(uuid,text,uuid,jsonb) from public,anon,authenticated;
create function public.tttracker_v2_people_write(p_organisation_id uuid,p_action text,p_id uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;r public.v2_training_records;key uuid;prior public.v2_training_submissions;project uuid;begin
 if p_action in ('training','update_training','finalize_training','review_training') then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,case p_action when 'training' then 'training.create' when 'review_training' then 'training.approve' else 'training.edit' end);
 perform pg_advisory_xact_lock(hashtextextended(p_organisation_id::text,2));
 end if;
 if p_action='training' then
 key:=nullif(p_data->>'submission_key','')::uuid;project:=nullif(p_data->>'project_id','')::uuid;
 if key is not null then
 select * into prior from public.v2_training_submissions where organisation_id=p_organisation_id and actor_id=auth.uid() and submission_key=key;
 if found then
 if prior.payload is distinct from p_data then raise exception 'TRAINING_SUBMISSION_CONFLICT';end if;
 return jsonb_build_object('id',prior.record_id,'retry',true);end if;end if;
 if project is not null and not exists(select 1 from public.v2_projects where organisation_id=p_organisation_id and id=project and private.tttracker_v2_is_project_member(id)) then raise exception 'PEOPLE_RELATIONSHIP_INVALID';end if;
 end if;
 if p_action in ('finalize_training','review_training') then
 select * into r from public.v2_training_records where organisation_id=p_organisation_id and id=p_id;
 if p_action='review_training' and r.review_status='approved' and p_data->>'outcome'='approved' then return jsonb_build_object('id',p_id,'retry',true);end if;
 if p_action='finalize_training' then
 for r in select * from public.v2_training_records where organisation_id=p_organisation_id and evidence_group_id=r.evidence_group_id loop
 perform private.tttracker_v2_validate_training_evidence(p_organisation_id,r.id);end loop;
 elsif p_data->>'outcome'='approved' then perform private.tttracker_v2_validate_training_evidence(p_organisation_id,p_id);end if;
 end if;
 result:=public.tttracker_v2_people_write_training_previous(p_organisation_id,p_action,p_id,p_data);
 if p_action='training' then
 -- The legacy loop returned the last linked type. Always return the primary type.
 select * into r from public.v2_training_records where organisation_id=p_organisation_id and evidence_group_id=(select evidence_group_id from public.v2_training_records where organisation_id=p_organisation_id and id=(result->>'id')::uuid) and training_type_id=(p_data->>'training_type_id')::uuid;
 update public.v2_training_records t set project_id=project,supersedes_record_id=private.tttracker_v2_supersede_candidate(p_organisation_id,t.person_id,t.training_type_id,t.option_id,project,t.id)
 where t.organisation_id=p_organisation_id and t.evidence_group_id=r.evidence_group_id;
 if key is not null then insert into public.v2_training_submissions values(p_organisation_id,auth.uid(),key,p_data,r.id,now());end if;
 result:=jsonb_build_object('id',r.id,'evidence_group_id',r.evidence_group_id);
 elsif p_action='training_type' then
 update public.v2_training_types set allows_multiple_current=coalesce((p_data->>'allows_multiple_current')::boolean,allows_multiple_current),supersede_scope=coalesce(p_data->>'supersede_scope',supersede_scope) where organisation_id=p_organisation_id and id=(result->>'id')::uuid;
 elsif p_action='update_training' then
 update public.v2_training_records t set supersedes_record_id=private.tttracker_v2_supersede_candidate(p_organisation_id,t.person_id,t.training_type_id,t.option_id,t.project_id,t.id) where organisation_id=p_organisation_id and id=p_id;
 end if;
 if p_action='finalize_training' then
 select * into r from public.v2_training_records where organisation_id=p_organisation_id and id=p_id;
 result:=result||jsonb_build_object('review_status',r.review_status,'replacement',r.supersedes_record_id is not null);
 end if;
 return result;
end $$;
revoke all on function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) to authenticated;

create function public.tttracker_v2_training_document_access(p_org uuid,p_document uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.v2_people_documents;begin
 perform private.tttracker_v2_require_people_permission(p_org,case when private.tttracker_v2_has_permission(p_org,'training.view') then 'training.view' else 'training.approve' end);
 select * into d from public.v2_people_documents where organisation_id=p_org and id=p_document and document_context='training' and classification='operational';
 if d.id is null or not exists(select 1 from public.v2_training_records r where r.organisation_id=p_org and r.person_id=d.person_id
 and r.evidence_group_id=d.evidence_group_id and (r.project_id is null or private.tttracker_v2_is_project_member(r.project_id))) then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
 return jsonb_build_object('id',d.id,'name',d.name,'provider',d.provider,'storage_key',d.storage_key,'content_type',d.content_type);
end $$;
revoke all on function public.tttracker_v2_training_document_access(uuid,uuid) from public,anon;
grant execute on function public.tttracker_v2_training_document_access(uuid,uuid) to authenticated;

-- Preserve all read projections. Only evidence access and catalogue defaults
-- are extended; register hides superseded records unless explicitly requested.
alter function public.tttracker_v2_people_read(uuid,text,text,integer,uuid,jsonb) rename to tttracker_v2_people_read_training_previous;
revoke all on function public.tttracker_v2_people_read_training_previous(uuid,text,text,integer,uuid,jsonb) from public,anon,authenticated;
do $$ declare definition text;old text;begin
 definition:=pg_get_functiondef('public.tttracker_v2_people_read_training_previous(uuid,text,text,integer,uuid,jsonb)'::regprocedure);
 old:='and (coalesce(p_filter->>''id'','''')='''' or t.id=(p_filter->>''id'')::uuid)';
 if position(old in definition)=0 then raise exception 'TRAINING_REGISTER_UPGRADE_REQUIRED';end if;
 execute replace(definition,old,old||' and (p_area<>''training'' or p_person_id is not null or coalesce(p_filter->>''id'','''')<>'''' or coalesce(p_filter->>''status'','''')<>'''' or t.superseded_at is null)');
end $$;
create function public.tttracker_v2_people_read(p_organisation_id uuid,p_area text default 'people',p_query text default '',p_page integer default 1,p_person_id uuid default null,p_filter jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;d jsonb;rows jsonb;begin
 if p_area='training_replacement' then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.create');
 if not exists(select 1 from public.v2_people where organisation_id=p_organisation_id and id=p_person_id) then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
 select jsonb_build_object('id',r.id,'issue_date',r.issue_date,'expiry_date',r.expiry_date,'training_type',k.name) into d
 from public.v2_training_records r join public.v2_training_types k on k.organisation_id=r.organisation_id and k.id=r.training_type_id
 where r.organisation_id=p_organisation_id and r.id=private.tttracker_v2_supersede_candidate(p_organisation_id,p_person_id,(p_filter->>'training_type_id')::uuid,nullif(p_filter->>'option_id','')::uuid,nullif(p_filter->>'project_id','')::uuid);
 return jsonb_build_object('rows',case when d is null then '[]'::jsonb else jsonb_build_array(d) end);end if;
 if p_area='document_access' then d:=public.tttracker_v2_training_document_access(p_organisation_id,(p_filter->>'id')::uuid);return jsonb_build_object('rows',jsonb_build_array(d),'total',1);end if;
 if p_area='documents' then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,case when private.tttracker_v2_has_permission(p_organisation_id,'training.view') then 'training.view' else 'training.approve' end);
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select d.id,d.name,d.side,d.provider,d.created_at from public.v2_people_documents d
 where d.organisation_id=p_organisation_id and d.person_id=p_person_id and d.document_context='training' and d.classification='operational'
 and (coalesce(p_filter->>'evidence_group_id','')='' or d.evidence_group_id=(p_filter->>'evidence_group_id')::uuid)
 and exists(select 1 from public.v2_training_records r where r.organisation_id=d.organisation_id and r.person_id=d.person_id and r.evidence_group_id=d.evidence_group_id and (r.project_id is null or private.tttracker_v2_is_project_member(r.project_id)))
 order by d.created_at desc,d.id limit 20 offset greatest(0,p_page-1)*20)x;
 return jsonb_build_object('rows',rows,'total',jsonb_array_length(rows),'page',p_page);end if;
 result:=public.tttracker_v2_people_read_training_previous(p_organisation_id,p_area,p_query,p_page,p_person_id,p_filter);
 if p_area='training_types' then
 select coalesce(jsonb_agg(x||jsonb_build_object('allows_multiple_current',k.allows_multiple_current,'supersede_scope',k.supersede_scope)),'[]') into rows from jsonb_array_elements(result->'rows') x join public.v2_training_types k on k.id=(x->>'id')::uuid and k.organisation_id=p_organisation_id;
 return result||jsonb_build_object('rows',rows);end if;
 return result;
end $$;
revoke all on function public.tttracker_v2_people_read(uuid,text,text,integer,uuid,jsonb) from public,anon;
grant execute on function public.tttracker_v2_people_read(uuid,text,text,integer,uuid,jsonb) to authenticated;
revoke all on function private.tttracker_v2_supersede_candidate(uuid,uuid,uuid,uuid,uuid,uuid),private.tttracker_v2_validate_training_evidence(uuid,uuid),private.tttracker_v2_confirm_training(uuid,uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;

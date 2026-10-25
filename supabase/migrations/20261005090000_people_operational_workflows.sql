-- Extend canonical People records; no financial collection is enabled.
begin;
alter table public.v2_crew_members drop constraint if exists v2_crew_members_pkey;
alter table public.v2_crew_members add column if not exists id uuid default gen_random_uuid();
alter table public.v2_crew_members add primary key(id);
create unique index v2_crew_members_current_idx on public.v2_crew_members(organisation_id,crew_id,person_id) where left_at is null;
alter table public.v2_crew_members add constraint v2_crew_members_dates_check check(left_at is null or left_at>=joined_at);
alter table public.v2_crews add column if not exists leader_label text not null default 'Crew leader';
alter table public.v2_crews add column if not exists notes text not null default '';
alter table public.v2_training_types add column if not exists code text;
alter table public.v2_training_types add column if not exists category text;
alter table public.v2_training_types add column if not exists description text not null default '';
alter table public.v2_training_types add column if not exists review_policy text not null default 'required' check(review_policy in ('required','none','trusted','inherit'));
alter table public.v2_training_records add column if not exists source_channel text not null default 'internal' check(source_channel in ('internal','person_web','mobile','external_onboarding','import','integration'));
alter table public.v2_training_records add column if not exists submitted_at timestamptz;
alter table public.v2_people_documents add column if not exists document_category text not null default 'training';
alter table public.v2_people_documents add column if not exists sync_status text not null default 'stored' check(sync_status in ('pending','stored','syncing','synced','failed'));
alter table public.v2_people_documents add column if not exists resolved_folder text;
alter table public.v2_people_documents add column if not exists resolved_filename text;
alter table public.v2_crew_projects drop constraint if exists v2_crew_projects_pkey;
alter table public.v2_crew_projects add column if not exists id uuid default gen_random_uuid();
alter table public.v2_crew_projects add primary key(id);
create unique index v2_crew_projects_current_idx on public.v2_crew_projects(organisation_id,crew_id,project_id) where ended_at is null;
alter table public.v2_crew_projects add constraint v2_crew_projects_dates_check check(ended_at is null or ended_at>=assigned_at);
create table public.v2_people_review_defaults (
 organisation_id uuid primary key references public.organisations(id), policies jsonb not null default '{}', updated_at timestamptz not null default now()
);
create table public.v2_people_document_rules (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id),
 name text not null, parent_id uuid, category text not null default 'training', relationship_type_id uuid,
 provider text not null default 'internal' check(provider in ('internal','sharepoint')),
 folder_template text not null, filename_template text not null default '{person_id}_{document_category}_{year}',
 date_format text not null default 'DD-MM-YYYY' check(date_format in ('DD-MM-YYYY','YYYY-MM-DD')),
 collision_policy text not null default 'version' check(collision_policy in ('version','sequence')),
 creation_trigger text not null default 'first_upload' check(creation_trigger in ('person_created','onboarding_started','onboarding_completed','first_upload','manual')),
 library_reference text, is_active boolean not null default true,unique(organisation_id,id),
 foreign key(organisation_id,parent_id) references public.v2_people_document_rules(organisation_id,id),
 foreign key(organisation_id,relationship_type_id) references public.v2_person_types(organisation_id,id), check(parent_id is null or parent_id<>id)
);
create table public.v2_project_training_requirements (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null, project_id uuid not null,training_type_id uuid not null,
 applies_to text not null default 'everyone' check(applies_to in ('everyone','relationship','position','crew_leader','person')),
 relationship_type_id uuid,position text,person_id uuid,is_active boolean not null default true,
 foreign key(organisation_id,project_id) references public.v2_projects(organisation_id,id),
 foreign key(organisation_id,training_type_id) references public.v2_training_types(organisation_id,id),
 foreign key(organisation_id,relationship_type_id) references public.v2_person_types(organisation_id,id),
 foreign key(organisation_id,person_id) references public.v2_people(organisation_id,id)
);
create index v2_project_training_scope_idx on public.v2_project_training_requirements(organisation_id,project_id,training_type_id);
create table public.v2_person_private_domains (
 organisation_id uuid not null,person_id uuid not null,domain text not null check(domain in ('personal_contact','emergency_contact','employment','safety_claims')),
 values_json jsonb not null default '{}',primary key(organisation_id,person_id,domain),
 foreign key(organisation_id,person_id) references public.v2_people(organisation_id,id)
);
insert into public.v2_permissions(resource_id,permission_code,action_key,name)
select id,x.code,x.code,x.label from public.v2_resources cross join (values
 ('training.confirm_without_review','Confirm trusted training submissions'),
 ('training.requirements.manage','Manage project training requirements'),
 ('people.onboarding.review','Review onboarding'),
 ('people.private.personal_contact.view','View private personal contact'),('people.private.personal_contact.edit','Edit private personal contact'),
 ('people.private.emergency_contact.view','View private emergency contact'),('people.private.emergency_contact.edit','Edit private emergency contact'),
 ('people.private.employment.view','View private employment'),('people.private.employment.edit','Edit private employment'),
 ('people.private.safety_claims.view','View private safety/claims'),('people.private.safety_claims.edit','Edit private safety/claims')
 ) x(code,label) where resource_key='people' on conflict(permission_code) do nothing;
-- New private domains and direct-confirm capabilities have no automatic role grants.
insert into public.v2_role_permissions(organisation_id,role_id,permission_id,allowed) select r.organisation_id,r.id,p.id,true from public.v2_roles r cross join public.v2_permissions p where r.is_system and r.code='admin' and p.permission_code in ('training.requirements.manage','people.onboarding.review') on conflict(role_id,permission_id) do nothing;
create or replace function private.tttracker_v2_people_read_base(p_organisation_id uuid,p_area text default 'people',p_query text default '',p_page integer default 1,p_person_id uuid default null,p_filter jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare rows jsonb; total bigint; v_permission text; v_offset integer:=greatest(0,least(coalesce(p_page,1),100000)-1)*20; v_q text:=btrim(coalesce(p_query,'')); v_person public.v2_people;
begin
 v_permission:=case p_area when 'crews' then 'people.crews.view' when 'crew_members' then 'people.crews.view' when 'crew_projects' then 'people.crews.view' when 'projects' then case when private.tttracker_v2_has_permission(p_organisation_id,'people.crews.manage') then 'people.crews.manage' when private.tttracker_v2_has_permission(p_organisation_id,'people.site_prestarts.manage') then 'people.site_prestarts.manage' else 'people.view' end
 when 'training' then 'training.view' when 'review' then 'training.approve' when 'training_types' then case when private.tttracker_v2_has_permission(p_organisation_id,'training.configure') then 'training.configure' when private.tttracker_v2_has_permission(p_organisation_id,'training.create') then 'training.create' else 'training.view' end
 when 'document_access' then 'training.view' when 'prestarts' then 'people.site_prestarts.view' when 'prestart_detail' then 'people.site_prestarts.view' when 'prestart_attendees' then 'people.site_prestarts.view'
 when 'people_choices' then case when private.tttracker_v2_has_permission(p_organisation_id,'people.crews.manage') then 'people.crews.manage' when private.tttracker_v2_has_permission(p_organisation_id,'training.create') then 'training.create' when private.tttracker_v2_has_permission(p_organisation_id,'people.site_prestarts.manage') then 'people.site_prestarts.manage' else 'people.view' end when 'types' then case when private.tttracker_v2_has_permission(p_organisation_id,'people.configure') then 'people.configure' else 'people.view' end when 'users' then 'organisation.users.configure' when 'documents' then 'training.view' else 'people.view' end;
 perform private.tttracker_v2_require_people_permission(p_organisation_id,v_permission);
 if p_person_id is not null then
 select * into v_person from public.v2_people where id=p_person_id and organisation_id=p_organisation_id;
 if not found then raise exception 'PEOPLE_RECORD_NOT_FOUND' using errcode='P0002'; end if; end if;
 if p_area='overview' then
 return jsonb_build_object('active_people',(select count(*) from public.v2_people where organisation_id=p_organisation_id and employment_status='active'),
 'active_crews',case when private.tttracker_v2_has_permission(p_organisation_id,'people.crews.view') then (select count(*) from public.v2_crews where organisation_id=p_organisation_id and status='active') end,
 'pending_review',case when private.tttracker_v2_has_permission(p_organisation_id,'training.approve') then (select count(*) from public.v2_training_records where organisation_id=p_organisation_id and review_status='pending_review') end,
 'training_attention',case when private.tttracker_v2_has_permission(p_organisation_id,'training.view') then (select count(*) from public.v2_training_records t join public.v2_training_types k on k.id=t.training_type_id and k.organisation_id=t.organisation_id where t.organisation_id=p_organisation_id and t.review_status='approved' and t.is_current and t.expiry_date<=current_date+k.renewal_lead_days) end);
 elsif p_area in ('people','profile') then
 select count(*) into total from public.v2_people p where p.organisation_id=p_organisation_id and (p_person_id is null or p.id=p_person_id)
 and (coalesce(p_filter->>'status','')='' or p.employment_status=p_filter->>'status')
 and (coalesce(p_filter->>'relationship_type_id','')='' or p.relationship_type_id=(p_filter->>'relationship_type_id')::uuid)
 and (coalesce(p_filter->>'crew_id','')='' or exists(select 1 from public.v2_crew_members m where m.organisation_id=p_organisation_id and m.person_id=p.id and m.crew_id=(p_filter->>'crew_id')::uuid and m.left_at is null))
 and concat_ws(' ',p.display_name,p.employee_number,p.position,p.employer,p.work_email,(select string_agg(c.name,' ') from public.v2_crew_members m join public.v2_crews c on c.id=m.crew_id and c.organisation_id=m.organisation_id where m.person_id=p.id and m.left_at is null)) ilike '%'||v_q||'%';
 select coalesce(jsonb_agg(private.tttracker_v2_operational_person(x)),'[]') into rows from
 (select p.* from public.v2_people p where p.organisation_id=p_organisation_id and (p_person_id is null or p.id=p_person_id)
 and (coalesce(p_filter->>'status','')='' or p.employment_status=p_filter->>'status')
 and (coalesce(p_filter->>'relationship_type_id','')='' or p.relationship_type_id=(p_filter->>'relationship_type_id')::uuid)
 and (coalesce(p_filter->>'crew_id','')='' or exists(select 1 from public.v2_crew_members m where m.organisation_id=p_organisation_id and m.person_id=p.id and m.crew_id=(p_filter->>'crew_id')::uuid and m.left_at is null))
 and concat_ws(' ',p.display_name,p.employee_number,p.position,p.employer,p.work_email,(select string_agg(c.name,' ') from public.v2_crew_members m join public.v2_crews c on c.id=m.crew_id and c.organisation_id=m.organisation_id where m.person_id=p.id and m.left_at is null)) ilike '%'||v_q||'%'
 order by p.display_name,p.id limit 20 offset v_offset) x;
 elsif p_area='people_choices' then
select count(*) into total from public.v2_people where organisation_id=p_organisation_id and employment_status='active' and display_name ilike '%'||v_q||'%';
select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select id,display_name from public.v2_people where organisation_id=p_organisation_id and employment_status='active' and display_name ilike '%'||v_q||'%' order by display_name,id limit 20 offset v_offset)x;
elsif p_area='types' then
 select count(*) into total from public.v2_person_types where organisation_id=p_organisation_id and name ilike '%'||v_q||'%';
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select id,name,is_active from public.v2_person_types where organisation_id=p_organisation_id and name ilike '%'||v_q||'%' order by name limit 20 offset v_offset)x;
 elsif p_area='crews' then
 select count(*) into total from public.v2_crews c where c.organisation_id=p_organisation_id and c.name ilike '%'||v_q||'%' and (p_person_id is null or exists(select 1 from public.v2_crew_members where crew_id=c.id and person_id=p_person_id and left_at is null));
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select c.id,c.name,c.status,c.leader_person_id,(select display_name from public.v2_people where id=c.leader_person_id and organisation_id=p_organisation_id) leader,
 (select count(*) from public.v2_crew_members where crew_id=c.id and organisation_id=p_organisation_id and left_at is null) member_count
 from public.v2_crews c where c.organisation_id=p_organisation_id and c.name ilike '%'||v_q||'%' and (p_person_id is null or exists(select 1 from public.v2_crew_members where crew_id=c.id and person_id=p_person_id and left_at is null)) order by c.name,c.id limit 20 offset v_offset)x;
 elsif p_area='crew_members' then
 if not exists(select 1 from public.v2_crews where id=(p_filter->>'crew_id')::uuid and organisation_id=p_organisation_id) then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if;
 select count(*) into total from public.v2_crew_members where crew_id=(p_filter->>'crew_id')::uuid and organisation_id=p_organisation_id and left_at is null;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select p.id,p.display_name,p.position,m.joined_at from public.v2_crew_members m join public.v2_people p on p.id=m.person_id and p.organisation_id=m.organisation_id where m.crew_id=(p_filter->>'crew_id')::uuid and m.organisation_id=p_organisation_id and m.left_at is null order by p.display_name,p.id limit 20 offset v_offset)x;
 elsif p_area in ('training','review') then
 with records as(select t.id,t.person_id,p.display_name,k.name training_type,t.issue_date,t.expiry_date,t.certificate_number,t.review_status,t.review_comment,t.reviewed_at,t.reviewed_by,t.evidence_group_id,
 case when t.superseded_at is not null then 'superseded' when t.review_status<>'approved' then t.review_status when t.expiry_date<current_date then 'expired' when t.expiry_date<=current_date+k.renewal_lead_days then 'expiring' else 'current' end status
 from public.v2_training_records t join public.v2_people p on p.id=t.person_id and p.organisation_id=t.organisation_id join public.v2_training_types k on k.id=t.training_type_id and k.organisation_id=t.organisation_id
 where t.organisation_id=p_organisation_id and (p_person_id is null or t.person_id=p_person_id) and (p_area<>'review' or t.review_status in ('pending_review','changes_required'))
 and concat_ws(' ',p.display_name,k.name,t.certificate_number) ilike '%'||v_q||'%')
 select count(*),(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select * from records where coalesce(p_filter->>'status','')='' or status=p_filter->>'status' order by display_name,id limit 20 offset v_offset)x) into total,rows from records where coalesce(p_filter->>'status','')='' or status=p_filter->>'status';
 elsif p_area='overview' then
return result||jsonb_build_object('training_expiring',case when private.tttracker_v2_has_permission(p_organisation_id,'training.view') then (select count(*) from public.v2_training_records r join public.v2_training_types k on k.id=r.training_type_id and k.organisation_id=r.organisation_id where r.organisation_id=p_organisation_id and r.is_current and r.expiry_date>=current_date and r.expiry_date<=current_date+k.renewal_lead_days) end,'training_expired',case when private.tttracker_v2_has_permission(p_organisation_id,'training.view') then (select count(*) from public.v2_training_records where organisation_id=p_organisation_id and is_current and expiry_date<current_date) end);
elsif p_area='training_types' then
 select count(*) into total from public.v2_training_types where organisation_id=p_organisation_id and name ilike '%'||v_q||'%';
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select id,name,is_active,validity_mode,validity_months,renewal_lead_days,requires_issue_date,requires_certificate_number,document_requirement,
 (select coalesce(jsonb_agg(linked_type_id),'[]') from public.v2_training_linked_types where training_type_id=k.id and organisation_id=p_organisation_id) linked_types
 from public.v2_training_types k where organisation_id=p_organisation_id and name ilike '%'||v_q||'%' order by name,id limit 20 offset v_offset)x;
 elsif p_area='projects' then
 select count(*) into total from public.v2_projects p where p.organisation_id=p_organisation_id and p.status<>'archived' and private.tttracker_v2_is_project_member(p.id) and p.name ilike '%'||v_q||'%' and (p_person_id is null or exists(select 1 from public.v2_person_projects where person_id=p_person_id and project_id=p.id and ended_at is null));
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select p.id,p.name,p.code,p.status from public.v2_projects p where p.organisation_id=p_organisation_id and p.status<>'archived' and private.tttracker_v2_is_project_member(p.id) and (p_person_id is null or exists(select 1 from public.v2_person_projects where person_id=p_person_id and project_id=p.id and ended_at is null)) and p.name ilike '%'||v_q||'%' order by p.name,p.id limit 20 offset v_offset)x;
 elsif p_area='crew_projects' then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,'people.crews.view');
 select count(*) into total from public.v2_crew_projects where organisation_id=p_organisation_id and crew_id=(p_filter->>'crew_id')::uuid and ended_at is null;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select p.id,p.name,p.code from public.v2_crew_projects c join public.v2_projects p on p.id=c.project_id and p.organisation_id=c.organisation_id where c.organisation_id=p_organisation_id and c.crew_id=(p_filter->>'crew_id')::uuid and c.ended_at is null and private.tttracker_v2_is_project_member(p.id) order by p.name,p.id limit 20 offset v_offset)x;
 elsif p_area='users' then
 select count(*) into total from public.organisation_users where organisation_id=p_organisation_id and status='active';
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select a.id,a.email,coalesce(a.raw_user_meta_data->>'full_name',a.email) name from auth.users a join public.organisation_users u on u.user_id=a.id where u.organisation_id=p_organisation_id and u.status='active' and coalesce(a.email,'') ilike '%'||v_q||'%' order by a.email limit 20 offset v_offset)x;
 elsif p_area='documents' then
 if p_person_id is null then raise exception 'PEOPLE_PERSON_REQUIRED'; end if;
 select count(*) into total from public.v2_people_documents where organisation_id=p_organisation_id and person_id=p_person_id and (coalesce(p_filter->>'evidence_group_id','')='' or evidence_group_id=(p_filter->>'evidence_group_id')::uuid);
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select id,name,side,provider,created_at from public.v2_people_documents where organisation_id=p_organisation_id and person_id=p_person_id and (coalesce(p_filter->>'evidence_group_id','')='' or evidence_group_id=(p_filter->>'evidence_group_id')::uuid) order by created_at desc,id limit 20 offset v_offset)x;
 elsif p_area='document_access' then
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select id,name,provider,storage_key,content_type from public.v2_people_documents where organisation_id=p_organisation_id and id=(p_filter->>'id')::uuid)x;
 total:=jsonb_array_length(rows);
 elsif p_area='prestart_attendees' then
if not exists(select 1 from public.v2_site_prestarts where id=(p_filter->>'id')::uuid and organisation_id=p_organisation_id and private.tttracker_v2_is_project_member(project_id)) then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if;
select count(*) into total from public.v2_site_prestart_attendees where organisation_id=p_organisation_id and prestart_id=(p_filter->>'id')::uuid;
select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select a.person_id id,p.display_name,a.recorded_at from public.v2_site_prestart_attendees a join public.v2_people p on p.id=a.person_id and p.organisation_id=a.organisation_id where a.organisation_id=p_organisation_id and a.prestart_id=(p_filter->>'id')::uuid order by p.display_name,a.person_id limit 20 offset v_offset)x;
elsif p_area='prestarts' then
 select count(*) into total from public.v2_site_prestarts s join public.v2_projects p on p.id=s.project_id and p.organisation_id=s.organisation_id where s.organisation_id=p_organisation_id and private.tttracker_v2_is_project_member(p.id)
 and (p_person_id is null or exists(select 1 from public.v2_site_prestart_attendees where prestart_id=s.id and person_id=p_person_id)) and concat_ws(' ',p.name,s.location) ilike '%'||v_q||'%'
 and (coalesce(p_filter->>'date','')='' or s.prestart_date=(p_filter->>'date')::date) and (coalesce(p_filter->>'project_id','')='' or s.project_id=(p_filter->>'project_id')::uuid);
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select s.id,s.prestart_date,s.location,s.status,p.name project_name,s.project_id,
 (select count(*) from public.v2_site_prestart_attendees where prestart_id=s.id and organisation_id=p_organisation_id) attendee_count
 from public.v2_site_prestarts s join public.v2_projects p on p.id=s.project_id and p.organisation_id=s.organisation_id where s.organisation_id=p_organisation_id and private.tttracker_v2_is_project_member(p.id)
 and (p_person_id is null or exists(select 1 from public.v2_site_prestart_attendees where prestart_id=s.id and person_id=p_person_id)) and concat_ws(' ',p.name,s.location) ilike '%'||v_q||'%'
 and (coalesce(p_filter->>'date','')='' or s.prestart_date=(p_filter->>'date')::date) and (coalesce(p_filter->>'project_id','')='' or s.project_id=(p_filter->>'project_id')::uuid) order by s.prestart_date desc,s.id limit 20 offset v_offset)x;
 elsif p_area='prestart_detail' then
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select s.id,s.discussion,s.location,s.status,s.prestart_date,s.project_id,s.completed_at from public.v2_site_prestarts s where s.organisation_id=p_organisation_id and s.id=(p_filter->>'id')::uuid and private.tttracker_v2_is_project_member(s.project_id))x;
 total:=jsonb_array_length(rows);
 else raise exception 'PEOPLE_INVALID_AREA'; end if;
 return jsonb_build_object('rows',rows,'total',total,'page',greatest(1,p_page),'page_size',20);
end $$;
create or replace function private.tttracker_v2_people_write_base(p_organisation_id uuid,p_action text,p_id uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_permission text; v_person uuid; v_id uuid:=p_id; v_record public.v2_training_records; v_type public.v2_training_types; v_group uuid; v_expiry date; v_issue date; v_project uuid; v_name text; v_old text; v_status text;
begin
 v_permission:=case p_action when 'create_person' then 'people.create' when 'update_person' then 'people.edit'
 when 'status_person' then 'people.archive' when 'link_user' then 'organisation.users.configure'
 when 'type' then 'people.configure' when 'crew' then 'people.crews.manage' when 'crew_member' then 'people.crews.manage' when 'crew_project' then 'people.crews.manage'
 when 'person_project' then 'people.edit' when 'training_type' then 'training.configure' when 'linked_type' then 'training.configure'
 when 'training' then 'training.create' when 'resubmit_training' then 'training.edit' when 'update_training' then 'training.edit' when 'review_training' then 'training.approve'
 when 'document' then 'training.edit' when 'prestart' then 'people.site_prestarts.manage' when 'prestart_attendee' then 'people.site_prestarts.manage' when 'complete_prestart' then 'people.site_prestarts.manage'
 else null end;
 if v_permission is null then raise exception 'PEOPLE_INVALID_ACTION'; end if;
 perform private.tttracker_v2_require_people_permission(p_organisation_id,v_permission);
 if p_action in ('update_person','status_person','link_user') then v_person:=p_id;
 elsif p_action in ('training','document','person_project','crew_member','prestart_attendee') then v_person:=(p_data->>'person_id')::uuid; end if;
 if v_person is not null and not exists(select 1 from public.v2_people where id=v_person and organisation_id=p_organisation_id) then raise exception 'PEOPLE_RECORD_NOT_FOUND' using errcode='P0002'; end if;
 if p_action in ('training','document','person_project','crew_member','prestart_attendee') and v_person is null then raise exception 'PEOPLE_PERSON_REQUIRED'; end if;
 if p_action in ('create_person','update_person') then
 perform pg_advisory_xact_lock(hashtextextended(p_organisation_id::text,1));
 v_name:=nullif(btrim(p_data->>'display_name'),'');
 if v_name is null then raise exception 'PEOPLE_NAME_REQUIRED'; end if;
 if exists(select 1 from public.v2_people where organisation_id=p_organisation_id and id is distinct from p_id and lower(employee_number)=lower(nullif(btrim(p_data->>'employee_number'),''))) then raise exception 'PEOPLE_IDENTIFIER_EXISTS' using errcode='23505'; end if;
 if exists(select 1 from public.v2_people where organisation_id=p_organisation_id and id is distinct from p_id and lower(work_email)=lower(nullif(btrim(p_data->>'work_email'),''))) and coalesce((p_data->>'confirm_duplicate')::boolean,false)=false then return jsonb_build_object('warning','PEOPLE_POSSIBLE_DUPLICATE'); end if;
 if p_action='create_person' then
 insert into public.v2_people(organisation_id,display_name,employee_number,work_email,relationship_type_id,employer,position,start_date,end_date)
 values(p_organisation_id,v_name,nullif(btrim(p_data->>'employee_number'),''),nullif(btrim(p_data->>'work_email'),''),nullif(p_data->>'relationship_type_id','')::uuid,nullif(btrim(p_data->>'employer'),''),nullif(btrim(p_data->>'position'),''),nullif(p_data->>'start_date','')::date,nullif(p_data->>'end_date','')::date) returning id into v_id; v_person:=v_id;
if nullif(p_data->>'user_id','') is not null then
perform private.tttracker_v2_require_people_permission(p_organisation_id,'organisation.users.configure');
if not private.tttracker_v2_is_active_org_member(p_organisation_id,(p_data->>'user_id')::uuid) then raise exception 'PEOPLE_RELATIONSHIP_INVALID'; end if;
update public.v2_people set auth_user_id=(p_data->>'user_id')::uuid where id=v_id and organisation_id=p_organisation_id;
end if;
 else
 update public.v2_people set display_name=v_name,employee_number=nullif(btrim(p_data->>'employee_number'),''),work_email=case when p_data ? 'work_email' then nullif(btrim(p_data->>'work_email'),'') else work_email end,
 relationship_type_id=nullif(p_data->>'relationship_type_id','')::uuid,employer=nullif(btrim(p_data->>'employer'),''),position=nullif(btrim(p_data->>'position'),''),start_date=nullif(p_data->>'start_date','')::date,end_date=nullif(p_data->>'end_date','')::date,updated_at=now() where id=p_id and organisation_id=p_organisation_id;
 end if;
 elsif p_action='status_person' then
 v_status:=p_data->>'status'; if v_status not in ('active','inactive','archived') or v_status is null then raise exception 'PEOPLE_INVALID_STATUS'; end if;
 select employment_status into v_old from public.v2_people where id=p_id and organisation_id=p_organisation_id for update;
 update public.v2_people set employment_status=v_status,updated_at=now() where id=p_id and organisation_id=p_organisation_id;
 elsif p_action='link_user' then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,'people.edit');
 if nullif(p_data->>'user_id','') is not null and not private.tttracker_v2_is_active_org_member(p_organisation_id,(p_data->>'user_id')::uuid) then raise exception 'PEOPLE_RELATIONSHIP_INVALID'; end if;
 update public.v2_people set auth_user_id=nullif(p_data->>'user_id','')::uuid,updated_at=now() where id=p_id and organisation_id=p_organisation_id;
 elsif p_action='type' then
 if p_id is null then insert into public.v2_person_types(organisation_id,name) values(p_organisation_id,btrim(p_data->>'name')) returning id into v_id;
 else update public.v2_person_types set name=btrim(p_data->>'name'),is_active=coalesce((p_data->>'is_active')::boolean,true) where id=p_id and organisation_id=p_organisation_id; if not found then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if; end if;
 elsif p_action='crew' then
 if p_id is null then insert into public.v2_crews(organisation_id,name,leader_person_id) values(p_organisation_id,btrim(p_data->>'name'),nullif(p_data->>'leader_person_id','')::uuid) returning id into v_id;
 else update public.v2_crews set name=btrim(p_data->>'name'),leader_person_id=nullif(p_data->>'leader_person_id','')::uuid,status=coalesce(p_data->>'status','active') where id=p_id and organisation_id=p_organisation_id; if not found then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if; end if;
 elsif p_action='crew_member' then
 if not exists(select 1 from public.v2_crews where id=p_id and organisation_id=p_organisation_id) then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if;
 if coalesce((p_data->>'remove')::boolean,false) then
 update public.v2_crew_members set left_at=coalesce(nullif(p_data->>'effective_at','')::timestamptz,now()) where organisation_id=p_organisation_id and crew_id=p_id and person_id=v_person and left_at is null;
 else
 insert into public.v2_crew_members(organisation_id,crew_id,person_id,joined_at) values(p_organisation_id,p_id,v_person,coalesce(nullif(p_data->>'effective_at','')::timestamptz,now()));
 end if;
 elsif p_action in ('person_project','crew_project') then
 v_project:=(p_data->>'project_id')::uuid;
 if not exists(select 1 from public.v2_projects where id=v_project and organisation_id=p_organisation_id and status<>'archived') or not private.tttracker_v2_is_project_member(v_project) then raise exception 'PEOPLE_RELATIONSHIP_INVALID'; end if;
 if p_action='person_project' then
 insert into public.v2_person_projects(organisation_id,person_id,project_id,ended_at) values(p_organisation_id,v_person,v_project,case when (p_data->>'remove')::boolean then now() end) on conflict(person_id,project_id) do update set ended_at=excluded.ended_at;
 else insert into public.v2_crew_projects(organisation_id,crew_id,project_id,ended_at) values(p_organisation_id,p_id,v_project,case when (p_data->>'remove')::boolean then now() end) on conflict(crew_id,project_id) do update set ended_at=excluded.ended_at; end if;
 elsif p_action='training_type' then
 if p_id is null then insert into public.v2_training_types(organisation_id,name,validity_mode,validity_months,renewal_lead_days,requires_issue_date,requires_certificate_number,document_requirement)
 values(p_organisation_id,btrim(p_data->>'name'),coalesce(p_data->>'validity_mode','manual'),nullif(p_data->>'validity_months','')::integer,coalesce(nullif(p_data->>'renewal_lead_days','')::integer,30),coalesce((p_data->>'requires_issue_date')::boolean,true),coalesce((p_data->>'requires_certificate_number')::boolean,false),coalesce(p_data->>'document_requirement','single')) returning id into v_id;
 else update public.v2_training_types set name=btrim(p_data->>'name'),validity_mode=p_data->>'validity_mode',validity_months=nullif(p_data->>'validity_months','')::integer,renewal_lead_days=coalesce(nullif(p_data->>'renewal_lead_days','')::integer,30),requires_issue_date=coalesce((p_data->>'requires_issue_date')::boolean,true),requires_certificate_number=coalesce((p_data->>'requires_certificate_number')::boolean,false),document_requirement=p_data->>'document_requirement',is_active=coalesce((p_data->>'is_active')::boolean,true) where id=p_id and organisation_id=p_organisation_id; if not found then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if; end if;
 elsif p_action='linked_type' then
 insert into public.v2_training_linked_types values(p_organisation_id,p_id,(p_data->>'linked_type_id')::uuid) on conflict do nothing;
 elsif p_action='training' then
 if not exists(select 1 from public.v2_training_types where organisation_id=p_organisation_id and id=(p_data->>'training_type_id')::uuid and is_active) then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if;
 v_issue:=nullif(p_data->>'issue_date','')::date; v_group:=gen_random_uuid();
 for v_type in select k.* from public.v2_training_types k where k.organisation_id=p_organisation_id and k.is_active and (k.id=(p_data->>'training_type_id')::uuid or exists(select 1 from public.v2_training_linked_types l where l.organisation_id=p_organisation_id and l.training_type_id=(p_data->>'training_type_id')::uuid and l.linked_type_id=k.id and (p_data->'linked_type_ids') ? k.id::text)) loop
 if v_type.requires_issue_date and v_issue is null then raise exception 'TRAINING_ISSUE_DATE_REQUIRED'; end if;
 if v_type.requires_certificate_number and nullif(btrim(p_data->>'certificate_number'),'') is null then raise exception 'TRAINING_CERTIFICATE_REQUIRED'; end if;
 v_expiry:=case v_type.validity_mode when 'never' then null when 'automatic' then (v_issue+make_interval(months=>v_type.validity_months))::date else nullif(p_data->>'expiry_date','')::date end;
 if v_type.validity_mode<>'never' and v_expiry is null then raise exception 'TRAINING_EXPIRY_REQUIRED'; end if;
 insert into public.v2_training_records(organisation_id,person_id,training_type_id,evidence_group_id,issue_date,expiry_date,certificate_number,created_by) values(p_organisation_id,v_person,v_type.id,v_group,v_issue,v_expiry,nullif(btrim(p_data->>'certificate_number'),''),auth.uid()) returning id into v_id;
 insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area,target_id) values(p_organisation_id,v_person,auth.uid(),'training_added','operational',v_id);
 end loop;
 if v_id is null then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if;
 elsif p_action in ('review_training','resubmit_training','update_training') then
 perform pg_advisory_xact_lock(hashtextextended(p_organisation_id::text,2));
 select * into v_record from public.v2_training_records where id=p_id and organisation_id=p_organisation_id for update;
 if not found then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if; v_person:=v_record.person_id; v_old:=v_record.review_status;
 if p_action='update_training' then
if v_old not in ('pending_review','changes_required') then raise exception 'TRAINING_INVALID_TRANSITION'; end if;
select * into v_type from public.v2_training_types where id=v_record.training_type_id and organisation_id=p_organisation_id;
v_issue:=nullif(p_data->>'issue_date','')::date;
if v_type.requires_issue_date and v_issue is null then raise exception 'TRAINING_ISSUE_DATE_REQUIRED'; end if;
if v_type.requires_certificate_number and nullif(btrim(p_data->>'certificate_number'),'') is null then raise exception 'TRAINING_CERTIFICATE_REQUIRED'; end if;
v_expiry:=case v_type.validity_mode when 'never' then null when 'automatic' then (v_issue+make_interval(months=>v_type.validity_months))::date else nullif(p_data->>'expiry_date','')::date end;
if v_type.validity_mode<>'never' and v_expiry is null then raise exception 'TRAINING_EXPIRY_REQUIRED'; end if;
insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area,target_id,context) values(p_organisation_id,v_person,auth.uid(),'training_dates_updated','operational',p_id,jsonb_build_object('old_issue_date',v_record.issue_date,'new_issue_date',v_issue,'old_expiry_date',v_record.expiry_date,'new_expiry_date',v_expiry));
update public.v2_training_records set issue_date=v_issue,expiry_date=v_expiry,certificate_number=nullif(btrim(p_data->>'certificate_number'),'') where id=p_id and organisation_id=p_organisation_id;
elsif p_action='resubmit_training' then
 if v_old<>'changes_required' then raise exception 'TRAINING_INVALID_TRANSITION'; end if;
 update public.v2_training_records set review_status='pending_review' where id=p_id and organisation_id=p_organisation_id;
 else
 if v_old not in ('pending_review','changes_required') then raise exception 'TRAINING_INVALID_TRANSITION'; end if;
 v_status:=p_data->>'outcome'; if v_status not in ('approved','rejected','changes_required') or v_status is null then raise exception 'TRAINING_INVALID_OUTCOME'; end if;
 if v_status in ('rejected','changes_required') and nullif(btrim(p_data->>'comment'),'') is null then raise exception 'TRAINING_REVIEW_COMMENT_REQUIRED'; end if;
 select * into v_type from public.v2_training_types where id=v_record.training_type_id and organisation_id=p_organisation_id;
 if v_status='approved' and v_type.document_requirement<>'none' then
 if v_type.document_requirement in ('single','single_or_front_back') and exists(select 1 from public.v2_people_documents where organisation_id=p_organisation_id and person_id=v_person and evidence_group_id=v_record.evidence_group_id and side='single') then null;
 elsif v_type.document_requirement in ('front_back','single_or_front_back') and (select count(distinct side) from public.v2_people_documents where organisation_id=p_organisation_id and person_id=v_person and evidence_group_id=v_record.evidence_group_id and side in ('front','back'))=2 then null;
 else raise exception 'TRAINING_DOCUMENTS_REQUIRED'; end if; end if;
 if v_status='approved' then
update public.v2_training_records set is_current=false,superseded_at=now() where organisation_id=p_organisation_id and person_id=v_person and training_type_id=v_record.training_type_id and is_current and id<>p_id;
end if;
update public.v2_training_records set is_current=(v_status='approved'),review_status=v_status,review_comment=nullif(btrim(p_data->>'comment'),''),reviewed_by=auth.uid(),reviewed_at=now() where id=p_id and organisation_id=p_organisation_id;
 end if;
 elsif p_action='document' then
 select * into v_record from public.v2_training_records where id=(p_data->>'record_id')::uuid and organisation_id=p_organisation_id and person_id=v_person for update;
 if not found or v_record.review_status not in ('pending_review','changes_required') then raise exception 'TRAINING_DOCUMENT_NOT_EDITABLE'; end if;
 if not exists(select 1 from storage.objects where bucket_id='v2-people-evidence' and name=p_data->>'storage_key') then raise exception 'TRAINING_DOCUMENT_NOT_FOUND'; end if;
if p_data->>'storage_key' not like p_organisation_id::text||'/'||v_person::text||'/%' then raise exception 'PEOPLE_RELATIONSHIP_INVALID'; end if;
 insert into public.v2_people_documents(organisation_id,person_id,evidence_group_id,name,side,storage_key,content_type,size_bytes,created_by) values(p_organisation_id,v_person,v_record.evidence_group_id,p_data->>'name',p_data->>'side',p_data->>'storage_key',p_data->>'content_type',(p_data->>'size_bytes')::integer,auth.uid()) returning id into v_id;
 elsif p_action='prestart' then
 v_project:=(p_data->>'project_id')::uuid;
 if not private.tttracker_v2_is_project_member(v_project) then raise exception 'PEOPLE_RELATIONSHIP_INVALID'; end if;
 insert into public.v2_site_prestarts(organisation_id,project_id,prestart_date,location,discussion,created_by) values(p_organisation_id,v_project,(p_data->>'date')::date,btrim(p_data->>'location'),coalesce(p_data->>'discussion',''),auth.uid()) returning id into v_id;
 elsif p_action in ('prestart_attendee','complete_prestart') then
 perform 1 from public.v2_site_prestarts where id=p_id and organisation_id=p_organisation_id and status='draft' and private.tttracker_v2_is_project_member(project_id) for update;
 if not found then raise exception 'PRESTART_NOT_EDITABLE'; end if;
 if p_action='complete_prestart' then
 update public.v2_site_prestarts set status='completed',completed_by=auth.uid(),completed_at=now() where id=p_id and organisation_id=p_organisation_id;
 else insert into public.v2_site_prestart_attendees values(p_organisation_id,p_id,v_person,auth.uid(),now()) on conflict(prestart_id,person_id) do nothing; end if;
 end if;
 insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area,target_id,context)
 values(p_organisation_id,v_person,auth.uid(),p_action,'operational',v_id,jsonb_build_object('previous_status',v_old,'new_status',v_status,'project_id',v_project));
 return jsonb_build_object('id',v_id,'evidence_group_id',v_group);
exception
when foreign_key_violation then raise exception 'PEOPLE_RELATIONSHIP_INVALID' using errcode='23514';
when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then raise exception 'PEOPLE_INVALID_FIELDS' using errcode='22023';
when unique_violation then if sqlerrm='PEOPLE_IDENTIFIER_EXISTS' then raise; end if; raise exception 'PEOPLE_DUPLICATE_RECORD' using errcode='23505';
end $$;
revoke all on function private.tttracker_v2_people_read_base(uuid,text,text,integer,uuid,jsonb),private.tttracker_v2_people_write_base(uuid,text,uuid,jsonb) from public,anon,authenticated;
create or replace function private.tttracker_v2_training_state(p_org uuid,p_person uuid,p_type uuid,p_required boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.v2_training_records;k public.v2_training_types;s text;
begin
select * into k from public.v2_training_types where organisation_id=p_org and id=p_type;
select * into r from public.v2_training_records where organisation_id=p_org and person_id=p_person and training_type_id=p_type and superseded_at is null
order by is_current desc,created_at desc,id limit 1;
s:=case when r.id is null then case when p_required then 'missing' else 'not_required' end
when r.review_status<>'approved' then r.review_status when r.expiry_date<current_date then 'expired'
when r.expiry_date<=current_date+k.renewal_lead_days then 'expiring' else 'current' end;
return jsonb_build_object('state',s,'record_id',r.id,'expiry_date',r.expiry_date,'required',p_required);
end $$;
create or replace function private.tttracker_v2_requirement_applies(p_req public.v2_project_training_requirements,p public.v2_people)
returns boolean language sql stable set search_path='' as $$
select p_req.is_active and case p_req.applies_to when 'everyone' then true when 'relationship' then p.relationship_type_id=p_req.relationship_type_id
when 'position' then lower(p.position)=lower(p_req.position) when 'person' then p.id=p_req.person_id
when 'crew_leader' then exists(select 1 from public.v2_crews c join public.v2_crew_projects cp on cp.crew_id=c.id and cp.organisation_id=c.organisation_id where c.organisation_id=p.organisation_id and c.leader_person_id=p.id and cp.project_id=p_req.project_id and cp.ended_at is null) else false end
$$;
create or replace function public.tttracker_v2_people_read(p_organisation_id uuid,p_area text default 'people',p_query text default '',p_page integer default 1,p_person_id uuid default null,p_filter jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; rows jsonb; total bigint; off integer:=greatest(0,least(coalesce(p_page,1),100000)-1)*20; pid uuid:=nullif(p_filter->>'project_id','')::uuid;
begin
if p_area in ('matrix','requirements','training','review') then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,case when p_area='review' then 'training.approve' else 'training.view' end);
 if pid is not null and not exists(select 1 from public.v2_projects where id=pid and organisation_id=p_organisation_id and private.tttracker_v2_is_project_member(id)) then raise exception 'PEOPLE_RELATIONSHIP_INVALID';end if;
 if p_person_id is not null and not exists(select 1 from public.v2_people where id=p_person_id and organisation_id=p_organisation_id) then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
 if p_area='matrix' then
 with persons as(select p.* from public.v2_people p where p.organisation_id=p_organisation_id and p.employment_status='active' and p.display_name ilike '%'||p_query||'%'
 and (p_person_id is null or p.id=p_person_id) and (coalesce(p_filter->>'relationship_type_id','')='' or p.relationship_type_id=(p_filter->>'relationship_type_id')::uuid)
 and (coalesce(p_filter->>'crew_id','')='' or exists(select 1 from public.v2_crew_members where organisation_id=p_organisation_id and person_id=p.id and crew_id=(p_filter->>'crew_id')::uuid and left_at is null))
 and (pid is null or exists(select 1 from public.v2_person_projects where organisation_id=p_organisation_id and person_id=p.id and project_id=pid and ended_at is null)
 or exists(select 1 from public.v2_crew_members m join public.v2_crew_projects cp using(organisation_id,crew_id) where m.organisation_id=p_organisation_id and m.person_id=p.id and m.left_at is null and cp.ended_at is null and cp.project_id=pid))),
 cells as(select p.id,p.display_name,(select coalesce(jsonb_agg(jsonb_build_object('type_id',k.id,'type_name',k.name)||private.tttracker_v2_training_state(p_organisation_id,p.id,k.id,
 exists(select 1 from public.v2_project_training_requirements req where req.organisation_id=p_organisation_id and req.project_id=pid and req.training_type_id=k.id and private.tttracker_v2_requirement_applies(req,p))) order by k.name),'[]')
 from public.v2_training_types k where k.organisation_id=p_organisation_id and k.is_active
 and (coalesce(p_filter->>'training_type_id','')='' or k.id=(p_filter->>'training_type_id')::uuid)
 and (coalesce(p_filter->>'category','')='' or k.category=p_filter->>'category')) cells from persons p),
 filtered as(select * from cells where coalesce(p_filter->>'gaps','')<>'true' or exists(select 1 from jsonb_array_elements(cells.cells) c where c->>'required'='true' and c->>'state' not in ('current','expiring')))
 select count(*),(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select * from filtered order by display_name,id limit 20 offset off)x) into total,rows from filtered;
 elsif p_area='requirements' then
 with requirements as(select req.id,req.project_id,pr.name project,req.training_type_id,k.name training_type,req.applies_to,req.relationship_type_id,req.position,req.person_id,req.is_active,
 (select coalesce(jsonb_agg(jsonb_build_object('person_id',p.id,'display_name',p.display_name)||private.tttracker_v2_training_state(p_organisation_id,p.id,k.id,true) order by p.display_name),'[]')
 from public.v2_people p where p.organisation_id=p_organisation_id and p.employment_status='active' and private.tttracker_v2_requirement_applies(req,p)
 and (exists(select 1 from public.v2_person_projects pp where pp.organisation_id=p_organisation_id and pp.person_id=p.id and pp.project_id=req.project_id and pp.ended_at is null)
 or exists(select 1 from public.v2_crew_members m join public.v2_crew_projects cp using(organisation_id,crew_id) where m.organisation_id=p_organisation_id and m.person_id=p.id and m.left_at is null and cp.project_id=req.project_id and cp.ended_at is null))) people
 from public.v2_project_training_requirements req join public.v2_projects pr on pr.id=req.project_id and pr.organisation_id=req.organisation_id join public.v2_training_types k on k.id=req.training_type_id and k.organisation_id=req.organisation_id
 where req.organisation_id=p_organisation_id and private.tttracker_v2_is_project_member(req.project_id) and (pid is null or pid=req.project_id) and concat_ws(' ',pr.name,k.name) ilike '%'||p_query||'%')
 select count(*),(select coalesce(jsonb_agg((to_jsonb(x)-'people')||jsonb_build_object('people_total',jsonb_array_length(x.people),'compliant',(select count(*) from jsonb_array_elements(x.people) a where a->>'state' in ('current','expiring')),'people',(select coalesce(jsonb_agg(a),'[]') from(select a from jsonb_array_elements(x.people) a limit 20 offset greatest(0,coalesce((p_filter->>'detail_page')::integer,1)-1)*20) page_people))),'[]') from(select * from requirements where coalesce(p_filter->>'id','')='' or id=(p_filter->>'id')::uuid order by project,training_type,id limit 20 offset case when coalesce(p_filter->>'id','')='' then off else 0 end)x) into total,rows from requirements;
 else
 with records as(select t.id,t.person_id,t.training_type_id,p.display_name,k.name training_type,t.issue_date,t.expiry_date,t.certificate_number,t.review_status,t.review_comment,t.reviewed_at,t.reviewed_by,t.evidence_group_id,t.source_channel,t.created_at,t.submitted_at,
 case when t.superseded_at is not null then 'superseded' when t.expiry_date<current_date then 'expired' when t.expiry_date<=current_date+k.renewal_lead_days then 'expiring' else 'current' end validity_status,
 case when t.superseded_at is not null then 'superseded' when t.review_status<>'approved' then t.review_status when t.expiry_date<current_date then 'expired' when t.expiry_date<=current_date+k.renewal_lead_days then 'expiring' else 'current' end status,
 (select count(*) from public.v2_people_documents d where d.organisation_id=t.organisation_id and d.evidence_group_id=t.evidence_group_id) document_count
 from public.v2_training_records t join public.v2_people p on p.id=t.person_id and p.organisation_id=t.organisation_id join public.v2_training_types k on k.id=t.training_type_id and k.organisation_id=t.organisation_id
 where t.organisation_id=p_organisation_id and (p_person_id is null or t.person_id=p_person_id) and (coalesce(p_filter->>'id','')='' or t.id=(p_filter->>'id')::uuid)
 and (coalesce(p_filter->>'relationship_type_id','')='' or p.relationship_type_id=(p_filter->>'relationship_type_id')::uuid)
 and (coalesce(p_filter->>'training_type_id','')='' or k.id=(p_filter->>'training_type_id')::uuid)
 and (coalesce(p_filter->>'source_channel','')='' or t.source_channel=p_filter->>'source_channel')
 and (coalesce(p_filter->>'crew_id','')='' or exists(select 1 from public.v2_crew_members where organisation_id=t.organisation_id and person_id=t.person_id and crew_id=(p_filter->>'crew_id')::uuid and left_at is null))
 and (pid is null or exists(select 1 from public.v2_person_projects where organisation_id=t.organisation_id and person_id=t.person_id and project_id=pid and ended_at is null)
 or exists(select 1 from public.v2_crew_members m join public.v2_crew_projects cp using(organisation_id,crew_id) where m.organisation_id=t.organisation_id and m.person_id=t.person_id and m.left_at is null and cp.project_id=pid and cp.ended_at is null))
 and concat_ws(' ',p.display_name,k.name,t.certificate_number) ilike '%'||p_query||'%'), filtered as(select * from records where
 (coalesce(p_filter->>'status','')='' or status=p_filter->>'status') and (coalesce(p_filter->>'review_status','')='' or review_status=p_filter->>'review_status')
 and (p_area<>'review' or coalesce(p_filter->>'review_status','')<>'' or review_status in ('pending_review','changes_required')))
 select count(*),(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select * from filtered order by display_name,created_at desc,id limit 20 offset off)x) into total,rows from filtered;
 end if;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page);
elsif p_area='training_types' then
perform private.tttracker_v2_require_people_permission(p_organisation_id,case when private.tttracker_v2_has_permission(p_organisation_id,'training.configure') then 'training.configure' when private.tttracker_v2_has_permission(p_organisation_id,'training.create') then 'training.create' else 'training.view' end);
select count(*) into total from public.v2_training_types k where organisation_id=p_organisation_id and name ilike '%'||p_query||'%' and (coalesce(p_filter->>'id','')='' or k.id=(p_filter->>'id')::uuid);
select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select k.*,(select coalesce(jsonb_agg(linked_type_id),'[]') from public.v2_training_linked_types where organisation_id=p_organisation_id and training_type_id=k.id) linked_types from public.v2_training_types k where organisation_id=p_organisation_id and name ilike '%'||p_query||'%' and (coalesce(p_filter->>'id','')='' or k.id=(p_filter->>'id')::uuid) order by name,id limit 20 offset off)x;
return jsonb_build_object('rows',rows,'total',total,'page',p_page);
elsif p_area in ('crew_choices','crew_allocation') then
perform private.tttracker_v2_require_people_permission(p_organisation_id,'people.crews.view');
if pid is null or not exists(select 1 from public.v2_projects where organisation_id=p_organisation_id and id=pid and private.tttracker_v2_is_project_member(id)) then raise exception 'PEOPLE_RELATIONSHIP_INVALID';end if;
if p_area='crew_choices' then
select count(*) into total from public.v2_crews c where c.organisation_id=p_organisation_id and c.name ilike '%'||p_query||'%' and exists(select 1 from public.v2_crew_projects where organisation_id=p_organisation_id and crew_id=c.id and project_id=pid and assigned_at::date<=coalesce(nullif(p_filter->>'date','')::date,current_date) and (ended_at is null or ended_at::date>=coalesce(nullif(p_filter->>'date','')::date,current_date)));
select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select c.id,c.name from public.v2_crews c where c.organisation_id=p_organisation_id and c.name ilike '%'||p_query||'%' and exists(select 1 from public.v2_crew_projects where organisation_id=p_organisation_id and crew_id=c.id and project_id=pid and assigned_at::date<=coalesce(nullif(p_filter->>'date','')::date,current_date) and (ended_at is null or ended_at::date>=coalesce(nullif(p_filter->>'date','')::date,current_date))) order by c.name,c.id limit 20 offset off)x;
return jsonb_build_object('rows',rows,'total',total,'page',p_page);
end if;
if not exists(select 1 from public.v2_crew_projects where organisation_id=p_organisation_id and crew_id=(p_filter->>'id')::uuid and project_id=pid and assigned_at::date<=coalesce(nullif(p_filter->>'date','')::date,current_date) and (ended_at is null or ended_at::date>=coalesce(nullif(p_filter->>'date','')::date,current_date))) then raise exception 'PEOPLE_RELATIONSHIP_INVALID';end if;
select count(*) into total from public.v2_crew_members where organisation_id=p_organisation_id and crew_id=(p_filter->>'id')::uuid and joined_at::date<=coalesce(nullif(p_filter->>'date','')::date,current_date) and (left_at is null or left_at::date>=coalesce(nullif(p_filter->>'date','')::date,current_date));
select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select p.id,p.display_name,p.position from public.v2_crew_members m join public.v2_people p on p.id=m.person_id and p.organisation_id=m.organisation_id where m.organisation_id=p_organisation_id and m.crew_id=(p_filter->>'id')::uuid and m.joined_at::date<=coalesce(nullif(p_filter->>'date','')::date,current_date) and (m.left_at is null or m.left_at::date>=coalesce(nullif(p_filter->>'date','')::date,current_date)) order by p.display_name,p.id limit 20 offset off)x;
return jsonb_build_object('rows',rows,'total',total,'page',p_page,'crew',(select jsonb_build_object('id',id,'name',name,'leader_person_id',leader_person_id) from public.v2_crews where organisation_id=p_organisation_id and id=(p_filter->>'id')::uuid));
elsif p_area='crew_history' then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,'people.crews.view');
 if not exists(select 1 from public.v2_crews where organisation_id=p_organisation_id and id=(p_filter->>'crew_id')::uuid) then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
 select count(*) into total from public.v2_crew_members where organisation_id=p_organisation_id and crew_id=(p_filter->>'crew_id')::uuid;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select m.id,p.display_name,m.joined_at,m.left_at from public.v2_crew_members m join public.v2_people p on p.id=m.person_id and p.organisation_id=m.organisation_id where m.organisation_id=p_organisation_id and m.crew_id=(p_filter->>'crew_id')::uuid order by m.joined_at desc,m.id limit 20 offset off)x;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page);
elsif p_area='document_scope' then
perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.edit');
select jsonb_build_object('person',jsonb_build_object('id',p.id,'display_name',p.display_name,'employee_number',p.employee_number,'relationship_type_id',p.relationship_type_id),'training',jsonb_build_object('name',k.name,'issue_date',r.issue_date,'expiry_date',r.expiry_date),'rules',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from public.v2_people_document_rules d where d.organisation_id=p_organisation_id and d.is_active)) into result
from public.v2_training_records r join public.v2_people p on p.id=r.person_id and p.organisation_id=r.organisation_id join public.v2_training_types k on k.id=r.training_type_id and k.organisation_id=r.organisation_id where r.organisation_id=p_organisation_id and r.id=(p_filter->>'id')::uuid and (p_person_id is null or p.id=p_person_id) and r.review_status in ('pending_review','changes_required');
if result is null then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;return result;
elsif p_area='document_rules' then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,'people.configure');
 select count(*) into total from public.v2_people_document_rules where organisation_id=p_organisation_id and name ilike '%'||p_query||'%';
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select id,name,parent_id,category,relationship_type_id,provider,folder_template,filename_template,date_format,collision_policy,creation_trigger,library_reference,is_active from public.v2_people_document_rules where organisation_id=p_organisation_id and name ilike '%'||p_query||'%' order by name,id limit 20 offset off)x;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page);
elsif p_area='review_rules' then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.configure');
 return jsonb_build_object('policies',coalesce((select policies from public.v2_people_review_defaults where organisation_id=p_organisation_id),'{}'));
end if;
result:=private.tttracker_v2_people_read_base(p_organisation_id,p_area,p_query,p_page,p_person_id,p_filter);
if p_area='overview' then
return result||jsonb_build_object('training_expiring',case when private.tttracker_v2_has_permission(p_organisation_id,'training.view') then (select count(*) from public.v2_training_records r join public.v2_training_types k on k.id=r.training_type_id and k.organisation_id=r.organisation_id where r.organisation_id=p_organisation_id and r.is_current and r.expiry_date>=current_date and r.expiry_date<=current_date+k.renewal_lead_days) end,'training_expired',case when private.tttracker_v2_has_permission(p_organisation_id,'training.view') then (select count(*) from public.v2_training_records where organisation_id=p_organisation_id and is_current and expiry_date<current_date) end);
elsif p_area='training_types' then
 select coalesce(jsonb_agg(r||jsonb_build_object('code',k.code,'category',k.category,'description',k.description,'review_policy',k.review_policy)),'[]') into rows from jsonb_array_elements(result->'rows') r join public.v2_training_types k on k.id=(r->>'id')::uuid and k.organisation_id=p_organisation_id;
 result:=result||jsonb_build_object('rows',rows);
elsif p_area='types' then
 select coalesce(jsonb_agg(r||jsonb_build_object('settings',k.settings)),'[]') into rows from jsonb_array_elements(result->'rows') r join public.v2_person_types k on k.id=(r->>'id')::uuid and k.organisation_id=p_organisation_id;
 result:=result||jsonb_build_object('rows',rows);
end if;
return result;
end $$;
create or replace function public.tttracker_v2_people_write(p_organisation_id uuid,p_action text,p_id uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;r public.v2_training_records;k public.v2_training_types;v_id uuid;v_policy text;v_source text;
begin
if p_action='finalize_training' then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.edit');
 select * into r from public.v2_training_records where organisation_id=p_organisation_id and id=p_id for update;
 if r.submitted_at is not null and r.review_status in ('pending_review','approved') then return jsonb_build_object('id',p_id);end if;
 if not found or r.review_status not in ('pending_review','changes_required') then raise exception 'TRAINING_INVALID_TRANSITION';end if;
 for r in select * from public.v2_training_records where organisation_id=p_organisation_id and evidence_group_id=r.evidence_group_id and review_status in ('pending_review','changes_required') order by id for update loop
select * into k from public.v2_training_types where organisation_id=p_organisation_id and id=r.training_type_id;
 v_source:=coalesce(p_data->>'source_channel',r.source_channel);
 if v_source not in ('internal','person_web','mobile','external_onboarding','import','integration') then raise exception 'PEOPLE_INVALID_FIELDS';end if;
 v_policy:=case when k.review_policy='inherit' then coalesce((select policies->>v_source from public.v2_people_review_defaults where organisation_id=p_organisation_id),'required') else k.review_policy end;
 -- A trusted source label is never authority. The authenticated actor needs the capability.

 if v_policy='none' or (v_policy='trusted' and v_source='internal' and private.tttracker_v2_has_permission(p_organisation_id,'training.confirm_without_review')) then
 -- Use the existing evidence validation/atomic supersession, with explicit authorization here.
 perform private.tttracker_v2_confirm_training(p_organisation_id,r.id);
 insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area,target_id) values(p_organisation_id,r.person_id,auth.uid(),'training_direct_confirm','operational',r.id);
 end if;
 insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area,target_id,context) values(p_organisation_id,r.person_id,auth.uid(),'training_submitted','operational',r.id,jsonb_build_object('source_channel',v_source));
 update public.v2_training_records set source_channel=v_source,submitted_at=now() where organisation_id=p_organisation_id and id=r.id;
 end loop;
 return jsonb_build_object('id',p_id);
elsif p_action='crew_project' then
perform private.tttracker_v2_require_people_permission(p_organisation_id,'people.crews.manage');
if not exists(select 1 from public.v2_crews where organisation_id=p_organisation_id and id=p_id) or not exists(select 1 from public.v2_projects where organisation_id=p_organisation_id and id=(p_data->>'project_id')::uuid and private.tttracker_v2_is_project_member(id)) then raise exception 'PEOPLE_RELATIONSHIP_INVALID';end if;
if coalesce((p_data->>'remove')::boolean,false) then update public.v2_crew_projects set ended_at=coalesce(nullif(p_data->>'effective_at','')::timestamptz,now()) where organisation_id=p_organisation_id and crew_id=p_id and project_id=(p_data->>'project_id')::uuid and ended_at is null;
else insert into public.v2_crew_projects(organisation_id,crew_id,project_id,assigned_at) values(p_organisation_id,p_id,(p_data->>'project_id')::uuid,coalesce(nullif(p_data->>'effective_at','')::timestamptz,now())) on conflict(organisation_id,crew_id,project_id) where ended_at is null do nothing;end if;v_id:=p_id;
elsif p_action='requirement' then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.requirements.manage');
 if not exists(select 1 from public.v2_projects where organisation_id=p_organisation_id and id=(p_data->>'project_id')::uuid and private.tttracker_v2_is_project_member(id)) then raise exception 'PEOPLE_RELATIONSHIP_INVALID';end if;
 v_id:=coalesce(p_id,gen_random_uuid());
 if p_id is not null and not exists(select 1 from public.v2_project_training_requirements where organisation_id=p_organisation_id and id=p_id) then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
 insert into public.v2_project_training_requirements(id,organisation_id,project_id,training_type_id,applies_to,relationship_type_id,position,person_id,is_active)
 values(v_id,p_organisation_id,(p_data->>'project_id')::uuid,(p_data->>'training_type_id')::uuid,coalesce(p_data->>'applies_to','everyone'),nullif(p_data->>'relationship_type_id','')::uuid,nullif(p_data->>'position',''),nullif(p_data->>'person_id','')::uuid,coalesce((p_data->>'is_active')::boolean,true))
 on conflict(id) do update set project_id=excluded.project_id,training_type_id=excluded.training_type_id,applies_to=excluded.applies_to,relationship_type_id=excluded.relationship_type_id,position=excluded.position,person_id=excluded.person_id,is_active=excluded.is_active where v2_project_training_requirements.organisation_id=p_organisation_id;
elsif p_action='document_rule' then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,'people.configure');
 v_id:=coalesce(p_id,gen_random_uuid());
 if p_id is not null and not exists(select 1 from public.v2_people_document_rules where organisation_id=p_organisation_id and id=p_id) then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
 if p_data->>'classification'='confidential' or coalesce(p_data->>'category','') in ('payroll','banking','tax','super') then raise exception 'PEOPLE_CONFIDENTIAL_COLLECTION_DISABLED';end if;
 if p_data->>'folder_template' ~ '(\.\.|^/|\\)' or p_data->>'filename_template' ~ '[/\\]' then raise exception 'PEOPLE_INVALID_PATH';end if;
 if exists(select 1 from regexp_matches(concat_ws(' ',p_data->>'folder_template',p_data->>'filename_template'),'\{([^{}]+)\}','g') token where token[1] not in ('person_id','person_display_name','first_name','last_name','employee_number','relationship_type','document_category','training_type','year','project_code','issue_date','expiry_date')) then raise exception 'PEOPLE_INVALID_PATH';end if;
 if p_data->>'parent_id'=v_id::text then raise exception 'PEOPLE_INVALID_PATH';end if;
 if exists(with recursive parents as(select id,parent_id from public.v2_people_document_rules where organisation_id=p_organisation_id and id=nullif(p_data->>'parent_id','')::uuid union select dr.id,dr.parent_id from public.v2_people_document_rules dr join parents p on dr.id=p.parent_id where dr.organisation_id=p_organisation_id) select 1 from parents where id=v_id) then raise exception 'PEOPLE_INVALID_PATH';end if;
 insert into public.v2_people_document_rules(id,organisation_id,name,parent_id,category,relationship_type_id,provider,folder_template,filename_template,date_format,collision_policy,creation_trigger,library_reference,is_active)
 values(v_id,p_organisation_id,p_data->>'name',nullif(p_data->>'parent_id','')::uuid,coalesce(p_data->>'category','training'),nullif(p_data->>'relationship_type_id','')::uuid,coalesce(p_data->>'provider','internal'),p_data->>'folder_template',p_data->>'filename_template',coalesce(p_data->>'date_format','DD-MM-YYYY'),coalesce(p_data->>'collision_policy','version'),coalesce(p_data->>'creation_trigger','first_upload'),nullif(p_data->>'library_reference',''),coalesce((p_data->>'is_active')::boolean,true))
 on conflict(id) do update set name=excluded.name,parent_id=excluded.parent_id,category=excluded.category,relationship_type_id=excluded.relationship_type_id,provider=excluded.provider,folder_template=excluded.folder_template,filename_template=excluded.filename_template,date_format=excluded.date_format,collision_policy=excluded.collision_policy,creation_trigger=excluded.creation_trigger,library_reference=excluded.library_reference,is_active=excluded.is_active where v2_people_document_rules.organisation_id=p_organisation_id;
elsif p_action='review_rules' then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.configure');
 if exists(select 1 from jsonb_each_text(p_data) e where e.key not in ('internal','person_web','mobile','external_onboarding','import','integration') or e.value not in ('required','none','trusted')) then raise exception 'PEOPLE_INVALID_FIELDS';end if;
 insert into public.v2_people_review_defaults values(p_organisation_id,p_data,now()) on conflict(organisation_id) do update set policies=excluded.policies,updated_at=now();
else
 result:=private.tttracker_v2_people_write_base(p_organisation_id,p_action,p_id,p_data);
 v_id:=(result->>'id')::uuid;
 if p_action='training_type' then
 update public.v2_training_types set code=nullif(p_data->>'code',''),category=nullif(p_data->>'category',''),description=coalesce(p_data->>'description',''),review_policy=coalesce(p_data->>'review_policy','required') where organisation_id=p_organisation_id and id=v_id;
 elsif p_action='document' then
 update public.v2_people_documents set resolved_folder=p_data->>'resolved_folder',resolved_filename=p_data->>'resolved_filename' where organisation_id=p_organisation_id and id=v_id;
 elsif p_action='type' then
 update public.v2_person_types set settings=jsonb_build_object('description',coalesce(p_data->>'description',''),'default_template_id',nullif(p_data->>'default_template_id','')) where organisation_id=p_organisation_id and id=v_id;
 elsif p_action='crew' then
 update public.v2_crews set leader_label=coalesce(nullif(p_data->>'leader_label',''),'Crew leader'),notes=coalesce(p_data->>'notes','') where organisation_id=p_organisation_id and id=v_id;
 end if;
 return result;
end if;
insert into public.v2_people_audit(organisation_id,actor_id,action,data_area,target_id) values(p_organisation_id,auth.uid(),p_action,'operational',v_id);
return jsonb_build_object('id',v_id);
exception when foreign_key_violation then raise exception 'PEOPLE_RELATIONSHIP_INVALID';
when check_violation or not_null_violation or invalid_text_representation then raise exception 'PEOPLE_INVALID_FIELDS';
end $$;
create or replace function private.tttracker_v2_confirm_training(p_org uuid,p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.v2_training_records;k public.v2_training_types;
begin
perform pg_advisory_xact_lock(hashtextextended(p_org::text,2));
select * into r from public.v2_training_records where organisation_id=p_org and id=p_id for update;
select * into k from public.v2_training_types where organisation_id=p_org and id=r.training_type_id;
if k.document_requirement<>'none' then
if k.document_requirement in ('single','single_or_front_back') and exists(select 1 from public.v2_people_documents where organisation_id=p_org and evidence_group_id=r.evidence_group_id and side='single') then null;
elsif k.document_requirement in ('front_back','single_or_front_back') and (select count(distinct side) from public.v2_people_documents where organisation_id=p_org and evidence_group_id=r.evidence_group_id and side in ('front','back'))=2 then null;
else raise exception 'TRAINING_DOCUMENTS_REQUIRED';end if;end if;
update public.v2_training_records set is_current=false,superseded_at=now() where organisation_id=p_org and person_id=r.person_id and training_type_id=r.training_type_id and is_current and id<>p_id;
update public.v2_training_records set is_current=true,review_status='approved',reviewed_at=now(),reviewed_by=auth.uid() where organisation_id=p_org and id=p_id;
end $$;
create or replace function public.tttracker_v2_people_private_domain(p_org uuid,p_person uuid,p_domain text,p_values jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
if p_domain not in ('personal_contact','emergency_contact','employment','safety_claims') then raise exception 'PEOPLE_INVALID_AREA';end if;
perform private.tttracker_v2_require_people_permission(p_org,'people.private.'||p_domain||case when p_values is null then '.view' else '.edit' end);
if not exists(select 1 from public.v2_people where organisation_id=p_org and id=p_person) then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
if p_values is null then select values_json into result from public.v2_person_private_domains where organisation_id=p_org and person_id=p_person and domain=p_domain;
else
-- Explicit domain schemas: no arbitrary payroll/bank payload can be inserted here.
if exists(select 1 from jsonb_object_keys(p_values) k where k not in (case p_domain when 'personal_contact' then 'email' when 'emergency_contact' then 'name' when 'employment' then 'notes' else 'notes' end,case p_domain when 'personal_contact' then 'phone' when 'emergency_contact' then 'phone' when 'employment' then 'contact' else 'reference' end)) then raise exception 'PEOPLE_INVALID_FIELDS';end if;
insert into public.v2_person_private_domains values(p_org,p_person,p_domain,p_values) on conflict(organisation_id,person_id,domain) do update set values_json=excluded.values_json;result:='{}';end if;
insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area) values(p_org,p_person,auth.uid(),case when p_values is null then 'domain_read' else 'domain_write' end,'private.'||p_domain);
return coalesce(result,'{}');
end $$;
do $$ declare t text;begin foreach t in array array['v2_people_review_defaults','v2_people_document_rules','v2_project_training_requirements','v2_person_private_domains'] loop
execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;end $$;
revoke all on function private.tttracker_v2_training_state(uuid,uuid,uuid,boolean),private.tttracker_v2_requirement_applies(public.v2_project_training_requirements,public.v2_people),private.tttracker_v2_confirm_training(uuid,uuid) from public,anon,authenticated;
revoke all on function public.tttracker_v2_people_private_domain(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.tttracker_v2_people_private_domain(uuid,uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

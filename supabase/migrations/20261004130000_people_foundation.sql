-- Organisation workforce records are independent of login and project access.
begin;
alter table public.v2_people add column if not exists relationship_type_id uuid;
alter table public.v2_people add column if not exists employer text;
alter table public.v2_people add column if not exists position text;
alter table public.v2_people add column if not exists work_email text;
alter table public.v2_people add column if not exists start_date date;
alter table public.v2_people add column if not exists end_date date;
create unique index if not exists v2_people_org_id_uidx on public.v2_people(organisation_id,id);
create index if not exists v2_people_org_status_idx on public.v2_people(organisation_id,employment_status,display_name,id);

create table if not exists public.v2_person_types (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
 name text not null check(btrim(name)<>''), is_active boolean not null default true,
 settings jsonb not null default '{}', unique(organisation_id,id), unique(organisation_id,name)
);
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.v2_people'::regclass and conname='v2_people_relationship_org_fk') then alter table public.v2_people add constraint v2_people_relationship_org_fk foreign key(organisation_id,relationship_type_id) references public.v2_person_types(organisation_id,id); end if; end $$;
create table if not exists public.v2_person_private (
 organisation_id uuid not null, person_id uuid not null, personal_email text, personal_phone text,
 primary key(organisation_id,person_id), foreign key(organisation_id,person_id) references public.v2_people(organisation_id,id)
);
-- Existing contact values are retained without being exposed by operational projections.
insert into public.v2_person_private(organisation_id,person_id,personal_email,personal_phone)
select organisation_id,id,email,phone from public.v2_people where email is not null or phone is not null
on conflict(organisation_id,person_id) do nothing;
create table if not exists public.v2_people_field_types (
type_key text primary key, minimum_classification text not null check(minimum_classification in ('operational','private','confidential')),
schema_definition jsonb not null default '{}'
);
insert into public.v2_people_field_types(type_key,minimum_classification) values
('operational_text','operational'),('personal_contact','private'),('date_of_birth','private'),('tax_identifier','confidential'),('bank_account','confidential'),('payroll','confidential') on conflict(type_key) do nothing;
create table if not exists public.v2_people_audit (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
 person_id uuid, actor_id uuid not null references auth.users(id), action text not null, data_area text not null,
 target_id uuid, occurred_at timestamptz not null default now(), context jsonb not null default '{}',
 foreign key(organisation_id,person_id) references public.v2_people(organisation_id,id)
);
create index if not exists v2_people_audit_person_idx on public.v2_people_audit(organisation_id,person_id,occurred_at);
create table if not exists public.v2_crews (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
 name text not null check(btrim(name)<>''), status text not null default 'active' check(status in ('active','inactive','archived')),
 leader_person_id uuid, unique(organisation_id,id), unique(organisation_id,name),
 foreign key(organisation_id,leader_person_id) references public.v2_people(organisation_id,id)
);
create table if not exists public.v2_crew_members (
 organisation_id uuid not null, crew_id uuid not null, person_id uuid not null,
 joined_at timestamptz not null default now(), left_at timestamptz,
 primary key(crew_id,person_id), foreign key(organisation_id,crew_id) references public.v2_crews(organisation_id,id),
 foreign key(organisation_id,person_id) references public.v2_people(organisation_id,id)
);
create index if not exists v2_crew_members_person_idx on public.v2_crew_members(organisation_id,person_id) where left_at is null;
create unique index if not exists v2_projects_org_id_people_uidx on public.v2_projects(organisation_id,id);
create table if not exists public.v2_person_projects (
 organisation_id uuid not null, person_id uuid not null, project_id uuid not null,
 assigned_at timestamptz not null default now(), ended_at timestamptz,
 primary key(person_id,project_id), foreign key(organisation_id,person_id) references public.v2_people(organisation_id,id),
 foreign key(organisation_id,project_id) references public.v2_projects(organisation_id,id)
);
create table if not exists public.v2_crew_projects (
 organisation_id uuid not null, crew_id uuid not null, project_id uuid not null,
 assigned_at timestamptz not null default now(), ended_at timestamptz,
 primary key(crew_id,project_id), foreign key(organisation_id,crew_id) references public.v2_crews(organisation_id,id),
 foreign key(organisation_id,project_id) references public.v2_projects(organisation_id,id)
);
create table if not exists public.v2_training_types (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
 name text not null check(btrim(name)<>''), is_active boolean not null default true,
 validity_mode text not null default 'manual' check(validity_mode in ('manual','automatic','never')),
 validity_months integer check(validity_months>0), renewal_lead_days integer not null default 30 check(renewal_lead_days>=0),
 requires_issue_date boolean not null default true, requires_certificate_number boolean not null default false,
 document_requirement text not null default 'single' check(document_requirement in ('none','single','front_back','single_or_front_back')),
 unique(organisation_id,id), unique(organisation_id,name), check(validity_mode<>'automatic' or validity_months is not null)
);
create table if not exists public.v2_training_linked_types (
 organisation_id uuid not null, training_type_id uuid not null, linked_type_id uuid not null,
 primary key(training_type_id,linked_type_id), check(training_type_id<>linked_type_id),
 foreign key(organisation_id,training_type_id) references public.v2_training_types(organisation_id,id),
 foreign key(organisation_id,linked_type_id) references public.v2_training_types(organisation_id,id)
);
create table if not exists public.v2_training_records (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null, person_id uuid not null, training_type_id uuid not null,
 evidence_group_id uuid not null default gen_random_uuid(), issue_date date, expiry_date date, certificate_number text,
 review_status text not null default 'pending_review' check(review_status in ('pending_review','approved','rejected','changes_required')),
 is_current boolean not null default false, superseded_at timestamptz, review_comment text, reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(organisation_id,id), unique(organisation_id,person_id,evidence_group_id,training_type_id),
 foreign key(organisation_id,person_id) references public.v2_people(organisation_id,id),
 foreign key(organisation_id,training_type_id) references public.v2_training_types(organisation_id,id),
 check(expiry_date is null or issue_date is null or expiry_date>=issue_date)
);
create unique index if not exists v2_training_current_uidx on public.v2_training_records(organisation_id,person_id,training_type_id) where is_current;
create index if not exists v2_training_org_review_idx on public.v2_training_records(organisation_id,review_status,created_at,id);
create index if not exists v2_training_person_idx on public.v2_training_records(organisation_id,person_id,expiry_date,id);
create table if not exists public.v2_people_documents (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null, person_id uuid not null,
 evidence_group_id uuid, name text not null, side text not null default 'single' check(side in ('single','front','back')),
 provider text not null default 'internal' check(provider in ('internal','sharepoint')),
 storage_key text not null, content_type text not null, size_bytes integer not null check(size_bytes between 1 and 10485760),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(organisation_id,id), foreign key(organisation_id,person_id) references public.v2_people(organisation_id,id)
);
create index if not exists v2_people_documents_group_idx on public.v2_people_documents(organisation_id,person_id,evidence_group_id);
create table if not exists public.v2_site_prestarts (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null, project_id uuid not null,
 prestart_date date not null, location text not null check(btrim(location)<>''), discussion text not null default '',
 status text not null default 'draft' check(status in ('draft','completed','void')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 completed_by uuid references auth.users(id), completed_at timestamptz, unique(organisation_id,id),
 foreign key(organisation_id,project_id) references public.v2_projects(organisation_id,id)
);
create table if not exists public.v2_site_prestart_attendees (
 organisation_id uuid not null, prestart_id uuid not null, person_id uuid not null,
 recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default now(),
 primary key(prestart_id,person_id), foreign key(organisation_id,prestart_id) references public.v2_site_prestarts(organisation_id,id),
 foreign key(organisation_id,person_id) references public.v2_people(organisation_id,id)
);
create index if not exists v2_site_prestarts_org_date_idx on public.v2_site_prestarts(organisation_id,prestart_date,id);
create index if not exists v2_site_prestart_person_idx on public.v2_site_prestart_attendees(organisation_id,person_id);

insert into public.v2_permissions(resource_id,permission_code,action_key,name)
select r.id,p.code,p.action,p.label from public.v2_resources r cross join (values
 ('people.archive','archive','Archive people'),('people.private.view','private_view','View private People data'),
 ('people.private.edit','private_edit','Edit private People data'),('people.confidential.view','confidential_view','View confidential People data'),
 ('people.confidential.edit','confidential_edit','Edit confidential People data'),('people.crews.view','crews_view','View crews'),
 ('people.crews.manage','crews_manage','Manage crews'),('people.site_prestarts.view','prestarts_view','View Site Prestarts'),
 ('people.site_prestarts.manage','prestarts_manage','Manage Site Prestarts'),('people.onboarding.view','onboarding_view','View onboarding'),
 ('people.onboarding.manage','onboarding_manage','Manage onboarding')
) p(code,action,label) where r.resource_key='people' on conflict(permission_code) do nothing;
-- Operational defaults only. Do not grant Private/Confidential implicitly or change existing denies.
insert into public.v2_role_permissions(organisation_id,role_id,permission_id,allowed)
select r.organisation_id,r.id,p.id,true from public.v2_roles r cross join public.v2_permissions p
where r.is_system and r.is_active and r.code='admin' and p.is_active
 and (p.permission_code like 'people.%' or p.permission_code like 'training.%')
 and p.permission_code not like 'people.private.%' and p.permission_code not like 'people.confidential.%'
on conflict(role_id,permission_id) do nothing;

create or replace function private.tttracker_v2_require_people_permission(p_org uuid,p_permission text)
returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.tttracker_v2_is_active_org_member(p_org,auth.uid())
 or not exists(select 1 from public.organisation_modules where organisation_id=p_org and module_key='people' and enabled)
 or not private.tttracker_v2_has_feature(p_org,'people')
 or not (private.tttracker_v2_has_permission(p_org,p_permission) or (p_permission='training.view' and private.tttracker_v2_has_permission(p_org,'training.approve'))) then
 raise exception 'PEOPLE_PERMISSION_DENIED' using errcode='42501'; end if;
end $$;
revoke all on function private.tttracker_v2_require_people_permission(uuid,text) from public,anon,authenticated;

-- One projection for all operational callers. Legacy contacts/metadata never enter it.
create or replace function private.tttracker_v2_operational_person(p public.v2_people)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'display_name',p.display_name,'employee_number',p.employee_number,
 'employment_status',p.employment_status,'relationship_type_id',p.relationship_type_id,
 'employer',p.employer,'position',p.position,'work_email',p.work_email,'start_date',p.start_date,'end_date',p.end_date,
 'training_status',case when private.tttracker_v2_has_permission(p.organisation_id,'training.view') then
case when exists(select 1 from public.v2_training_records t join public.v2_training_types k on k.id=t.training_type_id and k.organisation_id=t.organisation_id where t.person_id=p.id and t.organisation_id=p.organisation_id and t.is_current and t.expiry_date<=current_date+k.renewal_lead_days) then 'Requires attention'
when exists(select 1 from public.v2_training_records where person_id=p.id and organisation_id=p.organisation_id and review_status='pending_review') then 'Pending review'
when exists(select 1 from public.v2_training_records where person_id=p.id and organisation_id=p.organisation_id and is_current) then 'Current' else 'No training recorded' end else null end,
'current_projects',case when private.tttracker_v2_has_permission(p.organisation_id,'people.view') then (select string_agg(project.name,', ' order by project.name) from public.v2_person_projects a join public.v2_projects project on project.id=a.project_id and project.organisation_id=a.organisation_id where a.person_id=p.id and a.organisation_id=p.organisation_id and a.ended_at is null and private.tttracker_v2_is_project_member(project.id)) end,
'type_name',(select name from public.v2_person_types where id=p.relationship_type_id and organisation_id=p.organisation_id),
 'crews',(select coalesce(string_agg(c.name,', ' order by c.name),'') from public.v2_crew_members m join public.v2_crews c on c.id=m.crew_id and c.organisation_id=m.organisation_id where m.person_id=p.id and m.organisation_id=p.organisation_id and m.left_at is null),
 'linked_user_id',case when private.tttracker_v2_has_permission(p.organisation_id,'organisation.users.configure') then p.auth_user_id end,
'account_name',case when p.auth_user_id is not null then (select coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name') from auth.users where id=p.auth_user_id) end,
'account_status',case when p.auth_user_id is not null then coalesce((select case when status='active' then 'Active user' else 'Disabled user' end from public.organisation_users where user_id=p.auth_user_id and organisation_id=p.organisation_id),'Disabled user')
 when exists(select 1 from public.v2_organisation_invitations i where i.organisation_id=p.organisation_id and i.status='pending' and i.expires_at>now() and lower(i.email)=lower(p.work_email)) then 'Invitation pending' else 'No TTTracker account' end);
$$;
revoke all on function private.tttracker_v2_operational_person(public.v2_people) from public,anon,authenticated;

create or replace function public.tttracker_v2_people_read(p_organisation_id uuid,p_area text default 'people',p_query text default '',p_page integer default 1,p_person_id uuid default null,p_filter jsonb default '{}')
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
 and concat_ws(' ',p.display_name,p.employee_number,p.position,p.employer,(select string_agg(c.name,' ') from public.v2_crew_members m join public.v2_crews c on c.id=m.crew_id and c.organisation_id=m.organisation_id where m.person_id=p.id and m.left_at is null)) ilike '%'||v_q||'%';
 select coalesce(jsonb_agg(private.tttracker_v2_operational_person(x)),'[]') into rows from
 (select p.* from public.v2_people p where p.organisation_id=p_organisation_id and (p_person_id is null or p.id=p_person_id)
 and (coalesce(p_filter->>'status','')='' or p.employment_status=p_filter->>'status')
 and concat_ws(' ',p.display_name,p.employee_number,p.position,p.employer,(select string_agg(c.name,' ') from public.v2_crew_members m join public.v2_crews c on c.id=m.crew_id and c.organisation_id=m.organisation_id where m.person_id=p.id and m.left_at is null)) ilike '%'||v_q||'%'
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

create or replace function public.tttracker_v2_people_write(p_organisation_id uuid,p_action text,p_id uuid default null,p_data jsonb default '{}')
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
 insert into public.v2_crew_members(organisation_id,crew_id,person_id,left_at) values(p_organisation_id,p_id,v_person,case when (p_data->>'remove')::boolean then now() end)
 on conflict(crew_id,person_id) do update set left_at=excluded.left_at;
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
 for v_type in select k.* from public.v2_training_types k where k.organisation_id=p_organisation_id and k.is_active and (k.id=(p_data->>'training_type_id')::uuid or exists(select 1 from public.v2_training_linked_types l where l.organisation_id=p_organisation_id and l.training_type_id=(p_data->>'training_type_id')::uuid and l.linked_type_id=k.id)) loop
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

create or replace function public.tttracker_v2_people_classified(p_organisation_id uuid,p_person_id uuid,p_area text,p_data jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_area not in ('private','confidential') then raise exception 'PEOPLE_INVALID_AREA'; end if;
 perform private.tttracker_v2_require_people_permission(p_organisation_id,'people.'||p_area||case when p_data is null then '.view' else '.edit' end);
 if not exists(select 1 from public.v2_people where id=p_person_id and organisation_id=p_organisation_id) then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if;
 -- No financial fields or confidential value store in Phase 1.
 if p_area='confidential' and p_data is not null then raise exception 'PEOPLE_CONFIDENTIAL_NOT_IMPLEMENTED'; end if;
if p_area='confidential' then result:=jsonb_build_object('available',false);
 elsif p_data is null then select jsonb_build_object('personal_email',personal_email,'personal_phone',personal_phone) into result from public.v2_person_private where organisation_id=p_organisation_id and person_id=p_person_id;
 else insert into public.v2_person_private values(p_organisation_id,p_person_id,nullif(btrim(p_data->>'personal_email'),''),nullif(btrim(p_data->>'personal_phone'),'')) on conflict(organisation_id,person_id) do update set personal_email=excluded.personal_email,personal_phone=excluded.personal_phone; result:='{}'; end if;
 insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area,target_id) values(p_organisation_id,p_person_id,auth.uid(),case when p_data is null then 'read' else 'edit' end,p_area,p_person_id);
 return coalesce(result,'{}');
end $$;

do $$ declare t text; begin
 foreach t in array array['v2_people_field_types','v2_people','v2_person_types','v2_person_private','v2_people_audit','v2_crews','v2_crew_members','v2_person_projects','v2_crew_projects','v2_training_types','v2_training_linked_types','v2_training_records','v2_people_documents','v2_site_prestarts','v2_site_prestart_attendees'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on table public.%I from public,anon,authenticated',t);
 end loop;
end $$;
revoke all on function public.tttracker_v2_people_read(uuid,text,text,integer,uuid,jsonb) from public,anon;
revoke all on function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) from public,anon;
revoke all on function public.tttracker_v2_people_classified(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.tttracker_v2_people_read(uuid,text,text,integer,uuid,jsonb) to authenticated;
grant execute on function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) to authenticated;
grant execute on function public.tttracker_v2_people_classified(uuid,uuid,text,jsonb) to authenticated;
-- Internal evidence only; future SharePoint adapters use provider + canonical metadata.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('v2-people-evidence','v2-people-evidence',false,10485760,array['application/pdf','image/jpeg','image/png']) on conflict(id) do nothing;
-- Future tenant bootstrap must not imply access to sensitive People areas.
create or replace function public.tttracker_v2_platform_invitation(
 p_actor uuid,p_action text,p_organisation_id uuid default null,p_role_id uuid default null,p_email text default null,p_invitation_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.v2_organisation_invitations%rowtype; r public.v2_roles%rowtype; v_email text=lower(btrim(p_email)); v_created uuid;
begin
 if not exists(select 1 from public.v2_platform_admins where user_id=p_actor and status='active' and role in ('owner','admin')) then raise exception 'PLATFORM_ACCESS_DENIED'; end if;
 if p_action in ('bootstrap','create') then
  perform 1 from public.organisations where id=p_organisation_id and status='active' for update;
  if not found then raise exception 'ORGANISATION_NOT_AVAILABLE'; end if;
  if p_action='bootstrap' then
   select * into r from public.v2_roles where organisation_id=p_organisation_id and metadata->>'initial_invitation_default'='true' and is_system and is_active;
   if r.id is null then
    if exists(select 1 from public.v2_roles where organisation_id=p_organisation_id and code='admin') then raise exception 'INITIAL_ROLE_REQUIRES_CONFIGURATION'; end if;
    insert into public.v2_roles(organisation_id,code,name,description,is_system,sort_order,created_by,metadata)
    values(p_organisation_id,'admin','Administrator','Organisation administrator.',true,10,p_actor,'{"initial_invitation_default":true}') returning * into r;
    insert into public.v2_role_permissions(organisation_id,role_id,permission_id,allowed,created_by)
    select p_organisation_id,r.id,p.id,true,p_actor from public.v2_permissions p where p.is_active and p.permission_code not like 'people.private.%' and p.permission_code not like 'people.confidential.%';
   end if;
   return jsonb_build_object('roleId',r.id);
  end if;
  select * into r from public.v2_roles where id=p_role_id and organisation_id=p_organisation_id and is_active;
  if r.id is null then raise exception 'INVITATION_ROLE_NOT_AVAILABLE'; end if;
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVITATION_EMAIL_INVALID'; end if;
  if exists(select 1 from public.organisation_users m join auth.users u on u.id=m.user_id where m.organisation_id=p_organisation_id and m.status='active' and lower(u.email)=v_email) then raise exception 'ORGANISATION_MEMBER_ALREADY_ACTIVE'; end if;
  if exists(select 1 from public.v2_organisation_invitations where organisation_id=p_organisation_id and lower(email)=v_email and status='pending' and (expires_at is null or expires_at>now())) then raise exception 'INVITATION_ALREADY_PENDING'; end if;
  update public.v2_organisation_invitations set status='expired' where organisation_id=p_organisation_id and lower(email)=v_email and status='pending' and expires_at<=now();
  insert into public.v2_organisation_invitations(organisation_id,email,intended_role_id,intended_role_code,invitation_type,invited_by,expires_at)
  values(p_organisation_id,v_email,r.id,r.code,'organisation_user',p_actor,now()+interval '7 days') returning id into v_created;
  return jsonb_build_object('invitationId',v_created);
 end if;
 select * into i from public.v2_organisation_invitations where id=p_invitation_id for update;
 if i.id is null then raise exception 'INVITATION_NOT_AVAILABLE'; end if;
 if i.status='accepted' then raise exception 'INVITATION_ALREADY_ACCEPTED'; end if;
 if p_action='revoke' then
  update public.v2_organisation_invitations set status='cancelled',last_error=null,metadata=metadata||jsonb_build_object('cancelled',jsonb_build_object('actor',p_actor,'at',now())) where id=i.id;
 elsif p_action='resend' then
  if i.status='cancelled' then raise exception 'INVITATION_REVOKED'; end if;
  perform 1 from public.organisations where id=i.organisation_id for update;
  if exists(select 1 from public.v2_organisation_invitations where organisation_id=i.organisation_id and lower(email)=lower(i.email) and id<>i.id and status='pending' and (expires_at is null or expires_at>now())) then raise exception 'INVITATION_ALREADY_PENDING'; end if;
  if not exists(select 1 from public.v2_roles where id=i.intended_role_id and organisation_id=i.organisation_id and is_active) then raise exception 'INVITATION_ROLE_NOT_AVAILABLE'; end if;
  update public.v2_organisation_invitations set status='pending',expires_at=now()+interval '7 days' where id=i.id;
 elsif p_action='change_email' then
  if i.status not in ('pending','expired') then raise exception 'INVITATION_NOT_PENDING'; end if;
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVITATION_EMAIL_INVALID'; end if;
  -- Serialise edits with creation for this organisation; the invite row lock protects acceptance.
  perform 1 from public.organisations where id=i.organisation_id for update;
  if exists(select 1 from public.v2_organisation_invitations where organisation_id=i.organisation_id and lower(email)=v_email and status='pending' and id<>i.id)
   or exists(select 1 from public.organisation_users m join auth.users u on u.id=m.user_id where m.organisation_id=i.organisation_id and m.status='active' and lower(u.email)=v_email) then raise exception 'INVITATION_EMAIL_ALREADY_IN_USE'; end if;
  update public.v2_organisation_invitations set email=v_email,auth_user_id=null,last_sent_at=null,last_error=null,
   metadata=metadata||jsonb_build_object('last_email_change',jsonb_build_object('from',i.email,'to',v_email,'actor',p_actor,'at',now())) where id=i.id;
 else raise exception 'INVITATION_ACTION_INVALID'; end if;
 return jsonb_build_object('invitationId',i.id);
end; $$;
commit;
notify pgrst,'reload schema';

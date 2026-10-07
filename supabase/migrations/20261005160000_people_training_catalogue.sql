-- Organisation-owned Training categories and classes. Existing records remain canonical.
begin;
create table public.v2_training_categories (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
 name text not null check(length(btrim(name)) between 1 and 120),code text,description text not null default '',sort_order integer not null default 0,is_active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organisation_id,id)
);
create unique index v2_training_category_name_idx on public.v2_training_categories(organisation_id,lower(name));
create table public.v2_training_options (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,category_id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 120),code text,description text not null default '',sort_order integer not null default 0,is_active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organisation_id,id),
 foreign key(organisation_id,category_id) references public.v2_training_categories(organisation_id,id)
);
create unique index v2_training_option_name_idx on public.v2_training_options(organisation_id,category_id,lower(name));
alter table public.v2_training_types add column category_id uuid;
alter table public.v2_training_types add constraint v2_training_type_category_fk foreign key(organisation_id,category_id) references public.v2_training_categories(organisation_id,id);
create table public.v2_training_type_options (
 organisation_id uuid not null,training_type_id uuid not null,option_id uuid not null,
 primary key(organisation_id,training_type_id,option_id),
 foreign key(organisation_id,training_type_id) references public.v2_training_types(organisation_id,id),
 foreign key(organisation_id,option_id) references public.v2_training_options(organisation_id,id)
);
alter table public.v2_training_records add column option_id uuid;
alter table public.v2_training_records add constraint v2_training_record_option_fk foreign key(organisation_id,option_id) references public.v2_training_options(organisation_id,id);
alter table public.v2_people_document_rules add column training_category_id uuid;
alter table public.v2_people_document_rules add constraint v2_people_rule_training_category_fk foreign key(organisation_id,training_category_id) references public.v2_training_categories(organisation_id,id);
-- Preserve legacy categories without adding customer-specific defaults.
insert into public.v2_training_categories(organisation_id,name) select distinct on(organisation_id,lower(btrim(category))) organisation_id,btrim(category) from public.v2_training_types where nullif(btrim(category),'') is not null order by organisation_id,lower(btrim(category));
update public.v2_training_types t set category_id=c.id from public.v2_training_categories c where t.organisation_id=c.organisation_id and lower(btrim(t.category))=lower(c.name);
alter table public.v2_training_categories enable row level security;
alter table public.v2_training_options enable row level security;
alter table public.v2_training_type_options enable row level security;
revoke all on public.v2_training_categories,public.v2_training_options,public.v2_training_type_options from public,anon,authenticated;

create or replace function public.tttracker_v2_people_read(p_organisation_id uuid,p_area text default 'people',p_query text default '',p_page integer default 1,p_person_id uuid default null,p_filter jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; rows jsonb; total bigint; off integer:=greatest(0,least(coalesce(p_page,1),100000)-1)*20; pid uuid:=nullif(p_filter->>'project_id','')::uuid;
begin
if p_area in ('training_categories','training_options') then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,case when private.tttracker_v2_has_permission(p_organisation_id,'training.configure') then 'training.configure' when private.tttracker_v2_has_permission(p_organisation_id,'training.create') then 'training.create' when private.tttracker_v2_has_permission(p_organisation_id,'training.approve') then 'training.approve' else 'training.view' end);
 if p_area='training_categories' then
 select count(*) into total from public.v2_training_categories where organisation_id=p_organisation_id and name ilike '%'||p_query||'%';
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select * from public.v2_training_categories where organisation_id=p_organisation_id and name ilike '%'||p_query||'%' order by sort_order,name,id limit 20 offset off)x;
 else
 select count(*) into total from public.v2_training_options o where o.organisation_id=p_organisation_id and o.name ilike '%'||p_query||'%' and (coalesce(p_filter->>'id','')='' or o.id=(p_filter->>'id')::uuid) and (coalesce(p_filter->>'category_id','')='' or o.category_id=(p_filter->>'category_id')::uuid) and (coalesce(p_filter->>'training_type_id','')='' or exists(select 1 from public.v2_training_type_options where organisation_id=p_organisation_id and training_type_id=(p_filter->>'training_type_id')::uuid and option_id=o.id));
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select o.*,c.name category from public.v2_training_options o join public.v2_training_categories c on c.organisation_id=o.organisation_id and c.id=o.category_id where o.organisation_id=p_organisation_id and o.name ilike '%'||p_query||'%' and (coalesce(p_filter->>'id','')='' or o.id=(p_filter->>'id')::uuid) and (coalesce(p_filter->>'category_id','')='' or o.category_id=(p_filter->>'category_id')::uuid) and (coalesce(p_filter->>'training_type_id','')='' or exists(select 1 from public.v2_training_type_options where organisation_id=p_organisation_id and training_type_id=(p_filter->>'training_type_id')::uuid and option_id=o.id)) order by o.sort_order,o.name,o.id limit 20 offset off)x;
 end if;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page);
elsif p_area in ('matrix','requirements','training','review') then
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
 and (coalesce(p_filter->>'category_id','')='' or k.category_id=(p_filter->>'category_id')::uuid) and (coalesce(p_filter->>'category','')='' or k.category=p_filter->>'category')) cells from persons p),
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
 select count(*),(select coalesce(jsonb_agg((to_jsonb(x)-'people')||jsonb_build_object('people_total',jsonb_array_length(x.people),'current',(select count(*) from jsonb_array_elements(x.people) a where a->>'state'='current'),'expiring',(select count(*) from jsonb_array_elements(x.people) a where a->>'state'='expiring'),'compliant',(select count(*) from jsonb_array_elements(x.people) a where a->>'state' in ('current','expiring')),'people',(select coalesce(jsonb_agg(a),'[]') from(select a from jsonb_array_elements(x.people) a limit 20 offset greatest(0,coalesce((p_filter->>'detail_page')::integer,1)-1)*20) page_people))),'[]') from(select * from requirements where coalesce(p_filter->>'id','')='' or id=(p_filter->>'id')::uuid order by project,training_type,id limit 20 offset case when coalesce(p_filter->>'id','')='' then off else 0 end)x) into total,rows from requirements;
 else
 with records as(select t.id,t.person_id,t.training_type_id,p.display_name,k.name training_type,t.option_id,(select name from public.v2_training_options where organisation_id=t.organisation_id and id=t.option_id) option_name,k.category_id,k.category,t.issue_date,t.expiry_date,t.certificate_number,t.review_status,t.review_comment,t.reviewed_at,t.reviewed_by,t.evidence_group_id,t.source_channel,t.created_at,t.submitted_at,
 case when t.superseded_at is not null then 'superseded' when t.expiry_date<current_date then 'expired' when t.expiry_date<=current_date+k.renewal_lead_days then 'expiring' else 'current' end validity_status,
 case when t.superseded_at is not null then 'superseded' when t.review_status<>'approved' then t.review_status when t.expiry_date<current_date then 'expired' when t.expiry_date<=current_date+k.renewal_lead_days then 'expiring' else 'current' end status,
 (select count(*) from public.v2_people_documents d where d.organisation_id=t.organisation_id and d.evidence_group_id=t.evidence_group_id) document_count
 from public.v2_training_records t join public.v2_people p on p.id=t.person_id and p.organisation_id=t.organisation_id join public.v2_training_types k on k.id=t.training_type_id and k.organisation_id=t.organisation_id
 where t.organisation_id=p_organisation_id and (p_person_id is null or t.person_id=p_person_id) and (coalesce(p_filter->>'id','')='' or t.id=(p_filter->>'id')::uuid)
 and (coalesce(p_filter->>'relationship_type_id','')='' or p.relationship_type_id=(p_filter->>'relationship_type_id')::uuid)
 and (coalesce(p_filter->>'training_type_id','')='' or k.id=(p_filter->>'training_type_id')::uuid)
 and (coalesce(p_filter->>'category_id','')='' or k.category_id=(p_filter->>'category_id')::uuid) and (coalesce(p_filter->>'option_id','')='' or t.option_id=(p_filter->>'option_id')::uuid)
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
select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select k.*,(select coalesce(jsonb_agg(option_id),'[]') from public.v2_training_type_options where organisation_id=p_organisation_id and training_type_id=k.id) option_ids,(select coalesce(jsonb_agg(linked_type_id),'[]') from public.v2_training_linked_types where organisation_id=p_organisation_id and training_type_id=k.id) linked_types from public.v2_training_types k where organisation_id=p_organisation_id and name ilike '%'||p_query||'%' and (coalesce(p_filter->>'id','')='' or k.id=(p_filter->>'id')::uuid) order by name,id limit 20 offset off)x;
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
 return jsonb_build_object('rows',rows,'total',total,'page',p_page,'events',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select a.occurred_at as created_at,a.action,a.actor_id,(select coalesce(nullif(raw_user_meta_data->>'display_name',''),nullif(raw_user_meta_data->>'full_name',''),id::text) from auth.users where id=a.actor_id) actor_name,p.display_name,a.context from public.v2_people_audit a left join public.v2_people p on p.organisation_id=a.organisation_id and p.id=a.person_id where a.organisation_id=p_organisation_id and a.target_id=(p_filter->>'crew_id')::uuid order by a.occurred_at desc,a.id limit 20 offset off)x),'events_total',(select count(*) from public.v2_people_audit where organisation_id=p_organisation_id and target_id=(p_filter->>'crew_id')::uuid));
elsif p_area='document_scope' then
perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.edit');
select jsonb_build_object('person',jsonb_build_object('id',p.id,'display_name',p.display_name,'employee_number',p.employee_number,'relationship_type_id',p.relationship_type_id),'training',jsonb_build_object('name',k.name,'category',k.category,'category_id',k.category_id,'option_name',(select name from public.v2_training_options where organisation_id=r.organisation_id and id=r.option_id),'issue_date',r.issue_date,'expiry_date',r.expiry_date),'rules',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from public.v2_people_document_rules d where d.organisation_id=p_organisation_id and d.is_active)) into result
from public.v2_training_records r join public.v2_people p on p.id=r.person_id and p.organisation_id=r.organisation_id join public.v2_training_types k on k.id=r.training_type_id and k.organisation_id=r.organisation_id where r.organisation_id=p_organisation_id and r.id=(p_filter->>'id')::uuid and (p_person_id is null or p.id=p_person_id) and r.review_status in ('pending_review','changes_required');
if result is null then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;return result;
elsif p_area='document_rules' then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,'people.configure');
 select count(*) into total from public.v2_people_document_rules where organisation_id=p_organisation_id and name ilike '%'||p_query||'%';
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select id,name,parent_id,category,training_category_id,relationship_type_id,provider,folder_template,filename_template,date_format,collision_policy,creation_trigger,library_reference,is_active from public.v2_people_document_rules where organisation_id=p_organisation_id and name ilike '%'||p_query||'%' order by name,id limit 20 offset off)x;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page);
elsif p_area='review_rules' then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.configure');
 return jsonb_build_object('policies',coalesce((select policies from public.v2_people_review_defaults where organisation_id=p_organisation_id),'{}'));
end if;
result:=private.tttracker_v2_people_read_base(p_organisation_id,p_area,p_query,p_page,p_person_id,p_filter);
if p_area='overview' then
return result||jsonb_build_object('training_expiring',case when private.tttracker_v2_has_permission(p_organisation_id,'training.view') then (select count(*) from public.v2_training_records r join public.v2_training_types k on k.id=r.training_type_id and k.organisation_id=r.organisation_id where r.organisation_id=p_organisation_id and r.is_current and r.expiry_date>=current_date and r.expiry_date<=current_date+k.renewal_lead_days) end,'training_expired',case when private.tttracker_v2_has_permission(p_organisation_id,'training.view') then (select count(*) from public.v2_training_records where organisation_id=p_organisation_id and is_current and expiry_date<current_date) end);
elsif p_area='crews' then
 select coalesce(jsonb_agg(r||jsonb_build_object('leader_label',(select leader_label from public.v2_crews where organisation_id=p_organisation_id and id=(r->>'id')::uuid),'notes',(select notes from public.v2_crews where organisation_id=p_organisation_id and id=(r->>'id')::uuid),'projects',(select string_agg(p.name,', ' order by p.name) from public.v2_crew_projects cp join public.v2_projects p on p.organisation_id=cp.organisation_id and p.id=cp.project_id where cp.organisation_id=p_organisation_id and cp.crew_id=(r->>'id')::uuid and cp.ended_at is null and private.tttracker_v2_is_project_member(p.id)))),'[]') into rows from jsonb_array_elements(result->'rows') r;
 result:=result||jsonb_build_object('rows',rows);
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
declare result jsonb;r public.v2_training_records;k public.v2_training_types;v_id uuid;v_policy text;v_source text;cat uuid:=nullif(p_data->>'category_id','')::uuid;opt uuid:=nullif(p_data->>'option_id','')::uuid;item jsonb;
begin
if p_action in ('training_category','training_option') then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.configure');
 v_id:=coalesce(p_id,gen_random_uuid());
 if p_action='training_category' then
 if p_id is not null and not exists(select 1 from public.v2_training_categories where organisation_id=p_organisation_id and id=p_id) then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
 insert into public.v2_training_categories(id,organisation_id,name,code,description,sort_order,is_active) values(v_id,p_organisation_id,btrim(p_data->>'name'),nullif(p_data->>'code',''),coalesce(p_data->>'description',''),coalesce(nullif(p_data->>'sort_order','')::integer,0),coalesce((p_data->>'is_active')::boolean,true)) on conflict(id) do update set name=excluded.name,code=excluded.code,description=excluded.description,sort_order=excluded.sort_order,is_active=excluded.is_active,updated_at=now() where v2_training_categories.organisation_id=p_organisation_id;
 update public.v2_training_types set category=p_data->>'name' where organisation_id=p_organisation_id and category_id=v_id;
 else
 if p_id is not null and not exists(select 1 from public.v2_training_options where organisation_id=p_organisation_id and id=p_id) then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
 if not exists(select 1 from public.v2_training_categories where organisation_id=p_organisation_id and id=cat) then raise exception 'PEOPLE_RELATIONSHIP_INVALID';end if;
 if p_id is not null and exists(select 1 from public.v2_training_type_options l join public.v2_training_types kt on kt.organisation_id=l.organisation_id and kt.id=l.training_type_id where l.organisation_id=p_organisation_id and l.option_id=p_id and kt.category_id is distinct from cat) then raise exception 'PEOPLE_RELATIONSHIP_INVALID';end if;
 insert into public.v2_training_options(id,organisation_id,category_id,name,code,description,sort_order,is_active) values(v_id,p_organisation_id,cat,btrim(p_data->>'name'),nullif(p_data->>'code',''),coalesce(p_data->>'description',''),coalesce(nullif(p_data->>'sort_order','')::integer,0),coalesce((p_data->>'is_active')::boolean,true)) on conflict(id) do update set category_id=excluded.category_id,name=excluded.name,code=excluded.code,description=excluded.description,sort_order=excluded.sort_order,is_active=excluded.is_active,updated_at=now() where v2_training_options.organisation_id=p_organisation_id;
 end if;
 insert into public.v2_people_audit(organisation_id,actor_id,action,data_area,target_id) values(p_organisation_id,auth.uid(),p_action,'operational',v_id);
 return jsonb_build_object('id',v_id);
end if;
if p_action='training_type' then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.configure');
 if cat is not null and not exists(select 1 from public.v2_training_categories where organisation_id=p_organisation_id and id=cat) then raise exception 'PEOPLE_RELATIONSHIP_INVALID';end if;
 if p_data ? 'option_ids' then
 for item in select * from jsonb_array_elements(p_data->'option_ids') loop
 if not exists(select 1 from public.v2_training_options where organisation_id=p_organisation_id and id=(item#>>'{}')::uuid and category_id=cat) then raise exception 'PEOPLE_RELATIONSHIP_INVALID';end if;
 end loop;
 end if;
end if;
if p_action in ('training','update_training') and p_data ? 'option_id' then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,case when p_action='training' then 'training.create' else 'training.edit' end);
 if opt is not null and not exists(select 1 from public.v2_training_type_options l join public.v2_training_options o on o.organisation_id=l.organisation_id and o.id=l.option_id where l.organisation_id=p_organisation_id and l.training_type_id=case when p_action='training' then (p_data->>'training_type_id')::uuid else (select training_type_id from public.v2_training_records where organisation_id=p_organisation_id and id=p_id) end and o.id=opt and o.is_active) then raise exception 'PEOPLE_RELATIONSHIP_INVALID';end if;
end if;
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
 if exists(select 1 from regexp_matches(concat_ws(' ',p_data->>'folder_template',p_data->>'filename_template'),'\{([^{}]+)\}','g') token where token[1] not in ('person_id','person_display_name','first_name','last_name','employee_number','relationship_type','document_category','training_type','training_option','category','document_type','year','project_code','issue_date','expiry_date')) then raise exception 'PEOPLE_INVALID_PATH';end if;
 if p_data->>'parent_id'=v_id::text then raise exception 'PEOPLE_INVALID_PATH';end if;
 if exists(with recursive parents as(select id,parent_id from public.v2_people_document_rules where organisation_id=p_organisation_id and id=nullif(p_data->>'parent_id','')::uuid union select dr.id,dr.parent_id from public.v2_people_document_rules dr join parents p on dr.id=p.parent_id where dr.organisation_id=p_organisation_id) select 1 from parents where id=v_id) then raise exception 'PEOPLE_INVALID_PATH';end if;
 insert into public.v2_people_document_rules(id,organisation_id,name,parent_id,category,training_category_id,relationship_type_id,provider,folder_template,filename_template,date_format,collision_policy,creation_trigger,library_reference,is_active)
 values(v_id,p_organisation_id,p_data->>'name',nullif(p_data->>'parent_id','')::uuid,coalesce(p_data->>'category','training'),nullif(p_data->>'training_category_id','')::uuid,nullif(p_data->>'relationship_type_id','')::uuid,coalesce(p_data->>'provider','internal'),p_data->>'folder_template',p_data->>'filename_template',coalesce(p_data->>'date_format','DD-MM-YYYY'),coalesce(p_data->>'collision_policy','version'),coalesce(p_data->>'creation_trigger','first_upload'),nullif(p_data->>'library_reference',''),coalesce((p_data->>'is_active')::boolean,true))
 on conflict(id) do update set name=excluded.name,parent_id=excluded.parent_id,category=excluded.category,training_category_id=excluded.training_category_id,relationship_type_id=excluded.relationship_type_id,provider=excluded.provider,folder_template=excluded.folder_template,filename_template=excluded.filename_template,date_format=excluded.date_format,collision_policy=excluded.collision_policy,creation_trigger=excluded.creation_trigger,library_reference=excluded.library_reference,is_active=excluded.is_active where v2_people_document_rules.organisation_id=p_organisation_id;
elsif p_action='review_rules' then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.configure');
 if exists(select 1 from jsonb_each_text(p_data) e where e.key not in ('internal','person_web','mobile','external_onboarding','import','integration') or e.value not in ('required','none','trusted')) then raise exception 'PEOPLE_INVALID_FIELDS';end if;
 insert into public.v2_people_review_defaults values(p_organisation_id,p_data,now()) on conflict(organisation_id) do update set policies=excluded.policies,updated_at=now();
else
 result:=private.tttracker_v2_people_write_base(p_organisation_id,p_action,p_id,p_data);
 v_id:=(result->>'id')::uuid;
 if p_action='training_type' then
 update public.v2_training_types set code=nullif(p_data->>'code',''),description=coalesce(p_data->>'description',''),review_policy=coalesce(p_data->>'review_policy','required'),is_active=coalesce((p_data->>'is_active')::boolean,true),category_id=cat,category=(select name from public.v2_training_categories where organisation_id=p_organisation_id and id=cat) where organisation_id=p_organisation_id and id=v_id;
 if p_data ? 'option_ids' then
 delete from public.v2_training_type_options where organisation_id=p_organisation_id and training_type_id=v_id;
 insert into public.v2_training_type_options select p_organisation_id,v_id,(x#>>'{}')::uuid from jsonb_array_elements(p_data->'option_ids') x on conflict do nothing;
 end if;
 elsif p_action in ('training','update_training') and p_data ? 'option_id' then
 if p_action='training' then
 update public.v2_training_records set option_id=opt where organisation_id=p_organisation_id and evidence_group_id=(select evidence_group_id from public.v2_training_records where organisation_id=p_organisation_id and id=v_id) and training_type_id=(p_data->>'training_type_id')::uuid;
 else update public.v2_training_records set option_id=opt where organisation_id=p_organisation_id and id=v_id;end if;
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
exception when unique_violation then raise exception 'PEOPLE_CONFIGURATION_DUPLICATE';
when foreign_key_violation then raise exception 'PEOPLE_RELATIONSHIP_INVALID';
when check_violation or not_null_violation or invalid_text_representation then raise exception 'PEOPLE_INVALID_FIELDS';
end $$;
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
 and (coalesce(p_filter->>'date','')='' or s.prestart_date=(p_filter->>'date')::date) and (coalesce(p_filter->>'from_date','')='' or s.prestart_date >= (p_filter->>'from_date')::date) and (coalesce(p_filter->>'to_date','')='' or s.prestart_date <= (p_filter->>'to_date')::date) and (coalesce(p_filter->>'project_id','')='' or s.project_id=(p_filter->>'project_id')::uuid);
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select s.id,s.prestart_date,s.location,s.status,p.name project_name,s.project_id,
 (select count(*) from public.v2_site_prestart_attendees where prestart_id=s.id and organisation_id=p_organisation_id) attendee_count
 from public.v2_site_prestarts s join public.v2_projects p on p.id=s.project_id and p.organisation_id=s.organisation_id where s.organisation_id=p_organisation_id and private.tttracker_v2_is_project_member(p.id)
 and (p_person_id is null or exists(select 1 from public.v2_site_prestart_attendees where prestart_id=s.id and person_id=p_person_id)) and concat_ws(' ',p.name,s.location) ilike '%'||v_q||'%'
 and (coalesce(p_filter->>'date','')='' or s.prestart_date=(p_filter->>'date')::date) and (coalesce(p_filter->>'from_date','')='' or s.prestart_date >= (p_filter->>'from_date')::date) and (coalesce(p_filter->>'to_date','')='' or s.prestart_date <= (p_filter->>'to_date')::date) and (coalesce(p_filter->>'project_id','')='' or s.project_id=(p_filter->>'project_id')::uuid) order by s.prestart_date desc,s.id limit 20 offset v_offset)x;
 elsif p_area='prestart_detail' then
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select s.id,s.discussion,s.location,s.status,s.prestart_date,s.project_id,s.completed_at from public.v2_site_prestarts s where s.organisation_id=p_organisation_id and s.id=(p_filter->>'id')::uuid and private.tttracker_v2_is_project_member(s.project_id))x;
 total:=jsonb_array_length(rows);
 else raise exception 'PEOPLE_INVALID_AREA'; end if;
 return jsonb_build_object('rows',rows,'total',total,'page',greatest(1,p_page),'page_size',20);
end $$;
-- Version history returns structure metadata only, never submitted answers.
create or replace function public.tttracker_v2_onboarding_versions(p_org uuid,p_template uuid,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rows jsonb;total bigint;
begin
 perform private.tttracker_v2_require_people_permission(p_org,'people.configure');
 if not exists(select 1 from public.v2_onboarding_templates where organisation_id=p_org and id=p_template) then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
 select count(*) into total from private.v2_onboarding_versions where organisation_id=p_org and template_id=p_template;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select id,version,published_at,review_policy,jsonb_array_length(definition->'sections') sections from private.v2_onboarding_versions where organisation_id=p_org and template_id=p_template order by version desc limit 20 offset greatest(0,least(p_page,100000)-1)*20)x;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page);
end $$;
revoke all on function public.tttracker_v2_onboarding_versions(uuid,uuid,integer) from public,anon;
grant execute on function public.tttracker_v2_onboarding_versions(uuid,uuid,integer) to authenticated;
notify pgrst,'reload schema';

commit;

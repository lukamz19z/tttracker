-- Existing catalogue projections only; no schema or access-policy change.
begin;
create or replace function public.tttracker_v2_people_read(p_organisation_id uuid,p_area text default 'people',p_query text default '',p_page integer default 1,p_person_id uuid default null,p_filter jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; rows jsonb; total bigint; off integer:=greatest(0,least(coalesce(p_page,1),100000)-1)*20; pid uuid:=nullif(p_filter->>'project_id','')::uuid;
begin
if p_area in ('training_categories','training_options') then
 perform private.tttracker_v2_require_people_permission(p_organisation_id,case when private.tttracker_v2_has_permission(p_organisation_id,'training.configure') then 'training.configure' when private.tttracker_v2_has_permission(p_organisation_id,'training.create') then 'training.create' when private.tttracker_v2_has_permission(p_organisation_id,'training.approve') then 'training.approve' else 'training.view' end);
 if p_area='training_categories' then
 select count(*) into total from public.v2_training_categories where organisation_id=p_organisation_id and name ilike '%'||p_query||'%';
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select c.*,(select count(*) from public.v2_training_types k where k.organisation_id=c.organisation_id and k.category_id=c.id) training_type_count,(select count(*) from public.v2_training_options o where o.organisation_id=c.organisation_id and o.category_id=c.id) option_count from public.v2_training_categories c where c.organisation_id=p_organisation_id and c.name ilike '%'||p_query||'%' order by c.sort_order,c.name,c.id limit 20 offset off)x;
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
select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select k.*,(select string_agg(o.name, ', ' order by o.sort_order,o.name) from public.v2_training_type_options x join public.v2_training_options o on o.organisation_id=x.organisation_id and o.id=x.option_id where x.organisation_id=p_organisation_id and x.training_type_id=k.id) option_names,(select coalesce(jsonb_agg(option_id),'[]') from public.v2_training_type_options where organisation_id=p_organisation_id and training_type_id=k.id) option_ids,(select coalesce(jsonb_agg(linked_type_id),'[]') from public.v2_training_linked_types where organisation_id=p_organisation_id and training_type_id=k.id) linked_types from public.v2_training_types k where organisation_id=p_organisation_id and name ilike '%'||p_query||'%' and (coalesce(p_filter->>'id','')='' or k.id=(p_filter->>'id')::uuid) order by name,id limit 20 offset off)x;
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
notify pgrst,'reload schema';
commit;

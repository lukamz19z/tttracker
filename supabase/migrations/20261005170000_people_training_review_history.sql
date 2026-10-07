-- Narrow operational history for an authorised Training record. No private values or generic audit context.
begin;
create or replace function public.tttracker_v2_training_history(p_org uuid,p_record uuid,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rows jsonb;total bigint;
begin
 perform private.tttracker_v2_require_people_permission(p_org,'training.view');
 if not exists(select 1 from public.v2_training_records where organisation_id=p_org and id=p_record) then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
 select count(*) into total from public.v2_people_audit where organisation_id=p_org and target_id=p_record;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select a.id,a.occurred_at,a.action,a.actor_id,
 (select coalesce(nullif(raw_user_meta_data->>'display_name',''),nullif(raw_user_meta_data->>'full_name',''),id::text) from auth.users where id=a.actor_id) actor_name,
 a.context->>'previous_status' previous_status,a.context->>'new_status' resulting_status
 from public.v2_people_audit a where a.organisation_id=p_org and a.target_id=p_record order by a.occurred_at desc,a.id limit 20 offset greatest(0,least(p_page,100000)-1)*20)x;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page);
end $$;
revoke all on function public.tttracker_v2_training_history(uuid,uuid,integer) from public,anon;
grant execute on function public.tttracker_v2_training_history(uuid,uuid,integer) to authenticated;
create or replace function private.tttracker_v2_people_read_base(p_organisation_id uuid,p_area text default 'people',p_query text default '',p_page integer default 1,p_person_id uuid default null,p_filter jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare rows jsonb; total bigint; v_permission text; v_offset integer:=greatest(0,least(coalesce(p_page,1),100000)-1)*20; v_q text:=btrim(coalesce(p_query,'')); v_person public.v2_people;
begin
 v_permission:=case p_area when 'crews' then 'people.crews.view' when 'crew_members' then 'people.crews.view' when 'crew_projects' then 'people.crews.view' when 'projects' then case when private.tttracker_v2_has_permission(p_organisation_id,'people.crews.manage') then 'people.crews.manage' when private.tttracker_v2_has_permission(p_organisation_id,'people.site_prestarts.manage') then 'people.site_prestarts.manage' else 'people.view' end
 when 'training' then 'training.view' when 'review' then 'training.approve' when 'training_types' then case when private.tttracker_v2_has_permission(p_organisation_id,'training.configure') then 'training.configure' when private.tttracker_v2_has_permission(p_organisation_id,'training.create') then 'training.create' else 'training.view' end
 when 'document_access' then 'training.view' when 'prestart_people_choices' then 'people.site_prestarts.view' when 'prestarts' then 'people.site_prestarts.view' when 'prestart_detail' then 'people.site_prestarts.view' when 'prestart_attendees' then 'people.site_prestarts.view'
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
 elsif p_area='prestart_people_choices' then
 select count(*) into total from public.v2_people p where p.organisation_id=p_organisation_id and p.display_name ilike '%'||v_q||'%' and exists(select 1 from public.v2_site_prestart_attendees a join public.v2_site_prestarts s on s.organisation_id=a.organisation_id and s.id=a.prestart_id where a.organisation_id=p_organisation_id and a.person_id=p.id and private.tttracker_v2_is_project_member(s.project_id));
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select p.id,p.display_name from public.v2_people p where p.organisation_id=p_organisation_id and p.display_name ilike '%'||v_q||'%' and exists(select 1 from public.v2_site_prestart_attendees a join public.v2_site_prestarts s on s.organisation_id=a.organisation_id and s.id=a.prestart_id where a.organisation_id=p_organisation_id and a.person_id=p.id and private.tttracker_v2_is_project_member(s.project_id)) order by p.display_name,p.id limit 20 offset v_offset)x;
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
 and (p_person_id is null or exists(select 1 from public.v2_site_prestart_attendees where prestart_id=s.id and person_id=p_person_id)) and concat_ws(' ',p.name,s.location,(select string_agg(per.display_name,' ') from public.v2_site_prestart_attendees a join public.v2_people per on per.organisation_id=a.organisation_id and per.id=a.person_id where a.organisation_id=s.organisation_id and a.prestart_id=s.id)) ilike '%'||v_q||'%'
 and (coalesce(p_filter->>'status','')='' or s.status=p_filter->>'status') and (coalesce(p_filter->>'date','')='' or s.prestart_date=(p_filter->>'date')::date) and (coalesce(p_filter->>'from_date','')='' or s.prestart_date >= (p_filter->>'from_date')::date) and (coalesce(p_filter->>'to_date','')='' or s.prestart_date <= (p_filter->>'to_date')::date) and (coalesce(p_filter->>'project_id','')='' or s.project_id=(p_filter->>'project_id')::uuid);
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select s.id,s.prestart_date,s.location,s.status,p.name project_name,s.project_id,(select string_agg(per.display_name,', ' order by per.display_name) from public.v2_site_prestart_attendees a join public.v2_people per on per.organisation_id=a.organisation_id and per.id=a.person_id where a.organisation_id=s.organisation_id and a.prestart_id=s.id) person_names,
 (select count(*) from public.v2_site_prestart_attendees where prestart_id=s.id and organisation_id=p_organisation_id) attendee_count
 from public.v2_site_prestarts s join public.v2_projects p on p.id=s.project_id and p.organisation_id=s.organisation_id where s.organisation_id=p_organisation_id and private.tttracker_v2_is_project_member(p.id)
 and (p_person_id is null or exists(select 1 from public.v2_site_prestart_attendees where prestart_id=s.id and person_id=p_person_id)) and concat_ws(' ',p.name,s.location,(select string_agg(per.display_name,' ') from public.v2_site_prestart_attendees a join public.v2_people per on per.organisation_id=a.organisation_id and per.id=a.person_id where a.organisation_id=s.organisation_id and a.prestart_id=s.id)) ilike '%'||v_q||'%'
 and (coalesce(p_filter->>'status','')='' or s.status=p_filter->>'status') and (coalesce(p_filter->>'date','')='' or s.prestart_date=(p_filter->>'date')::date) and (coalesce(p_filter->>'from_date','')='' or s.prestart_date >= (p_filter->>'from_date')::date) and (coalesce(p_filter->>'to_date','')='' or s.prestart_date <= (p_filter->>'to_date')::date) and (coalesce(p_filter->>'project_id','')='' or s.project_id=(p_filter->>'project_id')::uuid) order by s.prestart_date desc,s.id limit 20 offset v_offset)x;
 elsif p_area='prestart_detail' then
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select s.id,s.discussion,s.location,s.status,s.prestart_date,s.project_id,s.completed_at from public.v2_site_prestarts s where s.organisation_id=p_organisation_id and s.id=(p_filter->>'id')::uuid and private.tttracker_v2_is_project_member(s.project_id))x;
 total:=jsonb_array_length(rows);
 else raise exception 'PEOPLE_INVALID_AREA'; end if;
 return jsonb_build_object('rows',rows,'total',total,'page',greatest(1,p_page),'page_size',20);
end $$;
notify pgrst,'reload schema';
commit;

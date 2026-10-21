begin;

-- Operational previews read the current canonical records without applying a
-- state transition. The configured resolver in the client mirrors the same
-- scope; finalisation still validates the selected replacement under lock.
alter function public.tttracker_v2_people_read(uuid,text,text,integer,uuid,jsonb)
  rename to tttracker_v2_people_read_before_replacement_preview;
revoke all on function public.tttracker_v2_people_read_before_replacement_preview(uuid,text,text,integer,uuid,jsonb)
  from public,anon,authenticated;

create function public.tttracker_v2_people_read(
  p_organisation_id uuid,p_area text default 'people',p_query text default '',
  p_page integer default 1,p_person_id uuid default null,p_filter jsonb default '{}'
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rows jsonb;result jsonb;
begin
  if p_area<>'training_replacement' then
    result:=public.tttracker_v2_people_read_before_replacement_preview(
      p_organisation_id,p_area,p_query,p_page,p_person_id,p_filter);
    if p_area in ('training','training_drafts') then
      select coalesce(jsonb_agg(entry.row||jsonb_build_object(
        'replacement_mode',submission.payload->>'replacement_mode',
        'option_ids',coalesce(submission.payload->'option_ids','[]'::jsonb)
      ) order by entry.ordinality),'[]'::jsonb) into rows
      from jsonb_array_elements(coalesce(result->'rows','[]'::jsonb)) with ordinality as entry(row,ordinality)
      left join lateral (
        select s.payload from public.v2_training_submissions s
        join public.v2_training_records primary_record
          on primary_record.organisation_id=s.organisation_id and primary_record.id=s.record_id
        where s.organisation_id=p_organisation_id
          and primary_record.evidence_group_id=(entry.row->>'evidence_group_id')::uuid
        order by s.created_at desc limit 1
      ) submission on true;
      -- Keep the base projection when a row has no submission record (legacy rows).
      return result||jsonb_build_object('rows',coalesce(rows,result->'rows','[]'::jsonb));
    end if;
    return result;
  end if;

  perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.create');
  if p_person_id is null or not exists (
    select 1 from public.v2_people p
    where p.organisation_id=p_organisation_id and p.id=p_person_id
  ) then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'issue_date',r.issue_date,'expiry_date',r.expiry_date,
    'training_type',k.name,'training_type_id',r.training_type_id,
    'option_id',r.option_id,'option_name',o.name,'option_code',o.code,
    'project_id',r.project_id,'certificate_number',r.certificate_number,
    'evidence_group_id',r.evidence_group_id
  ) order by r.issue_date desc nulls last,r.created_at desc,r.id),'[]'::jsonb)
  into rows
  from public.v2_training_records r
  join public.v2_training_types k
    on k.organisation_id=r.organisation_id and k.id=r.training_type_id
  left join public.v2_training_options o
    on o.organisation_id=r.organisation_id and o.id=r.option_id
  where r.organisation_id=p_organisation_id and r.person_id=p_person_id
    and r.training_type_id=nullif(p_filter->>'training_type_id','')::uuid
    and r.is_current and r.review_status='approved'
    and r.superseded_at is null and r.voided_at is null;
  return jsonb_build_object('rows',rows);
end $$;
revoke all on function public.tttracker_v2_people_read(uuid,text,text,integer,uuid,jsonb) from public,anon;
grant execute on function public.tttracker_v2_people_read(uuid,text,text,integer,uuid,jsonb) to authenticated;

-- A deliberate Replace choice is supported for multiple-current Types. The
-- candidate remains a canonical current row and is checked again at approval.
create or replace function private.tttracker_v2_replacement_candidate(
  p_org uuid,p_person uuid,p_type uuid,p_option uuid,p_project uuid,p_exclude uuid default null,p_offset integer default 0
)
returns uuid language sql stable security definer set search_path='' as $$
  select r.id
  from public.v2_training_records r
  join public.v2_training_types k
    on k.organisation_id=r.organisation_id and k.id=r.training_type_id
  where r.organisation_id=p_org and r.person_id=p_person and r.training_type_id=p_type
    and r.is_current and r.review_status='approved' and r.superseded_at is null
    and r.voided_at is null and r.id is distinct from p_exclude
    and k.supersede_scope<>'never'
    and (k.supersede_scope='type' or r.option_id is not distinct from p_option)
    and (k.supersede_scope<>'type_option_and_project' or r.project_id is not distinct from p_project)
  order by r.issue_date desc nulls last,r.created_at desc,r.id
  offset greatest(p_offset,0) limit 1
$$;
revoke all on function private.tttracker_v2_replacement_candidate(uuid,uuid,uuid,uuid,uuid,uuid,integer)
  from public,anon,authenticated;

create or replace function private.tttracker_v2_confirm_training(p_org uuid,p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.v2_training_records;k public.v2_training_types;previous uuid;old_row public.v2_training_records;begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,2));
  select * into r from public.v2_training_records where organisation_id=p_org and id=p_id for update;
  if r.id is null then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
  if r.is_current and r.review_status='approved' then return;end if;
  if r.superseded_at is not null or r.review_status not in ('pending_review','changes_required') then raise exception 'TRAINING_INVALID_TRANSITION';end if;
  perform private.tttracker_v2_validate_training_evidence(p_org,p_id);
  select * into k from public.v2_training_types where organisation_id=p_org and id=r.training_type_id;

  if k.allows_multiple_current and r.supersedes_record_id is not null then
    -- Do not blindly trust a stale draft candidate after another approval.
    select candidate.id into previous
    from public.v2_training_records candidate
    where candidate.organisation_id=p_org and candidate.id=r.supersedes_record_id
      and candidate.person_id=r.person_id and candidate.training_type_id=r.training_type_id
      and candidate.is_current and candidate.review_status='approved'
      and candidate.superseded_at is null and candidate.voided_at is null
      and (k.supersede_scope='type' or candidate.option_id is not distinct from r.option_id)
      and (k.supersede_scope<>'type_option_and_project' or candidate.project_id is not distinct from r.project_id);
    if previous is null then
      previous:=private.tttracker_v2_replacement_candidate(
        p_org,r.person_id,r.training_type_id,r.option_id,r.project_id,r.id,0);
    end if;
  elsif not k.allows_multiple_current then
    previous:=private.tttracker_v2_supersede_candidate(p_org,r.person_id,r.training_type_id,r.option_id,r.project_id,r.id);
  end if;

  if k.allows_multiple_current and k.supersede_scope='type' and previous is not null then
    -- A Type-wide Replace is explicitly broader than per-Option renewal.
    -- Retain each old canonical row and point it to the first new record.
    for old_row in select * from public.v2_training_records
      where organisation_id=p_org and person_id=r.person_id and training_type_id=r.training_type_id
        and is_current and review_status='approved' and superseded_at is null and voided_at is null
      order by issue_date desc nulls last,created_at desc,id for update
    loop
      update public.v2_training_records set is_current=false,superseded_at=now(),superseded_by_record_id=p_id
        where organisation_id=p_org and id=old_row.id;
      insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area,target_id,context)
      values(p_org,r.person_id,auth.uid(),'training_superseded','operational',old_row.id,jsonb_build_object('replacement_record_id',p_id));
    end loop;
  else
    update public.v2_training_records set is_current=false,superseded_at=now(),superseded_by_record_id=p_id
      where organisation_id=p_org and id=previous;
    if previous is not null then
      insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area,target_id,context)
      values(p_org,r.person_id,auth.uid(),'training_superseded','operational',previous,jsonb_build_object('replacement_record_id',p_id));
    end if;
  end if;
  update public.v2_training_records set is_current=true,review_status='approved',reviewed_at=now(),reviewed_by=auth.uid(),supersedes_record_id=previous
    where organisation_id=p_org and id=p_id;
end $$;

alter function public.tttracker_v2_people_write(uuid,text,uuid,jsonb)
  rename to tttracker_v2_people_write_before_replacement_choice;
revoke all on function public.tttracker_v2_people_write_before_replacement_choice(uuid,text,uuid,jsonb)
  from public,anon,authenticated;

create function public.tttracker_v2_people_write(
  p_organisation_id uuid,p_action text,p_id uuid default null,p_data jsonb default '{}'
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;v_type public.v2_training_types;v_person uuid;v_project uuid;v_group uuid;v_record public.v2_training_records;v_mode text;v_index integer:=0;
begin
  if p_action<>'training' then
    return public.tttracker_v2_people_write_before_replacement_choice(p_organisation_id,p_action,p_id,p_data);
  end if;

  v_mode:=coalesce(nullif(p_data->>'replacement_mode',''),'automatic');
  if v_mode not in ('automatic','replace','add') then raise exception 'PEOPLE_INVALID_FIELDS'; end if;
  select * into v_type from public.v2_training_types
    where organisation_id=p_organisation_id and id=nullif(p_data->>'training_type_id','')::uuid;
  if not found then raise exception 'PEOPLE_RELATIONSHIP_INVALID'; end if;
  v_person:=nullif(p_data->>'person_id','')::uuid;
  v_project:=nullif(p_data->>'project_id','')::uuid;
  if v_mode='add' and not v_type.allows_multiple_current and v_type.supersede_scope<>'never'
    and private.tttracker_v2_supersede_candidate(p_organisation_id,v_person,v_type.id,
      nullif(p_data->>'option_id','')::uuid,v_project,null) is not null then
    raise exception 'TRAINING_MULTIPLE_CURRENT_NOT_ALLOWED';
  end if;

  result:=public.tttracker_v2_people_write_before_replacement_choice(p_organisation_id,p_action,p_id,p_data);
  if v_mode='replace' and v_type.allows_multiple_current and v_type.supersede_scope<>'never' then
    select evidence_group_id into v_group from public.v2_training_records
      where organisation_id=p_organisation_id and id=(result->>'id')::uuid;
    for v_record in select * from public.v2_training_records
      where organisation_id=p_organisation_id and evidence_group_id=v_group and training_type_id=v_type.id
      order by option_id nulls first,id
    loop
      update public.v2_training_records set supersedes_record_id=private.tttracker_v2_replacement_candidate(
        p_organisation_id,v_record.person_id,v_record.training_type_id,v_record.option_id,v_record.project_id,v_record.id,
        case when v_type.supersede_scope='type' then v_index else 0 end)
      where organisation_id=p_organisation_id and id=v_record.id;
      v_index:=v_index+1;
    end loop;
  end if;
  return result;
end $$;
revoke all on function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;

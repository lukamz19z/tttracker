-- A review decision for one shared-evidence submission applies to every
-- review-required Training record in that evidence group. Each record still
-- runs through the canonical per-type evidence and superseding logic.
alter function public.tttracker_v2_people_write(uuid,text,uuid,jsonb)
 rename to tttracker_v2_people_write_before_linked_review_group;
revoke all on function public.tttracker_v2_people_write_before_linked_review_group(uuid,text,uuid,jsonb)
 from public,anon,authenticated;

create function public.tttracker_v2_people_write(
 p_organisation_id uuid,
 p_action text,
 p_id uuid default null,
 p_data jsonb default '{}'
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 group_id uuid;
 item record;
 result jsonb;
 selected_result jsonb;
 processed boolean:=false;
begin
 if p_action='unlink_training_type' then
  perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.configure');
  if p_id is null or nullif(p_data->>'linked_type_id','') is null
   or p_id=(p_data->>'linked_type_id')::uuid then
   raise exception 'PEOPLE_INVALID_FIELDS';
  end if;
  if not exists(select 1 from public.v2_training_types where organisation_id=p_organisation_id and id=p_id)
   or not exists(select 1 from public.v2_training_types where organisation_id=p_organisation_id and id=(p_data->>'linked_type_id')::uuid) then
   raise exception 'PEOPLE_RECORD_NOT_FOUND';
  end if;
  delete from public.v2_training_linked_types
  where organisation_id=p_organisation_id and training_type_id=p_id
   and linked_type_id=(p_data->>'linked_type_id')::uuid;
  insert into public.v2_people_audit(organisation_id,actor_id,action,data_area,target_id,context)
  values(p_organisation_id,auth.uid(),'training_link_removed','training_configuration',p_id,
   jsonb_build_object('linked_type_id',p_data->>'linked_type_id'));
  return jsonb_build_object('id',p_id,'linked_type_id',p_data->>'linked_type_id','removed',true);
 end if;

 if p_action<>'review_training'
  or p_data->>'outcome' not in ('approved','rejected','changes_required') then
  return public.tttracker_v2_people_write_before_linked_review_group(
   p_organisation_id,p_action,p_id,p_data
  );
 end if;

 perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.approve');
 select evidence_group_id into group_id
 from public.v2_training_records
 where organisation_id=p_organisation_id and id=p_id;
 if group_id is null then
  return public.tttracker_v2_people_write_before_linked_review_group(
   p_organisation_id,p_action,p_id,p_data
  );
 end if;

 -- Lock the group and apply a consistent decision to each record that is
 -- actually awaiting review. Per-type policy has already determined which
 -- records enter this state during submission finalisation.
 for item in
  select id from public.v2_training_records
  where organisation_id=p_organisation_id
   and evidence_group_id=group_id
   and review_status in ('pending_review','changes_required')
  order by id for update
 loop
  result:=public.tttracker_v2_people_write_before_linked_review_group(
   p_organisation_id,p_action,item.id,p_data
  );
  processed:=true;
  if item.id=p_id then selected_result:=result; end if;
 end loop;

 if selected_result is not null then return selected_result; end if;
 if processed then return result; end if;
 -- Preserve the canonical idempotent retry and invalid-transition behavior
 -- when there are no reviewable group members left.
 return public.tttracker_v2_people_write_before_linked_review_group(
  p_organisation_id,p_action,p_id,p_data
 );
end $$;
revoke all on function public.tttracker_v2_people_write(uuid,text,uuid,jsonb)
 from public,anon;
grant execute on function public.tttracker_v2_people_write(uuid,text,uuid,jsonb)
 to authenticated;

;

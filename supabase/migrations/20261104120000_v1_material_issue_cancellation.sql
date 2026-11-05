-- Preserve the existing audited cancellation workflow while allowing it to
-- cancel Excess events as well as Missing events. Repeated cancellation is an
-- idempotent success and does not create another action-history row.
create or replace function public.tttracker_v1_missing_material_action(
  p_project_id uuid,p_tower_id uuid,p_issue_key uuid,p_client_mutation_id text,
  p_action_type text,p_body text,p_user_id uuid,p_assigned_to_user_id uuid default null,p_notify_user_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_event public.tower_material_events%rowtype;
  v_item public.tower_material_event_items%rowtype;
  v_action uuid;
  v_previous uuid;
  v_existing uuid;
begin
  if coalesce(trim(p_client_mutation_id),'')='' then raise exception 'Mutation ID is required'; end if;
  if p_action_type not in ('update','assignment','cancel') then raise exception 'Unsupported material action'; end if;

  select id into v_existing
    from public.tower_material_event_actions
    where project_id=p_project_id and client_mutation_id=p_client_mutation_id;
  if v_existing is not null then
    return jsonb_build_object('action_id',v_existing,'duplicate',true);
  end if;

  select e.* into v_event
    from public.tower_material_events e
    join public.tower_material_event_items i on i.event_id=e.id
    where e.project_id=p_project_id and e.tower_id=p_tower_id
      and e.event_type in ('missing','excess') and i.issue_key=p_issue_key
    for update of e;
  if not found then raise exception 'Material issue was not found'; end if;

  select * into v_item
    from public.tower_material_event_items
    where event_id=v_event.id and issue_key=p_issue_key;

  if v_event.issue_status='cancelled' and p_action_type='cancel' then
    return jsonb_build_object('event_id',v_event.id,'issue_key',p_issue_key,'issue_status','cancelled','already_cancelled',true,'duplicate',true);
  end if;
  if v_event.issue_status='resolved' then
    raise exception 'This material requirement is already resolved';
  end if;
  if p_action_type='update' and coalesce(trim(p_body),'')='' then raise exception 'Enter an update'; end if;
  if p_action_type='cancel' and coalesce(trim(p_body),'')='' then raise exception 'Enter a cancellation reason'; end if;
  if p_action_type in ('assignment','update') and v_event.event_type<>'missing' then
    raise exception 'This action is only supported for Missing Material issues';
  end if;

  if p_notify_user_ids is not null then
    update public.tower_material_events set notify_user_ids=p_notify_user_ids where id=v_event.id;
  end if;
  if p_action_type='assignment' then
    v_previous:=v_event.assigned_to_user_id;
    update public.tower_material_events set assigned_to_user_id=p_assigned_to_user_id where id=v_event.id;
  elsif p_action_type='cancel' then
    update public.tower_material_events
      set issue_status='cancelled',cancelled_by_user_id=p_user_id,
          cancelled_at=now(),cancellation_reason=nullif(trim(p_body),'')
      where id=v_event.id;
  end if;

  insert into public.tower_material_event_actions(
    project_id,tower_id,material_event_id,client_mutation_id,action_type,body,
    previous_assignee_id,assigned_to_user_id,notify_user_ids,created_by_user_id
  ) values (
    p_project_id,p_tower_id,v_event.id,p_client_mutation_id,p_action_type,
    coalesce(nullif(trim(p_body),''),''),v_previous,
    case when p_action_type='assignment' then p_assigned_to_user_id end,
    coalesce(p_notify_user_ids,'{}'),p_user_id
  ) returning id into v_action;

  return jsonb_build_object(
    'action_id',v_action,'event_id',v_event.id,'issue_key',p_issue_key,
    'item_reference',v_item.item_reference,'previous_assignee_id',v_previous,
    'assigned_to_user_id',p_assigned_to_user_id,'issue_status',
    case when p_action_type='cancel' then 'cancelled' else v_event.issue_status end,
    'duplicate',false
  );
end $$;
revoke all on function public.tttracker_v1_missing_material_action(uuid,uuid,uuid,text,text,text,uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.tttracker_v1_missing_material_action(uuid,uuid,uuid,text,text,text,uuid,uuid,uuid[]) to service_role;

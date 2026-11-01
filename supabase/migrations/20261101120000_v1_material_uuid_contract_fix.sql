-- Correct the Missing Materials RPC boundary: issue_key is a UUID in the
-- canonical event-item ledger. Keep client mutation IDs as text.
drop function if exists public.tttracker_v1_record_material_receipt(uuid,uuid,text,numeric,text,uuid,text,text,timestamptz);
create function public.tttracker_v1_record_material_receipt(
  p_project_id uuid,p_tower_id uuid,p_issue_key uuid,p_quantity numeric,
  p_client_mutation_id text,p_received_by_user_id uuid,
  p_delivery_reference text default null,p_notes text default null,p_occurred_at timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_existing_id uuid; v_parent public.tower_material_events%rowtype;
  v_issue public.tower_material_event_items%rowtype; v_received numeric:=0;
  v_remaining numeric:=0; v_receipt_id uuid; v_auto_resolve boolean:=false; v_new_status text;
begin
  if p_quantity is null or p_quantity<=0 then raise exception 'Received quantity must be greater than zero'; end if;
  if coalesce(trim(p_client_mutation_id),'')='' then raise exception 'Receipt mutation ID is required'; end if;
  select id into v_existing_id from public.tower_material_events where project_id=p_project_id and client_mutation_id=p_client_mutation_id;
  if v_existing_id is not null then return jsonb_build_object('event_id',v_existing_id,'duplicate',true); end if;
  select e.* into v_parent from public.tower_material_events e
  join public.tower_material_event_items i on i.event_id=e.id
  where e.project_id=p_project_id and e.tower_id=p_tower_id and e.event_type='missing' and i.issue_key=p_issue_key
  for update of e;
  if not found then raise exception 'Outstanding missing-material item not found'; end if;
  select * into v_issue from public.tower_material_event_items where event_id=v_parent.id and issue_key=p_issue_key for update;
  if not found then raise exception 'Missing-material item not found'; end if;
  select coalesce(sum(i.quantity),0) into v_received from public.tower_material_event_items i
  join public.tower_material_events e on e.id=i.event_id
  where i.source_issue_key=p_issue_key and e.event_type in ('found_received','transfer_received');
  v_remaining:=greatest(coalesce(v_issue.quantity,0)-v_received,0);
  if v_remaining<=0 then raise exception 'This item is already fully received'; end if;
  if p_quantity>v_remaining then raise exception 'Only % % remain outstanding',v_remaining,coalesce(v_issue.unit,'ea'); end if;
  insert into public.tower_material_events(project_id,docket_id,tower_id,event_type,occurred_at,affected_work,notes,client_mutation_id,created_by_user_id,delivery_reference,issue_status)
  values(p_project_id,null,p_tower_id,'found_received',coalesce(p_occurred_at,now()),false,nullif(trim(p_notes),''),p_client_mutation_id,p_received_by_user_id,nullif(trim(p_delivery_reference),''),'received') returning id into v_receipt_id;
  insert into public.tower_material_event_items(event_id,source_issue_key,bundle_id,bundle_no,bundle_section,source_table,source_record_id,material_type,bolt_size,item_reference,item_description,quantity,unit,notes,material_category,specification,segment,member_number,drawing_number)
  values(v_receipt_id,p_issue_key,v_issue.bundle_id,v_issue.bundle_no,v_issue.bundle_section,v_issue.source_table,v_issue.source_record_id,v_issue.material_type,v_issue.bolt_size,v_issue.item_reference,v_issue.item_description,p_quantity,coalesce(v_issue.unit,'ea'),nullif(trim(p_notes),''),v_issue.material_category,v_issue.specification,v_issue.segment,v_issue.member_number,v_issue.drawing_number);
  select coalesce(receipt_auto_resolve,false) into v_auto_resolve from public.project_material_workflow_settings where project_id=p_project_id;
  if v_remaining-p_quantity<=0 then
    v_new_status:=case when v_auto_resolve then 'resolved' else 'received' end;
    update public.tower_material_events set issue_status=v_new_status,resolved_at=case when v_auto_resolve then coalesce(p_occurred_at,now()) else null end,resolved_by_user_id=case when v_auto_resolve then p_received_by_user_id else null end where id=v_parent.id;
  else
    v_new_status:='partially_received'; update public.tower_material_events set issue_status=v_new_status where id=v_parent.id;
  end if;
  return jsonb_build_object('event_id',v_receipt_id,'duplicate',false,'remaining_quantity',v_remaining-p_quantity,'issue_status',v_new_status);
end $$;
revoke all on function public.tttracker_v1_record_material_receipt(uuid,uuid,uuid,numeric,text,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.tttracker_v1_record_material_receipt(uuid,uuid,uuid,numeric,text,uuid,text,text,timestamptz) to service_role;

drop function if exists public.tttracker_v1_resolve_missing_material(uuid,uuid,text,uuid);
create function public.tttracker_v1_resolve_missing_material(p_project_id uuid,p_tower_id uuid,p_issue_key uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_event public.tower_material_events%rowtype; v_item public.tower_material_event_items%rowtype; v_received numeric:=0; v_remaining numeric:=0;
begin
  select e.* into v_event from public.tower_material_events e join public.tower_material_event_items i on i.event_id=e.id
  where e.project_id=p_project_id and e.tower_id=p_tower_id and e.event_type='missing' and i.issue_key=p_issue_key for update of e;
  if not found then raise exception 'Missing-material item not found'; end if;
  select * into v_item from public.tower_material_event_items where event_id=v_event.id and issue_key=p_issue_key;
  select coalesce(sum(i.quantity),0) into v_received from public.tower_material_event_items i join public.tower_material_events e on e.id=i.event_id
  where i.source_issue_key=p_issue_key and e.event_type in ('found_received','transfer_received');
  v_remaining:=greatest(coalesce(v_item.quantity,0)-v_received,0);
  if v_remaining>0 then raise exception 'Cannot resolve while % % remain outstanding',v_remaining,coalesce(v_item.unit,'ea'); end if;
  update public.tower_material_events set issue_status='resolved',resolved_by_user_id=p_user_id,resolved_at=now() where id=v_event.id;
  return jsonb_build_object('event_id',v_event.id,'issue_key',p_issue_key,'issue_status','resolved');
end $$;
revoke all on function public.tttracker_v1_resolve_missing_material(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.tttracker_v1_resolve_missing_material(uuid,uuid,uuid,uuid) to service_role;

drop function if exists public.tttracker_v1_missing_material_action(uuid,uuid,text,text,text,text,uuid,uuid,uuid[]);
create function public.tttracker_v1_missing_material_action(
  p_project_id uuid,p_tower_id uuid,p_issue_key uuid,p_client_mutation_id text,
  p_action_type text,p_body text,p_user_id uuid,p_assigned_to_user_id uuid default null,p_notify_user_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_event public.tower_material_events%rowtype; v_item public.tower_material_event_items%rowtype; v_action uuid; v_previous uuid; v_existing uuid;
begin
  if coalesce(trim(p_client_mutation_id),'')='' then raise exception 'Mutation ID is required'; end if;
  if p_action_type not in ('update','assignment','cancel') then raise exception 'Unsupported material action'; end if;
  select id into v_existing from public.tower_material_event_actions where project_id=p_project_id and client_mutation_id=p_client_mutation_id;
  if v_existing is not null then return jsonb_build_object('action_id',v_existing,'duplicate',true); end if;
  select e.* into v_event from public.tower_material_events e join public.tower_material_event_items i on i.event_id=e.id
  where e.project_id=p_project_id and e.tower_id=p_tower_id and e.event_type='missing' and i.issue_key=p_issue_key for update of e;
  if not found then raise exception 'Missing-material item not found'; end if;
  select * into v_item from public.tower_material_event_items where event_id=v_event.id and issue_key=p_issue_key;
  if v_event.issue_status in ('resolved','cancelled') then raise exception 'This material requirement is already %',v_event.issue_status; end if;
  if p_action_type='update' and coalesce(trim(p_body),'')='' then raise exception 'Enter an update'; end if;
  if p_action_type='cancel' and coalesce(trim(p_body),'')='' then raise exception 'Enter a cancellation reason'; end if;
  if p_notify_user_ids is not null then update public.tower_material_events set notify_user_ids=p_notify_user_ids where id=v_event.id; end if;
  if p_action_type='assignment' then v_previous:=v_event.assigned_to_user_id; update public.tower_material_events set assigned_to_user_id=p_assigned_to_user_id where id=v_event.id;
  elsif p_action_type='cancel' then update public.tower_material_events set issue_status='cancelled',cancelled_by_user_id=p_user_id,cancelled_at=now(),cancellation_reason=nullif(trim(p_body),'') where id=v_event.id; end if;
  insert into public.tower_material_event_actions(project_id,tower_id,material_event_id,client_mutation_id,action_type,body,previous_assignee_id,assigned_to_user_id,notify_user_ids,created_by_user_id)
  values(p_project_id,p_tower_id,v_event.id,p_client_mutation_id,p_action_type,coalesce(nullif(trim(p_body),''),''),v_previous,case when p_action_type='assignment' then p_assigned_to_user_id end,coalesce(p_notify_user_ids,'{}'),p_user_id) returning id into v_action;
  return jsonb_build_object('action_id',v_action,'event_id',v_event.id,'issue_key',p_issue_key,'item_reference',v_item.item_reference,'previous_assignee_id',v_previous,'assigned_to_user_id',p_assigned_to_user_id,'duplicate',false);
end $$;
revoke all on function public.tttracker_v1_missing_material_action(uuid,uuid,uuid,text,text,text,uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.tttracker_v1_missing_material_action(uuid,uuid,uuid,text,text,text,uuid,uuid,uuid[]) to service_role;

-- Material-register row IDs are UUIDs too. Parse the optional JSON value once
-- at the input boundary so manual items can continue to send NULL safely.
create or replace function public.tttracker_v1_create_missing_material(
  p_project_id uuid,p_tower_id uuid,p_client_mutation_id text,p_user_id uuid,
  p_item jsonb,p_urgency text default null,p_required_by date default null,
  p_notes text default null,p_occurred_at timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_event_id uuid; v_issue_key uuid; v_tower_project uuid; v_existing_item uuid; v_source_record_id uuid;
begin
  if coalesce(trim(p_client_mutation_id),'')='' then raise exception 'Mutation ID is required'; end if;
  if coalesce((p_item->>'quantity')::numeric,0)<=0 then raise exception 'Missing quantity must be greater than zero'; end if;
  begin v_source_record_id:=nullif(trim(p_item->>'sourceRecordId'),'')::uuid;
  exception when invalid_text_representation then raise exception 'Selected material reference is invalid'; end;
  select project_id into v_tower_project from public.towers where id=p_tower_id;
  if v_tower_project is distinct from p_project_id then raise exception 'Tower does not belong to this project'; end if;
  select id into v_event_id from public.tower_material_events where project_id=p_project_id and client_mutation_id=p_client_mutation_id;
  if v_event_id is not null then
    select id into v_existing_item from public.tower_material_event_items where event_id=v_event_id limit 1;
    return jsonb_build_object('event_id',v_event_id,'issue_key',(select issue_key from public.tower_material_event_items where id=v_existing_item),'duplicate',true);
  end if;
  v_issue_key:=gen_random_uuid();
  insert into public.tower_material_events(project_id,docket_id,tower_id,event_type,occurred_at,affected_work,notes,client_mutation_id,created_by_user_id,urgency,required_by,issue_status)
  values(p_project_id,null,p_tower_id,'missing',coalesce(p_occurred_at,now()),false,nullif(trim(p_notes),''),p_client_mutation_id,p_user_id,nullif(trim(p_urgency),''),p_required_by,'outstanding') returning id into v_event_id;
  insert into public.tower_material_event_items(event_id,issue_key,source_table,source_record_id,material_type,bolt_size,item_reference,item_description,quantity,unit,notes,material_category,specification,segment,member_number,drawing_number)
  values(v_event_id,v_issue_key,nullif(p_item->>'sourceTable',''),v_source_record_id,nullif(p_item->>'materialType',''),nullif(p_item->>'boltSize',''),coalesce(nullif(p_item->>'itemReference',''),nullif(p_item->>'description',''),'Other material'),nullif(p_item->>'description',''),(p_item->>'quantity')::numeric,coalesce(nullif(p_item->>'unit',''),'ea'),nullif(p_item->>'notes',''),nullif(p_item->>'category',''),nullif(p_item->>'specification',''),nullif(p_item->>'segment',''),nullif(p_item->>'memberNumber',''),nullif(p_item->>'drawingNumber',''));
  return jsonb_build_object('event_id',v_event_id,'issue_key',v_issue_key,'duplicate',false);
end $$;
notify pgrst,'reload schema';

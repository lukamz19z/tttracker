-- Extend the existing V1 material event ledger with canonical field-raised excess
-- and partial collection. No parallel register is introduced.

create or replace function public.tttracker_v1_create_excess_material(
  p_project_id uuid,
  p_tower_id uuid,
  p_client_mutation_id text,
  p_user_id uuid,
  p_item jsonb,
  p_notes text default null,
  p_location text default null,
  p_disposition text default null,
  p_occurred_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
  v_issue_key uuid;
  v_tower_project uuid;
  v_existing_item uuid;
begin
  if coalesce(trim(p_client_mutation_id), '') = '' then raise exception 'Mutation ID is required'; end if;
  if coalesce((p_item->>'quantity')::numeric, 0) <= 0 then raise exception 'Excess quantity must be greater than zero'; end if;
  select project_id into v_tower_project from public.towers where id = p_tower_id;
  if v_tower_project is distinct from p_project_id then raise exception 'Tower does not belong to this project'; end if;
  select id into v_event_id from public.tower_material_events where project_id=p_project_id and client_mutation_id=p_client_mutation_id;
  if v_event_id is not null then
    select id into v_existing_item from public.tower_material_event_items where event_id=v_event_id limit 1;
    return jsonb_build_object('event_id',v_event_id,'issue_key',(select issue_key from public.tower_material_event_items where id=v_existing_item),'duplicate',true);
  end if;
  v_issue_key := gen_random_uuid();
  insert into public.tower_material_events(
    project_id,docket_id,tower_id,event_type,occurred_at,affected_work,notes,
    client_mutation_id,created_by_user_id,issue_status,current_effect,work_outcome
  ) values (
    p_project_id,null,p_tower_id,'excess',coalesce(p_occurred_at,now()),false,
    nullif(trim(p_notes),''),p_client_mutation_id,p_user_id,'available',
    nullif(trim(p_location),''),nullif(trim(p_disposition),'')
  ) returning id into v_event_id;
  insert into public.tower_material_event_items(
    event_id,issue_key,source_table,source_record_id,material_type,bolt_size,
    item_reference,item_description,quantity,unit,notes,material_category,
    specification,segment,member_number,drawing_number
  ) values (
    v_event_id,v_issue_key,nullif(p_item->>'sourceTable',''),nullif(p_item->>'sourceRecordId','')::uuid,
    nullif(p_item->>'materialType',''),nullif(p_item->>'boltSize',''),
    coalesce(nullif(p_item->>'itemReference',''),nullif(p_item->>'description',''),'Other material'),
    nullif(p_item->>'description',''),(p_item->>'quantity')::numeric,
    coalesce(nullif(p_item->>'unit',''),'ea'),nullif(p_item->>'notes',''),
    nullif(p_item->>'category',''),nullif(p_item->>'specification',''),
    nullif(p_item->>'segment',''),nullif(p_item->>'memberNumber',''),nullif(p_item->>'drawingNumber','')
  );
  return jsonb_build_object('event_id',v_event_id,'issue_key',v_issue_key,'duplicate',false);
end;
$$;

create or replace function public.tttracker_v1_collect_excess_material(
  p_project_id uuid,
  p_tower_id uuid,
  p_issue_key uuid,
  p_quantity numeric,
  p_client_mutation_id text,
  p_user_id uuid,
  p_location text default null,
  p_reference text default null,
  p_notes text default null,
  p_occurred_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_existing_id uuid;
  v_parent public.tower_material_events%rowtype;
  v_issue public.tower_material_event_items%rowtype;
  v_collected numeric := 0;
  v_reserved numeric := 0;
  v_remaining numeric := 0;
  v_collection_id uuid;
  v_status text;
begin
  if p_quantity is null or p_quantity<=0 then raise exception 'Collected quantity must be greater than zero'; end if;
  if coalesce(trim(p_client_mutation_id),'')='' then raise exception 'Collection mutation ID is required'; end if;
  select id into v_existing_id from public.tower_material_events where project_id=p_project_id and client_mutation_id=p_client_mutation_id;
  if v_existing_id is not null then return jsonb_build_object('event_id',v_existing_id,'duplicate',true); end if;
  select e.* into v_parent from public.tower_material_events e join public.tower_material_event_items i on i.event_id=e.id
    where e.project_id=p_project_id and e.tower_id=p_tower_id and e.event_type='excess' and i.issue_key=p_issue_key
    for update of e;
  if not found then raise exception 'Excess material item not found'; end if;
  select * into v_issue from public.tower_material_event_items where event_id=v_parent.id and issue_key=p_issue_key for update;
  select coalesce(sum(i.quantity),0) into v_collected from public.tower_material_event_items i
    join public.tower_material_events e on e.id=i.event_id where i.source_issue_key=p_issue_key and e.event_type='excess_collected';
  select coalesce(sum(quantity),0) into v_reserved from public.tower_material_transfers where source_issue_key=p_issue_key and status='in_transit';
  v_remaining:=greatest(coalesce(v_issue.quantity,0)-v_collected-v_reserved,0);
  if p_quantity>v_remaining then raise exception 'Only % % remain available',v_remaining,coalesce(v_issue.unit,'ea'); end if;
  insert into public.tower_material_events(project_id,docket_id,tower_id,event_type,occurred_at,affected_work,notes,client_mutation_id,created_by_user_id,delivery_reference,issue_status,current_effect)
    values(p_project_id,null,p_tower_id,'excess_collected',coalesce(p_occurred_at,now()),false,nullif(trim(p_notes),''),p_client_mutation_id,p_user_id,nullif(trim(p_reference),''),'collected',nullif(trim(p_location),'')) returning id into v_collection_id;
  insert into public.tower_material_event_items(event_id,source_issue_key,bundle_id,bundle_no,bundle_section,source_table,source_record_id,material_type,bolt_size,item_reference,item_description,quantity,unit,notes,material_category,specification,segment,member_number,drawing_number)
    values(v_collection_id,p_issue_key,v_issue.bundle_id,v_issue.bundle_no,v_issue.bundle_section,v_issue.source_table,v_issue.source_record_id,v_issue.material_type,v_issue.bolt_size,v_issue.item_reference,v_issue.item_description,p_quantity,coalesce(v_issue.unit,'ea'),nullif(trim(p_notes),''),v_issue.material_category,v_issue.specification,v_issue.segment,v_issue.member_number,v_issue.drawing_number);
  v_status:=case when v_remaining-p_quantity<=0 then 'resolved' else 'partially_collected' end;
  update public.tower_material_events set issue_status=v_status,resolved_by_user_id=case when v_status='resolved' then p_user_id else resolved_by_user_id end,resolved_at=case when v_status='resolved' then coalesce(p_occurred_at,now()) else resolved_at end where id=v_parent.id;
  return jsonb_build_object('event_id',v_collection_id,'duplicate',false,'remaining_quantity',v_remaining-p_quantity,'issue_status',v_status,'total_quantity',v_issue.quantity,'collected_quantity',v_collected+p_quantity);
end;
$$;

revoke all on function public.tttracker_v1_create_excess_material(uuid,uuid,text,uuid,jsonb,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.tttracker_v1_create_excess_material(uuid,uuid,text,uuid,jsonb,text,text,text,timestamptz) to service_role;
revoke all on function public.tttracker_v1_collect_excess_material(uuid,uuid,uuid,numeric,text,uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.tttracker_v1_collect_excess_material(uuid,uuid,uuid,numeric,text,uuid,text,text,text,timestamptz) to service_role;
notify pgrst,'reload schema';

-- Generalise the established tower transfer ledger for material issues while
-- retaining the existing bundle IDs/numbering and lifecycle for old transfers.
alter table public.tower_material_transfers alter column source_bundle_id drop not null;
alter table public.tower_material_transfers alter column destination_bundle_id drop not null;
alter table public.tower_material_transfers
  add column if not exists source_issue_key uuid,
  add column if not exists destination_issue_key uuid,
  add column if not exists item_snapshot jsonb,
  add column if not exists create_client_mutation_id text,
  add column if not exists receive_client_mutation_id text,
  add column if not exists source_collection_event_id uuid references public.tower_material_events(id),
  add column if not exists destination_receipt_event_id uuid references public.tower_material_events(id);
alter table public.tower_daily_dockets add column if not exists material_issue_snapshot jsonb;
create unique index if not exists tower_material_transfers_create_mutation_idx
  on public.tower_material_transfers(project_id,create_client_mutation_id) where create_client_mutation_id is not null;
create unique index if not exists tower_material_transfers_receive_mutation_idx
  on public.tower_material_transfers(project_id,receive_client_mutation_id) where receive_client_mutation_id is not null;

create or replace function public.tttracker_v1_create_excess_transfer(
  p_project_id uuid,p_source_tower_id uuid,p_destination_tower_id uuid,
  p_source_issue_key uuid,p_destination_issue_key uuid,p_quantity numeric,
  p_client_mutation_id text,p_user_id uuid,p_user_name text,p_notes text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_existing public.tower_material_transfers%rowtype;
  v_parent public.tower_material_events%rowtype;
  v_item public.tower_material_event_items%rowtype;
  v_destination_item public.tower_material_event_items%rowtype;
  v_destination public.tower_material_events%rowtype;
  v_project uuid;v_collected numeric:=0;v_reserved numeric:=0;v_remaining numeric:=0;v_transfer public.tower_material_transfers%rowtype;
begin
  if p_quantity is null or p_quantity<=0 or coalesce(trim(p_client_mutation_id),'')='' then raise exception 'Transfer quantity and mutation ID are required'; end if;
  select * into v_existing from public.tower_material_transfers where project_id=p_project_id and create_client_mutation_id=p_client_mutation_id;
  if found then return jsonb_build_object('transfer',to_jsonb(v_existing),'duplicate',true); end if;
  select project_id into v_project from public.towers where id=p_source_tower_id;
  if v_project is distinct from p_project_id then raise exception 'Source tower is outside this project'; end if;
  if not exists(select 1 from public.towers where id=p_destination_tower_id and project_id=p_project_id) or p_destination_tower_id=p_source_tower_id then raise exception 'Choose a different destination tower in this project'; end if;
  select e.* into v_parent from public.tower_material_events e join public.tower_material_event_items i on i.event_id=e.id
   where e.project_id=p_project_id and e.tower_id=p_source_tower_id and e.event_type='excess' and i.issue_key=p_source_issue_key for update of e;
  if not found then raise exception 'Source excess item was not found'; end if;
  select * into v_item from public.tower_material_event_items where event_id=v_parent.id and issue_key=p_source_issue_key for update;
  if p_destination_issue_key is not null then
    select e.* into v_destination from public.tower_material_events e join public.tower_material_event_items i on i.event_id=e.id
     where e.project_id=p_project_id and e.tower_id=p_destination_tower_id and e.event_type='missing' and i.issue_key=p_destination_issue_key for update of e;
    if not found then raise exception 'Selected destination Missing requirement was not found'; end if;
    select * into v_destination_item from public.tower_material_event_items where event_id=v_destination.id and issue_key=p_destination_issue_key for update;
    if v_item.source_record_id is not null and v_destination_item.source_record_id is not null
       and (v_item.source_table is distinct from v_destination_item.source_table or v_item.source_record_id is distinct from v_destination_item.source_record_id) then
      raise exception 'Selected Missing requirement is linked to a different canonical material';
    end if;
  end if;
  select coalesce(sum(i.quantity),0) into v_collected from public.tower_material_event_items i join public.tower_material_events e on e.id=i.event_id where i.source_issue_key=p_source_issue_key and e.event_type='excess_collected';
  select coalesce(sum(quantity),0) into v_reserved from public.tower_material_transfers where source_issue_key=p_source_issue_key and status='in_transit';
  v_remaining:=greatest(coalesce(v_item.quantity,0)-v_collected-v_reserved,0);
  if p_quantity>v_remaining then raise exception 'Only % % remain available for transfer',v_remaining,coalesce(v_item.unit,'ea'); end if;
  insert into public.tower_material_transfers(project_id,source_tower_id,destination_tower_id,source_bundle_id,destination_bundle_id,bundle_no,bundle_section,quantity,status,transferred_by,transferred_by_name,transferred_at,notes,source_issue_key,destination_issue_key,item_snapshot,create_client_mutation_id)
   values(p_project_id,p_source_tower_id,p_destination_tower_id,null,null,coalesce(v_item.bundle_no,''),coalesce(v_item.bundle_section,v_item.segment,'General'),p_quantity,'in_transit',p_user_id,nullif(trim(p_user_name),''),now(),nullif(trim(p_notes),''),p_source_issue_key,p_destination_issue_key,to_jsonb(v_item),p_client_mutation_id)
   returning * into v_transfer;
  return jsonb_build_object('transfer',to_jsonb(v_transfer),'duplicate',false);
end;$$;

create or replace function public.tttracker_v1_receive_excess_transfer(
  p_project_id uuid,p_transfer_id uuid,p_client_mutation_id text,p_user_id uuid,p_user_name text,p_reference text default null,p_notes text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_transfer public.tower_material_transfers%rowtype;v_collect jsonb;v_receipt jsonb;v_source_event uuid;v_dest_event uuid;
begin
  if coalesce(trim(p_client_mutation_id),'')='' then raise exception 'Receipt mutation ID is required'; end if;
  select * into v_transfer from public.tower_material_transfers where id=p_transfer_id and project_id=p_project_id for update;
  if not found then raise exception 'Transfer was not found'; end if;
  if v_transfer.source_issue_key is null then raise exception 'This is a bundle transfer; use the existing bundle receipt workflow'; end if;
  if v_transfer.status='received' and v_transfer.receive_client_mutation_id=p_client_mutation_id then return jsonb_build_object('duplicate',true,'transfer',to_jsonb(v_transfer)); end if;
  if v_transfer.status<>'in_transit' then raise exception 'Only an in-transit transfer can be received'; end if;
  -- Release this reservation inside the transaction. Any later failure rolls
  -- the status change back along with both ledger movements.
  update public.tower_material_transfers set status='received',receive_client_mutation_id=p_client_mutation_id where id=p_transfer_id;
  v_collect:=public.tttracker_v1_collect_excess_material(p_project_id,v_transfer.source_tower_id,v_transfer.source_issue_key,v_transfer.quantity,p_client_mutation_id||':source',p_user_id,null,p_reference,p_notes,now());
  v_source_event:=(v_collect->>'event_id')::uuid;
  if v_transfer.destination_issue_key is not null then
    v_receipt:=public.tttracker_v1_record_material_receipt(p_project_id,v_transfer.destination_tower_id,v_transfer.destination_issue_key,v_transfer.quantity,p_client_mutation_id||':destination',p_user_id,p_reference,p_notes,now());
    v_dest_event:=(v_receipt->>'event_id')::uuid;
  end if;
  update public.tower_material_transfers set status='received',received_by=p_user_id,received_by_name=nullif(trim(p_user_name),''),received_at=now(),receive_client_mutation_id=p_client_mutation_id,source_collection_event_id=v_source_event,destination_receipt_event_id=v_dest_event where id=p_transfer_id returning * into v_transfer;
  return jsonb_build_object('duplicate',false,'transfer',to_jsonb(v_transfer),'source_collection',v_collect,'destination_receipt',v_receipt);
end;$$;

revoke all on function public.tttracker_v1_create_excess_transfer(uuid,uuid,uuid,uuid,uuid,numeric,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.tttracker_v1_create_excess_transfer(uuid,uuid,uuid,uuid,uuid,numeric,text,uuid,text,text) to service_role;
revoke all on function public.tttracker_v1_receive_excess_transfer(uuid,uuid,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.tttracker_v1_receive_excess_transfer(uuid,uuid,text,uuid,text,text,text) to service_role;
notify pgrst,'reload schema';


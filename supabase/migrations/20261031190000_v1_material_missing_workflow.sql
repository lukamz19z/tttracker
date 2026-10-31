-- Extend the existing V1 material event ledger for field-raised missing items.
-- Existing docket events and source_issue_key receipts remain canonical.
alter table public.tower_material_events
  add column if not exists client_mutation_id text,
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists assigned_to_user_id uuid references auth.users(id) on delete set null,
  add column if not exists urgency text,
  add column if not exists required_by date,
  add column if not exists delivery_reference text,
  add column if not exists issue_status text not null default 'outstanding',
  add column if not exists resolved_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists resolved_at timestamptz;

alter table public.tower_material_event_items
  add column if not exists material_category text,
  add column if not exists specification text,
  add column if not exists segment text,
  add column if not exists member_number text,
  add column if not exists drawing_number text;

create unique index if not exists tower_material_events_project_mutation_idx
  on public.tower_material_events(project_id, client_mutation_id)
  where client_mutation_id is not null;
create index if not exists tower_material_events_missing_issue_idx
  on public.tower_material_events(project_id, tower_id, occurred_at desc)
  where event_type = 'missing';
create index if not exists tower_material_event_items_source_issue_idx
  on public.tower_material_event_items(source_issue_key)
  where source_issue_key is not null;

create table if not exists public.project_material_workflow_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  receipt_auto_resolve boolean not null default false,
  require_receipt_photo boolean not null default false,
  require_delivery_reference boolean not null default false,
  material_categories text[] not null default array['Steel','Bolt','Packer','Mesh','Fitting','Consumable','Other']::text[],
  urgency_options text[] not null default array['Normal','Urgent','Critical']::text[],
  units text[] not null default array['ea','set','kg','m','box','bag']::text[],
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.project_material_workflow_settings(project_id)
select id from public.projects
on conflict(project_id) do nothing;

alter table public.project_material_workflow_settings enable row level security;
revoke all on public.project_material_workflow_settings from anon, authenticated;
grant all on public.project_material_workflow_settings to service_role;

create or replace function public.tttracker_v1_record_material_receipt(
  p_project_id uuid,
  p_tower_id uuid,
  p_issue_key text,
  p_quantity numeric,
  p_client_mutation_id text,
  p_received_by_user_id uuid,
  p_delivery_reference text default null,
  p_notes text default null,
  p_occurred_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_existing_id uuid;
  v_parent public.tower_material_events%rowtype;
  v_issue public.tower_material_event_items%rowtype;
  v_received numeric := 0;
  v_remaining numeric := 0;
  v_receipt_id uuid;
  v_auto_resolve boolean := false;
  v_new_status text;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Received quantity must be greater than zero';
  end if;
  if coalesce(trim(p_client_mutation_id), '') = '' then
    raise exception 'Receipt mutation ID is required';
  end if;

  select id into v_existing_id from public.tower_material_events
  where project_id = p_project_id and client_mutation_id = p_client_mutation_id;
  if v_existing_id is not null then
    return jsonb_build_object('event_id', v_existing_id, 'duplicate', true);
  end if;

  select e.* into v_parent
  from public.tower_material_events e
  join public.tower_material_event_items i on i.event_id = e.id
  where e.project_id = p_project_id and e.tower_id = p_tower_id
    and e.event_type = 'missing' and i.issue_key = p_issue_key
  for update of e;
  if not found then raise exception 'Outstanding missing-material item not found'; end if;

  select * into v_issue from public.tower_material_event_items
  where event_id = v_parent.id and issue_key = p_issue_key for update;
  if not found then raise exception 'Missing-material item not found'; end if;

  select coalesce(sum(i.quantity), 0) into v_received
  from public.tower_material_event_items i
  join public.tower_material_events e on e.id = i.event_id
  where i.source_issue_key = p_issue_key and e.event_type in ('found_received','transfer_received');
  v_remaining := greatest(coalesce(v_issue.quantity, 0) - v_received, 0);
  if v_remaining <= 0 then raise exception 'This item is already fully received'; end if;
  if p_quantity > v_remaining then
    raise exception 'Only % % remain outstanding', v_remaining, coalesce(v_issue.unit, 'ea');
  end if;

  insert into public.tower_material_events(
    project_id, docket_id, tower_id, event_type, occurred_at, affected_work,
    notes, client_mutation_id, created_by_user_id, delivery_reference, issue_status
  ) values (
    p_project_id, null, p_tower_id, 'found_received', coalesce(p_occurred_at, now()), false,
    nullif(trim(p_notes), ''), p_client_mutation_id, p_received_by_user_id,
    nullif(trim(p_delivery_reference), ''), 'received'
  ) returning id into v_receipt_id;

  insert into public.tower_material_event_items(
    event_id, source_issue_key, bundle_id, bundle_no, bundle_section, source_table,
    source_record_id, material_type, bolt_size, item_reference, item_description,
    quantity, unit, notes, material_category, specification, segment, member_number, drawing_number
  ) values (
    v_receipt_id, p_issue_key, v_issue.bundle_id, v_issue.bundle_no, v_issue.bundle_section,
    v_issue.source_table, v_issue.source_record_id, v_issue.material_type, v_issue.bolt_size,
    v_issue.item_reference, v_issue.item_description, p_quantity, coalesce(v_issue.unit, 'ea'),
    nullif(trim(p_notes), ''), v_issue.material_category, v_issue.specification, v_issue.segment,
    v_issue.member_number, v_issue.drawing_number
  );

  select coalesce(receipt_auto_resolve, false) into v_auto_resolve
  from public.project_material_workflow_settings where project_id = p_project_id;
  if v_remaining - p_quantity <= 0 then
    v_new_status := case when v_auto_resolve then 'resolved' else 'received' end;
    update public.tower_material_events set issue_status = v_new_status,
      resolved_at = case when v_auto_resolve then coalesce(p_occurred_at, now()) else null end,
      resolved_by_user_id = case when v_auto_resolve then p_received_by_user_id else null end
    where id = v_parent.id;
  else
    v_new_status := 'partially_received';
    update public.tower_material_events set issue_status = v_new_status where id = v_parent.id;
  end if;

  return jsonb_build_object('event_id', v_receipt_id, 'duplicate', false, 'remaining_quantity', v_remaining - p_quantity, 'issue_status', v_new_status);
end;
$$;

create or replace function public.tttracker_v1_create_missing_material(
  p_project_id uuid,
  p_tower_id uuid,
  p_client_mutation_id text,
  p_user_id uuid,
  p_item jsonb,
  p_urgency text default null,
  p_required_by date default null,
  p_notes text default null,
  p_occurred_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
  v_issue_key text;
  v_tower_project uuid;
  v_existing_item uuid;
begin
  if coalesce(trim(p_client_mutation_id), '') = '' then raise exception 'Mutation ID is required'; end if;
  if coalesce((p_item->>'quantity')::numeric, 0) <= 0 then raise exception 'Missing quantity must be greater than zero'; end if;
  select project_id into v_tower_project from public.towers where id = p_tower_id;
  if v_tower_project is distinct from p_project_id then raise exception 'Tower does not belong to this project'; end if;

  select id into v_event_id from public.tower_material_events
  where project_id = p_project_id and client_mutation_id = p_client_mutation_id;
  if v_event_id is not null then
    select id into v_existing_item from public.tower_material_event_items where event_id = v_event_id limit 1;
    return jsonb_build_object('event_id', v_event_id, 'issue_key', (select issue_key from public.tower_material_event_items where id = v_existing_item), 'duplicate', true);
  end if;

  v_issue_key := gen_random_uuid()::text;
  insert into public.tower_material_events(
    project_id, docket_id, tower_id, event_type, occurred_at, affected_work,
    notes, client_mutation_id, created_by_user_id, urgency, required_by, issue_status
  ) values (
    p_project_id, null, p_tower_id, 'missing', coalesce(p_occurred_at, now()), false,
    nullif(trim(p_notes), ''), p_client_mutation_id, p_user_id,
    nullif(trim(p_urgency), ''), p_required_by, 'outstanding'
  ) returning id into v_event_id;

  insert into public.tower_material_event_items(
    event_id, issue_key, source_table, source_record_id, material_type, bolt_size,
    item_reference, item_description, quantity, unit, notes, material_category,
    specification, segment, member_number, drawing_number
  ) values (
    v_event_id, v_issue_key, nullif(p_item->>'sourceTable',''), nullif(p_item->>'sourceRecordId',''),
    nullif(p_item->>'materialType',''), nullif(p_item->>'boltSize',''),
    coalesce(nullif(p_item->>'itemReference',''), nullif(p_item->>'description',''), 'Other material'),
    nullif(p_item->>'description',''), (p_item->>'quantity')::numeric,
    coalesce(nullif(p_item->>'unit',''), 'ea'), nullif(p_item->>'notes',''),
    nullif(p_item->>'category',''), nullif(p_item->>'specification',''),
    nullif(p_item->>'segment',''), nullif(p_item->>'memberNumber',''), nullif(p_item->>'drawingNumber','')
  );
  return jsonb_build_object('event_id', v_event_id, 'issue_key', v_issue_key, 'duplicate', false);
end;
$$;

create or replace function public.tttracker_v1_resolve_missing_material(
  p_project_id uuid,
  p_tower_id uuid,
  p_issue_key text,
  p_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_event public.tower_material_events%rowtype;
  v_item public.tower_material_event_items%rowtype;
  v_received numeric := 0;
  v_remaining numeric := 0;
begin
  select e.* into v_event from public.tower_material_events e
  join public.tower_material_event_items i on i.event_id=e.id
  where e.project_id=p_project_id and e.tower_id=p_tower_id and e.event_type='missing' and i.issue_key=p_issue_key
  for update of e;
  if not found then raise exception 'Missing-material item not found'; end if;
  select * into v_item from public.tower_material_event_items where event_id=v_event.id and issue_key=p_issue_key;
  select coalesce(sum(i.quantity),0) into v_received from public.tower_material_event_items i
  join public.tower_material_events e on e.id=i.event_id
  where i.source_issue_key=p_issue_key and e.event_type in ('found_received','transfer_received');
  v_remaining:=greatest(coalesce(v_item.quantity,0)-v_received,0);
  if v_remaining>0 then raise exception 'Cannot resolve while % % remain outstanding',v_remaining,coalesce(v_item.unit,'ea'); end if;
  update public.tower_material_events set issue_status='resolved',resolved_by_user_id=p_user_id,resolved_at=now() where id=v_event.id;
  return jsonb_build_object('event_id',v_event.id,'issue_key',p_issue_key,'issue_status','resolved');
end;
$$;

revoke all on function public.tttracker_v1_create_missing_material(uuid,uuid,text,uuid,jsonb,text,date,text,timestamptz) from public, anon, authenticated;
grant execute on function public.tttracker_v1_create_missing_material(uuid,uuid,text,uuid,jsonb,text,date,text,timestamptz) to service_role;
revoke all on function public.tttracker_v1_resolve_missing_material(uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.tttracker_v1_resolve_missing_material(uuid,uuid,text,uuid) to service_role;
revoke all on function public.tttracker_v1_record_material_receipt(uuid,uuid,text,numeric,text,uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.tttracker_v1_record_material_receipt(uuid,uuid,text,numeric,text,uuid,text,text,timestamptz) to service_role;
notify pgrst, 'reload schema';

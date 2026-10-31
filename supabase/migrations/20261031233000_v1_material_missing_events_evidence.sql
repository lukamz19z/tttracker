-- Additive lifecycle events and controlled receipt evidence for V1 Materials.
alter table public.project_material_notification_rules
  add column if not exists notify_update boolean not null default false,
  add column if not exists notify_cancel boolean not null default false;

alter table public.tower_material_events
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists cancellation_reason text;
alter table public.project_material_workflow_settings
  add column if not exists evidence_sharepoint_drive_id text,
  add column if not exists evidence_sharepoint_folder_id text;

create table if not exists public.tower_material_event_actions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  tower_id uuid not null references public.towers(id) on delete cascade,
  material_event_id uuid not null references public.tower_material_events(id) on delete cascade,
  client_mutation_id text not null,
  action_type text not null default 'update' check(action_type in ('update','assignment','cancel')),
  body text not null,
  previous_assignee_id uuid references auth.users(id) on delete set null,
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  notify_user_ids uuid[] not null default '{}',
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(project_id,client_mutation_id)
);
create index if not exists tower_material_event_actions_event_idx
  on public.tower_material_event_actions(material_event_id,created_at,id);
alter table public.tower_material_event_actions enable row level security;
revoke all on public.tower_material_event_actions from anon,authenticated;
grant all on public.tower_material_event_actions to service_role;

create table if not exists public.tower_material_receipt_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  tower_id uuid not null references public.towers(id) on delete cascade,
  missing_event_id uuid not null references public.tower_material_events(id) on delete cascade,
  receipt_event_id uuid not null references public.tower_material_events(id) on delete cascade,
  client_evidence_id text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  uploaded_by_user_id uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  storage_bucket text not null default 'materials-evidence',
  storage_path text not null,
  sharepoint_drive_id text,
  sharepoint_item_id text,
  sharepoint_web_url text,
  unique(project_id,client_evidence_id)
);
create index if not exists tower_material_receipt_files_receipt_idx
  on public.tower_material_receipt_files(receipt_event_id,uploaded_at,id);
alter table public.tower_material_receipt_files enable row level security;
revoke all on public.tower_material_receipt_files from anon,authenticated;
grant all on public.tower_material_receipt_files to service_role;

create or replace function public.tttracker_v1_missing_material_action(
  p_project_id uuid,p_tower_id uuid,p_issue_key text,p_client_mutation_id text,
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
  if p_action_type='assignment' then
    v_previous:=v_event.assigned_to_user_id;
    update public.tower_material_events set assigned_to_user_id=p_assigned_to_user_id where id=v_event.id;
  elsif p_action_type='cancel' then
    update public.tower_material_events set issue_status='cancelled',cancelled_by_user_id=p_user_id,cancelled_at=now(),cancellation_reason=nullif(trim(p_body),'') where id=v_event.id;
  end if;
  insert into public.tower_material_event_actions(project_id,tower_id,material_event_id,client_mutation_id,action_type,body,previous_assignee_id,assigned_to_user_id,notify_user_ids,created_by_user_id)
  values(p_project_id,p_tower_id,v_event.id,p_client_mutation_id,p_action_type,coalesce(nullif(trim(p_body),''),''),v_previous,case when p_action_type='assignment' then p_assigned_to_user_id end,coalesce(p_notify_user_ids,'{}'),p_user_id)
  returning id into v_action;
  return jsonb_build_object('action_id',v_action,'event_id',v_event.id,'issue_key',p_issue_key,'item_reference',v_item.item_reference,'previous_assignee_id',v_previous,'assigned_to_user_id',p_assigned_to_user_id,'duplicate',false);
end $$;
revoke all on function public.tttracker_v1_missing_material_action(uuid,uuid,text,text,text,text,uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.tttracker_v1_missing_material_action(uuid,uuid,text,text,text,text,uuid,uuid,uuid[]) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('materials-evidence','materials-evidence',false,26214400,array['image/jpeg','image/png','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=26214400,allowed_mime_types=array['image/jpeg','image/png','application/pdf'];
notify pgrst,'reload schema';

-- Event notification rules and delivery idempotency for the existing V1
-- tower_material_events ledger. No separate materials register is introduced.
alter table public.tower_material_events
  add column if not exists notify_user_ids uuid[] not null default '{}';

create table if not exists public.project_material_notification_rules (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  notify_raised boolean not null default false,
  notify_urgent boolean not null default false,
  notify_partial_receipt boolean not null default false,
  notify_full_receipt boolean not null default false,
  notify_resolved boolean not null default false,
  notify_assignment boolean not null default false,
  receives_in_app boolean not null default true,
  receives_push boolean not null default true,
  receives_email boolean not null default false,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key(project_id,user_id)
);
alter table public.project_material_notification_rules enable row level security;
revoke all on public.project_material_notification_rules from anon, authenticated;
grant all on public.project_material_notification_rules to service_role;

create table if not exists public.material_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_event_id uuid not null references public.tower_material_events(id) on delete cascade,
  event_type text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check(channel in ('push','email')),
  created_at timestamptz not null default now(),
  unique(source_event_id,event_type,user_id,channel)
);
alter table public.material_notification_deliveries enable row level security;
revoke all on public.material_notification_deliveries from anon, authenticated;
grant all on public.material_notification_deliveries to service_role;

-- Generic canonical-source linkage for module notifications.
-- Do not use user_notifications.event_id here: that field belongs to the
-- existing notification-event pipeline and is not a generic source-record ID.
alter table public.user_notifications
  add column if not exists source_table text,
  add column if not exists source_record_id text;

-- In-app Missing Materials notifications are deduplicated against the
-- canonical material event/action that generated them.
create unique index if not exists user_notifications_material_event_unique_idx
  on public.user_notifications(
    user_id,
    event_type,
    source_table,
    source_record_id
  )
  where source_table in (
    'tower_material_events',
    'tower_material_event_actions'
  )
  and event_type like 'material_%';

notify pgrst, 'reload schema';

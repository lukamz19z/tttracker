-- Keep device delivery attempts separate from the per-user Notification Centre
-- event. A per-user push uniqueness key skips the recipient's other devices.
create table if not exists public.material_push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_event_id uuid not null references public.tower_material_events(id) on delete cascade,
  event_type text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_token_hash text not null,
  expo_ticket_id text,
  delivery_status text not null default 'sending'
    check (delivery_status in ('sending','ticket_accepted','delivered')),
  push_payload jsonb not null,
  retry_count integer not null default 0,
  receipt_checked_at timestamptz,
  last_error text,
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(source_event_id,event_type,user_id,expo_token_hash)
);
alter table public.material_push_delivery_attempts enable row level security;
revoke all on public.material_push_delivery_attempts from anon, authenticated;
grant all on public.material_push_delivery_attempts to service_role;

notify pgrst, 'reload schema';

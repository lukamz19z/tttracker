-- TTTracker
-- Migration 007: authentication email workflow tracking

create table if not exists public.v2_auth_email_requests (
  id uuid primary key default gen_random_uuid(),

  user_id uuid
    references auth.users(id)
    on delete cascade,

  action_type text not null
    check (action_type in ('password_recovery', 'email_change')),

  current_email text,
  new_email text,

  status text not null default 'pending'
    check (status in ('pending', 'completed', 'cancelled')),

  send_count integer not null default 0,

  last_sent_at timestamptz,
  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,

  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.v2_auth_email_delivery_attempts (
  id uuid primary key default gen_random_uuid(),

  request_id uuid
    references public.v2_auth_email_requests(id)
    on delete cascade,

  user_id uuid
    references auth.users(id)
    on delete set null,

  action_type text not null
    check (
      action_type in (
        'password_recovery',
        'email_change_current',
        'email_change_new'
      )
    ),

  recipient text not null,

  provider text not null,

  status text not null
    check (status in ('sent', 'failed')),

  provider_message_id text,
  error_message text,

  attempted_at timestamptz not null default now(),

  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_v2_auth_email_requests_user
  on public.v2_auth_email_requests(user_id, created_at desc);

create index if not exists idx_v2_auth_email_requests_status
  on public.v2_auth_email_requests(status, created_at desc);

create index if not exists idx_v2_auth_email_delivery_request
  on public.v2_auth_email_delivery_attempts(request_id, attempted_at desc);

alter table public.v2_auth_email_requests enable row level security;
alter table public.v2_auth_email_delivery_attempts enable row level security;

drop policy if exists "users can read own auth email requests"
  on public.v2_auth_email_requests;

create policy "users can read own auth email requests"
on public.v2_auth_email_requests
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can read own auth email deliveries"
  on public.v2_auth_email_delivery_attempts;

create policy "users can read own auth email deliveries"
on public.v2_auth_email_delivery_attempts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "platform admins can read auth email requests"
  on public.v2_auth_email_requests;

create policy "platform admins can read auth email requests"
on public.v2_auth_email_requests
for select
to authenticated
using (
  private.tttracker_v2_is_platform_admin(
    array['owner', 'admin', 'support']::text[]
  )
);

drop policy if exists "platform admins can read auth email deliveries"
  on public.v2_auth_email_delivery_attempts;

create policy "platform admins can read auth email deliveries"
on public.v2_auth_email_delivery_attempts
for select
to authenticated
using (
  private.tttracker_v2_is_platform_admin(
    array['owner', 'admin', 'support']::text[]
  )
);

grant usage on schema public to service_role;

grant all privileges
on table public.v2_auth_email_requests
to service_role;

grant all privileges
on table public.v2_auth_email_delivery_attempts
to service_role;

create or replace function private.tttracker_v2_touch_auth_email_request()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_v2_auth_email_requests_updated_at
  on public.v2_auth_email_requests;

create trigger trg_v2_auth_email_requests_updated_at
before update on public.v2_auth_email_requests
for each row
execute function private.tttracker_v2_touch_auth_email_request();

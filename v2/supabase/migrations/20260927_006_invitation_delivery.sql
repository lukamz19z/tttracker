-- TTTracker V2
-- Migration 006: invitation delivery / resend / diagnostics
-- Customer-facing email is sent by TTTracker, not Supabase.

alter table public.v2_organisation_invitations
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists last_sent_at timestamptz,
  add column if not exists send_count integer not null default 0,
  add column if not exists last_error text,
  add column if not exists provider text,
  add column if not exists provider_message_id text;

create table if not exists public.v2_invitation_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null
    references public.v2_organisation_invitations(id) on delete cascade,
  organisation_id uuid not null
    references public.organisations(id) on delete cascade,
  attempted_by uuid references auth.users(id) on delete set null,
  delivery_type text not null default 'email'
    check (delivery_type in ('email')),
  provider text not null,
  status text not null
    check (status in ('sent', 'failed')),
  provider_message_id text,
  error_message text,
  attempted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_v2_invitation_delivery_attempts_invitation
  on public.v2_invitation_delivery_attempts(invitation_id, attempted_at desc);

create index if not exists idx_v2_invitation_delivery_attempts_organisation
  on public.v2_invitation_delivery_attempts(organisation_id, attempted_at desc);

alter table public.v2_invitation_delivery_attempts enable row level security;

drop policy if exists "platform admins can read invitation delivery attempts"
  on public.v2_invitation_delivery_attempts;

create policy "platform admins can read invitation delivery attempts"
on public.v2_invitation_delivery_attempts
for select
to authenticated
using (
  private.tttracker_v2_is_platform_admin(
    array['owner', 'admin', 'support']::text[]
  )
);

grant usage on schema public to service_role;
grant all privileges on table public.v2_invitation_delivery_attempts to service_role;
grant all privileges on table public.v2_organisation_invitations to service_role;

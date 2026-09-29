-- TTTracker V2
-- Migration 009: configurable MFA / security verification

create table if not exists public.v2_security_policies (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('platform', 'organisation')),
  organisation_id uuid references public.organisations(id) on delete cascade,
  email_code_mode text not null default 'optional'
    check (email_code_mode in ('off', 'optional', 'required')),
  totp_mode text not null default 'optional'
    check (totp_mode in ('off', 'optional', 'required')),
  email_code_expiry_minutes integer not null default 10
    check (email_code_expiry_minutes between 5 and 30),
  max_email_code_attempts integer not null default 5
    check (max_email_code_attempts between 3 and 10),
  trusted_email_verification_hours integer not null default 12
    check (trusted_email_verification_hours between 1 and 168),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_security_policy_scope_check check (
    (scope_type = 'platform' and organisation_id is null)
    or
    (scope_type = 'organisation' and organisation_id is not null)
  )
);

create unique index if not exists v2_security_policy_platform_uidx
on public.v2_security_policies(scope_type)
where scope_type = 'platform';

create unique index if not exists v2_security_policy_org_uidx
on public.v2_security_policies(organisation_id)
where scope_type = 'organisation';

create table if not exists public.v2_email_mfa_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'expired', 'cancelled')),
  provider text,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create table if not exists public.v2_security_session_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  verification_type text not null check (verification_type in ('email_code')),
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (user_id, session_id, verification_type)
);

create index if not exists idx_v2_email_mfa_challenges_user_session
on public.v2_email_mfa_challenges(user_id, session_id, created_at desc);

create index if not exists idx_v2_security_session_verifications
on public.v2_security_session_verifications(user_id, session_id, expires_at);

alter table public.v2_security_policies enable row level security;
alter table public.v2_email_mfa_challenges enable row level security;
alter table public.v2_security_session_verifications enable row level security;

drop policy if exists "authenticated users can read security policies"
on public.v2_security_policies;

create policy "authenticated users can read security policies"
on public.v2_security_policies
for select
to authenticated
using (
  scope_type = 'platform'
  or exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v2_security_policies.organisation_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
);

drop policy if exists "users can read own security verifications"
on public.v2_security_session_verifications;

create policy "users can read own security verifications"
on public.v2_security_session_verifications
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "platform admins can read security policies"
on public.v2_security_policies;

create policy "platform admins can read security policies"
on public.v2_security_policies
for select
to authenticated
using (
  private.tttracker_v2_is_platform_admin(
    array['owner', 'admin', 'support']::text[]
  )
);

grant usage on schema public to service_role;
grant all privileges on table public.v2_security_policies to service_role;
grant all privileges on table public.v2_email_mfa_challenges to service_role;
grant all privileges on table public.v2_security_session_verifications to service_role;

create or replace function private.tttracker_v2_touch_security_policy()
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

drop trigger if exists trg_v2_security_policy_updated_at
on public.v2_security_policies;

create trigger trg_v2_security_policy_updated_at
before update on public.v2_security_policies
for each row
execute function private.tttracker_v2_touch_security_policy();

insert into public.v2_security_policies (
  scope_type,
  organisation_id,
  email_code_mode,
  totp_mode,
  email_code_expiry_minutes,
  max_email_code_attempts,
  trusted_email_verification_hours
)
values ('platform', null, 'required', 'optional', 10, 5, 12)
on conflict do nothing;

insert into public.v2_security_policies (
  scope_type,
  organisation_id,
  email_code_mode,
  totp_mode,
  email_code_expiry_minutes,
  max_email_code_attempts,
  trusted_email_verification_hours
)
select
  'organisation',
  o.id,
  'optional',
  'optional',
  10,
  5,
  12
from public.organisations o
where not exists (
  select 1
  from public.v2_security_policies p
  where p.scope_type = 'organisation'
    and p.organisation_id = o.id
);

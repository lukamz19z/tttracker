-- TTTracker V2
-- Migration 004: Platform administration foundation
-- Depends on Migration 001-003.

begin;

create table if not exists public.v2_platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin'
    check (role in ('owner','admin','support')),
  status text not null default 'active'
    check (status in ('active','suspended','removed')),
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists v2_platform_admins_set_updated_at on public.v2_platform_admins;
create trigger v2_platform_admins_set_updated_at
before update on public.v2_platform_admins
for each row execute function private.tttracker_v2_set_updated_at();

create table if not exists public.v2_organisation_invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  email text not null,
  intended_role_code text not null default 'admin',
  invitation_type text not null default 'initial_admin'
    check (invitation_type in ('initial_admin','organisation_user')),
  status text not null default 'pending'
    check (status in ('pending','accepted','expired','cancelled')),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_organisation_invitations_email_not_blank check (btrim(email) <> '')
);

create index if not exists v2_organisation_invitations_org_idx
  on public.v2_organisation_invitations (organisation_id, status);

create index if not exists v2_organisation_invitations_email_idx
  on public.v2_organisation_invitations (lower(email), status);

drop trigger if exists v2_organisation_invitations_set_updated_at on public.v2_organisation_invitations;
create trigger v2_organisation_invitations_set_updated_at
before update on public.v2_organisation_invitations
for each row execute function private.tttracker_v2_set_updated_at();

create or replace function private.tttracker_v2_is_platform_admin(
  required_roles text[] default array['owner','admin','support']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.v2_platform_admins pa
    where pa.user_id = (select auth.uid())
      and pa.status = 'active'
      and pa.role = any(required_roles)
  );
$$;

revoke all on function private.tttracker_v2_is_platform_admin(text[]) from public;
grant execute on function private.tttracker_v2_is_platform_admin(text[]) to authenticated;

-- Allow platform admins to inspect tenant setup without weakening tenant isolation.
drop policy if exists "platform admins can read organisations" on public.organisations;
create policy "platform admins can read organisations"
on public.organisations
for select
to authenticated
using (private.tttracker_v2_is_platform_admin());

drop policy if exists "platform admins can read organisation users" on public.organisation_users;
create policy "platform admins can read organisation users"
on public.organisation_users
for select
to authenticated
using (private.tttracker_v2_is_platform_admin());

drop policy if exists "platform admins can read organisation settings" on public.organisation_settings;
create policy "platform admins can read organisation settings"
on public.organisation_settings
for select
to authenticated
using (private.tttracker_v2_is_platform_admin());

drop policy if exists "platform admins can read organisation modules" on public.organisation_modules;
create policy "platform admins can read organisation modules"
on public.organisation_modules
for select
to authenticated
using (private.tttracker_v2_is_platform_admin());

alter table public.v2_platform_admins enable row level security;
alter table public.v2_organisation_invitations enable row level security;

revoke all on table public.v2_platform_admins from anon, authenticated;
revoke all on table public.v2_organisation_invitations from anon, authenticated;

grant select on table public.v2_platform_admins to authenticated;
grant select on table public.v2_organisation_invitations to authenticated;

create policy "platform admins can read platform admins"
on public.v2_platform_admins
for select
to authenticated
using (private.tttracker_v2_is_platform_admin());

create policy "platform admins can read organisation invitations"
on public.v2_organisation_invitations
for select
to authenticated
using (private.tttracker_v2_is_platform_admin());

commit;

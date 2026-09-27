-- TTTracker V2
-- Migration 001: Organisation foundation
-- Purpose: introduce a secure multi-tenant organisation boundary without modifying V1 tables.

begin;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Utility trigger
-- ---------------------------------------------------------------------------

create or replace function private.tttracker_v2_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.tttracker_v2_set_updated_at() from public;

-- ---------------------------------------------------------------------------
-- Organisations
-- ---------------------------------------------------------------------------

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  legal_name text,
  abn text,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organisations_code_not_blank check (btrim(code) <> ''),
  constraint organisations_name_not_blank check (btrim(name) <> ''),
  constraint organisations_abn_format check (
    abn is null or regexp_replace(abn, '[^0-9]', '', 'g') ~ '^[0-9]{11}$'
  )
);

create unique index if not exists organisations_code_lower_uidx
  on public.organisations (lower(code));

create unique index if not exists organisations_abn_digits_uidx
  on public.organisations ((regexp_replace(abn, '[^0-9]', '', 'g')))
  where abn is not null;

create index if not exists organisations_status_idx
  on public.organisations (status);

drop trigger if exists organisations_set_updated_at on public.organisations;
create trigger organisations_set_updated_at
before update on public.organisations
for each row execute function private.tttracker_v2_set_updated_at();

-- ---------------------------------------------------------------------------
-- Organisation memberships
-- ---------------------------------------------------------------------------

create table if not exists public.organisation_users (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null
    references public.organisations(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended', 'removed')),
  joined_at timestamptz,
  invited_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organisation_users_org_user_unique
    unique (organisation_id, user_id)
);

create index if not exists organisation_users_user_idx
  on public.organisation_users (user_id);

create index if not exists organisation_users_org_status_idx
  on public.organisation_users (organisation_id, status);

create index if not exists organisation_users_user_status_idx
  on public.organisation_users (user_id, status);

drop trigger if exists organisation_users_set_updated_at on public.organisation_users;
create trigger organisation_users_set_updated_at
before update on public.organisation_users
for each row execute function private.tttracker_v2_set_updated_at();

-- ---------------------------------------------------------------------------
-- Organisation settings
-- This is intentionally simple. A richer versioned configuration engine comes
-- later; these are organisation-level platform settings only.
-- ---------------------------------------------------------------------------

create table if not exists public.organisation_settings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null
    references public.organisations(id) on delete cascade,
  setting_key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organisation_settings_key_not_blank
    check (btrim(setting_key) <> ''),
  constraint organisation_settings_org_key_unique
    unique (organisation_id, setting_key)
);

create index if not exists organisation_settings_org_idx
  on public.organisation_settings (organisation_id);

drop trigger if exists organisation_settings_set_updated_at on public.organisation_settings;
create trigger organisation_settings_set_updated_at
before update on public.organisation_settings
for each row execute function private.tttracker_v2_set_updated_at();

-- ---------------------------------------------------------------------------
-- Organisation modules
-- ---------------------------------------------------------------------------

create table if not exists public.organisation_modules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null
    references public.organisations(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organisation_modules_key_not_blank
    check (btrim(module_key) <> ''),
  constraint organisation_modules_org_module_unique
    unique (organisation_id, module_key)
);

create index if not exists organisation_modules_org_enabled_idx
  on public.organisation_modules (organisation_id, enabled);

drop trigger if exists organisation_modules_set_updated_at on public.organisation_modules;
create trigger organisation_modules_set_updated_at
before update on public.organisation_modules
for each row execute function private.tttracker_v2_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helper
--
-- Security definer is kept in the private schema and has a pinned empty
-- search_path. Every referenced object is schema-qualified.
-- ---------------------------------------------------------------------------

create or replace function private.tttracker_v2_is_organisation_member(
  target_organisation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = target_organisation_id
      and ou.user_id = (select auth.uid())
      and ou.status = 'active'
  );
$$;

revoke all on function private.tttracker_v2_is_organisation_member(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.tttracker_v2_is_organisation_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- Secure by default:
--   * anon gets no access
--   * authenticated gets SELECT only where policy allows it
--   * writes are server/service-role only until V2 permissions are introduced
-- ---------------------------------------------------------------------------

alter table public.organisations enable row level security;
alter table public.organisation_users enable row level security;
alter table public.organisation_settings enable row level security;
alter table public.organisation_modules enable row level security;

revoke all on table public.organisations from anon, authenticated;
revoke all on table public.organisation_users from anon, authenticated;
revoke all on table public.organisation_settings from anon, authenticated;
revoke all on table public.organisation_modules from anon, authenticated;

grant select on table public.organisations to authenticated;
grant select on table public.organisation_users to authenticated;
grant select on table public.organisation_settings to authenticated;
grant select on table public.organisation_modules to authenticated;

drop policy if exists "organisation members can read organisation" on public.organisations;
create policy "organisation members can read organisation"
on public.organisations
for select
to authenticated
using (
  (select private.tttracker_v2_is_organisation_member(organisations.id))
);

drop policy if exists "users can read own organisation memberships" on public.organisation_users;
create policy "users can read own organisation memberships"
on public.organisation_users
for select
to authenticated
using (
  user_id = (select auth.uid())
  and status <> 'removed'
);

drop policy if exists "organisation members can read organisation settings" on public.organisation_settings;
create policy "organisation members can read organisation settings"
on public.organisation_settings
for select
to authenticated
using (
  (select private.tttracker_v2_is_organisation_member(organisation_settings.organisation_id))
);

drop policy if exists "organisation members can read organisation modules" on public.organisation_modules;
create policy "organisation members can read organisation modules"
on public.organisation_modules
for select
to authenticated
using (
  (select private.tttracker_v2_is_organisation_member(organisation_modules.organisation_id))
);

commit;

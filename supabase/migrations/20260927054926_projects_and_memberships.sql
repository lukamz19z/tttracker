-- TTTracker V2
-- Migration 003: Organisation-aware projects and project memberships
-- Depends on Migration 001 and 002.

begin;

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create table if not exists public.v2_projects (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null
    references public.organisations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  status text not null default 'active'
    check (status in ('draft','active','on_hold','completed','archived')),
  project_type text,
  client_name text,
  start_date date,
  end_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint v2_projects_code_not_blank check (btrim(code) <> ''),
  constraint v2_projects_name_not_blank check (btrim(name) <> ''),
  constraint v2_projects_org_code_unique unique (organisation_id, code)
);

create index if not exists v2_projects_org_status_idx
  on public.v2_projects (organisation_id, status);

create index if not exists v2_projects_org_name_idx
  on public.v2_projects (organisation_id, name);

drop trigger if exists v2_projects_set_updated_at on public.v2_projects;
create trigger v2_projects_set_updated_at
before update on public.v2_projects
for each row execute function private.tttracker_v2_set_updated_at();

-- ---------------------------------------------------------------------------
-- Project memberships
-- ---------------------------------------------------------------------------

create table if not exists public.v2_project_users (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null
    references public.organisations(id) on delete cascade,
  project_id uuid not null
    references public.v2_projects(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('invited','active','suspended','removed')),
  access_level text not null default 'member'
    check (access_level in ('viewer','member','manager','admin')),
  joined_at timestamptz,
  invited_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint v2_project_users_unique unique (project_id, user_id)
);

create index if not exists v2_project_users_user_idx
  on public.v2_project_users (user_id, status);

create index if not exists v2_project_users_project_idx
  on public.v2_project_users (project_id, status);

create index if not exists v2_project_users_org_idx
  on public.v2_project_users (organisation_id, status);

drop trigger if exists v2_project_users_set_updated_at on public.v2_project_users;
create trigger v2_project_users_set_updated_at
before update on public.v2_project_users
for each row execute function private.tttracker_v2_set_updated_at();

-- Ensure organisation_id matches project organisation and user is org member.
create or replace function private.tttracker_v2_validate_project_user()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  project_org uuid;
  org_member boolean;
begin
  select p.organisation_id
    into project_org
  from public.v2_projects p
  where p.id = new.project_id;

  if project_org is null then
    raise exception 'Project % does not exist', new.project_id;
  end if;

  if project_org <> new.organisation_id then
    raise exception 'Project organisation does not match project-user organisation';
  end if;

  select exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = new.organisation_id
      and ou.user_id = new.user_id
      and ou.status = 'active'
  )
  into org_member;

  if not org_member then
    raise exception 'User must be an active organisation member before project access can be granted';
  end if;

  return new;
end;
$$;

revoke all on function private.tttracker_v2_validate_project_user() from public;

drop trigger if exists v2_project_users_validate on public.v2_project_users;
create trigger v2_project_users_validate
before insert or update on public.v2_project_users
for each row execute function private.tttracker_v2_validate_project_user();

-- ---------------------------------------------------------------------------
-- Project settings
-- ---------------------------------------------------------------------------

create table if not exists public.v2_project_settings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null
    references public.organisations(id) on delete cascade,
  project_id uuid not null
    references public.v2_projects(id) on delete cascade,
  setting_key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint v2_project_settings_key_not_blank check (btrim(setting_key) <> ''),
  constraint v2_project_settings_unique unique (project_id, setting_key)
);

create index if not exists v2_project_settings_project_idx
  on public.v2_project_settings (project_id);

drop trigger if exists v2_project_settings_set_updated_at on public.v2_project_settings;
create trigger v2_project_settings_set_updated_at
before update on public.v2_project_settings
for each row execute function private.tttracker_v2_set_updated_at();

create or replace function private.tttracker_v2_validate_project_setting()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  project_org uuid;
begin
  select p.organisation_id
    into project_org
  from public.v2_projects p
  where p.id = new.project_id;

  if project_org is null then
    raise exception 'Project % does not exist', new.project_id;
  end if;

  if project_org <> new.organisation_id then
    raise exception 'Project organisation does not match project-setting organisation';
  end if;

  return new;
end;
$$;

revoke all on function private.tttracker_v2_validate_project_setting() from public;

drop trigger if exists v2_project_settings_validate on public.v2_project_settings;
create trigger v2_project_settings_validate
before insert or update on public.v2_project_settings
for each row execute function private.tttracker_v2_validate_project_setting();

-- ---------------------------------------------------------------------------
-- Project membership helpers
-- ---------------------------------------------------------------------------

create or replace function private.tttracker_v2_is_project_member(
  target_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.v2_project_users pu
    join public.v2_projects p
      on p.id = pu.project_id
     and p.organisation_id = pu.organisation_id
    where pu.project_id = target_project_id
      and pu.user_id = (select auth.uid())
      and pu.status = 'active'
      and p.status <> 'archived'
  );
$$;

revoke all on function private.tttracker_v2_is_project_member(uuid) from public;
grant execute on function private.tttracker_v2_is_project_member(uuid) to authenticated;

create or replace function private.tttracker_v2_has_project_permission(
  target_organisation_id uuid,
  target_project_id uuid,
  target_permission_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  project_org uuid;
begin
  select p.organisation_id
    into project_org
  from public.v2_projects p
  where p.id = target_project_id;

  if project_org is null then
    return false;
  end if;

  if project_org <> target_organisation_id then
    return false;
  end if;

  if not private.tttracker_v2_is_project_member(target_project_id) then
    return false;
  end if;

  return private.tttracker_v2_has_permission(
    target_organisation_id,
    target_permission_code
  );
end;
$$;

revoke all on function private.tttracker_v2_has_project_permission(uuid, uuid, text) from public;
grant execute on function private.tttracker_v2_has_project_permission(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Resource registry + permissions for project administration.
-- ---------------------------------------------------------------------------

insert into public.v2_resources (
  resource_key,
  name,
  module_key,
  resource_type,
  description
)
values
  (
    'project.settings',
    'Project settings',
    'projects',
    'setting',
    'Project-specific configuration and settings.'
  ),
  (
    'project.users',
    'Project users',
    'projects',
    'register',
    'Project membership and access management.'
  )
on conflict (resource_key) do nothing;

insert into public.v2_permissions (
  resource_id,
  permission_code,
  action_key,
  name
)
select
  r.id,
  r.resource_key || '.' || a.action_key,
  a.action_key,
  initcap(replace(a.action_key, '_', ' ')) || ' ' || r.name
from public.v2_resources r
cross join (
  values
    ('view'),
    ('create'),
    ('edit'),
    ('approve'),
    ('delete'),
    ('configure')
) as a(action_key)
where r.resource_key in ('project.settings', 'project.users')
on conflict (permission_code) do nothing;

-- Existing admin roles automatically inherit new permissions.
insert into public.v2_role_permissions (
  organisation_id,
  role_id,
  permission_id,
  allowed
)
select
  r.organisation_id,
  r.id,
  p.id,
  true
from public.v2_roles r
cross join public.v2_permissions p
where r.code = 'admin'
  and r.is_active = true
  and p.permission_code in (
    'project.settings.view',
    'project.settings.create',
    'project.settings.edit',
    'project.settings.approve',
    'project.settings.delete',
    'project.settings.configure',
    'project.users.view',
    'project.users.create',
    'project.users.edit',
    'project.users.approve',
    'project.users.delete',
    'project.users.configure'
  )
on conflict (role_id, permission_id)
do update set allowed = true;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.v2_projects enable row level security;
alter table public.v2_project_users enable row level security;
alter table public.v2_project_settings enable row level security;

revoke all on table public.v2_projects from anon, authenticated;
revoke all on table public.v2_project_users from anon, authenticated;
revoke all on table public.v2_project_settings from anon, authenticated;

grant select on table public.v2_projects to authenticated;
grant select on table public.v2_project_users to authenticated;
grant select on table public.v2_project_settings to authenticated;

create policy "project members can read projects"
on public.v2_projects
for select
to authenticated
using (
  private.tttracker_v2_is_organisation_member(organisation_id)
  and private.tttracker_v2_is_project_member(id)
);

create policy "users can read own project memberships"
on public.v2_project_users
for select
to authenticated
using (
  user_id = (select auth.uid())
  and private.tttracker_v2_is_organisation_member(organisation_id)
);

create policy "project members can read project settings"
on public.v2_project_settings
for select
to authenticated
using (
  private.tttracker_v2_is_organisation_member(organisation_id)
  and private.tttracker_v2_is_project_member(project_id)
);

commit;

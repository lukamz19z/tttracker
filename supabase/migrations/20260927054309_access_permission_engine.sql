-- TTTracker V2
-- Migration 002: Access and permission engine
-- Depends on Migration 001 organisation foundation.

begin;

create table if not exists public.v2_resources (
  id uuid primary key default gen_random_uuid(),
  resource_key text not null unique,
  name text not null,
  module_key text,
  resource_type text not null default 'module'
    check (resource_type in ('module','page','register','form','document_library','dashboard','checklist','workflow','report','integration','setting','other')),
  route text,
  parent_resource_id uuid references public.v2_resources(id) on delete set null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_resources_key_not_blank check (btrim(resource_key) <> ''),
  constraint v2_resources_name_not_blank check (btrim(name) <> '')
);

create index if not exists v2_resources_module_idx on public.v2_resources (module_key, is_active);

drop trigger if exists v2_resources_set_updated_at on public.v2_resources;
create trigger v2_resources_set_updated_at
before update on public.v2_resources
for each row execute function private.tttracker_v2_set_updated_at();

create table if not exists public.v2_permissions (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.v2_resources(id) on delete cascade,
  permission_code text not null unique,
  action_key text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_permissions_code_not_blank check (btrim(permission_code) <> ''),
  constraint v2_permissions_action_not_blank check (btrim(action_key) <> ''),
  constraint v2_permissions_name_not_blank check (btrim(name) <> ''),
  constraint v2_permissions_resource_action_unique unique (resource_id, action_key)
);

create index if not exists v2_permissions_resource_idx on public.v2_permissions (resource_id, is_active);

drop trigger if exists v2_permissions_set_updated_at on public.v2_permissions;
create trigger v2_permissions_set_updated_at
before update on public.v2_permissions
for each row execute function private.tttracker_v2_set_updated_at();

create table if not exists public.v2_roles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_roles_code_not_blank check (btrim(code) <> ''),
  constraint v2_roles_name_not_blank check (btrim(name) <> ''),
  constraint v2_roles_org_code_unique unique (organisation_id, code)
);

create index if not exists v2_roles_org_active_idx on public.v2_roles (organisation_id, is_active, sort_order);

drop trigger if exists v2_roles_set_updated_at on public.v2_roles;
create trigger v2_roles_set_updated_at
before update on public.v2_roles
for each row execute function private.tttracker_v2_set_updated_at();

create table if not exists public.v2_role_permissions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  role_id uuid not null references public.v2_roles(id) on delete cascade,
  permission_id uuid not null references public.v2_permissions(id) on delete cascade,
  allowed boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint v2_role_permissions_unique unique (role_id, permission_id)
);

create index if not exists v2_role_permissions_org_role_idx on public.v2_role_permissions (organisation_id, role_id);
create index if not exists v2_role_permissions_permission_idx on public.v2_role_permissions (permission_id);

create or replace function private.tttracker_v2_validate_role_permission_org()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  role_org uuid;
begin
  select r.organisation_id into role_org
  from public.v2_roles r
  where r.id = new.role_id;

  if role_org is null then
    raise exception 'Role % does not exist', new.role_id;
  end if;

  if role_org <> new.organisation_id then
    raise exception 'Role organisation does not match role-permission organisation';
  end if;

  return new;
end;
$$;

revoke all on function private.tttracker_v2_validate_role_permission_org() from public;

drop trigger if exists v2_role_permissions_validate_org on public.v2_role_permissions;
create trigger v2_role_permissions_validate_org
before insert or update on public.v2_role_permissions
for each row execute function private.tttracker_v2_validate_role_permission_org();

create table if not exists public.v2_user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.v2_roles(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active','suspended','revoked')),
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_user_role_assignments_unique unique (organisation_id, user_id, role_id)
);

create index if not exists v2_user_role_assignments_user_org_idx on public.v2_user_role_assignments (user_id, organisation_id, status);
create index if not exists v2_user_role_assignments_role_idx on public.v2_user_role_assignments (role_id, status);

drop trigger if exists v2_user_role_assignments_set_updated_at on public.v2_user_role_assignments;
create trigger v2_user_role_assignments_set_updated_at
before update on public.v2_user_role_assignments
for each row execute function private.tttracker_v2_set_updated_at();

create or replace function private.tttracker_v2_validate_user_role_org()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  role_org uuid;
  membership_exists boolean;
begin
  select r.organisation_id into role_org
  from public.v2_roles r
  where r.id = new.role_id;

  if role_org is null then
    raise exception 'Role % does not exist', new.role_id;
  end if;

  if role_org <> new.organisation_id then
    raise exception 'Role organisation does not match assignment organisation';
  end if;

  select exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = new.organisation_id
      and ou.user_id = new.user_id
      and ou.status = 'active'
  )
  into membership_exists;

  if not membership_exists then
    raise exception 'User must be an active organisation member before a role can be assigned';
  end if;

  return new;
end;
$$;

revoke all on function private.tttracker_v2_validate_user_role_org() from public;

drop trigger if exists v2_user_role_assignments_validate_org on public.v2_user_role_assignments;
create trigger v2_user_role_assignments_validate_org
before insert or update on public.v2_user_role_assignments
for each row execute function private.tttracker_v2_validate_user_role_org();

create table if not exists public.v2_user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_id uuid not null references public.v2_permissions(id) on delete cascade,
  effect text not null check (effect in ('allow','deny')),
  reason text,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_user_permission_overrides_unique unique (organisation_id, user_id, permission_id)
);

create index if not exists v2_user_permission_overrides_lookup_idx
  on public.v2_user_permission_overrides (organisation_id, user_id, permission_id, effect);

drop trigger if exists v2_user_permission_overrides_set_updated_at on public.v2_user_permission_overrides;
create trigger v2_user_permission_overrides_set_updated_at
before update on public.v2_user_permission_overrides
for each row execute function private.tttracker_v2_set_updated_at();

create or replace function private.tttracker_v2_has_permission(
  target_organisation_id uuid,
  target_permission_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_permission_id uuid;
begin
  if current_user_id is null then
    return false;
  end if;

  if not private.tttracker_v2_is_organisation_member(target_organisation_id) then
    return false;
  end if;

  select p.id into target_permission_id
  from public.v2_permissions p
  where p.permission_code = target_permission_code
    and p.is_active = true
  limit 1;

  if target_permission_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.v2_user_permission_overrides upo
    where upo.organisation_id = target_organisation_id
      and upo.user_id = current_user_id
      and upo.permission_id = target_permission_id
      and upo.effect = 'deny'
      and (upo.expires_at is null or upo.expires_at > now())
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.v2_user_permission_overrides upo
    where upo.organisation_id = target_organisation_id
      and upo.user_id = current_user_id
      and upo.permission_id = target_permission_id
      and upo.effect = 'allow'
      and (upo.expires_at is null or upo.expires_at > now())
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.v2_user_role_assignments ura
    join public.v2_roles r
      on r.id = ura.role_id
     and r.organisation_id = ura.organisation_id
    join public.v2_role_permissions rp
      on rp.role_id = r.id
     and rp.organisation_id = r.organisation_id
    where ura.organisation_id = target_organisation_id
      and ura.user_id = current_user_id
      and ura.status = 'active'
      and (ura.expires_at is null or ura.expires_at > now())
      and r.is_active = true
      and rp.permission_id = target_permission_id
      and rp.allowed = true
  );
end;
$$;

revoke all on function private.tttracker_v2_has_permission(uuid, text) from public;
grant execute on function private.tttracker_v2_has_permission(uuid, text) to authenticated;

alter table public.v2_resources enable row level security;
alter table public.v2_permissions enable row level security;
alter table public.v2_roles enable row level security;
alter table public.v2_role_permissions enable row level security;
alter table public.v2_user_role_assignments enable row level security;
alter table public.v2_user_permission_overrides enable row level security;

revoke all on table public.v2_resources from anon, authenticated;
revoke all on table public.v2_permissions from anon, authenticated;
revoke all on table public.v2_roles from anon, authenticated;
revoke all on table public.v2_role_permissions from anon, authenticated;
revoke all on table public.v2_user_role_assignments from anon, authenticated;
revoke all on table public.v2_user_permission_overrides from anon, authenticated;

grant select on table public.v2_resources to authenticated;
grant select on table public.v2_permissions to authenticated;
grant select on table public.v2_roles to authenticated;
grant select on table public.v2_role_permissions to authenticated;
grant select on table public.v2_user_role_assignments to authenticated;
grant select on table public.v2_user_permission_overrides to authenticated;

create policy "authenticated can read active resources"
on public.v2_resources for select to authenticated
using (is_active = true);

create policy "authenticated can read active permissions"
on public.v2_permissions for select to authenticated
using (is_active = true);

create policy "organisation members can read roles"
on public.v2_roles for select to authenticated
using (private.tttracker_v2_is_organisation_member(organisation_id));

create policy "organisation members can read role permissions"
on public.v2_role_permissions for select to authenticated
using (private.tttracker_v2_is_organisation_member(organisation_id));

create policy "users can read own role assignments"
on public.v2_user_role_assignments for select to authenticated
using (
  user_id = (select auth.uid())
  and private.tttracker_v2_is_organisation_member(organisation_id)
);

create policy "users can read own permission overrides"
on public.v2_user_permission_overrides for select to authenticated
using (
  user_id = (select auth.uid())
  and private.tttracker_v2_is_organisation_member(organisation_id)
);

commit;

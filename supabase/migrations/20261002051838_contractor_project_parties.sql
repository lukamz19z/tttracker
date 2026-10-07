-- TTTracker V2
-- Migration 013: Contractor-first project party / client-sharing foundation
--
-- Keeps contractor-hosted projects as the first supported model while preparing
-- the backend for external clients and future client / principal-contractor hosted projects.

begin;

-- ---------------------------------------------------------------------------
-- 0. Prerequisites
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.organisations') is null then
    raise exception 'V2 prerequisite missing: public.organisations';
  end if;

  if to_regclass('public.organisation_users') is null then
    raise exception 'V2 prerequisite missing: public.organisation_users';
  end if;

  if to_regclass('public.v2_projects') is null then
    raise exception 'V2 prerequisite missing: public.v2_projects';
  end if;

  if to_regclass('public.v2_project_users') is null then
    raise exception 'V2 prerequisite missing: public.v2_project_users';
  end if;
end
$$;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 1. Explicit project host
-- ---------------------------------------------------------------------------
-- organisation_id remains untouched for current V2 compatibility.
-- host_organisation_id becomes the explicit project-workspace host.
-- Existing projects are contractor-hosted and therefore both IDs match today.

alter table public.v2_projects
  add column if not exists host_organisation_id uuid
    references public.organisations(id) on delete restrict,
  add column if not exists hosting_model_key text not null
    default 'contractor_hosted';

update public.v2_projects
set host_organisation_id = organisation_id
where host_organisation_id is null;

alter table public.v2_projects
  alter column host_organisation_id set not null;

create index if not exists v2_projects_host_org_idx
  on public.v2_projects(host_organisation_id, status);

comment on column public.v2_projects.host_organisation_id is
  'Organisation hosting the project workspace. Existing V2 projects are contractor-hosted.';

comment on column public.v2_projects.hosting_model_key is
  'Data-driven hosting model key. Initial supported model: contractor_hosted.';

-- ---------------------------------------------------------------------------
-- 2. Configurable project-party types
-- ---------------------------------------------------------------------------
-- Party types belong to the host organisation and can later be managed from
-- configuration. No CHECK constraint hard-codes the available types.

create table if not exists public.v2_project_party_type_definitions (
  id uuid primary key default gen_random_uuid(),
  host_organisation_id uuid not null
    references public.organisations(id) on delete cascade,
  party_type_key text not null,
  label text not null,
  description text,
  behaviour_key text not null default 'other',
  is_active boolean not null default true,
  sort_order integer not null default 100,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(host_organisation_id, party_type_key)
);

insert into public.v2_project_party_type_definitions (
  host_organisation_id,
  party_type_key,
  label,
  description,
  behaviour_key,
  sort_order
)
select
  o.id,
  seed.party_type_key,
  seed.label,
  seed.description,
  seed.behaviour_key,
  seed.sort_order
from public.organisations o
cross join (
  values
    ('contractor', 'Contractor', 'Organisation delivering the project work.', 'internal_operator', 10),
    ('client', 'Client', 'External client receiving selected project information.', 'external_client', 20),
    ('subcontractor', 'Subcontractor', 'External organisation delivering a defined part of the work.', 'external_contractor', 30),
    ('consultant', 'Consultant', 'External adviser, designer or consultant participating in the project.', 'external_participant', 40),
    ('other', 'Other', 'Other project participant configured by the host organisation.', 'other', 100)
) as seed(party_type_key, label, description, behaviour_key, sort_order)
on conflict (host_organisation_id, party_type_key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Project parties
-- ---------------------------------------------------------------------------
-- A party can link to another TTTracker organisation, or exist as an external
-- client before that client has its own TTTracker organisation.

create table if not exists public.v2_project_parties (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.v2_projects(id) on delete cascade,
  host_organisation_id uuid not null
    references public.organisations(id) on delete cascade,
  linked_organisation_id uuid
    references public.organisations(id) on delete set null,
  party_type_key text not null,
  display_name text not null,
  external_code text,
  status text not null default 'active'
    check (status in ('invited','active','suspended','removed')),
  is_host boolean not null default false,
  portal_enabled boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists v2_project_parties_one_host_uidx
  on public.v2_project_parties(project_id)
  where is_host = true and status <> 'removed';

create unique index if not exists v2_project_parties_linked_org_uidx
  on public.v2_project_parties(project_id, linked_organisation_id)
  where linked_organisation_id is not null and status <> 'removed';

create index if not exists v2_project_parties_project_idx
  on public.v2_project_parties(project_id, status, party_type_key);

-- Backfill every existing V2 project with its contractor/host party.
insert into public.v2_project_parties (
  project_id,
  host_organisation_id,
  linked_organisation_id,
  party_type_key,
  display_name,
  status,
  is_host,
  portal_enabled,
  metadata
)
select
  p.id,
  p.host_organisation_id,
  p.host_organisation_id,
  'contractor',
  coalesce(o.name, o.code, 'Host Organisation'),
  'active',
  true,
  false,
  jsonb_build_object('source', 'migration_013_host_backfill')
from public.v2_projects p
join public.organisations o on o.id = p.host_organisation_id
where not exists (
  select 1
  from public.v2_project_parties existing
  where existing.project_id = p.id
    and existing.is_host = true
    and existing.status <> 'removed'
);

-- ---------------------------------------------------------------------------
-- 4. External party / client users
-- ---------------------------------------------------------------------------
-- Contractor staff stay in v2_project_users.
-- External client/project-party users live here.

create table if not exists public.v2_project_party_users (
  id uuid primary key default gen_random_uuid(),
  project_party_id uuid not null
    references public.v2_project_parties(id) on delete cascade,
  project_id uuid not null
    references public.v2_projects(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  status text not null default 'invited'
    check (status in ('invited','active','suspended','removed')),
  display_name text,
  email text,
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_party_id, user_id)
);

create index if not exists v2_project_party_users_user_idx
  on public.v2_project_party_users(user_id, status);

create index if not exists v2_project_party_users_project_idx
  on public.v2_project_party_users(project_id, status);

-- ---------------------------------------------------------------------------
-- 5. Configurable external-party permission catalogue
-- ---------------------------------------------------------------------------
-- Internal contractor permissions remain handled by the existing V2 RBAC.
-- These definitions are for external parties/client portal access.

create table if not exists public.v2_project_party_permission_definitions (
  id uuid primary key default gen_random_uuid(),
  host_organisation_id uuid not null
    references public.organisations(id) on delete cascade,
  permission_key text not null,
  label text not null,
  description text,
  module_key text,
  default_allowed boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(host_organisation_id, permission_key)
);

insert into public.v2_project_party_permission_definitions (
  host_organisation_id,
  permission_key,
  label,
  description,
  module_key,
  default_allowed,
  sort_order
)
select
  o.id,
  seed.permission_key,
  seed.label,
  seed.description,
  seed.module_key,
  seed.default_allowed,
  seed.sort_order
from public.organisations o
cross join (
  values
    ('project.overview.view', 'View Project Overview', 'View the client-facing project overview.', 'projects', true, 10),
    ('progress.view', 'View Project Progress', 'View project/tower progress shared by the contractor.', 'progress', true, 20),
    ('forecasting.view', 'View Shared Forecasting', 'View forecasting specifically shared by the contractor.', 'progress', false, 30),
    ('daily_dockets.view_submitted', 'View Submitted Daily Dockets', 'View dockets after contractor submission/publication.', 'daily_dockets', true, 40),
    ('daily_dockets.comment', 'Comment on Daily Dockets', 'Add comments to shared Daily Dockets.', 'daily_dockets', false, 50),
    ('daily_dockets.approve', 'Approve Daily Dockets', 'Approve Daily Dockets when client approval is enabled.', 'daily_dockets', false, 60),
    ('materials.view', 'View Shared Materials', 'View project materials published by the contractor.', 'materials', false, 70),
    ('materials.issues.view', 'View Material Issues', 'View shared missing/excess/material issues.', 'materials', true, 80),
    ('defects.view', 'View Defects', 'View defects shared by the contractor.', 'quality', true, 90),
    ('defects.comment', 'Comment on Defects', 'Comment on shared defects without editing contractor records.', 'quality', false, 100),
    ('documents.view', 'View Shared Documents', 'View documents published to the external party.', 'documents', false, 110),
    ('training.view_shared', 'View Shared Training', 'View only training/compliance information explicitly shared.', 'training', false, 120),
    ('commercial.view_shared', 'View Shared Commercial Information', 'View only commercial information explicitly shared.', 'commercial', false, 130)
) as seed(permission_key, label, description, module_key, default_allowed, sort_order)
on conflict (host_organisation_id, permission_key) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Party permissions and individual overrides
-- ---------------------------------------------------------------------------

create table if not exists public.v2_project_party_permissions (
  project_party_id uuid not null
    references public.v2_project_parties(id) on delete cascade,
  permission_key text not null,
  allowed boolean not null,
  granted_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(project_party_id, permission_key)
);

create table if not exists public.v2_project_party_user_permission_overrides (
  project_party_user_id uuid not null
    references public.v2_project_party_users(id) on delete cascade,
  permission_key text not null,
  allowed boolean not null,
  granted_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(project_party_user_id, permission_key)
);

-- ---------------------------------------------------------------------------
-- 7. Explicit record sharing
-- ---------------------------------------------------------------------------
-- Lets the contractor publish selected records without exposing an entire
-- internal module. record_id is intentionally generic/polymorphic.

create table if not exists public.v2_record_party_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.v2_projects(id) on delete cascade,
  project_party_id uuid not null
    references public.v2_project_parties(id) on delete cascade,
  record_type text not null,
  record_id uuid not null,
  access_level text not null default 'view'
    check (access_level in ('view','comment','review','approve')),
  is_active boolean not null default true,
  shared_by uuid references auth.users(id) on delete set null,
  shared_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique(project_party_id, record_type, record_id)
);

create index if not exists v2_record_party_shares_record_idx
  on public.v2_record_party_shares(project_id, record_type, record_id)
  where is_active = true;

create index if not exists v2_record_party_shares_party_idx
  on public.v2_record_party_shares(project_party_id, record_type)
  where is_active = true;

-- ---------------------------------------------------------------------------
-- 8. Record ownership + visibility on operational tables
-- ---------------------------------------------------------------------------
-- organisation_id remains the current workspace/tenant scoping column.
-- origin_organisation_id identifies which organisation actually owns/created
-- the operational record.
--
-- In contractor-hosted V2 today these are the same.
-- In future client/PC-hosted projects they can differ.
--
-- Client access is opt-in by default.

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'v2_daily_dockets',
    'v2_material_register',
    'v2_material_events',
    'v2_defects',
    'v2_project_production_actuals'
  ]
  loop
    if to_regclass('public.' || tbl) is not null then
      execute format(
        'alter table public.%I
           add column if not exists origin_organisation_id uuid
             references public.organisations(id) on delete restrict,
           add column if not exists visibility_scope text not null
             default ''origin_only''',
        tbl
      );

      execute format(
        'update public.%I
         set origin_organisation_id = organisation_id
         where origin_organisation_id is null',
        tbl
      );

      execute format(
        'create index if not exists %I
           on public.%I(origin_organisation_id)',
        tbl || '_origin_org_idx',
        tbl
      );
    end if;
  end loop;
end
$$;

-- Initial application visibility values:
--   origin_only
--   host_and_origin
--   project_parties
--   selected_parties
-- No CHECK constraint is used so organisations/platform can extend behaviour.

-- ---------------------------------------------------------------------------
-- 9. Helpers
-- ---------------------------------------------------------------------------

create or replace function private.tttracker_v2_is_active_org_member(
  p_organisation_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = p_organisation_id
      and ou.user_id = p_user_id
      and ou.status = 'active'
  );
$$;

create or replace function private.tttracker_v2_is_project_host_member(
  p_project_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.v2_projects p
    join public.organisation_users ou
      on ou.organisation_id = p.host_organisation_id
    where p.id = p_project_id
      and ou.user_id = p_user_id
      and ou.status = 'active'
  );
$$;

create or replace function private.tttracker_v2_is_external_party_user(
  p_project_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.v2_project_party_users pu
    join public.v2_project_parties pp
      on pp.id = pu.project_party_id
    where pu.project_id = p_project_id
      and pu.user_id = p_user_id
      and pu.status = 'active'
      and pp.status = 'active'
      and pp.portal_enabled = true
  );
$$;

create or replace function private.tttracker_v2_external_party_has_permission(
  p_project_id uuid,
  p_permission_key text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  with memberships as (
    select
      pu.id as party_user_id,
      pu.project_party_id
    from public.v2_project_party_users pu
    join public.v2_project_parties pp
      on pp.id = pu.project_party_id
    where pu.project_id = p_project_id
      and pu.user_id = p_user_id
      and pu.status = 'active'
      and pp.status = 'active'
      and pp.portal_enabled = true
  ),
  resolved as (
    select
      m.party_user_id,
      coalesce(
        (
          select upo.allowed
          from public.v2_project_party_user_permission_overrides upo
          where upo.project_party_user_id = m.party_user_id
            and upo.permission_key = p_permission_key
          limit 1
        ),
        (
          select party_permission.allowed
          from public.v2_project_party_permissions party_permission
          where party_permission.project_party_id = m.project_party_id
            and party_permission.permission_key = p_permission_key
          limit 1
        ),
        (
          select pd.default_allowed
          from public.v2_project_parties party
          join public.v2_project_party_permission_definitions pd
            on pd.host_organisation_id = party.host_organisation_id
           and pd.permission_key = p_permission_key
           and pd.is_active = true
          where party.id = m.project_party_id
          limit 1
        ),
        false
      ) as allowed
    from memberships m
  )
  select exists (
    select 1
    from resolved
    where allowed = true
  );
$$;

create or replace function private.tttracker_v2_record_is_shared_with_user(
  p_project_id uuid,
  p_record_type text,
  p_record_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.v2_record_party_shares s
    join public.v2_project_party_users pu
      on pu.project_party_id = s.project_party_id
    join public.v2_project_parties pp
      on pp.id = s.project_party_id
    where s.project_id = p_project_id
      and s.record_type = p_record_type
      and s.record_id = p_record_id
      and s.is_active = true
      and pu.user_id = p_user_id
      and pu.status = 'active'
      and pp.status = 'active'
      and pp.portal_enabled = true
  );
$$;

-- ---------------------------------------------------------------------------
-- 10. RLS
-- ---------------------------------------------------------------------------
-- Mutations are server-route/service-role controlled for now.
-- Internal contractor authorisation remains with the existing V2 permission
-- engine; these policies only provide safe read access to the new party data.

alter table public.v2_project_party_type_definitions enable row level security;
alter table public.v2_project_parties enable row level security;
alter table public.v2_project_party_users enable row level security;
alter table public.v2_project_party_permission_definitions enable row level security;
alter table public.v2_project_party_permissions enable row level security;
alter table public.v2_project_party_user_permission_overrides enable row level security;
alter table public.v2_record_party_shares enable row level security;

drop policy if exists "v2 party types read" on public.v2_project_party_type_definitions;
create policy "v2 party types read"
on public.v2_project_party_type_definitions
for select to authenticated
using (
  private.tttracker_v2_is_active_org_member(host_organisation_id)
);

drop policy if exists "v2 project parties read" on public.v2_project_parties;
create policy "v2 project parties read"
on public.v2_project_parties
for select to authenticated
using (
  private.tttracker_v2_is_project_host_member(project_id)
  or exists (
    select 1
    from public.v2_project_party_users pu
    where pu.project_party_id = v2_project_parties.id
      and pu.user_id = auth.uid()
      and pu.status = 'active'
  )
);

drop policy if exists "v2 project party users read" on public.v2_project_party_users;
create policy "v2 project party users read"
on public.v2_project_party_users
for select to authenticated
using (
  private.tttracker_v2_is_project_host_member(project_id)
  or user_id = auth.uid()
);

drop policy if exists "v2 party permission definitions read"
  on public.v2_project_party_permission_definitions;
create policy "v2 party permission definitions read"
on public.v2_project_party_permission_definitions
for select to authenticated
using (
  private.tttracker_v2_is_active_org_member(host_organisation_id)
);

drop policy if exists "v2 project party permissions read"
  on public.v2_project_party_permissions;
create policy "v2 project party permissions read"
on public.v2_project_party_permissions
for select to authenticated
using (
  exists (
    select 1
    from public.v2_project_parties pp
    where pp.id = v2_project_party_permissions.project_party_id
      and (
        private.tttracker_v2_is_project_host_member(pp.project_id)
        or exists (
          select 1
          from public.v2_project_party_users pu
          where pu.project_party_id = pp.id
            and pu.user_id = auth.uid()
            and pu.status = 'active'
        )
      )
  )
);

drop policy if exists "v2 party user permission overrides read"
  on public.v2_project_party_user_permission_overrides;
create policy "v2 party user permission overrides read"
on public.v2_project_party_user_permission_overrides
for select to authenticated
using (
  exists (
    select 1
    from public.v2_project_party_users pu
    where pu.id = v2_project_party_user_permission_overrides.project_party_user_id
      and (
        pu.user_id = auth.uid()
        or private.tttracker_v2_is_project_host_member(pu.project_id)
      )
  )
);

drop policy if exists "v2 record party shares read"
  on public.v2_record_party_shares;
create policy "v2 record party shares read"
on public.v2_record_party_shares
for select to authenticated
using (
  private.tttracker_v2_is_project_host_member(project_id)
  or exists (
    select 1
    from public.v2_project_party_users pu
    where pu.project_party_id = v2_record_party_shares.project_party_id
      and pu.user_id = auth.uid()
      and pu.status = 'active'
  )
);

-- ---------------------------------------------------------------------------
-- 11. Grants
-- ---------------------------------------------------------------------------

grant usage on schema private to authenticated, service_role;

grant execute on function private.tttracker_v2_is_active_org_member(uuid, uuid)
  to authenticated, service_role;
grant execute on function private.tttracker_v2_is_project_host_member(uuid, uuid)
  to authenticated, service_role;
grant execute on function private.tttracker_v2_is_external_party_user(uuid, uuid)
  to authenticated, service_role;
grant execute on function private.tttracker_v2_external_party_has_permission(uuid, text, uuid)
  to authenticated, service_role;
grant execute on function private.tttracker_v2_record_is_shared_with_user(uuid, text, uuid, uuid)
  to authenticated, service_role;

grant select on public.v2_project_party_type_definitions to authenticated;
grant select on public.v2_project_parties to authenticated;
grant select on public.v2_project_party_users to authenticated;
grant select on public.v2_project_party_permission_definitions to authenticated;
grant select on public.v2_project_party_permissions to authenticated;
grant select on public.v2_project_party_user_permission_overrides to authenticated;
grant select on public.v2_record_party_shares to authenticated;

grant all privileges on public.v2_project_party_type_definitions to service_role;
grant all privileges on public.v2_project_parties to service_role;
grant all privileges on public.v2_project_party_users to service_role;
grant all privileges on public.v2_project_party_permission_definitions to service_role;
grant all privileges on public.v2_project_party_permissions to service_role;
grant all privileges on public.v2_project_party_user_permission_overrides to service_role;
grant all privileges on public.v2_record_party_shares to service_role;

-- ---------------------------------------------------------------------------
-- 12. Summary view for a future Project > Client / Parties page
-- ---------------------------------------------------------------------------

create or replace view public.v2_project_party_summary
with (security_invoker = true)
as
select
  pp.id,
  pp.project_id,
  pp.host_organisation_id,
  pp.linked_organisation_id,
  pp.party_type_key,
  pp.display_name,
  pp.external_code,
  pp.status,
  pp.is_host,
  pp.portal_enabled,
  pp.settings,
  pp.metadata,
  pp.created_at,
  pp.updated_at,
  count(pu.id) filter (where pu.status = 'active') as active_user_count,
  count(pu.id) filter (where pu.status = 'invited') as invited_user_count
from public.v2_project_parties pp
left join public.v2_project_party_users pu
  on pu.project_party_id = pp.id
group by
  pp.id,
  pp.project_id,
  pp.host_organisation_id,
  pp.linked_organisation_id,
  pp.party_type_key,
  pp.display_name,
  pp.external_code,
  pp.status,
  pp.is_host,
  pp.portal_enabled,
  pp.settings,
  pp.metadata,
  pp.created_at,
  pp.updated_at;

grant select on public.v2_project_party_summary to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

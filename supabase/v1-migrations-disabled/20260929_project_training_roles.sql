-- TTTracker Training - project-defined Training roles
-- 2026-09-29
--
-- Adds project-specific roles such as Ground Crew, Leading Hand, Crane Crew,
-- Stringing Crew, etc. The role names themselves remain data; nothing here is
-- hard-coded to a particular project, contractor or Training type.

begin;

-- -----------------------------------------------------------------------------
-- Dynamic Training management permission
-- -----------------------------------------------------------------------------
insert into public.access_groups (
  code,
  name,
  description,
  sort_order,
  is_active
)
values (
  'training',
  'Training',
  'Training records, compliance, project requirements and workflow.',
  160,
  true
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  is_active = true,
  updated_at = now();

with training_group as (
  select id
  from public.access_groups
  where code = 'training'
  limit 1
)
insert into public.access_areas (
  group_id,
  category,
  code,
  name,
  description,
  type,
  permission_level,
  route,
  source,
  sort_order,
  is_active
)
select
  training_group.id,
  'TTTracker · Training',
  'tt.training.manage',
  'Manage Training',
  'Manage Training configuration, project Training roles, requirements and compliance records.',
  'tttracker',
  'manage',
  '/people/training',
  'system_permission',
  20,
  true
from training_group
on conflict (code) do update
set
  group_id = excluded.group_id,
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  type = excluded.type,
  permission_level = excluded.permission_level,
  route = excluded.route,
  source = excluded.source,
  is_active = true,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Project-defined Training roles
-- -----------------------------------------------------------------------------
create table if not exists public.project_training_roles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_training_roles_name_not_blank
    check (length(trim(name)) > 0)
);

create unique index if not exists project_training_roles_project_name_key
  on public.project_training_roles (
    project_id,
    lower(trim(name))
  );

create index if not exists project_training_roles_project_idx
  on public.project_training_roles(project_id, active, sort_order, name);

create table if not exists public.project_training_role_assignments (
  id uuid primary key default gen_random_uuid(),
  project_role_id uuid not null
    references public.project_training_roles(id) on delete cascade,
  employee_id uuid not null
    references public.employees(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(project_role_id, employee_id)
);

create index if not exists project_training_role_assignments_role_idx
  on public.project_training_role_assignments(project_role_id, employee_id);

create index if not exists project_training_role_assignments_employee_idx
  on public.project_training_role_assignments(employee_id, project_role_id);

-- Existing project requirements remain valid. New rows use project_role_id.
alter table if exists public.project_training_requirements
  add column if not exists project_role_id uuid
    references public.project_training_roles(id) on delete cascade;

create index if not exists project_training_requirements_project_role_idx
  on public.project_training_requirements(project_id, project_role_id, active);

-- -----------------------------------------------------------------------------
-- Convert old applies_to_role rows into project-defined roles where possible.
-- This is intentionally data-driven: every distinct legacy role becomes a role
-- for that project. No role names are embedded in this migration.
-- -----------------------------------------------------------------------------
insert into public.project_training_roles (
  project_id,
  name,
  description,
  sort_order,
  active
)
select distinct
  ptr.project_id,
  trim(ptr.applies_to_role),
  'Migrated from the previous project Training role field.',
  100,
  true
from public.project_training_requirements ptr
where nullif(trim(coalesce(ptr.applies_to_role, '')), '') is not null
on conflict do nothing;

update public.project_training_requirements ptr
set project_role_id = role_row.id
from public.project_training_roles role_row
where ptr.project_role_id is null
  and nullif(trim(coalesce(ptr.applies_to_role, '')), '') is not null
  and role_row.project_id = ptr.project_id
  and lower(trim(role_row.name)) = lower(trim(ptr.applies_to_role));

-- Seed assignments for migrated roles from existing project populations and
-- employee role labels. This is only a migration aid; future assignments are
-- managed explicitly from Project Training Requirements.
insert into public.project_training_role_assignments (
  project_role_id,
  employee_id
)
select distinct
  ptr_role.id,
  e.id
from public.project_training_roles ptr_role
join public.employees e
  on lower(
       regexp_replace(
         replace(trim(coalesce(e.role, '')), '-', '_'),
         '\s+',
         '_',
         'g'
       )
     ) =
     lower(
       regexp_replace(
         replace(trim(ptr_role.name), '-', '_'),
         '\s+',
         '_',
         'g'
       )
     )
where coalesce(e.active, true) = true
  and (
    exists (
      select 1
      from public.project_training_people ptp
      where ptp.project_id = ptr_role.project_id
        and ptp.employee_id = e.id
        and ptp.included = true
    )
    or exists (
      select 1
      from public.project_access pa
      where pa.project_id = ptr_role.project_id
        and e.user_id is not null
        and pa.user_id = e.user_id
    )
  )
on conflict (project_role_id, employee_id) do nothing;

-- Once the mapping exists, project_role_id becomes the source of truth for
-- migrated rows. Keep the legacy column in the schema for backwards
-- compatibility, but clear it on rows successfully converted.
update public.project_training_requirements
set applies_to_role = null
where project_role_id is not null;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.project_training_roles enable row level security;
alter table public.project_training_role_assignments enable row level security;

drop policy if exists project_training_roles_read on public.project_training_roles;
create policy project_training_roles_read
on public.project_training_roles
for select
to authenticated
using (true);

drop policy if exists project_training_roles_manage on public.project_training_roles;
create policy project_training_roles_manage
on public.project_training_roles
for all
to authenticated
using (public.current_user_has_access('tt.training.manage'))
with check (public.current_user_has_access('tt.training.manage'));

drop policy if exists project_training_role_assignments_read
  on public.project_training_role_assignments;
create policy project_training_role_assignments_read
on public.project_training_role_assignments
for select
to authenticated
using (true);

drop policy if exists project_training_role_assignments_manage
  on public.project_training_role_assignments;
create policy project_training_role_assignments_manage
on public.project_training_role_assignments
for all
to authenticated
using (public.current_user_has_access('tt.training.manage'))
with check (public.current_user_has_access('tt.training.manage'));

commit;

notify pgrst, 'reload schema';

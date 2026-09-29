-- TTTracker V2
-- Migration 010: workspace + configurable projects + tower register foundation

-- -------------------------------------------------------------------
-- PROJECT FOUNDATION
-- -------------------------------------------------------------------

alter table public.v2_projects
  add column if not exists project_number text,
  add column if not exists description text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.v2_project_identifier_configs (
  organisation_id uuid primary key
    references public.organisations(id)
    on delete cascade,

  label text not null default 'Project number',

  mode text not null default 'manual'
    check (mode in ('manual', 'automatic', 'optional')),

  required boolean not null default false,
  require_unique boolean not null default true,

  prefix text,
  separator text not null default '-',
  padding integer not null default 3
    check (padding between 1 and 12),

  next_number bigint not null default 1
    check (next_number > 0),

  validation_regex text,
  help_text text,

  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.v2_project_field_definitions (
  id uuid primary key default gen_random_uuid(),

  organisation_id uuid not null
    references public.organisations(id)
    on delete cascade,

  field_key text not null,
  label text not null,

  field_type text not null
    check (
      field_type in (
        'text',
        'textarea',
        'number',
        'date',
        'select',
        'checkbox'
      )
    ),

  required boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,

  options jsonb not null default '[]'::jsonb,
  placeholder text,
  help_text text,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organisation_id, field_key)
);

create table if not exists public.v2_project_field_values (
  project_id uuid not null
    references public.v2_projects(id)
    on delete cascade,

  field_definition_id uuid not null
    references public.v2_project_field_definitions(id)
    on delete cascade,

  value jsonb not null default 'null'::jsonb,

  updated_at timestamptz not null default now(),

  primary key (project_id, field_definition_id)
);

-- -------------------------------------------------------------------
-- CONFIGURABLE NAVIGATION / MODULE SECTIONS
-- -------------------------------------------------------------------

create table if not exists public.v2_section_definitions (
  id uuid primary key default gen_random_uuid(),

  section_key text not null unique,
  scope text not null
    check (scope in ('workspace', 'project', 'tower')),

  label text not null,
  route_segment text,
  module_key text,

  icon_key text,
  sort_order integer not null default 100,

  implementation_status text not null default 'planned'
    check (implementation_status in ('ready', 'planned', 'disabled')),

  default_enabled boolean not null default false,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_organisation_section_settings (
  organisation_id uuid not null
    references public.organisations(id)
    on delete cascade,

  section_key text not null
    references public.v2_section_definitions(section_key)
    on update cascade
    on delete cascade,

  enabled boolean not null,

  label_override text,
  sort_order_override integer,

  metadata jsonb not null default '{}'::jsonb,

  primary key (organisation_id, section_key)
);

create table if not exists public.v2_project_section_settings (
  project_id uuid not null
    references public.v2_projects(id)
    on delete cascade,

  section_key text not null
    references public.v2_section_definitions(section_key)
    on update cascade
    on delete cascade,

  enabled boolean not null,

  label_override text,
  sort_order_override integer,

  metadata jsonb not null default '{}'::jsonb,

  primary key (project_id, section_key)
);

-- -------------------------------------------------------------------
-- TOWER FOUNDATION
-- -------------------------------------------------------------------

create table if not exists public.v2_tower_types (
  id uuid primary key default gen_random_uuid(),

  organisation_id uuid not null
    references public.organisations(id)
    on delete cascade,

  project_id uuid not null
    references public.v2_projects(id)
    on delete cascade,

  type_code text,
  name text not null,

  description text,

  is_active boolean not null default true,

  configuration jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (project_id, name)
);

create table if not exists public.v2_tower_field_definitions (
  id uuid primary key default gen_random_uuid(),

  organisation_id uuid not null
    references public.organisations(id)
    on delete cascade,

  project_id uuid not null
    references public.v2_projects(id)
    on delete cascade,

  field_key text not null,
  label text not null,

  field_type text not null
    check (
      field_type in (
        'text',
        'textarea',
        'number',
        'date',
        'select',
        'checkbox'
      )
    ),

  required boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,

  options jsonb not null default '[]'::jsonb,
  placeholder text,
  help_text text,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (project_id, field_key)
);

create table if not exists public.v2_towers (
  id uuid primary key default gen_random_uuid(),

  organisation_id uuid not null
    references public.organisations(id)
    on delete cascade,

  project_id uuid not null
    references public.v2_projects(id)
    on delete cascade,

  tower_identifier text not null,

  tower_type_id uuid
    references public.v2_tower_types(id)
    on delete set null,

  sequence_number integer,

  status text not null default 'not_started',

  description text,

  configuration jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (project_id, tower_identifier)
);

create table if not exists public.v2_tower_field_values (
  tower_id uuid not null
    references public.v2_towers(id)
    on delete cascade,

  field_definition_id uuid not null
    references public.v2_tower_field_definitions(id)
    on delete cascade,

  value jsonb not null default 'null'::jsonb,

  updated_at timestamptz not null default now(),

  primary key (tower_id, field_definition_id)
);

create index if not exists idx_v2_towers_project
  on public.v2_towers(project_id, sequence_number, tower_identifier);

create index if not exists idx_v2_tower_types_project
  on public.v2_tower_types(project_id, is_active);

create index if not exists idx_v2_project_field_defs_org
  on public.v2_project_field_definitions(
    organisation_id,
    is_active,
    sort_order
  );

create index if not exists idx_v2_tower_field_defs_project
  on public.v2_tower_field_definitions(
    project_id,
    is_active,
    sort_order
  );

-- -------------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------------

alter table public.v2_project_identifier_configs enable row level security;
alter table public.v2_project_field_definitions enable row level security;
alter table public.v2_project_field_values enable row level security;
alter table public.v2_section_definitions enable row level security;
alter table public.v2_organisation_section_settings enable row level security;
alter table public.v2_project_section_settings enable row level security;
alter table public.v2_tower_types enable row level security;
alter table public.v2_tower_field_definitions enable row level security;
alter table public.v2_towers enable row level security;
alter table public.v2_tower_field_values enable row level security;

-- Read-only authenticated policies. Writes remain server-side through service_role.

drop policy if exists "authenticated can read section definitions"
  on public.v2_section_definitions;

create policy "authenticated can read section definitions"
on public.v2_section_definitions
for select
to authenticated
using (true);

drop policy if exists "organisation members can read project identifier config"
  on public.v2_project_identifier_configs;

create policy "organisation members can read project identifier config"
on public.v2_project_identifier_configs
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v2_project_identifier_configs.organisation_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
);

drop policy if exists "organisation members can read project field definitions"
  on public.v2_project_field_definitions;

create policy "organisation members can read project field definitions"
on public.v2_project_field_definitions
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v2_project_field_definitions.organisation_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
);

drop policy if exists "organisation members can read project field values"
  on public.v2_project_field_values;

create policy "organisation members can read project field values"
on public.v2_project_field_values
for select
to authenticated
using (
  exists (
    select 1
    from public.v2_projects p
    join public.organisation_users ou
      on ou.organisation_id = p.organisation_id
    where p.id = v2_project_field_values.project_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
);

drop policy if exists "organisation members can read organisation section settings"
  on public.v2_organisation_section_settings;

create policy "organisation members can read organisation section settings"
on public.v2_organisation_section_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v2_organisation_section_settings.organisation_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
);

drop policy if exists "organisation members can read project section settings"
  on public.v2_project_section_settings;

create policy "organisation members can read project section settings"
on public.v2_project_section_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.v2_projects p
    join public.organisation_users ou
      on ou.organisation_id = p.organisation_id
    where p.id = v2_project_section_settings.project_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
);

drop policy if exists "organisation members can read tower types"
  on public.v2_tower_types;

create policy "organisation members can read tower types"
on public.v2_tower_types
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v2_tower_types.organisation_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
);

drop policy if exists "organisation members can read tower field definitions"
  on public.v2_tower_field_definitions;

create policy "organisation members can read tower field definitions"
on public.v2_tower_field_definitions
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v2_tower_field_definitions.organisation_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
);

drop policy if exists "organisation members can read towers"
  on public.v2_towers;

create policy "organisation members can read towers"
on public.v2_towers
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v2_towers.organisation_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
);

drop policy if exists "organisation members can read tower field values"
  on public.v2_tower_field_values;

create policy "organisation members can read tower field values"
on public.v2_tower_field_values
for select
to authenticated
using (
  exists (
    select 1
    from public.v2_towers t
    join public.organisation_users ou
      on ou.organisation_id = t.organisation_id
    where t.id = v2_tower_field_values.tower_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
);

grant usage on schema public to service_role;

grant all privileges on table public.v2_project_identifier_configs to service_role;
grant all privileges on table public.v2_project_field_definitions to service_role;
grant all privileges on table public.v2_project_field_values to service_role;
grant all privileges on table public.v2_section_definitions to service_role;
grant all privileges on table public.v2_organisation_section_settings to service_role;
grant all privileges on table public.v2_project_section_settings to service_role;
grant all privileges on table public.v2_tower_types to service_role;
grant all privileges on table public.v2_tower_field_definitions to service_role;
grant all privileges on table public.v2_towers to service_role;
grant all privileges on table public.v2_tower_field_values to service_role;

-- -------------------------------------------------------------------
-- UPDATED_AT TRIGGER
-- -------------------------------------------------------------------

create or replace function private.tttracker_v2_touch_updated_at()
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

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'v2_project_identifier_configs',
    'v2_project_field_definitions',
    'v2_project_field_values',
    'v2_section_definitions',
    'v2_tower_types',
    'v2_tower_field_definitions',
    'v2_towers',
    'v2_tower_field_values'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'trg_' || tbl || '_updated_at',
      tbl
    );

    execute format(
      'create trigger %I before update on public.%I for each row execute function private.tttracker_v2_touch_updated_at()',
      'trg_' || tbl || '_updated_at',
      tbl
    );
  end loop;
end;
$$;

-- -------------------------------------------------------------------
-- INITIAL SECTION REGISTRY
-- -------------------------------------------------------------------

insert into public.v2_section_definitions (
  section_key,
  scope,
  label,
  route_segment,
  module_key,
  icon_key,
  sort_order,
  implementation_status,
  default_enabled
)
values
  ('workspace_home', 'workspace', 'Home', '', null, 'home', 10, 'ready', true),
  ('workspace_projects', 'workspace', 'Projects', 'projects', 'projects', 'folder', 20, 'ready', true),
  ('workspace_people', 'workspace', 'People', 'people', 'people', 'users', 30, 'planned', false),
  ('workspace_settings', 'workspace', 'Settings', 'settings', null, 'settings', 100, 'ready', true),

  ('project_overview', 'project', 'Overview', '', null, 'overview', 10, 'ready', true),
  ('project_towers', 'project', 'Towers', 'towers', 'structures', 'tower', 20, 'ready', true),
  ('project_materials', 'project', 'Materials', 'materials', 'materials', 'materials', 30, 'planned', true),
  ('project_deliveries', 'project', 'Deliveries', 'deliveries', 'materials', 'truck', 40, 'planned', true),
  ('project_daily_dockets', 'project', 'Daily Dockets', 'daily-dockets', 'daily_dockets', 'docket', 50, 'planned', true),
  ('project_defects', 'project', 'Defects', 'defects', 'quality', 'defect', 60, 'planned', true),
  ('project_rectification', 'project', 'Rectification', 'rectification', 'quality', 'rectification', 70, 'planned', true),

  ('tower_overview', 'tower', 'Overview', '', null, 'overview', 10, 'ready', true),
  ('tower_progress', 'tower', 'Progress', 'progress', 'progress', 'progress', 20, 'planned', true),
  ('tower_materials', 'tower', 'Materials', 'materials', 'materials', 'materials', 30, 'planned', true),
  ('tower_deliveries', 'tower', 'Deliveries', 'deliveries', 'materials', 'truck', 40, 'planned', true),
  ('tower_daily_dockets', 'tower', 'Daily Dockets', 'daily-dockets', 'daily_dockets', 'docket', 50, 'planned', true),
  ('tower_defects', 'tower', 'Defects', 'defects', 'quality', 'defect', 60, 'planned', true),
  ('tower_rectification', 'tower', 'Rectification', 'rectification', 'quality', 'rectification', 70, 'planned', true),
  ('tower_documents', 'tower', 'Documents', 'documents', 'documents', 'document', 80, 'planned', false),
  ('tower_photos', 'tower', 'Photos', 'photos', 'documents', 'photo', 90, 'planned', false),
  ('tower_workpack', 'tower', 'Workpack', 'workpack', 'documents', 'workpack', 100, 'planned', false),
  ('tower_lift_studies', 'tower', 'Lift Studies', 'lift-studies', 'documents', 'crane', 110, 'planned', false)
on conflict (section_key) do update
set
  scope = excluded.scope,
  label = excluded.label,
  route_segment = excluded.route_segment,
  module_key = excluded.module_key,
  icon_key = excluded.icon_key,
  sort_order = excluded.sort_order,
  implementation_status = excluded.implementation_status,
  default_enabled = excluded.default_enabled;

-- Every existing org receives a configurable project-number policy.
insert into public.v2_project_identifier_configs (
  organisation_id,
  label,
  mode,
  required,
  require_unique
)
select
  o.id,
  'Project number',
  'manual',
  false,
  true
from public.organisations o
on conflict (organisation_id) do nothing;

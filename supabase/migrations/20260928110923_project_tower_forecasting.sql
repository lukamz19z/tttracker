-- TTTracker V2
-- Migration 011
-- V1-inspired project/tower UX + configurable tower imports + forecasting foundation.
-- No company names, role names, project-number formats or CSV layouts are hard-coded.

begin;

-- ================================================================
-- PROJECT DETAILS
-- ================================================================

alter table public.v2_projects
  add column if not exists client_name text,
  add column if not exists client_code text,
  add column if not exists location text,
  add column if not exists expected_tower_count integer,
  add column if not exists project_year integer,
  add column if not exists forecast_settings jsonb not null default '{}'::jsonb;

alter table public.v2_project_identifier_configs
  add column if not exists template text not null default 'P-{CLIENT}-{YY}-{SEQ:3}',
  add column if not exists show_preview boolean not null default true;

create table if not exists public.v2_project_status_definitions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  status_key text not null,
  label text not null,
  sort_order integer not null default 100,
  colour_key text not null default 'slate',
  is_active boolean not null default true,
  is_terminal boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, status_key)
);

-- ================================================================
-- TOWER CORE
-- ================================================================

alter table public.v2_towers
  add column if not exists line text,
  add column if not exists tower_weight_t numeric,
  add column if not exists assembly_percent numeric not null default 0,
  add column if not exists erection_percent numeric not null default 0,
  add column if not exists extra_data jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'v2_towers_assembly_percent_check'
      and conrelid = 'public.v2_towers'::regclass
  ) then
    alter table public.v2_towers
      add constraint v2_towers_assembly_percent_check
      check (assembly_percent between 0 and 100);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'v2_towers_erection_percent_check'
      and conrelid = 'public.v2_towers'::regclass
  ) then
    alter table public.v2_towers
      add constraint v2_towers_erection_percent_check
      check (erection_percent between 0 and 100);
  end if;
end
$$;

-- ================================================================
-- TOWER CSV IMPORT CONFIG
-- ================================================================

create table if not exists public.v2_tower_import_field_definitions (
  id uuid primary key default gen_random_uuid(),

  organisation_id uuid references public.organisations(id) on delete cascade,

  field_key text not null,
  label text not null,

  target_kind text not null
    check (target_kind in ('core', 'extra_data', 'ignore')),

  target_key text not null,

  aliases jsonb not null default '[]'::jsonb,

  required boolean not null default false,

  data_type text not null default 'text'
    check (data_type in ('text', 'number', 'integer', 'boolean')),

  sort_order integer not null default 100,

  is_active boolean not null default true,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists v2_tower_import_fields_platform_uidx
on public.v2_tower_import_field_definitions(field_key)
where organisation_id is null;

create unique index if not exists v2_tower_import_fields_org_uidx
on public.v2_tower_import_field_definitions(organisation_id, field_key)
where organisation_id is not null;

create table if not exists public.v2_tower_import_batches (
  id uuid primary key default gen_random_uuid(),

  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,

  source_file_name text,

  source_headers jsonb not null default '[]'::jsonb,
  mapping jsonb not null default '{}'::jsonb,

  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  error_rows integer not null default 0,

  status text not null default 'processing'
    check (status in ('processing', 'completed', 'completed_with_errors', 'failed')),

  errors jsonb not null default '[]'::jsonb,

  imported_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists v2_tower_import_batches_project_idx
  on public.v2_tower_import_batches(project_id, created_at desc);

-- Platform defaults. Organisations can override aliases and behaviour with
-- organisation-scoped rows using the same field_key.
insert into public.v2_tower_import_field_definitions (
  organisation_id,
  field_key,
  label,
  target_kind,
  target_key,
  aliases,
  required,
  data_type,
  sort_order
)
values
  (
    null,
    'tower_identifier',
    'Tower',
    'core',
    'tower_identifier',
    '["tower","tower no","tower number","tower_number","tower_no","structure","structure no","structure number","structure_number","name"]'::jsonb,
    true,
    'text',
    10
  ),
  (
    null,
    'tower_type',
    'Tower Type',
    'core',
    'tower_type',
    '["tower type","tower_type","structure type","structure_type","type","tower model","tower_model"]'::jsonb,
    false,
    'text',
    20
  ),
  (
    null,
    'line',
    'Line',
    'core',
    'line',
    '["line","circuit","circuit line","transmission line"]'::jsonb,
    false,
    'text',
    30
  ),
  (
    null,
    'sequence_number',
    'Sequence',
    'core',
    'sequence_number',
    '["sequence","sequence number","seq","order"]'::jsonb,
    false,
    'integer',
    40
  ),
  (
    null,
    'tower_weight_t',
    'Tower Weight (t)',
    'core',
    'tower_weight_t',
    '["tower weight","tower weight (t)","tower_weight","structure total weight","structure total weights","weight","mass"]'::jsonb,
    false,
    'number',
    50
  ),
  (
    null,
    'body_extension',
    'Body Extension',
    'extra_data',
    'body_extension',
    '["body extension","body_extension","body ext","extension"]'::jsonb,
    false,
    'text',
    60
  ),
  (
    null,
    'leg_a',
    'Leg A',
    'extra_data',
    'leg_a',
    '["leg a","leg_a","a leg","leg 1","leg1"]'::jsonb,
    false,
    'text',
    70
  ),
  (
    null,
    'leg_b',
    'Leg B',
    'extra_data',
    'leg_b',
    '["leg b","leg_b","b leg","leg 2","leg2"]'::jsonb,
    false,
    'text',
    80
  ),
  (
    null,
    'leg_c',
    'Leg C',
    'extra_data',
    'leg_c',
    '["leg c","leg_c","c leg","leg 3","leg3"]'::jsonb,
    false,
    'text',
    90
  ),
  (
    null,
    'leg_d',
    'Leg D',
    'extra_data',
    'leg_d',
    '["leg d","leg_d","d leg","leg 4","leg4"]'::jsonb,
    false,
    'text',
    100
  )
on conflict do nothing;

-- ================================================================
-- FORECASTING / PERFORMANCE FOUNDATION
-- ================================================================

-- Normalised production facts.
--
-- Daily dockets, mobile updates or future integrations can write/upsert into
-- this table. Forecasting reads one stable analytics contract instead of
-- becoming permanently coupled to a particular docket schema.
create table if not exists public.v2_project_production_actuals (
  id uuid primary key default gen_random_uuid(),

  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  tower_id uuid references public.v2_towers(id) on delete cascade,

  actual_date date not null,

  crew_key text,
  crew_label text,

  source_type text not null default 'manual',
  source_id uuid,

  assembly_percent numeric,
  erection_percent numeric,
  overall_progress_percent numeric,

  progress_delta_percent numeric,
  production_tonnes numeric,

  raw_hours numeric not null default 0,
  production_hours numeric not null default 0,
  delay_hours numeric not null default 0,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists v2_project_production_actuals_project_date_idx
  on public.v2_project_production_actuals(project_id, actual_date);

create index if not exists v2_project_production_actuals_crew_idx
  on public.v2_project_production_actuals(project_id, crew_key, actual_date);

create unique index if not exists v2_project_production_actuals_source_uidx
  on public.v2_project_production_actuals(project_id, source_type, source_id)
  where source_id is not null;


create table if not exists public.v2_project_forecast_benchmarks (
  id uuid primary key default gen_random_uuid(),

  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,

  benchmark_key text not null,
  label text not null,

  benchmark_type text not null
    check (
      benchmark_type in (
        'project_average',
        'recent_project',
        'tower_type',
        'crew',
        'custom'
      )
    ),

  crew_key text,
  tower_type_key text,

  lookback_days integer,
  minimum_dockets integer not null default 1,
  minimum_towers integer not null default 1,

  raw_mh_per_tonne numeric,
  production_mh_per_tonne numeric,
  daily_raw_hours numeric,
  tonnes_per_hour numeric,

  is_active boolean not null default true,

  settings jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (project_id, benchmark_key)
);

create table if not exists public.v2_project_forecast_snapshots (
  id uuid primary key default gen_random_uuid(),

  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,

  snapshot_date date not null default current_date,

  benchmark_key text,

  remaining_towers integer,
  remaining_tonnes numeric,

  forecast_raw_hours numeric,
  forecast_production_hours numeric,
  forecast_days numeric,
  forecast_finish_date date,

  confidence text
    check (confidence in ('high', 'medium', 'low')),

  inputs jsonb not null default '{}'::jsonb,
  results jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists v2_project_forecast_snapshots_project_idx
  on public.v2_project_forecast_snapshots(project_id, snapshot_date desc);

-- ================================================================
-- SECTION REGISTRY
-- ================================================================

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
  (
    'project_forecasting',
    'project',
    'Forecasting',
    'forecasting',
    'progress',
    'chart',
    25,
    'ready',
    true
  )
on conflict (section_key) do update
set
  label = excluded.label,
  route_segment = excluded.route_segment,
  module_key = excluded.module_key,
  icon_key = excluded.icon_key,
  sort_order = excluded.sort_order,
  implementation_status = excluded.implementation_status,
  default_enabled = excluded.default_enabled;

-- ================================================================
-- RLS
-- ================================================================

alter table public.v2_project_status_definitions enable row level security;
alter table public.v2_tower_import_field_definitions enable row level security;
alter table public.v2_tower_import_batches enable row level security;
alter table public.v2_project_production_actuals enable row level security;
alter table public.v2_project_forecast_benchmarks enable row level security;
alter table public.v2_project_forecast_snapshots enable row level security;

drop policy if exists "members read project status definitions"
on public.v2_project_status_definitions;

create policy "members read project status definitions"
on public.v2_project_status_definitions
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v2_project_status_definitions.organisation_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
);

drop policy if exists "members read tower import fields"
on public.v2_tower_import_field_definitions;

create policy "members read tower import fields"
on public.v2_tower_import_field_definitions
for select
to authenticated
using (
  organisation_id is null
  or exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v2_tower_import_field_definitions.organisation_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
);

drop policy if exists "members read tower import batches"
on public.v2_tower_import_batches;

create policy "members read tower import batches"
on public.v2_tower_import_batches
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v2_tower_import_batches.organisation_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
);

drop policy if exists "members read production actuals"
on public.v2_project_production_actuals;

create policy "members read production actuals"
on public.v2_project_production_actuals
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v2_project_production_actuals.organisation_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
);

drop policy if exists "members read forecast benchmarks"
on public.v2_project_forecast_benchmarks;

create policy "members read forecast benchmarks"
on public.v2_project_forecast_benchmarks
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v2_project_forecast_benchmarks.organisation_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
);

drop policy if exists "members read forecast snapshots"
on public.v2_project_forecast_snapshots;

create policy "members read forecast snapshots"
on public.v2_project_forecast_snapshots
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v2_project_forecast_snapshots.organisation_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
);

grant usage on schema public to service_role;
grant all privileges on table public.v2_project_status_definitions to service_role;
grant all privileges on table public.v2_tower_import_field_definitions to service_role;
grant all privileges on table public.v2_tower_import_batches to service_role;
grant all privileges on table public.v2_project_production_actuals to service_role;
grant all privileges on table public.v2_project_forecast_benchmarks to service_role;
grant all privileges on table public.v2_project_forecast_snapshots to service_role;

commit;

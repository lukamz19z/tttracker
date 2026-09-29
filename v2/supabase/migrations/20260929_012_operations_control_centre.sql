-- TTTracker V2
-- Migration 012: configurable progress, Daily Dockets, Materials Control Centre,
-- project Defects, project-wide docket lookup and operational configuration.

begin;

-- Migration 011 initially keyed production actuals at docket level. A Daily
-- Docket can legitimately allocate production across multiple towers, so the
-- analytics contract must be tower-aware.
drop index if exists public.v2_project_production_actuals_source_uidx;
create unique index if not exists v2_project_production_actuals_source_tower_uidx
  on public.v2_project_production_actuals(project_id, source_type, source_id, tower_id)
  where source_id is not null and tower_id is not null;


create table if not exists public.v2_people (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  employee_number text,
  display_name text not null,
  email text,
  phone text,
  employment_status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists v2_people_org_employee_number_uidx
  on public.v2_people(organisation_id, employee_number)
  where employee_number is not null;
create unique index if not exists v2_people_org_auth_user_uidx
  on public.v2_people(organisation_id, auth_user_id)
  where auth_user_id is not null;
create index if not exists v2_people_org_name_idx
  on public.v2_people(organisation_id, display_name);

insert into public.v2_people (
  organisation_id,
  auth_user_id,
  display_name,
  email,
  employment_status,
  metadata
)
select
  ou.organisation_id,
  ou.user_id,
  coalesce(
    nullif(trim(au.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(au.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(au.raw_user_meta_data->>'name'), ''),
    split_part(coalesce(au.email, 'User'), '@', 1)
  ),
  au.email,
  'active',
  jsonb_build_object('source', 'organisation_membership')
from public.organisation_users ou
join auth.users au on au.id = ou.user_id
where ou.status = 'active'
on conflict (organisation_id, auth_user_id) do update
set
  email = excluded.email,
  display_name = excluded.display_name,
  employment_status = 'active';

create table if not exists public.v2_project_progress_profiles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  name text not null default 'Project Progress',
  is_active boolean not null default true,
  assembly_share numeric not null default 50 check (assembly_share between 0 and 100),
  erection_share numeric not null default 50 check (erection_share between 0 and 100),
  normalize_applicable_weights boolean not null default true,
  mh_t_basis text not null default 'progress_earned_tonnes'
    check (mh_t_basis in ('progress_earned_tonnes','manual_tonnes')),
  requires_review boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id)
);

create table if not exists public.v2_progress_stage_definitions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  progress_profile_id uuid not null references public.v2_project_progress_profiles(id) on delete cascade,
  stage_key text not null,
  label text not null,
  phase text not null check (phase in ('assembly','erection')),
  weight numeric not null default 1 check (weight >= 0),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  default_applicable boolean not null default true,
  applicability_rules jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, stage_key, phase)
);

create table if not exists public.v2_tower_progress_stage_state (
  tower_id uuid not null references public.v2_towers(id) on delete cascade,
  stage_definition_id uuid not null references public.v2_progress_stage_definitions(id) on delete cascade,
  is_applicable boolean not null default true,
  percent_complete numeric not null default 0 check (percent_complete between 0 and 100),
  updated_from_type text,
  updated_from_id uuid,
  updated_at timestamptz not null default now(),
  primary key (tower_id, stage_definition_id)
);

create table if not exists public.v2_project_option_definitions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  option_group text not null,
  option_key text not null,
  label text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, option_group, option_key)
);

create table if not exists public.v2_daily_dockets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  primary_tower_id uuid references public.v2_towers(id) on delete set null,
  docket_date date not null,
  crew_label text,
  leading_hand_person_id uuid references public.v2_people(id) on delete set null,
  leading_hand_name text,
  weather_key text,
  rate_type text,
  prestart_minutes numeric not null default 0,
  lunch_minutes numeric not null default 0,
  travel_in_minutes numeric not null default 0,
  travel_out_minutes numeric not null default 0,
  raw_manhours numeric not null default 0,
  production_manhours numeric not null default 0,
  manual_production_tonnes numeric,
  daily_site_summary text,
  rfi_references text,
  incident_occurred boolean not null default false,
  incident_type_key text,
  incident_notes text,
  approval_status text not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists v2_daily_dockets_project_date_idx
  on public.v2_daily_dockets(project_id, docket_date desc);

create table if not exists public.v2_docket_labour (
  id uuid primary key default gen_random_uuid(),
  docket_id uuid not null references public.v2_daily_dockets(id) on delete cascade,
  person_id uuid references public.v2_people(id) on delete set null,
  worker_name text not null,
  time_in time,
  time_out time,
  raw_hours numeric not null default 0,
  prestart_minutes numeric not null default 0,
  lunch_minutes numeric not null default 0,
  travel_in_minutes numeric not null default 0,
  travel_out_minutes numeric not null default 0,
  mobilisation_hours numeric not null default 0,
  delay_hours numeric not null default 0,
  production_hours numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_docket_delays (
  id uuid primary key default gen_random_uuid(),
  docket_id uuid not null references public.v2_daily_dockets(id) on delete cascade,
  delay_key text not null,
  delay_label text not null,
  delay_hours numeric not null default 0,
  applies_to text not null default 'entire_crew'
    check (applies_to in ('entire_crew','selected_workers')),
  person_ids jsonb not null default '[]'::jsonb,
  worker_names jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.v2_docket_plant (
  id uuid primary key default gen_random_uuid(),
  docket_id uuid not null references public.v2_daily_dockets(id) on delete cascade,
  asset_id uuid,
  plant_name text not null,
  plant_type text,
  asset_number text,
  time_in time,
  time_out time,
  total_hours numeric not null default 0,
  delay_hours numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_project_docket_review_settings (
  project_id uuid primary key references public.v2_projects(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  internal_review_required boolean not null default true,
  client_approval_enabled boolean not null default false,
  client_approval_required boolean not null default false,
  client_can_view_raw_mh boolean not null default true,
  client_can_view_production_mh boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_project_docket_reviewers (
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  review_stage text not null check (review_stage in ('internal','client')),
  receives_email boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(project_id,user_id,review_stage)
);

create table if not exists public.v2_docket_tower_allocations (
  id uuid primary key default gen_random_uuid(),
  docket_id uuid not null references public.v2_daily_dockets(id) on delete cascade,
  tower_id uuid not null references public.v2_towers(id) on delete cascade,
  raw_hours numeric not null default 0,
  production_hours numeric not null default 0,
  progress_before numeric not null default 0,
  progress_after numeric not null default 0,
  progress_delta numeric not null default 0,
  earned_tonnes numeric not null default 0,
  assembly_before numeric not null default 0,
  assembly_after numeric not null default 0,
  erection_before numeric not null default 0,
  erection_after numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(docket_id,tower_id)
);

create table if not exists public.v2_docket_stage_progress (
  id uuid primary key default gen_random_uuid(),
  docket_id uuid not null references public.v2_daily_dockets(id) on delete cascade,
  tower_id uuid not null references public.v2_towers(id) on delete cascade,
  stage_definition_id uuid not null references public.v2_progress_stage_definitions(id) on delete cascade,
  is_applicable boolean not null default true,
  percent_before numeric not null default 0,
  percent_after numeric not null default 0,
  created_at timestamptz not null default now(),
  unique(docket_id,tower_id,stage_definition_id)
);

create table if not exists public.v2_material_register (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  tower_id uuid references public.v2_towers(id) on delete cascade,
  material_kind text not null default 'member',
  item_reference text not null,
  description text,
  bundle_reference text,
  segment text,
  drawing_reference text,
  required_quantity numeric,
  received_quantity numeric not null default 0,
  unit text not null default 'ea',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists v2_material_register_project_search_idx
  on public.v2_material_register(project_id,item_reference);
create index if not exists v2_material_register_tower_idx
  on public.v2_material_register(tower_id);

create table if not exists public.v2_material_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  tower_id uuid references public.v2_towers(id) on delete set null,
  docket_id uuid references public.v2_daily_dockets(id) on delete set null,
  material_item_id uuid references public.v2_material_register(id) on delete set null,
  event_type text not null,
  item_reference text,
  description text,
  quantity numeric not null default 1,
  unit text not null default 'ea',
  status text not null default 'open',
  source_tower_id uuid references public.v2_towers(id) on delete set null,
  destination_tower_id uuid references public.v2_towers(id) on delete set null,
  notes text,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists v2_material_events_project_idx
  on public.v2_material_events(project_id,event_type,status);

create table if not exists public.v2_defects (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  tower_id uuid references public.v2_towers(id) on delete set null,
  source_docket_id uuid references public.v2_daily_dockets(id) on delete set null,
  defect_number text,
  defect_type_key text,
  title text not null,
  description text,
  status text not null default 'open',
  priority text,
  raised_by_person_id uuid references public.v2_people(id) on delete set null,
  assigned_to_person_id uuid references public.v2_people(id) on delete set null,
  raised_at timestamptz not null default now(),
  due_date date,
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists v2_defects_project_idx
  on public.v2_defects(project_id,status,raised_at desc);

insert into public.v2_section_definitions (
  section_key,scope,label,route_segment,module_key,icon_key,sort_order,
  implementation_status,default_enabled
)
values
  ('project_materials','project','Materials Control','materials','materials','materials',30,'ready',true),
  ('project_daily_dockets','project','Daily Dockets','daily-dockets','daily_dockets','docket',40,'ready',true),
  ('project_defects','project','Defects','defects','quality','defect',50,'ready',true),
  ('project_configuration','project','Configuration','configuration',null,'settings',100,'ready',true)
on conflict (section_key) do update
set label=excluded.label, route_segment=excluded.route_segment, module_key=excluded.module_key,
    icon_key=excluded.icon_key, sort_order=excluded.sort_order,
    implementation_status=excluded.implementation_status,
    default_enabled=excluded.default_enabled;

insert into public.v2_project_docket_review_settings (
  project_id, organisation_id
)
select p.id, p.organisation_id
from public.v2_projects p
on conflict (project_id) do nothing;

insert into public.v2_project_progress_profiles (
  organisation_id,project_id,name,assembly_share,erection_share,
  normalize_applicable_weights,mh_t_basis,requires_review
)
select p.organisation_id,p.id,'Project Progress',50,50,true,'progress_earned_tonnes',true
from public.v2_projects p
on conflict (project_id) do nothing;

-- Editable legacy-compatible starting point. Projects should review weights.
insert into public.v2_progress_stage_definitions (
  organisation_id,project_id,progress_profile_id,stage_key,label,phase,weight,sort_order
)
select p.organisation_id,p.id,pp.id,x.stage_key,x.label,phase.phase,x.weight,x.sort_order
from public.v2_projects p
join public.v2_project_progress_profiles pp on pp.project_id=p.id
cross join (values ('assembly'),('erection')) as phase(phase)
cross join (
  values
    ('LE','Leg Extensions',20::numeric,10),
    ('BE','Body Extension',15::numeric,20),
    ('CB','Common Body',15::numeric,30),
    ('BSS','Bottom Superstructure',10::numeric,40),
    ('MSS','Middle Superstructure',10::numeric,50),
    ('TSS','Top Superstructure',10::numeric,60),
    ('BX_ARMS','Bottom Cross Arms',5::numeric,70),
    ('MX_ARMS','Middle Cross Arms',5::numeric,80),
    ('TX_ARMS','Top Cross Arms',5::numeric,90),
    ('EP','Earth Peaks / Peaks',5::numeric,100)
) as x(stage_key,label,weight,sort_order)
on conflict (project_id,stage_key,phase) do nothing;

insert into public.v2_project_option_definitions (
  organisation_id,project_id,option_group,option_key,label,sort_order
)
select p.organisation_id,p.id,x.option_group,x.option_key,x.label,x.sort_order
from public.v2_projects p
cross join (
  values
    ('delay_type','weather','Weather',10),
    ('delay_type','lightning','Lightning',20),
    ('delay_type','access','Access',30),
    ('delay_type','plant','Plant',40),
    ('delay_type','materials','Materials',50),
    ('delay_type','toolbox','Toolbox / Safety',60),
    ('delay_type','other','Other',100),
    ('material_event_type','missing','Missing',10),
    ('material_event_type','received','Found / Received',20),
    ('material_event_type','excess','Excess',30),
    ('material_event_type','taken_from_another_tower','Taken from another tower',40),
    ('material_event_type','sent_to_another_tower','Sent to another tower',50),
    ('material_event_type','damaged','Damaged',60),
    ('material_event_type','incorrect','Incorrect',70),
    ('weather','fine','Fine',10),
    ('weather','overcast','Overcast',20),
    ('weather','rain','Rain',30),
    ('weather','storm','Storm',40),
    ('rate_type','tonnage_rate','Tonnage Rate',10),
    ('rate_type','schedule_of_rates','Schedule of Rates',20),
    ('incident_type','injury','Injury',10),
    ('incident_type','near_miss','Near Miss',20),
    ('incident_type','environmental','Environmental',30),
    ('incident_type','property_damage','Property Damage',40),
    ('incident_type','other','Other',100),
    ('material_outcome','no_impact','No impact to planned work',10),
    ('material_outcome','partial_impact','Partial impact',20),
    ('material_outcome','work_stopped','Work stopped',30),
    ('material_unit','ea','Each',10),
    ('material_unit','set','Set',20),
    ('material_unit','kg','Kilogram',30),
    ('material_unit','m','Metre',40)
) as x(option_group,option_key,label,sort_order)
on conflict (project_id,option_group,option_key) do nothing;

alter table public.v2_people enable row level security;
alter table public.v2_project_progress_profiles enable row level security;
alter table public.v2_progress_stage_definitions enable row level security;
alter table public.v2_tower_progress_stage_state enable row level security;
alter table public.v2_project_option_definitions enable row level security;
alter table public.v2_daily_dockets enable row level security;
alter table public.v2_docket_labour enable row level security;
alter table public.v2_docket_delays enable row level security;
alter table public.v2_docket_plant enable row level security;
alter table public.v2_project_docket_review_settings enable row level security;
alter table public.v2_project_docket_reviewers enable row level security;
alter table public.v2_docket_tower_allocations enable row level security;
alter table public.v2_docket_stage_progress enable row level security;
alter table public.v2_material_register enable row level security;
alter table public.v2_material_events enable row level security;
alter table public.v2_defects enable row level security;

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

commit;

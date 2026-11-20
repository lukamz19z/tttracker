-- V1 Lift Engineering: reusable technical library and project-scoped study snapshots.
begin;

create table if not exists public.lift_crane_profiles (
  id uuid primary key default gen_random_uuid(), name text not null, manufacturer text,
  model text, notes text, active boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.lift_crane_profile_revisions (
  id uuid primary key default gen_random_uuid(), crane_profile_id uuid not null references public.lift_crane_profiles(id) on delete cascade,
  revision text not null, status text not null default 'draft', source_document jsonb not null default '[]'::jsonb,
  technical_data jsonb not null default '{}'::jsonb, coordinate_convention text not null default 'Crane plan view; origin is declared slew-centre coordinates; x longitudinal, y transverse.',
  carrier_mass_kg numeric, carrier_cg_x_m numeric, carrier_cg_y_m numeric, upperworks_mass_kg numeric,
  upperworks_cg_x_m numeric, upperworks_cg_y_m numeric, boom_pivot_x_m numeric, boom_pivot_y_m numeric,
  counterweight_mass_kg numeric, counterweight_cg_x_m numeric, counterweight_cg_y_m numeric,
  created_by uuid, created_at timestamptz not null default now(), unique(crane_profile_id,revision)
);
create table if not exists public.lift_crane_outriggers (
  id uuid primary key default gen_random_uuid(), crane_profile_revision_id uuid not null references public.lift_crane_profile_revisions(id) on delete cascade,
  support_key text not null check (support_key in ('OR1','OR2','OR3','OR4','SLEW_CENTRE')),
  x_m numeric not null, y_m numeric not null, unique(crane_profile_revision_id,support_key)
);
create table if not exists public.lift_crane_hooks (
  id uuid primary key default gen_random_uuid(), crane_profile_revision_id uuid not null references public.lift_crane_profile_revisions(id) on delete cascade,
  name text not null, mass_kg numeric not null check(mass_kg >= 0), hook_type text, source_document jsonb not null default '{}'::jsonb
);
create table if not exists public.lift_crane_ropes (
  id uuid primary key default gen_random_uuid(), crane_profile_revision_id uuid not null references public.lift_crane_profile_revisions(id) on delete cascade,
  name text not null, mass_kg numeric not null check(mass_kg >= 0), rope_type text, source_document jsonb not null default '{}'::jsonb
);
create table if not exists public.lift_crane_attachments (
  id uuid primary key default gen_random_uuid(), crane_profile_revision_id uuid not null references public.lift_crane_profile_revisions(id) on delete cascade,
  name text not null, mass_kg numeric not null check(mass_kg >= 0), x_m numeric, y_m numeric, source_document jsonb not null default '{}'::jsonb
);
create table if not exists public.lift_crane_configurations (
  id uuid primary key default gen_random_uuid(), crane_profile_id uuid not null references public.lift_crane_profiles(id) on delete cascade,
  name text not null, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.lift_crane_configuration_revisions (
  id uuid primary key default gen_random_uuid(), configuration_id uuid not null references public.lift_crane_configurations(id) on delete cascade,
  revision text not null, status text not null default 'draft', data jsonb not null default '{}'::jsonb,
  counterweight_t numeric, outrigger_state text, boom_configuration text, boom_length_m numeric, fly_jib text,
  counterweight_cg_x_m numeric, counterweight_cg_y_m numeric, boom_mass_kg numeric, boom_cg_x_m numeric, boom_cg_y_m numeric,
  fly_jib_mass_kg numeric, fly_jib_cg_x_m numeric, fly_jib_cg_y_m numeric,
  wind_restriction text, source_document jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(),
  unique(configuration_id,revision)
);

create table if not exists public.lift_rigging_items (
  id uuid primary key default gen_random_uuid(), description text not null, category text,
  manufacturer text, model text, notes text, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.lift_rigging_item_revisions (
  id uuid primary key default gen_random_uuid(), rigging_item_id uuid not null references public.lift_rigging_items(id) on delete cascade,
  revision text not null, status text not null default 'draft', mass_kg numeric not null check(mass_kg >= 0),
  wll_t numeric, source_document jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), unique(rigging_item_id,revision)
);
create table if not exists public.lift_rigging_arrangements (
  id uuid primary key default gen_random_uuid(), name text not null, description text, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.lift_rigging_arrangement_items (
  id uuid primary key default gen_random_uuid(), arrangement_id uuid not null references public.lift_rigging_arrangements(id) on delete cascade,
  rigging_item_revision_id uuid not null references public.lift_rigging_item_revisions(id), quantity numeric not null check(quantity > 0),
  mass_override_kg numeric check(mass_override_kg >= 0), override_reason text
);

create table if not exists public.lift_load_charts (
  id uuid primary key default gen_random_uuid(), crane_profile_id uuid not null references public.lift_crane_profiles(id),
  configuration_revision_id uuid references public.lift_crane_configuration_revisions(id), name text not null,
  revision text not null, counterweight_t numeric, outrigger_state text, slew_sector text, boom_configuration text,
  boom_length_m numeric, boom_sequence text, fly_jib text, wind_restriction text,
  source_document jsonb not null default '{}'::jsonb, notes text, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.lift_load_chart_points (
  id uuid primary key default gen_random_uuid(), load_chart_id uuid not null references public.lift_load_charts(id) on delete cascade,
  configuration_key text not null, radius_m numeric not null check(radius_m >= 0), rated_capacity_t numeric not null check(rated_capacity_t >= 0),
  source_page text, unique(load_chart_id,configuration_key,radius_m)
);

create table if not exists public.lift_tower_templates (
  id uuid primary key default gen_random_uuid(), name text not null, structure_type text, description text,
  active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.lift_tower_template_revisions (
  id uuid primary key default gen_random_uuid(), template_id uuid not null references public.lift_tower_templates(id) on delete cascade,
  revision text not null, status text not null default 'draft', source_documents jsonb not null default '[]'::jsonb,
  notes text, created_at timestamptz not null default now(), unique(template_id,revision)
);
create table if not exists public.lift_template_lifts (
  id uuid primary key default gen_random_uuid(), template_revision_id uuid not null references public.lift_tower_template_revisions(id) on delete cascade,
  lift_number text not null, sequence_no integer not null, description text not null, lift_type text not null,
  dimensions jsonb not null default '{}'::jsonb, installed_height_m numeric, boom_configuration text,
  boom_length_m numeric, boom_sequence text, default_radius_m numeric, maximum_radius_m numeric,
  effective_load_factor numeric not null default 1 check(effective_load_factor >= 0), default_rigging_arrangement_id uuid references public.lift_rigging_arrangements(id),
  hook_nomination text, notes text, drawing_references jsonb not null default '[]'::jsonb, unique(template_revision_id,lift_number)
);
create table if not exists public.lift_template_lift_elements (
  id uuid primary key default gen_random_uuid(), template_lift_id uuid not null references public.lift_template_lifts(id) on delete cascade,
  description text not null, mass_kg numeric not null check(mass_kg >= 0), dimensions jsonb not null default '{}'::jsonb, sequence_no integer not null default 1
);
create table if not exists public.lift_template_lift_phases (
  id uuid primary key default gen_random_uuid(), template_lift_id uuid not null references public.lift_template_lifts(id) on delete cascade,
  phase_key text not null, phase_name text not null, main_load_share numeric not null default 1 check(main_load_share >= 0),
  auxiliary_load_share numeric not null default 0 check(auxiliary_load_share >= 0), radius_m numeric, notes text, sequence_no integer not null default 1
);

create table if not exists public.lift_studies (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id), tower_id uuid references public.towers(id),
  study_number text not null, title text not null, status text not null default 'draft', current_revision_id uuid,
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(project_id,study_number)
);
create table if not exists public.lift_study_revisions (
  id uuid primary key default gen_random_uuid(), study_id uuid not null references public.lift_studies(id) on delete cascade,
  revision_no integer not null, revision_label text not null, status text not null default 'draft', prepared_by uuid, prepared_at timestamptz,
  reviewed_by uuid, reviewed_at timestamptz, approved_by uuid, approved_at timestamptz,
  crane_profile_revision_id uuid references public.lift_crane_profile_revisions(id),
  configuration_revision_id uuid references public.lift_crane_configuration_revisions(id),
  template_revision_id uuid references public.lift_tower_template_revisions(id),
  rigging_revisions jsonb not null default '[]'::jsonb, load_chart_revisions jsonb not null default '[]'::jsonb,
  source_documents jsonb not null default '[]'::jsonb, calculation_inputs jsonb not null default '{}'::jsonb,
  calculation_outputs jsonb not null default '{}'::jsonb, calculation_engine_version text, methodology_version text,
  input_snapshot jsonb not null default '{}'::jsonb, output_snapshot jsonb not null default '{}'::jsonb,
  generated_pdf jsonb, issued_at timestamptz, created_at timestamptz not null default now(),
  unique(study_id,revision_no)
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname='lift_studies_current_revision_fk') then
    alter table public.lift_studies add constraint lift_studies_current_revision_fk foreign key(current_revision_id) references public.lift_study_revisions(id) deferrable initially deferred;
  end if;
end $$;
create table if not exists public.lift_study_lifts (
  id uuid primary key default gen_random_uuid(), study_revision_id uuid not null references public.lift_study_revisions(id) on delete cascade,
  template_lift_id uuid references public.lift_template_lifts(id), lift_number text not null, sequence_no integer not null,
  description text not null, lift_type text not null, input_snapshot jsonb not null default '{}'::jsonb, unique(study_revision_id,lift_number)
);
create table if not exists public.lift_study_lift_phases (
  id uuid primary key default gen_random_uuid(), study_lift_id uuid not null references public.lift_study_lifts(id) on delete cascade,
  phase_key text not null, phase_name text not null, main_load_share numeric not null, auxiliary_load_share numeric not null,
  radius_m numeric, slew_angle_deg numeric, suspended_load_x_m numeric, suspended_load_y_m numeric,
  input_snapshot jsonb not null default '{}'::jsonb
);
create table if not exists public.lift_study_lift_results (
  id uuid primary key default gen_random_uuid(), study_lift_id uuid not null references public.lift_study_lifts(id) on delete cascade,
  phase_key text not null, effective_element_mass_kg numeric not null, rigging_tare_kg numeric not null,
  main_overhead_kg numeric not null, auxiliary_overhead_kg numeric not null, main_total_load_t numeric,
  auxiliary_total_load_t numeric, required_radius_m numeric, chart_radius_m numeric, chart_capacity_t numeric,
  utilisation_pct numeric, boom_configuration text, chart_revision_id uuid references public.lift_load_charts(id),
  chart_source jsonb not null default '{}'::jsonb, warnings jsonb not null default '[]'::jsonb
);
create table if not exists public.lift_study_outrigger_results (
  id uuid primary key default gen_random_uuid(), study_revision_id uuid not null references public.lift_study_revisions(id) on delete cascade,
  origin text not null check(origin in ('external_reference','future_engine')), support_key text not null,
  reaction_kn numeric, pad_area_m2 numeric, pressure_kpa numeric, source_reference jsonb not null default '{}'::jsonb,
  method_version text, independently_verified boolean not null default false
);

create table if not exists public.lift_documents (
  id uuid primary key default gen_random_uuid(), project_id uuid references public.projects(id), study_id uuid references public.lift_studies(id) on delete cascade,
  study_revision_id uuid references public.lift_study_revisions(id) on delete cascade, document_type text not null,
  owner_kind text, owner_id uuid, owner_revision_id uuid,
  file_name text not null, sharepoint_drive_id text, sharepoint_item_id text, sharepoint_folder_id text,
  sharepoint_web_url text, source_document jsonb not null default '{}'::jsonb, created_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.lift_study_reviews (
  id uuid primary key default gen_random_uuid(), study_revision_id uuid not null references public.lift_study_revisions(id) on delete cascade,
  action text not null check(action in ('submitted','reviewed','approved','returned','commented')),
  actor_user_id uuid not null, actor_label text, comments text, created_at timestamptz not null default now()
);
create table if not exists public.lift_calculation_settings (
  id uuid primary key default gen_random_uuid(), methodology_version text not null, name text not null,
  settings jsonb not null default '{}'::jsonb, is_active boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), unique(methodology_version,name)
);

create index if not exists lift_studies_project_updated_idx on public.lift_studies(project_id,updated_at desc);
create index if not exists lift_study_revisions_study_idx on public.lift_study_revisions(study_id,revision_no desc);
create index if not exists lift_study_lifts_revision_idx on public.lift_study_lifts(study_revision_id,sequence_no);
create index if not exists lift_chart_points_chart_config_radius_idx on public.lift_load_chart_points(load_chart_id,configuration_key,radius_m);

alter table public.lift_crane_profiles enable row level security;
alter table public.lift_crane_profile_revisions enable row level security;
alter table public.lift_crane_outriggers enable row level security;
alter table public.lift_crane_hooks enable row level security;
alter table public.lift_crane_ropes enable row level security;
alter table public.lift_crane_attachments enable row level security;
alter table public.lift_crane_configurations enable row level security;
alter table public.lift_crane_configuration_revisions enable row level security;
alter table public.lift_rigging_items enable row level security;
alter table public.lift_rigging_item_revisions enable row level security;
alter table public.lift_rigging_arrangements enable row level security;
alter table public.lift_rigging_arrangement_items enable row level security;
alter table public.lift_load_charts enable row level security;
alter table public.lift_load_chart_points enable row level security;
alter table public.lift_tower_templates enable row level security;
alter table public.lift_tower_template_revisions enable row level security;
alter table public.lift_template_lifts enable row level security;
alter table public.lift_template_lift_elements enable row level security;
alter table public.lift_template_lift_phases enable row level security;
alter table public.lift_studies enable row level security;
alter table public.lift_study_revisions enable row level security;
alter table public.lift_study_lifts enable row level security;
alter table public.lift_study_lift_phases enable row level security;
alter table public.lift_study_lift_results enable row level security;
alter table public.lift_study_outrigger_results enable row level security;
alter table public.lift_documents enable row level security;
alter table public.lift_study_reviews enable row level security;
alter table public.lift_calculation_settings enable row level security;
revoke all on public.lift_crane_profiles, public.lift_crane_profile_revisions, public.lift_crane_outriggers, public.lift_crane_hooks, public.lift_crane_ropes, public.lift_crane_attachments, public.lift_crane_configurations, public.lift_crane_configuration_revisions, public.lift_rigging_items, public.lift_rigging_item_revisions, public.lift_rigging_arrangements, public.lift_rigging_arrangement_items, public.lift_load_charts, public.lift_load_chart_points, public.lift_tower_templates, public.lift_tower_template_revisions, public.lift_template_lifts, public.lift_template_lift_elements, public.lift_template_lift_phases, public.lift_studies, public.lift_study_revisions, public.lift_study_lifts, public.lift_study_lift_phases, public.lift_study_lift_results, public.lift_study_outrigger_results, public.lift_documents, public.lift_study_reviews, public.lift_calculation_settings from anon, authenticated;
grant all on public.lift_crane_profiles, public.lift_crane_profile_revisions, public.lift_crane_outriggers, public.lift_crane_hooks, public.lift_crane_ropes, public.lift_crane_attachments, public.lift_crane_configurations, public.lift_crane_configuration_revisions, public.lift_rigging_items, public.lift_rigging_item_revisions, public.lift_rigging_arrangements, public.lift_rigging_arrangement_items, public.lift_load_charts, public.lift_load_chart_points, public.lift_tower_templates, public.lift_tower_template_revisions, public.lift_template_lifts, public.lift_template_lift_elements, public.lift_template_lift_phases, public.lift_studies, public.lift_study_revisions, public.lift_study_lifts, public.lift_study_lift_phases, public.lift_study_lift_results, public.lift_study_outrigger_results, public.lift_documents, public.lift_study_reviews, public.lift_calculation_settings to service_role;

insert into public.access_groups(code,name,description,sort_order,is_active)
values('lift_engineering','Lift Engineering','Crane, rigging, load chart and project lift study engineering.',180,true)
on conflict(code) do update set name=excluded.name,description=excluded.description,is_active=true,updated_at=now();
insert into public.access_areas(group_id,category,code,name,description,type,permission_level,route,source,sort_order,is_active)
select g.id,'TTTracker · Lift Engineering',v.code,v.name,v.description,'tttracker',v.level,v.route,'system_permission',v.sort_order,true
from public.access_groups g cross join (values
 ('tt.lift_engineering.view','Lift Engineering','View Lift Engineering libraries and studies.','view','/lift-engineering',10),
 ('tt.lift_engineering.studies.create','Create Lift Studies','Create project-scoped lift studies.','manage','/lift-engineering/studies',20),
 ('tt.lift_engineering.studies.edit','Edit Lift Studies','Edit draft lift studies and calculations.','manage','/lift-engineering/studies',30),
 ('tt.lift_engineering.library.manage','Manage Engineering Library','Manage crane, configuration, rigging, template and chart records.','manage','/lift-engineering',40),
 ('tt.lift_engineering.review','Review Lift Studies','Review submitted Lift Study revisions.','manage','/lift-engineering/studies',50),
 ('tt.lift_engineering.approve','Approve Lift Studies','Approve Lift Study revisions.','manage','/lift-engineering/studies',60),
 ('tt.lift_engineering.settings.manage','Manage Calculation Settings','Manage Lift Engineering methodology settings.','manage','/lift-engineering/settings',70)
) v(code,name,description,level,route,sort_order) where g.code='lift_engineering'
on conflict(code) do update set group_id=excluded.group_id,category=excluded.category,name=excluded.name,description=excluded.description,type=excluded.type,permission_level=excluded.permission_level,route=excluded.route,source=excluded.source,is_active=true;

insert into public.access_route_rules(name,route_pattern,match_type,access_area_id,priority,is_active)
select 'Lift Engineering','/lift-engineering','prefix',aa.id,30,true
from public.access_areas aa where aa.code='tt.lift_engineering.view'
and not exists(select 1 from public.access_route_rules ar where ar.route_pattern='/lift-engineering' and ar.match_type='prefix');

create or replace function public.v1_lift_study_revision_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (old.issued_at is not null or old.status in ('submitted','reviewed','approved','issued')) and (
    new.study_id is distinct from old.study_id or new.revision_no is distinct from old.revision_no or
    new.revision_label is distinct from old.revision_label or
    new.crane_profile_revision_id is distinct from old.crane_profile_revision_id or
    new.configuration_revision_id is distinct from old.configuration_revision_id or
    new.template_revision_id is distinct from old.template_revision_id or
    new.rigging_revisions is distinct from old.rigging_revisions or
    new.load_chart_revisions is distinct from old.load_chart_revisions or
    new.source_documents is distinct from old.source_documents or
    new.calculation_inputs is distinct from old.calculation_inputs or
    new.calculation_outputs is distinct from old.calculation_outputs or
    new.calculation_engine_version is distinct from old.calculation_engine_version or
    new.methodology_version is distinct from old.methodology_version or
    new.input_snapshot is distinct from old.input_snapshot or new.output_snapshot is distinct from old.output_snapshot
  ) then raise exception 'Issued Lift Study snapshots are immutable; create a new study revision.'; end if;
  return new;
end $$;
drop trigger if exists lift_study_revision_immutable on public.lift_study_revisions;
create trigger lift_study_revision_immutable before update on public.lift_study_revisions for each row execute function public.v1_lift_study_revision_guard();

create or replace function public.v1_lift_study_child_guard()
returns trigger language plpgsql set search_path = '' as $$
declare revision_id uuid; old_revision_id uuid; revision_status text; is_issued boolean;
begin
  if tg_table_name in ('lift_study_lifts','lift_study_outrigger_results') then
    revision_id := coalesce(new.study_revision_id,old.study_revision_id);
    old_revision_id := old.study_revision_id;
  else
    select sl.study_revision_id into revision_id from public.lift_study_lifts sl
    where sl.id=coalesce(new.study_lift_id,old.study_lift_id);
    select sl.study_revision_id into old_revision_id from public.lift_study_lifts sl
    where sl.id=old.study_lift_id;
  end if;
  if revision_id is not null then
    select sr.status,sr.issued_at is not null into revision_status,is_issued from public.lift_study_revisions sr where sr.id=revision_id;
    if coalesce(is_issued,false) or revision_status in ('submitted','approved','issued') then raise exception 'Issued Lift Study content is immutable; create a new study revision.'; end if;
  end if;
  if old_revision_id is not null and old_revision_id is distinct from revision_id then
    select sr.status,sr.issued_at is not null into revision_status,is_issued from public.lift_study_revisions sr where sr.id=old_revision_id;
    if coalesce(is_issued,false) or revision_status in ('submitted','approved','issued') then raise exception 'Issued Lift Study content is immutable; create a new study revision.'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists lift_study_lifts_immutable on public.lift_study_lifts;
create trigger lift_study_lifts_immutable before insert or update or delete on public.lift_study_lifts for each row execute function public.v1_lift_study_child_guard();
drop trigger if exists lift_study_phases_immutable on public.lift_study_lift_phases;
create trigger lift_study_phases_immutable before insert or update or delete on public.lift_study_lift_phases for each row execute function public.v1_lift_study_child_guard();
drop trigger if exists lift_study_results_immutable on public.lift_study_lift_results;
create trigger lift_study_results_immutable before insert or update or delete on public.lift_study_lift_results for each row execute function public.v1_lift_study_child_guard();
drop trigger if exists lift_study_outrigger_results_immutable on public.lift_study_outrigger_results;
create trigger lift_study_outrigger_results_immutable before insert or update or delete on public.lift_study_outrigger_results for each row execute function public.v1_lift_study_child_guard();

revoke all on function public.v1_lift_study_revision_guard(),public.v1_lift_study_child_guard() from public,anon,authenticated;
grant execute on function public.v1_lift_study_revision_guard(),public.v1_lift_study_child_guard() to service_role;

create or replace function public.v1_lift_study_save_calculation(
  p_revision_id uuid, p_input_snapshot jsonb, p_output_snapshot jsonb,
  p_lifts jsonb, p_phases jsonb, p_results jsonb, p_engine_version text, p_methodology_version text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.lift_study_revisions r where r.id=p_revision_id and r.status='draft' and r.issued_at is null) then
    raise exception 'Only draft Lift Study revisions can be recalculated.';
  end if;
  delete from public.lift_study_lift_results x using public.lift_study_lifts l where x.study_lift_id=l.id and l.study_revision_id=p_revision_id;
  delete from public.lift_study_lift_phases x using public.lift_study_lifts l where x.study_lift_id=l.id and l.study_revision_id=p_revision_id;
  delete from public.lift_study_lifts where study_revision_id=p_revision_id;
  insert into public.lift_study_lifts(id,study_revision_id,template_lift_id,lift_number,sequence_no,description,lift_type,input_snapshot)
  select (v->>'id')::uuid,p_revision_id,nullif(v->>'templateLiftId','')::uuid,v->>'liftNumber',(v->>'sequenceNo')::integer,v->>'description',v->>'liftType',coalesce(v->'inputSnapshot','{}'::jsonb)
  from jsonb_array_elements(coalesce(p_lifts,'[]'::jsonb)) v;
  insert into public.lift_study_lift_phases(study_lift_id,phase_key,phase_name,main_load_share,auxiliary_load_share,radius_m,input_snapshot)
  select (v->>'studyLiftId')::uuid,v->>'phaseKey',v->>'phaseName',(v->>'mainLoadShare')::numeric,(v->>'auxiliaryLoadShare')::numeric,nullif(v->>'radiusM','')::numeric,coalesce(v->'inputSnapshot','{}'::jsonb)
  from jsonb_array_elements(coalesce(p_phases,'[]'::jsonb)) v;
  insert into public.lift_study_lift_results(study_lift_id,phase_key,effective_element_mass_kg,rigging_tare_kg,main_overhead_kg,auxiliary_overhead_kg,main_total_load_t,auxiliary_total_load_t,required_radius_m,chart_radius_m,chart_capacity_t,utilisation_pct,boom_configuration,chart_revision_id,chart_source,warnings)
  select (v->>'studyLiftId')::uuid,v->>'phaseKey',(v->>'effectiveElementMassKg')::numeric,(v->>'riggingTareKg')::numeric,(v->>'mainOverheadKg')::numeric,(v->>'auxiliaryOverheadKg')::numeric,nullif(v->>'mainTotalLoadT','')::numeric,nullif(v->>'auxiliaryTotalLoadT','')::numeric,nullif(v->>'requiredRadiusM','')::numeric,nullif(v->>'chartRadiusM','')::numeric,nullif(v->>'chartCapacityT','')::numeric,nullif(v->>'utilisationPct','')::numeric,v->>'boomConfiguration',nullif(v->>'chartRevisionId','')::uuid,coalesce(v->'chartSource','{}'::jsonb),coalesce(v->'warnings','[]'::jsonb)
  from jsonb_array_elements(coalesce(p_results,'[]'::jsonb)) v;
  update public.lift_study_revisions set input_snapshot=coalesce(p_input_snapshot,'{}'::jsonb),output_snapshot=coalesce(p_output_snapshot,'{}'::jsonb),calculation_inputs=coalesce(p_input_snapshot,'{}'::jsonb),calculation_outputs=coalesce(p_output_snapshot,'{}'::jsonb),calculation_engine_version=p_engine_version,methodology_version=p_methodology_version,rigging_revisions=coalesce(p_input_snapshot->'riggingRevisions','[]'::jsonb),load_chart_revisions=coalesce(p_input_snapshot->'loadChartRevisions','[]'::jsonb),source_documents=coalesce(p_input_snapshot->'sourceDocuments','[]'::jsonb) where id=p_revision_id;
end $$;
revoke all on function public.v1_lift_study_save_calculation(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.v1_lift_study_save_calculation(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text) to service_role;

create or replace function public.v1_lift_study_workflow(
  p_revision_id uuid, p_action text, p_actor_user_id uuid, p_actor_label text, p_comments text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare rev public.lift_study_revisions%rowtype; next_status text; stamp timestamptz := now();
begin
  select * into rev from public.lift_study_revisions where id=p_revision_id for update;
  if not found then raise exception 'Lift Study revision was not found.'; end if;
  if p_action='submit' and rev.status='draft' then next_status := 'submitted';
  elsif p_action='review' and rev.status='submitted' then next_status := 'reviewed';
  elsif p_action='approve' and rev.status in ('submitted','reviewed') then next_status := 'approved';
  elsif p_action='return' and rev.status in ('submitted','reviewed') then next_status := 'returned';
  else raise exception 'Lift Study workflow transition is not valid from status %.',rev.status;
  end if;
  update public.lift_study_revisions set status=next_status,
    issued_at=case when p_action='submit' then stamp else coalesce(issued_at,stamp) end,
    reviewed_by=case when p_action='review' then p_actor_user_id else reviewed_by end,
    reviewed_at=case when p_action='review' then stamp else reviewed_at end,
    approved_by=case when p_action='approve' then p_actor_user_id else approved_by end,
    approved_at=case when p_action='approve' then stamp else approved_at end,
    output_snapshot=case when p_action='submit' then jsonb_set(coalesce(output_snapshot,'{}'::jsonb),'{outriggerReferences}',coalesce((select jsonb_agg(to_jsonb(o) order by o.support_key) from public.lift_study_outrigger_results o where o.study_revision_id=rev.id),'[]'::jsonb),true) else output_snapshot end,
    calculation_outputs=case when p_action='submit' then jsonb_set(coalesce(calculation_outputs,'{}'::jsonb),'{outriggerReferences}',coalesce((select jsonb_agg(to_jsonb(o) order by o.support_key) from public.lift_study_outrigger_results o where o.study_revision_id=rev.id),'[]'::jsonb),true) else calculation_outputs end
  where id=rev.id;
  insert into public.lift_study_reviews(study_revision_id,action,actor_user_id,actor_label,comments)
    values(rev.id,case p_action when 'submit' then 'submitted' when 'review' then 'reviewed' when 'approve' then 'approved' else 'returned' end,p_actor_user_id,p_actor_label,nullif(btrim(p_comments),''));
  update public.lift_studies set status=next_status,updated_at=stamp where id=rev.study_id;
  return jsonb_build_object('id',rev.id,'status',next_status,'issued_at',case when p_action='submit' then stamp else coalesce(rev.issued_at,stamp) end);
end $$;
revoke all on function public.v1_lift_study_workflow(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.v1_lift_study_workflow(uuid,text,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;

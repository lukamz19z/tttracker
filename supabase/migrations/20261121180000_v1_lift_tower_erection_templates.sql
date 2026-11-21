begin;

-- Tower Template revisions describe physical tower data only. Erection methods
-- are represented independently by lift_erection_templates below.
alter table public.lift_tower_templates
  add column if not exists tower_family text,
  add column if not exists extension_configuration text,
  add column if not exists nominal_height_m numeric check (nominal_height_m is null or nominal_height_m > 0),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.lift_tower_template_sections (
  id uuid primary key default gen_random_uuid(),
  tower_template_revision_id uuid not null references public.lift_tower_template_revisions(id) on delete cascade,
  parent_section_id uuid references public.lift_tower_template_sections(id) on delete set null,
  name text not null,
  section_code text,
  category text,
  description text,
  quantity numeric not null default 1 check (quantity > 0),
  unit_weight_kg numeric not null default 0 check (unit_weight_kg >= 0),
  height_m numeric check (height_m is null or height_m >= 0),
  width_m numeric check (width_m is null or width_m >= 0),
  length_m numeric check (length_m is null or length_m >= 0),
  cg_x_m numeric,
  cg_y_m numeric,
  cg_z_m numeric,
  drawing_reference jsonb not null default '{}'::jsonb,
  notes text,
  sequence_no integer not null default 1,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.lift_erection_templates (
  id uuid primary key default gen_random_uuid(),
  tower_template_id uuid not null references public.lift_tower_templates(id) on delete cascade,
  name text not null,
  description text,
  method_tags text[] not null default '{}',
  crane_suitability jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lift_erection_template_revisions (
  id uuid primary key default gen_random_uuid(),
  lift_template_id uuid not null references public.lift_erection_templates(id) on delete cascade,
  tower_template_revision_id uuid not null references public.lift_tower_template_revisions(id),
  revision text not null,
  status text not null default 'draft' check (status in ('draft','active','verified','superseded')),
  description text,
  method_tags text[] not null default '{}',
  crane_suitability jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(lift_template_id, revision)
);

create table if not exists public.lift_erection_template_lifts (
  id uuid primary key default gen_random_uuid(),
  lift_template_revision_id uuid not null references public.lift_erection_template_revisions(id) on delete cascade,
  lift_number text not null,
  name text not null,
  description text,
  sequence_no integer not null,
  lift_type text not null default 'Erection',
  additional_mass_kg numeric not null default 0 check (additional_mass_kg >= 0),
  erection_method text,
  crane_suitability jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  unique(lift_template_revision_id, lift_number)
);

create table if not exists public.lift_erection_template_lift_sections (
  id uuid primary key default gen_random_uuid(),
  lift_template_lift_id uuid not null references public.lift_erection_template_lifts(id) on delete cascade,
  tower_template_section_id uuid not null references public.lift_tower_template_sections(id),
  allocated_quantity numeric not null default 1 check (allocated_quantity > 0),
  portion numeric not null default 1 check (portion > 0 and portion <= 1),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.lift_study_revisions
  add column if not exists erection_template_revision_id uuid references public.lift_erection_template_revisions(id);
alter table public.lift_study_lifts
  add column if not exists erection_template_lift_id uuid references public.lift_erection_template_lifts(id);

create index if not exists lift_tower_sections_revision_order_idx on public.lift_tower_template_sections(tower_template_revision_id, sequence_no) where active;
create index if not exists lift_erection_templates_tower_idx on public.lift_erection_templates(tower_template_id, active, name);
create index if not exists lift_erection_template_revisions_parent_idx on public.lift_erection_template_revisions(lift_template_id, created_at desc);
create index if not exists lift_erection_template_revisions_tower_revision_idx on public.lift_erection_template_revisions(tower_template_revision_id);
create index if not exists lift_erection_template_lifts_revision_order_idx on public.lift_erection_template_lifts(lift_template_revision_id, sequence_no);
create index if not exists lift_erection_template_lift_sections_lift_idx on public.lift_erection_template_lift_sections(lift_template_lift_id);
create index if not exists lift_erection_template_lift_sections_section_idx on public.lift_erection_template_lift_sections(tower_template_section_id);

alter table public.lift_tower_template_sections enable row level security;
alter table public.lift_erection_templates enable row level security;
alter table public.lift_erection_template_revisions enable row level security;
alter table public.lift_erection_template_lifts enable row level security;
alter table public.lift_erection_template_lift_sections enable row level security;
revoke all on public.lift_tower_template_sections, public.lift_erection_templates, public.lift_erection_template_revisions, public.lift_erection_template_lifts, public.lift_erection_template_lift_sections from anon, authenticated;
grant all on public.lift_tower_template_sections, public.lift_erection_templates, public.lift_erection_template_revisions, public.lift_erection_template_lifts, public.lift_erection_template_lift_sections to service_role;

create or replace function public.v1_lift_tower_section_draft_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_revision uuid; v_status text;
begin
  v_revision := coalesce(new.tower_template_revision_id, old.tower_template_revision_id);
  select status into v_status from public.lift_tower_template_revisions where id = v_revision;
  if v_status is distinct from 'draft' then raise exception 'Tower sections can only be changed on a Draft tower revision.'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists lift_tower_sections_draft_guard on public.lift_tower_template_sections;
create trigger lift_tower_sections_draft_guard before insert or update or delete on public.lift_tower_template_sections for each row execute function public.v1_lift_tower_section_draft_guard();

create or replace function public.v1_lift_erection_revision_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status in ('active','verified','superseded') and (
    new.lift_template_id is distinct from old.lift_template_id or
    new.tower_template_revision_id is distinct from old.tower_template_revision_id or
    new.revision is distinct from old.revision or new.description is distinct from old.description or
    new.method_tags is distinct from old.method_tags or new.crane_suitability is distinct from old.crane_suitability or new.notes is distinct from old.notes
  ) then raise exception 'Active, Verified and Superseded erection template revisions are immutable; create a Draft revision.'; end if;
  return new;
end $$;
drop trigger if exists lift_erection_revision_immutable on public.lift_erection_template_revisions;
create trigger lift_erection_revision_immutable before update on public.lift_erection_template_revisions for each row execute function public.v1_lift_erection_revision_guard();

create or replace function public.v1_lift_erection_child_draft_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_lift uuid; v_revision uuid; v_status text;
begin
  if tg_table_name = 'lift_erection_template_lifts' then
    v_revision := coalesce(new.lift_template_revision_id, old.lift_template_revision_id);
  else
    v_lift := coalesce(new.lift_template_lift_id, old.lift_template_lift_id);
    select lift_template_revision_id into v_revision from public.lift_erection_template_lifts where id = v_lift;
  end if;
  select status into v_status from public.lift_erection_template_revisions where id = v_revision;
  if v_status is distinct from 'draft' then raise exception 'Erection sequence can only be changed on a Draft lift-template revision.'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists lift_erection_lifts_draft_guard on public.lift_erection_template_lifts;
create trigger lift_erection_lifts_draft_guard before insert or update or delete on public.lift_erection_template_lifts for each row execute function public.v1_lift_erection_child_draft_guard();
drop trigger if exists lift_erection_lift_sections_draft_guard on public.lift_erection_template_lift_sections;
create trigger lift_erection_lift_sections_draft_guard before insert or update or delete on public.lift_erection_template_lift_sections for each row execute function public.v1_lift_erection_child_draft_guard();

create or replace function public.v1_lift_study_revision_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (old.issued_at is not null or old.status in ('submitted','reviewed','approved','issued')) and (
    new.study_id is distinct from old.study_id or new.revision_no is distinct from old.revision_no or
    new.revision_label is distinct from old.revision_label or
    new.crane_profile_revision_id is distinct from old.crane_profile_revision_id or
    new.configuration_revision_id is distinct from old.configuration_revision_id or
    new.template_revision_id is distinct from old.template_revision_id or
    new.erection_template_revision_id is distinct from old.erection_template_revision_id or
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
revoke all on function public.v1_lift_tower_section_draft_guard(), public.v1_lift_erection_revision_guard(), public.v1_lift_erection_child_draft_guard() from public, anon, authenticated;
grant execute on function public.v1_lift_tower_section_draft_guard(), public.v1_lift_erection_revision_guard(), public.v1_lift_erection_child_draft_guard() to service_role;

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
  insert into public.lift_study_lifts(id,study_revision_id,template_lift_id,erection_template_lift_id,lift_number,sequence_no,description,lift_type,input_snapshot)
  select (v->>'id')::uuid,p_revision_id,nullif(v->>'templateLiftId','')::uuid,nullif(v->>'erectionTemplateLiftId','')::uuid,
    v->>'liftNumber',(v->>'sequenceNo')::integer,v->>'description',v->>'liftType',coalesce(v->'inputSnapshot','{}'::jsonb)
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

notify pgrst, 'reload schema';
commit;

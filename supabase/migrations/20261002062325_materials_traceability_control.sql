-- TTTracker V2
-- Migration 016: Materials Traceability Control
-- Contractor-first, client-share-ready materials model.
--
-- Builds on:
--   012 Operations Control Centre
--   013-015 project parties / client access (when present)
--
-- Key principles:
--   * Packing lists describe which members are physically in each bundle.
--   * Drawings/schedules describe what members, bolts and packers are required,
--     by drawing and tower segment.
--   * Missing/excess is a lifecycle with full Daily Docket traceability.
--   * Movements are a ledger: tower, laydown, supplier, other project, etc.
--   * Redlines/amendments never overwrite the imported base requirement.
--   * Imports preserve source provenance and can be reconciled across sources.
--   * Client visibility is controlled by the existing project-party sharing layer.

begin;

create schema if not exists private;

do $$
begin
  if to_regclass('public.v2_projects') is null then
    raise exception 'Missing prerequisite: public.v2_projects';
  end if;
  if to_regclass('public.v2_towers') is null then
    raise exception 'Missing prerequisite: public.v2_towers';
  end if;
  if to_regclass('public.v2_material_register') is null then
    raise exception 'Missing prerequisite: public.v2_material_register (run Operations Control Centre first)';
  end if;
  if to_regclass('public.v2_material_events') is null then
    raise exception 'Missing prerequisite: public.v2_material_events (run Operations Control Centre first)';
  end if;
  if to_regclass('public.v2_project_option_definitions') is null then
    raise exception 'Missing prerequisite: public.v2_project_option_definitions';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Bundle master + packing relationships
-- ---------------------------------------------------------------------------
create table if not exists public.v2_material_bundles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  tower_id uuid references public.v2_towers(id) on delete cascade,
  tower_type text,
  bundle_reference text not null,
  bundle_group text,
  segment text,
  required_quantity numeric not null default 1,
  supplied_quantity numeric not null default 0,
  total_weight_t numeric,
  unit text not null default 'bundle',
  source_document text,
  source_revision text,
  metadata jsonb not null default '{}'::jsonb,
  origin_organisation_id uuid references public.organisations(id) on delete restrict,
  visibility_scope text not null default 'origin_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists v2_material_bundles_project_idx
  on public.v2_material_bundles(project_id, tower_id, bundle_reference);
create index if not exists v2_material_bundles_type_idx
  on public.v2_material_bundles(project_id, tower_type, segment);

alter table public.v2_material_register
  add column if not exists bundle_id uuid references public.v2_material_bundles(id) on delete set null,
  add column if not exists tower_type text,
  add column if not exists drawing_revision text,
  add column if not exists profile text,
  add column if not exists material_code text,
  add column if not exists diameter text,
  add column if not exists length text,
  add column if not exists bolt_type text,
  add column if not exists packer_mark text,
  add column if not exists source_kind text not null default 'manual',
  add column if not exists source_document text,
  add column if not exists source_revision text,
  add column if not exists effective_from date,
  add column if not exists effective_to date,
  add column if not exists is_active boolean not null default true,
  add column if not exists origin_organisation_id uuid references public.organisations(id) on delete restrict,
  add column if not exists visibility_scope text not null default 'origin_only';

update public.v2_material_register
set origin_organisation_id = organisation_id
where origin_organisation_id is null;

create index if not exists v2_material_register_bundle_idx
  on public.v2_material_register(bundle_id);
create index if not exists v2_material_register_drawing_segment_idx
  on public.v2_material_register(project_id, drawing_reference, segment);
create index if not exists v2_material_register_kind_reference_idx
  on public.v2_material_register(project_id, material_kind, item_reference);

create table if not exists public.v2_material_bundle_members (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  tower_id uuid references public.v2_towers(id) on delete cascade,
  bundle_id uuid not null references public.v2_material_bundles(id) on delete cascade,
  material_item_id uuid references public.v2_material_register(id) on delete set null,
  member_reference text not null,
  quantity numeric not null default 1,
  source_document text,
  source_revision text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists v2_material_bundle_members_bundle_idx
  on public.v2_material_bundle_members(bundle_id, member_reference);
create index if not exists v2_material_bundle_members_item_idx
  on public.v2_material_bundle_members(material_item_id);

-- ---------------------------------------------------------------------------
-- Check-off state
-- ---------------------------------------------------------------------------
create table if not exists public.v2_material_bundle_checks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  tower_id uuid not null references public.v2_towers(id) on delete cascade,
  bundle_id uuid not null references public.v2_material_bundles(id) on delete cascade,
  status text not null default 'not_checked',
  quantity_received numeric not null default 0,
  notes text,
  checked_by uuid references auth.users(id) on delete set null,
  checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(bundle_id)
);

create table if not exists public.v2_material_member_checks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  tower_id uuid not null references public.v2_towers(id) on delete cascade,
  bundle_id uuid not null references public.v2_material_bundles(id) on delete cascade,
  material_item_id uuid references public.v2_material_register(id) on delete set null,
  member_reference text not null,
  status text not null default 'not_checked',
  notes text,
  checked_by uuid references auth.users(id) on delete set null,
  checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(bundle_id, member_reference)
);

-- ---------------------------------------------------------------------------
-- Configurable locations
-- ---------------------------------------------------------------------------
create table if not exists public.v2_material_locations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  location_type_key text not null,
  code text,
  name text not null,
  tower_id uuid references public.v2_towers(id) on delete set null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists v2_material_locations_project_idx
  on public.v2_material_locations(project_id, is_active, name);

-- ---------------------------------------------------------------------------
-- Issue numbering
-- ---------------------------------------------------------------------------
create table if not exists public.v2_material_issue_counters (
  project_id uuid primary key references public.v2_projects(id) on delete cascade,
  next_number bigint not null default 1
);

create or replace function public.tttracker_v2_next_material_issue_number(
  p_project_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_number bigint;
begin
  insert into public.v2_material_issue_counters(project_id, next_number)
  values (p_project_id, 2)
  on conflict (project_id)
  do update set next_number = public.v2_material_issue_counters.next_number + 1
  returning next_number - 1 into v_number;

  return 'MAT-' || lpad(v_number::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Missing / excess / damaged / incorrect issue lifecycle
-- ---------------------------------------------------------------------------
create table if not exists public.v2_material_issues (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  issue_number text not null,
  tower_id uuid references public.v2_towers(id) on delete set null,
  material_item_id uuid references public.v2_material_register(id) on delete set null,
  bundle_id uuid references public.v2_material_bundles(id) on delete set null,
  issue_type_key text not null,
  item_reference text,
  description text,
  quantity_affected numeric not null default 1,
  quantity_resolved numeric not null default 0,
  unit text not null default 'ea',
  status text not null default 'open',
  raised_docket_id uuid references public.v2_daily_dockets(id) on delete set null,
  raised_at timestamptz not null default now(),
  raised_by uuid references auth.users(id) on delete set null,
  affected_work boolean not null default false,
  work_outcome_key text,
  affected_activity text,
  affected_segment text,
  current_effect text,
  current_location_id uuid references public.v2_material_locations(id) on delete set null,
  current_tower_id uuid references public.v2_towers(id) on delete set null,
  client_reference text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  origin_organisation_id uuid references public.organisations(id) on delete restrict,
  visibility_scope text not null default 'origin_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, issue_number)
);
create index if not exists v2_material_issues_project_status_idx
  on public.v2_material_issues(project_id, status, issue_type_key, raised_at desc);
create index if not exists v2_material_issues_tower_idx
  on public.v2_material_issues(tower_id, status);

create table if not exists public.v2_material_issue_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  issue_id uuid not null references public.v2_material_issues(id) on delete cascade,
  event_type_key text not null,
  quantity numeric not null default 0,
  unit text not null default 'ea',
  source_type_key text,
  source_tower_id uuid references public.v2_towers(id) on delete set null,
  source_location_id uuid references public.v2_material_locations(id) on delete set null,
  destination_tower_id uuid references public.v2_towers(id) on delete set null,
  destination_location_id uuid references public.v2_material_locations(id) on delete set null,
  docket_id uuid references public.v2_daily_dockets(id) on delete set null,
  reference text,
  notes text,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists v2_material_issue_events_issue_idx
  on public.v2_material_issue_events(issue_id, occurred_at, created_at);

-- Resolve quantity is derived from the event ledger.
create or replace function public.tttracker_v2_recalculate_material_issue(
  p_issue_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_affected numeric;
  v_resolved numeric;
  v_status text;
  v_closed_at timestamptz;
begin
  select quantity_affected into v_affected
  from public.v2_material_issues
  where id = p_issue_id;

  if v_affected is null then return; end if;

  select coalesce(sum(
    case
      when event_type_key in ('received','found_received','replacement_received','transfer_received','resolved_quantity')
        then greatest(quantity,0)
      when event_type_key in ('receipt_reversed','resolution_reversed')
        then -greatest(quantity,0)
      else 0
    end
  ),0)
  into v_resolved
  from public.v2_material_issue_events
  where issue_id = p_issue_id;

  v_resolved := greatest(v_resolved, 0);

  if v_resolved >= v_affected then
    v_status := 'resolved';
    v_closed_at := now();
  elsif v_resolved > 0 then
    v_status := 'partial';
    v_closed_at := null;
  else
    v_status := 'open';
    v_closed_at := null;
  end if;

  update public.v2_material_issues
  set quantity_resolved = least(v_resolved, quantity_affected),
      status = v_status,
      closed_at = v_closed_at,
      updated_at = now()
  where id = p_issue_id;
end;
$$;

create or replace function private.tttracker_v2_material_issue_event_touch()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  perform public.tttracker_v2_recalculate_material_issue(coalesce(new.issue_id, old.issue_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists v2_material_issue_events_recalculate on public.v2_material_issue_events;
create trigger v2_material_issue_events_recalculate
after insert or update or delete on public.v2_material_issue_events
for each row execute function private.tttracker_v2_material_issue_event_touch();

-- ---------------------------------------------------------------------------
-- Material movement ledger + reservations
-- ---------------------------------------------------------------------------
create table if not exists public.v2_material_movements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  material_item_id uuid references public.v2_material_register(id) on delete set null,
  bundle_id uuid references public.v2_material_bundles(id) on delete set null,
  issue_id uuid references public.v2_material_issues(id) on delete set null,
  movement_type_key text not null,
  quantity numeric not null default 1,
  unit text not null default 'ea',
  source_type_key text,
  source_tower_id uuid references public.v2_towers(id) on delete set null,
  source_location_id uuid references public.v2_material_locations(id) on delete set null,
  destination_tower_id uuid references public.v2_towers(id) on delete set null,
  destination_location_id uuid references public.v2_material_locations(id) on delete set null,
  docket_id uuid references public.v2_daily_dockets(id) on delete set null,
  status text not null default 'planned',
  reference text,
  notes text,
  moved_by uuid references auth.users(id) on delete set null,
  moved_at timestamptz,
  received_by uuid references auth.users(id) on delete set null,
  received_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  origin_organisation_id uuid references public.organisations(id) on delete restrict,
  visibility_scope text not null default 'origin_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (material_item_id is not null or bundle_id is not null)
);
create index if not exists v2_material_movements_project_idx
  on public.v2_material_movements(project_id, status, created_at desc);
create index if not exists v2_material_movements_issue_idx
  on public.v2_material_movements(issue_id);

create table if not exists public.v2_material_reservations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  material_item_id uuid references public.v2_material_register(id) on delete cascade,
  bundle_id uuid references public.v2_material_bundles(id) on delete cascade,
  issue_id uuid references public.v2_material_issues(id) on delete set null,
  source_tower_id uuid references public.v2_towers(id) on delete set null,
  source_location_id uuid references public.v2_material_locations(id) on delete set null,
  destination_tower_id uuid references public.v2_towers(id) on delete set null,
  destination_location_id uuid references public.v2_material_locations(id) on delete set null,
  quantity numeric not null default 1,
  unit text not null default 'ea',
  status text not null default 'reserved',
  reserved_by uuid references auth.users(id) on delete set null,
  reserved_at timestamptz not null default now(),
  expires_at timestamptz,
  released_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  check (material_item_id is not null or bundle_id is not null)
);
create index if not exists v2_material_reservations_project_idx
  on public.v2_material_reservations(project_id, status, reserved_at desc);

-- ---------------------------------------------------------------------------
-- Controlled amendments / redlines
-- ---------------------------------------------------------------------------
create table if not exists public.v2_material_amendments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  amendment_number text,
  title text not null,
  reference_type_key text,
  reference_number text,
  scope_key text not null,
  tower_id uuid references public.v2_towers(id) on delete set null,
  tower_type text,
  drawing_reference text,
  drawing_revision text,
  segment text,
  reason text,
  status_key text not null default 'draft',
  effective_from date,
  document_url text,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  origin_organisation_id uuid references public.organisations(id) on delete restrict,
  visibility_scope text not null default 'origin_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists v2_material_amendments_project_idx
  on public.v2_material_amendments(project_id, status_key, effective_from);

create table if not exists public.v2_material_amendment_items (
  id uuid primary key default gen_random_uuid(),
  amendment_id uuid not null references public.v2_material_amendments(id) on delete cascade,
  base_material_item_id uuid references public.v2_material_register(id) on delete set null,
  action_key text not null,
  material_kind text not null,
  item_reference text,
  description text,
  segment text,
  drawing_reference text,
  drawing_revision text,
  profile text,
  diameter text,
  length text,
  bolt_type text,
  packer_mark text,
  quantity numeric,
  unit text,
  quantity_basis_key text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists v2_material_amendment_items_amendment_idx
  on public.v2_material_amendment_items(amendment_id);

-- ---------------------------------------------------------------------------
-- Import profiles, batches, raw normalized source records
-- ---------------------------------------------------------------------------
create table if not exists public.v2_material_import_profiles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid references public.v2_projects(id) on delete cascade,
  name text not null,
  source_type_key text not null,
  mapping jsonb not null default '{}'::jsonb,
  defaults jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists v2_material_import_profiles_scope_name_uidx
  on public.v2_material_import_profiles(organisation_id, coalesce(project_id,'00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table if not exists public.v2_material_import_batches (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  source_type_key text not null,
  source_file_name text,
  profile_id uuid references public.v2_material_import_profiles(id) on delete set null,
  status text not null default 'preview',
  import_mode text not null default 'merge',
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  warning_rows integer not null default 0,
  error_rows integer not null default 0,
  mapping jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  committed_at timestamptz
);
create index if not exists v2_material_import_batches_project_idx
  on public.v2_material_import_batches(project_id, created_at desc);

create table if not exists public.v2_material_source_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  import_batch_id uuid references public.v2_material_import_batches(id) on delete cascade,
  source_type_key text not null,
  source_row_number integer,
  tower_id uuid references public.v2_towers(id) on delete set null,
  tower_type text,
  material_kind text,
  item_reference text,
  description text,
  bundle_reference text,
  segment text,
  drawing_reference text,
  drawing_revision text,
  required_quantity numeric,
  unit text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists v2_material_source_records_project_idx
  on public.v2_material_source_records(project_id, source_type_key, item_reference);
create index if not exists v2_material_source_records_bundle_idx
  on public.v2_material_source_records(project_id, bundle_reference, segment);

alter table public.v2_material_register
  add column if not exists source_import_batch_id uuid references public.v2_material_import_batches(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Reconciliation runs/findings
-- ---------------------------------------------------------------------------
create table if not exists public.v2_material_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  status text not null default 'complete',
  finding_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.v2_material_reconciliation_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.v2_material_reconciliation_runs(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  tower_id uuid references public.v2_towers(id) on delete set null,
  finding_type_key text not null,
  severity text not null default 'warning',
  status text not null default 'open',
  item_reference text,
  bundle_reference text,
  drawing_reference text,
  segment text,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists v2_material_reconciliation_findings_project_idx
  on public.v2_material_reconciliation_findings(project_id, status, severity, created_at desc);

-- ---------------------------------------------------------------------------
-- Configurable options. These are seeds, not hard-coded UI restrictions.
-- ---------------------------------------------------------------------------
insert into public.v2_project_option_definitions (
  organisation_id, project_id, option_group, option_key, label, sort_order, settings
)
select p.organisation_id, p.id, x.option_group, x.option_key, x.label, x.sort_order, x.settings
from public.v2_projects p
cross join (
  values
    ('material_issue_type','missing','Missing',10,'{}'::jsonb),
    ('material_issue_type','excess','Excess',20,'{}'::jsonb),
    ('material_issue_type','damaged','Damaged',30,'{}'::jsonb),
    ('material_issue_type','incorrect','Incorrect / wrong material',40,'{}'::jsonb),
    ('material_source_type','another_tower','Another Tower',10,'{"requires_tower":true}'::jsonb),
    ('material_source_type','laydown','Laydown Area',20,'{"requires_location":true}'::jsonb),
    ('material_source_type','warehouse','Project Warehouse',30,'{"requires_location":true}'::jsonb),
    ('material_source_type','supplier','Supplier Delivery',40,'{}'::jsonb),
    ('material_source_type','client_supplied','Client Supplied',50,'{}'::jsonb),
    ('material_source_type','another_project','Another Project',60,'{"requires_reference":true}'::jsonb),
    ('material_source_type','fabricated','Fabricated / Modified',70,'{}'::jsonb),
    ('material_source_type','recovered','Recovered Material',80,'{}'::jsonb),
    ('material_source_type','other','Other',100,'{"requires_notes":true}'::jsonb),
    ('material_location_type','tower','Tower',10,'{}'::jsonb),
    ('material_location_type','laydown','Laydown Area',20,'{}'::jsonb),
    ('material_location_type','warehouse','Warehouse',30,'{}'::jsonb),
    ('material_location_type','yard','Yard',40,'{}'::jsonb),
    ('material_location_type','truck','Truck / In Transit',50,'{}'::jsonb),
    ('material_location_type','other','Other',100,'{}'::jsonb),
    ('material_movement_type','transfer','Transfer',10,'{}'::jsonb),
    ('material_movement_type','supplier_delivery','Supplier Delivery',20,'{}'::jsonb),
    ('material_movement_type','issue_resolution','Issue Resolution',30,'{}'::jsonb),
    ('material_movement_type','return','Return',40,'{}'::jsonb),
    ('material_movement_type','relocation','Relocation',50,'{}'::jsonb),
    ('material_movement_type','installed','Installed / Consumed',60,'{}'::jsonb),
    ('material_movement_type','quarantined','Quarantined',70,'{}'::jsonb),
    ('material_amendment_scope','tower','Specific Tower',10,'{}'::jsonb),
    ('material_amendment_scope','tower_type','Tower Type',20,'{}'::jsonb),
    ('material_amendment_scope','drawing','Drawing',30,'{}'::jsonb),
    ('material_amendment_scope','segment','Tower Segment',40,'{}'::jsonb),
    ('material_amendment_scope','project','Whole Project',50,'{}'::jsonb),
    ('material_amendment_action','add','Add Requirement',10,'{}'::jsonb),
    ('material_amendment_action','replace','Replace Requirement',20,'{}'::jsonb),
    ('material_amendment_action','remove','Remove Requirement',30,'{}'::jsonb),
    ('material_amendment_action','quantity_override','Override Quantity',40,'{}'::jsonb),
    ('material_amendment_action','quantity_delta','Adjust Quantity',50,'{}'::jsonb),
    ('material_amendment_action','note','Note / Clarification',60,'{}'::jsonb),
    ('material_amendment_status','draft','Draft',10,'{"effective":false}'::jsonb),
    ('material_amendment_status','approved','Approved / Effective',20,'{"effective":true}'::jsonb),
    ('material_amendment_status','superseded','Superseded',30,'{"effective":false}'::jsonb),
    ('material_amendment_status','cancelled','Cancelled',40,'{"effective":false}'::jsonb),
    ('material_import_source','bundle_list','Bundle List',10,'{}'::jsonb),
    ('material_import_source','packing_list','Packing List',20,'{}'::jsonb),
    ('material_import_source','member_schedule','Member Schedule',30,'{}'::jsonb),
    ('material_import_source','drawing_schedule','Drawing / Material Schedule',40,'{}'::jsonb),
    ('material_import_source','bolt_packer_schedule','Bolt & Packer Schedule',50,'{}'::jsonb),
    ('material_import_source','custom','Custom',100,'{}'::jsonb)
) as x(option_group, option_key, label, sort_order, settings)
on conflict (project_id, option_group, option_key) do nothing;

-- ---------------------------------------------------------------------------
-- Compatibility: copy existing material_events into issues where sensible.
-- Does not delete or rewrite legacy V2 events.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_issue_id uuid;
  v_issue_no text;
begin
  for r in
    select e.*
    from public.v2_material_events e
    where e.event_type in ('missing','excess','damaged','incorrect','damaged_incorrect')
      and not exists (
        select 1 from public.v2_material_issues i
        where i.metadata->>'legacy_v2_material_event_id' = e.id::text
      )
  loop
    v_issue_no := public.tttracker_v2_next_material_issue_number(r.project_id);
    insert into public.v2_material_issues (
      organisation_id, project_id, issue_number, tower_id, material_item_id,
      issue_type_key, item_reference, description, quantity_affected, unit,
      status, raised_docket_id, raised_at, metadata, origin_organisation_id
    ) values (
      r.organisation_id, r.project_id, v_issue_no, r.tower_id, r.material_item_id,
      case when r.event_type='damaged_incorrect' then 'incorrect' else r.event_type end,
      r.item_reference, r.description, greatest(r.quantity,0), r.unit,
      case when r.status in ('closed','resolved') then 'resolved' else 'open' end,
      r.docket_id, r.occurred_at,
      jsonb_build_object('legacy_v2_material_event_id', r.id::text, 'legacy_status', r.status),
      r.organisation_id
    ) returning id into v_issue_id;

    insert into public.v2_material_issue_events (
      organisation_id, project_id, issue_id, event_type_key, quantity, unit,
      docket_id, notes, occurred_at, metadata
    ) values (
      r.organisation_id, r.project_id, v_issue_id, 'raised', 0, r.unit,
      r.docket_id, r.notes, r.occurred_at,
      jsonb_build_object('legacy_v2_material_event_id', r.id::text)
    );

    if r.status in ('closed','resolved') then
      insert into public.v2_material_issue_events (
        organisation_id, project_id, issue_id, event_type_key, quantity, unit,
        docket_id, notes, occurred_at
      ) values (
        r.organisation_id, r.project_id, v_issue_id, 'resolved_quantity', greatest(r.quantity,0), r.unit,
        r.docket_id, 'Migrated resolved legacy material event', coalesce(r.resolved_at, r.occurred_at)
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS: direct client mutation is blocked. Server routes use service_role after
-- requireProjectContext has authorised the caller. Read-only direct policies
-- can be added later when the Client Portal consumes these tables directly.
-- ---------------------------------------------------------------------------
alter table public.v2_material_bundles enable row level security;
alter table public.v2_material_bundle_members enable row level security;
alter table public.v2_material_bundle_checks enable row level security;
alter table public.v2_material_member_checks enable row level security;
alter table public.v2_material_locations enable row level security;
alter table public.v2_material_issues enable row level security;
alter table public.v2_material_issue_events enable row level security;
alter table public.v2_material_movements enable row level security;
alter table public.v2_material_reservations enable row level security;
alter table public.v2_material_amendments enable row level security;
alter table public.v2_material_amendment_items enable row level security;
alter table public.v2_material_import_profiles enable row level security;
alter table public.v2_material_import_batches enable row level security;
alter table public.v2_material_source_records enable row level security;
alter table public.v2_material_reconciliation_runs enable row level security;
alter table public.v2_material_reconciliation_findings enable row level security;

grant usage on schema private to service_role;
grant execute on function public.tttracker_v2_next_material_issue_number(uuid) to service_role;
grant execute on function public.tttracker_v2_recalculate_material_issue(uuid) to service_role;

grant all privileges on public.v2_material_bundles to service_role;
grant all privileges on public.v2_material_bundle_members to service_role;
grant all privileges on public.v2_material_bundle_checks to service_role;
grant all privileges on public.v2_material_member_checks to service_role;
grant all privileges on public.v2_material_locations to service_role;
grant all privileges on public.v2_material_issues to service_role;
grant all privileges on public.v2_material_issue_events to service_role;
grant all privileges on public.v2_material_movements to service_role;
grant all privileges on public.v2_material_reservations to service_role;
grant all privileges on public.v2_material_amendments to service_role;
grant all privileges on public.v2_material_amendment_items to service_role;
grant all privileges on public.v2_material_import_profiles to service_role;
grant all privileges on public.v2_material_import_batches to service_role;
grant all privileges on public.v2_material_source_records to service_role;
grant all privileges on public.v2_material_reconciliation_runs to service_role;
grant all privileges on public.v2_material_reconciliation_findings to service_role;

grant all privileges on all sequences in schema public to service_role;

commit;
notify pgrst, 'reload schema';

begin;

do $$
begin
  if to_regclass('public.v2_material_bundles') is null then
    raise exception 'Missing prerequisite: public.v2_material_bundles';
  end if;
  if to_regclass('public.v2_material_bundle_checks') is null then
    raise exception 'Missing prerequisite: public.v2_material_bundle_checks';
  end if;
end $$;

create table if not exists public.v2_material_delivery_counters (
  project_id uuid primary key references public.v2_projects(id) on delete cascade,
  next_number bigint not null default 1
);

create or replace function public.tttracker_v2_next_material_delivery_number(
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
  insert into public.v2_material_delivery_counters(project_id, next_number)
  values (p_project_id, 2)
  on conflict (project_id)
  do update set next_number = public.v2_material_delivery_counters.next_number + 1
  returning next_number - 1 into v_number;

  return 'DEL-' || lpad(v_number::text, 5, '0');
end;
$$;

create table if not exists public.v2_material_deliveries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  delivery_number text not null,
  status text not null default 'planned',
  driver_user_id uuid references auth.users(id) on delete set null,
  driver_name text,
  vehicle_reference text,
  supplier_reference text,
  source_location_id uuid references public.v2_material_locations(id) on delete set null,
  destination_location_id uuid references public.v2_material_locations(id) on delete set null,
  scheduled_for timestamptz,
  departed_at timestamptz,
  delivered_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, delivery_number)
);

create index if not exists v2_material_deliveries_project_status_idx
  on public.v2_material_deliveries(project_id, status, created_at desc);

create table if not exists public.v2_material_delivery_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  delivery_id uuid not null references public.v2_material_deliveries(id) on delete cascade,
  tower_id uuid references public.v2_towers(id) on delete set null,
  bundle_id uuid not null references public.v2_material_bundles(id) on delete cascade,
  expected_quantity numeric not null default 1,
  delivered_quantity numeric not null default 0,
  status text not null default 'planned',
  driver_checked_by uuid references auth.users(id) on delete set null,
  driver_checked_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(delivery_id, bundle_id)
);

create index if not exists v2_material_delivery_items_project_idx
  on public.v2_material_delivery_items(project_id, tower_id, bundle_id);

create index if not exists v2_material_delivery_items_delivery_idx
  on public.v2_material_delivery_items(delivery_id, status);

alter table public.v2_material_bundle_checks
  add column if not exists delivery_item_id uuid
    references public.v2_material_delivery_items(id) on delete set null;

create index if not exists v2_material_bundle_checks_delivery_item_idx
  on public.v2_material_bundle_checks(delivery_item_id)
  where delivery_item_id is not null;

alter table public.v2_material_delivery_counters enable row level security;
alter table public.v2_material_deliveries enable row level security;
alter table public.v2_material_delivery_items enable row level security;

grant execute on function public.tttracker_v2_next_material_delivery_number(uuid) to service_role;
grant all privileges on public.v2_material_delivery_counters to service_role;
grant all privileges on public.v2_material_deliveries to service_role;
grant all privileges on public.v2_material_delivery_items to service_role;

commit;
notify pgrst, 'reload schema';

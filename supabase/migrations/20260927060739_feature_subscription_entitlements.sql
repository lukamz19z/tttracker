-- TTTracker V2
-- Migration 005: Feature catalogue, subscription plans and entitlement engine
-- Depends on Migration 004.

begin;

-- ---------------------------------------------------------------------------
-- Feature catalogue
-- Features are independent of plans, so modules can be released, beta-tested,
-- deprecated, withdrawn or moved between subscription plans without code forks.
-- ---------------------------------------------------------------------------

create table if not exists public.v2_features (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null unique,
  name text not null,
  description text,
  category text,
  feature_type text not null default 'module'
    check (feature_type in ('module','capability','limit','integration')),
  value_type text not null default 'boolean'
    check (value_type in ('boolean','integer','decimal','text','json')),
  lifecycle_status text not null default 'draft'
    check (lifecycle_status in ('draft','beta','available','deprecated','disabled')),
  default_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_features_key_not_blank check (btrim(feature_key) <> ''),
  constraint v2_features_name_not_blank check (btrim(name) <> '')
);

drop trigger if exists v2_features_set_updated_at on public.v2_features;
create trigger v2_features_set_updated_at
before update on public.v2_features
for each row execute function private.tttracker_v2_set_updated_at();

-- ---------------------------------------------------------------------------
-- Plans + immutable-ish versions.
-- Plan definitions may evolve; organisations pin to a plan version.
-- ---------------------------------------------------------------------------

create table if not exists public.v2_subscription_plans (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null unique,
  name text not null,
  description text,
  status text not null default 'active'
    check (status in ('draft','active','archived')),
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_subscription_plans_key_not_blank check (btrim(plan_key) <> ''),
  constraint v2_subscription_plans_name_not_blank check (btrim(name) <> '')
);

drop trigger if exists v2_subscription_plans_set_updated_at on public.v2_subscription_plans;
create trigger v2_subscription_plans_set_updated_at
before update on public.v2_subscription_plans
for each row execute function private.tttracker_v2_set_updated_at();

create table if not exists public.v2_subscription_plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.v2_subscription_plans(id) on delete cascade,
  version integer not null,
  status text not null default 'draft'
    check (status in ('draft','active','retired')),
  effective_from timestamptz,
  effective_to timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_subscription_plan_versions_version_positive check (version > 0),
  constraint v2_subscription_plan_versions_unique unique (plan_id, version)
);

drop trigger if exists v2_subscription_plan_versions_set_updated_at on public.v2_subscription_plan_versions;
create trigger v2_subscription_plan_versions_set_updated_at
before update on public.v2_subscription_plan_versions
for each row execute function private.tttracker_v2_set_updated_at();

create table if not exists public.v2_subscription_plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_version_id uuid not null references public.v2_subscription_plan_versions(id) on delete cascade,
  feature_id uuid not null references public.v2_features(id) on delete cascade,
  enabled boolean not null default true,
  value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_subscription_plan_entitlements_unique unique (plan_version_id, feature_id)
);

drop trigger if exists v2_subscription_plan_entitlements_set_updated_at on public.v2_subscription_plan_entitlements;
create trigger v2_subscription_plan_entitlements_set_updated_at
before update on public.v2_subscription_plan_entitlements
for each row execute function private.tttracker_v2_set_updated_at();

-- ---------------------------------------------------------------------------
-- Organisation subscription
-- ---------------------------------------------------------------------------

create table if not exists public.v2_organisation_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  plan_version_id uuid not null references public.v2_subscription_plan_versions(id) on delete restrict,
  status text not null default 'active'
    check (status in ('trial','active','suspended','cancelled','expired')),
  billing_cycle text
    check (billing_cycle is null or billing_cycle in ('monthly','annual','contract','manual')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  external_billing_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists v2_organisation_subscriptions_org_idx
  on public.v2_organisation_subscriptions (organisation_id, status, starts_at desc);

drop trigger if exists v2_organisation_subscriptions_set_updated_at on public.v2_organisation_subscriptions;
create trigger v2_organisation_subscriptions_set_updated_at
before update on public.v2_organisation_subscriptions
for each row execute function private.tttracker_v2_set_updated_at();

-- ---------------------------------------------------------------------------
-- Organisation-specific overrides / add-ons / trials.
-- An override may enable, disable, increase or decrease a plan entitlement.
-- ---------------------------------------------------------------------------

create table if not exists public.v2_organisation_entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  feature_id uuid not null references public.v2_features(id) on delete cascade,
  enabled boolean,
  value jsonb,
  reason text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_organisation_entitlement_overrides_unique
    unique (organisation_id, feature_id)
);

drop trigger if exists v2_organisation_entitlement_overrides_set_updated_at on public.v2_organisation_entitlement_overrides;
create trigger v2_organisation_entitlement_overrides_set_updated_at
before update on public.v2_organisation_entitlement_overrides
for each row execute function private.tttracker_v2_set_updated_at();

-- ---------------------------------------------------------------------------
-- Entitlement resolver.
-- Returns one JSON document:
-- { available, enabled, value, source, lifecycle_status }
-- Global lifecycle disabled always wins.
-- Active organisation override wins over plan.
-- Otherwise use the organisation's current active/trial subscription.
-- ---------------------------------------------------------------------------

create or replace function private.tttracker_v2_get_entitlement(
  target_organisation_id uuid,
  target_feature_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_feature public.v2_features%rowtype;
  v_override public.v2_organisation_entitlement_overrides%rowtype;
  v_plan_enabled boolean;
  v_plan_value jsonb;
begin
  select *
    into v_feature
  from public.v2_features
  where feature_key = target_feature_key
  limit 1;

  if v_feature.id is null then
    return jsonb_build_object(
      'available', false,
      'enabled', false,
      'value', null,
      'source', 'missing_feature'
    );
  end if;

  if v_feature.lifecycle_status = 'disabled' then
    return jsonb_build_object(
      'available', false,
      'enabled', false,
      'value', v_feature.default_value,
      'source', 'feature_disabled',
      'lifecycle_status', v_feature.lifecycle_status
    );
  end if;

  select *
    into v_override
  from public.v2_organisation_entitlement_overrides oeo
  where oeo.organisation_id = target_organisation_id
    and oeo.feature_id = v_feature.id
    and oeo.starts_at <= now()
    and (oeo.ends_at is null or oeo.ends_at > now())
  limit 1;

  if v_override.id is not null then
    return jsonb_build_object(
      'available', true,
      'enabled', coalesce(v_override.enabled, false),
      'value', coalesce(v_override.value, v_feature.default_value),
      'source', 'organisation_override',
      'lifecycle_status', v_feature.lifecycle_status
    );
  end if;

  select spe.enabled, coalesce(spe.value, v_feature.default_value)
    into v_plan_enabled, v_plan_value
  from public.v2_organisation_subscriptions os
  join public.v2_subscription_plan_versions spv
    on spv.id = os.plan_version_id
  join public.v2_subscription_plan_entitlements spe
    on spe.plan_version_id = spv.id
   and spe.feature_id = v_feature.id
  where os.organisation_id = target_organisation_id
    and os.status in ('trial','active')
    and os.starts_at <= now()
    and (os.ends_at is null or os.ends_at > now())
  order by os.starts_at desc, os.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'available', true,
      'enabled', v_plan_enabled,
      'value', v_plan_value,
      'source', 'subscription_plan',
      'lifecycle_status', v_feature.lifecycle_status
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'enabled', false,
    'value', v_feature.default_value,
    'source', 'no_entitlement',
    'lifecycle_status', v_feature.lifecycle_status
  );
end;
$$;

revoke all on function private.tttracker_v2_get_entitlement(uuid, text) from public;
grant execute on function private.tttracker_v2_get_entitlement(uuid, text) to authenticated;

create or replace function private.tttracker_v2_has_feature(
  target_organisation_id uuid,
  target_feature_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (private.tttracker_v2_get_entitlement(target_organisation_id, target_feature_key)->>'enabled')::boolean,
    false
  );
$$;

revoke all on function private.tttracker_v2_has_feature(uuid, text) from public;
grant execute on function private.tttracker_v2_has_feature(uuid, text) to authenticated;

-- RLS: customer users can inspect their own effective commercial setup;
-- only server/platform-admin paths will mutate it.
alter table public.v2_features enable row level security;
alter table public.v2_subscription_plans enable row level security;
alter table public.v2_subscription_plan_versions enable row level security;
alter table public.v2_subscription_plan_entitlements enable row level security;
alter table public.v2_organisation_subscriptions enable row level security;
alter table public.v2_organisation_entitlement_overrides enable row level security;

revoke all on table public.v2_features from anon, authenticated;
revoke all on table public.v2_subscription_plans from anon, authenticated;
revoke all on table public.v2_subscription_plan_versions from anon, authenticated;
revoke all on table public.v2_subscription_plan_entitlements from anon, authenticated;
revoke all on table public.v2_organisation_subscriptions from anon, authenticated;
revoke all on table public.v2_organisation_entitlement_overrides from anon, authenticated;

grant select on table public.v2_features to authenticated;
grant select on table public.v2_subscription_plans to authenticated;
grant select on table public.v2_subscription_plan_versions to authenticated;
grant select on table public.v2_subscription_plan_entitlements to authenticated;
grant select on table public.v2_organisation_subscriptions to authenticated;
grant select on table public.v2_organisation_entitlement_overrides to authenticated;

create policy "authenticated can read available feature catalogue"
on public.v2_features
for select to authenticated
using (lifecycle_status <> 'disabled' or private.tttracker_v2_is_platform_admin());

create policy "authenticated can read active plans"
on public.v2_subscription_plans
for select to authenticated
using (status = 'active' or private.tttracker_v2_is_platform_admin());

create policy "authenticated can read active plan versions"
on public.v2_subscription_plan_versions
for select to authenticated
using (status = 'active' or private.tttracker_v2_is_platform_admin());

create policy "authenticated can read plan entitlements"
on public.v2_subscription_plan_entitlements
for select to authenticated
using (true);

create policy "organisation members or platform admins can read subscriptions"
on public.v2_organisation_subscriptions
for select to authenticated
using (
  private.tttracker_v2_is_platform_admin()
  or private.tttracker_v2_is_organisation_member(organisation_id)
);

create policy "organisation members or platform admins can read entitlement overrides"
on public.v2_organisation_entitlement_overrides
for select to authenticated
using (
  private.tttracker_v2_is_platform_admin()
  or private.tttracker_v2_is_organisation_member(organisation_id)
);

commit;

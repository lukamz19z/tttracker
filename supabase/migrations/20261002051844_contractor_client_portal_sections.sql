-- TTTracker V2
-- Migration 014: Contractor-first Client Portal sections / publishing foundation
--
-- Run after Migration 013 (contractor project parties).
-- This remains contractor-first: the contractor hosts the project and decides
-- what is exposed to each external client/project party.

begin;
do $$
begin
  if to_regclass('public.v2_project_parties') is null then
    raise exception 'V2 prerequisite missing: public.v2_project_parties (run migration 013 first)';
  end if;

  if to_regclass('public.v2_project_party_permission_definitions') is null then
    raise exception 'V2 prerequisite missing: public.v2_project_party_permission_definitions';
  end if;
end
$$;
-- ---------------------------------------------------------------------------
-- External client invitations
-- ---------------------------------------------------------------------------

create table if not exists public.v2_project_party_invitations (
  id uuid primary key default gen_random_uuid(),
  project_party_id uuid not null
    references public.v2_project_parties(id) on delete cascade,
  project_id uuid not null
    references public.v2_projects(id) on delete cascade,
  email text not null,
  display_name text,
  status text not null default 'pending'
    check (status in ('pending','accepted','revoked','expired')),
  invite_token_hash text,
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  expires_at timestamptz,
  last_sent_at timestamptz,
  delivery_status text,
  provider_message_id text,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists v2_project_party_invitation_active_email_uidx
  on public.v2_project_party_invitations(project_party_id, lower(email))
  where status = 'pending';
create index if not exists v2_project_party_invitations_project_idx
  on public.v2_project_party_invitations(project_id, status, invited_at desc);
-- ---------------------------------------------------------------------------
-- Dynamic Client Portal section catalogue
-- ---------------------------------------------------------------------------
-- Organisations can later rename/reorder/enable these without changing React.

create table if not exists public.v2_client_portal_section_definitions (
  id uuid primary key default gen_random_uuid(),
  host_organisation_id uuid not null
    references public.organisations(id) on delete cascade,
  section_key text not null,
  label text not null,
  description text,
  module_key text,
  permission_key text,
  default_enabled boolean not null default false,
  default_sharing_mode text not null default 'summary_only',
  is_active boolean not null default true,
  sort_order integer not null default 100,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(host_organisation_id, section_key)
);
insert into public.v2_client_portal_section_definitions (
  host_organisation_id,
  section_key,
  label,
  description,
  module_key,
  permission_key,
  default_enabled,
  default_sharing_mode,
  sort_order
)
select
  o.id,
  x.section_key,
  x.label,
  x.description,
  x.module_key,
  x.permission_key,
  x.default_enabled,
  x.default_sharing_mode,
  x.sort_order
from public.organisations o
cross join (
  values
    ('project_information','Project Information','Client-facing project summary, scope, contacts and key project information.','projects','project_information.view',true,'live_filtered',10),
    ('personnel_onboarding','Personnel Onboarding','Personnel onboarding information and project onboarding status explicitly shared by the contractor.','people','personnel_onboarding.view',false,'selected_records',20),
    ('lifting_register','Lifting Register','Project lifting register information explicitly shared by the contractor.','safety','lifting_register.view',false,'live_filtered',30),
    ('prestart_register','Prestart Register','Vehicle and plant prestart information explicitly shared by the contractor.','assets','prestart_register.view',false,'live_filtered',40),
    ('assets','Assets','Project-assigned asset information explicitly shared by the contractor.','assets','assets.view',false,'live_filtered',50),
    ('progress','Progress Tracking','Project and tower progress information shared by the contractor.','progress','progress.view',false,'live_filtered',60),
    ('commercial','Commercial Tracking','Commercial information explicitly published by the contractor.','commercial','commercial.view_shared',false,'selected_records',70),
    ('daily_dockets','Daily Dockets','Submitted or published Daily Dockets shared by the contractor.','daily_dockets','daily_dockets.view_submitted',false,'selected_records',80),
    ('materials','Materials','Materials, deliveries and material issues shared by the contractor.','materials','materials.view_shared',false,'selected_records',90),
    ('defects','Defects','Project defects shared by the contractor.','quality','defects.view',false,'selected_records',100),
    ('documents','Documents','Project documents explicitly published by the contractor.','documents','documents.view_shared',false,'selected_records',110),
    ('training','Training & Compliance','Training/compliance information explicitly shared for the project.','training','training.view_shared',false,'selected_records',120)
) as x(
  section_key,
  label,
  description,
  module_key,
  permission_key,
  default_enabled,
  default_sharing_mode,
  sort_order
)
on conflict (host_organisation_id, section_key) do update
set
  label = excluded.label,
  description = excluded.description,
  module_key = excluded.module_key,
  permission_key = excluded.permission_key,
  sort_order = excluded.sort_order;
-- Per-project-party/client overrides.
create table if not exists public.v2_project_party_portal_sections (
  id uuid primary key default gen_random_uuid(),
  project_party_id uuid not null
    references public.v2_project_parties(id) on delete cascade,
  project_id uuid not null
    references public.v2_projects(id) on delete cascade,
  section_key text not null,
  enabled boolean not null default false,
  sharing_mode text not null default 'summary_only',
  label_override text,
  sort_order_override integer,
  allow_download boolean not null default false,
  allow_export boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(project_party_id, section_key)
);
create index if not exists v2_project_party_portal_sections_project_idx
  on public.v2_project_party_portal_sections(project_id, enabled, section_key);
-- ---------------------------------------------------------------------------
-- Expand external client permission catalogue
-- ---------------------------------------------------------------------------

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
  x.permission_key,
  x.label,
  x.description,
  x.module_key,
  false,
  x.sort_order
from public.organisations o
cross join (
  values
    ('portal.view','Access Client Portal','Access the project Client Portal when enabled.','client_portal',5),
    ('project_information.view','View Project Information','View client-facing project information.','projects',10),
    ('personnel_onboarding.view','View Shared Personnel Onboarding','View personnel onboarding information explicitly shared for the project.','people',20),
    ('lifting_register.view','View Lifting Register','View lifting register information explicitly shared for the project.','safety',30),
    ('prestart_register.view','View Prestart Register','View prestart information explicitly shared for the project.','assets',40),
    ('assets.view','View Shared Assets','View project assets explicitly shared by the contractor.','assets',50),
    ('progress.view','View Progress Tracking','View project/tower progress published by the contractor.','progress',60),
    ('forecasting.view','View Shared Forecasting','View forecasting information explicitly shared by the contractor.','progress',65),
    ('commercial.view_shared','View Shared Commercial Tracking','View commercial information explicitly published by the contractor.','commercial',70),
    ('daily_dockets.view_submitted','View Submitted Daily Dockets','View Daily Dockets after the contractor submits or publishes them.','daily_dockets',80),
    ('daily_dockets.comment','Comment on Daily Dockets','Add comments to shared Daily Dockets.','daily_dockets',81),
    ('daily_dockets.approve','Approve Daily Dockets','Approve Daily Dockets when client approval is enabled for the project.','daily_dockets',82),
    ('materials.view_shared','View Shared Materials','View material information published by the contractor.','materials',90),
    ('materials.issues.view','View Material Issues','View missing, excess and other material issues published by the contractor.','materials',91),
    ('defects.view','View Shared Defects','View project defects published by the contractor.','quality',100),
    ('defects.comment','Comment on Defects','Comment on shared defects without editing contractor-owned records.','quality',101),
    ('documents.view_shared','View Shared Documents','View project documents explicitly published to the client.','documents',110),
    ('training.view_shared','View Shared Training & Compliance','View only project training/compliance information explicitly shared.','training',120)
) as x(permission_key,label,description,module_key,sort_order)
on conflict (host_organisation_id, permission_key) do update
set
  label = excluded.label,
  description = excluded.description,
  module_key = excluded.module_key,
  sort_order = excluded.sort_order;
-- ---------------------------------------------------------------------------
-- Selected-record sharing + publication audit
-- ---------------------------------------------------------------------------

alter table public.v2_record_party_shares
  add column if not exists section_key text;
create table if not exists public.v2_project_party_publications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.v2_projects(id) on delete cascade,
  project_party_id uuid not null
    references public.v2_project_parties(id) on delete cascade,
  section_key text not null,
  title text not null,
  description text,
  publication_mode text not null default 'live',
  source_record_type text,
  source_record_id uuid,
  snapshot_payload jsonb,
  status text not null default 'published'
    check (status in ('draft','published','revoked')),
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists v2_project_party_publications_party_idx
  on public.v2_project_party_publications(project_party_id, status, published_at desc);
create index if not exists v2_project_party_publications_source_idx
  on public.v2_project_party_publications(project_id, source_record_type, source_record_id);
-- ---------------------------------------------------------------------------
-- Project-party membership helper
-- ---------------------------------------------------------------------------
-- Migration 014 needs this helper for its RLS policies.
-- Migration 015 creates/replaces the same helper again, which is intentional.

create or replace function private.tttracker_v2_is_party_user(
  p_project_party_id uuid,
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
    where pu.project_party_id = p_project_party_id
      and pu.user_id = p_user_id
      and pu.status = 'active'
      and pp.status = 'active'
      and pp.portal_enabled = true
  );
$$;
-- ---------------------------------------------------------------------------
-- Portal section access helper
-- ---------------------------------------------------------------------------

create or replace function private.tttracker_v2_party_can_view_portal_section(
  p_project_id uuid,
  p_section_key text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  with membership as (
    select
      pu.project_party_id,
      pp.host_organisation_id
    from public.v2_project_party_users pu
    join public.v2_project_parties pp
      on pp.id = pu.project_party_id
    where pu.project_id = p_project_id
      and pu.user_id = p_user_id
      and pu.status = 'active'
      and pp.status = 'active'
      and pp.portal_enabled = true
    limit 1
  ),
  section_config as (
    select
      m.project_party_id,
      d.permission_key,
      coalesce(ps.enabled, d.default_enabled) as enabled
    from membership m
    join public.v2_client_portal_section_definitions d
      on d.host_organisation_id = m.host_organisation_id
     and d.section_key = p_section_key
     and d.is_active = true
    left join public.v2_project_party_portal_sections ps
      on ps.project_party_id = m.project_party_id
     and ps.section_key = d.section_key
    limit 1
  )
  select exists (
    select 1
    from section_config sc
    where sc.enabled = true
      and (
        sc.permission_key is null
        or private.tttracker_v2_external_party_has_permission(
          p_project_id,
          sc.permission_key,
          p_user_id
        )
      )
  );
$$;
-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.v2_project_party_invitations enable row level security;
alter table public.v2_client_portal_section_definitions enable row level security;
alter table public.v2_project_party_portal_sections enable row level security;
alter table public.v2_project_party_publications enable row level security;
drop policy if exists "v2 project party invitations read"
  on public.v2_project_party_invitations;
create policy "v2 project party invitations read"
on public.v2_project_party_invitations
for select
to authenticated
using (
  private.tttracker_v2_is_project_host_member(project_id)
  or accepted_by_user_id = auth.uid()
);
drop policy if exists "v2 client portal section definitions read"
  on public.v2_client_portal_section_definitions;
create policy "v2 client portal section definitions read"
on public.v2_client_portal_section_definitions
for select
to authenticated
using (
  private.tttracker_v2_is_active_org_member(host_organisation_id)
);
drop policy if exists "v2 project party portal sections read"
  on public.v2_project_party_portal_sections;
create policy "v2 project party portal sections read"
on public.v2_project_party_portal_sections
for select
to authenticated
using (
  private.tttracker_v2_is_project_host_member(project_id)
  or private.tttracker_v2_is_party_user(project_party_id, auth.uid())
);
drop policy if exists "v2 project party publications read"
  on public.v2_project_party_publications;
create policy "v2 project party publications read"
on public.v2_project_party_publications
for select
to authenticated
using (
  private.tttracker_v2_is_project_host_member(project_id)
  or (
    status = 'published'
    and private.tttracker_v2_is_party_user(project_party_id, auth.uid())
  )
);
-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant usage on schema private to authenticated, service_role;
grant execute on function
  private.tttracker_v2_is_party_user(uuid, uuid)
to authenticated, service_role;
grant execute on function
  private.tttracker_v2_party_can_view_portal_section(uuid, text, uuid)
to authenticated, service_role;
grant select on public.v2_project_party_invitations to authenticated;
grant select on public.v2_client_portal_section_definitions to authenticated;
grant select on public.v2_project_party_portal_sections to authenticated;
grant select on public.v2_project_party_publications to authenticated;
grant all privileges on public.v2_project_party_invitations to service_role;
grant all privileges on public.v2_client_portal_section_definitions to service_role;
grant all privileges on public.v2_project_party_portal_sections to service_role;
grant all privileges on public.v2_project_party_publications to service_role;
commit;
notify pgrst, 'reload schema';

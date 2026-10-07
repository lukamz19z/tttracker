-- TTTracker V2
-- Migration 015: Bilateral / host-agnostic project access foundation
--
-- Purpose
-- -------
-- Extend the contractor-first Client Portal backend so project parties can
-- securely exchange access in either direction without changing ownership of
-- their organisation data.
--
-- Current product focus remains contractor-hosted projects:
--   Contractor hosts project -> contractor grants selected client access.
--
-- This migration additionally prepares the same backend for:
--   Client-hosted project -> client grants contractor project access.
--   Client shares its own project records/instructions with contractor.
--   Contractor shares its own operational records with client.
--   Either party can request access to information owned by the other party.
--   Access grants/revocations are auditable and can be scoped to a project,
--   portal section, or individual record.
--
-- IMPORTANT SECURITY MODEL
-- ------------------------
-- Project access does NOT imply organisation-wide access.
-- A party may only publish/share information it owns or is authorised to share.
-- Internal contractor/host users continue to use the existing V2 RBAC engine.
-- External party users use the project-party permission engine.
-- Mutations should continue to run through authorised server routes/service role.
--
-- Requires migrations 013 and 014.

begin;

-- ---------------------------------------------------------------------------
-- 0. Prerequisite checks
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.v2_project_parties') is null then
    raise exception 'V2 prerequisite missing: migration 013 / public.v2_project_parties';
  end if;

  if to_regclass('public.v2_project_party_users') is null then
    raise exception 'V2 prerequisite missing: migration 013 / public.v2_project_party_users';
  end if;

  if to_regclass('public.v2_project_party_permissions') is null then
    raise exception 'V2 prerequisite missing: migration 013 / public.v2_project_party_permissions';
  end if;

  if to_regclass('public.v2_record_party_shares') is null then
    raise exception 'V2 prerequisite missing: migration 013 / public.v2_record_party_shares';
  end if;

  if to_regclass('public.v2_project_party_publications') is null then
    raise exception 'V2 prerequisite missing: migration 014 / public.v2_project_party_publications';
  end if;
end
$$;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 1. Party-to-party access grants
-- ---------------------------------------------------------------------------
-- A grant records WHO granted access, WHO received it, WHAT capability was
-- granted and HOW NARROWLY it applies.
--
-- scope_type is data-driven text rather than a DB enum. Initial application
-- values are:
--   project
--   section
--   record
--
-- The grantor and grantee must be different project parties. Cross-project
-- party IDs are blocked by the trigger below.

create table if not exists public.v2_project_party_access_grants (
  id uuid primary key default gen_random_uuid(),

  project_id uuid not null
    references public.v2_projects(id) on delete cascade,

  grantor_project_party_id uuid not null
    references public.v2_project_parties(id) on delete cascade,

  grantee_project_party_id uuid not null
    references public.v2_project_parties(id) on delete cascade,

  permission_key text not null,

  scope_type text not null default 'project',
  section_key text,
  record_type text,
  record_id uuid,

  status text not null default 'active'
    check (status in ('active','revoked','expired')),

  valid_from timestamptz not null default now(),
  valid_until timestamptz,

  reason text,
  metadata jsonb not null default '{}'::jsonb,

  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),

  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revocation_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (grantor_project_party_id <> grantee_project_party_id)
);

create index if not exists v2_party_access_grants_grantee_idx
  on public.v2_project_party_access_grants(
    project_id,
    grantee_project_party_id,
    status,
    permission_key
  );

create index if not exists v2_party_access_grants_grantor_idx
  on public.v2_project_party_access_grants(
    project_id,
    grantor_project_party_id,
    status,
    permission_key
  );

create index if not exists v2_party_access_grants_record_idx
  on public.v2_project_party_access_grants(
    project_id,
    record_type,
    record_id
  )
  where record_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Access requests
-- ---------------------------------------------------------------------------
-- A party can ask another party for access instead of relying on informal
-- email/phone requests. Approval should create the corresponding access grant
-- through an authorised server route.

create table if not exists public.v2_project_party_access_requests (
  id uuid primary key default gen_random_uuid(),

  project_id uuid not null
    references public.v2_projects(id) on delete cascade,

  requesting_project_party_id uuid not null
    references public.v2_project_parties(id) on delete cascade,

  target_project_party_id uuid not null
    references public.v2_project_parties(id) on delete cascade,

  permission_key text not null,

  scope_type text not null default 'project',
  section_key text,
  record_type text,
  record_id uuid,

  request_message text,

  status text not null default 'pending'
    check (status in ('pending','approved','declined','cancelled','expired')),

  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),

  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  response_message text,

  resulting_grant_id uuid
    references public.v2_project_party_access_grants(id) on delete set null,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (requesting_project_party_id <> target_project_party_id)
);

create index if not exists v2_party_access_requests_target_idx
  on public.v2_project_party_access_requests(
    project_id,
    target_project_party_id,
    status,
    requested_at desc
  );

create index if not exists v2_party_access_requests_requestor_idx
  on public.v2_project_party_access_requests(
    project_id,
    requesting_project_party_id,
    status,
    requested_at desc
  );

-- ---------------------------------------------------------------------------
-- 3. Access/sharing audit log
-- ---------------------------------------------------------------------------
-- This provides one chronological source for future Project > Access history.
-- The application can add events for invitations, grants, revocations,
-- requests, publications, section changes, approvals and similar events.

create table if not exists public.v2_project_party_access_events (
  id uuid primary key default gen_random_uuid(),

  project_id uuid not null
    references public.v2_projects(id) on delete cascade,

  actor_project_party_id uuid
    references public.v2_project_parties(id) on delete set null,

  target_project_party_id uuid
    references public.v2_project_parties(id) on delete set null,

  event_type text not null,

  permission_key text,
  section_key text,
  record_type text,
  record_id uuid,

  source_table text,
  source_record_id uuid,

  performed_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),

  details jsonb not null default '{}'::jsonb
);

create index if not exists v2_party_access_events_project_idx
  on public.v2_project_party_access_events(
    project_id,
    occurred_at desc
  );

create index if not exists v2_party_access_events_party_idx
  on public.v2_project_party_access_events(
    target_project_party_id,
    occurred_at desc
  );

-- ---------------------------------------------------------------------------
-- 4. Add project-party ownership to shared records/publications
-- ---------------------------------------------------------------------------
-- Existing migrations use project_party_id as the receiving party.
-- We keep that column for compatibility and add an explicit source/owner party.
--
-- This means both directions work:
--   contractor-owned record -> client recipient
--   client-owned record     -> contractor recipient

alter table public.v2_record_party_shares
  add column if not exists owner_project_party_id uuid
    references public.v2_project_parties(id) on delete set null,
  add column if not exists shared_by_project_party_id uuid
    references public.v2_project_parties(id) on delete set null;

alter table public.v2_project_party_publications
  add column if not exists source_project_party_id uuid
    references public.v2_project_parties(id) on delete set null;

comment on column public.v2_record_party_shares.project_party_id is
  'Receiving project party retained for compatibility.';

comment on column public.v2_record_party_shares.owner_project_party_id is
  'Project party that owns/originated the shared record.';

comment on column public.v2_project_party_publications.project_party_id is
  'Receiving project party retained for compatibility.';

comment on column public.v2_project_party_publications.source_project_party_id is
  'Project party publishing/owning the information.';

-- Backfill existing contractor-first shares/publications to the project host.
update public.v2_record_party_shares s
set
  owner_project_party_id = host_party.id,
  shared_by_project_party_id = coalesce(s.shared_by_project_party_id, host_party.id)
from public.v2_project_parties host_party
where host_party.project_id = s.project_id
  and host_party.is_host = true
  and host_party.status <> 'removed'
  and s.owner_project_party_id is null;

update public.v2_project_party_publications ppub
set source_project_party_id = host_party.id
from public.v2_project_parties host_party
where host_party.project_id = ppub.project_id
  and host_party.is_host = true
  and host_party.status <> 'removed'
  and ppub.source_project_party_id is null;

create index if not exists v2_record_party_shares_owner_idx
  on public.v2_record_party_shares(
    project_id,
    owner_project_party_id,
    record_type
  )
  where is_active = true;

create index if not exists v2_project_party_publications_source_party_idx
  on public.v2_project_party_publications(
    project_id,
    source_project_party_id,
    status,
    published_at desc
  );

-- ---------------------------------------------------------------------------
-- 5. Add origin_project_party_id to operational records when those tables exist
-- ---------------------------------------------------------------------------
-- origin_organisation_id answers "which organisation owns this record?"
-- origin_project_party_id answers "which party owns it inside this project?"
--
-- Existing contractor-hosted rows are backfilled to the host party.

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'v2_daily_dockets',
    'v2_material_register',
    'v2_material_events',
    'v2_defects',
    'v2_project_production_actuals'
  ]
  loop
    if to_regclass('public.' || tbl) is not null then
      execute format(
        'alter table public.%I
           add column if not exists origin_project_party_id uuid
             references public.v2_project_parties(id) on delete set null',
        tbl
      );

      execute format(
        'update public.%I item
         set origin_project_party_id = host_party.id
         from public.v2_project_parties host_party
         where host_party.project_id = item.project_id
           and host_party.is_host = true
           and host_party.status <> ''removed''
           and item.origin_project_party_id is null',
        tbl
      );

      execute format(
        'create index if not exists %I
           on public.%I(project_id, origin_project_party_id)',
        tbl || '_origin_party_idx',
        tbl
      );
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Project-party administration permission catalogue
-- ---------------------------------------------------------------------------
-- These capabilities are organisation-configurable permission definitions.
-- They establish what a project party may do; they do not grant access merely
-- by existing in the catalogue.
--
-- Internal host users should still be checked through the existing internal V2
-- RBAC before server routes perform these actions.

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
  seed.permission_key,
  seed.label,
  seed.description,
  'client_portal',
  false,
  seed.sort_order
from public.organisations o
cross join (
  values
    ('project_parties.view', 'View Project Parties', 'View organisations/parties participating in the project.', 200),
    ('project_parties.manage', 'Manage Project Parties', 'Add, suspend and manage project parties when authorised by the project host.', 201),
    ('party_users.invite', 'Invite Party Users', 'Invite users into the party project workspace.', 210),
    ('party_users.remove', 'Remove Party Users', 'Remove or suspend users belonging to the party project workspace.', 211),
    ('party_access.view', 'View Party Access', 'View party-to-party access grants and access history.', 220),
    ('party_access.request', 'Request Party Access', 'Request access to another party''s project information.', 221),
    ('party_access.respond', 'Respond to Access Requests', 'Approve or decline access requests addressed to this party.', 222),
    ('party_access.grant', 'Grant Party Access', 'Grant another project party access to information this party is authorised to share.', 223),
    ('party_access.revoke', 'Revoke Party Access', 'Revoke access previously granted by this party.', 224),
    ('party_sections.configure', 'Configure Shared Sections', 'Configure which project information sections are shared with another party.', 230),
    ('party_records.publish', 'Publish Party Records', 'Publish/share records owned by this party to another project party.', 240),
    ('party_records.revoke', 'Revoke Published Records', 'Revoke records previously shared by this party.', 241),
    ('party_reviews.perform', 'Perform External Reviews', 'Perform comments/reviews/approvals where the underlying workflow permits it.', 250)
) as seed(permission_key, label, description, sort_order)
on conflict (host_organisation_id, permission_key) do update
set
  label = excluded.label,
  description = excluded.description,
  module_key = excluded.module_key,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 7. Cross-project party validation
-- ---------------------------------------------------------------------------
-- Stops accidental/malicious grants between parties belonging to different
-- projects.

create or replace function private.tttracker_v2_validate_party_access_scope()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_first_project uuid;
  v_second_project uuid;
begin
  if tg_table_name = 'v2_project_party_access_grants' then
    select project_id into v_first_project
    from public.v2_project_parties
    where id = new.grantor_project_party_id;

    select project_id into v_second_project
    from public.v2_project_parties
    where id = new.grantee_project_party_id;

  elsif tg_table_name = 'v2_project_party_access_requests' then
    select project_id into v_first_project
    from public.v2_project_parties
    where id = new.requesting_project_party_id;

    select project_id into v_second_project
    from public.v2_project_parties
    where id = new.target_project_party_id;
  else
    raise exception 'Unsupported table for TTTracker party access validator: %', tg_table_name;
  end if;

  if v_first_project is null or v_second_project is null then
    raise exception 'One or more project parties could not be resolved.';
  end if;

  if v_first_project <> new.project_id or v_second_project <> new.project_id then
    raise exception 'Project-party access cannot cross project boundaries.';
  end if;

  return new;
end
$$;

drop trigger if exists v2_party_access_grants_validate_scope
  on public.v2_project_party_access_grants;
create trigger v2_party_access_grants_validate_scope
before insert or update on public.v2_project_party_access_grants
for each row execute function private.tttracker_v2_validate_party_access_scope();

drop trigger if exists v2_party_access_requests_validate_scope
  on public.v2_project_party_access_requests;
create trigger v2_party_access_requests_validate_scope
before insert or update on public.v2_project_party_access_requests
for each row execute function private.tttracker_v2_validate_party_access_scope();

-- ---------------------------------------------------------------------------
-- 8. Access helpers
-- ---------------------------------------------------------------------------

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

-- Resolve an active grant to one of the user's parties.
-- Scope matching deliberately treats NULL supplied scope values as project-only
-- checks so a record/section grant does not accidentally become project-wide.
create or replace function private.tttracker_v2_user_has_scoped_party_grant(
  p_project_id uuid,
  p_permission_key text,
  p_section_key text default null,
  p_record_type text default null,
  p_record_id uuid default null,
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
    from public.v2_project_party_access_grants g
    join public.v2_project_party_users pu
      on pu.project_party_id = g.grantee_project_party_id
    join public.v2_project_parties grantee
      on grantee.id = g.grantee_project_party_id
    join public.v2_project_parties grantor
      on grantor.id = g.grantor_project_party_id
    where g.project_id = p_project_id
      and pu.user_id = p_user_id
      and pu.status = 'active'
      and grantee.status = 'active'
      and grantee.portal_enabled = true
      and grantor.status = 'active'
      and g.permission_key = p_permission_key
      and g.status = 'active'
      and g.valid_from <= now()
      and (g.valid_until is null or g.valid_until > now())
      and (
        g.scope_type = 'project'
        or (
          g.scope_type = 'section'
          and p_section_key is not null
          and g.section_key = p_section_key
        )
        or (
          g.scope_type = 'record'
          and p_record_type is not null
          and p_record_id is not null
          and g.record_type = p_record_type
          and g.record_id = p_record_id
        )
      )
  );
$$;

-- Existing external party permission resolution remains the baseline.
-- Active project-scoped bilateral grants can additionally grant the capability.
create or replace function private.tttracker_v2_external_party_has_permission(
  p_project_id uuid,
  p_permission_key text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  with memberships as (
    select
      pu.id as party_user_id,
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
  ),
  resolved as (
    select
      m.party_user_id,
      coalesce(
        (
          select upo.allowed
          from public.v2_project_party_user_permission_overrides upo
          where upo.project_party_user_id = m.party_user_id
            and upo.permission_key = p_permission_key
          limit 1
        ),
        (
          select party_permission.allowed
          from public.v2_project_party_permissions party_permission
          where party_permission.project_party_id = m.project_party_id
            and party_permission.permission_key = p_permission_key
          limit 1
        ),
        (
          select pd.default_allowed
          from public.v2_project_party_permission_definitions pd
          where pd.host_organisation_id = m.host_organisation_id
            and pd.permission_key = p_permission_key
            and pd.is_active = true
          limit 1
        ),
        false
      ) as allowed
    from memberships m
  )
  select
    exists (
      select 1
      from resolved
      where allowed = true
    )
    or private.tttracker_v2_user_has_scoped_party_grant(
      p_project_id,
      p_permission_key,
      null,
      null,
      null,
      p_user_id
    );
$$;

-- Host-agnostic scoped permission helper for future APIs.
create or replace function private.tttracker_v2_user_has_project_party_access(
  p_project_id uuid,
  p_permission_key text,
  p_section_key text default null,
  p_record_type text default null,
  p_record_id uuid default null,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    private.tttracker_v2_external_party_has_permission(
      p_project_id,
      p_permission_key,
      p_user_id
    )
    or private.tttracker_v2_user_has_scoped_party_grant(
      p_project_id,
      p_permission_key,
      p_section_key,
      p_record_type,
      p_record_id,
      p_user_id
    );
$$;

-- ---------------------------------------------------------------------------
-- 9. Update portal-section helper to recognise section-scoped grants
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
  with memberships as (
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
  ),
  section_config as (
    select
      m.project_party_id,
      d.permission_key,
      coalesce(ps.enabled, d.default_enabled) as enabled
    from memberships m
    join public.v2_client_portal_section_definitions d
      on d.host_organisation_id = m.host_organisation_id
     and d.section_key = p_section_key
     and d.is_active = true
    left join public.v2_project_party_portal_sections ps
      on ps.project_party_id = m.project_party_id
     and ps.section_key = d.section_key
  )
  select exists (
    select 1
    from section_config sc
    where sc.enabled = true
      and (
        sc.permission_key is null
        or private.tttracker_v2_user_has_project_party_access(
          p_project_id,
          sc.permission_key,
          p_section_key,
          null,
          null,
          p_user_id
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 10. Update record-sharing helper so both source and recipient can inspect a
--     share, while recipient access remains limited to explicit shares.
-- ---------------------------------------------------------------------------

create or replace function private.tttracker_v2_record_is_shared_with_user(
  p_project_id uuid,
  p_record_type text,
  p_record_id uuid,
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
    from public.v2_record_party_shares s
    join public.v2_project_party_users pu
      on pu.project_party_id = s.project_party_id
    join public.v2_project_parties recipient
      on recipient.id = s.project_party_id
    where s.project_id = p_project_id
      and s.record_type = p_record_type
      and s.record_id = p_record_id
      and s.is_active = true
      and pu.user_id = p_user_id
      and pu.status = 'active'
      and recipient.status = 'active'
      and recipient.portal_enabled = true
  );
$$;

-- ---------------------------------------------------------------------------
-- 11. RLS for bilateral access tables
-- ---------------------------------------------------------------------------

alter table public.v2_project_party_access_grants enable row level security;
alter table public.v2_project_party_access_requests enable row level security;
alter table public.v2_project_party_access_events enable row level security;

-- Existing party users can read grants involving their party; host members can
-- inspect all project grants. Mutations remain server-side/service-role only.
drop policy if exists "v2 bilateral grants read"
  on public.v2_project_party_access_grants;
create policy "v2 bilateral grants read"
on public.v2_project_party_access_grants
for select
to authenticated
using (
  private.tttracker_v2_is_project_host_member(project_id)
  or private.tttracker_v2_is_party_user(grantor_project_party_id)
  or private.tttracker_v2_is_party_user(grantee_project_party_id)
);

drop policy if exists "v2 bilateral requests read"
  on public.v2_project_party_access_requests;
create policy "v2 bilateral requests read"
on public.v2_project_party_access_requests
for select
to authenticated
using (
  private.tttracker_v2_is_project_host_member(project_id)
  or private.tttracker_v2_is_party_user(requesting_project_party_id)
  or private.tttracker_v2_is_party_user(target_project_party_id)
);

drop policy if exists "v2 bilateral access events read"
  on public.v2_project_party_access_events;
create policy "v2 bilateral access events read"
on public.v2_project_party_access_events
for select
to authenticated
using (
  private.tttracker_v2_is_project_host_member(project_id)
  or (
    actor_project_party_id is not null
    and private.tttracker_v2_is_party_user(actor_project_party_id)
  )
  or (
    target_project_party_id is not null
    and private.tttracker_v2_is_party_user(target_project_party_id)
  )
);

-- Expand existing share/publication read policies so the source/owner party can
-- see the records it has shared, not only the receiving party.
drop policy if exists "v2 record party shares read"
  on public.v2_record_party_shares;
create policy "v2 record party shares read"
on public.v2_record_party_shares
for select
to authenticated
using (
  private.tttracker_v2_is_project_host_member(project_id)
  or private.tttracker_v2_is_party_user(project_party_id)
  or (
    owner_project_party_id is not null
    and private.tttracker_v2_is_party_user(owner_project_party_id)
  )
  or (
    shared_by_project_party_id is not null
    and private.tttracker_v2_is_party_user(shared_by_project_party_id)
  )
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
    and private.tttracker_v2_is_party_user(project_party_id)
  )
  or (
    source_project_party_id is not null
    and private.tttracker_v2_is_party_user(source_project_party_id)
  )
);

-- ---------------------------------------------------------------------------
-- 12. Grants
-- ---------------------------------------------------------------------------

grant usage on schema private to authenticated, service_role;

grant execute on function
  private.tttracker_v2_is_party_user(uuid, uuid)
to authenticated, service_role;

grant execute on function
  private.tttracker_v2_user_has_scoped_party_grant(uuid, text, text, text, uuid, uuid)
to authenticated, service_role;

grant execute on function
  private.tttracker_v2_external_party_has_permission(uuid, text, uuid)
to authenticated, service_role;

grant execute on function
  private.tttracker_v2_user_has_project_party_access(uuid, text, text, text, uuid, uuid)
to authenticated, service_role;

grant execute on function
  private.tttracker_v2_party_can_view_portal_section(uuid, text, uuid)
to authenticated, service_role;

grant execute on function
  private.tttracker_v2_record_is_shared_with_user(uuid, text, uuid, uuid)
to authenticated, service_role;

grant select on public.v2_project_party_access_grants to authenticated;
grant select on public.v2_project_party_access_requests to authenticated;
grant select on public.v2_project_party_access_events to authenticated;

grant all privileges on public.v2_project_party_access_grants to service_role;
grant all privileges on public.v2_project_party_access_requests to service_role;
grant all privileges on public.v2_project_party_access_events to service_role;

commit;

notify pgrst, 'reload schema';

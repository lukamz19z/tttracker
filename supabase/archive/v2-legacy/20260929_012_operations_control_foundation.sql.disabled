-- TTTracker V2
-- Migration 012: Project operations control foundation
-- Date: 2026-09-29
--
-- Purpose
--   1. Keep Daily Docket / Materials dropdown values in data, not TypeScript.
--   2. Resolve configuration at platform -> organisation -> project level.
--   3. Store organisation/project Daily Docket review behaviour.
--   4. Keep internal reviewers as individually selected users.
--   5. Allow client approval to be enabled/disabled without changing the editor.
--
-- This migration does NOT replace the existing V1 operational tables yet.
-- The project-level pages in this package intentionally read the proven V1
-- operational tables while the V2 data model is migrated in controlled stages.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- MODULE OPTIONS
-- -----------------------------------------------------------------------------

create table if not exists public.v2_module_options (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid null references public.organisations(id) on delete cascade,
  project_id uuid null references public.v2_projects(id) on delete cascade,
  module_key text not null,
  option_group text not null,
  code text not null,
  label text not null,
  behavior text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_module_options_project_requires_org
    check (project_id is null or organisation_id is not null)
);

create unique index if not exists v2_module_options_global_uidx
  on public.v2_module_options(module_key, option_group, code)
  where organisation_id is null and project_id is null;

create unique index if not exists v2_module_options_org_uidx
  on public.v2_module_options(organisation_id, module_key, option_group, code)
  where organisation_id is not null and project_id is null;

create unique index if not exists v2_module_options_project_uidx
  on public.v2_module_options(project_id, module_key, option_group, code)
  where project_id is not null;

create index if not exists v2_module_options_lookup_idx
  on public.v2_module_options(module_key, option_group, organisation_id, project_id, sort_order);

-- -----------------------------------------------------------------------------
-- DAILY DOCKET REVIEW SETTINGS
-- -----------------------------------------------------------------------------

create table if not exists public.v2_daily_docket_review_settings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid null references public.v2_projects(id) on delete cascade,

  internal_review_required boolean not null default true,
  client_approval_enabled boolean not null default false,
  require_submitter_signature boolean not null default true,
  client_can_request_changes boolean not null default true,
  publish_after_final_approval boolean not null default true,

  -- JSON array of configured client-visible content keys.
  -- The editor/review screen takes a revision snapshot when a docket enters review.
  client_content_keys jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

create unique index if not exists v2_daily_docket_review_settings_org_uidx
  on public.v2_daily_docket_review_settings(organisation_id)
  where project_id is null;

create unique index if not exists v2_daily_docket_review_settings_project_uidx
  on public.v2_daily_docket_review_settings(project_id)
  where project_id is not null;

-- Internal reviewers remain explicit people, not role names.
create table if not exists public.v2_daily_docket_reviewers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid null references public.v2_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  receives_review boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null
);

create unique index if not exists v2_daily_docket_reviewers_org_user_uidx
  on public.v2_daily_docket_reviewers(organisation_id, user_id)
  where project_id is null;

create unique index if not exists v2_daily_docket_reviewers_project_user_uidx
  on public.v2_daily_docket_reviewers(project_id, user_id)
  where project_id is not null;

-- External/client recipients are separate from authenticated internal reviewers.
create table if not exists public.v2_daily_docket_client_contacts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.v2_projects(id) on delete cascade,
  name text not null,
  email text not null,
  is_active boolean not null default true,
  receives_approval boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null
);

create unique index if not exists v2_daily_docket_client_contacts_project_email_uidx
  on public.v2_daily_docket_client_contacts(project_id, lower(email));

-- -----------------------------------------------------------------------------
-- DEFAULT CONFIGURATION
-- behavior is the stable value used by operational logic.
-- label is the user-facing text that an organisation/project can override.
-- -----------------------------------------------------------------------------

insert into public.v2_module_options
  (organisation_id, project_id, module_key, option_group, code, label, behavior, sort_order, metadata)
values
  -- Materials: what happened
  (null, null, 'materials', 'event_type', 'missing', 'Missing material', 'missing', 10, '{"commercial_capability":true}'::jsonb),
  (null, null, 'materials', 'event_type', 'found_received', 'Found / Received / Delivered', 'found_received', 20, '{}'::jsonb),
  (null, null, 'materials', 'event_type', 'taken_from_another_tower', 'Taken from another tower', 'taken_from_another_tower', 30, '{"requires_source_tower":true}'::jsonb),
  (null, null, 'materials', 'event_type', 'sent_to_another_tower', 'Sent to another tower', 'sent_to_another_tower', 40, '{"requires_destination_tower":true}'::jsonb),
  (null, null, 'materials', 'event_type', 'excess', 'Excess material', 'excess', 50, '{}'::jsonb),
  (null, null, 'materials', 'event_type', 'damaged_incorrect', 'Damaged / Incorrect', 'damaged_incorrect', 60, '{}'::jsonb),

  -- Materials: effect on work
  (null, null, 'materials', 'work_outcome', 'stopped_work', 'Couldn''t continue', 'stopped_work', 10, '{"commercial_impact":"Delayed"}'::jsonb),
  (null, null, 'materials', 'work_outcome', 'slowed_down', 'Could continue but slower', 'slowed_down', 20, '{"commercial_impact":"Disrupted"}'::jsonb),
  (null, null, 'materials', 'work_outcome', 'changed_sequence', 'Moved onto another section / task', 'changed_sequence', 30, '{"commercial_impact":"Resequenced"}'::jsonb),
  (null, null, 'materials', 'work_outcome', 'minor_impact', 'No meaningful effect', 'minor_impact', 40, '{"commercial_impact":"No material impact"}'::jsonb),

  -- Materials: current effect
  (null, null, 'materials', 'current_effect', 'waiting_material', 'Waiting for material', 'Waiting for material', 10, '{}'::jsonb),
  (null, null, 'materials', 'current_effect', 'work_stopped', 'Work stopped', 'Erection stopped', 20, '{}'::jsonb),
  (null, null, 'materials', 'current_effect', 'working_other_section', 'Working on another section', 'Working on another section', 30, '{}'::jsonb),
  (null, null, 'materials', 'current_effect', 'resolved', 'Resolved', 'Resolved', 40, '{}'::jsonb),
  (null, null, 'materials', 'current_effect', 'awaiting_confirmation', 'Unknown / awaiting confirmation', 'Unknown / awaiting confirmation', 50, '{}'::jsonb),

  -- Materials: mitigation / alternative work
  (null, null, 'materials', 'mitigation_action', 'move_personnel', 'Moved personnel to another activity', 'Moved personnel to another activity', 10, '{}'::jsonb),
  (null, null, 'materials', 'mitigation_action', 'assemble_other_section', 'Assembled another section', 'Assembled another section', 20, '{}'::jsonb),
  (null, null, 'materials', 'mitigation_action', 'check_other_bundles', 'Checked other bundles', 'Checked other bundles', 30, '{}'::jsonb),
  (null, null, 'materials', 'mitigation_action', 'resequence', 'Resequenced planned work', 'Resequenced planned work', 40, '{}'::jsonb),
  (null, null, 'materials', 'mitigation_action', 'assist_client', 'Assisted client to locate / verify material', 'Assisted client to locate / verify material', 50, '{}'::jsonb),

  -- Materials: unlisted/manual item categories
  (null, null, 'materials', 'manual_category', 'steel_member', 'Steel member', 'Steel member', 10, '{}'::jsonb),
  (null, null, 'materials', 'manual_category', 'bolt', 'Bolt', 'Bolt', 20, '{}'::jsonb),
  (null, null, 'materials', 'manual_category', 'packer', 'Packer', 'Packer', 30, '{}'::jsonb),
  (null, null, 'materials', 'manual_category', 'bracket', 'Bracket / fitting', 'Bracket / fitting', 40, '{}'::jsonb),
  (null, null, 'materials', 'manual_category', 'other', 'Other', 'Other', 100, '{}'::jsonb),

  -- Daily Dockets: delay categories
  (null, null, 'daily_dockets', 'delay_type', 'weather', 'Weather', 'weather', 10, '{}'::jsonb),
  (null, null, 'daily_dockets', 'delay_type', 'lightning', 'Lightning', 'lightning', 20, '{}'::jsonb),
  (null, null, 'daily_dockets', 'delay_type', 'toolbox', 'Toolbox / standby', 'toolbox', 30, '{}'::jsonb),
  (null, null, 'daily_dockets', 'delay_type', 'mobilisation', 'Mobilisation', 'mobilisation', 40, '{}'::jsonb),
  (null, null, 'daily_dockets', 'delay_type', 'access', 'Access / bogged', 'access', 50, '{}'::jsonb),
  (null, null, 'daily_dockets', 'delay_type', 'plant', 'Plant issue', 'plant', 60, '{}'::jsonb),
  (null, null, 'daily_dockets', 'delay_type', 'materials', 'Material issue', 'materials', 70, '{}'::jsonb),
  (null, null, 'daily_dockets', 'delay_type', 'other', 'Other', 'other', 100, '{}'::jsonb),

  -- Daily Dockets: production activity
  (null, null, 'daily_dockets', 'production_activity', 'assembly', 'Assembly', 'assembly', 10, '{}'::jsonb),
  (null, null, 'daily_dockets', 'production_activity', 'erection', 'Erection', 'erection', 20, '{}'::jsonb),
  (null, null, 'daily_dockets', 'production_activity', 'mixed', 'Assembly + Erection', 'mixed', 30, '{}'::jsonb),
  (null, null, 'daily_dockets', 'production_activity', 'rectification', 'Rectification / revision', 'rectification', 40, '{}'::jsonb),
  (null, null, 'daily_dockets', 'production_activity', 'other', 'Other', 'other', 100, '{}'::jsonb)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.v2_module_options enable row level security;
alter table public.v2_daily_docket_review_settings enable row level security;
alter table public.v2_daily_docket_reviewers enable row level security;
alter table public.v2_daily_docket_client_contacts enable row level security;

-- Organisation access helper.
create or replace function public.v2_user_can_access_organisation(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_organisation_id is null
    or exists (
      select 1
      from public.organisation_users ou
      where ou.organisation_id = p_organisation_id
        and ou.user_id = auth.uid()
        and coalesce(ou.status, 'active') = 'active'
    )
    or exists (
      select 1
      from public.v2_project_users pu
      where pu.organisation_id = p_organisation_id
        and pu.user_id = auth.uid()
        and coalesce(pu.status, 'active') = 'active'
    );
$$;

-- Configuration management helper.
-- Full-access administrators or project admins may manage project operational config.
create or replace function public.v2_user_can_manage_operations_config(
  p_organisation_id uuid,
  p_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.user_role_assignments ura
      join public.roles r on r.id = ura.role_id
      where ura.user_id = auth.uid()
        and r.is_active = true
        and r.grants_all = true
    )
    or (
      p_project_id is not null
      and exists (
        select 1
        from public.v2_project_users pu
        where pu.project_id = p_project_id
          and pu.user_id = auth.uid()
          and coalesce(pu.status, 'active') = 'active'
          and lower(coalesce(pu.access_level, '')) in ('admin', 'owner')
      )
    );
$$;

drop policy if exists v2_module_options_read on public.v2_module_options;
create policy v2_module_options_read
on public.v2_module_options
for select to authenticated
using (
  organisation_id is null
  or public.v2_user_can_access_organisation(organisation_id)
);

drop policy if exists v2_module_options_manage on public.v2_module_options;
create policy v2_module_options_manage
on public.v2_module_options
for all to authenticated
using (
  public.v2_user_can_manage_operations_config(organisation_id, project_id)
)
with check (
  public.v2_user_can_manage_operations_config(organisation_id, project_id)
);

drop policy if exists v2_daily_docket_review_settings_read on public.v2_daily_docket_review_settings;
create policy v2_daily_docket_review_settings_read
on public.v2_daily_docket_review_settings
for select to authenticated
using (public.v2_user_can_access_organisation(organisation_id));

drop policy if exists v2_daily_docket_review_settings_manage on public.v2_daily_docket_review_settings;
create policy v2_daily_docket_review_settings_manage
on public.v2_daily_docket_review_settings
for all to authenticated
using (public.v2_user_can_manage_operations_config(organisation_id, project_id))
with check (public.v2_user_can_manage_operations_config(organisation_id, project_id));

drop policy if exists v2_daily_docket_reviewers_read on public.v2_daily_docket_reviewers;
create policy v2_daily_docket_reviewers_read
on public.v2_daily_docket_reviewers
for select to authenticated
using (public.v2_user_can_access_organisation(organisation_id));

drop policy if exists v2_daily_docket_reviewers_manage on public.v2_daily_docket_reviewers;
create policy v2_daily_docket_reviewers_manage
on public.v2_daily_docket_reviewers
for all to authenticated
using (public.v2_user_can_manage_operations_config(organisation_id, project_id))
with check (public.v2_user_can_manage_operations_config(organisation_id, project_id));

drop policy if exists v2_daily_docket_client_contacts_read on public.v2_daily_docket_client_contacts;
create policy v2_daily_docket_client_contacts_read
on public.v2_daily_docket_client_contacts
for select to authenticated
using (public.v2_user_can_access_organisation(organisation_id));

drop policy if exists v2_daily_docket_client_contacts_manage on public.v2_daily_docket_client_contacts;
create policy v2_daily_docket_client_contacts_manage
on public.v2_daily_docket_client_contacts
for all to authenticated
using (public.v2_user_can_manage_operations_config(organisation_id, project_id))
with check (public.v2_user_can_manage_operations_config(organisation_id, project_id));

notify pgrst, 'reload schema';

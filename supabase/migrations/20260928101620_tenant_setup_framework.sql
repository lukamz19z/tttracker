-- TTTracker V2
-- Migration 008: Dynamic tenant setup framework

create table if not exists public.v2_setup_step_definitions (
  id uuid primary key default gen_random_uuid(),
  step_key text not null unique,
  name text not null,
  description text,
  module_key text,
  handler_key text not null default 'settings_json',
  required_by_default boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  form_schema jsonb not null default '{"fields":[]}'::jsonb,
  default_values jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_organisation_setup_state (
  organisation_id uuid primary key
    references public.organisations(id)
    on delete cascade,

  status text not null default 'not_started'
    check (
      status in (
        'not_started',
        'in_progress',
        'completed'
      )
    ),

  current_step_key text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),

  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.v2_organisation_setup_steps (
  id uuid primary key default gen_random_uuid(),

  organisation_id uuid not null
    references public.organisations(id)
    on delete cascade,

  step_key text not null
    references public.v2_setup_step_definitions(step_key)
    on update cascade
    on delete restrict,

  status text not null default 'not_started'
    check (
      status in (
        'not_started',
        'in_progress',
        'completed',
        'skipped',
        'blocked'
      )
    ),

  is_required boolean not null default false,

  values jsonb not null default '{}'::jsonb,

  started_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  updated_at timestamptz not null default now(),

  metadata jsonb not null default '{}'::jsonb,

  unique (organisation_id, step_key)
);

create index if not exists
  idx_v2_org_setup_steps_org_status
on public.v2_organisation_setup_steps (
  organisation_id,
  status
);

create index if not exists
  idx_v2_setup_definitions_active_sort
on public.v2_setup_step_definitions (
  is_active,
  sort_order
);

alter table public.v2_setup_step_definitions enable row level security;
alter table public.v2_organisation_setup_state enable row level security;
alter table public.v2_organisation_setup_steps enable row level security;

drop policy if exists "authenticated users can read setup definitions"
  on public.v2_setup_step_definitions;

create policy "authenticated users can read setup definitions"
on public.v2_setup_step_definitions
for select
to authenticated
using (is_active = true);

drop policy if exists "organisation users can read setup state"
  on public.v2_organisation_setup_state;

create policy "organisation users can read setup state"
on public.v2_organisation_setup_state
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v2_organisation_setup_state.organisation_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
);

drop policy if exists "organisation users can read setup steps"
  on public.v2_organisation_setup_steps;

create policy "organisation users can read setup steps"
on public.v2_organisation_setup_steps
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v2_organisation_setup_steps.organisation_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
);

drop policy if exists "platform admins can read setup state"
  on public.v2_organisation_setup_state;

create policy "platform admins can read setup state"
on public.v2_organisation_setup_state
for select
to authenticated
using (
  private.tttracker_v2_is_platform_admin(
    array['owner', 'admin', 'support']::text[]
  )
);

drop policy if exists "platform admins can read setup steps"
  on public.v2_organisation_setup_steps;

create policy "platform admins can read setup steps"
on public.v2_organisation_setup_steps
for select
to authenticated
using (
  private.tttracker_v2_is_platform_admin(
    array['owner', 'admin', 'support']::text[]
  )
);

grant usage on schema public to service_role;

grant all privileges
on table public.v2_setup_step_definitions
to service_role;

grant all privileges
on table public.v2_organisation_setup_state
to service_role;

grant all privileges
on table public.v2_organisation_setup_steps
to service_role;

create or replace function private.tttracker_v2_touch_setup_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_v2_setup_step_definitions_updated_at
  on public.v2_setup_step_definitions;

create trigger trg_v2_setup_step_definitions_updated_at
before update on public.v2_setup_step_definitions
for each row
execute function private.tttracker_v2_touch_setup_updated_at();

drop trigger if exists trg_v2_organisation_setup_state_updated_at
  on public.v2_organisation_setup_state;

create trigger trg_v2_organisation_setup_state_updated_at
before update on public.v2_organisation_setup_state
for each row
execute function private.tttracker_v2_touch_setup_updated_at();

drop trigger if exists trg_v2_organisation_setup_steps_updated_at
  on public.v2_organisation_setup_steps;

create trigger trg_v2_organisation_setup_steps_updated_at
before update on public.v2_organisation_setup_steps
for each row
execute function private.tttracker_v2_touch_setup_updated_at();

-- Initial setup catalogue.
-- The UI is driven by form_schema and module_key rather than business names.

insert into public.v2_setup_step_definitions (
  step_key,
  name,
  description,
  module_key,
  handler_key,
  required_by_default,
  sort_order,
  form_schema,
  default_values
)
values
(
  'organisation_profile',
  'Company details',
  'Confirm the organisation details shown throughout TTTracker.',
  null,
  'organisation_profile',
  true,
  10,
  '{
    "fields": [
      {
        "key": "name",
        "label": "Trading name",
        "type": "text",
        "required": true,
        "placeholder": "Company name"
      },
      {
        "key": "legal_name",
        "label": "Legal name",
        "type": "text",
        "required": false,
        "placeholder": "Legal entity name"
      },
      {
        "key": "abn",
        "label": "ABN",
        "type": "text",
        "required": false,
        "placeholder": "ABN"
      }
    ]
  }'::jsonb,
  '{}'::jsonb
),
(
  'roles_permissions',
  'Roles & permissions',
  'Set the initial access model for your organisation.',
  null,
  'settings_json',
  true,
  20,
  '{
    "fields": [
      {
        "key": "review_mode",
        "label": "Permission setup",
        "type": "select",
        "required": true,
        "options": [
          {"value":"review_later","label":"Use defaults and review later"},
          {"value":"review_now","label":"Review permissions during setup"}
        ]
      }
    ]
  }'::jsonb,
  '{"review_mode":"review_later"}'::jsonb
),
(
  'project_defaults',
  'Project defaults',
  'Choose defaults used when new projects are created.',
  'projects',
  'settings_json',
  true,
  30,
  '{
    "fields": [
      {
        "key": "project_code_required",
        "label": "Require a project code",
        "type": "checkbox",
        "required": false
      },
      {
        "key": "default_timezone",
        "label": "Default timezone",
        "type": "select",
        "required": true,
        "options": [
          {"value":"Australia/Sydney","label":"Australia/Sydney"},
          {"value":"Australia/Brisbane","label":"Australia/Brisbane"},
          {"value":"Australia/Melbourne","label":"Australia/Melbourne"},
          {"value":"Australia/Adelaide","label":"Australia/Adelaide"},
          {"value":"Australia/Perth","label":"Australia/Perth"}
        ]
      }
    ]
  }'::jsonb,
  '{"project_code_required":true,"default_timezone":"Australia/Sydney"}'::jsonb
),
(
  'notifications',
  'Notifications',
  'Choose the organisation default for operational notifications.',
  null,
  'settings_json',
  false,
  40,
  '{
    "fields": [
      {
        "key": "email_enabled",
        "label": "Enable email notifications by default",
        "type": "checkbox",
        "required": false
      },
      {
        "key": "push_enabled",
        "label": "Enable push notifications by default",
        "type": "checkbox",
        "required": false
      }
    ]
  }'::jsonb,
  '{"email_enabled":true,"push_enabled":true}'::jsonb
),
(
  'training_configuration',
  'Training',
  'Set the starting behaviour for training and competency records.',
  'training',
  'settings_json',
  false,
  50,
  '{
    "fields": [
      {
        "key": "expiry_reminders",
        "label": "Enable expiry reminders",
        "type": "checkbox",
        "required": false
      },
      {
        "key": "approval_required",
        "label": "Require uploaded records to be approved",
        "type": "checkbox",
        "required": false
      }
    ]
  }'::jsonb,
  '{"expiry_reminders":true,"approval_required":true}'::jsonb
),
(
  'sharepoint',
  'SharePoint',
  'Choose whether to connect SharePoint now or configure it later.',
  'sharepoint',
  'settings_json',
  false,
  60,
  '{
    "fields": [
      {
        "key": "setup_choice",
        "label": "SharePoint setup",
        "type": "select",
        "required": true,
        "options": [
          {"value":"later","label":"Configure later"},
          {"value":"now","label":"Configure after initial setup"}
        ]
      }
    ]
  }'::jsonb,
  '{"setup_choice":"later"}'::jsonb
),
(
  'client_portal',
  'Client portal',
  'Choose the starting client-access configuration.',
  'client_portal',
  'settings_json',
  false,
  70,
  '{
    "fields": [
      {
        "key": "client_access_enabled",
        "label": "Enable client access",
        "type": "checkbox",
        "required": false
      }
    ]
  }'::jsonb,
  '{"client_access_enabled":false}'::jsonb
)
on conflict (step_key) do update
set
  name = excluded.name,
  description = excluded.description,
  module_key = excluded.module_key,
  handler_key = excluded.handler_key,
  required_by_default = excluded.required_by_default,
  sort_order = excluded.sort_order,
  form_schema = excluded.form_schema,
  default_values = excluded.default_values,
  is_active = true;

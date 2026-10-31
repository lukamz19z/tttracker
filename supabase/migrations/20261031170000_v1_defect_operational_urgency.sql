-- Add operational escalation context to the canonical V1 tower Defect.
alter table public.tower_defects
  add column if not exists required_by date,
  add column if not exists work_impact text,
  add column if not exists affected_activity text,
  add column if not exists urgency_note text,
  add column if not exists notify_user_ids uuid[] not null default '{}';

alter table public.defect_actions
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

alter table public.project_defect_notification_rules
  add column if not exists notify_assignment boolean not null default true;

create table if not exists public.project_defect_workflow_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  work_impact_options text[] not null default array['No Immediate Impact','May Delay Work','Blocks Work']::text[],
  affected_activity_options text[] not null default array['Assembly','Erection','Revision','Stringing','Delivery','Inspection','Other']::text[],
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.project_defect_workflow_settings(project_id)
select id from public.projects
on conflict(project_id) do nothing;

alter table public.project_defect_workflow_settings enable row level security;
revoke all on public.project_defect_workflow_settings from anon, authenticated;
grant all on public.project_defect_workflow_settings to service_role;

create index if not exists tower_defects_required_by_active_idx
  on public.tower_defects(required_by, project_id, tower_id)
  where status not in ('Fixed','Closed');

notify pgrst, 'reload schema';

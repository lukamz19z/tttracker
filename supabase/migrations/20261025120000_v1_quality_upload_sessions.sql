-- V1 transport receipts only: no new Quality record or file-storage model.
create table if not exists public.tower_quality_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  project_id uuid not null references public.projects(id),
  tower_id uuid not null references public.towers(id),
  user_id uuid not null references auth.users(id),
  revision_id uuid references public.tower_revisions(id),
  revision_item_id uuid references public.tower_revision_items(id),
  defect_id uuid references public.tower_defects(id),
  drive_id text not null,
  folder_id text not null,
  staging_name text not null,
  created_at timestamptz not null default now(),
  check ((defect_id is not null and revision_id is null and revision_item_id is null)
      or (defect_id is null and revision_id is not null and revision_item_id is not null))
);
alter table public.tower_quality_upload_sessions enable row level security;
revoke all on public.tower_quality_upload_sessions from anon, authenticated;
grant all on public.tower_quality_upload_sessions to service_role;
create index if not exists tower_quality_upload_sessions_revision_idx on public.tower_quality_upload_sessions(revision_id);
create index if not exists tower_quality_upload_sessions_item_idx on public.tower_quality_upload_sessions(revision_item_id);
create index if not exists tower_quality_upload_sessions_defect_idx on public.tower_quality_upload_sessions(defect_id);
create index if not exists tower_quality_upload_sessions_project_idx on public.tower_quality_upload_sessions(project_id);
create index if not exists tower_quality_upload_sessions_tower_idx on public.tower_quality_upload_sessions(tower_id);
create index if not exists tower_quality_upload_sessions_user_idx on public.tower_quality_upload_sessions(user_id);
notify pgrst,'reload schema';

alter table public.tower_daily_dockets
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists retracted_at timestamptz,
  add column if not exists retracted_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_user_id uuid references auth.users(id) on delete set null;

update public.tower_daily_dockets
set created_by_user_id = coalesce(created_by_user_id, bc_rep_user_id, bc_submitted_by)
where created_by_user_id is null;

create index if not exists tower_daily_dockets_active_project_date_idx
  on public.tower_daily_dockets(project_id, docket_date desc)
  where deleted_at is null;

create or replace function public.tttracker_v1_daily_docket_lifecycle(
  p_docket_id uuid,
  p_action text,
  p_actor_user_id uuid,
  p_actor_name text default null,
  p_can_manage boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.tower_daily_dockets%rowtype;
  next_status text;
  event_name text;
  now_at timestamptz := now();
begin
  select * into d from public.tower_daily_dockets where id = p_docket_id and deleted_at is null for update;
  if not found then raise exception 'DAILY_DOCKET_NOT_FOUND'; end if;
  if not p_can_manage and coalesce(d.created_by_user_id, d.bc_rep_user_id, d.bc_submitted_by) is distinct from p_actor_user_id then
    raise exception 'DAILY_DOCKET_FORBIDDEN';
  end if;

  if p_action = 'retract' then
    if d.approval_status not in ('submitted_bc','client_pending') then raise exception 'DAILY_DOCKET_NOT_RETRACTABLE'; end if;
    update public.tower_daily_dockets set approval_status = 'draft', retracted_at = now_at,
      retracted_by_user_id = p_actor_user_id, bc_signature_data_url = null, bc_signed_at = null,
      bc_approved_at = null, bc_approved_name = null, bc_approved_email = null,
      client_signature_data_url = null, client_signed_at = null, client_rep_name = null,
      client_approved_at = null, client_approved_name = null,
      client_approved_email = null, signed_date = null
    where id = d.id;
    update public.tower_docket_approvals set status = 'superseded', token_superseded_at = now_at
    where docket_id = d.id and status = 'pending';
    next_status := 'draft'; event_name := 'retracted';
  elsif p_action = 'delete' then
    if coalesce(d.approval_status, 'legacy') not in ('legacy','draft','bc_changes_requested','client_changes_requested') then
      raise exception 'DAILY_DOCKET_NOT_DELETABLE';
    end if;
    update public.tower_daily_dockets set deleted_at = now_at, deleted_by_user_id = p_actor_user_id
    where id = d.id;
    next_status := 'deleted'; event_name := 'deleted';
  else
    raise exception 'DAILY_DOCKET_ACTION_INVALID';
  end if;

  insert into public.tower_docket_workflow_events(
    docket_id, project_id, event_type, performed_by, performed_by_name,
    comments, metadata, revision, created_at
  ) values (
    d.id, d.project_id, event_name, p_actor_user_id, nullif(trim(p_actor_name), ''),
    null, jsonb_build_object('previous_status', d.approval_status, 'new_status', next_status),
    coalesce(d.approval_revision, 0), now_at
  );
  return jsonb_build_object('id', d.id, 'status', next_status, 'action', p_action);
end;
$$;

revoke all on function public.tttracker_v1_daily_docket_lifecycle(uuid, text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.tttracker_v1_daily_docket_lifecycle(uuid, text, uuid, text, boolean) to service_role;

notify pgrst, 'reload schema';

-- V1 only. The connected V1 database had no equipment_ladders table when
-- inspected. Define the fields already consumed by the current ladder page,
-- without replacing an existing table or changing existing register numbers.
begin;
create table if not exists public.equipment_ladders (
  id uuid primary key default gen_random_uuid(),
  ladder_number text not null,
  make text,
  ladder_type text,
  height text,
  crew_id uuid references public.crews(id) on delete set null,
  status text default 'Active',
  last_internal_inspection date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.equipment_ladders
  add column if not exists supersedes_ladder_id uuid references public.equipment_ladders(id) on delete restrict,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

-- No number rewriting or deduplication. If an existing installation has
-- conflicting current numbers, abort the migration for explicit reconciliation.
do $$ begin
  if exists (select 1 from public.equipment_ladders
    where lower(btrim(coalesce(status,'Active'))) <> 'superseded'
    group by upper(btrim(ladder_number)) having count(*) > 1) then
    raise exception 'Duplicate current ladder register numbers exist. Reconcile them explicitly before applying this migration; no records have been changed.';
  end if;
end; $$;
create unique index if not exists equipment_ladders_current_number_uidx
  on public.equipment_ladders(upper(btrim(ladder_number)))
  where lower(btrim(coalesce(status,'Active'))) <> 'superseded';
create unique index if not exists equipment_ladders_supersedes_uidx
  on public.equipment_ladders(supersedes_ladder_id) where supersedes_ladder_id is not null;

create or replace function public.v1_ladder_guard() returns trigger
language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then
    if old.supersedes_ladder_id is not null or exists(select 1 from equipment_ladders where supersedes_ladder_id=old.id) then
      raise exception 'Linked replacement ladders must be retained with their history and documents.';
    end if;
    return old;
  end if;
  if new.ladder_number is distinct from old.ladder_number then
    raise exception 'Ladder register numbers are locked after creation.';
  end if;
  if new.supersedes_ladder_id is distinct from old.supersedes_ladder_id then
    raise exception 'The replacement relationship is permanent once saved.';
  end if;
  if exists(select 1 from equipment_ladders where supersedes_ladder_id=old.id)
     and new.status is distinct from 'Superseded' then
    raise exception 'This ladder has been superseded and cannot be reactivated.';
  end if;
  return new;
end; $$;
drop trigger if exists v1_ladder_guard on public.equipment_ladders;
create trigger v1_ladder_guard before update or delete on public.equipment_ladders
  for each row execute function public.v1_ladder_guard();

-- One transaction for creation and the old ladder's lifecycle change. Existing
-- inspections, equipment documents, SharePoint links and UUIDs are not moved.
create or replace function public.v1_ladder_save(p_data jsonb,p_actor uuid,p_id uuid default null)
returns public.equipment_ladders language plpgsql security definer set search_path=public as $$
declare
  number text:=btrim(p_data->>'ladder_number');
  previous_id uuid:=nullif(p_data->>'supersedes_ladder_id','')::uuid;
  previous public.equipment_ladders%rowtype;
  existing public.equipment_ladders%rowtype;
  saved public.equipment_ladders%rowtype;
  state text:=coalesce(nullif(btrim(p_data->>'status'),''),'Active');
begin
  if p_actor is null then raise exception 'A signed-in TTTracker user is required.'; end if;
  if p_id is not null then
    select * into existing from equipment_ladders where id=p_id for update;
    if not found then raise exception 'Ladder not found. Refresh the register.'; end if;
    if existing.updated_at is distinct from (p_data->>'updated_at')::timestamptz then
      raise exception 'This ladder changed. Refresh before editing it.';
    end if;
    if number is distinct from btrim(existing.ladder_number) then
      raise exception 'Ladder register numbers are locked after creation.';
    end if;
    if previous_id is distinct from existing.supersedes_ladder_id then
      raise exception 'The replacement relationship is permanent once saved.';
    end if;
  elsif number is null or length(number) not between 1 and 120 or number ~ '[[:cntrl:]]' then
    raise exception 'Enter a Ladder Register Number of 1 to 120 characters.';
  end if;
  if state not in ('Active','Out of Service','Missing','Retired')
     and not (p_id is not null and state=existing.status) then
    raise exception 'Choose a valid ladder status. Superseded is set by the replacement workflow.';
  end if;
  if p_id is null and previous_id is not null then
    if (p_data->>'confirm_supersedes')::boolean is distinct from true then
      raise exception 'Confirm that the selected ladder will be marked as Superseded.';
    end if;
    select * into previous from equipment_ladders where id=previous_id for update;
    if not found then raise exception 'The ladder to supersede no longer exists. Refresh the register.'; end if;
    if lower(btrim(coalesce(previous.status,'')))='superseded'
       or exists(select 1 from equipment_ladders where supersedes_ladder_id=previous_id) then
      raise exception 'This ladder has already been superseded. Refresh the register.';
    end if;
    if state<>'Active' then raise exception 'A replacement ladder must be saved as Active.'; end if;
    -- Update first so a deliberately reused identifier is possible; any later
    -- insert failure rolls this status change back with the entire transaction.
    update equipment_ladders set status='Superseded',superseded_at=now(),
      superseded_by_user_id=p_actor,updated_at=clock_timestamp() where id=previous_id;
  end if;
  if p_id is null then
    insert into equipment_ladders(ladder_number,make,ladder_type,height,crew_id,status,last_internal_inspection,notes,supersedes_ladder_id,created_by_user_id)
    values(number,nullif(btrim(p_data->>'make'),''),nullif(btrim(p_data->>'ladder_type'),''),nullif(btrim(p_data->>'height'),''),
      nullif(p_data->>'crew_id','')::uuid,state,nullif(p_data->>'last_internal_inspection','')::date,
      nullif(btrim(p_data->>'notes'),''),previous_id,p_actor) returning * into saved;
  else
    update equipment_ladders set make=nullif(btrim(p_data->>'make'),''),ladder_type=nullif(btrim(p_data->>'ladder_type'),''),
      height=nullif(btrim(p_data->>'height'),''),crew_id=nullif(p_data->>'crew_id','')::uuid,status=state,
      last_internal_inspection=nullif(p_data->>'last_internal_inspection','')::date,notes=nullif(btrim(p_data->>'notes'),''),
      updated_at=clock_timestamp() where id=p_id returning * into saved;
  end if;
  return saved;
exception when unique_violation then
  raise exception 'A ladder with register number % already exists.',number using errcode='22023';
end; $$;

alter table public.equipment_ladders enable row level security;
revoke all on public.equipment_ladders from public,anon,authenticated;
grant select on public.equipment_ladders to authenticated;
grant all on public.equipment_ladders to service_role;
drop policy if exists v1_ladders_view on public.equipment_ladders;
create policy v1_ladders_view on public.equipment_ladders for select to authenticated using (
  exists(select 1 from public.effective_user_permissions where user_id=auth.uid() and code='assets.view' and allowed)
  and exists(select 1 from public.effective_user_permissions where user_id=auth.uid() and code='tt.assets' and allowed)
  and exists(select 1 from public.effective_user_permissions where user_id=auth.uid() and code='tt.assets.equipment' and allowed)
);
revoke all on function public.v1_ladder_save(jsonb,uuid,uuid),public.v1_ladder_guard() from public,anon,authenticated;
grant execute on function public.v1_ladder_save(jsonb,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;

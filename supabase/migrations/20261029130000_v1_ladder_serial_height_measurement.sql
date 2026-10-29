-- V1 ladder metadata only. No historical backfill or database defaults.
-- New-entry Platform Height is a website form default, never an assumption
-- about existing records or clients that omit the new nullable fields.
begin;
alter table public.equipment_ladders
  add column if not exists serial_number text,
  add column if not exists height_measurement_type text;

-- Retain the existing atomic replacement, duplicate, locked identifier and
-- optimistic edit checks. Missing metadata keys preserve values for old clients.
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
    insert into equipment_ladders(ladder_number,make,ladder_type,height,crew_id,status,last_internal_inspection,notes,supersedes_ladder_id,created_by_user_id,serial_number,height_measurement_type)
    values(number,nullif(btrim(p_data->>'make'),''),nullif(btrim(p_data->>'ladder_type'),''),nullif(btrim(p_data->>'height'),''),
      nullif(p_data->>'crew_id','')::uuid,state,nullif(p_data->>'last_internal_inspection','')::date,
      nullif(btrim(p_data->>'notes'),''),previous_id,p_actor,nullif(btrim(p_data->>'serial_number'),''),nullif(btrim(p_data->>'height_measurement_type'),'')) returning * into saved;
  else
    update equipment_ladders set make=nullif(btrim(p_data->>'make'),''),ladder_type=nullif(btrim(p_data->>'ladder_type'),''),
      height=nullif(btrim(p_data->>'height'),''),crew_id=nullif(p_data->>'crew_id','')::uuid,status=state,
      last_internal_inspection=nullif(p_data->>'last_internal_inspection','')::date,notes=nullif(btrim(p_data->>'notes'),''),
      serial_number=case when p_data ? 'serial_number' then nullif(btrim(p_data->>'serial_number'),'') else serial_number end,
      height_measurement_type=case when p_data ? 'height_measurement_type' then nullif(btrim(p_data->>'height_measurement_type'),'') else height_measurement_type end,
      updated_at=clock_timestamp() where id=p_id returning * into saved;
  end if;
  return saved;
exception when unique_violation then
  raise exception 'A ladder with register number % already exists.',number using errcode='22023';
end; $$;

revoke all on function public.v1_ladder_save(jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.v1_ladder_save(jsonb,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;

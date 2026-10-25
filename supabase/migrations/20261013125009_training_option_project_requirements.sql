begin;

alter table public.v2_project_training_requirements
  add column if not exists option_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='v2_project_training_requirement_option_fk') then
    alter table public.v2_project_training_requirements
      add constraint v2_project_training_requirement_option_fk
      foreign key (organisation_id,option_id)
      references public.v2_training_options(organisation_id,id) not valid;
  end if;
end $$;
alter table public.v2_project_training_requirements
  validate constraint v2_project_training_requirement_option_fk;

create or replace function private.tttracker_v2_requirement_option_guard()
returns trigger language plpgsql set search_path='' as $$
declare v_owner uuid;
begin
  if new.option_id is null then return new; end if;
  select training_type_id into v_owner from public.v2_training_options
    where organisation_id=new.organisation_id and id=new.option_id and is_active;
  if not found or v_owner is distinct from new.training_type_id then
    raise exception 'TRAINING_OPTION_TYPE_MISMATCH';
  end if;
  return new;
end $$;
drop trigger if exists v2_training_requirement_option_guard on public.v2_project_training_requirements;
create trigger v2_training_requirement_option_guard
before insert or update of organisation_id,training_type_id,option_id
on public.v2_project_training_requirements
for each row execute function private.tttracker_v2_requirement_option_guard();
revoke all on function private.tttracker_v2_requirement_option_guard() from public,anon,authenticated;

alter function public.tttracker_v2_people_write(uuid,text,uuid,jsonb)
  rename to tttracker_v2_people_write_before_option_requirements;
revoke all on function public.tttracker_v2_people_write_before_option_requirements(uuid,text,uuid,jsonb)
  from public,anon,authenticated;
create function public.tttracker_v2_people_write(
  p_organisation_id uuid,p_action text,p_id uuid default null,p_data jsonb default '{}'
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; v_id uuid; v_type uuid; v_option uuid; v_owner uuid;
begin
  if p_action<>'requirement' then
    return public.tttracker_v2_people_write_before_option_requirements(p_organisation_id,p_action,p_id,p_data);
  end if;
  perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.requirements.manage');
  v_type:=nullif(p_data->>'training_type_id','')::uuid;
  v_option:=nullif(p_data->>'option_id','')::uuid;
  if v_option is not null then
    select training_type_id into v_owner from public.v2_training_options
      where organisation_id=p_organisation_id and id=v_option and is_active;
    if not found or v_owner is distinct from v_type then raise exception 'TRAINING_OPTION_TYPE_MISMATCH'; end if;
  end if;
  result:=public.tttracker_v2_people_write_before_option_requirements(p_organisation_id,p_action,p_id,p_data-'option_id');
  v_id:=coalesce(p_id,(result->>'id')::uuid);
  update public.v2_project_training_requirements set option_id=v_option
    where organisation_id=p_organisation_id and id=v_id;
  return result;
exception
  when foreign_key_violation then raise exception 'TRAINING_OPTION_TYPE_MISMATCH';
end $$;
revoke all on function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) to authenticated;

create or replace function private.tttracker_v2_training_state_for_option(
  p_org uuid,p_person uuid,p_type uuid,p_required boolean,p_option uuid
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.v2_training_records; k public.v2_training_types; s text;
begin
  select * into k from public.v2_training_types where organisation_id=p_org and id=p_type;
  select * into r from public.v2_training_records where organisation_id=p_org and person_id=p_person
    and training_type_id=p_type and superseded_at is null and voided_at is null
    and (p_option is null or option_id=p_option)
  order by is_current desc,created_at desc,id limit 1;
  s:=case when r.id is null then case when p_required then 'missing' else 'not_required' end
    when r.review_status<>'approved' then r.review_status when r.expiry_date<current_date then 'expired'
    when r.expiry_date<=current_date+k.renewal_lead_days then 'expiring' else 'current' end;
  return jsonb_build_object('state',s,'record_id',r.id,'expiry_date',r.expiry_date,'required',p_required,'option_id',p_option);
end $$;
revoke all on function private.tttracker_v2_training_state_for_option(uuid,uuid,uuid,boolean,uuid) from public,anon,authenticated;

-- Make Project Requirements' per-person report evaluate the selected Option.
do $$ declare definition text; old text; replacement text; begin
  definition:=pg_get_functiondef('public.tttracker_v2_people_read_training_previous(uuid,text,text,integer,uuid,jsonb)'::regprocedure);
  old:='req.training_type_id,k.name training_type,req.applies_to';
  replacement:='req.training_type_id,k.name training_type,req.option_id,req.applies_to';
  if position(old in definition)=0 then raise exception 'TRAINING_REQUIREMENT_READ_UPGRADE_REQUIRED'; end if;
  definition:=replace(definition,old,replacement);
  old:='private.tttracker_v2_training_state(p_organisation_id,p.id,k.id,true)';
  replacement:='private.tttracker_v2_training_state_for_option(p_organisation_id,p.id,k.id,true,req.option_id)';
  if position(old in definition)=0 then raise exception 'TRAINING_REQUIREMENT_READ_UPGRADE_REQUIRED'; end if;
  execute replace(definition,old,replacement);
end $$;

comment on column public.v2_project_training_requirements.option_id is 'Optional required Option / Class owned by training_type_id.';
notify pgrst,'reload schema';
commit;

;

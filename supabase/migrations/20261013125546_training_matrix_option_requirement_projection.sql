begin;

create or replace function private.tttracker_v2_training_state_for_project(
  p_org uuid,p_person uuid,p_type uuid,p_project uuid,p_person_row public.v2_people
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_base jsonb; v_type_required boolean; v_required_options jsonb; v_state text;
begin
  select exists(select 1 from public.v2_project_training_requirements req
    where req.organisation_id=p_org and req.project_id=p_project and req.training_type_id=p_type
      and req.option_id is null and private.tttracker_v2_requirement_applies(req,p_person_row)) into v_type_required;
  if v_type_required then return private.tttracker_v2_training_state(p_org,p_person_row.id,p_type,true); end if;
  select coalesce(jsonb_agg(jsonb_build_object('option_id',req.option_id,'option_name',o.name)
    ||private.tttracker_v2_training_state_for_option(p_org,p_person_row.id,p_type,true,req.option_id)
    order by o.sort_order,o.name),'[]'::jsonb)
    into v_required_options
  from public.v2_project_training_requirements req
  join public.v2_training_options o on o.organisation_id=req.organisation_id and o.id=req.option_id
  where req.organisation_id=p_org and req.project_id=p_project and req.training_type_id=p_type
    and private.tttracker_v2_requirement_applies(req,p_person_row);
  if jsonb_array_length(v_required_options)=0 then
    return private.tttracker_v2_training_state(p_org,p_person_row.id,p_type,false);
  end if;
  select case
    when exists(select 1 from jsonb_array_elements(v_required_options) x where x->>'state'='missing') then 'missing'
    when exists(select 1 from jsonb_array_elements(v_required_options) x where x->>'state'='expired') then 'expired'
    when exists(select 1 from jsonb_array_elements(v_required_options) x where x->>'state'='changes_required') then 'changes_required'
    when exists(select 1 from jsonb_array_elements(v_required_options) x where x->>'state'='rejected') then 'rejected'
    when exists(select 1 from jsonb_array_elements(v_required_options) x where x->>'state'='pending_review') then 'pending_review'
    when exists(select 1 from jsonb_array_elements(v_required_options) x where x->>'state'='expiring') then 'expiring'
    else 'current' end into v_state;
  v_base:=private.tttracker_v2_training_state(p_org,p_person_row.id,p_type,true);
  return v_base||jsonb_build_object('state',v_state,'required',true,'required_options',v_required_options);
end $$;
revoke all on function private.tttracker_v2_training_state_for_project(uuid,uuid,uuid,uuid,public.v2_people) from public,anon,authenticated;

do $$ declare definition text; pattern text; replacement text; begin
  definition:=pg_get_functiondef('public.tttracker_v2_people_read_training_previous(uuid,text,text,integer,uuid,jsonb)'::regprocedure);
  pattern:='private\.tttracker_v2_training_state\(p_organisation_id,p\.id,k\.id,\s*exists\(select 1 from public\.v2_project_training_requirements req where req\.organisation_id=p_organisation_id and req\.project_id=pid and req\.training_type_id=k\.id and private\.tttracker_v2_requirement_applies\(req,p\)\)\)';
  replacement:='private.tttracker_v2_training_state_for_project(p_organisation_id,p.id,k.id,pid,p)';
  definition:=regexp_replace(definition,pattern,replacement,'g');
  if position(replacement in definition)=0 then raise exception 'TRAINING_MATRIX_REQUIREMENT_READ_UPGRADE_REQUIRED'; end if;
  execute definition;
end $$;

notify pgrst,'reload schema';
commit;

;

begin;

-- Options are owned by a Training Type. category_id remains a derived legacy
-- display value for compatibility and is never used to determine ownership.
alter table public.v2_training_options
  add column if not exists training_type_id uuid;

alter table public.v2_training_types
  add column if not exists option_selection_mode text not null default 'none',
  add column if not exists option_evidence_mode text not null default 'shared';

alter table public.v2_training_types
  drop constraint if exists v2_training_types_option_selection_mode_check,
  add constraint v2_training_types_option_selection_mode_check
    check (option_selection_mode in ('none','single','multiple')),
  drop constraint if exists v2_training_types_option_evidence_mode_check,
  add constraint v2_training_types_option_evidence_mode_check
    check (option_evidence_mode in ('shared','separate'));

-- One submission may create several canonical class records that share one
-- evidence group. Keep class-specific uniqueness while allowing that grouping.
alter table public.v2_training_records
  drop constraint if exists v2_training_records_organisation_id_person_id_evidence_grou_key;
create unique index if not exists v2_training_record_submission_option_uidx
  on public.v2_training_records(organisation_id,person_id,evidence_group_id,training_type_id,coalesce(option_id,'00000000-0000-0000-0000-000000000000'::uuid));

-- Only an explicit one-to-one existing Training Type link is authoritative.
-- Unlinked and multiply-linked legacy options remain intact with a NULL owner
-- and can be reviewed/assigned by an organisation administrator.
with explicit_owner as (
  select l.organisation_id,l.option_id,(array_agg(l.training_type_id))[1] training_type_id
  from public.v2_training_type_options l
  group by l.organisation_id,l.option_id
  having count(distinct l.training_type_id)=1
)
update public.v2_training_options o
set training_type_id=e.training_type_id
from explicit_owner e
join public.v2_training_types t
  on t.organisation_id=e.organisation_id and t.id=e.training_type_id
where o.organisation_id=e.organisation_id and o.id=e.option_id
  and t.category_id=o.category_id;

update public.v2_training_types t
set option_selection_mode=case when exists (
  select 1 from public.v2_training_options o
  where o.organisation_id=t.organisation_id and o.training_type_id=t.id
) then 'single' else 'none' end
where option_selection_mode='none';

do $$ begin
  if not exists (select 1 from pg_constraint where conname='v2_training_options_training_type_fk') then
    alter table public.v2_training_options
      add constraint v2_training_options_training_type_fk
      foreign key (organisation_id,training_type_id)
      references public.v2_training_types(organisation_id,id) not valid;
  end if;
end $$;
alter table public.v2_training_options
  validate constraint v2_training_options_training_type_fk;

drop index if exists public.v2_training_option_name_idx;
create unique index if not exists v2_training_option_name_by_type_idx
  on public.v2_training_options(organisation_id,training_type_id,lower(btrim(name)))
  where training_type_id is not null;
create unique index if not exists v2_training_option_code_by_type_idx
  on public.v2_training_options(organisation_id,training_type_id,lower(btrim(code)))
  where training_type_id is not null and nullif(btrim(code),'') is not null;
create index if not exists v2_training_options_type_search_idx
  on public.v2_training_options(organisation_id,training_type_id,is_active,sort_order,name);

create or replace function private.tttracker_v2_training_option_owner_guard()
returns trigger language plpgsql set search_path='' as $$
declare v_category uuid;
begin
  if new.training_type_id is null then
    if tg_op='UPDATE' and old.training_type_id is not null
      and exists(select 1 from public.v2_training_records r
        where r.organisation_id=old.organisation_id and r.option_id=old.id) then
      raise exception 'TRAINING_OPTION_IN_USE';
    end if;
    return new;
  end if;
  select category_id into v_category from public.v2_training_types
  where organisation_id=new.organisation_id and id=new.training_type_id;
  if not found then raise exception 'PEOPLE_RELATIONSHIP_INVALID'; end if;
  new.category_id:=v_category;
  return new;
end $$;

drop trigger if exists v2_training_option_owner_guard on public.v2_training_options;
create trigger v2_training_option_owner_guard
before insert or update of organisation_id,training_type_id,category_id
on public.v2_training_options
for each row execute function private.tttracker_v2_training_option_owner_guard();

create or replace function private.tttracker_v2_training_option_link_guard()
returns trigger language plpgsql set search_path='' as $$
declare v_owner uuid;
begin
  select training_type_id into v_owner from public.v2_training_options
  where organisation_id=new.organisation_id and id=new.option_id;
  if not found or v_owner is distinct from new.training_type_id then
    raise exception 'TRAINING_OPTION_TYPE_MISMATCH';
  end if;
  return new;
end $$;
drop trigger if exists v2_training_option_link_guard on public.v2_training_type_options;
create trigger v2_training_option_link_guard
before insert or update on public.v2_training_type_options
for each row execute function private.tttracker_v2_training_option_link_guard();

create or replace function private.tttracker_v2_training_record_option_guard()
returns trigger language plpgsql set search_path='' as $$
declare v_owner uuid;
begin
  if new.option_id is null then return new; end if;
  select training_type_id into v_owner from public.v2_training_options
  where organisation_id=new.organisation_id and id=new.option_id;
  if not found or v_owner is null or v_owner is distinct from new.training_type_id then
    raise exception 'TRAINING_OPTION_TYPE_MISMATCH';
  end if;
  return new;
end $$;
drop trigger if exists v2_training_record_option_guard on public.v2_training_records;
create trigger v2_training_record_option_guard
before insert or update of organisation_id,training_type_id,option_id
on public.v2_training_records
for each row execute function private.tttracker_v2_training_record_option_guard();

-- Keep the historic association table synchronized during the transition. Its
-- rows are compatibility metadata only; training_type_id is authoritative.
create or replace function private.tttracker_v2_training_option_link_sync()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and old.training_type_id is not null
    and old.training_type_id is distinct from new.training_type_id then
    delete from public.v2_training_type_options
      where organisation_id=old.organisation_id and training_type_id=old.training_type_id and option_id=old.id;
  end if;
  if new.training_type_id is not null then
    insert into public.v2_training_type_options(organisation_id,training_type_id,option_id)
    values(new.organisation_id,new.training_type_id,new.id)
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists v2_training_option_link_sync on public.v2_training_options;
create trigger v2_training_option_link_sync
after insert or update of training_type_id on public.v2_training_options
for each row execute function private.tttracker_v2_training_option_link_sync();

comment on column public.v2_training_options.training_type_id is 'Authoritative parent. NULL means a legacy Option still needs Training Type assignment.';
comment on column public.v2_training_options.category_id is 'Legacy derived display cache only; ownership is training_type_id.';
comment on table public.v2_training_type_options is 'Deprecated compatibility mirror; v2_training_options.training_type_id is authoritative.';

-- Preserve the existing function behind a permission-preserving wrapper. The
-- wrapper derives Category from the selected Type and writes all option changes
-- within the same transaction as the Training Type save.
alter function public.tttracker_v2_people_write(uuid,text,uuid,jsonb)
  rename to tttracker_v2_people_write_before_type_owned_options;
revoke all on function public.tttracker_v2_people_write_before_type_owned_options(uuid,text,uuid,jsonb)
  from public,anon,authenticated;

create function public.tttracker_v2_people_write(
  p_organisation_id uuid,p_action text,p_id uuid default null,p_data jsonb default '{}'
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  result jsonb;
  payload jsonb:=coalesce(p_data,'{}'::jsonb);
  v_type public.v2_training_types;
  v_category uuid;
  v_option jsonb;
  v_option_id uuid;
  v_owner uuid;
  v_old public.v2_training_options;
  v_name text;
  v_code text;
  v_record public.v2_training_records;
  v_selected uuid[];
  v_selected_id uuid;
  v_index integer;
begin
  if p_action='training' then
    perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.create');
    select * into v_type from public.v2_training_types
      where organisation_id=p_organisation_id and id=nullif(payload->>'training_type_id','')::uuid;
    if not found then raise exception 'PEOPLE_RELATIONSHIP_INVALID'; end if;
    if jsonb_typeof(payload->'option_ids')='array' then
      select coalesce(array_agg(value::uuid order by ordinality),'{}'::uuid[]) into v_selected
      from jsonb_array_elements_text(payload->'option_ids') with ordinality as selected(value,ordinality);
    else
      v_selected:=array_remove(array[nullif(payload->>'option_id','')::uuid],null);
    end if;
    if v_type.option_selection_mode='none' and cardinality(v_selected)>0 then raise exception 'TRAINING_OPTION_TYPE_MISMATCH'; end if;
    if v_type.option_selection_mode='single' and cardinality(v_selected)>1 then raise exception 'TRAINING_OPTION_TYPE_MISMATCH'; end if;
    if v_type.option_selection_mode='multiple' and cardinality(v_selected)=0 then raise exception 'PEOPLE_INVALID_FIELDS'; end if;
    if cardinality(v_selected)>1 and v_type.option_evidence_mode<>'shared' then raise exception 'TRAINING_OPTION_SEPARATE_EVIDENCE_REQUIRED'; end if;
    if cardinality(v_selected)>0 and exists(select 1 from unnest(v_selected) chosen(id)
      left join public.v2_training_options o on o.organisation_id=p_organisation_id and o.id=chosen.id
      where o.id is null or o.training_type_id is distinct from v_type.id or not o.is_active) then
      raise exception 'TRAINING_OPTION_TYPE_MISMATCH';
    end if;
    if cardinality(v_selected)>0 then payload:=payload||jsonb_build_object('option_id',v_selected[1],'option_ids',to_jsonb(v_selected)); end if;
    result:=public.tttracker_v2_people_write_before_type_owned_options(p_organisation_id,p_action,p_id,payload);
    select * into v_record from public.v2_training_records where organisation_id=p_organisation_id and id=(result->>'id')::uuid;
    if v_record.id is null then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if;
    for v_index in 2..coalesce(cardinality(v_selected),1) loop
      v_selected_id:=v_selected[v_index];
      if not exists(select 1 from public.v2_training_records where organisation_id=p_organisation_id and evidence_group_id=v_record.evidence_group_id and training_type_id=v_type.id and option_id=v_selected_id) then
        insert into public.v2_training_records
        select (jsonb_populate_record(null::public.v2_training_records,
          to_jsonb(v_record)||jsonb_build_object('id',gen_random_uuid(),'option_id',v_selected_id,
            'is_current',false,'superseded_at',null,'supersedes_record_id',private.tttracker_v2_supersede_candidate(p_organisation_id,v_record.person_id,v_type.id,v_selected_id,nullif(payload->>'project_id','')::uuid,null),
            'superseded_by_record_id',null,'review_status','draft','review_comment',null,'reviewed_by',null,'reviewed_at',null,
            'voided_at',null,'voided_by',null,'void_reason',null,'created_at',now()))).*;
      end if;
    end loop;
    return result;
  end if;

  if p_action='training_option' then
    perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.configure');
    select * into v_type from public.v2_training_types
    where organisation_id=p_organisation_id and id=nullif(payload->>'training_type_id','')::uuid;
    if not found or v_type.category_id is null then raise exception 'PEOPLE_RELATIONSHIP_INVALID'; end if;
    if p_id is not null then
      select * into v_old from public.v2_training_options
      where organisation_id=p_organisation_id and id=p_id for update;
      if not found then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if;
      if v_old.training_type_id is not null and v_old.training_type_id<>v_type.id then
        raise exception 'TRAINING_OPTION_TYPE_MISMATCH';
      end if;
    end if;
    payload:=(payload-'category_id')||jsonb_build_object('category_id',v_type.category_id);
    result:=public.tttracker_v2_people_write_before_type_owned_options(p_organisation_id,p_action,p_id,payload);
    v_option_id:=coalesce(p_id,(result->>'id')::uuid);
    update public.v2_training_options set training_type_id=v_type.id,category_id=v_type.category_id
    where organisation_id=p_organisation_id and id=v_option_id;
    if v_old.id is not null and v_old.training_type_id is null then
      insert into public.v2_people_audit(organisation_id,actor_id,action,data_area,target_id,context)
      values(p_organisation_id,auth.uid(),'training_option_assigned','configuration',v_option_id,
        jsonb_build_object('training_type_id',v_type.id));
    end if;
    return result;
  end if;

  if p_action='training_type' then
    perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.configure');
    if p_id is not null then
      select * into v_type from public.v2_training_types
      where organisation_id=p_organisation_id and id=p_id for update;
      if not found then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if;
      for v_option in select value from jsonb_array_elements(coalesce(payload->'option_ids','[]'::jsonb)) loop
        select training_type_id,category_id into v_owner,v_category from public.v2_training_options
        where organisation_id=p_organisation_id and id=(v_option#>>'{}')::uuid for update;
        if not found or (v_owner is not null and v_owner<>p_id)
          or (v_owner is null and v_category is distinct from nullif(payload->>'category_id','')::uuid) then
          raise exception 'TRAINING_OPTION_TYPE_MISMATCH';
        end if;
        if v_owner is null then
          update public.v2_training_options set training_type_id=p_id
          where organisation_id=p_organisation_id and id=(v_option#>>'{}')::uuid;
        end if;
      end loop;
    end if;
    result:=public.tttracker_v2_people_write_before_type_owned_options(p_organisation_id,p_action,p_id,payload);
    v_option_id:=coalesce(p_id,(result->>'id')::uuid);
    select * into v_type from public.v2_training_types
    where organisation_id=p_organisation_id and id=v_option_id for update;
    if not found then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if;
    update public.v2_training_types set
      option_selection_mode=coalesce(nullif(payload->>'option_selection_mode',''),
        case when exists(select 1 from public.v2_training_options o where o.organisation_id=p_organisation_id and o.training_type_id=v_option_id) then 'single' else 'none' end),
      option_evidence_mode=coalesce(nullif(payload->>'option_evidence_mode',''),'shared')
    where organisation_id=p_organisation_id and id=v_option_id;

    if payload ? 'option_definitions' then
      if jsonb_typeof(payload->'option_definitions')<>'array' then raise exception 'PEOPLE_INVALID_FIELDS'; end if;
      for v_option in select value from jsonb_array_elements(payload->'option_definitions') loop
        v_name:=nullif(btrim(v_option->>'name'),'');
        v_code:=nullif(btrim(v_option->>'code'),'');
        if v_name is null or length(v_name)>120 or coalesce((v_option->>'sort_order')::integer,0)<0 then
          raise exception 'PEOPLE_INVALID_FIELDS';
        end if;
        v_option_id:=nullif(v_option->>'id','')::uuid;
        if v_option_id is null then
          insert into public.v2_training_options(organisation_id,category_id,training_type_id,name,code,description,sort_order,is_active)
          values(p_organisation_id,v_type.category_id,v_type.id,v_name,v_code,coalesce(v_option->>'description',''),coalesce((v_option->>'sort_order')::integer,0),coalesce((v_option->>'is_active')::boolean,true))
          returning id into v_option_id;
          insert into public.v2_people_audit(organisation_id,actor_id,action,data_area,target_id,context)
          values(p_organisation_id,auth.uid(),'training_option_created','configuration',v_option_id,jsonb_build_object('training_type_id',v_type.id,'name',v_name,'code',v_code));
        else
          select * into v_old from public.v2_training_options
          where organisation_id=p_organisation_id and id=v_option_id for update;
          if not found or v_old.training_type_id is distinct from v_type.id then raise exception 'TRAINING_OPTION_TYPE_MISMATCH'; end if;
          update public.v2_training_options set name=v_name,code=v_code,description=coalesce(v_option->>'description',''),sort_order=coalesce((v_option->>'sort_order')::integer,0),is_active=coalesce((v_option->>'is_active')::boolean,true),updated_at=now()
          where organisation_id=p_organisation_id and id=v_option_id;
          if v_old.name is distinct from v_name or v_old.code is distinct from v_code or v_old.is_active is distinct from coalesce((v_option->>'is_active')::boolean,true) or v_old.sort_order is distinct from coalesce((v_option->>'sort_order')::integer,0) then
            insert into public.v2_people_audit(organisation_id,actor_id,action,data_area,target_id,context)
            values(p_organisation_id,auth.uid(),'training_option_updated','configuration',v_option_id,jsonb_build_object('old_name',v_old.name,'new_name',v_name,'old_code',v_old.code,'new_code',v_code,'old_active',v_old.is_active,'new_active',coalesce((v_option->>'is_active')::boolean,true)));
          end if;
        end if;
      end loop;
      -- Missing options are deactivated if history references them; otherwise
      -- they may be removed without orphaning canonical records.
      for v_old in select * from public.v2_training_options o where o.organisation_id=p_organisation_id and o.training_type_id=v_type.id
        and not exists(select 1 from jsonb_array_elements(payload->'option_definitions') x where
          (nullif(x->>'id','') is not null and nullif(x->>'id','')::uuid=o.id)
          or (nullif(x->>'id','') is null and lower(btrim(x->>'code'))=lower(btrim(o.code)) and lower(btrim(x->>'name'))=lower(btrim(o.name)))) for update
      loop
        if exists(select 1 from public.v2_training_records r where r.organisation_id=p_organisation_id and r.option_id=v_old.id) then
          update public.v2_training_options set is_active=false,updated_at=now() where organisation_id=p_organisation_id and id=v_old.id;
          insert into public.v2_people_audit(organisation_id,actor_id,action,data_area,target_id,context)
          values(p_organisation_id,auth.uid(),'training_option_deactivated','configuration',v_old.id,jsonb_build_object('training_type_id',v_type.id));
        else
          delete from public.v2_training_type_options where organisation_id=p_organisation_id and training_type_id=v_type.id and option_id=v_old.id;
          delete from public.v2_training_options where organisation_id=p_organisation_id and id=v_old.id;
          insert into public.v2_people_audit(organisation_id,actor_id,action,data_area,target_id,context)
          values(p_organisation_id,auth.uid(),'training_option_removed','configuration',v_old.id,jsonb_build_object('training_type_id',v_type.id));
        end if;
      end loop;
    end if;
    return result;
  end if;

  return public.tttracker_v2_people_write_before_type_owned_options(p_organisation_id,p_action,p_id,payload);
exception
  when unique_violation then raise exception 'PEOPLE_CONFIGURATION_DUPLICATE';
  when foreign_key_violation then raise;
  when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then raise exception 'PEOPLE_INVALID_FIELDS';
end $$;
revoke all on function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) to authenticated;

comment on column public.v2_training_types.option_selection_mode is 'Whether records select no Option, one Option, or multiple Options.';
comment on column public.v2_training_types.option_evidence_mode is 'Evidence reuse policy for multi-option submissions.';
notify pgrst,'reload schema';
commit;

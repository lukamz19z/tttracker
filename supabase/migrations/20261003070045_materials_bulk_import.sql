-- Set-based atomic Materials import. Existing imports and operational UUIDs are retained.
begin;
create table if not exists public.v2_material_import_source_rows (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id) on delete restrict,
 project_id uuid not null references public.v2_projects(id) on delete restrict,
 import_batch_id uuid not null references public.v2_material_import_batches(id) on delete restrict,
 source_row_number integer not null,
 source_tower_reference text,
 values jsonb not null,
 raw_payload jsonb not null,
 unique(import_batch_id,source_row_number)
);
alter table public.v2_material_import_source_rows enable row level security;
revoke all on public.v2_material_import_source_rows from public,anon,authenticated;
grant all on public.v2_material_import_source_rows to service_role;
alter table public.v2_material_source_records add column if not exists source_row_id uuid
 references public.v2_material_import_source_rows(id) on delete restrict;
create index if not exists v2_material_source_records_source_row_idx on public.v2_material_source_records(source_row_id);
-- Equality predicates previously applied upper/btrim as an unindexed filter.
create index if not exists v2_material_register_import_match_idx on public.v2_material_register
 (project_id,tower_id,material_kind,upper(btrim(item_reference)));
create index if not exists v2_material_bundles_import_match_idx on public.v2_material_bundles
 (project_id,tower_id,upper(btrim(bundle_reference)));
create index if not exists v2_towers_import_match_idx on public.v2_towers(project_id,upper(btrim(tower_identifier)));
create index if not exists v2_material_bundle_members_import_link_idx on public.v2_material_bundle_members(bundle_id,material_item_id);

-- Canonical master writes validate complete transition relations. The generic row
-- guard remains on operational tables; no trigger is disabled during an import.
create or replace function private.tttracker_v2_material_master_statement_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 -- material_new_rows is the trigger's registered transition relation, not a public table.
 perform 1 from public.v2_projects p join (select distinct project_id from material_new_rows) r on r.project_id=p.id for share of p;
 perform 1 from public.v2_towers t join (select distinct tower_id from material_new_rows where tower_id is not null) r on r.tower_id=t.id for share of t;
 if tg_table_name='v2_material_register' then
 perform 1 from public.v2_material_bundles b join (select distinct bundle_id from material_new_rows where bundle_id is not null) r on r.bundle_id=b.id for share of b;
 if exists(select 1 from material_new_rows r
 left join public.v2_projects p on p.id=r.project_id and p.organisation_id=r.organisation_id
 left join public.v2_towers t on t.id=r.tower_id and t.project_id=r.project_id and t.organisation_id=r.organisation_id
 left join public.v2_material_bundles b on b.id=r.bundle_id and b.project_id=r.project_id and b.organisation_id=r.organisation_id
 where p.id is null or (r.tower_id is not null and t.id is null)
 or (r.bundle_id is not null and (b.id is null or (r.tower_id is not null and b.tower_id is distinct from r.tower_id)))) then
 raise exception using errcode='23514',message='MATERIALS_RELATIONSHIP_INVALID'; end if;
 else
 if exists(select 1 from material_new_rows r
 left join public.v2_projects p on p.id=r.project_id and p.organisation_id=r.organisation_id
 left join public.v2_towers t on t.id=r.tower_id and t.project_id=r.project_id and t.organisation_id=r.organisation_id
 where p.id is null or (r.tower_id is not null and t.id is null)) then
 raise exception using errcode='23514',message='MATERIALS_RELATIONSHIP_INVALID'; end if;
 end if;
 return null;
end;
$$;
revoke all on function private.tttracker_v2_material_master_statement_guard() from public,anon,authenticated;
drop trigger if exists v2_material_relationship_guard on public.v2_material_register;
drop trigger if exists v2_material_relationship_guard on public.v2_material_bundles;
drop trigger if exists v2_material_master_insert_guard on public.v2_material_register;
drop trigger if exists v2_material_master_update_guard on public.v2_material_register;
drop trigger if exists v2_material_master_insert_guard on public.v2_material_bundles;
drop trigger if exists v2_material_master_update_guard on public.v2_material_bundles;
create trigger v2_material_master_insert_guard after insert on public.v2_material_register
referencing new table as material_new_rows for each statement execute function private.tttracker_v2_material_master_statement_guard();
create trigger v2_material_master_update_guard after update on public.v2_material_register
referencing new table as material_new_rows for each statement execute function private.tttracker_v2_material_master_statement_guard();
create trigger v2_material_master_insert_guard after insert on public.v2_material_bundles
referencing new table as material_new_rows for each statement execute function private.tttracker_v2_material_master_statement_guard();
create trigger v2_material_master_update_guard after update on public.v2_material_bundles
referencing new table as material_new_rows for each statement execute function private.tttracker_v2_material_master_statement_guard();

create or replace function public.tttracker_v2_apply_material_import_bulk(
 p_project_id uuid,p_organisation_id uuid,p_actor_id uuid,p_scope text,p_tower_ids uuid[],
 p_category text,p_mode text,p_source_role text,p_source_scope text,p_source_file text,
 p_profile_name text,p_mapping jsonb,p_rows jsonb,p_confirm_types boolean default false
) returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '120s' as $$
declare batch_id uuid; profile_id uuid; kind text; errors jsonb; n integer; targets integer;
 started timestamptz:=clock_timestamp(); phase timestamptz; timings jsonb:='{}';
 added integer; merged integer; unchanged integer; superseded integer:=0; expanded integer;
begin
 if p_category is null or p_category not in ('bundles','members','bolts','packers')
 or p_mode is null or p_mode not in ('add','merge','replace')
 or p_scope is null or p_scope not in ('single','selected','all','csv') then raise exception 'Invalid import category, mode or scope'; end if;
 if nullif(btrim(p_source_scope),'') is null or nullif(btrim(p_source_role),'') is null then raise exception 'Source role and document scope are required'; end if;
 if jsonb_typeof(p_mapping) is distinct from 'object' or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Expected mapping object and row array'; end if;
 n:=jsonb_array_length(p_rows);
 if n=0 or n>10000 then raise exception 'Import requires 1 to 10000 source rows'; end if;
 perform 1 from public.v2_projects where id=p_project_id and organisation_id=p_organisation_id for share;
 if not found then raise exception 'Project does not belong to this organisation'; end if;
 perform 1 from public.organisation_users where organisation_id=p_organisation_id and user_id=p_actor_id and status='active' for share;
 if not found then raise exception 'Import actor has no active organisation membership'; end if;
 perform 1 from public.v2_project_option_definitions where project_id=p_project_id and organisation_id=p_organisation_id
 and option_group='material_import_source_role' and option_key=p_source_role and is_active
 and (not(settings ? 'applies_to') or settings->'applies_to'='[]'::jsonb or settings->'applies_to' ? p_category);
 if not found then raise exception 'Import source role is disabled or not configured for this category'; end if;
 kind:=case p_category when 'bundles' then 'bundle' when 'members' then 'member' when 'bolts' then 'bolt' else 'packer' end;
 -- Temporary relations are private to this connection and disappear at commit.
 drop table if exists pg_temp.ttm_input,pg_temp.ttm_towers,pg_temp.ttm_plan,pg_temp.ttm_errors,pg_temp.ttm_matches,pg_temp.ttm_retired;
 create temporary table ttm_input on commit drop as
 select gen_random_uuid() as source_id,x.row_number,x.values as v,x.raw_payload,
 upper(btrim(x.values->>case when p_category='bundles' then 'bundle_reference' else 'item_reference' end)) as ref,
 x.values->>'tower_reference' as tower_reference,
 coalesce(x.raw_payload->>(p_mapping->>'tower_reference'),x.values->>'tower_reference') as source_tower_reference from jsonb_to_recordset(p_rows) x(row_number integer,values jsonb,raw_payload jsonb);
 create unique index on pg_temp.ttm_input(row_number);
 create index on pg_temp.ttm_input(ref);
 create temporary table ttm_errors(row_number integer,message text) on commit drop;
 insert into pg_temp.ttm_errors select row_number,'Invalid prepared import row' from pg_temp.ttm_input
 where row_number is null or row_number<1 or jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(raw_payload) is distinct from 'object';
 if exists(select 1 from pg_temp.ttm_errors) then raise exception 'Invalid prepared import row'; end if;
 insert into pg_temp.ttm_errors
 select i.row_number,'Invalid imported field: '||f.key from pg_temp.ttm_input i cross join lateral jsonb_each(i.v) f
 where f.key not in ('item_reference','bundle_reference','tower_reference','segment','drawing_reference','drawing_revision','source_revision','description','profile','material_code','diameter','length','bolt_type','packer_mark','material_item_id','bundle_id','required_quantity','total_weight_t')
 or (f.key in ('required_quantity','total_weight_t') and case when jsonb_typeof(f.value)='number' then (f.value::text)::numeric<0 else true end)
 or (f.key not in ('required_quantity','total_weight_t') and (jsonb_typeof(f.value)<>'string' or nullif(btrim(f.value#>>'{}'),'') is null));
 insert into pg_temp.ttm_errors select row_number,'Material reference is required' from pg_temp.ttm_input where ref is null or ref='';
 insert into pg_temp.ttm_errors select row_number,'Required fastener fields are missing' from pg_temp.ttm_input where p_category in ('bolts','packers')
 and (not(v ? 'required_quantity') or not(v ? 'drawing_reference') or not(v ? case when p_category='bolts' then 'diameter' else 'packer_mark' end));
 insert into pg_temp.ttm_errors select i.row_number,f.key||' must be a UUID' from pg_temp.ttm_input i cross join lateral jsonb_each(i.v) f
 where f.key in ('bundle_id','material_item_id') and (f.value#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
 if exists(select 1 from pg_temp.ttm_errors) then
 select jsonb_agg(jsonb_build_object('row',row_number,'message',message)) into errors from pg_temp.ttm_errors;
 return jsonb_build_object('ok',false,'error','Validation failed. No rows were applied.','rowErrors',errors); end if;
 create temporary table ttm_towers on commit drop as
 select t.id,t.tower_identifier,coalesce(nullif(y.type_code,''),y.name) as tower_type,t.tower_type_id
 from public.v2_towers t left join public.v2_tower_types y on y.id=t.tower_type_id
 where t.project_id=p_project_id and t.organisation_id=p_organisation_id
 and (p_scope in ('all','csv') or t.id=any(p_tower_ids));
 create unique index on pg_temp.ttm_towers(id);
 create index on pg_temp.ttm_towers(upper(btrim(tower_identifier)));
 if p_scope in ('single','selected') and (coalesce(cardinality(p_tower_ids),0)=0
 or (p_scope='single' and cardinality(p_tower_ids)<>1)
 or (select count(distinct id) from unnest(p_tower_ids) id)<>(select count(*) from pg_temp.ttm_towers)) then
 raise exception 'Tower does not belong to this project and organisation'; end if;
 if p_scope='all' and (coalesce(cardinality(p_tower_ids),0)=0
 or (select count(distinct id) from unnest(p_tower_ids) id)<>(select count(*) from pg_temp.ttm_towers)
 or exists(select 1 from unnest(p_tower_ids) as supplied(id) where not exists(select 1 from pg_temp.ttm_towers t where t.id=supplied.id))) then
 raise exception 'Project towers changed; review and confirm the scope again'; end if;
 if p_scope='csv' then
 insert into pg_temp.ttm_errors select i.row_number,case when count(t.id)=0 then 'Unmatched tower: ' else 'Ambiguous tower: ' end||coalesce(i.tower_reference,'(blank)')
 from pg_temp.ttm_input i left join pg_temp.ttm_towers t on upper(btrim(t.tower_identifier))=upper(btrim(i.tower_reference))
 group by i.row_number,i.tower_reference having count(t.id)<>1;
 end if;
 if exists(select 1 from pg_temp.ttm_errors) then
 select jsonb_agg(jsonb_build_object('row',row_number,'message',message)) into errors from pg_temp.ttm_errors;
 return jsonb_build_object('ok',false,'error','Validation failed. No rows were applied.','rowErrors',errors); end if;
 create temporary table ttm_plan on commit drop as
 select i.row_number,t.id as tower_id,t.tower_type,gen_random_uuid() as target_id,
 null::uuid as existing_id,null::uuid as link_bundle_id,null::jsonb as before_record,null::jsonb as after_record
 from pg_temp.ttm_input i join pg_temp.ttm_towers t on p_scope<>'csv' or upper(btrim(t.tower_identifier))=upper(btrim(i.tower_reference));
 create unique index on pg_temp.ttm_plan(tower_id,row_number);
 create index on pg_temp.ttm_plan(row_number);
 expanded:=(select count(*) from pg_temp.ttm_plan);
 if expanded=0 or expanded>1000000 then raise exception 'Import requires 1 to 1000000 tower requirements'; end if;
 targets:=(select count(distinct tower_id) from pg_temp.ttm_plan);
 if p_scope in ('selected','all') and targets>1 and not p_confirm_types then raise exception 'Confirm schedule applicability for selected tower types'; end if;
 -- Serialize overlapping tower scopes, in deterministic order, without blocking unrelated towers.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_project_id::text||x.tower_id::text,0))
 from (select distinct tower_id from pg_temp.ttm_plan order by tower_id) x;
 perform 1 from public.v2_towers t join pg_temp.ttm_towers x on x.id=t.id for share of t;
 perform 1 from public.v2_material_bundles b where b.project_id=p_project_id and b.organisation_id=p_organisation_id
 and b.tower_id in(select distinct tower_id from pg_temp.ttm_plan) for update;
 perform 1 from public.v2_material_register m where m.project_id=p_project_id and m.organisation_id=p_organisation_id
 and m.tower_id in(select distinct tower_id from pg_temp.ttm_plan) for update;
 -- Duplicate checks use indexed relational keys rather than rescanning an ever-growing JSON plan.
 insert into pg_temp.ttm_errors select distinct a.row_number,'Duplicate or ambiguous key with row '||b.row_number
 from pg_temp.ttm_input a join pg_temp.ttm_input b on a.ref=b.ref and a.row_number<>b.row_number
 join pg_temp.ttm_plan pa on pa.row_number=a.row_number
 join pg_temp.ttm_plan pb on pb.row_number=b.row_number and pb.tower_id=pa.tower_id
 where private.tttracker_v2_material_import_compatible(a.v,b.v,p_category);
 create temporary table ttm_matches(tower_id uuid,row_number integer,id uuid) on commit drop;
 if p_category='bundles' then
 insert into pg_temp.ttm_matches
 select q.tower_id,q.row_number,b.id from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number)
 join public.v2_material_bundles b on b.project_id=p_project_id and b.organisation_id=p_organisation_id and b.tower_id=q.tower_id
 and upper(btrim(b.bundle_reference))=i.ref
 and private.tttracker_v2_material_import_compatible(jsonb_build_object('segment',b.segment),i.v,p_category);
 else
 insert into pg_temp.ttm_matches
 select q.tower_id,q.row_number,m.id from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number)
 join public.v2_material_register m on m.project_id=p_project_id and m.organisation_id=p_organisation_id and m.tower_id=q.tower_id
 and m.material_kind=kind and upper(btrim(m.item_reference))=i.ref
 and private.tttracker_v2_material_import_compatible(jsonb_build_object('segment',m.segment,'drawing_reference',m.drawing_reference,
 'diameter',m.diameter,'length',m.length,'bolt_type',m.bolt_type,'packer_mark',m.packer_mark),i.v,p_category);
 end if;
 create index on pg_temp.ttm_matches(tower_id,row_number);
 insert into pg_temp.ttm_errors select q.row_number,'Multiple matching master records; supply deterministic context or a record ID'
 from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number) join pg_temp.ttm_matches x using(tower_id,row_number)
 where not (i.v ? case when p_category='bundles' then 'bundle_id' else 'material_item_id' end)
 group by q.tower_id,q.row_number having count(x.id)>1;
 insert into pg_temp.ttm_errors select q.row_number,'Supplied material_item_id or bundle_id does not match this tower/project/reference'
 from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number)
 where i.v ? case when p_category='bundles' then 'bundle_id' else 'material_item_id' end
 and not exists(select 1 from pg_temp.ttm_matches x where x.tower_id=q.tower_id and x.row_number=q.row_number
 and x.id=(i.v->>case when p_category='bundles' then 'bundle_id' else 'material_item_id' end)::uuid);
 insert into pg_temp.ttm_errors select row_number,'A bundle row cannot supply material_item_id' from pg_temp.ttm_input where p_category='bundles' and v ? 'material_item_id';
 update pg_temp.ttm_plan q set existing_id=x.id,target_id=x.id from (
 select x.tower_id,x.row_number,(array_agg(x.id))[1] id from pg_temp.ttm_matches x join pg_temp.ttm_input i using(row_number)
 where not(i.v ? case when p_category='bundles' then 'bundle_id' else 'material_item_id' end)
 or x.id=(i.v->>case when p_category='bundles' then 'bundle_id' else 'material_item_id' end)::uuid
 group by x.tower_id,x.row_number) x where x.tower_id=q.tower_id and x.row_number=q.row_number;
 insert into pg_temp.ttm_errors select q.row_number,'Multiple rows resolve to the same canonical record' from pg_temp.ttm_plan q
 join (select existing_id from pg_temp.ttm_plan where existing_id is not null group by existing_id having count(*)>1) d using(existing_id);
 if p_category<>'bundles' then
 truncate pg_temp.ttm_matches;
 insert into pg_temp.ttm_matches select q.tower_id,q.row_number,b.id from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number)
 join public.v2_material_bundles b on b.project_id=p_project_id and b.organisation_id=p_organisation_id and b.tower_id=q.tower_id and b.is_active
 and (case when i.v ? 'bundle_id' then b.id=(i.v->>'bundle_id')::uuid else p_category='members' and upper(btrim(b.bundle_reference))=upper(btrim(i.v->>'bundle_reference')) end)
 and (not(i.v ? 'bundle_reference') or upper(btrim(b.bundle_reference))=upper(btrim(i.v->>'bundle_reference')))
 and private.tttracker_v2_material_import_compatible(jsonb_build_object('segment',b.segment),i.v,'bundles');
 insert into pg_temp.ttm_errors select q.row_number,'bundle_id does not belong to this tower/project or conflicts with its reference'
 from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number) where i.v ? 'bundle_id'
 and not exists(select 1 from pg_temp.ttm_matches x where x.tower_id=q.tower_id and x.row_number=q.row_number);
 insert into pg_temp.ttm_errors select row_number,'Ambiguous bundle reference; supply a segment or explicit bundle ID'
 from pg_temp.ttm_matches group by tower_id,row_number having count(*)>1;
 update pg_temp.ttm_plan q set link_bundle_id=x.id from (select tower_id,row_number,(array_agg(id))[1] id
 from pg_temp.ttm_matches group by tower_id,row_number having count(*)=1) x where x.tower_id=q.tower_id and x.row_number=q.row_number;
 update pg_temp.ttm_plan q set before_record=to_jsonb(m) from public.v2_material_register m where m.id=q.existing_id;
 insert into pg_temp.ttm_errors select q.row_number,'Existing bundle relationship conflicts; use an amendment instead'
 from pg_temp.ttm_plan q where q.link_bundle_id is not null and q.before_record->>'bundle_id' is not null
 and (q.before_record->>'bundle_id')::uuid<>q.link_bundle_id;
 insert into pg_temp.ttm_errors select q.row_number,'Existing bundle reference conflicts; use an amendment instead'
 from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number) where nullif(btrim(q.before_record->>'bundle_reference'),'') is not null
 and i.v ? 'bundle_reference' and upper(btrim(q.before_record->>'bundle_reference'))<>upper(btrim(i.v->>'bundle_reference'));
 else
 update pg_temp.ttm_plan q set before_record=to_jsonb(b) from public.v2_material_bundles b where b.id=q.existing_id;
 end if;
 insert into pg_temp.ttm_errors select row_number,'Matching master is archived; use Merge or Replace to reactivate it safely'
 from pg_temp.ttm_plan where p_mode='add' and before_record->>'is_active'='false';
 if exists(select 1 from pg_temp.ttm_errors) then
 select jsonb_agg(jsonb_build_object('row',row_number,'message',message)) into errors from (select distinct row_number,message from pg_temp.ttm_errors order by row_number,message) e;
 return jsonb_build_object('ok',false,'error','Validation failed. No rows were applied.','rowErrors',errors); end if;
 timings:=jsonb_build_object('validation_ms',round(extract(epoch from clock_timestamp()-started)*1000));
 phase:=clock_timestamp();
 -- All permanent writes start here, after complete live-state validation.
 if nullif(btrim(p_profile_name),'') is not null then
 select id into profile_id from public.v2_material_import_profiles where organisation_id=p_organisation_id and project_id=p_project_id and lower(name)=lower(btrim(p_profile_name));
 if profile_id is null then
 insert into public.v2_material_import_profiles(organisation_id,project_id,name,source_type_key,mapping,defaults,created_by)
 values(p_organisation_id,p_project_id,btrim(p_profile_name),p_source_role,p_mapping,jsonb_build_object('import_category_key',p_category),p_actor_id) returning id into profile_id;
 else update public.v2_material_import_profiles set mapping=p_mapping,source_type_key=p_source_role,updated_at=now() where id=profile_id; end if;
 end if;
 insert into public.v2_material_import_batches(organisation_id,project_id,target_tower_id,import_category_key,source_role_key,source_type_key,source_scope_key,source_file_name,profile_id,status,import_mode,total_rows,mapping,created_by)
 values(p_organisation_id,p_project_id,case when targets=1 then (select tower_id from pg_temp.ttm_plan limit 1) end,p_category,p_source_role,p_source_role,btrim(p_source_scope),nullif(btrim(p_source_file),''),profile_id,'committing',p_mode,n,p_mapping,p_actor_id) returning id into batch_id;
 insert into public.v2_material_import_source_rows(id,organisation_id,project_id,import_batch_id,source_row_number,source_tower_reference,values,raw_payload)
 select source_id,p_organisation_id,p_project_id,batch_id,row_number,source_tower_reference,v,raw_payload from pg_temp.ttm_input;
 create temporary table ttm_retired on commit drop as
 select s.material_item_id,s.bundle_id,s.material_kind from public.v2_material_source_records s
 where p_mode='replace' and s.project_id=p_project_id and s.organisation_id=p_organisation_id
 and s.tower_id in(select distinct tower_id from pg_temp.ttm_plan) and s.import_category_key=p_category
 and s.source_role_key=p_source_role and s.source_scope_key=btrim(p_source_scope) and s.superseded_by_batch_id is null;
 if p_mode='replace' then
 update public.v2_material_source_records s set superseded_by_batch_id=batch_id
 where s.project_id=p_project_id and s.organisation_id=p_organisation_id and s.tower_id in(select distinct tower_id from pg_temp.ttm_plan)
 and s.import_category_key=p_category and s.source_role_key=p_source_role and s.source_scope_key=btrim(p_source_scope) and s.superseded_by_batch_id is null;
 get diagnostics superseded=row_count; end if;
 added:=(select count(*) from pg_temp.ttm_plan where existing_id is null);
 merged:=case when p_mode='add' then 0 else expanded-added end;
 unchanged:=case when p_mode='add' then expanded-added else 0 end;

 if p_category='bundles' then
 insert into public.v2_material_bundles(id,organisation_id,project_id,tower_id,tower_type,bundle_reference,segment,required_quantity,total_weight_t,source_document,source_revision,source_import_batch_id,metadata,origin_organisation_id)
 select q.target_id,p_organisation_id,p_project_id,q.tower_id,q.tower_type,i.v->>'bundle_reference',i.v->>'segment',coalesce((i.v->>'required_quantity')::numeric,1),(i.v->>'total_weight_t')::numeric,
 nullif(btrim(p_source_file),''),i.v->>'source_revision',batch_id,jsonb_strip_nulls(jsonb_build_object('description',i.v->>'description','source_role',p_source_role)),p_organisation_id
 from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number) where q.existing_id is null;
 if p_mode<>'add' then
 update public.v2_material_bundles b set segment=coalesce(i.v->>'segment',b.segment),required_quantity=coalesce((i.v->>'required_quantity')::numeric,b.required_quantity),
 total_weight_t=coalesce((i.v->>'total_weight_t')::numeric,b.total_weight_t),is_active=true,updated_at=now(),
 metadata=b.metadata||case when i.v ? 'description' then jsonb_build_object('description',i.v->>'description') else '{}'::jsonb end
 from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number) where b.id=q.existing_id;
 end if;
 update pg_temp.ttm_plan q set after_record=to_jsonb(b) from public.v2_material_bundles b where b.id=q.target_id;
 else
 insert into public.v2_material_register(id,organisation_id,project_id,tower_id,tower_type,material_kind,item_reference,description,bundle_id,bundle_reference,segment,drawing_reference,drawing_revision,profile,material_code,diameter,length,bolt_type,packer_mark,required_quantity,source_kind,source_role_key,source_document,source_revision,source_import_batch_id,origin_organisation_id)
 select q.target_id,p_organisation_id,p_project_id,q.tower_id,q.tower_type,kind,i.v->>'item_reference',i.v->>'description',q.link_bundle_id,i.v->>'bundle_reference',i.v->>'segment',i.v->>'drawing_reference',i.v->>'drawing_revision',i.v->>'profile',i.v->>'material_code',i.v->>'diameter',i.v->>'length',i.v->>'bolt_type',i.v->>'packer_mark',(i.v->>'required_quantity')::numeric,
 p_source_role,p_source_role,nullif(btrim(p_source_file),''),coalesce(i.v->>'source_revision',i.v->>'drawing_revision'),batch_id,p_organisation_id
 from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number) where q.existing_id is null;
 if p_mode<>'add' then
 update public.v2_material_register m set
 description=coalesce(i.v->>'description',m.description),
 bundle_reference=coalesce(i.v->>'bundle_reference',m.bundle_reference),
 segment=coalesce(i.v->>'segment',m.segment),
 drawing_reference=coalesce(i.v->>'drawing_reference',m.drawing_reference),
 drawing_revision=coalesce(i.v->>'drawing_revision',m.drawing_revision),
 profile=coalesce(i.v->>'profile',m.profile),
 material_code=coalesce(i.v->>'material_code',m.material_code),
 diameter=coalesce(i.v->>'diameter',m.diameter),
 length=coalesce(i.v->>'length',m.length),
 bolt_type=coalesce(i.v->>'bolt_type',m.bolt_type),
 packer_mark=coalesce(i.v->>'packer_mark',m.packer_mark),required_quantity=coalesce((i.v->>'required_quantity')::numeric,m.required_quantity),bundle_id=coalesce(m.bundle_id,q.link_bundle_id),is_active=true,updated_at=now()
 from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number) where m.id=q.existing_id;
 end if;
 insert into public.v2_material_bundle_members(organisation_id,project_id,tower_id,bundle_id,material_item_id,member_reference,quantity,source_document,source_revision,metadata)
 select p_organisation_id,p_project_id,q.tower_id,q.link_bundle_id,q.target_id,i.v->>'item_reference',coalesce((i.v->>'required_quantity')::numeric,1),nullif(btrim(p_source_file),''),i.v->>'drawing_revision',jsonb_build_object('import_batch_id',batch_id)
 from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number) where kind='member' and q.link_bundle_id is not null
 and (q.existing_id is null or p_mode<>'add') and not exists(select 1 from public.v2_material_bundle_members bm where bm.bundle_id=q.link_bundle_id and bm.material_item_id=q.target_id);
 update pg_temp.ttm_plan q set after_record=to_jsonb(m) from public.v2_material_register m where m.id=q.target_id;
 end if;
 timings:=timings||jsonb_build_object('canonical_ms',round(extract(epoch from clock_timestamp()-phase)*1000));
 phase:=clock_timestamp();
 insert into public.v2_material_source_records(organisation_id,project_id,import_batch_id,source_type_key,source_role_key,source_scope_key,import_category_key,source_row_number,source_row_id,tower_id,tower_type,material_kind,item_reference,description,bundle_reference,segment,drawing_reference,drawing_revision,source_revision,profile,material_code,diameter,length,bolt_type,packer_mark,required_quantity,total_weight_t,unit,raw_payload,material_item_id,bundle_id,canonical_before,canonical_after)
 select p_organisation_id,p_project_id,batch_id,p_source_role,p_source_role,btrim(p_source_scope),p_category,q.row_number,i.source_id,q.tower_id,q.tower_type,kind,i.v->>'item_reference',i.v->>'description',i.v->>'bundle_reference',i.v->>'segment',i.v->>'drawing_reference',i.v->>'drawing_revision',i.v->>'source_revision',i.v->>'profile',i.v->>'material_code',i.v->>'diameter',i.v->>'length',i.v->>'bolt_type',i.v->>'packer_mark',(i.v->>'required_quantity')::numeric,(i.v->>'total_weight_t')::numeric,
 case when kind='bundle' then 'bundle' else 'ea' end,case when targets=1 then i.raw_payload else '{}'::jsonb end,
 case when kind<>'bundle' then q.target_id end,case when kind='bundle' then q.target_id else q.link_bundle_id end,q.before_record,q.after_record
 from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number);
 timings:=timings||jsonb_build_object('source_history_ms',round(extract(epoch from clock_timestamp()-phase)*1000));
 phase:=clock_timestamp();
 if p_mode='replace' then
 update public.v2_material_register m set is_active=false,updated_at=now()
 where m.id in(select material_item_id from pg_temp.ttm_retired) and m.project_id=p_project_id and m.organisation_id=p_organisation_id
 and not exists(select 1 from public.v2_material_source_records s where s.material_item_id=m.id and s.superseded_by_batch_id is null);
 update public.v2_material_bundles b set is_active=false,updated_at=now()
 where p_category='bundles' and b.id in(select bundle_id from pg_temp.ttm_retired where material_kind='bundle') and b.project_id=p_project_id and b.organisation_id=p_organisation_id
 and not exists(select 1 from public.v2_material_source_records s where s.bundle_id=b.id and s.material_kind='bundle' and s.superseded_by_batch_id is null);
 end if;
 -- Bundle imports reconcile unique unlinked members once, with a grouped relation.
 if p_category='bundles' and p_mode<>'add' then
 truncate pg_temp.ttm_matches;
 insert into pg_temp.ttm_matches(tower_id,row_number,id)
 select m.id,0,(array_agg(b.id))[1] from public.v2_material_register m join public.v2_material_bundles b
 on b.project_id=m.project_id and b.organisation_id=m.organisation_id and b.tower_id=m.tower_id and b.is_active
 and upper(btrim(b.bundle_reference))=upper(btrim(m.bundle_reference))
 and private.tttracker_v2_material_import_compatible(jsonb_build_object('segment',b.segment),jsonb_build_object('segment',m.segment),'bundles')
 where m.project_id=p_project_id and m.organisation_id=p_organisation_id and m.tower_id in(select distinct tower_id from pg_temp.ttm_plan)
 and m.material_kind='member' and m.is_active and m.bundle_id is null group by m.id having count(*)=1;
 update public.v2_material_register m set bundle_id=x.id from pg_temp.ttm_matches x where m.id=x.tower_id;
 insert into public.v2_material_bundle_members(organisation_id,project_id,tower_id,bundle_id,material_item_id,member_reference,quantity,metadata)
 select p_organisation_id,p_project_id,m.tower_id,x.id,m.id,m.item_reference,coalesce(m.required_quantity,1),jsonb_build_object('linked_by_import_batch',batch_id)
 from pg_temp.ttm_matches x join public.v2_material_register m on m.id=x.tower_id
 where not exists(select 1 from public.v2_material_bundle_members bm where bm.material_item_id=m.id and bm.bundle_id=x.id);
 end if;
 update public.v2_material_import_batches set status='completed',imported_rows=n,committed_at=now(),metadata=jsonb_build_object(
 'scope',p_scope,'target_tower_ids',(select jsonb_agg(distinct tower_id) from pg_temp.ttm_plan),
 'source_rows',n,'target_requirements',expanded,'added_rows',added,'merged_rows',merged,'unchanged_rows',unchanged,'superseded_rows',superseded) where id=batch_id;
 return jsonb_build_object('ok',true,'batchId',batch_id,'acceptedRows',n,'rejectedRows',0,'appliedRequirementRows',expanded,'targetTowers',targets,
 'timings',timings||jsonb_build_object('finish_ms',round(extract(epoch from clock_timestamp()-phase)*1000)),
 'addedRows',added,'mergedRows',merged,'unchangedRows',unchanged,'supersededRows',superseded,'rowErrors','[]'::jsonb);
end;
$$;
revoke all on function public.tttracker_v2_apply_material_import_bulk(uuid,uuid,uuid,text,uuid[],text,text,text,text,text,text,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.tttracker_v2_apply_material_import_bulk(uuid,uuid,uuid,text,uuid[],text,text,text,text,text,text,jsonb,jsonb,boolean) to service_role;
-- Keep the historical single-tower entry point on the same optimized implementation.
create or replace function public.tttracker_v2_apply_material_import(
 p_project_id uuid,p_organisation_id uuid,p_tower_id uuid,p_actor_id uuid,
 p_category text,p_mode text,p_source_role text,p_source_scope text,p_source_file text,p_profile_name text,p_mapping jsonb,p_rows jsonb
) returns jsonb language sql security definer set search_path = '' set statement_timeout = '120s' as $$
 select public.tttracker_v2_apply_material_import_bulk(p_project_id,p_organisation_id,p_actor_id,'single',array[p_tower_id],p_category,p_mode,p_source_role,p_source_scope,p_source_file,p_profile_name,p_mapping,p_rows,false);
$$;
revoke all on function public.tttracker_v2_apply_material_import(uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.tttracker_v2_apply_material_import(uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;

;

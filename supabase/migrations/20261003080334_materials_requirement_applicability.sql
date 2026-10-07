-- Profile-driven source requirement applicability and distinct tower manifest rows.
begin;
alter table public.v2_material_import_source_rows add column if not exists requirement_key text,
 add column if not exists applicability_rule jsonb not null default '{}',
 add column if not exists superseded_by_batch_id uuid references public.v2_material_import_batches(id) on delete restrict;
alter table public.v2_material_register add column if not exists requirement_variant_key text, add column if not exists package_context text;
alter table public.v2_material_bundles add column if not exists manifest_row_key text, add column if not exists package_context text;
create index if not exists v2_material_requirement_variant_idx on public.v2_material_register(project_id,tower_id,requirement_variant_key) where requirement_variant_key is not null;
create index if not exists v2_material_manifest_row_idx on public.v2_material_bundles(project_id,tower_id,manifest_row_key) where manifest_row_key is not null;
-- Operational UUIDs/state remain unchanged; applicability is not inferred from old uploads.
create or replace function private.tttracker_v2_material_requirement_key(p_scope text,p_role text,p_row integer,p_values jsonb)
returns text language sql immutable set search_path='' as $$
 select md5(jsonb_build_object('scope',btrim(p_scope),'role',p_role,'row',p_row,
 'reference',upper(btrim(coalesce(p_values->>'item_reference',p_values->>'bundle_reference'))),
 'bundle',upper(btrim(p_values->>'bundle_reference')),'drawing',upper(btrim(p_values->>'drawing_reference')),
 'segment',upper(btrim(p_values->>'segment')),'profile',upper(btrim(p_values->>'profile')),'package_context',upper(btrim(p_values->>'package_context')))::text);
$$;
revoke all on function private.tttracker_v2_material_requirement_key(text,text,integer,jsonb) from public,anon,authenticated;
-- Recover legacy manifest row identity only when every active source agrees on one
-- physical source row/context. No UUIDs, quantities, checks or links are changed.
with evidence as (
 select s.bundle_id,private.tttracker_v2_material_requirement_key(s.source_scope_key,s.source_role_key,s.source_row_number,
 jsonb_build_object('bundle_reference',s.bundle_reference,'drawing_reference',s.drawing_reference,'segment',s.segment,'profile',s.profile)) as row_key
 from public.v2_material_source_records s join public.v2_material_bundles b on b.id=s.bundle_id and b.project_id=s.project_id and b.organisation_id=s.organisation_id and b.tower_id=s.tower_id
 where s.material_kind='bundle' and s.superseded_by_batch_id is null and s.source_row_number is not null and s.source_scope_key is not null and s.source_role_key is not null
 and upper(btrim(s.bundle_reference))=upper(btrim(b.bundle_reference)) and s.segment is not distinct from b.segment
), agreed as(select bundle_id,min(row_key) row_key from evidence group by bundle_id having count(distinct row_key)=1)
update public.v2_material_bundles b set manifest_row_key=a.row_key from agreed a where b.id=a.bundle_id and b.manifest_row_key is null and b.package_context is null
and not exists(select 1 from public.v2_material_source_records s where s.bundle_id=b.id and s.material_kind='bundle' and s.superseded_by_batch_id is null
and (s.source_row_number is null or s.source_scope_key is null or s.source_role_key is null or s.segment is distinct from b.segment
 or s.project_id<>b.project_id or s.organisation_id<>b.organisation_id or s.tower_id is distinct from b.tower_id
 or upper(btrim(s.bundle_reference)) is distinct from upper(btrim(b.bundle_reference))));
create or replace function public.tttracker_v2_apply_material_schedule(
 p_project_id uuid,p_organisation_id uuid,p_actor_id uuid,p_scope text,p_tower_ids uuid[],
 p_category text,p_mode text,p_source_role text,p_source_scope text,p_source_file text,
 p_profile_name text,p_mapping jsonb,p_rows jsonb,p_confirm_types boolean default false,p_options jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '120s' as $$
declare batch_id uuid; profile_id uuid; kind text; errors jsonb; n integer; targets integer;
 started timestamptz:=clock_timestamp(); phase timestamptz; timings jsonb:='{}';
 rule jsonb; variant_mode boolean; manifest_mode boolean; delimiter text; blank_mode text; unmatched_mode text;
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
 rule:=p_options->'applicability';
 variant_mode:=p_category='members';
 manifest_mode:=p_category='bundles' and coalesce(p_options->>'bundleIdentity','source_row')='source_row';
 if jsonb_typeof(p_options) is distinct from 'object' or coalesce(p_options->>'bundleIdentity','source_row') not in ('source_row','reference_context') then raise exception 'Invalid import options'; end if;
 if p_mapping ? 'applicable_towers' and nullif(p_mapping->>'applicable_towers','') is not null then
 if p_category<>'members' or rule is null or rule->>'kind' is distinct from 'tower_list' then raise exception 'Configure a supported applicability rule for the mapped column'; end if;
 delimiter:=rule->>'delimiter'; blank_mode:=rule->>'blank'; unmatched_mode:=coalesce(rule->>'unmatched','error');
 if delimiter is null or length(delimiter) not between 1 and 5 or blank_mode is null or blank_mode not in ('common','none','error') or unmatched_mode not in ('error','retain') then raise exception 'Invalid applicability blank behaviour or delimiter'; end if;
 else
 if rule is not null then raise exception 'Map the applicability column before enabling the rule'; end if;
 end if;
 kind:=case p_category when 'bundles' then 'bundle' when 'members' then 'member' when 'bolts' then 'bolt' else 'packer' end;
 -- Temporary relations are private to this connection and disappear at commit.
 drop table if exists pg_temp.ttm_input,pg_temp.ttm_towers,pg_temp.ttm_plan,pg_temp.ttm_errors,pg_temp.ttm_matches,pg_temp.ttm_retired,pg_temp.ttm_scope,pg_temp.ttm_rule_targets,pg_temp.ttm_rule_references;
 create temporary table ttm_input on commit drop as
 select gen_random_uuid() as source_id,x.row_number,x.values as v,x.raw_payload,
 upper(btrim(x.values->>case when p_category='bundles' then 'bundle_reference' else 'item_reference' end)) as ref,
 x.values->>'tower_reference' as tower_reference,
 coalesce(x.raw_payload->>(p_mapping->>'tower_reference'),x.values->>'tower_reference') as source_tower_reference from jsonb_to_recordset(p_rows) x(row_number integer,values jsonb,raw_payload jsonb);
 create unique index on pg_temp.ttm_input(row_number);
 create index on pg_temp.ttm_input(ref);
 alter table pg_temp.ttm_input add column variant_key text;
 update pg_temp.ttm_input set variant_key=private.tttracker_v2_material_requirement_key(p_source_scope,p_source_role,row_number,v);

 create temporary table ttm_errors(row_number integer,message text) on commit drop;
 insert into pg_temp.ttm_errors select row_number,'Invalid prepared import row' from pg_temp.ttm_input
 where row_number is null or row_number<1 or jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(raw_payload) is distinct from 'object';
 if exists(select 1 from pg_temp.ttm_errors) then raise exception 'Invalid prepared import row'; end if;
 insert into pg_temp.ttm_errors
 select i.row_number,'Invalid imported field: '||f.key from pg_temp.ttm_input i cross join lateral jsonb_each(i.v) f
 where f.key not in ('package_context','applicable_towers','item_reference','bundle_reference','tower_reference','segment','drawing_reference','drawing_revision','source_revision','description','profile','material_code','diameter','length','bolt_type','packer_mark','material_item_id','bundle_id','required_quantity','total_weight_t')
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
 create temporary table ttm_scope on commit drop as select * from pg_temp.ttm_towers
 where p_scope<>'csv' or upper(btrim(tower_identifier)) in(select upper(btrim(tower_reference)) from pg_temp.ttm_input);
 create temporary table ttm_rule_references(row_number integer,reference text) on commit drop;
 create temporary table ttm_rule_targets(row_number integer,tower_id uuid,reference text) on commit drop;
 if rule is not null then
 insert into pg_temp.ttm_rule_references select distinct i.row_number,r.reference from pg_temp.ttm_input i
 cross join lateral (select upper(btrim(reference)) reference from unnest(string_to_array(i.v->>'applicable_towers',delimiter)) x(reference))r;
 insert into pg_temp.ttm_errors select row_number,'Applicable towers is required by this profile' from pg_temp.ttm_input where not(v ? 'applicable_towers') and blank_mode='error';
 insert into pg_temp.ttm_errors select distinct i.row_number,case when count(t.id)=0 then 'Unmatched tower: ' else 'Ambiguous tower: ' end||upper(btrim(r.reference))
 from pg_temp.ttm_input i cross join lateral (select distinct upper(btrim(reference)) reference from unnest(string_to_array(i.v->>'applicable_towers',delimiter)) x(reference)) r
 left join public.v2_towers t on t.project_id=p_project_id and t.organisation_id=p_organisation_id and upper(btrim(t.tower_identifier))=upper(btrim(r.reference))
 group by i.row_number,upper(btrim(r.reference)) having count(t.id)>1 or (count(t.id)=0 and (unmatched_mode='error' or upper(btrim(r.reference))=''));
 insert into pg_temp.ttm_rule_targets select distinct i.row_number,t.id,upper(btrim(r.reference))
 from pg_temp.ttm_input i cross join lateral (select distinct upper(btrim(reference)) reference from unnest(string_to_array(i.v->>'applicable_towers',delimiter)) x(reference)) r
 join public.v2_towers t on t.project_id=p_project_id and t.organisation_id=p_organisation_id and upper(btrim(t.tower_identifier))=upper(btrim(r.reference));
 if exists(select 1 from pg_temp.ttm_errors) then
 select jsonb_agg(jsonb_build_object('row',row_number,'message',message)) into errors from pg_temp.ttm_errors;
 return jsonb_build_object('ok',false,'error','Validation failed. No rows were applied.','rowErrors',errors); end if;
 end if;
 create temporary table ttm_plan on commit drop as
 select i.row_number,t.id as tower_id,t.tower_type,gen_random_uuid() as target_id,
 null::uuid as existing_id,null::uuid as link_bundle_id,null::jsonb as before_record,null::jsonb as after_record
 from pg_temp.ttm_input i join pg_temp.ttm_scope t on p_scope<>'csv' or upper(btrim(t.tower_identifier))=upper(btrim(i.tower_reference))
 where rule is null or (not(i.v ? 'applicable_towers') and blank_mode='common') or exists(select 1 from pg_temp.ttm_rule_targets r where r.row_number=i.row_number and r.tower_id=t.id);
 create unique index on pg_temp.ttm_plan(tower_id,row_number);
 create index on pg_temp.ttm_plan(row_number);
 expanded:=(select count(*) from pg_temp.ttm_plan);
 if expanded>1000000 then raise exception 'Import exceeds 1000000 effective tower requirements'; end if;
 targets:=(select count(*) from pg_temp.ttm_scope);
 if p_scope in ('selected','all') and targets>1 and not p_confirm_types then raise exception 'Confirm schedule applicability for selected tower types'; end if;
 -- Serialize overlapping tower scopes, in deterministic order, without blocking unrelated towers.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_project_id::text||x.tower_id::text,0))
 from (select id as tower_id from pg_temp.ttm_scope order by id) x;
 perform 1 from public.v2_towers t join pg_temp.ttm_towers x on x.id=t.id for share of t;
 perform 1 from public.v2_material_bundles b where b.project_id=p_project_id and b.organisation_id=p_organisation_id
 and b.tower_id in(select id from pg_temp.ttm_scope) for update;
 perform 1 from public.v2_material_register m where m.project_id=p_project_id and m.organisation_id=p_organisation_id
 and m.tower_id in(select id from pg_temp.ttm_scope) for update;
 -- Duplicate checks use indexed relational keys rather than rescanning an ever-growing JSON plan.
 insert into pg_temp.ttm_errors select distinct a.row_number,'Duplicate or ambiguous key with row '||b.row_number
 from pg_temp.ttm_input a join pg_temp.ttm_input b on a.ref=b.ref and a.row_number<>b.row_number
 join pg_temp.ttm_plan pa on pa.row_number=a.row_number
 join pg_temp.ttm_plan pb on pb.row_number=b.row_number and pb.tower_id=pa.tower_id
 where not variant_mode and not manifest_mode and private.tttracker_v2_material_import_compatible(a.v,b.v,p_category);
 create temporary table ttm_matches(tower_id uuid,row_number integer,id uuid) on commit drop;
 if p_category='bundles' then
 insert into pg_temp.ttm_matches
 select q.tower_id,q.row_number,b.id from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number)
 join public.v2_material_bundles b on b.project_id=p_project_id and b.organisation_id=p_organisation_id and b.tower_id=q.tower_id
 and upper(btrim(b.bundle_reference))=i.ref
 and (not manifest_mode or b.manifest_row_key=i.variant_key or (i.v ? 'bundle_id' and b.id=(i.v->>'bundle_id')::uuid))
 and private.tttracker_v2_material_import_compatible(jsonb_build_object('segment',b.segment),i.v,p_category)
 and (not(i.v ? 'package_context') or b.package_context is null or upper(btrim(b.package_context))=upper(btrim(i.v->>'package_context')));
 else
 insert into pg_temp.ttm_matches
 select q.tower_id,q.row_number,m.id from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number)
 join public.v2_material_register m on m.project_id=p_project_id and m.organisation_id=p_organisation_id and m.tower_id=q.tower_id
 and m.material_kind=kind and upper(btrim(m.item_reference))=i.ref
 and (not variant_mode or m.requirement_variant_key=i.variant_key or (i.v ? 'material_item_id' and m.id=(i.v->>'material_item_id')::uuid))
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
 and private.tttracker_v2_material_import_compatible(jsonb_build_object('segment',b.segment),i.v,'bundles')
 and (not(i.v ? 'package_context') or b.package_context is null or upper(btrim(b.package_context))=upper(btrim(i.v->>'package_context')));
 insert into pg_temp.ttm_errors select q.row_number,'bundle_id does not belong to this tower/project or conflicts with its reference'
 from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number) where i.v ? 'bundle_id'
 and not exists(select 1 from pg_temp.ttm_matches x where x.tower_id=q.tower_id and x.row_number=q.row_number);
 -- Ambiguous implicit packing hints stay unresolved; explicit IDs remain validated above.
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
 values(p_organisation_id,p_project_id,btrim(p_profile_name),p_source_role,p_mapping,jsonb_build_object('import_category_key',p_category,'import_options',p_options),p_actor_id) returning id into profile_id;
 else update public.v2_material_import_profiles set mapping=p_mapping,source_type_key=p_source_role,defaults=defaults||jsonb_build_object('import_category_key',p_category,'import_options',p_options),updated_at=now() where id=profile_id; end if;
 end if;
 insert into public.v2_material_import_batches(organisation_id,project_id,target_tower_id,import_category_key,source_role_key,source_type_key,source_scope_key,source_file_name,profile_id,status,import_mode,total_rows,mapping,created_by)
 values(p_organisation_id,p_project_id,case when targets=1 then (select tower_id from pg_temp.ttm_plan limit 1) end,p_category,p_source_role,p_source_role,btrim(p_source_scope),nullif(btrim(p_source_file),''),profile_id,'committing',p_mode,n,p_mapping,p_actor_id) returning id into batch_id;
 insert into public.v2_material_import_source_rows(id,organisation_id,project_id,import_batch_id,source_row_number,source_tower_reference,values,raw_payload,requirement_key,applicability_rule)
 select source_id,p_organisation_id,p_project_id,batch_id,row_number,source_tower_reference,v,raw_payload,variant_key,jsonb_build_object('configuration',coalesce(rule,'null'::jsonb),'source_value',v->>'applicable_towers','evaluated_scope',p_scope) from pg_temp.ttm_input;
 -- Merge versions matching source requirements; their evidence remains audit history.
 if p_mode='merge' and variant_mode then
 update public.v2_material_source_records s set superseded_by_batch_id=batch_id
 where s.project_id=p_project_id and s.organisation_id=p_organisation_id and s.source_role_key=p_source_role
 and s.source_scope_key=btrim(p_source_scope) and s.superseded_by_batch_id is null
 and exists(select 1 from pg_temp.ttm_plan q where q.existing_id=s.material_item_id and q.tower_id=s.tower_id);
 get diagnostics superseded=row_count;
 end if;
 create temporary table ttm_retired on commit drop as
 select s.material_item_id,s.bundle_id,s.material_kind from public.v2_material_source_records s
 where p_mode='replace' and s.project_id=p_project_id and s.organisation_id=p_organisation_id
 and s.tower_id in(select id from pg_temp.ttm_scope) and s.import_category_key=p_category
 and s.source_role_key=p_source_role and s.source_scope_key=btrim(p_source_scope) and s.superseded_by_batch_id is null;
 if p_mode='replace' then
 -- Shared source rows are retired only when no active target evidence remains.
 update public.v2_material_source_records s set superseded_by_batch_id=batch_id
 where s.project_id=p_project_id and s.organisation_id=p_organisation_id and s.tower_id in(select id from pg_temp.ttm_scope)
 and s.import_category_key=p_category and s.source_role_key=p_source_role and s.source_scope_key=btrim(p_source_scope) and s.superseded_by_batch_id is null;
 get diagnostics superseded=row_count;
 update public.v2_material_import_source_rows r set superseded_by_batch_id=batch_id
 where r.project_id=p_project_id and r.import_batch_id<>batch_id and r.superseded_by_batch_id is null
 and exists(select 1 from public.v2_material_import_batches b where b.id=r.import_batch_id and b.import_category_key=p_category and b.source_role_key=p_source_role and b.source_scope_key=btrim(p_source_scope))
 and not exists(select 1 from public.v2_material_source_records s where s.source_row_id=r.id and s.superseded_by_batch_id is null)
 and r.import_batch_id in(select distinct import_batch_id from public.v2_material_source_records where superseded_by_batch_id=batch_id);
 end if;
 added:=(select count(*) from pg_temp.ttm_plan where existing_id is null);
 merged:=case when p_mode='add' then 0 else expanded-added end;
 unchanged:=case when p_mode='add' then expanded-added else 0 end;

 if p_category='bundles' then
 insert into public.v2_material_bundles(id,organisation_id,project_id,tower_id,tower_type,bundle_reference,segment,required_quantity,total_weight_t,source_document,source_revision,source_import_batch_id,metadata,origin_organisation_id,manifest_row_key,package_context)
 select q.target_id,p_organisation_id,p_project_id,q.tower_id,q.tower_type,i.v->>'bundle_reference',i.v->>'segment',coalesce((i.v->>'required_quantity')::numeric,1),(i.v->>'total_weight_t')::numeric,
 nullif(btrim(p_source_file),''),i.v->>'source_revision',batch_id,jsonb_strip_nulls(jsonb_build_object('description',i.v->>'description','source_role',p_source_role)),p_organisation_id,case when manifest_mode then i.variant_key end,i.v->>'package_context'
 from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number) where q.existing_id is null;
 if p_mode<>'add' then
 update public.v2_material_bundles b set manifest_row_key=coalesce(b.manifest_row_key,case when manifest_mode then i.variant_key end),package_context=coalesce(i.v->>'package_context',b.package_context),segment=coalesce(i.v->>'segment',b.segment),required_quantity=coalesce((i.v->>'required_quantity')::numeric,b.required_quantity),
 total_weight_t=coalesce((i.v->>'total_weight_t')::numeric,b.total_weight_t),is_active=true,updated_at=now(),
 metadata=b.metadata||case when i.v ? 'description' then jsonb_build_object('description',i.v->>'description') else '{}'::jsonb end
 from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number) where b.id=q.existing_id;
 end if;
 update pg_temp.ttm_plan q set after_record=to_jsonb(b) from public.v2_material_bundles b where b.id=q.target_id;
 else
 insert into public.v2_material_register(id,organisation_id,project_id,tower_id,tower_type,material_kind,item_reference,description,bundle_id,bundle_reference,segment,drawing_reference,drawing_revision,profile,material_code,diameter,length,bolt_type,packer_mark,required_quantity,source_kind,source_role_key,source_document,source_revision,source_import_batch_id,origin_organisation_id,requirement_variant_key,package_context)
 select q.target_id,p_organisation_id,p_project_id,q.tower_id,q.tower_type,kind,i.v->>'item_reference',i.v->>'description',q.link_bundle_id,i.v->>'bundle_reference',i.v->>'segment',i.v->>'drawing_reference',i.v->>'drawing_revision',i.v->>'profile',i.v->>'material_code',i.v->>'diameter',i.v->>'length',i.v->>'bolt_type',i.v->>'packer_mark',(i.v->>'required_quantity')::numeric,
 p_source_role,p_source_role,nullif(btrim(p_source_file),''),coalesce(i.v->>'source_revision',i.v->>'drawing_revision'),batch_id,p_organisation_id,case when variant_mode then i.variant_key end,i.v->>'package_context'
 from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number) where q.existing_id is null;
 if p_mode<>'add' then
 update public.v2_material_register m set
 requirement_variant_key=coalesce(m.requirement_variant_key,case when variant_mode then i.variant_key end),
 package_context=coalesce(i.v->>'package_context',m.package_context),
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
 if p_category='bundles' then
 truncate pg_temp.ttm_matches;
 insert into pg_temp.ttm_matches(tower_id,row_number,id)
 select m.id,0,(array_agg(b.id))[1] from public.v2_material_register m join public.v2_material_bundles b
 on b.project_id=m.project_id and b.organisation_id=m.organisation_id and b.tower_id=m.tower_id and b.is_active
 and upper(btrim(b.bundle_reference))=upper(btrim(m.bundle_reference))
 and private.tttracker_v2_material_import_compatible(jsonb_build_object('segment',b.segment),jsonb_build_object('segment',m.segment),'bundles')
 and (m.package_context is null or b.package_context is null or upper(btrim(m.package_context))=upper(btrim(b.package_context)))
 where m.project_id=p_project_id and m.organisation_id=p_organisation_id and m.tower_id in(select id from pg_temp.ttm_scope)
 and m.material_kind='member' and m.is_active and m.bundle_id is null group by m.id having count(*)=1;
 update public.v2_material_register m set bundle_id=x.id from pg_temp.ttm_matches x where m.id=x.tower_id;
 insert into public.v2_material_bundle_members(organisation_id,project_id,tower_id,bundle_id,material_item_id,member_reference,quantity,metadata)
 select p_organisation_id,p_project_id,m.tower_id,x.id,m.id,m.item_reference,coalesce(m.required_quantity,1),jsonb_build_object('linked_by_import_batch',batch_id)
 from pg_temp.ttm_matches x join public.v2_material_register m on m.id=x.tower_id
 where not exists(select 1 from public.v2_material_bundle_members bm where bm.material_item_id=m.id and bm.bundle_id=x.id);
 end if;
 update public.v2_material_import_batches set status='completed',imported_rows=n,committed_at=now(),metadata=jsonb_build_object(
 'scope',p_scope,'target_tower_ids',(select jsonb_agg(id) from pg_temp.ttm_scope),
 'import_options',p_options,'source_rows',n,'target_requirements',expanded,'added_rows',added,'merged_rows',merged,'unchanged_rows',unchanged,'superseded_rows',superseded) where id=batch_id;
 return jsonb_build_object('ok',true,'batchId',batch_id,'acceptedRows',n,'rejectedRows',0,'appliedRequirementRows',expanded,'targetTowers',targets,
 'pendingAssignments',(select count(*) from pg_temp.ttm_plan q join pg_temp.ttm_input i using(row_number) where p_category='members' and i.v ? 'bundle_reference' and q.after_record->>'bundle_id' is null),
 'commonRows',(select count(*) from pg_temp.ttm_input where rule is null or (not(v ? 'applicable_towers') and blank_mode='common')),'conditionalRows',(select count(*) from pg_temp.ttm_input where rule is not null and v ? 'applicable_towers'),'referencedTowers',(select count(distinct reference) from pg_temp.ttm_rule_references),'matchedReferencedTowers',(select count(distinct tower_id) from pg_temp.ttm_rule_targets),'unmatchedTowerReferences',(select coalesce(jsonb_agg(reference),'[]'::jsonb) from (select distinct reference from pg_temp.ttm_rule_references r where not exists(select 1 from public.v2_towers t where t.project_id=p_project_id and t.organisation_id=p_organisation_id and upper(btrim(t.tower_identifier))=r.reference))u),'effectiveByTower',(select coalesce(jsonb_agg(c),'[]'::jsonb) from (select t.id as tower_id,t.tower_identifier,count(q.row_number) as applicable_rows from pg_temp.ttm_scope t left join pg_temp.ttm_plan q on q.tower_id=t.id group by t.id,t.tower_identifier)c),
 'timings',timings||jsonb_build_object('finish_ms',round(extract(epoch from clock_timestamp()-phase)*1000)),
 'addedRows',added,'mergedRows',merged,'unchangedRows',unchanged,'supersededRows',superseded,'rowErrors','[]'::jsonb);
end;
$$;
revoke all on function public.tttracker_v2_apply_material_schedule(uuid,uuid,uuid,text,uuid[],text,text,text,text,text,text,jsonb,jsonb,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.tttracker_v2_apply_material_schedule(uuid,uuid,uuid,text,uuid[],text,text,text,text,text,text,jsonb,jsonb,boolean,jsonb) to service_role;


-- Reconciliation uses complete project relations, not capped browser/API snapshots.
create or replace function public.tttracker_v2_reconcile_material_requirements(
 p_project_id uuid,p_organisation_id uuid,p_actor_id uuid,p_tower_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path='' set statement_timeout='120s' as $$
declare run_id uuid; n integer; summaries jsonb;
begin
 perform 1 from public.v2_projects where id=p_project_id and organisation_id=p_organisation_id for share;
 if not found then raise exception 'Project does not belong to this organisation'; end if;
 perform 1 from public.organisation_users where organisation_id=p_organisation_id and user_id=p_actor_id and status='active';
 if not found then raise exception 'Reconciliation actor has no active organisation membership'; end if;
 if p_tower_ids is not null and exists(select 1 from unnest(p_tower_ids) x where not exists(select 1 from public.v2_towers t where t.id=x and t.project_id=p_project_id and t.organisation_id=p_organisation_id)) then raise exception 'Tower does not belong to this project and organisation'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_project_id::text||x.id::text,0)) from
 (select id from public.v2_towers where project_id=p_project_id and organisation_id=p_organisation_id and (p_tower_ids is null or id=any(p_tower_ids)) order by id)x;
 drop table if exists pg_temp.ttr_candidates,pg_temp.ttr_findings,pg_temp.ttr_requirements;
 create temporary table ttr_candidates on commit drop as
 select m.id,m.tower_id,m.item_reference,m.bundle_reference,m.segment,m.drawing_reference,m.bundle_id,count(b.id)::integer candidate_count,(array_agg(b.id) filter(where b.id is not null))[1] candidate_id
 from public.v2_material_register m left join public.v2_material_bundles b on b.project_id=m.project_id and b.organisation_id=m.organisation_id and b.tower_id=m.tower_id and b.is_active
 and upper(btrim(b.bundle_reference))=upper(btrim(m.bundle_reference)) and private.tttracker_v2_material_import_compatible(jsonb_build_object('segment',b.segment),jsonb_build_object('segment',m.segment),'bundles')
 and (m.package_context is null or b.package_context is null or upper(btrim(m.package_context))=upper(btrim(b.package_context)))
 where m.project_id=p_project_id and m.organisation_id=p_organisation_id and m.is_active and m.material_kind='member' and (p_tower_ids is null or m.tower_id=any(p_tower_ids))
 group by m.id;
 update public.v2_material_register m set bundle_id=c.candidate_id,updated_at=now() from pg_temp.ttr_candidates c where m.id=c.id and m.bundle_id is null and c.candidate_count=1;
 insert into public.v2_material_bundle_members(organisation_id,project_id,tower_id,bundle_id,material_item_id,member_reference,quantity,metadata)
 select p_organisation_id,p_project_id,m.tower_id,m.bundle_id,m.id,m.item_reference,coalesce(m.required_quantity,1),jsonb_build_object('reconciliation',true)
 from public.v2_material_register m join pg_temp.ttr_candidates c on c.id=m.id where m.bundle_id is not null
 and not exists(select 1 from public.v2_material_bundle_members l where l.bundle_id=m.bundle_id and l.material_item_id=m.id);
 update public.v2_material_source_records s set bundle_id=m.bundle_id from public.v2_material_register m join pg_temp.ttr_candidates c on c.id=m.id
 where s.project_id=p_project_id and s.organisation_id=p_organisation_id and s.material_item_id=m.id and s.tower_id=m.tower_id and s.bundle_id is null and s.superseded_by_batch_id is null
 and upper(btrim(s.bundle_reference))=upper(btrim(m.bundle_reference));
 create temporary table ttr_requirements on commit drop as
 select distinct on(s.tower_id,coalesce(r.requirement_key,s.id::text)) s.*,m.bundle_id as effective_bundle_id
 from public.v2_material_source_records s left join public.v2_material_import_source_rows r on r.id=s.source_row_id
 left join public.v2_material_register m on m.id=s.material_item_id and m.is_active
 where s.project_id=p_project_id and s.organisation_id=p_organisation_id and s.material_kind='member' and s.superseded_by_batch_id is null
 and (p_tower_ids is null or s.tower_id=any(p_tower_ids)) order by s.tower_id,coalesce(r.requirement_key,s.id::text),s.created_at desc,s.id;
 create index on pg_temp.ttr_requirements(tower_id);
 create temporary table ttr_findings(tower_id uuid,item_reference text,bundle_reference text,drawing_reference text,segment text,finding_type_key text,severity text,message text,details jsonb) on commit drop;
 insert into pg_temp.ttr_findings
 select tower_id,item_reference,bundle_reference,drawing_reference,segment,
 case when bundle_reference is null then 'member_without_bundle' when candidate_count=0 then 'member_bundle_not_in_bundle_register' else 'ambiguous_duplicate_bundle_reference' end,'warning',
 case when bundle_reference is null then 'Source requirement has no packing hint' when candidate_count=0 then 'Packing hint has no physical manifest match; assignment remains pending' else 'Packing hint matches multiple physical manifest rows; assignment remains unresolved' end,
 jsonb_build_object('material_item_id',id,'candidateCount',candidate_count)
 from pg_temp.ttr_candidates where bundle_id is null and candidate_count<>1;
 insert into pg_temp.ttr_findings select c.tower_id,c.item_reference,c.bundle_reference,c.drawing_reference,c.segment,'source_assignment_conflict','warning',
 'Existing operational bundle assignment conflicts with the current manifest; history was preserved',jsonb_build_object('material_item_id',c.id,'existing_bundle_id',c.bundle_id)
 from pg_temp.ttr_candidates c where c.bundle_id is not null and (c.candidate_count<>1 or c.bundle_id is distinct from c.candidate_id);
 insert into pg_temp.ttr_findings select b.tower_id,null,b.bundle_reference,null,b.segment,'bundle_without_members','warning','Physical manifest row has no active member relationship',jsonb_build_object('bundle_id',b.id)
 from public.v2_material_bundles b where b.project_id=p_project_id and b.organisation_id=p_organisation_id and b.is_active and (p_tower_ids is null or b.tower_id=any(p_tower_ids))
 and not exists(select 1 from public.v2_material_register m where m.bundle_id=b.id and m.is_active and m.material_kind='member');
 insert into pg_temp.ttr_findings select tower_id,item_reference,null,drawing_reference,segment,'source_requirement_conflict','warning','Active source evidence supplies conflicting packing hints for one operational requirement',jsonb_build_object('material_item_id',material_item_id,'bundleReferences',jsonb_agg(distinct bundle_reference))
 from pg_temp.ttr_requirements where material_item_id is not null group by tower_id,material_item_id,item_reference,drawing_reference,segment having count(distinct upper(btrim(bundle_reference)))>1;
 insert into pg_temp.ttr_findings select tower_id,item_reference,null,drawing_reference,segment,'source_requirement_conflict','warning',
 'Overlapping source variants have identical requirement context but different packing hints; review applicability without merging them',
 jsonb_build_object('sourceScope',source_scope_key,'sourceRole',source_role_key,'sourceRows',jsonb_agg(source_row_id),'bundleReferences',jsonb_agg(distinct bundle_reference))
 from pg_temp.ttr_requirements group by tower_id,item_reference,drawing_reference,segment,profile,required_quantity,source_scope_key,source_role_key
 having count(distinct upper(btrim(bundle_reference)))>1;
 -- Preserve drawing / packing coverage checks at tower context, without treating distinct variants as a global conflict.
 insert into pg_temp.ttr_findings select r.tower_id,r.item_reference,r.bundle_reference,r.drawing_reference,r.segment,'packing_member_not_in_drawing','warning','Packing requirement has no matching tower member in the drawing source','{}'::jsonb
 from pg_temp.ttr_requirements r where r.source_role_key in ('packing_list','supplier_list','member_schedule')
 and exists(select 1 from pg_temp.ttr_requirements d where d.tower_id=r.tower_id and d.source_role_key='drawing_schedule')
 and not exists(select 1 from pg_temp.ttr_requirements d where d.tower_id=r.tower_id and d.source_role_key='drawing_schedule' and upper(btrim(d.item_reference))=upper(btrim(r.item_reference)));
 insert into pg_temp.ttr_findings select r.tower_id,r.item_reference,r.bundle_reference,r.drawing_reference,r.segment,'drawing_member_not_in_packing','warning','Drawing requirement has no matching tower member in a packing source','{}'::jsonb
 from pg_temp.ttr_requirements r where r.source_role_key='drawing_schedule'
 and exists(select 1 from pg_temp.ttr_requirements d where d.tower_id=r.tower_id and d.source_role_key in ('packing_list','supplier_list','member_schedule'))
 and not exists(select 1 from pg_temp.ttr_requirements d where d.tower_id=r.tower_id and d.source_role_key in ('packing_list','supplier_list','member_schedule') and upper(btrim(d.item_reference))=upper(btrim(r.item_reference)));
 insert into pg_temp.ttr_findings select r.tower_id,r.item_reference,r.bundle_reference,r.drawing_reference,r.segment,
 case when r.drawing_reference is null then 'member_without_drawing' else 'member_without_segment' end,'warning','Drawing requirement is missing drawing or segment context','{}'::jsonb
 from pg_temp.ttr_requirements r where r.source_role_key='drawing_schedule' and (r.drawing_reference is null or r.segment is null);
 insert into pg_temp.ttr_findings select m.tower_id,m.item_reference,m.bundle_reference,m.drawing_reference,m.segment,m.material_kind||'_incomplete_context','warning','Fastener requirement is missing drawing, segment or specification context',jsonb_build_object('material_item_id',m.id)
 from public.v2_material_register m where m.project_id=p_project_id and m.organisation_id=p_organisation_id and m.is_active and m.material_kind in ('bolt','packer')
 and (p_tower_ids is null or m.tower_id=any(p_tower_ids)) and (m.drawing_reference is null or m.segment is null or (m.material_kind='bolt' and m.diameter is null) or (m.material_kind='packer' and m.packer_mark is null));
 create index on pg_temp.ttr_findings(tower_id,finding_type_key);
 select count(*) into n from pg_temp.ttr_findings;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into summaries from (select t.id as tower_id,t.tower_identifier,
 (select count(*) from pg_temp.ttr_requirements r where r.tower_id=t.id) as applicable_requirements,
 (select count(*) from pg_temp.ttr_requirements r where r.tower_id=t.id and r.effective_bundle_id is not null) as matched_assignments,
 (select count(*) from pg_temp.ttr_findings f where f.tower_id=t.id and f.finding_type_key='member_bundle_not_in_bundle_register') as unresolved_bundle_references,
 (select count(*) from pg_temp.ttr_findings f where f.tower_id=t.id and f.finding_type_key='ambiguous_duplicate_bundle_reference') as ambiguous_assignments,
 (select count(*) from pg_temp.ttr_findings f where f.tower_id=t.id and f.finding_type_key='bundle_without_members') as bundles_without_members,
 (select count(*) from pg_temp.ttr_findings f where f.tower_id=t.id and f.finding_type_key in ('source_requirement_conflict','source_assignment_conflict')) as source_conflicts
 from public.v2_towers t where t.project_id=p_project_id and t.organisation_id=p_organisation_id and (p_tower_ids is null or t.id=any(p_tower_ids)))x;
 update public.v2_material_reconciliation_findings set status='superseded' where project_id=p_project_id and organisation_id=p_organisation_id and status='open' and (p_tower_ids is null or tower_id=any(p_tower_ids));
 insert into public.v2_material_reconciliation_runs(organisation_id,project_id,status,finding_count,created_by,metadata)
 values(p_organisation_id,p_project_id,'complete',n,p_actor_id,jsonb_build_object('tower_summary',summaries)) returning id into run_id;
 insert into public.v2_material_reconciliation_findings(run_id,organisation_id,project_id,tower_id,item_reference,bundle_reference,drawing_reference,segment,finding_type_key,severity,message,details)
 select run_id,p_organisation_id,p_project_id,tower_id,item_reference,bundle_reference,drawing_reference,segment,finding_type_key,severity,message,details from pg_temp.ttr_findings;
 insert into public.v2_material_reconciliation_findings(run_id,organisation_id,project_id,tower_id,finding_type_key,severity,message,details)
 select run_id,p_organisation_id,p_project_id,(x->>'tower_id')::uuid,'tower_requirement_summary','info','Applicable requirements and tower packing reconciliation',x from jsonb_array_elements(summaries)x;
 return jsonb_build_object('ok',true,'runId',run_id,'findingCount',n,'towerSummary',summaries);
end;
$$;
revoke all on function public.tttracker_v2_reconcile_material_requirements(uuid,uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.tttracker_v2_reconcile_material_requirements(uuid,uuid,uuid,uuid[]) to service_role;

notify pgrst,'reload schema';
commit;

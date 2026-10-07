-- Temporary, service-only verification RPC. Deploy with db query --linked --file.
-- Each invocation intentionally rolls back every test write, then returns its assertions.
-- Remove the function after testing; this file is not an application migration.
create or replace function public.tttracker_v2_verify_material_safe_updates(p_token text)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='120s' as $$
declare project uuid; org uuid; actor uuid; role_key text; tower_ids uuid[]; tower_refs text[];
 scope_type text:='all'; other_project uuid:=gen_random_uuid(); other_tower uuid:=gen_random_uuid(); sentinel uuid:=gen_random_uuid();
 rows jsonb; result jsonb; first_batch uuid; second_batch uuid; bundle_result jsonb;
 before_other jsonb; before_first jsonb; outcome jsonb; started timestamptz:=clock_timestamp();
begin
 begin
 select p.id,p.organisation_id into project,org from public.v2_projects p where exists(select 1 from public.v2_towers t where t.project_id=p.id) order by p.id limit 1;
 select u.user_id into actor from public.v2_project_users u join public.organisation_users o on o.user_id=u.user_id and o.organisation_id=u.organisation_id
 where u.project_id=project and u.organisation_id=org and u.status='active' and o.status='active' limit 1;
 select option_key into role_key from public.v2_project_option_definitions where project_id=project and organisation_id=org and option_group='material_import_source_role' and is_active
 and (not(settings ? 'applies_to') or settings->'applies_to'='[]'::jsonb or settings->'applies_to' ? 'members') limit 1;
 select array_agg(id order by tower_identifier),array_agg(tower_identifier order by tower_identifier) into tower_ids,tower_refs from public.v2_towers where project_id=project and organisation_id=org;
 if p_token like 'LEFT-%' then tower_ids:=tower_ids[1:2];tower_refs:=tower_refs[1:2];scope_type:='selected';
 elsif p_token like 'RIGHT-%' then tower_ids:=tower_ids[3:4];tower_refs:=tower_refs[3:4];scope_type:='selected'; end if;
 if actor is null or cardinality(tower_ids)<2 then raise exception 'Verification requires active host project member and multiple towers'; end if;
 insert into public.v2_projects(id,organisation_id,host_organisation_id,code,name) values(other_project,org,org,'VERIFY-'||p_token,'Rollback-only verification');
 insert into public.v2_towers(id,organisation_id,project_id,tower_identifier) values(other_tower,org,other_project,'VERIFY-FOREIGN-'||p_token);
 insert into public.v2_material_register(id,organisation_id,project_id,tower_id,material_kind,item_reference,required_quantity,received_quantity) values(sentinel,org,other_project,other_tower,'member','VERIFY-SENTINEL',10,7);
 select to_jsonb(m) into before_other from public.v2_material_register m where id=sentinel;
 select jsonb_agg(jsonb_build_object('row_number',n+1,'values',jsonb_strip_nulls(jsonb_build_object('item_reference','VERIFY-'||p_token||'-'||n,'required_quantity',1,
 'applicable_towers',case when n>922 then tower_refs[1+((n-923)%cardinality(tower_ids))] end)),'raw_payload','{}'::jsonb) order by n) into rows from generate_series(1,2202)n;
 result:=public.tttracker_v2_apply_material_schedule(project,org,actor,scope_type,tower_ids,'members','merge',role_key,'VERIFY-'||p_token,'VERIFY.csv',null,'{"applicable_towers":"Applicable"}',rows,true,'{"applicability":{"kind":"tower_list","blank":"common","delimiter":","}}');
 if result->>'ok' is distinct from 'true' or (result->>'acceptedRows')::integer<>2202 or (result->>'appliedRequirementRows')::integer<>922*cardinality(tower_ids)+1280 then raise exception 'Member assertion: %',result; end if;
 first_batch:=(result->>'batchId')::uuid;
 select jsonb_agg(to_jsonb(s) order by id) into before_first from public.v2_material_import_source_rows s where import_batch_id=first_batch;
 result:=public.tttracker_v2_apply_material_schedule(project,org,actor,'single',array[tower_ids[1]],'members','merge',role_key,'VERIFY-SECOND-'||p_token,'VERIFY2.csv',null,'{}','[{"row_number":2,"values":{"item_reference":"VERIFY-SECOND","required_quantity":9},"raw_payload":{}}]',false,'{}');
 if result->>'ok' is distinct from 'true' then raise exception 'Second batch assertion: %',result; end if;
 second_batch:=(result->>'batchId')::uuid;
 if before_first is distinct from (select jsonb_agg(to_jsonb(s) order by id) from public.v2_material_import_source_rows s where import_batch_id=first_batch) then raise exception 'First batch changed'; end if;
 select option_key into role_key from public.v2_project_option_definitions where project_id=project and organisation_id=org and option_group='material_import_source_role' and is_active
 and (not(settings ? 'applies_to') or settings->'applies_to'='[]'::jsonb or settings->'applies_to' ? 'bundles') limit 1;
 select jsonb_agg(jsonb_build_object('row_number',n+1,'values',jsonb_build_object('tower_reference',tower_refs[1+((n-1)/2)],'bundle_reference','VERIFY-1/6','package_context',case when n%2=1 then 'STEEL' else 'BOLTS' end),'raw_payload','{}'::jsonb)) into rows from generate_series(1,4)n;
 bundle_result:=public.tttracker_v2_apply_material_schedule(project,org,actor,'csv','{}','bundles','merge',role_key,'VERIFY-BUNDLES-'||p_token,'VERIFY-BUNDLES.csv',null,'{"tower_reference":"Tower"}',rows,false,'{"bundleIdentity":"source_row"}');
 if bundle_result->>'ok' is distinct from 'true' or (bundle_result->>'addedRows')::integer<>4 then raise exception 'Bundle assertion: %',bundle_result; end if;
 if (select count(distinct id) from public.v2_material_bundles where source_import_batch_id=(bundle_result->>'batchId')::uuid)<>4 then raise exception 'Duplicate manifest UUID assertion'; end if;
 if before_other is distinct from (select to_jsonb(m) from public.v2_material_register m where id=sentinel) then raise exception 'Foreign project changed'; end if;
 outcome:=jsonb_build_object('ok',true,'sourceRows',2202,'commonRows',922,'conditionalRows',1280,'targets',cardinality(tower_ids),'effectiveRows',922*cardinality(tower_ids)+1280,'distinctBundleRows',4,'batchesIndependent',first_batch<>second_batch,'foreignProjectUnchanged',true,'milliseconds',round(extract(epoch from clock_timestamp()-started)*1000));
 raise exception using errcode='P0001',message='EXPECTED_VERIFICATION_ROLLBACK';
 exception when sqlstate 'P0001' then
 if sqlerrm<>'EXPECTED_VERIFICATION_ROLLBACK' then raise; end if;
 end;
 -- The exception subtransaction has rolled back batches, canonical records and fixtures.
 if exists(select 1 from public.v2_material_import_batches where id in(first_batch,second_batch,(bundle_result->>'batchId')::uuid)) or exists(select 1 from public.v2_projects where id=other_project) then raise exception 'Rollback incomplete'; end if;
 return outcome||jsonb_build_object('lateRollbackComplete',true);
end $$;
revoke all on function public.tttracker_v2_verify_material_safe_updates(text) from public,anon,authenticated;
grant execute on function public.tttracker_v2_verify_material_safe_updates(text) to service_role;
notify pgrst,'reload schema';

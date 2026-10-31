begin;

-- Preserve the existing atomic import workflow while passing configured,
-- project-scoped issue types and structured detail values into FLI creation.
create or replace function public.import_v1_quality_punchlist(p_project uuid,p_actor uuid,p_batch uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare batch tower_quality_import_batches%rowtype; entry jsonb; parent tower_revisions%rowtype;
 item tower_revision_items%rowtype; allocated jsonb; results jsonb:='[]'; source_key text:=btrim(p_request->>'sourceKey'); target_tower uuid; target uuid;
begin
 perform assert_v1_quality_actor(p_actor,p_project);
 if source_key is null or length(source_key) not between 1 and 200 then raise exception 'Enter a stable source/client key.';end if;
 perform pg_advisory_xact_lock(hashtextextended('v1-punchlist:'||p_project||source_key,0));
 select * into batch from tower_quality_import_batches where id=p_batch;
 if found then
  if batch.project_id<>p_project or batch.imported_by<>p_actor or batch.request<>p_request then raise exception 'Import request already used with different details.';end if;
  return batch.result;
 end if;
 if jsonb_typeof(p_request->'rows') is distinct from 'array' or jsonb_array_length(p_request->'rows') not between 1 and 500 then raise exception 'Import 1 to 500 validated rows.';end if;
 perform id from towers where project_id=p_project and id in(select (r->>'towerId')::uuid from jsonb_array_elements(p_request->'rows') r) order by id for update;
 insert into tower_quality_import_batches(id,project_id,source_key,source_filename,source_revision,imported_by,request)
 values(p_batch,p_project,source_key,p_request->>'filename',p_request->>'sourceRevision',p_actor,p_request);
 for entry in select value from jsonb_array_elements(p_request->'rows') loop
  target_tower:=(entry->>'towerId')::uuid;
  if not exists(select 1 from towers where id=target_tower and project_id=p_project) then raise exception 'A mapped tower is not in this project.';end if;
  if nullif(btrim(entry->>'externalReference'),'') is null or nullif(btrim(entry->>'description'),'') is null or nullif(btrim(entry->>'defectType'),'') is null then raise exception 'Every imported row requires an external reference, defect type and description.';end if;
  select * into item from tower_revision_items where project_id=p_project and tower_id=target_tower and import_source_key=source_key and upper(btrim(external_reference))=upper(btrim(entry->>'externalReference')) and source_type='punchlist';
  if found then
   results:=results||jsonb_build_array(jsonb_build_object('item',to_jsonb(item),'disposition',case when (item.source_payload - 'rowKey')=(entry - 'rowKey') then 'unchanged' else 'Existing item changed - retained for reconciliation' end));
   continue;
  end if;
  target:=nullif(p_request->'targets'->target_tower::text->>'revisionId','')::uuid;
  if target is null then
   select * into parent from tower_revisions where project_id=p_project and tower_id=target_tower and mobile_client_mutation_id='import:'||p_batch||':'||target_tower;
   if not found then
    insert into tower_revisions(project_id,tower_id,inspection_stage,inspection_date,status,created_by,mobile_client_mutation_id,source_type,additional_rect_confirmed,notes)
    values(p_project,target_tower,'Other',current_date,'Draft',p_actor,'import:'||p_batch||':'||target_tower,'punchlist',coalesce((p_request->'targets'->target_tower::text->>'confirmAdditional')::boolean,false),'Imported Punchlist: '||source_key) returning * into parent;
   end if;
  else
   select * into parent from tower_revisions where id=target and project_id=p_project and tower_id=target_tower for update;
   if not found then raise exception 'Selected append target no longer exists.';end if;
  end if;
  update tower_revisions set source_type='punchlist' where id=parent.id and source_type is distinct from 'punchlist';
  allocated:=create_v1_revision_item_atomic(parent.id,p_project,p_actor,'import:'||p_batch||':'||(entry->>'rowKey'),jsonb_build_object(
   'issueTypeId',nullif(entry->>'issueTypeId',''),
   'otherIssueText',case when nullif(entry->>'issueTypeId','') is null then entry->>'defectType' else null end,
   'finding',entry->>'description','leg',entry->>'leg','assignedFlag',entry->>'assignedFlag','towerSegment',entry->>'segment',
   'memberNumber',entry->>'member','drawingNumber',entry->>'drawing','operationalDetails',coalesce(entry->'operationalDetails','{}'::jsonb)));
  update tower_revision_items set source_type='punchlist',external_reference=btrim(entry->>'externalReference'),import_source_key=source_key,source_batch_id=p_batch,source_payload=entry,inspector_name=nullif(btrim(entry->>'inspector'),''),imported_by_label=p_request->>'importedByLabel',inspector_comment=entry->>'inspectorComment',source_date=nullif(entry->>'sourceDate','')::date where id=(allocated->'item'->>'id')::uuid returning * into item;
  results:=results||jsonb_build_array(jsonb_build_object('item',to_jsonb(item),'disposition','created'));
 end loop;
 update tower_quality_import_batches set result=results where id=p_batch;
 return results;
end; $$;

notify pgrst,'reload schema';
commit;

-- V1 field operational details. Additive; no client-specific seeds or historical rewrites.
-- Apply after the V1 Punchlist/evidence migration. Do not apply remotely from Codex.
begin;
alter table public.project_field_issue_types add column if not exists detail_schema jsonb not null default '{"fields":[]}';
alter table public.tower_revision_items add column if not exists operational_details jsonb not null default '{}';

-- Validate every writer, including older web/mobile clients, inside the existing transaction.
create or replace function public.validate_v1_operational_details() returns trigger
language plpgsql set search_path=public as $$
declare config jsonb; field jsonb; value jsonb; kind text; entry jsonb;
begin
 if jsonb_typeof(new.operational_details) is distinct from 'object' or length(new.operational_details::text)>20000 then
  raise exception using errcode='22023',message='Operational details must be an object of at most 20000 characters.';
 end if;
 if new.issue_type_id is not null then
  select detail_schema into config from project_field_issue_types where id=new.issue_type_id and project_id=new.project_id and applies_to in ('revision','both');
  if not found then raise exception using errcode='22023',message='Select a configured issue type for this project.';end if;
 end if;
 for entry in select v from jsonb_each(new.operational_details) as e(k,v) loop
  if jsonb_typeof(entry) not in ('string','number','boolean','array') then raise exception 'Invalid operational detail value.';end if;
  if jsonb_typeof(entry)='array' and exists(select 1 from jsonb_array_elements(entry) v where jsonb_typeof(v)<>'string') then raise exception 'Multiple selections must be text values.';end if;
 end loop;
 for field in select * from jsonb_array_elements(coalesce(config->'fields','[]')) loop
  value:=new.operational_details->(field->>'key');kind:=field->>'type';
  if value is null or value='""'::jsonb or value='[]'::jsonb then
   if coalesce((field->>'required')::boolean,false) then raise exception using errcode='22023',message=(field->>'label')||' is required.';end if;
   continue;
  end if;
  if kind in ('number','quantity') then
   if jsonb_typeof(value)<>'number' then raise exception using errcode='22023',message=(field->>'label')||' must be numeric.';end if;
   if kind='quantity' and (value::text)::numeric<0 then raise exception 'Quantity cannot be negative.';end if;
  elsif kind='toggle' then
   if jsonb_typeof(value)<>'boolean' then raise exception 'Toggle must be on or off.';end if;
  elsif kind in ('text','unit') then
   if jsonb_typeof(value)<>'string' then raise exception 'Detail must be text.';end if;
  elsif kind in ('select','change-direction') then
   if jsonb_typeof(value)<>'string' or not coalesce((field->'options') @> jsonb_build_array(value),false) then raise exception using errcode='22023',message=(field->>'label')||': choose a configured option.';end if;
  elsif kind='multi-select' then
   if jsonb_typeof(value)<>'array' or not coalesce((field->'options') @> value,false) then raise exception 'Choose configured options.';end if;
  end if;
 end loop;
 return new;
end; $$;
drop trigger if exists v1_operational_details_validation on public.tower_revision_items;
create trigger v1_operational_details_validation before insert or update on public.tower_revision_items
 for each row execute function public.validate_v1_operational_details();

create or replace function public.validate_v1_detail_schema() returns trigger
language plpgsql set search_path=public as $$
declare field jsonb; keys text[]:='{}'; dimension jsonb;
begin
 if jsonb_typeof(new.detail_schema) is distinct from 'object' or jsonb_typeof(new.detail_schema->'fields') is distinct from 'array' then raise exception 'Detail schema needs a fields array.';end if;
 if jsonb_array_length(new.detail_schema->'fields')>40 then raise exception 'Configure up to 40 detail fields.';end if;
 for field in select * from jsonb_array_elements(new.detail_schema->'fields') loop
  if coalesce(field->>'key','') !~ '^[a-z][a-z0-9_]{0,63}$' or (field->>'key')=any(keys) then raise exception 'Detail keys must be unique stable identifiers.';end if;
  keys:=array_append(keys,field->>'key');
  if nullif(btrim(field->>'label'),'') is null or coalesce(field->>'type','') not in ('text','number','select','multi-select','toggle','quantity','unit','change-direction') then raise exception 'Each detail field needs a label and supported type.';end if;
  if field ? 'required' and jsonb_typeof(field->'required')<>'boolean' then raise exception 'Required must be a boolean.';end if;
  if field->>'type' in ('select','multi-select','change-direction') then
   if jsonb_typeof(field->'options') is distinct from 'array' then raise exception 'Select fields need configured options.';end if;
   if jsonb_array_length(field->'options')=0 or exists(select 1 from jsonb_array_elements(field->'options') v where jsonb_typeof(v)<>'string' or btrim(v#>>'{}')='') then raise exception 'Select options must be nonblank text.';end if;
  end if;
 end loop;
 if new.detail_schema ? 'material' then
  if nullif(btrim(new.detail_schema->'material'->>'label'),'') is null or not exists(select 1 from jsonb_array_elements(new.detail_schema->'fields') f where f->>'key'=new.detail_schema->'material'->>'quantityField' and f->>'type' in ('number','quantity')) then raise exception 'Material summary needs a label and numeric quantity field.';end if;
  if jsonb_typeof(new.detail_schema->'material'->'dimensions') is distinct from 'array' then raise exception 'Material dimensions must be configured.';end if;
  if jsonb_array_length(new.detail_schema->'material'->'dimensions')=0 then raise exception 'Add a material dimension.';end if;
  for dimension in select * from jsonb_array_elements(new.detail_schema->'material'->'dimensions') loop
   if not coalesce((dimension->>'field')=any(keys),false) then raise exception 'Material dimension must reference a configured field.';end if;
  end loop;
  if new.detail_schema->'material' ? 'actionField' and not coalesce((new.detail_schema->'material'->>'actionField')=any(keys),false) then raise exception 'Material action must reference a configured field.';end if;
 end if;
 return new;
end; $$;
drop trigger if exists v1_detail_schema_validation on public.project_field_issue_types;
create trigger v1_detail_schema_validation before insert or update of detail_schema on public.project_field_issue_types
 for each row execute function public.validate_v1_detail_schema();

create or replace function public.v1_quality_item_version() returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.finding,new.rectification_comment,new.status,new.issue_type_id,new.other_issue_text,new.leg,new.assigned_flag,new.member_number,new.tower_segment,new.drawing_number,new.operational_details)
 is distinct from row(old.finding,old.rectification_comment,old.status,old.issue_type_id,old.other_issue_text,old.leg,old.assigned_flag,old.member_number,old.tower_segment,old.drawing_number,old.operational_details) then
  new.record_version:=old.record_version+1;
 end if;
 return new;
end; $$;
drop trigger if exists v1_quality_item_version on public.tower_revision_items;
create trigger v1_quality_item_version before update on public.tower_revision_items for each row execute function public.v1_quality_item_version();

create or replace function public.update_v1_quality_item(p_item uuid,p_actor uuid,p_version bigint,p_mutation text,p_patch jsonb,p_label text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item tower_revision_items%rowtype; parent tower_revisions%rowtype; command tower_quality_item_commands%rowtype;
begin
 select * into item from tower_revision_items where id=p_item;
 if not found then raise exception using errcode='P0002',message='Finding not found.';end if;
 perform assert_v1_quality_actor(p_actor,item.project_id);
 if nullif(btrim(p_mutation),'') is null then raise exception 'A stable edit request ID is required.';end if;
 perform pg_advisory_xact_lock(hashtextextended('v1-quality-edit:'||item.project_id||p_mutation,0));
 select * into command from tower_quality_item_commands where project_id=item.project_id and mutation_id=p_mutation;
 if found then
  if command.actor_id<>p_actor or command.item_id<>p_item or command.payload<>p_patch then raise exception 'Edit request ID already used with different details.';end if;
  return command.result;
 end if;
 select * into parent from tower_revisions where id=item.revision_id for update;
 select * into item from tower_revision_items where id=p_item for update;
 if parent.finalised_at is not null or parent.status not in ('Draft','Open','In Progress') or item.status='Verified' then raise exception 'This controlled finding is locked.';end if;
 if p_version is null or p_version<>item.record_version then raise exception using errcode='P0001',message='This FLI changed on another device. Refresh and reconcile your pending changes.';end if;
 if p_patch ? 'status' and p_patch->>'status' not in ('Open','Rectified','Verified') then raise exception 'Choose Open or Rectified.';end if;
 if coalesce(p_patch->>'status',item.status) in ('Rectified','Verified') then
  if not exists(select 1 from tower_quality_files where revision_item_id=p_item and file_role='before_photo' and not deletion_pending)
  or not exists(select 1 from tower_quality_files where revision_item_id=p_item and file_role='after_photo' and not deletion_pending) then raise exception 'Before and After evidence must sync before marking Rectified.';end if;
  if (case when p_patch ? 'issue_type_id' then nullif(p_patch->>'issue_type_id','') else item.issue_type_id::text end) is null
   and nullif(btrim(case when p_patch ? 'other_issue_text' then p_patch->>'other_issue_text' else item.other_issue_text end),'') is null then raise exception 'Select an issue before marking Rectified.';end if;
 end if;
 update tower_revision_items set
 operational_details=case when p_patch ? 'operational_details' then p_patch->'operational_details' else operational_details end,
 finding=case when p_patch ? 'finding' then p_patch->>'finding' else finding end,
 rectification_comment=case when p_patch ? 'rectification_comment' then p_patch->>'rectification_comment' else rectification_comment end,
 issue_type_id=case when p_patch ? 'issue_type_id' then nullif(p_patch->>'issue_type_id','')::uuid else issue_type_id end,
 other_issue_text=case when p_patch ? 'other_issue_text' then p_patch->>'other_issue_text' else other_issue_text end,
 leg=case when p_patch ? 'leg' then nullif(p_patch->>'leg','') else leg end,
 assigned_flag=case when p_patch ? 'assigned_flag' then p_patch->>'assigned_flag' else assigned_flag end,
 tower_segment=case when p_patch ? 'tower_segment' then p_patch->>'tower_segment' else tower_segment end,
 member_number=case when p_patch ? 'member_number' then p_patch->>'member_number' else member_number end,
 drawing_number=case when p_patch ? 'drawing_number' then p_patch->>'drawing_number' else drawing_number end,
 status=coalesce(p_patch->>'status',status),
 actioned_by_user_id=case when p_patch->>'status'='Rectified' then p_actor else actioned_by_user_id end,
 actioned_by_label=case when p_patch->>'status'='Rectified' then p_label else actioned_by_label end,
 actioned_at=case when p_patch->>'status'='Rectified' then now() else actioned_at end
 where id=p_item returning * into item;
 insert into tower_quality_item_commands(project_id,item_id,mutation_id,actor_id,payload,result)values(item.project_id,p_item,p_mutation,p_actor,p_patch,to_jsonb(item));
 return to_jsonb(item);
end; $$;

create or replace function public.create_v1_revision_item_atomic(
 p_revision_id uuid,p_project_id uuid,p_actor_id uuid,p_mutation_id text,p_fields jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare parent public.tower_revisions%rowtype; item public.tower_revision_items%rowtype;
begin
 perform public.assert_v1_quality_actor(p_actor_id,p_project_id);
 if nullif(btrim(p_mutation_id),'') is null then raise exception using errcode='22023',message='A stable finding mutation ID is required.'; end if;
 -- Project-scoped mutation lock matches the existing mutation unique index.
 perform pg_advisory_xact_lock(hashtextextended('v1-fli-mutation:'||p_project_id::text||':'||p_mutation_id,0));
 select * into parent from public.tower_revisions where id=p_revision_id and project_id=p_project_id for update;
 if not found then raise exception using errcode='P0002',message='This Rectification has been deleted or is no longer available.'; end if;
 select * into item from public.tower_revision_items where project_id=p_project_id and mobile_client_mutation_id=p_mutation_id;
 if found then
  if item.revision_id<>p_revision_id or item.created_by is distinct from p_actor_id then
   raise exception using errcode='P0001',message='This mutation belongs to another finding.';
  end if;
  return jsonb_build_object('item',to_jsonb(item),'idempotentHit',true);
 end if;
 if parent.finalised_at is not null or parent.status not in ('Draft','Open','In Progress') then
  raise exception using errcode='P0001',message='This Rectification has been finalised and can no longer accept new FLIs.';
 end if;
 if nullif(btrim(p_fields->>'issueTypeId'),'') is null and nullif(btrim(p_fields->>'otherIssueText'),'') is null then
  raise exception using errcode='22023',message='Select a Flagged Issue type or enter an Other issue.';
 end if;
 if nullif(p_fields->>'leg','') is not null and p_fields->>'leg' not in ('A','B','C','D') then
  raise exception using errcode='22023',message='Select Leg A, B, C or D.';
 end if;
 if nullif(p_fields->>'issueTypeId','') is not null and not exists(
  select 1 from public.project_field_issue_types where id=(p_fields->>'issueTypeId')::uuid and project_id=p_project_id and active and applies_to in ('revision','both')) then
  raise exception using errcode='22023',message='Select an active issue type for this project.';
 end if;
 insert into public.tower_revision_items(revision_id,project_id,tower_id,created_by,mobile_client_mutation_id,
  issue_type_id,other_issue_text,leg,assigned_flag,tower_segment,member_number,drawing_number,finding,rectification_comment,operational_details,status)
 values(p_revision_id,p_project_id,parent.tower_id,p_actor_id,p_mutation_id,
  nullif(p_fields->>'issueTypeId','')::uuid,nullif(btrim(p_fields->>'otherIssueText'),''),nullif(p_fields->>'leg',''),
  nullif(btrim(p_fields->>'assignedFlag'),''),nullif(btrim(p_fields->>'towerSegment'),''),nullif(btrim(p_fields->>'memberNumber'),''),
  nullif(btrim(p_fields->>'drawingNumber'),''),nullif(btrim(p_fields->>'finding'),''),nullif(btrim(p_fields->>'rectificationComment'),''),coalesce(p_fields->'operationalDetails','{}'::jsonb),'Open') returning * into item;
 update public.tower_revisions set status=case when status='Draft' then 'In Progress' else status end,updated_at=now() where id=p_revision_id;
 return jsonb_build_object('item',to_jsonb(item),'idempotentHit',false);
end; $$;
revoke all on function public.create_v1_revision_item_atomic(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_v1_revision_item_atomic(uuid,uuid,uuid,text,jsonb) to service_role;


revoke all on function public.update_v1_quality_item(uuid,uuid,bigint,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.update_v1_quality_item(uuid,uuid,bigint,text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;

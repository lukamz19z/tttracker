-- V1 only. Preserve the applied atomic FLI allocator; all imported children
-- call create_v1_revision_item_atomic and its parent-row locking trigger.
begin;
alter table public.tower_revisions add column if not exists source_type text,
 add column if not exists additional_rect_confirmed boolean not null default false;
alter table public.tower_revision_items add column if not exists source_type text,
 add column if not exists external_reference text, add column if not exists import_source_key text,
 add column if not exists source_batch_id uuid, add column if not exists source_payload jsonb,
 add column if not exists inspector_comment text, add column if not exists source_date date,
 add column if not exists record_version bigint not null default 1,
 add column if not exists actioned_by_user_id uuid references auth.users(id) on delete set null,
 add column if not exists actioned_by_label text,add column if not exists actioned_at timestamptz;
alter table public.tower_quality_files add column if not exists deletion_pending boolean not null default false,
 add column if not exists is_outdated boolean not null default false;
create table if not exists public.tower_quality_import_batches(
 id uuid primary key,project_id uuid not null references public.projects(id),source_key text not null,
 source_filename text not null,source_revision text,imported_by uuid references auth.users(id) on delete set null,
 imported_at timestamptz not null default now(),request jsonb not null,result jsonb
);
create table if not exists public.tower_quality_item_commands(
 project_id uuid not null,item_id uuid not null,mutation_id text not null,actor_id uuid not null,
 payload jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(project_id,mutation_id)
);
create table if not exists public.tower_quality_evidence_deletions(
 file_id uuid primary key,project_id uuid not null,revision_id uuid not null,item_id uuid not null,
 actor_id uuid not null,reason text not null,file_snapshot jsonb not null,
 created_at timestamptz not null default now(),completed_at timestamptz
);
create unique index if not exists v1_punchlist_source_identity on public.tower_revision_items(project_id,tower_id,import_source_key,upper(btrim(external_reference)))
 where source_type='punchlist';

create or replace function public.v1_quality_existing_rect_guard() returns trigger language plpgsql set search_path=public as $$
declare existing record;
begin
 perform id from towers where id=new.tower_id for update;
 select revision_number into existing from tower_revisions where tower_id=new.tower_id and project_id=new.project_id
 and status in ('Draft','Open','In Progress','Ready for Review') order by created_at limit 1;
 if found and not new.additional_rect_confirmed then raise exception using errcode='P0001',message='This tower already has '||existing.revision_number||'. Open the existing Rectification or confirm Create another anyway.';end if;
 return new;
end; $$;
drop trigger if exists a_v1_quality_existing_rect_guard on public.tower_revisions;
create trigger a_v1_quality_existing_rect_guard before insert on public.tower_revisions for each row execute function public.v1_quality_existing_rect_guard();

create or replace function public.v1_quality_item_version() returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.finding,new.rectification_comment,new.status,new.issue_type_id,new.other_issue_text,new.leg,new.assigned_flag,new.member_number,new.tower_segment,new.drawing_number)
 is distinct from row(old.finding,old.rectification_comment,old.status,old.issue_type_id,old.other_issue_text,old.leg,old.assigned_flag,old.member_number,old.tower_segment,old.drawing_number) then
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
 if p_patch->>'status' in ('Rectified','Verified') then
  if not exists(select 1 from tower_quality_files where revision_item_id=p_item and file_role='before_photo' and not deletion_pending)
  or not exists(select 1 from tower_quality_files where revision_item_id=p_item and file_role='after_photo' and not deletion_pending) then raise exception 'Before and After evidence must sync before marking Rectified.';end if;
  if nullif(btrim(coalesce(p_patch->>'rectification_comment',item.rectification_comment)),'') is null then raise exception 'Describe the rectification / action taken.';end if;
 end if;
 update tower_revision_items set
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
  allocated:=create_v1_revision_item_atomic(parent.id,p_project,p_actor,'import:'||p_batch||':'||(entry->>'rowKey'),jsonb_build_object('otherIssueText',entry->>'defectType','finding',entry->>'description','leg',entry->>'leg','assignedFlag',entry->>'assignedFlag','towerSegment',entry->>'segment','memberNumber',entry->>'member','drawingNumber',entry->>'drawing'));
  update tower_revision_items set source_type='punchlist',external_reference=btrim(entry->>'externalReference'),import_source_key=source_key,source_batch_id=p_batch,source_payload=entry,inspector_comment=entry->>'inspectorComment',source_date=nullif(entry->>'sourceDate','')::date where id=(allocated->'item'->>'id')::uuid returning * into item;
  results:=results||jsonb_build_array(jsonb_build_object('item',to_jsonb(item),'disposition','created'));
 end loop;
 update tower_quality_import_batches set result=results where id=p_batch;
 return results;
end; $$;

-- Mark stale report pointers on all canonical item/evidence changes, including
-- old clients. Preserve historical PDF files as explicitly outdated versions.
create or replace function public.invalidate_v1_revision_finalisation() returns trigger language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
 if tg_op='DELETE' then target:=old.revision_id;else target:=new.revision_id;end if;
 if tg_table_name='tower_quality_files' then
  if tg_op='DELETE' then if old.file_role not in ('before_photo','after_photo') then return null;end if;
  else if new.file_role not in ('before_photo','after_photo') then return null;end if;end if;
 end if;
 update tower_revisions set finalised_at=null,latest_pdf_file_id=null where id=target;
 update tower_quality_files set is_outdated=true where revision_id=target and file_role='revision_pdf' and not is_outdated;
 return null;
end; $$;

create or replace function public.begin_v1_quality_photo_delete(p_file uuid,p_actor uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare file tower_quality_files%rowtype; parent tower_revisions%rowtype; audit tower_quality_evidence_deletions%rowtype;
begin
 select * into audit from tower_quality_evidence_deletions where file_id=p_file;
 if found then perform assert_v1_quality_actor(p_actor,audit.project_id);return to_jsonb(audit);end if;
 select * into file from tower_quality_files where id=p_file;
 if not found then raise exception using errcode='P0002',message='Evidence not found.';end if;
 perform assert_v1_quality_actor(p_actor,file.project_id);
 select * into parent from tower_revisions where id=file.revision_id for update;
 if parent.id is null or parent.finalised_at is not null or parent.status not in ('Draft','Open','In Progress') then raise exception 'Finalised or submitted evidence cannot be altered.';end if;
 if file.file_role not in ('before_photo','after_photo') then raise exception 'Select a Before or After photo.';end if;
 perform id from tower_revision_items where id=file.revision_item_id and status='Verified';
 if found then raise exception 'Verified evidence is locked.';end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'A deletion reason is required.';end if;
 insert into tower_quality_evidence_deletions(file_id,project_id,revision_id,item_id,actor_id,reason,file_snapshot)
 values(file.id,file.project_id,file.revision_id,file.revision_item_id,p_actor,p_reason,to_jsonb(file)) returning * into audit;
 update tower_quality_files set deletion_pending=true where id=p_file;
 if not exists(select 1 from tower_quality_files where revision_item_id=file.revision_item_id and file_role=file.file_role and not deletion_pending) then
  update tower_revision_items set status='Open' where id=file.revision_item_id;
 end if;
 return to_jsonb(audit);
end; $$;
create or replace function public.finish_v1_quality_photo_delete(p_file uuid,p_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
declare audit tower_quality_evidence_deletions%rowtype;
begin
 select * into audit from tower_quality_evidence_deletions where file_id=p_file for update;
 if not found then raise exception 'Start the controlled evidence deletion first.';end if;
 perform assert_v1_quality_actor(p_actor,audit.project_id);
 delete from tower_quality_files where id=p_file;
 update tower_quality_evidence_deletions set completed_at=coalesce(completed_at,now()) where file_id=p_file;
end; $$;
create or replace function public.v1_quality_evidence_lock() returns trigger language plpgsql set search_path=public as $$
declare parent tower_revisions%rowtype; rid uuid; phase text;
begin
 if tg_op='DELETE' then rid:=old.revision_id;phase:=old.file_role;else rid:=new.revision_id;phase:=new.file_role;end if;
 if tg_op='INSERT' and new.mobile_client_mutation_id is not null and exists(select 1 from tower_quality_evidence_deletions where project_id=new.project_id and file_snapshot->>'mobile_client_mutation_id'=new.mobile_client_mutation_id) then raise exception 'Deleted evidence cannot be resurrected by a retry.';end if;
 if phase not in ('before_photo','after_photo') then if tg_op='DELETE' then return old;else return new;end if;end if;
 if rid is null then if tg_op='DELETE' then return old;else return new;end if;end if;
 select * into parent from tower_revisions where id=rid for update;
 -- Allow the existing whole-RECT cascade after its parent was removed.
 if parent.id is not null and (parent.finalised_at is not null or parent.status not in ('Draft','Open','In Progress')) then raise exception 'Controlled Rectification evidence is locked.';end if;
 if tg_op='DELETE' then return old;else return new;end if;
end; $$;
drop trigger if exists v1_quality_evidence_lock on public.tower_quality_files;
create trigger v1_quality_evidence_lock before insert or delete on public.tower_quality_files for each row execute function public.v1_quality_evidence_lock();
create or replace function public.finalise_v1_revision_atomic(p_revision_id uuid,p_project_id uuid,p_actor_id uuid,p_submit boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare parent public.tower_revisions%rowtype; item record;
begin
 perform public.assert_v1_quality_actor(p_actor_id,p_project_id);
 select * into parent from public.tower_revisions where id=p_revision_id and project_id=p_project_id for update;
 if not found then raise exception using errcode='P0002',message='This Rectification has been deleted or is no longer available.'; end if;
 if p_submit and parent.submitted_for_review_at is not null then return to_jsonb(parent); end if;
 if parent.status not in ('Draft','Open','In Progress') then raise exception using errcode='P0001',message='This Rectification is locked.'; end if;
 if p_submit and parent.finalised_at is null then raise exception using errcode='P0001',message='Finalise this Revision before submitting for review.'; end if;
 if exists(select 1 from public.tower_quality_files where revision_id=p_revision_id and deletion_pending) then raise exception 'Finish pending evidence deletions before finalising.';end if;
 if not exists(select 1 from public.tower_revision_items where revision_id=p_revision_id) then
  raise exception using errcode='P0001',message='Add at least one finding before finalising.';
 end if;
 for item in select * from public.tower_revision_items where revision_id=p_revision_id loop
  if item.source_type='punchlist' and nullif(btrim(item.rectification_comment),'') is null then raise exception 'Finding %: describe the action taken.',item.item_number;end if;
  if item.issue_type_id is null and nullif(btrim(item.other_issue_text),'') is null then raise exception 'Finding %: select an issue type.',item.item_number; end if;
  if not exists(select 1 from public.tower_quality_files where revision_id=p_revision_id and revision_item_id=item.id and not deletion_pending and file_role='before_photo') then raise exception 'Finding %: Before evidence is required.',item.item_number; end if;
  if item.status not in ('Rectified','Verified') then raise exception 'Finding %: complete rectification before finalising.',item.item_number; end if;
  if not exists(select 1 from public.tower_quality_files where revision_id=p_revision_id and revision_item_id=item.id and not deletion_pending and file_role='after_photo') then raise exception 'Finding %: After evidence is required.',item.item_number; end if;
 end loop;
 update public.tower_revisions set finalised_at=coalesce(finalised_at,now()),updated_at=now(),
  status=case when p_submit then 'Ready for Review' else status end,
  submitted_for_review_at=case when p_submit then now() else submitted_for_review_at end,
  submitted_for_review_by=case when p_submit then p_actor_id else submitted_for_review_by end
 where id=p_revision_id returning * into parent;
 return to_jsonb(parent);
end; $$;
revoke all on function public.finalise_v1_revision_atomic(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.finalise_v1_revision_atomic(uuid,uuid,uuid,boolean) to service_role;

revoke all on function public.begin_v1_quality_photo_delete(uuid,uuid,text),public.finish_v1_quality_photo_delete(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_v1_quality_photo_delete(uuid,uuid,text),public.finish_v1_quality_photo_delete(uuid,uuid) to service_role;
alter table public.tower_quality_import_batches enable row level security;
alter table public.tower_quality_item_commands enable row level security;
alter table public.tower_quality_evidence_deletions enable row level security;
revoke all on public.tower_quality_import_batches,public.tower_quality_item_commands,public.tower_quality_evidence_deletions from public,anon,authenticated;
grant all on public.tower_quality_import_batches,public.tower_quality_item_commands,public.tower_quality_evidence_deletions to service_role;
revoke all on function public.update_v1_quality_item(uuid,uuid,bigint,text,jsonb,text),public.import_v1_quality_punchlist(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.update_v1_quality_item(uuid,uuid,bigint,text,jsonb,text),public.import_v1_quality_punchlist(uuid,uuid,uuid,jsonb) to service_role;
insert into public.access_areas(group_id,category,code,name,description,type,permission_level,route,source,sort_order,is_active)
select (select group_id from public.access_areas where code='tt.rectifications'),'TTTracker Quality','quality.import_punchlist','Import Punchlists','Import and reconcile client supplied Quality punchlists.','tttracker','manage','/quality/punchlists','system_permission',200,true
on conflict(code) do nothing;
notify pgrst,'reload schema';
commit;

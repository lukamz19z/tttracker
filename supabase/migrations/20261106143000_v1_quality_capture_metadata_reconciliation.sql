-- V1 only. Metadata repair is separate from workflow status transitions and
-- must preserve the same revision/item locks as the normal quality workflow.
create or replace function public.reconcile_v1_quality_item_capture_metadata(
 p_item uuid,
 p_revision uuid,
 p_project uuid,
 p_tower uuid,
 p_actor uuid,
 p_patch jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare parent public.tower_revisions%rowtype; item public.tower_revision_items%rowtype; prior public.tower_revision_items%rowtype;
 changed text[]:='{}';
begin
 if jsonb_typeof(p_patch) is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(p_patch) as keys(key) where key not in (
   'before_taken_at','before_taken_by','before_taken_by_label',
   'after_taken_at','after_taken_by','after_taken_by_label')) then
  raise exception using errcode='22023',message='Invalid historical capture metadata patch.';
 end if;

 select * into parent from public.tower_revisions
  where id=p_revision and project_id=p_project and tower_id=p_tower for update;
 if not found then raise exception using errcode='P0002',message='Revision scope could not be verified.'; end if;
 perform public.assert_v1_quality_actor(p_actor,parent.project_id);
 if parent.finalised_at is not null or parent.status not in ('Draft','Open','In Progress') then
  return jsonb_build_object('lockedReason','Revision is finalised or locked.');
 end if;

 select * into item from public.tower_revision_items
  where id=p_item and revision_id=parent.id and project_id=parent.project_id and tower_id=parent.tower_id for update;
 if not found then raise exception using errcode='P0002',message='Finding scope could not be verified.'; end if;
 if item.status='Verified' then return jsonb_build_object('lockedReason','Verified findings are locked.'); end if;
 if item.status not in ('Open','Rectified') then return jsonb_build_object('lockedReason','Finding status does not permit metadata repair.'); end if;
 prior:=item;

 if (p_patch ?| array['before_taken_at','before_taken_by','before_taken_by_label']) and not exists(
  select 1 from public.tower_quality_files f where f.revision_id=parent.id and f.revision_item_id=item.id
   and f.project_id=parent.project_id and f.tower_id=parent.tower_id and f.file_role='before_photo'
   and not f.deletion_pending and not f.is_outdated
 ) then raise exception using errcode='22023',message='Active Before evidence is required for Before metadata repair.'; end if;
 if (p_patch ?| array['after_taken_at','after_taken_by','after_taken_by_label']) and not exists(
  select 1 from public.tower_quality_files f where f.revision_id=parent.id and f.revision_item_id=item.id
   and f.project_id=parent.project_id and f.tower_id=parent.tower_id and f.file_role='after_photo'
   and not f.deletion_pending and not f.is_outdated
 ) then raise exception using errcode='22023',message='Active After evidence is required for After metadata repair.'; end if;

 update public.tower_revision_items set
  before_taken_at=case when before_taken_at is null and p_patch ? 'before_taken_at' then nullif(p_patch->>'before_taken_at','')::timestamptz else before_taken_at end,
  before_taken_by=case when before_taken_by is null and p_patch ? 'before_taken_by' then nullif(p_patch->>'before_taken_by','')::uuid else before_taken_by end,
  before_taken_by_label=case when before_taken_by_label is null and p_patch ? 'before_taken_by_label' then nullif(p_patch->>'before_taken_by_label','') else before_taken_by_label end,
  after_taken_at=case when after_taken_at is null and p_patch ? 'after_taken_at' then nullif(p_patch->>'after_taken_at','')::timestamptz else after_taken_at end,
  after_taken_by=case when after_taken_by is null and p_patch ? 'after_taken_by' then nullif(p_patch->>'after_taken_by','')::uuid else after_taken_by end,
  after_taken_by_label=case when after_taken_by_label is null and p_patch ? 'after_taken_by_label' then nullif(p_patch->>'after_taken_by_label','') else after_taken_by_label end
 where id=item.id
 returning * into item;

 if p_patch ? 'before_taken_at' and prior.before_taken_at is null and item.before_taken_at is not null then changed:=array_append(changed,'before_taken_at'); end if;
 if p_patch ? 'before_taken_by' and prior.before_taken_by is null and item.before_taken_by is not null then changed:=array_append(changed,'before_taken_by'); end if;
 if p_patch ? 'before_taken_by_label' and prior.before_taken_by_label is null and item.before_taken_by_label is not null then changed:=array_append(changed,'before_taken_by_label'); end if;
 if p_patch ? 'after_taken_at' and prior.after_taken_at is null and item.after_taken_at is not null then changed:=array_append(changed,'after_taken_at'); end if;
 if p_patch ? 'after_taken_by' and prior.after_taken_by is null and item.after_taken_by is not null then changed:=array_append(changed,'after_taken_by'); end if;
 if p_patch ? 'after_taken_by_label' and prior.after_taken_by_label is null and item.after_taken_by_label is not null then changed:=array_append(changed,'after_taken_by_label'); end if;
 return jsonb_build_object('updatedFields',to_jsonb(changed));
end; $$;

revoke all on function public.reconcile_v1_quality_item_capture_metadata(uuid,uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reconcile_v1_quality_item_capture_metadata(uuid,uuid,uuid,uuid,uuid,jsonb) to service_role;

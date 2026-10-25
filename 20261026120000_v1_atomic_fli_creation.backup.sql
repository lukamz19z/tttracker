-- V1 only. Canonical FLI scope remains revision_id (RECT), never project-wide.
-- No historical rows are rewritten. Existing duplicate data fails index creation visibly.
create unique index if not exists tower_revision_items_revision_id_item_number_key
 on public.tower_revision_items(revision_id,item_number);
create unique index if not exists tower_revision_items_revision_fli_number_uidx
 on public.tower_revision_items(revision_id,fli_number) where fli_number is not null;
create unique index if not exists tower_revision_items_project_mobile_mutation_uidx
 on public.tower_revision_items(project_id,mobile_client_mutation_id) where mobile_client_mutation_id is not null;

-- Service-only delegation of the existing V1 project-access policy, with the
-- authenticated actor supplied by the Bearer-token gateway, never mobile input.
create or replace function public.assert_v1_quality_actor(p_actor uuid,p_project uuid)
returns void language plpgsql security definer set search_path=public as $$
declare previous_sub text:=current_setting('request.jwt.claim.sub',true);
 previous_claims text:=current_setting('request.jwt.claims',true); allowed boolean;
begin
 if p_actor is null then raise exception using errcode='42501',message='Quality access denied.'; end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor)::text,true);
 allowed:=public.tttracker_quality_has_project_access(p_project);
 perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
 if not allowed then raise exception using errcode='42501',message='Quality access denied.'; end if;
end; $$;
revoke all on function public.assert_v1_quality_actor(uuid,uuid) from public,anon,authenticated;

-- Every INSERT, including an older website client, goes through this allocator.
-- The parent row is also locked by finalisation, submission and parent DELETE.
create or replace function public.tttracker_assign_fli_number()
returns trigger language plpgsql security definer set search_path=public as $$
declare parent public.tower_revisions%rowtype; next_no integer;
begin
 select * into parent from public.tower_revisions where id=new.revision_id for update;
 if not found then raise exception using errcode='P0002',message='This Rectification has been deleted or is no longer available.'; end if;
 if parent.finalised_at is not null or parent.status not in ('Draft','Open','In Progress') then
  raise exception using errcode='P0001',message='This Rectification has been finalised and can no longer accept new FLIs.';
 end if;
 new.project_id:=parent.project_id; new.tower_id:=parent.tower_id;
 -- MAX is safe here: parent FOR UPDATE serialises the entire allocate+insert.
 select coalesce(max(greatest(coalesce(item_number,0),case when fli_number ~ '^FLI-[0-9]+$'
  then substring(fli_number from '[0-9]+$')::integer else 0 end)),0)+1 into next_no
 from public.tower_revision_items where revision_id=new.revision_id;
 new.item_number:=next_no;
 new.fli_number:='FLI-'||lpad(next_no::text,greatest(3,length(next_no::text)),'0');
 if coalesce(new.sort_order,0)=0 then new.sort_order:=next_no*10; end if;
 return new;
end; $$;
drop trigger if exists tower_revision_items_assign_fli_number on public.tower_revision_items;
create trigger tower_revision_items_assign_fli_number before insert on public.tower_revision_items
 for each row execute function public.tttracker_assign_fli_number();

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
  issue_type_id,other_issue_text,leg,assigned_flag,tower_segment,member_number,drawing_number,finding,rectification_comment,status)
 values(p_revision_id,p_project_id,parent.tower_id,p_actor_id,p_mutation_id,
  nullif(p_fields->>'issueTypeId','')::uuid,nullif(btrim(p_fields->>'otherIssueText'),''),nullif(p_fields->>'leg',''),
  nullif(btrim(p_fields->>'assignedFlag'),''),nullif(btrim(p_fields->>'towerSegment'),''),nullif(btrim(p_fields->>'memberNumber'),''),
  nullif(btrim(p_fields->>'drawingNumber'),''),nullif(btrim(p_fields->>'finding'),''),nullif(btrim(p_fields->>'rectificationComment'),''),'Open') returning * into item;
 update public.tower_revisions set status=case when status='Draft' then 'In Progress' else status end,updated_at=now() where id=p_revision_id;
 return jsonb_build_object('item',to_jsonb(item),'idempotentHit',false);
end; $$;
revoke all on function public.create_v1_revision_item_atomic(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_v1_revision_item_atomic(uuid,uuid,uuid,text,jsonb) to service_role;

-- Validation and state transition happen while holding the same parent row lock.
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
 if not exists(select 1 from public.tower_revision_items where revision_id=p_revision_id) then
  raise exception using errcode='P0001',message='Add at least one finding before finalising.';
 end if;
 for item in select * from public.tower_revision_items where revision_id=p_revision_id loop
  if item.issue_type_id is null and nullif(btrim(item.other_issue_text),'') is null then raise exception 'Finding %: select an issue type.',item.item_number; end if;
  if not exists(select 1 from public.tower_quality_files where revision_id=p_revision_id and revision_item_id=item.id and file_role='before_photo') then raise exception 'Finding %: Before evidence is required.',item.item_number; end if;
  if item.status not in ('Rectified','Verified') then raise exception 'Finding %: complete rectification before finalising.',item.item_number; end if;
  if not exists(select 1 from public.tower_quality_files where revision_id=p_revision_id and revision_item_id=item.id and file_role='after_photo') then raise exception 'Finding %: After evidence is required.',item.item_number; end if;
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
notify pgrst,'reload schema';

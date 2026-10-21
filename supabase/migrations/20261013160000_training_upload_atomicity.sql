begin;

-- Training review status is also the upload lifecycle until required evidence
-- has been linked. Draft and upload_failed are never operational submissions.
alter table public.v2_training_records
 drop constraint if exists v2_training_records_review_status_check;
alter table public.v2_training_records
 add constraint v2_training_records_review_status_check
 check (review_status in ('draft','uploading','upload_failed','pending_review','approved','rejected','changes_required'));

-- Repair only reviewable evidence-required rows with no canonical evidence at
-- all. Keep the records and their replacement links for safe retry/history.
with broken_groups as (
 select distinct r.organisation_id,r.evidence_group_id
 from public.v2_training_records r
 join public.v2_training_types k on k.organisation_id=r.organisation_id and k.id=r.training_type_id
 where r.review_status in ('pending_review','changes_required')
   and k.document_requirement <> 'none'
   and not exists (
     select 1 from public.v2_people_documents d
     where d.organisation_id=r.organisation_id and d.person_id=r.person_id
       and d.evidence_group_id=r.evidence_group_id and d.document_context='training'
       and d.classification='operational'
   )
)
update public.v2_training_records r
set review_status='upload_failed',is_current=false
from broken_groups g
where r.organisation_id=g.organisation_id and r.evidence_group_id=g.evidence_group_id
  and r.review_status in ('pending_review','changes_required');

-- The document upload scope is limited to the creator's owned draft or a
-- submitted record still editable under Training policy.
do $$ declare definition text; old text; replacement text; begin
 definition:=pg_get_functiondef('public.tttracker_v2_people_read_training_previous(uuid,text,text,integer,uuid,jsonb)'::regprocedure);
 old:='and r.review_status in (''pending_review'',''changes_required'');';
 replacement:='and (r.review_status in (''pending_review'',''changes_required'') or (r.review_status in (''draft'',''upload_failed'') and r.created_by=auth.uid()));';
 if position(old in definition)=0 then raise exception 'TRAINING_DOCUMENT_SCOPE_UPGRADE_REQUIRED'; end if;
 execute replace(definition,old,replacement);
end $$;

create or replace function public.tttracker_v2_attach_training_document(p_org uuid,p_document uuid,p_record uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.v2_training_records;d public.v2_people_documents;
begin
 perform private.tttracker_v2_require_people_permission(p_org,'training.edit');
 select * into r from public.v2_training_records where organisation_id=p_org and id=p_record for update;
 if not found or r.review_status not in ('draft','upload_failed','pending_review','changes_required') then raise exception 'TRAINING_DOCUMENT_NOT_EDITABLE';end if;
 if r.review_status in ('draft','upload_failed') and r.created_by is distinct from auth.uid() then raise exception 'PEOPLE_PERMISSION_DENIED';end if;
 select * into d from public.v2_people_documents where organisation_id=p_org and id=p_document for update;
 if not found or d.created_by is distinct from auth.uid() or d.person_id is distinct from r.person_id
  or d.provider<>'sharepoint' or d.sharepoint_item_id is null or d.document_context<>'training'
  or d.classification<>'operational' or d.entity_id is distinct from r.id
 then raise exception 'PEOPLE_RELATIONSHIP_INVALID';end if;
 update public.v2_people_documents set evidence_group_id=r.evidence_group_id where organisation_id=p_org and id=p_document;
 insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area,target_id)
 values(p_org,r.person_id,auth.uid(),'document','operational',p_document);
 return jsonb_build_object('id',p_document);
end $$;
revoke all on function public.tttracker_v2_attach_training_document(uuid,uuid,uuid) from public,anon;
grant execute on function public.tttracker_v2_attach_training_document(uuid,uuid,uuid) to authenticated;

alter function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) rename to tttracker_v2_people_write_before_upload_atomicity;
revoke all on function public.tttracker_v2_people_write_before_upload_atomicity(uuid,text,uuid,jsonb) from public,anon,authenticated;
create function public.tttracker_v2_people_write(p_organisation_id uuid,p_action text,p_id uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;r public.v2_training_records;group_id uuid;item record;
begin
 if p_action='training_upload_failed' then
  perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.edit');
  select * into r from public.v2_training_records where organisation_id=p_organisation_id and id=p_id for update;
  if not found then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
  if r.created_by is distinct from auth.uid() then raise exception 'PEOPLE_PERMISSION_DENIED';end if;
  if r.review_status in ('draft','upload_failed','uploading') and not r.is_current then
   update public.v2_training_records set review_status='upload_failed' where organisation_id=p_organisation_id and evidence_group_id=r.evidence_group_id and review_status in ('draft','upload_failed','uploading');
   insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area,target_id,context)
   values(p_organisation_id,r.person_id,auth.uid(),'training_upload_failed','operational',p_id,jsonb_build_object('safe_code',coalesce(nullif(p_data->>'code',''),'DOCUMENT_UPLOAD_FAILED')));
  end if;
  return jsonb_build_object('id',p_id,'review_status','upload_failed');
 end if;

 if p_action='training' then
  result:=public.tttracker_v2_people_write_before_upload_atomicity(p_organisation_id,p_action,p_id,p_data);
  select evidence_group_id into group_id from public.v2_training_records where organisation_id=p_organisation_id and id=(result->>'id')::uuid;
  if group_id is null then raise exception 'TRAINING_SUBMISSION_NOT_FOUND';end if;
  update public.v2_training_records set review_status='draft',is_current=false,submitted_at=null
   where organisation_id=p_organisation_id and evidence_group_id=group_id and review_status='pending_review' and submitted_at is null;
  return result;
 end if;

 if p_action='finalize_training' then
  select evidence_group_id into group_id from public.v2_training_records where organisation_id=p_organisation_id and id=p_id for update;
  if group_id is null then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
  for item in select id from public.v2_training_records where organisation_id=p_organisation_id and evidence_group_id=group_id order by id for update loop
   perform private.tttracker_v2_validate_training_evidence(p_organisation_id,item.id);
  end loop;
  update public.v2_training_records set review_status='pending_review'
   where organisation_id=p_organisation_id and evidence_group_id=group_id and review_status in ('draft','upload_failed','uploading');
 end if;

 if p_action='review_training' and p_data->>'outcome'='approved' then
  select * into r from public.v2_training_records where organisation_id=p_organisation_id and id=p_id for update;
  if not found or r.review_status not in ('pending_review','changes_required') then raise exception 'TRAINING_INVALID_TRANSITION';end if;
  perform private.tttracker_v2_validate_training_evidence(p_organisation_id,p_id);
 end if;

 result:=public.tttracker_v2_people_write_before_upload_atomicity(p_organisation_id,p_action,p_id,p_data);
 if p_action='finalize_training' then
  select * into r from public.v2_training_records where organisation_id=p_organisation_id and id=p_id;
  result:=result||jsonb_build_object('review_status',r.review_status,'replacement',r.supersedes_record_id is not null);
 end if;
 return result;
end $$;
revoke all on function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) to authenticated;

alter function public.tttracker_v2_people_read(uuid,text,text,integer,uuid,jsonb) rename to tttracker_v2_people_read_before_upload_atomicity;
revoke all on function public.tttracker_v2_people_read_before_upload_atomicity(uuid,text,text,integer,uuid,jsonb) from public,anon,authenticated;
create function public.tttracker_v2_people_read(p_organisation_id uuid,p_area text default 'people',p_query text default '',p_page integer default 1,p_person_id uuid default null,p_filter jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;rows jsonb;
begin
 if p_area='training_drafts' then
  perform private.tttracker_v2_require_people_permission(p_organisation_id,case when private.tttracker_v2_has_permission(p_organisation_id,'training.create') then 'training.create' else 'training.edit' end);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]'::jsonb) into rows from (
   select r.id,r.person_id,p.display_name,k.id training_type_id,k.name training_type,r.option_id,o.name option_name,
    r.issue_date,r.expiry_date,r.certificate_number,r.project_id,r.evidence_group_id,r.review_status,r.created_at,
    s.submission_key,coalesce(s.payload->'linked_type_ids','[]'::jsonb) linked_type_ids
   from public.v2_training_records r
   join public.v2_people p on p.organisation_id=r.organisation_id and p.id=r.person_id
   join public.v2_training_types k on k.organisation_id=r.organisation_id and k.id=r.training_type_id
   left join public.v2_training_options o on o.organisation_id=r.organisation_id and o.id=r.option_id
   left join public.v2_training_submissions s on s.organisation_id=r.organisation_id and s.record_id=r.id
   where r.organisation_id=p_organisation_id and r.created_by=auth.uid() and r.review_status in ('draft','upload_failed')
    and (p_person_id is null or r.person_id=p_person_id) and r.id=(select primary_r.id from public.v2_training_records primary_r where primary_r.organisation_id=r.organisation_id and primary_r.evidence_group_id=r.evidence_group_id and primary_r.training_type_id=k.id order by primary_r.created_at,primary_r.id limit 1)
  ) x;
  return jsonb_build_object('rows',rows,'total',jsonb_array_length(rows));
 end if;
 result:=public.tttracker_v2_people_read_before_upload_atomicity(p_organisation_id,p_area,p_query,p_page,p_person_id,p_filter);
 if p_area in ('training','review') then
  select coalesce(jsonb_agg(enriched),'[]'::jsonb) into rows
  from (select r || jsonb_build_object(
    'document_requirement',(select k.document_requirement from public.v2_training_records t join public.v2_training_types k on k.organisation_id=t.organisation_id and k.id=t.training_type_id where t.organisation_id=p_organisation_id and t.id=(r->>'id')::uuid)
   ) enriched
   from jsonb_array_elements(coalesce(result->'rows','[]'::jsonb)) r
   where coalesce(r->>'review_status',r->>'status','') not in ('draft','uploading','upload_failed')) filtered;
  return result||jsonb_build_object('rows',rows,'total',jsonb_array_length(rows));
 end if;
 return result;
end $$;
revoke all on function public.tttracker_v2_people_read(uuid,text,text,integer,uuid,jsonb) from public,anon;
grant execute on function public.tttracker_v2_people_read(uuid,text,text,integer,uuid,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;

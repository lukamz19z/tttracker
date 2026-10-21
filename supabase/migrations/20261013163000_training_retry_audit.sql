begin;
alter function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) rename to tttracker_v2_people_write_before_retry_audit;
revoke all on function public.tttracker_v2_people_write_before_retry_audit(uuid,text,uuid,jsonb) from public,anon,authenticated;
create function public.tttracker_v2_people_write(p_organisation_id uuid,p_action text,p_id uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.v2_training_records;
begin
 if p_action='training_upload_retry_started' then
  perform private.tttracker_v2_require_people_permission(p_organisation_id,'training.edit');
  select * into r from public.v2_training_records where organisation_id=p_organisation_id and id=p_id for update;
  if not found then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
  if r.created_by is distinct from auth.uid() then raise exception 'PEOPLE_PERMISSION_DENIED';end if;
  if r.review_status not in ('draft','upload_failed') or r.is_current then raise exception 'TRAINING_INVALID_TRANSITION';end if;
  insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area,target_id,context)
  values(p_organisation_id,r.person_id,auth.uid(),'training_upload_retry_started','operational',p_id,jsonb_build_object('safe_code','TRAINING_UPLOAD_RETRY'));
  return jsonb_build_object('id',p_id,'retry',true);
 end if;
 return public.tttracker_v2_people_write_before_retry_audit(p_organisation_id,p_action,p_id,p_data);
end $$;
revoke all on function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) to authenticated;
commit;

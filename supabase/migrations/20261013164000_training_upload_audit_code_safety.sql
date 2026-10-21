begin;
alter function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) rename to tttracker_v2_people_write_before_safe_error_audit;
revoke all on function public.tttracker_v2_people_write_before_safe_error_audit(uuid,text,uuid,jsonb) from public,anon,authenticated;
create function public.tttracker_v2_people_write(p_organisation_id uuid,p_action text,p_id uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare safe_data jsonb;
begin
 if p_action='training_upload_failed' then
  safe_data:=jsonb_build_object('code',case when coalesce(p_data->>'code','') ~ '^(DOCUMENT_|INTEGRATION_)[A-Z_]+$' then p_data->>'code' else 'DOCUMENT_UPLOAD_FAILED' end);
  return public.tttracker_v2_people_write_before_safe_error_audit(p_organisation_id,p_action,p_id,safe_data);
 end if;
 return public.tttracker_v2_people_write_before_safe_error_audit(p_organisation_id,p_action,p_id,p_data);
end $$;
revoke all on function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.tttracker_v2_people_write(uuid,text,uuid,jsonb) to authenticated;
commit;

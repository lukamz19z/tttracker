begin;

alter table public.v2_training_types
  add column if not exists matrix_option_display text not null default 'separate';
alter table public.v2_training_types
  drop constraint if exists v2_training_types_matrix_option_display_check;
alter table public.v2_training_types
  add constraint v2_training_types_matrix_option_display_check
  check (matrix_option_display in ('separate','combined'));

alter table public.v2_training_records
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id),
  add column if not exists void_reason text;

create or replace function public.tttracker_v2_training_void(p_org uuid,p_record uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.v2_training_records;
begin
  perform private.tttracker_v2_require_people_permission(p_org,'training.edit');
  if nullif(btrim(p_reason),'') is null then raise exception 'TRAINING_VOID_REASON_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,2));
  select * into r from public.v2_training_records where organisation_id=p_org and id=p_record for update;
  if r.id is null then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if;
  if r.project_id is not null and not private.tttracker_v2_is_project_member(r.project_id) then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if;
  if r.voided_at is not null then return jsonb_build_object('id',r.id,'already_voided',true); end if;
  update public.v2_training_records set is_current=false,voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason)
    where organisation_id=p_org and id=p_record;
  insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area,target_id,context)
    values(p_org,r.person_id,auth.uid(),'training_record_voided','operational',r.id,jsonb_build_object('reason',btrim(p_reason),'review_status',r.review_status,'was_current',r.is_current));
  return jsonb_build_object('id',r.id,'voided',true);
end $$;
revoke all on function public.tttracker_v2_training_void(uuid,uuid,text) from public,anon;
grant execute on function public.tttracker_v2_training_void(uuid,uuid,text) to authenticated;

create or replace function public.tttracker_v2_training_record_update(p_org uuid,p_record uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.v2_training_records; k public.v2_training_types; v_issue date; v_expiry date; v_option uuid; v_number text;
begin
  perform private.tttracker_v2_require_people_permission(p_org,'training.edit');
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,2));
  select * into r from public.v2_training_records where organisation_id=p_org and id=p_record and voided_at is null for update;
  if r.id is null then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if;
  if r.project_id is not null and not private.tttracker_v2_is_project_member(r.project_id) then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if;
  select * into k from public.v2_training_types where organisation_id=p_org and id=r.training_type_id;
  if k.id is null then raise exception 'PEOPLE_RECORD_NOT_FOUND'; end if;
  v_number:=case when p_data ? 'certificate_number' then nullif(btrim(p_data->>'certificate_number'),'') else r.certificate_number end;
  if r.review_status='approved' or r.is_current then
    if p_data ? 'issue_date' or p_data ? 'expiry_date' or p_data ? 'option_id' then
      raise exception 'TRAINING_APPROVED_MATERIAL_EDIT_REQUIRES_REPLACEMENT';
    end if;
  end if;
  v_issue:=case when p_data ? 'issue_date' then nullif(p_data->>'issue_date','')::date else r.issue_date end;
  v_option:=case when p_data ? 'option_id' then nullif(p_data->>'option_id','')::uuid else r.option_id end;
  if p_data ? 'option_id' and v_option is not null and not exists (
    select 1 from public.v2_training_type_options where organisation_id=p_org and training_type_id=r.training_type_id and option_id=v_option
  ) then raise exception 'PEOPLE_RELATIONSHIP_INVALID'; end if;
  if k.requires_issue_date and v_issue is null then raise exception 'TRAINING_ISSUE_DATE_REQUIRED'; end if;
  if k.requires_certificate_number and v_number is null then raise exception 'TRAINING_CERTIFICATE_REQUIRED'; end if;
  v_expiry:=case k.validity_mode when 'never' then null when 'automatic' then (v_issue+make_interval(months=>k.validity_months))::date else case when p_data ? 'expiry_date' then nullif(p_data->>'expiry_date','')::date else r.expiry_date end end;
  if k.validity_mode<>'never' and v_expiry is null then raise exception 'TRAINING_EXPIRY_REQUIRED'; end if;
  if v_expiry is not null and v_issue is not null and v_expiry<v_issue then raise exception 'TRAINING_EXPIRY_INVALID'; end if;
  update public.v2_training_records set issue_date=v_issue,expiry_date=v_expiry,certificate_number=v_number,option_id=v_option
    where organisation_id=p_org and id=p_record;
  insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area,target_id,context)
    values(p_org,r.person_id,auth.uid(),'training_record_edited','operational',r.id,jsonb_build_object(
      'before',jsonb_build_object('issue_date',r.issue_date,'expiry_date',r.expiry_date,'certificate_number',r.certificate_number,'option_id',r.option_id),
      'after',jsonb_build_object('issue_date',v_issue,'expiry_date',v_expiry,'certificate_number',v_number,'option_id',v_option)));
  return jsonb_build_object('id',r.id,'issue_date',v_issue,'expiry_date',v_expiry,'review_status',r.review_status);
end $$;
revoke all on function public.tttracker_v2_training_record_update(uuid,uuid,jsonb) from public,anon;
grant execute on function public.tttracker_v2_training_record_update(uuid,uuid,jsonb) to authenticated;

create or replace function private.tttracker_v2_training_state(p_org uuid,p_person uuid,p_type uuid,p_required boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.v2_training_records; k public.v2_training_types; s text; opts jsonb;
begin
  select * into k from public.v2_training_types where organisation_id=p_org and id=p_type;
  select * into r from public.v2_training_records where organisation_id=p_org and person_id=p_person and training_type_id=p_type and superseded_at is null and voided_at is null
    order by is_current desc,created_at desc,id limit 1;
  s:=case when r.id is null then case when p_required then 'missing' else 'not_required' end
    when r.review_status<>'approved' then r.review_status when r.expiry_date<current_date then 'expired'
    when r.expiry_date<=current_date+k.renewal_lead_days then 'expiring' else 'current' end;
  select coalesce(jsonb_agg(jsonb_build_object('option_id',t.option_id,'option_name',o.name,'issue_date',t.issue_date,'expiry_date',t.expiry_date,'certificate_number',t.certificate_number,'state',case when t.review_status<>'approved' then t.review_status when t.expiry_date<current_date then 'expired' when t.expiry_date<=current_date+k.renewal_lead_days then 'expiring' else 'current' end) order by o.sort_order,o.name),'[]')
    into opts from public.v2_training_records t join public.v2_training_options o on o.organisation_id=t.organisation_id and o.id=t.option_id
    where t.organisation_id=p_org and t.person_id=p_person and t.training_type_id=p_type and t.voided_at is null and t.superseded_at is null and t.option_id is not null and (t.is_current or t.review_status<>'approved');
  return jsonb_build_object('state',s,'record_id',r.id,'expiry_date',r.expiry_date,'required',p_required,'option_name',(select name from public.v2_training_options where organisation_id=p_org and id=r.option_id),'certificate_number',r.certificate_number,'options',opts,'option_display',k.matrix_option_display);
end $$;
revoke all on function private.tttracker_v2_training_state(uuid,uuid,uuid,boolean) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;

;

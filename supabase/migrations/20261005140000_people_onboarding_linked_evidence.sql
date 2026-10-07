-- Share the configured requirements of explicitly selected linked qualifications.
begin;
create or replace function public.tttracker_v2_onboarding_external(p_session_hash text,p_action text,p_field text default null,p_value jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare sess private.v2_secure_sessions;i private.v2_secure_onboarding_instances;v private.v2_onboarding_versions;f jsonb;answers jsonb;issues jsonb:='[]';a jsonb;
begin
select * into sess from private.v2_secure_sessions where session_hash=p_session_hash and revoked_at is null and expires_at>now();
if not found then raise exception 'ONBOARDING_SESSION_INVALID';end if;
select * into i from private.v2_secure_onboarding_instances where organisation_id=sess.organisation_id and id=sess.instance_id and status not in ('revoked','completed') and expires_at>now() for update;
if not found or i.template_version_id is null then raise exception 'ONBOARDING_SESSION_INVALID';end if;
select * into v from private.v2_onboarding_versions where organisation_id=i.organisation_id and id=i.template_version_id;
select coalesce(jsonb_object_agg(field_key,value_json),'{}') into answers from (select field_key,value_json from private.v2_onboarding_operational_answers where organisation_id=i.organisation_id and instance_id=i.id union all select field_key,value_json from private.v2_onboarding_private_answers where organisation_id=i.organisation_id and instance_id=i.id)x;
if p_action='read' then
return jsonb_build_object('organisation',(select name from public.organisations where id=i.organisation_id),'title',(select name from public.v2_onboarding_templates where id=v.template_id and organisation_id=i.organisation_id),'definition',v.definition,'answers',answers,'status',i.status,'review_comment',i.review_comment,'instance_id',i.id,'training',
(select coalesce(jsonb_object_agg(k.id::text,to_jsonb(k)||jsonb_build_object('linked_types',(select coalesce(jsonb_agg(jsonb_build_object('id',z.id,'name',z.name,'validity_mode',z.validity_mode,'document_requirement',z.document_requirement,'requires_issue_date',z.requires_issue_date,'requires_certificate_number',z.requires_certificate_number)),'[]') from public.v2_training_linked_types l join public.v2_training_types z on z.id=l.linked_type_id and z.organisation_id=l.organisation_id where l.organisation_id=i.organisation_id and l.training_type_id=k.id))),'{}') from public.v2_training_types k where k.organisation_id=i.organisation_id and exists(select 1 from jsonb_array_elements(v.definition->'sections') s cross join lateral jsonb_array_elements(s->'fields') f where f->>'type'='training_request' and f->>'training_type_id'=k.id::text)));
end if;
if i.status not in ('invited','in_progress','changes_required') then raise exception 'ONBOARDING_NOT_EDITABLE';end if;
if p_action in ('save','document','upload_scope','document_access') then
select x into f from jsonb_array_elements(v.definition->'sections') s cross join lateral jsonb_array_elements(s->'fields') x where x->>'key'=p_field;
if f is null or f->>'classification'='confidential' then raise exception 'ONBOARDING_FIELD_INVALID';end if;
if p_action in ('document','upload_scope','document_access') then
if coalesce(f->>'type','') not in ('document_upload','training_request') then raise exception 'ONBOARDING_FIELD_INVALID';end if;
if p_action='upload_scope' then return jsonb_build_object('organisation_id',i.organisation_id,'instance_id',i.id,'field',f);end if;
if p_action='document_access' then return jsonb_build_object('rows',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'side',side,'storage_key',storage_key)),'[]') from private.v2_onboarding_documents where organisation_id=i.organisation_id and instance_id=i.id and field_key=p_field));end if;
if p_value->>'storage_key' not like i.organisation_id::text||'/onboarding/'||i.id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='v2-people-evidence' and name=p_value->>'storage_key') then raise exception 'ONBOARDING_FIELD_INVALID';end if;
insert into private.v2_onboarding_documents(organisation_id,instance_id,field_key,name,side,storage_key,content_type,size_bytes) values(i.organisation_id,i.id,p_field,p_value->>'name',p_value->>'side',p_value->>'storage_key',p_value->>'content_type',(p_value->>'size_bytes')::integer);
else
if length(p_value::text)>20000 or p_value is null then raise exception 'ONBOARDING_VALUE_INVALID';end if;
if f->>'type' in ('text','long_text','email','phone','date','address') and jsonb_typeof(p_value)<>'string' then raise exception 'ONBOARDING_VALUE_INVALID';end if;
if f->>'type'='number' and jsonb_typeof(p_value)<>'number' then raise exception 'ONBOARDING_VALUE_INVALID';end if;
if f->>'type' in ('boolean','acknowledgement') and jsonb_typeof(p_value)<>'boolean' then raise exception 'ONBOARDING_VALUE_INVALID';end if;
if f->>'type'='single_select' and not (f->'options' @> jsonb_build_array(p_value)) then raise exception 'ONBOARDING_VALUE_INVALID';end if;
if f->>'type'='multi_select' and (jsonb_typeof(p_value)<>'array' or not (f->'options' @> p_value)) then raise exception 'ONBOARDING_VALUE_INVALID';end if;
if f->>'type'='training_request' and (jsonb_typeof(p_value)<>'object' or exists(select 1 from jsonb_object_keys(p_value) x where x not in ('issue_date','expiry_date','certificate_number','linked_type_ids'))) then raise exception 'ONBOARDING_VALUE_INVALID';end if;
if f->>'type'='training_request' and p_value ? 'linked_type_ids' and (jsonb_typeof(p_value->'linked_type_ids')<>'array' or exists(select 1 from jsonb_array_elements_text(p_value->'linked_type_ids') id where not exists(select 1 from public.v2_training_linked_types l where l.organisation_id=i.organisation_id and l.training_type_id=(f->>'training_type_id')::uuid and l.linked_type_id::text=id))) then raise exception 'ONBOARDING_FIELD_INVALID';end if;
if f->>'classification'='private' then insert into private.v2_onboarding_private_answers values(i.organisation_id,i.id,p_field,f->>'domain',p_value) on conflict(instance_id,field_key) do update set value_json=excluded.value_json;
else insert into private.v2_onboarding_operational_answers values(i.organisation_id,i.id,p_field,p_value) on conflict(instance_id,field_key) do update set value_json=excluded.value_json;end if;
end if;
update private.v2_secure_onboarding_instances set status=case when status='invited' then 'in_progress' else status end where organisation_id=i.organisation_id and id=i.id;
elsif p_action='submit' then
for f in select f from jsonb_array_elements(v.definition->'sections') s cross join lateral jsonb_array_elements(s->'fields') f loop
if f ? 'condition' and answers->(f->'condition'->>'field') is distinct from f->'condition'->'equals' then continue;end if;
a:=answers->(f->>'key');
if coalesce((f->>'required')::boolean,false) and ((f->>'type'<>'document_upload' and (a is null or a='null'::jsonb or a='""'::jsonb or (f->>'type'='acknowledgement' and a<>'true'::jsonb))) or (f->>'type'='document_upload' and not exists(select 1 from private.v2_onboarding_documents where organisation_id=i.organisation_id and instance_id=i.id and field_key=f->>'key'))) then issues:=issues||jsonb_build_array(jsonb_build_object('field',f->>'key','label',f->>'label'));end if;
if f->>'type'='training_request' and a is not null then
if exists(select 1 from public.v2_training_types k where k.organisation_id=i.organisation_id and (k.id=(f->>'training_type_id')::uuid or exists(select 1 from public.v2_training_linked_types l where l.organisation_id=i.organisation_id and l.training_type_id=(f->>'training_type_id')::uuid and l.linked_type_id=k.id and (a->'linked_type_ids') ? k.id::text)) and ((k.requires_issue_date and nullif(a->>'issue_date','') is null) or (k.requires_certificate_number and nullif(a->>'certificate_number','') is null) or (k.validity_mode='manual' and nullif(a->>'expiry_date','') is null) or (k.document_requirement='single' and not exists(select 1 from private.v2_onboarding_documents d where d.organisation_id=i.organisation_id and d.instance_id=i.id and d.field_key=f->>'key' and d.side='single')) or (k.document_requirement='front_back' and (select count(distinct d.side) from private.v2_onboarding_documents d where d.organisation_id=i.organisation_id and d.instance_id=i.id and d.field_key=f->>'key' and d.side in ('front','back'))<2) or (k.document_requirement='single_or_front_back' and not exists(select 1 from private.v2_onboarding_documents d where d.organisation_id=i.organisation_id and d.instance_id=i.id and d.field_key=f->>'key' and d.side='single') and (select count(distinct d.side) from private.v2_onboarding_documents d where d.organisation_id=i.organisation_id and d.instance_id=i.id and d.field_key=f->>'key' and d.side in ('front','back'))<2))) then issues:=issues||jsonb_build_array(jsonb_build_object('field',f->>'key','label',f->>'label'));end if;end if;
end loop;
if jsonb_array_length(issues)>0 then return jsonb_build_object('issues',issues);end if;
update private.v2_secure_onboarding_instances set status='submitted',submitted_at=now() where organisation_id=i.organisation_id and id=i.id;
-- Auto-completion is restricted to operational, non-training templates. Private/training reviews remain deliberate.
if v.review_policy='none' and not exists(select 1 from jsonb_array_elements(v.definition->'sections') s cross join lateral jsonb_array_elements(s->'fields') f where f->>'classification'<>'operational' or f->>'type'='training_request') then perform private.tttracker_v2_onboarding_complete(i.organisation_id,i.id,i.created_by);end if;
else raise exception 'ONBOARDING_INVALID_REQUEST';end if;
insert into private.v2_onboarding_history(organisation_id,instance_id,action,external_session_id,field_key) values(i.organisation_id,i.id,p_action,sess.id,p_field);
return jsonb_build_object('saved',true,'status',(select status from private.v2_secure_onboarding_instances where organisation_id=i.organisation_id and id=i.id));
end $$;
notify pgrst,'reload schema';
commit;

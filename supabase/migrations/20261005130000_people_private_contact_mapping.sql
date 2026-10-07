-- Canonical personal contact retains both existing and domain-scoped permission paths.
begin;
create or replace function private.tttracker_v2_validate_template(p_org uuid,p_definition jsonb,p_publish boolean)
returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare s jsonb;f jsonb;keys text[]:='{}';minimum text;rank integer;
begin
if jsonb_typeof(p_definition->'sections')<>'array' or jsonb_array_length(p_definition->'sections') not between 1 and 30 then raise exception 'PEOPLE_TEMPLATE_INVALID';end if;
for s in select * from jsonb_array_elements(p_definition->'sections') loop
if nullif(btrim(s->>'name'),'') is null or jsonb_typeof(s->'fields')<>'array' or jsonb_array_length(s->'fields')>50 then raise exception 'PEOPLE_TEMPLATE_INVALID';end if;
for f in select * from jsonb_array_elements(s->'fields') loop
if f->>'key' is null or (f->>'key') !~ '^[a-z][a-z0-9_]{0,63}$' or (f->>'key')=any(keys) or nullif(btrim(f->>'label'),'') is null then raise exception 'PEOPLE_TEMPLATE_INVALID';end if;keys:=array_append(keys,f->>'key');
minimum:=case f->>'type' when 'phone' then 'private' when 'address' then 'private' when 'bank_account' then 'confidential' when 'tax_identifier' then 'confidential' when 'superannuation' then 'confidential' when 'payroll_reference' then 'confidential' else 'operational' end;
if coalesce(f->>'type','') not in ('text','long_text','email','phone','date','number','boolean','single_select','multi_select','address','document_upload','training_request','acknowledgement','bank_account','tax_identifier','superannuation','payroll_reference') then raise exception 'PEOPLE_TEMPLATE_INVALID';end if;
rank:=case f->>'classification' when 'operational' then 1 when 'private' then 2 when 'confidential' then 3 else 0 end;
if rank<(case minimum when 'operational' then 1 when 'private' then 2 else 3 end) then raise exception 'PEOPLE_CLASSIFICATION_INVALID';end if;
if rank=3 and p_publish then raise exception 'PEOPLE_CONFIDENTIAL_COLLECTION_DISABLED';end if;
if rank=2 and coalesce(f->>'domain','') not in ('personal_contact','emergency_contact','employment','safety_claims') then raise exception 'PEOPLE_CLASSIFICATION_INVALID';end if;
if coalesce(f->>'mapping','') not in ('','display_name','employer','position','work_email','start_date','end_date','personal_phone','personal_email') then raise exception 'PEOPLE_MAPPING_INVALID';end if;
if coalesce(f->>'mapping','') in ('personal_phone','personal_email') and (rank<>2 or f->>'domain' is distinct from 'personal_contact') then raise exception 'PEOPLE_CLASSIFICATION_INVALID';end if;
if coalesce(f->>'mapping','') not in ('','personal_phone','personal_email') and rank<>1 then raise exception 'PEOPLE_MAPPING_INVALID';end if;
if f->>'type'='training_request' then
if rank<>1 or not exists(select 1 from public.v2_training_types where organisation_id=p_org and id=(f->>'training_type_id')::uuid and is_active) then raise exception 'PEOPLE_RELATIONSHIP_INVALID';end if;end if;
if f ? 'condition' and (jsonb_typeof(f->'condition')<>'object' or not ((f->'condition'->>'field')=any(keys)) or f->'condition'->>'field'=f->>'key' or not (f->'condition' ? 'equals')) then raise exception 'PEOPLE_TEMPLATE_INVALID';end if;
if f->>'type' in ('single_select','multi_select') and (jsonb_typeof(f->'options')<>'array' or jsonb_array_length(f->'options')<1) then raise exception 'PEOPLE_TEMPLATE_INVALID';end if;
end loop;end loop;
end $$;
create or replace function public.tttracker_v2_people_private_domain(p_org uuid,p_person uuid,p_domain text,p_values jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
if p_domain not in ('personal_contact','emergency_contact','employment','safety_claims') then raise exception 'PEOPLE_INVALID_AREA';end if;
perform private.tttracker_v2_require_people_permission(p_org,'people.private.'||p_domain||case when p_values is null then '.view' else '.edit' end);
if not exists(select 1 from public.v2_people where organisation_id=p_org and id=p_person) then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
if p_values is null then
if p_domain='personal_contact' then select jsonb_build_object('email',personal_email,'phone',personal_phone) into result from public.v2_person_private where organisation_id=p_org and person_id=p_person;end if;
if result is null then select values_json into result from public.v2_person_private_domains where organisation_id=p_org and person_id=p_person and domain=p_domain;end if;
else
-- Explicit domain schemas: no arbitrary payroll/bank payload can be inserted here.
if exists(select 1 from jsonb_object_keys(p_values) k where k not in (case p_domain when 'personal_contact' then 'email' when 'emergency_contact' then 'name' when 'employment' then 'notes' else 'notes' end,case p_domain when 'personal_contact' then 'phone' when 'emergency_contact' then 'phone' when 'employment' then 'contact' else 'reference' end)) then raise exception 'PEOPLE_INVALID_FIELDS';end if;
if p_domain='personal_contact' then insert into public.v2_person_private(organisation_id,person_id,personal_email,personal_phone) values(p_org,p_person,p_values->>'email',p_values->>'phone') on conflict(organisation_id,person_id) do update set personal_email=excluded.personal_email,personal_phone=excluded.personal_phone;result:='{}';
else insert into public.v2_person_private_domains values(p_org,p_person,p_domain,p_values) on conflict(organisation_id,person_id,domain) do update set values_json=excluded.values_json;result:='{}';end if;end if;
insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area) values(p_org,p_person,auth.uid(),case when p_values is null then 'domain_read' else 'domain_write' end,'private.'||p_domain);
return coalesce(result,'{}');
end $$;
notify pgrst,'reload schema';
commit;

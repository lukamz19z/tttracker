begin;
create table public.v2_onboarding_templates (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id),name text not null,relationship_type_id uuid,
 status text not null default 'draft' check(status in ('draft','published','archived')),updated_at timestamptz not null default now(),unique(organisation_id,id),
 foreign key(organisation_id,relationship_type_id) references public.v2_person_types(organisation_id,id)
);
create table private.v2_onboarding_versions (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,template_id uuid not null,version integer not null,
 published_at timestamptz,review_policy text not null default 'required' check(review_policy in ('required','none','sections')),
 definition jsonb not null default '{"sections":[]}',unique(organisation_id,id),unique(template_id,version),
 foreign key(organisation_id,template_id) references public.v2_onboarding_templates(organisation_id,id)
);
alter table private.v2_secure_onboarding_instances drop constraint v2_secure_onboarding_instances_status_check;
alter table private.v2_secure_onboarding_instances add constraint v2_secure_onboarding_instances_status_check check(status in ('draft','invited','in_progress','submitted','under_review','changes_required','completed','revoked'));
alter table private.v2_secure_onboarding_instances add column if not exists template_version_id uuid;
alter table private.v2_secure_onboarding_instances add column if not exists recipient_email text;
alter table private.v2_secure_onboarding_instances add column if not exists recipient_name text;
alter table private.v2_secure_onboarding_instances add column if not exists relationship_type_id uuid;
alter table private.v2_secure_onboarding_instances add column if not exists project_id uuid;
alter table private.v2_secure_onboarding_instances add column if not exists submitted_at timestamptz;
alter table private.v2_secure_onboarding_instances add column if not exists completed_at timestamptz;
alter table private.v2_secure_onboarding_instances add column if not exists review_comment text;
alter table private.v2_secure_onboarding_instances add column if not exists sent_at timestamptz;
alter table private.v2_secure_onboarding_instances add column if not exists send_status text not null default 'not_sent';
alter table private.v2_secure_onboarding_instances add foreign key(organisation_id,template_version_id) references private.v2_onboarding_versions(organisation_id,id);
alter table private.v2_secure_onboarding_instances add foreign key(organisation_id,relationship_type_id) references public.v2_person_types(organisation_id,id);
alter table private.v2_secure_onboarding_instances add foreign key(organisation_id,project_id) references public.v2_projects(organisation_id,id);
create table private.v2_onboarding_operational_answers (
 organisation_id uuid not null,instance_id uuid not null,field_key text not null,value_json jsonb not null,
 primary key(instance_id,field_key),foreign key(organisation_id,instance_id) references private.v2_secure_onboarding_instances(organisation_id,id)
);
create table private.v2_onboarding_private_answers (
 organisation_id uuid not null,instance_id uuid not null,field_key text not null,domain text not null,value_json jsonb not null,
 primary key(instance_id,field_key),foreign key(organisation_id,instance_id) references private.v2_secure_onboarding_instances(organisation_id,id)
);
create table private.v2_onboarding_documents (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,instance_id uuid not null,field_key text not null,side text not null check(side in ('single','front','back')),
 name text not null,storage_key text not null,content_type text not null,size_bytes integer not null check(size_bytes between 1 and 10485760),
 provider text not null default 'internal' check(provider='internal'),created_at timestamptz not null default now(),
 foreign key(organisation_id,instance_id) references private.v2_secure_onboarding_instances(organisation_id,id)
);
create table private.v2_onboarding_history (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,instance_id uuid not null,action text not null,
 actor_id uuid,external_session_id uuid,created_at timestamptz not null default now(),comment text,field_key text,
 foreign key(organisation_id,instance_id) references private.v2_secure_onboarding_instances(organisation_id,id)
);
create index v2_onboarding_register_idx on private.v2_secure_onboarding_instances(organisation_id,status,created_at,id);

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
if coalesce(f->>'mapping','') in ('personal_phone','personal_email') and rank<2 then raise exception 'PEOPLE_CLASSIFICATION_INVALID';end if;
if coalesce(f->>'mapping','') not in ('','personal_phone','personal_email') and rank<>1 then raise exception 'PEOPLE_MAPPING_INVALID';end if;
if f->>'type'='training_request' then
if rank<>1 or not exists(select 1 from public.v2_training_types where organisation_id=p_org and id=(f->>'training_type_id')::uuid and is_active) then raise exception 'PEOPLE_RELATIONSHIP_INVALID';end if;end if;
if f ? 'condition' and (jsonb_typeof(f->'condition')<>'object' or not ((f->'condition'->>'field')=any(keys)) or f->'condition'->>'field'=f->>'key' or not (f->'condition' ? 'equals')) then raise exception 'PEOPLE_TEMPLATE_INVALID';end if;
if f->>'type' in ('single_select','multi_select') and (jsonb_typeof(f->'options')<>'array' or jsonb_array_length(f->'options')<1) then raise exception 'PEOPLE_TEMPLATE_INVALID';end if;
end loop;end loop;
end $$;

create or replace function public.tttracker_v2_onboarding_admin(p_org uuid,p_action text,p_id uuid default null,p_data jsonb default '{}',p_page integer default 1,p_query text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare v_id uuid;v_version uuid;v_number integer;rows jsonb;total bigint;inst private.v2_secure_onboarding_instances;ver private.v2_onboarding_versions;f jsonb;section_data jsonb;answers jsonb:='{}';permission text;off integer:=greatest(0,least(p_page,100000)-1)*20;
begin
permission:=case when p_action='template_choices' and private.tttracker_v2_has_permission(p_org,'people.configure') then 'people.configure' when p_action in ('templates','template','save_template','publish','archive','default_template') then 'people.configure' when p_action in ('review','changes','complete','section_review') then 'people.onboarding.review' when p_action in ('list','detail','document') then 'people.onboarding.view' else 'people.onboarding.manage' end;
perform private.tttracker_v2_require_people_permission(p_org,permission);
if p_action='person_prefill' then
select jsonb_build_object('name',p.display_name,'email',coalesce(p.work_email,''),'relationship_type_id',p.relationship_type_id,'template_id',t.settings->>'default_template_id') into answers from public.v2_people p left join public.v2_person_types t on t.organisation_id=p.organisation_id and t.id=p.relationship_type_id where p.organisation_id=p_org and p.id=p_id;
if answers is null then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;return answers;
elsif p_action='template_choices' then
select count(*) into total from public.v2_onboarding_templates where organisation_id=p_org and status='published' and name ilike '%'||p_query||'%';
select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select id,name from public.v2_onboarding_templates where organisation_id=p_org and status='published' and name ilike '%'||p_query||'%' order by name,id limit 20 offset off)x;
return jsonb_build_object('rows',rows,'total',total,'page',p_page);
elsif p_action='templates' then
select count(*) into total from public.v2_onboarding_templates where organisation_id=p_org and name ilike '%'||p_query||'%';
select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select t.id,t.name,t.relationship_type_id,t.status,v.version,v.review_policy,jsonb_array_length(v.definition->'sections') sections,t.updated_at from public.v2_onboarding_templates t join lateral(select * from private.v2_onboarding_versions where organisation_id=p_org and template_id=t.id order by version desc limit 1)v on true where t.organisation_id=p_org and t.name ilike '%'||p_query||'%' order by t.name,t.id limit 20 offset off)x;
return jsonb_build_object('rows',rows,'total',total,'page',p_page);
elsif p_action='template' then
select * into ver from private.v2_onboarding_versions where organisation_id=p_org and template_id=p_id order by version desc limit 1;
if not found then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
return jsonb_build_object('definition',ver.definition,'version',ver.version,'review_policy',ver.review_policy,'published',ver.published_at is not null);
elsif p_action='save_template' then
perform private.tttracker_v2_validate_template(p_org,p_data->'definition',false);
if p_data->>'review_policy'='none' and exists(select 1 from jsonb_array_elements(p_data->'definition'->'sections') s cross join lateral jsonb_array_elements(s->'fields') f where f->>'classification'<>'operational' or f->>'type'='training_request') then raise exception 'PEOPLE_REVIEW_REQUIRED_FOR_SENSITIVE_TEMPLATE';end if;

v_id:=coalesce(p_id,gen_random_uuid());
if p_id is not null and not exists(select 1 from public.v2_onboarding_templates where organisation_id=p_org and id=p_id) then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
perform pg_advisory_xact_lock(hashtextextended(v_id::text,4));
insert into public.v2_onboarding_templates(id,organisation_id,name,relationship_type_id) values(v_id,p_org,p_data->>'name',nullif(p_data->>'relationship_type_id','')::uuid)
on conflict(id) do update set name=excluded.name,relationship_type_id=excluded.relationship_type_id,updated_at=now() where v2_onboarding_templates.organisation_id=p_org;
select * into ver from private.v2_onboarding_versions where organisation_id=p_org and template_id=v_id order by version desc limit 1;
if ver.id is not null and ver.published_at is null then
update private.v2_onboarding_versions set definition=p_data->'definition',review_policy=coalesce(p_data->>'review_policy','required') where organisation_id=p_org and id=ver.id;
else insert into private.v2_onboarding_versions(organisation_id,template_id,version,definition,review_policy) values(p_org,v_id,coalesce(ver.version,0)+1,p_data->'definition',coalesce(p_data->>'review_policy','required'));end if;
elsif p_action='publish' then
perform pg_advisory_xact_lock(hashtextextended(p_id::text,4));
select * into ver from private.v2_onboarding_versions where organisation_id=p_org and template_id=p_id order by version desc limit 1 for update;
if not found then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;
perform private.tttracker_v2_validate_template(p_org,ver.definition,true);
update private.v2_onboarding_versions set published_at=coalesce(published_at,now()) where organisation_id=p_org and id=ver.id;
update public.v2_onboarding_templates set status='published',updated_at=now() where organisation_id=p_org and id=p_id;v_id:=p_id;
elsif p_action='archive' then
update public.v2_onboarding_templates set status='archived' where organisation_id=p_org and id=p_id;if not found then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;v_id:=p_id;
elsif p_action='default_template' then
if not exists(select 1 from public.v2_onboarding_templates where organisation_id=p_org and id=(p_data->>'template_id')::uuid) then raise exception 'PEOPLE_RELATIONSHIP_INVALID';end if;
update public.v2_person_types set settings=settings||jsonb_build_object('default_template_id',p_data->>'template_id') where organisation_id=p_org and id=p_id;if not found then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;v_id:=p_id;
elsif p_action='list' then
with items as(select i.id,i.person_id,coalesce(p.display_name,i.recipient_name,i.recipient_email) name,i.recipient_email,(select name from public.v2_person_types where organisation_id=p_org and id=i.relationship_type_id) relationship,t.name template,v.version,
case when i.expires_at<=now() and i.status not in ('completed','revoked') then 'expired' else i.status end status,i.sent_at,i.submitted_at,i.expires_at,i.completed_at,i.send_status,
(select count(distinct field_key) from (select field_key from private.v2_onboarding_operational_answers where instance_id=i.id union all select field_key from private.v2_onboarding_private_answers where instance_id=i.id union all select field_key from private.v2_onboarding_documents where instance_id=i.id) answered_fields) answered,
(select count(*) from jsonb_array_elements(v.definition->'sections') s cross join lateral jsonb_array_elements(s->'fields') f) requested
from private.v2_secure_onboarding_instances i join private.v2_onboarding_versions v on v.id=i.template_version_id and v.organisation_id=i.organisation_id join public.v2_onboarding_templates t on t.id=v.template_id and t.organisation_id=v.organisation_id left join public.v2_people p on p.id=i.person_id and p.organisation_id=i.organisation_id
where i.organisation_id=p_org and (coalesce(p_data->>'person_id','')='' or i.person_id=(p_data->>'person_id')::uuid) and concat_ws(' ',i.recipient_name,i.recipient_email,p.display_name,t.name) ilike '%'||p_query||'%')
select count(*),(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select * from items where coalesce(p_data->>'status','')='' or status=p_data->>'status' order by expires_at desc,id limit 20 offset off)x) into total,rows from items where coalesce(p_data->>'status','')='' or status=p_data->>'status';
return jsonb_build_object('rows',rows,'total',total,'page',p_page);
elsif p_action='start' then
if nullif(p_data->>'person_id','') is null and exists(select 1 from public.v2_people where organisation_id=p_org and lower(work_email)=lower(p_data->>'email')) then raise exception 'PEOPLE_POSSIBLE_DUPLICATE';end if;
select v.* into ver from private.v2_onboarding_versions v join public.v2_onboarding_templates t on t.id=v.template_id and t.organisation_id=v.organisation_id where v.organisation_id=p_org and v.template_id=(p_data->>'template_id')::uuid and v.published_at is not null and t.status='published' order by version desc limit 1;
if ver.id is null then raise exception 'PEOPLE_TEMPLATE_NOT_PUBLISHED';end if;
if nullif(p_data->>'project_id','') is not null and not exists(select 1 from public.v2_projects where organisation_id=p_org and id=(p_data->>'project_id')::uuid and private.tttracker_v2_is_project_member(id)) then raise exception 'PEOPLE_RELATIONSHIP_INVALID';end if;
if (p_data->>'expires_at')::timestamptz not between now()+interval '1 hour' and now()+interval '90 days' or (p_data->>'token_hash') !~ '^[a-f0-9]{64}$' or coalesce(p_data->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'PEOPLE_INVALID_FIELDS';end if;
insert into private.v2_secure_onboarding_instances(organisation_id,person_id,status,expires_at,created_by,template_version_id,recipient_email,recipient_name,relationship_type_id,project_id)
values(p_org,nullif(p_data->>'person_id','')::uuid,'draft',(p_data->>'expires_at')::timestamptz,auth.uid(),ver.id,p_data->>'email',nullif(p_data->>'name',''),nullif(p_data->>'relationship_type_id','')::uuid,nullif(p_data->>'project_id','')::uuid) returning id into v_id;
insert into private.v2_secure_tokens(organisation_id,instance_id,token_hash,expires_at) values(p_org,v_id,p_data->>'token_hash',(p_data->>'expires_at')::timestamptz);
return jsonb_build_object('id',v_id,'email',p_data->>'email','title',(select name from public.v2_onboarding_templates where organisation_id=p_org and id=ver.template_id));
else
select * into inst from private.v2_secure_onboarding_instances where organisation_id=p_org and id=p_id for update;
if not found then raise exception 'PEOPLE_RECORD_NOT_FOUND';end if;v_id:=p_id;
select * into ver from private.v2_onboarding_versions where organisation_id=p_org and id=inst.template_version_id;
if p_action='document' then
select x into f from jsonb_array_elements(ver.definition->'sections') s cross join lateral jsonb_array_elements(s->'fields') x where x->>'key'=p_data->>'field';
if f is null or f->>'classification'='confidential' then raise exception 'PEOPLE_PERMISSION_DENIED';end if;
if f->>'classification'='private' then perform private.tttracker_v2_require_people_permission(p_org,'people.private.'||(f->>'domain')||'.view');end if;
select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'side',side,'storage_key',storage_key)),'[]') into rows from private.v2_onboarding_documents where organisation_id=p_org and instance_id=p_id and field_key=p_data->>'field';
insert into private.v2_onboarding_history(organisation_id,instance_id,actor_id,action,field_key) values(p_org,p_id,auth.uid(),'document_read',p_data->>'field');
return jsonb_build_object('rows',rows);
elsif p_action in ('detail','review') then
select coalesce(jsonb_object_agg(field_key,value_json),'{}') into answers from private.v2_onboarding_operational_answers where organisation_id=p_org and instance_id=p_id;
for f in select f from jsonb_array_elements(ver.definition->'sections') s cross join lateral jsonb_array_elements(s->'fields') f where f->>'classification'='private' loop
if private.tttracker_v2_has_permission(p_org,'people.private.'||(f->>'domain')||'.view') then
answers:=answers||coalesce((select jsonb_build_object(field_key,value_json) from private.v2_onboarding_private_answers where organisation_id=p_org and instance_id=p_id and field_key=f->>'key'),'{}');
insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area,target_id) values(p_org,inst.person_id,auth.uid(),'onboarding_answer_read','private.'||(f->>'domain'),p_id);
end if;end loop;
return jsonb_build_object('definition',ver.definition,'answers',answers,'review_comment',inst.review_comment,'status',inst.status,'review_policy',ver.review_policy,'person_id',inst.person_id,'history',(select coalesce(jsonb_agg(jsonb_build_object('action',action,'created_at',created_at,'comment',comment,'field_key',field_key) order by created_at),'[]') from private.v2_onboarding_history where organisation_id=p_org and instance_id=p_id));
elsif p_action='sent' then update private.v2_secure_onboarding_instances set status=case when status='draft' then 'invited' else status end,sent_at=now(),send_status='sent' where organisation_id=p_org and id=p_id;
elsif p_action='send_failed' then update private.v2_secure_onboarding_instances set send_status='failed' where organisation_id=p_org and id=p_id;
elsif p_action='resend' then
if inst.sent_at>now()-interval '30 seconds' then raise exception 'PEOPLE_RATE_LIMITED';end if;
if inst.status in ('completed','revoked') or inst.expires_at<=now() then raise exception 'PEOPLE_INVALID_TRANSITION';end if;
update private.v2_secure_tokens set revoked_at=now() where organisation_id=p_org and instance_id=p_id and revoked_at is null;
insert into private.v2_secure_tokens(organisation_id,instance_id,token_hash,expires_at) values(p_org,p_id,p_data->>'token_hash',inst.expires_at);
return jsonb_build_object('id',p_id,'email',inst.recipient_email,'title',(select name from public.v2_onboarding_templates where organisation_id=p_org and id=ver.template_id));
elsif p_action='revoke' then
update private.v2_secure_onboarding_instances set status='revoked' where organisation_id=p_org and id=p_id;
update private.v2_secure_tokens set revoked_at=now() where organisation_id=p_org and instance_id=p_id and revoked_at is null;
update private.v2_secure_sessions set revoked_at=now() where organisation_id=p_org and instance_id=p_id and revoked_at is null;
elsif p_action='section_review' then
if inst.status not in ('submitted','under_review') or ver.review_policy<>'sections' then raise exception 'PEOPLE_INVALID_TRANSITION';end if;
section_data:=ver.definition->'sections'->((p_data->>'section')::integer);
if section_data is null then raise exception 'PEOPLE_INVALID_FIELDS';end if;
for f in select * from jsonb_array_elements(section_data->'fields') loop
if f->>'classification'='private' then perform private.tttracker_v2_require_people_permission(p_org,'people.private.'||(f->>'domain')||'.view');end if;
if f->>'type'='training_request' then perform private.tttracker_v2_require_people_permission(p_org,'training.approve');end if;
end loop;
update private.v2_secure_onboarding_instances set status='under_review' where organisation_id=p_org and id=p_id;
insert into private.v2_onboarding_history(organisation_id,instance_id,action,actor_id,field_key) values(p_org,p_id,'section_approved',auth.uid(),p_data->>'section');
elsif p_action in ('changes','complete') then
if inst.status not in ('submitted','under_review') then raise exception 'PEOPLE_INVALID_TRANSITION';end if;
-- Whole-instance decisions require every private domain plus training review where requested.
for f in select f from jsonb_array_elements(ver.definition->'sections') s cross join lateral jsonb_array_elements(s->'fields') f loop
if f->>'classification'='private' then perform private.tttracker_v2_require_people_permission(p_org,'people.private.'||(f->>'domain')||'.view');end if;
if f->>'type'='training_request' then perform private.tttracker_v2_require_people_permission(p_org,'training.approve');end if;
end loop;
if p_action='changes' then
if nullif(btrim(p_data->>'comment'),'') is null then raise exception 'PEOPLE_REVIEW_COMMENT_REQUIRED';end if;
update private.v2_secure_onboarding_instances set status='changes_required',review_comment=p_data->>'comment' where organisation_id=p_org and id=p_id;
else
if ver.review_policy='sections' and exists(select 1 from jsonb_array_elements(ver.definition->'sections') with ordinality s(section,n) where not exists(select 1 from private.v2_onboarding_history h where h.organisation_id=p_org and h.instance_id=p_id and h.action='section_approved' and h.field_key=(s.n-1)::text and h.created_at>=inst.submitted_at)) then raise exception 'PEOPLE_SECTIONS_REVIEW_REQUIRED';end if;
perform private.tttracker_v2_onboarding_complete(p_org,p_id,auth.uid());end if;
else raise exception 'PEOPLE_INVALID_ACTION';end if;
insert into private.v2_onboarding_history(organisation_id,instance_id,action,actor_id,comment,field_key) values(p_org,p_id,p_action,auth.uid(),case when p_action='changes' then p_data->>'comment' end,nullif(p_data->>'field_key',''));
end if;
insert into public.v2_people_audit(organisation_id,actor_id,action,data_area,target_id) values(p_org,auth.uid(),'onboarding_'||p_action,'operational',v_id);
return jsonb_build_object('id',v_id);
exception when foreign_key_violation then raise exception 'PEOPLE_RELATIONSHIP_INVALID';when check_violation or invalid_text_representation or not_null_violation then raise exception 'PEOPLE_INVALID_FIELDS';
end $$;

create or replace function private.tttracker_v2_onboarding_complete(p_org uuid,p_id uuid,p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare i private.v2_secure_onboarding_instances;v private.v2_onboarding_versions;f jsonb;a jsonb;pid uuid;k public.v2_training_types;tid uuid;grp uuid;expiry date;issue date;
begin
select * into i from private.v2_secure_onboarding_instances where organisation_id=p_org and id=p_id for update;
if i.status='completed' then return;end if;
select * into v from private.v2_onboarding_versions where organisation_id=p_org and id=i.template_version_id;
pid:=i.person_id;
if pid is null then
insert into public.v2_people(organisation_id,display_name,employment_status,relationship_type_id) values(p_org,coalesce(i.recipient_name,i.recipient_email),'active',i.relationship_type_id) returning id into pid;
end if;
for f in select f from jsonb_array_elements(v.definition->'sections') s cross join lateral jsonb_array_elements(s->'fields') f loop
if f->>'classification'='confidential' then raise exception 'PEOPLE_CONFIDENTIAL_COLLECTION_DISABLED';end if;
if f->>'classification'='private' then
select value_json into a from private.v2_onboarding_private_answers where organisation_id=p_org and instance_id=p_id and field_key=f->>'key';
-- Mapping private values requires explicit permission, even at completion.
if nullif(f->>'mapping','') is not null then
if not private.tttracker_v2_has_permission(p_org,'people.private.'||(f->>'domain')||'.edit') then raise exception 'PEOPLE_PERMISSION_DENIED';end if;
insert into public.v2_person_private(organisation_id,person_id,personal_email,personal_phone) values(p_org,pid,case when f->>'mapping'='personal_email' then a#>>'{}' end,case when f->>'mapping'='personal_phone' then a#>>'{}' end)
on conflict(organisation_id,person_id) do update set personal_email=coalesce(excluded.personal_email,v2_person_private.personal_email),personal_phone=coalesce(excluded.personal_phone,v2_person_private.personal_phone);
end if;
else
select value_json into a from private.v2_onboarding_operational_answers where organisation_id=p_org and instance_id=p_id and field_key=f->>'key';
if a is not null and nullif(f->>'mapping','') is not null then
update public.v2_people set display_name=case when f->>'mapping'='display_name' then a#>>'{}' else display_name end,
employer=case when f->>'mapping'='employer' then a#>>'{}' else employer end,position=case when f->>'mapping'='position' then a#>>'{}' else position end,
work_email=case when f->>'mapping'='work_email' then a#>>'{}' else work_email end,start_date=case when f->>'mapping'='start_date' then (a#>>'{}')::date else start_date end,end_date=case when f->>'mapping'='end_date' then (a#>>'{}')::date else end_date end where organisation_id=p_org and id=pid;
end if;
if f->>'type'='training_request' and a is not null then
grp:=gen_random_uuid();
for k in select k.* from public.v2_training_types k where k.organisation_id=p_org and k.is_active and (k.id=(f->>'training_type_id')::uuid or exists(select 1 from public.v2_training_linked_types l where l.organisation_id=p_org and l.training_type_id=(f->>'training_type_id')::uuid and l.linked_type_id=k.id and (a->'linked_type_ids') ? k.id::text)) loop
issue:=nullif(a->>'issue_date','')::date;
if k.requires_issue_date and issue is null then raise exception 'TRAINING_ISSUE_DATE_REQUIRED';end if;
if k.requires_certificate_number and nullif(a->>'certificate_number','') is null then raise exception 'TRAINING_CERTIFICATE_REQUIRED';end if;
expiry:=case k.validity_mode when 'never' then null when 'automatic' then (issue+make_interval(months=>k.validity_months))::date else nullif(a->>'expiry_date','')::date end;
if k.validity_mode<>'never' and expiry is null then raise exception 'TRAINING_EXPIRY_REQUIRED';end if;
insert into public.v2_training_records(organisation_id,person_id,training_type_id,evidence_group_id,issue_date,expiry_date,certificate_number,created_by,source_channel,submitted_at)
values(p_org,pid,k.id,grp,issue,expiry,nullif(a->>'certificate_number',''),p_actor,'external_onboarding',i.submitted_at) returning id into tid;
end loop;
insert into public.v2_people_documents(organisation_id,person_id,evidence_group_id,name,side,storage_key,content_type,size_bytes,created_by)
select p_org,pid,grp,name,side,storage_key,content_type,size_bytes,p_actor from private.v2_onboarding_documents where organisation_id=p_org and instance_id=p_id and field_key=f->>'key';
-- Canonical training review remains separate; only configured no-review types auto-confirm.
for tid in select r.id from public.v2_training_records r join public.v2_training_types k on k.id=r.training_type_id and k.organisation_id=r.organisation_id where r.organisation_id=p_org and r.evidence_group_id=grp and k.review_policy='none' loop
perform private.tttracker_v2_confirm_training(p_org,tid);end loop;
end if;end if;end loop;
update private.v2_secure_onboarding_instances set person_id=pid,status='completed',completed_at=now() where organisation_id=p_org and id=p_id;
insert into public.v2_people_audit(organisation_id,person_id,actor_id,action,data_area,target_id) values(p_org,pid,p_actor,'onboarding_mapping_applied','operational',p_id);
end $$;

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
(select coalesce(jsonb_object_agg(k.id::text,to_jsonb(k)||jsonb_build_object('linked_types',(select coalesce(jsonb_agg(jsonb_build_object('id',z.id,'name',z.name)),'[]') from public.v2_training_linked_types l join public.v2_training_types z on z.id=l.linked_type_id and z.organisation_id=l.organisation_id where l.organisation_id=i.organisation_id and l.training_type_id=k.id))),'{}') from public.v2_training_types k where k.organisation_id=i.organisation_id and exists(select 1 from jsonb_array_elements(v.definition->'sections') s cross join lateral jsonb_array_elements(s->'fields') f where f->>'type'='training_request' and f->>'training_type_id'=k.id::text)));
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
if exists(select 1 from public.v2_training_types k where k.organisation_id=i.organisation_id and k.id=(f->>'training_type_id')::uuid and ((k.requires_issue_date and nullif(a->>'issue_date','') is null) or (k.requires_certificate_number and nullif(a->>'certificate_number','') is null) or (k.validity_mode='manual' and nullif(a->>'expiry_date','') is null) or (k.document_requirement='single' and not exists(select 1 from private.v2_onboarding_documents d where d.organisation_id=i.organisation_id and d.instance_id=i.id and d.field_key=f->>'key' and d.side='single')) or (k.document_requirement='front_back' and (select count(distinct d.side) from private.v2_onboarding_documents d where d.organisation_id=i.organisation_id and d.instance_id=i.id and d.field_key=f->>'key' and d.side in ('front','back'))<2) or (k.document_requirement='single_or_front_back' and not exists(select 1 from private.v2_onboarding_documents d where d.organisation_id=i.organisation_id and d.instance_id=i.id and d.field_key=f->>'key' and d.side='single') and (select count(distinct d.side) from private.v2_onboarding_documents d where d.organisation_id=i.organisation_id and d.instance_id=i.id and d.field_key=f->>'key' and d.side in ('front','back'))<2))) then issues:=issues||jsonb_build_array(jsonb_build_object('field',f->>'key','label',f->>'label'));end if;end if;
end loop;
if jsonb_array_length(issues)>0 then return jsonb_build_object('issues',issues);end if;
update private.v2_secure_onboarding_instances set status='submitted',submitted_at=now() where organisation_id=i.organisation_id and id=i.id;
-- Auto-completion is restricted to operational, non-training templates. Private/training reviews remain deliberate.
if v.review_policy='none' and not exists(select 1 from jsonb_array_elements(v.definition->'sections') s cross join lateral jsonb_array_elements(s->'fields') f where f->>'classification'<>'operational' or f->>'type'='training_request') then perform private.tttracker_v2_onboarding_complete(i.organisation_id,i.id,i.created_by);end if;
else raise exception 'ONBOARDING_INVALID_REQUEST';end if;
insert into private.v2_onboarding_history(organisation_id,instance_id,action,external_session_id,field_key) values(i.organisation_id,i.id,p_action,sess.id,p_field);
return jsonb_build_object('saved',true);
end $$;

alter table public.v2_onboarding_templates enable row level security;
revoke all on public.v2_onboarding_templates from public,anon,authenticated;
do $$ declare t text;begin foreach t in array array['v2_onboarding_versions','v2_onboarding_operational_answers','v2_onboarding_private_answers','v2_onboarding_documents','v2_onboarding_history'] loop
execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);end loop;end $$;
revoke all on function private.tttracker_v2_validate_template(uuid,jsonb,boolean),private.tttracker_v2_onboarding_complete(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.tttracker_v2_onboarding_admin(uuid,text,uuid,jsonb,integer,text) from public,anon;
grant execute on function public.tttracker_v2_onboarding_admin(uuid,text,uuid,jsonb,integer,text) to authenticated;
revoke all on function public.tttracker_v2_onboarding_external(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.tttracker_v2_onboarding_external(text,text,text,jsonb) to service_role;
create or replace function public.tttracker_v2_onboarding_exchange(p_token_hash text,p_session_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.v2_secure_tokens;i private.v2_secure_onboarding_instances;expiry timestamptz;sid uuid;
begin
 select * into t from private.v2_secure_tokens where token_hash=p_token_hash for update;
 if not found or t.revoked_at is not null or t.exchanged_at is not null or t.expires_at<=now() then raise exception 'ONBOARDING_LINK_INVALID'; end if;
 select * into i from private.v2_secure_onboarding_instances where id=t.instance_id and organisation_id=t.organisation_id for update;
 if i.status not in ('invited','in_progress','changes_required') or i.expires_at<=now() then raise exception 'ONBOARDING_LINK_INVALID'; end if;
 expiry:=least(i.expires_at,t.expires_at,now()+interval '30 minutes');
 update private.v2_secure_tokens set exchanged_at=now() where id=t.id and exchanged_at is null;
 insert into private.v2_secure_sessions(organisation_id,instance_id,session_hash,expires_at) values(t.organisation_id,t.instance_id,p_session_hash,expiry) returning id into sid;
 update private.v2_secure_onboarding_instances set status='in_progress' where id=i.id and organisation_id=i.organisation_id and status='invited';
 insert into private.v2_confidential_audit(organisation_id,instance_id,external_session_id,action,purpose) values(i.organisation_id,i.id,sid,'EXTERNAL_SESSION_CREATED','onboarding_review');
 return jsonb_build_object('instance_id',i.id,'expires_at',expiry);
end $$;
notify pgrst,'reload schema';
commit;

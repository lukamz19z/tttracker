-- External KMS envelope metadata only. PostgreSQL never obtains plaintext keys.
begin;
do $$ begin
 if exists(select 1 from private.v2_confidential_versions) then raise exception 'CONFIDENTIAL_LEGACY_DATA_REVIEW_REQUIRED';end if;
end $$;
alter table private.v2_confidential_keys alter column vault_secret_id drop not null;
alter table private.v2_confidential_keys add column if not exists key_provider text not null default 'vault';
alter table private.v2_confidential_keys add column if not exists kms_key_reference text;
alter table private.v2_confidential_keys add column if not exists environment text;
alter table private.v2_confidential_keys add constraint v2_confidential_key_provider_check check(
 (key_provider='vault' and vault_secret_id is not null and kms_key_reference is null) or
 (key_provider='aws_kms' and vault_secret_id is null and kms_key_reference is not null and environment is not null and kms_key_reference ~ '^arn:aws:kms:[a-z0-9-]+:[0-9]{12}:key/[a-f0-9-]{36}$' and environment in ('development','preview','production')));
alter table private.v2_confidential_versions add column if not exists encrypted_dek text;
alter table private.v2_confidential_versions add column if not exists kms_key_reference text;
alter table private.v2_confidential_versions add column if not exists crypto_format_version integer not null default 1;
alter table private.v2_confidential_versions add column if not exists environment text;
alter table private.v2_confidential_versions add constraint v2_confidential_envelope_check check(
 crypto_format_version=2 and encrypted_dek is not null and length(encrypted_dek) between 44 and 8192
 and encrypted_dek ~ '^[A-Za-z0-9+/]+={0,2}$' and kms_key_reference is not null and environment is not null and environment in ('development','preview','production'));
create or replace function public.tttracker_v2_secure_configuration(p_org uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_version integer; v_secret uuid;v_person uuid;v_expiry timestamptz;v_field uuid;
begin
 if p_action='rotate_key' then raise exception 'CONFIDENTIAL_KEY_BOUNDARY_UNAVAILABLE';end if;
 if p_action in ('key_authority','rotate_kms_generation') then
 perform private.tttracker_v2_require_people_permission(p_org,'people.confidential.manage_keys');
 if p_action='key_authority' then return '{}'::jsonb;end if;
 if p_data->>'kms_key_reference' is null or p_data->>'kms_key_reference' !~ '^arn:aws:kms:[a-z0-9-]+:[0-9]{12}:key/[a-f0-9-]{36}$'
 or p_data->>'environment' is null or p_data->>'environment' not in ('development','preview','production') then raise exception 'CONFIDENTIAL_PAYLOAD_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('confidential-key:'||p_org::text,0));
 select coalesce(max(version),0)+1 into v_version from private.v2_confidential_keys where organisation_id=p_org;
 update private.v2_confidential_keys set is_active=false where organisation_id=p_org and is_active;
 insert into private.v2_confidential_keys(organisation_id,version,key_provider,kms_key_reference,environment,is_active)
 values(p_org,v_version,'aws_kms',p_data->>'kms_key_reference',p_data->>'environment',true);
 insert into private.v2_confidential_audit(organisation_id,actor_id,action,purpose) values(p_org,auth.uid(),'ENVELOPE_GENERATION_CREATED','key_rotation');
 return jsonb_build_object('version',v_version);
 end if;
 perform private.tttracker_v2_require_people_permission(p_org,'people.onboarding.manage');
 if p_action='field' then
 if not exists(select 1 from public.v2_people_field_types where type_key=p_data->>'semantic_type')
 or p_data->>'classification' is distinct from 'confidential' then raise exception 'CONFIDENTIAL_FIELD_INVALID'; end if;
 insert into private.v2_secure_fields(organisation_id,semantic_type,label,kind) values(p_org,p_data->>'semantic_type',p_data->>'label',p_data->>'kind') returning id into v_id;
 elsif p_action='instance' then
 v_person:=nullif(p_data->>'person_id','')::uuid;v_expiry:=(p_data->>'expires_at')::timestamptz;
 if v_expiry<=now() or v_expiry>now()+interval '30 days' or p_data->>'token_hash' !~ '^[a-f0-9]{64}$' then raise exception 'ONBOARDING_INVALID_REQUEST'; end if;
 if v_person is not null and not exists(select 1 from public.v2_people where organisation_id=p_org and id=v_person) then raise exception 'CONFIDENTIAL_ACCESS_DENIED'; end if;
 insert into private.v2_secure_onboarding_instances(organisation_id,person_id,expires_at,created_by) values(p_org,v_person,v_expiry,auth.uid()) returning id into v_id;
 for v_field in select value::text::uuid from jsonb_array_elements_text(p_data->'field_ids') loop
 if not exists(select 1 from private.v2_secure_fields where organisation_id=p_org and id=v_field and is_active) then raise exception 'CONFIDENTIAL_FIELD_INVALID'; end if;
 insert into private.v2_secure_instance_fields values(p_org,v_id,v_field);
 end loop;
 if not exists(select 1 from private.v2_secure_instance_fields where instance_id=v_id) then raise exception 'ONBOARDING_INVALID_REQUEST'; end if;
 insert into private.v2_secure_tokens(organisation_id,instance_id,token_hash,expires_at) values(p_org,v_id,p_data->>'token_hash',v_expiry);
 elsif p_action='revoke' then
 v_id:=(p_data->>'instance_id')::uuid;
 update private.v2_secure_onboarding_instances set status='revoked' where organisation_id=p_org and id=v_id;
 if not found then raise exception 'CONFIDENTIAL_ACCESS_DENIED'; end if;
 update private.v2_secure_tokens set revoked_at=now() where organisation_id=p_org and instance_id=v_id and revoked_at is null;
 update private.v2_secure_sessions set revoked_at=now() where organisation_id=p_org and instance_id=v_id and revoked_at is null;
 else raise exception 'ONBOARDING_INVALID_REQUEST'; end if;
 insert into private.v2_confidential_audit(organisation_id,instance_id,field_id,actor_id,action,purpose)
 values(p_org,case when p_action<>'field' then v_id end,case when p_action='field' then v_id end,auth.uid(),upper(p_action),'onboarding_review');
 return jsonb_build_object('id',v_id);
end $$;
create or replace function public.tttracker_v2_confidential_ticket(p_org uuid,p_action text,p_ticket_hash text,p_record uuid,p_person uuid,p_instance uuid,p_field uuid,p_purpose text,p_expected_revision integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_version integer;v_revision integer;v_session text;
begin
 if p_action not in ('read','write') then raise exception 'CONFIDENTIAL_ACCESS_DENIED'; end if;
 perform private.tttracker_v2_require_people_permission(p_org,'people.confidential.'||case when p_action='read' then 'view' else 'edit' end);
 v_session:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id',nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sid');
 perform private.tttracker_v2_secure_actor(p_org,auth.uid(),v_session,'people.confidential.'||case when p_action='read' then 'view' else 'edit' end);
 if p_person is null and p_instance is null then raise exception 'CONFIDENTIAL_ACCESS_DENIED'; end if;
 if p_person is not null and not exists(select 1 from public.v2_people where organisation_id=p_org and id=p_person) then raise exception 'CONFIDENTIAL_ACCESS_DENIED'; end if;
 if p_instance is not null and not exists(select 1 from private.v2_secure_onboarding_instances where organisation_id=p_org and id=p_instance and person_id is not distinct from p_person) then raise exception 'CONFIDENTIAL_ACCESS_DENIED'; end if;
 if p_instance is not null and not exists(select 1 from private.v2_secure_instance_fields where organisation_id=p_org and instance_id=p_instance and field_id=p_field) then raise exception 'CONFIDENTIAL_FIELD_INVALID';end if;
 if not exists(select 1 from private.v2_secure_fields where organisation_id=p_org and id=p_field and is_active and classification='confidential') then raise exception 'CONFIDENTIAL_FIELD_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('confidential-record:'||p_record::text,0));
 select revision into v_revision from private.v2_confidential_records where id=p_record and organisation_id=p_org and person_id is not distinct from p_person and instance_id is not distinct from p_instance and field_id=p_field;
 if v_revision is null then
 if p_action='read' or exists(select 1 from private.v2_confidential_records where id=p_record) then raise exception 'CONFIDENTIAL_ACCESS_DENIED'; end if;
 insert into private.v2_confidential_records(id,organisation_id,person_id,instance_id,field_id) values(p_record,p_org,p_person,p_instance,p_field);v_revision:=0;
 end if;
 if p_action='read' then select key_version into v_version from private.v2_confidential_versions where record_id=p_record and revision=v_revision and organisation_id=p_org;
 else select version into v_version from private.v2_confidential_keys where organisation_id=p_org and is_active and key_provider='aws_kms';v_revision:=v_revision+1;end if;
 if p_expected_revision is not null and p_action='write' and v_revision-1<>p_expected_revision then raise exception 'CONFIDENTIAL_CONCURRENT_UPDATE';end if;
 if v_version is null then raise exception 'CONFIDENTIAL_KEY_UNAVAILABLE'; end if;
 insert into private.v2_confidential_tickets(ticket_hash,organisation_id,person_id,instance_id,field_id,record_id,revision,key_version,actor_id,auth_session_id,action,purpose)
 values(p_ticket_hash,p_org,p_person,p_instance,p_field,p_record,v_revision,v_version,auth.uid(),v_session,p_action,p_purpose);
 return jsonb_build_object('record_id',p_record);
end $$;
create or replace function public.tttracker_v2_external_confidential_ticket(p_session_hash text,p_instance uuid,p_field uuid,p_record uuid,p_ticket_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.v2_secure_sessions;i private.v2_secure_onboarding_instances;v_revision integer;v_key integer;
begin
 select * into s from private.v2_secure_sessions where session_hash=p_session_hash;
 perform private.tttracker_v2_secure_external(s.id,s.organisation_id,p_instance,p_field);
 select * into i from private.v2_secure_onboarding_instances where id=p_instance and organisation_id=s.organisation_id;
 perform pg_advisory_xact_lock(hashtextextended('confidential-record:'||p_record::text,0));
 select revision into v_revision from private.v2_confidential_records where id=p_record and organisation_id=s.organisation_id and instance_id=p_instance and field_id=p_field and person_id is not distinct from i.person_id;
 if v_revision is null then
 if exists(select 1 from private.v2_confidential_records where id=p_record) then raise exception 'ONBOARDING_SESSION_INVALID'; end if;
 insert into private.v2_confidential_records(id,organisation_id,person_id,instance_id,field_id) values(p_record,s.organisation_id,i.person_id,p_instance,p_field);v_revision:=0;
 end if;
 select version into v_key from private.v2_confidential_keys where organisation_id=s.organisation_id and is_active and key_provider='aws_kms';
 if v_key is null then raise exception 'CONFIDENTIAL_KEY_UNAVAILABLE'; end if;
 insert into private.v2_confidential_tickets(ticket_hash,organisation_id,person_id,instance_id,field_id,record_id,revision,key_version,external_session_id,action,purpose)
 values(p_ticket_hash,s.organisation_id,i.person_id,p_instance,p_field,p_record,v_revision+1,v_key,s.id,'write','onboarding_review');
 return jsonb_build_object('record_id',p_record);
end $$;
create or replace function public.tttracker_v2_confidential_redeem(p_ticket_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.v2_confidential_tickets; f private.v2_secure_fields;v private.v2_confidential_versions;k private.v2_confidential_keys;
begin
 select * into t from private.v2_confidential_tickets where ticket_hash=p_ticket_hash for update;
 if not found or t.state<>'issued' or t.expires_at<=now() then raise exception 'CONFIDENTIAL_ACCESS_DENIED'; end if;
 if t.actor_id is not null then perform private.tttracker_v2_secure_actor(t.organisation_id,t.actor_id,t.auth_session_id,'people.confidential.'||case when t.action='read' then 'view' else 'edit' end);
 else perform private.tttracker_v2_secure_external(t.external_session_id,t.organisation_id,t.instance_id,t.field_id);end if;
 select * into f from private.v2_secure_fields where id=t.field_id and organisation_id=t.organisation_id and is_active and classification='confidential';
 if not found then raise exception 'CONFIDENTIAL_FIELD_INVALID'; end if;
 select * into k from private.v2_confidential_keys where organisation_id=t.organisation_id and version=t.key_version;
 if not found or k.key_provider<>'aws_kms' or k.kms_key_reference is null then raise exception 'CONFIDENTIAL_KEY_BOUNDARY_UNAVAILABLE';end if;
 if t.action='read' then select * into v from private.v2_confidential_versions where organisation_id=t.organisation_id and record_id=t.record_id and revision=t.revision; if not found then raise exception 'CONFIDENTIAL_ACCESS_DENIED';end if;end if;
 update private.v2_confidential_tickets set state='redeemed' where ticket_hash=p_ticket_hash and state='issued';
 insert into private.v2_confidential_audit(organisation_id,person_id,instance_id,field_id,record_id,actor_id,external_session_id,action,purpose)
 values(t.organisation_id,t.person_id,t.instance_id,t.field_id,t.record_id,t.actor_id,t.external_session_id,case when t.action='read' then case when f.kind='document' then 'CONFIDENTIAL_DOCUMENT_READ' else 'CONFIDENTIAL_READ' end else 'CONFIDENTIAL_WRITE_STARTED' end,t.purpose);
 return jsonb_build_object('context',jsonb_build_object('organisation_id',t.organisation_id,'person_id',t.person_id,'instance_id',t.instance_id,'field_id',t.field_id,'record_id',t.record_id,'revision',t.revision,'key_version',t.key_version,'semantic_type',f.semantic_type,'kind',f.kind,'kms_key_reference',k.kms_key_reference,'environment',k.environment,'crypto_format_version',2),
 'payload',case when t.action='read' then jsonb_build_object('ciphertext',v.ciphertext,'nonce',v.nonce,'tag',v.tag,'object_key',v.object_key,'provider',v.provider,'encrypted_dek',v.encrypted_dek,'kms_key_reference',v.kms_key_reference,'environment',v.environment,'crypto_format_version',v.crypto_format_version) end);
end $$;
create or replace function public.tttracker_v2_confidential_commit(p_ticket_hash text,p_nonce text,p_tag text,p_ciphertext text default null,p_object_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $$begin raise exception 'CONFIDENTIAL_ENVELOPE_REQUIRED';end $$;
create or replace function public.tttracker_v2_confidential_commit_envelope(p_ticket_hash text,p_nonce text,p_tag text,p_ciphertext text,p_object_key text,p_encrypted_dek text,p_kms_key_reference text,p_environment text,p_crypto_format_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.v2_confidential_tickets;f private.v2_secure_fields;r private.v2_confidential_records;k private.v2_confidential_keys;
begin
 select * into t from private.v2_confidential_tickets where ticket_hash=p_ticket_hash for update;
 if not found or t.action<>'write' or t.state<>'redeemed' or t.expires_at<=now() then raise exception 'CONFIDENTIAL_ACCESS_DENIED'; end if;
 if t.actor_id is not null then perform private.tttracker_v2_secure_actor(t.organisation_id,t.actor_id,t.auth_session_id,'people.confidential.edit');
 else perform private.tttracker_v2_secure_external(t.external_session_id,t.organisation_id,t.instance_id,t.field_id);end if;
 select * into r from private.v2_confidential_records where organisation_id=t.organisation_id and id=t.record_id for update;
 if r.revision<>t.revision-1 then raise exception 'CONFIDENTIAL_CONCURRENT_UPDATE';end if;
 select * into f from private.v2_secure_fields where organisation_id=t.organisation_id and id=t.field_id and is_active;
 if not found then raise exception 'CONFIDENTIAL_FIELD_INVALID';end if;
 select * into k from private.v2_confidential_keys where organisation_id=t.organisation_id and version=t.key_version;
 if not found or k.key_provider<>'aws_kms' or p_kms_key_reference is distinct from k.kms_key_reference or p_environment is distinct from k.environment
 or p_crypto_format_version is distinct from 2 or p_encrypted_dek is null or length(p_encrypted_dek) not between 44 and 8192 or p_encrypted_dek !~ '^[A-Za-z0-9+/]+={0,2}$'
 then raise exception 'CONFIDENTIAL_ENVELOPE_REQUIRED';end if;
 if p_nonce !~ '^[A-Za-z0-9+/]{16}$' or p_tag !~ '^[A-Za-z0-9+/]{22}==$' then raise exception 'CONFIDENTIAL_PAYLOAD_INVALID';end if;
 if f.kind='value' and (p_ciphertext is null or p_object_key is not null or p_ciphertext !~ '^[A-Za-z0-9+/]*={0,2}$') then raise exception 'CONFIDENTIAL_PAYLOAD_INVALID'; end if;
 if f.kind='document' and (p_ciphertext is not null or p_object_key is distinct from t.organisation_id::text||'/'||t.record_id::text||'/'||t.revision::text||'/'||t.ticket_hash||'.bin'
 or not exists(select 1 from storage.objects where bucket_id='v2-people-confidential' and name=p_object_key)) then raise exception 'CONFIDENTIAL_PAYLOAD_INVALID';end if;
 insert into private.v2_confidential_versions(organisation_id,record_id,revision,key_version,nonce,tag,ciphertext,object_key,created_by,external_session_id,encrypted_dek,kms_key_reference,environment,crypto_format_version)
 values(t.organisation_id,t.record_id,t.revision,t.key_version,p_nonce,p_tag,p_ciphertext,p_object_key,t.actor_id,t.external_session_id,p_encrypted_dek,p_kms_key_reference,p_environment,p_crypto_format_version);
 update private.v2_confidential_records set revision=t.revision where id=t.record_id and organisation_id=t.organisation_id and revision=t.revision-1;
 update private.v2_confidential_tickets set state='committed' where ticket_hash=p_ticket_hash and state='redeemed';
 insert into private.v2_confidential_audit(organisation_id,person_id,instance_id,field_id,record_id,actor_id,external_session_id,action,purpose)
 values(t.organisation_id,t.person_id,t.instance_id,t.field_id,t.record_id,t.actor_id,t.external_session_id,case when f.kind='document' then 'CONFIDENTIAL_DOCUMENT_WRITE' else 'CONFIDENTIAL_WRITE' end,t.purpose);
 return jsonb_build_object('record_id',t.record_id,'revision',t.revision,'key_version',t.key_version);
end $$;
create or replace function public.tttracker_v2_confidential_schema()
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('crypto_format_version',2,'legacy_versions',(select count(*) from private.v2_confidential_versions where crypto_format_version<>2),
 'browser_key_release',has_function_privilege('authenticated','public.tttracker_v2_confidential_redeem(text)','execute') or has_function_privilege('anon','public.tttracker_v2_confidential_redeem(text)','execute'))
$$;
revoke all on function public.tttracker_v2_confidential_commit_envelope(text,text,text,text,text,text,text,text,integer),public.tttracker_v2_confidential_schema() from public,anon,authenticated;
grant execute on function public.tttracker_v2_confidential_commit_envelope(text,text,text,text,text,text,text,text,integer),public.tttracker_v2_confidential_schema() to service_role;
create or replace function public.tttracker_v2_confidential_result(p_ticket_hash text,p_outcome text)
returns void language plpgsql security definer set search_path='' as $$
declare t private.v2_confidential_tickets;
begin
 select * into t from private.v2_confidential_tickets where ticket_hash=p_ticket_hash and state='redeemed' for update;
 if not found or p_outcome is null or p_outcome not in ('success','failed') or (t.action='write' and p_outcome='success') then raise exception 'CONFIDENTIAL_ACCESS_DENIED';end if;
 if p_outcome='success' then perform private.tttracker_v2_secure_actor(t.organisation_id,t.actor_id,t.auth_session_id,'people.confidential.view');end if;
 insert into private.v2_confidential_audit(organisation_id,person_id,instance_id,field_id,record_id,actor_id,external_session_id,action,purpose)
 values(t.organisation_id,t.person_id,t.instance_id,t.field_id,t.record_id,t.actor_id,t.external_session_id,'CONFIDENTIAL_'||upper(t.action)||'_'||upper(p_outcome),t.purpose);
 update private.v2_confidential_tickets set state='committed' where ticket_hash=p_ticket_hash and state='redeemed';
end $$;
revoke all on function public.tttracker_v2_confidential_result(text,text) from public,anon,authenticated;
grant execute on function public.tttracker_v2_confidential_result(text,text) to service_role;
notify pgrst,'reload schema';
commit;

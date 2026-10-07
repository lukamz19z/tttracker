-- Fail closed if the managed Vault owner has not removed broad key access.
-- Earlier REVOKE statements cannot remove grants made directly by supabase_admin.
begin;
create or replace function private.tttracker_v2_require_vault_boundary()
returns void language plpgsql security definer set search_path='' as $$
declare principal text;
begin
 foreach principal in array array['anon','authenticated','service_role'] loop
 if has_schema_privilege(principal,'vault','usage')
 or has_table_privilege(principal,'vault.secrets','select')
 or has_table_privilege(principal,'vault.decrypted_secrets','select')
 or has_function_privilege(principal,'vault._crypto_aead_det_decrypt(bytea,bytea,bigint,bytea,bytea)','execute')
 or has_function_privilege(principal,'vault.create_secret(text,text,text,uuid)','execute')
 or has_function_privilege(principal,'vault.update_secret(uuid,text,text,text,uuid)','execute') then
 raise exception 'CONFIDENTIAL_KEY_BOUNDARY_UNAVAILABLE';
 end if;
 end loop;
end $$;
revoke all on function private.tttracker_v2_require_vault_boundary() from public,anon,authenticated,service_role;
create or replace function public.tttracker_v2_secure_configuration(p_org uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_version integer; v_secret uuid;v_person uuid;v_expiry timestamptz;v_field uuid;
begin
 if p_action='rotate_key' then
 perform private.tttracker_v2_require_people_permission(p_org,'people.confidential.manage_keys');
 perform private.tttracker_v2_require_vault_boundary();
 perform pg_advisory_xact_lock(hashtextextended('confidential-key:'||p_org::text,0));
 select coalesce(max(version),0)+1 into v_version from private.v2_confidential_keys where organisation_id=p_org;
 -- The random DEK is protected by Vault's managed root key; never stored in an ordinary table.
 v_secret:=vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),null,'TTTracker confidential DEK');
 update private.v2_confidential_keys set is_active=false where organisation_id=p_org and is_active;
 insert into private.v2_confidential_keys values(p_org,v_version,v_secret,true,now());
 insert into private.v2_confidential_audit(organisation_id,actor_id,action,purpose) values(p_org,auth.uid(),'KEY_VERSION_CREATED','key_rotation');
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
create or replace function public.tttracker_v2_confidential_redeem(p_ticket_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.v2_confidential_tickets; f private.v2_secure_fields;v private.v2_confidential_versions;key_hex text;
begin
 select * into t from private.v2_confidential_tickets where ticket_hash=p_ticket_hash for update;
 if not found or t.state<>'issued' or t.expires_at<=now() then raise exception 'CONFIDENTIAL_ACCESS_DENIED'; end if;
 if t.actor_id is not null then perform private.tttracker_v2_secure_actor(t.organisation_id,t.actor_id,t.auth_session_id,'people.confidential.'||case when t.action='read' then 'view' else 'edit' end);
 else perform private.tttracker_v2_secure_external(t.external_session_id,t.organisation_id,t.instance_id,t.field_id);end if;
 select * into f from private.v2_secure_fields where id=t.field_id and organisation_id=t.organisation_id and is_active and classification='confidential';
 if not found then raise exception 'CONFIDENTIAL_FIELD_INVALID'; end if;
 perform private.tttracker_v2_require_vault_boundary();
 select d.decrypted_secret into key_hex from private.v2_confidential_keys k join vault.decrypted_secrets d on d.id=k.vault_secret_id
 where k.organisation_id=t.organisation_id and k.version=t.key_version;
 if key_hex is null or key_hex !~ '^[a-f0-9]{64}$' then raise exception 'CONFIDENTIAL_KEY_UNAVAILABLE'; end if;
 if t.action='read' then select * into v from private.v2_confidential_versions where organisation_id=t.organisation_id and record_id=t.record_id and revision=t.revision; if not found then raise exception 'CONFIDENTIAL_ACCESS_DENIED';end if;end if;
 update private.v2_confidential_tickets set state='redeemed' where ticket_hash=p_ticket_hash and state='issued';
 insert into private.v2_confidential_audit(organisation_id,person_id,instance_id,field_id,record_id,actor_id,external_session_id,action,purpose)
 values(t.organisation_id,t.person_id,t.instance_id,t.field_id,t.record_id,t.actor_id,t.external_session_id,case when t.action='read' then case when f.kind='document' then 'CONFIDENTIAL_DOCUMENT_READ' else 'CONFIDENTIAL_READ' end else 'CONFIDENTIAL_WRITE_STARTED' end,t.purpose);
 return jsonb_build_object('key_hex',key_hex,'context',jsonb_build_object('organisation_id',t.organisation_id,'person_id',t.person_id,'instance_id',t.instance_id,'field_id',t.field_id,'record_id',t.record_id,'revision',t.revision,'key_version',t.key_version,'semantic_type',f.semantic_type,'kind',f.kind),
 'payload',case when t.action='read' then jsonb_build_object('ciphertext',v.ciphertext,'nonce',v.nonce,'tag',v.tag,'object_key',v.object_key,'provider',v.provider) end);
end $$;
notify pgrst,'reload schema';
commit;

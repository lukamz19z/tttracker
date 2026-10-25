-- Confidential storage is ciphertext-only. Vault owns the managed wrapping key.
begin;
revoke all on all tables in schema vault from public,anon,authenticated,service_role;
-- Supabase-managed encrypt/nonce primitives already deny these roles and cannot be
-- re-granted by postgres. Revoke only the APIs with postgres grant authority.
revoke all on function vault.create_secret(text,text,text,uuid),vault.update_secret(uuid,text,text,text,uuid),
 vault._crypto_aead_det_decrypt(bytea,bytea,bigint,bytea,bytea) from public,anon,authenticated,service_role;
revoke usage on schema vault from public,anon,authenticated,service_role;
insert into public.v2_people_field_types(type_key,minimum_classification) values
 ('superannuation','confidential'),('payroll_reference','confidential'),('confidential_document','confidential')
on conflict(type_key) do nothing;
insert into public.v2_permissions(resource_id,permission_code,action_key,name)
select id,'people.confidential.manage_keys','confidential_manage_keys','Manage confidential encryption keys'
from public.v2_resources where resource_key='people' on conflict(permission_code) do nothing;
-- No default grants: tenant administrators and platform operators do not inherit this authority.

create table if not exists private.v2_secure_fields (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
 semantic_type text not null references public.v2_people_field_types(type_key),
 classification text not null default 'confidential' check(classification='confidential'),
 label text not null check(length(label) between 1 and 120), kind text not null check(kind in ('value','document')),
 is_active boolean not null default true, created_at timestamptz not null default now(),unique(organisation_id,id)
);
create table if not exists private.v2_secure_onboarding_instances (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id),person_id uuid,
 status text not null default 'invited' check(status in ('invited','in_progress','submitted','revoked')),
 expires_at timestamptz not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(organisation_id,id),foreign key(organisation_id,person_id) references public.v2_people(organisation_id,id)
);
create table if not exists private.v2_secure_instance_fields (
 organisation_id uuid not null,instance_id uuid not null,field_id uuid not null,
 primary key(instance_id,field_id),foreign key(organisation_id,instance_id) references private.v2_secure_onboarding_instances(organisation_id,id),
 foreign key(organisation_id,field_id) references private.v2_secure_fields(organisation_id,id)
);
create table if not exists private.v2_secure_tokens (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,instance_id uuid not null,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),expires_at timestamptz not null,exchanged_at timestamptz,revoked_at timestamptz,
 foreign key(organisation_id,instance_id) references private.v2_secure_onboarding_instances(organisation_id,id)
);
create table if not exists private.v2_secure_sessions (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,instance_id uuid not null,
 session_hash text not null unique check(session_hash ~ '^[a-f0-9]{64}$'),expires_at timestamptz not null,revoked_at timestamptz,
 foreign key(organisation_id,instance_id) references private.v2_secure_onboarding_instances(organisation_id,id)
);
create table if not exists private.v2_confidential_keys (
 organisation_id uuid not null references public.organisations(id),version integer not null check(version>0),
 vault_secret_id uuid not null unique references vault.secrets(id),is_active boolean not null,created_at timestamptz not null default now(),
 primary key(organisation_id,version)
);
create unique index if not exists v2_confidential_keys_active_idx on private.v2_confidential_keys(organisation_id) where is_active;
create table if not exists private.v2_confidential_records (
 id uuid primary key,organisation_id uuid not null,person_id uuid,instance_id uuid,field_id uuid not null,revision integer not null default 0,
 created_at timestamptz not null default now(),unique(organisation_id,id),
 check(person_id is not null or instance_id is not null),
 foreign key(organisation_id,person_id) references public.v2_people(organisation_id,id),
 foreign key(organisation_id,instance_id) references private.v2_secure_onboarding_instances(organisation_id,id),
 foreign key(organisation_id,field_id) references private.v2_secure_fields(organisation_id,id)
);
-- One logical answer per exact owner/field. History is append-only.
create unique index if not exists v2_confidential_person_field_idx on private.v2_confidential_records(organisation_id,person_id,field_id) where instance_id is null;
create unique index if not exists v2_confidential_instance_field_idx on private.v2_confidential_records(organisation_id,instance_id,field_id) where instance_id is not null;
create table if not exists private.v2_confidential_versions (
 organisation_id uuid not null,record_id uuid not null,revision integer not null,key_version integer not null,
 nonce text not null,tag text not null,ciphertext text,object_key text,
 provider text not null default 'internal' check(provider in ('internal','sharepoint')),
 created_by uuid references auth.users(id),external_session_id uuid references private.v2_secure_sessions(id),created_at timestamptz not null default now(),
 primary key(record_id,revision),check((ciphertext is null)<>(object_key is null)),
 check(length(nonce)=16 and length(tag)=24),check(ciphertext is null or length(ciphertext)<=90000),
 foreign key(organisation_id,record_id) references private.v2_confidential_records(organisation_id,id),
 foreign key(organisation_id,key_version) references private.v2_confidential_keys(organisation_id,version)
);
create table if not exists private.v2_confidential_audit (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id),
 person_id uuid,instance_id uuid,field_id uuid,record_id uuid,actor_id uuid references auth.users(id),external_session_id uuid,
 action text not null,purpose text not null,occurred_at timestamptz not null default now(),
 check(actor_id is not null or external_session_id is not null)
);
create index if not exists v2_confidential_audit_owner_idx on private.v2_confidential_audit(organisation_id,person_id,occurred_at);
create table if not exists private.v2_confidential_tickets (
 ticket_hash text primary key check(ticket_hash ~ '^[a-f0-9]{64}$'),organisation_id uuid not null,
 person_id uuid,instance_id uuid,field_id uuid not null,record_id uuid not null,revision integer not null,key_version integer not null,
 actor_id uuid,auth_session_id text,external_session_id uuid,action text not null check(action in ('read','write')),
 purpose text not null check(purpose in ('person_review','onboarding_review','payroll_review','document_review','key_rotation')),
 expires_at timestamptz not null default now()+interval '5 minutes',state text not null default 'issued' check(state in ('issued','redeemed','committed'))
);
do $$ declare t text; begin
 foreach t in array array['v2_secure_fields','v2_secure_onboarding_instances','v2_secure_instance_fields','v2_secure_tokens','v2_secure_sessions','v2_confidential_keys','v2_confidential_records','v2_confidential_versions','v2_confidential_audit','v2_confidential_tickets'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
-- Recheck the existing RBAC engine for the actual ticket actor, including explicit denies.
-- This helper is private; no browser or service role can select an arbitrary actor through it.
create or replace function private.tttracker_v2_secure_actor(p_org uuid,p_actor uuid,p_session text,p_permission text)
returns void language plpgsql security definer set search_path='' as $$
declare previous_sub text:=current_setting('request.jwt.claim.sub',true);
begin
 if not exists(select 1 from auth.sessions where id::text=p_session and user_id=p_actor and (not_after is null or not_after>now())) then raise exception 'CONFIDENTIAL_ACCESS_DENIED'; end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform private.tttracker_v2_require_people_permission(p_org,p_permission);
 perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
end $$;
create or replace function public.tttracker_v2_secure_configuration(p_org uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_version integer; v_secret uuid;v_person uuid;v_expiry timestamptz;v_field uuid;
begin
 if p_action='rotate_key' then
 perform private.tttracker_v2_require_people_permission(p_org,'people.confidential.manage_keys');
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
-- Internal tickets originate from the authenticated user's JWT, not browser-supplied actor IDs.
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
 else select version into v_version from private.v2_confidential_keys where organisation_id=p_org and is_active;v_revision:=v_revision+1;end if;
 if p_expected_revision is not null and p_action='write' and v_revision-1<>p_expected_revision then raise exception 'CONFIDENTIAL_CONCURRENT_UPDATE';end if;
 if v_version is null then raise exception 'CONFIDENTIAL_KEY_UNAVAILABLE'; end if;
 insert into private.v2_confidential_tickets(ticket_hash,organisation_id,person_id,instance_id,field_id,record_id,revision,key_version,actor_id,auth_session_id,action,purpose)
 values(p_ticket_hash,p_org,p_person,p_instance,p_field,p_record,v_revision,v_version,auth.uid(),v_session,p_action,p_purpose);
 return jsonb_build_object('record_id',p_record);
end $$;
create or replace function public.tttracker_v2_onboarding_exchange(p_token_hash text,p_session_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.v2_secure_tokens;i private.v2_secure_onboarding_instances;expiry timestamptz;sid uuid;
begin
 select * into t from private.v2_secure_tokens where token_hash=p_token_hash for update;
 if not found or t.revoked_at is not null or t.exchanged_at is not null or t.expires_at<=now() then raise exception 'ONBOARDING_LINK_INVALID'; end if;
 select * into i from private.v2_secure_onboarding_instances where id=t.instance_id and organisation_id=t.organisation_id for update;
 if i.status not in ('invited','in_progress') or i.expires_at<=now() then raise exception 'ONBOARDING_LINK_INVALID'; end if;
 expiry:=least(i.expires_at,t.expires_at,now()+interval '30 minutes');
 update private.v2_secure_tokens set exchanged_at=now() where id=t.id and exchanged_at is null;
 insert into private.v2_secure_sessions(organisation_id,instance_id,session_hash,expires_at) values(t.organisation_id,t.instance_id,p_session_hash,expiry) returning id into sid;
 update private.v2_secure_onboarding_instances set status='in_progress' where id=i.id and organisation_id=i.organisation_id and status='invited';
 insert into private.v2_confidential_audit(organisation_id,instance_id,external_session_id,action,purpose) values(i.organisation_id,i.id,sid,'EXTERNAL_SESSION_CREATED','onboarding_review');
 return jsonb_build_object('instance_id',i.id,'expires_at',expiry);
end $$;
create or replace function private.tttracker_v2_secure_external(p_session uuid,p_org uuid,p_instance uuid,p_field uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.v2_secure_sessions s join private.v2_secure_onboarding_instances i on i.id=s.instance_id and i.organisation_id=s.organisation_id
 join private.v2_secure_instance_fields f on f.instance_id=i.id and f.organisation_id=i.organisation_id
 join private.v2_secure_fields k on k.id=f.field_id and k.organisation_id=f.organisation_id
 where s.id=p_session and s.organisation_id=p_org and s.instance_id=p_instance and s.revoked_at is null and s.expires_at>now()
 and i.status in ('invited','in_progress') and i.expires_at>now() and f.field_id=p_field and k.is_active and k.classification='confidential') then raise exception 'ONBOARDING_SESSION_INVALID'; end if;
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
 select version into v_key from private.v2_confidential_keys where organisation_id=s.organisation_id and is_active;
 if v_key is null then raise exception 'CONFIDENTIAL_KEY_UNAVAILABLE'; end if;
 insert into private.v2_confidential_tickets(ticket_hash,organisation_id,person_id,instance_id,field_id,record_id,revision,key_version,external_session_id,action,purpose)
 values(p_ticket_hash,s.organisation_id,i.person_id,p_instance,p_field,p_record,v_revision+1,v_key,s.id,'write','onboarding_review');
 return jsonb_build_object('record_id',p_record);
end $$;
-- The only key-release RPC: server-only, one-time, scoped, re-authorised, audited.
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
create or replace function public.tttracker_v2_confidential_commit(p_ticket_hash text,p_nonce text,p_tag text,p_ciphertext text default null,p_object_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.v2_confidential_tickets;f private.v2_secure_fields;r private.v2_confidential_records;
begin
 select * into t from private.v2_confidential_tickets where ticket_hash=p_ticket_hash for update;
 if not found or t.action<>'write' or t.state<>'redeemed' or t.expires_at<=now() then raise exception 'CONFIDENTIAL_ACCESS_DENIED'; end if;
 if t.actor_id is not null then perform private.tttracker_v2_secure_actor(t.organisation_id,t.actor_id,t.auth_session_id,'people.confidential.edit');
 else perform private.tttracker_v2_secure_external(t.external_session_id,t.organisation_id,t.instance_id,t.field_id);end if;
 select * into r from private.v2_confidential_records where organisation_id=t.organisation_id and id=t.record_id for update;
 if r.revision<>t.revision-1 then raise exception 'CONFIDENTIAL_CONCURRENT_UPDATE';end if;
 select * into f from private.v2_secure_fields where organisation_id=t.organisation_id and id=t.field_id and is_active;
 if not found then raise exception 'CONFIDENTIAL_FIELD_INVALID';end if;
 if p_nonce !~ '^[A-Za-z0-9+/]{16}$' or p_tag !~ '^[A-Za-z0-9+/]{22}==$' then raise exception 'CONFIDENTIAL_PAYLOAD_INVALID';end if;
 if f.kind='value' and (p_ciphertext is null or p_object_key is not null or p_ciphertext !~ '^[A-Za-z0-9+/]*={0,2}$') then raise exception 'CONFIDENTIAL_PAYLOAD_INVALID'; end if;
 if f.kind='document' and (p_ciphertext is not null or p_object_key is distinct from t.organisation_id::text||'/'||t.record_id::text||'/'||t.revision::text||'/'||t.ticket_hash||'.bin'
 or not exists(select 1 from storage.objects where bucket_id='v2-people-confidential' and name=p_object_key)) then raise exception 'CONFIDENTIAL_PAYLOAD_INVALID';end if;
 insert into private.v2_confidential_versions(organisation_id,record_id,revision,key_version,nonce,tag,ciphertext,object_key,created_by,external_session_id)
 values(t.organisation_id,t.record_id,t.revision,t.key_version,p_nonce,p_tag,p_ciphertext,p_object_key,t.actor_id,t.external_session_id);
 update private.v2_confidential_records set revision=t.revision where id=t.record_id and organisation_id=t.organisation_id and revision=t.revision-1;
 update private.v2_confidential_tickets set state='committed' where ticket_hash=p_ticket_hash and state='redeemed';
 insert into private.v2_confidential_audit(organisation_id,person_id,instance_id,field_id,record_id,actor_id,external_session_id,action,purpose)
 values(t.organisation_id,t.person_id,t.instance_id,t.field_id,t.record_id,t.actor_id,t.external_session_id,case when f.kind='document' then 'CONFIDENTIAL_DOCUMENT_WRITE' else 'CONFIDENTIAL_WRITE' end,t.purpose);
 return jsonb_build_object('record_id',t.record_id,'revision',t.revision,'key_version',t.key_version);
end $$;
revoke all on function private.tttracker_v2_secure_actor(uuid,uuid,text,text),private.tttracker_v2_secure_external(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.tttracker_v2_secure_configuration(uuid,text,jsonb),public.tttracker_v2_confidential_ticket(uuid,text,text,uuid,uuid,uuid,uuid,text,integer) from public,anon,service_role;
grant execute on function public.tttracker_v2_secure_configuration(uuid,text,jsonb),public.tttracker_v2_confidential_ticket(uuid,text,text,uuid,uuid,uuid,uuid,text,integer) to authenticated;
revoke all on function public.tttracker_v2_onboarding_exchange(text,text),public.tttracker_v2_external_confidential_ticket(text,uuid,uuid,uuid,text),public.tttracker_v2_confidential_redeem(text),public.tttracker_v2_confidential_commit(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.tttracker_v2_onboarding_exchange(text,text),public.tttracker_v2_external_confidential_ticket(text,uuid,uuid,uuid,text),public.tttracker_v2_confidential_redeem(text),public.tttracker_v2_confidential_commit(text,text,text,text,text) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('v2-people-confidential','v2-people-confidential',false,11534336,array['application/octet-stream']) on conflict(id) do nothing;
notify pgrst,'reload schema';
commit;

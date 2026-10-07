-- Safe errors for a proven token; no instance metadata or security-policy change.
begin;
create or replace function public.tttracker_v2_onboarding_exchange(p_token_hash text,p_session_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.v2_secure_tokens;i private.v2_secure_onboarding_instances;expiry timestamptz;sid uuid;
begin
 select * into t from private.v2_secure_tokens where token_hash=p_token_hash for update;
 if not found then raise exception 'ONBOARDING_LINK_INVALID'; end if;
 if t.revoked_at is not null then raise exception 'ONBOARDING_LINK_REVOKED'; end if;
 if t.expires_at<=now() then raise exception 'ONBOARDING_LINK_EXPIRED'; end if;
 if t.exchanged_at is not null then raise exception 'ONBOARDING_LINK_USED'; end if;
 select * into i from private.v2_secure_onboarding_instances where id=t.instance_id and organisation_id=t.organisation_id for update;
 if not found then raise exception 'ONBOARDING_LINK_INVALID'; end if;
 if i.status='revoked' then raise exception 'ONBOARDING_LINK_REVOKED'; end if;
 if i.expires_at<=now() then raise exception 'ONBOARDING_LINK_EXPIRED'; end if;
 if i.status not in ('invited','in_progress','changes_required') then raise exception 'ONBOARDING_LINK_USED'; end if;
 expiry:=least(i.expires_at,t.expires_at,now()+interval '30 minutes');
 update private.v2_secure_tokens set exchanged_at=now() where id=t.id and exchanged_at is null;
 insert into private.v2_secure_sessions(organisation_id,instance_id,session_hash,expires_at) values(t.organisation_id,t.instance_id,p_session_hash,expiry) returning id into sid;
 update private.v2_secure_onboarding_instances set status='in_progress' where id=i.id and organisation_id=i.organisation_id and status='invited';
 insert into private.v2_confidential_audit(organisation_id,instance_id,external_session_id,action,purpose) values(i.organisation_id,i.id,sid,'EXTERNAL_SESSION_CREATED','onboarding_review');
 return jsonb_build_object('instance_id',i.id,'expires_at',expiry);
end $$;

revoke all on function public.tttracker_v2_onboarding_exchange(text,text) from public,anon,authenticated;
grant execute on function public.tttracker_v2_onboarding_exchange(text,text) to service_role;
notify pgrst,'reload schema';
commit;

-- Keep TTTracker email assurance separate from Supabase TOTP/AAL2.
-- These functions are callable only by the authenticated server boundary.
create index if not exists v2_email_mfa_challenges_user_created_idx
on public.v2_email_mfa_challenges(user_id,created_at desc);
revoke all on public.v2_email_mfa_challenges from anon,authenticated;
revoke insert,update,delete,truncate,references,trigger on public.v2_security_session_verifications from anon,authenticated;
create or replace function public.tttracker_v2_reserve_email_challenge(
 p_user_id uuid,p_session_id text,p_id uuid,p_email text,p_hash text,
 p_expiry_minutes integer,p_max_attempts integer
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('email-security:'||p_user_id::text,0));
 if not exists(select 1 from auth.sessions where user_id=p_user_id and id::text=p_session_id and (not_after is null or not_after>now())) then
   raise exception 'SESSION_MISSING';
 end if;
 if p_expiry_minutes not between 5 and 30 or p_max_attempts not between 3 and 10 or p_hash !~ '^[a-f0-9]{64}$'
 or not exists(select 1 from auth.users where id=p_user_id and lower(email)=lower(p_email)) then raise exception 'AUTH_ERROR'; end if;
 if exists(select 1 from public.v2_email_mfa_challenges where user_id=p_user_id and created_at>now()-interval '30 seconds')
 or (select count(*) from public.v2_email_mfa_challenges where user_id=p_user_id and created_at>now()-interval '1 hour')>=10 then
   raise exception 'RATE_LIMITED';
 end if;
 update public.v2_email_mfa_challenges set status='cancelled'
 where user_id=p_user_id and session_id=p_session_id and status='pending';
 insert into public.v2_email_mfa_challenges(id,user_id,session_id,email,code_hash,expires_at,max_attempts)
 values(p_id,p_user_id,p_session_id,p_email,p_hash,now()+make_interval(mins=>p_expiry_minutes),p_max_attempts);
 return jsonb_build_object('challengeId',p_id,'expiresAt',now()+make_interval(mins=>p_expiry_minutes),'resendAfter',now()+interval '30 seconds','codeLength',6);
end $$;
create or replace function public.tttracker_v2_verify_email_challenge(
 p_user_id uuid,p_session_id text,p_id uuid,p_hash text,p_trusted_hours integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.v2_email_mfa_challenges; expiry timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended('email-security:'||p_user_id::text,0));
 if not exists(select 1 from auth.sessions where user_id=p_user_id and id::text=p_session_id and (not_after is null or not_after>now())) then raise exception 'SESSION_MISSING'; end if;
 if p_trusted_hours not between 1 and 168 or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'AUTH_ERROR'; end if;
 select * into c from public.v2_email_mfa_challenges where id=p_id and user_id=p_user_id and session_id=p_session_id for update;
 if not found or c.status <> 'pending' then return jsonb_build_object('error','CHALLENGE_EXPIRED'); end if;
 if c.expires_at<=now() then
   update public.v2_email_mfa_challenges set status='expired' where id=c.id and user_id=p_user_id and session_id=p_session_id;
   return jsonb_build_object('error','CODE_EXPIRED');
 end if;
 if c.attempts>=c.max_attempts then return jsonb_build_object('error','CHALLENGE_EXPIRED'); end if;
 if c.code_hash<>p_hash then
   update public.v2_email_mfa_challenges set attempts=attempts+1,status=case when attempts+1>=max_attempts then 'cancelled' else 'pending' end
   where id=c.id and user_id=p_user_id and session_id=p_session_id and status='pending';
   return jsonb_build_object('error','CODE_INVALID');
 end if;
 expiry:=now()+make_interval(hours=>p_trusted_hours);
 update public.v2_email_mfa_challenges set status='verified',verified_at=now()
 where id=c.id and user_id=p_user_id and session_id=p_session_id and status='pending';
 insert into public.v2_security_session_verifications(user_id,session_id,verification_type,verified_at,expires_at)
 values(p_user_id,p_session_id,'email_code',now(),expiry)
 on conflict(user_id,session_id,verification_type) do update set verified_at=excluded.verified_at,expires_at=excluded.expires_at;
 return jsonb_build_object('verified',true,'expiresAt',expiry);
end $$;
revoke all on function public.tttracker_v2_reserve_email_challenge(uuid,text,uuid,text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.tttracker_v2_verify_email_challenge(uuid,text,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.tttracker_v2_reserve_email_challenge(uuid,text,uuid,text,text,integer,integer) to service_role;
grant execute on function public.tttracker_v2_verify_email_challenge(uuid,text,uuid,text,integer) to service_role;
notify pgrst,'reload schema';

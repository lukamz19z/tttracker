begin;
-- Preserve first-start history while exposing the most recent leased attempt.
alter table public.v2_sharepoint_folder_jobs add column if not exists last_attempt_at timestamptz;
update public.v2_sharepoint_folder_jobs set last_attempt_at=coalesce(finished_at,started_at) where last_attempt_at is null;
create or replace function public.tttracker_v2_claim_folder_job(p_org uuid,p_actor uuid default null,p_kind text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.v2_sharepoint_folder_jobs;begin
 select * into r from public.v2_sharepoint_folder_jobs where organisation_id=p_org and (p_kind is null or entity_kind=p_kind) and available_at<=now() and
 (status in ('pending','failed') or (status='provisioning' and lease_until<now())) order by available_at,id for update skip locked limit 1;
 if r.id is null then return null;end if;
 update public.v2_sharepoint_folder_jobs set status='provisioning',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',started_at=coalesce(started_at,now()),last_attempt_at=now(),claimed_revision=revision,
 actor_id=coalesce(p_actor,actor_id) where id=r.id returning * into r;return to_jsonb(r);end $$;
revoke all on function public.tttracker_v2_claim_folder_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.tttracker_v2_claim_folder_job(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;

;

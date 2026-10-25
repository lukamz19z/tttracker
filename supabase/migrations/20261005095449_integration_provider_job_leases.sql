begin;
alter table public.v2_document_provider_jobs add column lease_id uuid;
create or replace function public.tttracker_v2_claim_document_job(p_org uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.v2_document_provider_jobs;begin
 update public.v2_document_provider_jobs set status='syncing',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '10 minutes'
 where organisation_id=p_org and id=p_id and available_at<=now() and (status in ('pending','failed','permission_lost') or (status='syncing' and lease_until<now())) returning * into r;
 if r.id is null then raise exception 'INTEGRATION_JOB_BUSY';end if;return to_jsonb(r);end $$;
revoke all on function public.tttracker_v2_claim_document_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.tttracker_v2_claim_document_job(uuid,uuid) to service_role;
commit;

;

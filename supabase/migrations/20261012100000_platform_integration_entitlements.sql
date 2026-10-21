begin;
insert into public.v2_features(feature_key,name,category,feature_type,value_type,lifecycle_status,default_value)
values('xero','Xero Integration','integrations','integration','boolean','available','false'::jsonb) on conflict(feature_key) do nothing;
-- No plan assignments are assumed or changed.
alter table public.v2_integrations add column if not exists entitlement_check_required boolean not null default false;
create table if not exists public.v2_subscription_audit (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
 actor_id uuid not null references auth.users(id), action text not null, old_state jsonb not null, new_state jsonb not null,
 occurred_at timestamptz not null default now()
);
alter table public.v2_subscription_audit enable row level security;
revoke all on public.v2_subscription_audit from public,anon,authenticated;
grant select,insert on public.v2_subscription_audit to service_role;
create or replace function public.tttracker_v2_integration_entitlement(p_organisation_id uuid,p_provider text)
returns jsonb language sql stable security definer set search_path='' as $$
 select private.tttracker_v2_get_entitlement(p_organisation_id,p_provider) where p_provider in ('sharepoint','xero'); $$;
revoke all on function public.tttracker_v2_integration_entitlement(uuid,text) from public,anon,authenticated;
grant execute on function public.tttracker_v2_integration_entitlement(uuid,text) to service_role;
create or replace function public.tttracker_v2_platform_subscription_change(p_organisation_id uuid,p_actor uuid,p_action text,p_target uuid,p_override text default null)
returns void language plpgsql security definer set search_path='' as $$
declare before_state jsonb; after_state jsonb; current_subscription uuid; item record;
begin
 if not exists(select 1 from public.v2_platform_admins where user_id=p_actor and status='active' and role in ('owner','admin')) then raise exception 'FORBIDDEN'; end if;
 perform 1 from public.organisations where id=p_organisation_id for update;
 if not found then raise exception 'ORGANISATION_NOT_FOUND'; end if;
 select jsonb_object_agg(feature_key,private.tttracker_v2_get_entitlement(p_organisation_id,feature_key)) into before_state from public.v2_features;
 if p_action='plan' then
   if not exists(select 1 from public.v2_subscription_plan_versions v join public.v2_subscription_plans p on p.id=v.plan_id where v.id=p_target and v.status='active' and p.status='active') then raise exception 'PLAN_INVALID'; end if;
   select id into current_subscription from public.v2_organisation_subscriptions where organisation_id=p_organisation_id and status in ('trial','active') and starts_at<=now() and (ends_at is null or ends_at>now()) order by starts_at desc,created_at desc limit 1;
   update public.v2_organisation_subscriptions set status='cancelled',ends_at=now() where organisation_id=p_organisation_id and status in ('trial','active') and starts_at<=now();
   insert into public.v2_organisation_subscriptions(organisation_id,plan_version_id,status,billing_cycle,created_by,metadata)
   values(p_organisation_id,p_target,'active','manual',p_actor,jsonb_build_object('previous_subscription_id',current_subscription));
 elsif p_action='override' then
   if p_override is null or p_override not in ('default','enabled','disabled') or not exists(select 1 from public.v2_features where id=p_target and feature_type='integration') then raise exception 'OVERRIDE_INVALID'; end if;
   if p_override='default' then
     delete from public.v2_organisation_entitlement_overrides where organisation_id=p_organisation_id and feature_id=p_target;
   else
     insert into public.v2_organisation_entitlement_overrides(organisation_id,feature_id,enabled,reason,created_by)
     values(p_organisation_id,p_target,p_override='enabled','Platform integration entitlement override',p_actor)
     on conflict(organisation_id,feature_id) do update set enabled=excluded.enabled,starts_at=now(),ends_at=null,created_by=p_actor,reason=excluded.reason;
   end if;
 else raise exception 'ACTION_INVALID'; end if;
 select jsonb_object_agg(feature_key,private.tttracker_v2_get_entitlement(p_organisation_id,feature_key)) into after_state from public.v2_features;
 insert into public.v2_subscription_audit(organisation_id,actor_id,action,old_state,new_state) values(p_organisation_id,p_actor,p_action,before_state||jsonb_build_object('previous_subscription_id',current_subscription),after_state||jsonb_build_object('target_id',p_target,'override',p_override));
 for item in select * from public.v2_integrations where organisation_id=p_organisation_id loop
   if (before_state->item.provider->>'enabled') is distinct from (after_state->item.provider->>'enabled') then
     update public.v2_integrations set entitlement_check_required=true where id=item.id;
     insert into public.v2_integration_audit(organisation_id,integration_id,actor_id,action,result) values(p_organisation_id,item.id,p_actor,case when (after_state->item.provider->>'enabled')::boolean then 'entitlement_restored_check_required' else 'entitlement_suspended' end,'success');
   end if;
 end loop;
end; $$;
revoke all on function public.tttracker_v2_platform_subscription_change(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.tttracker_v2_platform_subscription_change(uuid,uuid,text,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;

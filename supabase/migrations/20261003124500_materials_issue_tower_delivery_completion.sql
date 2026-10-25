-- Preserve issue origin independently of later movements. No tower is inferred from current location.
create or replace function private.tttracker_v2_issue_affected_tower_guard()
returns trigger language plpgsql set search_path=public,private as $$
begin
  if tg_op = 'INSERT' and new.tower_id is null then raise exception 'Affected tower is required'; end if;
  if tg_op = 'UPDATE' and old.tower_id is not null and new.tower_id is distinct from old.tower_id then
    raise exception 'Affected tower cannot be changed';
  end if;
  if new.tower_id is not null and not exists(select 1 from public.v2_towers t where t.id=new.tower_id and t.project_id=new.project_id and t.organisation_id=new.organisation_id) then
    raise exception 'Invalid affected tower';
  end if;
  return new;
end $$;
drop trigger if exists v2_material_issue_affected_tower_guard on public.v2_material_issues;
create trigger v2_material_issue_affected_tower_guard before insert or update on public.v2_material_issues
for each row execute function private.tttracker_v2_issue_affected_tower_guard();
alter table public.v2_material_deliveries add column if not exists completed_at timestamptz;
alter table public.v2_material_deliveries add column if not exists completed_by uuid references auth.users(id) on delete set null;
alter table public.v2_material_deliveries add column if not exists completed_by_name text;
alter table public.v2_material_deliveries add column if not exists metadata jsonb not null default '{}'::jsonb;
-- Existing delivery timestamps are retained; historical completing actors are not guessed.
update public.v2_material_deliveries set completed_at=delivered_at
where status in ('delivered','delivered_with_issues') and completed_at is null and delivered_at is not null;
create or replace function public.tttracker_v2_delivery_transition(
 p_project_id uuid,p_delivery_id uuid,p_item_id uuid,p_action text,p_status text,
 p_quantity numeric,p_actor uuid,p_actor_name text,p_reason text,p_expected_status text
) returns jsonb language plpgsql security definer set search_path=public,private as $$
declare d public.v2_material_deliveries%rowtype; i public.v2_material_delivery_items%rowtype;
 stamp timestamptz:=clock_timestamp(); done boolean; problems boolean; audit jsonb;
begin
 if p_actor is null then raise exception 'Authenticated actor required'; end if;
 select * into d from public.v2_material_deliveries where id=p_delivery_id and project_id=p_project_id for update;
 if not found or d.status='cancelled' then raise exception 'Delivery unavailable'; end if;
 if p_action='start' then
   if d.status='planned' then
     update public.v2_material_deliveries set status='in_transit',departed_at=coalesce(departed_at,stamp),updated_at=stamp
     where id=d.id and project_id=p_project_id;
   elsif d.status<>'in_transit' then raise exception 'Completed delivery cannot be started'; end if;
   return jsonb_build_object('ok',true);
 end if;
 select * into i from public.v2_material_delivery_items
 where id=p_item_id and delivery_id=d.id and project_id=p_project_id and organisation_id=d.organisation_id for update;
 if not found then raise exception 'Delivery item unavailable'; end if;
 if not exists(select 1 from public.v2_material_bundles b where b.id=i.bundle_id and b.project_id=p_project_id and b.tower_id is not distinct from i.tower_id) then raise exception 'Delivery relationship invalid'; end if;
 if p_action not in ('driver_check','correct_outcome') or p_status not in ('planned','delivered','rejected','short') then raise exception 'Invalid delivery transition'; end if;
 if p_quantity is null or p_quantity<0 or p_quantity::text in ('NaN','Infinity','-Infinity') or p_quantity>i.expected_quantity then raise exception 'Invalid delivery quantity'; end if;
 if p_status in ('planned','rejected') and p_quantity<>0 then raise exception 'Invalid delivery quantity'; end if;
 if p_status='delivered' and p_quantity<>i.expected_quantity then raise exception 'Delivered must confirm expected quantity'; end if;
 if p_action='driver_check' then
   if p_status='planned' then raise exception 'Use explicit correction to reopen'; end if;
   if i.status=p_status and i.delivered_quantity=p_quantity then return jsonb_build_object('ok',true,'unchanged',true); end if;
   if i.status<>'planned' or d.status in ('delivered','delivered_with_issues') then raise exception 'Outcome already recorded; use correction'; end if;
 else
   if nullif(btrim(p_reason),'') is null then raise exception 'Correction reason required'; end if;
   if i.status is distinct from p_expected_status then raise exception 'Outcome changed; refresh before correction'; end if;
   if i.status=p_status and i.delivered_quantity=p_quantity then return jsonb_build_object('ok',true,'unchanged',true); end if;
 end if;
 audit:=jsonb_build_object('previous_status',i.status,'new_status',p_status,'previous_quantity',i.delivered_quantity,'new_quantity',p_quantity,'actor',p_actor,'actor_name',p_actor_name,'at',stamp,'reason',p_reason,'action',p_action);
 update public.v2_material_delivery_items set status=p_status,delivered_quantity=p_quantity,
 driver_checked_by=case when p_status='planned' then null else p_actor end,
 driver_checked_by_name=case when p_status='planned' then null else p_actor_name end,
 driver_checked_at=case when p_status='planned' then null else stamp end,
 metadata=jsonb_set(metadata,'{outcome_history}',coalesce(metadata->'outcome_history','[]'::jsonb)||jsonb_build_array(audit)),updated_at=stamp
 where id=i.id and delivery_id=d.id and project_id=p_project_id;
 select bool_and(status in ('delivered','short','rejected')),bool_or(status in ('short','rejected')) into done,problems
 from public.v2_material_delivery_items where delivery_id=d.id and project_id=p_project_id;
 update public.v2_material_deliveries set status=case when done then case when problems then 'delivered_with_issues' else 'delivered' end else 'in_transit' end,
 departed_at=coalesce(departed_at,stamp),delivered_at=case when done then stamp else null end,
 completed_at=case when done then stamp else null end,completed_by=case when done then p_actor else null end,
 completed_by_name=case when done then p_actor_name else null end,
 metadata=jsonb_set(metadata,'{lifecycle_history}',coalesce(metadata->'lifecycle_history','[]'::jsonb)||jsonb_build_array(audit||jsonb_build_object('previous_completed_at',d.completed_at,'previous_completed_by',d.completed_by,'completed',done))),updated_at=stamp
 where id=d.id and project_id=p_project_id;
 return jsonb_build_object('ok',true,'completed',done);
end $$;
revoke all on function public.tttracker_v2_delivery_transition(uuid,uuid,uuid,text,text,numeric,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.tttracker_v2_delivery_transition(uuid,uuid,uuid,text,text,numeric,uuid,text,text,text) to service_role;
notify pgrst,'reload schema';

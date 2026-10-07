-- One transaction, same docket lock and audited line-transition model.
create or replace function public.tttracker_v2_delivery_bulk_outcome(
 p_project_id uuid,p_delivery_id uuid,p_item_ids uuid[],p_status text,p_actor uuid,p_actor_name text
) returns jsonb language plpgsql security definer set search_path=public,private as $$
declare d public.v2_material_deliveries%rowtype; i public.v2_material_delivery_items%rowtype; changed integer:=0;
begin
 if p_actor is null then raise exception 'Authenticated actor required'; end if;
 if p_status is null or p_status not in ('delivered','rejected') then raise exception 'Invalid bulk delivery outcome'; end if;
 select * into d from public.v2_material_deliveries where id=p_delivery_id and project_id=p_project_id for update;
 if not found or d.status='cancelled' then raise exception 'Delivery unavailable'; end if;
 if d.status='planned' then raise exception 'Begin actual delivery before recording outcomes'; end if;
 -- IDs are derived and authorized by the server, never accepted from a browser.
 if exists(select 1 from public.v2_material_delivery_items
   where delivery_id=d.id and project_id=p_project_id and status='planned'
   and not (id=any(coalesce(p_item_ids,'{}'::uuid[])))) then
   raise exception 'Pending outcomes changed; refresh before bulk confirmation';
 end if;
 for i in select * from public.v2_material_delivery_items
   where delivery_id=d.id and project_id=p_project_id and organisation_id=d.organisation_id and status='planned'
   order by id for update
 loop
   perform public.tttracker_v2_delivery_transition(p_project_id,d.id,i.id,'driver_check',p_status,
    case when p_status='delivered' then i.expected_quantity else 0 end,p_actor,p_actor_name,
    'Bulk pending delivery outcome',null);
   changed:=changed+1;
 end loop;
 return jsonb_build_object('ok',true,'applied',changed,'unchanged',changed=0);
end $$;
revoke all on function public.tttracker_v2_delivery_bulk_outcome(uuid,uuid,uuid[],text,uuid,text) from public,anon,authenticated;
grant execute on function public.tttracker_v2_delivery_bulk_outcome(uuid,uuid,uuid[],text,uuid,text) to service_role;
notify pgrst,'reload schema';

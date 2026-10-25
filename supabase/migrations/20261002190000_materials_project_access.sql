-- Integrate Materials with existing host RBAC and bilateral project-party access.
begin;
-- These mutations are called only after server-route authorization. Default PUBLIC grants bypass RLS.
revoke all on function public.tttracker_v2_next_material_issue_number(uuid) from public,anon,authenticated;
revoke all on function public.tttracker_v2_recalculate_material_issue(uuid) from public,anon,authenticated;
revoke all on function public.tttracker_v2_next_material_delivery_number(uuid) from public,anon,authenticated;
grant execute on function public.tttracker_v2_next_material_issue_number(uuid) to service_role;
grant execute on function public.tttracker_v2_recalculate_material_issue(uuid) to service_role;
grant execute on function public.tttracker_v2_next_material_delivery_number(uuid) to service_role;
insert into public.v2_resources(resource_key,name,module_key,resource_type)
values ('materials','Materials','materials','module') on conflict(resource_key) do nothing;
insert into public.v2_permissions(resource_id,permission_code,action_key,name)
select r.id,'materials.'||a.key,a.key,a.label from public.v2_resources r
cross join (values
 ('view','View Materials'),('import','Import Materials'),('check_bundles','Check Materials'),
 ('manage_deliveries','Manage Deliveries'),('manage_issues','Manage Material Issues'),
 ('manage_movements','Manage Material Movements'),('manage_reservations','Manage Reservations'),
 ('manage_amendments','Manage Amendments'),('configure','Configure Materials')
) a(key,label) where r.resource_key='materials' on conflict(permission_code) do nothing;
-- Preserve configured settings administration, without inferring roles or granting operational rights.
insert into public.v2_role_permissions(organisation_id,role_id,permission_id,allowed)
select rp.organisation_id,rp.role_id,target.id,true
from public.v2_role_permissions rp join public.v2_permissions source on source.id=rp.permission_id
join public.v2_permissions target on target.permission_code=case source.permission_code
 when 'project.settings.view' then 'materials.view' when 'project.settings.configure' then 'materials.configure' end
where rp.allowed=true on conflict(role_id,permission_id) do nothing;
insert into public.v2_project_party_permission_definitions(host_organisation_id,permission_key,label,module_key,default_allowed)
select o.id,p.permission_code,p.name,'materials',false from public.organisations o
cross join public.v2_permissions p where p.permission_code like 'materials.%'
on conflict(host_organisation_id,permission_key) do nothing;
-- Narrow the existing party engine to ONE party when resolving its portal configuration.
-- This prevents a permission on a disabled party from enabling another party's section.
create or replace function private.tttracker_v2_party_user_has_scoped_permission(
 p_party_id uuid, p_permission_key text, p_section_key text, p_user_id uuid default auth.uid()
) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare membership public.v2_project_party_users; party public.v2_project_parties; user_override boolean; baseline boolean;
begin
 select * into party from public.v2_project_parties where id=p_party_id and status='active' and portal_enabled=true;
 if not found then return false; end if;
 select * into membership from public.v2_project_party_users where project_party_id=p_party_id
   and project_id=party.project_id and user_id=p_user_id and status='active';
 if not found then return false; end if;
 if not exists(select 1 from public.v2_project_party_permission_definitions
   where host_organisation_id=party.host_organisation_id and permission_key=p_permission_key and is_active=true) then return false; end if;
 select allowed into user_override from public.v2_project_party_user_permission_overrides
   where project_party_user_id=membership.id and permission_key=p_permission_key;
 if found then return user_override; end if;
 select coalesce((select allowed from public.v2_project_party_permissions
     where project_party_id=p_party_id and permission_key=p_permission_key),
   (select default_allowed from public.v2_project_party_permission_definitions
     where host_organisation_id=party.host_organisation_id and permission_key=p_permission_key and is_active=true),false)
 into baseline;
 return baseline or exists(select 1 from public.v2_project_party_access_grants g
   join public.v2_project_parties grantor on grantor.id=g.grantor_project_party_id
     and grantor.project_id=party.project_id and grantor.status='active'
   where g.project_id=party.project_id and g.grantee_project_party_id=p_party_id
     and g.permission_key=p_permission_key and g.status='active' and g.valid_from<=now()
     and (g.valid_until is null or g.valid_until>now())
     and (g.scope_type='project' or (g.scope_type='section' and g.section_key=p_section_key)));
end $$;
revoke all on function private.tttracker_v2_party_user_has_scoped_permission(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function private.tttracker_v2_party_user_has_scoped_permission(uuid,text,text,uuid) to service_role;
-- Authenticated caller only; no caller-supplied user identity. Private helpers remain canonical.
create or replace function public.tttracker_v2_project_access(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
 p public.v2_projects; host_access boolean; party_rows jsonb; rights jsonb; shared jsonb;
 material_enabled boolean; settings_view boolean; settings_configure boolean;
begin
 if auth.uid() is null then return null; end if;
 select * into p from public.v2_projects where id=p_project_id and status<>'archived';
 if not found then return null; end if;
 host_access := private.tttracker_v2_is_active_org_member(p.organisation_id,auth.uid())
   and private.tttracker_v2_is_project_member(p.id);
 select coalesce(jsonb_agg(jsonb_build_object('id',pp.id,'userId',pu.id,
   'organisationId',pp.linked_organisation_id,'name',pp.display_name,
   'materialsEnabled',d.id is not null and coalesce(ps.enabled,d.default_enabled,false)
      and (d.permission_key is null or private.tttracker_v2_party_user_has_scoped_permission(pp.id,d.permission_key,'materials',auth.uid())),
   'sharingMode',coalesce(ps.sharing_mode,d.default_sharing_mode,'selected_records'))),'[]'::jsonb)
 into party_rows from public.v2_project_party_users pu
 join public.v2_project_parties pp on pp.id=pu.project_party_id and pp.project_id=pu.project_id
 left join public.v2_client_portal_section_definitions d on d.host_organisation_id=pp.host_organisation_id
   and d.section_key='materials' and d.is_active=true
 left join public.v2_project_party_portal_sections ps on ps.project_party_id=pp.id
   and ps.project_id=p.id and ps.section_key='materials'
 where pu.user_id=auth.uid() and pu.project_id=p.id and pu.status='active'
   and pp.status='active' and pp.portal_enabled=true
   and pp.host_organisation_id=coalesce(p.host_organisation_id,p.organisation_id);
 if not host_access and jsonb_array_length(party_rows)=0 then return null; end if;
 material_enabled := exists(select 1 from public.organisation_modules m
   where m.organisation_id=coalesce(p.host_organisation_id,p.organisation_id)
     and m.module_key='materials' and m.enabled=true)
   and exists(select 1 from public.v2_section_definitions d where d.scope='project'
     and d.section_key='project_materials' and d.implementation_status='ready')
   and coalesce((select enabled from public.v2_project_section_settings
        where project_id=p.id and section_key='project_materials'),
     (select default_enabled from public.v2_section_definitions d where d.scope='project'
       and d.section_key='project_materials'),false);
 -- Carry per-party rights so the application can bind grants to the selected workspace participant.
 select coalesce(jsonb_agg(party || jsonb_build_object('permissions',(
   select jsonb_object_agg(k,material_enabled and (party->>'materialsEnabled')::boolean
     and private.tttracker_v2_party_user_has_scoped_permission((party->>'id')::uuid,
       case when k='materials.view' then 'materials.view_shared' else k end,'materials',auth.uid()))
   from unnest(array['materials.view','materials.import','materials.check_bundles',
     'materials.manage_deliveries','materials.manage_issues','materials.manage_movements',
     'materials.manage_reservations','materials.manage_amendments','materials.configure','materials.issues.view']) k
 ))),'[]'::jsonb) into party_rows from jsonb_array_elements(party_rows) party;
 select coalesce(jsonb_object_agg(k, material_enabled and case when host_access then
     private.tttracker_v2_has_project_permission(p.organisation_id,p.id,k)
   else exists(select 1 from jsonb_array_elements(party_rows) party
       where (party->>'materialsEnabled')::boolean
         and private.tttracker_v2_party_user_has_scoped_permission((party->>'id')::uuid,
           case when k='materials.view' then 'materials.view_shared' else k end,'materials',auth.uid()))
   end),'{}'::jsonb) into rights
 from unnest(array['materials.view','materials.import','materials.check_bundles',
   'materials.manage_deliveries','materials.manage_issues','materials.manage_movements',
   'materials.manage_reservations','materials.manage_amendments','materials.configure',
   'materials.issues.view']) k;
 select coalesce(jsonb_agg(jsonb_build_object('type',s.record_type,'id',s.record_id,'accessLevel',s.access_level,'partyId',s.project_party_id)),'[]'::jsonb)
 into shared from public.v2_record_party_shares s
 where s.project_id=p.id and s.is_active=true and exists(
   select 1 from jsonb_array_elements(party_rows) party
   where (party->>'id')::uuid=s.project_party_id and (party->>'materialsEnabled')::boolean
     and party->>'sharingMode' in ('selected_records','live_filtered'));
 settings_view := host_access and private.tttracker_v2_has_project_permission(p.organisation_id,p.id,'project.settings.view');
 settings_configure := host_access and private.tttracker_v2_has_project_permission(p.organisation_id,p.id,'project.settings.configure');
 return jsonb_build_object('kind',case when host_access then 'host' else 'party' end,
   'projectId',p.id,'dataOrganisationId',p.organisation_id,
   'hostOrganisationId',coalesce(p.host_organisation_id,p.organisation_id),
   'parties',case when host_access then '[]'::jsonb else party_rows end,
   'permissions',rights,'shares',shared,'settingsView',settings_view,'settingsConfigure',settings_configure);
end $$;
revoke all on function public.tttracker_v2_project_access(uuid) from public, anon;
grant execute on function public.tttracker_v2_project_access(uuid) to authenticated;
-- Enforce project relationships again inside each write transaction, after application authorization.
-- FOR SHARE prevents the referenced row being reparented while the mutation commits.
create or replace function private.tttracker_v2_material_relationship_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare doc jsonb:=to_jsonb(new); project_id uuid; org_id uuid; relation record; target jsonb; bundle jsonb; item jsonb; tower_field text;
begin
 project_id := nullif(doc->>'project_id','')::uuid;
 org_id := nullif(doc->>'organisation_id','')::uuid;
 if tg_table_name='v2_material_amendment_items' then
   select to_jsonb(a) into target from public.v2_material_amendments a
     where a.id=(doc->>'amendment_id')::uuid for share;
   project_id:=(target->>'project_id')::uuid; org_id:=(target->>'organisation_id')::uuid;
 end if;
 if project_id is null or org_id is null or not exists(select 1 from public.v2_projects p
    where p.id=project_id and p.organisation_id=org_id) then
   raise exception using errcode='23514',message='MATERIALS_RELATIONSHIP_INVALID';
 end if;
 for relation in select * from (values
   ('tower_id','v2_towers'),('source_tower_id','v2_towers'),('destination_tower_id','v2_towers'),('current_tower_id','v2_towers'),
   ('bundle_id','v2_material_bundles'),('material_item_id','v2_material_register'),('base_material_item_id','v2_material_register'),
   ('delivery_id','v2_material_deliveries'),('delivery_item_id','v2_material_delivery_items'),
   ('location_id','v2_material_locations'),('source_location_id','v2_material_locations'),('destination_location_id','v2_material_locations'),('current_location_id','v2_material_locations'),
   ('issue_id','v2_material_issues'),('reservation_id','v2_material_reservations'),('amendment_id','v2_material_amendments'),
   ('docket_id','v2_daily_dockets'),('raised_docket_id','v2_daily_dockets')
 ) refs(field_name,table_name) loop
   if nullif(doc->>relation.field_name,'') is null then continue; end if;
   target:=null;
   execute format('select to_jsonb(r) from public.%I r where id=$1 and project_id=$2 and organisation_id=$3 for share',relation.table_name)
     into target using (doc->>relation.field_name)::uuid,project_id,org_id;
   if target is null then raise exception using errcode='23514',message='MATERIALS_RELATIONSHIP_INVALID'; end if;
   tower_field:=case relation.field_name
     when 'location_id' then 'tower_id' when 'source_location_id' then 'source_tower_id'
     when 'destination_location_id' then 'destination_tower_id' when 'current_location_id' then 'current_tower_id' end;
   if tower_field is not null and target->>'tower_id' is not null and doc->>tower_field is not null
      and target->>'tower_id' is distinct from doc->>tower_field then
     raise exception using errcode='23514',message='MATERIALS_RELATIONSHIP_INVALID';
   end if;
   if relation.field_name='bundle_id' then bundle:=target; end if;
   if relation.field_name='material_item_id' then item:=target; end if;
   if relation.field_name='delivery_item_id' and (
      (doc->>'bundle_id' is not null and target->>'bundle_id' is distinct from doc->>'bundle_id') or
      (doc->>'tower_id' is not null and target->>'tower_id' is distinct from doc->>'tower_id')) then
      raise exception using errcode='23514',message='MATERIALS_RELATIONSHIP_INVALID';
   end if;
 end loop;
 if tg_table_name in ('v2_material_bundle_checks','v2_material_member_checks','v2_material_delivery_items') and bundle is not null
   and bundle->>'tower_id' is distinct from doc->>'tower_id' then
   raise exception using errcode='23514',message='MATERIALS_RELATIONSHIP_INVALID';
 end if;
 if tg_table_name='v2_material_member_checks' and item is not null
   and (item->>'bundle_id' is distinct from doc->>'bundle_id' or item->>'tower_id' is distinct from doc->>'tower_id') then
   raise exception using errcode='23514',message='MATERIALS_RELATIONSHIP_INVALID';
 end if;
 return new;
end $$;
revoke all on function private.tttracker_v2_material_relationship_guard() from public,anon,authenticated;
do $$ declare tbl text; begin
 foreach tbl in array array['v2_material_register','v2_material_bundles','v2_material_bundle_members',
   'v2_material_bundle_checks','v2_material_member_checks','v2_material_locations','v2_material_issues',
   'v2_material_issue_events','v2_material_movements','v2_material_reservations','v2_material_amendments',
   'v2_material_amendment_items','v2_material_deliveries','v2_material_delivery_items'] loop
   if to_regclass('public.'||tbl) is not null then
     execute format('drop trigger if exists v2_material_relationship_guard on public.%I',tbl);
     execute format('create trigger v2_material_relationship_guard before insert or update on public.%I for each row execute function private.tttracker_v2_material_relationship_guard()',tbl);
   end if;
 end loop;
end $$;
commit;
notify pgrst,'reload schema';

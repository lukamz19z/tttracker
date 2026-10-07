-- Workspace navigation reads existing dynamic permissions and commercial entitlements.
begin;
create or replace function public.tttracker_v2_workspace_access(p_organisation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.tttracker_v2_is_organisation_member(p_organisation_id) then
  raise exception 'WORKSPACE_ORGANISATION_ACCESS_DENIED' using errcode = '42501';
 end if;
 return jsonb_build_object(
  'permissions',(select coalesce(jsonb_object_agg(p.permission_code,
    private.tttracker_v2_has_permission(p_organisation_id,p.permission_code)),'{}'::jsonb)
    from public.v2_permissions p where p.is_active),
  'modules',(select coalesce(jsonb_agg(m.module_key),'[]'::jsonb)
    from public.organisation_modules m where m.organisation_id=p_organisation_id
      and m.enabled and private.tttracker_v2_has_feature(p_organisation_id,m.module_key))
 );
end;
$$;
revoke all on function public.tttracker_v2_workspace_access(uuid) from public,anon;
grant execute on function public.tttracker_v2_workspace_access(uuid) to authenticated;
-- Foundation pages expose no People/Assets records; customer section overrides still win.
update public.v2_section_definitions set implementation_status='ready',default_enabled=true
 where section_key='workspace_people' and scope='workspace' and implementation_status='planned';
insert into public.v2_section_definitions(section_key,scope,label,route_segment,module_key,icon_key,sort_order,implementation_status,default_enabled)
values('workspace_assets','workspace','Assets','assets','assets','truck',40,'ready',true)
on conflict(section_key) do nothing;
notify pgrst, 'reload schema';
commit;

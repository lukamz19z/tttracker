-- Dynamic host project scope; no membership fanout or tenant-role bypass.
begin;
insert into public.v2_permissions(resource_id,permission_code,action_key,name)
select id,'projects.access_all','access_all','Access all organisation projects'
from public.v2_resources where resource_key='projects'
on conflict(permission_code) do nothing;
-- Canonical system-role code identifies the bootstrap default only. Runtime uses permissions.
insert into public.v2_role_permissions(organisation_id,role_id,permission_id,allowed)
select r.organisation_id,r.id,p.id,true from public.v2_roles r
cross join public.v2_permissions p
where r.is_system and r.is_active and r.code='admin'
 and p.permission_code='projects.access_all' and p.is_active
on conflict(role_id,permission_id) do nothing;

-- Historical helper name retained for existing RLS and permission callers.
-- It resolves host participation, explicit or permission-derived, without creating membership rows.
create or replace function private.tttracker_v2_is_project_member(target_project_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.v2_projects p
 where p.id=target_project_id and p.status<>'archived'
 and private.tttracker_v2_is_active_org_member(p.organisation_id,auth.uid())
 and (private.tttracker_v2_has_permission(p.organisation_id,'projects.access_all')
 or exists(select 1 from public.v2_project_users u where u.project_id=p.id
  and u.organisation_id=p.organisation_id and u.user_id=auth.uid() and u.status='active')));
$$;
create or replace function public.tttracker_v2_accessible_projects()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb := '[]'::jsonb; project public.v2_projects; access jsonb;
begin
 if auth.uid() is null then return result; end if;
 for project in select p.* from public.v2_projects p where p.status<>'archived'
 and (private.tttracker_v2_is_project_member(p.id)
 or exists(select 1 from public.v2_project_party_users u where u.project_id=p.id
   and u.user_id=auth.uid() and u.status='active')) order by p.name
 loop
   access := public.tttracker_v2_project_access(project.id);
   if access is not null then
     result := result || jsonb_build_array(jsonb_build_object('project',jsonb_build_object(
       'id',project.id,'name',project.name,'project_number',project.project_number,
       'code',project.code,'status',project.status,
       'client_name',case when access->>'kind'='host' then project.client_name end,
       'location',case when access->>'kind'='host' then project.location end,
       'expected_tower_count',case when access->>'kind'='host' then project.expected_tower_count end), 'access',access));
   end if;
 end loop;
 return result;
end;
$$;
revoke all on function public.tttracker_v2_accessible_projects() from public,anon;
grant execute on function public.tttracker_v2_accessible_projects() to authenticated;
commit;
notify pgrst,'reload schema';

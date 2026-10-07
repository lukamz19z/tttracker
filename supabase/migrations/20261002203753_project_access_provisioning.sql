-- Creator enrollment is part of the project INSERT transaction, not a second API request.
begin;
create or replace function private.tttracker_v2_enroll_project_creator()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.created_by is not null then
   if not private.tttracker_v2_is_active_org_member(new.organisation_id,new.created_by) then
     raise exception 'PROJECT_CREATOR_ORGANISATION_MEMBERSHIP_REQUIRED';
   end if;
   insert into public.v2_project_users(organisation_id,project_id,user_id,status,access_level,joined_at,metadata)
   values(new.organisation_id,new.id,new.created_by,'active','member',now(),
     jsonb_build_object('source','project_creator'))
   on conflict(project_id,user_id) do nothing;
 end if;
 return new;
end;
$$;
revoke all on function private.tttracker_v2_enroll_project_creator() from public,anon,authenticated;
drop trigger if exists v2_projects_enroll_creator on public.v2_projects;
create trigger v2_projects_enroll_creator after insert on public.v2_projects
for each row execute function private.tttracker_v2_enroll_project_creator();
-- Never infer ownership from role names or reactivate suspended/removed memberships.
insert into public.v2_project_users(organisation_id,project_id,user_id,status,access_level,joined_at,metadata)
select p.organisation_id,p.id,p.created_by,'active','member',now(),
 jsonb_build_object('source','verified_project_creator_backfill')
from public.v2_projects p where p.created_by is not null and p.status<>'archived'
 and private.tttracker_v2_is_active_org_member(p.organisation_id,p.created_by)
on conflict(project_id,user_id) do nothing;
-- Existing system Administrator definitions have always seeded all registered permissions.
-- Fill only missing capability grants; preserve configured denies and custom roles.
insert into public.v2_role_permissions(organisation_id,role_id,permission_id,allowed)
select r.organisation_id,r.id,p.id,true from public.v2_roles r
cross join public.v2_permissions p
where r.is_system=true and r.is_active=true and r.code='admin'
 and p.is_active=true and p.permission_code like 'materials.%'
on conflict(role_id,permission_id) do nothing;
-- Discovery delegates authorization to the same RPC as direct project routes.
create or replace function public.tttracker_v2_accessible_projects()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb := '[]'::jsonb; project public.v2_projects; access jsonb;
begin
 if auth.uid() is null then return result; end if;
 for project in select p.* from public.v2_projects p where p.status<>'archived'
 and (exists(select 1 from public.v2_project_users u where u.project_id=p.id
   and u.user_id=auth.uid() and u.status='active')
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
notify pgrst,'reload schema';
commit;

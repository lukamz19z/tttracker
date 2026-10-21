-- Missing integration defaults only: preserve all existing grants/denies and custom roles.
begin;
insert into public.v2_role_permissions(organisation_id,role_id,permission_id,allowed)
select r.organisation_id,r.id,p.id,true
from public.v2_roles r
cross join public.v2_permissions p
where r.is_system and r.is_active
  and r.metadata->>'initial_invitation_default'='true'
  and p.is_active
  and p.permission_code in (
    'integrations.sharepoint.view','integrations.sharepoint.manage',
    'integrations.xero.view','integrations.xero.manage'
  )
  and not exists (
    select 1 from public.v2_role_permissions existing
    where existing.organisation_id=r.organisation_id
      and existing.role_id=r.id and existing.permission_id=p.id
  )
on conflict do nothing;
notify pgrst,'reload schema';
commit;

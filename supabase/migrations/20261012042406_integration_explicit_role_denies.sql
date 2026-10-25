begin;
create or replace function private.tttracker_v2_has_permission(
  target_organisation_id uuid,
  target_permission_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_permission_id uuid;
begin
  if current_user_id is null then
    return false;
  end if;

  if not private.tttracker_v2_is_organisation_member(target_organisation_id) then
    return false;
  end if;

  select p.id into target_permission_id
  from public.v2_permissions p
  where p.permission_code = target_permission_code
    and p.is_active = true
  limit 1;

  if target_permission_id is null then
    return false;
  end if;

  -- Integration role denies win even when another role or user override allows.
  if target_permission_code like 'integrations.%' and exists (
    select 1 from public.v2_user_role_assignments a
    join public.v2_roles r on r.id=a.role_id and r.organisation_id=a.organisation_id
    join public.v2_role_permissions p on p.role_id=r.id and p.organisation_id=r.organisation_id
    where a.organisation_id=target_organisation_id and a.user_id=current_user_id
      and a.status='active' and (a.expires_at is null or a.expires_at>now())
      and r.is_active and p.permission_id=target_permission_id and p.allowed=false
  ) then return false; end if;

  if exists (
    select 1
    from public.v2_user_permission_overrides upo
    where upo.organisation_id = target_organisation_id
      and upo.user_id = current_user_id
      and upo.permission_id = target_permission_id
      and upo.effect = 'deny'
      and (upo.expires_at is null or upo.expires_at > now())
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.v2_user_permission_overrides upo
    where upo.organisation_id = target_organisation_id
      and upo.user_id = current_user_id
      and upo.permission_id = target_permission_id
      and upo.effect = 'allow'
      and (upo.expires_at is null or upo.expires_at > now())
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.v2_user_role_assignments ura
    join public.v2_roles r
      on r.id = ura.role_id
     and r.organisation_id = ura.organisation_id
    join public.v2_role_permissions rp
      on rp.role_id = r.id
     and rp.organisation_id = r.organisation_id
    where ura.organisation_id = target_organisation_id
      and ura.user_id = current_user_id
      and ura.status = 'active'
      and (ura.expires_at is null or ura.expires_at > now())
      and r.is_active = true
      and rp.permission_id = target_permission_id
      and rp.allowed = true
  );
end;
$$;
notify pgrst,'reload schema';
commit;

;

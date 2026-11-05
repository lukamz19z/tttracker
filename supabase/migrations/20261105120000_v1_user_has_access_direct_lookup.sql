-- Replace the broad permission lookup in this hot path with
-- indexed, single-user/single-access-area lookups.

create or replace function public.user_has_access(
  p_user_id uuid,
  p_access_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_access_area_id uuid;
  v_override boolean;
begin
  if p_user_id is null or nullif(btrim(p_access_code), '') is null then
    return false;
  end if;

  select aa.id
    into v_access_area_id
    from public.access_areas aa
   where aa.code = p_access_code
     and aa.is_active = true
   limit 1;

  if v_access_area_id is null then
    return false;
  end if;

  select upo.allowed
    into v_override
    from public.user_permission_overrides upo
   where upo.user_id = p_user_id
     and upo.access_area_id = v_access_area_id;

  if found then
    return coalesce(v_override, false);
  end if;

  return exists (
    select 1
      from public.user_role_assignments ura
      join public.roles r
        on r.id = ura.role_id
       and r.is_active = true
     where ura.user_id = p_user_id
       and (
         r.grants_all = true
         or exists (
           select 1
             from public.role_permissions rp
            where rp.role_id = r.id
              and rp.access_area_id = v_access_area_id
              and rp.allowed = true
         )
       )
  );
end;
$function$;

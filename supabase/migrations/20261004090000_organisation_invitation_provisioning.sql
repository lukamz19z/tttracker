-- Canonical intended roles and atomic invitation acceptance. No tenant access for the operator.
begin;
alter table public.v2_organisation_invitations add column if not exists accepted_at timestamptz;
alter table public.v2_organisation_invitations add column if not exists intended_role_id uuid references public.v2_roles(id) on delete restrict;
-- Existing bootstrap convention is the tenant system Administrator, not a separate owner identity.
-- Create defaults only for organisations lacking that role; never reseed an existing role.
with new_roles as (
 insert into public.v2_roles(organisation_id,code,name,description,is_system,sort_order,metadata)
 select o.id,'admin','Administrator','Organisation administrator.',true,10,'{"initial_invitation_default":true}'::jsonb
 from public.organisations o where not exists(select 1 from public.v2_roles r where r.organisation_id=o.id and r.code='admin')
 returning id,organisation_id
)
insert into public.v2_role_permissions(organisation_id,role_id,permission_id,allowed)
select r.organisation_id,r.id,p.id,true from new_roles r cross join public.v2_permissions p where p.is_active;
update public.v2_roles set metadata=metadata || '{"initial_invitation_default":true}'::jsonb
where is_system and code='admin' and not (metadata ? 'initial_invitation_default');
update public.v2_organisation_invitations i set intended_role_id=r.id
from public.v2_roles r where i.intended_role_id is null and r.organisation_id=i.organisation_id and r.code=i.intended_role_code;
create or replace function public.tttracker_v2_platform_invitation(
 p_actor uuid,p_action text,p_organisation_id uuid default null,p_role_id uuid default null,p_email text default null,p_invitation_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.v2_organisation_invitations%rowtype; r public.v2_roles%rowtype; v_email text=lower(btrim(p_email)); v_created uuid;
begin
 if not exists(select 1 from public.v2_platform_admins where user_id=p_actor and status='active' and role in ('owner','admin')) then raise exception 'PLATFORM_ACCESS_DENIED'; end if;
 if p_action in ('bootstrap','create') then
  perform 1 from public.organisations where id=p_organisation_id and status='active' for update;
  if not found then raise exception 'ORGANISATION_NOT_AVAILABLE'; end if;
  if p_action='bootstrap' then
   select * into r from public.v2_roles where organisation_id=p_organisation_id and metadata->>'initial_invitation_default'='true' and is_system and is_active;
   if r.id is null then
    if exists(select 1 from public.v2_roles where organisation_id=p_organisation_id and code='admin') then raise exception 'INITIAL_ROLE_REQUIRES_CONFIGURATION'; end if;
    insert into public.v2_roles(organisation_id,code,name,description,is_system,sort_order,created_by,metadata)
    values(p_organisation_id,'admin','Administrator','Organisation administrator.',true,10,p_actor,'{"initial_invitation_default":true}') returning * into r;
    insert into public.v2_role_permissions(organisation_id,role_id,permission_id,allowed,created_by)
    select p_organisation_id,r.id,p.id,true,p_actor from public.v2_permissions p where p.is_active;
   end if;
   return jsonb_build_object('roleId',r.id);
  end if;
  select * into r from public.v2_roles where id=p_role_id and organisation_id=p_organisation_id and is_active;
  if r.id is null then raise exception 'INVITATION_ROLE_NOT_AVAILABLE'; end if;
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVITATION_EMAIL_INVALID'; end if;
  if exists(select 1 from public.organisation_users m join auth.users u on u.id=m.user_id where m.organisation_id=p_organisation_id and m.status='active' and lower(u.email)=v_email) then raise exception 'ORGANISATION_MEMBER_ALREADY_ACTIVE'; end if;
  if exists(select 1 from public.v2_organisation_invitations where organisation_id=p_organisation_id and lower(email)=v_email and status='pending' and (expires_at is null or expires_at>now())) then raise exception 'INVITATION_ALREADY_PENDING'; end if;
  update public.v2_organisation_invitations set status='expired' where organisation_id=p_organisation_id and lower(email)=v_email and status='pending' and expires_at<=now();
  insert into public.v2_organisation_invitations(organisation_id,email,intended_role_id,intended_role_code,invitation_type,invited_by,expires_at)
  values(p_organisation_id,v_email,r.id,r.code,'organisation_user',p_actor,now()+interval '7 days') returning id into v_created;
  return jsonb_build_object('invitationId',v_created);
 end if;
 select * into i from public.v2_organisation_invitations where id=p_invitation_id for update;
 if i.id is null then raise exception 'INVITATION_NOT_AVAILABLE'; end if;
 if i.status='accepted' then raise exception 'INVITATION_ALREADY_ACCEPTED'; end if;
 if p_action='revoke' then
  update public.v2_organisation_invitations set status='cancelled',last_error=null,metadata=metadata||jsonb_build_object('cancelled',jsonb_build_object('actor',p_actor,'at',now())) where id=i.id;
 elsif p_action='resend' then
  if i.status='cancelled' then raise exception 'INVITATION_REVOKED'; end if;
  perform 1 from public.organisations where id=i.organisation_id for update;
  if exists(select 1 from public.v2_organisation_invitations where organisation_id=i.organisation_id and lower(email)=lower(i.email) and id<>i.id and status='pending' and (expires_at is null or expires_at>now())) then raise exception 'INVITATION_ALREADY_PENDING'; end if;
  if not exists(select 1 from public.v2_roles where id=i.intended_role_id and organisation_id=i.organisation_id and is_active) then raise exception 'INVITATION_ROLE_NOT_AVAILABLE'; end if;
  update public.v2_organisation_invitations set status='pending',expires_at=now()+interval '7 days' where id=i.id;
 elsif p_action='change_email' then
  if i.status not in ('pending','expired') then raise exception 'INVITATION_NOT_PENDING'; end if;
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVITATION_EMAIL_INVALID'; end if;
  -- Serialise edits with creation for this organisation; the invite row lock protects acceptance.
  perform 1 from public.organisations where id=i.organisation_id for update;
  if exists(select 1 from public.v2_organisation_invitations where organisation_id=i.organisation_id and lower(email)=v_email and status='pending' and id<>i.id)
   or exists(select 1 from public.organisation_users m join auth.users u on u.id=m.user_id where m.organisation_id=i.organisation_id and m.status='active' and lower(u.email)=v_email) then raise exception 'INVITATION_EMAIL_ALREADY_IN_USE'; end if;
  update public.v2_organisation_invitations set email=v_email,auth_user_id=null,last_sent_at=null,last_error=null,
   metadata=metadata||jsonb_build_object('last_email_change',jsonb_build_object('from',i.email,'to',v_email,'actor',p_actor,'at',now())) where id=i.id;
 else raise exception 'INVITATION_ACTION_INVALID'; end if;
 return jsonb_build_object('invitationId',i.id);
end; $$;
revoke all on function public.tttracker_v2_platform_invitation(uuid,text,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.tttracker_v2_platform_invitation(uuid,text,uuid,uuid,text,uuid) to service_role;
create or replace function public.tttracker_v2_accept_organisation_invitation(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.v2_organisation_invitations%rowtype; v_user uuid=auth.uid(); v_email text;
begin
 select lower(email) into v_email from auth.users where id=v_user and email_confirmed_at is not null;
 if v_user is null or v_email is null then raise exception 'INVITATION_AUTHENTICATION_REQUIRED'; end if;
 select * into i from public.v2_organisation_invitations where id=p_invitation_id for update;
 if i.id is null or lower(i.email)<>v_email or (i.auth_user_id is not null and i.auth_user_id<>v_user) then raise exception 'INVITATION_ACCESS_DENIED'; end if;
 if i.status='accepted' then
  if i.accepted_user_id<>v_user then raise exception 'INVITATION_ACCESS_DENIED'; end if;
  return jsonb_build_object('organisationId',i.organisation_id,'alreadyAccepted',true);
 end if;
 if i.status<>'pending' or (i.expires_at is not null and i.expires_at<=now()) then raise exception 'INVITATION_NOT_PENDING_OR_EXPIRED'; end if;
 if not exists(select 1 from public.organisations where id=i.organisation_id and status='active') then raise exception 'ORGANISATION_NOT_AVAILABLE'; end if;
 if not exists(select 1 from public.v2_roles where id=i.intended_role_id and organisation_id=i.organisation_id and is_active) then raise exception 'INVITATION_ROLE_NOT_AVAILABLE'; end if;
 insert into public.organisation_users(organisation_id,user_id,status,joined_at,invited_by,metadata)
 values(i.organisation_id,v_user,'active',now(),i.invited_by,jsonb_build_object('invitation_id',i.id))
 on conflict(organisation_id,user_id) do update set status='active',joined_at=coalesce(public.organisation_users.joined_at,excluded.joined_at),metadata=public.organisation_users.metadata||excluded.metadata;
 insert into public.v2_user_role_assignments(organisation_id,user_id,role_id,status,assigned_by,metadata)
 values(i.organisation_id,v_user,i.intended_role_id,'active',i.invited_by,jsonb_build_object('invitation_id',i.id))
 on conflict(organisation_id,user_id,role_id) do update set status='active',expires_at=null,assigned_by=excluded.assigned_by,assigned_at=now(),metadata=public.v2_user_role_assignments.metadata||excluded.metadata;
 update public.v2_organisation_invitations set status='accepted',accepted_user_id=v_user,auth_user_id=v_user,accepted_at=now() where id=i.id;
 insert into public.v2_organisation_setup_state(organisation_id) values(i.organisation_id) on conflict(organisation_id) do nothing;
 return jsonb_build_object('organisationId',i.organisation_id,'alreadyAccepted',false);
end; $$;
revoke all on function public.tttracker_v2_accept_organisation_invitation(uuid) from public,anon;
grant execute on function public.tttracker_v2_accept_organisation_invitation(uuid) to authenticated;
notify pgrst,'reload schema';
commit;

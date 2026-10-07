begin;
alter table public.v2_daily_dockets add column if not exists crew_id uuid;
alter table public.v2_daily_dockets add column if not exists crew_snapshot jsonb;
alter table public.v2_daily_dockets add constraint v2_daily_dockets_crew_org_fk foreign key(organisation_id,crew_id) references public.v2_crews(organisation_id,id);
create or replace function private.tttracker_v2_docket_crew_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
begin
if new.crew_id is null then new.crew_snapshot:=null;return new;end if;
if tg_op='UPDATE' and new.crew_id is not distinct from old.crew_id and new.docket_date=old.docket_date then new.crew_snapshot:=old.crew_snapshot;return new;end if;
if not exists(select 1 from public.v2_crew_projects where organisation_id=new.organisation_id and crew_id=new.crew_id and project_id=new.project_id and assigned_at::date<=new.docket_date and (ended_at is null or ended_at::date>=new.docket_date)) then raise exception 'PEOPLE_RELATIONSHIP_INVALID';end if;
new.crew_label:=(select name from public.v2_crews where organisation_id=new.organisation_id and id=new.crew_id);
new.crew_snapshot:=jsonb_build_object('crew_id',new.crew_id,'crew_name',new.crew_label,'as_of',new.docket_date,'members',
(select coalesce(jsonb_agg(jsonb_build_object('person_id',p.id,'name',p.display_name,'membership_id',m.id)),'[]') from public.v2_crew_members m join public.v2_people p on p.id=m.person_id and p.organisation_id=m.organisation_id where m.organisation_id=new.organisation_id and m.crew_id=new.crew_id and m.joined_at::date<=new.docket_date and (m.left_at is null or m.left_at::date>=new.docket_date)));
return new;
end $$;
create trigger v2_daily_dockets_crew_snapshot before insert or update of crew_id,docket_date,crew_snapshot on public.v2_daily_dockets for each row execute function private.tttracker_v2_docket_crew_snapshot();
revoke all on function private.tttracker_v2_docket_crew_snapshot() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;

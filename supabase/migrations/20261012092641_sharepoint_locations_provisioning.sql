begin;
-- Sites are organisation-owned candidates until Graph verification succeeds.
alter table public.v2_sharepoint_sites alter column site_id drop not null;
alter table public.v2_sharepoint_sites add column if not exists permission_status text not null default 'candidate' check(permission_status in ('candidate','verified','permission_required','error'));
alter table public.v2_sharepoint_sites add column if not exists is_active boolean not null default true;
alter table public.v2_sharepoint_sites add column if not exists last_checked_at timestamptz;
alter table public.v2_sharepoint_sites add column if not exists last_error text;
update public.v2_sharepoint_sites set permission_status='verified' where verified_at is not null;
create unique index if not exists v2_sharepoint_site_url_unique on public.v2_sharepoint_sites(integration_id,lower(site_url));
create table if not exists public.v2_sharepoint_locations(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,site_id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 120),drive_id text not null,drive_name text not null,
 root_path text not null default '',root_item_id text,is_active boolean not null default true,
 last_checked_at timestamptz,last_success_at timestamptz,last_error text,
 unique(organisation_id,id),unique(organisation_id,id,site_id),unique(organisation_id,site_id,drive_id,root_path),
 foreign key(organisation_id,site_id) references public.v2_sharepoint_sites(organisation_id,id)
);
-- Retain every existing destination; mirror the old selected library once.
insert into public.v2_sharepoint_locations(organisation_id,site_id,name,drive_id,drive_name)
 select organisation_id,id,site_name||' / '||coalesce(drive_name,'Documents'),drive_id,coalesce(drive_name,'Documents') from public.v2_sharepoint_sites where drive_id is not null
 on conflict(organisation_id,site_id,drive_id,root_path) do nothing;
alter table public.v2_document_destinations add column if not exists location_id uuid;
alter table public.v2_document_destinations add column if not exists child_folders jsonb not null default '[]' check(jsonb_typeof(child_folders)='array' and jsonb_array_length(child_folders)<=20);
alter table public.v2_document_destinations add column if not exists rename_policy text not null default 'keep' check(rename_policy in ('keep','rename'));
alter table public.v2_document_destinations add column if not exists relationship_type_id uuid;
alter table public.v2_document_destinations add column if not exists priority integer not null default 0;
alter table public.v2_document_destinations add column if not exists configured_by uuid references auth.users(id);
update public.v2_document_destinations d set location_id=l.id from public.v2_sharepoint_locations l where d.location_id is null and l.organisation_id=d.organisation_id and l.site_id=d.site_id and l.root_path='';
do $$ begin if not exists(select 1 from pg_constraint where conname='v2_destination_location_scope' and conrelid='public.v2_document_destinations'::regclass) then alter table public.v2_document_destinations add constraint v2_destination_location_scope foreign key(organisation_id,location_id,site_id) references public.v2_sharepoint_locations(organisation_id,id,site_id); end if;end $$;
do $$ begin if not exists(select 1 from pg_constraint where conname='v2_destination_worker_scope' and conrelid='public.v2_document_destinations'::regclass) then alter table public.v2_document_destinations add constraint v2_destination_worker_scope foreign key(organisation_id,relationship_type_id) references public.v2_person_types(organisation_id,id); end if;end $$;
create table if not exists public.v2_sharepoint_folder_links(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,location_id uuid not null,rule_id uuid not null,
 entity_kind text not null check(entity_kind in ('person','project')),entity_id uuid not null,
 site_id text not null,drive_id text not null,drive_item_id text not null,parent_item_id text not null,
 folder_name text not null,path_snapshot text not null,updated_at timestamptz not null default now(),
 unique(organisation_id,id),unique(organisation_id,location_id,rule_id,entity_kind,entity_id),
 foreign key(organisation_id,location_id) references public.v2_sharepoint_locations(organisation_id,id),
 foreign key(organisation_id,rule_id) references public.v2_document_destinations(organisation_id,id)
);
create table if not exists public.v2_sharepoint_folder_jobs(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,rule_id uuid not null,location_id uuid not null,
 entity_kind text not null check(entity_kind in ('person','project')),entity_id uuid not null,
 status text not null default 'pending' check(status in ('pending','provisioning','ready','failed')),
 actor_id uuid references auth.users(id),attempts integer not null default 0,lease_id uuid,lease_until timestamptz,
 available_at timestamptz not null default now(),started_at timestamptz,finished_at timestamptz,last_error text,
 outcome text check(outcome in ('created','existing','renamed')),revision integer not null default 1,claimed_revision integer,
 unique(organisation_id,id),unique(organisation_id,rule_id,location_id,entity_kind,entity_id),
 foreign key(organisation_id,rule_id) references public.v2_document_destinations(organisation_id,id),
 foreign key(organisation_id,location_id) references public.v2_sharepoint_locations(organisation_id,id)
);
create index if not exists v2_sharepoint_folder_jobs_due on public.v2_sharepoint_folder_jobs(organisation_id,status,available_at);
create or replace function public.tttracker_v2_queue_folder(p_org uuid,p_rule uuid,p_kind text,p_record uuid,p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.v2_document_destinations; begin
 select * into r from public.v2_document_destinations where organisation_id=p_org and id=p_rule and is_active;
 if r.id is null or r.location_id is null then return;end if;
 if not exists(select 1 from public.v2_sharepoint_locations where organisation_id=p_org and id=r.location_id and is_active) then return;end if;
 if p_kind='person' and not exists(select 1 from public.v2_people where organisation_id=p_org and id=p_record) then raise exception 'INTEGRATION_SCOPE_INVALID';end if;
 if p_kind='project' and not exists(select 1 from public.v2_projects where organisation_id=p_org and id=p_record) then raise exception 'INTEGRATION_SCOPE_INVALID';end if;
 if p_kind not in ('person','project') then raise exception 'INTEGRATION_SCOPE_INVALID';end if;
 insert into public.v2_sharepoint_folder_jobs(organisation_id,rule_id,location_id,entity_kind,entity_id,actor_id)
 values(p_org,r.id,r.location_id,p_kind,p_record,p_actor)
 on conflict(organisation_id,rule_id,location_id,entity_kind,entity_id) do update set
 revision=v2_sharepoint_folder_jobs.revision+1, status=case when v2_sharepoint_folder_jobs.status='provisioning' and v2_sharepoint_folder_jobs.lease_until>now() then 'provisioning' else 'pending' end,
 available_at=now(),actor_id=excluded.actor_id,last_error=null,finished_at=null;
 end $$;
create or replace function public.tttracker_v2_claim_folder_job(p_org uuid,p_actor uuid default null,p_kind text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.v2_sharepoint_folder_jobs;begin
 select * into r from public.v2_sharepoint_folder_jobs where organisation_id=p_org and (p_kind is null or entity_kind=p_kind) and available_at<=now() and
 (status in ('pending','failed') or (status='provisioning' and lease_until<now())) order by available_at,id for update skip locked limit 1;
 if r.id is null then return null;end if;
 update public.v2_sharepoint_folder_jobs set status='provisioning',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',started_at=coalesce(started_at,now()),claimed_revision=revision,
 actor_id=coalesce(p_actor,actor_id) where id=r.id returning * into r;return to_jsonb(r);end $$;
-- Durable queueing only: no Graph/network call can block canonical record creation.
create or replace function private.tttracker_v2_sharepoint_record_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare r record;k text;trigger_key text;actor uuid; begin
 k:=case TG_TABLE_NAME when 'v2_people' then 'person' else 'project' end;
 trigger_key:=case k when 'person' then 'person_created' else 'project_created' end;
 select connected_by into actor from public.v2_integrations where organisation_id=NEW.organisation_id and provider='sharepoint' and microsoft_tenant_verified_at is not null and status<>'disconnected';
 if actor is null then return NEW;end if;
 for r in select distinct on(d.context) d.id,d.configured_by from public.v2_document_destinations d join public.v2_integration_access_profiles p on p.organisation_id=d.organisation_id and p.id=d.access_profile_id
 where d.organisation_id=NEW.organisation_id and d.is_active and d.location_id is not null and p.classification='operational' and
 (d.creation_policy=trigger_key or (TG_OP='UPDATE' and d.rename_policy='rename')) and
 ((k='person' and d.context in ('people','training','onboarding') and (d.relationship_type_id is null or d.relationship_type_id=(to_jsonb(NEW)->>'relationship_type_id')::uuid)) or (k='project' and d.context='projects'))
 order by d.context,d.priority desc,(d.relationship_type_id is not null) desc,d.id
 loop perform public.tttracker_v2_queue_folder(NEW.organisation_id,r.id,k,NEW.id,coalesce(r.configured_by,actor));end loop;return NEW;
 end $$;
drop trigger if exists v2_sharepoint_person_event on public.v2_people;
create trigger v2_sharepoint_person_event after insert or update of display_name,employee_number on public.v2_people for each row execute function private.tttracker_v2_sharepoint_record_event();
drop trigger if exists v2_sharepoint_project_event on public.v2_projects;
create trigger v2_sharepoint_project_event after insert or update of name,code,project_number on public.v2_projects for each row execute function private.tttracker_v2_sharepoint_record_event();
create or replace function private.tttracker_v2_sharepoint_onboarding_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare r record;event text;begin
 if NEW.person_id is null then return NEW;end if;
 event:=case when NEW.status='completed' then 'onboarding_approved' when NEW.status='invited' then 'onboarding_started' end;
 if event is null or (TG_OP='UPDATE' and NEW.status=OLD.status) then return NEW;end if;
 for r in select id,configured_by from public.v2_document_destinations where organisation_id=NEW.organisation_id and is_active and creation_policy=event and context in ('people','training','onboarding')
 loop perform public.tttracker_v2_queue_folder(NEW.organisation_id,r.id,'person',NEW.person_id,coalesce(r.configured_by,NEW.created_by));end loop;return NEW;end $$;
drop trigger if exists v2_sharepoint_onboarding_event on private.v2_secure_onboarding_instances;
create trigger v2_sharepoint_onboarding_event after insert or update of status on private.v2_secure_onboarding_instances for each row execute function private.tttracker_v2_sharepoint_onboarding_event();
do $$ declare t text;begin foreach t in array array['v2_sharepoint_locations','v2_sharepoint_folder_links','v2_sharepoint_folder_jobs'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
revoke all on function public.tttracker_v2_queue_folder(uuid,uuid,text,uuid,uuid),public.tttracker_v2_claim_folder_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.tttracker_v2_queue_folder(uuid,uuid,text,uuid,uuid),public.tttracker_v2_claim_folder_job(uuid,uuid,text) to service_role;
revoke all on function private.tttracker_v2_sharepoint_record_event(),private.tttracker_v2_sharepoint_onboarding_event() from public,anon,authenticated;
create or replace function private.tttracker_v2_sharepoint_document_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare r record;begin
 for r in select distinct on(d.context) d.id,d.configured_by from public.v2_document_destinations d join public.v2_integration_access_profiles a on a.id=d.access_profile_id and a.organisation_id=d.organisation_id
 join public.v2_people p on p.organisation_id=NEW.organisation_id and p.id=NEW.person_id
 where d.organisation_id=NEW.organisation_id and d.is_active and d.creation_policy='first_upload' and a.classification='operational' and d.context in ('people','training') and (d.relationship_type_id is null or d.relationship_type_id=p.relationship_type_id)
 order by d.context,d.priority desc,(d.relationship_type_id is not null) desc,d.id
 loop perform public.tttracker_v2_queue_folder(NEW.organisation_id,r.id,'person',NEW.person_id,coalesce(r.configured_by,NEW.created_by));end loop;return NEW;end $$;
drop trigger if exists v2_sharepoint_document_event on public.v2_people_documents;
create trigger v2_sharepoint_document_event after insert on public.v2_people_documents for each row execute function private.tttracker_v2_sharepoint_document_event();
revoke all on function private.tttracker_v2_sharepoint_document_event() from public,anon,authenticated;
-- Background worker re-evaluates the recorded actor through the canonical RBAC
-- engine. No grants are inferred from role names or platform authority.
create or replace function public.tttracker_v2_folder_worker_permission(p_org uuid,p_actor uuid,p_kind text,p_record uuid,p_rule uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare previous_claims text;previous_sub text;allowed boolean;cap text;begin
 previous_claims:=current_setting('request.jwt.claims',true);previous_sub:=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claims',json_build_object('sub',p_actor)::text,true);perform set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
 select p.manage_capability into cap from public.v2_document_destinations d join public.v2_integration_access_profiles p on p.organisation_id=d.organisation_id and p.id=d.access_profile_id where d.organisation_id=p_org and d.id=p_rule and d.is_active and p.classification='operational';
 allowed:=cap is not null and private.tttracker_v2_has_permission(p_org,'integrations.sharepoint.manage') and private.tttracker_v2_has_permission(p_org,cap) and
 private.tttracker_v2_has_permission(p_org,case p_kind when 'person' then 'people.edit' else 'projects.edit' end) and
 (p_kind='person' or (p_kind='project' and private.tttracker_v2_is_project_member(p_record)));
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);return coalesce(allowed,false);
 exception when others then
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);return false;
 end $$;
create or replace function public.tttracker_v2_finish_folder_job(p_org uuid,p_job uuid,p_lease uuid,p_outcome text,p_error text,p_delay integer)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.v2_sharepoint_folder_jobs set status=case when revision>claimed_revision then 'pending' when p_error is null then 'ready' else 'failed' end,
 outcome=p_outcome,last_error=p_error,finished_at=now(),lease_id=null,lease_until=null,available_at=case when revision>claimed_revision or p_error is null then now() else now()+make_interval(secs=>least(3600,greatest(15,p_delay))) end
 where organisation_id=p_org and id=p_job and lease_id=p_lease;
 return found;end $$;
revoke all on function public.tttracker_v2_folder_worker_permission(uuid,uuid,text,uuid,uuid),public.tttracker_v2_finish_folder_job(uuid,uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.tttracker_v2_folder_worker_permission(uuid,uuid,text,uuid,uuid),public.tttracker_v2_finish_folder_job(uuid,uuid,uuid,text,text,integer) to service_role;
notify pgrst,'reload schema';
commit;

;

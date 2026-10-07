begin;
insert into public.v2_permissions(resource_id,permission_code,action_key,name)
select id,'integrations.sharepoint.'||a,'sharepoint_'||a,'SharePoint integration '||a
from public.v2_resources cross join (values('view'),('manage')) x(a)
where resource_key='organisation.settings' on conflict(permission_code) do nothing;

create table public.v2_integrations (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
 provider text not null check(provider in ('sharepoint','xero')),
 status text not null default 'setup_required' check(status in ('not_connected','setup_required','connected','attention_required','disconnected')),
 tenant_id text,tenant_name text,connected_by uuid references auth.users(id),connected_at timestamptz,
 last_checked_at timestamptz,last_success_at timestamptz,last_sync_at timestamptz,error_category text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organisation_id,provider),unique(organisation_id,id)
);
create table public.v2_sharepoint_sites (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,integration_id uuid not null,
 site_id text not null,site_url text not null,site_name text not null,drive_id text,drive_name text,
 verified_at timestamptz,unique(organisation_id,id),unique(integration_id,site_id),
 foreign key(organisation_id,integration_id) references public.v2_integrations(organisation_id,id)
);
create table public.v2_integration_access_profiles (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id),
 name text not null,read_capability text not null,manage_capability text not null,
 classification text not null check(classification in ('operational','private','confidential')),
 native_mode text not null default 'inherit' check(native_mode='inherit'),unique(organisation_id,id),
 foreign key(read_capability) references public.v2_permissions(permission_code),
 foreign key(manage_capability) references public.v2_permissions(permission_code)
);
create table public.v2_document_destinations (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,site_id uuid not null,
 name text not null check(length(name) between 1 and 120),code text not null,context text not null,
 root_path text not null default '',folder_template text not null default '',filename_template text not null,
 access_profile_id uuid not null,creation_policy text not null default 'first_upload' check(creation_policy in ('manual','first_upload','person_created','onboarding_started','onboarding_approved','project_created','asset_created')),
 conflict_policy text not null default 'version' check(conflict_policy in ('version','sequence','replace')),
 review_storage text not null default 'after_approval' check(review_storage in ('immediate','after_approval')),
 is_active boolean not null default true,unique(organisation_id,id),unique(organisation_id,code),
 foreign key(organisation_id,site_id) references public.v2_sharepoint_sites(organisation_id,id),
 foreign key(organisation_id,access_profile_id) references public.v2_integration_access_profiles(organisation_id,id)
);
create table public.v2_integration_oauth_states (
 state_hash text primary key,organisation_id uuid not null,integration_id uuid not null,actor_id uuid not null references auth.users(id),
 provider text not null,expires_at timestamptz not null,consumed_at timestamptz,expected_tenant text,verifier_ciphertext jsonb,
 foreign key(organisation_id,integration_id) references public.v2_integrations(organisation_id,id)
);
create table public.v2_integration_audit (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,integration_id uuid not null,
 actor_id uuid references auth.users(id),action text not null,target_id uuid,result text not null default 'success',
 created_at timestamptz not null default now(),foreign key(organisation_id,integration_id) references public.v2_integrations(organisation_id,id)
);
create table public.v2_document_provider_jobs (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,destination_id uuid not null,document_id uuid not null,
 status text not null default 'pending' check(status in ('pending','syncing','synced','failed','permission_lost')),
 attempts integer not null default 0,available_at timestamptz not null default now(),lease_until timestamptz,
 fingerprint text not null,site_id text,drive_id text,drive_item_id text,path_snapshot text,filename text,etag text,web_url text,
 synced_at timestamptz,last_error text,unique(organisation_id,document_id,fingerprint),
 foreign key(organisation_id,destination_id) references public.v2_document_destinations(organisation_id,id),
 foreign key(organisation_id,document_id) references public.v2_people_documents(organisation_id,id)
);
create index v2_provider_jobs_due on public.v2_document_provider_jobs(status,available_at);
create index v2_integration_audit_org on public.v2_integration_audit(organisation_id,created_at desc);
-- Browser clients have no direct integration table privileges; server routes authenticate,
-- enforce capabilities and tenant ownership before using the service client.
do $$ declare t text; begin foreach t in array array['v2_integrations','v2_sharepoint_sites','v2_integration_access_profiles','v2_document_destinations','v2_integration_oauth_states','v2_integration_audit','v2_document_provider_jobs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;end $$;
create or replace function public.tttracker_v2_consume_integration_state(p_hash text,p_org uuid,p_actor uuid,p_provider text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.v2_integration_oauth_states;begin
 update public.v2_integration_oauth_states set consumed_at=now() where state_hash=p_hash and organisation_id=p_org and actor_id=p_actor and provider=p_provider and consumed_at is null and expires_at>now() returning * into r;
 if r.state_hash is null then raise exception 'INTEGRATION_STATE_INVALID';end if;
 return to_jsonb(r);end $$;
revoke all on function public.tttracker_v2_consume_integration_state(text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.tttracker_v2_consume_integration_state(text,uuid,uuid,text) to service_role;
create or replace function public.tttracker_v2_claim_document_job(p_org uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.v2_document_provider_jobs;begin
 update public.v2_document_provider_jobs set status='syncing',attempts=attempts+1,lease_until=now()+interval '2 minutes'
 where organisation_id=p_org and id=p_id and available_at<=now() and (status in ('pending','failed') or (status='syncing' and lease_until<now())) returning * into r;
 if r.id is null then raise exception 'INTEGRATION_JOB_BUSY';end if;return to_jsonb(r);end $$;
revoke all on function public.tttracker_v2_claim_document_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.tttracker_v2_claim_document_job(uuid,uuid) to service_role;
commit;

begin;
insert into public.v2_permissions(resource_id,permission_code,action_key,name)
select r.id,p.code,p.action,p.label from public.v2_resources r cross join(values
 ('integrations.xero.view','xero_view','View Xero integration'),('integrations.xero.manage','xero_manage','Manage Xero connection'),
 ('xero.people.map','xero_people_map','Map Xero employees'),('xero.projects.manage','xero_projects_manage','Map Xero projects'),
 ('xero.timesheets.view','xero_timesheets_view','View timesheet preflight'),('xero.timesheets.export','xero_timesheets_export','Export reviewed timesheets'),
 ('xero.commercial.export','xero_commercial_export','Export reviewed commercial records')) p(code,action,label)
 where r.resource_key='organisation.settings' on conflict(permission_code) do nothing;
create table public.v2_xero_credentials (
 organisation_id uuid not null,integration_id uuid primary key,generation integer not null check(generation>0),
 envelope jsonb not null check(envelope ?& array['ciphertext','nonce','tag','encrypted_dek','key_arn','environment','format'] and envelope->>'format'='1' and (envelope-array['ciphertext','nonce','tag','encrypted_dek','key_arn','environment','format'])='{}'::jsonb),expires_at timestamptz not null,scopes text[] not null,
 refresh_lease uuid,refresh_lease_until timestamptz,updated_at timestamptz not null default now(),
 foreign key(organisation_id,integration_id) references public.v2_integrations(organisation_id,id),unique(organisation_id,integration_id)
);
create table public.v2_xero_settings (
 organisation_id uuid not null,integration_id uuid primary key,connection_id uuid,features text[] not null default '{}',
 granted_scopes text[] not null default '{}',payroll_region text check(payroll_region in ('AU','NZ','UK')),
 export_policy text not null default 'manual' check(export_policy in ('manual','review')),
 last_refreshed_at timestamptz,foreign key(organisation_id,integration_id) references public.v2_integrations(organisation_id,id)
);
create table public.v2_xero_pending_tenants (
 organisation_id uuid not null,integration_id uuid primary key,actor_id uuid not null references auth.users(id),
 candidates jsonb not null,expires_at timestamptz not null,
 foreign key(organisation_id,integration_id) references public.v2_integrations(organisation_id,id)
);
create table public.v2_xero_person_mappings (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,integration_id uuid not null,person_id uuid not null,
 xero_tenant_id text not null,xero_employee_id uuid not null,display_name text not null,
 mapped_by uuid not null references auth.users(id),mapped_at timestamptz not null default now(),
 unique(organisation_id,person_id),unique(integration_id,xero_employee_id),
 foreign key(organisation_id,integration_id) references public.v2_integrations(organisation_id,id),
 foreign key(organisation_id,person_id) references public.v2_people(organisation_id,id)
);
create table public.v2_xero_project_mappings (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,integration_id uuid not null,project_id uuid not null,
 xero_tenant_id text not null,xero_project_id uuid not null,display_name text not null,
 mapped_by uuid not null references auth.users(id),mapped_at timestamptz not null default now(),
 unique(organisation_id,project_id),unique(integration_id,xero_project_id),
 foreign key(organisation_id,integration_id) references public.v2_integrations(organisation_id,id),
 foreign key(organisation_id,project_id) references public.v2_projects(organisation_id,id)
);
create table public.v2_xero_configuration_mappings (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,integration_id uuid not null,
 kind text not null check(kind in ('earnings_category','cost_account','client_contact','project_tracking')),
 source_key text not null,provider_id text not null,direction text not null default 'tttracker_to_xero' check(direction='tttracker_to_xero'),
 unique(organisation_id,integration_id,kind,source_key),foreign key(organisation_id,integration_id) references public.v2_integrations(organisation_id,id)
);
create table public.v2_xero_sync_jobs (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,integration_id uuid not null,
 entity_type text not null check(entity_type in ('timesheet','commercial')),source_id uuid not null,fingerprint text not null,
 status text not null default 'attention_required' check(status in ('pending','syncing','synced','failed','attention_required')),
 provider_object_id text,attempts integer not null default 0,available_at timestamptz not null default now(),
 last_error text,created_at timestamptz not null default now(),unique(integration_id,entity_type,source_id,fingerprint),
 foreign key(organisation_id,integration_id) references public.v2_integrations(organisation_id,id)
);
do $$declare t text;begin foreach t in array array['v2_xero_credentials','v2_xero_settings','v2_xero_pending_tenants','v2_xero_person_mappings','v2_xero_project_mappings','v2_xero_configuration_mappings','v2_xero_sync_jobs'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
create or replace function public.tttracker_v2_xero_refresh_claim(p_org uuid,p_id uuid,p_generation integer,p_lease uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin update public.v2_xero_credentials set refresh_lease=p_lease,refresh_lease_until=now()+interval '3 minutes'
 where organisation_id=p_org and integration_id=p_id and generation=p_generation and (refresh_lease_until is null or refresh_lease_until<now());return found;end $$;
create or replace function public.tttracker_v2_xero_refresh_commit(p_org uuid,p_id uuid,p_generation integer,p_lease uuid,p_envelope jsonb,p_expiry timestamptz,p_scopes text[])
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin update public.v2_xero_credentials set envelope=p_envelope,generation=generation+1,expires_at=p_expiry,scopes=p_scopes,refresh_lease=null,refresh_lease_until=null,updated_at=now()
 where organisation_id=p_org and integration_id=p_id and generation=p_generation and refresh_lease=p_lease and refresh_lease_until>now();return found;end $$;
revoke all on function public.tttracker_v2_xero_refresh_claim(uuid,uuid,integer,uuid),public.tttracker_v2_xero_refresh_commit(uuid,uuid,integer,uuid,jsonb,timestamptz,text[]) from public,anon,authenticated;
grant execute on function public.tttracker_v2_xero_refresh_claim(uuid,uuid,integer,uuid),public.tttracker_v2_xero_refresh_commit(uuid,uuid,integer,uuid,jsonb,timestamptz,text[]) to service_role;
create or replace function public.tttracker_v2_xero_store_credentials(p_org uuid,p_id uuid,p_expected integer,p_envelope jsonb,p_expiry timestamptz,p_scopes text[])
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_expected=0 then
 insert into public.v2_xero_credentials(organisation_id,integration_id,generation,envelope,expires_at,scopes) values(p_org,p_id,1,p_envelope,p_expiry,p_scopes) on conflict(integration_id) do nothing;return found;
 end if;
 update public.v2_xero_credentials set generation=generation+1,envelope=p_envelope,expires_at=p_expiry,scopes=p_scopes,updated_at=now(),refresh_lease=null,refresh_lease_until=null
 where organisation_id=p_org and integration_id=p_id and generation=p_expected and (refresh_lease_until is null or refresh_lease_until<now());return found;
end $$;
revoke all on function public.tttracker_v2_xero_store_credentials(uuid,uuid,integer,jsonb,timestamptz,text[]) from public,anon,authenticated;
grant execute on function public.tttracker_v2_xero_store_credentials(uuid,uuid,integer,jsonb,timestamptz,text[]) to service_role;
commit;

;

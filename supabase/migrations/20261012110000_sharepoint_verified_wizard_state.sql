begin;
-- Tenant consent and whole-provider completion are different states.
alter table public.v2_integrations add column if not exists microsoft_tenant_verified_at timestamptz;
alter table public.v2_integrations add column if not exists setup_site_id uuid;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='v2_integrations_setup_site_tenant_fk' and conrelid='public.v2_integrations'::regclass) then
  alter table public.v2_integrations add constraint v2_integrations_setup_site_tenant_fk
   foreign key(organisation_id,setup_site_id) references public.v2_sharepoint_sites(organisation_id,id);
 end if;
end $$;
-- Do not manufacture verified tenant state from old consent redirects.
notify pgrst,'reload schema';
commit;

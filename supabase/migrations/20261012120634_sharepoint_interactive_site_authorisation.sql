begin;
-- Only safe setup metadata is persisted. No Microsoft administrator credentials.
alter table public.v2_integration_oauth_states
 add column if not exists setup_operation_id uuid,
 add column if not exists setup_payload jsonb,
 add column if not exists setup_results jsonb;
create unique index if not exists v2_integration_setup_operation
 on public.v2_integration_oauth_states(setup_operation_id) where setup_operation_id is not null;
alter table public.v2_sharepoint_sites add column if not exists runtime_permission_id text;
alter table public.v2_sharepoint_sites drop constraint if exists v2_sharepoint_sites_permission_status_check;
alter table public.v2_sharepoint_sites add constraint v2_sharepoint_sites_permission_status_check
 check(permission_status in ('candidate','verified','permission_required','error','authorised'));
-- Existing service-only RLS/grants and atomic state consumption are retained.
notify pgrst, 'reload schema';
commit;;

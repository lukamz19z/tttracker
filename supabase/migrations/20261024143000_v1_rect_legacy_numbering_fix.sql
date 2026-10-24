-- V1 only. RECT is tower-scoped; parent fli_number is historical compatibility.
-- Audited live: copying RECT-01 to globally unique fli_number causes collisions
-- across towers. Keep all historical values and all existing unique indexes.
create or replace function public.tttracker_sync_legacy_revision_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Do not mirror new/changed RECT identifiers into the legacy FLI column.
  -- Existing historical values and explicit legacy imports remain untouched.
  return new;
end;
$$;
comment on function public.tttracker_sync_legacy_revision_number() is
  'V1 compatibility trigger: preserves legacy FLI values without copying tower-scoped RECT numbers.';

-- These project-scoped indexes already exist in V1 production. Record the same
-- definitions for reproducible environments; audited mutation groups had no duplicates.
create unique index if not exists tower_revisions_project_mobile_mutation_uidx
  on public.tower_revisions(project_id,mobile_client_mutation_id)
  where mobile_client_mutation_id is not null;
create unique index if not exists tower_revision_items_project_mobile_mutation_uidx
  on public.tower_revision_items(project_id,mobile_client_mutation_id)
  where mobile_client_mutation_id is not null;
comment on column public.tower_revisions.fli_number is 'Legacy parent reference only; new RECT records use revision_number.';
comment on column public.tower_revisions.revision_number is 'Canonical tower-scoped RECT identifier allocated by tttracker_assign_revision_number.';
comment on column public.tower_revision_items.fli_number is 'Canonical finding FLI identifier allocated by tttracker_assign_fli_number.';
notify pgrst, 'reload schema';

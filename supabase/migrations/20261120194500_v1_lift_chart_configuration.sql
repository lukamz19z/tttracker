-- Add exact manufacturer chart configuration metadata without changing prior study snapshots.
alter table public.lift_load_charts
  add column if not exists manufacturer_configuration jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'Draft';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'lift_load_charts_status_check') then
    alter table public.lift_load_charts add constraint lift_load_charts_status_check
      check (status in ('Draft', 'Imported', 'Verified', 'Superseded'));
  end if;
end $$;

create index if not exists lift_load_charts_configuration_lookup_idx
  on public.lift_load_charts (crane_profile_id, configuration_revision_id, status);

create unique index if not exists lift_load_charts_import_identity_idx
  on public.lift_load_charts (crane_profile_id, revision, (manufacturer_configuration ->> 'identityKey'))
  where manufacturer_configuration ? 'identityKey';

notify pgrst, 'reload schema';

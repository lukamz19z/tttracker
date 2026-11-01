-- Project recipients are explicit picker eligibility; automatic subscriptions
-- remain controlled separately by active + the notify_* event preferences.
alter table public.project_material_notification_rules
  add column if not exists available_for_selection boolean not null default true;

comment on column public.project_material_notification_rules.available_for_selection is
  'Whether this project user is available in the per-issue Materials Also Notify picker. Does not subscribe them to events.';

notify pgrst, 'reload schema';

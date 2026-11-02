alter table public.project_defect_notification_rules
  add column if not exists available_for_selection boolean not null default true;

comment on column public.project_defect_notification_rules.available_for_selection is
  'Whether this project user is available for new Defect assignment and Also Notify selections. Independent of automatic event subscriptions.';

notify pgrst, 'reload schema';

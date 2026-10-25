begin;

-- Ticket and Category overrides extend the existing Training catalogue. The
-- SharePoint destination filename_template remains the organisation default.
alter table public.v2_training_categories
  add column if not exists filename_template text;
alter table public.v2_training_types
  add column if not exists filename_template text;

comment on column public.v2_training_categories.filename_template is
  'Optional Training filename override; inherits the organisation SharePoint Training destination template when null.';
comment on column public.v2_training_types.filename_template is
  'Optional Ticket filename override; takes precedence over the Training Category and organisation destination templates when non-null.';

notify pgrst, 'reload schema';
commit;

;

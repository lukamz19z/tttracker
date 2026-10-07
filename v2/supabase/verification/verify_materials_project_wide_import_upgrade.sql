select
  to_regclass('public.v2_material_bundles') as bundles,
  to_regclass('public.v2_material_bundle_members') as bundle_members,
  to_regclass('public.v2_material_bundle_checks') as bundle_checks,
  to_regclass('public.v2_material_member_checks') as member_checks,
  to_regclass('public.v2_material_issues') as issues,
  to_regclass('public.v2_material_issue_events') as issue_events,
  to_regclass('public.v2_material_movements') as movements,
  to_regclass('public.v2_material_reservations') as reservations,
  to_regclass('public.v2_material_amendments') as amendments,
  to_regclass('public.v2_material_import_batches') as import_batches,
  to_regclass('public.v2_material_source_records') as source_records;

select column_name
from information_schema.columns
where table_schema='public'
  and table_name='v2_material_import_batches'
  and column_name in ('target_tower_id','import_category_key','source_role_key')
order by column_name;

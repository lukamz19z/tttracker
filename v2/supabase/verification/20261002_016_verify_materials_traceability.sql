-- TTTracker V2 Materials Traceability verification
select
  to_regclass('public.v2_material_bundles') as bundles,
  to_regclass('public.v2_material_bundle_members') as bundle_members,
  to_regclass('public.v2_material_bundle_checks') as bundle_checks,
  to_regclass('public.v2_material_member_checks') as member_checks,
  to_regclass('public.v2_material_locations') as locations,
  to_regclass('public.v2_material_issues') as issues,
  to_regclass('public.v2_material_issue_events') as issue_events,
  to_regclass('public.v2_material_movements') as movements,
  to_regclass('public.v2_material_reservations') as reservations,
  to_regclass('public.v2_material_amendments') as amendments,
  to_regclass('public.v2_material_amendment_items') as amendment_items,
  to_regclass('public.v2_material_import_profiles') as import_profiles,
  to_regclass('public.v2_material_import_batches') as import_batches,
  to_regclass('public.v2_material_source_records') as source_records,
  to_regclass('public.v2_material_reconciliation_runs') as reconciliation_runs,
  to_regclass('public.v2_material_reconciliation_findings') as reconciliation_findings;

select option_group, option_key, label, is_active
from public.v2_project_option_definitions
where option_group like 'material_%'
order by project_id, option_group, sort_order;

select project_id, issue_number, issue_type_key, status,
       quantity_affected, quantity_resolved, raised_at
from public.v2_material_issues
order by raised_at desc
limit 50;

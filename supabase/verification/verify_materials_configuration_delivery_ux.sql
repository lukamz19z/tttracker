select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'v2_material_delivery_items'
  and column_name = 'driver_checked_by_name';

select
  project_id,
  option_group,
  option_key,
  label,
  is_active
from public.v2_project_option_definitions
where option_group in (
  'material_feature',
  'material_issue_type',
  'material_source_type',
  'material_location_type',
  'material_movement_type',
  'material_amendment_scope',
  'material_amendment_action',
  'material_amendment_status',
  'material_import_source',
  'material_import_source_role',
  'material_issue_event_type'
)
order by project_id, option_group, sort_order;

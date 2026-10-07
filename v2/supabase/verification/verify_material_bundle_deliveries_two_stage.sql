select
  to_regclass('public.v2_material_deliveries') as deliveries,
  to_regclass('public.v2_material_delivery_items') as delivery_items,
  to_regclass('public.v2_material_bundle_checks') as bundle_checks;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'v2_material_bundle_checks'
  and column_name = 'delivery_item_id';

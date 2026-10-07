select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'v2_material_import_batches'
  and column_name in (
    'target_tower_id',
    'import_category_key',
    'source_role_key'
  )
order by column_name;

select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'v2_material_source_records'
  and column_name in (
    'import_category_key',
    'source_role_key',
    'profile',
    'diameter',
    'length',
    'bolt_type',
    'packer_mark'
  )
order by column_name;

select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'v2_material_bundles'
  and column_name = 'source_import_batch_id';

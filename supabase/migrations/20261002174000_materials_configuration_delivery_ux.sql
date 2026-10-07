-- TTTracker V2
-- Materials configuration + delivery audit refinement
-- Safe to run after the Materials Traceability and Delivery migrations.

begin;

do $$
begin
  if to_regclass('public.v2_project_option_definitions') is null then
    raise exception 'Missing prerequisite: public.v2_project_option_definitions';
  end if;
  if to_regclass('public.v2_material_delivery_items') is null then
    raise exception 'Missing prerequisite: public.v2_material_delivery_items';
  end if;
end $$;

alter table public.v2_material_delivery_items
  add column if not exists driver_checked_by_name text;

-- Project-level feature switch. Existing projects stay enabled by default,
-- but each project can turn Delivery Management off in Configuration > Materials.
insert into public.v2_project_option_definitions (
  organisation_id,
  project_id,
  option_group,
  option_key,
  label,
  sort_order,
  is_active,
  settings
)
select
  p.organisation_id,
  p.id,
  'material_feature',
  'deliveries',
  'Bundle delivery management',
  10,
  true,
  '{"description":"Delivery docket planning, driver bundle confirmation and site second-check reporting"}'::jsonb
from public.v2_projects p
on conflict (project_id, option_group, option_key) do nothing;

-- Ensure the default Materials option catalogue is present for every project.
-- These are editable project defaults, not hard-coded customer values.
insert into public.v2_project_option_definitions (
  organisation_id,
  project_id,
  option_group,
  option_key,
  label,
  sort_order,
  is_active,
  settings
)
select
  p.organisation_id,
  p.id,
  x.option_group,
  x.option_key,
  x.label,
  x.sort_order,
  true,
  x.settings
from public.v2_projects p
cross join (
  values
    ('material_issue_type','missing','Missing',10,'{}'::jsonb),
    ('material_issue_type','excess','Excess',20,'{}'::jsonb),
    ('material_issue_type','damaged','Damaged',30,'{}'::jsonb),
    ('material_issue_type','incorrect','Incorrect / wrong material',40,'{}'::jsonb),

    ('material_source_type','another_tower','Another Tower',10,'{"requires_tower":true}'::jsonb),
    ('material_source_type','laydown','Laydown Area',20,'{"requires_location":true}'::jsonb),
    ('material_source_type','warehouse','Project Warehouse',30,'{"requires_location":true}'::jsonb),
    ('material_source_type','supplier','Supplier Delivery',40,'{}'::jsonb),
    ('material_source_type','client_supplied','Client Supplied',50,'{}'::jsonb),
    ('material_source_type','another_project','Another Project',60,'{"requires_reference":true}'::jsonb),
    ('material_source_type','fabricated','Fabricated / Modified',70,'{}'::jsonb),
    ('material_source_type','recovered','Recovered Material',80,'{}'::jsonb),
    ('material_source_type','other','Other',100,'{"requires_notes":true}'::jsonb),

    ('material_location_type','tower','Tower',10,'{}'::jsonb),
    ('material_location_type','laydown','Laydown Area',20,'{}'::jsonb),
    ('material_location_type','warehouse','Warehouse',30,'{}'::jsonb),
    ('material_location_type','yard','Yard',40,'{}'::jsonb),
    ('material_location_type','truck','Truck / In Transit',50,'{}'::jsonb),
    ('material_location_type','other','Other',100,'{}'::jsonb),

    ('material_movement_type','transfer','Transfer',10,'{}'::jsonb),
    ('material_movement_type','supplier_delivery','Supplier Delivery',20,'{}'::jsonb),
    ('material_movement_type','issue_resolution','Issue Resolution',30,'{}'::jsonb),
    ('material_movement_type','return','Return',40,'{}'::jsonb),
    ('material_movement_type','relocation','Relocation',50,'{}'::jsonb),
    ('material_movement_type','installed','Installed / Consumed',60,'{}'::jsonb),
    ('material_movement_type','quarantined','Quarantined',70,'{}'::jsonb),

    ('material_amendment_scope','tower','Specific Tower',10,'{}'::jsonb),
    ('material_amendment_scope','tower_type','Tower Type',20,'{}'::jsonb),
    ('material_amendment_scope','drawing','Drawing',30,'{}'::jsonb),
    ('material_amendment_scope','segment','Tower Segment',40,'{}'::jsonb),
    ('material_amendment_scope','project','Whole Project',50,'{}'::jsonb),

    ('material_amendment_action','add','Add Requirement',10,'{}'::jsonb),
    ('material_amendment_action','replace','Replace Requirement',20,'{}'::jsonb),
    ('material_amendment_action','remove','Remove Requirement',30,'{}'::jsonb),
    ('material_amendment_action','quantity_override','Override Quantity',40,'{}'::jsonb),
    ('material_amendment_action','quantity_delta','Adjust Quantity',50,'{}'::jsonb),
    ('material_amendment_action','note','Note / Clarification',60,'{}'::jsonb),

    ('material_amendment_status','draft','Draft',10,'{"effective":false}'::jsonb),
    ('material_amendment_status','approved','Approved / Effective',20,'{"effective":true}'::jsonb),
    ('material_amendment_status','superseded','Superseded',30,'{"effective":false}'::jsonb),
    ('material_amendment_status','cancelled','Cancelled',40,'{"effective":false}'::jsonb),

    ('material_import_source','bundle_list','Bundle List',10,'{}'::jsonb),
    ('material_import_source','packing_list','Packing List',20,'{}'::jsonb),
    ('material_import_source','member_schedule','Member Schedule',30,'{}'::jsonb),
    ('material_import_source','drawing_schedule','Drawing / Material Schedule',40,'{}'::jsonb),
    ('material_import_source','bolt_packer_schedule','Bolt & Packer Schedule',50,'{}'::jsonb),
    ('material_import_source','custom','Custom',100,'{}'::jsonb),

    ('material_import_source_role','packing_list','Packing List',10,'{"applies_to":["members","bundles"]}'::jsonb),
    ('material_import_source_role','drawing_schedule','Drawing / Material Schedule',20,'{"applies_to":["members","bolts","packers"]}'::jsonb),
    ('material_import_source_role','member_schedule','Member Schedule',30,'{"applies_to":["members"]}'::jsonb),
    ('material_import_source_role','supplier_list','Supplier List',40,'{"applies_to":["bundles","members","bolts","packers"]}'::jsonb),
    ('material_import_source_role','manual','Manual Entry',90,'{"applies_to":["bundles","members","bolts","packers"]}'::jsonb),
    ('material_import_source_role','custom','Custom Source',100,'{"applies_to":["bundles","members","bolts","packers"]}'::jsonb),

    ('material_issue_event_type','note','Note / Update',10,'{}'::jsonb),
    ('material_issue_event_type','client_notified','Client Notified',20,'{}'::jsonb),
    ('material_issue_event_type','client_acknowledged','Client Acknowledged',30,'{}'::jsonb),
    ('material_issue_event_type','source_identified','Replacement Source Identified',40,'{}'::jsonb),
    ('material_issue_event_type','dispatched','Dispatched / In Transit',50,'{}'::jsonb),
    ('material_issue_event_type','received','Received',60,'{"resolves_quantity":true}'::jsonb),
    ('material_issue_event_type','found_received','Found / Received',70,'{"resolves_quantity":true}'::jsonb),
    ('material_issue_event_type','replacement_received','Replacement Received',80,'{"resolves_quantity":true}'::jsonb),
    ('material_issue_event_type','transfer_received','Transfer Received',90,'{"resolves_quantity":true}'::jsonb),
    ('material_issue_event_type','receipt_reversed','Receipt Reversed',100,'{"reverses_quantity":true}'::jsonb)
) as x(option_group, option_key, label, sort_order, settings)
on conflict (project_id, option_group, option_key) do nothing;

commit;

notify pgrst, 'reload schema';

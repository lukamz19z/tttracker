-- V1 Materials permissions belong in the V1 dynamic access catalogue.
-- V1 roles with grants_all inherit these entries automatically.
begin;

insert into public.access_groups(code,name,description,sort_order,is_active)
values('materials','Materials','Materials registers, issues and operational configuration.',170,true)
on conflict(code) do update set
  name=excluded.name,
  description=excluded.description,
  is_active=true,
  updated_at=now();

insert into public.access_areas(
  group_id,category,code,name,description,type,permission_level,route,source,sort_order,is_active
)
select g.id,v.category,v.code,v.name,v.description,v.type,v.permission_level,v.route,'system_permission',v.sort_order,true
from public.access_groups g
cross join (values
  ('TTTracker · Materials','materials.view','View Materials','View project Materials registers and Missing / Excess issues.','tttracker','view','/project',10),
  ('TTTracker · Materials','materials.issues.view','View Missing / Excess issues','View canonical Missing / Excess material issues.','tttracker','view','/project',20),
  ('TTTracker · Materials','materials.manage_issues','Manage Materials issues','Report, assign, receive, collect, transfer and resolve Materials issues.','tttracker','manage','/project',30),
  ('TTTracker · Materials','materials.configure','Configure Materials','Configure Materials notification recipients and evidence storage.','tttracker','manage','/project',40),
  ('TTTracker · Materials','mobile.materials','Use mobile Materials','Access mobile Materials registers and field workflows.','mobile','view','/materials',50)
) v(category,code,name,description,type,permission_level,route,sort_order)
where g.code='materials'
on conflict(code) do update set
  group_id=excluded.group_id,
  category=excluded.category,
  name=excluded.name,
  description=excluded.description,
  type=excluded.type,
  permission_level=excluded.permission_level,
  route=excluded.route,
  source=excluded.source,
  is_active=true;

notify pgrst,'reload schema';
commit;

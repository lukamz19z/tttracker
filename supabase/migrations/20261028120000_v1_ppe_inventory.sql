-- V1 PPE inventory. Additive: canonical employee sizing and legacy issues stay untouched.
begin;
create table if not exists public.people_ppe_inventory_products (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 120),
 code text, category text not null default '', active boolean not null default true, description text,
 tracks_sizes boolean not null default true, ppe_type_id uuid references public.people_ppe_types(id),
 sort_order integer not null default 0, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.people_ppe_inventory_sizes (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.people_ppe_inventory_products(id),
 label text not null check(length(label)<=120), active boolean not null default true, sort_order integer not null default 0,
 minimum integer check(minimum>=0), unique(product_id,label)
);
create unique index if not exists people_ppe_inventory_size_key on public.people_ppe_inventory_sizes(product_id,upper(btrim(label)));
create table if not exists public.people_ppe_inventory_batches (
 id uuid primary key default gen_random_uuid(), mutation_id uuid not null unique, request jsonb not null,
 kind text not null check(kind in ('receipt','issue','adjustment','reversal')), reference text, supplier text, notes text,
 occurred_at timestamptz not null, performed_by_user_id uuid not null, performed_by_label text not null, created_at timestamptz not null default now()
);
create table if not exists public.people_ppe_inventory_movements (
 id uuid primary key default gen_random_uuid(), product_size_id uuid not null references public.people_ppe_inventory_sizes(id),
 batch_id uuid not null references public.people_ppe_inventory_batches(id),
 movement_type text not null check(movement_type in ('receipt','issue','adjustment','reversal','returned','damaged','written_off','transfer')),
 quantity_delta integer not null check(quantity_delta<>0 and abs(quantity_delta)<=1000000),
 -- Snapshots deliberately survive employee/account deletion, renaming and crew changes.
 employee_id uuid, employee_name text, employee_number text, crew_label text,
 product_name text not null, size_label text not null, performed_by_user_id uuid not null, performed_by_label text not null,
 reversal_of uuid unique references public.people_ppe_inventory_movements(id), notes text,
 occurred_at timestamptz not null, created_at timestamptz not null default now(),
 check((movement_type='issue' and quantity_delta<0 and employee_id is not null) or movement_type<>'issue'),
 check((movement_type='reversal')=(reversal_of is not null))
);
create index if not exists people_ppe_inventory_movement_size on public.people_ppe_inventory_movements(product_size_id);
create index if not exists people_ppe_inventory_movement_date on public.people_ppe_inventory_movements(occurred_at desc,id desc);
create index if not exists people_ppe_inventory_movement_employee on public.people_ppe_inventory_movements(employee_id,occurred_at desc,id desc);
create index if not exists people_ppe_inventory_size_product on public.people_ppe_inventory_sizes(product_id);
create or replace view public.v1_ppe_inventory_balances as
 select s.id,s.product_id,s.label,s.active,s.sort_order,s.minimum,coalesce(sum(m.quantity_delta),0)::bigint on_hand
 from public.people_ppe_inventory_sizes s left join public.people_ppe_inventory_movements m on m.product_size_id=s.id group by s.id;
create or replace function public.v1_ppe_inventory_immutable() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'Inventory history is permanent. Create a reversal or adjustment.'; end; $$;
drop trigger if exists v1_ppe_inventory_immutable on public.people_ppe_inventory_movements;
create trigger v1_ppe_inventory_immutable before update or delete on public.people_ppe_inventory_movements for each row execute function public.v1_ppe_inventory_immutable();
drop trigger if exists v1_ppe_inventory_batch_immutable on public.people_ppe_inventory_batches;
create trigger v1_ppe_inventory_batch_immutable before update or delete on public.people_ppe_inventory_batches for each row execute function public.v1_ppe_inventory_immutable();

-- All product edits (including size archival) hold the same product locks as stock operations.
create or replace function public.v1_ppe_inventory_save_product(p_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare pid uuid:=coalesce((p_data->>'id')::uuid,gen_random_uuid()); old public.people_ppe_inventory_products%rowtype; entry jsonb; labels text[]:='{}'; pos integer:=0;
begin
 select * into old from people_ppe_inventory_products where id=pid for update;
 if found and old.updated_at<>(p_data->>'updated_at')::timestamptz then raise exception 'This product changed. Refresh before saving.'; end if;
 if jsonb_typeof(p_data->'sizes') is distinct from 'array' or jsonb_array_length(p_data->'sizes') not between 1 and 100 then raise exception 'Configure 1 to 100 sizes (one blank size for an unsized product).'; end if;
 for entry in select value from jsonb_array_elements(p_data->'sizes') loop
  if entry->>'label' is null or length(btrim(entry->>'label'))>120 or upper(btrim(entry->>'label'))=any(labels) then raise exception 'Sizes must be unique, valid labels.'; end if;
  labels:=array_append(labels,upper(btrim(entry->>'label')));
 end loop;
 if (p_data->>'tracks_sizes')::boolean then
  if ''=any(labels) then raise exception 'Enter a label for every size.'; end if;
 elsif labels<>array[''] then raise exception 'An unsized product must have exactly one blank size.';
 end if;
 if old.id is not null and old.tracks_sizes<>(p_data->>'tracks_sizes')::boolean and exists(select 1 from people_ppe_inventory_movements m join people_ppe_inventory_sizes s on s.id=m.product_size_id where s.product_id=pid) then raise exception 'Size tracking cannot change after stock history exists. Create a separate product.'; end if;
 insert into people_ppe_inventory_products(id,name,code,category,active,description,tracks_sizes,ppe_type_id,sort_order,notes)
 values(pid,btrim(p_data->>'name'),nullif(btrim(p_data->>'code'),''),btrim(coalesce(p_data->>'category','')),(p_data->>'active')::boolean,p_data->>'description',(p_data->>'tracks_sizes')::boolean,(p_data->>'ppe_type_id')::uuid,(p_data->>'sort_order')::integer,p_data->>'notes')
 on conflict(id) do update set name=excluded.name,code=excluded.code,category=excluded.category,active=excluded.active,description=excluded.description,tracks_sizes=excluded.tracks_sizes,ppe_type_id=excluded.ppe_type_id,sort_order=excluded.sort_order,notes=excluded.notes,updated_at=clock_timestamp();
 -- Omitted sizes are archived, never deleted; their balances and history remain visible.
 update people_ppe_inventory_sizes set active=false where product_id=pid;
 for entry in select value from jsonb_array_elements(p_data->'sizes') loop
  insert into people_ppe_inventory_sizes(product_id,label,sort_order,minimum) values(pid,btrim(entry->>'label'),pos,(entry->>'minimum')::integer)
  on conflict(product_id,upper(btrim(label))) do update set active=true,sort_order=excluded.sort_order,minimum=excluded.minimum;
  pos:=pos+1;
 end loop;
 return pid;
end; $$;

-- Single database transaction, deterministic locks, combined demand and retry-safe batch IDs.
create or replace function public.v1_ppe_inventory_post(p_request jsonb,p_actor uuid,p_actor_label text) returns uuid
language plpgsql security definer set search_path=public as $$
declare bid uuid; existing public.people_ppe_inventory_batches%rowtype; kind text:=p_request->>'kind';
 entry jsonb; original public.people_ppe_inventory_movements%rowtype; demand record; item record; person record;
 delta integer; available bigint; sid uuid; eid uuid; occurred timestamptz:=coalesce((p_request->>'occurred_at')::timestamptz,now());
begin
 if p_actor is null or nullif(btrim(p_actor_label),'') is null then raise exception 'An issuing TTTracker user is required.'; end if;
 if kind is null or kind not in ('receipt','issue','adjustment','reversal') then raise exception 'Choose a stock operation.'; end if;
 if p_request->>'mutation_id' is null then raise exception 'A stock request ID is required.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('v1-ppe-stock:'||(p_request->>'mutation_id'),0));
 select * into existing from people_ppe_inventory_batches where mutation_id=(p_request->>'mutation_id')::uuid;
 if found then
  if existing.request<>p_request or existing.performed_by_user_id<>p_actor then raise exception 'This stock request ID was already used with different details.'; end if;
  return existing.id;
 end if;
 if occurred>now() then raise exception 'Stock date cannot be in the future.'; end if;
 if jsonb_typeof(p_request->'lines') is distinct from 'array' or jsonb_array_length(p_request->'lines') not between 1 and 500 then raise exception 'Submit 1 to 500 stock lines.'; end if;
 if kind in ('adjustment','reversal') and nullif(btrim(p_request->>'notes'),'') is null then raise exception 'A reason is required for adjustments and reversals.'; end if;
 -- Product first, size second, in stable order for every action. A waiting transaction
 -- reads balances only after obtaining the locks, so concurrent issues cannot oversell.
 perform p.id from people_ppe_inventory_products p where p.id in (
  select s.product_id from people_ppe_inventory_sizes s join jsonb_array_elements(p_request->'lines') l on s.id=(l->>'size_id')::uuid
 ) order by p.id for update;
 perform s.id from people_ppe_inventory_sizes s where s.id in (select (l->>'size_id')::uuid from jsonb_array_elements(p_request->'lines') l) order by s.id for update;
 for entry in select value from jsonb_array_elements(p_request->'lines') loop
  sid:=(entry->>'size_id')::uuid; eid:=(entry->>'employee_id')::uuid; delta:=(entry->>'quantity')::integer;
  if delta is null or delta=0 or abs(delta)>1000000 then raise exception 'Enter a non-zero whole quantity, up to 1000000.'; end if;
  if kind in ('issue','receipt') and delta<1 then raise exception 'Quantity must be positive.'; end if;
  select s.*,p.name,p.active product_active into item from people_ppe_inventory_sizes s join people_ppe_inventory_products p on p.id=s.product_id where s.id=sid;
  if not found then raise exception 'Inventory size not found.'; end if;
  if kind in ('issue','receipt') and (not item.active or not item.product_active) then raise exception 'Choose an active product and size.'; end if;
  if kind='issue' then
   perform id from employees where id=eid and active is distinct from false for share;
   if not found then raise exception 'Choose an active employee for every issue.'; end if;
  end if;
  if kind='reversal' then
   select * into original from people_ppe_inventory_movements where id=(entry->>'reversal_of')::uuid for update;
   if not found or original.movement_type<>'issue' or original.product_size_id<>sid or delta<>-original.quantity_delta then raise exception 'Select an original issue to reverse in full.'; end if;
   if exists(select 1 from people_ppe_inventory_movements where reversal_of=original.id) then raise exception 'This issue has already been reversed.'; end if;
   if occurred<original.occurred_at then raise exception 'Reversal cannot precede the issue.'; end if;
  end if;
 end loop;
 -- Aggregate duplicate size lines BEFORE validation (e.g. two people both XL).
 for demand in select (l->>'size_id')::uuid id,sum(case when kind='issue' then -(l->>'quantity')::integer else (l->>'quantity')::integer end) change from jsonb_array_elements(p_request->'lines') l group by (l->>'size_id')::uuid loop
  select coalesce(sum(quantity_delta),0) into available from people_ppe_inventory_movements where product_size_id=demand.id;
  if available+demand.change<0 then
   select p.name,s.label into item from people_ppe_inventory_sizes s join people_ppe_inventory_products p on p.id=s.product_id where s.id=demand.id;
   raise exception 'Only % % are available.',available,item.name||case when item.label='' then '' else ' · '||item.label end;
  end if;
 end loop;
 insert into people_ppe_inventory_batches(mutation_id,request,kind,reference,supplier,notes,occurred_at,performed_by_user_id,performed_by_label)
 values((p_request->>'mutation_id')::uuid,p_request,kind,p_request->>'reference',p_request->>'supplier',p_request->>'notes',occurred,p_actor,p_actor_label) returning id into bid;
 for entry in select value from jsonb_array_elements(p_request->'lines') loop
  sid:=(entry->>'size_id')::uuid; delta:=(entry->>'quantity')::integer; eid:=(entry->>'employee_id')::uuid;
  select p.name,s.label into item from people_ppe_inventory_sizes s join people_ppe_inventory_products p on p.id=s.product_id where s.id=sid;
  if kind='reversal' then
   select * into original from people_ppe_inventory_movements where id=(entry->>'reversal_of')::uuid;
   eid:=original.employee_id;
  end if;
  select e.full_name,e.payroll_id,coalesce(nullif(concat_ws(' · ',case when c.crew_number is not null then 'Crew '||c.crew_number end,c.crew_name),''),'Unassigned') crew into person from employees e left join crews c on c.id=e.crew_id where e.id=eid;
  insert into people_ppe_inventory_movements(product_size_id,batch_id,movement_type,quantity_delta,employee_id,employee_name,employee_number,crew_label,product_name,size_label,performed_by_user_id,performed_by_label,reversal_of,notes,occurred_at)
  values(sid,bid,kind,case when kind='issue' then -delta else delta end,eid,
   case when kind='reversal' then original.employee_name else person.full_name end,case when kind='reversal' then original.employee_number else person.payroll_id end,case when kind='reversal' then original.crew_label else person.crew end,
   item.name,item.label,p_actor,p_actor_label,case when kind='reversal' then original.id end,p_request->>'notes',occurred);
 end loop;
 return bid;
end; $$;

alter table public.people_ppe_inventory_products enable row level security;
alter table public.people_ppe_inventory_sizes enable row level security;
alter table public.people_ppe_inventory_batches enable row level security;
alter table public.people_ppe_inventory_movements enable row level security;
revoke all on public.people_ppe_inventory_products,public.people_ppe_inventory_sizes,public.people_ppe_inventory_batches,public.people_ppe_inventory_movements,public.v1_ppe_inventory_balances from public,anon,authenticated,service_role;
grant select on public.people_ppe_inventory_products,public.people_ppe_inventory_sizes,public.people_ppe_inventory_batches,public.people_ppe_inventory_movements,public.v1_ppe_inventory_balances to service_role;
revoke all on function public.v1_ppe_inventory_post(jsonb,uuid,text),public.v1_ppe_inventory_save_product(jsonb),public.v1_ppe_inventory_immutable() from public,anon,authenticated;
grant execute on function public.v1_ppe_inventory_post(jsonb,uuid,text),public.v1_ppe_inventory_save_product(jsonb) to service_role;

-- Register independent capabilities in the existing V1 dynamic access matrix.
insert into public.access_areas(group_id,category,code,name,description,type,permission_level,route,source,sort_order,is_active)
select (select group_id from public.access_areas where code='people.view_ppe'), 'TTTracker · People',v.code,v.name,v.name,'tttracker',v.level,'/people/ppe','system_permission',v.pos,true
from (values
 ('people.ppe_inventory.view','View PPE inventory','view',110),
 ('people.ppe_inventory.products','Manage PPE inventory products','manage',111),
 ('people.ppe_inventory.receive','Receive PPE stock','edit',112),
 ('people.ppe_inventory.issue','Issue PPE stock','edit',113),
 ('people.ppe_inventory.adjust','Adjust and reverse PPE stock','edit',114),
 ('people.ppe_inventory.export','Export PPE inventory and issues','view',115)
) v(code,name,level,pos) on conflict(code) do nothing;
notify pgrst,'reload schema';
commit;

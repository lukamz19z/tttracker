-- V1 only. Employee sizes stay in employees; no data is copied or rewritten.
create table if not exists public.people_ppe_types(
 id uuid primary key default gen_random_uuid(),name text not null check(length(btrim(name)) between 1 and 120),
 source_field text unique check(source_field in ('shirt_size','jacket_size','glove_size','pants_size')),
 active boolean not null default true,required boolean not null default true,requires_size boolean not null default true,
 size_options text[] not null default '{}',quantity_required integer not null default 1 check(quantity_required between 0 and 1000),
 issue_tracking boolean not null default true,sort_order integer not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index if not exists people_ppe_types_name_uidx on public.people_ppe_types(lower(btrim(name)));
-- Only additional categories store a size here. For legacy categories, a row
-- can contain a quantity override but never a duplicate employee size.
create table if not exists public.people_ppe_requirements(
 employee_id uuid not null references public.employees(id) on delete cascade,
 ppe_type_id uuid not null references public.people_ppe_types(id),
 size_value text,quantity_required integer check(quantity_required between 0 and 1000),
 updated_by uuid references auth.users(id) on delete set null,updated_at timestamptz not null default now(),
 primary key(employee_id,ppe_type_id)
);
create table if not exists public.people_ppe_issue_events(
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.employees(id) on delete cascade,
 ppe_type_id uuid not null references public.people_ppe_types(id),
 event_type text not null check(event_type in ('issued','returned')),size_value text,
 quantity integer not null check(quantity between 1 and 1000),
 related_issue_id uuid references public.people_ppe_issue_events(id) on delete cascade,
 issued_at timestamptz not null default now(),recorded_at timestamptz not null default now(),
 recorded_by uuid references auth.users(id) on delete set null,notes text,
 client_mutation_id uuid not null unique,
 check((event_type='returned')=(related_issue_id is not null))
);
create index if not exists people_ppe_issue_employee_type_idx on public.people_ppe_issue_events(employee_id,ppe_type_id);
create index if not exists people_ppe_issue_related_idx on public.people_ppe_issue_events(related_issue_id);

-- Seed only the four PPE categories already captured by V1 People/mobile.
insert into public.people_ppe_types(name,source_field,size_options,sort_order)
values('Shirt','shirt_size',array['XS','S','M','L','XL','2XL','3XL','4XL','5XL'],10),
 ('Jacket','jacket_size',array['XS','S','M','L','XL','2XL','3XL','4XL','5XL'],20),
 ('Gloves','glove_size',array['S','M','L','XL','2XL'],30),
 ('Pants','pants_size','{}',40)
on conflict do nothing;

create or replace function public.v1_ppe_guard_requirement() returns trigger language plpgsql set search_path=public as $$
begin
 if new.size_value is not null and exists(select 1 from public.people_ppe_types where id=new.ppe_type_id and source_field is not null) then
  raise exception 'Existing PPE sizes must be updated on the canonical employee field.';
 end if;
 return new;
end; $$;
drop trigger if exists v1_ppe_guard_requirement on public.people_ppe_requirements;
create trigger v1_ppe_guard_requirement before insert or update on public.people_ppe_requirements for each row execute function public.v1_ppe_guard_requirement();

create or replace view public.v1_people_ppe_issue_totals as
select employee_id,ppe_type_id,upper(btrim(coalesce(size_value,''))) size_key,
 sum(case when event_type='issued' then quantity else -quantity end)::integer issued_quantity,
 max(issued_at) filter(where event_type='issued') last_issued_at
from public.people_ppe_issue_events group by employee_id,ppe_type_id,upper(btrim(coalesce(size_value,'')));

create or replace view public.v1_people_ppe_register as
with requirements as (
 select e.id employee_id,e.full_name,e.payroll_id,e.crew_id,e.active,t.id ppe_type_id,
 nullif(btrim(case t.source_field when 'shirt_size' then e.shirt_size when 'jacket_size' then e.jacket_size
  when 'glove_size' then e.glove_size when 'pants_size' then e.pants_size else r.size_value end),'') size_value,
 r.quantity_required quantity_override,coalesce(r.quantity_required,case when t.required then t.quantity_required else 0 end) required_quantity
 from public.employees e cross join public.people_ppe_types t
 left join public.people_ppe_requirements r on r.employee_id=e.id and r.ppe_type_id=t.id where t.active
)
select r.*,coalesce(i.issued_quantity,0) issued_quantity,i.last_issued_at
from requirements r join public.people_ppe_types t on t.id=r.ppe_type_id
left join lateral (
 select sum(s.issued_quantity)::integer issued_quantity,max(s.last_issued_at) last_issued_at
 from public.v1_people_ppe_issue_totals s where s.employee_id=r.employee_id and s.ppe_type_id=r.ppe_type_id
 and (not t.requires_size or s.size_key=upper(coalesce(r.size_value,'')))
) i on true;

create or replace function public.v1_ppe_save_requirement(p_employee uuid,p_type uuid,p_size text,p_quantity integer,p_actor uuid)
returns void language plpgsql security definer set search_path=public as $$
declare item public.people_ppe_types%rowtype; value text:=nullif(btrim(p_size),'');
begin
 select * into item from public.people_ppe_types where id=p_type for share;
 if not found then raise exception using errcode='22023',message='PPE item not found.'; end if;
 if p_quantity is not null and (p_quantity<0 or p_quantity>1000) then raise exception using errcode='22023',message='Quantity must be between 0 and 1000.'; end if;
 if value is not null and item.requires_size and cardinality(item.size_options)>0 and not exists(select 1 from unnest(item.size_options) o where upper(o)=upper(value)) then
  -- Preserve an existing historical value even if options were subsequently changed.
  if not exists(select 1 from public.v1_people_ppe_register where employee_id=p_employee and ppe_type_id=p_type and size_value=value) then
   raise exception using errcode='22023',message='Choose a configured size.';
  end if;
 end if;
 if not exists(select 1 from public.employees where id=p_employee) then raise exception using errcode='P0002',message='Employee not found.'; end if;
 if item.source_field is not null then
  -- source_field is database-constrained; never accept a caller-supplied column.
  execute format('update public.employees set %I=$1 where id=$2',item.source_field) using value,p_employee;
 end if;
 insert into public.people_ppe_requirements(employee_id,ppe_type_id,size_value,quantity_required,updated_by)
 values(p_employee,p_type,case when item.source_field is null then value else null end,p_quantity,p_actor)
 on conflict(employee_id,ppe_type_id) do update set size_value=excluded.size_value,quantity_required=excluded.quantity_required,updated_by=excluded.updated_by,updated_at=now();
end; $$;

create or replace function public.v1_ppe_record_event(p_employee uuid,p_type uuid,p_event text,p_size text,p_quantity integer,p_date timestamptz,p_related uuid,p_notes text,p_mutation uuid,p_actor uuid)
returns public.people_ppe_issue_events language plpgsql security definer set search_path=public as $$
declare item public.people_ppe_types%rowtype; existing public.people_ppe_issue_events%rowtype;
 original public.people_ppe_issue_events%rowtype; returned integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('v1-ppe-event:'||p_mutation::text,0));
 select * into existing from public.people_ppe_issue_events where client_mutation_id=p_mutation;
 if found then
  if existing.employee_id<>p_employee or existing.ppe_type_id<>p_type or existing.recorded_by is distinct from p_actor or existing.event_type<>p_event or existing.quantity<>p_quantity or existing.related_issue_id is distinct from p_related then raise exception using errcode='22023',message='This PPE request was already recorded with different details. Reload the issue history.'; end if;
  return existing;
 end if;
 select * into item from public.people_ppe_types where id=p_type for share;
 if not found or not item.issue_tracking then raise exception using errcode='22023',message='Enable issue tracking for this PPE item.'; end if;
 if p_date>now() or p_date is null then raise exception using errcode='22023',message='Issue date cannot be in the future.'; end if;
 if p_event='returned' then
  select * into original from public.people_ppe_issue_events where id=p_related for update;
  if not found or original.event_type<>'issued' or original.employee_id<>p_employee or original.ppe_type_id<>p_type then raise exception using errcode='22023',message='Original PPE issue not found.'; end if;
  if p_date<original.issued_at then raise exception using errcode='22023',message='Return date cannot precede the issue date.'; end if;
  select coalesce(sum(quantity),0) into returned from public.people_ppe_issue_events where related_issue_id=p_related;
  if p_quantity>original.quantity-returned or p_quantity<1 then raise exception using errcode='22023',message='Return quantity exceeds the remaining issue.'; end if;
  p_size:=original.size_value;
 elsif p_event='issued' then
  if not item.active then raise exception using errcode='22023',message='This PPE item is inactive.'; end if;
  if item.requires_size and nullif(btrim(p_size),'') is null then raise exception using errcode='22023',message='Record the issued size.'; end if;
  if item.requires_size and cardinality(item.size_options)>0 and not exists(select 1 from unnest(item.size_options)o where upper(o)=upper(btrim(p_size))) then raise exception using errcode='22023',message='Choose a configured size.'; end if;
 end if;
 insert into public.people_ppe_issue_events(employee_id,ppe_type_id,event_type,size_value,quantity,issued_at,related_issue_id,notes,client_mutation_id,recorded_by)
 values(p_employee,p_type,p_event,nullif(btrim(p_size),''),p_quantity,p_date,p_related,nullif(btrim(p_notes),''),p_mutation,p_actor) returning * into existing;
 return existing;
end; $$;

-- All new data is served through authenticated People APIs. No anonymous or
-- direct browser access; service routes enforce existing dynamic permissions.
alter table public.people_ppe_types enable row level security;
alter table public.people_ppe_requirements enable row level security;
alter table public.people_ppe_issue_events enable row level security;
revoke all on public.people_ppe_types,public.people_ppe_requirements,public.people_ppe_issue_events,
 public.v1_people_ppe_issue_totals,public.v1_people_ppe_register from public,anon,authenticated;
grant all on public.people_ppe_types,public.people_ppe_requirements,public.people_ppe_issue_events to service_role;
grant select on public.v1_people_ppe_issue_totals,public.v1_people_ppe_register to service_role;
revoke all on function public.v1_ppe_save_requirement(uuid,uuid,text,integer,uuid),public.v1_ppe_record_event(uuid,uuid,text,text,integer,timestamptz,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.v1_ppe_save_requirement(uuid,uuid,text,integer,uuid),public.v1_ppe_record_event(uuid,uuid,text,text,integer,timestamptz,uuid,text,uuid,uuid) to service_role;
notify pgrst,'reload schema';

-- Materials import integrity. Existing root migration identities remain unchanged.
-- Reconciles DDL previously shipped outside the root migration sequence (some
-- development databases already have these columns from manual application).
begin;
alter table public.v2_material_import_batches
  add column if not exists target_tower_id uuid references public.v2_towers(id) on delete set null,
  add column if not exists import_category_key text,
  add column if not exists source_role_key text,
  add column if not exists source_scope_key text;
alter table public.v2_material_bundles
  add column if not exists source_import_batch_id uuid references public.v2_material_import_batches(id) on delete set null,
  add column if not exists is_active boolean not null default true;
alter table public.v2_material_register
  add column if not exists source_role_key text;
alter table public.v2_material_source_records
  add column if not exists import_category_key text,
  add column if not exists source_role_key text,
  add column if not exists profile text,
  add column if not exists diameter text,
  add column if not exists length text,
  add column if not exists bolt_type text,
  add column if not exists packer_mark text,
  add column if not exists material_code text,
  add column if not exists total_weight_t numeric,
  add column if not exists source_revision text,
  add column if not exists source_scope_key text,
  add column if not exists material_item_id uuid references public.v2_material_register(id) on delete restrict,
  add column if not exists bundle_id uuid references public.v2_material_bundles(id) on delete restrict,
  add column if not exists superseded_by_batch_id uuid references public.v2_material_import_batches(id) on delete restrict,
  add column if not exists canonical_before jsonb,
  add column if not exists canonical_after jsonb;
create index if not exists v2_material_import_batches_target_tower_idx
  on public.v2_material_import_batches(project_id,target_tower_id,import_category_key,created_at desc);
create index if not exists v2_material_bundles_import_batch_idx on public.v2_material_bundles(source_import_batch_id);
create index if not exists v2_material_source_records_active_scope_idx
  on public.v2_material_source_records(project_id,tower_id,import_category_key,source_role_key,source_scope_key)
  where superseded_by_batch_id is null;
create index if not exists v2_material_source_records_item_idx on public.v2_material_source_records(material_item_id);
create index if not exists v2_material_source_records_target_bundle_idx on public.v2_material_source_records(bundle_id);
-- Preserve old rows. Infer legacy document scope from its actual batch, never
-- treat every document with the same source role as one Replace scope.
update public.v2_material_import_batches
set source_scope_key = coalesce(nullif(btrim(source_file_name),''),'Manual Entry')
where source_scope_key is null;
update public.v2_material_source_records s
set source_scope_key = coalesce(s.source_scope_key,b.source_scope_key),
    source_role_key = coalesce(s.source_role_key,b.source_role_key,s.source_type_key),
    import_category_key = coalesce(s.import_category_key,b.import_category_key,
      case s.material_kind when 'bundle' then 'bundles' when 'member' then 'members'
        when 'bolt' then 'bolts' when 'packer' then 'packers' end)
from public.v2_material_import_batches b
where b.id=s.import_batch_id and b.project_id=s.project_id and b.organisation_id=s.organisation_id
  and (s.source_scope_key is null or s.source_role_key is null or s.import_category_key is null);
-- Fill legacy target links only when there is exactly one deterministic match.
-- Unknown/ambiguous legacy ownership is deliberately left intact for review.
update public.v2_material_source_records s set bundle_id = (
  select (array_agg(b.id))[1] from public.v2_material_bundles b
  where b.project_id=s.project_id and b.organisation_id=s.organisation_id and b.tower_id=s.tower_id
    and upper(btrim(b.bundle_reference))=upper(btrim(s.bundle_reference))
    and (s.segment is null or b.segment is null or upper(btrim(b.segment))=upper(btrim(s.segment)))
  having count(*)=1
) where s.material_kind='bundle' and s.bundle_id is null;
update public.v2_material_source_records s set material_item_id = (
  select (array_agg(m.id))[1] from public.v2_material_register m
  where m.project_id=s.project_id and m.organisation_id=s.organisation_id and m.tower_id=s.tower_id
    and m.material_kind=s.material_kind and upper(btrim(m.item_reference))=upper(btrim(s.item_reference))
    and (s.segment is null or m.segment is null or upper(btrim(m.segment))=upper(btrim(s.segment)))
    and (s.drawing_reference is null or m.drawing_reference is null or upper(btrim(m.drawing_reference))=upper(btrim(s.drawing_reference)))
  having count(*)=1
) where s.material_kind in ('member','bolt','packer') and s.material_item_id is null;
-- Missing contextual values can be enriched; conflicting populated identity
-- context distinguishes records. Numeric quantities/revisions are not keys.
create or replace function private.tttracker_v2_material_import_compatible(a jsonb,b jsonb,category text)
returns boolean language sql immutable set search_path = '' as $$
  select not exists (
    select 1 from unnest(case when category='bundles' then array['segment']
      when category='members' then array['segment','drawing_reference']
      when category='bolts' then array['segment','drawing_reference','diameter','length','bolt_type']
      else array['segment','drawing_reference','diameter','packer_mark'] end) as f(key)
    where nullif(btrim(a->>key),'') is not null and nullif(btrim(b->>key),'') is not null
      and upper(btrim(a->>key))<>upper(btrim(b->>key))
  );
$$;
revoke all on function private.tttracker_v2_material_import_compatible(jsonb,jsonb,text) from public;
create or replace function public.tttracker_v2_apply_material_import(
  p_project_id uuid, p_organisation_id uuid, p_tower_id uuid, p_actor_id uuid,
  p_category text, p_mode text, p_source_role text, p_source_scope text,
  p_source_file text, p_profile_name text, p_mapping jsonb, p_rows jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; v jsonb; prior jsonb; plan jsonb := '[]'; errors jsonb := '[]';
  matches uuid[]; bundle_matches uuid[]; target_id uuid; link_bundle_id uuid;
  batch_id uuid; profile_id uuid; tower_type text; kind text; ref text;
  before_record jsonb; after_record jsonb; patch jsonb;
  bundle public.v2_material_bundles%rowtype;
  item public.v2_material_register%rowtype;
  row_no integer; field text; message text;
  added integer := 0; merged integer := 0; unchanged integer := 0;
  superseded integer := 0; accepted integer; scope_key text := nullif(btrim(p_source_scope),'');
  affected_items uuid[]; affected_bundles uuid[];
begin
  if p_category is null or p_category not in ('bundles','members','bolts','packers')
    or p_mode is null or p_mode not in ('add','merge','replace') then
    raise exception 'Invalid Materials import category or mode';
  end if;
  if scope_key is null or nullif(btrim(p_source_role),'') is null then
    raise exception 'Source role and document scope are required';
  end if;
  if p_mapping is null or jsonb_typeof(p_mapping)<>'object'
    or p_rows is null or jsonb_typeof(p_rows)<>'array' then
    raise exception 'Expected mapping object and row array';
  end if;
  accepted := jsonb_array_length(p_rows);
  if accepted=0 or accepted>10000 then raise exception 'Import requires 1 to 10000 rows'; end if;
  -- Serialize all import scopes in a project, including Add and concurrent Replace.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_project_id::text,0));
  perform 1 from public.v2_projects where id=p_project_id and organisation_id=p_organisation_id for share;
  if not found then raise exception 'Project does not belong to this organisation'; end if;
  perform 1 from public.organisation_users where organisation_id=p_organisation_id
    and user_id=p_actor_id and status='active' for share;
  if not found then raise exception 'Import actor has no active organisation membership'; end if;
  select coalesce(nullif(t.type_code,''),t.name) into tower_type
    from public.v2_towers tw left join public.v2_tower_types t on t.id=tw.tower_type_id
    where tw.id=p_tower_id and tw.project_id=p_project_id and tw.organisation_id=p_organisation_id
    for share of tw;
  if not found then raise exception 'Tower does not belong to this project and organisation'; end if;
  perform 1 from public.v2_project_option_definitions
    where project_id=p_project_id and organisation_id=p_organisation_id
      and option_group='material_import_source_role' and option_key=p_source_role and is_active
      and (not (settings ? 'applies_to') or settings->'applies_to'='[]'::jsonb
        or settings->'applies_to' ? p_category);
  if not found then raise exception 'Import source role is disabled or not configured for this category'; end if;
  -- Protect the preflight plan against concurrent edits to existing masters.
  -- The import advisory lock serializes inserts by other import transactions.
  perform 1 from public.v2_material_bundles where project_id=p_project_id and organisation_id=p_organisation_id for update;
  perform 1 from public.v2_material_register where project_id=p_project_id and organisation_id=p_organisation_id for update;
  kind := case p_category when 'bundles' then 'bundle' when 'members' then 'member'
    when 'bolts' then 'bolt' else 'packer' end;

  -- Complete preflight against live state. No master/profile/source writes here.
  for r in select value from jsonb_array_elements(p_rows) loop
    row_no := (r->>'row_number')::integer;
    v := r->'values'; message := null; target_id := null; link_bundle_id := null;
    if jsonb_typeof(v)<>'object' or jsonb_typeof(r->'raw_payload')<>'object' then
      raise exception 'Invalid prepared import row';
    end if;
    -- RPC is service-role only, but repeat value validation at the transaction boundary.
    for field in select key from jsonb_each(v) loop
      if field not in ('item_reference','bundle_reference','segment','drawing_reference','drawing_revision',
        'source_revision','description','profile','material_code','diameter','length','bolt_type','packer_mark',
        'material_item_id','bundle_id','required_quantity','total_weight_t') then
        message := concat_ws('; ',message,'Unexpected imported field: '||field);
      elsif field in ('required_quantity','total_weight_t') then
        if jsonb_typeof(v->field)<>'number' or (v->>field)::numeric<0 then
          message := concat_ws('; ',message,field||' must be a non-negative number');
        end if;
      elsif jsonb_typeof(v->field)<>'string' or nullif(btrim(v->>field),'') is null then
        message := concat_ws('; ',message,field||' must be nonblank text');
      end if;
    end loop;
    ref := nullif(btrim(v->>case when p_category='bundles' then 'bundle_reference' else 'item_reference' end),'');
    if ref is null then message := concat_ws('; ',message,'Material reference is required'); end if;
    if p_category in ('bolts','packers') then
      if not (v ? 'required_quantity') or not (v ? 'drawing_reference')
        or not (v ? case when p_category='bolts' then 'diameter' else 'packer_mark' end) then
        message := concat_ws('; ',message,'Required fastener fields are missing');
      end if;
    end if;
    for prior in select value from jsonb_array_elements(plan)
      where upper(btrim(value->'values'->>case when p_category='bundles' then 'bundle_reference' else 'item_reference' end))=upper(ref) loop
      if private.tttracker_v2_material_import_compatible(prior->'values',v,p_category) then
        message := concat_ws('; ',message,'Duplicate or ambiguous key with row '||(prior->>'row_number'));
      end if;
    end loop;
    if p_category='bundles' then
      select array_agg(b.id order by b.id) into matches from public.v2_material_bundles b
        where b.project_id=p_project_id and b.organisation_id=p_organisation_id and b.tower_id=p_tower_id
          and upper(btrim(b.bundle_reference))=upper(ref)
          and private.tttracker_v2_material_import_compatible(to_jsonb(b),v,p_category);
      if v ? 'material_item_id' then message := concat_ws('; ',message,'A bundle row cannot supply material_item_id'); end if;
      if v ? 'bundle_id' then
        target_id := (v->>'bundle_id')::uuid;
        if not target_id=any(coalesce(matches,'{}'::uuid[])) then
          message := concat_ws('; ',message,'bundle_id does not match this tower/project/reference');
        end if;
      end if;
    else
      select array_agg(m.id order by m.id) into matches from public.v2_material_register m
        where m.project_id=p_project_id and m.organisation_id=p_organisation_id and m.tower_id=p_tower_id
          and m.material_kind=kind and upper(btrim(m.item_reference))=upper(ref)
          and private.tttracker_v2_material_import_compatible(to_jsonb(m),v,p_category);
      if v ? 'material_item_id' then
        target_id := (v->>'material_item_id')::uuid;
        if not target_id=any(coalesce(matches,'{}'::uuid[])) then
          message := concat_ws('; ',message,'material_item_id does not match this tower/project/reference');
        end if;
      end if;
      if v ? 'bundle_id' then
        link_bundle_id := (v->>'bundle_id')::uuid;
        perform 1 from public.v2_material_bundles b where b.id=link_bundle_id
          and b.project_id=p_project_id and b.organisation_id=p_organisation_id and b.tower_id=p_tower_id
          and b.is_active and (not (v ? 'bundle_reference') or upper(btrim(b.bundle_reference))=upper(btrim(v->>'bundle_reference')))
          and private.tttracker_v2_material_import_compatible(to_jsonb(b),v,'bundles');
        if not found then message := concat_ws('; ',message,'bundle_id does not belong to this tower/project or conflicts with its reference'); end if;
      elsif p_category='members' and v ? 'bundle_reference' then
        select array_agg(b.id order by b.id) into bundle_matches from public.v2_material_bundles b
          where b.project_id=p_project_id and b.organisation_id=p_organisation_id and b.tower_id=p_tower_id and b.is_active
            and upper(btrim(b.bundle_reference))=upper(btrim(v->>'bundle_reference'))
            and private.tttracker_v2_material_import_compatible(to_jsonb(b),v,'bundles');
        if coalesce(cardinality(bundle_matches),0)>1 then
          message := concat_ws('; ',message,'Ambiguous bundle reference; supply a segment or explicit bundle ID');
        else link_bundle_id := bundle_matches[1]; end if;
      end if;
      -- Never move an existing operational member to a different bundle by importing.
      if target_id is null and cardinality(matches)=1 then target_id := matches[1]; end if;
      if target_id is not null and link_bundle_id is not null then
        perform 1 from public.v2_material_register m where m.id=target_id and m.bundle_id is not null and m.bundle_id<>link_bundle_id;
        if found then message := concat_ws('; ',message,'Existing bundle relationship conflicts; use an amendment instead'); end if;
      end if;
      if target_id is not null and v ? 'bundle_reference' then
        perform 1 from public.v2_material_register m where m.id=target_id
          and nullif(btrim(m.bundle_reference),'') is not null
          and upper(btrim(m.bundle_reference))<>upper(btrim(v->>'bundle_reference'));
        if found then message := concat_ws('; ',message,'Existing bundle reference conflicts; use an amendment instead'); end if;
      end if;
    end if;
    if target_id is null then
      if coalesce(cardinality(matches),0)>1 then
        message := concat_ws('; ',message,'Multiple matching master records; supply deterministic context or a record ID');
      else target_id := matches[1]; end if;
    end if;
    if target_id is not null and exists(select 1 from jsonb_array_elements(plan) x where x->>'target_id'=target_id::text) then
      message := concat_ws('; ',message,'Multiple rows resolve to the same canonical record');
    end if;
    if p_mode='add' and target_id is not null then
      if p_category='bundles' then
        perform 1 from public.v2_material_bundles where id=target_id and not is_active;
      else
        perform 1 from public.v2_material_register where id=target_id and not is_active;
      end if;
      if found then message := concat_ws('; ',message,'Matching master is archived; use Merge or Replace to reactivate it safely'); end if;
    end if;
    if message is not null then errors := errors||jsonb_build_array(jsonb_build_object('row',row_no,'message',message)); end if;
    plan := plan||jsonb_build_array(r||jsonb_build_object('target_id',target_id,'link_bundle_id',link_bundle_id));
  end loop;
  if jsonb_array_length(errors)>0 then
    return jsonb_build_object('ok',false,'error','Validation failed. No rows were applied.',
      'acceptedRows',0,'rejectedRows',accepted,'rowErrors',errors);
  end if;

  -- All mutations below are in the RPC transaction. Any exception rolls all back.
  if nullif(btrim(p_profile_name),'') is not null then
    select id into profile_id from public.v2_material_import_profiles
      where organisation_id=p_organisation_id and project_id=p_project_id and lower(name)=lower(btrim(p_profile_name));
    if profile_id is null then
      insert into public.v2_material_import_profiles(organisation_id,project_id,name,source_type_key,mapping,defaults,created_by)
        values(p_organisation_id,p_project_id,btrim(p_profile_name),p_source_role,p_mapping,
          jsonb_build_object('import_category_key',p_category),p_actor_id) returning id into profile_id;
      if profile_id is null then raise exception 'Create material import profile returned no ID'; end if;
    else
      update public.v2_material_import_profiles set mapping=p_mapping,source_type_key=p_source_role,updated_at=now() where id=profile_id;
    end if;
  end if;
  insert into public.v2_material_import_batches(organisation_id,project_id,target_tower_id,import_category_key,
    source_role_key,source_type_key,source_scope_key,source_file_name,profile_id,status,import_mode,total_rows,mapping,created_by)
    values(p_organisation_id,p_project_id,p_tower_id,p_category,p_source_role,p_source_role,scope_key,
      nullif(btrim(p_source_file),''),profile_id,'committing',p_mode,accepted,p_mapping,p_actor_id) returning id into batch_id;
  if batch_id is null then raise exception 'Create material import batch returned no ID'; end if;
  if p_mode='replace' then
    select array_agg(distinct material_item_id) filter(where material_item_id is not null),
      array_agg(distinct bundle_id) filter(where bundle_id is not null)
      into affected_items,affected_bundles from public.v2_material_source_records
      where project_id=p_project_id and organisation_id=p_organisation_id and tower_id=p_tower_id
        and import_category_key=p_category and source_role_key=p_source_role and source_scope_key=scope_key
        and superseded_by_batch_id is null;
    update public.v2_material_source_records set superseded_by_batch_id=batch_id
      where project_id=p_project_id and organisation_id=p_organisation_id and tower_id=p_tower_id
        and import_category_key=p_category and source_role_key=p_source_role and source_scope_key=scope_key
        and superseded_by_batch_id is null;
    get diagnostics superseded = row_count;
  end if;

  for r in select value from jsonb_array_elements(plan) loop
    v := r->'values'; target_id := (r->>'target_id')::uuid; link_bundle_id := (r->>'link_bundle_id')::uuid;
    before_record := null; after_record := null;
    if p_category='bundles' then
      if target_id is null then
        insert into public.v2_material_bundles(organisation_id,project_id,tower_id,tower_type,bundle_reference,
          segment,required_quantity,total_weight_t,source_document,source_revision,source_import_batch_id,metadata,origin_organisation_id)
          values(p_organisation_id,p_project_id,p_tower_id,tower_type,v->>'bundle_reference',v->>'segment',
            coalesce((v->>'required_quantity')::numeric,1),(v->>'total_weight_t')::numeric,
            nullif(btrim(p_source_file),''),v->>'source_revision',batch_id,
            jsonb_strip_nulls(jsonb_build_object('description',v->>'description','source_role',p_source_role)),p_organisation_id)
          returning id into target_id;
        if target_id is null then raise exception 'Create material bundle returned no ID'; end if;
        added := added+1;
      else
        select * into strict bundle from public.v2_material_bundles where id=target_id for update;
        before_record := to_jsonb(bundle);
        if p_mode<>'add' then
          select coalesce(jsonb_object_agg(key,value),'{}') into patch from jsonb_each(v)
            where key in ('segment','required_quantity','total_weight_t');
          bundle := jsonb_populate_record(bundle,patch);
          update public.v2_material_bundles set segment=bundle.segment,required_quantity=bundle.required_quantity,
            total_weight_t=bundle.total_weight_t,is_active=true,updated_at=now(),
            metadata=metadata||case when v ? 'description' then jsonb_build_object('description',v->>'description') else '{}' end
            where id=target_id;
          merged := merged+1;
        else unchanged := unchanged+1; end if;
      end if;
      select to_jsonb(b) into after_record from public.v2_material_bundles b where id=target_id;
    else
      if target_id is null then
        insert into public.v2_material_register(organisation_id,project_id,tower_id,tower_type,material_kind,item_reference,
          description,bundle_id,bundle_reference,segment,drawing_reference,drawing_revision,profile,material_code,
          diameter,length,bolt_type,packer_mark,required_quantity,source_kind,source_role_key,source_document,
          source_revision,source_import_batch_id,origin_organisation_id)
          values(p_organisation_id,p_project_id,p_tower_id,tower_type,kind,v->>'item_reference',v->>'description',
            link_bundle_id,v->>'bundle_reference',v->>'segment',v->>'drawing_reference',v->>'drawing_revision',
            v->>'profile',v->>'material_code',v->>'diameter',v->>'length',v->>'bolt_type',v->>'packer_mark',
            (v->>'required_quantity')::numeric,p_source_role,p_source_role,nullif(btrim(p_source_file),''),
            coalesce(v->>'source_revision',v->>'drawing_revision'),batch_id,p_organisation_id)
          returning id into target_id;
        if target_id is null then raise exception 'Create material item returned no ID'; end if;
        added := added+1;
      else
        select * into strict item from public.v2_material_register where id=target_id for update;
        before_record := to_jsonb(item);
        if p_mode<>'add' then
          select coalesce(jsonb_object_agg(key,value),'{}') into patch from jsonb_each(v)
            where key in ('description','bundle_reference','segment','drawing_reference','drawing_revision','profile',
              'material_code','diameter','length','bolt_type','packer_mark','required_quantity');
          item := jsonb_populate_record(item,patch);
          update public.v2_material_register set description=item.description,bundle_reference=item.bundle_reference,
            segment=item.segment,drawing_reference=item.drawing_reference,drawing_revision=item.drawing_revision,
            profile=item.profile,material_code=item.material_code,diameter=item.diameter,length=item.length,
            bolt_type=item.bolt_type,packer_mark=item.packer_mark,required_quantity=item.required_quantity,
            bundle_id=coalesce(bundle_id,link_bundle_id),is_active=true,updated_at=now()
            where id=target_id;
          merged := merged+1;
        else unchanged := unchanged+1; end if;
      end if;
      -- Append missing links; never delete/reassign historical pack membership.
      if link_bundle_id is not null and (before_record is null or p_mode<>'add') then
        insert into public.v2_material_bundle_members(organisation_id,project_id,tower_id,bundle_id,material_item_id,
          member_reference,quantity,source_document,source_revision,metadata)
          select p_organisation_id,p_project_id,p_tower_id,link_bundle_id,target_id,v->>'item_reference',
            coalesce((v->>'required_quantity')::numeric,1),nullif(btrim(p_source_file),''),v->>'drawing_revision',
            jsonb_build_object('import_batch_id',batch_id)
          where kind='member' and not exists(select 1 from public.v2_material_bundle_members
            where bundle_id=link_bundle_id and material_item_id=target_id);
      end if;
      select to_jsonb(m) into after_record from public.v2_material_register m where id=target_id;
    end if;
    insert into public.v2_material_source_records(organisation_id,project_id,import_batch_id,source_type_key,source_role_key,
      source_scope_key,import_category_key,source_row_number,tower_id,tower_type,material_kind,item_reference,description,
      bundle_reference,segment,drawing_reference,drawing_revision,source_revision,profile,material_code,diameter,length,
      bolt_type,packer_mark,required_quantity,total_weight_t,unit,raw_payload,material_item_id,bundle_id,canonical_before,canonical_after)
      values(p_organisation_id,p_project_id,batch_id,p_source_role,p_source_role,scope_key,p_category,
        (r->>'row_number')::integer,p_tower_id,tower_type,kind,v->>'item_reference',v->>'description',
        v->>'bundle_reference',v->>'segment',v->>'drawing_reference',v->>'drawing_revision',v->>'source_revision',
        v->>'profile',v->>'material_code',v->>'diameter',v->>'length',v->>'bolt_type',v->>'packer_mark',
        (v->>'required_quantity')::numeric,(v->>'total_weight_t')::numeric,
        case when kind='bundle' then 'bundle' else 'ea' end,r->'raw_payload',
        case when kind<>'bundle' then target_id end,case when kind='bundle' then target_id else link_bundle_id end,
        before_record,after_record);
  end loop;

  if p_mode='replace' then
    -- Retire only previously linked requirements with no remaining active source.
    -- Master UUIDs and every operational/reference row are retained.
    update public.v2_material_register m set is_active=false,updated_at=now()
      where m.id=any(coalesce(affected_items,'{}'::uuid[])) and m.project_id=p_project_id
        and m.organisation_id=p_organisation_id and not exists(select 1 from public.v2_material_source_records s
          where s.material_item_id=m.id and s.superseded_by_batch_id is null);
    update public.v2_material_bundles b set is_active=false,updated_at=now()
      where p_category='bundles' and b.id=any(coalesce(affected_bundles,'{}'::uuid[])) and b.project_id=p_project_id
        and b.organisation_id=p_organisation_id and not exists(select 1 from public.v2_material_source_records s
          where s.bundle_id=b.id and s.material_kind='bundle' and s.superseded_by_batch_id is null);
  end if;
  -- Bundle imports can follow member imports. Link only unique, previously
  -- unlinked members; retained check/delivery relationships are never reassigned.
  if p_category='bundles' and p_mode<>'add' then
    for item in select * from public.v2_material_register m
      where m.project_id=p_project_id and m.organisation_id=p_organisation_id and m.tower_id=p_tower_id
        and m.material_kind='member' and m.is_active and m.bundle_id is null and m.bundle_reference is not null for update loop
      select array_agg(b.id) into bundle_matches from public.v2_material_bundles b
        where b.project_id=p_project_id and b.organisation_id=p_organisation_id and b.tower_id=p_tower_id and b.is_active
          and upper(btrim(b.bundle_reference))=upper(btrim(item.bundle_reference))
          and private.tttracker_v2_material_import_compatible(to_jsonb(b),to_jsonb(item),'bundles');
      if cardinality(bundle_matches)=1 then
        update public.v2_material_register set bundle_id=bundle_matches[1] where id=item.id;
        insert into public.v2_material_bundle_members(organisation_id,project_id,tower_id,bundle_id,material_item_id,
          member_reference,quantity,metadata) values(p_organisation_id,p_project_id,p_tower_id,bundle_matches[1],item.id,
            item.item_reference,coalesce(item.required_quantity,1),jsonb_build_object('linked_by_import_batch',batch_id));
      end if;
    end loop;
  end if;
  update public.v2_material_import_batches set status='completed',imported_rows=accepted,committed_at=now(),
    metadata=jsonb_build_object('added_rows',added,'merged_rows',merged,'unchanged_rows',unchanged,'superseded_rows',superseded)
    where id=batch_id;
  return jsonb_build_object('ok',true,'batchId',batch_id,'acceptedRows',accepted,'rejectedRows',0,
    'addedRows',added,'mergedRows',merged,'unchangedRows',unchanged,'supersededRows',superseded,'rowErrors','[]'::jsonb);
end;
$$;
-- Actor/context arguments are supplied by the authenticated server, never by
-- public callers. Revoke default PUBLIC function execution explicitly.
revoke all on function public.tttracker_v2_apply_material_import(uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.tttracker_v2_apply_material_import(uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb)
  to service_role;
commit;
notify pgrst, 'reload schema';

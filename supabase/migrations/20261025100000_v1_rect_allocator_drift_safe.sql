-- V1 only. Historical rows stay unchanged; all inserts share this allocator.
create or replace function public.tttracker_assign_revision_number()
returns trigger language plpgsql security definer set search_path=public as $$
declare next_no bigint; digits integer; candidate text;
begin
  if new.project_id is null or new.tower_id is null then
    raise exception 'project_id and tower_id are required for Revision numbering';
  end if;
  perform pg_advisory_xact_lock(hashtext('tttracker_revision:' || new.project_id::text || ':' || new.tower_id::text));
  -- Neither a supplied sequence nor an old sequence column is authoritative.
  -- Canonical RECT strings (including historical padding) and legacy RECT
  -- references can be ahead of their sequence_no after imports/backfills.
  select coalesce(max(greatest(coalesce(r.sequence_no,0),
      case when r.revision_number ~* '^RECT-[0-9]+$' then substring(r.revision_number from '[0-9]+$')::bigint else 0 end,
      case when r.fli_number ~* '^RECT-[0-9]+$' then substring(r.fli_number from '[0-9]+$')::bigint else 0 end)),0)+1,
    greatest(2,coalesce(max(case when r.revision_number ~* '^RECT-[0-9]+$' then length(substring(r.revision_number from '[0-9]+$')) else 2 end),2))
  into next_no,digits from public.tower_revisions r
  where r.project_id=new.project_id and r.tower_id=new.tower_id;
  loop
    candidate := 'RECT-' || lpad(next_no::text,greatest(digits,length(next_no::text)),'0');
    exit when not exists(select 1 from public.tower_revisions r
      where r.project_id=new.project_id and r.tower_id=new.tower_id
      and (r.sequence_no=next_no or lower(r.revision_number)=lower(candidate)));
    next_no := next_no+1;
  end loop;
  new.sequence_no := next_no;
  new.revision_number := candidate;
  new.fli_number := null;
  return new;
end; $$;
-- Standalone safety for environments where the earlier compatibility fix
-- has not been applied. Never copy scoped RECT numbers into global legacy FLI.
create or replace function public.tttracker_sync_legacy_revision_number()
returns trigger language plpgsql set search_path=public as $$
begin return new; end; $$;
notify pgrst,'reload schema';

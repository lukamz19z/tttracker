-- Read-only snapshot of V1 live trigger functions, 24 October 2026.
-- Regression fixture only: the compatibility mirror below is intentionally broken.
CREATE OR REPLACE FUNCTION public.tttracker_assign_fli_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  next_no integer;
begin
  if new.revision_id is null then
    raise exception 'revision_id is required for FLI numbering';
  end if;

  if new.item_number is null or new.item_number < 1 then
    perform pg_advisory_xact_lock(
      hashtext('tttracker_fli:' || new.revision_id::text)
    );

    select coalesce(max(item_number), 0) + 1
      into next_no
    from public.tower_revision_items
    where revision_id = new.revision_id;

    new.item_number := next_no;
  end if;

  new.fli_number :=
    'FLI-' || lpad(new.item_number::text, 3, '0');

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tttracker_assign_revision_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  next_no integer;
begin
  if new.project_id is null or new.tower_id is null then
    raise exception 'project_id and tower_id are required for Revision numbering';
  end if;

  if new.sequence_no is null or new.sequence_no < 1 then
    perform pg_advisory_xact_lock(
      hashtext(
        'tttracker_revision:' ||
        new.project_id::text ||
        ':' ||
        new.tower_id::text
      )
    );

    select coalesce(max(sequence_no), 0) + 1
      into next_no
    from public.tower_revisions
    where project_id = new.project_id
      and tower_id = new.tower_id;

    new.sequence_no := next_no;
  end if;

  new.revision_number :=
    'RECT-' || lpad(new.sequence_no::text, 2, '0');

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tttracker_sync_legacy_revision_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.fli_number := new.revision_number;
  return new;
end;
$function$;


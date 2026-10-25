-- Historical capture instants remain untouched. Existing captured_at is timestamptz.
alter table public.projects add column if not exists timezone text;
comment on column public.projects.timezone is 'IANA project/site timezone for Quality evidence display; null uses the V1 Australian fallback.';
create or replace function public.validate_v1_project_timezone()
returns trigger language plpgsql set search_path=public as $$
begin
 if new.timezone is not null and not exists(select 1 from pg_timezone_names where name=new.timezone) then
   raise exception 'A valid IANA project timezone is required.' using errcode='22023';
 end if;
 return new;
end; $$;
drop trigger if exists projects_validate_timezone on public.projects;
create trigger projects_validate_timezone before insert or update of timezone on public.projects
for each row execute function public.validate_v1_project_timezone();
notify pgrst,'reload schema';

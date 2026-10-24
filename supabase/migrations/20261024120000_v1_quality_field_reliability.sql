-- V1 only. Nullable additions preserve historical Quality records.
alter table public.tower_revision_items add column if not exists leg text check (leg in ('A','B','C','D'));
alter table public.tower_revision_items add column if not exists assigned_flag text;
alter table public.tower_revisions add column if not exists finalised_at timestamptz;
alter table public.tower_quality_files add column if not exists mobile_client_mutation_id text;
alter table public.tower_quality_files add column if not exists evidence_metadata jsonb;
alter table public.tower_quality_files add column if not exists annotated_sharepoint_item_id text;
create unique index if not exists tower_quality_files_mobile_photo_id on public.tower_quality_files(project_id,mobile_client_mutation_id) where mobile_client_mutation_id is not null;

create or replace function public.seed_v1_rectification_issues(target_project uuid) returns void language sql set search_path=public as $$
 insert into public.project_field_issue_types(project_id,applies_to,name,active,sort_order)
 select target_project,'revision',name,true,1000 from (values ('Wrong orientation'),('Not enough torque')) options(name)
 where not exists(select 1 from public.project_field_issue_types existing where existing.project_id=target_project and lower(btrim(existing.name))=lower(options.name) and existing.applies_to in ('revision','both'));
$$;
select public.seed_v1_rectification_issues(id) from public.projects;
create or replace function public.seed_v1_rectification_issues_on_project() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.seed_v1_rectification_issues(new.id); return new; end;
$$;
drop trigger if exists seed_v1_rectification_issues on public.projects;
create trigger seed_v1_rectification_issues after insert on public.projects for each row execute function public.seed_v1_rectification_issues_on_project();
revoke all on function public.seed_v1_rectification_issues(uuid) from public;
grant execute on function public.seed_v1_rectification_issues(uuid) to service_role;
-- Canonical invalidation also covers edits made directly by the existing website.
create or replace function public.invalidate_v1_revision_finalisation() returns trigger language plpgsql security definer set search_path=public as $$
declare target_revision uuid;
begin
 if tg_op = 'DELETE' then target_revision := old.revision_id; else target_revision := new.revision_id; end if;
 if tg_table_name='tower_quality_files' then
   if tg_op='DELETE' then if old.file_role not in ('before_photo','after_photo') then return null; end if;
   else if new.file_role not in ('before_photo','after_photo') then return null; end if; end if;
 end if;
 update public.tower_revisions set finalised_at=null where id=target_revision;
 return null;
end;
$$;
drop trigger if exists invalidate_v1_revision_finalisation on public.tower_revision_items;
create trigger invalidate_v1_revision_finalisation after insert or update or delete on public.tower_revision_items for each row execute function public.invalidate_v1_revision_finalisation();
drop trigger if exists invalidate_v1_revision_finalisation on public.tower_quality_files;
create trigger invalidate_v1_revision_finalisation after insert or update or delete on public.tower_quality_files for each row execute function public.invalidate_v1_revision_finalisation();
notify pgrst, 'reload schema';

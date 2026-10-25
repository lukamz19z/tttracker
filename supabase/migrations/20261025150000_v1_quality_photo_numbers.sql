alter table public.tower_quality_files add column if not exists photo_no integer;
alter table public.tower_quality_files add column if not exists evidence_type text;
alter table public.tower_quality_upload_sessions add column if not exists photo_no integer;
alter table public.tower_quality_upload_sessions add column if not exists evidence_type text;
create unique index if not exists tower_quality_files_photo_no_uidx on public.tower_quality_files((coalesce(revision_item_id,defect_id)),evidence_type,photo_no) where photo_no is not null;
create or replace function public.claim_v1_quality_photo_number(target_file uuid,target_session uuid,photo_phase text)
returns integer language plpgsql security definer set search_path=public as $$
declare subject uuid; result integer;
begin
 if (target_file is null)=(target_session is null) or photo_phase not in ('BEFORE','AFTER','EVIDENCE') then raise exception 'Invalid photo number request'; end if;
 if target_file is not null then select coalesce(revision_item_id,defect_id) into subject from tower_quality_files where id=target_file;
 else select coalesce(revision_item_id,defect_id) into subject from tower_quality_upload_sessions where id=target_session; end if;
 if subject is null then raise exception 'Quality evidence relationship not found'; end if;
 perform pg_advisory_xact_lock(hashtext('quality-photo:'||subject::text||':'||photo_phase));
 if target_file is not null then select photo_no into result from tower_quality_files where id=target_file;
 else select photo_no into result from tower_quality_upload_sessions where id=target_session; end if;
 if result is not null then return result; end if;
 select coalesce(max(photo_no),0)+1 into result from (
   select photo_no from tower_quality_files where coalesce(revision_item_id,defect_id)=subject and evidence_type=photo_phase
   union all select photo_no from tower_quality_upload_sessions where coalesce(revision_item_id,defect_id)=subject and evidence_type=photo_phase
 ) numbers;
 if target_file is not null then update tower_quality_files set photo_no=result,evidence_type=photo_phase where id=target_file;
 else update tower_quality_upload_sessions set photo_no=result,evidence_type=photo_phase where id=target_session; end if;
 return result;
end; $$;
revoke all on function public.claim_v1_quality_photo_number(uuid,uuid,text) from public;
grant execute on function public.claim_v1_quality_photo_number(uuid,uuid,text) to service_role;
alter table public.tower_revisions add column if not exists reserved_pdf_revision integer not null default 0;
create or replace function public.reserve_v1_revision_pdf_number(target_revision uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare result integer;
begin
 update tower_revisions set reserved_pdf_revision=greatest(coalesce(pdf_revision,0),reserved_pdf_revision)+1
 where id=target_revision returning reserved_pdf_revision into result;
 if result is null then raise exception 'Revision not found'; end if;
 return result;
end; $$;
revoke all on function public.reserve_v1_revision_pdf_number(uuid) from public;
grant execute on function public.reserve_v1_revision_pdf_number(uuid) to service_role;
notify pgrst,'reload schema';

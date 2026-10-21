begin;
-- Recover candidates for drafts created before the new submission wrapper.
-- This changes links only: never current status, review status or external files.
update public.v2_training_records r
set supersedes_record_id=private.tttracker_v2_supersede_candidate(r.organisation_id,r.person_id,r.training_type_id,r.option_id,r.project_id,r.id)
where not r.is_current and r.superseded_at is null and r.supersedes_record_id is null
and r.review_status in ('pending_review','changes_required');
notify pgrst,'reload schema';
commit;

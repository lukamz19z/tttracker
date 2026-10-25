begin;
-- Preserve idempotent network retries after an approval has committed.
do $$ declare definition text; old text; replacement text; begin
 definition:=pg_get_functiondef('public.tttracker_v2_people_write(uuid,text,uuid,jsonb)'::regprocedure);
 old:='  if not found or r.review_status not in (''pending_review'',''changes_required'') then raise exception ''TRAINING_INVALID_TRANSITION'';end if;';
 replacement:='  if found and r.review_status=''approved'' and r.is_current then return jsonb_build_object(''id'',p_id,''retry'',true);end if;'||old;
 if position(old in definition)=0 then raise exception 'TRAINING_APPROVAL_IDEMPOTENCY_UPGRADE_REQUIRED'; end if;
 execute replace(definition,old,replacement);
end $$;
commit;

;

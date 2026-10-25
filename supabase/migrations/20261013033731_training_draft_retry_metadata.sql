begin;
-- Persist the user's single-file vs front/back choice with the idempotent
-- submission payload so a resumed draft reconstructs the same requirements.
do $$ declare definition text; old text; replacement text; begin
 definition:=pg_get_functiondef('public.tttracker_v2_people_read(uuid,text,text,integer,uuid,jsonb)'::regprocedure);
 old:='s.submission_key,coalesce(s.payload->''linked_type_ids'',''[]''::jsonb) linked_type_ids';
 replacement:=old||',s.payload->>''evidence_format'' evidence_format';
 if position(old in definition)=0 then raise exception 'TRAINING_DRAFT_RETRY_PROJECTION_UPGRADE_REQUIRED'; end if;
 execute replace(definition,old,replacement);
end $$;
notify pgrst,'reload schema';
commit;

;

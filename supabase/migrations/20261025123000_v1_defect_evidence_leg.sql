-- Optional canonical Defect context; no rewrite of historic evidence.
alter table public.tower_defects add column if not exists leg text check (leg in ('A','B','C','D'));
-- Retain provider IDs through an interrupted metadata association so cleanup
-- and retries can still account for both published files.
alter table public.tower_quality_upload_sessions add column if not exists published_item_id text;
alter table public.tower_quality_upload_sessions add column if not exists annotated_item_id text;
notify pgrst,'reload schema';

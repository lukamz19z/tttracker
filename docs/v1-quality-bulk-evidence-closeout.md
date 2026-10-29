# V1 Quality implementation report - 30 October 2026

Work was completed in the current V1 working tree. Existing Quality functionality was extended. V2 was not modified. Nothing was committed, pushed, deployed, or remotely migrated.

1. **Files changed:** the exact file list appears below.
2. **Broken question marks:** literal placeholder characters existed in website/mobile JSX and PDF captions. FLI metadata now uses separate elements with flex/gap; website deletion uses Lucide Trash2 and the mobile viewer uses Ionicons trash-outline. Genuine confirmation questions remain.
3. **Legacy display:** historical FLIs display no website source badge or Manual on mobile/PDF. Imported findings display Punchlist. Internal compatibility values remain supported.
4. **Status/completeness:** Photos Complete means both Before and After are present. Comments are optional. Ready to Rectify requires photos and issue details while workflow status is still open. Rectified is canonical saved state. PDF completeness requires evidence and workflow closeout, independently of comments.
5. **Save & Mark Rectified:** saves action text through the existing version-checked command RPC, validates evidence/issue, records authenticated actioned user/time, and refreshes state. Save Only is available. Uploading After evidence alone does not close an FLI. The evidence editor retains the opened record version rather than silently adopting concurrent changes.
6. **Bulk upload:** multi-file and folder selection during import, before commit; sequential binary chunk uploads and metadata-only review avoid rendering hundreds of full-resolution images. JPEG/PNG are supported for bulk import.
7. **Matching rules:** case-insensitive exact spreadsheet photo filenames, or exact external reference as filename stem with an optional underscore, space or hyphen followed by digits. For example TG-000124_01.jpg and TG-000124_02.jpg both match TG-000124. Partial references and fuzzy matching are rejected; overlapping references become ambiguous.
8. **Scale result:** 200 rows imported through the real SQL functions in local PGlite; 260 filenames matched in approximately 7-13 ms in repeated local runs. Multiple photos per finding verified. This measures matching and SQL behavior, not real SharePoint transfer throughput.
9. **Review/exceptions:** selected, matched, unmatched, ambiguous, excluded, no-photo and duplicate-reference counts are shown. Every selected file has a review row. Users can assign a finding row via searchable suggestions or explicitly exclude a file without renaming/restarting. Same-tower duplicate references are rejected; repeated references across towers require disambiguation.
10. **Inspector:** spreadsheet mapping supports Inspector, Inspected By and Raised By. Stored as inspector_name; emails are rejected as inspector names.
11. **Inspector vs importer:** inspector_name is source attribution; source_batch_id links to the existing import batch authenticated imported_by UUID. imported_by_label is supplied by the authenticated server context, independently of spreadsheet text. Operational labels do not use email addresses.
12. **Website Before/After:** Add Evidence on an existing FLI supports multiple Before or After files. The existing gallery navigates across both phases; previews are lazy images. Website HEIC conversion remains supported.
13. **Controlled watermark:** browser uploads use signed direct-upload sessions and the existing server finalisation route. Sharp bakes canonical Project, Tower, RECT, FLI, phase, Flag, Leg, Segment, Member, Drawing and Issue metadata plus known capture details. Original bytes remain separately retained. No raw-only published evidence path was added.
14. **Captured By:** optional manual photographer full name, including people without an account; stored in canonical evidence_metadata and rendered in the watermark. Authenticated uploaded_by UUID and uploader label remain separate. A People picker was not added.
15. **Capture timestamp:** existing JPEG/PNG EXIF extraction is used where available. Explicit project-local Captured Date/Time overrides are supported. Date-only remains date-only; unknown remains null. Upload time is never substituted. Capture inputs apply to the selected group; upload separate groups when photographers/manual timestamps differ.
16. **SharePoint:** existing project configuration, folders, direct sessions, controlled derivatives and canonical human-readable filenames remain in use. Import-photo mutation keys retain their existing prefix for retry compatibility.
17. **Deletion:** individual deletion, SharePoint original/derivative cleanup, queued offline tombstones, anti-resurrection checks, count/readiness recalculation and report invalidation remain. Mobile detail counts also update immediately after a locally queued deletion.
18. **PDF:** all intake paths use tower_quality_files and are included by the existing PDF route. Tests cover mobile plus imported Before and website Before/After. Inspector, importer, photographer and date-only metadata are preserved. Dynamic photo counts remain presentation text rather than image pixels.
19. **Migration:** extended supabase/migrations/20261030120000_v1_quality_punchlists_and_evidence.sql, already tracked in commit e02cd0c but explicitly confirmed unapplied by the user. Added only inspector_name and imported_by_label to items; reused existing batch UUID audit and evidence_metadata JSON. Closeout validates required evidence and issues; blank/null comments are permitted for both item closeout and RECT finalisation. Migration executed twice locally to verify idempotency. Schema cache reload remains. No additional migration, db push, repair or remote application.
20. **Website TypeScript:** npx tsc --noEmit passed.
21. **Website production build:** npm run build passed; all 74 static pages generated.
22. **Mobile TypeScript:** mobile/npx tsc --noEmit passed.
23. **Lint:** all changed/new website TS/TSX/MJS and changed mobile TS/TSX passed with zero errors and zero warnings.
24. **Quality verification:** all eight scripts listed below passed. Tests use local PGlite and mocked external services; real Sharp watermark generation and actual route handlers run locally.
25. **Diff/status:** git diff --check passed. git status --short was inspected; V1-only changes and this report are uncommitted. No V2 paths changed.
26. **Website deployment:** required after the unapplied migration is applied through the normal release process. Neither was performed in this session.
27. **Mobile release:** an OTA update is required for compatible installed runtime versions. No package/native dependency changes; this patch itself does not require a new native build.
28. **Remaining device/environment tests:** authenticated desktop/Safari folder selection and manual assignments with real source files; real SharePoint upload/download/delete and PDF publication; iPhone camera/library/HEIC, low-memory behavior and killed-app recovery; offline photo add/delete/reconnect; two physical phones editing the same/different FLIs; separate PostgreSQL sessions for true database concurrency. PGlite serialises execution. No real account writes or physical-device tests were performed.

## Verification scripts

- scripts/verify-v1-quality-bulk-evidence.mjs
- scripts/verify-v1-quality-followup.mjs
- scripts/verify-v1-quality-photo-deletion.mjs
- scripts/verify-v1-quality-publication.mjs
- scripts/verify-v1-quality-punchlist.mjs
- scripts/verify-v1-quality-reliability.mjs
- scripts/verify-v1-quality-time-location-render.mjs
- scripts/verify-v1-quality-upload-delete.mjs

## Exact changed files

- `app/(protected)/project/[projectId]/tower/[towerId]/revisions/page.tsx`
- `app/api/quality/files/revisions/[revisionId]/pdf/route.ts`
- `app/api/quality/files/upload-session/route.ts`
- `app/api/quality/files/upload/route.ts`
- `app/api/quality/punchlists/route.ts`
- `components/quality/EvidenceCaptureFields.tsx`
- `components/quality/PunchlistImport.tsx`
- `docs/v1-quality-bulk-evidence-closeout.md`
- `lib/quality/browser-evidence.ts`
- `lib/quality/evidence-layout.ts`
- `lib/quality/evidence-publication.ts`
- `lib/quality/finding-readiness.ts`
- `lib/quality/punchlist.ts`
- `lib/quality/revision-pdf.ts`
- `lib/quality/upload-ticket.ts`
- `mobile/app/revisions/[revisionId].tsx`
- `mobile/app/revisions/[revisionId]/[itemId].tsx`
- `mobile/app/revisions/[revisionId]/new-finding.tsx`
- `mobile/app/revisions/[revisionId]/new.tsx`
- `mobile/components/quality/QualityEvidenceGallery.tsx`
- `mobile/components/quality/QualityPhotoPicker.tsx`
- `mobile/lib/offline/revision-sync.ts`
- `mobile/types/quality.ts`
- `scripts/verify-v1-quality-bulk-evidence.mjs`
- `scripts/verify-v1-quality-publication.mjs`
- `scripts/verify-v1-quality-punchlist.mjs`
- `supabase/migrations/20261030120000_v1_quality_punchlists_and_evidence.sql`

## Optional-comment correction

Rectification comments are optional for both Punchlist and Manual FLIs. Removed the requirement from the shared readiness helper, website badge, both mobile closeout forms, PDF completeness, update_v1_quality_item and finalise_v1_revision_atomic in the still-unapplied migration. Comments remain editable, saved and included in PDFs. Photo, issue, canonical status, permission and concurrency rules are unchanged. Targeted tests explicitly exercise blank-comment closeout, mixed RECT finalisation/submission, and real PDF rendering for both source types.

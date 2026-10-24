# V1 Quality RECT/FLI sync repair ? 24 October 2026

## Live audit and exact root cause

Read-only inspection of V1 Supabase (not V2) confirmed these trigger definitions:

- `tttracker_assign_revision_number()` sets a tower-scoped `revision_number`, currently `RECT-01`, `RECT-02`, etc. It acquires `pg_advisory_xact_lock` for project+tower before reading the next sequence inside the insert transaction.
- `tttracker_assign_fli_number()` sets finding-level `item_number` and `fli_number`, currently `FLI-001`, etc., under a revision-scoped transaction advisory lock.
- `tttracker_sync_legacy_revision_number()` incorrectly executed `new.fli_number := new.revision_number` on parent insert/update.
- `tower_revisions_fli_number_uidx` is globally unique on parent `fli_number`.

The audited historical parent has `revision_number=RECT-01` and legacy `fli_number=RECT-01`. A different tower's first parent also becomes `RECT-01`, and the compatibility trigger copies that value into the globally unique column. This is the actual reported collision. The API did not explicitly allocate a child FLI; the database compatibility trigger wrote the conflicting parent value.

The supplied stuck parent mutation was not present server-side at audit time. No production records, triggers or indexes were changed during this task.

## Required report

1. **Inserted legacy value:** `RECT-01`, copied by the compatibility trigger from `revision_number`.
2. **Collision:** RECT sequences are scoped to project+tower, while the historical parent FLI index is global. Another tower already has legacy `RECT-01`.
3. **Parent canonical field:** `tower_revisions.revision_number` is the RECT identifier. Website and mobile call the same authenticated parent handler and existing database allocator.
4. **Finding FLI:** existing `tttracker_assign_fli_number()` insert trigger on `tower_revision_items`; no on-device or array-position allocator.
5. **Legacy parent field:** retained and nullable. New API inserts explicitly pass null. The migration stops automatic mirroring; historic values and explicit legacy imports remain unchanged.
6. **Migration:** new `supabase/migrations/20261024143000_v1_rect_legacy_numbering_fix.sql`, idempotently tested in PGlite. It corrects the compatibility function and records existing partial mutation indexes/comments. It does not drop the legacy index, change allocator rules, rewrite historic records or delete columns. **Not applied to production.**
7. **Mutation constraints:** both already exist: `tower_revisions_project_mobile_mutation_uidx` and `tower_revision_items_project_mobile_mutation_uidx`, unique on `(project_id,mobile_client_mutation_id)` when non-null. Read-only duplicate audit returned no duplicate groups. Item FLI remains unique within its revision. Existing scoped RECT uniqueness remains.
8. **Parent idempotency:** look up project+mutation before insert, check creator/tower context, return existing resource. A concurrent uniqueness conflict repeats the lookup. Genuine number conflicts return controlled JSON HTTP 409; no raw PostgreSQL message is exposed. Removed the old fallback which silently retried inserts without a mutation ID.
9. **Finding idempotency:** same project-scoped mutation lookup, creator/parent check, and uniqueness-conflict reconciliation. Existing item ID and canonical FLI return on retry.
10. **Retry 14 prevention:** HTTP errors retain status/code. Deterministic 400/403/409, invalid states and uniqueness errors become `requires_reconciliation`, skipped by automatic startup/resume/connectivity/screen triggers. Transient failures become `retryable_failure`, with at most two automatic retries after 5s/30s. A queued duplicate refresh cannot restart a permanent failure loop. Explicit Sync now/Retry resets the failure attempt cycle after checking connectivity.
11. **Blocked children:** `blocked_by_dependency`; legacy blocked states remain readable. Dependency blocks do not increment attempts. They are reconsidered after the parent, including historical failed entries whose error was actually a dependency block.
12. **Existing workspace recovery:** regression used `revision-1792840476967-psu178zp` and `revision-item-1792840632745-cs6d97gj`, including a stored attempt count of 14. Explicit retry reset the failed state, persisted server parent ID+RECT number before child work, persisted item ID+FLI before evidence, survived interruption/restart and finished dependent work. No delete/recreate is required. The device's actual cache cannot be modified from this repository; recovery takes effect after deployment/update and Retry. Successful queue entries are deleted and the banner clears when reconciled.
13. **Files:** exact list below.
14. **TypeScript:** root and mobile `npx tsc --noEmit` passed.
15. **Build:** V1 `npm run build` passed.
16. **Lint:** all changed root/mobile files and new test/policy files passed; `git diff --check` passed.
17. **Website deployment:** required, including migrations before the web/API update. Production remains unchanged here.
18. **Mobile OTA:** required for installed builds to receive typed retry policy and RECT mapping persistence; existing development builds can use Metro reload.
19. **Native rebuild:** no new native dependencies, plugins or runtime changes; no Android/iOS native rebuild required.

## Evidence and sync order

Parent create/resolve persists `serverRevisionId` and `serverRevisionNumber` (server `revision_number`) before processing children. Existing standalone parent mapping cache also survives crashes. Finding mappings include real `fli_number` and are saved before evidence. Original photos remain untouched. The server upload route creates final annotated derivatives from original bytes using the persisted finding's real FLI, never Pending FLI; BEFORE/AFTER labels and chosen corners remain. Parent evidence folders, PDF labels, filenames, notifications and delete confirmations now prefer `revision_number`, falling back to legacy `fli_number` for old records. Existing SharePoint IDs remain authoritative for already-stored files.

Rectification metadata/After evidence/status, finalisation and review remain downstream of the existing dependency checks. The older `revision_draft` queue also delegates to the same idempotent server workflow instead of creating parent/findings directly through separate Supabase inserts.

## Validation

- `node scripts/verify-v1-rect-numbering.mjs`: audited broken-trigger collision reproduced; migration applied twice; legacy row/index retained; actual shared website/mobile handlers tested against PGlite; exact supplied mutation IDs; parent/finding lost-response retry; concurrent same-mutation requests; controlled 409; lock-based allocator reuse; deterministic/transient/dependency classification.
- `node scripts/verify-v1-quality-reliability.mjs --queue-only`: existing additive Quality migration, real workspace/SQLite-compatible queue persistence, attempt-14 reset, server RECT+FLI mapping, child ordering, interrupted photo upload, restart recovery, idempotent evidence, reconciliation and finalisation-last.
- `node scripts/verify-v1-materials-offline.mjs`: offline/cache tests plus actual SyncProvider permanent-409 auto-retry suppression, explicit retry and cleared banner.
- `node scripts/verify-v1-quality-followup.mjs`: ID mapping, local evidence error, immutable original/watermark regression and Materials loading retained.
- `node scripts/verify-v1-mobile-access.mjs`: existing access/offline behaviour retained.

PGlite serialises database operations; the concurrent API request regression proves idempotency/conflict reconciliation, while live allocator concurrency safety was audited from its transaction advisory-lock definitions. No authenticated production create, SharePoint upload or physical-device retry was performed.

## Deployment order and schema prerequisite

The live audit also found that the earlier Quality field-reliability migration is absent (including item Leg/Assigned Flag and parent finalisation fields). Deploy in this order:

1. Verify/apply the existing V1 `20261024120000_v1_quality_field_reliability.sql` migration.
2. Apply `20261024143000_v1_rect_legacy_numbering_fix.sql` to V1.
3. Deploy the updated V1 website/API.
4. Publish mobile JS/OTA (or reload Metro in the current development build).
5. Tap Sync now on the existing workspace; keep the original local records/photos.

These are specific V1 migrations, not a blanket push of every repository migration. V2 must not be included. No migration/deployment/commit/push was performed in this task.

## Exact files changed

- app/(protected)/project/[projectId]/tower/[towerId]/revisions/page.tsx
- app/api/mobile/quality/details/revisions/resolve/route.ts
- app/api/mobile/quality/revisions/[revisionId]/items/route.ts
- app/api/mobile/quality/revisions/route.ts
- app/api/quality/files/revisions/[revisionId]/pdf/route.ts
- app/api/quality/files/upload/route.ts
- app/api/quality/revisions/[revisionId]/route.ts
- app/api/quality/revisions/route.ts
- docs/v1-quality-rect-numbering-fix.md
- lib/quality/fli.ts
- lib/quality/revision-notifications.ts
- mobile/app/(drawer)/revisions.tsx
- mobile/app/defects/new.tsx
- mobile/app/revisions/[revisionId].tsx
- mobile/app/revisions/[revisionId]/[itemId].tsx
- mobile/app/revisions/[revisionId]/new-finding.tsx
- mobile/app/revisions/[revisionId]/new.tsx
- mobile/app/revisions/index.tsx
- mobile/app/revisions/new.tsx
- mobile/contexts/QualityContext.tsx
- mobile/contexts/SyncContext.tsx
- mobile/lib/api/client.ts
- mobile/lib/api/quality.ts
- mobile/lib/offline/db.ts
- mobile/lib/offline/quality-sync.ts
- mobile/lib/offline/revision-sync.ts
- mobile/lib/offline/revision-workspaces.ts
- mobile/lib/offline/sync-errors.ts
- scripts/fixtures/v1-quality-numbering-before.sql
- scripts/verify-v1-materials-offline.mjs
- scripts/verify-v1-quality-followup.mjs
- scripts/verify-v1-quality-reliability.mjs
- scripts/verify-v1-rect-numbering.mjs
- supabase/migrations/20261024143000_v1_rect_legacy_numbering_fix.sql

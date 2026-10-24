# V1 mobile Materials and Quality follow-up ? 24 October 2026

## Confirmed findings and limits

The Materials loader awaited `Promise.all(bootstrap, all member pages, all bolt pages)` before publishing any result. Every 500-row catalogue page repeats the authenticated project lookup and tower-ID lookup. This is a confirmed loading dependency and repeated-query cost; it is not a measured explanation of every second of the reported one-minute production startup. The bootstrap already batches project-wide queries rather than querying each tower individually. Its independent datasets remain parallel.

Quality finding creation returned the server item but did not persist its item ID/FLI before beginning photo upload. Updates could retain local finding IDs, and there was no local receipt for a confirmed evidence upload. These are confirmed code defects, reproduced in regression tests. The rectification endpoint is `PATCH /api/mobile/quality/revisions/{revisionId}/items/{itemId}`; creation is `POST /api/mobile/quality/revisions/{revisionId}/items`; evidence is `POST /api/quality/files/upload`.

**The exact operation causing the currently installed device's ?Sync failed? banner is not yet established.** No device queue/error trace or authenticated session was available. New DEV operation, mapping, photo-stage and HTTP diagnostics identify it on the next Retry. Do not interpret passing synthetic tests as a confirmed live SharePoint upload or proof the device error has disappeared.

## Materials performance

Cached data still renders before network refresh. A cold bootstrap now publishes and caches its useful bundle/check/transfer snapshot before catalogue completion. Initial loading ends then; background refreshing remains separate. An incomplete catalogue marker survives restart and requests completion later. Search uses the downloaded catalogue and precomputed searchable strings; no per-keystroke API calls. Bundle detail remains lazy-loaded, natural sorting and Outstanding/Arrived grouping remain intact, and MaterialsShell continues using FlatList. Bundle/member check mutations retain their local updates and offline queues. Transfer/receipt mutations refresh the operational summary without downloading catalogues again.

Bootstrap selects now exclude unused event people/plant relationships and name consumed columns explicitly. No material ledger or server status rules changed. Member/bolt pagination remains bounded; catalogue completion can still take longer than first useful UI. Large-scale authenticated timings and the <2s warm / <5s cold device targets require device measurement.

Measured here: 50,000 cached search rows filtered in about 9 ms. A mocked cold loader published bootstrap in about 3 ms while catalogue requests were intentionally unresolved; the previous dependency could not publish before those requests finished. This is a regression test, not a production latency measurement.

Unauthenticated production bootstrap probes: Quality HTTP 401 ~0.456s; Materials HTTP 401 ~0.453s. Authenticated before/after timing is unavailable. Both successful bootstrap routes now expose `Server-Timing: bootstrap;dur=...`; Quality remains its existing compact metadata-only implementation, without a broad refactor.

## Quality durability, dependencies and retry

Parent IDs are retained before child processing. Finding responses are immediately stored in the existing SQLite cache and workspace `serverItems` map, including `id`, `fli_number`, and historical `item_number`. Confirmed mappings skip repeated create POSTs. Existing server client-mutation lookup remains in use for uncertain responses; item creation also reconciles a uniqueness conflict when the database already enforces that constraint. No new FLI allocation system was introduced.

Local revision/finding references resolve to server IDs before PATCH. A pending finding/evidence create blocks its own rectification, while unrelated records continue. Original local keys are used when reconciling pending updates. Successful evidence receipts are persisted so retries skip confirmed uploads. A failed operation remains durable. Queue states include pending, syncing, failed and dependency-blocked; existing attempts, last error and updated timestamp remain stored. Queue deletion represents successful reconciliation.

Retry replans dependencies and resumes the first unconfirmed stage. Automatic retries use 5s then 30s delays for the first two failures; further failures remain visibly retryable. Connectivity/app-resume/manual Online triggers remain, and Quality requests sync when its project becomes available. Forced Offline Mode still prevents API attempts. Error text is displayed beside the retry action. Server detail is refreshed after confirmed work without turning a subsequent read failure into a failed write.

QualityPhotoPicker already copies camera/library originals into application document storage before queueing; this remains unchanged. Missing evidence now reports `Local evidence file could not be found.` Tests do not establish that file loss caused the current device failure.

## FLI evidence and readable UI

Mobile previews show Pending FLI before a canonical server finding exists. Preview overlays are not uploaded derivatives. The upload endpoint receives the original and generates the annotated image server-side after the server finding exists, using its canonical FLI (or the established persisted-item-number display fallback). Original SharePoint evidence remains separate. Retried uploads always originate from original bytes, never from an annotated JPEG.

Watermark fields: BEFORE/AFTER, tower, parent Revision reference, explicit `FLI #`, Assigned Flag, issue, leg, segment, member, drawing, capture date/time. Empty values are omitted. Positions remain Top Left, Top Right, Bottom Left, Bottom Right; default Bottom Left. Text wraps, including long unbroken references. Unusually long metadata uses an added edge band outside the photograph rather than clipping text or obscuring the central evidence. Originals remain unchanged.

Quality detail/card flex children now shrink within available width and can wrap; detail cards grow vertically. The actual restrictive one-line limits found were in the photo watermark/filename preview and legacy revision filter selector. These were removed. Icon/search controls keep their appropriate fixed dimensions; detail cards do not acquire fixed heights. The separate item detail now displays FLI, Assigned Flag and Leg, and supplies full context to After previews. Physical Android/iPhone/iPad layout checks remain outstanding.

PDF metadata uses the same canonical FLI helper as annotation generation. Existing Before/After side-by-side layout, contain image sizing, additional evidence and pending-After panel remain. A generated fixture was rendered and visually checked with matching FLI metadata and both evidence panels. Existing on-demand PDF/SharePoint lifecycle remains; no new automatic duplicate PDF publication was added.

## Validation and deployment

Regression checks cover interruption/restart, retained item/FLI mapping before upload, idempotent item/photo keys, partial uploads, dependency ordering, original-key reconciliation, missing local evidence, finalisation-last, cached search, forced Offline Mode, natural sorting, all watermark corners and unchanged originals. Existing additive migration was verified idempotently in PGlite; no migration was created/applied in this follow-up.

No new native dependencies or runtime changes: existing development build + Metro works for development; mobile changes are OTA-compatible with the current runtime. Deploy V1 website/API first, then mobile JS/OTA. The existing `20261024120000_v1_quality_field_reliability.sql` migration from the earlier task must already be present on the target database for its Leg/Flag/evidence/finalisation columns; this follow-up did not apply it to production.

V2 was not modified. No commit or push.

Validation results: root `npx tsc --noEmit` PASS; mobile `npx tsc --noEmit` PASS; changed-file ESLint PASS with no warnings after correcting two touched-file hook dependencies; `npm run build` PASS; `git diff --check` PASS. Quality queue/PGlite, follow-up, Materials offline and Access regression scripts PASS. The existing PDF fixture was rendered and visually inspected. Physical device and authenticated production tests remain unperformed.

## Exact follow-up files

Website/API/shared:
- app/api/mobile/materials/bootstrap/route.ts
- app/api/mobile/quality/bootstrap/route.ts
- app/api/mobile/quality/revisions/[revisionId]/items/route.ts
- app/api/quality/files/upload/route.ts
- app/api/quality/files/revisions/[revisionId]/pdf/route.ts
- lib/quality/fli.ts (new)
- lib/quality/evidence-watermark.ts
- lib/quality/revision-pdf.ts

Mobile:
- mobile/app/revisions/[revisionId].tsx
- mobile/app/revisions/[revisionId]/[itemId].tsx
- mobile/app/revisions/[revisionId]/new.tsx
- mobile/app/revisions/[revisionId]/new-finding.tsx
- mobile/app/revisions/index.tsx
- mobile/components/quality/QualityPhotoPicker.tsx
- mobile/components/quality/QualityShell.tsx
- mobile/components/quality/QualityStatusPill.tsx
- mobile/components/sync/SyncStatus.tsx
- mobile/contexts/MaterialsContext.tsx
- mobile/contexts/QualityContext.tsx
- mobile/contexts/SyncContext.tsx
- mobile/lib/api/client.ts
- mobile/lib/api/materials.ts
- mobile/lib/api/quality.ts
- mobile/lib/offline/db.ts
- mobile/lib/offline/quality-sync.ts
- mobile/lib/offline/revision-workspaces.ts

Checks/documentation:
- scripts/verify-v1-quality-reliability.mjs
- scripts/verify-v1-materials-offline.mjs
- scripts/verify-v1-quality-followup.mjs (new)
- docs/v1-mobile-quality-followup.md (new)

The pre-existing Access/RBAC changes in mobile/app/_layout.tsx, mobile/lib/access.tsx and scripts/verify-v1-mobile-access.mjs remain preserved and are not additional changes from this follow-up.

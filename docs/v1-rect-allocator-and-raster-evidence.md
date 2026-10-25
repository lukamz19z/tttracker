# V1 RECT allocator and raster evidence ? 25 October 2026

Both changes are implemented in the local repository. **No production migration, web deployment or OTA publication was performed.** No V2 files were modified. No commit or push.

## Requested report

1. **Exact live conflict:** `RECT-01`. Existing owner: parent `8c56abfb-5b04-4fde-8cdd-0d68e423d69b`, project `069782a4-9c5b-47ce-9807-c1b4f6eee3ce`, tower `276aee32-76bf-4b39-934a-9894e74a27c6`.
2. **Why selected:** the live trigger still derives the next sequence per project+tower and the old compatibility trigger still copies that scoped RECT value into globally unique parent `fli_number`. The live audit found one parent with sequence 1, canonical RECT-01 and legacy RECT-01. It did not show historical drift in that row; drift is a separately reproduced weakness because the prior allocator read only sequence_no. The earlier migration has not been installed in the audited V1 database.
3. **Next allocation:** the one shared database insert trigger now scans actual canonical RECT strings, legacy RECT strings and stored sequences in the applicable project+tower scope. It preserves existing RECT padding, ignores proposed stale client numbers, chooses above the highest achieved number and explicitly checks occupancy. New parent legacy fli_number stays null. No existing row is rewritten.
4. **Concurrency:** project+tower transaction advisory lock covers inspection/allocation inside the insert transaction. Website/mobile share the same handler and trigger. The handler reconciles mutation IDs first and makes up to four fresh insert attempts for recognised numbering races. Exhaustion returns a temporary 503, not an instruction to manually reconcile an ordinary sequence race. Mutation ownership ambiguity remains a controlled 409.
5. **Migration/RPC:** new `supabase/migrations/20261025100000_v1_rect_allocator_drift_safe.sql`; no new RPC or mobile allocator. It updates the existing allocator and neutralises the old mirror trigger function even if the previous mirror-fix migration was not installed. Global legacy uniqueness and scoped canonical/mutation indexes remain. Idempotently tested in PGlite, not applied remotely.
6. **Stuck workspace:** parent lookup by existing client mutation ID remains first. The same workspace/queue IDs persist; successful create/resolve saves server ID and canonical RECT before findings. Finding ID and real FLI are persisted before evidence. Retry needs no delete/recreate and ignores any stale proposed number. Existing deterministic-failure retry classification remains; tap Sync now after rollout.
7. **Original:** local `originalUri`, with `uri` retained as a backward-compatible original alias, in `Paths.document/tttracker-offline/`. Old temporary originals are copied to that directory before annotation. Capture originals are never overwritten. SharePoint original remains referenced by `tower_quality_files.sharepoint_item_id`.
8. **Annotated:** local `annotatedUri` is a separate durable `annotated-{photoId}-{timestamp}-{suffix}.png` in the same document directory. `annotationKey`, `watermarkContext` and selected position are cached and persisted in workspaces. SharePoint operational JPEG remains referenced separately by `annotated_sharepoint_item_id` and evidence_metadata; existing schema conventions/roles are reused.
9. **Previous missing watermark:** PhotoPicker showed only a React overlay. `openLocalPhoto` opened original `photo.uri`; normal server content also defaulted to original. The overlay was not in those bytes.
10. **New preview:** camera/library preparation exports the raster before returning the prepared photo. Picker thumbnail and tap preview use annotatedUri. Existing workspace photo buttons ensure annotation, choose the newest cached derivative and pass the correct BEFORE/AFTER phase. Synced mobile/website content now defaults to the annotated item; `?variant=original` is an explicit authenticated audit route. Historical Before/After files without an annotated reference are rasterised on read from their originals with canonical metadata; the originals and historical file records stay unchanged.
11. **Raster mechanism:** installed `react-native-svg` native `Svg.toDataURL`, with image+wrapped text rendered into a PNG and written using installed Expo FileSystem. A serial app-root renderer works for foreground capture and queued sync without another native dependency. Android uses a unique temporary image source and a nonzero-alpha single-pixel host so native image decoding/onLoad cannot be skipped by a hidden view or warm Fresco cache; iOS export accounts for device pixel scale. Server Sharp independently creates the final canonical JPEG from original bytes, never from the mobile derivative. Layout/wrapping/field formatting is a pure V1 module shared by native and server renderers.
12. **Fields:** bold BEFORE/AFTER; Tower; canonical RECT/reference (Pending RECT only locally when unavailable); FLI # (Pending FLI only locally when unavailable); Assigned Flag; Leg; Segment; Member; Drawing; Issue; capture date/time. Empty optional fields are omitted. Four corners retained, default Bottom Left. Long values wrap, including unbroken references; unusually long metadata gets an edge band outside the original photo instead of obscuring it or clipping text.
13. **Regeneration:** sync obtains canonical evidence metadata through authenticated item GET after server mapping exists. Real RECT/FLI changes the annotation key; the renderer reloads originalUri and produces a new derivative. It saves that mapping locally before upload. It never draws onto a prior derivative or fabricates final FLI values on-device.
14. **Upload:** mobile sends the prepared PNG as operational multipart `file`, plus untouched `originalFile`. Historical clients sending only file remain compatible. The server validates both and rebuilds the authoritative JPEG from originalFile with database metadata before publishing, ensuring canonical identifiers even if a client supplies stale text. Both original and derivative go through existing Quality SharePoint storage. Original local files survive until server association and queue reconciliation succeed.
15. **PDF:** existing Before/After PDF loading already prefers annotated_sharepoint_item_id. It now receives the shared-format canonical raster, including on-demand annotation for historical images without a derivative. The written metadata remains RECT/FLI/Flag/Leg/segment/member/drawing/issue, with side-by-side images. A regression generates a PDF in memory and confirms it embeds the actual rasterised BEFORE and AFTER JPEG byte streams.
16. **Files:** exact list below.
17. **Website deployment:** required, including the V1 database migration and updated upload/content/context endpoints. No production deployment performed here.
18. **Mobile OTA:** required for installed apps; existing development builds can reload Metro after the website/API rollout.
19. **Native rebuild:** no new dependencies, plugins or native-runtime changes. Existing SVG and FileSystem native modules are reused. No new Android/iOS store build is required for this code change.
20. **Validation:** root/mobile TypeScript, changed-file ESLint, V1 production build, Android Metro export and diff checks passed. Tests detailed below. Native device and authenticated production upload/review were not performed.

## Tests and practical limits

- `verify-v1-rect-numbering.mjs`: exact audited legacy collision, new migration applied twice, stale 003 with RECT-001/002/003 and drifted sequence allocates RECT-004, two simulated users get distinct numbers, same mutation retries return same parent, injected uniqueness collision reallocates, DEV diagnostics identify the conflict owner, legacy values/index preserved. PGlite serialises transactions; actual allocator lock semantics were audited from PostgreSQL code.
- `verify-v1-evidence-raster.mjs`: exercises the actual renderer JSX and annotation service with a Sharp-backed test native exporter; verifies independent PNG bytes and annotated preview URI, pending-to-real identifiers, original-byte preservation, four corners and AFTER label; exercises the content handler with mocked authentication for default/explicit-original and legacy on-read selection; verifies PDF embeds generated annotated JPEGs. It is not a physical iOS/Android native screenshot test. A raster fixture was visually inspected.
- `verify-v1-quality-reliability.mjs --queue-only`: workspace/queue durability, parent/finding mapping, upload interruption/restart, receipts, finalisation-last, earlier schema migration.
- `verify-v1-quality-followup.mjs`: missing-file message, server-ID mapping, long watermark values and Materials loading.
- Existing Materials offline and Access regression scripts pass. No material business rules, docket calculations, approval policies or long-text detail layouts were redesigned.

## Deployment order ? V1 only

The current read-only schema audit returned none of the earlier Leg/Assigned Flag/finalised_at/evidence_metadata/annotated item/photo mutation fields. This is an independent deployment prerequisite; do not skip it and then mistake the next schema error for another numbering failure.

1. Apply the existing V1 `20261024120000_v1_quality_field_reliability.sql` if still absent (it is absent in the audited live database).
2. Apply `20261025100000_v1_rect_allocator_drift_safe.sql`. It includes the old mirror-function correction; no manual record reconciliation/renumbering is needed.
3. Deploy updated V1 website/API before updating mobile. Old upload endpoints do not understand originalFile and must not receive the new client payload first.
4. Publish mobile OTA or reload Metro in the current development build.
5. Tap Sync now on the existing local workspace; retain its IDs/photos.

Apply only these V1 migrations to the V1 project; do not push unrelated repository/V2 migrations.

### Hosted deployment verified 25 October 2026

The follow-up repair applied both scoped migrations to V1 project `ixqwakkxycwjtttvsukx` through Supabase's migration API. Hosted history records `20261025052524_v1_rect_allocator_drift_safe` and `20261025052620_v1_quality_field_reliability`. The local SQL sources remain `20261025100000_v1_rect_allocator_drift_safe.sql` and `20261024120000_v1_quality_field_reliability.sql`. Do not blindly push all pending repository migrations.

Audit: project `P-UGL-26-002`, tower `5C3/5C1-093` (`a81ce164-2245-4300-a4bc-d8780d7fc848`) has no existing parent. Its next scoped number is `RECT-01`, sequence 1. The conflicting GLOBAL legacy FLI value `RECT-01` belongs to row `8c56abfb-5b04-4fde-8cdd-0d68e423d69b` on tower `5C3/5C1-087`, sequence 1, revision_number `RECT-01`. The old legacy trigger copied the valid scoped RECT into the globally unique FLI column. This was a cross-tower namespace collision, not a reason to allocate a project-global RECT-02. New parents keep legacy FLI null. Both live function definitions were verified after application. No historical records were changed and no synthetic business records were inserted.

The exact old user-facing conflict message is absent from the current shared handler. Website deployment is still needed for its bounded fresh-insert retries and other current API changes. Mobile source already persists parent ID/RECT and child ID/FLI immediately, classifies unresolved children as dependency-blocked without counting attempts, and supports explicit Retry of the existing workspace. Device reconciliation itself was not performed from this environment; no queue was deleted. Existing mobile changes require OTA/Metro reload if not already installed, with no native rebuild.

Validation rerun: website and mobile TypeScript passed; website production build passed; RECT allocator and queue-recovery regression scripts passed. The current pending workspace was tested through the regression fixtures rather than accessed on-device.

## Exact files changed

- app/api/mobile/quality/revisions/[revisionId]/items/[itemId]/route.ts
- app/api/quality/files/[fileId]/content/route.ts
- app/api/quality/files/revisions/[revisionId]/pdf/route.ts
- app/api/quality/files/upload/route.ts
- app/api/quality/revisions/route.ts
- docs/v1-rect-allocator-and-raster-evidence.md
- lib/quality/evidence-context.ts
- lib/quality/evidence-layout.ts
- lib/quality/evidence-watermark.ts
- mobile/app/_layout.tsx
- mobile/app/revisions/[revisionId].tsx
- mobile/app/revisions/[revisionId]/[itemId].tsx
- mobile/app/revisions/[revisionId]/new-finding.tsx
- mobile/app/revisions/[revisionId]/new.tsx
- mobile/components/quality/QualityEvidenceRenderer.tsx
- mobile/components/quality/QualityPhotoPicker.tsx
- mobile/lib/api/quality.ts
- mobile/lib/offline/quality-sync.ts
- mobile/lib/quality-evidence.ts
- mobile/types/quality.ts
- scripts/verify-v1-evidence-raster.mjs
- scripts/verify-v1-quality-followup.mjs
- scripts/verify-v1-quality-reliability.mjs
- scripts/verify-v1-rect-numbering.mjs
- supabase/migrations/20261025100000_v1_rect_allocator_drift_safe.sql

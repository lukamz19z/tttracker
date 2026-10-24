# V1 mobile field reliability implementation ? 24 October 2026

No V2 files or V2 database objects were changed. No commit, push, production deployment or production migration was performed. Production database access was read-only schema inspection.

1. **Materials timeout root cause:** the screen debounced a live `searchMaterials` request with a 12-second timeout after typing. The v2-format material cache deliberately discarded members and bolts, so its local fallback was incomplete. Queries were tied to keystrokes instead of a reusable local catalogue.
2. **Materials files changed:**
   - `mobile/components/materials/MaterialLiveSearch.tsx`
   - `mobile/components/materials/MaterialsShell.tsx`
   - `mobile/components/materials/BundlePicker.tsx`
   - `mobile/contexts/MaterialsContext.tsx`
   - `mobile/lib/api/materials.ts`
   - `mobile/lib/materials-sort.ts`
   - `app/api/mobile/materials/catalogue/route.ts` (new)
   The existing bootstrap already pages operational records and runs independent queries in parallel; it remains separate from the heavy catalogue.
3. **Cached search:** cache v3 retains complete, narrow member/bolt catalogues. Legacy cached operational records render immediately and trigger a catalogue refresh. A separately paginated endpoint downloads 500 rows at a time; members and bolts refresh in parallel. Only a completed refresh replaces the existing snapshot. Failure leaves cached data usable. Search uses deferred text, memoised indexes/filters, and a FlatList. It performs no keystroke requests. The 50,000-member fixture filtered in approximately 7?12 ms on this workstation, not a phone performance measurement.
4. **Offline architecture:** `SyncContext` owns `networkOnline`, persisted `forcedOffline`, and `effectiveOnline = networkOnline && !forcedOffline`; its existing `online` property now exposes effective connectivity to existing consumers. `mobile/lib/offline/connectivity.ts` is a synchronous transport guard, controlled by that context. `mobile/lib/api/client.ts` blocks before token refresh/fetch when manually offline. `SyncStatus` and the drawer expose Work Offline / Go Online, connectivity and pending/error state.
5. **Persistence:** the manual choice uses the existing SQLite cache entry `sync:forced-offline`, hydrated before queue processing. A remount/restart fixture verifies restoration.
6. **Returning online:** normal Quality/revision queues and registered Materials queues resume. Connectivity events, app resume and Sync now also process queues. Materials flushing has one in-flight processor; failed mutations remain queued. New work requested during a sync schedules another pass.
7. **Quality sync root causes:** workspace-to-queue promotion depended on an open detail screen; parent ID resolution was not reliably applied by the worker; item-row existence could prematurely reconcile findings before photos completed; local files could be deleted between upload phases; and rectified status could precede After evidence. These paths are now dependency-ordered and recoverable.
8. **Core Quality sync files changed:**
   - `mobile/contexts/SyncContext.tsx`
   - `mobile/lib/offline/db.ts`
   - `mobile/lib/offline/quality-sync.ts`
   - `mobile/lib/offline/revision-workspaces.ts`
   - `mobile/lib/offline/revision-sync-plan.ts` (new)
   - `mobile/lib/api/quality.ts`
   - `mobile/app/revisions/[revisionId].tsx`
   - `mobile/types/quality.ts`
   - `mobile/components/quality/QualityPhotoPicker.tsx`
   - `mobile/components/quality/QualityLegField.tsx` (new)
   - `app/api/mobile/quality/revisions/[revisionId]/items/route.ts`
   - `app/api/mobile/quality/revisions/[revisionId]/items/[itemId]/route.ts`
   - `app/api/quality/revisions/[revisionId]/finalise/route.ts` (new)
   - `app/api/quality/revisions/[revisionId]/submit-review/route.ts`
   - `app/api/quality/files/upload/route.ts`
   - `app/api/quality/files/[fileId]/content/route.ts`
   - `app/api/quality/files/revisions/[revisionId]/pdf/route.ts`
   - `lib/quality/evidence-watermark.ts` (new)
   - `lib/quality/finalise-revision.ts` (new)
   - `lib/quality/revision-pdf.ts`
   - `app/(protected)/project/[projectId]/tower/[towerId]/revisions/page.tsx`
   - `package.json` / `package-lock.json` declare the already-installed server sharp dependency.
9. **Dependency order:** durable workspace planning queues parent, findings, rectification updates and finalisation in that order. Parent success writes the real ID into the workspace. Children resolve local routes to that server ID. Stable mutation IDs prevent duplicate findings; photo IDs identify successful associations. Queue insertion no longer replaces/reset existing retry records. Reconciliation markers prevent stale screen state resurrecting synced findings. Rectified is applied only after evidence. Finalisation waits for dependent queue records and workspace changes.
10. **Photo survival:** the existing picker copies to `Paths.document/tttracker-offline`; this remains in use, with quality 1 rather than 0.85. Queue payloads retain those durable URIs. Failed attempts never clean files. Cleanup follows successful server associations, workspace reconciliation and queue deletion, and skips files referenced by another queued operation. This is tested with module restart/retry fixtures, not a physical phone restart.
11. **Leg:** nullable canonical `tower_revision_items.leg`, constrained to A/B/C/D. Mobile uses a selector, including rectification editing. Website details and PDF read it.
12. **Assigned Flag:** controlled item `fli_number` remains the canonical FLI identifier. A separate nullable `tower_revision_items.assigned_flag` stores the actual assigned site reference (e.g. F12); it does not replace or duplicate controlled numbering. It is displayed in mobile, website detail, evidence metadata and PDF.
13. **Issue types:** the additive migration seeds Wrong orientation and Not enough torque into `project_field_issue_types` for existing and future projects. Case-insensitive comparison avoids equivalent-name duplicates. Explicit existing inactive configuration is preserved.
14. **Configuration:** both UIs continue reading the active configured issue-type list. No issue-name-specific mobile business logic was introduced. The seed is not live until the migration is applied.
15. **Original evidence:** original uploaded bytes remain a distinct SharePoint item. The metadata's existing `sharepoint_item_id` continues to identify that original. Original evidence can still be retrieved through authenticated content access.
16. **Derivatives:** `lib/quality/evidence-watermark.ts` uses server-side sharp to auto-orient a display copy and composite an edge band. A separate JPEG is stored through the existing Quality SharePoint upload service. Its stable item ID is stored in `annotated_sharepoint_item_id`, with context/position in `evidence_metadata`. Original byte equality and portrait/landscape processing are tested. Distinct captures receive separate filename suffixes; retries keep a stable suffix. An ambiguous database response or duplicate-key race does not delete evidence another successful metadata row may own. Partial upload cleanup retains the local originals for retry.
17. **Watermark fields:** BEFORE/AFTER, Tower, parent RECT/revision and controlled FLI/item reference, Assigned Flag, issue type, Leg, segment, member, drawing, captured date/time. Empty values are omitted. Context is resolved from canonical server records; capture timestamp and placement accompany the queued photo.
18. **Placement:** Top Left, Top Right, Bottom Left, Bottom Right; default Bottom Left. The picker shows an overlay preview and persists each photo's corner choice. Server regeneration uses the stored metadata snapshot. No mobile native image-manipulation dependency was added.
19. **Finalisation:** a distinct server-confirmed `tower_revisions.finalised_at` certificate retains existing status names. Validation requires an issue (or configured Other detail), Before and After evidence, and Rectified/Verified state for every item. Offline Finalise when synced stores intent and stays Pending sync. Review submission requires finalisation, revalidates evidence, and is idempotent once submitted. Canonical item/evidence triggers invalidate finalisation on later changes, including direct website edits. Website submission deliberately finalises first. Existing Ready for Review/Closed downstream states remain.
20. **PDF:** existing contained, paired evidence panels now prefer annotated derivatives. Original files remain separately accessible. The item section includes FLI, Flag and Leg, plus existing tower/header, issue, segment, member, drawing, findings, rectification and status. AFTER evidence pending is explicit. Additional evidence uses the existing paired pages. Generation remains on demand through the existing PDF/SharePoint lifecycle, not on every mobile edit. A four-page fixture was rendered and visually inspected; an overlapping label found during inspection was corrected.
21. **Bundle sorting:** `mobile/lib/materials-sort.ts` compares numeric slash components with numeric-aware text handling, then tower/segment/stable ID. It is applied at the Materials context boundary (Bundles, delivery bundle items and context consumers), in local Search, and BundlePicker. Duplicate segment records remain separate. The required 1/10,1/2,2/1,1/1,1/3 regression passes.
22. **Global safe-area files:** deprecated React Native SafeAreaView imports were replaced in the following existing screens/components:
   - `mobile/app/(drawer)/approvals.tsx`
   - `mobile/app/(drawer)/assets.tsx`
   - `mobile/app/(drawer)/daily-dockets.tsx`
   - `mobile/app/(drawer)/fleet-jobs.tsx`
   - `mobile/app/(drawer)/index.tsx`
   - `mobile/app/(drawer)/notifications.tsx`
   - `mobile/app/(drawer)/prestarts.tsx`
   - `mobile/app/(drawer)/profile.tsx`
   - `mobile/app/(drawer)/project-progress.tsx`
   - `mobile/app/(drawer)/site-prestart.tsx`
   - `mobile/app/(drawer)/tower-progress.tsx`
   - `mobile/app/(drawer)/truck-delivery.tsx`
   - `mobile/app/(drawer)/vehicle-prestart.tsx`
   - `mobile/app/approvals/dockets/[docketId].tsx`
   - `mobile/app/defects/[defectId].tsx`
   - `mobile/app/login.tsx`
   - `mobile/app/notifications-settings.tsx`
   - `mobile/app/revisions/[revisionId].tsx`
   - `mobile/components/finance/FinanceApprovalScreen.tsx`
   - `mobile/components/finance/FinanceAttachmentPreview.tsx`
   - `mobile/components/finance/FinanceDraftForm.tsx`
   - `mobile/components/quality/QualitySelector.tsx`
   - `mobile/components/quality/QualityShell.tsx`
   - `mobile/components/training/TrainingEvidencePreview.tsx`
   Additional shared chrome changes: `mobile/app/_layout.tsx`, `mobile/app/(drawer)/_layout.tsx`, `mobile/components/common/AppFooter.tsx`, `mobile/components/materials/MaterialsShell.tsx`. Existing drawer/header safe insets remain separate from compact visual padding.
23. **Bottom buttons:** safe-area-context now applies Android/iOS bottom insets; drawer footer uses `max(insets.bottom, 8)`. Materials list padding uses actual bottom insets. Quality and docket modals use safe-area-context. Drawer visual header height is top inset plus 48 px. Physical iPhone/iPad/Android navigation-mode testing was not possible in this Windows workspace; code, import audit and iOS bundle export passed. No hardware touch reliability claim is made.
24. **Website validation:** `npx tsc --noEmit` and `npm run build` pass. No production data was edited during tests.
25. **Mobile validation:** `npx tsc --noEmit` passes; iOS Expo export passes using existing runtime packages.
26. **Lint/tests:** changed website/shared and mobile TS/TSX files pass changed-file lint. Reproducible regression scripts: `node scripts/verify-v1-quality-reliability.mjs` and `node scripts/verify-v1-materials-offline.mjs`. They use isolated PGlite/mocked network/native boundaries. Live SharePoint upload and live review notification delivery were not exercised. `git diff --check` passes.
27. **Migration:** `supabase/migrations/20261024120000_v1_quality_field_reliability.sql`; additive, idempotently verified in PGlite, not applied to production. It adds nullable Quality fields, the photo mutation index, configurable issue seeds and finalisation invalidation. No V2 migration/application was performed.
28. **Runtime/deployment classification:** mobile JS/TS is OTA-compatible. Website/API and server-side sharp require a production web deployment. Database changes require the V1 migration. No new mobile native dependency was added; a new iOS/Android store build is not required for this change when updating the existing compatible EAS runtime.
29. **Deployment order:** review/back up and apply the V1 migration first; deploy the V1 website/API including the declared sharp dependency second; verify authenticated catalogue/finalise/upload/PDF endpoints return the expected responses; publish the compatible mobile EAS Update third; then perform field/device acceptance and reconnect/sync retained queues. An OTA alone does not deploy website routes or database fields.

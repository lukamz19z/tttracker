# V1 Quality upload, deletion, Defect parity and assignment privacy

## Result and deployment boundary

Implemented against the current V1 source. V2 is untouched. No commit or push was performed. The two additive migrations below were applied only to hosted V1 project `ixqwakkxycwjtttvsukx`. Website production deployment and mobile OTA/Metro reload are still required. No native dependencies were added and no new Android/iOS binary is required for these changes on the existing SDK 54 runtime.

The actual mobile SQLite queue and device photo files were not accessible. The existing `P-UGL-26-002 / 5C3/5C1-093 / RECT-01` was not recreated, deleted or modified during verification. Actual device recovery, preview appearance and kill/reopen acceptance remain unverified until deployment and device Retry. No synthetic business findings were inserted into production.

## 22 requested report points

1. **413 operation:** source tracing identifies `quality_evidence_upload`, `POST /api/quality/files/upload`. A non-mutating unauthenticated 5,242,880-byte binary probe to that exact production URL returned HTTP 413, `server: Vercel`, `x-vercel-error: FUNCTION_PAYLOAD_TOO_LARGE` before application authentication. This proves the host limit on that path, but does not reveal the inaccessible device's exact failed file or queue entry.
2. **Old payload:** multipart/form-data carrying both the original image and a rasterised annotated PNG for Revision evidence. The older separate Defect helper sent multipart original only. Neither path used base64 JSON for the operational HTTP upload. Exact queued original/PNG sizes are unknown without the device; the old body was their sum plus multipart overhead.
3. **Limit:** Vercel Functions have a 4.5 MB request/response payload limit; TTTracker's older 25 MiB per-file validation could not prevent rejection before the handler. Raising that local constant would not solve it. Reference: https://vercel.com/docs/functions/limitations#request-body-size
4. **New mechanism:** authenticate/authorise a small JSON `POST /api/quality/files/upload-session`; persist a durable transfer receipt; return an expiring one-file SharePoint upload capability plus HMAC-signed metadata ticket. Mobile sends raw original bytes directly to that capability in 1,638,400-byte (5 × 320 KiB) ranges using the already-installed Expo fetch/FileHandle APIs. No TTTracker bearer or Graph token is forwarded to the capability. Then a small JSON `POST /api/quality/files/upload` with the ticket downloads original bytes server-to-server, revalidates relationships/lifecycle, runs canonical Sharp annotation, publishes original+JPEG via the existing provider and associates canonical metadata. It does not send the local PNG through the website. Reference: https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0
5. **Sizes:** DEV logs report original/local-preview sizes, dimensions, binary chunk sizes, content type, stage, HTTP status and timing without image contents or capability URL. Server logs report original/annotated bytes. A high-entropy regression fixture measured original PNG **15,238,963 bytes**, annotated JPEG **3,329,355 bytes**, **2400×1800**. This is a fixture, not the user's queued photo. Original bytes were unchanged. Existing local previews remain separately rasterised at max 1800 px; operational JPEGs use EXIF normalisation, aspect-preserving max-2400-px resizing without enlargement and JPEG quality 90.
6. **Direct upload:** required to preserve original evidence above the hosting ingress limit. The original stays in SharePoint and locally until confirmed association; credentials remain server-side. Tickets bind user, project/tower, record, photo mutation, destination, MIME, byte size and expiry. Finalisation verifies the uploaded item and size. Expired/tampered/wrong-user tickets are rejected. Existing 25 MiB original-file policy remains; larger files get controlled JSON and remain local.
7. **RECT-01 recovery:** existing stable mutation IDs, parent/item mappings, canonical FLI resolution, evidence receipts and bounded retry behaviour are preserved. Automated interrupted-upload/retry regression passed. Actual device Retry is not claimed as completed.
8. **Local Delete FLI:** confirmation via a compact overflow action. Never-attempted unsynced findings are removed without HTTP DELETE. Workspace tombstones, pending updates, legacy parent-embedded findings, related queue rows, errors and unshared original/annotated files are reconciled. If a previous attempt may already have created the server item, reconnect and resolve its mutation ID first; do not silently abandon a possible server record.
9. **Server Delete FLI:** `DELETE /api/mobile/quality/revisions/{revisionId}/items/{itemId}` delegates to the shared server deletion helper. It requires the existing dynamic `mobile.rectifications` capability, project access and exact FLI confirmation. Submitted/finalised parents and Verified items are locked. Already-missing items are idempotent. Deletion does not generate replacement FLI numbers.
10. **Cleanup:** tracked pending uploads, original and annotated provider files, evidence relationships and generated Revision PDF files/references are removed before the finding. Provider failure keeps metadata available for retry. Interrupted association retains published provider IDs in the transfer receipt. Successful association clears only staging files/receipt and preserves canonical published originals+JPEGs. Foreign keys prevent deleting a parent/item while an uncleaned transfer receipt still references it. Local cleanup checks remaining queue/workspace references, clears annotation cache and removes owned files. Immediate detail state/count reconciliation does not depend on a successful refresh. SyncContext refresh derives its error banner from the remaining queue.
11. **Defect parity:** shared hardened authenticated client, direct evidence transport, durable create/evidence/edit/close-out queue, atomic create mutation ID and idempotent reconciliation, real DEF mapping before evidence, original+annotated previews, Before/After context, four corners, nullable canonical Leg, wrapping detail text, pending draft cards, controlled confirmed deletion and existing lifecycle/notification handlers. Evidence sync runs before the Fixed/Closed patch. Pending state is not presented as confirmed closure.
12. **Defect watermark:** shared raster layout and renderer, canonical server DEF and tower/issue context, optional Leg, segment/member/drawing/reference, BEFORE/AFTER/EVIDENCE and captured date/time. DEF watermarks do not include an invented RECT/FLI. New captures show annotated local files; pending identifiers are regenerated from original on sync. Server uses its annotated JPEG for normal authenticated viewing. Historical Defect photos without derivatives are annotated on read; originals remain available via the explicit audit variant. All four corner positions and long-value wrapping are retained.
13. **Email exposure removed:** mobile Defect create/detail pickers previously joined role+email; Daily Docket Defect assignment reused those options; website tower Defect pickers and Quality notification managers displayed address suffixes. Historic assigned-to labels can also contain email. These visible labels are now name-only with optional role; historical address suffixes are stripped without rewriting historic rows.
14. **Assignment fields:** option objects now contain `id`, `name`, `role`; no email property. Quality bootstrap did not need assignment email and was not enlarged. Stable user IDs remain the stored assignment key. Auth account addresses are untouched.
15. **Notifications:** existing server notification services still resolve recipient email from user IDs/auth records. Removing address fields from assignment options does not remove email delivery preferences or notification channels.
16. **Finalise:** blocked while syncing, failures, unresolved parent/FLI IDs, workspace findings/updates or durable dependent queue entries remain. The UI explains `Sync pending changes before finalising.` Server evidence validation remains authoritative; automatic Rectified marking also requires saved Before evidence.
17. **Files:** complete manifest below.
18. **Migrations:** `supabase/migrations/20261025120000_v1_quality_upload_sessions.sql` and `supabase/migrations/20261025123000_v1_defect_evidence_leg.sql`. Both tested twice in PGlite and applied to hosted V1. Hosted history: `20261025061811_v1_quality_upload_sessions`, `20261025063917_v1_defect_evidence_leg`. No business records were rewritten. Receipt table is RLS-enabled, service-role-only, and stores metadata rather than photos/capability secrets.
19. **Website deployment:** required; deploy current V1 code before the updated mobile client. Existing deployed upload route cannot consume the new completion ticket.
20. **Mobile delivery:** OTA-compatible JS/TS update, or Metro reload for the existing development build, after website deployment.
21. **Native rebuild:** not required; no package/native/runtime changes. Uses installed Expo SDK 54 file/fetch and SVG capabilities and existing server Sharp.
22. **Validation:** root/mobile TypeScript **passed**; root production build **passed**; website/mobile changed-file ESLint **passed without warnings**; whitespace check **passed**. Targeted upload/delete/privacy/DEF idempotency, migration/RLS, queue/restart, raster/PDF, RECT numbering, Materials/offline and access regression scripts **passed**. Android Metro export using the existing SDK 54 packages **passed** (`--no-bytecode` packaging check; expected bytecode/NO_COLOR notices only). The 50,000-row cached Materials search fixture remained local and completed in 6.8 ms in the final run; this is a synthetic filter benchmark, not phone startup timing. Device/production end-to-end acceptance is not claimed.

## Deployment order

1. V1 migrations: already applied and hosted function/schema history checked. Do not blanket-push unrelated repository/V2 migrations.
2. Deploy the current V1 website/API source.
3. Publish mobile OTA or reload Metro.
4. Tap Sync now on the existing RECT-01 workspace, inspect the per-operation DEV logs, then check Before/After and restart the app. Do not recreate its findings.

For another explicitly targeted V1 environment, apply only the named SQL files using a secure connection variable, e.g. `psql "$env:V1_DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261025120000_v1_quality_upload_sessions.sql`, followed by the same command for `20261025123000_v1_defect_evidence_leg.sql`. Do not print the variable or connection string.

## Exact file manifest

- `app/(protected)/project/[projectId]/tower/[towerId]/defects/page.tsx`
- `app/api/mobile/quality/defects/route.ts`
- `app/api/mobile/quality/details/defects/[defectId]/route.ts`
- `app/api/mobile/quality/lists/defects/route.ts`
- `app/api/mobile/quality/revisions/[revisionId]/items/[itemId]/route.ts`
- `app/api/quality/defects/[defectId]/route.ts`
- `app/api/quality/defects/notification-settings/route.ts`
- `app/api/quality/defects/route.ts`
- `app/api/quality/files/[fileId]/content/route.ts`
- `app/api/quality/files/upload-session/route.ts`
- `app/api/quality/files/upload/route.ts`
- `app/api/quality/revisions/[revisionId]/route.ts`
- `app/api/quality/revisions/notification-settings/route.ts`
- `components/quality/DefectNotificationManager.tsx`
- `components/quality/RevisionNotificationManager.tsx`
- `docs/v1-quality-upload-delete-defect-parity.md`
- `lib/mobile/quality.ts`
- `lib/quality/delete-finding.ts`
- `lib/quality/display-name.ts`
- `lib/quality/evidence-context.ts`
- `lib/quality/evidence-layout.ts`
- `lib/quality/server.ts`
- `lib/quality/upload-cleanup.ts`
- `lib/quality/upload-ticket.ts`
- `mobile/app/defects/[defectId].tsx`
- `mobile/app/defects/index.tsx`
- `mobile/app/defects/new.tsx`
- `mobile/app/revisions/[revisionId].tsx`
- `mobile/components/dockets/DailyDocketSiteEvents.tsx`
- `mobile/components/quality/QualityPhotoPicker.tsx`
- `mobile/contexts/SyncContext.tsx`
- `mobile/lib/api/defects.ts`
- `mobile/lib/api/quality.ts`
- `mobile/lib/offline/db.ts`
- `mobile/lib/offline/defect-drafts.ts`
- `mobile/lib/offline/quality-deletion.ts`
- `mobile/lib/offline/quality-sync.ts`
- `mobile/lib/quality-evidence.ts`
- `mobile/types/daily-dockets.ts`
- `mobile/types/quality.ts`
- `scripts/verify-v1-quality-upload-delete.mjs`
- `supabase/migrations/20261025120000_v1_quality_upload_sessions.sql`
- `supabase/migrations/20261025123000_v1_defect_evidence_leg.sql`

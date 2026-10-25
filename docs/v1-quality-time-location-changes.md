# V1 Quality capture time and working location changes

Scope: V1 only. Existing SharePoint, RECT/FLI, deletion, privacy, PDF publication and reconciliation behaviour is retained.

Validation: root TypeScript, mobile TypeScript, production build, changed-file ESLint, PGlite migration and targeted regression scripts passed. Physical Android/iOS acceptance testing was not performed.

Migration: supabase/migrations/20261025160000_v1_project_quality_timezone.sql; applied to hosted V1 as 20261025083400_v1_project_quality_timezone. Capture-time storage already existed as timestamptz; historical capture instants were not rewritten.

Deployment: website/API deployment, followed by mobile OTA. No new native dependency or store build required. Existing controlled PDFs remain historical; generate a new revision after deployment for corrected PDF times.

Changed files:

- app/(protected)/project/[projectId]/page.tsx
- app/(protected)/project/[projectId]/tower/[towerId]/defects/page.tsx
- app/(protected)/project/[projectId]/tower/[towerId]/revisions/page.tsx
- app/api/mobile/quality/bootstrap/route.ts
- app/api/mobile/quality/details/defects/[defectId]/route.ts
- app/api/mobile/quality/revisions/[revisionId]/items/[itemId]/route.ts
- app/api/projects/[projectId]/route.ts
- app/api/quality/files/[fileId]/content/route.ts
- app/api/quality/files/revisions/[revisionId]/pdf/route.ts
- app/api/quality/files/upload/route.ts
- app/api/quality/files/upload-session/route.ts
- docs/v1-quality-time-location-changes.md
- lib/quality/browser-capture.ts
- lib/quality/date-time.ts
- lib/quality/evidence-context.ts
- lib/quality/evidence-layout.ts
- lib/quality/evidence-publication.ts
- lib/quality/evidence-watermark.ts
- lib/quality/photo-capture.ts
- lib/quality/revision-pdf.ts
- lib/quality/server.ts
- mobile/app/(drawer)/revisions.tsx
- mobile/app/defects/[defectId].tsx
- mobile/app/defects/new.tsx
- mobile/app/revisions/[revisionId].tsx
- mobile/components/quality/QualityPhotoPicker.tsx
- mobile/components/quality/QualityShell.tsx
- mobile/components/quality/RevisionMemberFields.tsx
- mobile/components/sync/SyncStatus.tsx
- mobile/lib/api/quality.ts
- mobile/lib/offline/revision-location.ts
- mobile/lib/offline/revision-workspaces.ts
- mobile/lib/quality-evidence.ts
- mobile/types/quality.ts
- scripts/verify-v1-evidence-raster.mjs
- scripts/verify-v1-quality-followup.mjs
- scripts/verify-v1-quality-publication.mjs
- scripts/verify-v1-quality-time-location-render.mjs
- scripts/verify-v1-quality-upload-delete.mjs
- supabase/migrations/20261025160000_v1_project_quality_timezone.sql

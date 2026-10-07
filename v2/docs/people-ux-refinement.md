# People UX refinement

## Delivered

Shared People date formatting uses DD/MM/YYYY and DD/MM/YYYY HH:mm. Typed date controls retain malformed input, explain validation and use a calendar that updates the same canonical value. Filename dates remain filesystem-safe DD-MM-YYYY.

Scoped button hierarchy, contrasting panels, selected rows, responsive detail drawers and shared deterministic BackLink navigation improve the existing dark People interface. Employee Register query parameters preserve search, pagination and filters on return. Person/User separation remains unchanged. Visible relationship terminology uses Employment / Engagement Type or Worker Type.

Crew details separate overview, members, projects and historical allocation. Training uses separate register, matrix, review, requirements and configuration areas. Organisation-owned categories and options/classes now relate to canonical training types and records. Review policy remains capability/configuration driven. Review history returns only decision metadata, dates and actor identity.

Document rule editing provides live safe-token filename preview and category/worker-specific resolution. SharePoint configuration remains available for design but connectivity is not claimed. Onboarding uses record/template tabs, metadata-only version history and a branded email-safe invitation; secure links and external sessions remain unchanged. Site Prestarts search canonical attendance and filter by person, project, status and date range.

## Changed files for this refinement

- `lib/people/dates.ts`, `navigation.ts`, `onboarding-email.ts`, `document-rules.ts`
- `components/people/people-ui.tsx`, `people-controls.tsx`, `people-client.tsx`, `people-operations.tsx`, `people.module.css`, `training-catalogue.tsx`
- `components/people/onboarding-admin.tsx`, `onboarding-fields.tsx`, `onboarding-external.tsx`
- `app/workspace/people/page.tsx`, `[personId]/page.tsx`, `settings/page.tsx`
- `app/api/people/route.ts`, `onboarding/route.ts`, `documents/route.ts`
- Root verification: `people_presentation.test.mjs`, `people_ui.test.mjs`, `people_workflow_ui.test.mjs`, `people_operations.test.mjs`, `people_onboarding.test.mjs`
- This report

## Migrations

Root additive migrations `20261005160000_people_training_catalogue.sql` and `20261005170000_people_training_review_history.sql` are applied to V2 Dev. Existing training/People data is retained. New catalogue tables deny browser-direct reads and use existing permission-checked RPCs. No customer defaults or role-name access checks were introduced.

## Validation

- 280 targeted People, classification, crypto, external onboarding, document, workflow, invitation, authentication and workspace tests passed.
- `npx tsc --noEmit --incremental false`: passed.
- Targeted ESLint: passed.
- `npm run build`: passed; existing multiple-lockfile warning remains.
- `git diff --check`: passed. Existing unrelated working-tree changes preserved.
- Hosted catalogue synthetic transaction passed and rolled back. Hosted final history RPC exists; anonymous execution is denied and authenticated direct catalogue access is denied.

## Limits

Browser visual QA could not run because the browser runtime connection failed before inspection. No real invitation email was sent during this refinement; email HTML/link preservation is tested. Crew/detail editing uses distinct responsive drawers rather than new standalone routes. Confidential collection remains blocked pending verified external KMS infrastructure. SharePoint and Xero remain not connected. Historical review audit metadata does not invent missing historical comments. No V1 or Materials edits, commit or push.

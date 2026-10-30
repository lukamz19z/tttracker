# V1 Punchlist field workflow

This pass extends the existing V1 Quality workflow. V2, Punchlist import/date handling and the offline photo-pack workflow are unchanged.

## Field use

- Punchlist cards are tappable and have separate status badges and 48-point Rectify / Continue / Review pill buttons. The actions menu does not trigger card navigation.
- Status chips: All, Open, In Progress, Ready, Rectified. In Progress is derived from After evidence or an action comment; Ready uses existing evidence readiness and does not require a comment. Capturing material details alone does not remove an FLI from Open.
- Compact searchable selectors filter sections from the tower member catalogue and findings, configured defect types, Punchlist/Manual source, and existing assignment flags. Counts are calculated locally, respecting the other active filters.
- Uniquely matching configured type labels can filter imported findings without modifying their source data. Ambiguous/unmapped labels remain separate. Structured capture requires explicitly choosing the configured type.
- Filters stack. Clear Filters retains the selected grouping. Grouping supports Section, Defect Type, Status and natural FLI order.
- Filters and grouping persist per user/project/RECT. Saving returns through the navigation stack when available. Pending edits remain visible in local summaries and are labelled pending sync; a queued edit is shown read-only when reopened until it syncs or its conflict is resolved.
- Add Manual FLI remains available within imported RECTs. Imported findings accept extra manually captured Before photos. Before and After uploads complete before the versioned Rectified status command. Comments remain optional.

## Configuration and materials

Open the existing project **Issue Types** manager, expand **Operational detail fields**, and add fields or choose an editable starter example. Save the issue type and refresh mobile Quality metadata.

Supported types: text, number, select, multi-select, toggle, quantity, unit and change direction. Fields are optional unless marked required. Stable keys preserve captured data when labels/configuration change. Validation runs in the editor, API and database. Existing project access and RLS remain in force.

- **Wrong Bolt example:** existing/required diameter and length, change direction, quantity and member/connection. The summary uses required diameter, required length and quantity; 4 + 2 of M20 × 80 becomes 6 × M20 × 80 bolts.
- **Packers example:** existing/required thickness and quantity, plus configurable actions. The summary uses required thickness and required quantity, separated by action. Quantity is the stated quantity for that action, not an inferred difference between existing and required counts. Removal and addition are never netted together.

Examples are administrator-selected configurations. There are no runtime rules based on their names, a customer name or a specific section.

Materials are calculated only from structured values in the filtered findings. Incomplete configured requirements are counted and excluded explicitly. Free-text descriptions are never parsed. Unknown historical keys are retained but not included in totals.

FLIs currently have `assigned_flag`; employee/user assignment belongs to the separate defect register, and FLIs have no employee/crew assignment relationship. This pass filters existing flags and preserves flag capture. It does not invent employee/crew assignment or bulk assignment. Flag selectors/cards conceal email-like flags.

## Migration and release

Required: `supabase/migrations/20261030150000_v1_quality_operational_details.sql`, after the existing V1 Punchlist/evidence migration. It adds `project_field_issue_types.detail_schema` and `tower_revision_items.operational_details`, validation triggers, and extends the existing atomic create/update/version functions. No customer defaults are seeded and no historical requirement/source payload is rewritten. The migration is idempotent and reloads the PostgREST schema cache.

Apply the migration through the normal release process before deploying the API/configuration changes. Then publish a mobile JavaScript OTA update for the existing compatible runtime. No native dependency, Expo SDK, native configuration or runtime-version change was introduced, so this pass does not require a native rebuild. Nothing was deployed, committed, pushed or remotely migrated during implementation.

## Files

- `mobile/app/revisions/[revisionId].tsx` — list filters/grouping, material summary and Manual FLI details.
- `mobile/app/revisions/[revisionId]/[itemId].tsx` — configured type/details, extra Before photos and return navigation.
- `mobile/components/quality/FieldFindingCard.tsx` — touch actions and status separation.
- `mobile/components/quality/FieldListControls.tsx` — filter chips/selectors and local counts.
- `mobile/components/quality/OperationalDetailFields.tsx` — configuration-driven mobile fields.
- `mobile/lib/quality-field-state.ts` — persistent list preferences.
- `mobile/lib/offline/quality-sync.ts` — structured details and extra Before uploads through the current queue.
- `mobile/lib/offline/revision-workspaces.ts`, `mobile/types/quality.ts` — additive types/workspace data.
- `lib/quality/field-list.ts` — shared local filtering/grouping/state codec.
- `lib/quality/operational-details.ts` — schemas, validation, examples and material aggregation.
- `components/quality/IssueTypeManager.tsx`, `components/quality/DetailSchemaEditor.tsx` — existing configuration UI extension.
- `app/api/mobile/quality/bootstrap/route.ts` — configuration metadata.
- `app/api/quality/revisions/[revisionId]/items/route.ts`, `app/api/quality/revisions/[revisionId]/items/[itemId]/route.ts` — structured create/update input.
- `supabase/migrations/20261030150000_v1_quality_operational_details.sql` — additive database change.
- `scripts/verify-v1-quality-field-workflow.mjs`, `scripts/verify-v1-quality-punchlist.mjs` — targeted field and SQL regressions.
- `docs/v1-punchlist-field-workflow.md` — this implementation/release report.

## Validation

Passed root and mobile `npx tsc --noEmit`, root `npm run build`, changed-file ESLint and `git diff --check`.

Passed all local Quality verification scripts: field workflow, Punchlist, atomic FLI, follow-up, reliability, bulk evidence, photo deletion, upload/delete, publication and time/location/native-text rendering.

Targeted coverage includes stacked filters, all four grouping modes, actual persistence-hook remount/ordered writes, optional/required structured bolt/packer fields, filtered material totals, ambiguous type labels, extra Before upload order, blank comments, SQL retries/conflicts, and migration reapplication.

200-FLI filter/group/summary workload: 200 passes in approximately 75 ms (0.38 ms/pass locally). Actual 200-card JSX construction/action checks took approximately 5 ms. The existing FlatList remains the rendering surface. These are local Node/JSX measurements, not physical-phone frame-rate or glove usability measurements. Physical Android/iOS visual checks and independent PostgreSQL connection contention testing remain deployment-environment checks.

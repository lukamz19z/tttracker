# Members schedule readiness and importer verification

## Confirmed causes

The previous client initialized blank applicability to `error` and unresolved references to `error`. Its saved-profile action was only an import-time name: the PostgreSQL apply function saved a profile after validation succeeded. V2 Dev has zero saved profiles and zero stored Member source rows, so the reported failed import could not retain settings or source data. Profile loading was a separate manual button and did not restore settings automatically on category selection/file upload.

The applicability evaluator emitted fatal errors for every row containing any unknown reference, even if other tokens matched current towers. The preview's `0 unmatched/ambiguous rows` instead came from CSV target mapping (unused outside Tower-from-CSV), creating contradictory labels.

The project actually has 30 tower identifiers, all full identifiers such as `5C3/5C1-083`, `5C3/5C1-087`, `5C3/5C1-092` and `5C3/5C1-150A`. Matching is trim plus uppercase, preserving slash, hyphen, prefixes and zero padding. No aliases or fuzzy matching were introduced.

The original upload and screenshot were not accessible in this workspace; failed rows never reached database storage. Browser inspection was attempted with the browser skill but its connection failed before opening a tab. Consequently the exact raw values/delimiters responsible for the 1,278 errors cannot be verified. The user-provided example `5C3/5C1-003` normalizes unchanged and is absent from the current project; `5C3/5C1-087` normalizes unchanged and matches. These are supplied examples, not falsely claimed extractions from the failed CSV. The reported screen totals imply 922 common + 1,280 conditional = 2,202 source rows; actual resulting relationships/unresolved counts require that CSV.

## Corrected behaviour

New Member Schedule profiles default blank to Common within selected scope. This remains an editable profile setting (common/none/error); it is not a global requirement for every customer source format. Explicit delimiters and mapping are saved. Unknown applicability is always retained as a source warning; malformed/ambiguous lists remain fatal. Tower-from-CSV target mapping remains strict.

Save profile uses a separate permission-protected API and atomic service-only RPC, without requiring import success. It merges existing defaults rather than erasing customer settings. Selecting a saved profile restores mapping, source role, blank policy and delimiter. Changing category loads the most recently saved profile in that category; file upload retains the chosen profile. Profiles without applicability configuration use the visible Member Schedule defaults.

Shared source definitions/raw rows remain stored once per uploaded batch. Common and conditional rules are evaluated against project towers, then intersected with requested scope. Partially matched lists apply only to matched scoped towers; missing references are preserved. A valid row with no selected target is out of scope, not rejected. Fatal source validation still blocks the entire atomic apply.

Run Materials reconciliation after adding/importing towers. The existing reconciliation transaction explicitly reevaluates stored schedules before packing reconciliation. All-project schedules can reach later project towers; Single/Selected remain limited to their original target IDs. CSV schedules retain per-row target boundaries. Existing source IDs are reused, new operational records are independent per tower, repeated evaluation is idempotent and no background loop exists. Older scoped Replace boundaries prevent resurrecting removed requirements. Later revisions win within their own scope. Existing receipts, checks, assignments and histories are preserved.

## UI

Visible compact setup/header, file summary/profile controls, Preview, Import readiness and sticky import action replace the primary accordion stack. Preview uses ten rows per page, search and pagination, with the Member/Bundle/Drawing/Profile/Qty/Segment/Applicable Towers columns. Secondary mapping, tower breakdown, unresolved references and error groups remain expandable/searchable. Setup edits use an explicit Edit setup button.

Readiness separates valid source rows, common/conditional rows, target towers, applicable relationships, out-of-scope rows, unique unresolved references and fatal errors. CSV target mapping is explicitly labelled Not used unless CSV scope is selected. Source storage counts and effective tower requirement counts stay separate. Atomic failure reports no applied source rows.

## Migration

`supabase/migrations/20261003085151_materials_schedule_readiness.sql` was added and applied to V2 Dev. It adds `excluded_tower_ids` to existing shared source rows, recovers already recorded replacement boundaries where available, updates schedule/reconciliation functions, and adds service-only profile-save/reevaluation functions. No existing applied migration was edited. No new RLS grants, role bypasses, global statement timeout changes or parallel Materials tables were introduced.

Hosted audits remain: 30 towers, 77 bundles, 77 source records, zero Members/shared rows/profiles. A synthetic hosted transaction verified 3 valid source rows -> 31 current relationships, 1 out-of-scope row, then 3 newly applicable relationships after inserting a future tower. Original shared source rows remained exactly 3. An intentional exception rolled back everything; the audit above verifies no test data persisted. Browser roles cannot execute the new service RPCs.

## Validation

- 99 tests passed; four historical/optional performance benchmarks skipped; zero failures.
- Includes saved-profile reopening, file-load preservation, 922 common/1,280 conditional neutral pattern, partially/fully/unmatched lists, source retention, later reevaluation without re-upload/duplication, scoped Replace tombstones, strict CSV row boundaries, foreign tower denial, service privileges, late rollback, existing import/history/access/security/permission/workspace regression suites.
- `cd v2; npx tsc --noEmit --incremental false`: passed.
- `cd v2; npm run build`: passed. Existing multiple-lockfile warning remains.
- Targeted lint of every changed TypeScript file: passed, no warnings/errors.
- Git diff/check inspected. No V1 changes, commit or push.

## Files changed in this task

1. supabase/migrations/20261003085151_materials_schedule_readiness.sql
2. supabase/verification/materials_import_integrity.test.cjs
3. supabase/verification/materials_empty_rows.test.cjs
4. supabase/verification/materials_schedule_readiness.md
5. v2/lib/materials/applicability.ts
6. v2/app/api/projects/[projectId]/materials/import/route.ts
7. v2/app/api/projects/[projectId]/materials/import/profiles/route.ts
8. v2/app/workspace/projects/[projectId]/materials/import/materials-import-client.tsx
9. v2/app/workspace/projects/[projectId]/materials/import/page.tsx
10. v2/public/templates/materials/import-guide.md

## Remaining limits

Exact failed-source comparison and browser visual verification remain outstanding. Original conditional matching/effective counts have not been fabricated. Only tower-list applicability is implemented. Reevaluation is explicit via Reconcile; it does not automatically guess aliases or create towers. Large historical schedule sets may increase reconciliation cost; function-local timeout and existing import capacity limits remain. Unknown-reference warnings need review because they can indicate a missing tower or an identifier-format mismatch. Unsupported or malformed source rules still require fixing.

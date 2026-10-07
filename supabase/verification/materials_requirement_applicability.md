# Materials requirement applicability verification

## Correction

All Project Towers previously multiplied every Member source row by every target. That assumption is superseded. Evaluate all project towers now intersects each requirement rule with the chosen project scope. Selected and Single perform the same intersection over a smaller scope.

## Existing schema evolved

- `v2_material_import_source_rows`: one source definition/raw row per uploaded batch, with physical row number, source values, requirement key and applicability JSON. Batch metadata stores scope/target IDs once.
- Import profiles store `defaults.import_options`: tagged resolver kind, mapped applicability column, blank policy, delimiter and unknown-reference policy.
- `v2_material_source_records`: tower-specific source evidence / effective requirement links, linked to shared source rows, with source role/document scope and canonical snapshots. Supersession is scoped to target towers, including targets that no longer match any incoming row.
- `v2_material_register`: existing tower operational record, now with requirement variant key and optional package context. Receipt/check/issue/movement/amendment data remains independent for each tower and UUID.
- `v2_material_bundles`: physical manifest UUIDs, with manifest source-row identity and optional package context, independent of repeated display bundle references.
- `v2_material_bundle_members`: existing tower-specific physical assignments. Missing/ambiguous hints remain pending; only unique contextual matches are linked. Existing operational assignments are not silently moved.

Migration `20261003080334_materials_requirement_applicability.sql` is additive and applied to V2 Dev. Two partial identity indexes were added. It is tested twice for idempotence. The old migrations were not edited. All 77 hosted bundle UUIDs/77 source records survived; all 77 manifest identities were recovered from agreeing active source evidence. No existing Members were present, and historical applicability was not guessed.

## Profile semantics

For the supplied format, map Applicable Towers, choose **Common within selected scope**, and delimiter **comma**. Blank interpretation is explicit configuration, not a tenant/global rule inferred from a header. Populated lists are trimmed and case-normalized for comparison, retain original source text, and match project towers only. Selected scope is intersected with those lists. Duplicate list tokens do not duplicate requirements.

Unknown applicability defaults to fatal validation. A profile can explicitly retain unknown text references as unresolved source rules without creating towers or attaching foreign-project IDs. Ambiguous identifiers always fail. Tower-from-CSV remains strict. The live project has 30 towers; the described source references 65, so review this policy and actual matching values before importing. Retained unknown references do not automatically create operational state when towers are later added.

Only the tower-list resolver is implemented. Its tagged configuration and shared JSON source definitions provide extension points for type/family/extension/project-attribute rules; unsupported kinds fail instead of being guessed.

Member Number is not a unique requirement identity. Source row/document/role plus reference, drawing, segment, profile and packing context identify variants. Same marks can have different packing on different towers. Bundle manifests default to separate source rows; Reference and context matching is available only by explicit profile choice. Physical package Section is separate from Member profile and engineering Tower Segment.

Add preserves existing matching masters. Merge enriches without blank erasure or receipt reset and versions matching Member source evidence. Replace supersedes the selected tower/category/source-role/document scope, even when new applicability excludes that tower. Removed masters are archived, never deleted; outside-scope evidence and operational history remain intact.

## Import order and reconciliation

Members first stores source requirements/hints without needing a physical manifest. Bundles later reconcile unique unlinked members in set-based SQL. Bundles first lets Member import link immediately. Ambiguous packs remain unresolved. Manual reconciliation now uses one service-only atomic RPC with complete project relations instead of capped client snapshots and separate writes.

Reconciliation reports applicable source requirements, matched assignments, unresolved hints, physical bundle rows without members, ambiguous duplicates and source conflicts by tower. Stats are persisted in the existing run metadata and information findings; they do not count as open problems. Details and error groups are collapsed/searchable in the UI. Existing assignment conflicts retain historical relationships for review.

## Regression model

Original source files were not accessible in the workspace. A neutral generated fixture reproduces the stated operational counts rather than pretending to verify original file contents:

| Measure | Fixture result |
| --- | ---: |
| Source rows | 2,278 |
| Unique member numbers across source | 1,720 |
| Blank/common rows | 998 |
| Explicit/conditional rows | 1,280 |
| Explicitly referenced towers | 65 |
| Target-specific rows | 177 |
| Applicable rows for target analogous to 087 | 1,175 |
| Unique member numbers for that target | 1,100 |
| Physical manifest rows / display references | 39 / 37 |

All 1,175 fixture requirements link to the neutral manifest when matching context is supplied, while duplicate manifest rows stay separate. Full source + manifest apply took approximately 3-4 seconds locally in isolated PGlite. A hosted synthetic applicability-only run resolved 998 + 177 from 2,278 source rows in 527 ms. An intentional exception rolled back the hosted run; audits found zero test masters/shared rows/batches afterward, with the original 77 bundles and source records retained.

Tests cover common/none/error blank policies, delimiters, explicit lists and exclusions, repeated tokens, selected/all/single intersection, source variants, packing context, both import orders, duplicate manifests, ambiguity, independent receipts, now-inapplicable Replace scope, saved profile settings, legacy identity recovery, foreign UUID denial, strict CSV matching, retained unknown rules, service-only RPCs and late atomic rollback. Existing import/access/empty-row/permission regressions also run.

## Repeat checks

```powershell
$env:PGLITE_MODULE = "$env:TEMP/tttracker-material-import-tests/node_modules/@electric-sql/pglite"
$env:MATERIALS_BULK = '1'
$env:MATERIALS_APPLICABILITY = '1'
node --test supabase/verification/materials_import_integrity.test.cjs supabase/verification/materials_empty_rows.test.cjs supabase/verification/materials_access_security.test.cjs supabase/verification/materials_permission_pages.test.cjs supabase/verification/workspace_layout_access.test.cjs
cd v2
npx tsc --noEmit --incremental false
npm run build
```

91 tests passed; four historical/opt-in benchmarks skipped. Strict TypeScript and production build passed. Targeted lint has no errors; existing unused MetricCard/data warnings remain. Next.js still warns about multiple lockfiles. No V1 edits, commit or push.

## Files changed

- supabase/migrations/20261003080334_materials_requirement_applicability.sql
- supabase/verification/materials_import_integrity.test.cjs
- supabase/verification/materials_empty_rows.test.cjs
- supabase/verification/materials_bulk_import.md (marked historical)
- supabase/verification/materials_requirement_applicability.md
- v2/lib/materials/applicability.ts
- v2/lib/materials/import-validation.ts
- v2/lib/materials/server.ts
- v2/lib/materials/types.ts
- v2/app/api/projects/[projectId]/materials/import/route.ts
- v2/app/api/projects/[projectId]/materials/reconcile/route.ts
- v2/app/api/projects/[projectId]/materials/search/route.ts
- v2/app/workspace/projects/[projectId]/materials/import/materials-import-client.tsx
- v2/app/workspace/projects/[projectId]/materials/import/page.tsx
- v2/app/workspace/projects/[projectId]/materials/materials-control-client.tsx
- v2/public/templates/materials/members.csv
- v2/public/templates/materials/import-guide.md

## Remaining risks

- Original file byte/content verification and browser interaction testing remain outstanding; neutral fixture counts validate the described semantics.
- Requirement/manifest identity includes physical row/context. Reordered or materially changed revisions require scope review/controlled Replace; cross-document canonical enrichment needs deterministic record/context references, not global mark deduplication.
- Existing legacy applicability cannot be reconstructed reliably; it was preserved, not guessed or automatically repaired.
- Unknown retained rules require a subsequent evaluation/import when their towers exist; no automatic reevaluation job is implemented.
- Large common scopes still require independent tower operational records and snapshots. Full 400-tower persistence of the applicability workload is untested. Function-local 120-second limits remain; no global timeout change or chunking.
- Main Materials payload/search limits still apply. New reconciliation uses full database relations, but the UI's existing findings payload cap can limit displayed results at very large scale.
- XLSX upload and non-tower-list rule resolvers are not implemented.

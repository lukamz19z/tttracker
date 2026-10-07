> Historical bulk-import baseline. The blanket expansion assumption is superseded by profile-driven requirement applicability; see `materials_requirement_applicability.md`. These old benchmarks do not represent the real schedule workload.

# Materials bulk import verification

Migration: `20261003070045_materials_bulk_import.sql`, applied to V2 Dev only.

## Root cause and implementation

The old RPC rebuilt growing JSON plans, rescanned prior rows for duplicates (quadratic work), repeatedly queried and wrote each canonical/source row, reconciled members individually, and locked all project Materials masters. Normalized references were filtered without matching expression indexes. Canonical relationship guards also performed repeated dynamic parent queries per row.

The new RPC stages input once with `jsonb_to_recordset`, expands target requirements relationally, validates the entire scope, and performs set-based canonical, provenance, link, supersession and reconciliation statements. Ordered advisory locks and master locks cover target towers. The old single-tower RPC delegates to this implementation. Canonical relationship security uses statement transition relations; operational tables retain their existing guards. Any SQL error rolls back the entire RPC, including late failures.

One batch and one raw source row per input row are shared across targets. Target-specific source records retain canonical before/after snapshots and reference the shared source row. Material UUIDs, receipts and checks remain tower-specific. Replace supersedes only target towers/category/source role/document scope; it never deletes masters or history. Add preserves matching masters and records source evidence, preserving existing import semantics. Merge omits blank incoming fields and preserves operational quantities.

Single, Selected, All and Tower-from-CSV scopes support every category. All validates the exact confirmed project tower set. Multi-target schedules require applicability confirmation. CSV matching uses trimmed, case-insensitive project tower identifiers, requires exactly one match, retains the original raw value and never creates towers.

## Measurements

Full atomic apply, milliseconds; PGlite is isolated local PostgreSQL WASM, not a hosted throughput guarantee:

| Workload | Old RPC local | New RPC local | V2 Dev PostgreSQL |
| --- | ---: | ---: | ---: |
| 2,500 Members x 1 tower | 11,467 | 857 | 688 |
| 2,500 Members x 30 towers | Not run | 18,924 | 22,491 |
| 2,500 Members x 100 towers | Not run | 75,523 | Not run |
| 6,000 Bundles across 120 towers | Not run | 1,869 | Not run |

Hosted tests raised an intentional exception after successful application to roll back all fixtures and imports. Post-test audits confirmed the original 77 bundles, 77 source records, zero Members and zero shared source rows; no benchmark towers remained.

Relational expansion only: 75,000, 250,000 and 1,000,000 target rows verified. These counts are NOT full persistence benchmarks. Full 2,500 x 400 apply is unproven and may exceed the transaction limit. No chunking or weakened atomicity was introduced.

The controlled import functions have a 120-second function-local timeout (Supabase supports function-specific timeouts for RPCs). Global/role timeouts remain unchanged. Existing HTTP/provider deadlines and lock contention can still terminate a large transaction safely.

EXPLAIN on both 6,000 local bundles and existing hosted bundles uses `v2_material_bundles_import_match_idx`, with normalized reference in Index Cond. Other added indexes support project/tower/kind normalized item lookup, normalized tower lookup, shared source links and bundle/member existence joins. Existing active source-scope indexes are reused.

## Repeat checks

```powershell
$env:PGLITE_MODULE = "$env:TEMP/tttracker-material-import-tests/node_modules/@electric-sql/pglite"
$env:MATERIALS_BULK = '1'
node --test supabase/verification/materials_import_integrity.test.cjs supabase/verification/materials_empty_rows.test.cjs supabase/verification/materials_access_security.test.cjs supabase/verification/materials_permission_pages.test.cjs supabase/verification/workspace_layout_access.test.cjs
$env:MATERIALS_BENCH = '1'
node --test --test-name-pattern='representative 2500' supabase/verification/materials_import_integrity.test.cjs
$env:MATERIALS_BENCH_TOWERS = '30' # or 100; full persistence, ephemeral DB
node --test --test-name-pattern='representative bulk apply timing' supabase/verification/materials_import_integrity.test.cjs
$env:MATERIALS_BUNDLE_BENCH = '1'
node --test --test-name-pattern='representative project-wide bundle CSV' supabase/verification/materials_import_integrity.test.cjs
```

Regression coverage includes blank rows/physical row numbers, alias/manual tower mapping, unmatched/ambiguous/foreign towers, shared source/independent receipts, scoped Add/Merge/Replace, confirmation and changing All scope, atomic rollback, direct multi-row relationship guards, service-only RPCs, existing host/party/permission/security and compact validation rendering.

## Final checks

77 regression tests passed; three opt-in performance tests were skipped in the ordinary suite and run separately as recorded above. Strict TypeScript (`npx tsc --noEmit --incremental false`), targeted ESLint and `npm run build` all passed. The existing Next.js multiple-lockfile workspace-root warning remains. No V1 changes, commit or push.

## Remaining limits

- At most 10,000 source rows and 1,000,000 expanded requirements per transaction; these are bounds, not throughput promises.
- Per-target requirement history and snapshots necessarily grow with targets. Full 400-tower persistence and production HTTP round-trip timing remain unverified.
- Existing Materials read payloads have capped queries (including 50,000 material identifiers); the separate manual reconciliation endpoint caps source/master/link reads at 100,000. Those paths need independent pagination/set-based work for complete very-large-project reporting; they were not redesigned here.
- Upload is CSV; XLSX upload is not implemented. Cached blank spreadsheet-cell handling remains tested in the common empty-row predicate.
- No browser interaction test was performed; component rendering and API tests verify compact disclosure/counts/mapping, alongside the production build.

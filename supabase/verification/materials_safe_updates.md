# Materials safe-update correction

## Live diagnosis

Read AGENTS.md and inspected V2 Dev definitions with pg_get_functiondef, including the schedule RPC, legacy import wrapper/bulk RPC, compatibility/key helpers, reevaluation, reconciliation and profile-save RPCs. The current application calls public.tttracker_v2_apply_material_schedule.

Its first staging initialization was:

```sql
update pg_temp.ttm_input
set variant_key=private.tttracker_v2_material_requirement_key(p_source_scope,p_source_role,row_number,v);
```

The author intended to initialize every newly staged source row. Temporary tables were assumed sufficient isolation, but safeupdate requires an explicit WHERE even for them. The live authenticator session preloads supautils/safeupdate and has an 8-second lock timeout. A direct PostgREST request reproduced SQLSTATE 21000 / UPDATE requires a WHERE clause before correction. SQL-admin sessions did not preload the same guard, explaining earlier successful admin tests. Attempting to load the guard manually was denied by managed-library restrictions; protection was never disabled or altered.

## Correction and audit

New root migration: 20261003095800_materials_import_safe_updates.sql. It replaces the live schedule definition with exactly one body change:

```sql
where source_id is not null and variant_key is null
```

Each invocation creates its own temporary staging relation and generates source UUIDs. The newly added variant_key column is null. This predicate explicitly targets those freshly staged rows without WHERE true and preserves all existing import/validation semantics. Invalid source rows still fail before permanent mutations.

All 37 UPDATE/DELETE statements across the audited mutation functions were reviewed. This was the only missing WHERE. Remaining permanent updates use project/organisation/source/tower scopes or UUIDs drawn from validated scoped plans, generated batch IDs, or scoped profile lookups. The only DELETE targets the session-local evaluation plan with row/source predicates. No permanent record deletes, policy changes, timeout increases, safety-extension settings, role bypasses or applied migration edits were made.

After deployment, pg_get_functiondef comparison confirmed only the intended staging predicate differs from the original live function. Authenticator safety settings are unchanged.

## Deployment

npx supabase db push --dry-run initially confirmed the database was current. After creating the corrective migration, the dry run listed only that migration. npx supabase db push --yes applied it to the linked V2 Dev project. PostgREST schema reload was notified. The final dry run reports no pending migrations.

## Tests

- 103 automated tests passed; four historical/optional performance benchmarks skipped. This includes 2,202 Member source rows (922 common / 1,280 conditional) across 30 towers -> 28,940 effective requirements; source provenance; separate batches; Add/Merge/Replace; history; applicability; reconciliation; late rollback; cross-project denial and access regressions.
- Local 2,202-row/30-target apply completed in approximately 3.97 seconds and committed successfully in isolated PGlite.
- A temporary service-only verification RPC called the actual import functions through PostgREST with safeupdate active. The full 30-tower workload plus separate-batch and CSV bundle assertions passed in 8.258 seconds. Four repeated-reference bundle source rows retained four distinct UUIDs. A deliberately raised late exception rolled back all writes inside the verification subtransaction.
- Two concurrent PostgREST verification calls targeting disjoint tower scopes both succeeded (2.208 / 2.222 seconds), each with 2,202 source rows and 3,124 effective relationships. Separate batch/source snapshots remained unchanged. A seeded foreign-project material record remained byte-for-byte unchanged.
- Two overlapping 30-tower verification calls exposed the existing 8-second lock timeout on one request. No test writes persisted. This contention limit was left unchanged; it is independent of the safe-update correction.
- The temporary verification RPC was removed after testing. Hosted audit: 30 towers, 77 bundles, 77 source records, zero Member/source-row fixtures and zero test projects. Safeupdate remains preloaded for authenticator.
- TypeScript: npx tsc --noEmit --incremental false passed from v2.
- Production build: npm run build passed from v2; existing multiple-lockfile warning remains.
- Targeted lint of the changed import route passed without errors/warnings. Git diff/check inspected; V1 unchanged.

## Error handling

The import route logs the underlying RPC code/message/details/hint server-side and returns a structured MATERIALS_IMPORT_FAILED response with zero applied rows. Raw SQL internals are not returned to normal users. Row-level validation errors remain detailed and unchanged.

## Files changed

- supabase/migrations/20261003095800_materials_import_safe_updates.sql
- supabase/verification/materials_import_integrity.test.cjs
- supabase/verification/materials_empty_rows.test.cjs
- supabase/verification/materials_safe_updates_hosted.sql (repeatable temporary service-only rollback harness; remove RPC after use)
- supabase/verification/materials_safe_updates.md
- v2/app/api/projects/[projectId]/materials/import/route.ts

No Git commit or push. Existing overlapping-import lock contention remains a risk; no further scalability or UX changes were included.

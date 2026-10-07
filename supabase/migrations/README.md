# V2 migration sequence and Materials imports

All active migrations live directly in `supabase/migrations/`. Run Supabase CLI
commands from the repository root against the intended **V2** project. Existing
root migration versions have not been renamed, rewritten, or repaired remotely.

`20261002180000_materials_import_integrity.sql` is the only new active migration.
It reconciles missing import columns with `ADD COLUMN IF NOT EXISTS`, then adds
source supersession, canonical snapshots/links, bundle archival, and the atomic
`tttracker_v2_apply_material_import` RPC. Source-role seeds are already supplied
by `20261002174000_materials_configuration_delivery_ux.sql`; they are not repeated.
The new version follows the latest existing root migration version.

Read-only inspection of **TTTracker V2 Dev** found the import columns already
present, but neither misplaced import upgrade was recorded in migration history.
The reconciliation DDL therefore tolerates prior manual application. No remote
migration or import was applied during implementation.

```powershell
npx supabase migration list
npx supabase db push --dry-run
```

Review pending migrations before applying them. Apply the migration before
running the changed V2 import route or active-bundle queries. Do not run archived
SQL, reinstall old ZIPs, or rename previously applied migration versions.

## Import behaviour

- **Add:** append source evidence; create masters for new keys. Unambiguous existing
  masters are linked without changes. Ambiguous records reject the whole batch.
- **Merge:** append evidence and enrich matching masters using only populated
  incoming fields. Receipt quantities, checks, and primary provenance stay intact.
- **Replace:** supersede active source requirements only for the selected
  project/tower/category/source role/document scope; append the replacement evidence.
  Retain master UUIDs; archive removed masters only when no active source remains.
  Other document scopes and source roles remain active.

Document scope defaults to filename (or `Manual Entry`). Keep the same scope for
a revised filename. Original source values, raw rows, mappings, actor, batch,
canonical before/after snapshots, and superseding batch links remain queryable.
Legacy target links are backfilled only when unambiguous. Unknown legacy ownership
is retained rather than guessed or deleted. No missing historical evidence is
fabricated. Current reports exclude archived/superseded requirements.

The RPC validates all rows/relationships before writes, serializes project imports
with a transaction advisory lock, and locks masters. Profiles, batch records,
source supersession, master enrichment, links, and archival commit together.
Database failures roll back the complete operation. PUBLIC/anon/authenticated
cannot execute this service-role-only RPC. Its actor is supplied by the server.
Existing workspace authorisation is retained; broader RBAC is outside this task.

## Isolated verification

The test suite uses PostgreSQL via PGlite, repository table definitions, and the
actual new migration. It never connects to a Supabase database. Install its one
verification dependency outside the repository:

```powershell
$testRoot = Join-Path $env:TEMP 'tttracker-material-import-tests'
npm install --prefix $testRoot --no-audit --no-fund @electric-sql/pglite@0.5.8
$env:PGLITE_MODULE = Join-Path $testRoot 'node_modules/@electric-sql/pglite'
node --test supabase/verification/materials_import_integrity.test.cjs
cd v2
npx tsc --noEmit --incremental false
npm run build
```

Legacy scripts now perform a dry-run only and never copy SQL over applied files.
See `supabase/archive/v2-legacy/README.md` for the cleanup inventory.

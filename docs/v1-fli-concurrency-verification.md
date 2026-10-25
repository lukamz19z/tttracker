# V1 FLI allocation and two-phone verification

Migration: `supabase/migrations/20261026120000_v1_atomic_fli_creation.sql`.
This change does not alter the per-RECT FLI namespace or parent RECT allocator.
Apply the migration through the normal reviewed Supabase deployment process,
then deploy the V1 website, then publish the mobile JS/TS OTA update. No native
dependency or runtime change is required. The migration is not applied remotely
by this task.

Both web and mobile call the same server create handler and service-only RPC.
The RPC checks the existing project-access policy with the authenticated actor,
locks the project/mutation key, locks the parent row, resolves an existing
mutation or inserts through the canonical per-RECT FLI trigger. The trigger
also protects older direct website inserts. Finalisation/submission use the
same parent row lock and validate canonical evidence inside the transaction.
Existing scoped item, FLI and mutation unique indexes remain the final defence.

## Automated checks

Run `node scripts/verify-v1-fli-atomic.mjs` for the PGlite regression. It submits
ten caller promises and retries, but PGlite serialises database execution.

For real independent PostgreSQL sessions, create a **new empty disposable local
database** whose name ends in `_fli_test`, with a test-only superuser account
and `psql` on PATH. This fixture creates public tables and test roles; never use
an existing application database. Set `FLI_TEST_DATABASE_URL` to that local
database and run the same script. Every query uses its own psql connection,
including ten simultaneous allocations and ten simultaneous idempotent retries.
The fixture is intentionally retained for inspection; discard the test database
afterwards through your normal local database tooling.

Assertions: ten unique rows, item numbers and FLIs; contiguous initial sequence;
zero extra rows for the same mutation IDs; six independent offline findings;
access/leg validation; evidence validation; locked/deleted-parent rejection.

## Required two-device acceptance

1. Open the same editable RECT on Phone A and Phone B. Note the highest FLI.
2. Both online: each add a finding and press Save as close together as possible.
   Expect FLI-N and FLI-(N+1), in either order, never the same canonical number.
3. Refresh/focus the other phone and confirm both canonical findings appear.
4. Put both phones offline. Each add two findings with Before photos. Labels
   must say **Pending FLI**, with stable independent mutation IDs in SQLite.
5. Kill/reopen both apps; confirm all four drafts and original photos remain.
6. Reconnect both and Sync Now. Expect four more unique canonical FLIs, no
   overwrite, duplicate, lost evidence or SharePoint filename collision.
7. Interrupt a create response after server insertion. Retry with the existing
   draft. It must return the same item ID and FLI without allocating another.
8. Check annotations regenerate from originals with real RECT/FLI, original
   capture time and stored placement; SharePoint names contain canonical FLI
   and BEFORE/AFTER. Controlled PDF contains each server item exactly once.
9. Delete a local pending finding before sync: it must never get a server FLI.
   Repeat after a lost create response: deletion first reconciles the mutation.
10. On B delete a RECT while A has an offline finding. A's reconnect must show
    the controlled deleted/unavailable error and retain its local evidence.
11. On B finalise a valid RECT while A has an offline finding. A's reconnect
    must reject the new finding as finalised and retain evidence for recovery.
12. Race Add Finding against Finalise. Either the finding wins and finalisation
    validates it, or finalisation wins and the create is rejected. A local phone
    with unresolved creates/evidence/errors must remain unable to finalise.

Transient transport errors retain bounded retries. Deleted/locked/denied/invalid
operations require explicit resolution, and their evidence remains local.

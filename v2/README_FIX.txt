TTTracker V2 Materials import / actor ID fix

Extract this ZIP directly into:
C:\Users\luzet\Documents\BCContracting\tttracker\v2

Allow Windows to merge folders and replace files.

The screenshot confirms the error occurs when Merge Bundles submits the import.
The Materials import API was still reading `project.user.id`, but V2 project context
does not guarantee a nested `user` object in that shape. That caused:

Cannot read properties of undefined (reading 'id')

This patch removes that unsafe assumption from ALL Materials API routes, not just
the bundle importer, so Issues, Movements, Reservations, Amendments, Reconcile,
Member checks, Bundle checks and Deliveries do not fail the same way later.

It also changes import insert handling so missing returned IDs produce a useful
operation-specific error rather than another undefined `.id` crash.

No Supabase migration is required.

After extraction restart V2:
cd C:\Users\luzet\Documents\BCContracting\tttracker\v2
npm run dev -- -p 3001

Then retry the same Merge Bundles import.

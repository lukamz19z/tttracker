# V1 PPE Register: inventory and sizing

The current People > PPE Register has Overview, People & Sizes, Inventory and Issue History navigation. An employee profile's PPE area also exposes Issued Items for that employee. Sizing counts remain employee preferences, never stock or assumed demand for a replacement.

## Implementation report

1. **Existing PPE schema reused:** canonical `employees.shirt_size`, `jacket_size`, `glove_size`, `pants_size`; configurable `people_ppe_types`; additional `people_ppe_requirements.size_value`. Existing category-level issue events remain unchanged and are not converted into physical stock without product/source evidence.
2. **New inventory schema:** `people_ppe_inventory_products`, `people_ppe_inventory_sizes`, `people_ppe_inventory_batches`, `people_ppe_inventory_movements`; read-only `v1_ppe_inventory_balances` view.
3. **Migration:** `supabase/migrations/20261028120000_v1_ppe_inventory.sql`. New, additive and locally tested twice. The applied `20261027120000_v1_people_ppe_register.sql` is unchanged. No remote application, db push or migration repair was performed.
4. **Product configuration:** custom name, SKU, category, description, size tracking, optional sizing category mapping, order, notes, active state and creation/update timestamps. No customer products are seeded or hard-coded. Optimistic timestamps reject stale edits.
5. **Size configuration:** stable size UUIDs scoped to each product; independent labels, ordering and optional low-stock minimum per size. Unsized products have one blank-label size internally. Omitted sizes are archived, with stock/history still visible; re-entering a label reactivates its existing UUID. Changing size tracking after movements exist is rejected.
6. **Movement model:** signed quantities, stock type, product/size UUID, person UUID, batch UUID, original issue UUID for reversals, dates, notes and immutable snapshots of employee name/number/crew, product/size and issuing user. New snapshots survive employee/account deletion and later renaming. Future movement types are reserved without exposing extra workflows.
7. **Current stock:** SQL SUM of all quantity deltas per size. No editable balance column. Every total can be explained by the permanent ledger.
8. **Single stock receipt:** choose one product and enter quantities in its size matrix; save one receipt batch.
9. **Bulk stock receipt:** choose Bulk Stock Receipt, enter quantities across product matrices, optionally record date, supplier/reference/notes, and save one atomic batch containing individual size movements.
10. **Single issue:** searchable active employee selection, product, configured size and positive quantity; save one person-linked issue and decrement stock.
11. **Bulk people issue:** one product, multiple searchable employee selections, individually chosen/suggested sizes and a quantity each. Duplicate size demand is combined before stock validation; one atomic batch contains all issues.
12. **PPE Pack:** select one employee and enter quantities/sizes for multiple products. Zero quantities exclude items. One transaction and one traceable batch.
13. **Size prefilling:** optional product-to-`people_ppe_types` mapping reads the canonical legacy field or additional requirement. Only a matching active configured size is suggested. No mapping/name guessing; authorised users can override the suggestion.
14. **Insufficient stock:** product and size row locks are acquired in stable order; demand is aggregated and available stock checked inside the database transaction. Issues and negative adjustments cannot leave a negative balance. A failed line rolls back the whole batch. A specific error names the available quantity, product and size. Employee rows are locked while validating and snapshotting an issue.
15. **Corrections:** Reverse / Correct creates a full opposite movement linked uniquely to the original issue, with required reason and current issuing user. A second reversal is rejected. Enter any corrected issue separately. Ledger and batch UPDATE/DELETE are blocked; receipts, issues and reversals carry retry-safe client mutation UUIDs.
16. **Issue history:** 50-row pages with date/time, person, employee number, crew (permission gated), product, size, quantity, issuing user, notes and batch/reference. Employee PPE detail uses the same endpoint with an employee UUID filter; inactive/deleted people remain in historical snapshots.
17. **Product history:** each card opens its complete movement types in a paginated history panel. Receipts, issues, adjustments and reversals explain the stock total.
18. **Sizing remains separate:** existing canonical editing, size counts, missing details, crew filters, active employees, CSV and sizing-only print remain intact. Inventory uses separately labelled units on hand, separate CSV and separate print output. No automatic Outstanding calculation or issue-to-sizing update.
19. **Permissions:** existing `tt.people`, `people.view_basic`, `people.view_ppe` are prerequisites. Sizing edits retain `people.edit`; crew labels retain `people.view_crews`. Six additional configurable V1 access areas are seeded: `people.ppe_inventory.view`, `.products`, `.receive`, `.issue`, `.adjust`, `.export`. Every inventory API checks the required capability. No role-name checks or automatic grants to existing roles. Assign capabilities in the existing access matrix before rollout to relevant users.
20. **Exports:** inventory CSV contains Product, Category, Size, On Hand for the current inventory filters. Separate issue/product history CSV includes dates, employee/number/crew, product/size, signed quantity, movement, user, reference, batch and notes. History export checks its own permission, fetches bounded pages only on demand, and fixes a creation-time cutoff. Formula-leading CSV cells are escaped. Inventory print omits application controls; employee sizing print remains separate.
21. **TypeScript:** `npx tsc --noEmit` passes.
22. **Build:** `npm run build` passes for the V1 website.
23. **Lint/tests:** changed-file ESLint passes. `node scripts/verify-v1-ppe-register.mjs` and `node scripts/verify-v1-ppe-inventory.mjs` pass. Inventory tests run the real migration/functions in local embedded PostgreSQL and exercise actual stock/catalogue/history routes with fixtures plus actual form rendering. Covered: receipts, bulk receipts/products, single/bulk issues, packs, atomic failure, duplicate-size demand, reversals, retry idempotency, immutable history, archival, no-size products, size suggestions, permission rejection and multi-page catalogue loading.
24. **Website deployment:** required, including V1 API and client together; not deployed by this task.
25. **Migration:** required before using inventory; not applied remotely. Existing sizing works independently of the new inventory schema. Inventory permissions also require configuration.
26. **Mobile OTA:** not required. No mobile files changed.
27. **Native rebuild:** not required. No native files changed.

## Changed modules

- `components/people/ppe-register.tsx` and `ppe-register-screen.tsx`: shared navigation and preserved sizing view.
- `components/people/ppe-inventory*.tsx`: inventory cards, filters, product editor, stock matrix, searchable employee selection, issue modes, history and reversal dialogs.
- `lib/people/ppe-inventory.ts` and `ppe-inventory-server.ts`: models, size suggestions, safe exports and dynamic server permission gates.
- `app/api/people/ppe/inventory/`: catalogue/product configuration, atomic stock commands, employee suggestions and paginated history.
- New SQL migration, inventory verification script and this documentation. V2, mobile and the prior applied migration are untouched.

## Validation limits / rollout

Tests use local PostgreSQL (PGlite), fixtures for authentication and Supabase query builders, and server-rendered form checks. They do not exercise real simultaneous connections, a migrated remote database, or an authenticated browser session. Database locking protects concurrent writers by design; run an authenticated browser smoke test and a two-session concurrency check against a staging database after an authorised migration deployment. No existing physical stock is invented: create custom products and receive opening quantities through Add Stock. Historical category-level issues are retained in their original tables and are not mixed into this product inventory ledger.

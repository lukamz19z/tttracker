# TTTracker V2 Materials UI + Two-Stage Deliveries

Extract this ZIP into the TTTracker repo root:

C:\Users\luzet\Documents\BCContracting\tttracker

It contains:
- `v2/...` updated Materials Control files
- `supabase/migrations/...` one new delivery migration
- `supabase/verification/...` verification SQL

## UI changes
- Smaller KPI cards so the controls sit higher on the page.
- No horizontal scrolling for the Materials buttons.
- Buttons grouped into:
  - Registers
  - Logistics
  - Issues & Control
- Single Import Materials button remains in the page header.
- Bundle Status now reports BOTH:
  1. Driver delivery check
  2. Leading Hand / Supervisor site verification
- New Deliveries workspace.

## Delivery flow
1. Create a delivery and select destination tower + bundles.
2. Delivery driver checks each bundle as Delivered / Short.
3. Delivery status updates automatically.
4. Leading Hand / Supervisor opens Bundles and performs the independent second check.
5. Bundle Status shows delivered vs site-verified counts separately.

The delivery API is under:
`/api/projects/[projectId]/materials/deliveries`

This gives the mobile app a shared backend endpoint to use for the delivery-driver workflow.

## Supabase
After extracting:

```powershell
cd C:\Users\luzet\Documents\BCContracting\tttracker
npx supabase db push --dry-run
```

If only the new materials delivery migration is pending:

```powershell
npx supabase db push
```

Then restart V2:

```powershell
cd C:\Users\luzet\Documents\BCContracting\tttracker\v2
npm run dev -- -p 3001
```

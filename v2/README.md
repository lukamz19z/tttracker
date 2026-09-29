# TTTracker V2 – UI Navigation Refinement

Frontend-only update. No Supabase migration is required.

## Why this update exists

The project UI should behave like a professional multi-tenant product, not a demo tied to one customer or one historical project.

This package removes customer/project names from placeholders and examples and restructures navigation so the same route is not advertised in multiple places.

## Navigation

### Global top bar

The workspace shell now places organisation-wide navigation in the top bar:

- Home
- Projects
- Settings

These continue to come from the existing dynamic workspace section registry.

Account, organisation switching and sign-out also stay in the top bar.

### Project sidebar

Every route under:

`/workspace/projects/[projectId]`

now receives one persistent project sidebar from:

`app/workspace/projects/[projectId]/layout.tsx`

The sidebar reads project sections from the existing dynamic project section configuration.

Today this typically includes:

- Overview
- Towers
- Forecasting

As Materials, Deliveries, Daily Dockets, Quality and other modules become `ready`, they can appear through the same configured section registry rather than being hard-coded into every page.

On smaller screens the project sidebar becomes a horizontal project navigation strip.

## Project overview

The overview has been simplified.

Removed:
- repeated Forecasting buttons
- repeated Import Towers buttons
- Quick Access cards that pointed to the same routes already present in navigation
- repeated production metrics

The overview now focuses on information:

- tower count
- overall progress
- Raw MH/t
- Production MH/t
- assembly / erection / overall progress
- open defects
- production record count
- latest production date

Raw MH/t and Production MH/t are displayed together so productive labour is not presented without the total labour input.

If the project has no towers, the overview tells the user to open `Towers` in the project sidebar. It does not add another duplicate button.

## Tower import

The import page now explains the CSV format before upload.

It includes:
- neutral example headings
- neutral example tower rows
- a downloadable example CSV
- clear statement that only `Tower` is required
- confirmation that source headings do not need to match exactly
- automatic mapping
- manual mapping
- preview
- duplicate handling

Neutral example columns:

- Tower
- Tower Type
- Line
- Sequence
- Tower Weight (t)
- Body Extension
- Leg A
- Leg B
- Leg C
- Leg D

The example contains no customer, contractor, project or location data from a real deployment.

## Neutral product examples

The package has been scanned so UI examples and placeholders use generic product data only. Real customer, contractor, project and location names are not reused as examples.

Example project-number formats are now neutral:

- `PRJ-26-001`
- `CLT-26-001`
- `2026-0001`

`CLT` is simply a generic placeholder for a client code.

Project creation uses neutral placeholders such as:

- `Transmission Upgrade Project`
- `Client name`
- `CLT`
- `Project location`

Actual tenant/project data is still displayed when it belongs to the logged-in organisation; it is no longer reused as sample content.

## Existing architecture retained

This update does not change:

- tower-import backend
- forecasting backend
- production-actuals model
- dynamic module registry
- organisation section configuration
- project section configuration
- role/permission architecture

No `role === "admin"` navigation logic has been introduced.

## Install

Copy the contents of this ZIP into:

`C:\Users\luzet\Documents\BCContracting\tttracker\v2`

and replace matching files.

Do not run a database migration.

Restart:

```powershell
cd C:\Users\luzet\Documents\BCContracting\tttracker\v2
npm run dev -- -p 3001
```

## Test

Check in this order:

1. Home
2. Projects
3. Settings
4. Open a project
5. Confirm the project sidebar remains visible while navigating
6. Project Overview
7. Towers
8. Import Towers
9. Download example CSV
10. Upload a CSV and confirm mapping/preview
11. Forecasting
12. Resize to tablet/mobile width

The same route should no longer be represented by multiple dashboard buttons.

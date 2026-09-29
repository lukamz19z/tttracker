# TTTracker V2 — Project Operations Foundation

This package adds the next V2 project-level operational layer without replacing the proven V1 Daily Docket / Materials engine in one risky jump.

## What is included

### Project sidebar destinations

- Daily Dockets
- Materials Control Centre
- Defects

The pages use the same V2 visual language already used for Towers / Forecasting:

- slate page background
- white bordered rounded cards
- compact metric cards
- blue primary actions
- responsive tables/registers
- project sidebar remains the navigation source

### Project-wide Daily Dockets

Route:

`app/(protected)/project/[projectId]/daily-dockets/page.tsx`

Features:

- exact date lookup
- tower filter
- crew filter
- review-status filter
- free-text search
- project-wide register
- internal/client approval status shown in organisation-neutral language
- `+ New Daily Docket`

### New Daily Docket project entry

Route:

`app/(protected)/project/[projectId]/daily-dockets/new/page.tsx`

Flow:

1. Select date
2. Select primary tower
3. Optionally select the previous docket **for that tower**
4. Continue into the existing detailed docket editor

This avoids creating a second simplified docket and preserves the V1 operational detail.

### Materials Control Centre

Route:

`app/(protected)/project/[projectId]/materials/page.tsx`

Initial project-wide control centre:

- open missing material
- partially delivered missing material
- outstanding quantity
- transfers in transit
- damaged/incorrect events
- excess events
- outstanding lifecycle
- transfer history
- all material events
- tower filtering/search
- links back to the tower Materials page

This is intentionally a control centre, not a duplicate of the detailed tower Materials page.

### Project-wide Defects

Route:

`app/(protected)/project/[projectId]/defects/page.tsx`

Initial register:

- tower
- status
- severity
- member/segment/drawing/description search
- project-wide totals
- links back to tower defect detail

### Organisation/project configuration

Migration:

`supabase/migrations/20260929_012_operations_control_foundation.sql`

Creates:

- `v2_module_options`
- `v2_daily_docket_review_settings`
- `v2_daily_docket_reviewers`
- `v2_daily_docket_client_contacts`

Configuration precedence:

`platform default -> organisation override -> project override`

Internal reviewers are **individual selected users**, not role names.

Client approval is independently enabled/disabled.

### Configurable dropdowns

The migration seeds the existing V1 behaviours as data.

Materials:

- event types
- work outcomes
- current effects
- mitigation actions
- manual/unlisted material categories

Daily Dockets:

- delay categories
- production activities

The important design is:

- `label` = what the organisation/user sees
- `behavior` = stable operational value used by code/database

This means the UI can be renamed/reordered/hidden without breaking the workflow.

## Install order

1. Confirm Migration 011 is already applied.
2. Apply:

   `supabase/migrations/20260929_012_operations_control_foundation.sql`

3. Copy the package files into the repository, preserving paths.
4. Wire the three feature keys into the existing V2 project section registry/sidebar release status:
   - `daily_dockets`
   - `materials`
   - `defects`

5. Read:
   - `SIDEBAR_INTEGRATION.md`
   - `DAILY_DOCKET_EDITOR_INTEGRATION.md`

## Important: current operational tables

The project-level register/control-centre pages deliberately read the proven operational tables that already exist in V1:

- `towers`
- `tower_daily_dockets`
- `tower_material_events`
- `tower_material_event_items`
- `tower_material_transfers`
- `tower_defects`

That lets V2 navigation and management views be built first without rewriting the 11,000-line docket form and material lifecycle at the same time.

When the V2 operational storage layer is migrated, the page data loaders can move behind server repositories without changing the page UX.

## Review workflow

Do not create a second review engine.

Carry forward the current proven workflow:

- authenticated submitter identity/signature
- selected internal reviewer users
- request changes
- approval revision history
- optional client approval
- final publishing/PDF

The V2 difference is that:

- labels are organisation-neutral
- reviewer settings are organisation/project data
- client approval is configurable
- client-visible content is configurable
- the page no longer assumes the tenant is BC Contracting

## Next implementation pass

The next pass should modify the detailed Daily Docket editor so it directly consumes:

`lib/operations/config.ts`

and reads the new review settings. That is where the five-step V2 editor becomes the website source of truth while retaining the current V1 calculations/material lifecycle.

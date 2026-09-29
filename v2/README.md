# TTTracker V2 – Operations Control Centre

This package extends the current V2 project/tower foundation with:

- configurable assembly + erection progress
- configurable section/stage weighting
- corrected aggregate Raw MH/t + Production MH/t
- project-wide Daily Docket lookup
- a rebuilt Daily Docket editor foundation
- employee search
- Materials Control Centre
- project-wide Defects
- tower previous / next navigation
- tower filters + sorting
- configurable Daily Docket dropdowns
- project review/client-approval settings foundation

It is designed to sit on top of migrations 001–011.

## Why the current MH/t can look wrong

The V1 Daily Docket section model used fixed weights:

- LE 20
- BE 15
- CB 15
- BSS 10
- MSS 10
- TSS 10
- Bottom Cross Arms 5
- Middle Cross Arms 5
- Top Cross Arms 5
- Peaks 5

That can produce misleading earned tonnes when:

1. a section is not applicable (for example Body Extension);
2. the remaining section weights are not normalised;
3. the weights describe effort rather than the actual share of tower mass;
4. Daily Docket MH/t values are averaged instead of aggregating their numerators/denominators;
5. labour hours are not fully allocated across towers when one crew works multiple towers.

This package addresses all five.

## Correct MH/t method

Raw MH/t:

`sum(Raw MH) / sum(Earned Tonnes)`

Production MH/t:

`sum(Production MH) / sum(Earned Tonnes)`

TTTracker does **not** average individual docket MH/t values.

### Raw MH

Raw MH is actual employee attendance time.

### Production MH

Production MH starts from Raw MH and removes configured/non-production time such as:

- prestart
- lunch
- travel in
- travel out
- mobilisation
- employee delays

This follows the proven V1 calculation model.

### Earned tonnes

Each project can choose one of two methods:

#### Progress-earned tonnes

`tower weight × overall progress gained`

Overall progress uses the configured:

- assembly share
- erection share
- assembly stages
- erection stages
- stage weights
- applicability

When `Normalise applicable section weights` is enabled, a non-applicable section does not prevent the phase from reaching 100%.

#### Manual tonnes

The Daily Docket records the actual productive tonnes directly.

This is useful where project section weights represent effort rather than physical steel mass.

## Project Configuration

The project sidebar now includes `Configuration`.

Configuration controls:

### Progress
- Assembly share
- Erection share
- MH/t tonnage basis
- Normalise applicable weights
- Assembly stage names
- Assembly weights
- Erection stage names
- Erection weights
- Stage active/inactive
- Stage applicable by default

The migration seeds the previous section model only as a **review-required starting point**.

It is not treated as an immutable TTTracker standard.

### Daily Docket options
Project admins can configure:
- Delay types
- Material event types
- Weather
- Rate types
- Incident types
- Material work outcomes
- Material units

These are database options. The Daily Docket UI does not contain customer-specific dropdown lists.

### Review settings
The project can configure:
- internal review required
- client approval enabled
- client approval required
- client can view Raw MH/t
- client can view Production MH/t

Reviewer assignment remains based on users/permissions rather than hard-coded role names.

## Daily Dockets

Project sidebar:

`Daily Dockets`

The project page supports:
- From date
- To date
- Exact date by setting From + To to the same day
- Tower
- Crew
- Status

Every result screen keeps Raw MH/t and Production MH/t together.

### New docket

The new editor includes:
- Docket date
- Crew
- Leading Hand employee search
- Weather
- Rate type
- Employee search for every labour row
- Time in / out
- Prestart
- Lunch
- Travel
- Mobilisation
- Delay hours
- Raw MH live calculation
- Production MH live calculation
- Plant
- Multiple tower allocations
- Configurable assembly stages
- Configurable erection stages
- Stage applicability
- Earned tonnes
- Raw MH/t live
- Production MH/t live
- Configurable delays
- Configurable material events
- Incident check
- Daily Site Summary
- RFI references
- Draft / Submit

A submitted docket must allocate all Raw MH and Production MH across the towers worked.

That prevents unallocated hours from making project MH/t look artificially low.

## Employee search

`v2_people` is the common employee/search contract.

Migration 012 backfills active organisation account holders into this table so the search works immediately for current users.

Future onboarding/training/employee-register workflows should write to the same table, so the Daily Docket does not maintain a separate employee list.

## Materials Control Centre

Project sidebar:

`Materials Control`

Features included:
- project-wide search
- search item reference
- search description
- search bundle
- search segment
- search drawing
- search tower
- filter material type
- filter tower
- missing-material summary
- excess-material summary
- open material event summary
- bulk CSV import
- tower-specific and project-wide materials
- material events from Daily Dockets feed the same Control Centre

The tables are generic across:
- bundles
- members
- bolts
- packers
- other configured material kinds

They are not hard-coded to one project CSV.

## Defects

Project sidebar:

`Defects`

Project-wide lookup supports:
- search
- status
- tower
- defect type
- total/open summaries

The table can also link defects to a source Daily Docket.

## Towers

The Towers page now supports:
- search
- tower type
- line/circuit
- Not Started
- In Progress
- Complete
- minimum overall %
- maximum overall %
- natural tower-number sorting
- Sequence
- Type
- Weight
- Assembly %
- Erection %
- Overall %
- Ascending
- Descending

Overall progress uses the project-configured Assembly/Erection split.

### Previous / next tower

Every Tower Overview now has:
- Previous tower
- Back to Towers
- Next tower

Natural sorting is used so `T2` comes before `T10`.

## Production analytics

Daily Docket tower allocations continue to write to:

`v2_project_production_actuals`

The project dashboard uses:
- total Raw MH
- total Production MH
- total earned tonnes

and calculates both project MH/t measures from those aggregate totals.

Forecasting continues to consume the same production-actuals contract.

## Migration

From:

`C:\Users\luzet\Documents\BCContracting\tttracker`

run:

```powershell
npx supabase migration new operations_control_centre
```

Copy the contents of:

`supabase/migrations/20260929_012_operations_control_centre.sql`

into the newly generated migration.

Then:

```powershell
npx supabase db push --dry-run
npx supabase db push
```

## Copy code

Copy the package `app`, `components` and `lib` folders into:

`C:\Users\luzet\Documents\BCContracting\tttracker\v2`

preserving paths.

The migration remains in the repository-level:

`C:\Users\luzet\Documents\BCContracting\tttracker\supabase\migrations`

## Restart

```powershell
cd C:\Users\luzet\Documents\BCContracting\tttracker\v2
npm run dev -- -p 3001
```

## Test order

1. Open a project.
2. Confirm sidebar includes:
   - Overview
   - Towers
   - Forecasting
   - Materials Control
   - Daily Dockets
   - Defects
   - Configuration
3. Open Configuration.
4. Review Assembly/Erection split.
5. Review assembly stage weights.
6. Review erection stage weights.
7. Confirm `Normalise applicable section weights`.
8. Choose the MH/t basis.
9. Configure Delay/Material dropdowns.
10. Open Towers and test filters/sorting.
11. Open a tower and test Previous/Next.
12. Open Materials Control.
13. Test project-wide material search.
14. Test bulk material import.
15. Open Daily Dockets.
16. Search one date.
17. Search a date range.
18. Create a Daily Docket.
19. Search employees.
20. Enter worker time/deductions.
21. Allocate hours to a tower.
22. Update progress.
23. Confirm Raw MH/t + Production MH/t update together.
24. Add a second tower and split hours.
25. Add delay/material events.
26. Submit.
27. Confirm the project dashboard updates.

## Important MH/t review

Do not assume the seeded section weights are correct for a commercial project.

For each project decide whether the stages represent:

1. **physical tower mass**, in which case Progress-earned tonnes can be used; or
2. **work effort / commercial progress**, in which case use Manual Tonnes for MH/t.

TTTracker now supports both instead of silently treating one progress model as universal.

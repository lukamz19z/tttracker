# V1 People PPE Register

## Audit and ownership

The canonical V1 personnel table is `employees` (not the V2 Person tables).
Existing PPE values are `shirt_size`, `jacket_size`, `glove_size`, `pants_size`.
`app/(protected)/people/page.tsx`, the employee profile, and
`mobile/app/(drawer)/profile.tsx` read/write these same columns. No values are
copied into a parallel register. The audit found 63 employees, 59 explicitly
active, and existing values in all four columns. There was no V1 boot-size
column, employee PPE issue table or PPE requirement configuration. No V1 PPE
onboarding submission/table/API was found; the V2 onboarding architecture is
outside this task. Any current/future V1 onboarding process must write the
canonical employee fields (or the requirement RPC for additional categories).
No mobile re-entry or OTA is required for the existing four sizes.

`inventory_ppe_stock` is the existing warehouse item/variant/location stock
register. It is linked from the PPE Register, retained unchanged and is not
evidence of an issue to a particular employee. Recording an employee issue does
not automatically decrement that stock or invent a stock movement.

## Supporting schema

Migration: `20261027120000_v1_people_ppe_register.sql`. Local only; apply through
the reviewed V1 database deployment process before deploying the website.
Do not blindly deploy unrelated V2 migrations to the V1 database.

* `people_ppe_types`: configurable active/required flags, size requirements and
  options, default quantity, issue tracking and sort order. Seeded categories
  match the four existing V1 employee fields only. There are no customer-specific
  PPE definitions. New categories such as boots can be configured by users.
* `people_ppe_requirements`: unique employee/type requirement, quantity override,
  and size **only for new categories**. Database protection forbids copying the
  four existing employee sizes here. Blank quantity uses the category default;
  zero exempts that employee from the requirement.
* `people_ppe_issue_events`: append-only issue/return history with original issue
  reference, quantity, size snapshot, issue/record dates, recording user, notes
  and unique mutation ID. Returns cannot exceed the original issue or precede
  its date. A transaction lock prevents concurrent over-return. Requests are
  idempotent. Replacement is recorded as return of the old item and a new issue.
* Views aggregate issue quantities in PostgreSQL and join current employee
  sizing. No PPE size data migration/rewrite is performed.

Required quantity comes from an employee override or the configured required
default. Optional categories default to zero. Issued quantities are net of
returns and match the currently required size (case-insensitive/trimmed).
Changing size preserves old issue history and does not count a wrong-size issue
towards the new requirement. Outstanding is `max(required - recorded issued, 0)`.
It means outstanding **according to recorded issues**: no historical physical
issue is fabricated. Tracking-off categories show “Not tracked”, not a misleading
zero. Missing lists absent required sizes, sizes outside current options, and
the precise recorded issue shortfall. Existing historical values remain readable.
No expiry/replacement scheduling engine or inventory system is introduced.

## UI and permissions

People → PPE Register provides Overview, People and Outstanding views. Employee
profiles also show the same register for that employee. Size edits write the
legacy employee column directly or the unique additional-category requirement;
the register reloads after writes/on window focus. Profile/mobile changes feed
the same source. Summary counts drill down to their exact contributing rows.

Existing dynamic permissions are reused: `tt.people`, `people.view_basic` and
`people.view_ppe` are required to read/export/print; `people.edit` additionally
controls sizing edits, issue/return recording and definition configuration.
Crew data/filtering requires `people.view_crews`. No role names or confidential
HR/payroll/contact fields are used. “Employee Number” means existing payroll_id
as the operational personnel identifier, not pay amounts/details.

Active defaults follow existing People semantics (`active !== false`). All or
inactive personnel can be explicitly selected. Crew joins use `employees.crew_id`
and the central `crews` table. Search uses name, operational employee number and
permitted crew label, never email. Inactive definitions retain all history.

CSV exports the filtered operational lines with formula-safe quoting. Print is
a dedicated complete table with generated date and filters, independent of the
screen's progressive 100-person rendering. The API pages register rows in
1,000-row blocks to avoid PostgREST truncation and loads definitions/crews in
parallel; it never performs per-employee requests. Quantities are summarised
server-side from the shared model. The detail dialog shows the latest 500 events
for the selected employee; aggregate totals always use the complete ledger.

## Verification

Run `node scripts/verify-v1-ppe-register.mjs` plus root TypeScript, build and
changed-file ESLint. The test applies the migration twice in PGlite, verifies
canonical/profile-style writes, added categories, scoped uniqueness, active and
crew filters, exact quantities and returns, idempotency, missing requirements,
safe CSV, permission denials and the actual API with 2,505 rows crossing multiple
pages. Its fixture timing is not a hosted production performance measurement.

After approved migration/deployment, verify with authorised and view-only users:
existing sizes appear; edit a size from each surface; check the same employee in
the other surface; add a configured category; record issue/return; drill counts;
compare filtered CSV/print; test inactive/crew/missing filters. Browser/live writes
require the migration and have not been performed against hosted data here.

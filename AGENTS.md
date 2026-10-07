# AGENTS.md — TTTracker Development Rules

## Purpose

This repository contains TTTracker, including the live V1 application and the new configurable TTTracker V2 platform.

The primary development focus is **V2**.

Codex must inspect the real repository before changing code. Do not assume file names, database columns, helper return types, route structures, or API shapes from prior prompts.

---

# Repository Boundaries

## V1

V1 is the existing production application.

**Do not modify V1 unless the user explicitly asks for a V1 change.**

Do not copy V1 code blindly into V2. V1 is useful as a reference for proven operational logic, but V2 should use cleaner, configurable, multi-tenant architecture.

## V2

V2 root:

```text
v2/
```

Local development:

```powershell
cd v2
npm run dev -- -p 3001
```

Local URL:

```text
http://localhost:3001
```

## Supabase

Supabase migrations live at repository root:

```text
supabase/migrations/
```

Do not place V2 migrations inside `v2/`.

Before writing a migration:

1. inspect existing migrations,
2. inspect the actual code that consumes the schema,
3. confirm the object does not already exist,
4. avoid recreating old V1 tables or deprecated concepts,
5. preserve existing data,
6. make additive migrations idempotent where practical,
7. avoid duplicate migrations for fixes already applied manually,
8. keep schema cache reloads where PostgREST requires them.

Do not invent database columns from memory.

---

# Working Method

Before making a change:

1. read this `AGENTS.md`,
2. inspect the relevant existing files,
3. inspect related helpers, types and API routes,
4. inspect relevant migrations,
5. identify existing behaviour that must be preserved,
6. explain the intended change briefly if the task is broad,
7. modify only the relevant module.

Do not rewrite unrelated modules.

Do not delete working functionality to make a new feature easier.

Prefer extending existing architecture over adding a second parallel implementation.

When a bug is reported, trace the actual failing line or data shape before changing code.

---

# Validation

After changing V2 code, run the relevant checks.

At minimum, where applicable:

```powershell
cd v2
npm run build
```

Also run available TypeScript, lint or targeted checks if defined in `package.json`.

Fix errors introduced by the change.

Do not hide build errors with broad `any`, disabled lint rules, ignored exceptions, or unsafe null assertions unless there is a clearly justified reason.

If a database migration is required, say so explicitly.

If no migration is required, say so explicitly.

---

# Architecture Principles

TTTracker V2 is a **configurable multi-tenant contractor platform**.

It must not be hard-coded for BC Contracting, LMZ Contracting, or any individual customer.

Hard-code platform capabilities, not customer configuration.

Configuration should come from data such as:

- organisation settings,
- project settings,
- enabled modules,
- subscription entitlements,
- roles and permissions,
- configurable option groups,
- workflow settings,
- approval settings,
- notification settings.

Avoid logic such as:

```ts
if (organisation.name === "BC Contracting")
if (plan === "enterprise")
if (role === "admin")
```

unless the product architecture explicitly requires that exact condition.

Permissions must remain dynamic.

---

# Contractor / Client Model

The current primary model is contractor-hosted.

A contractor organisation usually hosts the project.

Clients and other external parties should normally be represented as project parties rather than automatically becoming members of the contractor organisation.

Use the same canonical project records for contractor and client views.

Do not create duplicate client copies of records.

Client visibility should be explicit and configurable.

Publishing / sharing actions should support auditability, including actions such as:

- Publish,
- Send,
- Revoke.

The architecture should also remain capable of supporting client-hosted / principal-contractor-hosted projects later.

---

# UI / UX Rules

Keep V2 visually consistent.

Priorities:

- minimise scrolling,
- use compact KPI cards,
- group controls logically,
- avoid duplicate buttons,
- keep page headers concise,
- keep operational screens easy to scan,
- use searchable autocomplete / comboboxes for large datasets,
- use simple dropdowns only for small controlled option sets,
- avoid horizontal scrolling for ordinary navigation controls,
- do not bury important actions in oversized cards,
- avoid long all-in-one configuration pages.

Do not add complexity unless it is operationally useful.

If the user has previously simplified a workflow, do not reintroduce extra states without a strong reason.

---

# Project Configuration

Project Configuration should open with a **visible section sidebar** so users can immediately choose the area they want.

Prefer section routes / navigation such as:

- Project Details
- Progress / Forecasting
- Daily Dockets
- Materials
- Quality
- Approvals
- Client Access
- Notifications
- Integrations

Do not make users scroll through one giant configuration page.

Project-specific workflows must be configurable at project level where projects may differ.

Organisation defaults may seed project settings, but projects must be able to differ where appropriate.

---

# Materials — General

Materials is a major V2 module.

It includes:

- Bundles
- Members
- Bolts
- Packers
- Deliveries
- Missing Materials
- Excess Materials
- Transfers / Movements
- Reservations
- Amendments / Redlines
- Reconciliation
- Search
- Imports

Materials should remain project-wide while still allowing tower filtering.

The UI should be simple enough for site use.

---

# Materials — Tower Selection

Never use a large native select containing all towers where users need to scroll through a long list.

Use a searchable combobox:

- typing filters tower identifiers,
- matching results are shown,
- users can also browse results,
- selected tower is obvious,
- keyboard and mouse use should both work.

Use this consistently across:

- Materials main filter,
- imports,
- deliveries,
- missing / excess,
- movements,
- reservations,
- amendments,
- transfers,
- other tower-linked workflows.

---

# Materials — Bundle Check-Off

Bundle check-off must remain deliberately simple.

Primary bundle actions are:

- **Arrived**
- **Not Delivered**
- **Clear**

Do not make the primary operator actions:

- Full
- Missing
- Partial

Those may exist as derived states elsewhere if required, but the site operator-facing bundle workflow should stay simple.

Once a bundle is marked **Arrived** or **Not Delivered**:

- collapse the row,
- show a compact readable status,
- keep an option to open details / pack contents when needed.

The tower view should be quickly scannable.

---

# Materials — Bundle Status

Provide a project-wide Bundle Status report by tower.

It should clearly show:

- expected bundles,
- arrived bundles,
- not delivered bundles,
- not checked bundles,
- completion / overall status.

If Delivery Management is enabled for the project, show driver delivery progress separately.

Do not merge delivery-driver confirmation with site bundle verification.

---

# Materials — Delivery Management

Delivery Management is **optional per project**.

Some projects will use TTTracker to plan and record deliveries.

Other projects will not.

The contractor or client may decide whether the project uses this workflow.

Project Configuration must therefore expose a project-level setting to enable / disable Delivery Management.

When disabled:

- delivery-specific controls should not clutter the Materials workflow,
- Bundle Check-Off must still work independently.

When enabled, the workflow is:

1. delivery is planned,
2. tower and bundles are allocated,
3. delivery driver records delivered / not delivered bundles,
4. delivery docket records the delivery event,
5. Leading Hand / Supervisor independently performs the site bundle check,
6. Bundle Status shows both stages separately.

Driver confirmation must never automatically count as the Leading Hand / Supervisor site verification.

---

# Materials — Delivery Dockets

Delivery dockets should look professional and be easy to read.

The register should show at least:

- delivery docket number,
- destination tower,
- delivery status,
- bundle count,
- scheduled date/time,
- actual delivered date/time,
- signed-in TTTracker user who confirmed delivery,
- driver where applicable,
- vehicle / truck,
- supplier / docket reference.

Opening a docket should show the bundles on that delivery and their individual delivery states.

Avoid a cluttered card-per-field layout when a compact register/table is clearer.

---

# Materials — Imports

Material imports are project workflows.

Import sequence:

1. select tower,
2. select import type,
3. upload file,
4. map columns,
5. preview,
6. validate,
7. import.

Import types are separate:

- Bundles
- Members
- Bolts
- Packers

Support:

- Add
- Merge
- Replace

Every import workflow should provide:

- clear instructions,
- downloadable template / example,
- column mapping,
- preview,
- validation,
- reconciliation feedback.

Do not silently guess ambiguous records.

If bundle references repeat across tower segments, use deterministic context such as:

- tower,
- segment,
- source document,
- drawing,
- record ID.

---

# Materials — Source Relationships

Packing lists and drawings should cross-reference rather than overwrite one another.

Typical relationships:

Packing list:

```text
member -> bundle
```

Drawing / material schedule:

```text
member -> drawing
member -> segment
bolt -> drawing
packer -> drawing
```

Use these relationships to infer:

- bundle contents,
- tower segment applicability,
- drawing references,
- expected materials.

Do not destroy source provenance.

---

# Materials — Missing / Excess

Missing and excess material require full traceability.

Missing-material records should support:

- item,
- quantity,
- tower,
- bundle,
- segment,
- drawing,
- date raised,
- source,
- work impact,
- Daily Docket link,
- client notification events,
- replacement source,
- receipt,
- closure.

Replacement sources may include configurable options such as:

- another tower,
- supplier,
- warehouse,
- project stock,
- custom/manual source.

Excess materials should track:

- current location,
- quantity,
- movements,
- reservations,
- transfer history.

Prefer ledger / movement-based quantity tracking rather than manually overwriting current quantities.

---

# Materials — Amendments / Redlines

Engineering changes must not overwrite the original material requirement.

Example:

```text
M16 bolt -> revised to M20
```

Preserve:

- original requirement,
- amendment / redline,
- revised requirement,
- effective date,
- source document / revision,
- reason,
- affected tower / segment / item,
- audit history.

The user must be able to tell what the original design required and what changed later.

---

# Materials — Configuration Defaults

Default Materials options belong in Configuration and must remain editable.

Examples include:

- material source types,
- missing-material source options,
- movement types,
- locations,
- issue event types,
- import source roles,
- amendment types,
- other operational option groups.

Do not scatter hard-coded dropdown values across individual pages.

Where sensible:

- organisation configuration provides defaults,
- project configuration can override or enable project-specific behaviour.

---

# Daily Dockets

V2 Daily Dockets should preserve proven V1 operational logic while progressively moving configuration behind V2 settings.

Labour should remain compact.

Typical labour columns:

- Employee
- Time In
- Time Out
- Delays
- Raw MH
- Production MH

Crew selection should come from People.

Plant selection should come from Assets.

Tower selection should use searchable selection.

Raw MH/t and Production MH/t should be shown together when relevant.

When aggregating:

- sum manhours,
- sum production,
- calculate the aggregate ratio from totals.

Do not average per-docket ratios.

Daily Dockets should support project-configurable review and approval settings.

---

# Approvals

Review settings must be configurable.

Support:

- individually selected internal reviewers,
- optional client approval,
- configurable recipient lists,
- configurable client visibility,
- audit history.

Do not rely only on role-based approval logic.

Reviewers should be valid project users / permitted external participants as appropriate.

---

# People / Crews

Crews are managed from People.

Do not create a second disconnected crew register inside Daily Dockets.

Large employee lists should use search/autocomplete.

---

# Assets

Assets should remain the source for plant / vehicle records used elsewhere in V2.

Do not duplicate asset records inside Daily Dockets or other modules.

---

# Quality

Defects and Revisions / Rectifications should preserve separate human-readable ID namespaces and UUID primary keys.

Quality records should support:

- before / after evidence,
- tower context,
- segment,
- drawing context,
- status history,
- links back to originating records where relevant.

Avoid duplicate quality records for contractor and client views.

---

# Forecasting

Forecasting is an important V2 area.

Preserve separate concepts for:

- planned progress,
- actual progress,
- Raw MH,
- Production MH,
- Raw MH/t,
- Production MH/t,
- delays,
- crew performance,
- forecast completion.

Do not average ratio fields incorrectly.

---

# Auth / Supabase

Do not bypass authentication errors by weakening security checks.

If Supabase returns errors such as:

```text
JWT issued at future
```

treat the auth/session/time issue as the problem rather than removing workspace access checks.

Do not assume helpers such as workspace/project context return a nested user object in a specific shape without inspecting the helper implementation.

Avoid unsafe code like:

```ts
project.user.id
```

until the actual returned context shape has been confirmed.

---

# Customer-Facing Branding

Customer-facing V2 communication should be TTTracker / LMZ branded where applicable.

Do not expose Supabase branding in customer-facing authentication or email flows when TTTracker owns the experience.

Outbound email should protect recipient privacy.

---

# Multi-Tenant Requirements

New modules must consider:

- organisation ownership,
- project ownership,
- project-party access,
- module entitlement,
- permissions,
- client visibility,
- organisation defaults,
- project overrides.

Do not build a feature that only works for one existing project.

---

# Data Imports

For any substantial CSV / spreadsheet import, provide:

- downloadable template or example,
- clear field guide,
- mapping,
- preview,
- validation,
- import mode,
- error reporting.

Do not silently discard rows.

Do not silently coerce ambiguous values.

---

# Error Handling

Prefer specific errors.

Bad:

```text
Something went wrong.
```

Better:

```text
Materials Control bundle query failed: <database message>
```

If a database operation succeeds but does not return an expected ID, fail with a specific message.

Do not allow `Cannot read properties of undefined` to be the expected user-facing failure mode.

---

# Git

Before committing, inspect recent Git history:

```bash
git log --oneline -20
```

Follow the existing repository commit-message style.

Do not invent a new convention if the repository already has one.

Do not commit automatically unless the user explicitly asks.

Do not push automatically unless the user explicitly asks.

Do not rewrite shared history.

---

# Pull Requests

If the repository has an existing PR template, follow it.

If there is no template, a PR summary should normally include:

- what changed,
- why it changed,
- affected module(s),
- database migration required or not,
- testing performed,
- screenshots for meaningful UI changes,
- known limitations / follow-up items.

Link issues only when a real issue exists.

Do not invent issue numbers.

---

# Agent Behaviour

When the user asks for a change:

- inspect first,
- make the smallest complete change,
- preserve existing behaviour,
- keep configuration dynamic,
- validate the result,
- summarize changed files,
- state migration requirements,
- call out unresolved risks.

If a request is ambiguous but the existing implementation makes the intent clear, use the existing architecture instead of asking unnecessary questions.

If the implementation and this document conflict, stop and explain the conflict before making destructive changes.

---

# Current Priority

The current active V2 development area is primarily:

- Project Configuration,
- Materials,
- Deliveries,
- Bundle Check-Off,
- Materials imports,
- Materials traceability.

Keep the current Materials UX rules consistent:

- minimal scrolling,
- compact KPIs,
- logical grouped controls,
- searchable tower comboboxes,
- bundle actions only Arrived / Not Delivered / Clear,
- collapse checked bundle rows,
- project-wide Bundle Status,
- optional project Delivery Management,
- separate driver delivery confirmation from site supervisor verification,
- professional delivery docket register,
- delivered time and confirming TTTracker user visible in the register,
- configurable default Materials options exposed in Configuration.

# Daily Docket editor integration — V2 project entry point

This package intentionally creates the **project-wide Daily Dockets register first** and keeps the proven V1 Daily Docket editor as the detailed form.

## New flow

`Project -> Daily Dockets -> New Daily Docket`

The project-level launcher selects:

1. Docket date
2. Primary tower
3. Optional previous docket from that tower

It then opens:

`/project/[projectId]/tower/[towerId]/dockets/new`

with:

- `docketDate=YYYY-MM-DD`
- `copyDocketId=<uuid>` when Copy Previous is enabled

## Required small bridge in the existing tower-level New Docket page

Read `searchParams.docketDate` and `searchParams.copyDocketId` and pass them into the existing editor.

Do **not** automatically copy "the last docket in the whole project".

The copy source must be chosen from the selected tower.

## Copy Previous rule

Carry forward:

- Crew
- Personnel
- Plant / vehicle allocation
- Prestart / lunch / travel defaults
- Rate type
- Opening section progress
- Other safe production defaults

Clear:

- Delays
- Material events
- Missing / excess / damaged events
- Bundle transfers created that day
- Defects raised/referenced that day
- Incidents
- Daily Site Summary
- RFIs
- Signatures
- Internal approval
- Client approval
- Approval revision / workflow state

## Review terminology

The V1 database/status fields may remain temporarily named:

- `bc_*`
- `submitted_bc`
- `bc_changes_requested`

V2 UI should present these as organisation-neutral concepts:

- Organisation Representative
- Internal Review
- Internal Changes Required
- Client Review
- Approved

Do not duplicate the approval workflow. Reuse the existing review/publish engine while migrating naming and settings behind the V2 configuration layer.

## Organisation / project review configuration

Read `v2_daily_docket_review_settings` with this precedence:

1. Project override
2. Organisation default
3. Platform default

Internal reviewers are selected individual users from `v2_daily_docket_reviewers`.

Client approval is enabled by `client_approval_enabled` and project client recipients come from `v2_daily_docket_client_contacts`.

## Configurable Daily Docket / Materials choices

Use `loadConfiguredOptions()` from:

`lib/operations/config.ts`

For the current V1 form, replace hard-coded arrays with these groups:

### Materials

- `materials / event_type`
- `materials / work_outcome`
- `materials / current_effect`
- `materials / mitigation_action`
- `materials / manual_category`

The **label** may change per organisation/project.

The **behavior** is the stable operational value saved/used by the workflow.

This is important: an organisation can rename "Missing material" without breaking code that expects behavior `missing`.

### Daily Dockets

- `daily_dockets / delay_type`
- `daily_dockets / production_activity`

Additional groups can be added from Settings without editing the Daily Docket page.

## Recommended five-step editor

Keep the existing V1 content, but present it as the V2 five-step flow already used in the mobile editor:

1. Setup
2. Crew & Plant
3. Work & Progress
4. Site Events
5. Review & Submit

The project-level launcher is **not** a second form. It only establishes the primary tower/date/copy source before entering the normal editor.

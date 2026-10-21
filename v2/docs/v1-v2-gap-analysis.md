# V1 to V2 feature gap analysis

Audit date: 13 October 2026. V1 source was inspected as the operational reference; V1 was not changed. V2 behavior below is based on the current application routes, server actions, document service, database functions, and verification code. A route, table, or screen by itself is not treated as proof of working behavior. “Implemented” means a server-backed path exists; where Microsoft live behavior has not been exercised, that is called out separately.

## Executive summary

V2 has a working, tenant-scoped People and Training foundation: people and crew operations, configurable Training Types and options, expiry and requirement calculations, SharePoint-backed evidence, document preview, review actions, retryable upload drafts, and secure external onboarding. Its model is more configurable than V1 and does not depend on BC-specific types, role names, or folder paths.

Two important gaps remain. V2 has no equivalent of V1’s Training Planner and controlled bulk-upload workflow. Also, linked qualifications share one evidence group and one physical document, but a review decision currently applies only to the selected linked Training record. This audit closes the latter gap with a database wrapper that applies the same decision transactionally to every review-required record in that shared evidence group. Each record still calculates expiry and superseding independently. The new migration is additive and has not been applied to a hosted database.

V1 has no secure external onboarding workflow in the inspected source. V2’s configurable, versioned external onboarding workflow is therefore an improvement rather than parity work. V2 document uploads go through the central SharePoint service; onboarding retains legacy-storage reads only for historical migration/preview compatibility. Live Microsoft provider behavior remains distinct from code-path verification.

## Training matrix and record-management follow-up (13 October 2026)

The V1 company matrix (`app/(protected)/people/training/matrix/page.tsx`) has two explicit modes. **Status View** is a compact employee-by-Training-Type compliance matrix. **Detailed View** uses the same employee/type matrix and adds configured Class/Tickets, Certificate Number (when required), Expiry (when applicable), and Status. It offers a matching CSV export for each view. V1's project matrix is a separate requirement-oriented view; configured required classes remain separate requirement columns and a parent qualification must not satisfy a missing required class.

V2 now has a shared-data **Status View / Detailed View** switch in the organisation matrix and remembers the choice in browser local storage. Detailed cells show available class, number, expiry and state values; the underlying matrix and requirement calculations remain server projections. The project matrix stays requirement-specific, matching V1's project behavior. V2's company matrix currently has no CSV export, and its data projection is more compact than V1's old matrix. This is **PARTIAL (P1)** until export and full class-per-column behavior are added.

Training Type configuration now includes a tenant-owned `matrix_option_display` setting (`separate` or `combined`). It is intended to control presentation only; each class remains a canonical Training record. Option records in detailed matrix cells retain their own state and expiry. Project requirements still evaluate the required type/option through the canonical requirement resolver. The current V2 matrix continues to use a parent Training Type header, so fully separate option columns and combined register-row grouping are **PARTIAL (P1)**; neither is allowed to merge records or weaken a specific project requirement.

Operational record management adds audited metadata correction and logical voiding. Approved/current records permit certificate-number corrections without changing the reviewed qualification; issue date, expiry, option, person, and type changes remain replacement operations for approved records. Pending records can update issue/expiry/option with server-side validity recalculation. Voiding requires `training.edit` and a reason, retains the record and evidence relationship, and removes it from current competency calculations, matrix gaps and normal register/review results. Physical SharePoint deletion is not performed. Restore is not implemented. This is **PARTIAL (P1)**: material changes on approved records use the safer replacement workflow; a dedicated delete capability and restore workflow remain future work.

The File Naming red banner was traced to the configuration shell also issuing a generic `peopleRead` request with the unsupported `file_naming` area. The tab has its own filename API/component; the redundant generic read is now skipped for that area, leaving the naming interface independent of the unsupported request. Browser-level authenticated verification was not completed in this work; automated source regression and application build are the available checks.

## Evidence inspected

V1 People/Training evidence includes `app/(protected)/people/page.tsx`, `app/(protected)/people/[employeeId]/page.tsx`, Training configuration/register/new/bulk-upload/matrix/project-matrix/project-requirements/expiry/planner pages, `app/api/training/records/upload/route.ts`, Training review/document APIs, `lib/training/server.ts`, `lib/training/sharepoint.ts`, and the mobile Training screens/API. Relevant V1 SharePoint behavior is in `lib/training/sharepoint.ts`, including employee-folder resolution, folder rename/sync, Training folder selection, superseded-file movement, and SharePoint metadata updates.

V2 evidence includes `v2/components/people/people-client.tsx`, `people-operations.tsx`, `training-catalogue.tsx`, `training-editor-content.tsx`, onboarding admin/external/field components, `v2/app/api/people/**`, `v2/app/api/onboarding/security/workflow/route.ts`, `v2/lib/documents/service.ts`, `preview.ts`, and `onboarding.ts`, plus the People/Training migrations from `20261004130000_people_foundation.sql` through the Training reliability migrations. `supabase/verification/training_reliability.test.mjs` exercises expiry, replacement, required evidence, retry, front/back evidence, linked records, preview access, tenant isolation, and review transitions.

Platform references were checked in V1 route/API inventories and V2 workspace/API inventories for Daily Dockets, Materials, Quality, Assets, Prestarts, Projects, workpacks/Safety, Documents, Commercial, Notifications, and Mobile. The platform table below is intentionally high-level; it does not claim live-provider or full-workflow parity from route presence alone.

## People, Training, and onboarding parity matrix

Classification: **PARITY**, **PARTIAL**, **MISSING**, **REPLACED / IMPROVED**, **NOT APPLICABLE**, or **BLOCKED**. Priority is P0 (integrity/security), P1 (important workflow), P2 (operational parity), or P3 (convenience). V2 “present” does not imply the Microsoft tenant’s live configuration has been verified.

### Training checklist

| Feature | V1 behavior found | V2 behavior found | Status | Priority / recommended action | Implemented this task? |
|---|---|---|---|---|---|
| Categories | Configurable Training categories and SharePoint folder labels | Organisation-owned categories with active state and filename defaults | REPLACED / IMPROVED | P2 — retain configurable category model | No |
| Tickets / Training Types | Ticket register with requirements and workflow configuration | Organisation-owned Training Type catalogue and compact editor | REPLACED / IMPROVED | P2 — preserve V1-simple summaries | No |
| Options / Classes | Type-specific class/subtype selection | Reusable organisation options linked to Training Types | REPLACED / IMPROVED | P1 — retain option-scoped matching | No |
| Automatic expiry | Validity interval calculated from issue date | Per-type automatic validity in canonical write function | PARITY | P0 — keep expiry server-calculated | No |
| Manual expiry | User enters evidence expiry | Manual validity supported and validated | PARITY | P1 — retain validation | No |
| Does not expire | No-expiry configuration | `never` validity mode | PARITY | P2 — none | No |
| Expiry warnings | Configurable warning period and expiry list | Per-type renewal lead and matrix/attention calculations | PARITY | P2 — none | No |
| Certificate/licence number | Per-type required/optional field | Per-type required flag and canonical record field | PARITY | P2 — none | No |
| Issue date | Per-type issue-date requirement | Per-type validation and date capture | PARITY | P2 — none | No |
| Front/back upload | Configured front/back evidence | `front_back` and selectable `single_or_front_back`; finalisation validates all required sides | PARITY | P1 — retain atomic evidence rule | No |
| Single upload | Single evidence submission | Single evidence is uploaded through central document service | PARITY | P0 — SharePoint only | No |
| Multiple documents | V1 upload supports multiple files/records in some flows | V2 supports multiple linked document records, but Training upload semantics are primarily single or front/back | PARTIAL | P1 — add explicit multi-document requirement only when needed by real types | No |
| Linked qualifications | V1 type configuration can link evidence-supported Training Types; Add Training lets user select linked evidence | V2 `v2_training_linked_types`, optional linked-type selection, shared evidence group | PARITY | P0 — test transaction behavior and preserve generic links | Group review fixed |
| First Aid + CPR same document | V1 can create linked Training records from one course evidence selection | V2 can create both configured records and upload one physical item | PARITY | P0 — retain one-item regression | Group review fixed |
| Configurable shared evidence | Link definition is configured by Training Type, not a hard-coded name branch | Organisation config links arbitrary type IDs; submission explicitly selects linked types | REPLACED / IMPROVED | P0 — no name-based rules | Group review fixed |
| Review workflow | Verification queue and configured reviewer rules | Review policy per type/source; shared evidence validation; dynamic permission checks | PARITY | P0 — ensure group decisions are atomic | Yes |
| Approve | Reviewer approval activates record and applies replacement | Server validates evidence and invokes canonical confirmation/superseding | PARITY | P0 — preserve server invariant | Group approval now applies to review-required siblings |
| Reject | Reviewer can reject with comment | Reject transition and comment validation | PARITY | P1 — group outcome now stays consistent for linked records | Yes |
| Request changes | Reviewer can return evidence for correction | Changes-required transition and resubmission path | PARITY | P1 — group outcome now stays consistent for linked records | Yes |
| Reviewer comments | Required for reject/change outcomes | Stored in canonical review fields | PARITY | P2 — none | No |
| Reviewer notifications | V1 sends configured reviewer notifications through in-app/push/email paths | V2 has configured review recipients and notification plumbing; delivery depends on configured channels | PARTIAL | P2 — validate channel delivery/preferences in deployment | No |
| Employee outcome notifications | V1 has reviewer/employee notification code paths | V2 notification behavior is present but not fully demonstrated for every outcome/channel in this audit | PARTIAL | P2 — add outcome delivery verification | No |
| Trusted/authorised submitter | V1 configuration distinguishes review/trusted upload behavior | V2 uses policy and `training.confirm_without_review` capability, not role-name checks | REPLACED / IMPROVED | P0 — keep dynamic capability authorization | No |
| Superseding | Old record is preserved and moved to historical state after replacement approval | Candidate is resolved from type configuration; old current remains until final confirmation | PARITY | P0 — no early supersede | No |
| Training history | Person page exposes historical records | V2 person detail keeps record history and superseded documents referenced | PARITY | P2 — retain history surface | No |
| Multiple current | V1 allows configurations that retain multiple current records | V2 `allows_multiple_current` bypasses automatic replacement | PARITY | P0 — keep tested | No |
| Class-aware superseding | V1 class/subtype distinctions participate in replacement behavior | V2 `type_and_option` scope matches the same option | PARITY | P0 — keep tested | No |
| Project-aware superseding | V1 has project-related Training configuration | V2 `type_option_and_project` scope includes project identity | PARITY | P1 — keep organisation/project ownership checks | No |
| Employee folder provisioning | V1 provisions a person folder when configured/uploading | V2 has per-record People folder jobs and central folder provisioning | REPLACED / IMPROVED | P1 — configure behavior through SharePoint Document Setup | No |
| Folder rename/sync | V1 renames the folder using stable stored folder identifiers | V2 has stable folder IDs, rename/sync worker behavior | PARITY | P1 — keep idempotent and audited | No |
| Training subfolders | V1 derives category/Training subfolders | V2 folder templates are centrally configurable by document context | REPLACED / IMPROVED | P2 — no customer-specific path defaults | No |
| Superseded file archive | V1 moves old evidence under the employee’s configured-by-code Superseded folder and updates item metadata | V2 retains the SharePoint item and marks canonical Training relationship historical; no configured archive move is implemented | PARTIAL | P2 — add configured archive action only with shared-document safety | No |
| Configurable filenames | V1 exposes filename components and type-specific date choices | V2 central token templates support organisation/category/type precedence | REPLACED / IMPROVED | P2 — use one resolver | No |
| Training-specific filename | V1 Training Type stores component choices | V2 Training Type can override inherited filename template | REPLACED / IMPROVED | P2 — preserve inherited rule | No |
| Person identifier in filename | V1 uses existing employee/payroll identifier in filename generation | V2 friendly Employee Number resolves canonical `employee_number`; templates remain configurable | PARTIAL | P1 — verify legacy payroll ID mapping for migrated organisations | No |
| SharePoint metadata | V1 writes selected Training fields to library columns | V2 saves canonical business metadata and stable SharePoint IDs in Supabase; optional provider metadata is supplemental | REPLACED / IMPROVED | P1 — avoid requiring library columns | No |
| Document preview | V1 preview/download routes resolve Training evidence | V2 central preview authorizes via Training evidence group and streams through TTTracker | PARITY | P0 — retain entity permissions | No |
| PDF preview | V1 displays/downloads PDF evidence | V2 returns safe inline PDF preview | PARITY | P1 — provider-backed live test still needed | No |
| Image preview | V1 displays image evidence | V2 streams JPEG/PNG through central preview | PARITY | P1 — provider-backed live test still needed | No |
| Bulk Training upload | V1 has employee/type selection, controlled bulk submission, evidence/date/review flow | V2 has no equivalent bulk Training submission/planner surface | MISSING | P1 — implement against central document service after this analysis | No |
| Training Register | V1 has searchable status register and filters | V2 server-backed Training register with status/filter projections | PARITY | P1 — ensure drafts remain separate | No |
| Training Matrix | V1 matrix identifies compliance per employee | V2 canonical matrix computes per-person/per-type state | PARITY | P1 — retain canonical expiry logic | No |
| Project requirements | V1 project Training requirements and project matrix | V2 project requirement records and per-project matrix/read paths | PARITY | P1 — live permission tests remain necessary | No |
| Expiry dashboard/list | V1 expiry page and notifications | V2 renewal lead logic and attention lists | PARITY | P1 — verify notification execution | No |
| Training Planner | V1 planner aggregates missing/expiring people and hands selections to bulk upload | V2 has matrix/requirements and attention counts, but no equivalent planner-to-bulk workflow | MISSING | P1 — planner and bulk submission | No |
| Mobile Training upload | V1 mobile allows Training evidence submission | No V2 mobile application exists in this repository | MISSING | P1 — mobile product track | No |
| Mobile Training viewing | V1 mobile shows Training details/evidence | No V2 mobile application exists in this repository | MISSING | P1 — authenticated TTTracker document APIs can be reused | No |
| Current vs expired | V1 derives validity from approval/current/expiry | V2 server projection distinguishes current, expiring, expired, superseded, review states | PARITY | P0 — use canonical server calculation | No |
| Onboarding-created Training | No V1 secure external onboarding route was found in inspected V1 source | V2 onboarding completion creates configured Training requests and preserves shared evidence links | REPLACED / IMPROVED | P1 — verify external-provider publication in hosted environments | No |
| Evidence reuse | V1 has linked evidence behavior | V2 uses one canonical SharePoint document and shared evidence-group relationships | REPLACED / IMPROVED | P0 — one upload, many authorized relationships | No |

### People checklist

| Feature | V1 behavior found | V2 behavior found | Status | Priority / recommended action | Implemented this task? |
|---|---|---|---|---|---|
| Employee/person register | Employee register centered on employee rows | Dynamic People register supports multiple relationship/person types | REPLACED / IMPROVED | P1 — keep employee as a view, not the only person type | No |
| Search | Employee search in register | Searchable People register and picker | PARITY | P2 — none | No |
| Active/inactive | Employee active flag drives views | Canonical employment/person status drives active state | PARITY | P1 — preserve non-employee relationships | No |
| Employment/engagement | Employee fields and job details | Configurable person/engagement model and relationship types | REPLACED / IMPROVED | P1 — retain schema-driven fields | No |
| Contact details | Employee contact fields | Configurable operational/private fields with permission-gated private data | PARTIAL | P1 — compare field coverage during migration | No |
| Emergency contact | Employee details contain emergency-contact concepts | Can be collected through protected onboarding/private data domains; not all fields are shown in the general register | PARTIAL | P1 — validate organisation templates and access rules | No |
| Employee SharePoint folder | V1 stores employee folder references | V2 stores stable folder/site/drive references in provisioning model | REPLACED / IMPROVED | P1 — configuration-driven destination | No |
| Folder auto-provisioning | V1 creates folders on employee/Training paths | V2 queue/worker provisions configured person folders | PARITY | P1 — hosted scheduler/provider operation remains environment-dependent | No |
| Folder rename | V1 sync helper renames folder and metadata | V2 uses stable folder IDs and configured rename/sync worker | PARITY | P1 — none | No |
| Documents | V1 employee profile exposes documents and Training evidence | V2 canonical document rows and SharePoint references | REPLACED / IMPROVED | P0 — no Supabase Storage for new files | No |
| Document preview | V1 secure file route | V2 central preview applies record/person authorization | PARITY | P0 — do not broaden People access | No |
| Crews | V1 crew register and employee assignment | V2 organisation-owned crew/member management | PARITY | P1 — none | No |
| Crew leaders/membership | Leader and member assignments | V2 crew leader/member records and history | PARITY | P2 — none | No |
| Project crew assignment | V1 crew/project assignment behavior | V2 project crew assignment records with project membership checks | PARITY | P1 — retain project authorization | No |
| Training links | Employee profile links to Training records | V2 person detail resolves Training/history under dynamic People permissions | PARITY | P1 — none | No |
| Onboarding links | No secure V1 external onboarding path found | V2 person/onboarding records linked by canonical instance/person references | REPLACED / IMPROVED | P1 — none | No |
| Site Prestarts | V1 People Site Prestarts with attendance and completion | V2 People site-prestart records/read/write paths | PARITY | P2 — high-level platform parity not otherwise scored here | No |
| Employment document handling | V1 employee file handling is tied to employee folder/SharePoint helpers | V2 supports onboarding/central document contexts; a standalone employment upload workflow is not fully demonstrated | PARTIAL | P2 — add only when canonical employment-document workflow is prioritized | No |
| Document naming | V1 component-driven naming includes employee/type/date fields | V2 central resolver provides template-based naming | REPLACED / IMPROVED | P2 — no separate People naming engine | No |
| Folder naming | V1 uses employee/payroll identifier and name, with sync behavior | V2 configurable folder templates and stable item IDs can reproduce this pattern | REPLACED / IMPROVED | P1 — validate migrated payroll ID mapping | No |

### Onboarding checklist

No secure external onboarding module or onboarding API route was found in the inspected V1 source. The rows below distinguish that absence from behavior added in V2. NOT APPLICABLE means there is no V1 parity target; it does not mean V2 lacks the feature.

| Feature | V1 behavior found | V2 behavior found | Status | Priority / recommended action | Implemented this task? |
|---|---|---|---|---|---|
| Secure onboarding link | No external secure-link workflow found | One-time/session-bound secure onboarding flow with token hash and short-lived session cookie | REPLACED / IMPROVED | P1 — preserve token/session controls | No |
| External access | No V1 external onboarding portal found | External user submits through scoped server endpoints without a TTTracker login | REPLACED / IMPROVED | P0 — keep external scope field-bound | No |
| Draft/resume | No V1 external draft/resume flow found | Onboarding instance stores draft answers and resumes through secure session | REPLACED / IMPROVED | P1 — exercise expiry/revocation behavior in deployment | No |
| Personal/contact details | No V1 workflow found | Versioned templates define operational and private fields | REPLACED / IMPROVED | P1 — use classification and field policy | No |
| Emergency contact | No V1 external workflow found | Configurable private onboarding fields are supported | REPLACED / IMPROVED | P1 — preserve private-domain access | No |
| Uploads/front-back | No V1 external onboarding upload flow found | Configurable upload fields and front/back document shapes | REPLACED / IMPROVED | P0 — upload direct to SharePoint; no storage fallback | No |
| Training evidence | No V1 external onboarding Training request flow found | Training-request fields accept selected linked Training Types and evidence | REPLACED / IMPROVED | P0 — use one canonical shared evidence group | No |
| Person creation | No V1 onboarding-to-person flow found | Review/approval workflow can create/link the canonical person | REPLACED / IMPROVED | P0 — duplicate prevention and tenant ownership | No |
| Review/approve/reject/changes | No V1 external onboarding review workflow found | Admin review and changes workflow with audit/history | REPLACED / IMPROVED | P1 — continue workflow authorization tests | No |
| Notifications | No V1 onboarding notification path found | Secure-link and workflow notification paths exist | REPLACED / IMPROVED | P2 — validate provider delivery | No |
| SharePoint publication | No V1 onboarding SharePoint path found | External upload uses central document service; SharePoint IDs are stored in canonical document metadata | REPLACED / IMPROVED | P0 — hosted Microsoft provider still requires live verification | No |
| Document naming | No V1 onboarding name configuration found | Central resolver supplies onboarding filename templates | REPLACED / IMPROVED | P2 — keep same resolver as Training | No |
| Duplicate prevention | No V1 onboarding duplicate workflow found | Submission/session and canonical identity checks exist in onboarding workflow | REPLACED / IMPROVED | P1 — retain idempotent completion tests | No |
| Expiry calculation | No onboarding-linked Training workflow found | Each created Training Type calculates its own validity from canonical configuration | REPLACED / IMPROVED | P0 — retain per-type expiry tests | No |
| Review outcome visibility | No V1 onboarding outcome portal found | External workflow reports status/changes through scoped session | REPLACED / IMPROVED | P2 — none | No |

### Feature count

The three detailed matrices contain **85 inspected checklist items**: 50 Training, 20 People, and 15 onboarding. Current classifications are **39 PARITY**, **34 REPLACED / IMPROVED**, **8 PARTIAL**, **4 MISSING**, **0 NOT APPLICABLE**, and **0 BLOCKED**. The onboarding rows are REPLACED / IMPROVED because the inspected V1 has no secure onboarding target; they are not counted as V1 parity. Counts describe these checklist items only, not every possible feature in either product.

### First Aid + CPR linked-evidence result

V1’s Add Training path reads linked-evidence Training Type IDs from configuration, lets the submitter select the additional qualification, and creates Training submissions from the same course evidence without name-specific branching. V2 follows the same configurable shape: an organisation links arbitrary Training Type IDs, the upload UI shows the configured linked label, the submitter can opt in, and the canonical write function creates selected records with a common evidence-group ID. The central document service uploads one physical SharePoint item; document access resolves through that shared group.

Each Training Type calculates its own validity. The canonical write path loops the selected types and applies each type’s validity mode/interval. Superseding is resolved per type and its configured option/project scope. A linked type that is not selected is not created. No rule checks the literal names “First Aid” or “CPR”.

Before this task, V2 review acted on only the chosen Training row. This task adds one group-level review action: all review-required siblings currently in `pending_review` or `changes_required` receive the same approve/reject/request-changes decision in one database transaction. Per-type review policy still decides which records enter review. Approval runs the existing per-record evidence guard and superseding logic for each sibling; independent expiries and supersede candidates remain independent. One evidence preview can be used from the group. The linked review change is tested in the verification suite but has not been applied to a hosted database or exercised against a live Microsoft tenant.

### Storage, filename, folder, and mobile notes

- New Training evidence goes from the TTTracker server through `v2/lib/documents/service.ts` to SharePoint, then stores metadata/IDs in Supabase. It does not write new Training bytes to Supabase Storage.
- External onboarding uploads also use the central document service. `v2/lib/documents/legacy-storage.ts` and the legacy branch in `v2/lib/documents/onboarding.ts` exist for historical-source preview/migration; they are not the normal write path. The separate migration service reads historical storage objects and uploads to SharePoint before marking migration.
- V1 names are component-configurable per Training Type and include employee/payroll identifier, employee name, Training code, option, dates, project, and document side where configured. V2 central filename templates offer organisation/category/type precedence and friendly token mapping; migration of a V1 payroll identifier into V2’s canonical Employee Number must be checked for each data import.
- V1 employee folders use a payroll/person identifier plus name and have code-defined Training and superseded destinations. V2 can reproduce the useful structure with configurable Document Setup and stable folder IDs. V2 does not automatically move a superseded item to a fixed folder; it retains the item and historical metadata, avoiding a hard-coded archive path and protecting shared evidence.
- V1’s mobile app has Training register/detail, upload, and evidence preview screens. There is no separate V2 mobile app in this repository. V2’s authenticated server preview/upload APIs can support one later without exposing Microsoft credentials.

## Platform-wide V1 → V2 summary (report only)

| Module | V1 major capabilities verified from code inventory | V2 implemented | V2 partial | V2 missing / next gap |
|---|---|---|---|---|
| Daily Dockets | Project/tower docket create/edit, labour/plant/materials/progress, review, PDF and publishing APIs | Project-scoped docket list/detail/editor/save APIs and structured records | Full V1 workflow breadth, review configuration and central SharePoint PDF publication need end-to-end verification | Parity audit and central document adapter verification |
| Materials & Deliveries | Bundle/member checks, tower workflows, imports, deliveries, missing/excess, transfers, traceability | Project materials control, import, bundle/member checks, issues/events, movement, reservation, delivery and amendment APIs | Breadth is substantial, but V1 behavior and field-level workflows have not been demonstrated as equivalent | Module-specific parity tests and operational import/delivery validation |
| Defects / Rectification | Defect and revision/rectification lifecycle, evidence, notifications, docket links, mobile APIs | V2 defect workspace/API and canonical project records exist | Evidence preview/publication, review and complete lifecycle parity not verified | End-to-end Quality workflow and document adapter |
| Assets / Fleet | Plant/vehicle registers, services, fleet jobs, equipment inventories, risk assessments, compliance, documents | V2 Assets workspace and shared asset/document infrastructure exist | V1’s full plant/fleet/equipment/compliance breadth is not evidenced in current V2 routes | Prioritize asset register, compliance, service and fleet workflows |
| Prestarts | Site, plant and vehicle prestart workflows | V2 People Site Prestarts and project/site functionality are present | Plant/vehicle prestart parity and full mobile path are unverified | Extend to asset prestarts where enabled |
| Projects | Projects, towers, project setup, workpacks, progress and project settings | V2 project register, creation, configuration, towers and forecasting routes | V1 operational workpack/project breadth remains broader | Complete project-workflow mapping after People priority |
| Safety / Workpacks | Tower workpack with ITCs, lifts, permits, drawings, safety and documents | V2 project/workspace foundations exist | Full Safety/workpack operational paths are not evidenced as complete | Implement/audit workpack modules in a dedicated task |
| Documents | V1 SharePoint helpers and module-specific document workflows | V2 central SharePoint document service, metadata, preview, migration and provisioning foundations | Several module adapters and live Microsoft operations remain unverified; legacy historical storage is retained for migration | Finish module adapters and live provider verification |
| Commercial | Project commercial/financial pages and supporting APIs | V2 integration and project foundations exist | Full commercial register/claims/financial workflow parity is not established | Dedicated Commercial gap pass; preserve confidential-data boundaries |
| Notifications | V1 in-app, push, email, reviewer and operational notifications | V2 has notification infrastructure and configured channels | Outcome/channel parity and delivery reliability are not verified across all modules | Cross-module notification audit and delivery tests |
| Mobile | V1 mobile clients for Training, Dockets, Materials, Quality, Assets and Prestarts | No separate V2 mobile application in this repository | Authenticated API foundations exist for selected functions but no V2 mobile UI | Mobile client roadmap after core module parity |

This table is a gap backlog, not a claim that each listed V2 route is production-ready or live-provider-verified.

## Prioritized backlog

### P0

- Keep document-required Training from reaching review/approval without canonical SharePoint evidence; this is already enforced in V2 and must remain a release invariant.
- Apply and verify migration `20261013180000_training_linked_review_group.sql` in the intended hosted development environment before relying on grouped linked-qualification review there. It has not been applied here.
- Keep linked Training decisions atomic for the review-required members of one evidence group; this task implements the database wrapper and regression assertion.
- Preserve private/confidential People classification and per-record/project authorization in preview and review.

### P1

- Restore a V2 Training Planner and controlled bulk submission flow using canonical SharePoint upload, idempotency, superseding, and review paths.
- Build a V2 mobile People/Training client using authenticated TTTracker APIs; do not expose Graph credentials.
- Verify legacy employee/payroll identifiers map into the canonical V2 Employee Number token during migration.
- Complete end-to-end tests for hosted SharePoint onboarding and Training upload/review.
- Finish Assets/Prestarts and project workpack parity in later dedicated tasks.

### P2

- Verify reviewer and employee notifications by configured channel and preference.
- Add a safe, configured superseded-document archive/move action only when shared-document relationships are accounted for.
- Complete a standalone employment-document workflow if product scope requires it.
- Continue module-wide document adapter and historical Storage migration verification.

### P3

- Add small operational polish to Training history, outcome notices, and onboarding review feedback after the P0/P1 workflows are complete.

## V1 behaviors intentionally not carried forward

- Customer-specific Training Types, category names, folder names, SharePoint libraries, and filename defaults.
- Hard-coded role-name checks and customer-specific exceptions.
- Module-owned Graph upload/folder code and browser-visible Microsoft credentials.
- Supabase Storage as the normal file store for organisation evidence.
- A fixed superseded folder path as implicit behavior. V2 retains stable file identity and historical references; any physical move must be configured and relationship-safe.

## V2 improvements over V1

- Organisation-owned, multi-tenant People/Training configuration, options, validity, review policy, superseding scope, and linked qualifications.
- Dynamic capability checks and organisation/project isolation rather than role-name assumptions.
- One central SharePoint document service with canonical metadata and stable site/drive/item references.
- External onboarding with versioned templates and scoped access, where no V1 secure external workflow was found.
- Retryable Training upload drafts and server-side evidence validation before review/current status.
- Configurable filename inheritance and folder setup rather than customer-specific folder code.

## Verification and limitations

The linked-review change has a new database verification assertion in `supabase/verification/training_reliability.test.mjs`. That suite uses PGlite; in this checkout the PGlite package is unavailable, so the database integration test cannot execute until the dependency is installed. Run the repository’s V2 TypeScript/build/lint and available focused verification suites after this change. No hosted migration was applied, and no live Microsoft provider operation was performed as part of this audit. V1 was inspected only and remains unchanged.

## Training catalogue ownership correction

Categories group related Training Types. Options / Classes belong to exactly one Training Type and are scoped by organisation plus Training Type. Linked Qualifications connect one Training Type to another Training Type; they are distinct from Options / Classes. The additive ownership migration was verified with PGlite and applied to V2 Dev only. Ambiguous legacy options remain unassigned for administrator review.

# Training replacement and evidence reliability

## Diagnosis (13/10/2026)

Hosted V2 Dev had the new Training document API but had not received
`20261013120000_central_sharepoint_documents.sql`. Its document table lacked
the SharePoint/context/classification columns and its attach RPC was absent.
The newer CPR record was already pending, with no submission timestamp: creating
the structured record succeeded; the evidence/commit stage could not complete.
The UI discarded safe document-service messages through its generic error mapper.
Provider response logs were not available to establish whether Microsoft also
rejected an earlier upload; no successful live upload is claimed.

The historical JPEG used the old internal/evidence-group relationship shape.
Without the migration, the preview route's operational classification check
received an absent field and denied access. The migrated historical document has
a valid Training relationship; a rolled-back hosted actor check now authorizes it.
The former central preview also relied on a mutable destination read capability.
Training evidence now uses canonical Training relationships and `training.view`
or `training.approve`, never SharePoint configuration permission. Project-scoped
evidence additionally requires project membership. Private/Confidential files
are excluded.

V1 was inspected in `app/api/training/records/upload/route.ts`,
`lib/training/review-actions.ts` and `lib/training/sharepoint.ts`. It preserves
historical records, confirms replacements after successful publication/review,
and has physical archiving behaviour. Its customer paths and storage staging
were not copied.

## Configured supersession

V2 previously had no `allows_multiple_current` or `supersede_scope` fields.
`20261013150000_training_replacement_reliability.sql` adds them to the existing
Training Type catalogue and exposes them in Training Configuration. Defaults
retain the former type-wide matching behaviour.

- `type`: same organisation/person/type.
- `type_and_option`: additionally match the option/class, including null.
- `type_option_and_project`: additionally match the project, including null.
- `never` or multiple-current enabled: no automatic supersession.

`is_current`, `review_status` and `superseded_at` remain canonical. New fields
link previous/replacement records and scope project references with organisation
foreign keys. The former type-only unique index prevented multiple-current or
different-option/project approvals; a scope-aware locked trigger replaces it.

Submission records its current candidate without changing the old record.
Review-required replacements remain pending until approval. Rejection and changes
requested leave the old record active. Approval and no-review finalization share
one transactional finalizer, which requires actual SharePoint evidence and then
supersedes the current matching record. Missing/failed upload never reaches that
finalizer. Linked qualifications share one evidence group/file but calculate
expiry and receive approval/supersession independently.

Physical historical files stay where they are. There is no configured V2
superseded-file archive policy yet. Moving a certificate shared by another
current qualification would be unsafe. History is represented by its Training
record relationship; nothing is deleted/copied. The main register hides
superseded rows by default; person details and explicit status filters retain
history and Preview.

## Retry and feedback

The UI keeps a submission UUID and per-file UUID during a submission. Database
submission rows deduplicate record creation under the current actor/org and reject
payload changes. Direct uploads reuse a stable filename/item and compare bytes
on retry. Choosing a different file creates a new file identity. Approval retries
do not repeat supersession. Required details are frozen after record creation;
failed uploads retain the pending record and existing current qualification.
Browser refresh does not preserve selected local files: reopen/edit the pending
record to complete it rather than start another replacement.

Missing schema is detected before any Graph upload and reports a platform-update
message. Other safe central-service errors pass through the UI. Server logs
contain diagnostic categories only. Success feedback distinguishes review pending
from immediately confirmed replacements and shows the existing current record
before submission.

## V2 Dev deployment and verification

The document foundation and reliability migrations passed a rolled-back hosted dry-run and were applied to V2 Dev
only using the Supabase migration API:

- `central_sharepoint_documents`: hosted version `20261013030446`.
- `training_replacement_reliability`: hosted version `20261013030449`.

`20261013151000_training_pending_replacement_links.sql` also passed a rolled-back
dry-run and was applied to V2 Dev. It recovers the existing pending replacement's
candidate link only (hosted version `20261013031043`), retaining the old current/review state and all files.

Counts remained two Training records, one current record and one document.
No real qualification was approved/superseded, no file was uploaded/moved/deleted,
and no production migration ran. The existing internal source remains available
for authorized historical Preview; new evidence uploads are SharePoint-only.

Regression coverage includes exact CPR dates, required/no-review approval,
rejection, changes/resubmission, multiple-current, options/projects, shared
certificates, deduplication, reviewer-only Preview, historical relationships,
JPEG/PNG/PDF, cross-organisation and classification denial. Browser/live SharePoint
upload remains to be verified after loading the updated V2 application.

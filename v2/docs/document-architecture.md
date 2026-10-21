# V2 organisation document architecture

Organisation documents are stored in SharePoint. Supabase stores structured
TTTracker data and SharePoint references. New modules must use the central
document service.

## Boundaries

- Operational People, Training, Projects, Daily Dockets, Materials, Quality,
  Assets and Prestart records remain in PostgreSQL. SharePoint is not the
  business database and is never scanned to calculate operational dashboards.
- File bytes go directly from a validated server request or in-memory generator
  to the organisation's configured SharePoint destination. There is no normal
  Supabase Storage upload, staging bucket, fallback or persistent PDF buffer.
- Reviews, evidence groups, independent expiry calculations and audit history
  remain in PostgreSQL. Review does not copy a file into another provider.
- The normal Microsoft application remains Sites.Selected Application. The
  separate interactive setup identity remains delegated and disposable.
- Confidential/KMS collection and publication gates are unchanged. Normal
  SharePoint connection never grants confidential access or decrypts envelopes.

## Central service

`v2/lib/documents/service.ts` provides:

- `resolveStoredDocumentSetup`: entitlement, canonical routing precedence,
  destination profile and classification checks without a live Graph call.
- `resolveDocumentSetup`: adds checked Microsoft connection, organisation-owned
  site/location/library verification, context-safe folder/filename resolution.
- `uploadDocument`: signature/size/type validation, idempotent folder ensure,
  direct provider upload, stable metadata persistence and safe audit.
- `getDocumentMetadata` and `downloadDocument`: organisation-scoped lookup,
  access profile, connection, site/library consistency and provider fetch.

Server adapters must authorise the canonical entity before invoking the service
and supply only server-derived token values. Browser site/library/item IDs,
folder strings, permissions and external-authority flags are not accepted.

File size is limited to 10 MB by validation and the existing provider. Training
and Onboarding retain their PDF/JPEG/PNG restrictions. Project documents also
support WEBP, text/CSV and Office ZIP containers. No HEIC workflow existed in V2;
HEIC conversion is not newly claimed.

New uploads use immutable revision filenames: the configured filename base plus
a document UUID suffix. This prevents silent evidence replacement and supports
retry identification. The service currently accepts the `version` policy only.
Sequence/replace settings are retained as configuration but publication fails
with an explicit policy message rather than silently overwrite evidence. Native
version retrieval, replacement, archive/supersede actions and metadata refresh
remain follow-up adapters; there is no general destructive delete endpoint.

## Canonical metadata and relationships

The additive migration is:

`supabase/migrations/20261013120000_central_sharepoint_documents.sql`

It extends the existing `v2_people_documents` identity instead of creating a
second document table. Its historical name is retained for compatibility; the
central service uses it for organisation documents. Person/created-by become
nullable for Project and externally session-authorised Onboarding uploads.

Added fields describe context/entity, project/asset references, destination,
setup rule, classification, stable SharePoint site/library/item/parent IDs,
etag, web address, publication/update time, source and superseding references.
Existing name/MIME/size, evidence-group, actor/time, folder/filename snapshot and
sync-status columns are reused. New `storage_key` values are compatibility
references only; they do not point to a new Supabase object.

Composite foreign keys constrain destination, rule, project and document
relationships to the same organisation. Browser table access is revoked;
session-checked RPCs and server adapters supply metadata. Existing RLS remains.

An existing successful provider job is backfilled into the same document row
with its recorded SharePoint references. No file contents are copied by SQL.

Training attachment commit is an authenticated RPC that rechecks training.edit,
actor, organisation, person, record editability and uploaded file metadata. One
evidence group supports First Aid and CPR with one physical item; each training
type continues to calculate its own expiry. Onboarding completion inherits the
existing file reference when it creates Training evidence relationships. Its
`source_document_id` points back to the same physical certificate.

## Upload and review workflows

Training: choose evidence, authorise editable training record/person, resolve
Training Document Setup, create/reuse folders, upload to SharePoint, record the
file, attach it to the canonical evidence group, refresh the existing register.

The old `review_storage=after_approval` staging directive is retained in historical
configuration but is not a directive to stage new bytes. New files are in
SharePoint while awaiting TTTracker review. Native SharePoint permissions still
apply to direct Microsoft browsing; TTTracker cannot override those permissions.

If SharePoint fails, the request fails, no successful file record is created and
there is no storage fallback. Structured training/onboarding drafts remain safe.
If metadata persistence fails after a new upload, cleanup targets only that new
item with its etag. Cleanup failures are audited for support. An external API and
database transaction cannot be globally atomic; a linkage failure after upload
can leave a retained file/metadata reference requiring reconciliation. It is not
reported as a successful attachment.

Review actions continue through the existing training RPC: approve, request
changes and reject modify review metadata, not the SharePoint item. Preview and
review capabilities remain separate; reviewers need document-view permission
as well as their review capability.

External Onboarding: the HttpOnly session and configured field are validated by
the existing RPC before upload. Confidential fields remain blocked. No-person
applicants must use an Onboarding rule whose required tokens are available;
TTTracker does not invent employee numbers/names. Private fields require a
matching private destination profile. Tenant reviewers must also satisfy that
profile's read capability; external sessions never become tenant RBAC actors.

People's legacy Document Structure configuration is retained. New uploads are
resolved by SharePoint Document Setup, not an Internal provider selection. Do
not configure a second operational file path in a module.

## Preview

`GET /api/documents/{documentId}?organisation={id}&mode=preview` is the canonical
authenticated delivery API for Training and Project documents. `mode=download`
uses an attachment disposition. It checks workspace membership, the entity's
existing access helper, classification, provider entitlement/profile and recorded
site/library relationship. Knowing a document or Microsoft item ID grants no
access. Platform Admin status is not a tenant-file permission.

The server fetches SharePoint bytes without forwarding Graph credentials. PDF,
PNG/JPEG/WEBP and text/CSV receive appropriate MIME and inline disposition,
no-store/nosniff/referrer protection and a restrictive CSP. Office files download
for opening in their document application; native Office web preview is not
implemented. Permanent preauthenticated URLs are not stored or exposed.

The shared `DocumentPreview` component displays PDFs/text in a drawer, images
with full-size opening, and unsupported inline types with download. Browser
object URLs are created from the authorised response and revoked on close.
Mobile can use the same authenticated API without Microsoft sign-in or a Storage
URL. Client-party access remains closed until a deliberate document-sharing
adapter is implemented.

Onboarding previews use the existing admin/external field-access RPC on every
request, then the same central download and header helpers. This preserves
private-domain and short-lived external-session boundaries.

## Folder automation

Existing People/Project events and the SharePoint worker remain intact. They
reuse configured locations/rules and stable folder links. Uploads ensure missing
folders synchronously through the same provider. Rename keeps the folder item
ID; documents continue to preview by their item IDs rather than a stale path.
Configured child folders and retry/idempotency remain in the existing engine.
No hard-coded employee/project roots or customer libraries are introduced.

## Generated publications and scheduler

`v2/lib/documents/publication.ts` reuses `v2_document_provider_jobs` and its atomic
claim/lease function. New source-kind/context/entity/revision/actor fields carry
only source metadata. Jobs never contain generated file bytes.

An entity adapter first commits the operational record, then calls
`queueGeneratedDocument`. A server-owned generator reauthorises the actor and
loads the exact intended canonical revision on execution. `processPublicationJob`
revalidates organisation/entity/context/destination and directly uploads the
regenerated buffer using a stable document/job UUID. Repeated execution returns
the same recorded item. Failure clears the lease and sets bounded exponential
backoff, respecting provider Retry-After.

Before generation, the worker rechecks the recorded actor's current membership,
entity permission and destination capability through a service-only database
helper. It rejects a renderer's revision mismatch. Generated entity authorization
currently supports Projects only and denies other contexts until their explicit
entity adapters are added; no live PDF renderer is registered yet.

The authenticated `/api/integrations/sharepoint/worker` now also processes one
publication/migration job per invocation. Existing CRON_SECRET authentication,
folder processing and Vercel scheduling are retained. Local execution is:

```powershell
cd v2
npm run worker:sharepoint
```

The existing worker command requires `NEXT_PUBLIC_APP_URL` and a server-only
`CRON_SECRET` of at least 32 bytes.
No generated module renderer is registered yet: missing renderers fail explicitly
as DOCUMENT_GENERATOR_NOT_AVAILABLE. Register only implemented canonical
revision renderers, never a browser-supplied callback. Do not claim Daily Docket,
Defect or Prestart PDF publication is operational until those adapters exist.

## Historical Storage inventory and migration

Read-only hosted V2 Dev inventory on 13/10/2026:

| Bucket | Objects | References / purpose |
| --- | ---: | --- |
| v2-people-evidence | 1 | One internal Training document reference; zero Onboarding references |
| v2-people-confidential | 0 | Existing protected encrypted-envelope infrastructure |

One active Training Document Setup rule exists. No historical file was migrated
or deleted, and no hosted migration was applied as part of this implementation.
Apply the additive migration to V2 Dev and validate before deploying the cutover
routes; do not deploy the new routes against the old schema.

SharePoint Health includes a collapsed Historical Document Migration tool for
integration managers with training.view/training.edit. Preview reads at most
50 organisation-owned references and a total count; it makes no Graph writes.
Select up to 10 files for a controlled leased worker queue. Eligibility and
applicability are checked again for each actual migration, not assumed from the
preview. The worker re-evaluates the recorded actor using canonical RBAC; explicit
denies, removed membership and suspended entitlement stop it.

Migration reads the authorised original, resolves current Document Setup,
uploads, verifies returned stable item metadata and updates the same canonical
document identity. Original storage key, creator, evidence side/group, review and
source bytes are retained. Retry does not duplicate a successfully linked file.
Source deletion is not implemented or enabled. Future cleanup needs explicit
approval and independent verification. Historical Onboarding references retain
read compatibility, but a bulk Onboarding migration adapter is not implemented.

All remaining Supabase Storage calls are deliberate:

| File | Calls | Why retained |
| --- | --- | --- |
| lib/documents/legacy-storage.ts | download v2-people-evidence | Authorised historical preview/migration only; no upload/delete |
| lib/people/confidential.ts | encrypted upload, compensating remove, short-lived signed read | Existing KMS/envelope-gated Confidential exception; not normal organisation evidence; no gate weakened |

Raw Graph file calls remain only in `lib/integrations/sharepoint.ts` (the central
least-privilege provider). `sharepoint-setup.ts` remains the separate interactive
site-permission bootstrap. Integration health/root/provisioning routes reuse that
provider as infrastructure. There are no module-specific Graph upload endpoints.

## Module readiness

| Area | Implementation after this cutover |
| --- | --- |
| Training / People training evidence | Direct upload, shared evidence group, review and universal preview |
| External Onboarding | Direct upload and field/session-authorised preview; no internal staging |
| Projects | Central upload/list/preview on the host project dashboard; no client-party exposure |
| Employee/project folders | Existing configured automation/rename/lease/retry preserved |
| Daily Dockets | Structured data unchanged; no V2 PDF engine existed; generator/approval event adapter still required |
| Materials | Structured operational module unchanged; no existing V2 retained-file workflow; attachment/report adapter still required |
| Quality / Defects / Rectifications | No V2 file/PDF workflow found; canonical evidence/report adapters still required; DEF/REC business namespaces untouched |
| Assets | Existing page is planned; no canonical V2 file workflow to migrate |
| Site/Asset Prestarts | Structured People Site Prestarts retained; PDF/attachment adapter still required |
| Safety / Workpacks / Commercial | No implemented V2 retained-file adapter; Confidential publication stays blocked |

## Developer guard and verification

`supabase/verification/document_service.test.mjs` rejects module-level Storage
calls and raw Graph endpoints outside the central provider/bootstrap. The two
Storage exceptions above are explicit and small. Extend the guard deliberately
for approved infrastructure only, never to accommodate a module fallback.

Tests cover direct upload, signature validation, stable metadata, failure without
fallback, shared evidence, preview MIME/ownership/RBAC, external Onboarding,
Confidential rejection, idempotent folders/publications and worker retry. The
PostgreSQL migration tests cover reference backfill, tenant FKs, evidence links,
field classification, inherited references and worker identity restoration.
Existing review/expiry, People, project, Materials, entitlement, Microsoft setup,
folder rename and tenant-isolation suites remain required.

V1 was inspected for folder-ID reuse/rename, configurable publishing lessons and
preview behaviour only. Its customer-specific folders, libraries and filename
prefixes were not copied. V1 is unchanged.


## Person identity photos

Person owns the current profile-photo reference; canonical documents and SharePoint retain image metadata/file history. Linked User avatars, onboarding finalisation and future Project Onboarding/ID cards reuse that reference. Profile photos use the configurable `profile_photos` Document Setup context and authenticated provider thumbnails. See [Person profile photos](person-profile-photos.md).

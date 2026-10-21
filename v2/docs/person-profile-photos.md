# Canonical Person profile photos

## Ownership and storage

Profile Photo belongs to the canonical **Person**, not an auth User. A Person needs no TTTracker login. `v2_people.current_profile_photo_id` is nullable and references a same-organisation canonical `v2_people_documents` row. One scalar reference gives zero or one current image. Previous documents remain retained; replacements record `superseded_by_document_id`. No existing Person receives a fabricated image.

Files are uploaded to SharePoint through `uploadDocument` in the central document service. Supabase stores structured Person data, the current reference, source, canonical file metadata, SharePoint site/library/item IDs, configured filename/path snapshots and audits. Normal image bytes never use Supabase Storage. Person association is explicit; it is never inferred from a path. Stable item IDs remain authoritative after name, employee-number or folder changes.

There is no facial recognition, face analysis, biometric matching, identity verification, age estimation or embedding generation.

## Configuration

People Documents has a Profile Photos / ID Photos row linking to the existing SharePoint Document Setup editor (`profile_photos` context). Destination, folder/subfolder and filename are organisation-configurable and relationship-aware. Suggested setup is `{employee_number} - {person_display_name}/Profile Photos`, with filename `{employee_number} - {person_display_name} - {document_type}`. These are editable suggestions, not customer paths or mandatory naming rules.

Available photo tokens include Person ID, Employee Number, Employee Name, first/last names, Upload Date, Document Type, year and month. No Training-only tokens or front/back semantics are used. Existing folder provisioning/rename policies recognise the photo context.

JPEG/JPG and PNG are supported, up to the central 10 MB limit. V2 has no safe central HEIC conversion and does not advertise HEIC. Original supported file bytes are retained in SharePoint. Browser previews respect image orientation; SharePoint generates display thumbnails. A crop editor is not included; display boxes centre-crop using `object-fit: cover`. Live phone/EXIF verification remains outstanding.

## Permissions and tenant boundary

Dynamic permission catalogue entries:

- `people.profile_photo.view`: view operational Person headshots.
- `people.profile_photo.manage`: upload, change or remove current relationships.
- `people.profile_photo.self_manage`: opt-in self service, limited to `v2_people.auth_user_id = auth.uid()`.

Grant view plus manage to whichever organisation roles require them, including Safety or People management roles. No role names are tested and no new roles receive implicit grants. Existing explicit denies are preserved. Self service is disabled unless explicitly granted. Photo management does not require SharePoint configuration permissions when standard document-access settings are used; custom destination access rules still apply.

Session RPCs require active organisation membership, the People module/feature and the requested capability. Platform Admin and client/project-party context do not bypass tenant access. External/client photo access is not introduced. Photo metadata tables do not receive direct browser grants. Current-photo view and full preview use the same Person permission boundary; central document access-profile checks also apply.

## Canonical APIs and UI

`resolvePersonPhoto(organisationId, personId?)` resolves a Person current photo. Omitting Person ID resolves the signed-in User through the canonical optional `auth_user_id` link. It never assumes User ID equals Person ID. This server resolver and canonical document ID are available for future Project Onboarding and ID-card services; no duplicate photo storage or ID-card generator was added.

`GET /api/people/profile-photo` returns current metadata. `person` selects a Person; omission selects the linked Person. `image=1` returns an authenticated display thumbnail. `POST` accepts origin-checked multipart upload, relationship removal, or publication retry. Upload/manage operations use session RPC scope checks before provider writes and again at assignment. A failed provider upload, metadata save or assignment leaves the existing current relationship intact.

The reusable `PersonAvatar` renders instant initials, a lazy small image, accessible alt text and initials again after an image failure. The Employee Register receives current-photo IDs in its existing batched Person projection, and displays 36 px avatars beside names. It does not make one metadata lookup per row while rendering. Person Overview has a compact 96 px headshot with Upload/Change, authenticated View Photo and retention-safe Remove controls. The existing Account menu shows a 28 px circular avatar and retains its existing interaction. Account self service reuses the same panel, subject to capabilities.

Images use framework `Image` with `unoptimized` so browser requests keep session cookies rather than passing through an unauthenticated image optimiser. Display URLs include the canonical document version ID. The proxy requests SharePoint's small thumbnail, never the full original for register/header display. Responses carry the provider image MIME, private five-minute caching, `Vary: Cookie`, `nosniff` and an ETag based on organisation/document/provider version. Every network request rechecks session/Person access before returning 304; a 304 performs no Graph request. Permission changes can leave a previously authorised browser image cached for at most five minutes. Anonymous provider URLs, Graph URLs and service tokens are never returned.

Full View Photo uses the existing authenticated central document preview route. Originals are fetched only for explicit full preview or necessary cross-library publication. Provider thumbnail failures render initials; they do not fall back to downloading full originals.

## Onboarding

The generic onboarding field builder offers **Profile Photo / Headshot**. Required/optional uses the existing required toggle; Off means the field is absent. Existing saved templates are unchanged. At most one photo field is permitted per template; it is an operational identity asset, without text mapping or conditional ambiguity. A licence/passport/training upload never implicitly becomes a headshot.

External onboarding offers Take Photo (secure camera file input), Choose/Change Photo, a local preview, Use Photo, Remove and uploaded-photo viewing. Helper text explains employee identification/project onboarding use and is editable through the template's existing help property. Guidance asks for a recent, clear head-and-shoulders image with good lighting and no ID screenshots. Actual camera behaviour depends on the device/browser; HEIC-only capture is not silently accepted.

Uploads use the existing session/field-authorised onboarding SharePoint document flow. Required-photo validation checks the uploaded relationship, not an answer string. Selecting another uploaded headshot replaces only the draft relationship; removing it retains the underlying canonical file. Optional absence does not block submission.

For onboarding before a Person exists, canonical onboarding setup now offers `onboarding_instance_id` and `recipient_name`. New suggested onboarding folders use `Onboarding/{onboarding_instance_id}` and do not require an employee number. Existing configured rules are not changed: if they require missing employee details, administrators must choose suitable staging tokens; the system does not fabricate employee numbers or names.

On completion, the existing workflow creates/updates the Person. A trigger marks only the explicitly selected photo document for durable publication. The server finaliser resolves the actual Person's configured photo destination, moves/renames the same SharePoint item within a library, then atomically assigns Current. Across libraries it performs an idempotent central upload with an explicit `source_document_id`, retaining the onboarding source as provenance. No second manual upload is required.

The protected existing SharePoint worker retries pending publications with compare-and-set claiming and a five-minute retry delay. Admin completion and no-review external completion also attempt immediate publication. Worker proof validates the completed instance, selected photo field, canonical Person, active tenant membership/module and source relationship. Completion audit identifies the actual completion actor. Failures keep pending metadata and the previous current image; completed onboarding is not falsely reported as a failed submission. The profile panel shows pending status and a retry action. Delayed older onboarding photos cannot displace a newer managed headshot. Required document setup and a running existing SharePoint worker are deployment prerequisites.

## Audit and retention

People audit events cover upload/current assignment, change, relationship removal and assignment from onboarding, including source and previous document IDs. Central document upload/preview audit remains in use. Image bytes are never logged. Removal clears the current reference; it does not physically delete SharePoint files. Historical references and cross-library source provenance remain retained. Future reuse workflows should emit their own reuse events when implemented.

## Migration and verification

Migration: `supabase/migrations/20261016100000_person_profile_photos.sql`. Additive, nullable current reference; extends canonical document metadata and dynamic permissions; patches existing field validation/projections and folder triggers; reloads PostgREST. PGlite applies it twice to verify idempotence, with canonical People/RBAC/onboarding fixtures.

Remote dry run was attempted. Supabase refused because remote migration versions are missing locally (`DbPushMissingLocalError`). No V2 Dev or production migration was applied and migration history was not repaired. Deployment remains blocked until migration histories are reconciled against the intended V2 Dev database.

Authenticated browser verification was attempted: the harness reported no browsers and `Browser is not available: iab`. No screenshots or live SharePoint/phone upload claim is made. Automated provider tests use synthetic Graph responses and canonical database tests use PGlite.

## Files changed for this feature

New implementation:

- `v2/lib/people/profile-photo.ts`
- `v2/app/api/people/profile-photo/route.ts`
- `v2/components/people/person-avatar.tsx`
- `v2/components/people/person-photo-panel.tsx`
- `supabase/migrations/20261016100000_person_profile_photos.sql`
- `supabase/verification/person_profile_photos.test.mjs`
- `supabase/verification/person_profile_photo_http.test.mjs`

Existing modules extended (some contained pre-existing uncommitted work):

- `v2/lib/documents/{service,onboarding}.ts`
- `v2/app/api/documents/[documentId]/route.ts`
- `v2/lib/integrations/{resolver,sharepoint,sharepoint-ux,document-setup-access}.ts`
- `v2/components/integrations/{document-setup-assistant,sharepoint-workspace}.tsx`
- `v2/app/api/integrations/sharepoint/{workspace,worker}/route.ts`
- `v2/lib/people/onboarding-types.ts`
- `v2/components/people/{people-client,people-documents-hub,onboarding-admin,onboarding-fields,onboarding-external}.tsx`
- `v2/app/api/people/onboarding/route.ts`
- `v2/app/api/onboarding/security/workflow/route.ts`
- `v2/components/workspace/app-shell.tsx`
- `v2/app/account/page.tsx`
- `supabase/verification/{document_service,people_ui,people_onboarding,sharepoint_worker,sharepoint_setup}.test.mjs`
- This document and the People operational/document architecture documentation links.

V1 was not modified. No commit or push was performed.


## Delivery report

| # | Requested area | Result |
|---|---|---|
| 1 | Canonical architecture | Nullable current-photo reference on Person; canonical documents retain history. |
| 2 | User / Person avatar | Canonical optional `auth_user_id` link; authorised linked users reuse Person photo; otherwise initials. |
| 3 | Physical storage | SharePoint through central upload/document service. |
| 4 | Metadata | Supabase Person/document records, source, audit and stable SharePoint references; no normal image files. |
| 5 | Person destination | Configurable relationship-aware `profile_photos` document destination/folder resolver. |
| 6 | Filename | Canonical configurable resolver; Employee Number/Name, Document Type and Upload Date tokens. |
| 7 | Template field | Generic Profile Photo / Headshot type, required or optional; absent means off. Existing templates unchanged. |
| 8 | External upload | Session-authorised SharePoint flow; camera/library input, preview/change/remove and no second manual upload. |
| 9 | Admin upload | Person Overview Upload/Change actions; authenticated View and retention-safe Remove. |
| 10 | Safety permissions | Dynamic view/manage catalogue; synthetic role and explicit-deny tests pass. No role-name checks. |
| 11 | Self service | Explicit `self_manage` plus view capability; canonical linked Person only. |
| 12 | History | Previous canonical documents retained; supersession/current-reference audit. |
| 13 | Failed replacement | Previous photo remains current until new upload/metadata/assignment succeeds. |
| 14 | Person Overview | Compact headshot, employee number/position and controls alongside existing status/details. |
| 15 | Employee Register | Compact 36 px headshot or initials beside name; current IDs in existing batched projection. |
| 16 | Account | Existing Account interaction with 28 px circular photo or initials; self-service link when permitted. |
| 17 | People Documents | Profile Photos configuration/status/destination/naming row links to canonical setup. |
| 18 | Thumbnails/cache | Provider small-thumbnail proxy, private five-minute cache, cookie variation, ETag/304; no full originals in avatar requests. |
| 19 | Project Onboarding | Reusable server resolver and Person/document IDs; full future workflow intentionally not built. |
| 20 | ID cards | Same canonical photo may be combined with operational Person name/number/role/organisation; no generator added. |
| 21 | Files | Complete feature file list above; prior unrelated working-tree changes preserved. |
| 22 | Migration | Additive root migration `20261016100000_person_profile_photos.sql`; applied twice in PGlite. |
| 23 | V2 Dev result | Not applied: remote dry run blocked by `DbPushMissingLocalError`; no migration-history repair or production changes. |
| 24 | Tests | 467 passed, 0 failed across People/Onboarding/Documents/SharePoint/Training/Account/Workspace/RBAC suites. Provider tests are synthetic. |
| 25 | TypeScript | `npx tsc --noEmit --incremental false` passed against V2 project, including final standalone check. |
| 26 | Lint | Targeted ESLint passed with zero errors/warnings. |
| 27 | Build | Final V2 production build passed; existing multiple-lockfile root warning remains. `git diff --check` passed. |
| 28 | Browser | Attempted but unavailable: no browsers; IAB unavailable. Live Graph uploads, screenshots and phone capture/EXIF are unverified. |

Microsoft's [thumbnail endpoint documentation](https://learn.microsoft.com/en-us/graph/api/driveitem-list-thumbnails?view=graph-rest-1.0) describes the provider display-size API used by the proxy.

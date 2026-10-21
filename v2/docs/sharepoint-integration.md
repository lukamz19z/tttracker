# SharePoint integration

# Organisation document cutover - 13/10/2026

Organisation files now publish directly through `v2/lib/documents/service.ts` to
SharePoint. Supabase remains the structured-data, workflow and file-reference
database. New Training, Onboarding and Project uploads do not stage in Supabase
Storage. Historical staging descriptions below describe the previous adapter;
they are superseded by [Document Architecture](document-architecture.md).

Deploy `20261013120000_central_sharepoint_documents.sql` before deploying the
cutover APIs. It extends existing canonical metadata, backfills successful old
provider references, preserves evidence groups and adds publication source fields
to the existing leased queue. It was applied to hosted V2 Dev during the
[Training reliability pass](training-reliability.md), after a rolled-back dry-run.
No source objects have been removed.

The existing authenticated SharePoint worker also processes controlled historical
Training migration jobs. Health > Historical Document Migration previews up to
50 references; select at most 10 per queue request. Source files remain retained.
Worker credentials remain `CRON_SECRET` and `NEXT_PUBLIC_APP_URL`; locally run
`cd v2` then `npm run worker:sharepoint` with V2 running at its configured origin.

Generated-document queue/lease/regeneration plumbing is ready, but no V2 module
PDF renderer is registered. Daily Docket/Defect/Prestart PDF publication is not
claimed live. See the architecture module-readiness table and remaining adapters.

## Native Microsoft administrator authorisation: two identities

### Callback diagnostics and OpenID profile requirement

The setup flow requests `openid profile` plus Graph `Sites.FullControl.All`
Delegated. `profile` is required because the callback requires Microsoft's immutable
user `oid` claim. The earlier flow requested only `openid`, so a correctly signed
token could fail the required-identity check despite using the correct tenant.
The `oid` requirement is retained; signature, issuer, audience, tenant, nonce,
session binding and PKCE checks are not bypassed.

Per-site results now include **Microsoft Setup Diagnostics**: safe GUIDs and
allowlisted status values only. Separate errors distinguish token/claim failures,
missing delegated scope, missing consent/enterprise app, code exchange/PKCE,
site access denial and grant-capability denial. Access tokens are opaque to the
client: optional tenant/client references are diagnostic only, and Graph remains
the token authority. No Directory.Read.All or additional permissions are requested
to inspect enterprise applications or user roles; token issuance is identified
as the evidence for application presence, and API outcomes as capability evidence.

An earlier saved generic result cannot reveal returned claims or prove which of
its combined checks failed. A fresh attempt with updated code is required for
exact live evidence. **Not checked** means execution stopped before that step.
A Graph 403 does not independently prove lack of an administrator role or site
membership; the UI describes the denied operation and avoids claiming a directory
role/membership lookup was performed. Raw codes, tokens, claims and Microsoft
response bodies are never persisted in diagnostics or audit.

| Platform application | Graph authority | Purpose |
| --- | --- | --- |
| TTTracker runtime | `Sites.Selected` **Application** | Documents, libraries, folders and workers on explicitly granted sites |
| TTTracker SharePoint Setup | `Sites.FullControl.All` **Delegated** | Interactive customer administrator session to grant selected sites |

These must be different application/client IDs. The setup identity has no
FullControl Application permission, client-credentials workflow or worker access.
Platform Administration → Integrations → Microsoft shows separate readiness.
Platform Admin status does not confer tenant RBAC or Microsoft administrator rights.

### Operator checklist for the second Entra application

1. Register **TTTracker SharePoint Setup**: accounts in any organisational directory
   (multi-tenant), separately from TTTracker's runtime app.
2. Register the **Web** redirect URI on the actual `NEXT_PUBLIC_APP_URL`:
   `https://<tttracker-host>/api/integrations/sharepoint/site-authorisation/callback`.
   Development: `http://localhost:3001/api/integrations/sharepoint/site-authorisation/callback`.
3. Add Microsoft Graph **Delegated** `Sites.FullControl.All`, with admin consent,
   and OpenID sign-in (`openid profile`). Never add the Application version. No `offline_access` or
   unrelated Graph scopes are requested.
4. Configure `TTTRACKER_MICROSOFT_SETUP_CLIENT_ID` and
   `TTTRACKER_MICROSOFT_SETUP_CLIENT_SECRET` through secure server environment
   management. Existing `TTTRACKER_MICROSOFT_CLIENT_ID` / `_CLIENT_SECRET` remain
   runtime-only. No secrets are stored in ordinary configuration tables or returned
   to the UI. Restart/redeploy, then check the separate setup-app readiness panel.
5. Apply root migration `20261012160000_sharepoint_interactive_site_authorisation.sql`.
   It adds safe payload/results to existing service-only OAuth state, plus a runtime
   permission ID/site Authorised state, preserving RLS and atomic state consumption.
   This migration has been dry-run and applied to **V2 Dev**, not production.

### Customer workflow

Connect Microsoft 365 once, add site labels/HTTPS URLs, select up to **20** sites,
then choose **Authorise Selected Sites**. A SharePoint Administrator or higher
**who is also a member of every selected site** signs in through the setup app.
If customer policy requires Entra approval, approve the setup app and retry.
The elevated delegated permission is disclosed before sign-in. Graph enforces
Microsoft administrator privileges; TTTracker organisation permissions are separate.

The callback validates one-time state, actor/organisation/integration binding,
verified Supabase session identity,
expiry, unchanged selected site URLs, PKCE, and signed OIDC issuer/audience/tenant/
nonce. The authority is the already-connected customer tenant, not a platform
tenant. Sites are resolved server-side; browser Graph IDs are not trusted.
It lists permissions, reuses existing sufficient runtime grants, or posts
`roles: ["write"]` to `POST /sites/{siteId}/permissions` for the **runtime** app.
409 conflicts are re-read. Successful sites are not rolled back if another fails.

Only verification through the **normal Sites.Selected runtime token** marks a site
Verified. Authorised means the grant exists but runtime verification/propagation
is pending; use Verify Selected Sites. Safe per-site results offer Retry Failed.
Libraries, locations and routing continue through the runtime identity only.

The delegated access token exists only in callback memory and is discarded on
completion/error. No access/refresh token or OAuth code is persisted, audited,
logged, returned to UI or stored in cookies. No refresh token is requested.
The ten-minute HttpOnly callback cookie holds only OAuth state/PKCE verifier/nonce
and is cleared after callback. Safe results are actor/org-scoped and shown for one
hour. Bounded requests/retries respect short Retry-After delays; longer cooldowns
and slow batches require retry, preserving completed grants.

### Advanced / Manual Setup and revocation limitation

PowerShell is a fallback under **Advanced / Manual Setup**, for security-policy or
support cases. Microsoft documents delegated **create/list**, but site permission
**update/delete** requires Application FullControl. Native read-grant upgrades and
revocation are therefore explicitly unavailable; TTTracker refuses escalation.
A customer Microsoft administrator must upgrade/revoke the known permission ID
using approved administrator tooling, then verify the site in TTTracker. Existing
files/history remain; only affected sites/locations lose runtime access.

References: [create](https://learn.microsoft.com/en-us/graph/api/site-post-permissions?view=graph-rest-1.0),
[list](https://learn.microsoft.com/en-us/graph/api/site-list-permissions?view=graph-rest-1.0),
[update](https://learn.microsoft.com/en-us/graph/api/site-update-permission?view=graph-rest-1.0),
[delete](https://learn.microsoft.com/en-us/graph/api/site-delete-permission?view=graph-rest-1.0).

Controlled OAuth/provider tests verify the flow. **Live native grants still require
the separate setup-app registration and credentials**; no live grant is claimed.

Runtime document operations use one multi-tenant Entra application, with each TTTracker
organisation's Microsoft tenant and explicitly granted sites. No customer tenant,
library or folder is built into the application.

## Microsoft setup

1. Register an Entra application supporting accounts in any organisational directory.
2. Add **Microsoft Graph application Sites.Selected only**. Do not add
   Sites.Read.All, Sites.ReadWrite.All or Sites.FullControl.All to runtime.
3. Register the exact redirect URI (HTTPS for hosted environments):
   `https://<tttracker-host>/api/integrations/sharepoint/callback`.
4. Configure the application credential in server deployment secret management:
   `TTTRACKER_MICROSOFT_CLIENT_ID`, `TTTRACKER_MICROSOFT_CLIENT_SECRET`,
   `NEXT_PUBLIC_APP_URL`. Never expose the credential through NEXT_PUBLIC variables.
   Use separate development/production applications or tightly isolated deployment
   secrets. Rotate the credential before expiry. This implementation uses client
   credentials; certificate authentication can replace it later without changing
   organisation metadata.
5. Customer Microsoft administrator chooses **Connect Microsoft 365** and grants
   admin consent. Microsoft determines the tenant; an entered directory ID is not
   proof of connection. The callback validates organisation/user-bound state and
   verifies an application token with only `Sites.Selected` before recording
   `microsoft_tenant_verified_at`. This does not verify a SharePoint site.
6. Separately, choose **Authorise Selected Sites**. A Microsoft administrator signs
   in through the separate TTTracker SharePoint Setup application, which grants
   the runtime app `write` on the intended sites through
   `POST /sites/<site-id>/permissions`. The runtime application cannot self-grant.
   Its delegated setup token is discarded after the interactive operation.
   Manual PowerShell remains an Advanced / Manual Setup fallback.
7. Administrator enters the site's HTTPS URL, verifies permission and selects a
   drive/library. URL resolution is scoped to the supplied site; no tenant-wide
   search/discovery or additional runtime permission is requested. If Microsoft
   refuses URL resolution with the selected grant, fix the grant rather than
   assigning a broad runtime permission.

## Operator connection checklist

1. Confirm the multi-tenant Entra application and `Sites.Selected` application permission.
2. Register `/api/integrations/sharepoint/callback` on the exact `NEXT_PUBLIC_APP_URL`.
   For local development, use `http://localhost:3001/api/integrations/sharepoint/callback`;
   HTTP is accepted only for a loopback host in a non-production, non-Vercel runtime.
3. Supply `TTTRACKER_MICROSOFT_CLIENT_ID` and `TTTRACKER_MICROSOFT_CLIENT_SECRET`
   in server secret management. The current adapter uses a client secret, not a certificate.
4. Assign the organisation operator `integrations.sharepoint.view/manage` in Users & Access.
5. Open Settings → Integrations → SharePoint, choose **Connect Microsoft 365**. A Microsoft tenant administrator approves consent.
6. Add the intended SharePoint sites, select them and choose **Authorise Selected Sites**.
   A customer SharePoint Administrator (also a member of each selected site) signs
   in and consents to the separate setup application. TTTracker grants `write`
   to the runtime application, then verifies using its normal Sites.Selected token.
   Manual grant instructions are under **Advanced / Manual Setup**.
7. Enter the intended SharePoint Site URL and choose **Verify Site / Check Permission**.
8. Load libraries, select a stable library ID and save. This does **not** finish setup.
9. Configure inherited-native access profiles and destinations. People rules continue
   to use the existing Document Structure builder and stable destination reference.
10. If literal root folders do not exist, explicitly choose **Create Configured Root Folders**.
    Template roots are resolved later with canonical record context; they are not created
    by a health check. A blank root means the chosen library root.
11. **Test Connection** reads metadata only. Optionally choose **Run Test Upload**:
    a unique synthetic file is uploaded to the selected library root, verified and
    removed using its ETag. A failed cleanup needs Microsoft-admin follow-up.
12. **Finish Setup** rechecks the selected site/library and literal destination roots,
    then marks Connected. Repeat checks for every configured site/library before use.

Readiness is available at `/api/integrations/readiness?organisation={id}&provider=sharepoint`.
It requires the provider view capability and returns safe flags only. Site access
is proved by the runtime Graph check, not by environment-variable presence.
Changing Microsoft tenants is intentionally blocked until an explicit destination
remapping procedure exists. Disconnect/reconnect the same tenant preserves mappings.

See [Selected permissions](https://learn.microsoft.com/en-us/graph/permissions-selected-overview)
and [application client credentials](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow).

## TTTracker setup and access

Apply `20261005200000_organisation_sharepoint_integration.sql`. Explicitly assign
`integrations.sharepoint.view` and/or `integrations.sharepoint.manage` through
Users & Access; these permissions do not confer private People access.
Settings → Integrations → SharePoint separates tenant, site, library, destinations,
access and health. Add multiple named destinations with context-scoped safe tokens.
Existing People Document Structure remains the source of detailed People rules.
People SharePoint rules select a configured training destination through their
library reference (stable destination ID, never a user-entered library name).
Evidence is staged in private internal storage and a canonical-document sync job is
queued. Settings → SharePoint → Test & Finish lists recent jobs with Sync/Retry Sync.
Sync is explicitly manual in this foundation; no unattended worker is deployed.
The module adapter preserves separate TTTracker evidence revisions with unique
filenames. Append-sequence and replacement policies are not enabled in this adapter;
it fails rather than silently ignoring a configured unsupported collision policy.
An after-approval destination requires all linked training records to be approved.
Project, Asset and Prestart tokens/destinations are configuration foundations;
module upload adapters are not enabled where the canonical V2 module does not exist.
The initial upload adapter supports operational training evidence only. Private
profiles can be configured, but private document publishing needs a domain-aware
module adapter before enablement. No confidential publishing is enabled.

Access profiles reference capability IDs, not role names. Native permissions remain
**Inherit SharePoint permissions**. TTTracker cannot prevent direct Microsoft access
for someone separately authorised by Microsoft. Native group mapping is deliberately
unavailable: no tenant-wide FullControl permission is requested.
Confidential destinations are disabled while KMS readiness remains unverified.

## Provider behaviour and verification

The server-only Graph layer checks tenant/application identity and refuses broad
runtime roles. Requests are scoped to configured site and drive. Folder creation
is idempotent; writes default to collision failure, and replacement requires an
explicit existing item ID + ETag. Maximum document size is **10 MB**. Download
follows the Microsoft content redirect without forwarding Graph credentials and
enforces a streamed byte limit. Health reads site/drive metadata; it creates no files.
Provider failures use safe categories; 429 exposes bounded Retry-After for jobs.

Before enabling a real destination, use a development Microsoft tenant to verify
consent, selected-site write grant, library, synthetic folder/file and cleanup.
Mocks cannot prove Microsoft's tenant consent, actual grants or file version policy.

Disconnect disables provider operations and preserves remote files, metadata and
audit history. Reconnect the same tenant and reverify sites. Cross-tenant reconnection
requires a deliberate migration/remapping workflow; it is not silently permitted.
Restore requires database metadata and Microsoft files plus the application
registration/credential and site grant. Database backup alone does not restore files.

## Sequential setup and reconfiguration

The wizard always displays all six steps. Platform readiness gates tenant consent;
verified tenant authority gates Site; a Graph-verified site gates Library; a saved
library gates Destinations; an active destination gates Access; valid inherited
access profiles attached to destinations gate Test & Finish. Locked steps cannot
be opened through clicks or a `?step=Library` URL. Missing platform setup displays
only safe configured/missing diagnostics and disables Connect.

One verified site is selected automatically. Multiple verified sites offer a
selector; candidate URLs never enter that selector until Graph verification passes.
An unverified URL remains an editor candidate, not a persisted verified site.
Library loading preserves the explicitly selected site.

Migration `20261012110000_sharepoint_verified_wizard_state.sql` adds verified
tenant authority and an organisation-owned primary setup-site reference. Existing
consent metadata is deliberately not backfilled as proof: legacy connections need
fresh Microsoft consent/token verification. Existing document metadata is retained.

Returning to setup restores the persisted primary site, library and completed
steps. Changing the primary site/library requires confirmation, marks setup
incomplete and requires a health check before provider writes. A replaced library
pauses affected destinations rather than deleting them. External files, document
history and audit remain intact. React candidate inputs are not persisted as
completed configuration. Root creation and test uploads are explicit operations;
normal health checks only read metadata.

## Customer connection terminology

Step 1 is **Connect Microsoft 365**. TTTracker owns one multi-tenant runtime application and a separate interactive setup application;
each entitled customer connects its own Microsoft 365 organisation through consent,
without entering a Tenant ID. The validated Microsoft callback returns the customer
tenant ID, and application-token verification confirms authority before saving it
against the initiating TTTracker organisation. A reconnect remains pinned to the
existing tenant.

The connected summary shows the stored tenant name where available, otherwise the
verified tenant reference, plus the returned Tenant ID, connecting actor and date.
Sites.Selected does not provide directory display-name discovery; no extra directory
permission is requested just to display a name. Step 2 separately authorises a
customer SharePoint site, Step 3 selects its library, and Step 4 configures destinations.
Platform Setup Information describes environment-wide operator configuration, not
a customer tenant-ID form.

## Platform setup vs organisation connection

**Platform operator:** open Platform Administration > Integrations > Manage Platform
Setup. Configure one Microsoft multi-tenant Entra application and one Xero Web OAuth
application per environment through secure deployment variables. The platform UI
shows booleans, expected callback URLs and aggregate connection counts. It cannot
read or replace secrets. Restart/redeploy after changing environment configuration.

**Customer organisation:** open Settings > Integrations. Entitlement determines
provider availability; tenant RBAC determines who can connect/manage; platform
readiness determines whether a flow can start; the organisation connection stores
that customer's identity/configuration. These are four independent states.

Microsoft customers complete Connect Microsoft 365 > SharePoint Site > Library ?
Destinations > Access > Test & Finish. Microsoft's verified callback supplies their
tenant identity. Sites.Selected authorises only separately granted customer sites.
Xero customers complete Connect Xero > authorise > explicitly choose their Xero
organisation. KMS-backed integration credential storage must pass readiness.

Generic example: TTTracker platform Client ID is configured once. Customer A
connects Microsoft Tenant A / Site A; Customer B connects Tenant B / Site B. The same
platform Xero application also serves isolated customer Xero tenants A and B.

Platform pages: `/platform-admin/integrations`, `/platform-admin/integrations/microsoft`,
`/platform-admin/integrations/xero`. Safe platform status/health API:
`/api/platform/integrations`, restricted to active Platform Admins; health requests
require owner/admin and same-origin POST. No tenant provider content or credentials
are available through this API. Entitlements remain in the organisation subscription
panel; enabling entitlement does not grant tenant RBAC or customer consent.

Microsoft platform health checks configuration without a customer site. Optional
`TTTRACKER_MICROSOFT_PLATFORM_DIRECTORY_ID` is the **operator's app-registration
directory**, supplied only through deployment configuration, never a customer ID
entered in Platform Admin. With its Sites.Selected consent the check verifies an
application token; without it the result honestly reports configuration-only checks.
Xero platform health checks OAuth configuration and KMS readiness; credentials are
validated by Xero during customer OAuth, not through a random customer tenant.
Health timestamps describe the requested check, not a persisted monitoring service.
Safe organisation metadata may be viewed in Platform Admin organisation setup status;
this does not grant document, payroll, accounting or credential-decryption access.


## Multi-site organisation workspace

Connect Microsoft 365 once under Settings ? Integrations ? SharePoint. Customer tenant identity remains verified by the consent callback. Configuration now has six management sections, rather than six mandatory wizard steps: Microsoft Connection, Authorised Sites, SharePoint Locations, Document Routing, Folder Automation and Health.

1. Add candidate SharePoint sites. An entered URL does not establish permission.
2. Select sites and choose **Authorise Selected Sites**. A customer Microsoft administrator signs in through the separate setup application to grant the runtime application `write` access. PowerShell copy/download remains under **Advanced / Manual Setup** only. Existing non-write grants require manual administrator review because Microsoft does not support delegated updates.
3. Verify Selected Sites. Results are independent; a failure for one site does not revoke access to other sites.
4. Add SharePoint Locations. Each combines an authorised site, stable document-library ID and optional literal root. Multiple libraries within one site require no additional site grant. A location's site/library/root identity is immutable: create another location and confirm routing changes instead of silently repointing historical links.
5. Configure Document Routing using existing destinations, access profiles, folder/file tokens and child folders. Worker-type applicability and priority choose specific rules over defaults. Context names never dictate folder names. Existing People Document Structure continues to refer to the routing destination; training sync resolves that destination's location and server-authorised training metadata.
6. Test each location in Health. Ordinary tests only read metadata. Create Folder Structure explicitly creates the location root. Person/project children are created only through actual record provisioning, never synthetic preview values.

### Migration and background processing

Apply `supabase/migrations/20261012130000_sharepoint_locations_provisioning.sql` after the existing integration migrations. It preserves destinations and backfills locations for previous selected libraries. New tables are service-only, with composite organisation references.

Set a deployment `CRON_SECRET` of at least 32 characters. Configure a scheduler to GET `/api/integrations/sharepoint/worker` with `Authorization: Bearer <CRON_SECRET>`. The endpoint processes at most one leased folder job per request; schedule frequently enough for the intended throughput. The repository now includes a Vercel cron schedule; hosted activation requires deploying the intended V2 project with its server-only secret. The worker rechecks entitlement, recorded actor RBAC, canonical ownership, selected-site permission and library membership before Graph operations. Alternatively authorised users can process one job at a time in Folder Automation.

Person creation, configured onboarding events, first People document upload and project creation queue durable jobs. Name/employee-number changes queue a rename only when configured. Keep Existing Folder Name reuses the stored item ID. Rename changes the linked folder name with an ETag check and preserves parent/content; it does not move a historical folder to a newly edited parent template. Retries reuse links and respect Graph Retry-After. Lease revisions prevent changes arriving during work from being lost.

Provision Existing People/Projects previews counts and queues pages of 25; it does not run hundreds of Graph operations in a browser request. The jobs register shows the latest 50 per-record jobs, not a separate aggregate batch history. Canonical record creation performs no Microsoft network calls.

### Boundaries

Only operational folder provisioning/publishing is enabled. Private profiles may be configured but private publishing and all Confidential/KMS gates remain fail-closed. Native access remains Inherit SharePoint Permissions.

Assets currently lacks a canonical V2 asset register: asset/prestart routing and synthetic previews are ready, but automatic Asset-created provisioning is not offered. Tendering is future/generic routing only, with no invented tender IDs or records. Other module upload adapters must authorise their canonical records and call the central resolver/provider before operational publishing is enabled; configuring a context does not claim its upload workflow is implemented.

External Entra registration, consent and selected-site grants are still required. No live Microsoft connection is asserted by mocked provider or migration tests.


## V2 Dev deployment verification - 12/10/2026

The linked Supabase project was positively identified as **TTTracker V2 Dev** before any DDL. The locations migration was dry-run in a hosted transaction and rolled back, then applied alone through the migration API. Existing integration migrations were already applied by name; no blanket database push was used. Supabase assigned history version `20261012092641` to `sharepoint_locations_provisioning` (the repository file is `20261012130000_sharepoint_locations_provisioning.sql`).

A subsequent additive migration, `20261012143000_sharepoint_worker_attempt_metadata.sql`, was independently dry-run and applied as history version `20261012093405`. It adds `last_attempt_at` while preserving first-start history. Do not edit applied migrations or blindly replay files because the API-assigned timestamps differ from local names.

Before migration: one Microsoft organisation connection, zero saved sites/libraries/destinations/People document rules/provider jobs. Backfill correctly created zero locations; existing connection metadata remained intact. New location/link/job tables have RLS and deny anonymous/authenticated table reads. Queue/claim/finish/worker-permission functions remain service-only.

The connected development user's effective SharePoint view/manage and People/Projects edit capabilities and provider entitlement were checked through the canonical database resolver. Hosted rollback-only fixtures proved Person and Project creation queue configured jobs, repeated Person updates retain one job with a newer revision, a simulated throttling failure preserves the Project and schedules retry, and the actor passes fresh worker authorization. All those synthetic rows were rolled back. No bulk provisioning of existing people/projects was started.

### Actual Microsoft result

Local `TTTRACKER_MICROSOFT_CLIENT_ID` and `TTTRACKER_MICROSOFT_CLIENT_SECRET` are present. Application token acquisition in the already-connected customer's verified tenant succeeded, with **Sites.Selected only**. The platform health helper reports configuration Ready; independent app-home-directory credential verification is unavailable while optional `TTTRACKER_MICROSOFT_PLATFORM_DIRECTORY_ID` is absent. Customer-scoped token verification was separately performed against Microsoft.

The requested Training and Compliance development site returns `INTEGRATION_SITE_PERMISSION_REQUIRED`. Its candidate is retained as Permission Required, not Verified. The generated Microsoft admin script contains only that selected site, verified customer tenant and platform application ID, with write access; no credentials. It was saved locally at `%TEMP%/TTTracker-Selected-Test-Sites.ps1` for the customer administrator. No admin delegated token was obtained or retained.

Microsoft administrator action is required before library enumeration, live locations, root creation, document/folder writes, Person rename/content checks or real Project provisioning can proceed. No second safe site/library was supplied and none was invented. Site isolation, library membership, idempotency, rename and Graph errors remain covered by controlled tests; they are not represented as completed live file tests.

### Worker scheduling and execution

`v2/vercel.json` schedules GET `/api/integrations/sharepoint/worker` once per minute. Vercel injects `Authorization: Bearer <CRON_SECRET>` when that server environment variable is configured. This frequency requires a paid Vercel plan; Hobby cron permits once daily and is unsuitable for this queue's intended throughput. Cron activates on the production deployment **of the selected V2 project**, not preview deployments. Use the isolated V2 Dev project/database for development; never deploy this task to the V1/production project.

References: [Vercel Cron](https://vercel.com/docs/cron-jobs), [cron authentication/limits](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [function duration](https://vercel.com/docs/functions/configuring-functions/duration).

Runtime uses Node.js with `maxDuration=240`, below its five-minute database lease. Each invocation handles at most one due folder job. Active leases are excluded from discovery; expired leases can be reclaimed atomically. Entitlement suspension/unavailable connections cool down without touching provider files. Per-job RBAC/site/library checks still run after claim. Retries honor Retry-After seconds/HTTP-date values for 429/5xx alongside exponential backoff.

The worker currently processes **folder provisioning/rename/retry** jobs. Existing document-upload provider jobs retain their authorised manual Sync/Retry workflow; they are not automatically exported by this cron.

Set the following server environment variables on the intended V2 deployment:

- `TTTRACKER_MICROSOFT_CLIENT_ID`: TTTracker multi-tenant application ID.
- `TTTRACKER_MICROSOFT_CLIENT_SECRET`: secure server credential; never a public variable.
- `NEXT_PUBLIC_APP_URL`: canonical application origin matching the registered `/api/integrations/sharepoint/callback` URL. Local development uses `http://localhost:3001`.
- `CRON_SECRET`: unique random server-only secret of at least 32 bytes, distinct per deployment environment.
- Optional `TTTRACKER_MICROSOFT_PLATFORM_DIRECTORY_ID`: operator app-registration directory for independent platform token health.
- Existing `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`: match the intended V2 database.

No Vercel project link/deployment credentials were available during this pass. The cron file is ready but **hosted cron/frontend deployment is not activated/verified**. A local-only CRON_SECRET was generated in ignored `.env.local`, without printing it; it must not be copied into public documentation or reused across environments.

### Exact local command

Start V2 in one terminal:

```powershell
cd v2
npm run dev -- -p 3001
```

In another terminal, with server-only CRON_SECRET configured in ignored `.env.local`:

```powershell
cd v2
npm run worker:sharepoint -- 1
```

The optional count accepts 1-25 sequential invocations. It stops when no job is processed. Requests use only the configured canonical origin and reject redirects so the secret cannot follow a redirected request. Do not queue all real records for a connectivity test.

Actual local result: authenticated invocation succeeded with zero queued jobs; anonymous worker and workspace requests returned HTTP 403. The protected endpoint never returns secrets or raw Graph bodies. The job register now displays record/context/location, state, attempts, safe error, last attempt and completed time using DD/MM/YYYY HH:mm. Names are returned only under corresponding module read/edit and project-access checks. Locations for a revoked/unverified site show Attention Required without invalidating other sites.

Browser automation could not connect because the tool transport rejected its sandbox metadata. Rendered component and controlled endpoint tests were used. Interactive Microsoft login, consent and live browser file operations remain unverified. No external files/folders were created or deleted. Retained setup: one requested candidate test site and its safe audit history.


Validation for this deployment pass: full verification suite **417 passed**; TypeScript, targeted ESLint, production build and `git diff --check` passed. The existing multiple-lockfile build warning remains. A scan of non-ignored working files found neither the actual Microsoft client secret nor the local worker secret. No V1 files, Xero implementation, commit or push were part of this pass.


## Organisation-facing document setup (UX simplification)

The customer workspace uses **Overview ? SharePoint Sites ? Document Destinations ? Document Setup ? Automation ? Health**. Before Microsoft 365 is connected, only the connection screen is shown. Platform setup blockers explain that TTTracker must configure the platform application; customers are not asked for application credentials or a tenant ID.

Customer workflow:

1. Connect Microsoft 365 with the organisation's Microsoft administrator account.
2. Add the SharePoint sites TTTracker should use.
3. Select sites and choose **Approve Selected**, or **Approve Access** on a site. Confirm the selected sites, then choose **Continue with Microsoft**.
4. Once site access is Ready, add Document Destinations. Select a site, its document library and an optional root folder. Libraries load automatically after selecting the site.
5. Open Document Setup. Supported document types are grouped by platform area; inactive future contexts are omitted unless already configured. Use **Set Up Documents** for new People and Project document types, or Set Up/Edit for an individual type.
6. Choose a destination and build folder levels and filenames with named fields. Preview uses example data and never writes to Microsoft. Advanced Settings retains access settings, worker-type conditions, priority, child folders and rename policy.
7. Use Automation for employee/project folder settings and Health for read-only connectivity tests. Folder creation history, retries and maintenance remain available under a collapsed section. Asset routing is available; automatic Asset Register provisioning is not yet implemented.

Existing configuration remains in the same organisation-scoped location and document-destination tables. The assistant creates canonical rules through the existing authenticated API, skips configured document types and retains successfully saved types if a later save fails. Suggested templates are editable. It defaults to first-upload folder creation and does not perform bulk provisioning or Graph writes during setup.

No migration is required for this UX pass. Existing legacy rule roots, review policies and collision policies are retained when editing. The runtime Sites.Selected application, separate delegated setup identity, state/session checks, selected-site verification, RBAC, entitlements and confidential publishing gates are unchanged. Platform Administration remains the technical operator workspace. Customer-facing diagnostics and manual PowerShell remain collapsed support tools.

Validation for the UX simplification pass: **446 verification tests passed**, including Microsoft setup/callback security, rendered customer UI, module-aware document catalogue, template round-trip, canonical advanced-rule preservation, partial assistant save/retry and read-only controls. TypeScript, targeted ESLint, production build and git diff --check passed. The pre-existing multiple-lockfile build warning remains. No live Microsoft approval or browser visual QA was performed during this pass.


## Document Setup configuration saves and connection health

Document Setup saves are database configuration operations. They require organisation membership, the SharePoint management capability, entitlement and an active organisation-owned destination whose site belongs to the same integration. They do not acquire a Microsoft token, list libraries or require current platform/provider readiness. Existing destinations remain configurable while site approval is pending or Microsoft is disconnected/unavailable. Creating a new destination and performing provider operations continue to use their existing verification gates.

New Training setup uses an organisation-scoped operational access profile with `training.view` / `training.edit` when no custom profile is supplied. People/Onboarding and Projects have corresponding existing module capability defaults. Profiles are reused or created with a stable organisation/capability identity; this never grants user permissions or bypasses explicit denies. Custom profiles remain organisation-scoped; confidential profiles are rejected. Other document contexts still require appropriate configured access settings. Existing profile assignments, review policy, legacy roots and collision policy remain preserved.

The canonical database requires a filename template. The editor supplies a suggested template and shows custom naming in a collapsed File Name section; an omitted API filename receives the canonical suggested template. Empty or invalid custom filenames are rejected with a specific error. Creation defaults to `first_upload`, priority to zero, review storage to `after_approval` and collision policy to `version`. Duplicate active rules at the same context/priority/applicability are rejected rather than creating ambiguous routing.

The editor has compact folder rows with distinct dynamic fields and fixed-text inputs, a synthetic live folder preview and one sticky Cancel / Save Document Setup footer. Cancel, X and Escape use the shared unsaved-change guard. Connection warnings are non-blocking; View Connection opens the organisation overview in a separate tab so the draft is retained. Successful saves close the editor, refresh configuration and show an eight-second success notice. Folder provisioning requires a healthy connected provider; configuration persistence does not enable uploads or folder writes.

Diagnosis for the reported Training save: the active Docs destination was valid, but V2 Dev had no access profiles, leaving the previous required `access_profile_id` absent. The previous error presentation incorrectly described this as a Microsoft connection problem. The previous rule save also made a live Graph library request via `locationScope`, an independent incorrect health dependency.

Verification: exact `{employee_number} - {person_display_name}/Training/{training_type}` configuration passes with healthy, unhealthy, setup-required and disconnected provider states. Tests cover canonical persistence, builder reconstruction, missing employee-number policy, default access/naming, destination ownership, permissions/entitlement, conflicting rules, invalid levels, the single Cancel guard and blocked unhealthy provisioning. Full suite: **452 passed**. TypeScript, targeted ESLint, production build and git diff --check passed. No migration was needed and no customer rule was inserted directly into hosted V2 Dev during diagnosis.

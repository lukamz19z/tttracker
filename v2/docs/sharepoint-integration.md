# SharePoint integration

Code foundation uses one multi-tenant Entra application, with each TTTracker
organisation's Microsoft tenant and explicitly granted sites. No customer tenant,
library or folder is built into the application.

## Microsoft setup

1. Register an Entra application supporting accounts in any organisational directory.
2. Add **Microsoft Graph application Sites.Selected only**. Do not add
   Sites.Read.All, Sites.ReadWrite.All or Sites.FullControl.All to runtime.
3. Register the exact HTTPS redirect URI:
   `https://<tttracker-host>/api/integrations/sharepoint/callback`.
4. Configure the application credential in server deployment secret management:
   `TTTRACKER_MICROSOFT_CLIENT_ID`, `TTTRACKER_MICROSOFT_CLIENT_SECRET`,
   `NEXT_PUBLIC_APP_URL`. Never expose the credential through NEXT_PUBLIC variables.
   Use separate development/production applications or tightly isolated deployment
   secrets. Rotate the credential before expiry. This implementation uses client
   credentials; certificate authentication can replace it later without changing
   organisation metadata.
5. Customer Microsoft administrator enters the directory tenant GUID and grants
   admin consent. The callback records a pending tenant, not a connected site.
6. Separately, a Microsoft administrator using their own controlled bootstrap tool
   grants the app `write` on the intended site through
   `POST /sites/<site-id>/permissions`. The runtime application cannot self-grant.
   Any broad bootstrap authority must remain outside TTTracker runtime.
7. Administrator supplies the site's stable ID (`hostname,collection-guid,web-guid`),
   verifies permission and selects a drive/library. No tenant-wide discovery occurs.

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

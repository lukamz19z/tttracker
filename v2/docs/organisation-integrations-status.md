# Organisation integrations implementation status

# Central organisation document cutover - 13/10/2026

SharePoint stores organisation files; Supabase stores live application data,
review workflow and SharePoint references. The central service and shared preview
now serve Training, external Onboarding and host Project documents without new
Supabase Storage writes. [Document Architecture](document-architecture.md) records
the migration, exact API/security boundaries, retained historical/Confidential
Storage exceptions and remaining PDF/module adapters.

The additive central-document migration was applied to hosted V2 Dev during the
[Training reliability pass](training-reliability.md), after a rolled-back dry-run. Read-only Dev inventory found one historical evidence object,
one internal Training reference, no Onboarding references and zero Confidential
objects. Nothing was migrated or deleted. No live provider upload was exercised
in this task. Existing Microsoft runtime/setup architecture is unchanged; no Xero
implementation work was started.

SharePoint native site authorisation uses a separate **TTTracker SharePoint Setup**
multi-tenant application with `Sites.FullControl.All` **Delegated only**. Runtime
remains `Sites.Selected` Application. Select candidate sites and choose
**Authorise Selected Sites**; PowerShell is under **Advanced / Manual Setup**.
Configure `TTTRACKER_MICROSOFT_SETUP_CLIENT_ID` / `_SETUP_CLIENT_SECRET` and the
actual `/api/integrations/sharepoint/site-authorisation/callback` Web redirect.
Platform Microsoft diagnostics show both identities separately. Real grants need
customer Microsoft administrator consent. Delegated read-grant upgrades/revocation
remain manual: Microsoft's update/delete APIs require Application FullControl,
which TTTracker refuses. The additive interactive authorisation migration is applied
to V2 Dev. See [SharePoint operator checklist](sharepoint-integration.md).

## Missing provider cards correction

Root cause: the hub returned null for each provider without its provider-specific
view capability, although the page admitted users with `organisation.settings.view`.
Hosted V2 Dev inspection found both canonical bootstrap system roles had Settings
view but no rows for the four new integration capabilities. Readiness was not the
visibility gate; neither card reached readiness evaluation.

The catalogue now always contains SharePoint and Xero. Settings catalogue viewers
see both; provider details require provider view, and management requires provider
view plus manage. No role-name checks or provider-credential visibility gating exist.
Each card has independent status/error handling, read-only presentation and Retry;
route loading renders both shells. A responsive two-column grid collapses on mobile.

`supabase/migrations/20261012090000_integration_bootstrap_role_defaults.sql` was
applied to V2 Dev. It added eight missing grants across two canonical bootstrap
roles, using system/default metadata and insert-only conflict handling. Existing
grants, denies, custom roles and user overrides are preserved. Future bootstrap
roles already receive active non-private/non-confidential permissions through the
existing provisioning function, so that function was not replaced.

Hosted verification confirmed zero connection rows and zero missing default grants
after repair. 360 verification tests, TypeScript, targeted lint and production build
passed. Tests cover zero rows, missing configuration, Settings-only viewers,
provider denies, read-only status, loading shells, unavailable status/Retry and
idempotent default migration. No live Microsoft/Xero connection is claimed.

Focused correction files:

- `v2/components/integrations/integration-hub.tsx`
- `v2/components/integrations/integrations.module.css`
- `v2/components/integrations/retry-status.tsx`
- `v2/lib/integrations/catalogue.ts`
- `v2/app/workspace/settings/integrations/loading.tsx`
- `supabase/migrations/20261012090000_integration_bootstrap_role_defaults.sql`
- `supabase/verification/integration_role_defaults.test.mjs`
- `supabase/verification/integration_workspace.test.mjs`
- `v2/docs/organisation-integrations-status.md`

## Connection workspace correction

Settings → Integrations now distinguishes platform configuration from organisation
connection status, shows site/library/destination or enabled-feature summaries, and
links to dedicated connection/management workspaces. All displayed dates use the
shared DD/MM/YYYY formatter. Safe provider readiness is server-authorised.

SharePoint has explicit consent, URL/site verification and grant instructions,
reloadable library selection, editable destinations/access profiles using the shared
drawer/token controls, explicit root creation and synthetic test upload/cleanup,
and a Finish Setup boundary. Saving a library no longer marks the connection complete.
Native access remains inherited; different-tenant reconnect is blocked rather than
silently repointing document IDs. Existing provider adapters and collection gates remain.

Xero exposes the real gated OAuth action, explicit tenant selection, connected
metadata, capability-filtered features, scoped Person/Project mapping entry links,
health checks and a shared disconnect confirmation. Mapping lookup does not require
connection-management permission in addition to its explicit mapping capability.

No new migration is required. External Microsoft/Xero registration and verified
integration KMS/OIDC remain required. Provider connection is **not live verified**.
Literal destination roots are checked without writing; template roots require real
record context at upload. Different-provider-tenant reset/remapping is not implemented.

Connection-workspace files changed (23; no migration):

Validation: 352 repository verification tests passed, including 20 new connection
workspace tests; TypeScript, targeted ESLint and production build passed. The
existing multiple-lockfile warning remains. Browser verification could not start
because the browser tool transport reported a missing `sandboxPolicy` field;
rendered-component and controlled endpoint tests covered the readiness and connection
actions instead. Local environment inspection found no Microsoft/Xero app credentials
or integration credential-storage enable flag. No live provider connection is claimed.

- `supabase/verification/integration_workspace.test.mjs`
- `v2/app/api/integrations/readiness/route.ts`
- `v2/app/api/integrations/sharepoint/route.ts`
- `v2/app/api/integrations/sharepoint/callback/route.ts`
- `v2/app/api/integrations/xero/route.ts`
- `v2/app/api/integrations/xero/callback/route.ts`
- `v2/app/workspace/settings/page.tsx`
- `v2/app/workspace/settings/integrations/page.tsx`
- `v2/app/workspace/settings/integrations/xero/page.tsx`
- `v2/app/workspace/projects/[projectId]/page.tsx`
- `v2/components/integrations/integration-hub.tsx`
- `v2/components/integrations/sharepoint-settings.tsx`
- `v2/components/integrations/xero-settings.tsx`
- `v2/components/integrations/person-xero.tsx`
- `v2/components/people/token-input.tsx`
- `v2/lib/integrations/presentation.ts`
- `v2/lib/integrations/readiness.ts`
- `v2/lib/integrations/server.ts`
- `v2/lib/integrations/sharepoint.ts`
- `v2/lib/integrations/xero.ts`
- `v2/docs/sharepoint-integration.md`
- `v2/docs/xero-integration.md`
- `v2/docs/organisation-integrations-status.md`

SharePoint foundation was validated before Xero implementation. Three additive migrations were applied to V2 Dev. Microsoft and Xero live provider verification has not occurred because external registrations/credentials and integration KMS/OIDC are absent. Production Confidential collection remains disabled.

Implemented: organisation integration hub; selected-site Graph provider; guided SharePoint setup; destinations and inherited-native access profiles; People rule destination selection, private internal staging and manual audited sync/retry; server-only encrypted Xero credential envelopes; OAuth state/tenant selection; rotating credential generation leases; employee/project mappings; Person profile mapping summary; real docket preflight with payroll writes blocked.

Remaining: Microsoft registration/consent/site grant; actual development file tests; integration KMS/OIDC role/key setup and hosted roundtrip; Xero development OAuth app/demo consent; hosted refresh/mapping/reconnect tests; automatic provider worker, non-Training module upload adapters, private-domain document adapters, controlled different-Xero-tenant remapping; actual payroll/commercial exports and conflict resolution. No native SharePoint group permission manipulation, confidential SharePoint publishing, employee payroll creation or two-way sync is enabled.

Validation: TypeScript, targeted ESLint, production build and diff whitespace checks passed. The build retains the existing multiple-lockfile workspace-root warning. Local PGlite tests execute migration constraints, state consumption and refresh/job leases. Provider/KMS mocks exercise typed boundaries and synthetic cryptographic tamper tests. Hosted V2 Dev checks confirm all new integration tables and privileged functions deny browser/anonymous access. These tests do not replace live Microsoft/Xero/KMS approval.

Files changed in this task (existing unrelated working-tree changes preserved):

- `supabase/migrations/20261005200000_organisation_sharepoint_integration.sql`
- `supabase/migrations/20261005210000_organisation_xero_integration.sql`
- `supabase/migrations/20261005220000_integration_provider_job_leases.sql`
- `supabase/verification/integration_schema.test.mjs`
- `supabase/verification/organisation_integrations.test.mjs`
- `supabase/verification/people_ui.test.mjs`
- `supabase/verification/xero_integration.test.mjs`
- `v2/app/api/integrations/sharepoint/callback/route.ts`
- `v2/app/api/integrations/sharepoint/documents/route.ts`
- `v2/app/api/integrations/sharepoint/route.ts`
- `v2/app/api/integrations/xero/callback/route.ts`
- `v2/app/api/integrations/xero/mappings/route.ts`
- `v2/app/api/integrations/xero/preflight/route.ts`
- `v2/app/api/integrations/xero/route.ts`
- `v2/app/api/people/documents/route.ts`
- `v2/app/api/people/storage-status/route.ts`
- `v2/app/workspace/settings/integrations/page.tsx`
- `v2/app/workspace/settings/integrations/sharepoint/page.tsx`
- `v2/app/workspace/settings/integrations/xero/page.tsx`
- `v2/app/workspace/settings/page.tsx`
- `v2/components/integrations/integration-hub.tsx`
- `v2/components/integrations/person-xero.tsx`
- `v2/components/integrations/sharepoint-settings.tsx`
- `v2/components/integrations/timesheet-preflight.tsx`
- `v2/components/integrations/xero-settings.tsx`
- `v2/components/people/people-client.tsx`
- `v2/components/people/people-operations.tsx`
- `v2/docs/sharepoint-integration.md`
- `v2/docs/xero-integration.md`
- `v2/infrastructure/integration-kms-policy.example.json`
- `v2/lib/integrations/credential-crypto.ts`
- `v2/lib/integrations/resolver.ts`
- `v2/lib/integrations/server.ts`
- `v2/lib/integrations/sharepoint.ts`
- `v2/lib/integrations/xero-catalogue.ts`
- `v2/lib/integrations/xero.ts`
- `v2/lib/people/document-rules.ts`

No V1 edits. No commit or push.
# Integration entitlements update — 12/10/2026

See [integration-entitlement-status.md](integration-entitlement-status.md) for the current permission diagnosis, provider entitlement keys, Platform Admin plan/override workspace, suspension enforcement, V2 Dev rollback verification and remaining deployment/provider setup. The current DB returns all four integration permissions allowed for both active BC members; the live Read-only browser state could not be reproduced through the unavailable browser connection. Xero is intentionally not assigned to a plan by this change.

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

### Platform workspace validation and changed files

The formal separation pass adds three platform pages, platform navigation,
`v2/app/api/platform/integrations/route.ts`,
`v2/lib/platform/integrations.ts` and
`v2/components/integrations/platform-integrations.tsx`. It extends the existing
platform subscription helper/panel with explicit safe organisation metadata; updates
the organisation hub, SharePoint explanation and Xero readiness response; and extends
`supabase/verification/integration_workspace.test.mjs`. All three integration docs
are updated. No migration is required.

Validation: 403 regression tests, TypeScript, targeted ESLint and production build
pass. Provider readiness does not fabricate connected organisations. Platform APIs
require platform authority before diagnostics or counts; same-origin health POST
requires owner/admin. Existing tenant RBAC, explicit deny, entitlement, selected-site
and KMS credential boundaries remain enforced. No V1 edits, commit, push or frontend
deployment occurred. External Microsoft/Xero/KMS verification is still required.


## SharePoint multi-location workspace ? 12/10/2026

Organisation setup now connects Microsoft 365 once, then manages independent authorised sites, SharePoint Locations and Document Routing. The runtime remains Sites.Selected. Interactive Microsoft administrator authorisation grants selected sites through the separate setup identity; bulk PowerShell is an advanced fallback. Verification and library selection stay organisation-bound.

Additive migration: `20261012130000_sharepoint_locations_provisioning.sql`. Apply it before deploying the workspace. Existing selected libraries/destinations are retained and backfilled. The optional authenticated worker requires deployment scheduling and CRON_SECRET; otherwise authorised managers can manually process bounded jobs. Existing-record provisioning queues pages of 25, with stable item links, retry/backoff and per-job audit.

Live provider verification still requires customer consent and configured Microsoft credentials. Assets/Tendering operational records are not implemented; their routing contexts do not fabricate data. General module upload adapters remain separate work. Private/Confidential publishing is not enabled by this workspace.


## SharePoint deployment verification - 12/10/2026

V2 Dev hosted transaction dry-run and application succeeded for locations/provisioning plus additive last-attempt metadata. RLS/service-only permissions verified; existing connection retained. Zero old libraries/routes required backfill. Hosted rollback-only Person/Project fixtures proved durable queueing and safe retry; no fixtures remain.

Actual Microsoft customer application token passed Sites.Selected-only checks. The requested development site is retained as Permission Required; selected-site admin grant remains the live blocker. No provider folders/files were written. Local authenticated worker invocation passed with an empty queue; anonymous requests returned 403. Vercel one-minute cron is configured in `v2/vercel.json`, but activation needs the intended V2 deployment/account and server CRON_SECRET. No Vercel project link/credential was available. Xero was not changed in this pass.

See [SharePoint deployment/operator details](sharepoint-integration.md#v2-dev-deployment-verification---12102026). Full validation results are recorded in the final task report; live file testing remains incomplete until the customer grants site access.

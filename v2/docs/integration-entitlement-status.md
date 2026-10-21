# Integration permissions and subscription control

Verified in V2 Dev on 12/10/2026. No V1 changes, commit, push or frontend deployment.

## Permission diagnosis

The earlier default-grant omission was repaired by `20261012090000_integration_bootstrap_role_defaults.sql`. Its canonical selector is active system-role metadata `initial_invitation_default=true`; it fills absent integration grants and preserves existing false grants, custom roles and user overrides.

Current hosted inspection found two active BC organisation member assignments. Both have active canonical roles, no integration user overrides, and all four effective integration permissions true:

- `integrations.sharepoint.view`
- `integrations.sharepoint.manage`
- `integrations.xero.view`
- `integrations.xero.manage`

The current database/evaluator and current page-to-component permission handoff do not reproduce Read-only. The authenticated live browser could not be inspected: the browser tool failed during connection. A stale running frontend or different live session is a possibility, not an established root cause. Do not invent additional grants or runtime Administrator bypasses to mask it. The updated application must be run/deployed and the exact live session rechecked.

A separate evaluator defect was found: an integration role's false grant could previously lose to another role's grant or a user allow. The new scoped deny migration makes integration role denies win, preserves user denies and excludes expired/inactive assignments. Other capability families are unchanged.

## Entitlements and platform workspace

Provider entitlement keys are `sharepoint` (existing) and `xero` (new feature catalogue entry). Existing `private.tttracker_v2_get_entitlement` is the runtime source of truth: global feature disable wins, then current organisation override, then active/trial versioned plan assignment, otherwise disabled. No plan-name checks or assumed provider-to-plan assignments were added.

Platform Administration → Organisations → organisation now includes Subscription & Integrations:

- Change Plan drawer shows current/new plan and actual effective entitlement differences, including retained overrides; the save action confirms the change and warns that removed integrations stop syncing without deleting external data.
- Provider override drawers show plan entitlement, Use Plan Default / Force Enabled / Force Disabled, and resulting availability.
- View Setup Status shows platform readiness, connection category and boolean SharePoint site/library setup state. It does not disclose tenant IDs, file data, provider tokens or credential envelopes.
- Plans & Modules shows a data-driven integration inclusion matrix per active plan version.
- Active platform owner/admin authority can mutate. Support authority can inspect safe status only. No tenant membership or provider authority is granted.

Changes lock the organisation row and atomically update existing subscription/override tables with a service-only audit containing actor, old/new effective state/source, target and timestamp. Overrides never change a base plan. Reset uses the existing override row's removal. Cancelled subscriptions remain historically retained.

## Enforcement and retention

Entitlement does not grant tenant permissions. Provider management first requires canonical tenant RBAC and organisation membership, then entitlement. Read-only connection metadata remains available to authorised provider viewers while subscription-disabled.

Server guards cover management/connect/callback paths, SharePoint document reads/sync/staging, Xero credentials/provider reads/mappings and timesheet preflight. Disabled integrations cannot invoke these provider operations. A failed entitlement/schema lookup fails closed with a safe error.

Disabling via the platform workspace retains connection metadata, encrypted credentials, mappings, external objects and sync history. Effective entitlement changes mark retained integrations `entitlement_check_required=true`, audit suspension/restoration and block operational reads/writes until a successful provider health/finish check clears that flag. Enabling alone does not initiate writes. Test upload/root creation also require the cleared flag. Ordinary health checks do not create business data.

Current commercial configuration is deliberately unchanged: BC's plan includes SharePoint; no plan or override includes Xero. Therefore the expected updated BC UI is:

- SharePoint: **Platform Setup Required**, **Setup Information**, no Read-only label.
- Xero: **Not Included in Current Plan**, no Connect action. Once an authorised Platform Admin enables Xero, the same manager sees **Platform Setup Required**, **Setup Information**, no Read-only label until infrastructure is ready.

Both providers always remain visible in the catalogue. Not entitled, platform readiness, user permission and organisation connection are distinct states.

## Hosted verification

Both new migrations were applied only to V2 Dev. A transaction temporarily enabled/disabled/reset BC's Xero override with a synthetic retained connection, verified suspension, required health on restoration and audit writes, then rolled back. Postcheck confirmed zero connections, zero Xero overrides and zero permanent test subscription audits. No provider calls, real files, payroll or credentials were used. The plan was not changed.

Full verification suite: 374 tests; TypeScript, targeted ESLint and production build pass. Tests include default grants, explicit denies, organisation isolation, control-plane RPC/browser-role denial, plan/override precedence, retained suspension, safe platform UI, tenant RBAC before entitlement and existing provider/auth regressions. All dates added to the UI use shared DD/MM/YYYY formatting (with HH:mm for timestamps).

## Files changed in this pass

New:
- `supabase/migrations/20261012100000_platform_integration_entitlements.sql`
- `supabase/migrations/20261012101000_integration_explicit_role_denies.sql`
- `supabase/verification/integration_entitlements.test.mjs`
- `v2/lib/integrations/entitlements.ts`
- `v2/lib/platform/subscription.ts`
- `v2/lib/platform/subscription-preview.ts`
- `v2/components/integrations/platform-subscription.tsx`
- `v2/app/api/platform/organisations/[organisationId]/subscription/route.ts`
- this report.

Updated:
- Platform organisation detail and plan catalogue pages.
- Integrations hub and provider workspace pages.
- Integration server/Xero helpers.
- SharePoint settings/document routes; Xero settings/mappings/preflight routes; People document staging.
- Integration workspace/default-role/Xero verification tests.
- Organisation integrations status documentation.

The prior uncommitted foundation/workspace files remain intact.

## Remaining setup and limitations

- Microsoft: multi-tenant Entra application, canonical callback origin, server client credential/certificate, Sites.Selected application consent and separately administered selected-site write grant; then verify site, select library/destinations and finish health checks. See `sharepoint-integration.md` for actual variable names and routes.
- Xero: development OAuth application, canonical callback, client credentials, environment guard, appropriate granular read scopes, integration-purpose KMS/OIDC infrastructure and successful encrypted-storage readiness. Then enable its product entitlement intentionally, authorise and explicitly select the Xero tenant. See `xero-integration.md`.
- No provider connection is claimed live. No plaintext token fallback, financial collection or KMS boundary weakening was introduced.
- The catalogue inclusion matrix is inspectable; editing global plan definitions is not added here. Organisation plan selection and overrides are fully operable.
- Subscription changes should use the audited control-plane operation. Direct privileged SQL changes bypass that operation's restoration-check/audit bookkeeping; ordinary application roles cannot make those changes.
- Frontend browser visual verification/deployment remains outstanding. Existing Next.js multiple-lockfile warning is unchanged.

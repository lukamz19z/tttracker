# Xero integration

## Registration and environment

Register a **standard OAuth 2.0 Web application** (authorization code, server client
secret), not a single-organisation Custom Connection. Register the exact callback:
`https://<tttracker-host>/api/integrations/xero/callback`.
Configure server-only `TTTRACKER_XERO_CLIENT_ID`, `TTTRACKER_XERO_CLIENT_SECRET`,
`TTTRACKER_XERO_ENVIRONMENT` (`development`, `preview`, `production`) and
`NEXT_PUBLIC_APP_URL`. Runtime environment must match. Use a separate development
app and Xero Demo Company. Preview must not inherit production secrets or KMS trust.

OAuth uses random 256-bit state, hashed at rest, actor/organisation binding, expiry,
one-time atomic consumption and a scoped HttpOnly Secure SameSite cookie. It uses
the documented confidential web-server authorization code flow. Xero's separate
PKCE application type is for public native clients; no client-side token storage or
second authentication system is introduced.

## Secure token storage (currently gated)

No OAuth connection is allowed before runtime integration encryption readiness.
Configure the external KMS key + Vercel OIDC role described in the existing external
KMS infrastructure guide, using **distinct integration credentials context**:
`tttracker.integration-credential.xero`. Bind KMS EncryptionContext and AES-GCM AAD
to organisation, integration, provider, generation, environment and key ARN.
Use a dedicated key/role or explicitly authorised integration-purpose policy, never
silently broaden the existing People-only role.

Required integration-prefixed configuration (safe identifiers, not key material):

- `TTTRACKER_INTEGRATION_KMS_REGION`
- `TTTRACKER_INTEGRATION_KMS_KEY_ARN`
- `TTTRACKER_INTEGRATION_KMS_READ_KEY_ARNS` (optional old keys during rotation)
- `TTTRACKER_INTEGRATION_AWS_ROLE_ARN`
- `TTTRACKER_INTEGRATION_ENVIRONMENT`
- `TTTRACKER_INTEGRATION_VERCEL_TEAM_SLUG`
- `TTTRACKER_INTEGRATION_VERCEL_PROJECT_NAME`
- `TTTRACKER_INTEGRATION_VERCEL_OWNER_ID`
- `TTTRACKER_INTEGRATION_VERCEL_PROJECT_ID`
- `TTTRACKER_INTEGRATION_CREDENTIAL_STORAGE_ENABLED=true` only after setup review

The flag alone does not enable connections: server checks verified workload identity,
key status, schema and a real synthetic KMS envelope roundtrip (cached five minutes).
AES-256-GCM uses random 12-byte nonces and 16-byte tags. Only ciphertext, encrypted
DEK and safe version/context metadata are stored in service-only credential rows.
Supabase DB/service credentials alone provide no KMS workload authority. CloudTrail
records the workload operation; application audit identifies the business actor.

## Scopes and permissions

New 2026 apps use granular scopes. Initial implemented features:

- Employee Mapping: `payroll.employees.read` (AU adapter; NZ/UK not enabled).
- Project Mapping: `projects.read`.
- Connection: `openid offline_access`.

Accounting writes, payroll timesheet writes and two-way sync are not enabled. No
deprecated broad accounting.transactions scope is requested. Changing the selected
feature set requires explicit re-consent; missing scopes return Update Permissions.
Payroll requires appropriate Xero Payroll Administrator authority. Read responses are
projected to employee ID/name; raw bank/tax/super/payroll payloads never reach clients.

Assign `integrations.xero.view/manage`, `xero.people.map`, `xero.projects.manage`,
`xero.timesheets.view/export`, `xero.commercial.export` explicitly via dynamic RBAC.
Connection management alone grants no People confidential or payroll authority.
Platform authority grants no decryption bypass; application capabilities remain required.

## Tenant selection, mappings and source authority

After OAuth retrieve authorised connections and explicitly select the Xero organisation,
even if there is only one. Every API call includes this tenant ID. Same-tenant reconnect
retains stable-ID mappings; a different tenant is blocked until an explicit remapping
workflow is available. No name-based automatic matching or employee creation occurs.
Person and TTTracker account remain separate. Projects are mapped-only, not auto-created.
Commercial mapping/job tables reserve controlled one-way foundations, not arbitrary writes.

Daily Dockets currently contain raw/production hours, prestart/lunch/travel minutes,
mobilisation and delays. They do not provide a confirmed payroll earnings classification.
Preflight therefore requires explicit payable hours, employee and earnings mappings,
approved source and payroll category; it never assumes raw MH = payroll hours.
No automatic invoice/timesheet writes are offered. Sync jobs retain source fingerprints
and provider IDs for future idempotent exports, defaulting to Attention Required.

## Refresh and recovery

Refresh uses a database generation + exclusive expiring lease. Concurrent refresh loses
the claim and retries later instead of sending the same refresh token. The new encrypted
access/refresh pair is committed atomically with a generation comparison; it is not used
until persistence succeeds. The old generation is retained on failure. Xero provides a
30-minute retry grace period if a response/save is lost; after that reconnect may be
required. Unused refresh tokens expire after 60 days. Never log tokens or raw API errors.

Health only reads connections. Disconnect targets the selected connection using Xero's
DELETE connections endpoint, preserves Xero objects and TTTracker mappings/audit, and
invalidates encrypted credentials. Global token revocation could disconnect other
organisations authorised by the same user, so is not used indiscriminately.

Restore requires DB backups, a recoverable KMS key, correctly scoped IAM/OIDC trust,
Xero application registration and an unexpired refresh chain. Do not schedule KMS key
deletion casually. Restoring stale token backups can require reauthorization; KMS rotation
and token generation are independent. Old KMS ARNs remain allowed only during controlled
read/rewrap migration.

## Current scale rules and testing

As documented in October 2026, Starter permits **5** connections, Core **50**, Plus
**1,000**, Advanced **10,000**, Enterprise is negotiated. Older OAuth pages still mention
25; current tier rules and developer portal govern. Certification/tier requirements must
be reviewed before commercial growth; this is not a TTTracker organisation plan limit.

Primary references: [current pricing/tier FAQ](https://developer.xero.com/faq/pricing-and-policy-updates),
[granular scopes](https://developer.xero.com/faq/granular-scopes),
[OAuth flow](https://developer.xero.com/documentation/guides/oauth2/auth-flow/),
[refresh tokens](https://developer.xero.com/documentation/guides/oauth2/token-types),
[certification](https://developer.xero.com/documentation/xero-app-store/app-partner-guides/certification-checkpoints/).

Before live enablement test KMS workload exchange, encrypted persistence, consent,
explicit tenant selection, concurrent refresh, mapping, safe projection, disconnect and
reconnect against a Demo Company. Unit mocks alone cannot approve production operation.
No Xero payroll webhook is invented: supported Accounting events are irrelevant to the
currently implemented mapping-only workflows; use controlled reads for mapping refresh.

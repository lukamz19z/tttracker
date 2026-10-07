# Organisation integrations implementation status

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

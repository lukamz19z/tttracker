# People operational workflows

People is organisation-level. The global workspace header owns navigation; People uses section links, never the project sidebar. Employee Register is a display label for generic `v2_people` records. People, login accounts, memberships and project access remain separate.

## Operational configuration
Settings ? People & Onboarding contains Relationship Types, Training Configuration, Onboarding Templates, Document Structure and Review Rules. Operational registers consume the same configuration through scoped RPCs. People lists, training lists, matrix people, onboarding lists and requirement detail people paginate at 20 rows.

Crew membership and project allocation append dated periods. Daily Dockets reference the organisation crew and freeze the as-of-date operational member snapshot. Changing a current crew does not rewrite past dockets. Commercial reporting can consume this canonical reference/snapshot; no financial calculation was changed here.

Training validity and review state remain separate. Required review always stays pending; None can directly confirm valid evidence; Trusted permits an explicitly capable internal submitter; Inherit resolves source-specific organisation defaults. Direct confirmation is audited. Linked qualifications are selected explicitly, share evidence and retain independent configured expiry. Renewals preserve superseded records. Evidence is PDF/JPEG/PNG, maximum 10 MiB per file. Storage paths are opaque; rule-resolved logical folders/filenames remain metadata. UUID revision suffixes prevent replacement/collisions.

Project requirements use controlled Everyone, Relationship, Position, Crew leader and Specific person applicability. Pending/rejected/expired records are not compliant. Matrix cells retain text and icons, not colour alone.

## Onboarding
Published template versions are immutable. Editing creates the next draft; an existing instance keeps its original version. Templates contain ordered sections and controlled field types with minimum classification and optional prior-boolean conditions. Mappings are a fixed catalogue, not arbitrary database columns.

Invitations use server-generated random tokens, hash-only at rest, scoped expiry/revocation, one-use exchange and a narrow HttpOnly onboarding cookie. The existing external security architecture remains distinct from account invitations and email Security Check. Sessions expire after 30 minutes; server drafts persist, but an expired/lost session currently requires an authorised resend. No token/answer is stored in localStorage. Email send failure is retained with a retry action; no email delivery was simulated or claimed.

Operational and Private answers use separate private-schema tables. Review reads only explicitly authorised Private domains. Per-section reviews support separate authorised reviewers; whole-instance completion requires all relevant domains and training review capability. No-review completion supports Operational non-training templates only. Training requests enter canonical training/evidence records upon completion; review-required training remains pending its separate Training approval. Completion creates/links a Person, never an auth account or membership.

Private domains are Personal contact, Emergency contact, Employment and Safety/claims, each separately capability-controlled. Existing general Private contact access remains available through its original restricted path. There are no role-name or platform-admin bypasses. Domain access and changes audit metadata, not values.

**Confidential collection is unavailable.** Bank, tax, super and payroll semantic types can be designed but cannot be published or collected. No Confidential answers are stored in these answer tables. Existing KMS readiness and encrypted stores remain unchanged. External KMS/Vercel OIDC configuration and hosted verification must complete separately before any financial collection is enabled.

## Integrations and remaining scope
Internal evidence is functional. SharePoint rules can be designed but uploads targeting an unconnected provider fail clearly; no OAuth, folder creation or sync is claimed. Creation-trigger policies are configuration for the eventual provider implementation. Xero remains Not connected; no transfer or blanket classified reads exist. Exact-match confidentiality search, arbitrary conditional scripts, payroll fields and native mobile app implementation are out of scope. Mobile web and future clients use the same configuration/record contracts. Automatic project-derived onboarding requests and organisation-defined attribute conditions remain future extensions.

## Validation
Seven root migrations (20261005090000 through 20261005150000) applied to V2 Dev. Hosted synthetic template publish, token exchange, Operational completion and Person/User separation were verified inside a rolled-back transaction. No test People/invitations were retained and no emails were sent. Interactive browser QA was unavailable due to the browser tool connection error; do not treat component render tests as a complete hosted browser acceptance test.

## Files in this change

- `components/people/people-client.tsx`, `people-controls.tsx`, `people-operations.tsx`, `onboarding-admin.tsx`, `onboarding-fields.tsx`, `onboarding-external.tsx`, `people.module.css`
- `lib/people/document-rules.ts`, `onboarding-types.ts`, `server.ts`
- `app/api/people/route.ts`, `classified/route.ts`, `documents/route.ts`, `private-domain/route.ts`, `onboarding/route.ts`, `onboarding/documents/route.ts`
- `app/api/onboarding/security/workflow/route.ts`, `app/people-onboarding/page.tsx`
- `app/workspace/projects/[projectId]/daily-dockets/new/page.tsx`, `daily-docket-editor.tsx`; `app/api/projects/[projectId]/daily-dockets/save/route.ts`
- This document.
- Root migrations: `20261005090000_people_operational_workflows.sql`, `20261005100000_people_onboarding_workflows.sql`, `20261005110000_people_daily_docket_crew_reference.sql`, `20261005120000_people_onboarding_completion_feedback.sql`, `20261005130000_people_private_contact_mapping.sql`, `20261005140000_people_onboarding_linked_evidence.sql`, `20261005150000_people_onboarding_typed_validation.sql`.
- Root verification: `people_operations.test.mjs`, `people_onboarding.test.mjs`, `people_workflow_ui.test.mjs`, `people_ui.test.mjs`.

All paths above are under `v2/` except the explicitly identified root migrations/verification. Earlier working-tree changes to auth, Materials, navigation, KMS and access management were preserved.

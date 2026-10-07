# People confidential security foundation (historical Vault design)

The current implementation supersedes this Vault-based design with [external KMS envelopes](people-external-kms.md). The original Vault guard remains intact, but no Confidential runtime retrieves Vault keys. External KMS collection remains disabled pending AWS/Vercel configuration and hosted verification. The details below document the earlier checkpoint, not the active key trust chain.

## Deployment checkpoint: BLOCKED

V2 Dev has the foundation and fail-closed gate applied. **Do not collect real financial or other Confidential values.**

Hosted synthetic encryption and permission tests succeeded, but inspection after migration found that `service_role` still has direct `SELECT` on `vault.secrets` and `vault.decrypted_secrets`, Vault schema usage and execution of the raw decrypt function. Those grants were made by Supabase's managed `supabase_admin` role. The project's `postgres` role has grant options but is not a member of that managed role; its REVOKE does not remove grants made by the managed owner. Local Vault mocks cannot prove that deployment boundary.

`private.tttracker_v2_require_vault_boundary()` checks effective privileges for anon, authenticated and service_role. Key creation and every key release are blocked with `CONFIDENTIAL_KEY_BOUNDARY_UNAVAILABLE` while broad Vault access remains. There are no confidential collection screens. Existing normal People APIs continue refusing financial writes.

Before enabling collection:

1. Have Supabase's managed owner remove direct Vault schema/table/function access for application roles, retaining only the database function owner's required access. Do not disable extensions or weaken RLS. Verify effective privileges, not just successful REVOKE execution. Confirm supported migrations/upgrades will preserve the restrictions; the runtime gate detects their return.
2. If Supabase cannot support that boundary, use an independently managed KMS, such as AWS KMS with a dedicated server identity and explicit IAM permissions. Use its maintained SDK for envelope key wrapping; retain the existing AES-GCM and scoped service interfaces. Do not substitute a plaintext environment key or a database table key.
3. Rerun hosted tests with the gate enabled, including tampering, permission revocation, document access and rotation.
4. Perform a separately controlled restore drill and approve production key custody, deployment secret access, storage backups and retention procedures.

## Architecture

Supabase Vault protects randomly generated per-organisation, versioned 256-bit data-encryption keys with its managed project root key. No root key is retrieved by the application. Normal key metadata stores only organisation, version and Vault secret UUID. The root key is managed outside the SQL data store: [Vault documentation](https://supabase.com/docs/guides/database/vault).

Server-only Node crypto uses OpenSSL AES-256-GCM, a fresh random 96-bit nonce and a 128-bit authentication tag. This is established authenticated encryption, not a custom cipher. Fixed, domain-separated associated data binds each ciphertext to organisation, Person/onboarding instance, field, logical record, revision, key version, semantic type and value/document kind. Changing any of those or the ciphertext/tag/nonce fails closed.

The application runtime, service credentials, trusted database owner and Supabase operator remain trusted infrastructure. This design does not claim protection against arbitrary server code execution or a malicious database owner able to change functions. A TTTracker Platform Admin account is not one of those infrastructure identities and receives no decryption bypass.

## Classification and storage

Operational People information stays in canonical operational tables. Private information uses existing `v2_person_private` and explicit `people.private.view/edit` paths. Neither operational registers nor training/crew payloads should select private fields. This task adds no private or confidential fields to `v2_people.metadata`.

Confidential fields, records, version history, key references, access tickets and audit metadata are in `private` schema tables with RLS and no table grants to browser or service_role. Confidential definitions require controlled semantic types from `v2_people_field_types`; every definition in this store is Confidential regardless of label. A type's classification cannot be reduced here. No arbitrary database-column mapping is accepted.

`v2_confidential_records` holds immutable owner/field identity and current revision. `v2_confidential_versions` holds ciphertext or an opaque encrypted object reference, nonce, tag, key version, actor/session and timestamp. Historical versions remain append-only through the service. There are no plaintext shadow copies, suffixes, search hashes, financial metadata or generic answer JSON blobs. Masking and confidential search are not implemented.

## Internal permission boundary

The authenticated server helper calls canonical `getSecurityStatus()` before any internal action. Six-digit Resend verification remains session-scoped; it does not fabricate Supabase AAL2. TOTP and policy handling are unchanged.

An authenticated JWT RPC issues a short-lived hash-only access ticket with the actual `auth.uid()` and JWT session ID. Reads require `people.confidential.view`; writes require `people.confidential.edit`. Active organisation membership, People entitlement/module and existing dynamic RBAC are mandatory. Explicit denies take precedence. No role-name or Platform Admin bypass exists.

Only service_role can redeem a ticket. Redemption rechecks the real auth session, tenant, permission and field, checks the Vault gate, consumes the ticket once, and audits before releasing a scoped key/payload to trusted server memory. Commit rechecks permission/session and locks the exact logical record. Concurrent revision changes reject stale writes. Purpose is a controlled enum, not free text that could contain values.

`people.confidential.manage_keys` is separate and has no default grants. Ordinary Administrator roles do not implicitly receive Confidential permission or key authority. Onboarding management can configure requests but cannot decrypt answers without separate permission.

The server never logs request bodies, keys, values, tokens or raw provider errors. Node buffers are cleared where practical; JavaScript strings and runtime copies cannot be guaranteed to be wiped. Future observability must exclude these service payloads from analytics, tracing and request-body capture.

## Audit

`v2_confidential_audit` records organisation, Person/instance, field/record, action, purpose, authenticated actor or external session, and timestamp. Reads are audited before plaintext becomes available. Writes record started and successful commit events. Document reads/writes and key creation are distinct actions. Failed integrity verification may leave an audited read attempt but no plaintext return.

Audit contains no values, ciphertext, keys or free-form confidential descriptions. Authenticated actors are derived from the JWT; external actors are scoped onboarding session identities. There is no general browser audit-table access.

## Confidential documents

The private `v2-people-confidential` bucket stores AES-GCM ciphertext only. File name, MIME and file bytes are inside the encrypted payload. Supported initial files are PDF, PNG and JPEG up to 10 MiB, with basic signature validation. This is not malware scanning or a full document-content validator.

Logical document identity is the confidential record UUID, independent of its physical provider object. A version stores `provider=internal` and an opaque organisation/record/revision/write-ticket object path. The schema reserves `sharepoint`, but no SharePoint adapter, credential or working connection is claimed. A future adapter must retain classification, permission checks, encryption and audited navigation.

There are no permanent public links or plaintext signed URLs. The server obtains an audited read ticket, downloads encrypted bytes, verifies GCM and returns only the requested decrypted file to its authorised caller. Future HTTP streaming routes must use no-store responses and safe download headers. External recipients can upload only an allowlisted field in their own instance through the write service; no broad storage access or signed upload grants are issued.

Database and storage are not one distributed transaction. Unique write-ticket paths prevent concurrent losers from deleting the winner's object. Definitively rejected commits can remove their uncommitted encrypted object; ambiguous transport failures retain it until reconciliation verifies it is unreferenced. No broad orphan cleanup or automatic retention deletion is installed.

## External onboarding security

This is distinct from account invitations and TTTracker email security checks. An internal onboarding manager can create a prospective or Person-linked security instance with an explicit field allowlist and expiry up to 30 days. Creating/opening an instance never creates a Person, User, membership or role.

Links use 256-bit server-generated random tokens; only SHA-256 digests are stored. Exchange is one-time, expiry/revocation checked under a lock, and creates a hash-only session lasting at most 30 minutes and no longer than link/instance expiry. The exchange endpoint accepts a same-origin JSON POST, sets a scoped HttpOnly/SameSite=Strict cookie (Secure for HTTPS), and never returns the session secret in JSON. Production app URLs must use HTTPS. Future link pages must remove the link secret immediately after successful exchange, disable third-party analytics and use no-referrer/no-store.

External service access is write-only for the exact instance and active allowlisted field. It cannot read other answers, list People, access settings, obtain a general TTTracker session or grant itself `people.confidential.edit`. Revocation invalidates tokens, sessions and previously issued write tickets. Draft values use the same encrypted append-only path; caller retains the logical record ID for replacement.

The builder, email send/resend, draft-resume UI, recipient-owned draft reads and authorised replacement-link issuance are deliberately not built. Session expiry needs a future authorised reissue path for the **same** canonical instance; never create duplicate People or indefinitely reuse an exchanged token. No sensitive drafts go in localStorage, URLs or emails.

## Rotation, lifecycle and recovery

Rotation creates a new random organisation DEK/version in Vault under a lock and retires the prior version for new writes. Prior keys and ciphertext revisions remain retained. Reads use each version's recorded key. Explicit re-encryption reads and verifies an existing value/document, then writes a new audited revision under the active key with an optimistic expected revision; it cannot overwrite a concurrent replacement.

This does not rotate the managed Vault root key. Do not remove old DEKs while historical revisions reference them. Person archival and onboarding revocation do not delete confidential history. Retention, lawful deletion/crypto-erasure and bulk rotation scheduling require an explicit future policy; no legal retention period is invented.

Missing configuration, unknown key versions, unavailable Vault, corrupted ciphertext and invalid tags return safe failures and never plaintext fallbacks. Ambiguous write responses must be reconciled against record revision before retrying, not blindly treated as success.

Database backups hold ciphertext and Vault-wrapped DEKs; encrypted storage objects require their own backup. Restore needs a coherent database/object snapshot **and** the original managed root key. Supabase's new-project restore/branching workflows copy the root key; manual logical restores require the documented protected root-key transfer: [Supabase restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Never put a recovery key in code, environment examples, CLI output or this document. Lost root/DEK material makes corresponding data unrecoverable.

No production restore drill, independent recovery custody or outage recovery SLA has been proven. A database dump alone is insufficient. Recovery access must be controlled separately from ordinary TTTracker administration.

Xero sync is not implemented. Future integration code must use explicit permissioned, purpose-audited reads of approved mapped fields, never generic confidential table access.

## Verification

Local tests use the real People/RBAC SQL and an explicitly labelled functional Vault mock; cryptography tests execute Node AES-GCM. They cover isolation, explicit deny, administrator/platform non-bypass, class minimum, tampering/AAD, private encrypted documents, one-time/revoked/expired tokens, actor auditing, concurrency, key versions and the deployment gate.

The controlled V2 Dev runner uses synthetic values and a disposable organisation/auth account, no email or real financial values. Real Vault and server AES-GCM value/document roundtrips, old-key reads, re-encryption, explicit deny and scoped external writes passed before the unresolved grant boundary was identified. After the corrective gate, a separate hosted test proves even an authorised server key-creation request is blocked. All synthetic accounts, organisations, Vault secrets, confidential records and objects were removed.

Run hosted encryption verification only after managed-owner remediation. The runner deliberately cannot directly delete private/Vault records with service_role: an operator executes its exact temporary organisation-scoped cleanup SQL, then `--cleanup-auth` removes the synthetic auth/organisation records. Never broaden cleanup scopes.

**Current decision:** safe to review the scaffold and plan Confidential onboarding fields; not safe to enable collection or claim the managed-key boundary complete.

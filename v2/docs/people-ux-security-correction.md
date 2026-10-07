# People UX and secure onboarding correction

1. **Duplicate navigation:** `PeopleClient` previously rendered Training Configuration tabs and the entire People Settings bar. Configuration now renders only its own bar; Settings links into that context.
2. **Route:** `/workspace/people/training/configuration` provides Categories, Options / Classes, Training Types and Document Rules, with deterministic Back to Training. Existing settings URLs remain compatible.
3. **V1 guidance:** inspected the actual employee register/profile, crew screen and training configuration. Used the compact register/search/action pattern and Categories / Options / Record Types mental model. No V1 code changed or customer-specific logic copied.
4. **Display values:** shared `peopleLabel` / `peopleDisplay` format statuses, evidence patterns, review policies, classifications and sources. Stored values remain unchanged; names and identifiers are preserved.
5. **Headers:** compact title/subtitle spacing and contrasting header/table/drawer surfaces replace excessive internal-page padding.
6. **Employee Register:** preserves search, filters, pagination, generic Person records and separate account status; does not title-case people's names.
7. **Crews:** clear Crews title, separated detail drawer, Overview default, title-cased tabs and status. Overview no longer renders the member table. Dated memberships and docket snapshots remain canonical.
8. **Categories:** searchable register with description, real Training Type/Option counts, Active/Inactive and explicit Add Category.
9. **Options:** category-scoped searchable selector and register, descriptions/order/status, explicit All categories feedback and Add Option.
10. **Training Types:** category, configured class captions, expiry/evidence/review/status and Add Training Type. Editor groups Basic Details, Category & Options, Validity, Evidence, Review and File & Storage Rules. Configured classes and linked qualifications retain their canonical existing management actions.
11. **Filename/path preview:** synthetic live filename and folder previews use controlled tokens; display dates remain DD/MM/YYYY and filename dates DD-MM-YYYY. Shared saved rules remain in Document Rules; the Training Type editor preview explicitly says it does not save a second disconnected rule.
12. **Back navigation:** shared deterministic BackLink remains, with configuration/editor labels clarified and existing register query restoration preserved.
13. **Onboarding diagnosis:** the inspected client already parsed `window.location.hash`; the server was not expecting the fragment in a page loader. Confirmed defects were the absent `/secure-onboarding` route in this checkout, exchange errors returned as prose while the client matched codes, and database collapse of expired/revoked/used errors. Retained logs do not prove which token-specific condition triggered the original browser failure.
14. **Fragment exchange:** generated CTA now uses `/secure-onboarding#token=...`; client POSTs only to the exchange endpoint, waits for success, removes the fragment and reads the scoped workflow. Existing `/people-onboarding` links still work. Raw tokens are not persisted or logged.
15. **Session/reload:** existing HttpOnly, SameSite Strict, API-path-scoped cookie and 30-minute ceiling retained. Reload without a fragment resumes saved server drafts; consumed tokens cannot create another session.
16. **Errors:** distinct expired, revoked, invalid, used-link, session-expiry and configured-origin failure messages. Unexpected load errors offer Try again. No public unauthenticated resend was invented.
17. **Email:** existing branded HTML retained; actual invitation-route test captures the generated CTA in a controlled mail sink and follows it through exchange, draft save, reload and submit. No real email was sent.
18. **Changed files:** listed below.
19. **Migrations:** additive function changes `20261005180000_onboarding_link_errors.sql` and `20261005190000_people_catalogue_display_summary.sql`, applied to V2 Dev. No table redesign or old applied migration edits.
20. **Tests:** 290 targeted People, crew, training/configuration/matrix/review, requirements, documents, onboarding/security, classification, permission, tenant isolation, auth and workspace tests pass. Rendered-tree tests explicitly prove there is one configuration navigation bar.
21. **TypeScript:** `npx tsc --noEmit --incremental false` passed.
22. **Lint:** targeted ESLint passed without warnings.
23. **Build:** `npm run build` passed; the existing multiple-lockfile warning remains.
24. **Hosted-data HTTP verification:** local V2 server using hosted V2 Dev Supabase passed actual generated-link shell load, fragment POST, HttpOnly cookie, draft save, refresh/resume, submit, one-time retry rejection and internal API denial. Hosted database confirmed submitted status and saved answer. Fixtures were removed; zero synthetic test organisations remain. Browser tooling failed before connecting, so this is HTTP/route verification rather than screenshots or a deployed Vercel browser test.
25. **Limits:** original failed invitation's specific token condition remains unattributed; frontend changes still need normal deployment. Confidential collection remains blocked pending KMS readiness. SharePoint/Xero are unconnected. No real financial data, V1/Materials changes, commit or push.

## Changed-file manifest for this pass

- `v2/lib/people/display.ts`
- `v2/lib/people/onboarding-client-session.ts`
- `v2/lib/people/confidential.ts` (safe link-error allowlist only)
- `v2/components/people/people-client.tsx`
- `v2/components/people/people-controls.tsx`
- `v2/components/people/people-operations.tsx`
- `v2/components/people/training-catalogue.tsx`
- `v2/components/people/onboarding-admin.tsx`
- `v2/components/people/onboarding-external.tsx`
- `v2/components/people/people.module.css`
- `v2/app/workspace/people/training/configuration/page.tsx`
- `v2/app/secure-onboarding/page.tsx`
- `v2/app/api/onboarding/security/exchange/route.ts`
- `v2/app/api/people/onboarding/route.ts`
- The two root migrations above
- `supabase/verification/people_presentation.test.mjs`
- `supabase/verification/people_ui.test.mjs`
- `supabase/verification/people_onboarding.test.mjs`
- `supabase/verification/people_operations.test.mjs`
- `supabase/verification/onboarding_hosted_http.mjs` (controlled manual synthetic HTTP test)
- This report

Existing unrelated working-tree changes were preserved. `git diff --check` passed; V1 tracked directories have no changes.

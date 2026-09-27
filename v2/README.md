# TTTracker Account & Authentication Update

This update adds the common TTTracker account security flows for all authenticated user types.

## Features

- Forgot password
- TTTracker-branded password recovery email
- Reset password
- Change password while signed in
- Change email while signed in
- Current-password verification before requesting an email change
- Secure email-change confirmations to both the current and new email addresses
- Resend pending email-change confirmations
- Auth email request and delivery logs
- Generic forgot-password response to prevent account enumeration
- One recipient per email

## Existing files required

This update assumes the previous central email infrastructure is already installed:

- lib/email/config.ts
- lib/email/send.ts
- lib/supabase/admin.ts
- lib/supabase/browser.ts
- lib/supabase/server.ts

Resend must already be installed and configured.

## Migration

Create a new Supabase migration from the repository root:

npx supabase migration new auth_email_workflows

Paste the included SQL into the generated migration.

Then:

npx supabase db push --dry-run
npx supabase db push

## Supabase setting

Keep Secure Email Change enabled in Supabase Auth email-provider settings.

The custom TTTracker code uses Supabase-generated email-change links for both the current and new address while TTTracker/Resend sends the customer-facing emails.

## Copy destinations

Copy everything except the supplied `supabase` folder into the existing `v2` folder while preserving paths.

The migration belongs in the repository-level:

supabase/migrations/

not inside v2.

## Test

1. Restart V2.
2. Open /login and confirm Forgot password is shown.
3. Request a password reset to a test account.
4. Confirm the email is TTTracker-branded and comes through Resend.
5. Complete the reset.
6. Open /account.
7. Test password change.
8. Test email change using a burner current/new email pair.
9. Confirm both current and new email addresses receive separate private emails.
10. Confirm Resend confirmations works for a pending email change.

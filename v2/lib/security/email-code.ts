import "server-only";

import crypto from "node:crypto";

import { sendEmail } from "@/lib/email/send";
import { getEmailConfig } from "@/lib/email/config";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveSecurityPolicy } from "@/lib/security/policy";
import { requireAuthSessionIdentity } from "@/lib/security/session";

function getPepper() {
  const value = process.env.TTTRACKER_EMAIL_CODE_PEPPER;

  if (!value) {
    throw new Error("Missing TTTRACKER_EMAIL_CODE_PEPPER.");
  }

  return value;
}

function hashCode(challengeId: string, code: string) {
  return crypto
    .createHmac("sha256", getPepper())
    .update(`${challengeId}:${code}`)
    .digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function generateCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildEmailCodeEmail(code: string) {
  const config = getEmailConfig();

  return {
    subject: `${config.brandName} – Verification code`,
    html: `
      <!doctype html>
      <html>
        <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;">
                  <tr>
                    <td style="padding:32px;">
                      <div style="font-size:20px;font-weight:700;margin-bottom:28px;">
                        ${escapeHtml(config.brandName)}
                      </div>

                      <h1 style="font-size:24px;margin:0 0 14px;">
                        Verify your sign in
                      </h1>

                      <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 24px;">
                        Enter this code in TTTracker to continue.
                      </p>

                      <div style="font-size:32px;font-weight:800;letter-spacing:8px;padding:18px 20px;background:#f1f5f9;border-radius:10px;text-align:center;">
                        ${escapeHtml(code)}
                      </div>

                      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">
                        If you did not attempt to sign in, change your password.
                      </p>

                      <div style="margin-top:32px;padding-top:18px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;">
                        ${escapeHtml(config.brandName)} · ${escapeHtml(config.ownerName)}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  };
}

export async function sendEmailSecurityCode() {
  const identity = await requireAuthSessionIdentity();
  const policy = await resolveSecurityPolicy(identity.userId);
  const admin = createSupabaseAdmin();

  await admin
    .from("v2_email_mfa_challenges")
    .update({ status: "cancelled" })
    .eq("user_id", identity.userId)
    .eq("session_id", identity.sessionId)
    .eq("status", "pending");

  const expiresAt = new Date(
    Date.now() + policy.emailCodeExpiryMinutes * 60_000,
  ).toISOString();

  const { data: challenge, error: insertError } =
    await admin
      .from("v2_email_mfa_challenges")
      .insert({
        user_id: identity.userId,
        session_id: identity.sessionId,
        email: identity.email,
        code_hash: "pending",
        expires_at: expiresAt,
        max_attempts: policy.maxEmailCodeAttempts,
        status: "pending",
      })
      .select("id")
      .single();

  if (insertError || !challenge) {
    throw new Error(
      insertError?.message ??
        "Could not create verification challenge.",
    );
  }

  const code = generateCode();
  const codeHash = hashCode(challenge.id, code);

  await admin
    .from("v2_email_mfa_challenges")
    .update({ code_hash: codeHash })
    .eq("id", challenge.id);

  const template = buildEmailCodeEmail(code);

  try {
    const sent = await sendEmail({
      to: identity.email,
      subject: template.subject,
      html: template.html,
    });

    await admin
      .from("v2_email_mfa_challenges")
      .update({
        provider: sent.provider,
        provider_message_id: sent.messageId,
        last_error: null,
      })
      .eq("id", challenge.id);

    return {
      challengeId: challenge.id,
      expiresAt,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Verification email failed.";

    await admin
      .from("v2_email_mfa_challenges")
      .update({
        status: "cancelled",
        provider: "resend",
        last_error: message,
      })
      .eq("id", challenge.id);

    throw error;
  }
}

export async function verifyEmailSecurityCode(
  challengeId: string,
  code: string,
) {
  const identity = await requireAuthSessionIdentity();
  const policy = await resolveSecurityPolicy(identity.userId);
  const admin = createSupabaseAdmin();

  const { data: challenge, error } = await admin
    .from("v2_email_mfa_challenges")
    .select(`
      id,
      user_id,
      session_id,
      code_hash,
      expires_at,
      attempts,
      max_attempts,
      status
    `)
    .eq("id", challengeId)
    .maybeSingle();

  if (error || !challenge) {
    throw new Error("Verification code is invalid.");
  }

  if (
    challenge.user_id !== identity.userId ||
    challenge.session_id !== identity.sessionId ||
    challenge.status !== "pending"
  ) {
    throw new Error("Verification code is no longer valid.");
  }

  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    await admin
      .from("v2_email_mfa_challenges")
      .update({ status: "expired" })
      .eq("id", challenge.id);

    throw new Error("Verification code has expired.");
  }

  if (challenge.attempts >= challenge.max_attempts) {
    await admin
      .from("v2_email_mfa_challenges")
      .update({ status: "cancelled" })
      .eq("id", challenge.id);

    throw new Error(
      "Too many attempts. Request a new code.",
    );
  }

  const suppliedHash = hashCode(
    challenge.id,
    code.trim(),
  );

  if (!safeEqual(challenge.code_hash, suppliedHash)) {
    const nextAttempts = challenge.attempts + 1;

    await admin
      .from("v2_email_mfa_challenges")
      .update({
        attempts: nextAttempts,
        status:
          nextAttempts >= challenge.max_attempts
            ? "cancelled"
            : "pending",
      })
      .eq("id", challenge.id);

    throw new Error("Verification code is incorrect.");
  }

  const verifiedAt = new Date();
  const verificationExpiresAt = new Date(
    verifiedAt.getTime() +
      policy.trustedEmailVerificationHours * 60 * 60 * 1000,
  );

  await admin
    .from("v2_email_mfa_challenges")
    .update({
      status: "verified",
      verified_at: verifiedAt.toISOString(),
    })
    .eq("id", challenge.id);

  await admin
    .from("v2_security_session_verifications")
    .upsert(
      {
        user_id: identity.userId,
        session_id: identity.sessionId,
        verification_type: "email_code",
        verified_at: verifiedAt.toISOString(),
        expires_at: verificationExpiresAt.toISOString(),
      },
      {
        onConflict:
          "user_id,session_id,verification_type",
      },
    );

  return {
    verified: true,
    expiresAt: verificationExpiresAt.toISOString(),
  };
}

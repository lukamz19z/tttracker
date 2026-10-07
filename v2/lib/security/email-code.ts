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
  if (policy.emailCodeMode === "off") throw new Error("MFA_NOT_CONFIGURED");
  const admin = createSupabaseAdmin();
  const id = crypto.randomUUID();
  const code = generateCode();
  const { data, error } = await admin.rpc(
    "tttracker_v2_reserve_email_challenge",
    {
      p_user_id: identity.userId,
      p_session_id: identity.sessionId,
      p_id: id,
      p_email: identity.email,
      p_hash: hashCode(id, code),
      p_expiry_minutes: policy.emailCodeExpiryMinutes,
      p_max_attempts: policy.maxEmailCodeAttempts,
    },
  );
  if (error)
    throw new Error(
      error.message === "RATE_LIMITED" || error.message === "SESSION_MISSING"
        ? error.message
        : "AUTH_ERROR",
    );
  const template = buildEmailCodeEmail(code);
  try {
    const sent = await sendEmail({ to: identity.email, ...template });
    const { error: saveError } = await admin
      .from("v2_email_mfa_challenges")
      .update({
        provider: sent.provider,
        provider_message_id: sent.messageId,
        last_error: null,
      })
      .eq("id", id)
      .eq("user_id", identity.userId)
      .eq("session_id", identity.sessionId)
      .eq("status", "pending");
    if (saveError) throw new Error("SEND_FAILED");
    return data;
  } catch {
    await admin
      .from("v2_email_mfa_challenges")
      .update({ status: "cancelled", last_error: "SEND_FAILED" })
      .eq("id", id)
      .eq("user_id", identity.userId)
      .eq("session_id", identity.sessionId)
      .eq("status", "pending");
    throw new Error("SEND_FAILED");
  }
}

export async function verifyEmailSecurityCode(
  challengeId: string,
  code: string,
) {
  const identity = await requireAuthSessionIdentity();
  if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^\d{6}$/.test(code))
    throw new Error("CODE_INVALID");
  const policy = await resolveSecurityPolicy(identity.userId);
  const { data, error } = await createSupabaseAdmin().rpc(
    "tttracker_v2_verify_email_challenge",
    {
      p_user_id: identity.userId,
      p_session_id: identity.sessionId,
      p_id: challengeId,
      p_hash: hashCode(challengeId, code),
      p_trusted_hours: policy.trustedEmailVerificationHours,
    },
  );
  if (error)
    throw new Error(
      error.message === "SESSION_MISSING" ? "SESSION_MISSING" : "AUTH_ERROR",
    );
  if (data?.error) throw new Error(String(data.error));
  if (!data?.verified) throw new Error("AUTH_ERROR");
  return data;
}

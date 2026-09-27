import "server-only";

import { getEmailConfig } from "@/lib/email/config";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildPasswordRecoveryEmail(
  resetUrl: string,
) {
  const config = getEmailConfig();

  const brandName = escapeHtml(config.brandName);
  const ownerName = escapeHtml(config.ownerName);
  const safeResetUrl = escapeHtml(resetUrl);

  return {
    subject: `${config.brandName} – Reset your password`,
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
                        ${brandName}
                      </div>

                      <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">
                        Reset your password
                      </h1>

                      <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 24px;">
                        Use the button below to securely set a new password.
                      </p>

                      <a
                        href="${safeResetUrl}"
                        style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 18px;border-radius:9px;"
                      >
                        Reset password
                      </a>

                      <p style="margin:28px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">
                        If you did not request this, you can ignore this email.
                      </p>

                      <div style="margin-top:32px;padding-top:18px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;">
                        ${brandName} · ${ownerName}
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

import { formatPeopleDate } from "./dates";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] ?? "",
  );
export function onboardingEmail({
  organisation,
  title,
  url,
  expiresAt,
}: {
  organisation: string;
  title: string;
  url: string;
  expiresAt?: string;
}) {
  const org = escape(organisation);
  const context = escape(title);
  return `<html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dbe3ee;border-radius:10px;overflow:hidden"><tr><td style="background:#142e50;border-top:5px solid #3b82f6;padding:22px 28px;color:#ffffff"><strong style="font-size:22px">TTTracker</strong><div style="font-size:14px;padding-top:8px;color:#dce8f7">${org}</div></td></tr><tr><td style="padding:28px"><h1 style="font-size:23px;line-height:1.3;margin:0 0 18px">You're invited to complete onboarding</h1><p style="font-size:15px;line-height:1.6">${org} has invited you to securely complete the information and documents required for onboarding.</p><p style="font-size:14px;color:#526279">${context}</p><table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#2563eb" style="border-radius:6px"><a href="${escape(url)}" style="display:inline-block;padding:14px 24px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none">Start onboarding</a></td></tr></table><p style="font-size:13px;line-height:1.6;color:#526279;margin-top:24px">This secure link is unique to you and has a limited expiry.${expiresAt ? ` It expires on ${escape(formatPeopleDate(expiresAt))}.` : ""}</p><p style="font-size:13px;line-height:1.6;color:#526279">Completing onboarding does not create a TTTracker account unless the organisation separately invites you to one.</p><p style="font-size:13px;line-height:1.6;color:#526279">If the link expires, contact the organisation to request a replacement.</p></td></tr><tr><td style="padding:18px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b"><strong>TTTracker</strong><br>Secure workforce &amp; project management</td></tr></table></td></tr></table></body></html>`;
}

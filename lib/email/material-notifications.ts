import { docketEmailShell } from "@/lib/email/daily-dockets";

export type MaterialNotificationEmail = {
  subject: string;
  html: string;
  text: string;
};

export type MaterialNotificationEmailDetails = {
  kindLabel: string;
  title: string;
  tower: string;
  project: string;
  material: string;
  unit?: string | null;
  quantityLabel?: string | null;
  quantity?: string | number | null;
  remainingQuantity?: string | number | null;
  urgency?: string | null;
  requiredBy?: string | null;
  raisedBy?: string | null;
  recordedBy?: string | null;
  assignedTo?: string | null;
  segment?: string | null;
  drawing?: string | null;
  fromTower?: string | null;
  toTower?: string | null;
  reference?: string | null;
  note?: string | null;
  url: string;
};

function clean(value: unknown) { return String(value ?? "").trim(); }
function escapeHtml(value: unknown) {
  return clean(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function renderMaterialNotificationEmail(details: MaterialNotificationEmailDetails): MaterialNotificationEmail {
  const subject = `[TTTracker] ${details.title}`;
  const rows = ([
    ["Material", details.material],
    [details.quantityLabel || "Quantity", details.quantity == null ? null : `${details.quantity}${details.unit ? ` ${details.unit}` : ""}`],
    ["Remaining", details.remainingQuantity == null ? null : `${details.remainingQuantity}${details.unit ? ` ${details.unit}` : ""}`],
    ["Tower", details.tower],
    ["Segment", details.segment],
    ["Drawing", details.drawing],
    ["Urgency", details.urgency],
    ["Required By", details.requiredBy],
    ["Raised By", details.raisedBy],
    ["Recorded By", details.recordedBy],
    ["Assigned To", details.assignedTo],
    ["Project", details.project],
    ["From", details.fromTower],
    ["To", details.toTower],
    ["Delivery / Docket Reference", details.reference],
    ["Update", details.note],
  ] as Array<[string, string | null | undefined]>).filter(([, value]) => Boolean(clean(value)));

  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
      <tr><td style="padding:0 0 10px"><span style="display:inline-block;background:#eaf1f8;color:#16324f;border-radius:4px;padding:6px 9px;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:.6px">${escapeHtml(details.kindLabel).toUpperCase()}</span></td></tr>
      <tr><td style="padding:0 0 16px;font-family:Arial,sans-serif;font-size:22px;line-height:28px;font-weight:bold;color:#102033">${escapeHtml(details.title)}</td></tr>
      <tr><td style="padding:0 0 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#f7f9fc;border:1px solid #e2e8f0">${rows.map(([label, value]) => `<tr><td width="38%" style="padding:9px 12px;border-bottom:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:12px;color:#64748b">${escapeHtml(label)}</td><td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#172b43">${escapeHtml(value)}</td></tr>`).join("")}</table></td></tr>
      <tr><td align="left" style="padding:0 0 14px"><a href="${escapeHtml(details.url)}" style="display:inline-block;background:#173b63;border:1px solid #173b63;border-radius:5px;padding:12px 18px;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:bold">View Material Issue</a></td></tr>
      <tr><td style="font-family:Arial,sans-serif;font-size:12px;line-height:18px;color:#64748b">If the button does not work, <a href="${escapeHtml(details.url)}" style="color:#173b63;text-decoration:underline">open this issue in TTTracker</a>.</td></tr>
    </table>`;
  const html = docketEmailShell("Materials Notification", body);
  const text = [
    "TTTracker", details.kindLabel.toUpperCase(), details.title, "",
    ...rows.map(([label, value]) => `${label}: ${clean(value)}`),
    "", `View Material Issue: ${details.url}`, "",
    "This is an automated notification from TTTracker. Replies are not monitored.",
  ].join("\n");
  return { subject, html, text };
}

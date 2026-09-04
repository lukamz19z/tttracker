import { Resend } from "resend";

export type EmailAttachment = {
  name: string;
  contentType: string;
  contentBytes: string;
};

type SendDailyDocketEmailOptions = {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
};

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("Missing environment variable: RESEND_API_KEY");
  }

  return new Resend(apiKey);
}

function getSender() {
  const sender = process.env.TTTRACKER_EMAIL_FROM?.trim();

  if (!sender) {
    throw new Error("Missing environment variable: TTTRACKER_EMAIL_FROM");
  }

  return sender;
}

function normaliseEmailList(values: string[]) {
  return [
    ...new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export async function sendDailyDocketEmail({
  to,
  cc = [],
  subject,
  html,
  attachments = [],
}: SendDailyDocketEmailOptions) {
  const resend = getResendClient();
  const from = getSender();

  const uniqueTo = normaliseEmailList(to);
  const uniqueCc = normaliseEmailList(cc).filter(
    (email) => !uniqueTo.includes(email),
  );

  if (uniqueTo.length === 0) {
    throw new Error("No email recipients were configured.");
  }

  const { data, error } = await resend.emails.send({
    from,
    to: uniqueTo,
    cc: uniqueCc.length > 0 ? uniqueCc : undefined,
    subject,
    html,
    attachments:
      attachments.length > 0
        ? attachments.map((attachment) => ({
            filename: attachment.name,
            content: Buffer.from(attachment.contentBytes, "base64"),
            contentType: attachment.contentType,
          }))
        : undefined,
  });

  if (error) {
    throw new Error(`Resend email failed: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error("Resend did not return an email ID.");
  }

  return {
    id: data.id,
  };
}

export function docketEmailShell(title: string, body: string) {
  return `
  <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:680px;margin:auto">
    <div style="background:#0f172a;color:#fff;padding:18px 22px;border-radius:14px 14px 0 0">
      <strong style="font-size:20px">TTTracker</strong>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 14px 14px">
      <h2 style="margin-top:0">${title}</h2>
      ${body}
      <p style="color:#64748b;font-size:12px;margin-top:28px">
        This is an automated notification from TTTracker. Replies are not monitored.
      </p>
    </div>
  </div>`;
}

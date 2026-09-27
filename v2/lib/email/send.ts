import "server-only";

import { Resend } from "resend";

import { getEmailFrom, getEmailConfig } from "@/lib/email/config";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export type SendEmailResult = {
  provider: "resend";
  messageId: string;
};

function createResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Missing required email configuration: RESEND_API_KEY");
  }

  return new Resend(apiKey);
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const resend = createResendClient();
  const config = getEmailConfig();

  const { data, error } = await resend.emails.send({
    from: getEmailFrom(),
    to: [input.to],
    subject: input.subject,
    html: input.html,
    replyTo: config.replyTo,
  });

  if (error) {
    throw new Error(
      typeof error.message === "string"
        ? error.message
        : "Email provider rejected the message.",
    );
  }

  if (!data?.id) {
    throw new Error("Email provider did not return a message ID.");
  }

  return {
    provider: "resend",
    messageId: data.id,
  };
}

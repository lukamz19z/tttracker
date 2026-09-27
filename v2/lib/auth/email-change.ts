import "server-only";

import { createClient } from "@supabase/supabase-js";

import { recordAuthDelivery } from "@/lib/auth/delivery";
import { buildEmailChangeEmail } from "@/lib/email/templates/email-change";
import { sendEmail } from "@/lib/email/send";
import { getEmailConfig } from "@/lib/email/config";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

function createCredentialCheckClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Missing Supabase authentication configuration.");
  }

  return createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function verifyCurrentPassword(
  email: string,
  password: string,
) {
  const client = createCredentialCheckClient();

  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  return !error;
}

type SendEmailChangeInput = {
  requestId: string;
  userId: string;
  currentEmail: string;
  newEmail: string;
};

export async function sendEmailChangeConfirmations(
  input: SendEmailChangeInput,
) {
  const supabase = createSupabaseAdmin();
  const config = getEmailConfig();

  const redirectTo = `${config.appUrl}/account/email-confirmed`;

  const currentLink = await supabase.auth.admin.generateLink({
    type: "email_change_current",
    email: input.currentEmail,
    newEmail: input.newEmail,
    options: {
      redirectTo,
    },
  });

  if (
    currentLink.error ||
    !currentLink.data?.properties?.action_link
  ) {
    throw new Error(
      currentLink.error?.message ??
        "Could not create current-email confirmation.",
    );
  }

  const newLink = await supabase.auth.admin.generateLink({
    type: "email_change_new",
    email: input.currentEmail,
    newEmail: input.newEmail,
    options: {
      redirectTo,
    },
  });

  if (
    newLink.error ||
    !newLink.data?.properties?.action_link
  ) {
    throw new Error(
      newLink.error?.message ??
        "Could not create new-email confirmation.",
    );
  }

  const currentTemplate = buildEmailChangeEmail({
    confirmationUrl:
      currentLink.data.properties.action_link,
    destination: "current",
  });

  const newTemplate = buildEmailChangeEmail({
    confirmationUrl:
      newLink.data.properties.action_link,
    destination: "new",
  });

  try {
    const currentSent = await sendEmail({
      to: input.currentEmail,
      subject: currentTemplate.subject,
      html: currentTemplate.html,
    });

    await recordAuthDelivery({
      requestId: input.requestId,
      userId: input.userId,
      actionType: "email_change_current",
      recipient: input.currentEmail,
      provider: currentSent.provider,
      status: "sent",
      providerMessageId: currentSent.messageId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Email send failed.";

    await recordAuthDelivery({
      requestId: input.requestId,
      userId: input.userId,
      actionType: "email_change_current",
      recipient: input.currentEmail,
      provider: "resend",
      status: "failed",
      errorMessage: message,
    });

    throw error;
  }

  try {
    const newSent = await sendEmail({
      to: input.newEmail,
      subject: newTemplate.subject,
      html: newTemplate.html,
    });

    await recordAuthDelivery({
      requestId: input.requestId,
      userId: input.userId,
      actionType: "email_change_new",
      recipient: input.newEmail,
      provider: newSent.provider,
      status: "sent",
      providerMessageId: newSent.messageId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Email send failed.";

    await recordAuthDelivery({
      requestId: input.requestId,
      userId: input.userId,
      actionType: "email_change_new",
      recipient: input.newEmail,
      provider: "resend",
      status: "failed",
      errorMessage: message,
    });

    throw error;
  }

  const { data: request } = await supabase
    .from("v2_auth_email_requests")
    .select("send_count")
    .eq("id", input.requestId)
    .maybeSingle();

  await supabase
    .from("v2_auth_email_requests")
    .update({
      send_count: Number(request?.send_count ?? 0) + 1,
      last_sent_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", input.requestId);
}

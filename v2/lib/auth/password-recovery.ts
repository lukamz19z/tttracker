import "server-only";

import { buildPasswordRecoveryEmail } from "@/lib/email/templates/password-recovery";
import { sendEmail } from "@/lib/email/send";
import { getEmailConfig } from "@/lib/email/config";
import { recordAuthDelivery } from "@/lib/auth/delivery";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function requestPasswordRecovery(
  emailInput: string,
) {
  const email = emailInput.trim().toLowerCase();

  if (!email) {
    return;
  }

  const supabase = createSupabaseAdmin();
  const config = getEmailConfig();

  let requestId: string | null = null;
  let userId: string | null = null;

  try {
    const { data: request } = await supabase
      .from("v2_auth_email_requests")
      .insert({
        action_type: "password_recovery",
        current_email: email,
        status: "pending",
      })
      .select("id")
      .single();

    requestId = request?.id ?? null;

    const redirectTo = `${config.appUrl}/reset-password`;

    const { data: linkData, error: linkError } =
      await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: {
          redirectTo,
        },
      });

    if (linkError || !linkData?.properties?.action_link) {
      // Never reveal whether the account exists.
      if (requestId) {
        await supabase
          .from("v2_auth_email_requests")
          .update({
            last_error: "Recovery link could not be generated.",
          })
          .eq("id", requestId);
      }

      return;
    }

    userId = linkData.user?.id ?? null;

    if (requestId) {
      await supabase
        .from("v2_auth_email_requests")
        .update({
          user_id: userId,
        })
        .eq("id", requestId);
    }

    const template = buildPasswordRecoveryEmail(
      linkData.properties.action_link,
    );

    const sent = await sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
    });

    await recordAuthDelivery({
      requestId,
      userId,
      actionType: "password_recovery",
      recipient: email,
      provider: sent.provider,
      status: "sent",
      providerMessageId: sent.messageId,
    });

    if (requestId) {
      await supabase
        .from("v2_auth_email_requests")
        .update({
          send_count: 1,
          last_sent_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", requestId);
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Password recovery email failed.";

    await recordAuthDelivery({
      requestId,
      userId,
      actionType: "password_recovery",
      recipient: email,
      provider: "resend",
      status: "failed",
      errorMessage: message,
    });

    if (requestId) {
      await supabase
        .from("v2_auth_email_requests")
        .update({
          last_error: message,
        })
        .eq("id", requestId);
    }

    // Deliberately swallow the error to prevent account enumeration.
  }
}

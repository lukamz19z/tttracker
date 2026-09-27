import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";

type AuthDeliveryStatus = "sent" | "failed";

type RecordAuthDeliveryInput = {
  requestId: string | null;
  userId: string | null;
  actionType:
    | "password_recovery"
    | "email_change_current"
    | "email_change_new";
  recipient: string;
  provider: string;
  status: AuthDeliveryStatus;
  providerMessageId?: string | null;
  errorMessage?: string | null;
};

export async function recordAuthDelivery(
  input: RecordAuthDeliveryInput,
) {
  const supabase = createSupabaseAdmin();

  await supabase
    .from("v2_auth_email_delivery_attempts")
    .insert({
      request_id: input.requestId,
      user_id: input.userId,
      action_type: input.actionType,
      recipient: input.recipient,
      provider: input.provider,
      status: input.status,
      provider_message_id:
        input.providerMessageId ?? null,
      error_message:
        input.errorMessage ?? null,
    });
}

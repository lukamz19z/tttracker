import "server-only";

import { buildOrganisationInviteEmail } from "@/lib/email/templates/organisation-invite";
import { sendEmail } from "@/lib/email/send";
import { getEmailConfig } from "@/lib/email/config";
import { ensureInvitationAccess } from "@/lib/invitations/provision";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type SendOrganisationInvitationInput = {
  invitationId: string;
  attemptedBy: string;
};

type SendOrganisationInvitationResult = {
  invitationId: string;
  authUserId: string;
  provider: string;
  providerMessageId: string;
};

export async function sendOrganisationInvitation(
  input: SendOrganisationInvitationInput,
): Promise<SendOrganisationInvitationResult> {
  const supabase = createSupabaseAdmin();

  const { data: invitation, error: invitationError } = await supabase
    .from("v2_organisation_invitations")
    .select(`
      id,
      organisation_id,
      email,
      status,
      auth_user_id,
      send_count,
      intended_role_code,
      invited_by,
      organisations (
        name
      )
    `)
    .eq("id", input.invitationId)
    .maybeSingle();

  if (invitationError) {
    throw new Error(invitationError.message);
  }

  if (!invitation) {
    throw new Error("Invitation not found.");
  }

  if (invitation.status === "accepted") {
    throw new Error("This invitation has already been accepted.");
  }

  if (invitation.status === "cancelled") {
    throw new Error("This invitation has been cancelled.");
  }

  const organisation = Array.isArray(invitation.organisations)
    ? invitation.organisations[0]
    : invitation.organisations;

  if (!organisation?.name) {
    throw new Error("Invitation organisation could not be resolved.");
  }

  const config = getEmailConfig();

  const redirectTo =
    `${config.appUrl}/onboarding?invitation=${encodeURIComponent(invitation.id)}`;

  let authUserId = invitation.auth_user_id as string | null;

  try {
    // Supabase generates the secure auth link only.
    // It does not send the customer-facing email.
    const { data: linkData, error: linkError } =
      await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: invitation.email,
        options: {
          redirectTo,
          data: {
            tttracker_invitation_id: invitation.id,
            tttracker_organisation_id: invitation.organisation_id,
          },
        },
      });

    if (linkError) {
      throw linkError;
    }

    if (!linkData?.properties?.action_link) {
      throw new Error("Authentication provider did not return an action link.");
    }

    if (!linkData.user?.id) {
      throw new Error("Authentication provider did not return a user.");
    }

    authUserId = linkData.user.id;

    const { error: authLinkUpdateError } = await supabase
      .from("v2_organisation_invitations")
      .update({
        auth_user_id: authUserId,
        last_error: null,
      })
      .eq("id", invitation.id);

    if (authLinkUpdateError) {
      throw authLinkUpdateError;
    }

    // Resend also repairs missing membership / role setup.
    await ensureInvitationAccess({
      organisationId: invitation.organisation_id,
      userId: authUserId,
      roleCode: invitation.intended_role_code || "admin",
      invitationId: invitation.id,
      invitedBy: invitation.invited_by ?? input.attemptedBy,
    });

    const template = buildOrganisationInviteEmail({
      organisationName: organisation.name,
      inviteUrl: linkData.properties.action_link,
    });

    const sent = await sendEmail({
      to: invitation.email,
      subject: template.subject,
      html: template.html,
    });

    const sentAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("v2_organisation_invitations")
      .update({
        auth_user_id: authUserId,
        last_sent_at: sentAt,
        send_count: Number(invitation.send_count ?? 0) + 1,
        last_error: null,
        provider: sent.provider,
        provider_message_id: sent.messageId,
      })
      .eq("id", invitation.id);

    if (updateError) {
      throw updateError;
    }

    // Audit logging should never turn a successful customer email into a
    // delivery failure. Log it best-effort after the primary state is saved.
    await supabase
      .from("v2_invitation_delivery_attempts")
      .insert({
        invitation_id: invitation.id,
        organisation_id: invitation.organisation_id,
        attempted_by: input.attemptedBy,
        delivery_type: "email",
        provider: sent.provider,
        status: "sent",
        provider_message_id: sent.messageId,
      });

    return {
      invitationId: invitation.id,
      authUserId,
      provider: sent.provider,
      providerMessageId: sent.messageId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invitation delivery failed.";

    await supabase
      .from("v2_organisation_invitations")
      .update({
        auth_user_id: authUserId,
        last_error: message,
      })
      .eq("id", invitation.id);

    await supabase
      .from("v2_invitation_delivery_attempts")
      .insert({
        invitation_id: invitation.id,
        organisation_id: invitation.organisation_id,
        attempted_by: input.attemptedBy,
        delivery_type: "email",
        provider: "resend",
        status: "failed",
        error_message: message,
      });

    throw new Error(message);
  }
}

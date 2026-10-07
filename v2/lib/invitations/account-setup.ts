import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateSetupPassword } from "@/lib/auth/password-policy";
import {
  mapInvitationError,
  mapSetupAuthError,
  setupError,
  type SetupError,
} from "@/lib/auth/setup-errors";

export type InvitationSetupState =
  | { status: "pending" | "accepted"; organisationId: string }
  | { status: "denied"; error: SetupError };

export async function readInvitationSetup(
  session: SupabaseClient,
  invitationId: string,
): Promise<InvitationSetupState> {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(invitationId))
    return { status: "denied", error: setupError("INVALID_TOKEN") };
  const { data: auth, error: authError } = await session.auth.getUser();
  if (authError)
    return { status: "denied", error: mapSetupAuthError(authError) };
  const user = auth.user;
  if (!user?.email || !user.email_confirmed_at)
    return { status: "denied", error: setupError("AUTH_SESSION_MISSING") };
  const { data: invitation, error } = await createSupabaseAdmin()
    .from("v2_organisation_invitations")
    .select(
      "id,organisation_id,email,status,auth_user_id,accepted_user_id,expires_at",
    )
    .eq("id", invitationId)
    .maybeSingle();
  if (error)
    return { status: "denied", error: setupError("SETUP_RETRY_REQUIRED") };
  if (
    !invitation ||
    invitation.email.toLowerCase() !== user.email.toLowerCase() ||
    (invitation.auth_user_id && invitation.auth_user_id !== user.id) ||
    (invitation.status === "accepted" &&
      invitation.accepted_user_id !== user.id)
  )
    return { status: "denied", error: setupError("INVALID_TOKEN") };
  if (invitation.status === "accepted")
    return { status: "accepted", organisationId: invitation.organisation_id };
  if (invitation.status === "cancelled")
    return { status: "denied", error: setupError("INVITATION_REVOKED") };
  if (
    invitation.status === "expired" ||
    (invitation.expires_at &&
      new Date(invitation.expires_at).getTime() <= Date.now())
  )
    return { status: "denied", error: setupError("INVITATION_EXPIRED") };
  if (invitation.status !== "pending")
    return { status: "denied", error: setupError("INVALID_TOKEN") };
  return { status: "pending", organisationId: invitation.organisation_id };
}

export async function completeInvitationSetup(
  session: SupabaseClient,
  invitationId: string,
  password: string,
  confirmation: string,
) {
  const validation = validateSetupPassword(password, confirmation);
  if (validation)
    return { ok: false as const, error: { ...validation, retryable: true } };
  const invitation = await readInvitationSetup(session, invitationId);
  if (invitation.status === "denied")
    return { ok: false as const, error: invitation.error };
  if (invitation.status === "accepted")
    return { ok: false as const, error: setupError("INVITATION_ALREADY_USED") };
  const { error: passwordError } = await session.auth.updateUser({ password });
  // A retry after Auth succeeded but provisioning failed can use the now-current
  // password. Auth's same_password rejection proves it was already set; it does
  // not bypass authentication, invitation ownership, or the acceptance RPC.
  if (passwordError && passwordError.code !== "same_password")
    return { ok: false as const, error: mapSetupAuthError(passwordError) };
  const { data, error } = await session.rpc(
    "tttracker_v2_accept_organisation_invitation",
    { p_invitation_id: invitationId },
  );
  if (error) {
    const current = await readInvitationSetup(session, invitationId);
    if (current.status === "denied")
      return { ok: false as const, error: current.error };
    const mapped = mapInvitationError(error.message);
    return {
      ok: false as const,
      error:
        mapped.code === "SETUP_RETRY_REQUIRED"
          ? setupError("PASSWORD_SAVED_PROVISIONING_PENDING")
          : mapped,
    };
  }
  if (typeof data?.organisationId !== "string")
    return {
      ok: false as const,
      error: setupError("PASSWORD_SAVED_PROVISIONING_PENDING"),
    };
  return { ok: true as const, organisationId: data.organisationId as string };
}

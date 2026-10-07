import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import { resolveSecurityPolicy } from "@/lib/security/policy";
import { requireAuthSessionIdentity } from "@/lib/security/session";
import type { SecurityStatus } from "@/lib/security/types";

export async function getSecurityStatus(
  client?: SupabaseClient,
): Promise<SecurityStatus> {
  const identity = await requireAuthSessionIdentity(client);
  const policy = await resolveSecurityPolicy(identity.userId);
  const admin = createSupabaseAdmin();

  const { data: verification, error: verificationError } = await admin
    .from("v2_security_session_verifications")
    .select("id, expires_at")
    .eq("user_id", identity.userId)
    .eq("session_id", identity.sessionId)
    .eq("verification_type", "email_code")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  const supabase = client ?? (await createSupabaseServer());

  const { data: aalData, error: aalError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  const { data: factorData, error: factorError } =
    await supabase.auth.mfa.listFactors();

  if (verificationError || aalError || factorError)
    throw new Error("AUTH_ERROR");

  const { data: challenge, error: challengeError } = await admin
    .from("v2_email_mfa_challenges")
    .select("id, expires_at, created_at")
    .eq("user_id", identity.userId)
    .eq("session_id", identity.sessionId)
    .eq("status", "pending")
    .not("provider_message_id", "is", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (challengeError) throw new Error("AUTH_ERROR");

  const verifiedTotp =
    factorData?.totp?.filter((factor) => factor.status === "verified") ?? [];

  const currentLevel = recognisedAssuranceLevel(aalData?.currentLevel);
  const nextLevel = recognisedAssuranceLevel(aalData?.nextLevel);

  return {
    authenticated: true,
    activeChallenge: challenge
      ? {
          challengeId: challenge.id,
          expiresAt: challenge.expires_at,
          resendAfter: new Date(
            new Date(challenge.created_at).getTime() + 30000,
          ).toISOString(),
          codeLength: 6,
        }
      : null,
    email: identity.email,
    emailCodeRequired: policy.emailCodeMode === "required",
    emailCodeVerified: Boolean(verification),
    totpRequired: policy.totpMode === "required",
    totpEnrolled: verifiedTotp.length > 0,
    totpVerified: currentLevel === "aal2",
    currentLevel,
    nextLevel,
    complete:
      (policy.emailCodeMode !== "required" || Boolean(verification)) &&
      (policy.totpMode !== "required" || currentLevel === "aal2"),
  };
}

// Unknown future assurance levels must not satisfy the existing MFA policy.
function recognisedAssuranceLevel(
  value: string | null | undefined,
): SecurityStatus["currentLevel"] {
  if (value === "aal1") return "aal1";
  if (value === "aal2") return "aal2";
  return null;
}

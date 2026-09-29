import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import { resolveSecurityPolicy } from "@/lib/security/policy";
import { requireAuthSessionIdentity } from "@/lib/security/session";
import type { SecurityStatus } from "@/lib/security/types";

export async function getSecurityStatus(): Promise<SecurityStatus> {
  const identity = await requireAuthSessionIdentity();
  const policy = await resolveSecurityPolicy(identity.userId);
  const admin = createSupabaseAdmin();

  const { data: verification } = await admin
    .from("v2_security_session_verifications")
    .select("id, expires_at")
    .eq("user_id", identity.userId)
    .eq("session_id", identity.sessionId)
    .eq("verification_type", "email_code")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  const supabase = await createSupabaseServer();

  const { data: aalData } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  const { data: factorData } =
    await supabase.auth.mfa.listFactors();

  const verifiedTotp =
    factorData?.totp?.filter(
      (factor) => factor.status === "verified",
    ) ?? [];

  const currentLevel = aalData?.currentLevel ?? null;
  const nextLevel = aalData?.nextLevel ?? null;

  return {
    authenticated: true,
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

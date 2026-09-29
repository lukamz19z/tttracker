import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  ResolvedSecurityPolicy,
  SecurityMode,
} from "@/lib/security/types";

const MODE_WEIGHT: Record<SecurityMode, number> = {
  off: 0,
  optional: 1,
  required: 2,
};

function strongestMode(values: SecurityMode[]): SecurityMode {
  return values.reduce<SecurityMode>(
    (strongest, current) =>
      MODE_WEIGHT[current] > MODE_WEIGHT[strongest]
        ? current
        : strongest,
    "off",
  );
}

export async function resolveSecurityPolicy(
  userId: string,
): Promise<ResolvedSecurityPolicy> {
  const admin = createSupabaseAdmin();

  const [
    { data: platformAdmin },
    { data: memberships },
    { data: platformPolicy },
  ] = await Promise.all([
    admin
      .from("v2_platform_admins")
      .select("user_id, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
    admin
      .from("organisation_users")
      .select("organisation_id")
      .eq("user_id", userId)
      .eq("status", "active"),
    admin
      .from("v2_security_policies")
      .select(`
        email_code_mode,
        totp_mode,
        email_code_expiry_minutes,
        max_email_code_attempts,
        trusted_email_verification_hours
      `)
      .eq("scope_type", "platform")
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  const organisationIds =
    (memberships ?? []).map((row) => row.organisation_id);

  const organisationResult =
    organisationIds.length > 0
      ? await admin
          .from("v2_security_policies")
          .select(`
            organisation_id,
            email_code_mode,
            totp_mode,
            email_code_expiry_minutes,
            max_email_code_attempts,
            trusted_email_verification_hours
          `)
          .eq("scope_type", "organisation")
          .eq("is_active", true)
          .in("organisation_id", organisationIds)
      : { data: [] };

  const policies: Array<{
    email_code_mode: SecurityMode;
    totp_mode: SecurityMode;
    email_code_expiry_minutes: number;
    max_email_code_attempts: number;
    trusted_email_verification_hours: number;
  }> = [];

  if (platformAdmin && platformPolicy) {
    policies.push(platformPolicy as typeof policies[number]);
  }

  for (const policy of organisationResult.data ?? []) {
    policies.push(policy as typeof policies[number]);
  }

  if (policies.length === 0) {
    return {
      emailCodeMode: "optional",
      totpMode: "optional",
      emailCodeExpiryMinutes: 10,
      maxEmailCodeAttempts: 5,
      trustedEmailVerificationHours: 12,
    };
  }

  return {
    emailCodeMode: strongestMode(
      policies.map((policy) => policy.email_code_mode),
    ),
    totpMode: strongestMode(
      policies.map((policy) => policy.totp_mode),
    ),
    emailCodeExpiryMinutes: Math.min(
      ...policies.map((policy) => policy.email_code_expiry_minutes),
    ),
    maxEmailCodeAttempts: Math.min(
      ...policies.map((policy) => policy.max_email_code_attempts),
    ),
    trustedEmailVerificationHours: Math.min(
      ...policies.map(
        (policy) => policy.trusted_email_verification_hours,
      ),
    ),
  };
}

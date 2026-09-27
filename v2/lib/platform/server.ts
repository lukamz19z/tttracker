import "server-only";

import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { PlatformAdminRole } from "@/lib/platform/types";

export type PlatformAdminIdentity = {
  userId: string;
  email: string | null;
  role: PlatformAdminRole;
  displayName: string | null;
};

export async function requirePlatformAdmin(
  allowedRoles: PlatformAdminRole[] = ["owner", "admin", "support"],
): Promise<PlatformAdminIdentity> {
  const sessionClient = await createSupabaseServer();

  const { data: claimsData, error: claimsError } =
    await sessionClient.auth.getClaims();

  const claims = claimsData?.claims;

  const userId =
    typeof claims?.sub === "string" && claims.sub.length > 0
      ? claims.sub
      : null;

  if (claimsError || !userId) {
    throw new Error("UNAUTHENTICATED");
  }

  const adminClient = createSupabaseAdmin();

  const { data, error } = await adminClient
    .from("v2_platform_admins")
    .select("user_id, role, status, display_name")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(`PLATFORM_ADMIN_LOOKUP_FAILED: ${error.message}`);
  }

  if (!data || !allowedRoles.includes(data.role as PlatformAdminRole)) {
    throw new Error("FORBIDDEN");
  }

  return {
    userId: data.user_id,
    email: typeof claims?.email === "string" ? claims.email : null,
    role: data.role as PlatformAdminRole,
    displayName: data.display_name,
  };
}

export function platformErrorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "UNKNOWN_ERROR";

  if (message === "UNAUTHENTICATED") {
    return {
      status: 401,
      body: { error: "UNAUTHENTICATED" },
    };
  }

  if (message === "FORBIDDEN") {
    return {
      status: 403,
      body: { error: "FORBIDDEN" },
    };
  }

  return {
    status: 500,
    body: { error: message },
  };
}
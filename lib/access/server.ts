import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { mobilePerfTrace } from "@/lib/mobile/perf-trace";
import { AuthProviderUnavailableError, classifySupabaseAuthFailure } from "@/lib/mobile/auth-validation";

export type AccessService = SupabaseClient;

export function isV1FullAccessRole(role: unknown) {
  return ["admin", "administrator", "site_admin"].includes(String(role ?? "").trim().toLowerCase());
}

export async function hasV1FullAccess(service: AccessService, userId: string) {
  const [{ data: legacy, error: legacyError }, { data: assignments, error: assignmentError }] = await Promise.all([
    service.from("user_roles").select("role").eq("user_id", userId),
    service.from("user_role_assignments").select("role_id").eq("user_id", userId),
  ]);
  if (legacyError || assignmentError) throw new Error(legacyError?.message || assignmentError?.message);
  if ((legacy || []).some(row => isV1FullAccessRole(row.role))) return true;
  const roleIds = [...new Set((assignments || []).map(row => String(row.role_id || "")).filter(Boolean))];
  if (!roleIds.length) return false;
  const { data: roles, error: rolesError } = await service.from("roles").select("grants_all").in("id", roleIds);
  if (rolesError) throw new Error(rolesError.message);
  return (roles || []).some(row => row.grants_all === true);
}

export async function fullAccessUserIds(service: AccessService) {
  const [{ data: legacyRoles, error: legacyError }, { data: assignments, error: assignmentError }] = await Promise.all([
    service.from("user_roles").select("user_id,role"),
    service.from("user_role_assignments").select("user_id,role_id"),
  ]);
  if (legacyError || assignmentError) throw new Error(legacyError?.message || assignmentError?.message);
  const legacyIds = (legacyRoles || []).filter(row => isV1FullAccessRole(row.role)).map(row => String(row.user_id));
  const roleIds = [...new Set((assignments || []).map(row => String(row.role_id || "")).filter(Boolean))];
  if (!roleIds.length) return [...new Set(legacyIds)];
  const { data: roles, error: rolesError } = await service.from("roles").select("id,grants_all").in("id", roleIds);
  if (rolesError) throw new Error(rolesError.message);
  const fullRoleIds = new Set((roles || []).filter(row => row.grants_all === true).map(row => String(row.id)));
  const dynamicIds = (assignments || []).filter(row => fullRoleIds.has(String(row.role_id))).map(row => String(row.user_id));
  return [...new Set([...legacyIds, ...dynamicIds])];
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function createServiceClient(): AccessService {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export async function getRequestUser(request: NextRequest) {
  const trace = mobilePerfTrace(request);
  const tokenStartedAt = Date.now();
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization
    .replace(/^Bearer\s+/i, "")
    .trim();

  trace?.log("received", { hasAuthorization: Boolean(authorization), at: new Date().toISOString() });
  trace?.log("token-extracted", { hasAuthorization: Boolean(authorization), validBearerFormat: /^Bearer\s+\S+$/i.test(authorization), durationMs: Date.now() - tokenStartedAt });
  if (!token) {
    trace?.log("auth-failed", { category: "missing_authorization", httpStatus: 401 });
    throw new Error("Missing authentication token.");
  }

  const clientStartedAt = Date.now();
  const tracedAuthFetch: typeof fetch = async (input, init) => {
    if (!trace) return globalThis.fetch(input, init);
    const inputUrl = input instanceof Request ? input.url : String(input);
    const path = new URL(inputUrl, requiredEnv("NEXT_PUBLIC_SUPABASE_URL")).pathname;
    const providerService = path.endsWith("/.well-known/jwks.json") ? "jwks" : "auth";
    const networkStartedAt = Date.now();
    trace?.log(providerService === "jwks" ? "jwks/network-start" : "auth/network-start", { service: providerService });
    try {
      const response = await globalThis.fetch(input, init);
      trace?.log(providerService === "jwks" ? "jwks/network-end" : "auth/network-end", { service: providerService, httpStatus: response.status, durationMs: Date.now() - networkStartedAt });
      return response;
    } catch (error) {
      trace?.log(providerService === "jwks" ? "jwks/network-failed" : "auth/network-failed", {
        service: providerService,
        category: error instanceof TypeError ? "network" : "request_error",
        durationMs: Date.now() - networkStartedAt,
      });
      throw error;
    }
  };
  const authClient = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: tracedAuthFetch },
    },
  );
  trace?.log("auth-client-ready", { durationMs: Date.now() - clientStartedAt });

  const validationStartedAt = Date.now();
  trace?.log("claims-start", { method: "supabase_getClaims" });
  let claimsResult: Awaited<ReturnType<typeof authClient.auth.getClaims>>;
  try {
    claimsResult = await authClient.auth.getClaims(token);
  } catch (error) {
    const failure = classifySupabaseAuthFailure(error);
    trace?.log("auth-failed", { category: failure.category, errorCode: failure.errorCode, httpStatus: failure.status, durationMs: Date.now() - validationStartedAt });
    if (failure.category === "invalid_session") throw new Error("You must be logged in.");
    if (failure.category === "provider_forbidden") throw new Error("MOBILE_AUTH_PROVIDER_FORBIDDEN");
    throw new AuthProviderUnavailableError(failure.status, failure.errorCode, error);
  }
  if (claimsResult.error) {
    const failure = classifySupabaseAuthFailure(claimsResult.error);
    trace?.log("auth-failed", { category: failure.category, errorCode: failure.errorCode, httpStatus: failure.status, durationMs: Date.now() - validationStartedAt });
    if (failure.category === "invalid_session") throw new Error("You must be logged in.");
    if (failure.category === "provider_forbidden") throw new Error("MOBILE_AUTH_PROVIDER_FORBIDDEN");
    throw new AuthProviderUnavailableError(failure.status, failure.errorCode, claimsResult.error);
  }

  const verified = claimsResult.data;
  const claims = verified?.claims;
  if (!claims || typeof claims.sub !== "string" || !claims.sub) {
    trace?.log("auth-failed", { category: "invalid_session", errorCode: "missing_subject", httpStatus: 401, durationMs: Date.now() - validationStartedAt });
    throw new Error("You must be logged in.");
  }
  trace?.log("auth-ok", {
    userId: claims.sub,
    method: "supabase_getClaims",
    algorithm: verified.header.alg ?? null,
    keyIdPresent: Boolean(verified.header.kid),
    durationMs: Date.now() - validationStartedAt,
  });
  trace?.log("claims-verified", {
    userId: claims.sub,
    algorithm: verified.header.alg ?? null,
    keyIdPresent: Boolean(verified.header.kid),
    durationMs: Date.now() - validationStartedAt,
  });

  const userMetadata = claims.user_metadata && typeof claims.user_metadata === "object" && !Array.isArray(claims.user_metadata)
    ? claims.user_metadata as User["user_metadata"]
    : {};
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null, user_metadata: userMetadata };
}

export async function userHasAccess(
  service: AccessService,
  userId: string,
  accessCode: string,
) {
  const startedAt = Date.now();
  const { data, error } = await service
    .rpc("user_has_access", { p_user_id: userId, p_access_code: accessCode });
  if (process.env.NODE_ENV === "development") console.info("[mobile-trace]", { phase: "permission", code: accessCode, durationMs: Date.now() - startedAt });

  if (error) throw new Error(error.message);
  return data === true;
}

export async function requireAccess(
  request: NextRequest,
  accessCode: string,
) {
  const user = await getRequestUser(request);
  const service = createServiceClient();

  const allowed = await userHasAccess(service, user.id, accessCode);
  if (!allowed) {
    throw new Error("You do not have permission to perform this action.");
  }

  return { user, service };
}

/**
 * Access administration is permission-driven, not role-name driven.
 * Any dynamic role can be granted tt.admin.access.
 */
export async function requireAccessAdmin(request: NextRequest) {
  return requireAccess(request, "tt.admin.access");
}

export async function effectivePermissionsForUser(
  service: AccessService,
  userId: string,
) {
  const { data, error } = await service
    .from("effective_user_permissions")
    .select("access_area_id,code,name,type,permission_level,allowed,source")
    .eq("user_id", userId)
    .eq("allowed", true)
    .order("type")
    .order("code");

  if (error) throw new Error(error.message);
  return data ?? [];
}

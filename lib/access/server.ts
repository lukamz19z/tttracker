import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

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
  const authStartedAt = Date.now();
  const trace = request.headers.get("x-tttracker-trace");
  const token = (request.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  if (!token) throw new Error("Missing authentication token.");

  const authClient = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const { data, error } = await authClient.auth.getUser(token);
  if (process.env.NODE_ENV === "development" && trace) console.info("[mobile-trace]", { trace, phase: "server_auth", durationMs: Date.now() - authStartedAt });
  if (error || !data.user) throw new Error("You must be logged in.");

  return data.user;
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

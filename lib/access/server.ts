import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export type AccessService = SupabaseClient;

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
  if (error || !data.user) throw new Error("You must be logged in.");

  return data.user;
}

export async function userHasAccess(
  service: AccessService,
  userId: string,
  accessCode: string,
) {
  const { data, error } = await service
    .from("effective_user_permissions")
    .select("allowed")
    .eq("user_id", userId)
    .eq("code", accessCode)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.allowed === true;
}

export async function requireAccess(
  request: NextRequest,
  accessCode: string,
) {
  const user = await getRequestUser(request);
  const service = createServiceClient();

  const allowed = await userHasAccess(service, user.id, accessCode);
  if (!allowed) throw new Error("You do not have permission to perform this action.");

  return { user, service };
}

/**
 * Access-control administration is intentionally based on a permission code,
 * not a role name. This means an access-admin role can be created later without
 * changing this file.
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

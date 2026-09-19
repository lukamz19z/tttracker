import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient;

export type MobileMaterialContext = {
  service: ServiceClient;
  user: User;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function cleanMaterialValue(value: unknown) {
  return String(value ?? "").trim();
}

function bearerToken(request: Request) {
  return (request.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

async function hasFullAccessRole(
  service: ServiceClient,
  userId: string,
) {
  const { data: assignments, error: assignmentError } = await service
    .from("user_role_assignments")
    .select("role_id")
    .eq("user_id", userId);

  if (assignmentError) return false;

  const roleIds = (assignments ?? [])
    .map((row) => cleanMaterialValue(row.role_id))
    .filter(Boolean);

  if (!roleIds.length) return false;

  const { data: roles, error: roleError } = await service
    .from("roles")
    .select("id,grants_all")
    .in("id", roleIds);

  if (roleError) return false;
  return (roles ?? []).some((role) => role.grants_all === true);
}

async function requireMaterialPermission(
  service: ServiceClient,
  userId: string,
) {
  const { data, error } = await service
    .from("effective_user_permissions")
    .select("allowed")
    .eq("user_id", userId)
    .eq("code", "mobile.materials")
    .maybeSingle();

  if (error) {
    throw new Error(`Materials permission could not be verified: ${error.message}`);
  }

  const permission = data as { allowed?: boolean | null } | null;
  if (permission?.allowed === true) return;

  const err = new Error("You do not have permission to use Materials.");
  (err as Error & { status?: number }).status = 403;
  throw err;
}

async function requireProjectAccess(
  service: ServiceClient,
  userId: string,
  projectId: string,
) {
  const { data, error } = await service
    .from("project_access")
    .select("project_id")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error(`Project access could not be verified: ${error.message}`);
  }

  if (data) return;
  if (await hasFullAccessRole(service, userId)) return;

  const err = new Error("You do not have access to this project.");
  (err as Error & { status?: number }).status = 403;
  throw err;
}

export async function requireMobileMaterialUser(
  request: Request,
  projectId: string,
): Promise<MobileMaterialContext> {
  const token = bearerToken(request);

  if (!token) {
    const err = new Error("Your TTTracker session has expired. Sign in again.");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }

  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    const err = new Error("Your TTTracker session has expired. Sign in again.");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }

  const service: ServiceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await requireMaterialPermission(service, user.id);
  await requireProjectAccess(service, user.id, projectId);

  return { service, user };
}

export function mobileMaterialApiError(error: unknown) {
  const status =
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? Number((error as { status: number }).status)
      : 500;

  const message =
    error instanceof Error
      ? error.message
      : "Materials request could not be completed.";

  return { status, message };
}

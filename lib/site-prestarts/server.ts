import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function createSitePrestartServiceClient() {
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

export type SitePrestartServiceClient = SupabaseClient;

export function clean(value: unknown) {
  return String(value ?? "").trim();
}

export const SITE_PRESTART_DECLARATION =
  "I confirm I have attended this site prestart, understood the current discussion points and site requirements, am fit for work, and will report hazards, changes or concerns before starting or continuing work.";

export type SitePrestartIdentity = {
  userId: string;
  employeeId: string | null;
  name: string;
  email: string;
  role: "site_prestart_permitted";
};

async function identityForUser(
  service: SitePrestartServiceClient,
  user: User,
): Promise<SitePrestartIdentity> {
  const { data: employee, error: employeeError } = await service
    .from("employees")
    .select("id,full_name,user_id,active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (employeeError) throw new Error(employeeError.message);

  const email = clean(user.email).toLowerCase();
  const metadataName = clean(
    user.user_metadata?.full_name || user.user_metadata?.name,
  );

  return {
    userId: user.id,
    employeeId: clean(employee?.id) || null,
    name:
      clean(employee?.full_name) ||
      metadataName ||
      email ||
      "TTTracker User",
    email,
    role: "site_prestart_permitted",
  };
}

async function requirePermission(
  service: SitePrestartServiceClient,
  userId: string,
) {
  const { data, error } = await service
    .from("effective_user_permissions")
    .select("allowed")
    .eq("user_id", userId)
    .eq("code", "mobile.site_prestarts")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data?.allowed !== true) throw new Error("SITE_PRESTART_FORBIDDEN");
}

export async function requireSitePrestartUser(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) throw new Error("AUTH_REQUIRED");

  const service = createSitePrestartServiceClient();

  const {
    data: { user },
    error,
  } = await service.auth.getUser(token);

  if (error || !user) throw new Error("AUTH_REQUIRED");

  await requirePermission(service, user.id);
  const identity = await identityForUser(service, user);

  return {
    service,
    user,
    identity,
  };
}

export function canViewSitePrestarts(role: string) {
  return role === "site_prestart_permitted";
}

export function canManageSitePrestarts(role: string) {
  return role === "site_prestart_permitted";
}

export async function permittedSitePrestartProjectIds(
  service: SitePrestartServiceClient,
  userId: string,
) {
  const { data, error } = await service
    .from("project_access")
    .select("project_id")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  return Array.from(
    new Set(
      (data ?? [])
        .map((row) => clean(row.project_id))
        .filter(Boolean),
    ),
  );
}

export async function requireSitePrestartProjectAccess(
  service: SitePrestartServiceClient,
  userId: string,
  projectId: string,
) {
  const id = clean(projectId);
  if (!id) throw new Error("PROJECT_ACCESS_FORBIDDEN");

  const { data, error } = await service
    .from("project_access")
    .select("project_id")
    .eq("project_id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("PROJECT_ACCESS_FORBIDDEN");
}

export function sitePrestartApiError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unexpected Site Prestart error.";

  if (message === "AUTH_REQUIRED") {
    return {
      status: 401,
      message: "You must be logged in.",
    };
  }

  if (
    message === "SITE_PRESTART_FORBIDDEN" ||
    message === "VIEW_FORBIDDEN" ||
    message === "MANAGE_FORBIDDEN"
  ) {
    return {
      status: 403,
      message:
        "Your account does not have Site Prestart access. An administrator can grant the mobile.site_prestarts permission in TTTracker Admin.",
    };
  }

  if (message === "PROJECT_ACCESS_FORBIDDEN") {
    return {
      status: 403,
      message: "You do not have access to this project.",
    };
  }

  return {
    status: 500,
    message,
  };
}

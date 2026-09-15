import { createClient, type User } from "@supabase/supabase-js";

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

export function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function normaliseRole(value: unknown) {
  return clean(value).toLowerCase().replace(/\s+/g, "_");
}

export const SITE_PRESTART_DECLARATION =
  "I confirm I have attended this site prestart, understood the current discussion points and site requirements, am fit for work, and will report hazards, changes or concerns before starting or continuing work.";

export type SitePrestartIdentity = {
  userId: string;
  employeeId: string | null;
  name: string;
  email: string;
  role: string;
};

async function identityForUser(
  service: ReturnType<typeof createSitePrestartServiceClient>,
  user: User,
): Promise<SitePrestartIdentity> {
  const [{ data: employee }, { data: roleRow }] = await Promise.all([
    service
      .from("employees")
      .select("id,full_name,user_id,active")
      .eq("user_id", user.id)
      .maybeSingle(),
    service
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

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
    role: normaliseRole(roleRow?.role || "user"),
  };
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

  const identity = await identityForUser(service, user);

  return {
    service,
    user,
    identity,
  };
}

export function canViewSitePrestarts(role: string) {
  return [
    "admin",
    "administrator",
    "site_admin",
    "hseq",
    "safety",
    "safety_manager",
    "safety_officer",
  ].includes(normaliseRole(role));
}

export function canManageSitePrestarts(role: string) {
  return ["admin", "administrator", "site_admin"].includes(
    normaliseRole(role),
  );
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

  if (message === "VIEW_FORBIDDEN") {
    return {
      status: 403,
      message: "You do not have access to the Site Prestart register.",
    };
  }

  if (message === "MANAGE_FORBIDDEN") {
    return {
      status: 403,
      message: "Administrator access is required for Site Prestarts.",
    };
  }

  return {
    status: 500,
    message,
  };
}

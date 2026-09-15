import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export type QualityProjectRow = {
  id: string;
  name: string | null;
  project_number: string | null;
  sharepoint_site_id: string | null;
  sharepoint_drive_id: string | null;
  sharepoint_folder_id: string | null;
};

export type QualityTowerRow = {
  id: string;
  project_id: string;
  name: string | null;
  line: string | null;
  extra_data: Record<string, unknown> | null;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function createQualityAdminSupabase() {
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

export function qualityUserLabel(user: User) {
  return String(
    user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      "TTTracker User",
  ).trim();
}

export async function requireQualityUser(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!token) throw new Error("UNAUTHENTICATED");

  const service = createQualityAdminSupabase();
  const {
    data: { user },
    error: userError,
  } = await service.auth.getUser(token);

  if (userError || !user) throw new Error("UNAUTHENTICATED");

  const { data: roleRow, error: roleError } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleError) throw new Error(roleError.message);

  return {
    service,
    user,
    role: String(roleRow?.role ?? "").trim().toLowerCase(),
  };
}

export function isQualityAdminRole(role: string) {
  return ["admin", "administrator", "site_admin"].includes(role);
}

export async function assertQualityProjectAccess({
  service,
  userId,
  role,
  projectId,
}: {
  service: SupabaseClient;
  userId: string;
  role: string;
  projectId: string;
}) {
  if (isQualityAdminRole(role)) return;

  const { data, error } = await service
    .from("project_access")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("FORBIDDEN");
}

export async function loadQualityProject(
  service: SupabaseClient,
  projectId: string,
): Promise<QualityProjectRow> {
  const { data, error } = await service
    .from("projects")
    .select(
      "id,name,project_number,sharepoint_site_id,sharepoint_drive_id,sharepoint_folder_id",
    )
    .eq("id", projectId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Project could not be found.");
  }

  return data as QualityProjectRow;
}

export async function loadQualityTower(
  service: SupabaseClient,
  towerId: string,
  projectId?: string,
): Promise<QualityTowerRow> {
  let query = service
    .from("towers")
    .select("id,project_id,name,line,extra_data")
    .eq("id", towerId);

  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query.single();

  if (error || !data) {
    throw new Error(error?.message || "Tower could not be found.");
  }

  return data as QualityTowerRow;
}

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

export function qualityTowerLabel(tower: QualityTowerRow) {
  const extra = tower.extra_data ?? {};

  return (
    text(tower.name) ||
    text(extra["Navigation Number"]) ||
    text(extra["navigation_number"]) ||
    text(extra["Tower Number"]) ||
    text(extra["tower_number"]) ||
    text(extra["Structure Number"]) ||
    text(extra["structure_number"]) ||
    "Tower"
  );
}

export function qualityApiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Quality request failed.";

  if (message === "UNAUTHENTICATED") {
    return { status: 401, message: "You must be signed in." };
  }

  if (message === "FORBIDDEN") {
    return { status: 403, message: "You do not have access to this project." };
  }

  return { status: 500, message };
}

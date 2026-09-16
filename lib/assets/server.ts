import { createClient, type User } from "@supabase/supabase-js";

import type { AssetType } from "@/lib/assets/types";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function createAssetServiceClient() {
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

export type AssetServiceClient = ReturnType<
  typeof createAssetServiceClient
>;

export function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function normaliseAssetRole(value: unknown) {
  const role = clean(value).toLowerCase().replace(/[\s-]+/g, "_");

  if (["administrator", "site_admin"].includes(role)) return "admin";
  if (["mechanic", "assets"].includes(role)) return "asset_manager";
  if (["safety", "safety_manager", "safety_officer"].includes(role)) {
    return "hseq";
  }
  if (role === "commercial_manager") return "commercial";

  return role;
}

export type AssetIdentity = {
  userId: string;
  employeeId: string | null;
  name: string;
  email: string;
  websiteRole: string;
  mobileRole: string;
  role: string;
};

async function resolveIdentity(
  service: AssetServiceClient,
  user: User,
): Promise<AssetIdentity> {
  const [websiteResult, mobileResult, employeeResult] = await Promise.all([
    service
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle(),
    service
      .from("user_mobile_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle(),
    service
      .from("employees")
      .select("id,full_name,user_id")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (websiteResult.error) throw new Error(websiteResult.error.message);
  if (mobileResult.error) throw new Error(mobileResult.error.message);
  if (employeeResult.error) throw new Error(employeeResult.error.message);

  const websiteRole = normaliseAssetRole(websiteResult.data?.role);
  const mobileRole = normaliseAssetRole(mobileResult.data?.role);

  const role =
    websiteRole === "admin" || mobileRole === "admin"
      ? "admin"
      : websiteRole === "asset_manager" || mobileRole === "asset_manager"
        ? "asset_manager"
        : websiteRole === "commercial" || mobileRole === "commercial"
          ? "commercial"
          : websiteRole === "hseq" || mobileRole === "hseq"
            ? "hseq"
            : websiteRole || mobileRole || "viewer";

  return {
    userId: user.id,
    employeeId: clean(employeeResult.data?.id) || null,
    name:
      clean(employeeResult.data?.full_name) ||
      clean(user.user_metadata?.full_name) ||
      clean(user.user_metadata?.name) ||
      clean(user.email) ||
      "TTTracker User",
    email: clean(user.email).toLowerCase(),
    websiteRole,
    mobileRole,
    role,
  };
}

export async function requireAssetUser(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) throw new Error("AUTH_REQUIRED");

  const service = createAssetServiceClient();
  const {
    data: { user },
    error,
  } = await service.auth.getUser(token);

  if (error || !user) throw new Error("AUTH_REQUIRED");

  const identity = await resolveIdentity(service, user);

  return {
    service,
    user,
    identity,
  };
}

export function canViewAssets(role: string) {
  return ["admin", "asset_manager", "commercial", "hseq"].includes(
    normaliseAssetRole(role),
  );
}

export function canManageAssets(role: string) {
  return ["admin", "asset_manager"].includes(normaliseAssetRole(role));
}

export function canConfigureAssets(role: string) {
  return normaliseAssetRole(role) === "admin";
}

export function parseAssetType(value: unknown): AssetType | null {
  const type = clean(value).toLowerCase();
  if (type === "vehicle" || type === "plant") return type;
  return null;
}

export function assetTable(type: AssetType) {
  return type === "vehicle" ? "vehicle_assets" : "plant_assets";
}

export function assetIdColumn(type: AssetType) {
  return type === "vehicle" ? "vehicle_asset_id" : "plant_asset_id";
}

export function assetDetailRoute(type: AssetType, assetId: string) {
  return type === "vehicle"
    ? `/assets/vehicles/${assetId}`
    : `/assets/plant/${assetId}`;
}

export function assetApiError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unexpected Assets error.";

  if (message === "AUTH_REQUIRED") {
    return { status: 401, message: "You must be logged in." };
  }

  if (message === "ASSET_VIEW_FORBIDDEN") {
    return { status: 403, message: "You do not have access to Assets." };
  }

  if (message === "ASSET_MANAGE_FORBIDDEN") {
    return {
      status: 403,
      message: "Administrator or Asset Manager access is required.",
    };
  }

  if (message === "ASSET_CONFIG_FORBIDDEN") {
    return {
      status: 403,
      message: "Administrator access is required for Asset configuration.",
    };
  }

  return { status: 500, message };
}

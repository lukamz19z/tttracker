import type { AccessService } from "@/lib/access/server";

export function qualityClean(value: unknown) {
  return String(value ?? "").trim();
}

export async function assertMobileProjectAccess(service: AccessService, userId: string, projectId: string) {
  const { data, error } = await service
    .from("project_access")
    .select("project_id")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("MOBILE_PROJECT_DENIED");
}

export async function assertMobileTower(service: AccessService, projectId: string, towerId: string) {
  const { data, error } = await service
    .from("towers")
    .select("id,project_id,name")
    .eq("id", towerId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("MOBILE_TOWER_NOT_FOUND");
  return data;
}

export async function mobileAssigneeLabel(service: AccessService, userId: string | null) {
  if (!userId) return null;
  const { data } = await service.from("employees").select("full_name").eq("user_id", userId).maybeSingle();
  if (qualityClean(data?.full_name)) return qualityClean(data?.full_name);
  const { data: auth } = await service.auth.admin.getUserById(userId);
  return qualityClean(auth.user?.user_metadata?.full_name) || qualityClean(auth.user?.user_metadata?.name) || qualityClean(auth.user?.email) || null;
}

export function qualityRouteError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected Quality API error.";
  if (message === "MOBILE_PROJECT_DENIED") return { status: 403, message: "You do not have access to this project." };
  if (message === "MOBILE_TOWER_NOT_FOUND") return { status: 404, message: "The selected tower could not be found in this project." };
  if (message === "MOBILE_PERMISSION_DENIED") return { status: 403, message: "You do not have permission to use this Quality workflow." };
  return { status: 500, message };
}

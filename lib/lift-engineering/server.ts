import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient, getRequestUser, userHasAccess } from "@/lib/access/server";

export const LIFT_ACCESS = {
  view: "tt.lift_engineering.view",
  createStudy: "tt.lift_engineering.studies.create",
  editStudy: "tt.lift_engineering.studies.edit",
  manageLibrary: "tt.lift_engineering.library.manage",
  review: "tt.lift_engineering.review",
  approve: "tt.lift_engineering.approve",
  manageSettings: "tt.lift_engineering.settings.manage",
} as const;

export async function requireLiftAccess(request: Request, code: string) {
  const user = await getRequestUser(request);
  const service = createServiceClient();
  if (!(await userHasAccess(service, user.id, code))) throw new Error("LIFT_FORBIDDEN");
  return { user, service };
}

export async function assertLiftProjectAccess(service: SupabaseClient, userId: string, projectId: string) {
  const { data, error } = await service.from("project_access").select("user_id")
    .eq("project_id", projectId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Project access check failed: ${error.message}`);
  if (!data) throw new Error("LIFT_PROJECT_FORBIDDEN");
}

export function liftApiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Lift Engineering request failed.";
  const status = message === "LIFT_FORBIDDEN" || message === "LIFT_PROJECT_FORBIDDEN" ? 403
    : /logged in|authentication token|session/i.test(message) ? 401
    : message.startsWith("LIFT_INVALID:") ? 400
    : 500;
  if (status === 500) console.error("Lift Engineering API", error);
  return { status, message: status === 403 ? "You do not have access to this Lift Engineering action or project."
    : status === 400 ? message.replace("LIFT_INVALID:", "") : status === 401 ? "You must be signed in." : "Lift Engineering request failed." };
}

export function liftInvalid(message: string): never { throw new Error(`LIFT_INVALID:${message}`); }

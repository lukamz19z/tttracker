import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveProjectUserLabels, type ProjectUserLabel } from "@/lib/materials/project-users";

/** The project's explicitly configured picker list, shared by Assign To and Also Notify. */
export async function configuredMaterialUsers(service: SupabaseClient, projectId: string): Promise<ProjectUserLabel[]> {
  const [{ data: members, error: memberError }, { data: configured, error: configuredError }] = await Promise.all([
    service.from("project_access").select("user_id").eq("project_id", projectId),
    service.from("project_material_notification_rules").select("user_id").eq("project_id", projectId).eq("available_for_selection", true),
  ]);
  if (memberError || configuredError) throw new Error(memberError?.message || configuredError?.message);
  const projectMemberIds = new Set((members || []).map(row => String(row.user_id || "")).filter(Boolean));
  const ids = [...new Set((configured || []).map(row => String(row.user_id || "")).filter(id => Boolean(id) && projectMemberIds.has(id)))];
  const users = await resolveProjectUserLabels(service, ids);
  return users.sort((a, b) => a.name.localeCompare(b.name));
}

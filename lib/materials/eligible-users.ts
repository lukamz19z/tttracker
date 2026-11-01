import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveProjectUserLabels, type ProjectUserLabel } from "@/lib/materials/project-users";
import { fullAccessUserIds } from "@/lib/access/server";

export type MaterialUserChoices = { assignmentUsers: ProjectUserLabel[]; notifyUsers: ProjectUserLabel[] };

export async function eligibleMaterialUsers(service: SupabaseClient, projectId: string): Promise<MaterialUserChoices> {
  const { data: access, error: accessError } = await service.from("project_access").select("user_id").eq("project_id", projectId);
  if (accessError) throw new Error(accessError.message);
  const projectMemberIds = new Set((access || []).map(row => String(row.user_id || "")).filter(Boolean));
  const fullAccessIds = await fullAccessUserIds(service);
  const projectUsers = [...new Set([...(access || []).map(row => String(row.user_id || "")), ...fullAccessIds].filter(Boolean))];
  let permissions: Array<{ user_id: string }> = [];
  if (projectUsers.length) {
    const result = await service.from("effective_user_permissions")
      .select("user_id,code,allowed")
      .in("user_id", projectUsers)
      .in("code", ["materials.manage_issues", "materials.configure"])
      .eq("allowed", true);
    if (result.error) throw new Error(result.error.message);
    permissions = result.data || [];
  }
  const assignmentIds = [...new Set([...permissions.map(row => String(row.user_id || "")), ...fullAccessIds])];
  const { data: configured, error: configuredError } = await service.from("project_material_notification_rules")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("available_for_selection", true);
  if (configuredError) throw new Error(configuredError.message);
  const notifyIds = [...new Set((configured || []).map(row => String(row.user_id || "")).filter(id => Boolean(id) && projectMemberIds.has(id)))];
  const labels = await resolveProjectUserLabels(service, [...new Set([...assignmentIds, ...notifyIds])]);
  const byId = new Map(labels.map(label => [label.id, label]));
  const sort = (ids: string[]) => ids.map(id => byId.get(id)).filter((value): value is ProjectUserLabel => Boolean(value)).sort((a, b) => a.name.localeCompare(b.name));
  return { assignmentUsers: sort(assignmentIds), notifyUsers: sort(notifyIds) };
}

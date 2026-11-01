import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveProjectUserLabels, type ProjectUserLabel } from "@/lib/materials/project-users";

export type MaterialUserChoices = { assignmentUsers: ProjectUserLabel[]; notifyUsers: ProjectUserLabel[] };

export async function eligibleMaterialUsers(service: SupabaseClient, projectId: string): Promise<MaterialUserChoices> {
  const [{ data: access, error: accessError }, { data: rules, error: rulesError }] = await Promise.all([
    service.from("project_access").select("user_id").eq("project_id", projectId),
    service.from("project_material_notification_rules").select("user_id").eq("project_id", projectId).eq("active", true),
  ]);
  if (accessError || rulesError) throw new Error(accessError?.message || rulesError?.message);
  const projectUsers = [...new Set((access || []).map(row => String(row.user_id || "")).filter(Boolean))];
  if (!projectUsers.length) return { assignmentUsers: [], notifyUsers: [] };
  const projectUserSet = new Set(projectUsers);
  const notifyIds = [...new Set((rules || []).map(row => String(row.user_id || "")).filter(id => projectUserSet.has(id)))];
  const { data: permissions, error: permissionError } = await service.from("effective_user_permissions")
    .select("user_id,code,allowed")
    .in("user_id", projectUsers)
    .in("code", ["materials.manage_issues", "materials.configure"])
    .eq("allowed", true);
  if (permissionError) throw new Error(permissionError.message);
  const assignmentIds = [...new Set((permissions || []).map(row => String(row.user_id || "")))];
  const allIds = [...new Set([...assignmentIds, ...notifyIds])];
  const labels = await resolveProjectUserLabels(service, allIds);
  const byId = new Map(labels.map(label => [label.id, label]));
  const sort = (ids: string[]) => ids.map(id => byId.get(id)).filter((value): value is ProjectUserLabel => Boolean(value)).sort((a, b) => a.name.localeCompare(b.name));
  return { assignmentUsers: sort(assignmentIds), notifyUsers: sort(notifyIds) };
}

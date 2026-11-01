import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveProjectUserLabels, type ProjectUserLabel } from "@/lib/materials/project-users";
import { fullAccessUserIds } from "@/lib/access/server";

export type MaterialUserChoices = { assignmentUsers: ProjectUserLabel[]; notifyUsers: ProjectUserLabel[] };

export async function eligibleMaterialUsers(service: SupabaseClient, projectId: string): Promise<MaterialUserChoices> {
  const { data: access, error: accessError } = await service.from("project_access").select("user_id").eq("project_id", projectId);
  if (accessError) throw new Error(accessError.message);
  const fullAccessIds = await fullAccessUserIds(service);
  const projectUsers = [...new Set([...(access || []).map(row => String(row.user_id || "")), ...fullAccessIds].filter(Boolean))];
  if (!projectUsers.length) return { assignmentUsers: [], notifyUsers: [] };
  const { data: permissions, error: permissionError } = await service.from("effective_user_permissions")
    .select("user_id,code,allowed")
    .in("user_id", projectUsers)
    .in("code", ["materials.manage_issues", "materials.configure"])
    .eq("allowed", true);
  if (permissionError) throw new Error(permissionError.message);
  const assignmentIds = [...new Set([...(permissions || []).map(row => String(row.user_id || "")), ...fullAccessIds])];
  // Manual assignment and per-issue notification are selection privileges.
  // They must not depend on project-wide automatic notification rules.
  const labels = await resolveProjectUserLabels(service, assignmentIds);
  const byId = new Map(labels.map(label => [label.id, label]));
  const sort = (ids: string[]) => ids.map(id => byId.get(id)).filter((value): value is ProjectUserLabel => Boolean(value)).sort((a, b) => a.name.localeCompare(b.name));
  const eligible = sort(assignmentIds);
  return { assignmentUsers: eligible, notifyUsers: eligible };
}

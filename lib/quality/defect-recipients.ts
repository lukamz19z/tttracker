import type { SupabaseClient } from "@supabase/supabase-js";

export function cleanDefectRecipientIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item ?? "").trim()).filter(Boolean))].slice(0, 20);
}

export async function assertProjectDefectRecipients(service: SupabaseClient, projectId: string, ids: string[]) {
  if (!ids.length) return;
  const [{ data: access, error: accessError }, { data: rules, error: ruleError }, { data: roles, error: roleError }] = await Promise.all([
    service.from("project_access").select("user_id").eq("project_id", projectId).in("user_id", ids),
    service.from("project_defect_notification_rules").select("user_id").eq("project_id", projectId).in("user_id", ids),
    service.from("user_roles").select("user_id,role").in("user_id", ids),
  ]);
  if (accessError || ruleError || roleError) throw new Error(accessError?.message || ruleError?.message || roleError?.message);
  const allowed = new Set<string>([...(access || []).map(row => String(row.user_id)), ...(rules || []).map(row => String(row.user_id))]);
  for (const row of roles || []) if (["admin", "administrator", "site_admin"].includes(String(row.role || "").toLowerCase())) allowed.add(String(row.user_id));
  const invalid = ids.filter(id => !allowed.has(id));
  if (invalid.length) throw new Error("Choose Defect recipients who have access to this project.");
}

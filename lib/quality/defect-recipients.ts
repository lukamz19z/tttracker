import type { SupabaseClient } from "@supabase/supabase-js";

export function cleanDefectRecipientIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item ?? "").trim()).filter(Boolean))].slice(0, 20);
}

export async function assertProjectDefectRecipients(service: SupabaseClient, projectId: string, ids: string[], grandfatherIds: string[] = []) {
  if (!ids.length) return;
  const { data: rules, error } = await service.from("project_defect_notification_rules").select("user_id").eq("project_id", projectId).eq("available_for_selection", true).in("user_id", ids);
  if (error) throw new Error(error.message);
  const allowed = new Set<string>((rules || []).map(row => String(row.user_id)));
  const grandfathered = new Set(grandfatherIds);
  const invalid = ids.filter(id => !allowed.has(id) && !grandfathered.has(id));
  if (invalid.length) throw new Error("Choose Defect recipients who have access to this project.");
}

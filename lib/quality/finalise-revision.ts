import type { SupabaseClient } from "@supabase/supabase-js";
export async function validateRevisionEvidence(service: SupabaseClient, revisionId: string) {
  const [items, files] = await Promise.all([
    service.from("tower_revision_items").select("id,item_number,issue_type_id,other_issue_text,status").eq("revision_id", revisionId),
    service.from("tower_quality_files").select("revision_item_id,file_role").eq("revision_id", revisionId),
  ]);
  if (items.error) throw new Error(items.error.message);
  if (files.error) throw new Error(files.error.message);
  if (!items.data?.length) return "Add at least one finding before finalising.";
  for (const item of items.data) {
    if (!item.issue_type_id && !item.other_issue_text) return `Finding ${item.item_number}: select an issue type.`;
    const roles = new Set(files.data?.filter(file => file.revision_item_id === item.id).map(file => file.file_role));
    if (!roles.has("before_photo")) return `Finding ${item.item_number}: Before evidence is required.`;
    if (!["Rectified", "Verified"].includes(item.status)) return `Finding ${item.item_number}: complete rectification before finalising.`;
    if (!roles.has("after_photo")) return `Finding ${item.item_number}: After evidence is required.`;
  }
  return null;
}

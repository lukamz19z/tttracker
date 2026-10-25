import type { SupabaseClient } from "@supabase/supabase-js";
import { revisionItemFli, revisionReference } from "./fli";
type Parent = Parameters<typeof revisionReference>[0];
type Item = Parameters<typeof revisionItemFli>[0] & { assigned_flag?: string | null; leg?: string | null; tower_segment?: string | null; member_number?: string | null; drawing_number?: string | null; other_issue_text?: string | null };
export function revisionEvidenceContext(parent: Parent,item: Item,tower: string | null,issue: string | null | undefined) {
  return { reference:revisionReference(parent),fli:revisionItemFli(item),tower,
    assignedFlag:item.assigned_flag,leg:item.leg,segment:item.tower_segment,
    member:item.member_number,drawing:item.drawing_number,issue:issue || item.other_issue_text };
}
/** Caller must enforce project access before loading evidence metadata. */
export async function loadRevisionEvidenceContext(service: SupabaseClient, projectId: string, revisionId: string, itemId: string) {
  const item = await service.from("tower_revision_items").select("*").eq("id",itemId).eq("revision_id",revisionId).eq("project_id",projectId).single();
  if (item.error || !item.data) throw new Error("Revision finding could not be resolved for evidence.");
  const row=item.data;
  const [parent,tower,issue] = await Promise.all([
    service.from("tower_revisions").select("revision_number,fli_number,sequence_no").eq("id",revisionId).eq("project_id",projectId).single(),
    service.from("towers").select("name").eq("id",row.tower_id).eq("project_id",projectId).single(),
    row.issue_type_id ? service.from("project_field_issue_types").select("name").eq("id",row.issue_type_id).maybeSingle() : Promise.resolve({data:null,error:null}),
  ]);
  for(const result of [parent,tower,issue]) if(result.error) throw new Error(result.error.message);
  if (!parent.data || !tower.data) throw new Error("Revision or tower could not be resolved for evidence.");
  return revisionEvidenceContext(parent.data,row,tower.data.name,issue.data?.name);
}

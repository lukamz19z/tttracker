import type { SupabaseClient } from "@supabase/supabase-js";
import { revisionItemFli, revisionReference } from "./fli";
import { loadQualityProject } from "./server";
import { qualityTimeZone } from "./date-time";
type Parent = Parameters<typeof revisionReference>[0];
type Item = Parameters<typeof revisionItemFli>[0] & { assigned_flag?: string | null; leg?: string | null; tower_segment?: string | null; member_number?: string | null; drawing_number?: string | null; other_issue_text?: string | null };
export function defectEvidenceContext(defect:Record<string,unknown>,tower:string|null|undefined,issue:string|null|undefined) {
  return {kind:"defect",reference:defect.defect_number,tower,leg:defect.leg,assignedFlag:defect.assigned_flag || defect.client_reference,segment:defect.segment,member:defect.member_number,drawing:defect.drawing_number,issue};
}
export async function loadDefectEvidenceContext(service:SupabaseClient,projectId:string,defectId:string) {
  const result=await service.from("tower_defects").select("*").eq("id",defectId).eq("project_id",projectId).single();
  if(result.error || !result.data) throw new Error("Defect could not be resolved for evidence.");
  const defect=result.data;
  const [tower,issue]=await Promise.all([
    service.from("towers").select("name").eq("id",defect.tower_id).eq("project_id",projectId).maybeSingle(),
    defect.issue_type_id?service.from("project_field_issue_types").select("name").eq("id",defect.issue_type_id).maybeSingle():Promise.resolve({data:null,error:null}),
  ]);
  if(tower.error || issue.error) throw new Error(tower.error?.message || issue.error?.message);
  const project=await loadQualityProject(service,projectId);
  return {...defectEvidenceContext(defect,tower.data?.name,issue.data?.name),project:project.project_number,timeZone:qualityTimeZone(project.timezone)};
}
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
  const project=await loadQualityProject(service,projectId);
  return {...revisionEvidenceContext(parent.data,row,tower.data.name,issue.data?.name),project:project.project_number,timeZone:qualityTimeZone(project.timezone)};
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { annotateEvidence,EVIDENCE_WATERMARK_VERSION,WATERMARK_POSITIONS,type WatermarkPosition } from "./evidence-watermark";
import { loadDefectEvidenceContext,loadRevisionEvidenceContext } from "./evidence-context";
import { loadQualityProject,loadQualityTower,qualityTowerLabel } from "./server";
import { qualityEvidenceName } from "./file-names";
import { ensureDefectPhotosFolder,ensureRevisionPhotoFolder,uploadQualityFile } from "@/lib/sharepoint/quality";
import { downloadDriveItemContent,ensureDriveFolder,renameDriveItem,moveDriveItem } from "@/lib/sharepoint/graph";

export type PublishedEvidence = {id:string;project_id:string;tower_id:string;revision_id:string|null;revision_item_id:string|null;defect_id:string|null;file_role:string;file_name:string;mime_type:string|null;sharepoint_drive_id:string;sharepoint_item_id:string;annotated_sharepoint_item_id?:string|null;captured_at:string|null;photo_no?:number|null;evidence_metadata?:Record<string,unknown>|null};
/** Upgrade old UUID names/tofu derivatives from original bytes, preserving IDs. */
export async function ensurePublishedQualityEvidence<T extends PublishedEvidence>(service:SupabaseClient,file:T):Promise<T> {
  if(!["before_photo","after_photo","defect_photo"].includes(file.file_role)) return file;
  if(file.evidence_metadata?.watermarkVersion===EVIDENCE_WATERMARK_VERSION && file.photo_no && file.annotated_sharepoint_item_id) return file;
  const [project,tower]=await Promise.all([loadQualityProject(service,file.project_id),loadQualityTower(service,file.tower_id,file.project_id)]);
  if(!project.sharepoint_drive_id || !project.sharepoint_folder_id) throw new Error("Project SharePoint destination is not configured.");
  const context=file.defect_id?await loadDefectEvidenceContext(service,file.project_id,file.defect_id):await loadRevisionEvidenceContext(service,file.project_id,String(file.revision_id),String(file.revision_item_id));
  const phase=file.file_role==="before_photo"?"BEFORE":file.file_role==="after_photo"?"AFTER":String(file.evidence_metadata?.phase || "EVIDENCE");
  const number=await service.rpc("claim_v1_quality_photo_number",{target_file:file.id,target_session:null,photo_phase:phase});
  if(number.error || !number.data) throw new Error(number.error?.message || "Evidence number could not be resolved.");
  const name=qualityEvidenceName(project.project_number,qualityTowerLabel(tower),context.reference,"fli" in context?context.fli:null,phase,Number(number.data));
  const base={driveId:project.sharepoint_drive_id,projectFolderId:project.sharepoint_folder_id,towerLabel:qualityTowerLabel(tower)};
  const folder=file.defect_id?await ensureDefectPhotosFolder({...base,defectNumber:String(context.reference)}):await ensureRevisionPhotoFolder({...base,fliNumber:String(context.reference),photoType:phase==="AFTER"?"after":"before"});
  const original=await downloadDriveItemContent({driveId:file.sharepoint_drive_id,itemId:file.sharepoint_item_id});
  const metadata={...context,project:project.project_number,phase,capturedAt:file.captured_at,position:file.evidence_metadata?.position || "bottom-left",watermarkVersion:EVIDENCE_WATERMARK_VERSION};
  const position:WatermarkPosition=WATERMARK_POSITIONS.includes(metadata.position as WatermarkPosition)?metadata.position as WatermarkPosition:"bottom-left";
  const jpeg=await annotateEvidence(original.content,metadata,position);
  const originals=await ensureDriveFolder({driveId:base.driveId,parentItemId:folder.id,name:"Originals"});
  await renameDriveItem({driveId:file.sharepoint_drive_id,itemId:file.sharepoint_item_id,name:`ORIGINAL_${name.replace(/\.jpg$/,original.contentType.includes("png")?".png":".jpg")}`});
  await moveDriveItem({driveId:file.sharepoint_drive_id,itemId:file.sharepoint_item_id,parentItemId:originals.id});
  if(file.annotated_sharepoint_item_id) {
    await renameDriveItem({driveId:base.driveId,itemId:file.annotated_sharepoint_item_id,name});
    await moveDriveItem({driveId:base.driveId,itemId:file.annotated_sharepoint_item_id,parentItemId:folder.id});
  }
  const uploaded=await uploadQualityFile({driveId:base.driveId,folderId:folder.id,fileName:name,content:jpeg,contentType:"image/jpeg"});
  const patch={file_name:name,mime_type:"image/jpeg",sharepoint_folder_id:folder.id,annotated_sharepoint_item_id:uploaded.id,sharepoint_web_url:uploaded.webUrl,evidence_metadata:metadata,photo_no:Number(number.data),evidence_type:phase};
  const saved=await service.from("tower_quality_files").update(patch).eq("id",file.id);
  if(saved.error) throw new Error(saved.error.message);
  return {...file,...patch};
}

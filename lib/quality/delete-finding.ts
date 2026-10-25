import { NextRequest, NextResponse } from "next/server";
import { assertQualityProjectAccess, qualityApiError, requireQualityUser } from "./server";
import { revisionItemFli } from "./fli";
import { deleteDriveItem } from "@/lib/sharepoint/graph";
import { requireMobilePermission } from "@/lib/mobile/server";
import { cleanupQualityUploadSessions } from "./upload-cleanup";

/** Shared controlled deletion; keep metadata on provider failures for safe retry. */
export async function deleteFinding(request: NextRequest, context: {params:Promise<{revisionId:string;itemId:string}>}) {
  try {
    await requireMobilePermission(request,"mobile.rectifications");
    const {service,user,role}=await requireQualityUser(request);
    const {revisionId,itemId}=await context.params;
    const parent=await service.from("tower_revisions").select("project_id,status,finalised_at").eq("id",revisionId).maybeSingle();
    if(parent.error) throw new Error(parent.error.message);
    if(!parent.data) return NextResponse.json({error:"Revision not found."},{status:404});
    await assertQualityProjectAccess({service,userId:user.id,role,projectId:parent.data.project_id});
    if(parent.data.finalised_at || !["Draft","Open","In Progress"].includes(parent.data.status)) return NextResponse.json({error:"Submitted or finalised evidence is locked. Use the authorised correction workflow."},{status:409});
    const item=await service.from("tower_revision_items").select("id,item_number,fli_number,status").eq("id",itemId).eq("revision_id",revisionId).maybeSingle();
    if(item.error) throw new Error(item.error.message);
    if(!item.data) return NextResponse.json({deleted:true});
    if(item.data.status==="Verified") return NextResponse.json({error:"Verified findings require an authorised correction workflow."},{status:409});
    const body=await request.json();
    if(body.confirm!==revisionItemFli(item.data)) return NextResponse.json({error:"Confirm the specific FLI before deletion."},{status:400});
    await cleanupQualityUploadSessions(service,{itemId});
    const files=await service.from("tower_quality_files").select("id,sharepoint_drive_id,sharepoint_item_id,annotated_sharepoint_item_id").eq("revision_id",revisionId).or(`revision_item_id.eq.${itemId},file_role.eq.revision_pdf`);
    if(files.error) throw new Error(files.error.message);
    for(const file of files.data || []) {
      for(const id of new Set([file.sharepoint_item_id,file.annotated_sharepoint_item_id].filter(Boolean))) {
        if(!file.sharepoint_drive_id) throw new Error("Evidence storage reference is missing; deletion was retained for reconciliation.");
        try { await deleteDriveItem({driveId:file.sharepoint_drive_id,itemId:id}); }
        catch(error) { if(!/\(404\b/.test(error instanceof Error?error.message:"")) throw error; }
      }
    }
    const invalidated=await service.from("tower_revisions").update({latest_pdf_file_id:null,finalised_at:null}).eq("id",revisionId);
    if(invalidated.error) throw new Error(invalidated.error.message);
    if(files.data?.length) { const removed=await service.from("tower_quality_files").delete().in("id",files.data.map(file=>file.id));if(removed.error) throw new Error(removed.error.message); }
    const removed=await service.from("tower_revision_items").delete().eq("id",itemId).eq("revision_id",revisionId);
    if(removed.error) throw new Error(removed.error.message);
    return NextResponse.json({deleted:true});
  } catch(error) {const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status});}
}

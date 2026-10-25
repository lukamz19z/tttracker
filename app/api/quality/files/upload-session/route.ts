import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { assertQualityProjectAccess, loadQualityProject, loadQualityTower, qualityApiError, qualityTowerLabel, requireQualityUser } from "@/lib/quality/server";
import { ensureDefectPhotosFolder, ensureRevisionPhotoFolder } from "@/lib/sharepoint/quality";
import { graphRequest } from "@/lib/sharepoint/graph";
import { revisionReference } from "@/lib/quality/fli";
import { signQualityUpload } from "@/lib/quality/upload-ticket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const { service,user,role } = await requireQualityUser(request);
    const body = await request.json();
    const text = (key: string) => String(body[key] || "").trim();
    const projectId=text("projectId"),towerId=text("towerId"),defectId=text("defectId"),revisionId=text("revisionId"),revisionItemId=text("revisionItemId"),fileRole=text("fileRole");
    const size=Number(body.size),mimeType=text("mimeType");
    if (!projectId || !towerId || !text("clientMutationId") || !["image/jpeg","image/png"].includes(mimeType) || !Number.isSafeInteger(size) || size < 1) return NextResponse.json({error:"Invalid Quality photo upload."},{status:400});
    if (size>25*1024*1024) return NextResponse.json({error:"Original photo exceeds the 25 MB evidence limit. Choose a smaller photo; the original has been retained locally."},{status:413});
    await assertQualityProjectAccess({service,userId:user.id,role,projectId});
    const mutationKey=`${revisionItemId || defectId}:${fileRole}:${text("clientMutationId")}`;
    const existing=await service.from("tower_quality_files").select("id").eq("project_id",projectId).eq("mobile_client_mutation_id",mutationKey).maybeSingle();
    if(existing.error) throw new Error(existing.error.message);
    if(existing.data) return NextResponse.json({file:existing.data});
    const [project,tower]=await Promise.all([loadQualityProject(service,projectId),loadQualityTower(service,towerId,projectId)]);
    if (!project.sharepoint_drive_id || !project.sharepoint_folder_id) return NextResponse.json({error:"Project SharePoint storage is not configured."},{status:409});
    const base={driveId:project.sharepoint_drive_id,projectFolderId:project.sharepoint_folder_id,towerLabel:qualityTowerLabel(tower)};
    let folder: {id:string};
    if (fileRole==="defect_photo" && defectId && !revisionId && !revisionItemId) {
      const result=await service.from("tower_defects").select("defect_number,status").eq("id",defectId).eq("project_id",projectId).eq("tower_id",towerId).maybeSingle();
      if(result.error) throw new Error(result.error.message);
      if(!result.data?.defect_number) return NextResponse.json({error:"Defect not found."},{status:404});
      if(result.data.status==="Closed") return NextResponse.json({error:"Reopen the Defect before changing evidence."},{status:409});
      folder=await ensureDefectPhotosFolder({...base,defectNumber:result.data.defect_number});
    } else if (["before_photo","after_photo"].includes(fileRole) && revisionId && revisionItemId && !defectId) {
      const parent=await service.from("tower_revisions").select("revision_number,fli_number,sequence_no,status,finalised_at").eq("id",revisionId).eq("project_id",projectId).eq("tower_id",towerId).maybeSingle();
      const item=await service.from("tower_revision_items").select("id,fli_number").eq("id",revisionItemId).eq("revision_id",revisionId).maybeSingle();
      if(parent.error || item.error) throw new Error(parent.error?.message || item.error?.message);
      if(!parent.data || !item.data?.fli_number) return NextResponse.json({error:"Revision finding must sync before evidence."},{status:409});
      if(parent.data.finalised_at || !["Draft","Open","In Progress"].includes(parent.data.status)) return NextResponse.json({error:"Controlled Revision evidence cannot be changed."},{status:409});
      folder=await ensureRevisionPhotoFolder({...base,fliNumber:revisionReference(parent.data),photoType:fileRole==="before_photo"?"before":"after"});
    } else return NextResponse.json({error:"Invalid evidence relationship."},{status:400});
    const suffix=createHash("sha256").update(`${user.id}:${revisionItemId || defectId}:${fileRole}:${text("clientMutationId")}`).digest("hex").slice(0,24);
    const stagingName=`PENDING-${suffix}.${mimeType==="image/png"?"png":"jpg"}`;
    const tracked=await service.from("tower_quality_upload_sessions").upsert({idempotency_key:suffix,project_id:projectId,tower_id:towerId,user_id:user.id,revision_id:revisionId||null,revision_item_id:revisionItemId||null,defect_id:defectId||null,drive_id:base.driveId,folder_id:folder.id,staging_name:stagingName},{onConflict:"idempotency_key"}).select("id").single();
    if(tracked.error || !tracked.data) throw new Error(tracked.error?.message || "Evidence transfer receipt was not saved.");
    const session=await graphRequest<{uploadUrl:string;expirationDateTime:string}>(`/drives/${encodeURIComponent(base.driveId)}/items/${encodeURIComponent(folder.id)}:/${encodeURIComponent(stagingName)}:/createUploadSession`,{method:"POST",body:JSON.stringify({item:{"@microsoft.graph.conflictBehavior":"replace",name:stagingName}})});
    if(!session.uploadUrl?.startsWith("https://") || !Number.isFinite(Date.parse(session.expirationDateTime))) throw new Error("Evidence provider did not return a valid expiring upload session.");
    const ticket=signQualityUpload({sessionId:tracked.data.id,userId:user.id,projectId,towerId,defectId,revisionId,revisionItemId,fileRole,evidencePhase:["BEFORE","AFTER","EVIDENCE"].includes(text("evidencePhase"))?text("evidencePhase"):"EVIDENCE",clientMutationId:text("clientMutationId"),watermarkPosition:text("watermarkPosition")||"bottom-left",capturedAt:text("capturedAt"),driveId:base.driveId,folderId:folder.id,stagingName,name:text("name"),mimeType,size,expires:Math.min(Date.now()+60*60*1000,Date.parse(session.expirationDateTime))});
    // uploadUrl is a short-lived capability for this one file, not a Graph token.
    return NextResponse.json({uploadUrl:session.uploadUrl,ticket},{headers:{"Cache-Control":"no-store"}});
  } catch(error) { const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status}); }
}

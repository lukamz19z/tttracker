import { NextResponse } from "next/server";
import { userHasAccess } from "@/lib/access/server";
import { ensureDriveFolder, uploadDriveItemContent } from "@/lib/sharepoint/graph";
import { assertQualityProjectAccess, loadQualityTower, qualityApiError, qualityTowerLabel, requireQualityUser } from "@/lib/quality/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const bucket="materials-evidence";
const clean=(value:unknown)=>String(value??"").trim();
const safeName=(value:string)=>value.replace(/[<>:"/\\|?*\u0000-\u001f]/g,"-").replace(/\s+/g,"-").slice(0,120)||"receipt-file";
const photoTypes=new Set(["image/jpeg","image/png","application/pdf"]);

export async function GET(request:Request){
  try{
    const url=new URL(request.url),projectId=clean(url.searchParams.get("projectId")),issueKey=clean(url.searchParams.get("issueKey"));if(!projectId||!issueKey)return NextResponse.json({error:"Project and issue are required."},{status:400});
    const {service,user,role}=await requireQualityUser(request);await assertQualityProjectAccess({service,userId:user.id,role,projectId});
    const {data:item,error:itemError}=await service.from("tower_material_event_items").select("event_id").eq("issue_key",issueKey).maybeSingle();if(itemError)throw new Error(itemError.message);if(!item)return NextResponse.json({error:"Missing material was not found."},{status:404});
    const {data:files,error}=await service.from("tower_material_receipt_files").select("id,receipt_event_id,file_name,mime_type,file_size_bytes,uploaded_by_user_id,uploaded_at,sharepoint_web_url,storage_bucket,storage_path").eq("missing_event_id",item.event_id).eq("project_id",projectId).order("uploaded_at");if(error)throw new Error(error.message);
    const result=await Promise.all((files||[]).map(async row=>{if(row.sharepoint_web_url)return {...row,preview_url:row.sharepoint_web_url};const {data:signed,error:signedError}=await service.storage.from(row.storage_bucket).createSignedUrl(row.storage_path,300);if(signedError)throw new Error(signedError.message);return {...row,preview_url:signed.signedUrl};}));
    return NextResponse.json({files:result});
  }catch(error){const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status});}
}

export async function POST(request:Request){
  try{
    const {service,user,role}=await requireQualityUser(request);const form=await request.formData();
    const projectId=clean(form.get("projectId")),issueKey=clean(form.get("issueKey")),receiptMutationId=clean(form.get("receiptMutationId")),receiptEventId=clean(form.get("receiptEventId")),clientEvidenceId=clean(form.get("clientEvidenceId"));
    const file=form.get("file");if(!projectId||!issueKey||(!receiptMutationId&&!receiptEventId)||!clientEvidenceId||!(file instanceof File)||file.size<1)return NextResponse.json({error:"Project, issue, receipt, evidence ID and file are required."},{status:400});
    if(file.size>25*1024*1024||!photoTypes.has(file.type))return NextResponse.json({error:"Receipt evidence must be a JPEG, PNG or PDF up to 25 MB."},{status:413});
    await assertQualityProjectAccess({service,userId:user.id,role,projectId});
    const allowed=await Promise.all([userHasAccess(service,user.id,"materials.manage_issues"),userHasAccess(service,user.id,"mobile.materials")]);if(!allowed.some(Boolean))return NextResponse.json({error:"You do not have permission to upload Materials evidence."},{status:403});
    const {data:item,error:itemError}=await service.from("tower_material_event_items").select("event_id,source_issue_key").eq("issue_key",issueKey).maybeSingle();if(itemError)throw new Error(itemError.message);if(!item)return NextResponse.json({error:"Missing material was not found."},{status:404});
    const {data:parent,error:parentError}=await service.from("tower_material_events").select("id,tower_id,project_id").eq("id",item.event_id).eq("project_id",projectId).maybeSingle();if(parentError)throw new Error(parentError.message);if(!parent)return NextResponse.json({error:"Missing-material project relationship is invalid."},{status:404});
    const receiptQuery=service.from("tower_material_events").select("id,client_mutation_id,event_type").eq("project_id",projectId).eq("event_type","found_received");
    const {data:receipt,error:receiptError}=receiptMutationId?await receiptQuery.eq("client_mutation_id",receiptMutationId).maybeSingle():await receiptQuery.eq("id",receiptEventId).maybeSingle();if(receiptError)throw new Error(receiptError.message);if(!receipt||receipt.id===parent.id)return NextResponse.json({error:"The receipt must sync before its evidence."},{status:409});
    const {data:receiptItem,error:receiptItemError}=await service.from("tower_material_event_items").select("id").eq("event_id",receipt.id).eq("source_issue_key",issueKey).maybeSingle();if(receiptItemError)throw new Error(receiptItemError.message);if(!receiptItem)return NextResponse.json({error:"Receipt does not belong to this Missing Material requirement."},{status:409});
    const {data:existing,error:existingError}=await service.from("tower_material_receipt_files").select("*").eq("project_id",projectId).eq("client_evidence_id",clientEvidenceId).maybeSingle();if(existingError)throw new Error(existingError.message);if(existing)return NextResponse.json({file:existing,duplicate:true});
    const name=safeName(file.name),bytes=new Uint8Array(await file.arrayBuffer()),storagePath=`${projectId}/${parent.tower_id}/${issueKey}/${receipt.id}/${clientEvidenceId}-${name}`;
    const {error:storeError}=await service.storage.from(bucket).upload(storagePath,bytes,{contentType:file.type,upsert:true});if(storeError)throw new Error(`Receipt evidence could not be stored: ${storeError.message}`);
    let driveId:string|null=null,sharepointItemId:string|null=null,sharepointWebUrl:string|null=null;
    const {data:storage,error:storageError}=await service.from("project_material_workflow_settings").select("evidence_sharepoint_drive_id,evidence_sharepoint_folder_id").eq("project_id",projectId).maybeSingle();if(storageError)throw new Error(storageError.message);
    if(storage?.evidence_sharepoint_drive_id&&storage?.evidence_sharepoint_folder_id){
      try{const tower=await loadQualityTower(service,parent.tower_id,projectId);let folder=await ensureDriveFolder({driveId:storage.evidence_sharepoint_drive_id,parentItemId:storage.evidence_sharepoint_folder_id,name:"Missing Materials"});folder=await ensureDriveFolder({driveId:storage.evidence_sharepoint_drive_id,parentItemId:folder.id,name:qualityTowerLabel(tower)});folder=await ensureDriveFolder({driveId:storage.evidence_sharepoint_drive_id,parentItemId:folder.id,name:safeName(issueKey)});folder=await ensureDriveFolder({driveId:storage.evidence_sharepoint_drive_id,parentItemId:folder.id,name:"Receipts"});const published=await uploadDriveItemContent({driveId:storage.evidence_sharepoint_drive_id,parentItemId:folder.id,fileName:`${safeName(clientEvidenceId)}-${receipt.id}-${name}`,content:bytes,contentType:file.type});driveId=storage.evidence_sharepoint_drive_id;sharepointItemId=published.id;sharepointWebUrl=published.webUrl||null;}catch(error){await service.storage.from(bucket).remove([storagePath]);throw new Error(`Receipt evidence upload to configured SharePoint failed: ${error instanceof Error?error.message:"unknown error"}`);}
    }
    const {data:saved,error:savedError}=await service.from("tower_material_receipt_files").insert({project_id:projectId,tower_id:parent.tower_id,missing_event_id:parent.id,receipt_event_id:receipt.id,client_evidence_id:clientEvidenceId,file_name:name,mime_type:file.type,file_size_bytes:file.size,uploaded_by_user_id:user.id,storage_bucket:bucket,storage_path:storagePath,sharepoint_drive_id:driveId,sharepoint_item_id:sharepointItemId,sharepoint_web_url:sharepointWebUrl}).select("*").single();if(savedError||!saved)throw new Error(savedError?.message||"Receipt evidence metadata was not saved.");
    return NextResponse.json({file:saved});
  }catch(error){const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status});}
}

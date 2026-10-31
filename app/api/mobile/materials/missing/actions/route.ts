import { NextResponse } from "next/server";
import { userHasAccess } from "@/lib/access/server";
import { notifyMissingMaterialEvent } from "@/lib/materials/missing-notifications";
import { qualityApiError, requireQualityUser } from "@/lib/quality/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const clean=(value:unknown)=>String(value??"").trim();

export async function GET(request:Request){
  try{
    const url=new URL(request.url),projectId=clean(url.searchParams.get("projectId")),issueKey=clean(url.searchParams.get("issueKey"));
    if(!projectId||!issueKey)return NextResponse.json({error:"Project and issue are required."},{status:400});
    const {service,user}=await requireQualityUser(request);const [canView,member]=await Promise.all([userHasAccess(service,user.id,"materials.issues.view"),service.from("project_access").select("user_id").eq("project_id",projectId).eq("user_id",user.id).maybeSingle()]);
    if(!canView&&!member.data)return NextResponse.json({error:"You do not have access to this project."},{status:403});
    const {data:item,error:itemError}=await service.from("tower_material_event_items").select("event_id,issue_key").eq("issue_key",issueKey).maybeSingle();if(itemError)throw new Error(itemError.message);if(!item)return NextResponse.json({error:"Missing material was not found."},{status:404});
    const {data:event,error:eventError}=await service.from("tower_material_events").select("id,project_id,tower_id,issue_status,assigned_to_user_id,notify_user_ids,urgency,required_by,cancelled_at,cancelled_by_user_id,cancellation_reason,tower_material_event_items(*)").eq("id",item.event_id).eq("project_id",projectId).maybeSingle();if(eventError)throw new Error(eventError.message);if(!event)return NextResponse.json({error:"Missing material was not found."},{status:404});
    const [{data:actions,error:actionsError},{data:files,error:filesError},{data:allReceipts,error:receiptsError}]=await Promise.all([
      service.from("tower_material_event_actions").select("id,action_type,body,previous_assignee_id,assigned_to_user_id,created_by_user_id,created_at").eq("material_event_id",item.event_id).order("created_at"),
      service.from("tower_material_receipt_files").select("id,receipt_event_id,file_name,mime_type,file_size_bytes,uploaded_by_user_id,uploaded_at,sharepoint_web_url,storage_bucket,storage_path").eq("missing_event_id",item.event_id).eq("project_id",projectId).order("uploaded_at"),
      service.from("tower_material_events").select("id,occurred_at,delivery_reference,notes,created_by_user_id,tower_material_event_items(source_issue_key,quantity,unit)").eq("project_id",projectId).eq("tower_id",event.tower_id).eq("event_type","found_received").order("occurred_at"),
    ]);if(actionsError||filesError||receiptsError)throw new Error(actionsError?.message||filesError?.message||receiptsError?.message);
    const receipts=(allReceipts||[]).filter(receipt=>(receipt.tower_material_event_items||[]).some(receiptItem=>receiptItem.source_issue_key===issueKey));
    const signed=await Promise.all((files||[]).map(async file=>{if(file.sharepoint_web_url)return {...file,preview_url:file.sharepoint_web_url};const {data,error}=await service.storage.from(file.storage_bucket).createSignedUrl(file.storage_path,300);if(error)throw new Error(error.message);return {...file,preview_url:data.signedUrl};}));
    return NextResponse.json({event,actions:actions||[],files:signed,receipts});
  }catch(error){const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status});}
}

export async function POST(request:Request){
  try{
    const {service,user}=await requireQualityUser(request);const body=await request.json() as Record<string,unknown>;
    const projectId=clean(body.projectId),towerId=clean(body.towerId),issueKey=clean(body.issueKey),clientMutationId=clean(body.clientMutationId),actionType=clean(body.actionType),text=clean(body.text),assignedToUserId=clean(body.assignedToUserId)||null;
    if(!projectId||!towerId||!issueKey||!clientMutationId||!(["update","assignment","cancel"].includes(actionType)))return NextResponse.json({error:"Project, tower, issue, mutation ID and action are required."},{status:400});
    if(["update","cancel"].includes(actionType)&&!text)return NextResponse.json({error:actionType==="cancel"?"Enter a cancellation reason.":"Enter an update."},{status:400});
    const permission=await Promise.all([userHasAccess(service,user.id,"materials.manage_issues"),userHasAccess(service,user.id,"mobile.materials"),service.from("project_access").select("user_id").eq("project_id",projectId).eq("user_id",user.id).maybeSingle()]);
    if(!permission[2].data||(!permission[0]&&!permission[1]))return NextResponse.json({error:"You do not have permission to change Missing Materials."},{status:403});
    if(assignedToUserId){const {data:assignee,error}=await service.from("project_access").select("user_id").eq("project_id",projectId).eq("user_id",assignedToUserId).maybeSingle();if(error)throw new Error(error.message);if(!assignee)return NextResponse.json({error:"Assigned user must belong to this project."},{status:400});}
    const notifyUserIds=Array.isArray(body.notifyUserIds)?[...new Set(body.notifyUserIds.map(clean).filter(Boolean))]:null;
    if(notifyUserIds?.length){const {data:recipients,error}=await service.from("project_access").select("user_id").eq("project_id",projectId).in("user_id",notifyUserIds);if(error)throw new Error(error.message);if((recipients||[]).length!==notifyUserIds.length)return NextResponse.json({error:"Additional recipients must belong to this project."},{status:400});}
    const {data:result,error}=await service.rpc("tttracker_v1_missing_material_action",{p_project_id:projectId,p_tower_id:towerId,p_issue_key:issueKey,p_client_mutation_id:clientMutationId,p_action_type:actionType,p_body:text,p_user_id:user.id,p_assigned_to_user_id:assignedToUserId,p_notify_user_ids:notifyUserIds});if(error)throw new Error(error.message);
    const action=result as {action_id:string;event_id:string;duplicate:boolean};
    const {data:row,error:rowError}=await service.from("tower_material_event_actions").select("id,material_event_id,action_type,body,previous_assignee_id,assigned_to_user_id").eq("id",action.action_id).maybeSingle();if(rowError||!row)throw new Error(rowError?.message||"Material action was committed without an action ID.");
    if(row.action_type==="assignment"&&row.previous_assignee_id!==row.assigned_to_user_id)await notifyMissingMaterialEvent({service,projectId,sourceEventId:row.material_event_id,issueEventId:row.material_event_id,kind:"assignment",actorUserId:user.id,actionId:row.id,assignedToUserId:row.assigned_to_user_id});
    if(row.action_type==="update")await notifyMissingMaterialEvent({service,projectId,sourceEventId:row.material_event_id,issueEventId:row.material_event_id,kind:"update",actorUserId:user.id,actionId:row.id,note:row.body});
    if(row.action_type==="cancel")await notifyMissingMaterialEvent({service,projectId,sourceEventId:row.material_event_id,issueEventId:row.material_event_id,kind:"cancelled",actorUserId:user.id,actionId:row.id,cancellationReason:row.body});
    return NextResponse.json({ok:true,action:{...action,action_id:row.id}});
  }catch(error){const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status});}
}

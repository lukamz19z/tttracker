import { NextResponse } from "next/server";
import { userHasAccess } from "@/lib/access/server";
import { notifyMissingMaterialEvent } from "@/lib/materials/missing-notifications";
import { configuredMaterialUsers } from "@/lib/materials/configured-users";
import { resolveProjectUserLabels } from "@/lib/materials/project-users";
import { qualityApiError, requireQualityUser } from "@/lib/quality/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const clean=(value:unknown)=>String(value??"").trim();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request:Request){
  try{
    const url=new URL(request.url),projectId=clean(url.searchParams.get("projectId")),requestedIssueKey=clean(url.searchParams.get("issueKey")),eventId=clean(url.searchParams.get("eventId"));
    if(!projectId||(!requestedIssueKey&&!eventId))return NextResponse.json({error:"Project and material record are required."},{status:400});
    const {service,user}=await requireQualityUser(request);const [canView,member]=await Promise.all([userHasAccess(service,user.id,"materials.issues.view"),service.from("project_access").select("user_id").eq("project_id",projectId).eq("user_id",user.id).maybeSingle()]);
    if(!canView&&!member.data)return NextResponse.json({error:"You do not have access to this project."},{status:403});
    let issueKey=requestedIssueKey;
    if(!issueKey&&eventId){const {data:source,error:sourceError}=await service.from("tower_material_events").select("id,project_id,event_type,tower_material_event_items(issue_key,source_issue_key)").eq("id",eventId).eq("project_id",projectId).maybeSingle();if(sourceError)throw new Error(sourceError.message);const sourceItem=source?.tower_material_event_items?.[0];issueKey=clean(sourceItem?.issue_key||sourceItem?.source_issue_key);}
    const {data:item,error:itemError}=await service.from("tower_material_event_items").select("event_id,issue_key").eq("issue_key",issueKey).maybeSingle();if(itemError)throw new Error(itemError.message);if(!item)return NextResponse.json({error:"Missing material was not found."},{status:404});
    const {data:event,error:eventError}=await service.from("tower_material_events").select("id,project_id,tower_id,issue_status,assigned_to_user_id,notify_user_ids,urgency,required_by,cancelled_at,cancelled_by_user_id,cancellation_reason,tower_material_event_items(*)").eq("id",item.event_id).eq("project_id",projectId).maybeSingle();if(eventError)throw new Error(eventError.message);if(!event)return NextResponse.json({error:"Missing material was not found."},{status:404});
    const [{data:actions,error:actionsError},{data:files,error:filesError},{data:receipts,error:receiptsError}]=await Promise.all([
      service.from("tower_material_event_actions").select("id,action_type,body,previous_assignee_id,assigned_to_user_id,created_by_user_id,created_at").eq("material_event_id",item.event_id).order("created_at"),
      service.from("tower_material_receipt_files").select("id,receipt_event_id,file_name,mime_type,file_size_bytes,uploaded_by_user_id,uploaded_at,sharepoint_web_url,storage_bucket,storage_path").eq("missing_event_id",item.event_id).eq("project_id",projectId).order("uploaded_at"),
      service.from("tower_material_events").select("id,event_type,occurred_at,delivery_reference,notes,created_by_user_id,tower_material_event_items!inner(source_issue_key,quantity,unit)").eq("project_id",projectId).eq("tower_id",event.tower_id).in("event_type",["found_received","excess_collected"]).eq("tower_material_event_items.source_issue_key",issueKey).order("occurred_at"),
    ]);if(actionsError||filesError||receiptsError)throw new Error(actionsError?.message||filesError?.message||receiptsError?.message);
    const signed=await Promise.all((files||[]).map(async file=>{if(file.sharepoint_web_url)return {...file,preview_url:file.sharepoint_web_url};const {data,error}=await service.storage.from(file.storage_bucket).createSignedUrl(file.storage_path,300);if(error)throw new Error(error.message);return {...file,preview_url:data.signedUrl};}));
    const identityIds=[event.assigned_to_user_id,...(Array.isArray(event.notify_user_ids)?event.notify_user_ids:[]),...(actions||[]).flatMap(row=>[row.created_by_user_id,row.previous_assignee_id,row.assigned_to_user_id])].map(clean).filter(Boolean);
    const identityLabels=await resolveProjectUserLabels(service,identityIds),labelsById=new Map(identityLabels.map(row=>[row.id,row.name]));
    const assigned_to_label=clean(event.assigned_to_user_id)?labelsById.get(clean(event.assigned_to_user_id))||"Project user":"";
    const notify_user_labels=identityLabels.filter(row=>Array.isArray(event.notify_user_ids)&&event.notify_user_ids.includes(row.id));
    const labeledActions=(actions||[]).map(row=>({...row,author_label:labelsById.get(clean(row.created_by_user_id))||"Project user",assigned_to_label:labelsById.get(clean(row.assigned_to_user_id))||"",previous_assignee_label:labelsById.get(clean(row.previous_assignee_id))||""}));
    return NextResponse.json({event:{...event,assigned_to_label,notify_user_labels},issueKey,actions:labeledActions,files:signed,receipts:receipts||[]});
  }catch(error){const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status});}
}

export async function POST(request:Request){
  try{
    const {service,user}=await requireQualityUser(request);const body=await request.json() as Record<string,unknown>;
    const projectId=clean(body.projectId),towerId=clean(body.towerId),issueKey=clean(body.issueKey),clientMutationId=clean(body.clientMutationId),actionType=clean(body.actionType),text=clean(body.text),assignedToUserId=clean(body.assignedToUserId)||null;
    if(issueKey&&!UUID.test(issueKey))return NextResponse.json({error:"The missing-material item ID is invalid. Refresh the Materials list and retry."},{status:400});
    if(!projectId||!towerId||!issueKey||!clientMutationId||!(["update","assignment","cancel"].includes(actionType)))return NextResponse.json({error:"Project, tower, issue, mutation ID and action are required."},{status:400});
    if(["update","cancel"].includes(actionType)&&!text)return NextResponse.json({error:actionType==="cancel"?"Enter a cancellation reason.":"Enter an update."},{status:400});
    const permission=await Promise.all([userHasAccess(service,user.id,"materials.manage_issues"),userHasAccess(service,user.id,"mobile.materials"),service.from("project_access").select("user_id").eq("project_id",projectId).eq("user_id",user.id).maybeSingle()]);
    if(!permission[2].data||(!permission[0]&&!permission[1]))return NextResponse.json({error:"You do not have permission to change Missing Materials."},{status:403});
    const materialUsers=await configuredMaterialUsers(service,projectId);
    const notifyUserIds=Array.isArray(body.notifyUserIds)?[...new Set(body.notifyUserIds.map(clean).filter(Boolean))]:null;
    const {data:existingItem,error:existingItemError}=await service.from("tower_material_event_items").select("event_id").eq("issue_key",issueKey).maybeSingle();if(existingItemError)throw new Error(existingItemError.message);
    let previouslySelected=new Set<string>(),previousAssigneeId="";
    if(existingItem?.event_id){const {data:existingEvent,error:existingEventError}=await service.from("tower_material_events").select("assigned_to_user_id,notify_user_ids").eq("id",existingItem.event_id).eq("project_id",projectId).maybeSingle();if(existingEventError)throw new Error(existingEventError.message);previousAssigneeId=clean(existingEvent?.assigned_to_user_id);previouslySelected=new Set(Array.isArray(existingEvent?.notify_user_ids)?existingEvent.notify_user_ids.map(clean):[]);}
    if(assignedToUserId&&!materialUsers.some(row=>row.id===assignedToUserId)&&assignedToUserId!==previousAssigneeId)return NextResponse.json({error:"Choose a new assignee from this project's configured Materials users."},{status:400});
    if(notifyUserIds?.some(id=>!materialUsers.some(row=>row.id===id)&&!previouslySelected.has(id)))return NextResponse.json({error:"New additional recipients must be selected from this project's configured Materials users."},{status:400});
    const {data:result,error}=await service.rpc("tttracker_v1_missing_material_action",{p_project_id:projectId,p_tower_id:towerId,p_issue_key:issueKey,p_client_mutation_id:clientMutationId,p_action_type:actionType,p_body:text,p_user_id:user.id,p_assigned_to_user_id:assignedToUserId,p_notify_user_ids:notifyUserIds});if(error)throw new Error(error.message);
    const action=result as {action_id:string;event_id:string;duplicate:boolean};
    const {data:row,error:rowError}=await service.from("tower_material_event_actions").select("id,material_event_id,action_type,body,previous_assignee_id,assigned_to_user_id").eq("id",action.action_id).maybeSingle();if(rowError||!row)throw new Error(rowError?.message||"Material action was committed without an action ID.");
    if(row.action_type==="assignment"&&row.previous_assignee_id!==row.assigned_to_user_id)await notifyMissingMaterialEvent({service,projectId,sourceEventId:row.material_event_id,issueEventId:row.material_event_id,kind:"assignment",actorUserId:user.id,actionId:row.id,assignedToUserId:row.assigned_to_user_id});
    if(row.action_type==="update")await notifyMissingMaterialEvent({service,projectId,sourceEventId:row.material_event_id,issueEventId:row.material_event_id,kind:"update",actorUserId:user.id,actionId:row.id,note:row.body});
    if(row.action_type==="cancel")await notifyMissingMaterialEvent({service,projectId,sourceEventId:row.material_event_id,issueEventId:row.material_event_id,kind:"cancelled",actorUserId:user.id,actionId:row.id,cancellationReason:row.body});
    return NextResponse.json({ok:true,action:{...action,action_id:row.id}});
  }catch(error){const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status});}
}

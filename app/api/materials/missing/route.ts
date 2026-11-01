import { NextResponse } from "next/server";
import { userHasAccess } from "@/lib/access/server";
import { normalizeMissingMaterialType } from "@/mobile/lib/materials/canonical-material-type";
import { notifyMissingMaterialEvent } from "@/lib/materials/missing-notifications";
import { eligibleMaterialUsers } from "@/lib/materials/eligible-users";
import { qualityApiError, requireQualityUser } from "@/lib/quality/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const clean=(value:unknown)=>String(value??"").trim();
const positive=(value:unknown)=>{const parsed=Number(value);return Number.isFinite(parsed)&&parsed>0?parsed:0;};

export async function POST(request:Request){
  try{
    const {service,user}=await requireQualityUser(request),body=await request.json() as Record<string,unknown>;
    const projectId=clean(body.projectId),towerId=clean(body.towerId),clientMutationId=clean(body.clientMutationId),quantity=positive(body.quantity),description=clean(body.description),assignedToUserId=clean(body.assignedToUserId)||null,issueType=clean(body.issueType)==="excess"?"excess":"missing";
    const notifyUserIds=Array.isArray(body.notifyUserIds)?[...new Set(body.notifyUserIds.map(clean).filter(Boolean))]:[];
    if(!projectId||!towerId||!clientMutationId||!quantity||!description)return NextResponse.json({error:"Project, tower, item, positive quantity and mutation ID are required."},{status:400});
    const [permission,tower,access]=await Promise.all([
      userHasAccess(service,user.id,"materials.manage_issues"),
      service.from("towers").select("id,project_id").eq("id",towerId).eq("project_id",projectId).maybeSingle(),
      service.from("project_access").select("user_id").eq("project_id",projectId).eq("user_id",user.id).maybeSingle(),
    ]);
    if(!permission)return NextResponse.json({error:"You do not have permission to report missing materials."},{status:403});
    if(tower.error||access.error)throw new Error(tower.error?.message||access.error?.message);
    if(!tower.data)return NextResponse.json({error:"Tower was not found in this project."},{status:404});
    if(!access.data)return NextResponse.json({error:"You do not have access to this project."},{status:403});
    const selected=[...new Set([...(assignedToUserId?[assignedToUserId]:[]),...notifyUserIds])];
    if(selected.length){const eligible=await eligibleMaterialUsers(service,projectId);const assignable=new Set(eligible.assignmentUsers.map(row=>row.id)),notifiable=new Set(eligible.notifyUsers.map(row=>row.id));if(assignedToUserId&&!assignable.has(assignedToUserId))return NextResponse.json({error:"Select an authorised Materials manager for assignment."},{status:400});if(notifyUserIds.some(id=>!notifiable.has(id)))return NextResponse.json({error:"Additional recipients must be configured Materials notification recipients."},{status:400});}
    if(selected.length){const {data:members,error}=await service.from("project_access").select("user_id").eq("project_id",projectId).in("user_id",selected);if(error)throw new Error(error.message);if((members||[]).length!==selected.length)return NextResponse.json({error:"Assignment and notification recipients must belong to this project."},{status:400});}
    const sourceTable=clean(body.sourceTable)||null,sourceRecordId=clean(body.sourceRecordId)||null;
    const result=await service.rpc(issueType==="excess"?"tttracker_v1_create_excess_material":"tttracker_v1_create_missing_material",{
      p_project_id:projectId,p_tower_id:towerId,p_client_mutation_id:clientMutationId,p_user_id:user.id,
      p_item:{sourceTable,sourceRecordId,materialType:normalizeMissingMaterialType({sourceTable,sourceRecordId,linkedType:body.materialType,category:body.category}),boltSize:clean(body.boltSize)||null,itemReference:clean(body.itemReference)||description,description,quantity,unit:clean(body.unit)||"ea",notes:null,category:clean(body.category)||"Other",specification:clean(body.specification)||null,segment:clean(body.segment)||null,memberNumber:clean(body.memberNumber)||null,drawingNumber:clean(body.drawingNumber)||null},
      ...(issueType==="missing"?{p_urgency:clean(body.urgency)||null,p_required_by:clean(body.requiredBy)||null}:{}),p_notes:clean(body.notes)||null,...(issueType==="excess"?{p_location:clean(body.location)||null,p_disposition:clean(body.disposition)||null}:{}),p_occurred_at:new Date().toISOString(),
    });
    if(result.error)throw new Error(result.error.message);
    const issue=result.data as {event_id:string;issue_key:string;duplicate:boolean};
    if(!issue.duplicate){const {error}=await service.from("tower_material_events").update({assigned_to_user_id:assignedToUserId,notify_user_ids:notifyUserIds}).eq("id",issue.event_id).eq("project_id",projectId);if(error)throw new Error(`Missing material was saved but assignment could not be applied: ${error.message}`);}
    await notifyMissingMaterialEvent({service,projectId,sourceEventId:issue.event_id,kind:issueType==="excess"?"excess_raised":"raised",actorUserId:user.id});
    return NextResponse.json({ok:true,issue});
  }catch(error){const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status});}
}

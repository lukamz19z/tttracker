import type { SupabaseClient } from "@supabase/supabase-js";
import { sendDailyDocketEmail, docketEmailShell } from "@/lib/email/daily-dockets";
import { filterAppNotificationUserIds } from "@/lib/notifications/preferences";

export type MissingMaterialNotificationKind = "raised" | "partial_receipt" | "full_receipt" | "resolved" | "assignment" | "update" | "cancelled";
type Rule = { user_id:string;notify_raised:boolean;notify_urgent:boolean;notify_partial_receipt:boolean;notify_full_receipt:boolean;notify_resolved:boolean;notify_assignment:boolean;notify_update?:boolean;notify_cancel?:boolean;receives_in_app:boolean;receives_push:boolean;receives_email:boolean };
const clean=(value:unknown)=>String(value??"").trim();
const esc=(value:unknown)=>clean(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
function applies(rule:Rule,kind:MissingMaterialNotificationKind){if(kind==="raised")return rule.notify_raised;if(kind==="partial_receipt")return rule.notify_partial_receipt;if(kind==="full_receipt")return rule.notify_full_receipt;if(kind==="resolved")return rule.notify_resolved;if(kind==="assignment")return rule.notify_assignment;if(kind==="update")return rule.notify_update===true;return rule.notify_cancel===true;}
function eventType(kind:MissingMaterialNotificationKind,identity?:string){return `material_missing_${kind}${identity?`_${identity.replace(/[^a-zA-Z0-9]/g,"").slice(-24)}`:""}`;}

export async function notifyMissingMaterialEvent(args:{service:SupabaseClient;projectId:string;sourceEventId:string;issueEventId?:string;kind:MissingMaterialNotificationKind;actorUserId:string|null;remainingQuantity?:number;totalQuantity?:number;receivedQuantity?:number;deliveryReference?:string|null;actionId?:string;note?:string;cancellationReason?:string;assignedToUserId?:string|null}){
  const {service,projectId,sourceEventId,kind}=args;
  const {data:event,error:eventError}=await service.from("tower_material_events").select("id,project_id,tower_id,created_by_user_id,assigned_to_user_id,notify_user_ids,urgency,required_by,notes,delivery_reference,tower_material_event_items(issue_key,item_reference,item_description,quantity,unit,material_type,material_category,specification,segment,member_number,drawing_number)").eq("id",args.issueEventId||sourceEventId).eq("project_id",projectId).maybeSingle();
  if(eventError)throw new Error(`Missing-material notification event lookup failed: ${eventError.message}`);if(!event)throw new Error("Missing-material notification source event no longer exists.");
  const [{data:rawRules,error:rulesError},{data:tower,error:towerError},{data:project,error:projectError}]=await Promise.all([
    service.from("project_material_notification_rules").select("user_id,notify_raised,notify_urgent,notify_partial_receipt,notify_full_receipt,notify_resolved,notify_assignment,notify_update,notify_cancel,receives_in_app,receives_push,receives_email").eq("project_id",projectId).eq("active",true),
    service.from("towers").select("name,line").eq("id",event.tower_id).maybeSingle(),service.from("projects").select("name,project_number").eq("id",projectId).maybeSingle(),
  ]);
  if(rulesError||towerError||projectError)throw new Error(`Missing-material notification configuration lookup failed: ${rulesError?.message||towerError?.message||projectError?.message}`);
  const rulesByUser=new Map((rawRules||[]).map(row=>[row.user_id,row as Rule]));
  const {data:legacy,error:legacyError}=await service.from("project_defect_notification_rules").select("user_id,notify_new,notify_status_change,notify_action,notify_closed,notify_critical,notify_assignment,receives_email,receives_in_app,receives_push").eq("project_id",projectId).eq("active",true);
  if(!legacyError)for(const row of legacy||[])if(!rulesByUser.has(row.user_id))rulesByUser.set(row.user_id,{user_id:row.user_id,notify_raised:row.notify_new,notify_urgent:row.notify_critical,notify_partial_receipt:row.notify_status_change,notify_full_receipt:row.notify_status_change,notify_resolved:row.notify_closed,notify_assignment:row.notify_assignment,notify_update:row.notify_action,notify_cancel:row.notify_closed,receives_in_app:row.receives_in_app,receives_push:row.receives_push,receives_email:row.receives_email} as Rule);
  const rules=[...rulesByUser.values()];
  const channels=new Map<string,{inApp:boolean;push:boolean;email:boolean}>();
  for(const rule of rules){if(!applies(rule,kind)&&!(kind==="raised"&&["urgent","critical"].includes(clean(event.urgency).toLowerCase())&&rule.notify_urgent))continue;channels.set(rule.user_id,{inApp:rule.receives_in_app,push:rule.receives_push,email:rule.receives_email});}
  const directAssignee=kind==="assignment"?args.assignedToUserId:event.assigned_to_user_id;
  if(directAssignee){const configured=channels.get(directAssignee);channels.set(directAssignee,{inApp:configured?.inApp??true,push:configured?.push??true,email:configured?.email??false});}
  for(const id of Array.isArray(event.notify_user_ids)?event.notify_user_ids:[])if(clean(id)){const configured=channels.get(clean(id));channels.set(clean(id),{inApp:configured?.inApp??true,push:configured?.push??true,email:configured?.email??false});}
  if(args.actorUserId)channels.delete(args.actorUserId);if(!channels.size)return {recipients:0,inApp:0,push:0,email:0};
  const notificationType=eventType(kind,args.actionId),route="/materials/missing";
  const actorResult=args.actorUserId?await service.auth.admin.getUserById(args.actorUserId):null;
  const actorLabel=clean(actorResult?.data.user?.user_metadata?.full_name||actorResult?.data.user?.user_metadata?.name)||"Project user";
  const appUsers=new Set(await filterAppNotificationUserIds(service,[...channels.keys()],notificationType,route));
  const item=(event.tower_material_event_items||[])[0]||{},towerLabel=clean(tower?.name||tower?.line)||"Tower",projectLabel=clean(project?.project_number||project?.name);
  const itemLabel=[item.item_reference||item.item_description,item.specification].map(clean).filter(Boolean).join(" ")||"Material item";
  const total=Number(args.totalQuantity||item.quantity||0),remaining=args.remainingQuantity;
  const due=event.required_by?`${String(event.required_by).slice(8,10)}/${String(event.required_by).slice(5,7)}/${String(event.required_by).slice(0,4)}`:"";
  const urgent=clean(event.urgency).toLowerCase(),severity=["urgent","critical"].includes(urgent)?`${urgent.toUpperCase()} `:"";
  const titles:Record<MissingMaterialNotificationKind,string>={raised:`${severity}Missing Material - ${towerLabel}`,partial_receipt:`Material Partially Received - ${towerLabel}`,full_receipt:`Material Received - ${towerLabel}`,resolved:`Missing Material Resolved - ${towerLabel}`,assignment:`Missing Material Assigned - ${towerLabel}`,update:`Missing Material Update - ${towerLabel}`,cancelled:`Missing Material Cancelled - ${towerLabel}`};
  const messages:Record<MissingMaterialNotificationKind,string>={
    raised:`${total} x ${itemLabel}${event.urgency?` - ${event.urgency}`:""}${due?` - Required ${due}`:""} - Raised by ${actorLabel}`,
    partial_receipt:`${args.receivedQuantity??(total-(remaining??0))} of ${total} x ${itemLabel} received - ${remaining} still outstanding${args.deliveryReference?` - ${args.deliveryReference}`:""}`,
    full_receipt:`${total} / ${total} x ${itemLabel} received - Awaiting confirmation${args.deliveryReference?` - ${args.deliveryReference}`:""}`,
    resolved:`${itemLabel} - Requirement completed by ${actorLabel}`,
    assignment:`${total} x ${itemLabel}${event.urgency?` - ${event.urgency}`:""}${due?` - Required ${due}`:""} - Assigned to you by ${actorLabel}`,
    update:`${itemLabel} - ${args.note||"A material update was added."} - ${actorLabel}`,
    cancelled:`${towerLabel} - ${total} x ${itemLabel} - Cancelled by ${actorLabel}${args.cancellationReason?` - ${args.cancellationReason}`:""}`,
  };
  const title=titles[kind],message=messages[kind],actionParams={project_id:projectId,tower_id:event.tower_id,issue_key:item.issue_key};let inApp=0;
  for(const [userId,selected] of channels){if(!selected.inApp||!appUsers.has(userId))continue;const recipientMessage=kind!=="assignment"&&userId===directAssignee?`${message} - Assigned to you by ${actorLabel}`:message;
    const {error}=await service.from("user_notifications").insert({user_id:userId,event_type:notificationType,title,message:recipientMessage,severity:urgent==="urgent"||urgent==="critical"?"warning":kind==="resolved"?"success":"info",read_at:null,archived_at:null,project_id:projectId,fleet_job_id:null,asset_type:null,asset_id:null,docket_id:null,action_route:route,action_params:actionParams,source_table:args.actionId?"tower_material_event_actions":"tower_material_events",source_record_id:args.actionId||sourceEventId,created_at:new Date().toISOString()});
    if(error&&error.code!=="23505")throw new Error(`Missing-material in-app notification failed: ${error.message}`);if(!error)inApp++;
  }
  let push=0;const pushIds=[...channels].filter(([id,selected])=>selected.push&&appUsers.has(id)).map(([id])=>id);
  if(pushIds.length){const {data:tokens,error}=await service.from("user_push_tokens").select("user_id,expo_push_token").in("user_id",pushIds).eq("active",true);if(error)throw new Error(`Missing-material push-token lookup failed: ${error.message}`);
    for(const token of tokens||[]){const {data:claim,error:claimError}=await service.from("material_notification_deliveries").upsert({project_id:projectId,source_event_id:sourceEventId,event_type:notificationType,user_id:token.user_id,channel:"push"},{onConflict:"source_event_id,event_type,user_id,channel",ignoreDuplicates:true}).select("id").maybeSingle();if(claimError)throw new Error(`Missing-material push dedupe failed: ${claimError.message}`);if(!claim)continue;
      const body=kind!=="assignment"&&token.user_id===directAssignee?`${message} - Assigned to you by ${actorLabel}`:message;const response=await fetch("https://exp.host/--/api/v2/push/send",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({to:token.expo_push_token,sound:"default",title,body,data:{action_route:route,action_params:actionParams}})});if(!response.ok)throw new Error(`Missing-material Expo push failed (${response.status}).`);push++;
    }
  }
  let email=0;const emailIds=[...channels].filter(([,selected])=>selected.email).map(([id])=>id);
  if(emailIds.length){const identities=await Promise.all(emailIds.map(async userId=>{const {data}=await service.auth.admin.getUserById(userId);return {userId,email:data.user?.email||null};}));
    for(const identity of identities.filter(row=>row.email)){const {data:claim,error}=await service.from("material_notification_deliveries").upsert({project_id:projectId,source_event_id:sourceEventId,event_type:notificationType,user_id:identity.userId,channel:"email"},{onConflict:"source_event_id,event_type,user_id,channel",ignoreDuplicates:true}).select("id").maybeSingle();if(error)throw new Error(`Missing-material email dedupe failed: ${error.message}`);if(!claim)continue;
      await sendDailyDocketEmail({to:[identity.email!],subject:title,html:docketEmailShell(title,`<p>${esc(message)}</p><p>Project: ${esc(projectLabel)} - ${esc(towerLabel)}</p><p><a href="${esc(process.env.NEXT_PUBLIC_APP_URL||"")}${route}">Open Missing Materials</a></p>`)});email++;
    }
  }
  return {recipients:channels.size,inApp,push,email};
}

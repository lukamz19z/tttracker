import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { sendDailyDocketEmail } from "@/lib/email/daily-dockets";
import { renderMaterialNotificationEmail } from "@/lib/email/material-notifications";
import { buildMaterialIssueRoute, buildMaterialIssueUrl } from "@/lib/materials/notification-links";
import { filterAppNotificationUserIds } from "@/lib/notifications/preferences";
import { resolveUserDisplayName } from "@/lib/materials/project-users";
import { mergeExplicitMaterialRecipientChannels } from "@/lib/materials/recipient-channels";

export type MissingMaterialNotificationKind = "raised" | "partial_receipt" | "full_receipt" | "resolved" | "assignment" | "update" | "cancelled" | "excess_raised" | "excess_partial_collection" | "excess_resolved" | "transfer";
type Rule = { user_id:string;notify_raised:boolean;notify_urgent:boolean;notify_partial_receipt:boolean;notify_full_receipt:boolean;notify_resolved:boolean;notify_assignment:boolean;notify_update?:boolean;notify_cancel?:boolean;receives_in_app:boolean;receives_push:boolean;receives_email:boolean;active?:boolean };
const clean=(value:unknown)=>String(value??"").trim();
function applies(rule:Rule,kind:MissingMaterialNotificationKind){if(kind==="raised"||kind==="excess_raised")return rule.notify_raised;if(kind==="partial_receipt"||kind==="excess_partial_collection")return rule.notify_partial_receipt;if(kind==="full_receipt")return rule.notify_full_receipt;if(kind==="resolved"||kind==="excess_resolved")return rule.notify_resolved;if(kind==="assignment")return rule.notify_assignment;if(kind==="update"||kind==="transfer")return rule.notify_update===true;return rule.notify_cancel===true;}
function eventType(kind:MissingMaterialNotificationKind,identity?:string){return `material_missing_${kind}${identity?`_${identity.replace(/[^a-zA-Z0-9]/g,"").slice(-24)}`:""}`;}

export async function notifyMissingMaterialEvent(args:{service:SupabaseClient;projectId:string;sourceEventId:string;issueEventId?:string;kind:MissingMaterialNotificationKind;actorUserId:string|null;remainingQuantity?:number;totalQuantity?:number;receivedQuantity?:number;deliveryReference?:string|null;actionId?:string;note?:string;cancellationReason?:string;assignedToUserId?:string|null;destinationTowerId?:string;transferQuantity?:number}){
  const {service,projectId,sourceEventId,kind}=args;
  const {data:event,error:eventError}=await service.from("tower_material_events").select("id,project_id,tower_id,event_type,created_by_user_id,assigned_to_user_id,notify_user_ids,urgency,required_by,notes,delivery_reference,current_effect,work_outcome,tower_material_event_items(issue_key,item_reference,item_description,quantity,unit,material_type,material_category,specification,segment,member_number,drawing_number)").eq("id",args.issueEventId||sourceEventId).eq("project_id",projectId).maybeSingle();
  if(eventError)throw new Error(`Missing-material notification event lookup failed: ${eventError.message}`);if(!event)throw new Error("Missing-material notification source event no longer exists.");
  const [{data:rawRules,error:rulesError},{data:tower,error:towerError},{data:project,error:projectError},{data:destinationTower,error:destinationTowerError}]=await Promise.all([
    service.from("project_material_notification_rules").select("user_id,notify_raised,notify_urgent,notify_partial_receipt,notify_full_receipt,notify_resolved,notify_assignment,notify_update,notify_cancel,receives_in_app,receives_push,receives_email,active").eq("project_id",projectId),
    service.from("towers").select("name,line").eq("id",event.tower_id).maybeSingle(),service.from("projects").select("name,project_number").eq("id",projectId).maybeSingle(),args.destinationTowerId?service.from("towers").select("name,line").eq("id",args.destinationTowerId).eq("project_id",projectId).maybeSingle():Promise.resolve({data:null,error:null}),
  ]);
  if(towerError||projectError||destinationTowerError)throw new Error(`Missing-material notification context lookup failed: ${towerError?.message||projectError?.message||destinationTowerError?.message}`);
  const rulesByUser=new Map((rawRules||[]).map(row=>[row.user_id,row as Rule]));
  if(rulesError)console.warn("TTTracker Missing Materials rules unavailable; direct assignees and selected issue recipients remain available.",{projectId,error:rulesError.message});
  const rules=[...rulesByUser.values()];
  const channels=new Map<string,{inApp:boolean;push:boolean;email:boolean}>();
  const configuredRecipients=new Set<string>();
  const preferences=new Map(rules.map(rule=>[rule.user_id,{inApp:rule.receives_in_app,push:rule.receives_push,email:rule.receives_email}]));
  for(const rule of rules){if(rule.active!==true||(!applies(rule,kind)&&!((kind==="raised"||kind==="excess_raised")&&["urgent","critical"].includes(clean(event.urgency).toLowerCase())&&rule.notify_urgent)))continue;configuredRecipients.add(rule.user_id);channels.set(rule.user_id,preferences.get(rule.user_id)!);}
  const directAssignee=kind==="assignment"?args.assignedToUserId:event.assigned_to_user_id;
  // Direct assignment and issue-specific selections are explicit deliveries,
  // independent of automatic project subscriptions. The Map deduplicates them
  // against each other and any configured automatic event subscription.
  mergeExplicitMaterialRecipientChannels(channels, [directAssignee, ...(Array.isArray(event.notify_user_ids) ? event.notify_user_ids : [])]);
  if(args.actorUserId&&!configuredRecipients.has(args.actorUserId))channels.delete(args.actorUserId);if(!channels.size){console.info("TTTracker Missing Materials notification dispatch",{kind,sourceEventId,recipients:0,reason:"no eligible recipients"});return {recipients:0,inApp:0,push:0,email:0};}
  const notificationType=eventType(kind,args.actionId);
  const actorLabel=await resolveUserDisplayName(service,args.actorUserId);
  const item=(event.tower_material_event_items||[])[0]||{};
  const raisedByLabel=event.created_by_user_id===args.actorUserId?actorLabel:await resolveUserDisplayName(service,event.created_by_user_id);
  const issueKind = kind.startsWith("excess_") || clean(event.event_type)==="excess" ? "excess" : "missing";
  const route = buildMaterialIssueRoute({projectId,towerId:event.tower_id,issueKey:clean(item.issue_key)||event.id,eventId:event.id,kind:issueKind});
  const appUsers=new Set(await filterAppNotificationUserIds(service,[...channels.keys()],notificationType,route));
  const towerLabel=clean(tower?.name||tower?.line)||"Tower",projectLabel=clean(project?.project_number||project?.name);
  const itemLabel=[item.item_reference,item.item_description,item.specification].map(clean).filter((value,index,values)=>value&&values.findIndex(other=>other.toLowerCase()===value.toLowerCase())===index).join(" · ")||clean(item.material_category)||"Material item";
  const total=Number(args.totalQuantity||item.quantity||0),remaining=args.remainingQuantity;
  const due=event.required_by?`${String(event.required_by).slice(8,10)}/${String(event.required_by).slice(5,7)}/${String(event.required_by).slice(0,4)}`:"";
  const urgent=clean(event.urgency).toLowerCase(),severity=["urgent","critical"].includes(urgent)?`${urgent.toUpperCase()} `:"";
  const titles:Record<MissingMaterialNotificationKind,string>={raised:`${severity}Missing Material - ${towerLabel}`,partial_receipt:`Material Partially Received - ${towerLabel}`,full_receipt:`Material Received - ${towerLabel}`,resolved:`Missing Material Resolved - ${towerLabel}`,assignment:`Missing Material Assigned - ${towerLabel}`,update:`Missing Material Update - ${towerLabel}`,cancelled:`Missing Material Cancelled - ${towerLabel}`,excess_raised:`${severity}Excess Material - ${towerLabel}`,excess_partial_collection:`Excess Material Partially Collected - ${towerLabel}`,excess_resolved:`Excess Material Resolved - ${towerLabel}`,transfer:"Material Transfer"};
  const messages:Record<MissingMaterialNotificationKind,string>={
    raised:`${total} x ${itemLabel}${event.urgency?` - ${event.urgency}`:""}${due?` - Required ${due}`:""} - Raised by ${actorLabel}`,
    partial_receipt:`${args.receivedQuantity??(total-(remaining??0))} of ${total} x ${itemLabel} received - ${remaining} still outstanding${args.deliveryReference?` - ${args.deliveryReference}`:""}`,
    full_receipt:`${total} / ${total} x ${itemLabel} received - Awaiting confirmation${args.deliveryReference?` - ${args.deliveryReference}`:""}`,
    resolved:`${itemLabel} - Requirement completed by ${actorLabel}`,
    assignment:`${total} x ${itemLabel}${event.urgency?` - ${event.urgency}`:""}${due?` - Required ${due}`:""} - Assigned to you by ${actorLabel}`,
    update:`${itemLabel} - ${args.note||"A material update was added."} - ${actorLabel}`,
    cancelled:`${towerLabel} - ${total} x ${itemLabel} - Cancelled by ${actorLabel}${args.cancellationReason?` - ${args.cancellationReason}`:""}`,
    excess_raised:`${total} x ${itemLabel} - ${clean(event.work_outcome)||"Pickup required"}${event.current_effect?` - ${event.current_effect}`:""} - Reported by ${actorLabel}`,
    excess_partial_collection:`${args.receivedQuantity??(total-(remaining??0))} of ${total} x ${itemLabel} collected - ${remaining} remaining${args.deliveryReference?` - ${args.deliveryReference}`:""}`,
    excess_resolved:`${total} x ${itemLabel} collected/resolved by ${actorLabel}`,
    transfer:`Tower ${towerLabel} → Tower ${clean(destinationTower?.name||destinationTower?.line)||"destination"} · ${args.transferQuantity||total} x ${itemLabel}`,
  };
  const title=titles[kind],message=messages[kind];
  const linkData={type:"missing_material",eventId:event.id,issueKey:item.issue_key,projectId,towerId:event.tower_id,action:kind,kind:issueKind},actionParams={...linkData};let inApp=0;
  for(const [userId,selected] of channels){if(!selected.inApp||!appUsers.has(userId))continue;const recipientMessage=kind!=="assignment"&&userId===directAssignee?`${message} - Assigned to you by ${actorLabel}`:message;
    const {error}=await service.from("user_notifications").insert({user_id:userId,event_type:notificationType,title,message:recipientMessage,severity:urgent==="urgent"||urgent==="critical"?"warning":kind==="resolved"?"success":"info",read_at:null,archived_at:null,project_id:projectId,fleet_job_id:null,asset_type:null,asset_id:null,docket_id:null,action_route:route,action_params:actionParams,source_table:args.actionId?"tower_material_event_actions":"tower_material_events",source_record_id:args.actionId||sourceEventId,created_at:new Date().toISOString()});
    if(error&&error.code!=="23505")throw new Error(`Missing-material in-app notification failed: ${error.message}`);if(!error)inApp++;
  }
  let push=0;let pushFailure:string|null=null;const pushIds=[...channels].filter(([id,selected])=>selected.push&&appUsers.has(id)).map(([id])=>id);
  if(pushIds.length){const {data:tokens,error}=await service.from("user_push_tokens").select("user_id,expo_push_token").in("user_id",pushIds).eq("active",true);if(error)throw new Error(`Missing-material push-token lookup failed: ${error.message}`);
    console.info("TTTracker Missing Materials push dispatch",{kind,sourceEventId,eligibleUsers:pushIds.length,activeDeviceTokens:(tokens||[]).length});
    for(const token of tokens||[]){
      const body=kind!=="assignment"&&token.user_id===directAssignee?`${message} - Assigned to you by ${actorLabel}`:message;
      const pushPayload={sound:"default",title,body,data:{...linkData,action_route:route,action_params:actionParams}};
      const tokenHash=createHash("sha256").update(token.expo_push_token).digest("hex");
      const {data:claim,error:claimError}=await service.from("material_push_delivery_attempts").upsert({project_id:projectId,source_event_id:sourceEventId,event_type:notificationType,user_id:token.user_id,expo_token_hash:tokenHash,push_payload:pushPayload,delivery_status:"sending",attempted_at:new Date().toISOString(),last_error:null},{onConflict:"source_event_id,event_type,user_id,expo_token_hash",ignoreDuplicates:true}).select("id").maybeSingle();if(claimError)throw new Error(`Missing-material push dedupe failed: ${claimError.message}`);if(!claim)continue;
      try{
        const response=await fetch("https://exp.host/--/api/v2/push/send",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({to:token.expo_push_token,...pushPayload})});
        const result=await response.json().catch(()=>null) as {data?:{id?:string;status?:string;message?:string;details?:{error?:string}}|Array<{id?:string;status?:string;message?:string;details?:{error?:string}}>};
        const ticket=Array.isArray(result?.data)?result.data[0]:result?.data;
        if(!response.ok||ticket?.status==="error"){
          const reason=ticket?.details?.error||ticket?.message||`HTTP ${response.status}`;
          if(ticket?.details?.error==="DeviceNotRegistered")await service.from("user_push_tokens").update({active:false}).eq("user_id",token.user_id).eq("expo_push_token",token.expo_push_token);
          // Expo explicitly rejected this ticket, so release the dedupe row to allow a genuine retry.
          await service.from("material_push_delivery_attempts").delete().eq("id",claim.id);
          console.error("TTTracker Missing Materials Expo ticket rejected",{kind,sourceEventId,status:response.status,reason});
          if(ticket?.details?.error!=="DeviceNotRegistered")pushFailure=reason;
          continue;
        }
        if(ticket?.status!=="ok"||!ticket.id){
          await service.from("material_push_delivery_attempts").delete().eq("id",claim.id);
          console.error("TTTracker Missing Materials Expo response did not include an accepted ticket",{kind,sourceEventId,status:response.status});
          pushFailure="Expo did not confirm push acceptance.";
          continue;
        }
        const {error:ticketSaveError}=await service.from("material_push_delivery_attempts").update({delivery_status:"ticket_accepted",expo_ticket_id:ticket.id||null,receipt_checked_at:null,last_error:null}).eq("id",claim.id);
        if(ticketSaveError)console.error("TTTracker Missing Materials accepted Expo ticket could not be recorded",{kind,sourceEventId,error:ticketSaveError.message});
        push++;
      }catch(error){await service.from("material_push_delivery_attempts").delete().eq("id",claim.id);console.error("TTTracker Missing Materials Expo request failed",{kind,sourceEventId,error:error instanceof Error?error.message:"unknown error"});throw error;}
    }
  } else if([...channels.values()].some(selected=>selected.push))console.warn("TTTracker Missing Materials push skipped: no eligible registered device tokens",{kind,sourceEventId,eligibleUsers:pushIds.length});
  let email=0;const emailIds=[...channels].filter(([,selected])=>selected.email).map(([id])=>id);
  if(emailIds.length){const identities=await Promise.all(emailIds.map(async userId=>{const {data}=await service.auth.admin.getUserById(userId);return {userId,email:data.user?.email||null};}));
    for(const identity of identities.filter(row=>row.email)){const {data:claim,error}=await service.from("material_notification_deliveries").upsert({project_id:projectId,source_event_id:sourceEventId,event_type:notificationType,user_id:identity.userId,channel:"email"},{onConflict:"source_event_id,event_type,user_id,channel",ignoreDuplicates:true}).select("id").maybeSingle();if(error)throw new Error(`Missing-material email dedupe failed: ${error.message}`);if(!claim)continue;
      const assignedTo = event.assigned_to_user_id ? await resolveUserDisplayName(service,event.assigned_to_user_id) : null;
      const isReceipt = kind === "partial_receipt" || kind === "full_receipt";
      const isCollection = kind === "excess_partial_collection" || kind === "excess_resolved";
      const emailTitle = kind === "raised"
        ? `${severity ? `${severity.trim()[0]}${severity.trim().slice(1).toLowerCase()} ` : ""}Missing Material — Tower ${towerLabel}`
        : kind === "excess_raised" ? `Excess Material — Tower ${towerLabel}`
        : kind === "resolved" ? `Material Issue Resolved — Tower ${towerLabel}`
        : title.replaceAll(" - ", " — ");
      const emailKindLabel:Record<MissingMaterialNotificationKind,string>={raised:"Missing Material",partial_receipt:"Material Partially Received",full_receipt:"Material Received",resolved:"Material Issue Resolved",assignment:"Material Assignment Changed",update:"Material Update",cancelled:"Material Issue Cancelled",excess_raised:"Excess Material",excess_partial_collection:"Excess Material Collection",excess_resolved:"Excess Material Resolved",transfer:"Material Transfer"};
      const emailKind = emailKindLabel[kind];
      const emailQuantity = isReceipt
        ? kind === "partial_receipt" ? `${args.receivedQuantity ?? (total-(remaining??0))} of ${total}` : `${total} / ${total}`
        : isCollection
          ? kind === "excess_partial_collection" ? `${args.receivedQuantity ?? (total-(remaining??0))} of ${total}` : `${total} / ${total}`
          : kind === "transfer" ? args.transferQuantity ?? total : total;
      const quantityLabel = kind === "raised" ? "Quantity Missing" : kind === "excess_raised" ? "Quantity Excess" : isReceipt ? (kind === "partial_receipt" ? "Received" : "Received") : isCollection ? "Collected" : kind === "transfer" ? "Quantity" : "Quantity";
      const emailUrl = buildMaterialIssueUrl({projectId,towerId:event.tower_id,issueKey:clean(item.issue_key),eventId:event.id,kind:issueKind});
      const rendered = renderMaterialNotificationEmail({
        kindLabel:emailKind,title:emailTitle,tower:towerLabel,project:projectLabel,material:itemLabel,unit:clean(item.unit),
        quantityLabel,quantity:emailQuantity,remainingQuantity:isReceipt||isCollection?remaining:null,urgency:event.urgency,requiredBy:due||null,raisedBy:raisedByLabel,recordedBy:kind==="raised"||kind==="excess_raised"?null:actorLabel,assignedTo,
        segment:clean(item.segment),drawing:clean(item.drawing_number),fromTower:kind==="transfer"?towerLabel:null,
        toTower:kind==="transfer"?clean(destinationTower?.name||destinationTower?.line):null,
        reference:args.deliveryReference||event.delivery_reference,note:kind==="update"?args.note:kind==="cancelled"?args.cancellationReason:null,url:emailUrl,
      });
      await sendDailyDocketEmail({to:[identity.email!],subject:rendered.subject,html:rendered.html,text:rendered.text});email++;
    }
  }
  if(pushFailure)throw new Error(`Missing-material Expo push delivery was rejected: ${pushFailure}`);
  console.info("TTTracker Missing Materials notification result",{kind,sourceEventId,recipients:channels.size,inApp,push,email,usersWithPushPreference:pushIds.length});
  return {recipients:channels.size,inApp,push,email};
}

import { documentSetupAccess } from "@/lib/integrations/document-setup-access";
import { documentTemplateError } from "@/lib/integrations/document-setup-validation";
import { NextRequest,NextResponse } from "next/server";
import { integrationContext,integrationError,integrationAudit } from "@/lib/integrations/server";
import { suggestedDocumentTemplate,availableDocumentContexts } from "@/lib/integrations/sharepoint-ux";
import { providerReadiness } from "@/lib/integrations/readiness";
import { microsoftSetupReadiness } from "@/lib/integrations/sharepoint-setup";
import { graphForSite,microsoftConfig,ensureFolderPath } from "@/lib/integrations/sharepoint";
import { connectedMicrosoft,siteUrl,verifyCandidateSite,bulkSiteGrant,locationScope,processFolderBatch } from "@/lib/integrations/sharepoint-locations";
import { renderPath,contextTokens,type DocumentContext } from "@/lib/integrations/resolver";
import { requireIntegrationEntitlement } from "@/lib/integrations/entitlements";
import { listAccessibleProjects } from "@/lib/projects/list";
const guid=(v:unknown)=>typeof v==="string"&&/^[a-f0-9-]{36}$/i.test(v);
export async function GET(request:NextRequest){
 try{
  const {org,admin,context}=await integrationContext(request.nextUrl.searchParams.get("organisation"),"sharepoint","view");
  const tables=["v2_integrations","v2_sharepoint_sites","v2_sharepoint_locations","v2_document_destinations","v2_integration_access_profiles"];
  const results=await Promise.all(tables.map(t=>{let query=admin.from(t).select("*").eq("organisation_id",org);if(t==="v2_integrations")query=query.eq("provider","sharepoint");return query.limit(200);}));
  const jobsResult=await admin.from("v2_sharepoint_folder_jobs").select("id,rule_id,location_id,entity_kind,entity_id,status,attempts,last_error,outcome,started_at,last_attempt_at,finished_at,available_at").eq("organisation_id",org).order("started_at",{ascending:false,nullsFirst:false}).order("available_at",{ascending:false}).limit(50);
  if(jobsResult.error)throw new Error("INTEGRATION_SCHEMA_REQUIRED");
  const jobs=jobsResult.data??[];
  if(results.some(r=>r.error))throw new Error("INTEGRATION_SCHEMA_REQUIRED");
  const permissions=context.permissions??{};
  const types=permissions["people.view"]?await admin.from("v2_person_types").select("id,name").eq("organisation_id",org):{data:[]};
  const capabilities=permissions["integrations.sharepoint.manage"]?await admin.from("v2_permissions").select("permission_code,name").order("name"):{data:[]};
  const readiness=await providerReadiness("sharepoint",true);
  const [connection,sites,locations,rules,profiles]=results.map(r=>r.data??[]);
  const visibleJobs=[];
  const projectIds=jobs.some(j=>j.entity_kind==="project")&&permissions["projects.edit"]&&permissions["projects.view"]?new Set((await listAccessibleProjects(org)).filter(p=>p.organisationId===org&&!p.party).map(p=>p.id)):new Set<string>();
  const personIds=permissions["people.edit"]&&permissions["people.view"]?jobs.filter(j=>j.entity_kind==="person").map(j=>j.entity_id):[];
  const personRows=personIds.length?await admin.from("v2_people").select("id,display_name").eq("organisation_id",org).in("id",personIds):{data:[]};
  const visibleProjectIds=jobs.filter(j=>j.entity_kind==="project"&&projectIds.has(j.entity_id)).map(j=>j.entity_id);
  const projectRows=visibleProjectIds.length?await admin.from("v2_projects").select("id,name").eq("organisation_id",org).in("id",visibleProjectIds): {data:[]};
  for(const job of jobs){const record=job.entity_kind==="person"?personRows.data?.find(p=>p.id===job.entity_id):projectRows.data?.find(p=>p.id===job.entity_id);if(record)visibleJobs.push({...job,record_name:"display_name" in record?record.display_name:record.name});}
  const setupResults=await admin.from("v2_integration_oauth_states").select("setup_results").eq("organisation_id",org).eq("actor_id",context.userId).eq("provider","sharepoint_setup").not("setup_results","is",null).gt("consumed_at",new Date(Date.now()-3600000).toISOString()).order("consumed_at",{ascending:false}).limit(1);
  if(setupResults.error)throw new Error("INTEGRATION_SCHEMA_REQUIRED");
  return NextResponse.json({availableContexts:availableDocumentContexts(context.enabledModules??new Set<string>(),rules.map(r=>r.context as DocumentContext)),connection:connection[0]??null,sites,locations,rules,profiles,jobs:visibleJobs,types:types.data??[],capabilities:capabilities.data??[],configured:readiness.connectReady,setupReady:microsoftSetupReadiness().ready,authorisationResults:setupResults.data?.[0]?.setup_results??[]},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return NextResponse.json(integrationError(error),{status:403});}
}
export async function POST(request:NextRequest){
 try{
  if(request.headers.get("origin")!==request.nextUrl.origin)throw new Error("INTEGRATION_ACCESS_DENIED");
  const body=await request.json(),{org,admin,context}=await integrationContext(body.organisation,"sharepoint","manage");
  const action=String(body.action),actor=context.userId;
  const configurationOnly=action==="rule";
  const stored=configurationOnly?await admin.from("v2_integrations").select("*").eq("organisation_id",org).eq("provider","sharepoint").single():null;
  if(configurationOnly&&(!stored?.data||stored.error))throw new Error("INTEGRATION_DOCUMENT_DESTINATION_INVALID");
  if(!configurationOnly)microsoftConfig();
  const connection=configurationOnly?stored?.data:await connectedMicrosoft(org);
  if(!connection)throw new Error("INTEGRATION_DOCUMENT_DESTINATION_INVALID");
  const save=async(table:string,value:Record<string,unknown>,id?:string)=>{
   const r=id?await admin.from(table).update(value).eq("organisation_id",org).eq("id",id).select("id").single():await admin.from(table).insert({...value,organisation_id:org}).select("id").single();
   if(r.error||!r.data)throw new Error(action==="rule"?r.error?.code==="23505"?"INTEGRATION_DOCUMENT_RULE_CONFLICT":r.error?.code==="23503"?"INTEGRATION_DOCUMENT_DESTINATION_INVALID":"INTEGRATION_DOCUMENT_SAVE_FAILED":"INTEGRATION_ACTION_FAILED");await integrationAudit(org,connection.id,actor,action,r.data.id);return r.data.id;
  };
  if(action==="site"){
   const url=siteUrl(String(body.site_url??"")),name=String(body.name??"").trim();if(!name||name.length>120)throw new Error("INTEGRATION_NAME_REQUIRED");
   const id=await save("v2_sharepoint_sites",{integration_id:connection.id,site_url:url,site_name:name,permission_status:"candidate",verified_at:null});return NextResponse.json({ok:true,id});
  }
  if(action==="grant"||action==="verify_sites"){
   if(!Array.isArray(body.sites)||!body.sites.length||body.sites.length>25||body.sites.some((v:unknown)=>!guid(v)))throw new Error("INTEGRATION_SCOPE_INVALID");
   const ids=[...new Set(body.sites as string[])];
   const rows=await admin.from("v2_sharepoint_sites").select("id,site_url").eq("organisation_id",org).eq("integration_id",connection.id).eq("is_active",true).in("id",ids);
   if(rows.error||rows.data?.length!==ids.length)throw new Error("INTEGRATION_SCOPE_INVALID");
   if(action==="grant")return NextResponse.json({script:bulkSiteGrant(microsoftConfig().clientId,connection.tenant_id,rows.data.map(r=>r.site_url)),tenant:connection.tenant_id,application:microsoftConfig().clientId,sites:rows.data});
   // At most three network verifications per request; client dispatches bounded batches.
   if(ids.length>3)throw new Error("INTEGRATION_BATCH_LIMIT");
   const results=[];for(const id of ids)results.push(await verifyCandidateSite(org,id,actor));return NextResponse.json({results});
  }
  if(action==="libraries"){
   const r=await admin.from("v2_sharepoint_sites").select("*").eq("organisation_id",org).eq("integration_id",connection.id).eq("id",body.site).eq("is_active",true).single();
   if(r.error||!r.data?.verified_at||r.data.permission_status!=="verified")throw new Error("INTEGRATION_SITE_PERMISSION_REQUIRED");
   const graph=await graphForSite({tenant_id:connection.tenant_id,site_id:r.data.site_id});return NextResponse.json({libraries:await graph.drives()});
  }
  if(action==="location"){
   const r=await admin.from("v2_sharepoint_sites").select("*").eq("organisation_id",org).eq("integration_id",connection.id).eq("id",body.site_id).eq("is_active",true).single();
   if(!r.data?.verified_at||r.data.permission_status!=="verified")throw new Error("INTEGRATION_SITE_PERMISSION_REQUIRED");
   const graph=await graphForSite({tenant_id:connection.tenant_id,site_id:r.data.site_id,drive_id:body.drive_id});
   const drive=(await graph.drives()).find(d=>d.id===body.drive_id);if(!drive)throw new Error("INTEGRATION_LIBRARY_UNAVAILABLE");
   const root=renderPath(String(body.root_path??""),"general",{});const name=String(body.name??"").trim();if(!name||name.length>120)throw new Error("INTEGRATION_NAME_REQUIRED");
   if(body.id){const previous=await admin.from("v2_sharepoint_locations").select("site_id,drive_id,root_path").eq("organisation_id",org).eq("id",body.id).single();if(!previous.data||previous.data.site_id!==body.site_id||previous.data.drive_id!==body.drive_id||previous.data.root_path!==root)throw new Error("INTEGRATION_LOCATION_IMMUTABLE");}
   const id=await save("v2_sharepoint_locations",{site_id:r.data.id,name,drive_id:drive.id,drive_name:drive.name,root_path:root,is_active:body.is_active!==false},body.id);return NextResponse.json({ok:true,id});
  }
  if(action==="profile"){
   if(body.classification!=="operational"&&body.classification!=="private")throw new Error("INTEGRATION_CONFIDENTIAL_UNAVAILABLE");
   if(body.classification==="private"&&(!/^people\.private\./.test(String(body.read_capability))||!/^people\.private\./.test(String(body.manage_capability))))throw new Error("INTEGRATION_PROFILE_INVALID");
   const id=await save("v2_integration_access_profiles",{name:body.name,classification:body.classification,read_capability:body.read_capability,manage_capability:body.manage_capability,native_mode:"inherit"},body.id);return NextResponse.json({ok:true,id});
  }
  if(action==="rule"){
   if(!body.location_id)throw new Error("INTEGRATION_DOCUMENT_DESTINATION_REQUIRED");
   const destination=await admin.from("v2_sharepoint_locations").select("*").eq("organisation_id",org).eq("id",body.location_id).eq("is_active",true).single();
   if(destination.error||!destination.data)throw new Error("INTEGRATION_DOCUMENT_DESTINATION_INVALID");
   const location=destination.data;
   const ownedSite=await admin.from("v2_sharepoint_sites").select("id").eq("organisation_id",org).eq("integration_id",connection.id).eq("id",location.site_id).single();
   if(ownedSite.error||!ownedSite.data)throw new Error("INTEGRATION_DOCUMENT_DESTINATION_INVALID");
   const site=ownedSite.data;
   if(!(body.context in contextTokens))throw new Error("INTEGRATION_SCOPE_INVALID");
   const contextKey=body.context as DocumentContext,children=body.child_folders??[];
   body.filename_template=body.filename_template??suggestedDocumentTemplate(contextKey).filename_template;
   const templateError=documentTemplateError(contextKey,String(body.folder_template??""),String(body.filename_template??""));
   if(templateError)return NextResponse.json({code:"INTEGRATION_DOCUMENT_TEMPLATE_INVALID",message:templateError},{status:400});
   body.creation_policy=body.creation_policy??"first_upload";
   if(!Number.isInteger(Number(body.priority??0)))throw new Error("INTEGRATION_DOCUMENT_PRIORITY_INVALID");
   if(!Array.isArray(children)||children.length>20||children.some((v:unknown)=>typeof v!=="string"))throw new Error("INTEGRATION_PATH_INVALID");
   const templates=[String(body.folder_template??""),String(body.filename_template??""),...children];
   for(const [index,template] of templates.entries()){const sample=Object.fromEntries([...template.matchAll(/\{([^{}]+)\}/g)].map(m=>[m[1],"Example"]));renderPath(template,contextKey,sample,index===1);}
   const name=String(body.name??"").trim();if(!name||!String(body.filename_template??"").trim())throw new Error("INTEGRATION_NAME_REQUIRED");
   if(body.relationship_type_id){const type=await admin.from("v2_person_types").select("id").eq("organisation_id",org).eq("id",body.relationship_type_id).single();if(!type.data||!["people","profile_photos","training","onboarding"].includes(contextKey))throw new Error("INTEGRATION_SCOPE_INVALID");}
   const triggers=["manual","first_upload",...(["people","profile_photos","training","onboarding"].includes(contextKey)?["person_created","onboarding_started","onboarding_approved"]:contextKey==="projects"?["project_created"]:[])];if(!triggers.includes(body.creation_policy))throw new Error("INTEGRATION_TRIGGER_UNAVAILABLE");
   let previous:{location_id:string;root_path?:string;conflict_policy?:string;review_storage?:string;access_profile_id?:string}|null=null;
   if(body.id){const old=await admin.from("v2_document_destinations").select("location_id,root_path,conflict_policy,review_storage,access_profile_id").eq("organisation_id",org).eq("id",body.id).single();if(!old.data)throw new Error("INTEGRATION_SCOPE_INVALID");previous=old.data;if(old.data.location_id!==location.id&&body.confirm_change!==true)throw new Error("INTEGRATION_CONFIGURATION_CHANGE_CONFIRMATION_REQUIRED");}
   if(body.is_active!==false){const defaults=admin.from("v2_document_destinations").select("id").eq("organisation_id",org).eq("context",contextKey).eq("is_active",true).eq("priority",Number(body.priority)||0);if(body.id)defaults.neq("id",body.id);const overlapping=body.relationship_type_id?await defaults.eq("relationship_type_id",body.relationship_type_id).limit(1).maybeSingle():await defaults.is("relationship_type_id",null).limit(1).maybeSingle();if(overlapping.error)throw new Error("INTEGRATION_DOCUMENT_SAVE_FAILED");if(overlapping.data)throw new Error("INTEGRATION_DOCUMENT_RULE_CONFLICT");}
   const accessProfile=await documentSetupAccess(admin,org,contextKey,body.access_profile_id??previous?.access_profile_id);
   if(!body.access_profile_id&&!previous?.access_profile_id)await integrationAudit(org,connection.id,actor,"document_access_defaulted",accessProfile);
   const id=await save("v2_document_destinations",{name,code:body.code||crypto.randomUUID(),context:contextKey,site_id:site.id,location_id:location.id,root_path:previous?.root_path??"",folder_template:body.folder_template??"",filename_template:body.filename_template,access_profile_id:accessProfile,child_folders:children,creation_policy:body.creation_policy,rename_policy:body.rename_policy==="rename"?"rename":"keep",relationship_type_id:body.relationship_type_id||null,priority:Number(body.priority)||0,is_active:body.is_active!==false,configured_by:actor,review_storage:body.review_storage==="immediate"?"immediate":body.review_storage==="after_approval"?"after_approval":previous?.review_storage??"after_approval",conflict_policy:previous?.conflict_policy??"version"},body.id);return NextResponse.json({ok:true,id});
  }
  if(action==="health"||action==="create_root"){
   if(action==="create_root")await requireIntegrationEntitlement(org,"sharepoint",true);
   const ids=action==="create_root"?[body.location_id]:Array.isArray(body.locations)?body.locations:[];if(!ids.length||ids.length>3||ids.some((id:unknown)=>!guid(id)))throw new Error("INTEGRATION_BATCH_LIMIT");
   const results=[];
   for(const id of ids){try{const {location,graph}=await locationScope(org,id);let root=await graph.root();
     const parts=renderPath(location.root_path,"general",{}).split("/").filter(Boolean);
     if(action==="create_root")root=await ensureFolderPath(graph,parts);else for(const name of parts){const child=await graph.child(root.id,name);if(!child?.folder)throw new Error("INTEGRATION_ROOT_REQUIRED");root=child;}
     await admin.from("v2_sharepoint_locations").update({root_item_id:root.id,last_error:null,last_checked_at:new Date().toISOString(),last_success_at:new Date().toISOString()}).eq("organisation_id",org).eq("id",id);
     results.push({id,status:"Healthy"});await integrationAudit(org,connection.id,actor,action,id);
   }catch(error){const safe=integrationError(error);await admin.from("v2_sharepoint_locations").update({last_error:safe.code,last_checked_at:new Date().toISOString()}).eq("organisation_id",org).eq("id",id);results.push({id,status:safe.code==="INTEGRATION_SITE_PERMISSION_REQUIRED"?"Permission Required":"Attention Required"});}}
   const valid=await admin.from("v2_document_destinations").select("location_id").eq("organisation_id",org).eq("is_active",true);
   if(action==="health"&&results.some(r=>r.status==="Healthy"&&valid.data?.some(d=>d.location_id===r.id)))await admin.from("v2_integrations").update({status:"connected",last_checked_at:new Date().toISOString(),last_success_at:new Date().toISOString(),entitlement_check_required:false,error_category:null}).eq("organisation_id",org).eq("id",connection.id);
   return NextResponse.json({results});
  }
  if(["preview_batch","queue_batch","process_batch","retry_job"].includes(action)){
   const kind=body.kind==="project"?"project":body.kind==="person"?"person":null;
   const capability=kind==="person"?"people.edit":"projects.edit";if(!kind||!context.permissions?.[capability]||!context.enabledModules.has(kind==="person"?"people":"projects"))throw new Error("INTEGRATION_ACCESS_DENIED");
   await requireIntegrationEntitlement(org,"sharepoint",true);
   if(action==="process_batch"){
    return NextResponse.json(await processFolderBatch(org,kind,actor));
   }
   if(action==="retry_job"){const changed=await admin.from("v2_sharepoint_folder_jobs").update({status:"pending",available_at:new Date().toISOString(),last_error:null}).eq("organisation_id",org).eq("entity_kind",kind).eq("id",body.id).eq("status","failed").select("id");if(changed.error||!changed.data?.length)throw new Error("INTEGRATION_SCOPE_INVALID");return NextResponse.json({ok:true});}
   const rule=await admin.from("v2_document_destinations").select("*").eq("organisation_id",org).eq("id",body.rule_id).eq("is_active",true).single();if(!rule.data||!rule.data.location_id||!(kind==="person"?["people","profile_photos","training","onboarding"]:["projects"]).includes(rule.data.context))throw new Error("INTEGRATION_SCOPE_INVALID");
   await locationScope(org,rule.data.location_id);
   const page=Math.max(0,Number(body.page)||0);let query=admin.from(kind==="person"?"v2_people":"v2_projects").select("id",{count:"exact"}).eq("organisation_id",org).order("id");if(kind==="person"&&rule.data.relationship_type_id)query=query.eq("relationship_type_id",rule.data.relationship_type_id);
   if(kind==="project"){const accessible=await listAccessibleProjects(org);const ids=accessible.filter(p=>p.organisationId===org&&!p.party).map(p=>p.id);if(!ids.length)return NextResponse.json(action==="preview_batch"?{total:0,linked:0,missing:0}:{queued:0,total:0,next:null});query=query.in("id",ids);}
   const rows=await query.range(page*25,page*25+24);if(rows.error)throw new Error("INTEGRATION_ACTION_FAILED");
   const links=await admin.from("v2_sharepoint_folder_links").select("entity_id",{count:"exact"}).eq("organisation_id",org).eq("rule_id",rule.data.id).eq("location_id",rule.data.location_id).eq("entity_kind",kind);
   if(action==="preview_batch")return NextResponse.json({total:rows.count??0,linked:links.count??0,missing:Math.max(0,(rows.count??0)-(links.count??0))});
   for(const row of rows.data??[]){const queued=await admin.rpc("tttracker_v2_queue_folder",{p_org:org,p_rule:rule.data.id,p_kind:kind,p_record:row.id,p_actor:actor});if(queued.error)throw new Error("INTEGRATION_ACTION_FAILED");}
   await integrationAudit(org,connection.id,actor,"folder_batch_queued",rule.data.id);
   return NextResponse.json({queued:rows.data?.length??0,total:rows.count??0,next:rows.data?.length===25?page+1:null});
  }
  throw new Error("INTEGRATION_ACTION_INVALID");
 }catch(error){return NextResponse.json(integrationError(error),{status:400});}
}

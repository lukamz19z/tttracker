import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { graphForSite,ensureFolderPath } from "./sharepoint";
import { loadIntegration,integrationAudit } from "./server";
import { requireIntegrationEntitlement } from "./entitlements";
import { resolveLocationDestination,renderPath,type RoutingRule,type SharePointLocation } from "./resolver";
export type SharePointSite={id:string;organisation_id:string;integration_id:string;site_id:string|null;site_url:string;site_name:string;verified_at:string|null;permission_status:string;is_active:boolean};
export function siteUrl(value:string){
 const url=new URL(value);
 if(url.protocol!=="https:"||!/^[-a-z0-9]+\.sharepoint\.com$/i.test(url.hostname)||url.username||url.password||url.port||url.search||url.hash||/%2f|%5c|\.\./i.test(url.pathname))throw new Error("INTEGRATION_SITE_URL_INVALID");
 return url.toString().replace(/\/$/,"");
}
export async function connectedMicrosoft(org:string){
 const c=await loadIntegration(org,"sharepoint");
 if(!c?.tenant_id||!c.microsoft_tenant_verified_at||c.status==="disconnected")throw new Error("INTEGRATION_TENANT_NOT_CONNECTED");return c;
}
export async function locationScope(org:string,id:string){
 const db=createSupabaseAdmin(),connection=await connectedMicrosoft(org);
 const result=await db.from("v2_sharepoint_locations").select("*").eq("organisation_id",org).eq("id",id).eq("is_active",true).single();
 const location=result.data as SharePointLocation|null;if(result.error||!location)throw new Error("INTEGRATION_SCOPE_INVALID");
 const s=await db.from("v2_sharepoint_sites").select("*").eq("organisation_id",org).eq("integration_id",connection.id).eq("id",location.site_id).eq("is_active",true).single();
 const site=s.data as SharePointSite|null;if(s.error||!site?.site_id||!site.verified_at||site.permission_status!=="verified")throw new Error("INTEGRATION_SITE_PERMISSION_REQUIRED");
 const graph=await graphForSite({tenant_id:connection.tenant_id,site_id:site.site_id,drive_id:location.drive_id});
 if(!(await graph.drives()).some(d=>d.id===location.drive_id))throw new Error("INTEGRATION_LIBRARY_UNAVAILABLE");
 return {connection,site,location,graph};
}
export function bulkSiteGrant(application:string,tenant:string,urls:string[]){
 const guid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 if(!guid.test(application)||!guid.test(tenant)||!urls.length||urls.length>50)throw new Error("INTEGRATION_SCOPE_INVALID");
 const quote=(s:string)=>"'"+s.replace(/'/g,"''")+"'";
 const selected=[...new Set(urls.map(siteUrl))];
 return `# Microsoft administrator bootstrap only. TTTracker runtime remains Sites.Selected.
# Requires Microsoft.Graph.Authentication and Microsoft.Graph.Sites modules.
Connect-MgGraph -TenantId ${quote(tenant)} -Scopes 'Sites.FullControl.All'
$appId = ${quote(application)}
$sites = @(
${selected.map(s=>"  "+quote(s)).join("\n")}
)
try {
 foreach ($siteUrl in $sites) {
  try {
   $url = [Uri]$siteUrl
   $site = Get-MgSite -SiteId ($url.Host + ':' + $url.AbsolutePath) -ErrorAction Stop
   $existing = Get-MgSitePermission -SiteId $site.Id -All -ErrorAction Stop | Where-Object { $_.GrantedToIdentities.Application.Id -contains $appId -or $_.GrantedToIdentitiesV2.Application.Id -contains $appId }
   if ($existing) {
    if ($existing.Roles -notcontains 'write') { throw 'Existing permission requires administrator review; no permission is overwritten.' }
   } else {
    $body = @{ roles = @('write'); grantedToIdentities = @(@{ application = @{ id = $appId; displayName = 'TTTracker' } }) }
    New-MgSitePermission -SiteId $site.Id -BodyParameter $body -ErrorAction Stop | Out-Null
   }
   Write-Output ($siteUrl + ' - Granted')
  } catch { Write-Output ($siteUrl + ' - Failed; review Microsoft administrator permissions and site URL') }
 }
} finally { Disconnect-MgGraph | Out-Null }`;
}
export async function verifyCandidateSite(org:string,id:string,actor:string,signal?:AbortSignal){
 const db=createSupabaseAdmin(),c=await connectedMicrosoft(org);
 const r=await db.from("v2_sharepoint_sites").select("*").eq("organisation_id",org).eq("integration_id",c.id).eq("id",id).single();if(r.error||!r.data)throw new Error("INTEGRATION_SCOPE_INVALID");
 try{
  const url=siteUrl(r.data.site_url),resolver=await graphForSite({tenant_id:c.tenant_id,signal}),resolved=await resolver.resolveSite(url);
  if(siteUrl(resolved.webUrl).toLowerCase()!==url.toLowerCase()||!/^[a-z0-9.-]+\.sharepoint\.com,[a-f0-9-]{36},[a-f0-9-]{36}$/i.test(resolved.id))throw new Error("INTEGRATION_SCOPE_INVALID");
  const graph=await graphForSite({tenant_id:c.tenant_id,site_id:resolved.id,signal});await graph.drives();
  const saved=await db.from("v2_sharepoint_sites").update({site_id:resolved.id,verified_at:new Date().toISOString(),permission_status:"verified",last_checked_at:new Date().toISOString(),last_error:null}).eq("organisation_id",org).eq("id",id);if(saved.error)throw new Error("INTEGRATION_ACTION_FAILED");
  await integrationAudit(org,c.id,actor,"site_verified",id);return {id,status:"Verified"};
 }catch(error){const safe=error instanceof Error&&error.message.startsWith("INTEGRATION_")?error.message:"INTEGRATION_ACTION_FAILED";
  await db.from("v2_sharepoint_sites").update({verified_at:null,permission_status:safe==="INTEGRATION_SITE_PERMISSION_REQUIRED"?"permission_required":"error",last_error:safe,last_checked_at:new Date().toISOString()}).eq("organisation_id",org).eq("id",id);
  await integrationAudit(org,c.id,actor,"site_verification_failed",id,"failed");return {id,status:safe==="INTEGRATION_SITE_PERMISSION_REQUIRED"?"Permission Required":"Error"};
 }
}
export async function provisionFolder(org:string,job:{rule_id:string;location_id:string;entity_kind:string;entity_id:string;actor_id:string}){
 await requireIntegrationEntitlement(org,"sharepoint",true);
 const providerConnection=await connectedMicrosoft(org);if(providerConnection.status!=="connected")throw new Error("INTEGRATION_CONNECTION_CHECK_REQUIRED");
 const db=createSupabaseAdmin(),r=await db.from("v2_document_destinations").select("*").eq("organisation_id",org).eq("id",job.rule_id).eq("is_active",true).single();
 const rule=r.data as RoutingRule|null;if(r.error||!rule||rule.location_id!==job.location_id)throw new Error("INTEGRATION_SCOPE_INVALID");
 const profile=await db.from("v2_integration_access_profiles").select("classification,native_mode").eq("organisation_id",org).eq("id",rule.access_profile_id).single();
 if(profile.data?.classification!=="operational"||profile.data.native_mode!=="inherit")throw new Error("INTEGRATION_ACCESS_DENIED");
 const table=job.entity_kind==="person"?"v2_people":job.entity_kind==="project"?"v2_projects":null;if(!table)throw new Error("INTEGRATION_SCOPE_INVALID");
 const allowed=await db.rpc("tttracker_v2_folder_worker_permission",{p_org:org,p_actor:job.actor_id,p_kind:job.entity_kind,p_record:job.entity_id,p_rule:rule.id});if(allowed.error||allowed.data!==true)throw new Error("INTEGRATION_ACCESS_DENIED");
 let values:Record<string,string>;
 if(job.entity_kind==="person"){
  const record=await db.from("v2_people").select("id,display_name,employee_number,relationship_type_id").eq("organisation_id",org).eq("id",job.entity_id).single();if(record.error||!record.data)throw new Error("INTEGRATION_SCOPE_INVALID");
  if(rule.relationship_type_id&&rule.relationship_type_id!==record.data.relationship_type_id)throw new Error("INTEGRATION_SCOPE_INVALID");
  const names=record.data.display_name.trim().split(/\s+/);
  values={person_id:record.data.id,person_display_name:record.data.display_name,employee_number:record.data.employee_number??"",first_name:names[0]??"",last_name:names.slice(1).join(" ")};
 }else{
  const record=await db.from("v2_projects").select("id,name,code,project_number,client_name").eq("organisation_id",org).eq("id",job.entity_id).single();if(record.error||!record.data)throw new Error("INTEGRATION_SCOPE_INVALID");
  values={project_id:record.data.id,project_name:record.data.name,project_code:record.data.code,project_number:record.data.project_number??record.data.code,client_name:record.data.client_name??""};
 }
 values.year=String(new Date().getUTCFullYear());values.month=String(new Date().getUTCMonth()+1).padStart(2,"0");
 const {location,graph,site,connection}=await locationScope(org,job.location_id);
 // Folder provisioning does not need filename-only tokens such as expiry_date.
 const resolved=resolveLocationDestination({...rule,filename_template:"folder"},location,org,rule.context,values,"operational");
 const parts=resolved.folderSegments;if(!parts.length)throw new Error("INTEGRATION_PATH_INVALID");
 const previous=await db.from("v2_sharepoint_folder_links").select("*").eq("organisation_id",org).eq("location_id",location.id).eq("rule_id",rule.id).eq("entity_kind",job.entity_kind).eq("entity_id",job.entity_id).maybeSingle();if(previous.error)throw new Error("INTEGRATION_ACTION_FAILED");
 let item;let parent;let outcome="existing";
 if(previous.data){
  if(previous.data.drive_id!==location.drive_id||previous.data.site_id!==site.site_id)throw new Error("INTEGRATION_SCOPE_INVALID");
  item=await graph.metadata(previous.data.drive_item_id);if(!item.folder)throw new Error("INTEGRATION_CONFLICT");parent={id:previous.data.parent_item_id};
  if(rule.rename_policy==="rename"&&item.name!==parts.at(-1)){
   const conflict=await graph.child(parent.id,parts.at(-1)!);if(conflict&&conflict.id!==item.id)throw new Error("INTEGRATION_CONFLICT");
   item=await graph.renameFolder(item.id,parts.at(-1)!,item.eTag??"");outcome="renamed";
  }
 }else{
  parent=await ensureFolderPath(graph,parts.slice(0,-1));const existing=await graph.child(parent.id,parts.at(-1)!);
  item=await graph.ensureFolder(parent.id,parts.at(-1)!);outcome=existing?"existing":"created";
 }
 for(const child of rule.child_folders??[]){let childParent=item.id;for(const name of renderPath(child,rule.context,values).split("/").filter(Boolean))childParent=(await graph.ensureFolder(childParent,name)).id;}
 const path=previous.data?previous.data.path_snapshot.split("/").slice(0,-1).concat(item.name).join("/"):parts.slice(0,-1).concat(item.name).join("/");
 if(previous.data&&previous.data.path_snapshot!==path){
  const snapshots=await db.rpc("tttracker_v2_sync_folder_document_paths",{p_org:org,p_location:location.id,p_kind:job.entity_kind,p_entity:job.entity_id,p_old:previous.data.path_snapshot,p_new:path});
  if(snapshots.error)throw new Error("INTEGRATION_STATUS_SAVE_FAILED");
 }
 const saved=await db.from("v2_sharepoint_folder_links").upsert({organisation_id:org,location_id:location.id,rule_id:rule.id,entity_kind:job.entity_kind,entity_id:job.entity_id,site_id:site.site_id,drive_id:location.drive_id,drive_item_id:item.id,parent_item_id:parent.id,folder_name:item.name,path_snapshot:path,updated_at:new Date().toISOString()},{onConflict:"organisation_id,location_id,rule_id,entity_kind,entity_id"});if(saved.error)throw new Error("INTEGRATION_STATUS_SAVE_FAILED");
 await integrationAudit(org,connection.id,job.actor_id,outcome==="renamed"?"folder_renamed":"folder_provisioned",job.entity_id);return outcome;
}

export async function processFolderBatch(org:string,kind:"person"|"project",actor:string|null){
 const db=createSupabaseAdmin();
 await requireIntegrationEntitlement(org,"sharepoint",true);await connectedMicrosoft(org);
 const claim=await db.rpc("tttracker_v2_claim_folder_job",{p_org:org,p_actor:actor,p_kind:kind});if(claim.error)throw new Error("INTEGRATION_ACTION_FAILED");if(!claim.data)return {processed:0};
 const job=claim.data;let outcome:string|null=null,lastError:string|null=null,delay=60;
 try{outcome=await provisionFolder(org,job);}catch(error){lastError=error instanceof Error&&/^INTEGRATION_[A-Z_]+$/.test(error.message)?error.message:"INTEGRATION_ACTION_FAILED";delay=Math.min(3600,Math.max(Number((error as {retryAfter?:number})?.retryAfter)||0,15*2**Math.min(job.attempts,7)));const connection=await connectedMicrosoft(org);await integrationAudit(org,connection.id,job.actor_id,"folder_provision_failed",job.entity_id,"failed");}
 const saved=await db.rpc("tttracker_v2_finish_folder_job",{p_org:org,p_job:job.id,p_lease:job.lease_id,p_outcome:outcome,p_error:lastError,p_delay:delay});if(saved.error||saved.data!==true)throw new Error("INTEGRATION_STATUS_SAVE_FAILED");return {processed:1,status:lastError?"Failed":"Ready"};
}

import { requireIntegrationEntitlement } from "@/lib/integrations/entitlements";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { integrationContext,integrationAudit,integrationError,loadIntegration } from "@/lib/integrations/server";
import { graphForSite,microsoftConfig,tenantId } from "@/lib/integrations/sharepoint";
import { renderPath, type DocumentContext } from "@/lib/integrations/resolver";
import { providerReadiness,microsoftDiagnostics } from "@/lib/integrations/readiness";
import { sharePointWizard } from "@/lib/integrations/sharepoint-wizard";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function GET(request: NextRequest) {
  try {
    const {org,admin,context} = await integrationContext(request.nextUrl.searchParams.get("organisation"),"sharepoint","view");
    const connection = await loadIntegration(org,"sharepoint");
    // Project only the connecting actor's safe display label, never the auth record.
    if(connection?.connected_by){
      const actor=await admin.auth.admin.getUserById(connection.connected_by);
      const user=actor.data?.user;
      connection.connected_by_name=typeof user?.user_metadata?.full_name==="string"?user.user_metadata.full_name:typeof user?.user_metadata?.name==="string"?user.user_metadata.name:user?.email??null;
    }
    const sites = await admin.from("v2_sharepoint_sites").select("*").eq("organisation_id",org);
    const destinations = await admin.from("v2_document_destinations").select("*").eq("organisation_id",org).order("name").limit(100);
    const profiles = await admin.from("v2_integration_access_profiles").select("*").eq("organisation_id",org).order("name").limit(100);
    const readiness=await providerReadiness("sharepoint",!!context.permissions?.["integrations.sharepoint.manage"]);
    const configured=readiness.configured;
    const jobs=context.permissions?.["training.view"]?await admin.from("v2_document_provider_jobs").select("id,document_id,destination_id,status,synced_at,last_error,attempts,available_at").eq("organisation_id",org).order("available_at",{ascending:false}).limit(20):{data:[]};
    const applicationId = configured && context.permissions?.["integrations.sharepoint.manage"] ? microsoftConfig().clientId : null;
    const capabilities=context.permissions?.["integrations.sharepoint.manage"]?await admin.from("v2_permissions").select("permission_code,name").order("name"): {data:[]};
    if(sites.error||destinations.error||profiles.error)throw new Error("INTEGRATION_SCHEMA_REQUIRED");
    return NextResponse.json({connection,sites:sites.data??[],destinations:destinations.data??[],profiles:profiles.data??[],jobs:jobs.data??[],configured,diagnostics:microsoftDiagnostics(),applicationId,capabilities:capabilities.data??[]},{headers:{"Cache-Control":"no-store"}});
  } catch(error){return NextResponse.json(integrationError(error),{status:403});}
}
export async function POST(request: NextRequest) {
  let failedConnection: { org:string; id:string; actor:string } | undefined;
  try {
    if(request.headers.get("origin") !== request.nextUrl.origin) throw new Error("INTEGRATION_ACCESS_DENIED");
    const body = await request.json();
    const {org,admin,context} = await integrationContext(body.organisation,"sharepoint","manage");
    const action = String(body.action);
    if(action!=="disconnect")microsoftConfig();
    let connection = await loadIntegration(org,"sharepoint");
    if(!connection){ const result=await admin.from("v2_integrations").insert({organisation_id:org,provider:"sharepoint"}).select().single();if(result.error)throw new Error("INTEGRATION_ACTION_FAILED");connection=result.data; }
    failedConnection={org,id:connection.id,actor:context.userId};
    if(action==="connect") {
      const config=microsoftConfig();const supplied=body.tenant_id?tenantId(String(body.tenant_id)):null;
      if(connection.tenant_id && supplied && connection.tenant_id!==supplied) throw new Error("INTEGRATION_TENANT_CHANGE_REQUIRES_DISCONNECT");
      const tenant=connection.tenant_id || supplied;
      const state=randomBytes(32).toString("base64url");
      const saved=await admin.from("v2_integration_oauth_states").insert({state_hash:hash(state),organisation_id:org,integration_id:connection.id,actor_id:context.userId,provider:"sharepoint",expected_tenant:tenant,expires_at:new Date(Date.now()+600000).toISOString()});
      if(saved.error)throw new Error("INTEGRATION_ACTION_FAILED");
      await integrationAudit(org,connection.id,context.userId,connection.tenant_id?"reconnect_started":"connection_started");
      const params=new URLSearchParams({client_id:config.clientId,scope:"https://graph.microsoft.com/.default",redirect_uri:`${config.origin}/api/integrations/sharepoint/callback`,state});
      const response=NextResponse.json({url:`https://login.microsoftonline.com/${tenant??"organizations"}/v2.0/adminconsent?${params}`});
      response.cookies.set("tt-integration-state",`${org}.${state}`,{httpOnly:true,secure:config.origin.startsWith("https:"),sameSite:"lax",maxAge:600,path:"/api/integrations/sharepoint/callback"});return response;
    }
    if(action==="disconnect") {
      await integrationAudit(org,connection.id,context.userId,"disconnect");
      const result=await admin.from("v2_integrations").update({status:"disconnected",microsoft_tenant_verified_at:null,error_category:null}).eq("organisation_id",org).eq("id",connection.id);if(result.error)throw new Error("INTEGRATION_ACTION_FAILED");
      return NextResponse.json({ok:true});
    }
    if(!connection.tenant_id || !connection.microsoft_tenant_verified_at || connection.status==="disconnected" || connection.error_category==="INTEGRATION_RECONNECT_REQUIRED")throw new Error("INTEGRATION_TENANT_NOT_CONNECTED");
    if(action==="verify_site") {
      const previous=connection.setup_site_id?await admin.from("v2_sharepoint_sites").select("site_url,site_id").eq("organisation_id",org).eq("integration_id",connection.id).eq("id",connection.setup_site_id).single():null;
      if(previous?.error)throw new Error("INTEGRATION_SCOPE_INVALID");
      if(previous?.data && ((body.site_url && String(body.site_url).replace(/\/$/,"").toLowerCase()!==previous.data.site_url.replace(/\/$/,"").toLowerCase()) || (body.site_id && body.site_id!==previous.data.site_id)) && body.confirm_change!=="true")throw new Error("INTEGRATION_CONFIGURATION_CHANGE_CONFIRMATION_REQUIRED");
      let siteId=String(body.site_id??"");
      if(body.site_url){
        const resolver=await graphForSite({tenant_id:connection.tenant_id});
        const resolved=await resolver.resolveSite(String(body.site_url));
        if(new URL(resolved.webUrl).origin!==new URL(body.site_url).origin || new URL(resolved.webUrl).pathname.replace(/\/$/,"").toLowerCase()!==new URL(body.site_url).pathname.replace(/\/$/,"").toLowerCase())throw new Error("INTEGRATION_SCOPE_INVALID");
        siteId=resolved.id;
      }
      if(!/^[a-z0-9.-]+\.sharepoint\.com,[a-f0-9-]{36},[a-f0-9-]{36}$/i.test(siteId))throw new Error("INTEGRATION_SCOPE_INVALID");
      const graph=await graphForSite({tenant_id:connection.tenant_id,site_id:siteId});
      const site=await graph.site();if(site.id.toLowerCase()!==siteId.toLowerCase() || new URL(site.webUrl).hostname!==siteId.split(",")[0])throw new Error("INTEGRATION_SCOPE_INVALID");
      const drives=await graph.drives();
      const result=await admin.from("v2_sharepoint_sites").upsert({organisation_id:org,integration_id:connection.id,site_id:site.id,site_url:site.webUrl,site_name:site.displayName,verified_at:new Date().toISOString()},{onConflict:"integration_id,site_id"}).select().single();
      if(result.error)throw new Error("INTEGRATION_ACTION_FAILED");
      const selected=await admin.from("v2_integrations").update({setup_site_id:result.data.id,status:"setup_required",entitlement_check_required:!!connection.entitlement_check_required||connection.status==="connected"||!!(connection.setup_site_id&&connection.setup_site_id!==result.data.id),error_category:null}).eq("organisation_id",org).eq("id",connection.id);if(selected.error)throw new Error("INTEGRATION_ACTION_FAILED");
      await integrationAudit(org,connection.id,context.userId,"site_verified",result.data.id);
      return NextResponse.json({site:result.data,drives});
    }
    if(action==="libraries" || action==="library" || action==="health" || action==="finish" || action==="test_upload" || action==="create_roots") {
      const result=await admin.from("v2_sharepoint_sites").select("*").eq("organisation_id",org).eq("integration_id",connection.id).eq("id",body.site).single();
      const site=result.data;if(!site)throw new Error("INTEGRATION_SCOPE_INVALID");
      if(!site.verified_at)throw new Error("INTEGRATION_SITE_PERMISSION_REQUIRED");
      if(action==="library" && ((site.drive_id && site.drive_id!==body.drive)||(connection.setup_site_id && connection.setup_site_id!==site.id)) && body.confirm_change!=="true")throw new Error("INTEGRATION_CONFIGURATION_CHANGE_CONFIRMATION_REQUIRED");
      if (["test_upload","create_roots"].includes(action)) await requireIntegrationEntitlement(org,"sharepoint",true);
      const graph=await graphForSite({tenant_id:connection.tenant_id,site_id:site.site_id,drive_id:action==="library"?String(body.drive):site.drive_id});
      await graph.site();const drives=await graph.drives();
      if(action==="libraries")return NextResponse.json({drives,site});
      const drive=drives.find(d=>d.id===(action==="library"?body.drive:site.drive_id));if(!drive)throw new Error("INTEGRATION_LIBRARY_UNAVAILABLE");
      const root=await graph.root();
      if(action==="create_roots"){
        const destinations=await admin.from("v2_document_destinations").select("id,root_path,context").eq("organisation_id",org).eq("site_id",site.id).eq("is_active",true);
        if(destinations.error)throw new Error("INTEGRATION_ACTION_FAILED");
        for(const destination of destinations.data??[]){
          if(destination.root_path.includes("{"))continue;
          await integrationAudit(org,connection.id,context.userId,"root_creation_requested",destination.id);
          let parent=root.id;for(const name of renderPath(destination.root_path,destination.context as DocumentContext,{}).split("/").filter(Boolean))parent=(await graph.ensureFolder(parent,name)).id;
          await integrationAudit(org,connection.id,context.userId,"root_created",destination.id);
        }
        return NextResponse.json({ok:true});
      }
      if(action==="health"||action==="finish"){
        if(action==="finish"){
          const [destinations,profiles]=await Promise.all([admin.from("v2_document_destinations").select("*").eq("organisation_id",org),admin.from("v2_integration_access_profiles").select("*").eq("organisation_id",org)]);
          if(destinations.error||profiles.error||!sharePointWizard({configured:true,connection,sites:[site],destinations:destinations.data??[],profiles:profiles.data??[]},"Test & Finish",site.id).access)throw new Error("INTEGRATION_DESTINATION_ACCESS_REQUIRED");
        }
        const configured=await admin.from("v2_document_destinations").select("root_path,context").eq("organisation_id",org).eq("site_id",site.id).eq("is_active",true);
        if(configured.error)throw new Error("INTEGRATION_ACTION_FAILED");
        for(const destination of configured.data??[]){
          // Dynamic roots need record context and are checked at upload; literal roots must already exist.
          if(destination.root_path.includes("{"))continue;
          let parent=root.id;
          for(const name of renderPath(destination.root_path,destination.context as DocumentContext,{}).split("/").filter(Boolean)){
            const child=await graph.child(parent,name);if(!child?.folder)throw new Error("INTEGRATION_ROOT_REQUIRED");parent=child.id;
          }
        }
      }
      if(action==="test_upload"){
        await integrationAudit(org,connection.id,context.userId,"test_upload_requested",site.id);
        const item=await graph.upload(root.id,`TTTracker Connection Test ${randomBytes(8).toString("hex")}.txt`,Buffer.from("TTTracker synthetic connection test. No business data."));
        try{await graph.metadata(item.id);}finally{
          try{if(!item.eTag)throw new Error();await graph.deleteTestItem(item.id,item.eTag);}
          catch{await integrationAudit(org,connection.id,context.userId,"test_upload_cleanup_failed",site.id,"failed");throw new Error("INTEGRATION_TEST_CLEANUP_REQUIRED");}
        }
        await integrationAudit(org,connection.id,context.userId,"test_upload_cleaned",site.id);return NextResponse.json({ok:true});
      }
      if(action==="library"){
        if(site.drive_id && site.drive_id!==drive.id){const paused=await admin.from("v2_document_destinations").update({is_active:false}).eq("organisation_id",org).eq("site_id",site.id);if(paused.error)throw new Error("INTEGRATION_ACTION_FAILED");}
        const saved=await admin.from("v2_sharepoint_sites").update({drive_id:drive.id,drive_name:drive.name}).eq("organisation_id",org).eq("id",site.id);if(saved.error)throw new Error("INTEGRATION_ACTION_FAILED");
      }
      const now=new Date().toISOString();const updated=await admin.from("v2_integrations").update({status:action==="finish"?"connected":action==="library"?"setup_required":connection.status,last_checked_at:now,...(action==="health"||action==="finish"?{entitlement_check_required:false}:action==="library"?{entitlement_check_required:!!connection.entitlement_check_required||!!(site.drive_id&&site.drive_id!==drive.id)||!!(connection.setup_site_id&&connection.setup_site_id!==site.id),setup_site_id:site.id}:{}),last_success_at:now,error_category:null,...(action==="finish"?{connected_by:context.userId,connected_at:connection.connected_at??now}:{})}).eq("organisation_id",org).eq("id",connection.id);if(updated.error)throw new Error("INTEGRATION_ACTION_FAILED");
      await integrationAudit(org,connection.id,context.userId,action,site.id);return NextResponse.json({ok:true,drives});
    }
    if(action==="profile") {
      const configured=await admin.from("v2_sharepoint_sites").select("id").eq("organisation_id",org).eq("integration_id",connection.id).not("verified_at","is",null).not("drive_id","is",null).limit(1);if(configured.error||!configured.data?.length)throw new Error("INTEGRATION_LIBRARY_REQUIRED");
      if(body.classification==="confidential")throw new Error("INTEGRATION_CONFIDENTIAL_UNAVAILABLE");
      if(body.classification==="private" && (!/^people\.private\./.test(String(body.read_capability))||!/^people\.private\./.test(String(body.manage_capability))))throw new Error("INTEGRATION_PROFILE_INVALID");
      const values={organisation_id:org,name:String(body.name).slice(0,120),classification:body.classification,read_capability:body.read_capability,manage_capability:body.manage_capability,native_mode:"inherit"};
      const result=body.id?await admin.from("v2_integration_access_profiles").update(values).eq("organisation_id",org).eq("id",body.id).select().single():await admin.from("v2_integration_access_profiles").insert(values).select().single();
      if(result.error)throw new Error("INTEGRATION_PROFILE_INVALID");await integrationAudit(org,connection.id,context.userId,body.id?"access_profile_changed":"access_profile_created",result.data.id);return NextResponse.json({ok:true});
    }
    if(action==="destination") {
      const site=await admin.from("v2_sharepoint_sites").select("id,drive_id,verified_at").eq("organisation_id",org).eq("integration_id",connection.id).eq("id",body.site_id).single();
      const profile=await admin.from("v2_integration_access_profiles").select("classification").eq("organisation_id",org).eq("id",body.access_profile_id).single();
      if(!site.data?.drive_id || !site.data.verified_at || !profile.data || profile.data.classification==="confidential")throw new Error("INTEGRATION_SCOPE_INVALID");
      for(const key of ["root_path","folder_template","filename_template"]){const tokens=String(body[key]??"").matchAll(/\{([^{}]+)\}/g);const values=Object.fromEntries([...tokens].map(m=>[m[1],"Example"]));renderPath(String(body[key]??""),body.context as DocumentContext,values,key==="filename_template");}
      const values={organisation_id:org,site_id:body.site_id,access_profile_id:body.access_profile_id,name:body.name,code:body.code,context:body.context,root_path:body.root_path,folder_template:body.folder_template,filename_template:body.filename_template,creation_policy:body.creation_policy??"first_upload",review_storage:body.review_storage??"after_approval",conflict_policy:body.conflict_policy??"version",is_active:body.is_active!=="false"};
      const result=body.id?await admin.from("v2_document_destinations").update(values).eq("organisation_id",org).eq("id",body.id).select().single():await admin.from("v2_document_destinations").insert(values).select().single();
      if(result.error)throw new Error("INTEGRATION_DESTINATION_INVALID");await integrationAudit(org,connection.id,context.userId,body.id?"destination_changed":"destination_created",result.data.id);return NextResponse.json({ok:true});
    }
    throw new Error("INTEGRATION_ACTION_INVALID");
  } catch(error){
    const safe=integrationError(error);
    if(failedConnection && ["INTEGRATION_SITE_PERMISSION_REQUIRED","INTEGRATION_RECONNECT_REQUIRED","INTEGRATION_RESOURCE_NOT_FOUND"].includes(safe.code)){
      try{
        const {org,id,actor}=failedConnection;
        const {admin}=await integrationContext(org,"sharepoint","manage");
        await admin.from("v2_integrations").update({status:"attention_required",error_category:safe.code,last_checked_at:new Date().toISOString()}).eq("organisation_id",org).eq("id",id);
        await integrationAudit(org,id,actor,"connection_check_failed",undefined,"failed");
      }catch{ /* Preserve the safe provider failure if status persistence is unavailable. */ }
    }
    return NextResponse.json(safe,{status:400,headers:{"Cache-Control":"no-store"}});
  }
}

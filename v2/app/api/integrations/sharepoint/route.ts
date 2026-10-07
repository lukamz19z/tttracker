import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { integrationContext,integrationAudit,integrationError,loadIntegration } from "@/lib/integrations/server";
import { graphForSite,microsoftConfig,tenantId } from "@/lib/integrations/sharepoint";
import { renderPath, type DocumentContext } from "@/lib/integrations/resolver";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function GET(request: NextRequest) {
  try {
    const {org,admin,context} = await integrationContext(request.nextUrl.searchParams.get("organisation"),"sharepoint","view");
    const connection = await loadIntegration(org,"sharepoint");
    const sites = await admin.from("v2_sharepoint_sites").select("*").eq("organisation_id",org);
    const destinations = await admin.from("v2_document_destinations").select("*").eq("organisation_id",org).order("name").limit(100);
    const profiles = await admin.from("v2_integration_access_profiles").select("*").eq("organisation_id",org).order("name").limit(100);
    let configured = false;try{microsoftConfig();configured=true;}catch{}
    const jobs=context.permissions?.["training.view"]?await admin.from("v2_document_provider_jobs").select("id,document_id,destination_id,status,synced_at,last_error,attempts,available_at").eq("organisation_id",org).order("available_at",{ascending:false}).limit(20):{data:[]};
    return NextResponse.json({connection,sites:sites.data??[],destinations:destinations.data??[],profiles:profiles.data??[],jobs:jobs.data??[],configured},{headers:{"Cache-Control":"no-store"}});
  } catch(error){return NextResponse.json(integrationError(error),{status:403});}
}
export async function POST(request: NextRequest) {
  try {
    if(request.headers.get("origin") !== request.nextUrl.origin) throw new Error("INTEGRATION_ACCESS_DENIED");
    const body = await request.json();
    const {org,admin,context} = await integrationContext(body.organisation,"sharepoint","manage");
    let connection = await loadIntegration(org,"sharepoint");
    if(!connection){ const result=await admin.from("v2_integrations").insert({organisation_id:org,provider:"sharepoint"}).select().single();if(result.error)throw new Error("INTEGRATION_ACTION_FAILED");connection=result.data; }
    const action = String(body.action);
    if(action==="connect") {
      const config=microsoftConfig();const tenant=tenantId(String(body.tenant_id));
      if(connection.tenant_id && connection.tenant_id!==tenant) throw new Error("INTEGRATION_TENANT_CHANGE_REQUIRES_DISCONNECT");
      const state=randomBytes(32).toString("base64url");
      const saved=await admin.from("v2_integration_oauth_states").insert({state_hash:hash(state),organisation_id:org,integration_id:connection.id,actor_id:context.userId,provider:"sharepoint",expected_tenant:tenant,expires_at:new Date(Date.now()+600000).toISOString()});
      if(saved.error)throw new Error("INTEGRATION_ACTION_FAILED");
      const params=new URLSearchParams({client_id:config.clientId,scope:"https://graph.microsoft.com/.default",redirect_uri:`${config.origin}/api/integrations/sharepoint/callback`,state});
      const response=NextResponse.json({url:`https://login.microsoftonline.com/${tenant}/v2.0/adminconsent?${params}`});
      response.cookies.set("tt-integration-state",`${org}.${state}`,{httpOnly:true,secure:true,sameSite:"lax",maxAge:600,path:"/api/integrations/sharepoint/callback"});return response;
    }
    if(action==="disconnect") {
      await integrationAudit(org,connection.id,context.userId,"disconnect");
      const result=await admin.from("v2_integrations").update({status:"disconnected",error_category:null}).eq("organisation_id",org).eq("id",connection.id);if(result.error)throw new Error("INTEGRATION_ACTION_FAILED");
      return NextResponse.json({ok:true});
    }
    if(!connection.tenant_id || connection.status==="disconnected")throw new Error("INTEGRATION_SETUP_REQUIRED");
    if(action==="verify_site") {
      const siteId=String(body.site_id??"");
      if(!/^[a-z0-9.-]+\.sharepoint\.com,[a-f0-9-]{36},[a-f0-9-]{36}$/i.test(siteId))throw new Error("INTEGRATION_SCOPE_INVALID");
      const graph=await graphForSite({tenant_id:connection.tenant_id,site_id:siteId});
      const site=await graph.site();if(site.id.toLowerCase()!==siteId.toLowerCase() || new URL(site.webUrl).hostname!==siteId.split(",")[0])throw new Error("INTEGRATION_SCOPE_INVALID");
      const drives=await graph.drives();
      const result=await admin.from("v2_sharepoint_sites").upsert({organisation_id:org,integration_id:connection.id,site_id:site.id,site_url:site.webUrl,site_name:site.displayName,verified_at:new Date().toISOString()},{onConflict:"integration_id,site_id"}).select().single();
      if(result.error)throw new Error("INTEGRATION_ACTION_FAILED");
      await integrationAudit(org,connection.id,context.userId,"site_verified",result.data.id);
      return NextResponse.json({site:result.data,drives});
    }
    if(action==="library" || action==="health") {
      const result=await admin.from("v2_sharepoint_sites").select("*").eq("organisation_id",org).eq("integration_id",connection.id).eq("id",body.site).single();
      const site=result.data;if(!site)throw new Error("INTEGRATION_SCOPE_INVALID");
      const graph=await graphForSite({tenant_id:connection.tenant_id,site_id:site.site_id,drive_id:action==="library"?String(body.drive):site.drive_id});
      await graph.site();const drives=await graph.drives();const drive=drives.find(d=>d.id===(action==="library"?body.drive:site.drive_id));if(!drive)throw new Error("INTEGRATION_SCOPE_INVALID");await graph.root();
      if(action==="library"){const saved=await admin.from("v2_sharepoint_sites").update({drive_id:drive.id,drive_name:drive.name}).eq("organisation_id",org).eq("id",site.id);if(saved.error)throw new Error("INTEGRATION_ACTION_FAILED");}
      const now=new Date().toISOString();await admin.from("v2_integrations").update({status:"connected",last_checked_at:now,last_success_at:now,error_category:null,connected_by:context.userId,connected_at:connection.connected_at??now}).eq("organisation_id",org).eq("id",connection.id);
      await integrationAudit(org,connection.id,context.userId,action,site.id);return NextResponse.json({ok:true,drives});
    }
    if(action==="profile") {
      if(body.classification==="confidential")throw new Error("INTEGRATION_CONFIDENTIAL_UNAVAILABLE");
      if(body.classification==="private" && (!/^people\.private\./.test(String(body.read_capability))||!/^people\.private\./.test(String(body.manage_capability))))throw new Error("INTEGRATION_PROFILE_INVALID");
      const result=await admin.from("v2_integration_access_profiles").insert({organisation_id:org,name:String(body.name).slice(0,120),classification:body.classification,read_capability:body.read_capability,manage_capability:body.manage_capability,native_mode:"inherit"}).select().single();
      if(result.error)throw new Error("INTEGRATION_PROFILE_INVALID");await integrationAudit(org,connection.id,context.userId,"access_profile_created",result.data.id);return NextResponse.json({ok:true});
    }
    if(action==="destination") {
      const site=await admin.from("v2_sharepoint_sites").select("id,drive_id").eq("organisation_id",org).eq("integration_id",connection.id).eq("id",body.site_id).single();
      const profile=await admin.from("v2_integration_access_profiles").select("classification").eq("organisation_id",org).eq("id",body.access_profile_id).single();
      if(!site.data?.drive_id || !profile.data || profile.data.classification==="confidential")throw new Error("INTEGRATION_SCOPE_INVALID");
      for(const key of ["root_path","folder_template","filename_template"]){const tokens=String(body[key]??"").matchAll(/\{([^{}]+)\}/g);const values=Object.fromEntries([...tokens].map(m=>[m[1],"Example"]));renderPath(String(body[key]??""),body.context as DocumentContext,values,key==="filename_template");}
      const result=await admin.from("v2_document_destinations").insert({organisation_id:org,site_id:body.site_id,access_profile_id:body.access_profile_id,name:body.name,code:body.code,context:body.context,root_path:body.root_path,folder_template:body.folder_template,filename_template:body.filename_template,creation_policy:body.creation_policy??"first_upload",review_storage:body.review_storage??"after_approval",conflict_policy:body.conflict_policy??"version"}).select().single();
      if(result.error)throw new Error("INTEGRATION_DESTINATION_INVALID");await integrationAudit(org,connection.id,context.userId,"destination_created",result.data.id);return NextResponse.json({ok:true});
    }
    throw new Error("INTEGRATION_ACTION_INVALID");
  } catch(error){return NextResponse.json(integrationError(error),{status:400,headers:{"Cache-Control":"no-store"}});}
}

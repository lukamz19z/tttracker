import {NextRequest,NextResponse} from "next/server";
import {randomBytes,createHash} from "node:crypto";
import {integrationContext,integrationAudit,integrationError,loadIntegration} from "@/lib/integrations/server";
import {xeroConfig,xeroAccessToken,xeroConnections,disconnectXero,xeroRead} from "@/lib/integrations/xero";
import {integrationCredentialReady} from "@/lib/integrations/credential-crypto";
import {featureScopes} from "@/lib/integrations/xero-catalogue";
export async function GET(request:NextRequest){
  try{
    const {org,admin,context}=await integrationContext(request.nextUrl.searchParams.get("organisation"),"xero","view");
    const connection=await loadIntegration(org,"xero");
    const settings=await admin.from("v2_xero_settings").select("features,granted_scopes,payroll_region,last_refreshed_at,export_policy").eq("organisation_id",org).eq("integration_id",connection?.id??"00000000-0000-0000-0000-000000000000").maybeSingle();
    const pending=await admin.from("v2_xero_pending_tenants").select("candidates").eq("organisation_id",org).eq("actor_id",context.userId).gt("expires_at",new Date().toISOString()).maybeSingle();
    let configured=false;try{xeroConfig();configured=true;}catch{}
    const ready=configured?await integrationCredentialReady():false; // Platform readiness is independent of tenant management permission.
    return NextResponse.json({connection,settings:settings.data,candidates:pending.data?.candidates??[],configured,credentialReady:ready},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return NextResponse.json(integrationError(error),{status:403});}
}
export async function POST(request:NextRequest){
  try{
    if(request.headers.get("origin")!==request.nextUrl.origin)throw new Error("INTEGRATION_ACCESS_DENIED");
    const body=await request.json();const search=body.action==="search_employees"||body.action==="search_projects";const {org,admin,context}=await integrationContext(body.organisation,"xero",search?"view":"manage");
    const action=String(body.action);let connection=await loadIntegration(org,"xero");
    if(action==="connect"){
      const config=xeroConfig();if(!await integrationCredentialReady())throw new Error("INTEGRATION_CREDENTIAL_STORAGE_UNAVAILABLE");
      const features=Array.isArray(body.features)?body.features.map(String):[];
      const scopes=featureScopes(features);
      if(features.includes("employee_mapping")&&!context.permissions?.["xero.people.map"])throw new Error("INTEGRATION_ACCESS_DENIED");
      if(features.includes("project_mapping")&&!context.permissions?.["xero.projects.manage"])throw new Error("INTEGRATION_ACCESS_DENIED");
      if(!connection){const r=await admin.from("v2_integrations").insert({organisation_id:org,provider:"xero"}).select().single();if(r.error)throw new Error("INTEGRATION_ACTION_FAILED");connection=r.data;}
      const state=randomBytes(32).toString("base64url");
      const saved=await admin.from("v2_integration_oauth_states").insert({state_hash:createHash("sha256").update(state).digest("hex"),organisation_id:org,integration_id:connection.id,actor_id:context.userId,provider:"xero",expires_at:new Date(Date.now()+600000).toISOString()});if(saved.error)throw new Error("INTEGRATION_ACTION_FAILED");
      // Only implemented read/mapping features are selectable. Financial writes stay disabled.
      const setting=await admin.from("v2_xero_settings").upsert({organisation_id:org,integration_id:connection.id,features,payroll_region:body.payroll_region??null});if(setting.error)throw new Error("INTEGRATION_ACTION_FAILED");
      const params=new URLSearchParams({response_type:"code",client_id:config.clientId,redirect_uri:config.redirectUri,scope:scopes.join(" "),state});
      await integrationAudit(org,connection.id,context.userId,connection.tenant_id?"reconnect_started":"connection_started");
      const response=NextResponse.json({url:`https://login.xero.com/identity/connect/authorize?${params}`});response.cookies.set("tt-xero-state",`${org}.${state}`,{httpOnly:true,secure:config.redirectUri.startsWith("https:"),sameSite:"lax",maxAge:600,path:"/api/integrations/xero/callback"});return response;
    }
    if(!connection)throw new Error("INTEGRATION_SETUP_REQUIRED");
    if(action==="select_tenant"){
      const {data:pending}=await admin.from("v2_xero_pending_tenants").select("candidates").eq("organisation_id",org).eq("integration_id",connection.id).eq("actor_id",context.userId).gt("expires_at",new Date().toISOString()).single();
      const selected=(pending?.candidates as {tenantId:string;tenantName:string;id:string}[]|undefined)?.find(t=>t.tenantId===body.tenant_id);if(!selected)throw new Error("INTEGRATION_SCOPE_INVALID");
      if(connection.tenant_id && connection.tenant_id!==selected.tenantId)throw new Error("INTEGRATION_TENANT_REMAP_REQUIRED");
      const access=await xeroAccessToken(org,connection.id,context.userId,true);if(!(await xeroConnections(access)).some(t=>t.id===selected.id&&t.tenantId===selected.tenantId))throw new Error("INTEGRATION_SCOPE_INVALID");
      const now=new Date().toISOString();const saved=await admin.from("v2_integrations").update({tenant_id:selected.tenantId,tenant_name:selected.tenantName,status:"connected",connected_by:context.userId,connected_at:now,last_success_at:now,error_category:null}).eq("organisation_id",org).eq("id",connection.id);if(saved.error)throw new Error("INTEGRATION_ACTION_FAILED");
      await admin.from("v2_xero_settings").update({connection_id:selected.id}).eq("organisation_id",org).eq("integration_id",connection.id);
      await admin.from("v2_xero_pending_tenants").delete().eq("organisation_id",org).eq("integration_id",connection.id);
      await integrationAudit(org,connection.id,context.userId,"tenant_selected");return NextResponse.json({ok:true});
    }
    if(action==="health"){
      const access=await xeroAccessToken(org,connection.id,context.userId,true);const connections=await xeroConnections(access);if(!connections.some(t=>t.tenantId===connection.tenant_id))throw new Error("INTEGRATION_RECONNECT_REQUIRED");
      const now=new Date().toISOString();await admin.from("v2_integrations").update({entitlement_check_required:false,status:"connected",last_checked_at:now,last_success_at:now,error_category:null}).eq("organisation_id",org).eq("id",connection.id);await integrationAudit(org,connection.id,context.userId,"health_check");return NextResponse.json({ok:true});
    }
    if(action==="disconnect"){await disconnectXero(org,connection.id,context.userId);return NextResponse.json({ok:true});}
    if(action==="search_employees" || action==="search_projects"){
      const capability=action==="search_employees"?"xero.people.map":"xero.projects.manage";if(!context.permissions?.[capability])throw new Error("INTEGRATION_ACCESS_DENIED");
      const rows=await xeroRead(org,connection.id,context.userId,action==="search_employees"?"employees":"projects",Math.max(1,Number(body.page)||1));
      return NextResponse.json({rows:rows.filter(r=>r.name.toLowerCase().includes(String(body.query??"").toLowerCase())),page:body.page??1});
    }
    throw new Error("INTEGRATION_ACTION_INVALID");
  }catch(error){return NextResponse.json(integrationError(error),{status:400});}
}

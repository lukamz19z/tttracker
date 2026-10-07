import "server-only";
import {randomUUID} from "node:crypto";
import {createSupabaseAdmin} from "@/lib/supabase/admin";
import {encryptCredential,decryptCredential,integrationCredentialReady,type CredentialEnvelope} from "./credential-crypto";
import {integrationAudit,loadIntegration} from "./server";
export type XeroTokens={access_token:string;refresh_token:string;expires_in:number;scope:string};
export function xeroConfig(){
  const clientId=process.env.TTTRACKER_XERO_CLIENT_ID,clientSecret=process.env.TTTRACKER_XERO_CLIENT_SECRET,origin=process.env.NEXT_PUBLIC_APP_URL;
  const environment=process.env.TTTRACKER_XERO_ENVIRONMENT;
  const runtime=process.env.VERCEL_TARGET_ENV||process.env.VERCEL_ENV||(process.env.NODE_ENV!=="production"?"development":"");
  if(!clientId||!clientSecret||!origin||!origin.startsWith("https://")||!environment||environment!==runtime)throw new Error("INTEGRATION_SETUP_REQUIRED");
  return {clientId,clientSecret,redirectUri:new URL("/api/integrations/xero/callback",origin).toString()};
}
export function xeroFailure(status:number,headers?:Headers):never{
  if(status===401&&headers?.get("www-authenticate")?.includes("insufficient_scope"))throw new Error("INTEGRATION_ADDITIONAL_PERMISSION_REQUIRED");
  const code=status===401?"RECONNECT_REQUIRED":status===403?"XERO_PERMISSION_REQUIRED":status===429?"RATE_LIMITED":status===404?"RESOURCE_NOT_FOUND":"PROVIDER_UNAVAILABLE";
  throw Object.assign(new Error(`INTEGRATION_${code}`),{retryAfter:Math.min(3600,Math.max(1,Number(headers?.get("retry-after"))||60))});
}
export async function exchangeXero(form:URLSearchParams):Promise<XeroTokens>{
  const config=xeroConfig();const response=await fetch("https://identity.xero.com/connect/token",{method:"POST",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000),headers:{Authorization:`Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,"Content-Type":"application/x-www-form-urlencoded"},body:form});
  if(!response.ok)xeroFailure(response.status,response.headers);const tokens=await response.json();
  if(typeof tokens.access_token!=="string"||typeof tokens.refresh_token!=="string"||typeof tokens.scope!=="string"||!Number.isFinite(tokens.expires_in)||tokens.expires_in<=0)throw new Error("INTEGRATION_AUTH_FAILED");
  return tokens;
}
export async function xeroConnections(accessToken:string){
  const response=await fetch("https://api.xero.com/connections",{headers:{Authorization:`Bearer ${accessToken}`},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!response.ok)xeroFailure(response.status,response.headers);
  const data=await response.json();if(!Array.isArray(data))throw new Error("INTEGRATION_AUTH_FAILED");
  return data.filter(d=>d.tenantType==="ORGANISATION").map(d=>({id:String(d.id),tenantId:String(d.tenantId),tenantName:String(d.tenantName).slice(0,200)}));
}
async function decode(row:{organisation_id:string;integration_id:string;generation:number;envelope:CredentialEnvelope}){
  const bytes=await decryptCredential(row.envelope,{organisation_id:row.organisation_id,integration_id:row.integration_id,generation:row.generation,provider:"xero"});
  try{return JSON.parse(bytes.toString()) as XeroTokens;}finally{bytes.fill(0);}
}
export async function persistXeroTokens(org:string,id:string,tokens:XeroTokens,expectedGeneration:number){
  if(!await integrationCredentialReady())throw new Error("INTEGRATION_CREDENTIAL_STORAGE_UNAVAILABLE");
  const bytes=Buffer.from(JSON.stringify(tokens));
  try{
    const envelope=await encryptCredential(bytes,{organisation_id:org,integration_id:id,provider:"xero",generation:expectedGeneration+1});
    const {data,error}=await createSupabaseAdmin().rpc("tttracker_v2_xero_store_credentials",{p_org:org,p_id:id,p_expected:expectedGeneration,p_envelope:envelope,p_expiry:new Date(Date.now()+tokens.expires_in*1000).toISOString(),p_scopes:tokens.scope.split(" ")});
    if(error||!data)throw new Error("INTEGRATION_CREDENTIAL_SAVE_FAILED");
  }finally{bytes.fill(0);}
}
// Callers must authorize the feature and target before obtaining provider authority.
export async function xeroAccessToken(org:string,id:string,actor:string,allowPending=false){
  if(!await integrationCredentialReady())throw new Error("INTEGRATION_CREDENTIAL_STORAGE_UNAVAILABLE");
  const connection=await loadIntegration(org,"xero");if(connection?.id!==id||(!allowPending&&connection.status!=="connected"&&!(connection.status==="attention_required"&&connection.error_category==="refresh_failed")))throw new Error("INTEGRATION_SCOPE_INVALID");
  const admin=createSupabaseAdmin();const {data:row,error}=await admin.from("v2_xero_credentials").select("*").eq("organisation_id",org).eq("integration_id",id).single();if(error||!row)throw new Error("INTEGRATION_RECONNECT_REQUIRED");
  await integrationAudit(org,id,actor,"credential_use_requested");
  if(new Date(row.expires_at).getTime()>Date.now()+60000)return (await decode(row)).access_token;
  const lease=randomUUID();const claim=await admin.rpc("tttracker_v2_xero_refresh_claim",{p_org:org,p_id:id,p_generation:row.generation,p_lease:lease});if(claim.error||!claim.data)throw new Error("INTEGRATION_REFRESH_BUSY");
  try{
    const old=await decode(row);const tokens=await exchangeXero(new URLSearchParams({grant_type:"refresh_token",refresh_token:old.refresh_token}));
    const bytes=Buffer.from(JSON.stringify(tokens));
    try{
      const envelope=await encryptCredential(bytes,{organisation_id:org,integration_id:id,provider:"xero",generation:row.generation+1});
      const saved=await admin.rpc("tttracker_v2_xero_refresh_commit",{p_org:org,p_id:id,p_generation:row.generation,p_lease:lease,p_envelope:envelope,p_expiry:new Date(Date.now()+tokens.expires_in*1000).toISOString(),p_scopes:tokens.scope.split(" ")});
      if(saved.error||!saved.data)throw new Error("INTEGRATION_CREDENTIAL_SAVE_FAILED");
      await admin.from("v2_xero_settings").update({last_refreshed_at:new Date().toISOString(),granted_scopes:tokens.scope.split(" ")}).eq("organisation_id",org).eq("integration_id",id);
      await integrationAudit(org,id,actor,"credential_refreshed");return tokens.access_token;
    }finally{bytes.fill(0);}
  }catch(error){
    await admin.from("v2_integrations").update({status:"attention_required",error_category:"refresh_failed"}).eq("organisation_id",org).eq("id",id);
    throw error;
  }finally{
    await admin.from("v2_xero_credentials").update({refresh_lease:null,refresh_lease_until:null}).eq("organisation_id",org).eq("integration_id",id).eq("refresh_lease",lease);
  }
}
export async function xeroRead(org:string,id:string,actor:string,entity:"employees"|"projects",page=1){
  const connection=await loadIntegration(org,"xero");if(connection?.id!==id||connection.status!=="connected"||!connection.tenant_id)throw new Error("INTEGRATION_SCOPE_INVALID");
  const settings=await createSupabaseAdmin().from("v2_xero_settings").select("features,granted_scopes,payroll_region").eq("organisation_id",org).eq("integration_id",id).single();
  const feature=entity==="employees"?"employee_mapping":"project_mapping",scope=entity==="employees"?"payroll.employees.read":"projects.read";
  if(!settings.data?.features.includes(feature)||!settings.data.granted_scopes.includes(scope))throw new Error("INTEGRATION_ADDITIONAL_PERMISSION_REQUIRED");
  if(entity==="employees"&&settings.data.payroll_region!=="AU")throw new Error("INTEGRATION_PAYROLL_REGION_UNAVAILABLE");
  const access=await xeroAccessToken(org,id,actor);
  const endpoint=entity==="employees"?`payroll.xro/1.0/Employees?page=${Math.max(1,Math.min(1000,page))}`:`projects.xro/2.0/Projects?page=${Math.max(1,Math.min(1000,page))}&pageSize=50`;
  const response=await fetch(`https://api.xero.com/${endpoint}`,{headers:{Authorization:`Bearer ${access}`,"Xero-Tenant-Id":connection.tenant_id,Accept:"application/json"},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!response.ok)xeroFailure(response.status,response.headers);const data=await response.json();
  // Never forward the full payroll response (bank/tax/super may be present).
  const rows=entity==="employees"?data.Employees:data.items;
  if(!Array.isArray(rows))throw new Error("INTEGRATION_PROVIDER_UNAVAILABLE");
  await integrationAudit(org,id,actor,`${entity}_identity_read`);
  return rows.map(d=>entity==="employees"?{id:d.EmployeeID,name:[d.FirstName,d.LastName].filter(Boolean).join(" ")}:{id:d.projectId,name:d.name});
}
export async function disconnectXero(org:string,id:string,actor:string){
  const admin=createSupabaseAdmin();const connection=await loadIntegration(org,"xero");if(connection?.id!==id)throw new Error("INTEGRATION_SCOPE_INVALID");
  const {data:settings}=await admin.from("v2_xero_settings").select("connection_id").eq("organisation_id",org).eq("integration_id",id).single();
  // Disable local operations before remote revoke; preserve mappings/history.
  let access:string|undefined;
  try{access=await xeroAccessToken(org,id,actor,true);}catch{}
  await integrationAudit(org,id,actor,"disconnect_requested");
  await admin.from("v2_integrations").update({status:"disconnected"}).eq("organisation_id",org).eq("id",id);
  let remoteRemoved=false;
  try{
    if(access&&settings?.connection_id){const response=await fetch(`https://api.xero.com/connections/${encodeURIComponent(settings.connection_id)}`,{method:"DELETE",headers:{Authorization:`Bearer ${access}`},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});remoteRemoved=response.ok||response.status===404;}
  }catch{}
  // DELETE targets this connection only. Global refresh-token revocation would
  // also revoke other organisations authorised by the same Microsoft/Xero user.
  const deleted=await admin.from("v2_xero_credentials").delete().eq("organisation_id",org).eq("integration_id",id);if(deleted.error)throw new Error("INTEGRATION_CREDENTIAL_DELETE_FAILED");
  await admin.from("v2_xero_pending_tenants").delete().eq("organisation_id",org).eq("integration_id",id);
  await integrationAudit(org,id,actor,"disconnected");
  if(!remoteRemoved){await integrationAudit(org,id,actor,"remote_disconnect_failed",undefined,"failure");throw new Error("INTEGRATION_REMOTE_DISCONNECT_REQUIRED");}
}

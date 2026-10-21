import {NextRequest,NextResponse} from "next/server";
import {createHash,timingSafeEqual} from "node:crypto";
import {integrationContext,integrationAudit} from "@/lib/integrations/server";
import {xeroConfig,exchangeXero,persistXeroTokens,xeroConnections} from "@/lib/integrations/xero";
import {integrationCredentialReady} from "@/lib/integrations/credential-crypto";
export async function GET(request:NextRequest){
  let org="",result="connection_failed";
  try{
    const parts=(request.cookies.get("tt-xero-state")?.value??"").split(".");org=parts[0];const state=parts[1],provided=request.nextUrl.searchParams.get("state")??"";
    if(!state||state.length!==provided.length||!timingSafeEqual(Buffer.from(state),Buffer.from(provided)))throw new Error();
    const {context,admin}=await integrationContext(org,"xero","manage");
    if(!await integrationCredentialReady())throw new Error();
    const consumed=await admin.rpc("tttracker_v2_consume_integration_state",{p_hash:createHash("sha256").update(state).digest("hex"),p_org:org,p_actor:context.userId,p_provider:"xero"});if(consumed.error||!consumed.data)throw new Error();
    const code=request.nextUrl.searchParams.get("code");if(!code)throw new Error();
    const tokens=await exchangeXero(new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:xeroConfig().redirectUri}));
    const candidates=await xeroConnections(tokens.access_token);if(!candidates.length)throw new Error();
    const id=consumed.data.integration_id;
    const credentials=await admin.from("v2_xero_credentials").select("generation").eq("organisation_id",org).eq("integration_id",id).maybeSingle();if(credentials.error)throw new Error();
    await persistXeroTokens(org,id,tokens,credentials.data?.generation??0);
    const pending=await admin.from("v2_xero_pending_tenants").upsert({organisation_id:org,integration_id:id,actor_id:context.userId,candidates,expires_at:new Date(Date.now()+600000).toISOString()});if(pending.error)throw new Error();
    await admin.from("v2_xero_settings").update({granted_scopes:tokens.scope.split(" ")}).eq("organisation_id",org).eq("integration_id",id);
    await admin.from("v2_integrations").update({status:"setup_required"}).eq("organisation_id",org).eq("id",id);
    await integrationAudit(org,id,context.userId,"oauth_authorised");result="select_tenant";
  }catch{}
  const url=new URL("/workspace/settings/integrations/xero",request.nextUrl.origin);if(/^[a-f0-9-]{36}$/.test(org))url.searchParams.set("organisation",org);url.searchParams.set("result",result);
  const response=NextResponse.redirect(url);response.cookies.set("tt-xero-state","",{httpOnly:true,secure:request.nextUrl.protocol==="https:",sameSite:"lax",maxAge:0,path:"/api/integrations/xero/callback"});return response;
}

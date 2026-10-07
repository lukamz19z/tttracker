import { NextRequest,NextResponse } from "next/server";
import { createHash,timingSafeEqual } from "node:crypto";
import { integrationContext,integrationAudit } from "@/lib/integrations/server";
export async function GET(request: NextRequest) {
  let organisation="";let outcome="consent_failed";
  try{
    const cookie=request.cookies.get("tt-integration-state")?.value??"";
    const [org,state]=cookie.split(".");organisation=org;
    const supplied=request.nextUrl.searchParams.get("state")??"";
    if(!state || state.length!==supplied.length || !timingSafeEqual(Buffer.from(state),Buffer.from(supplied)))throw new Error();
    const {admin,context}=await integrationContext(org,"sharepoint","manage");
    const {data,error}=await admin.rpc("tttracker_v2_consume_integration_state",{p_hash:createHash("sha256").update(state).digest("hex"),p_org:org,p_actor:context.userId,p_provider:"sharepoint"});
    if(error || !data || request.nextUrl.searchParams.get("admin_consent")?.toLowerCase()!=="true" || request.nextUrl.searchParams.get("tenant")?.toLowerCase()!==data.expected_tenant)throw new Error();
    // Consent redirect is not proof of site access. Keep setup_required until
    // a real client-credentials token + selected-site + drive read succeeds.
    const result=await admin.from("v2_integrations").update({tenant_id:data.expected_tenant,status:"setup_required"}).eq("organisation_id",org).eq("id",data.integration_id);if(result.error)throw new Error();
    await integrationAudit(org,data.integration_id,context.userId,"consent_returned");outcome="site_permission_required";
  }catch{}
  const destination=new URL("/workspace/settings/integrations/sharepoint",request.nextUrl.origin);
  if(/^[a-f0-9-]{36}$/.test(organisation))destination.searchParams.set("organisation",organisation);
  destination.searchParams.set("result",outcome);
  const response=NextResponse.redirect(destination);response.cookies.set("tt-integration-state","",{httpOnly:true,secure:true,sameSite:"lax",maxAge:0,path:"/api/integrations/sharepoint/callback"});return response;
}

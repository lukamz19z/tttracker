import { requireIntegrationEntitlement } from "@/lib/integrations/entitlements";
import {NextRequest,NextResponse} from "next/server";
import {requireWorkspacePermission} from "@/lib/workspace/context";
import {requireProjectContext} from "@/lib/projects/project-context";
import {integrationContext,integrationError,loadIntegration} from "@/lib/integrations/server";
import {timesheetPreflight} from "@/lib/integrations/xero-catalogue";
export async function GET(request:NextRequest){
  try{
    const {org,admin}=await integrationContext(request.nextUrl.searchParams.get("organisation"),"xero","view");
    await requireWorkspacePermission(org,"xero.timesheets.view");
    const projectId=request.nextUrl.searchParams.get("project");if(!projectId)throw new Error("INTEGRATION_PROJECT_REQUIRED");
    const project=await requireProjectContext(projectId,org);if(project.dataOrganisationId!==org)throw new Error("INTEGRATION_SCOPE_INVALID");
    if(!project.access.permissions["daily_dockets.view"])throw new Error("INTEGRATION_ACCESS_DENIED");
    const page=Math.max(1,Math.min(10000,Number(request.nextUrl.searchParams.get("page"))||1));
    const dockets=await admin.from("v2_daily_dockets").select("id,docket_date,approval_status",{count:"exact"}).eq("organisation_id",org).eq("project_id",projectId).order("docket_date",{ascending:false}).order("id").range((page-1)*10,page*10-1);if(dockets.error)throw new Error("INTEGRATION_ACTION_FAILED");
    const ids=(dockets.data??[]).map(d=>d.id);if(!ids.length)return NextResponse.json({rows:[],page,total:dockets.count??0});
    const labour=await admin.from("v2_docket_labour").select("id,docket_id,person_id,worker_name,raw_hours,production_hours").in("docket_id",ids).limit(500);
    if(labour.error || labour.data?.length===500)throw new Error("INTEGRATION_PREFLIGHT_LIMIT");
    await requireIntegrationEntitlement(org,"xero",true);
    const connection=await loadIntegration(org,"xero");
    const mappings=connection?.tenant_id?await admin.from("v2_xero_person_mappings").select("person_id,xero_employee_id").eq("organisation_id",org).eq("integration_id",connection.id).eq("xero_tenant_id",connection.tenant_id).in("person_id",(labour.data??[]).map(l=>l.person_id).filter(Boolean)):{data:[]};
    const rows=(labour.data??[]).map(l=>{const docket=dockets.data!.find(d=>d.id===l.docket_id)!;return {...timesheetPreflight([{personId:l.person_id??"",date:docket.docket_date,rawHours:Number(l.raw_hours),approved:docket.approval_status==="approved",employeeId:mappings.data?.find(m=>m.person_id===l.person_id)?.xero_employee_id}])[0],sourceId:l.id,docketId:l.docket_id,name:l.worker_name,productionHours:Number(l.production_hours)};});
    return NextResponse.json({rows,page,total:dockets.count??0,unit:"docket_pages",writesEnabled:false},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return NextResponse.json(integrationError(error),{status:403});}
}

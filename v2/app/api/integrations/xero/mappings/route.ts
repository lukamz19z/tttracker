import {NextRequest,NextResponse} from "next/server";
import {integrationContext,integrationAudit,integrationError,loadIntegration} from "@/lib/integrations/server";
import {xeroRead} from "@/lib/integrations/xero";
import {requireWorkspacePermission} from "@/lib/workspace/context";
import {peopleRead} from "@/lib/people/server";
export async function GET(request:NextRequest){
  try{
    const kind=request.nextUrl.searchParams.get("kind")==="project"?"project":"person";
    const {org,admin}=await integrationContext(request.nextUrl.searchParams.get("organisation"),"xero","view");
    await requireWorkspacePermission(org,kind==="person"?"xero.people.map":"xero.projects.manage");
    const connection=await loadIntegration(org,"xero");if(!connection) return NextResponse.json({rows:[],total:0});
    const person=request.nextUrl.searchParams.get("person");
    if(person)await peopleRead(org,"profile",{personId:person});
    const page=Math.max(1,Math.min(10000,Number(request.nextUrl.searchParams.get("page"))||1));
    let query=admin.from(kind==="person"?"v2_xero_person_mappings":"v2_xero_project_mappings").select("*",{count:"exact"}).eq("organisation_id",org).eq("integration_id",connection.id).eq("xero_tenant_id",connection.tenant_id??"");
    if(person && kind==="person")query=query.eq("person_id",person);
    const result=await query.order("mapped_at",{ascending:false}).range((page-1)*20,page*20-1);if(result.error)throw new Error("INTEGRATION_ACTION_FAILED");
    return NextResponse.json({rows:result.data,total:result.count,page},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return NextResponse.json(integrationError(error),{status:403});}
}
export async function POST(request:NextRequest){
  try{
    if(request.headers.get("origin")!==request.nextUrl.origin)throw new Error("INTEGRATION_ACCESS_DENIED");
    const body=await request.json();const kind=body.kind==="project"?"project":"person";
    const {org,admin,context}=await integrationContext(body.organisation,"xero","view");
    await requireWorkspacePermission(org,kind==="person"?"xero.people.map":"xero.projects.manage");
    const connection=await loadIntegration(org,"xero");if(connection?.status!=="connected"||!connection.tenant_id)throw new Error("INTEGRATION_SCOPE_INVALID");
    const table=kind==="person"?"v2_xero_person_mappings":"v2_xero_project_mappings";
    if(body.action==="unmap"){
      const target=await admin.from(table).select("id").eq("organisation_id",org).eq("integration_id",connection.id).eq("xero_tenant_id",connection.tenant_id).eq("id",body.id).single();if(!target.data)throw new Error("INTEGRATION_SCOPE_INVALID");
      await integrationAudit(org,connection.id,context.userId,`${kind}_unmapped`,body.id);
      const deleted=await admin.from(table).delete().eq("organisation_id",org).eq("id",body.id);if(deleted.error)throw new Error("INTEGRATION_ACTION_FAILED");return NextResponse.json({ok:true});
    }
    if(kind==="person")await peopleRead(org,"profile",{personId:body.source_id});
    else{const {requireProjectContext}=await import("@/lib/projects/project-context");const project=await requireProjectContext(body.source_id,org);if(project.dataOrganisationId!==org)throw new Error("INTEGRATION_SCOPE_INVALID");}
    const rows=await xeroRead(org,connection.id,context.userId,kind==="person"?"employees":"projects",Math.max(1,Number(body.provider_page)||1));const selected=rows.find(r=>r.id===body.provider_id);if(!selected)throw new Error("INTEGRATION_SCOPE_INVALID");
    const mapping:Record<string,string>={organisation_id:org,integration_id:connection.id,xero_tenant_id:connection.tenant_id,display_name:selected.name,mapped_by:context.userId,mapped_at:new Date().toISOString(),...(kind==="person"?{person_id:body.source_id,xero_employee_id:selected.id}:{project_id:body.source_id,xero_project_id:selected.id})};
    const saved=await admin.from(table).upsert(mapping,{onConflict:kind==="person"?"organisation_id,person_id":"organisation_id,project_id"}).select().single();if(saved.error)throw new Error("INTEGRATION_MAPPING_CONFLICT");
    await integrationAudit(org,connection.id,context.userId,`${kind}_mapped`,saved.data.id);return NextResponse.json({ok:true});
  }catch(error){return NextResponse.json(integrationError(error),{status:400});}
}

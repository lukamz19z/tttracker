import { NextResponse } from "next/server";
import { userHasAccess } from "@/lib/access/server";
import { qualityApiError, requireQualityUser } from "@/lib/quality/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const clean = (value: unknown) => String(value ?? "").trim();
const fields = ["notify_raised","notify_urgent","notify_assignment","notify_update","notify_partial_receipt","notify_full_receipt","notify_resolved","notify_cancel","receives_in_app","receives_push","receives_email","active"] as const;

async function context(request: Request, projectId: string) {
  const { service, user } = await requireQualityUser(request);
  const [permission, access] = await Promise.all([
    userHasAccess(service,user.id,"materials.configure"),
    service.from("project_access").select("user_id").eq("project_id",projectId).eq("user_id",user.id).maybeSingle(),
  ]);
  if (!permission) throw new Error("FORBIDDEN");
  if (access.error) throw new Error(access.error.message);
  if (!access.data) throw new Error("FORBIDDEN");
  return {service,user};
}

export async function GET(request: Request) {
  try {
    const projectId=clean(new URL(request.url).searchParams.get("projectId"));
    if(!projectId) return NextResponse.json({error:"Project is required."},{status:400});
    const {service}=await context(request,projectId);
    const [{data:rules,error:rulesError},{data:access,error:accessError},{data:roles,error:rolesError}] = await Promise.all([
      service.from("project_material_notification_rules").select("*").eq("project_id",projectId).order("updated_at"),
      service.from("project_access").select("user_id").eq("project_id",projectId),
      service.from("user_roles").select("user_id,role"),
    ]);
    if(rulesError||accessError||rolesError) throw new Error(rulesError?.message||accessError?.message||rolesError?.message);
    const ids=[...new Set((access||[]).map(row=>clean(row.user_id)))];
    const {data:employees,error:employeeError}=ids.length?await service.from("employees").select("user_id,full_name").in("user_id",ids):{data:[],error:null};
    if(employeeError) throw new Error(employeeError.message);
    const names=new Map((employees||[]).map(row=>[clean(row.user_id),clean(row.full_name)]));
    const roleMap=new Map((roles||[]).map(row=>[clean(row.user_id),clean(row.role)]));
    const users=[];
    for(const id of ids){const {data}=await service.auth.admin.getUserById(id);if(!data.user)continue;users.push({id,name:names.get(id)||clean(data.user.user_metadata?.full_name||data.user.user_metadata?.name)||"TTTracker User",role:roleMap.get(id)||"user"});}
    users.sort((a,b)=>a.name.localeCompare(b.name));
    return NextResponse.json({users,rules:rules||[]});
  } catch(error) { const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status}); }
}

export async function PUT(request: Request) {
  try {
    const {service,user}=await requireQualityUser(request);
    const body=await request.json() as Record<string,unknown>;
    const projectId=clean(body.projectId),userId=clean(body.userId);
    if(!projectId||!userId)return NextResponse.json({error:"Project and recipient are required."},{status:400});
    const [permission,projectMember]=await Promise.all([userHasAccess(service,user.id,"materials.configure"),service.from("project_access").select("user_id").eq("project_id",projectId).eq("user_id",userId).maybeSingle()]);
    if(!permission)return NextResponse.json({error:"You do not have permission to configure Materials."},{status:403});
    const ownAccess=await service.from("project_access").select("user_id").eq("project_id",projectId).eq("user_id",user.id).maybeSingle();
    if(ownAccess.error||!ownAccess.data)return NextResponse.json({error:"You do not have access to this project."},{status:403});
    if(projectMember.error)throw new Error(projectMember.error.message);
    if(!projectMember.data)return NextResponse.json({error:"Recipient must be a project user."},{status:400});
    const payload:Record<string,unknown>={project_id:projectId,user_id:userId,updated_by:user.id,updated_at:new Date().toISOString()};
    for(const field of fields)payload[field]=body[field]===true;
    const {data,error}=await service.from("project_material_notification_rules").upsert(payload,{onConflict:"project_id,user_id"}).select("*").single();
    if(error)throw new Error(error.message);
    return NextResponse.json({rule:data});
  } catch(error) { const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status}); }
}

export async function DELETE(request: Request) {
  try {
    const {service,user}=await requireQualityUser(request);const body=await request.json() as {projectId?:string;userId?:string};
    const projectId=clean(body.projectId),userId=clean(body.userId);if(!projectId||!userId)return NextResponse.json({error:"Project and recipient are required."},{status:400});
    if(!await userHasAccess(service,user.id,"materials.configure"))return NextResponse.json({error:"You do not have permission to configure Materials."},{status:403});
    const {error}=await service.from("project_material_notification_rules").delete().eq("project_id",projectId).eq("user_id",userId);if(error)throw new Error(error.message);
    return NextResponse.json({ok:true});
  } catch(error) { const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status}); }
}

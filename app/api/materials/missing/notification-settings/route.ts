import { NextResponse } from "next/server";
import { qualityApiError } from "@/lib/quality/server";
import { resolveProjectUserLabels } from "@/lib/materials/project-users";
import { eligibleMaterialUsers } from "@/lib/materials/eligible-users";
import { requireMaterialsConfiguration } from "@/lib/materials/authorization";
import { hasV1FullAccess } from "@/lib/access/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const clean = (value: unknown) => String(value ?? "").trim();
const fields = ["notify_raised","notify_urgent","notify_assignment","notify_update","notify_partial_receipt","notify_full_receipt","notify_resolved","notify_cancel","receives_in_app","receives_push","receives_email","active"] as const;

async function context(request: Request, projectId: string) {
  return requireMaterialsConfiguration(request, projectId);
}

export async function GET(request: Request) {
  try {
    const projectId=clean(new URL(request.url).searchParams.get("projectId"));
    if(!projectId) return NextResponse.json({error:"Project is required."},{status:400});
    const {service}=await context(request,projectId);
    const {data:rules,error:rulesError}=await service.from("project_material_notification_rules").select("*").eq("project_id",projectId).order("updated_at");
    if(rulesError) throw new Error(rulesError.message);
    const eligible=await eligibleMaterialUsers(service,projectId);
    const ids=[...new Set([...eligible.assignmentUsers,...eligible.notifyUsers,...(rules||[]).map(row=>({id:String(row.user_id)}))].map(row=>row.id))];
    const users=(await resolveProjectUserLabels(service,ids));
    users.sort((a,b)=>a.name.localeCompare(b.name));
    return NextResponse.json({users,rules:rules||[]});
  } catch(error) { const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status}); }
}

export async function PUT(request: Request) {
  try {
    const body=await request.json() as Record<string,unknown>;
    const projectId=clean(body.projectId),userId=clean(body.userId);
    if(!projectId||!userId)return NextResponse.json({error:"Project and recipient are required."},{status:400});
    const {service,user}=await requireMaterialsConfiguration(request,projectId);
    const projectMember=await service.from("project_access").select("user_id").eq("project_id",projectId).eq("user_id",userId).maybeSingle();
    if(projectMember.error)throw new Error(projectMember.error.message);
    if(!projectMember.data&&!await hasV1FullAccess(service,userId))return NextResponse.json({error:"Recipient must be a project user or an authorised full-access Administrator."},{status:400});
    const payload:Record<string,unknown>={project_id:projectId,user_id:userId,updated_by:user.id,updated_at:new Date().toISOString()};
    for(const field of fields)payload[field]=body[field]===true;
    const {data,error}=await service.from("project_material_notification_rules").upsert(payload,{onConflict:"project_id,user_id"}).select("*").single();
    if(error)throw new Error(error.message);
    return NextResponse.json({rule:data});
  } catch(error) { const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status}); }
}

export async function DELETE(request: Request) {
  try {
    const body=await request.json() as {projectId?:string;userId?:string};
    const projectId=clean(body.projectId),userId=clean(body.userId);if(!projectId||!userId)return NextResponse.json({error:"Project and recipient are required."},{status:400});
    const {service}=await requireMaterialsConfiguration(request,projectId);
    const {error}=await service.from("project_material_notification_rules").delete().eq("project_id",projectId).eq("user_id",userId);if(error)throw new Error(error.message);
    return NextResponse.json({ok:true});
  } catch(error) { const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status}); }
}

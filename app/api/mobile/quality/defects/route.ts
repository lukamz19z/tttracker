// Canonical create inserts its mutation key atomically and reconciles retries.
export { POST } from "@/app/api/quality/defects/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { assertQualityProjectAccess, qualityApiError, requireQualityUser } from "@/lib/quality/server";
export async function GET(request:Request) {
  try {
    const {service,user,role}=await requireQualityUser(request);
    const url=new URL(request.url),projectId=url.searchParams.get("projectId"),mutation=url.searchParams.get("clientMutationId");
    if(!projectId || !mutation) return NextResponse.json({error:"Project and mutation are required."},{status:400});
    await assertQualityProjectAccess({service,userId:user.id,role,projectId});
    const result=await service.from("tower_defects").select("id,defect_number").eq("project_id",projectId).eq("identified_by",user.id).eq("mobile_client_mutation_id",mutation).maybeSingle();
    if(result.error) throw new Error(result.error.message);
    return NextResponse.json({defect:result.data});
  }catch(error){const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status});}
}

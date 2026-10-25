import { NextResponse } from "next/server";
import { requireQualityUser, assertQualityProjectAccess, qualityApiError } from "@/lib/quality/server";
import { atomicQualityError } from "@/lib/quality/atomic-error";
export async function POST(request: Request, context: { params: Promise<{ revisionId: string }> }) {
  try {
    const { service, user, role } = await requireQualityUser(request);
    const { revisionId } = await context.params;
    const current = await service.from("tower_revisions").select("*").eq("id", revisionId).maybeSingle();
    if (current.error) throw new Error(current.error.message);
    if (!current.data) return NextResponse.json({ error: "Revision not found." }, { status: 404 });
    await assertQualityProjectAccess({ service, userId: user.id, role, projectId: current.data.project_id });
    const saved = await service.rpc("finalise_v1_revision_atomic",{p_revision_id:revisionId,p_project_id:current.data.project_id,p_actor_id:user.id,p_submit:false});
    if (saved.error) {const result=atomicQualityError(saved.error);return NextResponse.json({error:result.message},{status:result.status});}
    return NextResponse.json({ revision: saved.data });
  } catch (error) { const result = qualityApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

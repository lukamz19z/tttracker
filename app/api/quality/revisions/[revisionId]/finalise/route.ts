import { NextResponse } from "next/server";
import { requireQualityUser, assertQualityProjectAccess, qualityApiError } from "@/lib/quality/server";
import { validateRevisionEvidence } from "@/lib/quality/finalise-revision";
export async function POST(request: Request, context: { params: Promise<{ revisionId: string }> }) {
  try {
    const { service, user, role } = await requireQualityUser(request);
    const { revisionId } = await context.params;
    const current = await service.from("tower_revisions").select("*").eq("id", revisionId).maybeSingle();
    if (current.error) throw new Error(current.error.message);
    if (!current.data) return NextResponse.json({ error: "Revision not found." }, { status: 404 });
    await assertQualityProjectAccess({ service, userId: user.id, role, projectId: current.data.project_id });
    const validation = await validateRevisionEvidence(service, revisionId);
    if (validation) return NextResponse.json({ error: validation }, { status: 409 });
    const saved = await service.from("tower_revisions").update({ finalised_at: current.data.finalised_at || new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", revisionId).select("*").single();
    if (saved.error) throw new Error(saved.error.message);
    return NextResponse.json({ revision: saved.data });
  } catch (error) { const result = qualityApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

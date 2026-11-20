import { NextResponse } from "next/server";
import { assertLiftProjectAccess, liftApiError, requireLiftAccess, LIFT_ACCESS } from "@/lib/lift-engineering/server";

export async function GET(request: Request, context: { params: Promise<{ studyId: string }> }) {
  try {
    const { user, service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const { studyId } = await context.params;
    const { data: study, error } = await service.from("lift_studies").select("id,project_id,tower_id,study_number,title,status,current_revision_id,created_at,updated_at")
      .eq("id", studyId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!study) return NextResponse.json({ error: "Lift Study was not found." }, { status: 404 });
    await assertLiftProjectAccess(service, user.id, study.project_id);
    const { data: revision, error: revisionError } = await service.from("lift_study_revisions").select("*").eq("id", study.current_revision_id).maybeSingle();
    if (revisionError) throw new Error(revisionError.message);
    const { data: lifts, error: liftsError } = await service.from("lift_study_lifts").select("*").eq("study_revision_id", study.current_revision_id).order("sequence_no");
    if (liftsError) throw new Error(liftsError.message);
    return NextResponse.json({ study, revision, lifts: lifts ?? [] });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

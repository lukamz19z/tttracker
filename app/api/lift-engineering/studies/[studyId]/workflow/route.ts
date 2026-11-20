import { NextResponse } from "next/server";
import { assertLiftProjectAccess, liftApiError, liftInvalid, requireLiftAccess, LIFT_ACCESS } from "@/lib/lift-engineering/server";

const transitionPermissions: Record<string, string> = { submit: LIFT_ACCESS.editStudy, review: LIFT_ACCESS.review, approve: LIFT_ACCESS.approve, return: LIFT_ACCESS.review };
export async function POST(request: Request, context: { params: Promise<{ studyId: string }> }) {
  try {
    const { studyId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const accessCode = transitionPermissions[action];
    if (!accessCode) liftInvalid("Workflow action is not supported.");
    const { user, service } = await requireLiftAccess(request, accessCode);
    const { data: study, error } = await service.from("lift_studies").select("id,project_id,current_revision_id,status").eq("id", studyId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!study) return NextResponse.json({ error: "Lift Study was not found." }, { status: 404 });
    await assertLiftProjectAccess(service, user.id, study.project_id);
    const { data: revision, error: revError } = await service.from("lift_study_revisions").select("id,status,issued_at").eq("id", study.current_revision_id).maybeSingle();
    if (revError) throw new Error(revError.message);
    if (!revision) liftInvalid("Current Lift Study revision was not found.");
    const { data: actor } = await service.from("employees").select("full_name").eq("user_id", user.id).maybeSingle();
    const actorLabel = String(actor?.full_name ?? user.user_metadata?.full_name ?? user.email ?? "TTTracker User");
    const { data: updated, error: workflowError } = await service.rpc("v1_lift_study_workflow", {
      p_revision_id: revision.id, p_action: action, p_actor_user_id: user.id, p_actor_label: actorLabel,
      p_comments: typeof body.comments === "string" ? body.comments.trim() || null : null,
    });
    if (workflowError) throw new Error(workflowError.message);
    return NextResponse.json({ revision: updated });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

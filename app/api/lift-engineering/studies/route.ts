import { NextResponse } from "next/server";
import { assertLiftProjectAccess, liftApiError, liftInvalid, requireLiftAccess, LIFT_ACCESS } from "@/lib/lift-engineering/server";

export async function GET(request: Request) {
  try {
    const { user, service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const projectId = new URL(request.url).searchParams.get("projectId")?.trim();
    if (!projectId) liftInvalid("Select a project to view Lift Studies.");
    await assertLiftProjectAccess(service, user.id, projectId);
    const { data, error } = await service.from("lift_studies").select("id,project_id,tower_id,study_number,title,status,current_revision_id,created_at,updated_at")
      .eq("project_id", projectId).order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ studies: data ?? [] });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function POST(request: Request) {
  try {
    const { user, service } = await requireLiftAccess(request, LIFT_ACCESS.createStudy);
    const body = await request.json() as Record<string, unknown>;
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const towerId = typeof body.towerId === "string" && body.towerId ? body.towerId : null;
    if (!projectId || !title) liftInvalid("Project and study title are required.");
    await assertLiftProjectAccess(service, user.id, projectId);
    if (towerId) {
      const { data: tower, error } = await service.from("towers").select("id").eq("id", towerId).eq("project_id", projectId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!tower) liftInvalid("The selected tower does not belong to this project.");
    }
    const studyNumber = `LS-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const { data: study, error: studyError } = await service.from("lift_studies").insert({
      project_id: projectId, tower_id: towerId, study_number: studyNumber, title, created_by: user.id,
    }).select("id,project_id,tower_id,study_number,title,status").single();
    if (studyError || !study) throw new Error(studyError?.message || "Study record was not returned.");
    const { data: revision, error: revisionError } = await service.from("lift_study_revisions").insert({
      study_id: study.id, revision_no: 1, revision_label: "A", status: "draft", prepared_by: user.id, prepared_at: new Date().toISOString(),
      calculation_engine_version: "v1.0.0", methodology_version: "v1-parity-unverified",
    }).select("id,revision_no,revision_label,status").single();
    if (revisionError || !revision) {
      await service.from("lift_studies").delete().eq("id", study.id);
      throw new Error(revisionError?.message || "Study revision was not returned.");
    }
    const { error: linkError } = await service.from("lift_studies").update({ current_revision_id: revision.id }).eq("id", study.id);
    if (linkError) throw new Error(`Study created but revision link failed: ${linkError.message}`);
    return NextResponse.json({ study: { ...study, current_revision_id: revision.id }, revision }, { status: 201 });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

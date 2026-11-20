import { NextResponse } from "next/server";
import { assertLiftProjectAccess, liftApiError, liftInvalid, requireLiftAccess, LIFT_ACCESS } from "@/lib/lift-engineering/server";

export async function POST(request: Request, context: { params: Promise<{ studyId: string }> }) {
  try {
    const { user, service } = await requireLiftAccess(request, LIFT_ACCESS.editStudy);
    const { studyId } = await context.params;
    const { data: study, error } = await service.from("lift_studies").select("id,project_id,current_revision_id,status").eq("id", studyId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!study) return NextResponse.json({ error: "Lift Study was not found." }, { status: 404 });
    await assertLiftProjectAccess(service, user.id, study.project_id);
    const { data: prior, error: priorError } = await service.from("lift_study_revisions").select("*").eq("id", study.current_revision_id).maybeSingle();
    if (priorError) throw new Error(priorError.message);
    if (prior && !prior.issued_at && prior.status === "draft") liftInvalid("A new revision can only be created after the current revision is submitted or issued.");
    const nextNo = Number(prior?.revision_no ?? 0) + 1;
    const revisionLabel = String.fromCharCode(64 + Math.min(nextNo, 26));
    const { data: next, error: insertError } = await service.from("lift_study_revisions").insert({
      study_id: study.id, revision_no: nextNo, revision_label: revisionLabel, status: "draft", prepared_by: user.id,
      prepared_at: new Date().toISOString(), crane_profile_revision_id: prior?.crane_profile_revision_id ?? null,
      configuration_revision_id: prior?.configuration_revision_id ?? null, template_revision_id: prior?.template_revision_id ?? null,
      rigging_revisions: prior?.rigging_revisions ?? [], load_chart_revisions: prior?.load_chart_revisions ?? [],
      source_documents: prior?.source_documents ?? [], calculation_inputs: prior?.calculation_inputs ?? {},
      calculation_engine_version: prior?.calculation_engine_version ?? "v1.0.0", methodology_version: prior?.methodology_version ?? "v1-parity-unverified",
      input_snapshot: prior?.input_snapshot ?? {}, output_snapshot: {},
    }).select("id,revision_no,revision_label,status").single();
    if (insertError || !next) throw new Error(insertError?.message || "New Lift Study revision was not returned.");
    if (prior?.input_snapshot && typeof prior.input_snapshot === "object") {
      const snapshot = prior.input_snapshot as { lifts?: Array<Record<string, unknown>> };
      const liftRows = (snapshot.lifts ?? []).map((row, index) => ({ ...row, id: crypto.randomUUID(), sequenceNo: row.sequenceNo ?? index + 1 }));
      if (liftRows.length) {
        const { error: saveError } = await service.rpc("v1_lift_study_save_calculation", {
          p_revision_id: next.id, p_input_snapshot: prior.input_snapshot, p_output_snapshot: {}, p_lifts: liftRows,
          p_phases: [], p_results: [], p_engine_version: prior.calculation_engine_version ?? "v1.0.0",
          p_methodology_version: prior.methodology_version ?? "v1-parity-unverified",
        });
        if (saveError) throw new Error(`New revision created but prior lift inputs could not be copied: ${saveError.message}`);
      }
    }
    const { error: updateError } = await service.from("lift_studies").update({ current_revision_id: next.id, status: "draft", updated_at: new Date().toISOString() }).eq("id", study.id);
    if (updateError) throw new Error(`New revision created but could not be made current: ${updateError.message}`);
    return NextResponse.json({ revision: next }, { status: 201 });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

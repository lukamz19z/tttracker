import { NextResponse } from "next/server";
import { assertLiftProjectAccess, liftApiError, liftInvalid, requireLiftAccess, LIFT_ACCESS } from "@/lib/lift-engineering/server";

export async function PATCH(request: Request, context: { params: Promise<{ studyId: string }> }) {
  try {
    const { user, service } = await requireLiftAccess(request, LIFT_ACCESS.editStudy);
    const { studyId } = await context.params; const body = await request.json() as Record<string, unknown>;
    const { data: study, error } = await service.from("lift_studies").select("id,project_id,current_revision_id").eq("id", studyId).maybeSingle();
    if (error) throw new Error(error.message); if (!study) return NextResponse.json({ error: "Lift Study was not found." }, { status: 404 });
    await assertLiftProjectAccess(service, user.id, study.project_id);
    const { data: revision, error: revisionError } = await service.from("lift_study_revisions").select("id,status,issued_at,calculation_inputs").eq("id", study.current_revision_id).maybeSingle();
    if (revisionError) throw new Error(revisionError.message); if (!revision || revision.status !== "draft" || revision.issued_at) liftInvalid("Only the current draft revision can be configured.");
    const craneRevisionId = typeof body.craneProfileRevisionId === "string" ? body.craneProfileRevisionId : "";
    const configurationRevisionId = typeof body.configurationRevisionId === "string" ? body.configurationRevisionId : "";
    const templateRevisionId = typeof body.templateRevisionId === "string" && body.templateRevisionId ? body.templateRevisionId : null;
    if (!craneRevisionId || !configurationRevisionId) liftInvalid("Crane profile revision and configuration revision are required.");
    const [{ data: crane, error: craneError }, { data: configRevision, error: configError }] = await Promise.all([
      service.from("lift_crane_profile_revisions").select("id,crane_profile_id").eq("id", craneRevisionId).maybeSingle(),
      service.from("lift_crane_configuration_revisions").select("id,configuration_id").eq("id", configurationRevisionId).maybeSingle(),
    ]);
    if (craneError || configError) throw new Error(craneError?.message || configError?.message);
    if (!crane || !configRevision) liftInvalid("Selected crane or configuration revision was not found.");
    const { data: config, error: configParentError } = await service.from("lift_crane_configurations").select("crane_profile_id").eq("id", configRevision.configuration_id).maybeSingle();
    if (configParentError) throw new Error(configParentError.message);
    if (config?.crane_profile_id !== crane.crane_profile_id) liftInvalid("Crane configuration must belong to the selected crane profile.");
    if (templateRevisionId) {
      const { data: template, error: templateError } = await service.from("lift_tower_template_revisions").select("id").eq("id", templateRevisionId).maybeSingle();
      if (templateError) throw new Error(templateError.message); if (!template) liftInvalid("Selected tower template revision was not found.");
    }
    const priorInputs = revision.calculation_inputs && typeof revision.calculation_inputs === "object" ? revision.calculation_inputs as Record<string, unknown> : {};
    const priorSettings = priorInputs.studySettings && typeof priorInputs.studySettings === "object" ? priorInputs.studySettings as Record<string, unknown> : {};
    const setting = (key: string, next: unknown) => next === undefined ? Number(priorSettings[key] ?? 0) : Number(next);
    const padWidthM = setting("padWidthM", body.padWidthM);
    const padLengthM = setting("padLengthM", body.padLengthM);
    const allowableKpa = setting("allowableGroundPressureKpa", body.allowableGroundPressureKpa);
    if ((padWidthM || padLengthM || allowableKpa) && (![padWidthM,padLengthM,allowableKpa].every((value) => Number.isFinite(value) && value > 0))) liftInvalid("Pad width, pad length and allowable ground pressure must all be positive when provided.");
    const calculationInputs = { ...priorInputs, studySettings: { padWidthM: padWidthM || null, padLengthM: padLengthM || null, allowableGroundPressureKpa: allowableKpa || null } };
    const { data, error: updateError } = await service.from("lift_study_revisions").update({ crane_profile_revision_id: craneRevisionId, configuration_revision_id: configurationRevisionId, template_revision_id: templateRevisionId, calculation_inputs: calculationInputs }).eq("id", revision.id).select("id,crane_profile_revision_id,configuration_revision_id,template_revision_id,calculation_inputs").single();
    if (updateError) throw new Error(updateError.message);
    return NextResponse.json({ revision: data });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

import { NextResponse } from "next/server";
import { liftTemplateSteelWeightKg, type LiftSectionAllocation, type TowerSectionInput } from "@/lib/lift-engineering/tower-template";
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
    const erectionTemplateRevisionId = typeof body.erectionTemplateRevisionId === "string" && body.erectionTemplateRevisionId ? body.erectionTemplateRevisionId : null;
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
    let erectionSnapshot: Record<string, unknown> | null = null;
    if (erectionTemplateRevisionId) {
      const { data: methodRevision, error: methodError } = await service.from("lift_erection_template_revisions").select("id,lift_template_id,tower_template_revision_id,revision,status,description,method_tags,crane_suitability").eq("id", erectionTemplateRevisionId).maybeSingle();
      if (methodError) throw new Error(methodError.message);
      if (!methodRevision || !templateRevisionId || methodRevision.tower_template_revision_id !== templateRevisionId) liftInvalid("The selected Lift Template revision must reference the selected physical Tower Template revision.");
      const [{ data: method, error: parentError }, { data: sequence, error: sequenceError }] = await Promise.all([
        service.from("lift_erection_templates").select("id,tower_template_id,name").eq("id", methodRevision.lift_template_id).maybeSingle(),
        service.from("lift_erection_template_lifts").select("*").eq("lift_template_revision_id", erectionTemplateRevisionId).order("sequence_no"),
      ]);
      if (parentError || sequenceError) throw new Error(parentError?.message || sequenceError?.message);
      const liftIds = (sequence ?? []).map((row) => row.id as string);
      const [allocationsResult, sectionsResult] = await Promise.all([
        liftIds.length ? service.from("lift_erection_template_lift_sections").select("*").in("lift_template_lift_id", liftIds) : Promise.resolve({ data: [], error: null }),
        service.from("lift_tower_template_sections").select("*").eq("tower_template_revision_id", templateRevisionId),
      ]);
      if (allocationsResult.error || sectionsResult.error) throw new Error(allocationsResult.error?.message || sectionsResult.error?.message);
      const sections = (sectionsResult.data ?? []) as TowerSectionInput[];
      const lifts = (sequence ?? []).map((row) => {
        const allocations = (allocationsResult.data ?? []).filter((allocation) => allocation.lift_template_lift_id === row.id) as LiftSectionAllocation[];
        return { liftTemplateLiftId: row.id, liftNumber: row.lift_number, name: row.name, description: row.description, sequenceNo: row.sequence_no, liftType: row.lift_type, additionalMassKg: Number(row.additional_mass_kg ?? 0), steelWeightKg: liftTemplateSteelWeightKg(allocations, sections, Number(row.additional_mass_kg ?? 0)), allocations: allocations.map((allocation) => ({ ...allocation, section: sections.find((section) => section.id === allocation.tower_template_section_id) ?? null })), craneSuitability: row.crane_suitability, notes: row.notes };
      });
      erectionSnapshot = { liftTemplateId: method?.id ?? methodRevision.lift_template_id, liftTemplateName: method?.name ?? null, liftTemplateRevisionId: methodRevision.id, liftTemplateRevision: methodRevision.revision, towerTemplateRevisionId: templateRevisionId, lifts };
    }
    const priorInputs = revision.calculation_inputs && typeof revision.calculation_inputs === "object" ? revision.calculation_inputs as Record<string, unknown> : {};
    const priorSettings = priorInputs.studySettings && typeof priorInputs.studySettings === "object" ? priorInputs.studySettings as Record<string, unknown> : {};
    const setting = (key: string, next: unknown) => next === undefined ? Number(priorSettings[key] ?? 0) : Number(next);
    const padWidthM = setting("padWidthM", body.padWidthM);
    const padLengthM = setting("padLengthM", body.padLengthM);
    const allowableKpa = setting("allowableGroundPressureKpa", body.allowableGroundPressureKpa);
    if ((padWidthM || padLengthM || allowableKpa) && (![padWidthM,padLengthM,allowableKpa].every((value) => Number.isFinite(value) && value > 0))) liftInvalid("Pad width, pad length and allowable ground pressure must all be positive when provided.");
    const calculationInputs = { ...priorInputs, studySettings: { padWidthM: padWidthM || null, padLengthM: padLengthM || null, allowableGroundPressureKpa: allowableKpa || null }, towerLiftTemplateSnapshot: erectionSnapshot };
    const { data, error: updateError } = await service.from("lift_study_revisions").update({ crane_profile_revision_id: craneRevisionId, configuration_revision_id: configurationRevisionId, template_revision_id: templateRevisionId, erection_template_revision_id: erectionTemplateRevisionId, calculation_inputs: calculationInputs }).eq("id", revision.id).select("id,crane_profile_revision_id,configuration_revision_id,template_revision_id,erection_template_revision_id,calculation_inputs").single();
    if (updateError) throw new Error(updateError.message);
    return NextResponse.json({ revision: data });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

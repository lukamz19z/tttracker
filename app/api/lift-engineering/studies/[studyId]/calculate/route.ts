import { NextResponse } from "next/server";
import { calculateLift } from "@/lib/lift-engineering/calculations/study";
import { liftApiError, liftInvalid, requireLiftAccess, assertLiftProjectAccess, LIFT_ACCESS } from "@/lib/lift-engineering/server";
import type { LiftCalculationInput, LoadChartPoint } from "@/lib/lift-engineering/types";
import { chartMatchesBaseSetup } from "@/lib/lift-engineering/base-configuration";

const ENGINE_VERSION = "v1.0.0";
type Context = { params: Promise<{ studyId: string }> };
function isPhaseInput(value: unknown): value is LiftCalculationInput["phases"][number] {
  if (!value || typeof value !== "object") return false;
  const phase = value as Record<string, unknown>;
  if (!phase.loadShare || typeof phase.loadShare !== "object") return false;
  const share = phase.loadShare as Record<string, unknown>;
  return typeof phase.key === "string" && typeof phase.name === "string" &&
    typeof phase.radiusM === "number" && Number.isFinite(phase.radiusM) &&
    typeof share.main === "number" && Number.isFinite(share.main) &&
    typeof share.auxiliary === "number" && Number.isFinite(share.auxiliary);
}

export async function POST(request: Request, context: Context) {
  try {
    const { user, service } = await requireLiftAccess(request, LIFT_ACCESS.editStudy);
    const { studyId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const { data: study, error: studyError } = await service.from("lift_studies").select("id,project_id,current_revision_id")
      .eq("id", studyId).maybeSingle();
    if (studyError) throw new Error(studyError.message);
    if (!study) return NextResponse.json({ error: "Lift Study was not found." }, { status: 404 });
    await assertLiftProjectAccess(service, user.id, study.project_id);
    if (!study.current_revision_id) liftInvalid("Study revision is not ready for calculation.");
    const { data: revision, error: revisionError } = await service.from("lift_study_revisions").select("id,status,issued_at,crane_profile_revision_id,configuration_revision_id,template_revision_id,calculation_inputs")
      .eq("id", study.current_revision_id).eq("study_id", study.id).single();
    if (revisionError) throw new Error(revisionError.message);
    if (revision.issued_at || revision.status !== "draft") liftInvalid("Issued or submitted revisions are immutable. Create a new revision before recalculating.");
    if (!Array.isArray(body.lifts) || body.lifts.length === 0 || body.lifts.length > 500) liftInvalid("Add between 1 and 500 lifts before calculating.");

    const rawLifts = body.lifts as Array<Record<string, unknown>>;
    const selectedIds = (values: unknown[]) => values.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim());
    const chartIds = [...new Set(rawLifts.flatMap((row) => selectedIds([row.chartId, row.auxiliaryChartId])))];
    if (!chartIds.length) liftInvalid("Select at least one manufacturer load chart.");
    const componentIds = [...new Set(rawLifts.flatMap((row) => selectedIds([row.mainHookId,row.mainRopeId,row.mainAttachmentId,row.auxiliaryHookId,row.auxiliaryRopeId,row.auxiliaryAttachmentId])))];
    const arrangementIds = [...new Set(rawLifts.flatMap((row) => selectedIds([row.mainRiggingArrangementId,row.auxiliaryRiggingArrangementId])))];
    if (!revision.crane_profile_revision_id || !revision.configuration_revision_id) liftInvalid("Select a crane profile revision and configuration revision in Study Setup before calculating.");
    const [selectedCraneResult, selectedConfigurationResult] = await Promise.all([
      service.from("lift_crane_profile_revisions").select("crane_profile_id").eq("id", revision.crane_profile_revision_id).maybeSingle(),
      service.from("lift_crane_configuration_revisions").select("id,configuration_id,counterweight_t,data").eq("id", revision.configuration_revision_id).maybeSingle(),
    ]);
    const selectedCraneRevision = selectedCraneResult.data;
    const selectedConfigurationRevision = selectedConfigurationResult.data;
    const selectedCraneError = selectedCraneResult.error ?? selectedConfigurationResult.error;
    if (selectedCraneError) throw new Error(selectedCraneError.message);
    if (!selectedCraneRevision) liftInvalid("The study crane revision is unavailable.");
    if (!selectedConfigurationRevision) liftInvalid("The study crane configuration revision is unavailable.");
    const { data: selectedConfiguration, error: selectedConfigurationParentError } = await service.from("lift_crane_configurations").select("crane_profile_id").eq("id", selectedConfigurationRevision.configuration_id).maybeSingle();
    if (selectedConfigurationParentError) throw new Error(selectedConfigurationParentError.message);
    if (!selectedConfiguration || selectedConfiguration.crane_profile_id !== selectedCraneRevision.crane_profile_id) liftInvalid("The selected base crane configuration does not belong to the study crane profile.");
    const baseData = selectedConfigurationRevision.data && typeof selectedConfigurationRevision.data === "object" ? selectedConfigurationRevision.data as Record<string, unknown> : {};
    const baseSetup = { counterweightT: selectedConfigurationRevision.counterweight_t == null ? null : Number(selectedConfigurationRevision.counterweight_t), outriggerLengthM: typeof baseData.outriggerLengthM === "number" ? baseData.outriggerLengthM : null, outriggerWidthM: typeof baseData.outriggerWidthM === "number" ? baseData.outriggerWidthM : null, slewRange: typeof baseData.slewRange === "string" ? baseData.slewRange : null };
    if (baseSetup.counterweightT == null || baseSetup.outriggerLengthM == null || baseSetup.outriggerWidthM == null || !baseSetup.slewRange) liftInvalid("The selected base crane configuration is missing counterweight, outrigger or slew data required for exact chart matching.");
    const [chartResult, pointResult] = await Promise.all([
      service.from("lift_load_charts").select("id,crane_profile_id,revision,status,active,source_document,boom_configuration,manufacturer_configuration,configuration_revision_id").in("id", chartIds),
      service.from("lift_load_chart_points").select("id,load_chart_id,configuration_key,radius_m,rated_capacity_t,source_page").in("load_chart_id", chartIds),
    ]);
    if (chartResult.error) throw new Error(`Load-chart metadata read failed: ${chartResult.error.message}`);
    if (pointResult.error) throw new Error(`Load-chart point read failed: ${pointResult.error.message}`);
    if ((chartResult.data ?? []).length !== chartIds.length) liftInvalid("One or more selected load charts are unavailable.");
    if ((chartResult.data ?? []).some((chart) => chart.crane_profile_id !== selectedCraneRevision.crane_profile_id)) liftInvalid("A load chart belongs to a different crane profile than the study.");
    if ((chartResult.data ?? []).some((chart) => !chartMatchesBaseSetup(chart, selectedCraneRevision.crane_profile_id, baseSetup))) liftInvalid("A selected lift chart does not match the study's exact base crane counterweight, outrigger geometry and slew range.");
    if ((chartResult.data ?? []).some((chart) => !chart.active || ["Draft", "Superseded"].includes(String(chart.status)))) {
      liftInvalid("Only imported or verified active manufacturer charts can be used. Draft or superseded charts must not determine lifting capacity.");
    }
    const [hookRows, ropeRows, attachmentRows, arrangementRows, arrangements] = await Promise.all([
      componentIds.length ? service.from("lift_crane_hooks").select("id,mass_kg,crane_profile_revision_id").in("id", componentIds) : Promise.resolve({ data: [], error: null }),
      componentIds.length ? service.from("lift_crane_ropes").select("id,mass_kg,crane_profile_revision_id").in("id", componentIds) : Promise.resolve({ data: [], error: null }),
      componentIds.length ? service.from("lift_crane_attachments").select("id,mass_kg,crane_profile_revision_id").in("id", componentIds) : Promise.resolve({ data: [], error: null }),
      arrangementIds.length ? service.from("lift_rigging_arrangement_items").select("arrangement_id,rigging_item_revision_id,quantity,mass_override_kg,override_reason,lift_rigging_item_revisions(mass_kg)").in("arrangement_id", arrangementIds) : Promise.resolve({ data: [], error: null }),
      arrangementIds.length ? service.from("lift_rigging_arrangements").select("id").in("id", arrangementIds) : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [hookRows, ropeRows, attachmentRows, arrangementRows, arrangements]) if (result.error) throw new Error(`Selected crane/rigging component read failed: ${result.error.message}`);
    if ((arrangements.data ?? []).length !== arrangementIds.length) liftInvalid("One or more selected rigging arrangements were not found.");
    const componentById = new Map<string, { mass_kg: number; crane_profile_revision_id: string }>();
    for (const row of hookRows.data ?? []) componentById.set(row.id, { mass_kg: Number(row.mass_kg), crane_profile_revision_id: row.crane_profile_revision_id });
    for (const row of ropeRows.data ?? []) componentById.set(row.id, { mass_kg: Number(row.mass_kg), crane_profile_revision_id: row.crane_profile_revision_id });
    for (const row of attachmentRows.data ?? []) componentById.set(row.id, { mass_kg: Number(row.mass_kg), crane_profile_revision_id: row.crane_profile_revision_id });
    if (componentIds.some((id) => !componentById.has(id))) liftInvalid("One or more selected hook, rope or attachment components were not found.");
    if ([...componentById.values()].some((item) => item.crane_profile_revision_id !== revision.crane_profile_revision_id)) liftInvalid("Selected crane components must match the study crane profile revision.");
    const riggingByArrangement = new Map<string, number>();
    for (const row of arrangementRows.data ?? []) {
      const material = Array.isArray(row.lift_rigging_item_revisions) ? row.lift_rigging_item_revisions[0] : row.lift_rigging_item_revisions;
      if (row.mass_override_kg !== null && !String(row.override_reason ?? "").trim()) liftInvalid("Rigging mass overrides require a reason.");
      const mass = Number(row.mass_override_kg ?? material?.mass_kg ?? 0) * Number(row.quantity);
      riggingByArrangement.set(row.arrangement_id, (riggingByArrangement.get(row.arrangement_id) ?? 0) + mass);
    }
    const chartById = new Map((chartResult.data ?? []).map((chart) => [chart.id, chart]));
    const points: LoadChartPoint[] = (pointResult.data ?? []).map((point) => ({ chartId: point.load_chart_id,
      configurationKey: point.configuration_key, radiusM: Number(point.radius_m), capacityT: Number(point.rated_capacity_t) }));
    const liftRows: Array<Record<string, unknown>> = [];
    const phaseRows: Array<Record<string, unknown>> = [];
    const resultRows: Array<Record<string, unknown>> = [];
    const output: Array<Record<string, unknown>> = [];
    const inputLiftSnapshots: Array<Record<string, unknown>> = [];

    for (let index = 0; index < rawLifts.length; index += 1) {
      const row = rawLifts[index];
      const chartId = typeof row.chartId === "string" ? row.chartId : "";
      const auxiliaryChartId = typeof row.auxiliaryChartId === "string" ? row.auxiliaryChartId : null;
      if (!chartIds.includes(chartId) || (auxiliaryChartId && !chartIds.includes(auxiliaryChartId))) liftInvalid(`Lift ${String(row.liftNumber ?? index + 1)} references an unselected load chart.`);
      if (!Array.isArray(row.phases) || row.phases.length === 0 || row.phases.length > 30 || !row.phases.every(isPhaseInput)) liftInvalid(`Lift ${index + 1} must include 1 to 30 complete operating phases.`);
      const phases = row.phases;
      if (phases.some((phase) => (phase.loadShare.main > 0 && !row.mainHookId) || (phase.loadShare.auxiliary > 0 && !row.auxiliaryHookId))) liftInvalid(`Lift ${String(row.liftNumber ?? index + 1)} needs a hook selected for each active load share.`);
      const massOf = (id: unknown) => id ? componentById.get(String(id))?.mass_kg ?? 0 : 0;
      const mainRiggingTareKg = typeof row.mainRiggingArrangementId === "string" ? riggingByArrangement.get(row.mainRiggingArrangementId) ?? 0 : 0;
      const auxiliaryRiggingTareKg = typeof row.auxiliaryRiggingArrangementId === "string" ? riggingByArrangement.get(row.auxiliaryRiggingArrangementId) ?? 0 : 0;
      for (const id of [row.mainRiggingArrangementId,row.auxiliaryRiggingArrangementId]) if (typeof id === "string" && id && !arrangementIds.includes(id)) liftInvalid("Selected rigging arrangement is not available.");
      const input: LiftCalculationInput = {
        liftNumber: String(row.liftNumber ?? "").trim(), elementMassKg: Number(row.elementMassKg),
        effectiveLoadFactor: Number(row.effectiveLoadFactor),
        mainRiggingTareKg, auxiliaryRiggingTareKg,
        mainHookOverheadKg: massOf(row.mainHookId) + massOf(row.mainRopeId) + massOf(row.mainAttachmentId) + mainRiggingTareKg,
        auxiliaryHookOverheadKg: massOf(row.auxiliaryHookId) + massOf(row.auxiliaryRopeId) + massOf(row.auxiliaryAttachmentId) + auxiliaryRiggingTareKg, phases,
      };
      if (!input.liftNumber || !Number.isFinite(input.elementMassKg) || input.elementMassKg < 0 || !Number.isFinite(input.effectiveLoadFactor) || input.effectiveLoadFactor < 0 || phases.some((phase) => !Number.isFinite(phase.radiusM) || phase.radiusM < 0 || phase.loadShare.main < 0 || phase.loadShare.auxiliary < 0)) liftInvalid(`Lift ${index + 1} has invalid mass, factor, overhead, phase or radius input.`);
      const selectedChartIds = new Set([chartId, ...(auxiliaryChartId ? [auxiliaryChartId] : [])]);
      const selectedPoints = points.filter((point) => point.chartId && selectedChartIds.has(point.chartId));
      const mainChart = chartById.get(chartId);
      const configurationKey = typeof row.configurationKey === "string" && row.configurationKey.trim() ? row.configurationKey.trim() : String(mainChart?.boom_configuration ?? "");
      const auxiliaryConfigurationKey = typeof row.auxiliaryConfigurationKey === "string" ? row.auxiliaryConfigurationKey : String(chartById.get(auxiliaryChartId ?? chartId)?.boom_configuration ?? `${configurationKey}:auxiliary`);
      const mainIdentityKey = (mainChart?.manufacturer_configuration as Record<string, unknown> | null)?.identityKey;
      if (typeof mainIdentityKey === "string" && configurationKey !== mainIdentityKey) liftInvalid(`Lift ${input.liftNumber} does not use the exact selected manufacturer chart configuration.`);
      const result = calculateLift(input, selectedPoints, configurationKey, auxiliaryConfigurationKey);
      if (result.assessment === "missing_chart_capacity") liftInvalid("No manufacturer capacity is available at or beyond the required radius for this exact crane configuration.");
      const liftId = crypto.randomUUID();
      const liftRow = { id: liftId, templateLiftId: typeof row.templateLiftId === "string" ? row.templateLiftId : null,
        liftNumber: input.liftNumber, sequenceNo: Number.isInteger(Number(row.sequenceNo)) ? Number(row.sequenceNo) : index + 1,
        description: String(row.description ?? input.liftNumber), liftType: String(row.liftType ?? "Custom"), inputSnapshot: { ...row, derived: input } };
      liftRows.push(liftRow);
      inputLiftSnapshots.push({ ...row, liftNumber: input.liftNumber, sequenceNo: liftRow.sequenceNo, description: liftRow.description, liftType: liftRow.liftType });
      for (const phase of input.phases) phaseRows.push({ studyLiftId: liftId, phaseKey: phase.key, phaseName: phase.name,
        mainLoadShare: phase.loadShare.main, auxiliaryLoadShare: phase.loadShare.auxiliary, radiusM: phase.radiusM, inputSnapshot: phase });
      for (const phase of result.phases) {
        const chart = phase.chartId ? chartById.get(phase.chartId) : null;
        resultRows.push({ studyLiftId: liftId, phaseKey: phase.phaseKey, effectiveElementMassKg: phase.effectiveElementMassKg,
          riggingTareKg: phase.riggingTareKg, mainOverheadKg: input.mainHookOverheadKg,
          auxiliaryOverheadKg: input.auxiliaryHookOverheadKg, mainTotalLoadT: phase.mainTotalLoadT,
          auxiliaryTotalLoadT: phase.auxiliaryTotalLoadT, requiredRadiusM: phase.requiredRadiusM, chartRadiusM: phase.chartRadiusM,
          chartCapacityT: phase.chartCapacityT, utilisationPct: phase.utilisationPct, boomConfiguration: chart?.boom_configuration ?? null,
          chartRevisionId: phase.chartId ?? null, chartSource: chart?.source_document ?? {}, warnings: phase.warnings });
      }
      output.push({ ...result, sequenceNo: liftRow.sequenceNo });
    }
    const loadChartRevisions = (chartResult.data ?? []).map((chart) => ({ id: chart.id, revision: chart.revision,
      configurationRevisionId: chart.configuration_revision_id, sourceDocument: chart.source_document }));
    const riggingRevisions = (arrangementRows.data ?? []).map((row) => ({ arrangementId: row.arrangement_id,
      riggingItemRevisionId: row.rigging_item_revision_id, quantity: row.quantity, massOverrideKg: row.mass_override_kg,
      overrideReason: row.override_reason }));
    const priorInputs = revision.calculation_inputs && typeof revision.calculation_inputs === "object" ? revision.calculation_inputs as Record<string, unknown> : {};
    const studySettings = priorInputs.studySettings ?? {};
    const inputSnapshot = { projectId: study.project_id, studySettings, craneProfileRevisionId: revision.crane_profile_revision_id,
      configurationRevisionId: revision.configuration_revision_id, templateRevisionId: revision.template_revision_id,
      chartIds, loadChartRevisions, riggingRevisions,
      sourceDocuments: loadChartRevisions.map((chart) => chart.sourceDocument).filter(Boolean), lifts: inputLiftSnapshots };
    const ordered = [...output].sort((a, b) => Number((b.governingUtilisationPct as number | null) ?? -1) - Number((a.governingUtilisationPct as number | null) ?? -1));
    const outputSnapshot = { lifts: output, governingLift: ordered[0] ?? null,
      warnings: output.flatMap((lift) => (lift.phases as Array<{ warnings: string[] }>).flatMap((phase) => phase.warnings)) };
    const { error: saveError } = await service.rpc("v1_lift_study_save_calculation", {
      p_revision_id: revision.id, p_input_snapshot: inputSnapshot, p_output_snapshot: outputSnapshot,
      p_lifts: liftRows, p_phases: phaseRows, p_results: resultRows,
      p_engine_version: ENGINE_VERSION, p_methodology_version: String(body.methodologyVersion ?? "v1-parity-unverified"),
    });
    if (saveError) throw new Error(`Lift Study calculation save failed: ${saveError.message}`);
    return NextResponse.json({ revisionId: revision.id, engineVersion: ENGINE_VERSION, assessment: "parity-check-required", ...outputSnapshot });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

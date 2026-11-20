import { selectConservativeChartPoint } from "./load-chart.ts";
import { suspendedLoadByHook } from "./suspended-load.ts";
import { utilisationPercent } from "./capacity.ts";
import type { LiftCalculationInput, LiftPhaseResult, LoadChartPoint, LiftStudyCalculationResult } from "../types.ts";

export function calculateLift(input: LiftCalculationInput, chartPoints: LoadChartPoint[], configurationKey: string, auxiliaryConfigurationKey = `${configurationKey}:auxiliary`): LiftStudyCalculationResult {
  const invalid = !input.liftNumber.trim() || !input.phases.length ||
    !Number.isFinite(input.mainHookOverheadKg) || input.mainHookOverheadKg < 0 ||
    !Number.isFinite(input.auxiliaryHookOverheadKg) || input.auxiliaryHookOverheadKg < 0 ||
    !Number.isFinite(input.mainRiggingTareKg) || input.mainRiggingTareKg < 0 ||
    !Number.isFinite(input.auxiliaryRiggingTareKg) || input.auxiliaryRiggingTareKg < 0 ||
    input.phases.some((phase) => !Number.isFinite(phase.radiusM) || phase.radiusM < 0 ||
      !Number.isFinite(phase.loadShare?.main) || phase.loadShare.main < 0 ||
      !Number.isFinite(phase.loadShare?.auxiliary) || phase.loadShare.auxiliary < 0);
  if (invalid) return { liftNumber: input.liftNumber, phases: [], governingPhaseKey: null, governingUtilisationPct: null, assessment: "invalid_inputs" };
  const phases: LiftPhaseResult[] = input.phases.map((phase) => {
    const load = suspendedLoadByHook(input, phase);
    const mainRequired = phase.loadShare.main > 0;
    const auxiliaryRequired = phase.loadShare.auxiliary > 0;
    const main = mainRequired ? selectConservativeChartPoint(chartPoints, phase.radiusM, configurationKey) : null;
    const auxiliary = auxiliaryRequired ? selectConservativeChartPoint(chartPoints, phase.radiusM, auxiliaryConfigurationKey) : null;
    const candidates = [
      ...(main ? [{ point: main, loadT: load.mainTotalLoadT, hook: "main" as const }] : []),
      ...(auxiliary ? [{ point: auxiliary, loadT: load.auxiliaryTotalLoadT, hook: "auxiliary" as const }] : []),
    ].map((candidate) => ({ ...candidate, utilisation: utilisationPercent(candidate.loadT, candidate.point.capacityT) }))
      .sort((a, b) => b.utilisation - a.utilisation);
    const governing = candidates[0] ?? null;
    const point = governing?.point ?? null;
    return {
      phaseKey: phase.key, phaseName: phase.name, effectiveElementMassKg: load.effectiveElementMassKg,
      riggingTareKg: load.riggingTareKg, mainTotalLoadT: load.mainTotalLoadT,
      auxiliaryTotalLoadT: load.auxiliaryTotalLoadT, requiredRadiusM: phase.radiusM,
      chartRadiusM: point?.radiusM ?? null, chartCapacityT: point?.capacityT ?? null,
      utilisationPct: governing?.utilisation ?? null,
      configurationKey: point?.configurationKey ?? configurationKey,
      chartId: point?.chartId ?? null,
      governingHook: governing?.hook ?? (auxiliaryRequired ? "auxiliary" : "main"),
      warnings: candidates.length < Number(mainRequired) + Number(auxiliaryRequired) ? ["A required hook phase has no conservative chart point."] : [],
    };
  });
  const valid = phases.filter((phase) => phase.utilisationPct !== null).sort((a, b) => (b.utilisationPct ?? 0) - (a.utilisationPct ?? 0));
  const governing = valid[0] ?? null;
  return {
    liftNumber: input.liftNumber, phases, governingPhaseKey: governing?.phaseKey ?? null,
    governingUtilisationPct: governing?.utilisationPct ?? null,
    assessment: phases.some((phase) => phase.utilisationPct === null) ? "missing_chart_capacity" : "calculable",
  };
}

import { effectiveElementMassKg } from "./effective-load.ts";
import { kgToTonnes } from "../units.ts";
import type { LiftCalculationInput, LiftPhaseInput } from "../types.ts";

export function suspendedLoadByHook(input: LiftCalculationInput, phase: LiftPhaseInput) {
  const elementKg = effectiveElementMassKg(input.elementMassKg, input.effectiveLoadFactor);
  const riggingKg = input.mainRiggingTareKg + input.auxiliaryRiggingTareKg;
  return {
    effectiveElementMassKg: elementKg,
    riggingTareKg: riggingKg,
    mainTotalLoadT: kgToTonnes(elementKg * phase.loadShare.main + (phase.loadShare.main > 0 ? input.mainHookOverheadKg : 0)),
    auxiliaryTotalLoadT: kgToTonnes(elementKg * phase.loadShare.auxiliary + (phase.loadShare.auxiliary > 0 ? input.auxiliaryHookOverheadKg : 0)),
  };
}

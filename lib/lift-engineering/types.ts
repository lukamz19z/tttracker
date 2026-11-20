export type LoadShare = { main: number; auxiliary: number };

export type RiggingComponent = {
  id: string;
  revisionId: string;
  description: string;
  quantity: number;
  massKg: number;
  massOverrideKg?: number | null;
};

export type LiftPhaseInput = {
  key: string;
  name: string;
  loadShare: LoadShare;
  radiusM: number;
};

export type LiftCalculationInput = {
  liftNumber: string;
  elementMassKg: number;
  effectiveLoadFactor: number;
  mainRiggingTareKg: number;
  auxiliaryRiggingTareKg: number;
  mainHookOverheadKg: number;
  auxiliaryHookOverheadKg: number;
  phases: LiftPhaseInput[];
};

export type LoadChartPoint = {
  chartId?: string;
  radiusM: number;
  capacityT: number;
  configurationKey: string;
};

export type LiftPhaseResult = {
  phaseKey: string;
  phaseName: string;
  effectiveElementMassKg: number;
  riggingTareKg: number;
  mainTotalLoadT: number;
  auxiliaryTotalLoadT: number;
  requiredRadiusM: number;
  chartRadiusM: number | null;
  chartCapacityT: number | null;
  utilisationPct: number | null;
  configurationKey: string;
  chartId?: string | null;
  governingHook: "main" | "auxiliary";
  warnings: string[];
};

export type LiftStudyCalculationResult = {
  liftNumber: string;
  phases: LiftPhaseResult[];
  governingPhaseKey: string | null;
  governingUtilisationPct: number | null;
  assessment: "calculable" | "missing_chart_capacity" | "invalid_inputs";
};

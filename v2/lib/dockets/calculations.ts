export type LabourCalculationInput = {
  workerName: string;
  timeIn?: string | null;
  timeOut?: string | null;
  prestartMinutes?: number | null;
  lunchMinutes?: number | null;
  travelInMinutes?: number | null;
  travelOutMinutes?: number | null;
  mobilisationHours?: number | null;
  delayHours?: number | null;
};

export type LabourCalculationResult = LabourCalculationInput & {
  rawHours: number;
  productionHours: number;
};

export type ProgressStageInput = {
  id: string;
  phase: "assembly" | "erection";
  weight: number;
  applicable: boolean;
  percentBefore: number;
  percentAfter: number;
};

export type ProgressProfileInput = {
  assemblyShare: number;
  erectionShare: number;
  normalizeApplicableWeights: boolean;
  mhTBasis: "progress_earned_tonnes" | "manual_tonnes";
};

export type TowerProgressCalculation = {
  assemblyBefore: number;
  assemblyAfter: number;
  erectionBefore: number;
  erectionAfter: number;
  overallBefore: number;
  overallAfter: number;
  overallDelta: number;
  earnedTonnes: number;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}

export function timeToMinutes(value?: string | null) {
  if (!value) return null;
  const clean = value.trim();
  if (!clean) return null;

  const compact = clean.replace(":", "");
  let hours = 0;
  let minutes = 0;

  if (/^\d{3,4}$/.test(compact)) {
    const padded = compact.padStart(4, "0");
    hours = Number(padded.slice(0, 2));
    minutes = Number(padded.slice(2));
  } else {
    const match = clean.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    hours = Number(match[1]);
    minutes = Number(match[2]);
  }

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

export function calculateLabourRow(
  row: LabourCalculationInput,
): LabourCalculationResult {
  const start = timeToMinutes(row.timeIn);
  const finish = timeToMinutes(row.timeOut);

  let rawMinutes = 0;

  if (start !== null && finish !== null) {
    let end = finish;
    if (end < start) end += 24 * 60;
    rawMinutes = Math.max(0, end - start);
  }

  const deductions =
    Math.max(0, Number(row.prestartMinutes ?? 0)) +
    Math.max(0, Number(row.lunchMinutes ?? 0)) +
    Math.max(0, Number(row.travelInMinutes ?? 0)) +
    Math.max(0, Number(row.travelOutMinutes ?? 0)) +
    Math.max(0, Number(row.mobilisationHours ?? 0)) * 60 +
    Math.max(0, Number(row.delayHours ?? 0)) * 60;

  return {
    ...row,
    rawHours: rawMinutes / 60,
    productionHours: Math.max(0, rawMinutes - deductions) / 60,
  };
}

export function calculateLabourTotals(
  rows: LabourCalculationInput[],
) {
  const calculated = rows.map(calculateLabourRow);

  return {
    rows: calculated,
    rawManhours: calculated.reduce(
      (sum, row) => sum + row.rawHours,
      0,
    ),
    productionManhours: calculated.reduce(
      (sum, row) => sum + row.productionHours,
      0,
    ),
  };
}

function weightedPhaseProgress(
  stages: ProgressStageInput[],
  phase: "assembly" | "erection",
  side: "before" | "after",
  normalize: boolean,
) {
  const applicable = stages.filter(
    (stage) =>
      stage.phase === phase &&
      stage.applicable &&
      stage.weight > 0,
  );

  if (applicable.length === 0) return 0;

  const weightTotal = applicable.reduce(
    (sum, stage) => sum + stage.weight,
    0,
  );

  // If applicable sections are normalised, an omitted BE (or any other
  // non-applicable stage) cannot cap the tower below 100%.
  const denominator = normalize ? weightTotal : 100;

  if (denominator <= 0) return 0;

  const weighted = applicable.reduce((sum, stage) => {
    const pct =
      side === "before"
        ? clamp(stage.percentBefore)
        : clamp(stage.percentAfter);

    return sum + stage.weight * (pct / 100);
  }, 0);

  return clamp((weighted / denominator) * 100);
}

export function calculateTowerProgress(input: {
  stages: ProgressStageInput[];
  profile: ProgressProfileInput;
  towerWeightTonnes?: number | null;
  manualProductionTonnes?: number | null;
}): TowerProgressCalculation {
  const assemblyBefore = weightedPhaseProgress(
    input.stages,
    "assembly",
    "before",
    input.profile.normalizeApplicableWeights,
  );

  const assemblyAfter = weightedPhaseProgress(
    input.stages,
    "assembly",
    "after",
    input.profile.normalizeApplicableWeights,
  );

  const erectionBefore = weightedPhaseProgress(
    input.stages,
    "erection",
    "before",
    input.profile.normalizeApplicableWeights,
  );

  const erectionAfter = weightedPhaseProgress(
    input.stages,
    "erection",
    "after",
    input.profile.normalizeApplicableWeights,
  );

  const phaseTotal =
    Math.max(0, input.profile.assemblyShare) +
    Math.max(0, input.profile.erectionShare);

  const assemblyFraction =
    phaseTotal > 0
      ? Math.max(0, input.profile.assemblyShare) / phaseTotal
      : 0.5;

  const erectionFraction =
    phaseTotal > 0
      ? Math.max(0, input.profile.erectionShare) / phaseTotal
      : 0.5;

  const overallBefore =
    assemblyBefore * assemblyFraction +
    erectionBefore * erectionFraction;

  const overallAfter =
    assemblyAfter * assemblyFraction +
    erectionAfter * erectionFraction;

  const overallDelta = Math.max(
    0,
    overallAfter - overallBefore,
  );

  const towerWeight = Math.max(
    0,
    Number(input.towerWeightTonnes ?? 0),
  );

  const earnedTonnes =
    input.profile.mhTBasis === "manual_tonnes"
      ? Math.max(0, Number(input.manualProductionTonnes ?? 0))
      : towerWeight * (overallDelta / 100);

  return {
    assemblyBefore,
    assemblyAfter,
    erectionBefore,
    erectionAfter,
    overallBefore,
    overallAfter,
    overallDelta,
    earnedTonnes,
  };
}

export function calculateMhPerTonne(
  manhours: number,
  tonnes: number,
) {
  if (!Number.isFinite(manhours) || !Number.isFinite(tonnes) || tonnes <= 0) {
    return null;
  }

  return manhours / tonnes;
}

export function aggregateMhPerTonne(
  rows: Array<{
    rawHours: number;
    productionHours: number;
    earnedTonnes: number;
  }>,
) {
  const rawHours = rows.reduce(
    (sum, row) => sum + Number(row.rawHours || 0),
    0,
  );

  const productionHours = rows.reduce(
    (sum, row) => sum + Number(row.productionHours || 0),
    0,
  );

  const earnedTonnes = rows.reduce(
    (sum, row) => sum + Number(row.earnedTonnes || 0),
    0,
  );

  // Never average docket MH/t values. The correct project figure is the
  // aggregate numerator divided by the aggregate tonnes.
  return {
    rawHours,
    productionHours,
    earnedTonnes,
    rawMhPerTonne: calculateMhPerTonne(rawHours, earnedTonnes),
    productionMhPerTonne: calculateMhPerTonne(
      productionHours,
      earnedTonnes,
    ),
  };
}

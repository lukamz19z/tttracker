// lib/dockets/calculations.ts
//
// Shared Daily Docket calculation engine.
//
// Keep all calculation rules used by the Daily Docket form, BC Review,
// PDF generation and mobile app in this file so every surface produces
// the same result from the same inputs.

export type ProgressModel = "legacy" | "section_v2";

export type DelayScope = "entire_crew" | "selected_workers";

export type DelayAppliesMode = "labour_only" | "labour_and_plant";

export type DelayType =
  | "weather"
  | "lightning"
  | "toolbox"
  | "mobilisation"
  | "access"
  | "plant"
  | "materials"
  | "other";

export type LabourCalculationRow = {
  worker_name: string;
  time_in: string;
  time_out: string;
  total_hours: string | number | null | undefined;
  lunch_minutes: string | number | null | undefined;
  travel_in_minutes: string | number | null | undefined;
  travel_out_minutes: string | number | null | undefined;
  mobilisation_hours: string | number | null | undefined;
  delay_hours: string | number | null | undefined;
  delay_reason: string | null | undefined;
  production_hours: string | number | null | undefined;
};

export type DelayCalculationRow = {
  delay_type: DelayType | string;
  delay_reason: string | null | undefined;
  delay_hours: string | number | null | undefined;
  applies_to: DelayScope | string;
  worker_names: string[] | null | undefined;
  delay_applies_mode?: DelayAppliesMode | string | null;
  plant_names?: string[] | null;
};

export type SectionV2CalculationRow = {
  section_code: string;
  section_label: string;
  assembly_today: string | number | null | undefined;
  erection_today: string | number | null | undefined;
  assembly_weight?: number | null;
  erection_weight?: number | null;
};

export type LegacyProgressCalculationRow = {
  section_label: string;
  assembled_qty: string | number | null | undefined;
  erected_qty: string | number | null | undefined;
};

export type MobilisationCalculation = {
  enabled: boolean;
  durationMinutes: string | number | null | undefined;
  workerNames: string[];
};

export type ProgressTotals = {
  assemblyPercent: number;
  erectionPercent: number;
  totalProgressPercent: number;
  applicableWeight: number;
};

export type LabourTotals = {
  rows: LabourCalculationRow[];
  workerCount: number;
  rawManhours: number;
  productionManhours: number;
  lunchManhours: number;
  travelManhours: number;
  mobilisationManhours: number;
  delayManhours: number;
};

export const SECTION_V2_DEFS = [
  ["LE", "LE"],
  ["BE", "BE"],
  ["CB", "CB"],
  ["BSS", "BSS"],
  ["MSS", "MSS"],
  ["TSS", "TSS"],
  ["BX_ARMS", "BX ARMS"],
  ["MX_ARMS", "MX ARMS"],
  ["TX_ARMS", "TX ARMS"],
  ["EP", "EP"],
] as const;

export const SECTION_PROGRESS_WEIGHTS: Record<string, number> = {
  LE: 20,
  BE: 15,
  CB: 15,
  BSS: 10,
  MSS: 10,
  TSS: 10,
  BX_ARMS: 5,
  MX_ARMS: 5,
  TX_ARMS: 5,
  EP: 5,
};

export const BODY_EXTENSION_LABEL = "Body Extensions";

export function toNumber(
  value: string | number | null | undefined,
): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

export function hoursToMinutes(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "";

  const n = Number(value);
  if (!Number.isFinite(n)) return "";

  const minutes = n * 60;
  return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(2);
}

export function minutesToHours(
  value: string | number | null | undefined,
): number {
  return toNumber(value) / 60;
}

export function clampPercentNumber(
  value: string | number | null | undefined,
): number {
  return Math.max(0, Math.min(100, toNumber(value)));
}

export function clampPercentString(value: string): string {
  if (value === "") return "";

  const n = Number(value);
  if (Number.isNaN(n)) return "";

  return String(Math.max(0, Math.min(100, n)));
}

export function calculateHours(
  timeIn: string | null | undefined,
  timeOut: string | null | undefined,
): string {
  if (!timeIn || !timeOut) return "";

  const [h1, m1] = timeIn.split(":").map(Number);
  const [h2, m2] = timeOut.split(":").map(Number);

  if (
    Number.isNaN(h1) ||
    Number.isNaN(m1) ||
    Number.isNaN(h2) ||
    Number.isNaN(m2)
  ) {
    return "";
  }

  let diffMinutes = h2 * 60 + m2 - (h1 * 60 + m1);

  if (diffMinutes < 0) {
    diffMinutes += 24 * 60;
  }

  return (diffMinutes / 60).toFixed(2);
}

export function calculateProductionHours(
  row: LabourCalculationRow,
  appliedDelayHours?: number,
): string {
  const raw = toNumber(row.total_hours);
  const lunch = toNumber(row.lunch_minutes) / 60;
  const travelIn = toNumber(row.travel_in_minutes) / 60;
  const travelOut = toNumber(row.travel_out_minutes) / 60;
  const mobilisation = minutesToHours(row.mobilisation_hours);
  const delay = appliedDelayHours ?? toNumber(row.delay_hours);

  return Math.max(
    0,
    raw - lunch - travelIn - travelOut - mobilisation - delay,
  ).toFixed(2);
}

export function normalizeWorkerName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function delayAppliesToWorker(
  delay: DelayCalculationRow,
  workerName: string,
): boolean {
  if (delay.applies_to === "entire_crew") return true;

  const target = normalizeWorkerName(workerName);

  return (delay.worker_names || []).some(
    (name) => normalizeWorkerName(name) === target,
  );
}

export function delayTypeLabel(type: DelayType | string): string {
  switch (type) {
    case "weather":
      return "Weather";
    case "lightning":
      return "Lightning";
    case "toolbox":
      return "Toolbox";
    case "mobilisation":
      return "Mobilisation";
    case "access":
      return "Access / Bogged";
    case "plant":
      return "Plant / Equipment";
    case "materials":
      return "Materials";
    case "other":
    default:
      return "Other";
  }
}

export function delayHoursForWorker(
  workerName: string,
  delays: DelayCalculationRow[],
): number {
  if (!workerName.trim()) return 0;

  return delays.reduce((sum, delay) => {
    if (!delayAppliesToWorker(delay, workerName)) return sum;
    return sum + toNumber(delay.delay_hours);
  }, 0);
}

export function delayReasonsForWorker(
  workerName: string,
  delays: DelayCalculationRow[],
): string {
  if (!workerName.trim()) return "";

  return delays
    .filter(
      (delay) =>
        delayAppliesToWorker(delay, workerName) &&
        toNumber(delay.delay_hours) > 0,
    )
    .map(
      (delay) =>
        `${delayTypeLabel(delay.delay_type)}: ${
          delay.delay_reason || "Delay"
        }`,
    )
    .join("; ");
}

export function mobilisationAppliesToWorker(
  workerName: string,
  mobilisation: MobilisationCalculation,
): boolean {
  if (!mobilisation.enabled) return false;

  // This preserves the current Daily Docket behaviour:
  // if mobilisation is enabled and no individual worker names are stored,
  // the mobilisation applies to the whole crew. This is important for
  // backwards compatibility with older docket records.
  if (mobilisation.workerNames.length === 0) {
    return true;
  }

  return mobilisation.workerNames.some(
    (name) =>
      normalizeWorkerName(name) === normalizeWorkerName(workerName),
  );
}

export function calculateLabourRows(
  labourRows: LabourCalculationRow[],
  delays: DelayCalculationRow[],
  mobilisation: MobilisationCalculation,
): LabourCalculationRow[] {
  return labourRows.map((row) => {
    const appliedDelayHours = delayHoursForWorker(
      row.worker_name,
      delays,
    );

    const mobilisationMinutes = mobilisationAppliesToWorker(
      row.worker_name,
      mobilisation,
    )
      ? toNumber(mobilisation.durationMinutes)
      : 0;

    const next: LabourCalculationRow = {
      ...row,
      mobilisation_hours:
        mobilisationMinutes > 0 ? String(mobilisationMinutes) : "",
      delay_hours:
        appliedDelayHours > 0 ? appliedDelayHours.toFixed(2) : "",
      delay_reason: delayReasonsForWorker(row.worker_name, delays),
    };

    return {
      ...next,
      production_hours: calculateProductionHours(
        next,
        appliedDelayHours,
      ),
    };
  });
}

export function calculateLabourTotals(
  labourRows: LabourCalculationRow[],
  delays: DelayCalculationRow[],
  mobilisation: MobilisationCalculation,
): LabourTotals {
  const rows = calculateLabourRows(
    labourRows,
    delays,
    mobilisation,
  );

  const workerRows = rows.filter((row) => row.worker_name.trim());

  const rawManhours = workerRows.reduce(
    (sum, row) => sum + toNumber(row.total_hours),
    0,
  );

  const productionManhours = workerRows.reduce(
    (sum, row) => sum + toNumber(row.production_hours),
    0,
  );

  const lunchManhours = workerRows.reduce(
    (sum, row) => sum + toNumber(row.lunch_minutes) / 60,
    0,
  );

  const travelManhours = workerRows.reduce(
    (sum, row) =>
      sum +
      (toNumber(row.travel_in_minutes) +
        toNumber(row.travel_out_minutes)) /
        60,
    0,
  );

  const mobilisationManhours = workerRows.reduce(
    (sum, row) => sum + minutesToHours(row.mobilisation_hours),
    0,
  );

  const delayManhours = workerRows.reduce(
    (sum, row) => sum + toNumber(row.delay_hours),
    0,
  );

  return {
    rows,
    workerCount: workerRows.length,
    rawManhours,
    productionManhours,
    lunchManhours,
    travelManhours,
    mobilisationManhours,
    delayManhours,
  };
}

export function calculateV2ProgressTotals({
  rows,
  hasBodyExtension,
}: {
  rows: SectionV2CalculationRow[];
  hasBodyExtension: boolean;
}): ProgressTotals {
  const applicableRows = rows.filter(
    (row) => hasBodyExtension || row.section_code !== "BE",
  );

  const applicableWeight = applicableRows.reduce(
    (sum, row) =>
      sum +
      (SECTION_PROGRESS_WEIGHTS[row.section_code] ?? 0),
    0,
  );

  if (applicableWeight <= 0) {
    return {
      assemblyPercent: 0,
      erectionPercent: 0,
      totalProgressPercent: 0,
      applicableWeight: 0,
    };
  }

  const weightedAssembly = applicableRows.reduce(
    (sum, row) => {
      const progress = clampPercentNumber(row.assembly_today);
      const weight =
        SECTION_PROGRESS_WEIGHTS[row.section_code] ?? 0;

      return sum + progress * weight;
    },
    0,
  );

  const weightedErection = applicableRows.reduce(
    (sum, row) => {
      const progress = clampPercentNumber(row.erection_today);
      const weight =
        SECTION_PROGRESS_WEIGHTS[row.section_code] ?? 0;

      return sum + progress * weight;
    },
    0,
  );

  const assemblyPercent = Math.round(
    weightedAssembly / applicableWeight,
  );

  const erectionPercent = Math.round(
    weightedErection / applicableWeight,
  );

  const totalProgressPercent = Math.round(
    assemblyPercent * 0.5 + erectionPercent * 0.5,
  );

  return {
    assemblyPercent,
    erectionPercent,
    totalProgressPercent,
    applicableWeight,
  };
}

export function isBodyExtensionRow(
  row: LegacyProgressCalculationRow,
): boolean {
  return (
    row.section_label.trim().toLowerCase() ===
    BODY_EXTENSION_LABEL.toLowerCase()
  );
}

export function calculateLegacyProgressTotals({
  rows,
  hasBodyExtension,
}: {
  rows: LegacyProgressCalculationRow[];
  hasBodyExtension: boolean;
}): ProgressTotals {
  const applicableRows = rows.filter(
    (row) => hasBodyExtension || !isBodyExtensionRow(row),
  );

  if (applicableRows.length === 0) {
    return {
      assemblyPercent: 0,
      erectionPercent: 0,
      totalProgressPercent: 0,
      applicableWeight: 0,
    };
  }

  const equalWeight = 100 / applicableRows.length;

  const assemblyPercent = Math.round(
    applicableRows.reduce((sum, row) => {
      const rowPercent = clampPercentNumber(row.assembled_qty);

      return sum + (rowPercent / 100) * equalWeight;
    }, 0),
  );

  const erectionPercent = Math.round(
    applicableRows.reduce((sum, row) => {
      const rowPercent = clampPercentNumber(row.erected_qty);

      return sum + (rowPercent / 100) * equalWeight;
    }, 0),
  );

  const totalProgressPercent = Math.round(
    assemblyPercent * 0.5 + erectionPercent * 0.5,
  );

  return {
    assemblyPercent,
    erectionPercent,
    totalProgressPercent,
    applicableWeight: 100,
  };
}

export function calculateProgressTotals({
  progressModel,
  sectionV2Rows,
  legacyRows,
  hasBodyExtension,
}: {
  progressModel: ProgressModel;
  sectionV2Rows: SectionV2CalculationRow[];
  legacyRows: LegacyProgressCalculationRow[];
  hasBodyExtension: boolean;
}): ProgressTotals {
  if (progressModel === "section_v2") {
    return calculateV2ProgressTotals({
      rows: sectionV2Rows,
      hasBodyExtension,
    });
  }

  return calculateLegacyProgressTotals({
    rows: legacyRows,
    hasBodyExtension,
  });
}

export function calculateMobilisationWorkerCount({
  labourRows,
  mobilisation,
}: {
  labourRows: LabourCalculationRow[];
  mobilisation: MobilisationCalculation;
}): number {
  if (!mobilisation.enabled) return 0;

  const validWorkers = labourRows.filter(
    (row) => row.worker_name.trim(),
  );

  if (mobilisation.workerNames.length === 0) {
    return validWorkers.length;
  }

  return validWorkers.filter((row) =>
    mobilisation.workerNames.some(
      (name) =>
        normalizeWorkerName(name) ===
        normalizeWorkerName(row.worker_name),
    ),
  ).length;
}

export function calculateMobilisationManhours({
  labourRows,
  mobilisation,
}: {
  labourRows: LabourCalculationRow[];
  mobilisation: MobilisationCalculation;
}): number {
  const durationHours = mobilisation.enabled
    ? minutesToHours(mobilisation.durationMinutes)
    : 0;

  const workerCount = calculateMobilisationWorkerCount({
    labourRows,
    mobilisation,
  });

  return durationHours * workerCount;
}

export function calculateTotalDelayEventHours(
  delays: DelayCalculationRow[],
): number {
  return delays.reduce(
    (sum, row) => sum + toNumber(row.delay_hours),
    0,
  );
}

export function calculateTotalPlantDelayHours(
  delays: DelayCalculationRow[],
): number {
  return delays.reduce((sum, row) => {
    if (row.delay_applies_mode !== "labour_and_plant") {
      return sum;
    }

    return (
      sum +
      toNumber(row.delay_hours) *
        (row.plant_names?.length ?? 0)
    );
  }, 0);
}

export function calculateDelaySummaryByType(
  delays: DelayCalculationRow[],
): Record<string, number> {
  return delays.reduce<Record<string, number>>(
    (acc, row) => {
      const key = String(row.delay_type || "other");

      acc[key] =
        (acc[key] || 0) + toNumber(row.delay_hours);

      return acc;
    },
    {},
  );
}

export function buildTowerProgressStatus(
  progress: number,
): "Complete" | "In Progress" | "Not Started" {
  if (progress >= 100) return "Complete";
  if (progress > 0) return "In Progress";
  return "Not Started";
}

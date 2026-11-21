import type { ChartConfigurationRecord, ManufacturerChartConfiguration } from "./chart-configuration";

export type BaseConfigurationChart = ChartConfigurationRecord & {
  active?: boolean;
  manufacturer_configuration?: ManufacturerChartConfiguration | null;
};
export type OutriggerSetupOption = { lengthM: number; widthM: number; label: string };
export type BaseSetupOptions = { counterweights: number[]; outriggers: OutriggerSetupOption[]; slewRanges: string[] };
export type BaseSetupSelection = { counterweightT?: number | null; outriggerLengthM?: number | null; outriggerWidthM?: number | null; slewRange?: string | null };

const imported = (chart: BaseConfigurationChart) => chart.active !== false && ["imported", "verified"].includes(String(chart.status ?? "").toLowerCase());
const configOf = (chart: BaseConfigurationChart) => chart.manufacturer_configuration ?? {};
const numeric = (value: unknown): number | null => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const closeEnough = (a: unknown, b: unknown) => { const left = numeric(a); const right = numeric(b); return left != null && right != null && Math.abs(left - right) < 1e-6; };

/** Returns only imported chart-backed base options, cascading through the selections already made. */
export function baseSetupOptions(
  charts: BaseConfigurationChart[],
  craneProfileId: string,
  selected: BaseSetupSelection = {},
): BaseSetupOptions {
  const rows = charts.filter((chart) => chart.crane_profile_id === craneProfileId && imported(chart));
  const counterweights = [...new Set(rows.map((chart) => numeric(configOf(chart).counterweightT)).filter((value): value is number => value != null))].sort((a, b) => a - b);
  const counterweightRows = selected.counterweightT == null ? rows : rows.filter((chart) => closeEnough(configOf(chart).counterweightT, selected.counterweightT));
  const setups = new Map<string, OutriggerSetupOption>();
  for (const chart of counterweightRows) {
    const configuration = configOf(chart);
    const lengthM = numeric(configuration.outriggerLengthM); const widthM = numeric(configuration.outriggerWidthM);
    if (lengthM == null || widthM == null) continue;
    const key = `${lengthM.toFixed(6)}|${widthM.toFixed(6)}`;
    setups.set(key, { lengthM, widthM, label: `${lengthM.toFixed(2)} × ${widthM.toFixed(2)} m` });
  }
  const outriggerRows = selected.outriggerLengthM == null || selected.outriggerWidthM == null
    ? counterweightRows
    : counterweightRows.filter((chart) => closeEnough(configOf(chart).outriggerLengthM, selected.outriggerLengthM) && closeEnough(configOf(chart).outriggerWidthM, selected.outriggerWidthM));
  const slewRanges = [...new Set(outriggerRows.map((chart) => configOf(chart).slewRange).filter((value): value is string | number => typeof value === "string" || typeof value === "number").map(String))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return { counterweights, outriggers: [...setups.values()].sort((a, b) => a.lengthM - b.lengthM || a.widthM - b.widthM), slewRanges };
}

/** Filters the lift-level chart family to the exact selected base crane setup. */
export function chartMatchesBaseSetup(chart: BaseConfigurationChart, craneProfileId: string, selected: BaseSetupSelection): boolean {
  if (chart.crane_profile_id !== craneProfileId || !imported(chart)) return false;
  const configuration = configOf(chart);
  if (selected.counterweightT != null && !closeEnough(configuration.counterweightT, selected.counterweightT)) return false;
  if (selected.outriggerLengthM != null && !closeEnough(configuration.outriggerLengthM, selected.outriggerLengthM)) return false;
  if (selected.outriggerWidthM != null && !closeEnough(configuration.outriggerWidthM, selected.outriggerWidthM)) return false;
  if (selected.slewRange && String(configuration.slewRange ?? "") !== selected.slewRange) return false;
  return true;
}

/** Base setup identity deliberately excludes lift-level boom/accessory dimensions. */
export function baseConfigurationIdentity(craneProfileId: string, setup: BaseSetupSelection): string {
  return JSON.stringify({ craneProfileId, counterweightT: numeric(setup.counterweightT), outriggerLengthM: numeric(setup.outriggerLengthM), outriggerWidthM: numeric(setup.outriggerWidthM), slewRange: setup.slewRange ?? null });
}

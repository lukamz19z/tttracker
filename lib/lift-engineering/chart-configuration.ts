export const CHART_CONFIGURATION_DIMENSIONS = [
  "chartFamily", "counterweightT", "outriggerLengthM", "outriggerWidthM", "slewRange",
  "boomType", "mainBoomLengthM", "flyJibFitted", "flyJibType", "flyJibLengthM",
  "flyJibAngleMode", "flyJibAngleDeg", "flyJibAngleMinDeg", "flyJibAngleMaxDeg",
  "boomExtensionM", "telescopeConfiguration", "configurationCode", "manufacturerChartId", "craneModel",
  "windSpeedMps", "reeving", "singleHookBlock", "manufacturerOptions",
] as const;

export type ChartDimension = typeof CHART_CONFIGURATION_DIMENSIONS[number];
export type ManufacturerChartConfiguration = Partial<Record<ChartDimension, string | number | boolean | null>> & Record<string, unknown>;
export type ChartConfigurationRecord = { id: string; crane_profile_id?: string; configuration_revision_id?: string | null; status?: string; manufacturer_configuration?: ManufacturerChartConfiguration | null };

function normalized(value: unknown): string {
  if (value === null || value === undefined || value === "") return "<none>";
  if (typeof value === "number") return Number.isFinite(value) ? String(Number(value.toFixed(6))) : "<invalid>";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return stableJson(value);
  return String(value).trim().toLocaleLowerCase("en-AU");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function chartDimensionValue(chart: ChartConfigurationRecord, dimension: ChartDimension): string {
  const configuration = chart.manufacturer_configuration ?? {};
  if (dimension === "flyJibFitted") {
    const explicit = configuration.flyJibFitted;
    if (typeof explicit === "boolean") return explicit ? "true" : "false";
    return configuration.flyJibType || configuration.flyJibLengthM != null || configuration.flyJibAngleDeg != null ? "true" : "false";
  }
  const value = configuration[dimension];
  if (value === null || value === undefined || value === "") return "<none>";
  if (typeof value === "number") return Number.isFinite(value) ? String(Number(value.toFixed(6))) : "<invalid>";
  if (typeof value === "object") return stableJson(value);
  return String(value).trim();
}

export function exactChartConfigurationKey(configuration: ManufacturerChartConfiguration): string {
  const dimensions = Object.fromEntries(CHART_CONFIGURATION_DIMENSIONS.map((key) => [key, normalized(key === "flyJibFitted" && configuration[key] == null
    ? Boolean(configuration.flyJibType || configuration.flyJibLengthM != null || configuration.flyJibAngleDeg != null)
    : configuration[key])]));
  const additional = Object.fromEntries(Object.entries(configuration)
    .filter(([key]) => key !== "identityKey" && !CHART_CONFIGURATION_DIMENSIONS.includes(key as ChartDimension))
    .sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({ dimensions, additional });
}

export function chartConfigurationMatches(chart: ChartConfigurationRecord, expected: ManufacturerChartConfiguration): boolean {
  return exactChartConfigurationKey(chart.manufacturer_configuration ?? {}) === exactChartConfigurationKey(expected);
}

/** Facet options are derived only from charts that satisfy all earlier selections. */
export function chartFacetOptions(
  charts: ChartConfigurationRecord[],
  dimension: ChartDimension,
  selected: Partial<Record<ChartDimension, string>>,
  craneProfileId?: string,
  configurationRevisionId?: string,
): string[] {
  const position = CHART_CONFIGURATION_DIMENSIONS.indexOf(dimension);
  const rows = charts.filter((chart) => (!craneProfileId || chart.crane_profile_id === craneProfileId) &&
    (!configurationRevisionId || chart.configuration_revision_id === configurationRevisionId) &&
    chart.status !== "Superseded" &&
    CHART_CONFIGURATION_DIMENSIONS.slice(0, position).every((previous) => !selected[previous] || normalized(chartDimensionValue(chart, previous)) === normalized(selected[previous])));
  return [...new Set(rows.map((chart) => chartDimensionValue(chart, dimension)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function clearDownstreamChartSelections<T extends Partial<Record<ChartDimension, string>>>(
  selected: T,
  changedDimension: ChartDimension,
): T {
  const position = CHART_CONFIGURATION_DIMENSIONS.indexOf(changedDimension);
  const next = { ...selected };
  for (const dimension of CHART_CONFIGURATION_DIMENSIONS.slice(position + 1)) delete next[dimension];
  return next;
}

export function selectNextChartPoint<T extends { radiusM: number; capacityT: number }>(points: T[], requiredRadiusM: number): T | null {
  if (!Number.isFinite(requiredRadiusM) || requiredRadiusM < 0) throw new Error("Required radius must be a non-negative number.");
  return points.filter((point) => point.radiusM >= requiredRadiusM).sort((a, b) => a.radiusM - b.radiusM)[0] ?? null;
}

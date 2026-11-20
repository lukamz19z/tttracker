import type { LoadChartPoint } from "../types.ts";

/** Select the next available manufacturer radius at or above the requirement; never interpolate. */
export function selectConservativeChartPoint(points: LoadChartPoint[], requiredRadiusM: number, configurationKey: string) {
  if (!Number.isFinite(requiredRadiusM) || requiredRadiusM < 0) throw new Error("Required radius must be non-negative.");
  return points
    .filter((point) => point.configurationKey === configurationKey && point.radiusM >= requiredRadiusM)
    .sort((a, b) => a.radiusM - b.radiusM)[0] ?? null;
}

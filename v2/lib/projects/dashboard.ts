import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { aggregateMhPerTonne } from "@/lib/dockets/calculations";

function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

export type ProjectDashboardData = {
  towerCount: number;
  completeCount: number;
  inProgressCount: number;
  notStartedCount: number;
  assemblyAverage: number;
  erectionAverage: number;
  overallProgress: number;
  totalWeight: number;
  completedTonnes: number;
  openDefects: number;
  totalDefects: number;
  totalDockets: number;
  rawHours: number;
  productionHours: number;
  earnedTonnes: number;
  rawMhPerTonne: number | null;
  productionMhPerTonne: number | null;
  latestDocketDate: string | null;
};

export async function getProjectDashboardData(
  projectId: string,
): Promise<ProjectDashboardData> {
  const admin = createSupabaseAdmin();

  const [
    { data: towers, error: towerError },
    { data: dockets, error: docketError },
    { data: defects, error: defectError },
    { data: profile, error: profileError },
  ] = await Promise.all([
    admin
      .from("v2_towers")
      .select(`
        id,
        tower_weight_t,
        assembly_percent,
        erection_percent
      `)
      .eq("project_id", projectId),

    admin
      .from("v2_daily_dockets")
      .select(`
        id,
        docket_date,
        raw_manhours,
        production_manhours
      `)
      .eq("project_id", projectId)
      .order("docket_date", {
        ascending: false,
      }),

    admin
      .from("v2_defects")
      .select("id, status")
      .eq("project_id", projectId),

    admin
      .from("v2_project_progress_profiles")
      .select("assembly_share, erection_share")
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);

  if (towerError) {
    throw new Error(towerError.message);
  }

  if (docketError) {
    throw new Error(docketError.message);
  }

  if (defectError) {
    throw new Error(defectError.message);
  }

  if (profileError) {
    throw new Error(profileError.message);
  }

  const phaseTotal =
    Math.max(0, n(profile?.assembly_share, 50)) +
    Math.max(0, n(profile?.erection_share, 50));

  const assemblyFraction =
    phaseTotal > 0
      ? Math.max(0, n(profile?.assembly_share, 50)) / phaseTotal
      : 0.5;

  const erectionFraction =
    phaseTotal > 0
      ? Math.max(0, n(profile?.erection_share, 50)) / phaseTotal
      : 0.5;

  const docketIds =
    (dockets ?? []).map(
      (docket) => docket.id,
    );

  const { data: allocations, error: allocationError } =
    docketIds.length > 0
      ? await admin
          .from("v2_docket_tower_allocations")
          .select(`
            docket_id,
            raw_hours,
            production_hours,
            earned_tonnes
          `)
          .in("docket_id", docketIds)
      : { data: [], error: null };

  if (allocationError) {
    throw new Error(allocationError.message);
  }

  let completeCount = 0;
  let inProgressCount = 0;
  let notStartedCount = 0;
  let assemblyTotal = 0;
  let erectionTotal = 0;
  let totalWeight = 0;
  let completedTonnes = 0;

  for (const tower of towers ?? []) {
    const assembly = Math.max(
      0,
      Math.min(
        100,
        n(tower.assembly_percent),
      ),
    );

    const erection = Math.max(
      0,
      Math.min(
        100,
        n(tower.erection_percent),
      ),
    );

    const overall =
      assembly * assemblyFraction +
      erection * erectionFraction;

    const weight = n(
      tower.tower_weight_t,
    );

    assemblyTotal += assembly;
    erectionTotal += erection;
    totalWeight += weight;
    completedTonnes +=
      weight * (overall / 100);

    if (overall >= 100) {
      completeCount += 1;
    } else if (overall > 0) {
      inProgressCount += 1;
    } else {
      notStartedCount += 1;
    }
  }

  const towerCount =
    (towers ?? []).length;

  const assemblyAverage =
    towerCount > 0
      ? assemblyTotal /
        towerCount
      : 0;

  const erectionAverage =
    towerCount > 0
      ? erectionTotal /
        towerCount
      : 0;

  const overallProgress =
    totalWeight > 0
      ? (completedTonnes /
          totalWeight) *
        100
      : towerCount > 0
        ? assemblyAverage * assemblyFraction +
          erectionAverage * erectionFraction
        : 0;

  const mhT =
    aggregateMhPerTonne(
      (allocations ?? []).map(
        (row) => ({
          rawHours: n(
            row.raw_hours,
          ),
          productionHours: n(
            row.production_hours,
          ),
          earnedTonnes: n(
            row.earned_tonnes,
          ),
        }),
      ),
    );

  const closedStatuses =
    new Set([
      "closed",
      "resolved",
      "completed",
    ]);

  const openDefects =
    (defects ?? []).filter(
      (defect) =>
        !closedStatuses.has(
          String(
            defect.status ?? "",
          ).toLowerCase(),
        ),
    ).length;

  return {
    towerCount,
    completeCount,
    inProgressCount,
    notStartedCount,
    assemblyAverage,
    erectionAverage,
    overallProgress,
    totalWeight,
    completedTonnes,
    openDefects,
    totalDefects:
      (defects ?? []).length,
    totalDockets:
      (dockets ?? []).length,
    rawHours: mhT.rawHours,
    productionHours:
      mhT.productionHours,
    earnedTonnes:
      mhT.earnedTonnes,
    rawMhPerTonne:
      mhT.rawMhPerTonne,
    productionMhPerTonne:
      mhT.productionMhPerTonne,
    latestDocketDate:
      dockets?.[0]?.docket_date ??
      null,
  };
}

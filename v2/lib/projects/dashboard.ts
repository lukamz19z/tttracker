import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";

function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

async function firstSuccessfulSelect<T>(
  candidates: Array<() => PromiseLike<{ data: unknown; error: unknown }>>,
): Promise<T[]> {
  for (const candidate of candidates) {
    try {
      const result = await candidate();
      if (!result.error && Array.isArray(result.data)) {
        return result.data as T[];
      }
    } catch {
      // Try next compatible source.
    }
  }
  return [];
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
  rawMhPerTonne: number | null;
  productionMhPerTonne: number | null;
  latestDocketDate: string | null;
};

type DocketRow = {
  tower_id?: string | null;
  docket_date?: string | null;
  assembly_percent?: number | null;
  erection_percent?: number | null;
  raw_manhours?: number | null;
  production_manhours?: number | null;
};

type DefectRow = {
  status?: string | null;
};

export async function getProjectDashboardData(
  projectId: string,
): Promise<ProjectDashboardData> {
  const admin = createSupabaseAdmin();

  const { data: towersData, error: towerError } =
    await admin
      .from("v2_towers")
      .select(`
        id,
        tower_weight_t,
        assembly_percent,
        erection_percent
      `)
      .eq("project_id", projectId);

  if (towerError) {
    throw new Error(towerError.message);
  }

  const dockets =
    await firstSuccessfulSelect<DocketRow>([
      () =>
        admin
          .from("v2_tower_daily_dockets")
          .select(`
            tower_id,
            docket_date,
            assembly_percent,
            erection_percent,
            raw_manhours,
            production_manhours
          `)
          .eq("project_id", projectId),
      () =>
        admin
          .from("tower_daily_dockets")
          .select(`
            tower_id,
            docket_date,
            assembly_percent,
            erection_percent,
            raw_manhours,
            production_manhours
          `)
          .eq("project_id", projectId),
    ]);

  const towerIds =
    (towersData ?? []).map(
      (tower) => tower.id,
    );

  const defects =
    towerIds.length > 0
      ? await firstSuccessfulSelect<DefectRow>([
          () =>
            admin
              .from("v2_tower_defects")
              .select("status")
              .in("tower_id", towerIds),
          () =>
            admin
              .from("tower_defects")
              .select("status")
              .in("tower_id", towerIds),
        ])
      : [];

  const liveByTower = new Map<
    string,
    {
      assembly: number;
      erection: number;
    }
  >();

  for (const docket of dockets) {
    if (!docket.tower_id) continue;

    const existing =
      liveByTower.get(
        docket.tower_id,
      ) ?? {
        assembly: 0,
        erection: 0,
      };

    liveByTower.set(
      docket.tower_id,
      {
        assembly: Math.max(
          existing.assembly,
          n(docket.assembly_percent),
        ),
        erection: Math.max(
          existing.erection,
          n(docket.erection_percent),
        ),
      },
    );
  }

  let completeCount = 0;
  let inProgressCount = 0;
  let notStartedCount = 0;
  let assemblyTotal = 0;
  let erectionTotal = 0;
  let totalWeight = 0;
  let completedTonnes = 0;

  for (const tower of towersData ?? []) {
    const live = liveByTower.get(
      tower.id,
    );

    const assembly = clamp(
      live?.assembly ??
        n(tower.assembly_percent),
    );

    const erection = clamp(
      live?.erection ??
        n(tower.erection_percent),
    );

    const progress =
      (assembly + erection) / 2;

    const weight = n(
      tower.tower_weight_t,
    );

    assemblyTotal += assembly;
    erectionTotal += erection;
    totalWeight += weight;
    completedTonnes +=
      weight * (progress / 100);

    if (progress >= 100) {
      completeCount += 1;
    } else if (progress > 0) {
      inProgressCount += 1;
    } else {
      notStartedCount += 1;
    }
  }

  const towerCount =
    (towersData ?? []).length;

  const assemblyAverage =
    towerCount > 0
      ? assemblyTotal / towerCount
      : 0;

  const erectionAverage =
    towerCount > 0
      ? erectionTotal / towerCount
      : 0;

  const overallProgress =
    totalWeight > 0
      ? (completedTonnes / totalWeight) *
        100
      : towerCount > 0
        ? (assemblyAverage +
            erectionAverage) /
          2
        : 0;

  const rawHours = dockets.reduce(
    (sum, docket) =>
      sum +
      n(docket.raw_manhours),
    0,
  );

  const productionHours =
    dockets.reduce(
      (sum, docket) =>
        sum +
        n(
          docket.production_manhours,
          n(docket.raw_manhours),
        ),
      0,
    );

  const latestDocketDate =
    dockets
      .map(
        (docket) =>
          docket.docket_date,
      )
      .filter(
        (value): value is string =>
          Boolean(value),
      )
      .sort((a, b) =>
        b.localeCompare(a),
      )[0] ?? null;

  const isOpen = (status: unknown) => {
    const value = String(
      status ?? "",
    )
      .trim()
      .toLowerCase();

    return ![
      "closed",
      "complete",
      "completed",
      "resolved",
    ].includes(value);
  };

  const openDefects =
    defects.filter((defect) =>
      isOpen(defect.status),
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
    totalDefects: defects.length,
    totalDockets: dockets.length,
    rawHours,
    productionHours,
    rawMhPerTonne:
      completedTonnes > 0
        ? rawHours /
          completedTonnes
        : null,
    productionMhPerTonne:
      completedTonnes > 0
        ? productionHours /
          completedTonnes
        : null,
    latestDocketDate,
  };
}

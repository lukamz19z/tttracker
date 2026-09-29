import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";

type DocketRow = {
  id?: string;
  tower_id?: string | null;
  docket_date?: string | null;
  crew?: string | null;
  leading_hand?: string | null;
  assembly_percent?: number | null;
  erection_percent?: number | null;
  raw_manhours?: number | null;
  production_manhours?: number | null;
};

type TowerRow = {
  id: string;
  tower_identifier: string;
  tower_weight_t?: number | null;
  tower_type_id?: string | null;
  v2_tower_types?:
    | {
        name?: string | null;
        type_code?: string | null;
      }
    | Array<{
        name?: string | null;
        type_code?: string | null;
      }>
    | null;
};

function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function progressOf(row: DocketRow) {
  return clamp(
    (n(row.assembly_percent) +
      n(row.erection_percent)) /
      2,
  );
}

function towerTypeName(
  tower: TowerRow,
) {
  const relation = Array.isArray(
    tower.v2_tower_types,
  )
    ? tower.v2_tower_types[0]
    : tower.v2_tower_types;

  return (
    relation?.type_code ||
    relation?.name ||
    "Unclassified"
  );
}

async function loadDockets(
  projectId: string,
): Promise<DocketRow[]> {
  const admin = createSupabaseAdmin();

  try {
    const actuals = await admin
      .from("v2_project_production_actuals")
      .select(`
        id,
        tower_id,
        actual_date,
        crew_label,
        assembly_percent,
        erection_percent,
        raw_hours,
        production_hours
      `)
      .eq("project_id", projectId)
      .order("actual_date");

    if (
      !actuals.error &&
      (actuals.data?.length ?? 0) > 0
    ) {
      return (actuals.data ?? []).map(
        (row) => ({
          id: row.id,
          tower_id: row.tower_id,
          docket_date:
            row.actual_date,
          crew:
            row.crew_label,
          leading_hand: null,
          assembly_percent:
            row.assembly_percent,
          erection_percent:
            row.erection_percent,
          raw_manhours:
            row.raw_hours,
          production_manhours:
            row.production_hours,
        }),
      );
    }
  } catch {
    // Fall back to operational docket sources until all modules write actuals.
  }

  const candidates = [
    "v2_tower_daily_dockets",
    "tower_daily_dockets",
  ];

  for (const table of candidates) {
    try {
      const result = await admin
        .from(table)
        .select(`
          id,
          tower_id,
          docket_date,
          crew,
          leading_hand,
          assembly_percent,
          erection_percent,
          raw_manhours,
          production_manhours
        `)
        .eq("project_id", projectId);

      if (!result.error) {
        return (
          (result.data as DocketRow[] | null) ??
          []
        );
      }
    } catch {
      // Try next compatible source.
    }
  }

  return [];
}

export type CrewPerformanceRow = {
  crew: string;
  docketCount: number;
  towersTouched: number;
  completedTowers: number;
  rawHours: number;
  productionHours: number;
  productionTonnes: number;
  rawMhPerTonne: number | null;
  productionMhPerTonne: number | null;
  tonnesPerProductionHour: number | null;
  firstDate: string | null;
  lastDate: string | null;
};

export type TrendPoint = {
  date: string;
  rawMhPerTonne: number | null;
  productionMhPerTonne: number | null;
  productionTonnes: number;
  rawHours: number;
  productionHours: number;
  docketCount: number;
};

export type TowerForecastRow = {
  towerId: string;
  towerIdentifier: string;
  towerType: string;
  progress: number;
  weight: number | null;
  remainingTonnes: number | null;
  benchmark: string;
  forecastRawHours: number | null;
  forecastDays: number | null;
  confidence: "High" | "Medium" | "Low";
};

export type ForecastingData = {
  crews: CrewPerformanceRow[];
  trends: TrendPoint[];
  forecasts: TowerForecastRow[];
  projectRawMhPerTonne: number | null;
  projectProductionMhPerTonne: number | null;
  projectAverageDailyRawHours: number | null;
  dataAvailable: boolean;
};

export async function getForecastingData(
  projectId: string,
  options?: {
    startDate?: string | null;
    endDate?: string | null;
  },
): Promise<ForecastingData> {
  const admin = createSupabaseAdmin();

  const { data: towerData, error } =
    await admin
      .from("v2_towers")
      .select(`
        id,
        tower_identifier,
        tower_weight_t,
        tower_type_id,
        v2_tower_types (
          name,
          type_code
        )
      `)
      .eq("project_id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  const towers =
    (towerData as TowerRow[] | null) ??
    [];

  const towerById = new Map(
    towers.map((tower) => [
      tower.id,
      tower,
    ]),
  );

  let dockets =
    await loadDockets(projectId);

  if (options?.startDate) {
    dockets = dockets.filter(
      (row) =>
        !row.docket_date ||
        row.docket_date >=
          options.startDate!,
    );
  }

  if (options?.endDate) {
    dockets = dockets.filter(
      (row) =>
        !row.docket_date ||
        row.docket_date <=
          options.endDate!,
    );
  }

  const byTower = new Map<
    string,
    DocketRow[]
  >();

  for (const docket of dockets) {
    if (!docket.tower_id) continue;

    const rows =
      byTower.get(docket.tower_id) ??
      [];

    rows.push(docket);
    byTower.set(
      docket.tower_id,
      rows,
    );
  }

  const crewWork = new Map<
    string,
    CrewPerformanceRow & {
      towerIds: Set<string>;
      completeIds: Set<string>;
    }
  >();

  const typeWork = new Map<
    string,
    {
      rawHours: number;
      productionHours: number;
      tonnes: number;
      dockets: number;
      towerIds: Set<string>;
      rawByDate: Map<string, number>;
    }
  >();

  const trendWork = new Map<
    string,
    {
      rawHours: number;
      productionHours: number;
      tonnes: number;
      docketCount: number;
    }
  >();

  let totalRawHours = 0;
  let totalProductionHours = 0;
  let totalProductionTonnes = 0;

  const rawByDate =
    new Map<string, number>();

  const currentProgressByTower =
    new Map<string, number>();

  for (
    const [towerId, towerDockets] of
    byTower.entries()
  ) {
    const tower = towerById.get(towerId);
    if (!tower) continue;

    const weight = n(
      tower.tower_weight_t,
    );

    let previousProgress = 0;

    const sorted = [...towerDockets].sort(
      (a, b) =>
        String(a.docket_date ?? "").localeCompare(
          String(b.docket_date ?? ""),
        ),
    );

    for (const docket of sorted) {
      const progress =
        progressOf(docket);

      const delta = Math.max(
        0,
        progress - previousProgress,
      );

      const tonnes =
        weight > 0
          ? weight * (delta / 100)
          : 0;

      const rawHours = n(
        docket.raw_manhours,
      );

      const productionHours = n(
        docket.production_manhours,
        rawHours,
      );

      const crew =
        String(
          docket.crew ||
            docket.leading_hand ||
            "Unassigned",
        ).trim() || "Unassigned";

      const existing =
        crewWork.get(crew) ?? {
          crew,
          docketCount: 0,
          towersTouched: 0,
          completedTowers: 0,
          rawHours: 0,
          productionHours: 0,
          productionTonnes: 0,
          rawMhPerTonne: null,
          productionMhPerTonne: null,
          tonnesPerProductionHour: null,
          firstDate: null,
          lastDate: null,
          towerIds: new Set<string>(),
          completeIds: new Set<string>(),
        };

      existing.docketCount += 1;
      existing.rawHours += rawHours;
      existing.productionHours +=
        productionHours;
      existing.productionTonnes +=
        tonnes;
      existing.towerIds.add(towerId);

      if (progress >= 100) {
        existing.completeIds.add(
          towerId,
        );
      }

      if (docket.docket_date) {
        if (
          !existing.firstDate ||
          docket.docket_date <
            existing.firstDate
        ) {
          existing.firstDate =
            docket.docket_date;
        }

        if (
          !existing.lastDate ||
          docket.docket_date >
            existing.lastDate
        ) {
          existing.lastDate =
            docket.docket_date;
        }

        rawByDate.set(
          docket.docket_date,
          (rawByDate.get(
            docket.docket_date,
          ) ?? 0) + rawHours,
        );

        const trend =
          trendWork.get(
            docket.docket_date,
          ) ?? {
            rawHours: 0,
            productionHours: 0,
            tonnes: 0,
            docketCount: 0,
          };

        trend.rawHours += rawHours;
        trend.productionHours +=
          productionHours;
        trend.tonnes += tonnes;
        trend.docketCount += 1;

        trendWork.set(
          docket.docket_date,
          trend,
        );
      }

      crewWork.set(crew, existing);

      const type =
        towerTypeName(tower);

      const typeRow =
        typeWork.get(type) ?? {
          rawHours: 0,
          productionHours: 0,
          tonnes: 0,
          dockets: 0,
          towerIds: new Set<string>(),
          rawByDate:
            new Map<string, number>(),
        };

      typeRow.rawHours += rawHours;
      typeRow.productionHours +=
        productionHours;
      typeRow.tonnes += tonnes;
      typeRow.dockets += 1;
      typeRow.towerIds.add(towerId);

      if (docket.docket_date) {
        typeRow.rawByDate.set(
          docket.docket_date,
          (typeRow.rawByDate.get(
            docket.docket_date,
          ) ?? 0) + rawHours,
        );
      }

      typeWork.set(type, typeRow);

      totalRawHours += rawHours;
      totalProductionHours +=
        productionHours;
      totalProductionTonnes +=
        tonnes;

      previousProgress = Math.max(
        previousProgress,
        progress,
      );
    }

    currentProgressByTower.set(
      towerId,
      previousProgress,
    );
  }

  const crews = Array.from(
    crewWork.values(),
  )
    .map((row) => ({
      crew: row.crew,
      docketCount: row.docketCount,
      towersTouched: row.towerIds.size,
      completedTowers:
        row.completeIds.size,
      rawHours: row.rawHours,
      productionHours:
        row.productionHours,
      productionTonnes:
        row.productionTonnes,
      rawMhPerTonne:
        row.productionTonnes > 0
          ? row.rawHours /
            row.productionTonnes
          : null,
      productionMhPerTonne:
        row.productionTonnes > 0
          ? row.productionHours /
            row.productionTonnes
          : null,
      tonnesPerProductionHour:
        row.productionHours > 0
          ? row.productionTonnes /
            row.productionHours
          : null,
      firstDate: row.firstDate,
      lastDate: row.lastDate,
    }))
    .sort((a, b) => {
      if (
        a.productionMhPerTonne ===
        null
      )
        return 1;

      if (
        b.productionMhPerTonne ===
        null
      )
        return -1;

      return (
        a.productionMhPerTonne -
        b.productionMhPerTonne
      );
    });

  const trends = Array.from(
    trendWork.entries(),
  )
    .map(([date, row]) => ({
      date,
      rawMhPerTonne:
        row.tonnes > 0
          ? row.rawHours / row.tonnes
          : null,
      productionMhPerTonne:
        row.tonnes > 0
          ? row.productionHours /
            row.tonnes
          : null,
      productionTonnes: row.tonnes,
      rawHours: row.rawHours,
      productionHours:
        row.productionHours,
      docketCount: row.docketCount,
    }))
    .sort((a, b) =>
      a.date.localeCompare(b.date),
    );

  const dailyValues = Array.from(
    rawByDate.values(),
  );

  const projectAverageDailyRawHours =
    dailyValues.length > 0
      ? dailyValues.reduce(
          (sum, value) =>
            sum + value,
          0,
        ) / dailyValues.length
      : null;

  const projectRawMhPerTonne =
    totalProductionTonnes > 0
      ? totalRawHours /
        totalProductionTonnes
      : null;

  const projectProductionMhPerTonne =
    totalProductionTonnes > 0
      ? totalProductionHours /
        totalProductionTonnes
      : null;

  const forecasts: TowerForecastRow[] =
    towers
      .map((tower) => {
        const progress =
          currentProgressByTower.get(
            tower.id,
          ) ?? 0;

        const weightValue =
          tower.tower_weight_t ===
            null ||
          tower.tower_weight_t ===
            undefined
            ? null
            : n(
                tower.tower_weight_t,
              );

        const type =
          towerTypeName(tower);

        const typeBenchmark =
          typeWork.get(type);

        const typeMh =
          typeBenchmark &&
          typeBenchmark.tonnes > 0
            ? typeBenchmark.rawHours /
              typeBenchmark.tonnes
            : null;

        const typeDaily =
          typeBenchmark &&
          typeBenchmark.rawByDate.size >
            0
            ? Array.from(
                typeBenchmark.rawByDate.values(),
              ).reduce(
                (sum, value) =>
                  sum + value,
                0,
              ) /
              typeBenchmark.rawByDate.size
            : null;

        const benchmarkMh =
          typeMh ??
          projectRawMhPerTonne;

        const dailyHours =
          typeDaily ??
          projectAverageDailyRawHours;

        const remainingTonnes =
          weightValue !== null
            ? weightValue *
              ((100 - progress) /
                100)
            : null;

        const forecastRawHours =
          remainingTonnes !== null &&
          benchmarkMh !== null
            ? remainingTonnes *
              benchmarkMh
            : null;

        const forecastDays =
          forecastRawHours !== null &&
          dailyHours !== null &&
          dailyHours > 0
            ? forecastRawHours /
              dailyHours
            : null;

        const confidence:
          | "High"
          | "Medium"
          | "Low" =
          typeBenchmark &&
          typeBenchmark.dockets >= 5 &&
          typeBenchmark.towerIds.size >=
            2
            ? "High"
            : benchmarkMh !== null &&
                dailyHours !== null
              ? "Medium"
              : "Low";

        return {
          towerId: tower.id,
          towerIdentifier:
            tower.tower_identifier,
          towerType: type,
          progress,
          weight: weightValue,
          remainingTonnes,
          benchmark:
            typeMh !== null
              ? `${type} actuals`
              : "Project actuals",
          forecastRawHours,
          forecastDays,
          confidence,
        };
      })
      .filter(
        (row) => row.progress < 100,
      )
      .sort((a, b) => {
        const ad =
          a.forecastDays ??
          Number.MAX_VALUE;
        const bd =
          b.forecastDays ??
          Number.MAX_VALUE;

        return ad - bd;
      });

  return {
    crews,
    trends,
    forecasts,
    projectRawMhPerTonne,
    projectProductionMhPerTonne,
    projectAverageDailyRawHours,
    dataAvailable:
      dockets.length > 0,
  };
}

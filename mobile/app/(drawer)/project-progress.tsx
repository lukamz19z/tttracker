import { router, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Gauge,
  PackageCheck,
  RadioTower,
  RefreshCw,
  Scale,
} from "lucide-react-native";

import {
  type MobileRole,
  useAuth,
} from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

type ProjectRow = {
  id: string;
  name: string;
  status?: string | null;
  client?: string | null;
  location?: string | null;
  project_number?: string | null;
};

type Tower = {
  id: string;
  project_id: string;
  name?: string | null;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
  tower_number?: string | null;
  structure_number?: string | null;
  tower_no?: string | null;
  extra_data?: Record<string, unknown> | null;
};

type DocketRow = {
  id: string;
  tower_id?: string | null;
  project_id?: string | null;
  docket_date?: string | null;
  assembly_percent?: number | null;
  erection_percent?: number | null;
  crew?: string | null;
  leading_hand?: string | null;
  raw_manhours?: number | null;
  production_manhours?: number | null;
};

type LabourRow = {
  docket_id: string;
  total_hours?: number | null;
  production_hours?: number | null;
};

type DefectRow = {
  id: string;
  tower_id?: string | null;
  status?: string | null;
};

type DeliveryRow = {
  id: string;
  tower_id?: string | null;
  [key: string]: unknown;
};

type DeliveryItemRow = {
  delivery_id?: string | null;
  qty_delivered?: number | null;
  quantity_delivered?: number | null;
  delivered_qty?: number | null;
  qty?: number | null;
  [key: string]: unknown;
};

type MaterialBundleRow = {
  tower_id?: string | null;
  qty_required?: number | null;
  required_qty?: number | null;
  [key: string]: unknown;
};

type TowerSummary = Tower & {
  computedProgress: number;
  computedWeight: number | null;
  completedTonnes: number | null;
  rawHours: number;
  productionHours: number;
  rawMhPerTonne: number | null;
  productionMhPerTonne: number | null;
  deliveryPercent: number;
  requiredQty: number;
  deliveredQty: number;
  outstandingQty: number;
};

type CrewSummary = {
  name: string;
  dockets: number;
  rawHours: number;
  productionHours: number;
  productionTonnes: number;
  rawMhPerTonne: number | null;
  productionMhPerTonne: number | null;
  towersTouched: number;
  towersComplete: number;
};

type ProjectStats = {
  totalTowers: number;
  towersComplete: number;
  towersInProgress: number;
  towersNotStarted: number;
  totalDockets: number;
  latestDocketDate: string | null;
  totalRawHours: number;
  totalProductionHours: number;
  totalTowerWeight: number | null;
  completedTonnes: number | null;
  rawMhPerTonne: number | null;
  productionMhPerTonne: number | null;
  overallProgress: number;
  openDefects: number;
  totalDefects: number;
  totalDeliveries: number;
  totalRequiredQty: number;
  deliveredQty: number;
  outstandingQty: number;
  deliveryPercent: number;
  deliveryTowersInProgress: number;
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeString(value: unknown, fallback = "") {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
}

function extractNumericValue(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : null;
  }

  const match = String(value)
    .replace(/,/g, "")
    .match(/-?\d+(\.\d+)?/);

  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function formatNumber(
  value: number | null,
  decimals = 0,
) {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return value.toFixed(decimals);
}

function formatDate(
  value: string | null | undefined,
) {
  if (!value) {
    return "No dockets";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "No dockets";
  }

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getTowerDisplayName(
  tower: Tower,
) {
  return (
    tower.tower_number ||
    tower.structure_number ||
    tower.tower_no ||
    tower.name ||
    "Unnamed Tower"
  );
}

function getTowerWeight(
  extraData?: Record<string, unknown> | null,
) {
  if (!extraData) {
    return null;
  }

  const entries = Object.entries(extraData);

  const exact = entries.find(([key]) => {
    const value = key
      .trim()
      .toLowerCase();

    return (
      value === "tower weight" ||
      value === "tower weight (t)" ||
      value === "tower_weight" ||
      value === "towerweight" ||
      value === "structure total weights" ||
      value === "structure total weight"
    );
  });

  if (exact) {
    return extractNumericValue(exact[1]);
  }

  const similar = entries.find(([key]) => {
    const value = key
      .trim()
      .toLowerCase();

    return (
      (
        value.includes("tower") ||
        value.includes("structure")
      ) &&
      value.includes("weight")
    );
  });

  if (similar) {
    return extractNumericValue(similar[1]);
  }

  const generic = entries.find(([key]) =>
    key
      .trim()
      .toLowerCase()
      .includes("weight"),
  );

  return generic
    ? extractNumericValue(generic[1])
    : null;
}

function getTowerType(
  tower: Tower,
) {
  if (tower.extra_data) {
    const entry = Object.entries(
      tower.extra_data,
    ).find(([key]) => {
      const value = key
        .trim()
        .toLowerCase();

      return [
        "tower type",
        "tower_type",
        "structure type",
        "structure_type",
        "tower model",
        "tower_model",
        "type",
      ].includes(value);
    });

    if (entry) {
      const value = safeString(
        entry[1],
      ).trim();

      if (value) {
        return value.toUpperCase();
      }
    }
  }

  const text = [
    getTowerDisplayName(tower),
    tower.name,
    tower.structure_number,
    tower.tower_number,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  return (
    text.match(/\b\d+[A-Z]{2}\b/)?.[0] ??
    "TYPE NOT SET"
  );
}

function getDocketProgress(
  docket: DocketRow,
) {
  const assembly = safeNumber(
    docket.assembly_percent,
  );

  const erection = safeNumber(
    docket.erection_percent,
  );

  return clampPercent(
    Math.round(
      assembly * 0.5 +
        erection * 0.5,
    ),
  );
}

function getTowerProgress(
  tower: Tower,
  dockets: DocketRow[],
) {
  const related = dockets.filter(
    (docket) =>
      docket.tower_id === tower.id,
  );

  if (related.length === 0) {
    return clampPercent(
      safeNumber(tower.progress),
    );
  }

  return related.reduce(
    (maximum, docket) =>
      Math.max(
        maximum,
        getDocketProgress(docket),
      ),
    0,
  );
}

function getRequiredQty(
  row: MaterialBundleRow,
) {
  return safeNumber(
    row.qty_required ??
      row.required_qty,
  );
}

function getDeliveredQty(
  row: DeliveryItemRow,
) {
  return safeNumber(
    row.qty_delivered ??
      row.quantity_delivered ??
      row.delivered_qty ??
      row.qty,
  );
}

function canSeePerformance(
  role: MobileRole,
) {
  return (
    role === "admin" ||
    role === "leading_hand"
  );
}

function projectLabel(
  project: ProjectRow | null,
) {
  if (!project) {
    return "Project progress";
  }

  return project.project_number
    ? `${project.project_number} — ${project.name}`
    : project.name;
}

export default function ProjectProgressScreen() {
  const { profile } = useAuth();

  const role =
    profile?.mobileRole ?? "crew";

  const performanceVisible =
    canSeePerformance(role);

  const projectId =
    profile?.projectId ?? null;

  const [project, setProject] =
    useState<ProjectRow | null>(null);

  const [towers, setTowers] =
    useState<Tower[]>([]);

  const [dockets, setDockets] =
    useState<DocketRow[]>([]);

  const [labourRows, setLabourRows] =
    useState<LabourRow[]>([]);

  const [defects, setDefects] =
    useState<DefectRow[]>([]);

  const [deliveries, setDeliveries] =
    useState<DeliveryRow[]>([]);

  const [
    deliveryItems,
    setDeliveryItems,
  ] = useState<DeliveryItemRow[]>([]);

  const [
    materialBundles,
    setMaterialBundles,
  ] = useState<MaterialBundleRow[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<string | null>(null);

  const loadProjectProgress =
    useCallback(
      async (
        isRefresh = false,
      ) => {
        if (!projectId) {
          setProject(null);
          setTowers([]);
          setDockets([]);
          setLabourRows([]);
          setDefects([]);
          setDeliveries([]);
          setDeliveryItems([]);
          setMaterialBundles([]);
          setErrorMessage(null);
          setLoading(false);
          setRefreshing(false);
          return;
        }

        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setErrorMessage(null);

        try {
          const [
            projectResult,
            towersResult,
            docketsResult,
          ] = await Promise.all([
            supabase
              .from("projects")
              .select("*")
              .eq("id", projectId)
              .single(),

            supabase
              .from("towers")
              .select("*")
              .eq(
                "project_id",
                projectId,
              ),

            supabase
              .from(
                "tower_daily_dockets",
              )
              .select("*")
              .eq(
                "project_id",
                projectId,
              ),
          ]);

          if (projectResult.error) {
            throw projectResult.error;
          }

          if (towersResult.error) {
            throw towersResult.error;
          }

          if (docketsResult.error) {
            throw docketsResult.error;
          }

          const loadedProject =
            projectResult.data as ProjectRow;

          const loadedTowers =
            (
              towersResult.data ?? []
            ) as Tower[];

          const loadedDockets =
            (
              docketsResult.data ?? []
            ) as DocketRow[];

          const towerIds =
            loadedTowers.map(
              (tower) => tower.id,
            );

          const docketIds =
            loadedDockets.map(
              (docket) => docket.id,
            );

          let loadedLabourRows: LabourRow[] =
            [];

          let loadedDefects: DefectRow[] =
            [];

          let loadedDeliveries: DeliveryRow[] =
            [];

          let loadedDeliveryItems: DeliveryItemRow[] =
            [];

          let loadedMaterialBundles: MaterialBundleRow[] =
            [];

          if (docketIds.length > 0) {
            for (const table of [
              "tower_docket_labour",
              "tower_daily_docket_labour",
              "tower_daily_docket_labour_rows",
            ]) {
              const {
                data,
                error,
              } = await supabase
                .from(table)
                .select("*")
                .in(
                  "docket_id",
                  docketIds,
                );

              if (!error && data) {
                loadedLabourRows =
                  data as LabourRow[];

                break;
              }
            }
          }

          if (towerIds.length > 0) {
            const [
              defectsResult,
              materialsResult,
            ] = await Promise.all([
              supabase
                .from("tower_defects")
                .select("*")
                .in(
                  "tower_id",
                  towerIds,
                ),

              supabase
                .from(
                  "tower_required_bundles",
                )
                .select("*")
                .in(
                  "tower_id",
                  towerIds,
                ),
            ]);

            if (
              !defectsResult.error &&
              defectsResult.data
            ) {
              loadedDefects =
                defectsResult.data as DefectRow[];
            }

            if (
              !materialsResult.error &&
              materialsResult.data
            ) {
              loadedMaterialBundles =
                materialsResult.data as MaterialBundleRow[];
            }

            for (const table of [
              "tower_bundle_deliveries",
              "tower_deliveries",
            ]) {
              const {
                data,
                error,
              } = await supabase
                .from(table)
                .select("*")
                .in(
                  "tower_id",
                  towerIds,
                );

              if (!error && data) {
                loadedDeliveries =
                  data as DeliveryRow[];

                break;
              }
            }

            const deliveryIds =
              loadedDeliveries.map(
                (delivery) =>
                  delivery.id,
              );

            if (
              deliveryIds.length > 0
            ) {
              for (const table of [
                "tower_bundle_delivery_items",
                "tower_delivery_items",
                "tower_delivered_items",
              ]) {
                const {
                  data,
                  error,
                } = await supabase
                  .from(table)
                  .select("*")
                  .in(
                    "delivery_id",
                    deliveryIds,
                  );

                if (!error && data) {
                  loadedDeliveryItems =
                    data as DeliveryItemRow[];

                  break;
                }
              }
            }
          }

          loadedTowers.sort(
            (a, b) =>
              getTowerDisplayName(
                a,
              ).localeCompare(
                getTowerDisplayName(b),
                undefined,
                {
                  numeric: true,
                  sensitivity: "base",
                },
              ),
          );

          setProject(loadedProject);
          setTowers(loadedTowers);
          setDockets(loadedDockets);
          setLabourRows(
            loadedLabourRows,
          );
          setDefects(loadedDefects);
          setDeliveries(
            loadedDeliveries,
          );
          setDeliveryItems(
            loadedDeliveryItems,
          );
          setMaterialBundles(
            loadedMaterialBundles,
          );
        } catch (error) {
          console.error(
            "Project progress load failed:",
            error,
          );

          const message =
            error &&
            typeof error === "object" &&
            "message" in error &&
            typeof error.message ===
              "string"
              ? error.message
              : error instanceof Error
                ? error.message
                : "Unable to load project progress.";

          setErrorMessage(message);
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [projectId],
    );

  useEffect(() => {
    void loadProjectProgress();
  }, [loadProjectProgress]);

  const rawHoursByDocket =
    useMemo(() => {
      const map =
        new Map<string, number>();

      dockets.forEach(
        (docket) => {
          const raw = safeNumber(
            docket.raw_manhours,
            Number.NaN,
          );

          if (
            Number.isFinite(raw)
          ) {
            map.set(
              docket.id,
              raw,
            );
          }
        },
      );

      labourRows.forEach(
        (row) => {
          if (
            map.has(
              row.docket_id,
            )
          ) {
            return;
          }

          map.set(
            row.docket_id,
            (
              map.get(
                row.docket_id,
              ) ?? 0
            ) +
              safeNumber(
                row.total_hours,
              ),
          );
        },
      );

      return map;
    }, [dockets, labourRows]);

  const productionHoursByDocket =
    useMemo(() => {
      const map =
        new Map<string, number>();

      dockets.forEach(
        (docket) => {
          const production =
            safeNumber(
              docket.production_manhours,
              Number.NaN,
            );

          if (
            Number.isFinite(
              production,
            )
          ) {
            map.set(
              docket.id,
              production,
            );
          }
        },
      );

      labourRows.forEach(
        (row) => {
          if (
            map.has(
              row.docket_id,
            )
          ) {
            return;
          }

          map.set(
            row.docket_id,
            (
              map.get(
                row.docket_id,
              ) ?? 0
            ) +
              safeNumber(
                row.production_hours ??
                  row.total_hours,
              ),
          );
        },
      );

      return map;
    }, [dockets, labourRows]);

  const deliveryByTower =
    useMemo(() => {
      const map = new Map<
        string,
        {
          requiredQty: number;
          deliveredQty: number;
          outstandingQty: number;
          deliveryPercent: number;
        }
      >();

      towers.forEach(
        (tower) => {
          const requiredQty =
            materialBundles
              .filter(
                (bundle) =>
                  bundle.tower_id ===
                  tower.id,
              )
              .reduce(
                (
                  sum,
                  bundle,
                ) =>
                  sum +
                  getRequiredQty(
                    bundle,
                  ),
                0,
              );

          const towerDeliveryIds =
            new Set(
              deliveries
                .filter(
                  (delivery) =>
                    delivery.tower_id ===
                    tower.id,
                )
                .map(
                  (delivery) =>
                    delivery.id,
                ),
            );

          const deliveredQty =
            deliveryItems
              .filter(
                (item) =>
                  item.delivery_id &&
                  towerDeliveryIds.has(
                    item.delivery_id,
                  ),
              )
              .reduce(
                (
                  sum,
                  item,
                ) =>
                  sum +
                  getDeliveredQty(
                    item,
                  ),
                0,
              );

          const outstandingQty =
            Math.max(
              0,
              requiredQty -
                deliveredQty,
            );

          const deliveryPercent =
            requiredQty > 0
              ? clampPercent(
                  (
                    deliveredQty /
                    requiredQty
                  ) * 100,
                )
              : 0;

          map.set(
            tower.id,
            {
              requiredQty,
              deliveredQty,
              outstandingQty,
              deliveryPercent,
            },
          );
        },
      );

      return map;
    }, [
      towers,
      materialBundles,
      deliveries,
      deliveryItems,
    ]);

  const towerSummaries =
    useMemo<TowerSummary[]>(
      () => {
        return towers.map(
          (tower) => {
            const computedProgress =
              getTowerProgress(
                tower,
                dockets,
              );

            const computedWeight =
              getTowerWeight(
                tower.extra_data,
              );

            const completedTonnes =
              computedWeight &&
              computedWeight > 0
                ? computedWeight *
                  (
                    computedProgress /
                    100
                  )
                : null;

            const towerDocketIds =
              dockets
                .filter(
                  (docket) =>
                    docket.tower_id ===
                    tower.id,
                )
                .map(
                  (docket) =>
                    docket.id,
                );

            const rawHours =
              towerDocketIds.reduce(
                (
                  sum,
                  docketId,
                ) =>
                  sum +
                  (
                    rawHoursByDocket.get(
                      docketId,
                    ) ?? 0
                  ),
                0,
              );

            const productionHours =
              towerDocketIds.reduce(
                (
                  sum,
                  docketId,
                ) =>
                  sum +
                  (
                    productionHoursByDocket.get(
                      docketId,
                    ) ?? 0
                  ),
                0,
              );

            const delivery =
              deliveryByTower.get(
                tower.id,
              ) ?? {
                requiredQty: 0,
                deliveredQty: 0,
                outstandingQty: 0,
                deliveryPercent: 0,
              };

            return {
              ...tower,
              computedProgress,
              computedWeight,
              completedTonnes,
              rawHours,
              productionHours,

              rawMhPerTonne:
                completedTonnes &&
                completedTonnes > 0
                  ? rawHours /
                    completedTonnes
                  : null,

              productionMhPerTonne:
                completedTonnes &&
                completedTonnes > 0
                  ? productionHours /
                    completedTonnes
                  : null,

              ...delivery,
            };
          },
        );
      },
      [
        towers,
        dockets,
        rawHoursByDocket,
        productionHoursByDocket,
        deliveryByTower,
      ],
    );

  const stats =
    useMemo<ProjectStats>(
      () => {
        const totalTowers =
          towerSummaries.length;

        const towersComplete =
          towerSummaries.filter(
            (tower) =>
              tower.computedProgress >=
              100,
          ).length;

        const towersInProgress =
          towerSummaries.filter(
            (tower) =>
              tower.computedProgress >
                0 &&
              tower.computedProgress <
                100,
          ).length;

        const towersNotStarted =
          towerSummaries.filter(
            (tower) =>
              tower.computedProgress <=
              0,
          ).length;

        const totalRawHours =
          towerSummaries.reduce(
            (
              sum,
              tower,
            ) =>
              sum +
              tower.rawHours,
            0,
          );

        const totalProductionHours =
          towerSummaries.reduce(
            (
              sum,
              tower,
            ) =>
              sum +
              tower.productionHours,
            0,
          );

        const totalTowerWeightRaw =
          towerSummaries.reduce(
            (
              sum,
              tower,
            ) =>
              sum +
              safeNumber(
                tower.computedWeight,
              ),
            0,
          );

        const completedTonnesRaw =
          towerSummaries.reduce(
            (
              sum,
              tower,
            ) =>
              sum +
              safeNumber(
                tower.completedTonnes,
              ),
            0,
          );

        const totalTowerWeight =
          totalTowerWeightRaw > 0
            ? totalTowerWeightRaw
            : null;

        const completedTonnes =
          completedTonnesRaw > 0
            ? completedTonnesRaw
            : null;

        const overallProgress =
          totalTowerWeightRaw > 0
            ? clampPercent(
                (
                  completedTonnesRaw /
                  totalTowerWeightRaw
                ) * 100,
              )
            : totalTowers > 0
              ? clampPercent(
                  towerSummaries.reduce(
                    (
                      sum,
                      tower,
                    ) =>
                      sum +
                      tower.computedProgress,
                    0,
                  ) / totalTowers,
                )
              : 0;

        const openDefects =
          defects.filter(
            (defect) => {
              const status =
                safeString(
                  defect.status,
                )
                  .trim()
                  .toLowerCase();

              return ![
                "closed",
                "complete",
                "completed",
              ].includes(status);
            },
          ).length;

        const totalRequiredQty =
          towerSummaries.reduce(
            (
              sum,
              tower,
            ) =>
              sum +
              tower.requiredQty,
            0,
          );

        const deliveredQty =
          towerSummaries.reduce(
            (
              sum,
              tower,
            ) =>
              sum +
              tower.deliveredQty,
            0,
          );

        const outstandingQty =
          Math.max(
            0,
            totalRequiredQty -
              deliveredQty,
          );

        const deliveryPercent =
          totalRequiredQty > 0
            ? clampPercent(
                (
                  deliveredQty /
                  totalRequiredQty
                ) * 100,
              )
            : 0;

        const latestDocketDate =
          dockets
            .map(
              (docket) =>
                docket.docket_date,
            )
            .filter(
              (
                date,
              ): date is string =>
                Boolean(date),
            )
            .sort(
              (
                a,
                b,
              ) =>
                new Date(
                  b,
                ).getTime() -
                new Date(
                  a,
                ).getTime(),
            )[0] ?? null;

        return {
          totalTowers,
          towersComplete,
          towersInProgress,
          towersNotStarted,
          totalDockets:
            dockets.length,
          latestDocketDate,
          totalRawHours,
          totalProductionHours,
          totalTowerWeight,
          completedTonnes,

          rawMhPerTonne:
            completedTonnes &&
            completedTonnes > 0
              ? totalRawHours /
                completedTonnes
              : null,

          productionMhPerTonne:
            completedTonnes &&
            completedTonnes > 0
              ? totalProductionHours /
                completedTonnes
              : null,

          overallProgress,
          openDefects,
          totalDefects:
            defects.length,
          totalDeliveries:
            deliveries.length,
          totalRequiredQty,
          deliveredQty,
          outstandingQty,
          deliveryPercent,

          deliveryTowersInProgress:
            towerSummaries.filter(
              (tower) =>
                tower.deliveryPercent >
                  0 &&
                tower.deliveryPercent <
                  100,
            ).length,
        };
      },
      [
        towerSummaries,
        dockets,
        defects,
        deliveries,
      ],
    );

  const inProgressTowers =
    useMemo(
      () =>
        towerSummaries
          .filter(
            (tower) =>
              tower.computedProgress >
                0 &&
              tower.computedProgress <
                100,
          )
          .sort(
            (a, b) =>
              b.computedProgress -
              a.computedProgress,
          )
          .slice(0, 8),
      [towerSummaries],
    );

  const deliveryTowers =
    useMemo(
      () =>
        towerSummaries
          .filter(
            (tower) =>
              tower.deliveryPercent >
                0 &&
              tower.deliveryPercent <
                100,
          )
          .sort(
            (a, b) =>
              b.deliveryPercent -
              a.deliveryPercent,
          )
          .slice(0, 8),
      [towerSummaries],
    );

  const crewSummary =
    useMemo<CrewSummary[]>(
      () => {
        const towerById =
          new Map(
            towerSummaries.map(
              (tower) => [
                tower.id,
                tower,
              ],
            ),
          );

        const docketsByTower =
          new Map<
            string,
            DocketRow[]
          >();

        dockets.forEach(
          (docket) => {
            if (
              !docket.tower_id
            ) {
              return;
            }

            const current =
              docketsByTower.get(
                docket.tower_id,
              ) ?? [];

            current.push(docket);

            docketsByTower.set(
              docket.tower_id,
              current,
            );
          },
        );

        const rows =
          new Map<
            string,
            CrewSummary & {
              towerIds: Set<string>;
              completedTowerIds: Set<string>;
            }
          >();

        docketsByTower.forEach(
          (
            towerDockets,
            towerId,
          ) => {
            const tower =
              towerById.get(
                towerId,
              );

            const towerWeight =
              safeNumber(
                tower?.computedWeight,
              );

            let previousProgress =
              0;

            towerDockets
              .sort(
                (
                  a,
                  b,
                ) =>
                  new Date(
                    a.docket_date ??
                      "",
                  ).getTime() -
                  new Date(
                    b.docket_date ??
                      "",
                  ).getTime(),
              )
              .forEach(
                (docket) => {
                  const crewName =
                    safeString(
                      docket.crew ||
                        docket.leading_hand ||
                        "Unassigned Crew",
                    ).trim() ||
                    "Unassigned Crew";

                  const currentProgress =
                    getDocketProgress(
                      docket,
                    );

                  const progressDelta =
                    Math.max(
                      0,
                      currentProgress -
                        previousProgress,
                    );

                  const productionTonnes =
                    towerWeight > 0
                      ? towerWeight *
                        (
                          progressDelta /
                          100
                        )
                      : 0;

                  const rawHours =
                    rawHoursByDocket.get(
                      docket.id,
                    ) ?? 0;

                  const productionHours =
                    productionHoursByDocket.get(
                      docket.id,
                    ) ??
                    rawHours;

                  const existing =
                    rows.get(
                      crewName,
                    ) ?? {
                      name: crewName,
                      dockets: 0,
                      rawHours: 0,
                      productionHours: 0,
                      productionTonnes: 0,
                      rawMhPerTonne:
                        null,
                      productionMhPerTonne:
                        null,
                      towersTouched: 0,
                      towersComplete: 0,
                      towerIds:
                        new Set<string>(),
                      completedTowerIds:
                        new Set<string>(),
                    };

                  existing.dockets +=
                    1;

                  existing.rawHours +=
                    rawHours;

                  existing.productionHours +=
                    productionHours;

                  existing.productionTonnes +=
                    productionTonnes;

                  existing.towerIds.add(
                    towerId,
                  );

                  if (
                    tower?.computedProgress ===
                    100
                  ) {
                    existing.completedTowerIds.add(
                      towerId,
                    );
                  }

                  rows.set(
                    crewName,
                    existing,
                  );

                  previousProgress =
                    Math.max(
                      previousProgress,
                      currentProgress,
                    );
                },
              );
          },
        );

        return Array.from(
          rows.values(),
        )
          .map(
            (row) => ({
              name: row.name,
              dockets:
                row.dockets,
              rawHours:
                row.rawHours,
              productionHours:
                row.productionHours,
              productionTonnes:
                row.productionTonnes,

              rawMhPerTonne:
                row.productionTonnes >
                0
                  ? row.rawHours /
                    row.productionTonnes
                  : null,

              productionMhPerTonne:
                row.productionTonnes >
                0
                  ? row.productionHours /
                    row.productionTonnes
                  : null,

              towersTouched:
                row.towerIds.size,

              towersComplete:
                row
                  .completedTowerIds
                  .size,
            }),
          )
          .sort(
            (a, b) => {
              if (
                a.productionMhPerTonne ===
                  null &&
                b.productionMhPerTonne ===
                  null
              ) {
                return (
                  b.productionHours -
                  a.productionHours
                );
              }

              if (
                a.productionMhPerTonne ===
                null
              ) {
                return 1;
              }

              if (
                b.productionMhPerTonne ===
                null
              ) {
                return -1;
              }

              return (
                a.productionMhPerTonne -
                b.productionMhPerTonne
              );
            },
          );
      },
      [
        towerSummaries,
        dockets,
        rawHoursByDocket,
        productionHoursByDocket,
      ],
    );

  if (loading) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View
          style={styles.loadingScreen}
        >
          <ActivityIndicator
            size="large"
            color="#0f172a"
          />

          <Text
            style={styles.loadingText}
          >
            Loading project progress...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!projectId) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View
          style={styles.emptyScreen}
        >
          <RadioTower
            size={36}
            color="#94a3b8"
          />

          <Text
            style={
              styles.emptyScreenTitle
            }
          >
            No project selected
          </Text>

          <Text
            style={
              styles.emptyScreenText
            }
          >
            Select a current project
            from the Home screen to
            view its progress.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() =>
              void loadProjectProgress(
                true,
              )
            }
          />
        }
      >
        <View
          style={styles.headerCard}
        >
          <View
            style={styles.headerIcon}
          >
            <BarChart3
              size={24}
              color="#ffffff"
              strokeWidth={2.4}
            />
          </View>

          <View
            style={styles.headerContent}
          >
            <Text
              style={styles.eyebrow}
            >
              PROJECT PROGRESS
            </Text>

            <Text
              style={styles.title}
            >
              {projectLabel(project)}
            </Text>

            <Text
              style={styles.headerMeta}
            >
              {project?.client ??
                "Client not set"}
              {" · "}
              {project?.location ??
                "Location not set"}
            </Text>

            <View
              style={styles.statusPill}
            >
              <Text
                style={
                  styles.statusPillText
                }
              >
                {project?.status ??
                  "Status not set"}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() =>
              void loadProjectProgress(
                true,
              )
            }
            style={({
              pressed,
            }) => [
              styles.refreshButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <RefreshCw
              size={18}
              color="#334155"
            />
          </Pressable>
        </View>

        {errorMessage ? (
          <View
            style={styles.errorCard}
          >
            <Text
              style={styles.errorTitle}
            >
              Project progress
              unavailable
            </Text>

            <Text
              style={styles.errorText}
            >
              {errorMessage}
            </Text>
          </View>
        ) : null}

        <View
          style={styles.progressGrid}
        >
          <ProgressRing
            label="Overall progress"
            value={
              stats.overallProgress
            }
            detail={`${stats.towersComplete} complete · ${stats.towersInProgress} active`}
            tone="blue"
          />

          <ProgressRing
            label="Delivery progress"
            value={
              stats.deliveryPercent
            }
            detail={`${formatNumber(
              stats.deliveredQty,
            )} of ${formatNumber(
              stats.totalRequiredQty,
            )} delivered`}
            tone="green"
          />
        </View>

        <Text
          style={styles.sectionTitle}
        >
          Project summary
        </Text>

        <View
          style={styles.metricGrid}
        >
          <MetricCard
            icon={RadioTower}
            label="Total towers"
            value={String(
              stats.totalTowers,
            )}
            detail={`${stats.towersNotStarted} not started`}
          />

          <MetricCard
            icon={CheckCircle2}
            label="Complete"
            value={String(
              stats.towersComplete,
            )}
            detail={`${stats.towersInProgress} in progress`}
          />

          <MetricCard
            icon={ClipboardList}
            label="Daily dockets"
            value={String(
              stats.totalDockets,
            )}
            detail={`Latest: ${formatDate(
              stats.latestDocketDate,
            )}`}
          />

          <MetricCard
            icon={AlertTriangle}
            label="Open defects"
            value={String(
              stats.openDefects,
            )}
            detail={`${stats.totalDefects} total defects`}
          />

          <MetricCard
            icon={PackageCheck}
            label="Delivery records"
            value={String(
              stats.totalDeliveries,
            )}
            detail={`${stats.deliveryTowersInProgress} towers active`}
          />

          <MetricCard
            icon={Scale}
            label="Completed tonnes"
            value={formatNumber(
              stats.completedTonnes,
              1,
            )}
            detail={
              stats.totalTowerWeight
                ? `${formatNumber(
                    stats.totalTowerWeight,
                    1,
                  )} t total tower weight`
                : "Tower weights not found"
            }
          />
        </View>

        {performanceVisible ? (
          <>
            <Text
              style={
                styles.sectionTitle
              }
            >
              Performance summary
            </Text>

            <View
              style={
                styles.performanceCard
              }
            >
              <View
                style={
                  styles.performanceHeader
                }
              >
                <Gauge
                  size={21}
                  color="#6d28d9"
                  strokeWidth={2.4}
                />

                <Text
                  style={
                    styles.performanceTitle
                  }
                >
                  Project MH/T
                </Text>
              </View>

              <View
                style={
                  styles.performanceGrid
                }
              >
                <PerformanceMetric
                  label="Production MH/T"
                  value={formatNumber(
                    stats.productionMhPerTonne,
                    2,
                  )}
                  detail={`${formatNumber(
                    stats.totalProductionHours,
                    1,
                  )} production hrs`}
                />

                <PerformanceMetric
                  label="Raw MH/T"
                  value={formatNumber(
                    stats.rawMhPerTonne,
                    2,
                  )}
                  detail={`${formatNumber(
                    stats.totalRawHours,
                    1,
                  )} raw hrs`}
                />
              </View>
            </View>
          </>
        ) : null}

        <SectionHeading
          title="Towers currently in progress"
          subtitle="Tap a tower to open its tower progress page."
        />

        {inProgressTowers.length ===
        0 ? (
          <EmptyCard message="No towers are currently in progress." />
        ) : (
          <View style={styles.list}>
            {inProgressTowers.map(
              (tower) => (
                <TowerCard
                  key={tower.id}
                  tower={tower}
                  showPerformance={
                    performanceVisible
                  }
                />
              ),
            )}
          </View>
        )}

        <SectionHeading
          title="Tower deliveries in progress"
          subtitle="Tap a tower to review its delivery records."
        />

        {deliveryTowers.length ===
        0 ? (
          <EmptyCard message="No delivery towers are currently in progress." />
        ) : (
          <View style={styles.list}>
            {deliveryTowers.map(
              (tower) => (
                <DeliveryCard
                  key={tower.id}
                  tower={tower}
                />
              ),
            )}
          </View>
        )}

        {performanceVisible &&
        crewSummary.length > 0 ? (
          <>
            <SectionHeading
              title="Crew production summary"
              subtitle="Crew comparison based on docket progress and production hours."
            />

            <View style={styles.list}>
              {crewSummary.map(
                (crew, index) => (
                  <View
                    key={crew.name}
                    style={
                      styles.crewCard
                    }
                  >
                    <View
                      style={
                        styles.crewRank
                      }
                    >
                      <Text
                        style={
                          styles.crewRankText
                        }
                      >
                        #{index + 1}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.crewContent
                      }
                    >
                      <Text
                        style={
                          styles.crewName
                        }
                      >
                        {crew.name}
                      </Text>

                      <Text
                        style={
                          styles.crewMeta
                        }
                      >
                        {crew.dockets} dockets
                        {" · "}
                        {crew.towersTouched} towers
                        touched
                        {" · "}
                        {crew.towersComplete} complete
                      </Text>

                      <View
                        style={
                          styles.crewMetrics
                        }
                      >
                        <View
                          style={
                            styles.crewMetric
                          }
                        >
                          <Text
                            style={
                              styles.crewMetricLabel
                            }
                          >
                            Prod MH/T
                          </Text>

                          <Text
                            style={
                              styles.crewMetricValue
                            }
                          >
                            {formatNumber(
                              crew.productionMhPerTonne,
                              2,
                            )}
                          </Text>
                        </View>

                        <View
                          style={
                            styles.crewMetric
                          }
                        >
                          <Text
                            style={
                              styles.crewMetricLabel
                            }
                          >
                            Raw MH/T
                          </Text>

                          <Text
                            style={
                              styles.crewMetricValue
                            }
                          >
                            {formatNumber(
                              crew.rawMhPerTonne,
                              2,
                            )}
                          </Text>
                        </View>

                        <View
                          style={
                            styles.crewMetric
                          }
                        >
                          <Text
                            style={
                              styles.crewMetricLabel
                            }
                          >
                            Tonnes
                          </Text>

                          <Text
                            style={
                              styles.crewMetricValue
                            }
                          >
                            {formatNumber(
                              crew.productionTonnes,
                              1,
                            )}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                ),
              )}
            </View>
          </>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View
      style={styles.sectionHeading}
    >
      <Text
        style={styles.sectionTitle}
      >
        {title}
      </Text>

      <Text
        style={
          styles.sectionSubtitle
        }
      >
        {subtitle}
      </Text>
    </View>
  );
}

function ProgressRing({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "blue" | "green";
}) {
  const ringColor =
    tone === "green"
      ? "#10b981"
      : "#3b82f6";

  const backgroundColor =
    tone === "green"
      ? "#ecfdf5"
      : "#eff6ff";

  return (
    <View style={styles.progressCard}>
      <View
        style={[
          styles.progressRing,
          {
            borderColor: ringColor,
            backgroundColor,
          },
        ]}
      >
        <Text
          style={
            styles.progressRingValue
          }
        >
          {formatNumber(value)}%
        </Text>
      </View>

      <Text
        style={
          styles.progressRingLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          styles.progressRingDetail
        }
      >
        {detail}
      </Text>
    </View>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ComponentType<{
    size?: number;
    color?: string;
    strokeWidth?: number;
  }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIcon}>
        <Icon
          size={19}
          color="#0f172a"
          strokeWidth={2.2}
        />
      </View>

      <Text
        style={styles.metricLabel}
      >
        {label}
      </Text>

      <Text
        style={styles.metricValue}
      >
        {value}
      </Text>

      <Text
        style={styles.metricDetail}
      >
        {detail}
      </Text>
    </View>
  );
}

function PerformanceMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <View
      style={
        styles.performanceMetric
      }
    >
      <Text
        style={
          styles.performanceMetricLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          styles.performanceMetricValue
        }
      >
        {value}
      </Text>

      <Text
        style={
          styles.performanceMetricDetail
        }
      >
        {detail}
      </Text>
    </View>
  );
}

function TowerCard({
  tower,
  showPerformance,
}: {
  tower: TowerSummary;
  showPerformance: boolean;
}) {
  function openTower() {
    router.push(
      {
        pathname: "/tower-progress",
        params: {
          towerId: tower.id,
        },
      } as Href,
    );
  }

  return (
    <Pressable
      onPress={openTower}
      style={({ pressed }) => [
        styles.towerCard,
        pressed && styles.pressedCard,
      ]}
    >
      <View style={styles.towerHeader}>
        <View style={styles.towerHeaderContent}>
          <Text style={styles.towerName}>
            {getTowerDisplayName(tower)}
          </Text>

          <Text style={styles.towerMeta}>
            {getTowerType(tower)}
            {tower.line ? ` · ${tower.line}` : ""}
            {tower.status ? ` · ${tower.status}` : ""}
          </Text>
        </View>

        <View style={styles.cardRight}>
          <Text style={styles.towerPercent}>
            {formatNumber(tower.computedProgress)}%
          </Text>
          <ChevronRight
            size={19}
            color="#94a3b8"
            strokeWidth={2.4}
          />
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${clampPercent(
                tower.computedProgress,
              )}%`,
            },
          ]}
        />
      </View>

      <View style={styles.towerStatsRow}>
        <View style={styles.towerStat}>
          <Text style={styles.towerStatLabel}>
            Delivery
          </Text>
          <Text style={styles.towerStatValue}>
            {formatNumber(tower.deliveryPercent)}%
          </Text>
        </View>

        <View style={styles.towerStat}>
          <Text style={styles.towerStatLabel}>
            Tonnes
          </Text>
          <Text style={styles.towerStatValue}>
            {formatNumber(tower.completedTonnes, 1)}
          </Text>
        </View>

        {showPerformance ? (
          <View style={styles.towerStat}>
            <Text style={styles.towerStatLabel}>
              Prod MH/T
            </Text>
            <Text style={styles.towerStatValue}>
              {formatNumber(
                tower.productionMhPerTonne,
                2,
              )}
            </Text>
          </View>
        ) : null}
      </View>

      {tower.outstandingQty > 0 ? (
        <Text style={styles.outstandingText}>
          {formatNumber(tower.outstandingQty)} delivery items
          outstanding
        </Text>
      ) : null}

      <View style={styles.cardActionRow}>
        <Text style={styles.cardActionText}>
          Open tower
        </Text>
        <ChevronRight
          size={16}
          color="#2563eb"
          strokeWidth={2.5}
        />
      </View>
    </Pressable>
  );
}

function DeliveryCard({
  tower,
}: {
  tower: TowerSummary;
}) {
  function openDelivery() {
    router.push(
      {
        pathname: "/truck-delivery",
        params: {
          towerId: tower.id,
        },
      } as Href,
    );
  }

  return (
    <Pressable
      onPress={openDelivery}
      style={({ pressed }) => [
        styles.deliveryCard,
        pressed && styles.pressedCard,
      ]}
    >
      <View style={styles.towerHeader}>
        <View style={styles.towerHeaderContent}>
          <Text style={styles.towerName}>
            {getTowerDisplayName(tower)}
          </Text>

          <Text style={styles.towerMeta}>
            {formatNumber(tower.deliveredQty)} of{" "}
            {formatNumber(tower.requiredQty)} delivered
            {" · "}
            {formatNumber(tower.outstandingQty)} outstanding
          </Text>
        </View>

        <View style={styles.cardRight}>
          <Text style={styles.deliveryPercent}>
            {formatNumber(tower.deliveryPercent)}%
          </Text>
          <ChevronRight
            size={19}
            color="#16a34a"
            strokeWidth={2.4}
          />
        </View>
      </View>

      <View style={styles.deliveryTrack}>
        <View
          style={[
            styles.deliveryFill,
            {
              width: `${clampPercent(
                tower.deliveryPercent,
              )}%`,
            },
          ]}
        />
      </View>

      <View style={styles.deliveryStatsRow}>
        <View style={styles.deliveryStat}>
          <Text style={styles.deliveryStatLabel}>
            Delivered
          </Text>
          <Text style={styles.deliveryStatValue}>
            {formatNumber(tower.deliveredQty)}
          </Text>
        </View>

        <View style={styles.deliveryStat}>
          <Text style={styles.deliveryStatLabel}>
            Required
          </Text>
          <Text style={styles.deliveryStatValue}>
            {formatNumber(tower.requiredQty)}
          </Text>
        </View>

        <View style={styles.deliveryStat}>
          <Text style={styles.deliveryStatLabel}>
            Outstanding
          </Text>
          <Text style={styles.deliveryStatValue}>
            {formatNumber(tower.outstandingQty)}
          </Text>
        </View>
      </View>

      <View style={styles.deliveryActionRow}>
        <Text style={styles.deliveryActionText}>
          Open delivery
        </Text>
        <ChevronRight
          size={16}
          color="#15803d"
          strokeWidth={2.5}
        />
      </View>
    </Pressable>
  );
}

function EmptyCard({
  message,
}: {
  message: string;
}) {
  return (
    <View style={styles.emptyCard}>
      <Text
        style={styles.emptyCardText}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  content: {
    padding: 18,
    paddingBottom: 48,
  },

  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: "#64748b",
    fontSize: 14,
    marginTop: 12,
  },

  emptyScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },

  emptyScreenTitle: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 14,
  },

  emptyScreenText: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 7,
  },

  headerCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 22,
    backgroundColor: "#ffffff",
    padding: 18,
    marginBottom: 18,
  },

  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
  },

  headerContent: {
    flex: 1,
  },

  eyebrow: {
    color: "#2563eb",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  title: {
    color: "#0f172a",
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 27,
    marginTop: 5,
  },

  headerMeta: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#eff6ff",
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 10,
  },

  statusPillText: {
    color: "#2563eb",
    fontSize: 11,
    fontWeight: "800",
  },

  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },

  errorCard: {
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 18,
    backgroundColor: "#fef2f2",
    padding: 16,
    marginBottom: 18,
  },

  errorTitle: {
    color: "#991b1b",
    fontSize: 15,
    fontWeight: "900",
  },

  errorText: {
    color: "#b91c1c",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },

  progressGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 22,
  },

  progressCard: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 20,
    backgroundColor: "#ffffff",
    padding: 15,
  },

  progressRing: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  progressRingValue: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900",
  },

  progressRingLabel: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 11,
  },

  progressRingDetail: {
    color: "#64748b",
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
    marginTop: 4,
  },

  sectionHeading: {
    marginTop: 9,
    marginBottom: 12,
  },

  sectionTitle: {
    color: "#0f172a",
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 11,
  },

  sectionSubtitle: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
    marginTop: -6,
  },

  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 21,
  },

  metricCard: {
    width: "48%",
    minHeight: 145,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    backgroundColor: "#ffffff",
    padding: 15,
  },

  metricIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },

  metricLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 11,
  },

  metricValue: {
    color: "#0f172a",
    fontSize: 23,
    fontWeight: "900",
    marginTop: 4,
  },

  metricDetail: {
    color: "#94a3b8",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },

  performanceCard: {
    borderWidth: 1,
    borderColor: "#ddd6fe",
    borderRadius: 20,
    backgroundColor: "#f5f3ff",
    padding: 17,
    marginBottom: 21,
  },

  performanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  performanceTitle: {
    color: "#5b21b6",
    fontSize: 16,
    fontWeight: "900",
  },

  performanceGrid: {
    flexDirection: "row",
    gap: 9,
    marginTop: 14,
  },

  performanceMetric: {
    flex: 1,
    borderRadius: 15,
    backgroundColor: "#ffffff",
    padding: 13,
  },

  performanceMetricLabel: {
    color: "#7c3aed",
    fontSize: 10,
    fontWeight: "800",
  },

  performanceMetricValue: {
    color: "#4c1d95",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 7,
  },

  performanceMetricDetail: {
    color: "#8b5cf6",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },

  list: {
    gap: 10,
    marginBottom: 21,
  },

  towerCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    backgroundColor: "#ffffff",
    padding: 16,
  },

  deliveryCard: {
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 18,
    backgroundColor: "#f0fdf4",
    padding: 16,
  },

  towerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  towerHeaderContent: {
    flex: 1,
  },

  towerName: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900",
  },

  towerMeta: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },

  towerPercent: {
    color: "#2563eb",
    fontSize: 17,
    fontWeight: "900",
  },

  deliveryPercent: {
    color: "#15803d",
    fontSize: 17,
    fontWeight: "900",
  },

  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#e2e8f0",
    marginTop: 14,
  },

  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#3b82f6",
  },

  deliveryTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#dcfce7",
    marginTop: 14,
  },

  deliveryFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#22c55e",
  },

  towerStatsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 13,
  },

  towerStat: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    padding: 10,
  },

  towerStatLabel: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "700",
  },

  towerStatValue: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 4,
  },

  outstandingText: {
    color: "#b45309",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 11,
  },

  crewCard: {
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    backgroundColor: "#ffffff",
    padding: 15,
  },

  crewRank: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ede9fe",
  },

  crewRankText: {
    color: "#6d28d9",
    fontSize: 13,
    fontWeight: "900",
  },

  crewContent: {
    flex: 1,
  },

  crewName: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },

  crewMeta: {
    color: "#64748b",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },

  crewMetrics: {
    flexDirection: "row",
    gap: 7,
    marginTop: 11,
  },

  crewMetric: {
    flex: 1,
    borderRadius: 11,
    backgroundColor: "#f8fafc",
    padding: 9,
  },

  crewMetricLabel: {
    color: "#64748b",
    fontSize: 8,
    fontWeight: "700",
  },

  crewMetricValue: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 4,
  },

  emptyCard: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    borderRadius: 18,
    backgroundColor: "#ffffff",
    padding: 20,
    marginBottom: 21,
  },

  emptyCardText: {
    color: "#64748b",
    fontSize: 13,
    textAlign: "center",
  },

  cardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  cardActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 13,
  },

  cardActionText: {
    color: "#2563eb",
    fontSize: 11,
    fontWeight: "800",
  },

  deliveryStatsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 13,
  },

  deliveryStat: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    padding: 10,
  },

  deliveryStatLabel: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "700",
  },

  deliveryStatValue: {
    color: "#166534",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 4,
  },

  deliveryActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 13,
  },

  deliveryActionText: {
    color: "#15803d",
    fontSize: 11,
    fontWeight: "800",
  },

  pressedCard: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }],
  },

  pressed: {
    opacity: 0.72,
  },
});
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  type MobileRole,
  useAuth,
} from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

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
  cover_photo_path?: string | null;
};

type DocketRow = {
  id: string;
  project_id?: string | null;
  tower_id?: string | null;
  docket_date?: string | null;
  crew?: string | null;
  leading_hand?: string | null;
  assembly_percent?: number | null;
  erection_percent?: number | null;
};

type DefectRow = {
  id: string;
  status?: string | null;
};

type BundleRow = {
  bundle_no?: string | null;
  qty_required?: number | null;
  required_qty?: number | null;
  section?: string | null;
};

type DeliveryRow = {
  id: string;
};

type DeliveryItemRow = {
  delivery_id?: string | null;
  bundle_no?: string | null;
  qty_delivered?: number | null;
  quantity_delivered?: number | null;
  delivered_qty?: number | null;
  qty?: number | null;
};

type StatusFilter =
  | "All"
  | "Not Started"
  | "In Progress"
  | "Complete";

type SelectorOption = {
  id: string;
  label: string;
  subtitle?: string;
};

type OutstandingBundle = {
  bundleNo: string;
  section: string;
  required: number;
  delivered: number;
  outstanding: number;
};

function safeString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function safeNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/,/g, ""));

  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function matchesText(
  ...values: (string | number | null | undefined)[]
): string {
  return values
    .map((value) => (value == null ? "" : String(value)))
    .join(" ")
    .toLowerCase();
}

function getTowerLabel(tower?: Tower | null): string {
  if (!tower) return "Unknown tower";

  const extra = tower.extra_data ?? {};

  return (
    safeString(tower.tower_number) ||
    safeString(tower.structure_number) ||
    safeString(tower.tower_no) ||
    safeString(tower.name) ||
    safeString(extra["Tower No"]) ||
    safeString(extra["Tower Number"]) ||
    safeString(extra["Structure Number"]) ||
    safeString(extra["Structure No"]) ||
    "Unknown tower"
  );
}

function getTowerType(tower?: Tower | null): string {
  if (!tower) return "—";

  const extra = tower.extra_data ?? {};

  const candidates = [
    extra["type"],
    extra["Type"],
    extra["tower_type"],
    extra["Tower Type"],
    extra["tower type"],
  ];

  const found = candidates.find(
    (value) =>
      value !== null &&
      value !== undefined &&
      String(value).trim() !== "",
  );

  return found ? String(found) : "—";
}

function naturalTowerSort(a: Tower, b: Tower): number {
  return getTowerLabel(a).localeCompare(
    getTowerLabel(b),
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    },
  );
}

function getDocketProgress(docket: DocketRow): number {
  const assembly = safeNumber(docket.assembly_percent, 0);
  const erection = safeNumber(docket.erection_percent, 0);

  return clampPercent(
    Math.round(assembly * 0.5 + erection * 0.5),
  );
}

function getTowerProgress(dockets: DocketRow[]): number {
  return dockets.reduce(
    (maximum, docket) =>
      Math.max(maximum, getDocketProgress(docket)),
    0,
  );
}

function getLatestAssembly(dockets: DocketRow[]): number {
  return dockets.reduce(
    (maximum, docket) =>
      Math.max(
        maximum,
        clampPercent(safeNumber(docket.assembly_percent, 0)),
      ),
    0,
  );
}

function getLatestErection(dockets: DocketRow[]): number {
  return dockets.reduce(
    (maximum, docket) =>
      Math.max(
        maximum,
        clampPercent(safeNumber(docket.erection_percent, 0)),
      ),
    0,
  );
}

function getProgressStatus(
  progress: number,
): Exclude<StatusFilter, "All"> {
  if (progress >= 100) return "Complete";
  if (progress > 0) return "In Progress";
  return "Not Started";
}

function getRequiredQty(row: BundleRow): number {
  return safeNumber(row.qty_required ?? row.required_qty, 0);
}

function getDeliveredQty(row: DeliveryItemRow): number {
  return safeNumber(
    row.qty_delivered ??
      row.quantity_delivered ??
      row.delivered_qty ??
      row.qty,
    0,
  );
}

function isOpenDefect(defect: DefectRow): boolean {
  const status = safeString(defect.status).trim().toLowerCase();

  return !["closed", "complete", "completed"].includes(status);
}

function formatExtraLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function formatExtraValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "—";
    }
  }

  return String(value);
}

function findExtraValue(
  extra: Record<string, unknown> | null | undefined,
  keys: string[],
): string {
  if (!extra) return "—";

  for (const requestedKey of keys) {
    const match = Object.entries(extra).find(
      ([key]) =>
        key.trim().toLowerCase() ===
        requestedKey.trim().toLowerCase(),
    );

    if (match) {
      return formatExtraValue(match[1]);
    }
  }

  return "—";
}

async function safeSelect<T>(
  table: string,
  select: string,
  filters?: { column: string; value: string }[],
): Promise<T[]> {
  try {
    let query = supabase.from(table).select(select);

    for (const filter of filters ?? []) {
      query = query.eq(filter.column, filter.value);
    }

    const { data, error } = await query;

    if (error) return [];

    return (data as T[] | null) ?? [];
  } catch {
    return [];
  }
}

async function safeSelectFirstExisting<T>(
  tables: string[],
  select: string,
  filters?: { column: string; value: string }[],
): Promise<T[]> {
  for (const table of tables) {
    const rows = await safeSelect<T>(
      table,
      select,
      filters,
    );

    if (rows.length > 0) return rows;
  }

  return [];
}

export default function TowerProgressScreen() {
  const { profile } = useAuth();

  const role: MobileRole =
    profile?.mobileRole ?? "crew";

  const canOpenDockets =
    role === "leading_hand" || role === "admin";

  const projectId = profile?.projectId ?? "";

  const [towers, setTowers] = useState<Tower[]>([]);
  const [dockets, setDockets] = useState<DocketRow[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("All");

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [selectorVisible, setSelectorVisible] =
    useState(false);
  const [selectorTitle, setSelectorTitle] = useState("");
  const [selectorOptions, setSelectorOptions] =
    useState<SelectorOption[]>([]);
  const [selectorAction, setSelectorAction] = useState<
    ((option: SelectorOption) => void) | null
  >(null);

  const [overviewVisible, setOverviewVisible] =
    useState(false);
  const [selectedTower, setSelectedTower] =
    useState<Tower | null>(null);
  const [overviewLoading, setOverviewLoading] =
    useState(false);

  const [towerDockets, setTowerDockets] = useState<
    DocketRow[]
  >([]);
  const [defects, setDefects] = useState<DefectRow[]>([]);
  const [requiredBundles, setRequiredBundles] =
    useState<BundleRow[]>([]);
  const [deliveries, setDeliveries] = useState<
    DeliveryRow[]
  >([]);
  const [deliveryItems, setDeliveryItems] = useState<
    DeliveryItemRow[]
  >([]);

  const loadProject = useCallback(
    async (
      selectedProjectId: string,
      silent = false,
    ) => {
      if (!selectedProjectId) {
        setTowers([]);
        setDockets([]);
        return;
      }

      if (!silent) setLoading(true);

      const [towerResponse, docketResponse] =
        await Promise.all([
          supabase
            .from("towers")
            .select("*")
            .eq("project_id", selectedProjectId),

          supabase
            .from("tower_daily_dockets")
            .select(
              "id, project_id, tower_id, docket_date, crew, leading_hand, assembly_percent, erection_percent",
            )
            .eq("project_id", selectedProjectId),
        ]);

      if (towerResponse.error) {
        Alert.alert(
          "Could not load towers",
          towerResponse.error.message,
        );

        setTowers([]);
        setDockets([]);

        if (!silent) setLoading(false);
        return;
      }

      setTowers(
        ((towerResponse.data ?? []) as Tower[]).sort(
          naturalTowerSort,
        ),
      );

      setDockets(
        (docketResponse.data ?? []) as DocketRow[],
      );

      if (!silent) setLoading(false);
    },
    [],
  );

  useEffect(() => {
    setSearch("");
    setStatusFilter("All");
    setOverviewVisible(false);
    setSelectedTower(null);

    void loadProject(projectId);
  }, [loadProject, projectId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadProject(projectId, true);
    setRefreshing(false);
  }, [loadProject, projectId]);

  const docketsByTower = useMemo(() => {
    const grouped: Record<string, DocketRow[]> = {};

    dockets.forEach((docket) => {
      if (!docket.tower_id) return;

      if (!grouped[docket.tower_id]) {
        grouped[docket.tower_id] = [];
      }

      grouped[docket.tower_id].push(docket);
    });

    return grouped;
  }, [dockets]);

  const progressByTower = useMemo(() => {
    const map: Record<string, number> = {};

    towers.forEach((tower) => {
      map[tower.id] = getTowerProgress(
        docketsByTower[tower.id] ?? [],
      );
    });

    return map;
  }, [docketsByTower, towers]);

  const summary = useMemo(() => {
    const values = towers.map(
      (tower) => progressByTower[tower.id] ?? 0,
    );

    const total = towers.length;
    const complete = values.filter(
      (value) => value >= 100,
    ).length;
    const inProgress = values.filter(
      (value) => value > 0 && value < 100,
    ).length;
    const average =
      total > 0
        ? Math.round(
            values.reduce(
              (sum, value) => sum + value,
              0,
            ) / total,
          )
        : 0;

    return {
      total,
      complete,
      inProgress,
      average,
    };
  }, [progressByTower, towers]);

  const filteredTowers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...towers]
      .sort(naturalTowerSort)
      .filter((tower) => {
        const progress =
          progressByTower[tower.id] ?? 0;
        const status =
          getProgressStatus(progress);

        if (
          statusFilter !== "All" &&
          status !== statusFilter
        ) {
          return false;
        }

        if (!query) return true;

        return matchesText(
          getTowerLabel(tower),
          tower.name,
          tower.line,
          getTowerType(tower),
          status,
          progress,
        ).includes(query);
      });
  }, [
    progressByTower,
    search,
    statusFilter,
    towers,
  ]);

  function openSelector(
    title: string,
    options: SelectorOption[],
    onSelect: (option: SelectorOption) => void,
  ) {
    setSelectorTitle(title);
    setSelectorOptions(options);
    setSelectorAction(() => onSelect);
    setSelectorVisible(true);
  }

  function openStatusSelector() {
    const options: SelectorOption[] = [
      {
        id: "All",
        label: "All Statuses",
      },
      {
        id: "Not Started",
        label: "Not Started",
      },
      {
        id: "In Progress",
        label: "In Progress",
      },
      {
        id: "Complete",
        label: "Complete",
      },
    ];

    openSelector(
      "Filter by Status",
      options,
      (option) => {
        setStatusFilter(
          option.id as StatusFilter,
        );
      },
    );
  }

  async function openTowerOverview(
    tower: Tower,
  ) {
    setSelectedTower(tower);
    setOverviewVisible(true);
    setOverviewLoading(true);

    setTowerDockets([]);
    setDefects([]);
    setRequiredBundles([]);
    setDeliveries([]);
    setDeliveryItems([]);

    const towerId = tower.id;

    const [
      docketRows,
      defectRows,
      bundleRows,
      deliveryRows,
    ] = await Promise.all([
      safeSelect<DocketRow>(
        "tower_daily_dockets",
        "id, project_id, tower_id, docket_date, crew, leading_hand, assembly_percent, erection_percent",
        [
          {
            column: "tower_id",
            value: towerId,
          },
        ],
      ),

      safeSelect<DefectRow>(
        "tower_defects",
        "id, status",
        [
          {
            column: "tower_id",
            value: towerId,
          },
        ],
      ),

      safeSelect<BundleRow>(
        "tower_required_bundles",
        "bundle_no, qty_required, required_qty, section",
        [
          {
            column: "tower_id",
            value: towerId,
          },
        ],
      ),

      safeSelectFirstExisting<DeliveryRow>(
        [
          "tower_bundle_deliveries",
          "tower_deliveries",
        ],
        "id",
        [
          {
            column: "tower_id",
            value: towerId,
          },
        ],
      ),
    ]);

    const sortedDockets = [...docketRows].sort(
      (a, b) => {
        const first = a.docket_date
          ? new Date(a.docket_date).getTime()
          : 0;
        const second = b.docket_date
          ? new Date(b.docket_date).getTime()
          : 0;

        return second - first;
      },
    );

    const deliveryIds = deliveryRows.map(
      (delivery) => delivery.id,
    );

    let items: DeliveryItemRow[] = [];

    if (deliveryIds.length > 0) {
      const allItems =
        await safeSelectFirstExisting<DeliveryItemRow>(
          [
            "tower_bundle_delivery_items",
            "tower_delivery_items",
            "tower_delivered_items",
          ],
          "delivery_id, bundle_no, qty_delivered, quantity_delivered, delivered_qty, qty",
        );

      items = allItems.filter((item) =>
        deliveryIds.includes(
          safeString(item.delivery_id),
        ),
      );
    }

    setTowerDockets(sortedDockets);
    setDefects(defectRows);
    setRequiredBundles(bundleRows);
    setDeliveries(deliveryRows);
    setDeliveryItems(items);
    setOverviewLoading(false);
  }

  const overviewStats = useMemo(() => {
    const progress =
      getTowerProgress(towerDockets);
    const assembly =
      getLatestAssembly(towerDockets);
    const erection =
      getLatestErection(towerDockets);

    const latestDocket =
      towerDockets[0] ?? null;

    const requiredQty =
      requiredBundles.reduce(
        (sum, bundle) =>
          sum + getRequiredQty(bundle),
        0,
      );

    const deliveredQty =
      deliveryItems.reduce(
        (sum, item) =>
          sum + getDeliveredQty(item),
        0,
      );

    const deliveredByBundle =
      new Map<string, number>();

    deliveryItems.forEach((item) => {
      const bundleNo =
        safeString(item.bundle_no).trim();

      if (!bundleNo) return;

      deliveredByBundle.set(
        bundleNo,
        (deliveredByBundle.get(bundleNo) ??
          0) + getDeliveredQty(item),
      );
    });

    const outstandingBundles:
      OutstandingBundle[] =
      requiredBundles
        .map((bundle) => {
          const bundleNo =
            safeString(
              bundle.bundle_no,
            ).trim();

          const required =
            getRequiredQty(bundle);

          const delivered =
            deliveredByBundle.get(
              bundleNo,
            ) ?? 0;

          return {
            bundleNo,
            section: safeString(
              bundle.section,
              "General",
            ),
            required,
            delivered,
            outstanding: Math.max(
              required - delivered,
              0,
            ),
          };
        })
        .filter(
          (bundle) =>
            bundle.outstanding > 0,
        )
        .sort(
          (a, b) =>
            b.outstanding -
            a.outstanding,
        );

    const openDefects =
      defects.filter(isOpenDefect).length;

    return {
      progress,
      assembly,
      erection,
      status:
        getProgressStatus(progress),
      latestDate:
        latestDocket?.docket_date ??
        null,
      latestCrew:
        latestDocket?.crew ||
        latestDocket?.leading_hand ||
        "—",
      docketCount:
        towerDockets.length,
      openDefects,
      requiredQty,
      deliveredQty,
      outstandingQty: Math.max(
        requiredQty - deliveredQty,
        0,
      ),
      deliveryProgress:
        requiredQty > 0
          ? clampPercent(
              (deliveredQty /
                requiredQty) *
                100,
            )
          : 0,
      outstandingBundles,
    };
  }, [
    defects,
    deliveryItems,
    requiredBundles,
    towerDockets,
  ]);

  const bodyExtension =
    findExtraValue(
      selectedTower?.extra_data,
      [
        "Body Extension",
        "body_extension",
        "Body Ext",
      ],
    );

  const commonBody =
    findExtraValue(
      selectedTower?.extra_data,
      [
        "Common Body",
        "common_body",
      ],
    );

  const legExtension =
    findExtraValue(
      selectedTower?.extra_data,
      [
        "Leg Extension",
        "leg_extension",
        "Leg Type",
        "Legs",
      ],
    );

  const towerHeight =
    findExtraValue(
      selectedTower?.extra_data,
      [
        "Tower Height",
        "tower_height",
        "Height",
        "Structure Height",
      ],
    );

  const towerWeight =
    findExtraValue(
      selectedTower?.extra_data,
      [
        "Tower Weight",
        "Tower Weight (t)",
        "tower_weight",
        "Structure Total Weight",
        "Structure Total Weights",
      ],
    );

  const extraFields = useMemo(
    () =>
      Object.entries(
        selectedTower?.extra_data ?? {},
      )
        .filter(([key]) => {
          const normalised =
            key.trim().toLowerCase();

          return ![
            "type",
            "tower type",
            "tower_type",
            "tower height",
            "tower_height",
            "height",
            "structure height",
            "tower weight",
            "tower weight (t)",
            "tower_weight",
            "structure total weight",
            "structure total weights",
            "body extension",
            "body_extension",
            "body ext",
            "common body",
            "common_body",
            "leg extension",
            "leg_extension",
            "leg type",
            "legs",
          ].includes(normalised);
        })
        .sort(([a], [b]) =>
          a.localeCompare(b),
        ),
    [selectedTower?.extra_data],
  );

  function navigateToTowerRoute(
    routeName:
      | "truck-delivery"
      | "materials"
      | "daily-dockets",
  ) {
    if (!selectedTower) return;

    setOverviewVisible(false);

    router.push({
      pathname: `/${routeName}`,
      params: {
        projectId:
          selectedTower.project_id,
        towerId: selectedTower.id,
        towerLabel:
          getTowerLabel(selectedTower),
      },
    } as Href);
  }

  function renderTower({
    item,
  }: {
    item: Tower;
  }) {
    const progress =
      progressByTower[item.id] ?? 0;

    const status =
      getProgressStatus(progress);

    return (
      <Pressable
        style={styles.towerCard}
        onPress={() =>
          void openTowerOverview(item)
        }
      >
        <View style={styles.towerCardHeader}>
          <View style={styles.towerCardIcon}>
            <Ionicons
              name="business-outline"
              size={20}
              color="#1E3A8A"
            />
          </View>

          <View
            style={
              styles.towerCardTitleWrap
            }
          >
            <Text
              style={styles.towerCardTitle}
            >
              {getTowerLabel(item)}
            </Text>

            <Text
              style={
                styles.towerCardSubtitle
              }
            >
              {getTowerType(item)} ·{" "}
              {item.line || "No line"}
            </Text>
          </View>

          <StatusBadge status={status} />
        </View>

        <View style={styles.progressHeader}>
          <Text
            style={
              styles.progressHeaderLabel
            }
          >
            Tower progress
          </Text>

          <Text
            style={
              styles.progressHeaderValue
            }
          >
            {progress}%
          </Text>
        </View>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progress}%`,
                backgroundColor:
                  progress >= 100
                    ? "#16A34A"
                    : progress > 0
                      ? "#2563EB"
                      : "#CBD5E1",
              },
            ]}
          />
        </View>

        <View
          style={styles.towerCardFooter}
        >
          <View
            style={styles.towerCardMetric}
          >
            <Text
              style={
                styles.towerCardMetricValue
              }
            >
              {
                (
                  docketsByTower[
                    item.id
                  ] ?? []
                ).length
              }
            </Text>

            <Text
              style={
                styles.towerCardMetricLabel
              }
            >
              Dockets
            </Text>
          </View>

          <View
            style={styles.openTowerButton}
          >
            <Text
              style={
                styles.openTowerButtonText
              }
            >
              Open tower
            </Text>

            <Ionicons
              name="chevron-forward"
              size={17}
              color="#FFFFFF"
            />
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerIcon}>
              <Ionicons
                name="analytics-outline"
                size={22}
                color="#FFFFFF"
              />
            </View>

            <View style={styles.headerText}>
              <Text style={styles.pageTitle}>
                Tower Progress
              </Text>

              <Text
                style={styles.pageSubtitle}
              >
                Search towers and open field
                information
              </Text>
            </View>

            <Pressable
              style={styles.refreshButton}
              disabled={
                refreshing || !projectId
              }
              onPress={() =>
                void refresh()
              }
            >
              {refreshing ? (
                <ActivityIndicator
                  size="small"
                  color="#334155"
                />
              ) : (
                <Ionicons
                  name="refresh"
                  size={20}
                  color="#334155"
                />
              )}
            </Pressable>
          </View>

          <View style={styles.projectContext}>
            <Text style={styles.projectContextLabel}>
              CURRENT PROJECT
            </Text>

            <Text
              numberOfLines={1}
              style={styles.projectContextValue}
            >
              {profile?.projectNumber
                ? `${profile.projectNumber} — ${profile.projectName ?? ""}`
                : profile?.projectName ?? "No project selected"}
            </Text>
          </View>
        </View>

        <View style={styles.toolbar}>
          <View style={styles.searchBox}>
            <Ionicons
              name="search"
              size={19}
              color="#64748B"
            />

            <TextInput
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
              placeholder="Search tower, line, type or status…"
              placeholderTextColor="#94A3B8"
              autoCorrect={false}
            />

            {search.length > 0 && (
              <Pressable
                onPress={() => setSearch("")}
              >
                <Ionicons
                  name="close-circle"
                  size={19}
                  color="#94A3B8"
                />
              </Pressable>
            )}
          </View>

          <Pressable
            style={styles.filterButton}
            onPress={openStatusSelector}
          >
            <Ionicons
              name="filter-outline"
              size={17}
              color="#334155"
            />

            <Text
              style={
                styles.filterButtonText
              }
            >
              {statusFilter === "All"
                ? "All"
                : statusFilter}
            </Text>

            <Ionicons
              name="chevron-down"
              size={16}
              color="#64748B"
            />
          </Pressable>
        </View>

        {!projectId ? (
          <Empty
            title="No project selected"
            text="Return to Home and select a current project to view tower progress."
          />
        ) : loading ? (
          <Loading text="Loading project towers…" />
        ) : (
          <FlatList
            data={filteredTowers}
            keyExtractor={(item) =>
              item.id
            }
            renderItem={renderTower}
            contentContainerStyle={
              styles.listContent
            }
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() =>
                  void refresh()
                }
              />
            }
            ListHeaderComponent={
              <View>
                <View
                  style={styles.summaryGrid}
                >
                  <SummaryCard
                    label="Total"
                    value={summary.total}
                    tone="slate"
                  />

                  <SummaryCard
                    label="In Progress"
                    value={
                      summary.inProgress
                    }
                    tone="blue"
                  />

                  <SummaryCard
                    label="Complete"
                    value={summary.complete}
                    tone="green"
                  />

                  <SummaryCard
                    label="Average"
                    value={`${summary.average}%`}
                    tone="slate"
                  />
                </View>

                <View
                  style={styles.listHeading}
                >
                  <Text
                    style={styles.listTitle}
                  >
                    Towers
                  </Text>

                  <Text
                    style={
                      styles.listSubtitle
                    }
                  >
                    Showing{" "}
                    {filteredTowers.length} of{" "}
                    {towers.length}
                  </Text>
                </View>
              </View>
            }
            ListEmptyComponent={
              <Empty
                title="No towers found"
                text={
                  towers.length === 0
                    ? "No towers are available for this project."
                    : "No towers match the current search or filter."
                }
              />
            }
          />
        )}

        <OptionSelector
          visible={selectorVisible}
          title={selectorTitle}
          options={selectorOptions}
          onClose={() =>
            setSelectorVisible(false)
          }
          onSelect={(option) => {
            selectorAction?.(option);
            setSelectorVisible(false);
          }}
        />

        <Modal
          visible={overviewVisible}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() =>
            setOverviewVisible(false)
          }
        >
          <SafeAreaView
            style={styles.modalSafe}
          >
            <View
              style={styles.overviewHeader}
            >
              <Pressable
                style={styles.modalClose}
                onPress={() =>
                  setOverviewVisible(false)
                }
              >
                <Ionicons
                  name="arrow-back"
                  size={22}
                  color="#334155"
                />
              </Pressable>

              <View
                style={
                  styles.overviewHeaderText
                }
              >
                <Text
                  numberOfLines={1}
                  style={styles.overviewTitle}
                >
                  {getTowerLabel(
                    selectedTower,
                  )}
                </Text>

                <Text
                  style={
                    styles.overviewSubtitle
                  }
                >
                  Field overview
                </Text>
              </View>

              <View
                style={
                  styles.modalHeaderSpacer
                }
              />
            </View>

            {overviewLoading ? (
              <Loading text="Loading tower information…" />
            ) : (
              <ScrollView
                contentContainerStyle={
                  styles.overviewContent
                }
                showsVerticalScrollIndicator={
                  false
                }
              >
                <View style={styles.heroCard}>
                  <Text
                    style={styles.heroEyebrow}
                  >
                    TOWER OVERVIEW
                  </Text>

                  <Text
                    style={styles.heroTitle}
                  >
                    {getTowerLabel(
                      selectedTower,
                    )}
                  </Text>

                  <Text
                    style={styles.heroSubtitle}
                  >
                    {getTowerType(
                      selectedTower,
                    )}{" "}
                    ·{" "}
                    {selectedTower?.line ||
                      "No line"}
                  </Text>

                  <View
                    style={
                      styles.heroProgressRow
                    }
                  >
                    <View
                      style={
                        styles.heroProgressText
                      }
                    >
                      <Text
                        style={
                          styles.heroProgressValue
                        }
                      >
                        {
                          overviewStats.progress
                        }
                        %
                      </Text>

                      <Text
                        style={
                          styles.heroProgressLabel
                        }
                      >
                        {
                          overviewStats.status
                        }
                      </Text>
                    </View>

                    <View
                      style={
                        styles.heroProgressTrack
                      }
                    >
                      <View
                        style={[
                          styles.heroProgressFill,
                          {
                            width: `${overviewStats.progress}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>

                <SectionCard title="Quick Actions">
                  <View
                    style={
                      styles.quickActionGrid
                    }
                  >
                    <QuickAction
                      title="Deliveries"
                      subtitle="View or add tower deliveries"
                      icon="car-outline"
                      tone="green"
                      onPress={() =>
                        navigateToTowerRoute(
                          "truck-delivery",
                        )
                      }
                    />

                    <QuickAction
                      title="Materials"
                      subtitle="Search bundles and members"
                      icon="search-outline"
                      tone="purple"
                      onPress={() =>
                        navigateToTowerRoute(
                          "materials",
                        )
                      }
                    />

                    {canOpenDockets && (
                      <QuickAction
                        title="Daily Dockets"
                        subtitle="Open or create a docket"
                        icon="clipboard-outline"
                        tone="blue"
                        onPress={() =>
                          navigateToTowerRoute(
                            "daily-dockets",
                          )
                        }
                      />
                    )}
                  </View>

                  {!canOpenDockets && (
                    <View
                      style={
                        styles.roleNotice
                      }
                    >
                      <Ionicons
                        name="information-circle-outline"
                        size={18}
                        color="#64748B"
                      />

                      <Text
                        style={
                          styles.roleNoticeText
                        }
                      >
                        Daily Dockets are available
                        to leading hands and
                        administrators.
                      </Text>
                    </View>
                  )}
                </SectionCard>

                <SectionCard title="Progress">
                  <ProgressLine
                    label="Overall"
                    value={
                      overviewStats.progress
                    }
                    colour="#2563EB"
                  />

                  <ProgressLine
                    label="Assembly"
                    value={
                      overviewStats.assembly
                    }
                    colour="#7C3AED"
                  />

                  <ProgressLine
                    label="Erection"
                    value={
                      overviewStats.erection
                    }
                    colour="#16A34A"
                  />
                </SectionCard>

                <SectionCard title="Tower Information">
                  <View
                    style={styles.detailGrid}
                  >
                    <DetailMetric
                      label="Tower Number"
                      value={getTowerLabel(
                        selectedTower,
                      )}
                    />

                    <DetailMetric
                      label="Tower Type"
                      value={getTowerType(
                        selectedTower,
                      )}
                    />

                    <DetailMetric
                      label="Line"
                      value={
                        selectedTower?.line ||
                        "—"
                      }
                    />

                    <DetailMetric
                      label="Status"
                      value={
                        overviewStats.status
                      }
                    />

                    <DetailMetric
                      label="Tower Height"
                      value={towerHeight}
                    />

                    <DetailMetric
                      label="Tower Weight"
                      value={towerWeight}
                    />

                    <DetailMetric
                      label="Body Extension"
                      value={bodyExtension}
                    />

                    <DetailMetric
                      label="Common Body"
                      value={commonBody}
                    />

                    <DetailMetric
                      label="Leg Extension"
                      value={legExtension}
                    />

                    <DetailMetric
                      label="Latest Work"
                      value={formatDate(
                        overviewStats.latestDate,
                      )}
                    />

                    <DetailMetric
                      label="Latest Crew"
                      value={
                        overviewStats.latestCrew
                      }
                    />

                    <DetailMetric
                      label="Dockets"
                      value={String(
                        overviewStats.docketCount,
                      )}
                    />
                  </View>
                </SectionCard>

                <SectionCard title="Delivery Status">
                  <View
                    style={styles.detailGrid}
                  >
                    <DetailMetric
                      label="Required Qty"
                      value={String(
                        overviewStats.requiredQty,
                      )}
                    />

                    <DetailMetric
                      label="Delivered Qty"
                      value={String(
                        overviewStats.deliveredQty,
                      )}
                    />

                    <DetailMetric
                      label="Outstanding"
                      value={String(
                        overviewStats.outstandingQty,
                      )}
                      warning={
                        overviewStats.outstandingQty >
                        0
                      }
                    />

                    <DetailMetric
                      label="Delivery Progress"
                      value={`${overviewStats.deliveryProgress.toFixed(
                        0,
                      )}%`}
                    />
                  </View>

                  {overviewStats
                    .outstandingBundles.length >
                  0 ? (
                    <View
                      style={
                        styles.outstandingList
                      }
                    >
                      <Text
                        style={
                          styles.subsectionTitle
                        }
                      >
                        Outstanding bundles
                      </Text>

                      {overviewStats.outstandingBundles
                        .slice(0, 10)
                        .map((bundle) => (
                          <View
                            key={
                              bundle.bundleNo
                            }
                            style={
                              styles.outstandingRow
                            }
                          >
                            <View
                              style={
                                styles.outstandingRowText
                              }
                            >
                              <Text
                                style={
                                  styles.outstandingBundle
                                }
                              >
                                {bundle.bundleNo ||
                                  "Unnamed bundle"}
                              </Text>

                              <Text
                                style={
                                  styles.outstandingSection
                                }
                              >
                                {
                                  bundle.section
                                }
                              </Text>
                            </View>

                            <Text
                              style={
                                styles.outstandingQty
                              }
                            >
                              {
                                bundle.delivered
                              }
                              /
                              {
                                bundle.required
                              }
                            </Text>
                          </View>
                        ))}
                    </View>
                  ) : (
                    <View
                      style={
                        styles.allClearBox
                      }
                    >
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={20}
                        color="#15803D"
                      />

                      <Text
                        style={
                          styles.allClearText
                        }
                      >
                        No outstanding bundles.
                      </Text>
                    </View>
                  )}
                </SectionCard>

                <SectionCard title="Site Status">
                  <View
                    style={styles.detailGrid}
                  >
                    <DetailMetric
                      label="Open Defects"
                      value={String(
                        overviewStats.openDefects,
                      )}
                      warning={
                        overviewStats.openDefects >
                        0
                      }
                    />

                    <DetailMetric
                      label="Delivery Records"
                      value={String(
                        deliveries.length,
                      )}
                    />
                  </View>
                </SectionCard>

                {extraFields.length > 0 && (
                  <SectionCard title="Additional Tower Details">
                    <View
                      style={
                        styles.extraFields
                      }
                    >
                      {extraFields.map(
                        ([key, value]) => (
                          <View
                            key={key}
                            style={
                              styles.extraFieldRow
                            }
                          >
                            <Text
                              style={
                                styles.extraFieldLabel
                              }
                            >
                              {formatExtraLabel(
                                key,
                              )}
                            </Text>

                            <Text
                              style={
                                styles.extraFieldValue
                              }
                            >
                              {formatExtraValue(
                                value,
                              )}
                            </Text>
                          </View>
                        ),
                      )}
                    </View>
                  </SectionCard>
                )}
              </ScrollView>
            )}
          </SafeAreaView>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

function Loading({
  text,
}: {
  text: string;
}) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator
        size="large"
        color="#2563EB"
      />

      <Text style={styles.loadingText}>
        {text}
      </Text>
    </View>
  );
}

function StatusBadge({
  status,
}: {
  status: Exclude<
    StatusFilter,
    "All"
  >;
}) {
  const tone =
    status === "Complete"
      ? {
          backgroundColor: "#DCFCE7",
          borderColor: "#86EFAC",
          color: "#166534",
        }
      : status === "In Progress"
        ? {
            backgroundColor: "#DBEAFE",
            borderColor: "#93C5FD",
            color: "#1D4ED8",
          }
        : {
            backgroundColor: "#F1F5F9",
            borderColor: "#CBD5E1",
            color: "#475569",
          };

  return (
    <View
      style={[
        styles.statusBadge,
        {
          backgroundColor:
            tone.backgroundColor,
          borderColor: tone.borderColor,
        },
      ]}
    >
      <Text
        style={[
          styles.statusBadgeText,
          {
            color: tone.color,
          },
        ]}
      >
        {status}
      </Text>
    </View>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "slate" | "blue" | "green";
}) {
  const colour =
    tone === "blue"
      ? {
          backgroundColor: "#EFF6FF",
          borderColor: "#BFDBFE",
          color: "#1E3A8A",
        }
      : tone === "green"
        ? {
            backgroundColor: "#F0FDF4",
            borderColor: "#BBF7D0",
            color: "#166534",
          }
        : {
            backgroundColor: "#F8FAFC",
            borderColor: "#E2E8F0",
            color: "#0F172A",
          };

  return (
    <View
      style={[
        styles.summaryCard,
        {
          backgroundColor:
            colour.backgroundColor,
          borderColor:
            colour.borderColor,
        },
      ]}
    >
      <Text
        style={styles.summaryCardLabel}
      >
        {label}
      </Text>

      <Text
        style={[
          styles.summaryCardValue,
          {
            color: colour.color,
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>
        {title}
      </Text>

      <View style={styles.sectionBody}>
        {children}
      </View>
    </View>
  );
}

function QuickAction({
  title,
  subtitle,
  icon,
  tone,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon:
    | "car-outline"
    | "search-outline"
    | "clipboard-outline";
  tone: "green" | "purple" | "blue";
  onPress: () => void;
}) {
  const colour =
    tone === "green"
      ? {
          backgroundColor: "#F0FDF4",
          borderColor: "#BBF7D0",
          iconBackground: "#DCFCE7",
          iconColour: "#15803D",
        }
      : tone === "purple"
        ? {
            backgroundColor: "#F5F3FF",
            borderColor: "#DDD6FE",
            iconBackground: "#EDE9FE",
            iconColour: "#6D28D9",
          }
        : {
            backgroundColor: "#EFF6FF",
            borderColor: "#BFDBFE",
            iconBackground: "#DBEAFE",
            iconColour: "#1D4ED8",
          };

  return (
    <Pressable
      style={[
        styles.quickAction,
        {
          backgroundColor:
            colour.backgroundColor,
          borderColor:
            colour.borderColor,
        },
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.quickActionIcon,
          {
            backgroundColor:
              colour.iconBackground,
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={22}
          color={colour.iconColour}
        />
      </View>

      <View style={styles.quickActionText}>
        <Text
          style={styles.quickActionTitle}
        >
          {title}
        </Text>

        <Text
          style={
            styles.quickActionSubtitle
          }
        >
          {subtitle}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color={colour.iconColour}
      />
    </Pressable>
  );
}

function ProgressLine({
  label,
  value,
  colour,
}: {
  label: string;
  value: number;
  colour: string;
}) {
  const safeValue =
    clampPercent(value);

  return (
    <View style={styles.progressLine}>
      <View
        style={
          styles.progressLineHeader
        }
      >
        <Text
          style={
            styles.progressLineLabel
          }
        >
          {label}
        </Text>

        <Text
          style={
            styles.progressLineValue
          }
        >
          {safeValue.toFixed(0)}%
        </Text>
      </View>

      <View
        style={
          styles.progressLineTrack
        }
      >
        <View
          style={[
            styles.progressLineFill,
            {
              width: `${safeValue}%`,
              backgroundColor: colour,
            },
          ]}
        />
      </View>
    </View>
  );
}

function DetailMetric({
  label,
  value,
  warning,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <View
      style={[
        styles.detailMetric,
        warning &&
          styles.detailMetricWarning,
      ]}
    >
      <Text
        style={styles.detailMetricLabel}
      >
        {label}
      </Text>

      <Text
        style={[
          styles.detailMetricValue,
          warning &&
            styles.detailMetricValueWarning,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function Empty({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons
          name="file-tray-outline"
          size={28}
          color="#64748B"
        />
      </View>

      <Text style={styles.emptyTitle}>
        {title}
      </Text>

      <Text style={styles.emptyText}>
        {text}
      </Text>
    </View>
  );
}

function OptionSelector({
  visible,
  title,
  options,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  options: SelectorOption[];
  onClose: () => void;
  onSelect: (
    option: SelectorOption,
  ) => void;
}) {
  const [query, setQuery] =
    useState("");

  useEffect(() => {
    if (visible) setQuery("");
  }, [visible]);

  const filteredOptions =
    useMemo(() => {
      const value =
        query.trim().toLowerCase();

      if (!value) return options;

      return options.filter(
        (option) =>
          matchesText(
            option.label,
            option.subtitle,
          ).includes(value),
      );
    }, [options, query]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <Pressable
          style={styles.sheetBackdrop}
          onPress={onClose}
        />

        <View style={styles.sheet}>
          <View
            style={styles.sheetHandle}
          />

          <View
            style={styles.sheetHeader}
          >
            <Text
              style={styles.sheetTitle}
            >
              {title}
            </Text>

            <Pressable
              style={styles.sheetClose}
              onPress={onClose}
            >
              <Ionicons
                name="close"
                size={21}
                color="#334155"
              />
            </Pressable>
          </View>

          {options.length > 8 && (
            <View
              style={styles.sheetSearch}
            >
              <Ionicons
                name="search"
                size={18}
                color="#64748B"
              />

              <TextInput
                value={query}
                onChangeText={setQuery}
                style={
                  styles.sheetSearchInput
                }
                placeholder="Search…"
                placeholderTextColor="#94A3B8"
                autoCorrect={false}
              />
            </View>
          )}

          <FlatList
            data={filteredOptions}
            keyExtractor={(item) =>
              item.id
            }
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={
              styles.sheetList
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.sheetOption,
                  pressed &&
                    styles.sheetOptionPressed,
                ]}
                onPress={() =>
                  onSelect(item)
                }
              >
                <View
                  style={
                    styles.sheetOptionText
                  }
                >
                  <Text
                    style={
                      styles.sheetOptionLabel
                    }
                  >
                    {item.label}
                  </Text>

                  {item.subtitle ? (
                    <Text
                      style={
                        styles.sheetOptionSubtitle
                      }
                    >
                      {item.subtitle}
                    </Text>
                  ) : null}
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color="#94A3B8"
                />
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  screen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 10,
  },
  header: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    padding: 12,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    marginLeft: 10,
  },
  pageTitle: {
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "900",
  },
  pageSubtitle: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 2,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  projectContext: {
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginTop: 9,
  },
  projectContextLabel: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  projectContextValue: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  toolbar: {
    flexDirection: "row",
    gap: 7,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    padding: 10,
  },
  searchBox: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 11,
  },
  searchInput: {
    flex: 1,
    color: "#0F172A",
    fontSize: 13,
    paddingVertical: 8,
    marginHorizontal: 8,
  },
  filterButton: {
    minWidth: 92,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 10,
  },
  filterButtonText: {
    flex: 1,
    color: "#334155",
    fontSize: 11,
    fontWeight: "800",
    marginHorizontal: 6,
  },
  listContent: {
    padding: 12,
    paddingBottom: 100,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginBottom: 12,
  },
  summaryCard: {
    width: "48.7%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  summaryCardLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  summaryCardValue: {
    fontSize: 21,
    fontWeight: "900",
    marginTop: 3,
  },
  listHeading: {
    marginBottom: 9,
  },
  listTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
  },
  listSubtitle: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 2,
  },
  towerCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 13,
    marginBottom: 9,
  },
  towerCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  towerCardIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  towerCardTitleWrap: {
    flex: 1,
    marginLeft: 10,
  },
  towerCardTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
  },
  towerCardSubtitle: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: "900",
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 5,
  },
  progressHeaderLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
  },
  progressHeaderValue: {
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "900",
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  towerCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  towerCardMetric: {
    minWidth: 58,
  },
  towerCardMetricValue: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "900",
  },
  towerCardMetricLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "700",
  },
  openTowerButton: {
    minHeight: 39,
    borderRadius: 11,
    backgroundColor: "#0F172A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  openTowerButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    marginRight: 4,
  },
  modalSafe: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  overviewHeader: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  modalClose: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  overviewHeaderText: {
    flex: 1,
    marginHorizontal: 9,
  },
  overviewTitle: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },
  overviewSubtitle: {
    color: "#64748B",
    fontSize: 10,
    textAlign: "center",
    marginTop: 1,
  },
  modalHeaderSpacer: {
    width: 40,
  },
  overviewContent: {
    padding: 12,
    paddingBottom: 40,
  },
  heroCard: {
    borderRadius: 18,
    backgroundColor: "#0F172A",
    padding: 16,
    marginBottom: 10,
  },
  heroEyebrow: {
    color: "#93C5FD",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 5,
  },
  heroSubtitle: {
    color: "#CBD5E1",
    fontSize: 11,
    marginTop: 3,
  },
  heroProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
  },
  heroProgressText: {
    width: 78,
  },
  heroProgressValue: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
  },
  heroProgressLabel: {
    color: "#94A3B8",
    fontSize: 9,
    marginTop: 1,
  },
  heroProgressTrack: {
    flex: 1,
    height: 9,
    borderRadius: 999,
    backgroundColor: "#334155",
    overflow: "hidden",
  },
  heroProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#3B82F6",
  },
  sectionCard: {
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 13,
    marginBottom: 10,
  },
  sectionTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
  },
  sectionBody: {
    marginTop: 10,
  },
  quickActionGrid: {
    gap: 8,
  },
  quickAction: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
  },
  quickActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionText: {
    flex: 1,
    marginHorizontal: 10,
  },
  quickActionTitle: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "900",
  },
  quickActionSubtitle: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 3,
  },
  roleNotice: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    padding: 10,
    marginTop: 8,
  },
  roleNoticeText: {
    flex: 1,
    color: "#64748B",
    fontSize: 10,
    lineHeight: 15,
    marginLeft: 7,
  },
  progressLine: {
    marginBottom: 14,
  },
  progressLineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  progressLineLabel: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  progressLineValue: {
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "900",
  },
  progressLineTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  progressLineFill: {
    height: "100%",
    borderRadius: 999,
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  detailMetric: {
    width: "48.7%",
    minHeight: 72,
    borderRadius: 13,
    backgroundColor: "#F8FAFC",
    padding: 10,
  },
  detailMetricWarning: {
    backgroundColor: "#FFFBEB",
  },
  detailMetricLabel: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  detailMetricValue: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 4,
  },
  detailMetricValueWarning: {
    color: "#B45309",
  },
  outstandingList: {
    marginTop: 12,
  },
  subsectionTitle: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 7,
  },
  outstandingRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 9,
    marginBottom: 6,
  },
  outstandingRowText: {
    flex: 1,
  },
  outstandingBundle: {
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "900",
  },
  outstandingSection: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 2,
  },
  outstandingQty: {
    color: "#B45309",
    fontSize: 11,
    fontWeight: "900",
  },
  allClearBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
    padding: 11,
    marginTop: 10,
  },
  allClearText: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "800",
    marginLeft: 7,
  },
  extraFields: {
    marginTop: 0,
  },
  extraFieldRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 9,
  },
  extraFieldLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  extraFieldValue: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 52,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 12,
  },
  emptyText: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 5,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.48)",
  },
  sheet: {
    maxHeight: "80%",
    minHeight: 300,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 9,
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  sheetTitle: {
    flex: 1,
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900",
  },
  sheetClose: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetSearch: {
    minHeight: 45,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    marginHorizontal: 15,
    marginBottom: 8,
    paddingHorizontal: 11,
  },
  sheetSearchInput: {
    flex: 1,
    color: "#0F172A",
    fontSize: 13,
    paddingVertical: 8,
    marginLeft: 8,
  },
  sheetList: {
    paddingHorizontal: 13,
    paddingBottom: 35,
  },
  sheetOption: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingHorizontal: 5,
  },
  sheetOptionPressed: {
    backgroundColor: "#F8FAFC",
  },
  sheetOptionText: {
    flex: 1,
  },
  sheetOptionLabel: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800",
  },
  sheetOptionSubtitle: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 3,
  },
});

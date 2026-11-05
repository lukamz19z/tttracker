import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTowerProgress } from "@/lib/api/tower-progress";
import { towerWeightTonnes } from "@/lib/dockets/productivity";
import type { ResolvedMobileTowerProgress } from "@/types/daily-dockets";
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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { useAccess } from "@/lib/access";
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
  approval_status?: string | null;
  deleted_at?: string | null;
  crew?: string | null;
  leading_hand?: string | null;
  assembly_percent?: number | null;
  erection_percent?: number | null;
};

type DefectRow = {
  id: string;
  status?: string | null;
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

const progressCacheKey = (projectId: string) => `tttracker:tower-progress:${projectId}`;

function safeString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
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

function getProgressStatus(
  progress: number,
): Exclude<StatusFilter, "All"> {
  if (progress >= 100) return "Complete";
  if (progress > 0) return "In Progress";
  return "Not Started";
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

function formatMetric(value: number | null, decimals: number): string {
  return value !== null && Number.isFinite(value)
    ? value.toFixed(decimals)
    : "—";
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value}%`;
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
): Promise<T[] | null> {
  try {
    let query = supabase.from(table).select(select);

    for (const filter of filters ?? []) {
      query = query.eq(filter.column, filter.value);
    }

    const { data, error } = await query;

    if (error) return null;

    return (data as T[] | null) ?? [];
  } catch {
    return null;
  }
}

export default function TowerProgressScreen() {
  const { profile } = useAuth();
  const { can } = useAccess();

  const canOpenDockets = can("mobile.daily_dockets");

  const projectId = profile?.projectId ?? "";

  const [towers, setTowers] = useState<Tower[]>([]);
  const [dockets, setDockets] = useState<DocketRow[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("All");

  const [resolvedProgress, setResolvedProgress] = useState<Record<string, ResolvedMobileTowerProgress>>({});
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
  const [defects, setDefects] = useState<DefectRow[] | null>(null);

  const loadProject = useCallback(
    async (
      selectedProjectId: string,
      silent = false,
      resetProjectView = false,
    ) => {
      if (resetProjectView) {
        setSearch("");
        setStatusFilter("All");
        setOverviewVisible(false);
        setSelectedTower(null);
      }

      if (!selectedProjectId) {
        setTowers([]);
        setDockets([]);
        return;
      }

      if (!silent) setLoading(true);

      if (!silent) {
        try {
          const cached = await AsyncStorage.getItem(progressCacheKey(selectedProjectId));
          if (cached) {
            const snapshot = JSON.parse(cached) as { towers?: Tower[]; dockets?: DocketRow[]; progress?: Record<string, ResolvedMobileTowerProgress> };
            if (snapshot.towers && snapshot.dockets && snapshot.progress) {
              setTowers(snapshot.towers);
              setDockets(snapshot.dockets);
              setResolvedProgress(snapshot.progress);
              setLoading(false);
            }
          }
        } catch { /* A corrupt cache is ignored; server refresh remains authoritative. */ }
      }

      try {
        const result = await getTowerProgress(selectedProjectId);
        setResolvedProgress(result.progress);
        setTowers((result.towers as Tower[]).sort(naturalTowerSort));
        setDockets(result.dockets as DocketRow[]);
        void AsyncStorage.setItem(progressCacheKey(selectedProjectId), JSON.stringify({ towers: result.towers, dockets: result.dockets, progress: result.progress })).catch(() => undefined);
      } catch (error) {
        Alert.alert("Could not load tower progress", error instanceof Error ? error.message : "Please try again.");
        setLoading(false); return;
      }

      if (!silent) setLoading(false);
    },
    [],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void loadProject(projectId, false, true);
    });
    return () => cancelAnimationFrame(frame);
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
    const map: Record<string, number | undefined> = {};

    towers.forEach((tower) => {
      map[tower.id] = resolvedProgress[tower.id]?.totalProgressPercent;
    });

    return map;
  }, [resolvedProgress, towers]);

  const summary = useMemo(() => {
    const values = towers.map((tower) => progressByTower[tower.id]).filter((value): value is number => value !== undefined);

    const total = towers.length;
    const complete = values.filter(
      (value) => value >= 100,
    ).length;
    const inProgress = values.filter(
      (value) => value > 0 && value < 100,
    ).length;
    const average =
      values.length > 0
        ? Math.round(
            values.reduce(
              (sum, value) => sum + value,
              0,
            ) / values.length,
          )
        : null;

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
        const progress = progressByTower[tower.id];
        const status = progress === undefined ? null : getProgressStatus(progress);

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
          status ?? "Progress unavailable",
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
    setDefects(null);

    const towerId = tower.id;

    const defectRows = await safeSelect<DefectRow>(
        "tower_defects",
        "id, status",
        [
          {
            column: "tower_id",
            value: towerId,
          },
        ],
      );

    const sortedDockets = [...(docketsByTower[towerId] ?? [])].sort(
      (a, b) => new Date(b.docket_date ?? 0).getTime() - new Date(a.docket_date ?? 0).getTime(),
    );

    setTowerDockets(sortedDockets);
    setDefects(defectRows);
    setOverviewLoading(false);
  }

  const overviewStats = useMemo(() => {
    const resolved = selectedTower ? resolvedProgress[selectedTower.id] : undefined;
    const progress = resolved?.totalProgressPercent ?? null;
    const assembly = resolved?.assemblyPercent ?? null;
    const erection = resolved?.erectionPercent ?? null;

    const latestDocket =
      towerDockets[0] ?? null;

    const openDefects =
      defects?.filter(isOpenDefect).length ?? null;

    return {
      progress,
      assembly,
      erection,
      status: progress === null ? null : (resolved?.status ?? getProgressStatus(progress)),
      latestDate: resolved?.latestDocketDate ?? null,
      totalHours: resolved?.totalHours ?? null,
      productionHours: resolved?.productionHours ?? null,
      rawMhPerTonne: resolved?.rawMhPerTonne ?? null,
      productionMhPerTonne: resolved?.productionMhPerTonne ?? null,
      latestCrew:
        latestDocket?.crew ||
        latestDocket?.leading_hand ||
        "—",
      docketCount: selectedTower ? (docketsByTower[selectedTower.id]?.length ?? 0) : 0,
      openDefects,
    };
  }, [
    defects, docketsByTower, towerDockets, resolvedProgress, selectedTower,
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

  const towerWeightValue = towerWeightTonnes(selectedTower?.extra_data);
  const towerWeight = towerWeightValue === null ? "—" : `${towerWeightValue.toFixed(2)} t`;

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
            "tower no",
            "tower number",
            "tower_number",
            "structure number",
            "structure no",
            "status",
            "line",
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
    const progress = progressByTower[item.id];
    const status = progress === undefined ? "Progress unavailable" : getProgressStatus(progress);

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
            {progress === undefined ? "—" : `${progress}%`}
          </Text>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, paddingVertical: 8 }}>
          <Text>Assembly {formatPercent(resolvedProgress[item.id]?.assemblyPercent)}</Text>
          <Text>Erection {formatPercent(resolvedProgress[item.id]?.erectionPercent)}</Text>
          {resolvedProgress[item.id]?.rawMhPerTonne != null ? <Text>MH/t {Number(resolvedProgress[item.id]?.rawMhPerTonne).toFixed(1)}</Text> : null}
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progress ?? 0}%`,
                backgroundColor:
                  progress !== undefined && progress >= 100
                    ? "#16A34A"
                    : progress !== undefined && progress > 0
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
                    value={summary.average === null ? "—" : `${summary.average}%`}
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
          key={`${selectorTitle}:${selectorVisible ? "open" : "closed"}`}
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
                <Text numberOfLines={1} style={styles.overviewTitle}>
                  Tower Overview
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

                  <Text style={styles.heroSubtitle}>{[getTowerType(selectedTower), selectedTower?.line].filter((value) => value && value !== "—").join(" · ") || "Tower progress"}</Text>

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
                      <Text style={styles.heroProgressValue}>{overviewStats.progress === null ? "—" : `${overviewStats.progress}%`}</Text>

                      <Text style={styles.heroProgressLabel}>{overviewStats.status ?? "Progress unavailable"}</Text>
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
                            width: `${overviewStats.progress ?? 0}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                  <View style={styles.heroSubProgress}>
                    <ProgressLine label="Assembly" value={overviewStats.assembly} colour="#A78BFA" />
                    <ProgressLine label="Erection" value={overviewStats.erection} colour="#4ADE80" />
                  </View>
                </View>
                <SectionCard title="Key Metrics">
                  <View style={styles.keyMetricGrid}>
                    <KeyMetric label="Raw MH/t" value={formatMetric(overviewStats.rawMhPerTonne, 1)} />
                    <KeyMetric label="Production MH/t" value={formatMetric(overviewStats.productionMhPerTonne, 1)} />
                    <KeyMetric label="Total Manhours" value={formatMetric(overviewStats.totalHours, 1)} />
                    <KeyMetric label="Tower Weight" value={towerWeight} />
                    <KeyMetric label="Latest Work" value={formatDate(overviewStats.latestDate)} />
                    <KeyMetric label="Dockets" value={String(overviewStats.docketCount)} />
                    {overviewStats.latestCrew !== "—" && <KeyMetric label="Latest Crew" value={overviewStats.latestCrew} />}
                  </View>
                </SectionCard>

                {(towerHeight !== "—" || bodyExtension !== "—" || commonBody !== "—" || legExtension !== "—" || extraFields.length > 0) && (
                  <SectionCard title="Tower Details">
                    <View style={styles.detailGrid}>
                      {towerHeight !== "—" && <DetailMetric label="Tower Height" value={towerHeight} />}
                      {bodyExtension !== "—" && <DetailMetric label="Body Extension" value={bodyExtension} />}
                      {commonBody !== "—" && <DetailMetric label="Common Body" value={commonBody} />}
                      {legExtension !== "—" && <DetailMetric label="Leg Extension" value={legExtension} />}
                    </View>
                    {extraFields.length > 0 && (
                      <View style={styles.extraFields}>
                        {extraFields.map(([key, value]) => (
                          <View key={key} style={styles.extraFieldRow}>
                            <Text style={styles.extraFieldLabel}>{formatExtraLabel(key)}</Text>
                            <Text style={styles.extraFieldValue}>{formatExtraValue(value)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </SectionCard>
                )}

                {overviewStats.openDefects !== null && (
                  <SectionCard title="Site Summary">
                    <View style={styles.detailGrid}>
                      <DetailMetric
                        label="Open Defects"
                        value={String(overviewStats.openDefects)}
                        warning={overviewStats.openDefects > 0}
                      />
                    </View>
                  </SectionCard>
                )}

                <SectionCard title="Quick Actions">
                  <View style={styles.quickActionGrid}>
                    <QuickAction title="Deliveries" subtitle="View or add tower deliveries" icon="car-outline" tone="green" onPress={() => navigateToTowerRoute("truck-delivery")} />
                    <QuickAction title="Materials" subtitle="Search bundles and members" icon="search-outline" tone="purple" onPress={() => navigateToTowerRoute("materials")} />
                    {canOpenDockets && <QuickAction title="Daily Dockets" subtitle="Open or create a docket" icon="clipboard-outline" tone="blue" onPress={() => navigateToTowerRoute("daily-dockets")} />}
                  </View>
                  {!canOpenDockets && (
                    <View style={styles.roleNotice}>
                      <Ionicons name="information-circle-outline" size={18} color="#64748B" />
                      <Text style={styles.roleNoticeText}>Daily Dockets are available to leading hands and administrators.</Text>
                    </View>
                  )}
                </SectionCard>
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
  status: string;
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
  value: number | null;
  colour: string;
}) {
  const safeValue = value === null ? null : clampPercent(value);

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
          {safeValue === null ? "—" : `${safeValue.toFixed(0)}%`}
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
              width: `${safeValue ?? 0}%`,
              backgroundColor: colour,
            },
          ]}
        />
      </View>
    </View>
  );
}

function KeyMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.keyMetric}>
      <Text style={styles.keyMetricLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.keyMetricValue}>{value}</Text>
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
  heroSubProgress: {
    marginTop: 12,
    gap: 5,
  },
  keyMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  keyMetric: {
    width: "48.5%",
    minHeight: 82,
    borderRadius: 13,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 11,
    justifyContent: "center",
  },
  keyMetricLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  keyMetricValue: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 5,
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

import { useFocusEffect } from "@react-navigation/native";
import { router, type Href } from "expo-router";
import {
  ChevronDown,
  ClipboardCheck,
  Plus,
  Search,
  X,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  QualitySelector,
  type QualitySelectorOption,
} from "@/components/quality/QualitySelector";
import { QualityShell } from "@/components/quality/QualityShell";
import { QualityStatusPill } from "@/components/quality/QualityStatusPill";
import { useAuth } from "@/contexts/AuthContext";
import { useQuality } from "@/contexts/QualityContext";
import { useSync } from "@/contexts/SyncContext";
import {
  cachedQualityMemberCatalog,
  cachedQualityRevisionList,
  listQualityRevisions,
  refreshQualityMemberCatalog,
  type QualityMemberCatalogRow,
} from "@/lib/api/quality";
import {
  listRevisionWorkspaces,
  type RevisionWorkspace,
} from "@/lib/offline/revision-workspaces";
import type { QualityRevisionListRow } from "@/types/quality";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function formatDate(value: unknown) {
  const raw = clean(value);
  if (!raw) return "—";

  const date = new Date(
    raw.length <= 10
      ? `${raw.slice(0, 10)}T00:00:00`
      : raw,
  );

  if (Number.isNaN(date.getTime())) return raw;

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(date)
    .replaceAll("/", "-");
}

type FilterSelector = "tower" | "member" | "stage" | null;

export default function RevisionsScreen() {
  const { data, loading: metadataLoading } = useQuality();
  const { profile } = useAuth();
  const { online } = useSync();

  const projectId = clean(data?.projectId || profile?.projectId);
  const projectCode =
    clean(profile?.projectNumber) ||
    clean(profile?.projectName) ||
    clean(data?.project?.project_number) ||
    clean(data?.project?.name);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [towerId, setTowerId] = useState("");
  const [memberNumber, setMemberNumber] = useState("");
  const [inspectionStage, setInspectionStage] = useState("");
  const [selector, setSelector] = useState<FilterSelector>(null);
  const [memberCatalog, setMemberCatalog] = useState<QualityMemberCatalogRow[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);

  const [rows, setRows] = useState<QualityRevisionListRow[]>([]);
  const [localRevisions, setLocalRevisions] = useState<RevisionWorkspace[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const towers = useMemo(
    () => (Array.isArray(data?.towers) ? data.towers : []),
    [data?.towers],
  );

  const towerById = useMemo(
    () =>
      new Map(
        towers.map((row) => [
          clean(row.id),
          clean(row.name) || clean(row.id) || "Tower",
        ]),
      ),
    [towers],
  );

  const revisionStatuses = data?.workflow?.revisionStatuses ?? [];
  const inspectionStages = data?.workflow?.inspectionStages ?? [
    "Post Assembly",
    "Post Erection",
    "Other",
  ];

  const towerOptions = useMemo<QualitySelectorOption[]>(
    () => [
      { id: "", label: "All towers" },
      ...towers.map((tower) => ({
        id: clean(tower.id),
        label: clean(tower.name) || "Tower",
        subtitle: [clean(tower.line), clean(tower.status)]
          .filter(Boolean)
          .join(" · "),
      })),
    ],
    [towers],
  );

  const stageOptions = useMemo<QualitySelectorOption[]>(
    () => [
      { id: "", label: "All inspection stages" },
      ...inspectionStages.map((stage) => ({
        id: clean(stage),
        label: clean(stage),
      })),
    ],
    [inspectionStages],
  );

  const memberOptions = useMemo<QualitySelectorOption[]>(() => {
    const byNumber = new Map<string, QualitySelectorOption>();

    for (const member of memberCatalog) {
      const number = clean(member.memberNumber);
      if (!number || byNumber.has(number)) continue;

      byNumber.set(number, {
        id: number,
        label: number,
        subtitle: [
          clean(member.towerSegment),
          clean(member.drawingNumber),
          clean(member.bundleReference),
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }

    return [
      { id: "", label: "All members" },
      ...Array.from(byNumber.values()),
    ];
  }, [memberCatalog]);

  useEffect(() => {
    setMemberNumber("");
    setMemberCatalog([]);

    if (!projectId || !towerId) return;

    let active = true;
    setMemberLoading(true);

    void (async () => {
      const cached = await cachedQualityMemberCatalog(projectId, towerId);
      if (active && cached?.value) {
        setMemberCatalog(cached.value);
      }

      if (online) {
        try {
          const latest = await refreshQualityMemberCatalog(projectId, towerId);
          if (active) setMemberCatalog(latest);
        } catch {
          // Keep the cached tower member catalogue on poor reception.
        }
      }

      if (active) setMemberLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [online, projectId, towerId]);

  const loadLocal = useCallback(
    async (serverRows: QualityRevisionListRow[]) => {
      if (!projectId) {
        setLocalRevisions([]);
        return;
      }

      const local = await listRevisionWorkspaces(projectId);
      const serverMutationIds = new Set(
        serverRows
          .map((row) => clean(row.mobile_client_mutation_id))
          .filter(Boolean),
      );
      const searchLower = debouncedQuery.toLowerCase();

      const filtered = local.filter((row) => {
        if (
          row.clientMutationId &&
          serverMutationIds.has(row.clientMutationId)
        ) {
          return false;
        }

        if (status !== "All" && status !== "Draft") return false;
        if (towerId && clean(row.towerId) !== towerId) return false;
        if (
          inspectionStage &&
          clean(row.inspectionStage) !== inspectionStage
        ) {
          return false;
        }
        if (
          memberNumber &&
          !(row.findings ?? []).some(
            (finding) => clean(finding.memberNumber) === memberNumber,
          )
        ) {
          return false;
        }

        if (!searchLower) return true;

        return [
          row.clientInspector,
          row.clientCompany,
          row.clientReference,
          row.notes,
          "pending sync",
        ]
          .map(clean)
          .join(" ")
          .toLowerCase()
          .includes(searchLower);
      });

      setLocalRevisions(filtered);
    },
    [
      debouncedQuery,
      inspectionStage,
      memberNumber,
      projectId,
      status,
      towerId,
    ],
  );

  const loadFirstPage = useCallback(async () => {
    if (!projectId) {
      setRows([]);
      setLocalRevisions([]);
      setNextOffset(null);
      return;
    }

    setLoading(true);
    setError(null);

    let hadCache = false;
    let baseRows: QualityRevisionListRow[] = [];

    try {
      const cached = await cachedQualityRevisionList({
        projectId,
        query: debouncedQuery,
        status,
        towerId,
        memberNumber,
        inspectionStage,
        offset: 0,
      });

      if (cached?.value) {
        hadCache = true;
        baseRows = cached.value.rows ?? [];
        setRows(baseRows);
        setNextOffset(cached.value.nextOffset ?? null);
        await loadLocal(baseRows);
      }

      if (!online) {
        if (!hadCache) {
          await loadLocal([]);
          setError("No cached Revision list is available while offline.");
        }
        return;
      }

      const live = await listQualityRevisions({
        projectId,
        query: debouncedQuery,
        status,
        towerId,
        memberNumber,
        inspectionStage,
        offset: 0,
        limit: 25,
      });

      baseRows = live.rows ?? [];
      setRows(baseRows);
      setNextOffset(live.nextOffset ?? null);
      await loadLocal(baseRows);
    } catch (loadError) {
      if (!hadCache) {
        await loadLocal([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Revisions could not be loaded.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [
    debouncedQuery,
    inspectionStage,
    loadLocal,
    memberNumber,
    online,
    projectId,
    status,
    towerId,
  ]);

  useFocusEffect(
    useCallback(() => {
      void loadFirstPage();
    }, [loadFirstPage]),
  );

  const loadMore = useCallback(async () => {
    if (!projectId || nextOffset === null || loadingMore) return;

    setLoadingMore(true);
    setError(null);

    try {
      let page:
        | Awaited<ReturnType<typeof listQualityRevisions>>
        | null = null;

      if (online) {
        page = await listQualityRevisions({
          projectId,
          query: debouncedQuery,
          status,
          towerId,
          memberNumber,
          inspectionStage,
          offset: nextOffset,
          limit: 25,
        });
      } else {
        const cached = await cachedQualityRevisionList({
          projectId,
          query: debouncedQuery,
          status,
          towerId,
          memberNumber,
          inspectionStage,
          offset: nextOffset,
        });
        page = cached?.value ?? null;
      }

      if (!page) {
        setError("More Revisions are not cached on this device.");
        return;
      }

      setRows((current) => {
        const byId = new Map(current.map((row) => [row.id, row]));
        for (const row of page?.rows ?? []) byId.set(row.id, row);
        return Array.from(byId.values());
      });
      setNextOffset(page.nextOffset ?? null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "More Revisions could not be loaded.",
      );
    } finally {
      setLoadingMore(false);
    }
  }, [
    debouncedQuery,
    inspectionStage,
    loadingMore,
    memberNumber,
    nextOffset,
    online,
    projectId,
    status,
    towerId,
  ]);

  return (
    <QualityShell
      permission="mobile.rectifications"
      root
      title="Revisions / Rectifications"
      subtitle="Filter by tower, member and inspection stage. Record text is searched separately."
    >
      <View style={styles.topRow}>
        <View style={styles.search}>
          <Search size={17} color="#64748b" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="RECT no., client ref, inspector, notes…"
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
          />
        </View>

        <Pressable
          style={styles.newButton}
          onPress={() => router.push("/revisions/new" as Href)}
        >
          <Plus size={18} color="#fff" />
          <Text style={styles.newText}>New</Text>
        </Pressable>
      </View>

      <View style={styles.selectorRow}>
        <FilterSelect
          label="Tower"
          value={towerId ? towerById.get(towerId) || "Tower" : "All towers"}
          onPress={() => setSelector("tower")}
        />
        <FilterSelect
          label="Member"
          value={
            memberLoading
              ? "Loading…"
              : memberNumber ||
                (towerId ? "All members" : "Select tower first")
          }
          disabled={!towerId || memberLoading}
          onPress={() => setSelector("member")}
        />
        <FilterSelect
          label="Stage"
          value={inspectionStage || "All stages"}
          onPress={() => setSelector("stage")}
        />
      </View>

      {towerId || memberNumber || inspectionStage ? (
        <Pressable
          style={styles.clearFilters}
          onPress={() => {
            setTowerId("");
            setMemberNumber("");
            setInspectionStage("");
          }}
        >
          <X size={14} color="#475569" />
          <Text style={styles.clearFiltersText}>
            Clear tower / member / stage filters
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.filters}>
        {["All", ...revisionStatuses].map((value) => (
          <Pressable
            key={value}
            style={[
              styles.filter,
              status === value && styles.filterActive,
            ]}
            onPress={() => setStatus(value)}
          >
            <Text
              style={[
                styles.filterText,
                status === value && styles.filterTextActive,
              ]}
            >
              {value}
            </Text>
          </Pressable>
        ))}
      </View>

      {(metadataLoading || loading) &&
      rows.length === 0 &&
      localRevisions.length === 0 ? (
        <ActivityIndicator />
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && rows.length === 0 && localRevisions.length === 0 ? (
        <View style={styles.empty}>
          <ClipboardCheck size={30} color="#94a3b8" />
          <Text style={styles.emptyTitle}>No matching Revisions</Text>
        </View>
      ) : null}

      {localRevisions.map((revision) => (
        <Pressable
          key={revision.routeKey}
          style={styles.card}
          onPress={() =>
            router.push(
              `/revisions/${encodeURIComponent(revision.routeKey)}` as Href,
            )
          }
        >
          <View style={styles.cardHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.number}>
                {[
                  projectCode,
                  towerById.get(revision.towerId) || "Tower",
                  "RECT · Pending sync",
                ]
                  .filter(Boolean)
                  .join(" ")}
              </Text>
              <Text style={styles.tower}>
                {revision.inspectionStage} · Saved offline
              </Text>
            </View>
            <QualityStatusPill value="Draft" />
          </View>
          <Text style={styles.meta}>
            {formatDate(revision.inspectionDate)} · {revision.findings.length} pending FLI
            {revision.findings.length === 1 ? "" : "s"}
          </Text>
        </Pressable>
      ))}

      {rows.map((row) => {
        const rowStatus = clean(row.status) || "Unknown";
        return (
          <Pressable
            key={row.id}
            style={styles.card}
            onPress={() =>
              router.push(
                `/revisions/${encodeURIComponent(row.id)}` as Href,
              )
            }
          >
            <View style={styles.cardHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.number}>
                  {[
                    projectCode,
                    towerById.get(clean(row.tower_id)),
                    clean(row.revision_number) ||
                      `RECT-${String(Number(row.sequence_no ?? 1)).padStart(2, "0")}`,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                </Text>
                <Text style={styles.tower}>
                  {towerById.get(clean(row.tower_id)) || "Tower"} ·{" "}
                  {clean(row.inspection_stage) || "Inspection"}
                </Text>
              </View>
              <QualityStatusPill value={rowStatus} />
            </View>

            <Text style={styles.meta}>
              {formatDate(row.inspection_date)} · {row.itemCount} finding
              {row.itemCount === 1 ? "" : "s"}
            </Text>

            {clean(row.client_reference) ? (
              <Text style={styles.meta}>
                Client ref: {clean(row.client_reference)}
              </Text>
            ) : null}
          </Pressable>
        );
      })}

      {nextOffset !== null ? (
        <Pressable
          style={styles.loadMore}
          disabled={loadingMore}
          onPress={() => void loadMore()}
        >
          {loadingMore ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text style={styles.loadMoreText}>Load more</Text>
          )}
        </Pressable>
      ) : null}

      <QualitySelector
        visible={selector === "tower"}
        title="Filter by tower"
        options={towerOptions}
        onClose={() => setSelector(null)}
        onSelect={(option) => {
          setTowerId(option.id);
          setMemberNumber("");
          setSelector(null);
        }}
      />
      <QualitySelector
        visible={selector === "member"}
        title="Filter by member"
        options={memberOptions}
        onClose={() => setSelector(null)}
        onSelect={(option) => {
          setMemberNumber(option.id);
          setSelector(null);
        }}
      />
      <QualitySelector
        visible={selector === "stage"}
        title="Filter by inspection stage"
        options={stageOptions}
        onClose={() => setSelector(null)}
        onSelect={(option) => {
          setInspectionStage(option.id);
          setSelector(null);
        }}
      />
    </QualityShell>
  );
}

function FilterSelect({
  label,
  value,
  disabled = false,
  onPress,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.selector, disabled && styles.selectorDisabled]}
      disabled={disabled}
      onPress={onPress}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.selectorLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.selectorValue}>
          {value}
        </Text>
      </View>
      <ChevronDown size={15} color={disabled ? "#cbd5e1" : "#64748b"} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: "row",
    gap: 8,
  },
  search: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    borderRadius: 13,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    color: "#0f172a",
  },
  newButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#2563eb",
    borderRadius: 13,
    paddingHorizontal: 14,
  },
  newText: {
    color: "#fff",
    fontWeight: "900",
  },
  selectorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  selector: {
    flexGrow: 1,
    flexBasis: 105,
    minHeight: 54,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  selectorDisabled: {
    opacity: 0.55,
  },
  selectorLabel: {
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  selectorValue: {
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  clearFilters: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 3,
  },
  clearFiltersText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "800",
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  filter: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  filterActive: {
    backgroundColor: "#0f172a",
  },
  filterText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "800",
  },
  filterTextActive: {
    color: "#fff",
  },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    padding: 15,
    gap: 7,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  number: {
    color: "#0f172a",
    fontWeight: "900",
    fontSize: 15,
  },
  tower: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 3,
    fontWeight: "700",
  },
  meta: {
    color: "#64748b",
    fontSize: 11,
  },
  empty: {
    alignItems: "center",
    padding: 30,
    backgroundColor: "#fff",
    borderRadius: 16,
  },
  emptyTitle: {
    marginTop: 9,
    color: "#64748b",
    fontWeight: "800",
  },
  error: {
    color: "#9a3412",
    backgroundColor: "#fff7ed",
    borderRadius: 12,
    padding: 10,
    fontSize: 11,
    fontWeight: "700",
  },
  loadMore: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  loadMoreText: {
    color: "#334155",
    fontWeight: "900",
    fontSize: 11,
  },
});

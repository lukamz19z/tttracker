import { useFocusEffect } from "@react-navigation/native";
import { router, type Href } from "expo-router";
import {
  AlertTriangle,
  Camera,
  ChevronDown,
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
import { SyncStatus } from "@/components/sync/SyncStatus";
import { useQuality } from "@/contexts/QualityContext";
import { useSync } from "@/contexts/SyncContext";
import {
  cachedQualityDefectList,
  cachedQualityMemberCatalog,
  listQualityDefects,
  refreshQualityMemberCatalog,
  type QualityMemberCatalogRow,
} from "@/lib/api/quality";
import type { QualityDefectListRow } from "@/types/quality";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export default function DefectsScreen() {
  const { data, loading: metadataLoading } =
    useQuality();
  const { online } = useSync();

  const projectId = clean(data?.projectId);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] =
    useState("");
  const [status, setStatus] = useState("All");
  const [towerId, setTowerId] = useState("");
  const [memberNumber, setMemberNumber] = useState("");
  const [issueTypeId, setIssueTypeId] = useState("");
  const [selector, setSelector] = useState<
    "tower" | "member" | "issue" | null
  >(null);
  const [memberCatalog, setMemberCatalog] = useState<
    QualityMemberCatalogRow[]
  >([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [rows, setRows] = useState<
    QualityDefectListRow[]
  >([]);
  const [nextOffset, setNextOffset] =
    useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedQuery(query.trim()),
      300,
    );
    return () => clearTimeout(timer);
  }, [query]);

  const towers = useMemo(
    () =>
      Array.isArray(data?.towers)
        ? data.towers
        : [],
    [data?.towers],
  );

  const issueTypes = useMemo(
    () =>
      Array.isArray(data?.issueTypes)
        ? data.issueTypes
        : [],
    [data?.issueTypes],
  );

  const defectStatuses =
    data?.workflow?.defectStatuses ?? [];

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

  const issueOptions = useMemo<QualitySelectorOption[]>(
    () => [
      { id: "", label: "All issue types" },
      ...issueTypes
        .filter((row) =>
          ["defect", "both"].includes(clean(row.applies_to)),
        )
        .map((row) => ({
          id: clean(row.id),
          label: clean(row.name) || "Issue",
        })),
    ],
    [issueTypes],
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
      const cached = await cachedQualityMemberCatalog(
        projectId,
        towerId,
      );

      if (active && cached?.value) {
        setMemberCatalog(cached.value);
      }

      if (online) {
        try {
          const latest = await refreshQualityMemberCatalog(
            projectId,
            towerId,
          );
          if (active) setMemberCatalog(latest);
        } catch {
          // Cached tower member list remains available offline / on poor reception.
        }
      }

      if (active) setMemberLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [online, projectId, towerId]);

  const towerById = useMemo(
    () =>
      new Map(
        towers.map((row) => [
          clean(row.id),
          clean(row.name) ||
            clean(row.id) ||
            "Tower",
        ]),
      ),
    [towers],
  );

  const issueById = useMemo(
    () =>
      new Map(
        issueTypes.map((row) => [
          clean(row.id),
          clean(row.name) || "Other",
        ]),
      ),
    [issueTypes],
  );

  const loadFirstPage = useCallback(async () => {
    if (!projectId) {
      setRows([]);
      setNextOffset(null);
      return;
    }

    setLoading(true);
    setError(null);

    let hadCache = false;

    try {
      const cached =
        await cachedQualityDefectList({
          projectId,
          query: debouncedQuery,
          status,
          towerId,
          memberNumber,
          issueTypeId,
          offset: 0,
        });

      if (cached?.value) {
        hadCache = true;
        setRows(cached.value.rows ?? []);
        setNextOffset(
          cached.value.nextOffset ?? null,
        );
      }

      if (!online) {
        if (!hadCache) {
          setError(
            "No cached Defect list is available while offline.",
          );
        }
        return;
      }

      const live = await listQualityDefects({
        projectId,
        query: debouncedQuery,
        status,
        towerId,
        memberNumber,
        issueTypeId,
        offset: 0,
        limit: 25,
      });

      setRows(live.rows ?? []);
      setNextOffset(live.nextOffset ?? null);
    } catch (loadError) {
      if (!hadCache) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Defects could not be loaded.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [
    debouncedQuery,
    issueTypeId,
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
    if (
      !projectId ||
      nextOffset === null ||
      loadingMore
    ) {
      return;
    }

    setLoadingMore(true);
    setError(null);

    try {
      let page:
        | Awaited<
            ReturnType<typeof listQualityDefects>
          >
        | null = null;

      if (online) {
        page = await listQualityDefects({
          projectId,
          query: debouncedQuery,
          status,
          towerId,
          memberNumber,
          issueTypeId,
          offset: nextOffset,
          limit: 25,
        });
      } else {
        const cached =
          await cachedQualityDefectList({
            projectId,
            query: debouncedQuery,
            status,
            towerId,
            memberNumber,
            issueTypeId,
            offset: nextOffset,
          });
        page = cached?.value ?? null;
      }

      if (!page) {
        setError(
          "More Defects are not cached on this device.",
        );
        return;
      }

      setRows((current) => {
        const byId = new Map(
          current.map((row) => [row.id, row]),
        );
        for (const row of page?.rows ?? []) {
          byId.set(row.id, row);
        }
        return Array.from(byId.values());
      });
      setNextOffset(page.nextOffset ?? null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "More Defects could not be loaded.",
      );
    } finally {
      setLoadingMore(false);
    }
  }, [
    debouncedQuery,
    issueTypeId,
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
      permission="mobile.defects"
      root
      title="Defects"
      subtitle="Search the controlled Defect register without downloading the full project history."
    >
      <View style={styles.syncRow}>
        <SyncStatus compact />
      </View>

      <View style={styles.topRow}>
        <View style={styles.search}>
          <Search size={17} color="#64748b" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Defect no., description, client reference…"
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
          />
        </View>

        <Pressable
          style={styles.newButton}
          onPress={() => router.push("/defects/new" as Href)}
        >
          <Plus size={18} color="#fff" />
          <Text style={styles.newText}>New</Text>
        </Pressable>
      </View>

      <View style={styles.selectorRow}>
        <FilterSelect
          label="Tower"
          value={
            towerId
              ? towerById.get(towerId) || "Tower"
              : "All towers"
          }
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
          label="Issue"
          value={
            issueTypeId
              ? issueById.get(issueTypeId) || "Issue"
              : "All issues"
          }
          onPress={() => setSelector("issue")}
        />
      </View>

      {towerId || memberNumber || issueTypeId ? (
        <Pressable
          style={styles.clearFilters}
          onPress={() => {
            setTowerId("");
            setMemberNumber("");
            setIssueTypeId("");
          }}
        >
          <X size={14} color="#475569" />
          <Text style={styles.clearFiltersText}>Clear tower / member / issue filters</Text>
        </Pressable>
      ) : null}

      <View style={styles.filters}>
        {["All", ...defectStatuses].map(
          (value) => (
            <Pressable
              key={value}
              style={[
                styles.filter,
                status === value &&
                  styles.filterActive,
              ]}
              onPress={() => setStatus(value)}
            >
              <Text
                style={[
                  styles.filterText,
                  status === value &&
                    styles.filterTextActive,
                ]}
              >
                {value}
              </Text>
            </Pressable>
          ),
        )}
      </View>

      {(metadataLoading || loading) &&
      rows.length === 0 ? (
        <ActivityIndicator />
      ) : null}

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}

      {!loading && rows.length === 0 ? (
        <View style={styles.empty}>
          <AlertTriangle
            size={30}
            color="#94a3b8"
          />
          <Text style={styles.emptyTitle}>
            No matching Defects
          </Text>
        </View>
      ) : null}

      {rows.map((row) => (
        <Pressable
          key={row.id}
          style={styles.card}
          onPress={() =>
            router.push(
              `/defects/${encodeURIComponent(row.id)}` as Href,
            )
          }
        >
          <View style={styles.cardHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.number}>
                {clean(row.defect_number) ||
                  "Defect"}
              </Text>

              <Text style={styles.tower}>
                {towerById.get(
                  clean(row.tower_id),
                ) || "Tower"}{" "}
                ·{" "}
                {issueById.get(
                  clean(row.issue_type_id),
                ) || "Other"}
              </Text>
            </View>

            <QualityStatusPill
              value={row.severity}
            />
          </View>

          <Text style={styles.description}>
            {clean(row.description) ||
              "No description"}
          </Text>

          <View style={styles.cardFoot}>
            <QualityStatusPill
              value={row.status}
            />

            {row.evidenceCount > 0 ? (
              <View style={styles.photoCount}>
                <Camera
                  size={12}
                  color="#64748b"
                />
                <Text
                  style={styles.photoCountText}
                >
                  {row.evidenceCount}
                </Text>
              </View>
            ) : null}

            <Text style={styles.meta}>
              {[
                clean(row.segment),
                clean(row.member_number)
                  ? `Member ${clean(
                      row.member_number,
                    )}`
                  : "",
                clean(row.assigned_to_label)
                  ? `Assigned ${clean(
                      row.assigned_to_label,
                    )}`
                  : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        </Pressable>
      ))}

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
        visible={selector === "issue"}
        title="Filter by issue type"
        options={issueOptions}
        onClose={() => setSelector(null)}
        onSelect={(option) => {
          setIssueTypeId(option.id);
          setSelector(null);
        }}
      />
    </QualityShell>
  );
}

function FilterSelect({
  label,
  value,
  disabled,
  onPress,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.filterSelect, disabled && styles.filterSelectDisabled]}
      disabled={disabled}
      onPress={onPress}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.filterSelectLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.filterSelectValue}>
          {value}
        </Text>
      </View>
      <ChevronDown size={16} color={disabled ? "#cbd5e1" : "#64748b"} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  syncRow: {
    alignItems: "flex-end",
    minHeight: 20,
  },
  topRow: {
    flexDirection: "row",
    gap: 8,
  },
  selectorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterSelect: {
    flexGrow: 1,
    flexBasis: 105,
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 13,
    backgroundColor: "#fff",
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  filterSelectDisabled: {
    opacity: 0.55,
    backgroundColor: "#f8fafc",
  },
  filterSelectLabel: {
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  filterSelectValue: {
    marginTop: 2,
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "800",
  },
  clearFilters: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  clearFiltersText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "800",
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
    gap: 8,
  },
  cardHead: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
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
  description: {
    color: "#334155",
    lineHeight: 19,
  },
  cardFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  photoCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  photoCountText: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
  },
  meta: {
    flex: 1,
    color: "#94a3b8",
    fontSize: 10,
    textAlign: "right",
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

import { Search, X } from "lucide-react-native";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  MaterialCard,
  MaterialsShell,
} from "@/components/materials/MaterialsShell";
import { useAuth } from "@/contexts/AuthContext";
import { useMaterials } from "@/contexts/MaterialsContext";
import {
  cachedMaterialSearch,
  searchMaterials,
  type MaterialSearchKind,
  type MaterialSearchResult,
} from "@/lib/api/materials-search";

const clean = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => clean(value).toLowerCase();

type ResultKind = MaterialSearchResult["kind"];
type ResultFilter = "all" | ResultKind;

type IndexedResult = {
  result: MaterialSearchResult;
  searchText: string;
};

function kindLabel(kind: ResultKind) {
  if (kind === "member") return "Member";
  if (kind === "bundle") return "Bundle";
  return "Bolt";
}

function buildLocalIndex(
  kind: MaterialSearchKind,
  data: ReturnType<typeof useMaterials>["data"],
  towerName: (towerId: unknown) => string,
): IndexedResult[] {
  if (!data) return [];

  const rows: IndexedResult[] = [];

  if (kind === "all" || kind === "member") {
    for (const row of data.members ?? []) {
      const towerId = clean(row.tower_id);
      const resolvedTowerName = towerName(towerId);
      const record = row as unknown as Record<string, unknown>;

      const result: MaterialSearchResult = {
        kind: "member",
        id: clean(row.id),
        towerId,
        towerName: resolvedTowerName,
        title: clean(row.mark_no) || clean(row.pn_final) || "Member",
        subtitle: [
          clean(row.bundle_reference) && `Bundle ${clean(row.bundle_reference)}`,
          clean(row.drawing_number) && `Drawing ${clean(row.drawing_number)}`,
          clean(row.tower_segment) || clean(row.section),
        ]
          .filter(Boolean)
          .join(" · "),
        meta: [
          resolvedTowerName,
          row.qty_per_tower != null
            ? `Qty/Tower ${clean(row.qty_per_tower)}`
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
        record,
      };

      rows.push({
        result,
        searchText: [
          row.mark_no,
          row.pn_final,
          row.bundle_reference,
          row.drawing_number,
          row.section,
          row.tower_segment,
          row.qty_per_tower,
          resolvedTowerName,
        ]
          .map(lower)
          .filter(Boolean)
          .join(" "),
      });
    }
  }

  if (kind === "all" || kind === "bundle") {
    for (const row of data.bundles ?? []) {
      const towerId = clean(row.tower_id);
      const resolvedTowerName = towerName(towerId);
      const record = row as unknown as Record<string, unknown>;

      const result: MaterialSearchResult = {
        kind: "bundle",
        id: clean(row.id),
        towerId,
        towerName: resolvedTowerName,
        title: `Bundle ${clean(row.bundle_no) || "—"}`,
        subtitle: [
          clean(row.section),
          row.qty_required != null ? `Qty ${clean(row.qty_required)}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        meta: resolvedTowerName,
        record,
      };

      rows.push({
        result,
        searchText: [
          row.bundle_no,
          row.section,
          row.qty_required,
          resolvedTowerName,
        ]
          .map(lower)
          .filter(Boolean)
          .join(" "),
      });
    }
  }

  if (kind === "all" || kind === "bolt") {
    for (const row of data.bolts ?? []) {
      const towerId = clean(row.tower_id);
      const resolvedTowerName = towerName(towerId);
      const record = row as unknown as Record<string, unknown>;

      const result: MaterialSearchResult = {
        kind: "bolt",
        id: clean(row.id),
        towerId,
        towerName: resolvedTowerName,
        title:
          [clean(row.bolt_diameter), clean(row.length)]
            .filter(Boolean)
            .join(" × ") || "Bolt",
        subtitle: [clean(row.dn_sn), clean(row.tower_segment)]
          .filter(Boolean)
          .join(" · "),
        meta: [
          resolvedTowerName,
          row.qty != null ? `Qty ${clean(row.qty)}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        record,
      };

      rows.push({
        result,
        searchText: [
          row.bolt_diameter,
          row.length,
          row.dn_sn,
          row.tower_segment,
          row.qty,
          resolvedTowerName,
        ]
          .map(lower)
          .filter(Boolean)
          .join(" "),
      });
    }
  }

  return rows;
}

function searchLocalIndex(
  index: IndexedResult[],
  query: string,
  limit: number,
) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const matches: MaterialSearchResult[] = [];

  for (const item of index) {
    if (!item.searchText.includes(q)) continue;
    matches.push(item.result);
    if (matches.length >= limit) break;
  }

  return matches;
}

export function MaterialLiveSearch({
  kind,
  title,
  subtitle,
  placeholder,
  limit = 60,
  showKind = false,
}: {
  kind: MaterialSearchKind;
  title: string;
  subtitle: string;
  placeholder: string;
  limit?: number;
  showKind?: boolean;
}) {
  const { profile } = useAuth();
  const { data, online, towerName } = useMaterials();
  const projectId = profile?.projectId ?? "";

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [results, setResults] = useState<MaterialSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const requestSequence = useRef(0);

  const localIndex = useMemo(
    () => buildLocalIndex(kind, data, towerName),
    [data, kind, towerName],
  );

  const localFallback = useMemo(
    () => searchLocalIndex(localIndex, deferredQuery, limit),
    [deferredQuery, limit, localIndex],
  );

  useEffect(() => {
    const trimmed = deferredQuery.trim();
    const sequence = ++requestSequence.current;

    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      setMessage(null);
      return;
    }

    // Give the user useful local results immediately instead of leaving the
    // screen blank while the live request is waiting for the debounce/API.
    setResults(localFallback.slice(0, limit));
    setMessage(null);

    const timer = setTimeout(() => {
      void (async () => {
        setSearching(true);

        try {
          if (!projectId) {
            if (sequence !== requestSequence.current) return;
            setMessage("Select a project first.");
            return;
          }

          if (!online) {
            const cached = await cachedMaterialSearch(
              projectId,
              trimmed,
              kind,
            );

            if (sequence !== requestSequence.current) return;

            const offlineResults = cached?.value.results?.length
              ? cached.value.results
              : localFallback;

            setResults(offlineResults.slice(0, limit));
            setMessage(
              offlineResults.length
                ? "Offline · showing cached project matches."
                : "Offline · no cached matches for this search.",
            );
            return;
          }

          try {
            const payload = await searchMaterials(
              projectId,
              trimmed,
              kind,
              limit,
            );

            if (sequence !== requestSequence.current) return;

            const liveResults = payload.results ?? [];
            setResults(
              liveResults.length
                ? liveResults.slice(0, limit)
                : localFallback.slice(0, limit),
            );
          } catch (error) {
            const cached = await cachedMaterialSearch(
              projectId,
              trimmed,
              kind,
            );

            if (sequence !== requestSequence.current) return;

            const fallback = cached?.value.results?.length
              ? cached.value.results
              : localFallback;

            setResults(fallback.slice(0, limit));
            setMessage(
              fallback.length
                ? "Live search unavailable · showing cached/local matches."
                : error instanceof Error
                  ? error.message
                  : "Material search could not be completed.",
            );
          }
        } finally {
          if (sequence === requestSequence.current) {
            setSearching(false);
          }
        }
      })();
    }, 250);

    return () => clearTimeout(timer);
  }, [deferredQuery, kind, limit, localFallback, online, projectId]);

  const filteredResults = useMemo(
    () =>
      resultFilter === "all"
        ? results
        : results.filter((result) => result.kind === resultFilter),
    [resultFilter, results],
  );

  const counts = useMemo(() => {
    const next = {
      all: results.length,
      member: 0,
      bundle: 0,
      bolt: 0,
    };

    for (const result of results) {
      next[result.kind] += 1;
    }

    return next;
  }, [results]);

  const trimmedLength = query.trim().length;
  const queryPending = query !== deferredQuery;

  function clearSearch() {
    requestSequence.current += 1;
    setQuery("");
    setResults([]);
    setSearching(false);
    setMessage(null);
    setResultFilter("all");
  }

  return (
    <MaterialsShell title={title} subtitle={subtitle}>
      <View style={styles.searchBox}>
        <Search size={18} color="#64748b" />

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
        />

        {searching || queryPending ? (
          <ActivityIndicator size="small" color="#64748b" />
        ) : query ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear material search"
            hitSlop={8}
            style={styles.clearButton}
            onPress={clearSearch}
          >
            <X size={17} color="#64748b" />
          </Pressable>
        ) : null}
      </View>

      {trimmedLength < 2 ? (
        <View style={styles.helperCard}>
          <Text style={styles.helperTitle}>Search the project register</Text>
          <Text style={styles.helperText}>
            Enter at least 2 characters. Search covers member numbers, bundle
            numbers, drawings, sections, tower segments and bolts.
          </Text>
        </View>
      ) : null}

      {kind === "all" && trimmedLength >= 2 && results.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.filterRow}
        >
          <FilterChip
            label="All"
            count={counts.all}
            active={resultFilter === "all"}
            onPress={() => setResultFilter("all")}
          />
          <FilterChip
            label="Members"
            count={counts.member}
            active={resultFilter === "member"}
            onPress={() => setResultFilter("member")}
          />
          <FilterChip
            label="Bundles"
            count={counts.bundle}
            active={resultFilter === "bundle"}
            onPress={() => setResultFilter("bundle")}
          />
          <FilterChip
            label="Bolts"
            count={counts.bolt}
            active={resultFilter === "bolt"}
            onPress={() => setResultFilter("bolt")}
          />
        </ScrollView>
      ) : null}

      {trimmedLength >= 2 && results.length ? (
        <View style={styles.resultHeader}>
          <Text style={styles.resultCount}>
            {filteredResults.length} result
            {filteredResults.length === 1 ? "" : "s"}
          </Text>
          {searching ? (
            <Text style={styles.liveText}>Updating live…</Text>
          ) : online ? (
            <Text style={styles.liveText}>Live + cached</Text>
          ) : (
            <Text style={styles.offlineText}>Offline cache</Text>
          )}
        </View>
      ) : null}

      {message ? <Text style={styles.message}>{message}</Text> : null}

      {!searching &&
      !queryPending &&
      trimmedLength >= 2 &&
      filteredResults.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No matches</Text>
          <Text style={styles.emptyText}>
            Try a bundle number, member mark, drawing number, tower section or
            bolt size.
          </Text>
        </View>
      ) : null}

      {filteredResults.map((result, index) => (
        <MaterialCard
          key={`${result.kind}:${result.id || index}`}
          title={
            showKind
              ? `${kindLabel(result.kind)}: ${result.title}`
              : result.title
          }
          subtitle={result.subtitle}
          meta={result.meta}
        />
      ))}
    </MaterialsShell>
  );
}

function FilterChip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.filterChip, active && styles.filterChipActive]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.filterChipText,
          active && styles.filterChipTextActive,
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.filterCount,
          active && styles.filterCountActive,
        ]}
      >
        <Text
          style={[
            styles.filterCountText,
            active && styles.filterCountTextActive,
          ]}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingHorizontal: 13,
  },
  input: {
    flex: 1,
    color: "#0f172a",
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "600",
  },
  clearButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  helperCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  helperTitle: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900",
  },
  helperText: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 11,
    lineHeight: 17,
  },
  filterRow: {
    gap: 7,
    paddingRight: 4,
  },
  filterChip: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    borderRadius: 999,
  },
  filterChipActive: {
    borderColor: "#60a5fa",
    backgroundColor: "#eff6ff",
  },
  filterChipText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "900",
  },
  filterChipTextActive: {
    color: "#1d4ed8",
  },
  filterCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  filterCountActive: {
    backgroundColor: "#dbeafe",
  },
  filterCountText: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "900",
  },
  filterCountTextActive: {
    color: "#1d4ed8",
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  resultCount: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "900",
  },
  liveText: {
    color: "#2563eb",
    fontSize: 10,
    fontWeight: "800",
  },
  offlineText: {
    color: "#b45309",
    fontSize: 10,
    fontWeight: "800",
  },
  message: {
    color: "#9a3412",
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    borderRadius: 11,
    padding: 10,
    fontSize: 11,
    fontWeight: "700",
  },
  emptyCard: {
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  emptyTitle: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "900",
  },
  emptyText: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },
});

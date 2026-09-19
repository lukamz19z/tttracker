import { Search } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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

function haystack(row: Record<string, unknown>) {
  return Object.values(row).map(clean).join(" ").toLowerCase();
}

function localResults(
  kind: MaterialSearchKind,
  data: ReturnType<typeof useMaterials>["data"],
  query: string,
  limit: number,
  towerName: (towerId: unknown) => string,
): MaterialSearchResult[] {
  if (!data) return [];

  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const results: MaterialSearchResult[] = [];

  if (kind === "all" || kind === "member") {
    for (const row of data.members ?? []) {
      const record = row as unknown as Record<string, unknown>;
      if (!haystack(record).includes(q)) continue;

      const towerId = clean(row.tower_id);
      results.push({
        kind: "member",
        id: clean(row.id),
        towerId,
        towerName: towerName(towerId),
        title: clean(row.mark_no) || clean(row.pn_final) || "Member",
        subtitle: [
          clean(row.bundle_reference) && `Bundle ${clean(row.bundle_reference)}`,
          clean(row.drawing_number) && `Drawing ${clean(row.drawing_number)}`,
          clean(row.tower_segment) || clean(row.section),
        ]
          .filter(Boolean)
          .join(" · "),
        meta: [
          towerName(towerId),
          row.qty_per_tower != null ? `Qty/Tower ${clean(row.qty_per_tower)}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        record,
      });

      if (results.length >= limit) return results;
    }
  }

  if (kind === "all" || kind === "bundle") {
    for (const row of data.bundles ?? []) {
      const record = row as unknown as Record<string, unknown>;
      if (!haystack(record).includes(q)) continue;

      const towerId = clean(row.tower_id);
      results.push({
        kind: "bundle",
        id: clean(row.id),
        towerId,
        towerName: towerName(towerId),
        title: `Bundle ${clean(row.bundle_no) || "—"}`,
        subtitle: [
          clean(row.section),
          row.qty_required != null ? `Qty ${clean(row.qty_required)}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        meta: towerName(towerId),
        record,
      });

      if (results.length >= limit) return results;
    }
  }

  if (kind === "all" || kind === "bolt") {
    for (const row of data.bolts ?? []) {
      const record = row as unknown as Record<string, unknown>;
      if (!haystack(record).includes(q)) continue;

      const towerId = clean(row.tower_id);
      results.push({
        kind: "bolt",
        id: clean(row.id),
        towerId,
        towerName: towerName(towerId),
        title:
          [clean(row.bolt_diameter), clean(row.length)].filter(Boolean).join(" × ") ||
          "Bolt",
        subtitle: [clean(row.dn_sn), clean(row.tower_segment)]
          .filter(Boolean)
          .join(" · "),
        meta: [
          towerName(towerId),
          row.qty != null ? `Qty ${clean(row.qty)}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        record,
      });

      if (results.length >= limit) return results;
    }
  }

  return results.slice(0, limit);
}

function kindLabel(kind: MaterialSearchResult["kind"]) {
  if (kind === "member") return "Member";
  if (kind === "bundle") return "Bundle";
  return "Bolt";
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
  const [results, setResults] = useState<MaterialSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const localFallback = useMemo(
    () => localResults(kind, data, query, limit, towerName),
    [data, kind, limit, query, towerName],
  );

  useEffect(() => {
    const trimmed = query.trim();
    const sequence = ++requestSequence.current;

    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      setMessage(null);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        setSearching(true);
        setMessage(null);

        try {
          if (!projectId) {
            setResults([]);
            setMessage("Select a project first.");
            return;
          }

          if (!online) {
            const cached = await cachedMaterialSearch(projectId, trimmed, kind);
            if (sequence !== requestSequence.current) return;

            const offlineResults = cached?.value.results?.length
              ? cached.value.results
              : localFallback;

            setResults(offlineResults.slice(0, limit));
            setMessage(
              offlineResults.length
                ? "Offline · showing cached material matches."
                : "Offline · no cached matches for this search.",
            );
            return;
          }

          try {
            const payload = await searchMaterials(projectId, trimmed, kind, limit);
            if (sequence !== requestSequence.current) return;
            setResults(payload.results ?? []);
          } catch (error) {
            const cached = await cachedMaterialSearch(projectId, trimmed, kind);
            if (sequence !== requestSequence.current) return;

            const fallback = cached?.value.results?.length
              ? cached.value.results
              : localFallback;

            setResults(fallback.slice(0, limit));
            setMessage(
              fallback.length
                ? "Live search was unavailable · showing cached matches."
                : error instanceof Error
                  ? error.message
                  : "Material search could not be completed.",
            );
          }
        } finally {
          if (sequence === requestSequence.current) setSearching(false);
        }
      })();
    }, 300);

    return () => clearTimeout(timer);
  }, [kind, limit, localFallback, online, projectId, query]);

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
          style={styles.input}
        />
        {searching ? <ActivityIndicator size="small" /> : null}
      </View>

      {query.trim().length < 2 ? (
        <Text style={styles.hint}>
          Enter at least 2 characters. TTTracker searches the project register only after you pause typing.
        </Text>
      ) : null}

      {message ? <Text style={styles.message}>{message}</Text> : null}

      {!searching && query.trim().length >= 2 && results.length === 0 ? (
        <Text style={styles.empty}>No matches.</Text>
      ) : null}

      {results.map((result, index) => (
        <MaterialCard
          key={`${result.kind}:${result.id || index}`}
          title={showKind ? `${kindLabel(result.kind)}: ${result.title}` : result.title}
          subtitle={result.subtitle}
          meta={result.meta}
        />
      ))}
    </MaterialsShell>
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
    borderRadius: 13,
    paddingHorizontal: 13,
  },
  input: {
    flex: 1,
    color: "#0f172a",
    paddingVertical: 12,
    fontSize: 14,
  },
  hint: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
  },
  message: {
    color: "#9a3412",
    backgroundColor: "#fff7ed",
    borderRadius: 11,
    padding: 10,
    fontSize: 11,
    fontWeight: "700",
  },
  empty: {
    color: "#64748b",
    textAlign: "center",
    paddingVertical: 28,
  },
});

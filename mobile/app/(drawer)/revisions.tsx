
import { router, type Href } from "expo-router";
import { ClipboardCheck, Plus, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { QualityShell } from "@/components/quality/QualityShell";
import { QualityStatusPill } from "@/components/quality/QualityStatusPill";
import { QualityProvider, useQuality } from "@/contexts/QualityContext";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function formatDate(value: unknown) {
  const raw = clean(value);
  if (!raw) return "—";

  const date = new Date(
    raw.length <= 10 ? `${raw.slice(0, 10)}T00:00:00` : raw,
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

function RevisionsScreenContent() {
  const { data, loading } = useQuality();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");

  const towers = Array.isArray(data?.towers) ? data.towers : [];
  const revisions = Array.isArray(data?.revisions) ? data.revisions : [];
  const items = Array.isArray(data?.items) ? data.items : [];

  const revisionStatuses = Array.isArray(data?.workflow?.revisionStatuses)
    ? data.workflow.revisionStatuses.filter(
        (value): value is NonNullable<typeof value> =>
          typeof value === "string" && value.trim().length > 0,
      )
    : [];

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

  const itemCounts = useMemo(() => {
    const map = new Map<string, number>();

    for (const item of items) {
      const revisionId = clean(item?.revision_id);
      if (!revisionId) continue;

      map.set(revisionId, (map.get(revisionId) ?? 0) + 1);
    }

    return map;
  }, [items]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return revisions.filter((row) => {
      if (!row || typeof row !== "object") return false;

      const rowStatus = clean(row.status);

      if (status !== "All" && rowStatus !== status) {
        return false;
      }

      if (!q) return true;

      return [
        row.fli_number,
        row.inspection_stage,
        row.client_inspector,
        row.client_company,
        row.client_reference,
        row.notes,
        towerById.get(clean(row.tower_id)),
      ]
        .map(clean)
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [query, revisions, status, towerById]);

  return (
    <QualityShell
      permission="mobile.rectifications"
      root
      title="Revisions / Rectifications"
      subtitle="Capture flags, before evidence and rectification evidence against the same Revision register used on the website."
    >
      <View style={styles.topRow}>
        <View style={styles.search}>
          <Search size={17} color="#64748b" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search revision, tower, reference…"
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

      {loading && !data ? <ActivityIndicator /> : null}

      {!loading && rows.length === 0 ? (
        <View style={styles.empty}>
          <ClipboardCheck size={30} color="#94a3b8" />
          <Text style={styles.emptyTitle}>No matching Revisions</Text>
        </View>
      ) : null}

      {rows.map((row) => {
        const rowId = clean(row.id);
        const rowStatus = clean(row.status) || "Unknown";
        const findingCount = itemCounts.get(rowId) ?? 0;

        return (
          <Pressable
            key={rowId || `revision-${clean(row.sequence_no)}`}
            style={styles.card}
            onPress={() => {
              if (!rowId) return;
              router.push(
                `/revisions/${encodeURIComponent(rowId)}` as Href,
              );
            }}
          >
            <View style={styles.cardHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.number}>
                  {clean(row.fli_number) || "Revision"}
                </Text>

                <Text style={styles.tower}>
                  {towerById.get(clean(row.tower_id)) || "Tower"} ·{" "}
                  {clean(row.inspection_stage) || "Inspection"}
                </Text>
              </View>

              <QualityStatusPill value={rowStatus} />
            </View>

            <Text style={styles.meta}>
              {formatDate(row.inspection_date)} · {findingCount} finding
              {findingCount === 1 ? "" : "s"}
            </Text>

            {clean(row.client_reference) ? (
              <Text style={styles.meta}>
                Client ref: {clean(row.client_reference)}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </QualityShell>
  );
}

export default function RevisionsScreen() {
  return (
    <QualityProvider>
      <RevisionsScreenContent />
    </QualityProvider>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", gap: 8 },
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
  searchInput: { flex: 1, minHeight: 44, color: "#0f172a" },
  newButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#2563eb",
    borderRadius: 13,
    paddingHorizontal: 14,
  },
  newText: { color: "#fff", fontWeight: "900" },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  filter: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  filterActive: { backgroundColor: "#0f172a" },
  filterText: { color: "#475569", fontSize: 11, fontWeight: "800" },
  filterTextActive: { color: "#fff" },
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
  number: { color: "#0f172a", fontWeight: "900", fontSize: 15 },
  tower: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 3,
    fontWeight: "700",
  },
  meta: { color: "#64748b", fontSize: 11 },
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
});


import { router, type Href } from "expo-router";
import { AlertTriangle, Plus, Search } from "lucide-react-native";
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

function DefectsScreenContent() {
  const { data, loading } = useQuality();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");

  const towers = Array.isArray(data?.towers) ? data.towers : [];
  const issueTypes = Array.isArray(data?.issueTypes) ? data.issueTypes : [];
  const defects = Array.isArray(data?.defects) ? data.defects : [];

  const defectStatuses = Array.isArray(data?.workflow?.defectStatuses)
    ? data.workflow.defectStatuses.filter(
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

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return defects.filter((row) => {
      if (!row || typeof row !== "object") return false;

      const rowStatus = clean(row.status);

      if (status !== "All" && rowStatus !== status) {
        return false;
      }

      if (!q) return true;

      return [
        row.defect_number,
        row.description,
        row.member_number,
        row.segment,
        row.drawing_number,
        row.client_reference,
        towerById.get(clean(row.tower_id)),
        issueById.get(clean(row.issue_type_id)),
      ]
        .map(clean)
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [defects, issueById, query, status, towerById]);

  return (
    <QualityShell
      permission="mobile.defects"
      root
      title="Defects"
      subtitle="The same controlled Defect register used on the website, with project configuration cached for field use."
    >
      <View style={styles.topRow}>
        <View style={styles.search}>
          <Search size={17} color="#64748b" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search defect, tower, member…"
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

      <View style={styles.filters}>
        {["All", ...defectStatuses].map((value) => (
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
          <AlertTriangle size={30} color="#94a3b8" />
          <Text style={styles.emptyTitle}>No matching Defects</Text>
        </View>
      ) : null}

      {rows.map((row) => {
        const rowId = clean(row.id);

        return (
          <Pressable
            key={rowId || `defect-${clean(row.sequence_no)}`}
            style={styles.card}
            onPress={() => {
              if (!rowId) return;
              router.push(
                `/defects/${encodeURIComponent(rowId)}` as Href,
              );
            }}
          >
            <View style={styles.cardHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.number}>
                  {clean(row.defect_number) || "Defect"}
                </Text>

                <Text style={styles.tower}>
                  {towerById.get(clean(row.tower_id)) || "Tower"} ·{" "}
                  {issueById.get(clean(row.issue_type_id)) || "Other"}
                </Text>
              </View>

              <QualityStatusPill value={row.severity} />
            </View>

            <Text style={styles.description}>
              {clean(row.description) || "No description"}
            </Text>

            <View style={styles.cardFoot}>
              <QualityStatusPill value={row.status} />

              <Text style={styles.meta}>
                {[
                  clean(row.segment),
                  clean(row.member_number)
                    ? `Member ${clean(row.member_number)}`
                    : "",
                  clean(row.assigned_to_label)
                    ? `Assigned ${clean(row.assigned_to_label)}`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </QualityShell>
  );
}

export default function DefectsScreen() {
  return (
    <QualityProvider>
      <DefectsScreenContent />
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
    gap: 8,
  },
  cardHead: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  number: { color: "#0f172a", fontWeight: "900", fontSize: 15 },
  tower: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 3,
    fontWeight: "700",
  },
  description: { color: "#334155", lineHeight: 19 },
  cardFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
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
});

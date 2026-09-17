import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from "react-native";

import {
  MaterialCard,
  MaterialsShell,
} from "@/components/materials/MaterialsShell";
import { TowerPicker } from "@/components/materials/TowerPicker";
import { useMaterials } from "@/contexts/MaterialsContext";
import type {
  BoltRecord,
  BundleRecord,
  MemberRecord,
} from "@/types/materials";

const clean = (value: unknown) => String(value ?? "").trim();

type Kind = "all" | "member" | "bundle" | "bolt";

type SearchRow =
  | { type: "member"; row: MemberRecord }
  | { type: "bundle"; row: BundleRecord }
  | { type: "bolt"; row: BoltRecord };

export default function MaterialSearch() {
  const { data, towerName } = useMaterials();
  const [query, setQuery] = useState("");
  const [towerId, setTowerId] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [visibleCount, setVisibleCount] = useState(25);

  useEffect(() => {
    setVisibleCount(25);
  }, [kind, query, towerId]);

  const rows = useMemo<SearchRow[]>(() => {
    const search = query.trim().toLowerCase();

    if (search.length < 2 || !data) return [];

    const matches: SearchRow[] = [];
    const maxMatches = 100;

    const searchable = (row: Record<string, unknown>, rowTowerId: unknown) =>
      [
        ...Object.values(row),
        towerName(rowTowerId),
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(search);

    if (kind === "all" || kind === "member") {
      for (const row of data.members) {
        if (matches.length >= maxMatches) break;
        if (towerId && clean(row.tower_id) !== towerId) continue;
        if (searchable(row, row.tower_id)) {
          matches.push({ type: "member", row });
        }
      }
    }

    if (kind === "all" || kind === "bundle") {
      for (const row of data.bundles) {
        if (matches.length >= maxMatches) break;
        if (towerId && clean(row.tower_id) !== towerId) continue;
        if (searchable(row, row.tower_id)) {
          matches.push({ type: "bundle", row });
        }
      }
    }

    if (kind === "all" || kind === "bolt") {
      for (const row of data.bolts) {
        if (matches.length >= maxMatches) break;
        if (towerId && clean(row.tower_id) !== towerId) continue;
        if (searchable(row, row.tower_id)) {
          matches.push({ type: "bolt", row });
        }
      }
    }

    return matches;
  }, [data, kind, query, towerId, towerName]);

  return (
    <MaterialsShell
      title="Search"
      subtitle="Search the cached material register. Enter at least two characters; results are deliberately capped to keep the app responsive."
    >
      <TowerPicker
        towers={data?.towers ?? []}
        value={towerId}
        onChange={setTowerId}
        towerName={towerName}
        label="Tower"
        allowAll
      />

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Member, bundle, drawing, segment, bolt…"
        style={styles.input}
        autoCapitalize="none"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        <Chip label="All" active={kind === "all"} onPress={() => setKind("all")} />
        <Chip
          label="Members"
          active={kind === "member"}
          onPress={() => setKind("member")}
        />
        <Chip
          label="Bundles"
          active={kind === "bundle"}
          onPress={() => setKind("bundle")}
        />
        <Chip
          label="Bolts"
          active={kind === "bolt"}
          onPress={() => setKind("bolt")}
        />
      </ScrollView>

      {query.trim().length > 0 && query.trim().length < 2 ? (
        <Text style={styles.none}>Enter at least two characters.</Text>
      ) : null}

      {query.trim().length >= 2 && !rows.length ? (
        <Text style={styles.none}>No matches.</Text>
      ) : null}

      {rows.slice(0, visibleCount).map((item, index) => {
        const row = item.row;
        const tower = towerName(row.tower_id);

        if (item.type === "member") {
          return (
            <MaterialCard
              key={`member-${clean(row.id) || index}`}
              title={`Member: ${clean(row.mark_no) || "—"}`}
              subtitle={[
                `Bundle ${clean(row.bundle_reference) || "—"}`,
                clean(row.drawing_number),
                clean(row.tower_segment),
              ]
                .filter(Boolean)
                .join(" · ")}
              meta={`${tower} · Qty/Tower ${clean(row.qty_per_tower) || "—"}`}
            />
          );
        }

        if (item.type === "bundle") {
          return (
            <MaterialCard
              key={`bundle-${clean(row.id) || index}`}
              title={`Bundle ${clean(row.bundle_no) || "—"}`}
              subtitle={[
                clean(row.section) || "General",
                `Required ${clean(row.qty_required) || "0"}`,
              ].join(" · ")}
              meta={tower}
            />
          );
        }

        return (
          <MaterialCard
            key={`bolt-${clean(row.id) || index}`}
            title={
              [clean(row.bolt_diameter), clean(row.length)]
                .filter(Boolean)
                .join(" × ") || "Bolt"
            }
            subtitle={[
              clean(row.tower_segment),
              clean(row.dn_sn),
              `Qty ${clean(row.qty) || "0"}`,
            ]
              .filter(Boolean)
              .join(" · ")}
            meta={tower}
          />
        );
      })}

      {rows.length > visibleCount ? (
        <Pressable
          style={styles.loadMore}
          onPress={() => setVisibleCount((count) => count + 25)}
        >
          <Text style={styles.loadMoreText}>
            Load 25 more · {rows.length - visibleCount} remaining
          </Text>
        </Pressable>
      ) : null}

      {rows.length === 100 ? (
        <Text style={styles.limit}>
          Showing the first 100 matches. Refine the search to narrow it further.
        </Text>
      ) : null}
    </MaterialsShell>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    borderRadius: 13,
    padding: 13,
  },
  filters: {
    gap: 6,
    paddingRight: 12,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  chipActive: {
    backgroundColor: "#dbeafe",
    borderColor: "#60a5fa",
  },
  chipText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#475569",
  },
  chipTextActive: {
    color: "#1d4ed8",
  },
  none: {
    color: "#64748b",
    textAlign: "center",
    padding: 24,
  },
  loadMore: {
    minHeight: 43,
    borderWidth: 1,
    borderColor: "#94a3b8",
    backgroundColor: "#fff",
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreText: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "900",
  },
  limit: {
    textAlign: "center",
    color: "#64748b",
    fontSize: 10,
  },
});

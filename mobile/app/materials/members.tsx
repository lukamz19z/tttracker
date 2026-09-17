import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
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

const clean = (value: unknown) => String(value ?? "").trim();

export default function Members() {
  const { data, towerName, memberCheckFor } = useMaterials();
  const [query, setQuery] = useState("");
  const [towerId, setTowerId] = useState("");
  const [visibleCount, setVisibleCount] = useState(30);

  useEffect(() => {
    setVisibleCount(30);
  }, [query, towerId]);

  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!towerId && search.length < 2) return [];

    return (data?.members ?? []).filter((row) => {
      if (towerId && clean(row.tower_id) !== towerId) return false;
      if (!search) return true;

      return [
        row.mark_no,
        row.bundle_reference,
        row.drawing_number,
        row.section,
        row.tower_segment,
        towerName(row.tower_id),
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [data?.members, query, towerId, towerName]);

  return (
    <MaterialsShell
      title="Members"
      subtitle="Select a tower or search at least two characters. Results are loaded in small batches to keep the app fast."
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
        style={styles.input}
        placeholder="Member no, bundle, drawing, segment…"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />

      {!towerId && query.trim().length < 2 ? (
        <Text style={styles.prompt}>
          Select a tower or enter at least two search characters.
        </Text>
      ) : null}

      {rows.slice(0, visibleCount).map((row, index) => {
        const check = memberCheckFor(row);

        return (
          <MaterialCard
            key={clean(row.id) || String(index)}
            title={clean(row.mark_no) || "Member"}
            subtitle={[
              `Bundle ${clean(row.bundle_reference) || "—"}`,
              clean(row.drawing_number),
              clean(row.tower_segment),
            ]
              .filter(Boolean)
              .join(" · ")}
            meta={[
              towerName(row.tower_id),
              `Qty/Tower ${clean(row.qty_per_tower) || "—"}`,
              check?.status
                ? `Site: ${clean(check.status).replaceAll("_", " ")}`
                : "Site: not checked",
            ].join(" · ")}
          />
        );
      })}

      {rows.length > visibleCount ? (
        <Pressable
          style={styles.loadMore}
          onPress={() => setVisibleCount((count) => count + 30)}
        >
          <Text style={styles.loadMoreText}>
            Load 30 more · {rows.length - visibleCount} remaining
          </Text>
        </Pressable>
      ) : null}

      {(towerId || query.trim().length >= 2) && !rows.length ? (
        <Text style={styles.none}>No members found.</Text>
      ) : null}
    </MaterialsShell>
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
  prompt: {
    color: "#64748b",
    backgroundColor: "#f8fafc",
    borderRadius: 11,
    padding: 12,
    textAlign: "center",
    fontSize: 11,
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
  none: {
    color: "#64748b",
    textAlign: "center",
    padding: 24,
  },
});

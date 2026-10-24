import { compareBundles } from "@/lib/materials-sort";
import { Search, X } from "lucide-react-native";
import { useDeferredValue, useMemo, useState } from "react";
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
import { TowerPicker } from "@/components/materials/TowerPicker";
import { useMaterials } from "@/contexts/MaterialsContext";
import {
  type MaterialMemberSearchField,
  type MaterialSearchKind,
  type MaterialSearchResult,
} from "@/lib/api/materials-search";

const clean = (value: unknown) => String(value ?? "").trim();

const KIND_OPTIONS: { value: MaterialSearchKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "member", label: "Members" },
  { value: "bundle", label: "Bundles" },
  { value: "bolt", label: "Bolts" },
];

const MEMBER_FIELD_OPTIONS: {
  value: MaterialMemberSearchField;
  label: string;
}[] = [
  { value: "all", label: "All fields" },
  { value: "mark", label: "Member No." },
  { value: "pn", label: "Part No." },
  { value: "drawing", label: "Drawing" },
  { value: "bundle", label: "Bundle" },
  { value: "segment", label: "Segment" },
];

function valueMatches(value: unknown, query: string) {
  return clean(value).toLowerCase().includes(query);
}

function memberMatches(
  row: Record<string, unknown>,
  query: string,
  field: MaterialMemberSearchField,
) {
  if (field === "mark") return valueMatches(row.mark_no, query);
  if (field === "pn") return valueMatches(row.pn_final, query);
  if (field === "drawing") return valueMatches(row.drawing_number, query);
  if (field === "bundle") return valueMatches(row.bundle_reference, query);
  if (field === "segment") {
    return (
      valueMatches(row.tower_segment, query) ||
      valueMatches(row.section, query)
    );
  }

  if (typeof row.search_text === "string") return row.search_text.includes(query);
  return [
    row.mark_no,
    row.pn_final,
    row.bundle_reference,
    row.drawing_number,
    row.section,
    row.tower_segment,
  ].some((value) => valueMatches(value, query));
}

function localResults(
  kind: MaterialSearchKind,
  data: ReturnType<typeof useMaterials>["data"],
  query: string,
  limit: number,
  towerName: (towerId: unknown) => string,
  towerIdFilter: string,
  memberField: MaterialMemberSearchField,
): MaterialSearchResult[] {
  if (!data) return [];

  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const results: MaterialSearchResult[] = [];
  const towerMatches = (towerId: unknown) =>
    !towerIdFilter || clean(towerId) === towerIdFilter;

  if (kind === "all" || kind === "member") {
    for (const row of data.members ?? []) {
      if (!towerMatches(row.tower_id)) continue;

      const record = row as unknown as Record<string, unknown>;
      if (!memberMatches(record, q, memberField)) continue;

      const towerId = clean(row.tower_id);
      results.push({
        kind: "member",
        id: clean(row.id),
        towerId,
        towerName: towerName(towerId),
        title: clean(row.mark_no) || clean(row.pn_final) || "Member",
        subtitle: [
          clean(row.pn_final) && `PN ${clean(row.pn_final)}`,
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
      if (!towerMatches(row.tower_id)) continue;

      const record = row as unknown as Record<string, unknown>;
      const matches = [row.bundle_no, row.section].some((value) =>
        valueMatches(value, q),
      );
      if (!matches) continue;

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
      if (!towerMatches(row.tower_id)) continue;

      const record = row as unknown as Record<string, unknown>;
      const matches = [
        row.bolt_diameter,
        row.dn_sn,
        row.length,
        row.tower_segment,
      ].some((value) => valueMatches(value, q));
      if (!matches) continue;

      const towerId = clean(row.tower_id);
      results.push({
        kind: "bolt",
        id: clean(row.id),
        towerId,
        towerName: towerName(towerId),
        title:
          [clean(row.bolt_diameter), clean(row.length)]
            .filter(Boolean)
            .join(" × ") || "Bolt",
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

function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.filterBlock}>
      <Text style={styles.filterLabel}>{label.toUpperCase()}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.chips}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange(option.value)}
            >
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
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
  const { data, online, towerName } = useMaterials();

  const [query, setQuery] = useState("");
  const [towerId, setTowerId] = useState("");
  const [kindFilter, setKindFilter] = useState<MaterialSearchKind>(kind);
  const [memberField, setMemberField] =
    useState<MaterialMemberSearchField>("all");
  const deferredQuery = useDeferredValue(query);
  const searching = false;
  const message = !online ? "Offline - searching cached project materials." : null;

  const towers = useMemo(() => data?.towers ?? [], [data?.towers]);
  const effectiveKind = kind === "all" ? kindFilter : kind;
  const effectiveMemberField =
    effectiveKind === "member" ? memberField : "all";

  const indexed = useMemo(() => ({
    ...data,
    members: (data?.members || []).map((row) => ({ ...row, search_text: [row.mark_no, row.pn_final, row.bundle_reference, row.drawing_number, row.section, row.tower_segment].map(clean).join(" ").toLowerCase() })),
    bundles: [...(data?.bundles || [])].sort(compareBundles),
    bolts: data?.bolts || [],
  }), [data]);
  const results = useMemo(() => localResults(effectiveKind, indexed as NonNullable<typeof data>, deferredQuery, limit, towerName, towerId, effectiveMemberField), [indexed, deferredQuery, effectiveKind, limit, towerName, towerId, effectiveMemberField]);

  return (
    <MaterialsShell title={title} subtitle={subtitle} items={results.map((result, index) => (
        <MaterialCard
          key={`${result.kind}:${result.id || index}`}
          title={showKind ? `${kindLabel(result.kind)}: ${result.title}` : result.title}
          subtitle={result.subtitle}
          meta={result.meta}
        />
      ))}>
      <View style={styles.filterCard}>
        <TowerPicker
          towers={towers}
          value={towerId}
          onChange={setTowerId}
          towerName={towerName}
          label="Tower"
          allowAll
        />

        {kind === "all" ? (
          <FilterChips
            label="Material type"
            options={KIND_OPTIONS}
            value={kindFilter}
            onChange={(next) => {
              setKindFilter(next);
              if (next !== "member") setMemberField("all");
            }}
          />
        ) : null}

        {effectiveKind === "member" ? (
          <FilterChips
            label="Search field"
            options={MEMBER_FIELD_OPTIONS}
            value={memberField}
            onChange={setMemberField}
          />
        ) : null}

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
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <X size={17} color="#94a3b8" />
            </Pressable>
          ) : null}
          {searching ? <ActivityIndicator size="small" /> : null}
        </View>

        <Text style={styles.selectionSummary}>
          {towerId ? towerName(towerId) : "All Towers"}
          {" · "}
          {effectiveKind === "all"
            ? "All material types"
            : effectiveKind === "member"
              ? `Members · ${MEMBER_FIELD_OPTIONS.find((x) => x.value === memberField)?.label ?? "All fields"}`
              : effectiveKind === "bundle"
                ? "Bundles"
                : "Bolts"}
        </Text>
      </View>

      {query.trim().length < 2 ? (
        <Text style={styles.hint}>
          Select a tower and filter first, then enter at least 2 characters.
          TTTracker only searches the selected part of the register.
        </Text>
      ) : null}

      {message ? <Text style={styles.message}>{message}</Text> : null}

      {!searching && query.trim().length >= 2 && results.length === 0 ? (
        <Text style={styles.empty}>No matches for the selected filters.</Text>
      ) : null}

      {results.length > 0 ? (
        <Text style={styles.resultCount}>
          {results.length} {results.length === 1 ? "result" : "results"}
        </Text>
      ) : null}

    </MaterialsShell>
  );
}

const styles = StyleSheet.create({
  filterCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    borderRadius: 15,
    padding: 11,
    gap: 10,
  },
  filterBlock: {
    gap: 6,
  },
  filterLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  chips: {
    gap: 7,
    paddingRight: 8,
  },
  chip: {
    minHeight: 36,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    borderRadius: 999,
    paddingHorizontal: 12,
  },
  chipActive: {
    borderColor: "#0f172a",
    backgroundColor: "#0f172a",
  },
  chipText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
  },
  chipTextActive: {
    color: "#ffffff",
  },
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
  selectionSummary: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
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
  resultCount: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
  },
  empty: {
    color: "#64748b",
    textAlign: "center",
    paddingVertical: 28,
  },
});

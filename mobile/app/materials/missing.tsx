import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  MaterialCard,
  MaterialsShell,
} from "@/components/materials/MaterialsShell";
import { MaterialRegisterFilters } from "@/components/materials/MaterialRegisterFilters";
import { useMaterials } from "@/contexts/MaterialsContext";

const clean = (value: unknown) => String(value ?? "").trim();
const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const INCLUDED_TYPES = new Set([
  "missing",
  "found_received",
  "excess",
  "damaged_incorrect",
]);

function eventLabel(value: unknown) {
  const type = clean(value);
  if (type === "missing") return "Missing";
  if (type === "found_received") return "Found / Received";
  if (type === "excess") return "Excess";
  if (type === "damaged_incorrect") return "Damaged / Incorrect";
  return type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return `${String(date.getDate()).padStart(2, "0")}-${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}-${date.getFullYear()}`;
}

type MaterialEventRow = Record<string, unknown>;
type MaterialItemRow = Record<string, unknown>;

type IndexedIssue = {
  event: MaterialEventRow;
  id: string;
  towerId: string;
  type: string;
  section: string;
  occurredAt: string;
  items: MaterialItemRow[];
  search: string;
};

function eventItems(event: MaterialEventRow): MaterialItemRow[] {
  const nested = event.tower_material_event_items;
  if (Array.isArray(nested)) return nested as MaterialItemRow[];

  const items = event.items;
  return Array.isArray(items) ? (items as MaterialItemRow[]) : [];
}

function itemTitle(item: MaterialItemRow) {
  return (
    clean(item.item_reference) ||
    clean(item.bolt_size) ||
    clean(item.bundle_no) ||
    clean(item.item_description) ||
    "Material item"
  );
}

export default function MissingMaterials() {
  const { data, towerName } = useMaterials();

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [towerId, setTowerId] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [visibleCount, setVisibleCount] = useState(16);

  const indexed = useMemo<IndexedIssue[]>(() => {
    const rows = ((data?.materialEvents ?? []) as unknown as MaterialEventRow[])
      .filter((event) => INCLUDED_TYPES.has(clean(event.event_type)))
      .map((event, index) => {
        const items = eventItems(event);
        const issueTowerId = clean(event.tower_id);
        const type = clean(event.event_type);
        const section =
          clean(event.affected_section) ||
          clean(event.affected_activity) ||
          clean(items[0]?.bundle_section) ||
          "General";
        const occurredAt = clean(event.occurred_at);

        const itemSearch = items
          .flatMap((item) => [
            item.item_reference,
            item.item_description,
            item.material_type,
            item.bolt_size,
            item.bundle_no,
            item.bundle_section,
          ])
          .map(clean)
          .join(" ");

        return {
          event,
          id: clean(event.id) || `event-${index}`,
          towerId: issueTowerId,
          type,
          section,
          occurredAt,
          items,
          search: [
            eventLabel(type),
            towerName(issueTowerId),
            section,
            event.notes,
            event.current_effect,
            event.work_outcome,
            itemSearch,
          ]
            .map(clean)
            .join(" ")
            .toLowerCase(),
        };
      });

    return rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [data?.materialEvents, towerName]);

  const typeOptions = useMemo(() => {
    const counts = new Map<string, number>();

    for (const row of indexed) {
      if (towerId && row.towerId !== towerId) continue;
      counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
    }

    const preferred = [
      "missing",
      "found_received",
      "excess",
      "damaged_incorrect",
    ];

    const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);

    return [
      { value: "", label: "All Issues", count: total },
      ...preferred
        .filter((value) => counts.has(value))
        .map((value) => ({
          value,
          label: eventLabel(value),
          count: counts.get(value) ?? 0,
        })),
    ];
  }, [indexed, towerId]);

  useEffect(() => {
    setVisibleCount(16);
  }, [deferredQuery, towerId, typeFilter]);

  useEffect(() => {
    if (!typeFilter) return;
    if (typeOptions.some((option) => option.value === typeFilter)) return;
    setTypeFilter("");
  }, [typeFilter, typeOptions]);

  const rows = useMemo(() => {
    const search = deferredQuery.trim().toLowerCase();

    return indexed.filter((row) => {
      if (towerId && row.towerId !== towerId) return false;
      if (typeFilter && row.type !== typeFilter) return false;
      if (search && !row.search.includes(search)) return false;
      return true;
    });
  }, [deferredQuery, indexed, towerId, typeFilter]);

  const totals = useMemo(() => {
    let items = 0;
    let quantity = 0;

    for (const row of rows) {
      items += row.items.length;
      quantity += row.items.reduce(
        (sum, item) => sum + Math.max(numberValue(item.quantity) || 1, 0),
        0,
      );
    }

    return { events: rows.length, items, quantity };
  }, [rows]);

  return (
    <MaterialsShell
      title="Missing & Excess"
      subtitle="Find material issues quickly without loading the whole register onto the screen."
    >
      <MaterialRegisterFilters
        towers={data?.towers ?? []}
        towerId={towerId}
        onTowerChange={setTowerId}
        towerName={towerName}
        query={query}
        onQueryChange={setQuery}
        placeholder="Search member, bundle, section, bolt or notes"
        filterLabel="Issue Type"
        options={typeOptions}
        filterValue={typeFilter}
        onFilterChange={setTypeFilter}
        resultCount={rows.length}
      />

      <View style={styles.summary}>
        <Summary label="Events" value={totals.events} />
        <Summary label="Items" value={totals.items} />
        <Summary label="Qty" value={totals.quantity} />
      </View>

      {!rows.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No material issues found</Text>
          <Text style={styles.emptyText}>
            Change the tower, issue type or search term.
          </Text>
        </View>
      ) : null}

      {rows.slice(0, visibleCount).map((row) => {
        const itemSummary = row.items
          .slice(0, 4)
          .map((item) => {
            const qty = numberValue(item.quantity) || 1;
            return `${itemTitle(item)} × ${qty}`;
          })
          .filter(Boolean)
          .join(", ");

        const extraItems = Math.max(row.items.length - 4, 0);
        const meta = [
          itemSummary
            ? `${itemSummary}${extraItems ? ` +${extraItems} more` : ""}`
            : clean(row.event.notes) || "No item detail",
          row.occurredAt ? formatDate(row.occurredAt) : "",
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <MaterialCard
            key={row.id}
            title={eventLabel(row.type)}
            subtitle={`${towerName(row.towerId) || "Tower"} · ${row.section}`}
            meta={meta}
          />
        );
      })}

      {rows.length > visibleCount ? (
        <Pressable
          style={styles.loadMore}
          onPress={() => setVisibleCount((count) => count + 16)}
        >
          <Text style={styles.loadMoreText}>
            Load 16 more · {rows.length - visibleCount} remaining
          </Text>
        </Pressable>
      ) : null}
    </MaterialsShell>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: "row",
    gap: 7,
  },
  summaryCard: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  summaryValue: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
  },
  summaryLabel: {
    marginTop: 1,
    color: "#64748b",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 28,
  },
  emptyTitle: {
    color: "#334155",
    fontWeight: "900",
  },
  emptyText: {
    marginTop: 3,
    color: "#94a3b8",
    fontSize: 12,
    textAlign: "center",
  },
  loadMore: {
    minHeight: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#94a3b8",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreText: {
    color: "#334155",
    fontWeight: "900",
    fontSize: 11,
  },
});

import { useDeferredValue, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  MaterialCard,
  MaterialsShell,
} from "@/components/materials/MaterialsShell";
import { MaterialRegisterFilters } from "@/components/materials/MaterialRegisterFilters";
import { useMaterials } from "@/contexts/MaterialsContext";
import type { TransferRecord } from "@/types/materials";

const clean = (value: unknown) => String(value ?? "").trim();

function labelValue(value: unknown) {
  const text = clean(value);
  if (!text) return "Recorded";
  return text.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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

type TransferRow = Record<string, unknown>;
type BundleRow = Record<string, unknown>;

type IndexedTransfer = {
  transfer: TransferRow;
  id: string;
  bundleNo: string;
  quantity: string;
  sourceTowerId: string;
  destinationTowerId: string;
  section: string;
  status: string;
  date: string;
  search: string;
};

export default function Transfers() {
  const { data, towerName, receiveTransfer, busyTransferId } = useMaterials();

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [towerId, setTowerId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);

  const bundleById = useMemo(() => {
    const map = new Map<string, BundleRow>();
    for (const bundle of (data?.bundles ?? []) as unknown as BundleRow[]) {
      const id = clean(bundle.id);
      if (id) map.set(id, bundle);
    }
    return map;
  }, [data?.bundles]);

  const indexed = useMemo<IndexedTransfer[]>(() => {
    const rows = (data?.transfers ?? []) as unknown as TransferRow[];

    return rows
      .map((transfer, index) => {
        const id = clean(transfer.id) || `transfer-${index}`;
        const sourceTowerId = clean(transfer.source_tower_id);
        const destinationTowerId = clean(transfer.destination_tower_id);
        const sourceBundle = bundleById.get(clean(transfer.source_bundle_id));
        const destinationBundle = bundleById.get(clean(transfer.destination_bundle_id));
        const snapshot=(transfer.item_snapshot&&typeof transfer.item_snapshot==="object"?transfer.item_snapshot:{}) as Record<string,unknown>;
        const bundleNo =
          clean(transfer.bundle_no) ||
          clean(sourceBundle?.bundle_no) ||
          clean(destinationBundle?.bundle_no) ||
          clean(snapshot.item_reference)||clean(snapshot.item_description)||"Material";
        const section =
          clean(sourceBundle?.section) ||
          clean(destinationBundle?.section) ||
          clean(transfer.section) ||
          clean(snapshot.segment)||clean(snapshot.bundle_section)||"General";
        const status = clean(transfer.status) || "recorded";
        const date =
          clean(transfer.transferred_at) ||
          clean(transfer.received_at) ||
          clean(transfer.created_at);
        const quantity = clean(transfer.quantity) || "—";

        return {
          transfer,
          id,
          bundleNo,
          quantity,
          sourceTowerId,
          destinationTowerId,
          section,
          status,
          date,
          search: [
            bundleNo,
            section,
            status,
            towerName(sourceTowerId),
            towerName(destinationTowerId),
            transfer.transferred_by_name,
            transfer.notes,
            snapshot.specification,
            snapshot.item_description,
          ]
            .map(clean)
            .join(" ")
            .toLowerCase(),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [bundleById, data?.transfers, towerName]);

  const statusOptions = useMemo(() => {
    const counts = new Map<string, number>();

    for (const row of indexed) {
      if (
        towerId &&
        row.sourceTowerId !== towerId &&
        row.destinationTowerId !== towerId
      ) {
        continue;
      }

      counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    }

    const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);

    return [
      { value: "", label: "All Status", count: total },
      ...Array.from(counts.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([value, count]) => ({
          value,
          label: labelValue(value),
          count,
        })),
    ];
  }, [indexed, towerId]);

  const effectiveStatusFilter = statusOptions.some((option) => option.value === statusFilter) ? statusFilter : "";

  const rows = useMemo(() => {
    const search = deferredQuery.trim().toLowerCase();

    return indexed.filter((row) => {
      if (
        towerId &&
        row.sourceTowerId !== towerId &&
        row.destinationTowerId !== towerId
      ) {
        return false;
      }
      if (effectiveStatusFilter && row.status !== effectiveStatusFilter) return false;
      if (search && !row.search.includes(search)) return false;
      return true;
    });
  }, [deferredQuery, effectiveStatusFilter, indexed, towerId]);

  const summary = useMemo(() => {
    const inTransit = rows.filter((row) =>
      ["pending", "in_transit", "in transit"].includes(row.status.toLowerCase()),
    ).length;
    const received = rows.filter((row) => row.status.toLowerCase() === "received").length;

    return { total: rows.length, inTransit, received };
  }, [rows]);

  return (
    <MaterialsShell
      title="Transfers"
      subtitle="Search tower-to-tower movements without rendering the full transfer history at once."
    >
      <MaterialRegisterFilters
        towers={data?.towers ?? []}
        towerId={towerId}
        onTowerChange={(value) => { setVisibleCount(20); setTowerId(value); }}
        towerName={towerName}
        query={query}
        onQueryChange={(value) => { setVisibleCount(20); setQuery(value); }}
        placeholder="Search bundle, tower, section or person"
        filterLabel="Status"
        options={statusOptions}
        filterValue={statusFilter}
        onFilterChange={(value) => { setVisibleCount(20); setStatusFilter(value); }}
        resultCount={rows.length}
      />

      <View style={styles.summary}>
        <Summary label="Transfers" value={summary.total} />
        <Summary label="In Transit" value={summary.inTransit} />
        <Summary label="Received" value={summary.received} />
      </View>

      {!rows.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No transfers found</Text>
          <Text style={styles.emptyText}>
            Change the tower, status or search term.
          </Text>
        </View>
      ) : null}

      {rows.slice(0, visibleCount).map((row) => {
        const source = towerName(row.sourceTowerId) || "Source";
        const destination = towerName(row.destinationTowerId) || "Destination";
        const transferredBy = clean(row.transfer.transferred_by_name);
        const snapshot=(row.transfer.item_snapshot&&typeof row.transfer.item_snapshot==="object"?row.transfer.item_snapshot:{}) as Record<string,unknown>;
        const itemLabel=clean(snapshot.item_reference)||clean(snapshot.item_description)||`Bundle ${row.bundleNo}`;

        return (
          <View key={row.id}>
          <MaterialCard
            title={`${itemLabel} · Qty ${row.quantity}`}
            subtitle={`${source} → ${destination} · ${row.section}${clean(snapshot.specification)?` · ${clean(snapshot.specification)}`:""}`}
            meta={[
              labelValue(row.status),
              row.date ? formatDate(row.date) : "",
              transferredBy,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
          {clean(row.transfer.source_issue_key)&&row.status==="in_transit"&&towerId===row.destinationTowerId?<Pressable disabled={busyTransferId===row.id} style={styles.receiveButton} onPress={()=>void receiveTransfer(row.transfer as unknown as TransferRecord)}><Text style={styles.receiveText}>{busyTransferId===row.id?"Receiving…":"Confirm Received"}</Text></Pressable>:null}
          </View>
        );
      })}

      {rows.length > visibleCount ? (
        <Pressable
          style={styles.loadMore}
          onPress={() => setVisibleCount((count) => count + 20)}
        >
          <Text style={styles.loadMoreText}>
            Load 20 more · {rows.length - visibleCount} remaining
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
  receiveButton:{minHeight:40,marginTop:5,borderRadius:10,backgroundColor:"#0369a1",alignItems:"center",justifyContent:"center"},
  receiveText:{color:"#fff",fontSize:12,fontWeight:"900"},
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

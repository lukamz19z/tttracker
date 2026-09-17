import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialsShell } from "@/components/materials/MaterialsShell";
import { TowerPicker } from "@/components/materials/TowerPicker";
import { useMaterials } from "@/contexts/MaterialsContext";
import type {
  MaterialEventItemRecord,
  MaterialEventRecord,
} from "@/types/materials";

const clean = (value: unknown) => String(value ?? "").trim();
const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

type Issue = {
  issueKey: string;
  event: MaterialEventRecord;
  item: MaterialEventItemRecord;
  originalQty: number;
  deliveredQty: number;
  remainingQty: number;
  status: "open" | "partial" | "resolved";
};

function displayReference(item: MaterialEventItemRecord) {
  return (
    clean(item.item_reference) ||
    clean(item.bolt_size) ||
    clean(item.bundle_no) ||
    "Material item"
  );
}

export default function MissingMaterials() {
  const {
    data,
    towerName,
    busyIssueKey,
    recordMissingReceipt,
  } = useMaterials();

  const [filter, setFilter] = useState<"all" | "open" | "partial" | "resolved" | "excess">("all");
  const [towerId, setTowerId] = useState("");
  const [selected, setSelected] = useState<Issue | null>(null);
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [visibleCount, setVisibleCount] = useState(15);

  useEffect(() => {
    setVisibleCount(15);
  }, [filter, towerId]);

  const issues = useMemo<Issue[]>(() => {
    const receipts = new Map<string, number>();

    for (const event of data?.materialEvents ?? []) {
      if (clean(event.event_type) !== "found_received") continue;
      const items = Array.isArray(event.tower_material_event_items)
        ? event.tower_material_event_items
        : [];

      for (const item of items) {
        const key = clean(item.source_issue_key);
        if (!key) continue;
        receipts.set(
          key,
          (receipts.get(key) || 0) + Math.max(numberValue(item.quantity), 0),
        );
      }
    }

    const rows: Issue[] = [];

    for (const event of data?.materialEvents ?? []) {
      if (clean(event.event_type) !== "missing") continue;
      if (towerId && clean(event.tower_id) !== towerId) continue;

      const items = Array.isArray(event.tower_material_event_items)
        ? event.tower_material_event_items
        : [];

      for (const item of items) {
        const issueKey = clean(item.issue_key);
        if (!issueKey) continue;

        const originalQty = Math.max(numberValue(item.quantity), 1);
        const deliveredQty = receipts.get(issueKey) || 0;
        const remainingQty = Math.max(originalQty - deliveredQty, 0);

        rows.push({
          issueKey,
          event,
          item,
          originalQty,
          deliveredQty,
          remainingQty,
          status:
            remainingQty <= 0
              ? "resolved"
              : deliveredQty > 0
                ? "partial"
                : "open",
        });
      }
    }

    return rows.sort((a, b) => {
      const order = { open: 0, partial: 1, resolved: 2 };
      return (
        order[a.status] - order[b.status] ||
        clean(b.event.occurred_at).localeCompare(clean(a.event.occurred_at))
      );
    });
  }, [data?.materialEvents, towerId]);

  const excess = useMemo(
    () =>
      (data?.materialEvents ?? []).filter(
        (event) =>
          clean(event.event_type) === "excess" &&
          (!towerId || clean(event.tower_id) === towerId),
      ),
    [data?.materialEvents, towerId],
  );

  const filteredIssues = issues.filter(
    (row) =>
      filter === "all" ||
      filter === "excess" ||
      row.status === filter,
  );

  const openCount = issues.filter((row) => row.status === "open").length;
  const partialCount = issues.filter((row) => row.status === "partial").length;
  const resolvedCount = issues.filter((row) => row.status === "resolved").length;
  const remaining = issues.reduce((sum, row) => sum + row.remainingQty, 0);

  async function submitReceipt() {
    if (!selected) return;

    const qty = Math.max(Number(quantity) || 0, 0);

    if (qty <= 0 || qty > selected.remainingQty) {
      Alert.alert(
        "Check quantity",
        `Enter a received quantity between 1 and ${selected.remainingQty}.`,
      );
      return;
    }

    try {
      await recordMissingReceipt({
        issueKey: selected.issueKey,
        quantity: qty,
        notes: notes.trim(),
      });

      setSelected(null);
      setQuantity("");
      setNotes("");
    } catch (error) {
      Alert.alert(
        "Receipt could not be saved",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  }

  return (
    <MaterialsShell
      title="Missing & Excess"
      subtitle="Outstanding missing items remain open until linked receipt quantities close them out. Crew can record received material here without another Daily Docket."
    >
      <TowerPicker
        towers={data?.towers ?? []}
        value={towerId}
        onChange={setTowerId}
        towerName={towerName}
        label="Tower"
        allowAll
      />

      <View style={styles.metrics}>
        <Metric label="Open" value={openCount} />
        <Metric label="Part Delivered" value={partialCount} />
        <Metric label="Resolved" value={resolvedCount} />
        <Metric label="Qty Remaining" value={remaining} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {(["all", "open", "partial", "resolved", "excess"] as const).map((value) => (
          <Chip
            key={value}
            label={
              value === "partial"
                ? "Part Delivered"
                : value[0].toUpperCase() + value.slice(1)
            }
            active={filter === value}
            onPress={() => setFilter(value)}
          />
        ))}
      </ScrollView>

      {filter !== "excess"
        ? filteredIssues.slice(0, visibleCount).map((row) => (
            <View key={row.issueKey} style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>
                    {displayReference(row.item)}
                  </Text>
                  <Text style={styles.meta}>
                    {towerName(row.event.tower_id)}
                    {row.item.bundle_no
                      ? ` · Bundle ${clean(row.item.bundle_no)}`
                      : ""}
                    {row.item.bundle_section
                      ? ` · ${clean(row.item.bundle_section)}`
                      : ""}
                  </Text>
                  {row.item.item_description ? (
                    <Text style={styles.meta}>
                      {clean(row.item.item_description)}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.status}>
                  <Text style={styles.statusText}>{row.status}</Text>
                </View>
              </View>

              <View style={styles.quantities}>
                <Qty label="Missing" value={row.originalQty} />
                <Qty label="Delivered" value={row.deliveredQty} />
                <Qty label="Remaining" value={row.remainingQty} />
              </View>

              {row.remainingQty > 0 ? (
                <Pressable
                  style={styles.receive}
                  onPress={() => {
                    setSelected(row);
                    setQuantity(String(row.remainingQty));
                    setNotes("");
                  }}
                >
                  <Text style={styles.receiveText}>
                    Record Received / Found
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.resolved}>
                  <Text style={styles.resolvedText}>Fully resolved</Text>
                </View>
              )}
            </View>
          ))
        : excess.slice(0, visibleCount).map((event, index) => {
            const items = Array.isArray(event.tower_material_event_items)
              ? event.tower_material_event_items
              : [];

            return (
              <View key={clean(event.id) || String(index)} style={styles.card}>
                <Text style={styles.title}>
                  Excess material · {towerName(event.tower_id)}
                </Text>
                {items.map((item, itemIndex) => (
                  <Text
                    key={clean(item.id) || String(itemIndex)}
                    style={styles.meta}
                  >
                    {displayReference(item)} · Qty{" "}
                    {numberValue(item.quantity) || 1}
                  </Text>
                ))}
              </View>
            );
          })}

      {filter !== "excess" && filteredIssues.length > visibleCount ? (
        <Pressable
          style={styles.loadMore}
          onPress={() => setVisibleCount((count) => count + 15)}
        >
          <Text style={styles.loadMoreText}>
            Load 15 more · {filteredIssues.length - visibleCount} remaining
          </Text>
        </Pressable>
      ) : null}

      {filter === "excess" && excess.length > visibleCount ? (
        <Pressable
          style={styles.loadMore}
          onPress={() => setVisibleCount((count) => count + 15)}
        >
          <Text style={styles.loadMoreText}>
            Load 15 more · {excess.length - visibleCount} remaining
          </Text>
        </Pressable>
      ) : null}

      <Modal
        visible={Boolean(selected)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modal}>
          <View style={styles.rowBetween}>
            <Text style={styles.modalTitle}>Record Material Receipt</Text>
            <Pressable
              style={styles.closeButton}
              onPress={() => setSelected(null)}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          {selected ? (
            <>
              <Text style={styles.title}>
                {displayReference(selected.item)}
              </Text>
              <Text style={styles.meta}>
                Remaining: {selected.remainingQty}{" "}
                {clean(selected.item.unit) || "ea"}
              </Text>

              <Text style={styles.label}>QUANTITY RECEIVED</Text>
              <TextInput
                style={styles.input}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
              />

              <Text style={styles.label}>NOTES</Text>
              <TextInput
                style={[styles.input, styles.notes]}
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="Optional receipt note"
              />

              <Pressable
                style={styles.receive}
                disabled={busyIssueKey === selected.issueKey}
                onPress={() => void submitReceipt()}
              >
                {busyIssueKey === selected.issueKey ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : null}
                <Text style={styles.receiveText}>Save Receipt</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </Modal>
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Qty({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.qty}>
      <Text style={styles.qtyValue}>{value}</Text>
      <Text style={styles.qtyLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", gap: 6, paddingRight: 12 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#dbeafe", borderColor: "#60a5fa" },
  chipText: { fontSize: 10, fontWeight: "800", color: "#475569" },
  chipTextActive: { color: "#1d4ed8" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: {
    minWidth: "47%",
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 13,
    padding: 12,
  },
  metricValue: { fontSize: 20, fontWeight: "900", color: "#0f172a" },
  metricLabel: { fontSize: 9, fontWeight: "800", color: "#64748b" },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 15,
    padding: 14,
    gap: 11,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  title: { fontWeight: "900", color: "#0f172a" },
  meta: { marginTop: 3, fontSize: 11, color: "#64748b" },
  status: {
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#334155",
    textTransform: "uppercase",
  },
  quantities: { flexDirection: "row", gap: 7 },
  qty: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 9,
  },
  qtyValue: { fontSize: 17, fontWeight: "900", color: "#0f172a" },
  qtyLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
  },
  receive: {
    minHeight: 44,
    borderRadius: 11,
    backgroundColor: "#16a34a",
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  receiveText: { color: "#fff", fontWeight: "900" },
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
  resolved: {
    minHeight: 42,
    borderRadius: 11,
    backgroundColor: "#dcfce7",
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  resolvedText: { color: "#166534", fontWeight: "900" },
  modal: { flex: 1, backgroundColor: "#f8fafc", padding: 18, gap: 12 },
  modalTitle: { fontSize: 22, fontWeight: "900", color: "#0f172a" },
  closeButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    fontSize: 28,
    lineHeight: 30,
    color: "#475569",
  },
  label: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    color: "#64748b",
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    padding: 12,
  },
  notes: { minHeight: 90, textAlignVertical: "top" },
});

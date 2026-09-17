import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { BundlePicker } from "@/components/materials/BundlePicker";
import { MaterialsShell } from "@/components/materials/MaterialsShell";
import { TowerPicker } from "@/components/materials/TowerPicker";
import { useMaterials } from "@/contexts/MaterialsContext";

const clean = (value: unknown) => String(value ?? "").trim();
const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function Transfers() {
  const {
    data,
    towerName,
    currentQty,
    pendingTransferInQty,
    busyTransferId,
    createTransfer,
    receiveTransfer,
    cancelTransfer,
  } = useMaterials();

  const [towerId, setTowerId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [sourceBundleId, setSourceBundleId] = useState("");
  const [destinationTowerId, setDestinationTowerId] = useState("");
  const [destinationBundleId, setDestinationBundleId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [visibleCount, setVisibleCount] = useState(8);

  const transfers = useMemo(
    () =>
      [...(data?.transfers ?? [])]
        .filter(
          (row) =>
            !towerId ||
            clean(row.source_tower_id) === towerId ||
            clean(row.destination_tower_id) === towerId,
        )
        .sort((a, b) =>
          clean(b.transferred_at).localeCompare(clean(a.transferred_at)),
        ),
    [data?.transfers, towerId],
  );

  const sourceBundles = useMemo(
    () =>
      (data?.bundles ?? []).filter(
        (bundle) =>
          (!towerId || clean(bundle.tower_id) === towerId) &&
          currentQty(bundle) > 0,
      ),
    [currentQty, data?.bundles, towerId],
  );

  const selectedSource = (data?.bundles ?? []).find(
    (bundle) => clean(bundle.id) === sourceBundleId,
  );

  const destinationBundles = useMemo(() => {
    if (!selectedSource || !destinationTowerId) return [];

    return (data?.bundles ?? []).filter(
      (bundle) =>
        clean(bundle.tower_id) === destinationTowerId &&
        clean(bundle.bundle_no).toUpperCase() ===
          clean(selectedSource.bundle_no).toUpperCase() &&
        clean(bundle.section).toUpperCase() ===
          clean(selectedSource.section).toUpperCase(),
    );
  }, [data?.bundles, destinationTowerId, selectedSource]);

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      Alert.alert(
        "Materials update failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  }

  async function submitTransfer() {
    if (!selectedSource) {
      Alert.alert("Select bundle", "Search and select the source bundle.");
      return;
    }

    if (!destinationTowerId || !destinationBundleId) {
      Alert.alert(
        "Select destination",
        "Select the destination tower and matching destination bundle.",
      );
      return;
    }

    const qty = Math.max(Math.floor(Number(quantity) || 0), 0);

    if (qty <= 0) {
      Alert.alert("Quantity required", "Enter a transfer quantity above zero.");
      return;
    }

    await run(() =>
      createTransfer({
        sourceBundleId: clean(selectedSource.id),
        destinationTowerId,
        destinationBundleId,
        quantity: qty,
        notes: notes.trim(),
      }),
    );

    setShowCreate(false);
    setSourceBundleId("");
    setDestinationTowerId("");
    setDestinationBundleId("");
    setQuantity("1");
    setNotes("");
  }

  return (
    <MaterialsShell
      title="Transfers"
      subtitle="Search the bundle, choose the destination tower, then confirm receipt at the destination."
    >
      <Pressable style={styles.primary} onPress={() => setShowCreate(true)}>
        <Text style={styles.primaryText}>Create Transfer</Text>
      </Pressable>

      <TowerPicker
        towers={data?.towers ?? []}
        value={towerId}
        onChange={(next) => {
          setTowerId(next);
          setVisibleCount(8);
        }}
        towerName={towerName}
        label="Filter Tower"
        allowAll
      />

      {!transfers.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No transfers found</Text>
        </View>
      ) : null}

      {transfers.slice(0, visibleCount).map((transfer, index) => {
        const id = clean(transfer.id) || String(index);
        const busy = busyTransferId === id;
        const incoming = clean(transfer.destination_tower_id) === towerId;
        const outgoing = clean(transfer.source_tower_id) === towerId;
        const status = clean(transfer.status) || "in_transit";

        return (
          <View key={id} style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={styles.cardText}>
                <Text style={styles.title}>
                  Bundle {clean(transfer.bundle_no) || "—"} · Qty{" "}
                  {numberValue(transfer.quantity)}
                </Text>
                <Text style={styles.meta}>
                  {towerName(transfer.source_tower_id)} →{" "}
                  {towerName(transfer.destination_tower_id)}
                </Text>
                <Text style={styles.meta}>
                  {clean(transfer.bundle_section) || "General"}
                </Text>
              </View>

              <View style={styles.status}>
                <Text style={styles.statusText}>
                  {status.replaceAll("_", " ")}
                </Text>
              </View>
            </View>

            {status === "in_transit" ? (
              <View style={styles.actions}>
                {incoming || !towerId ? (
                  <Pressable
                    disabled={busy}
                    style={[styles.receive, busy && styles.disabled]}
                    onPress={() =>
                      Alert.alert(
                        "Confirm receipt?",
                        `Confirm Bundle ${clean(transfer.bundle_no)} was physically received at ${towerName(transfer.destination_tower_id)}?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Confirm Received",
                            onPress: () =>
                              void run(() => receiveTransfer(transfer)),
                          },
                        ],
                      )
                    }
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.receiveText}>Receive</Text>
                    )}
                  </Pressable>
                ) : null}

                {outgoing || !towerId ? (
                  <Pressable
                    disabled={busy}
                    style={[styles.cancel, busy && styles.disabled]}
                    onPress={() =>
                      Alert.alert(
                        "Cancel transfer?",
                        "This returns the quantity to the source tower's available stock.",
                        [
                          { text: "Keep Transfer", style: "cancel" },
                          {
                            text: "Cancel Transfer",
                            style: "destructive",
                            onPress: () =>
                              void run(() => cancelTransfer(transfer)),
                          },
                        ],
                      )
                    }
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}

      {transfers.length > visibleCount ? (
        <Pressable
          style={styles.loadMore}
          onPress={() => setVisibleCount((count) => count + 8)}
        >
          <Text style={styles.loadMoreText}>
            Load 8 more · {transfers.length - visibleCount} remaining
          </Text>
        </Pressable>
      ) : null}

      <Modal
        visible={showCreate}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreate(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Create Bundle Transfer</Text>
                <Text style={styles.modalSubtitle}>
                  Search for bundles instead of scrolling the register.
                </Text>
              </View>
              <Pressable
                style={styles.close}
                onPress={() => setShowCreate(false)}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <BundlePicker
              bundles={sourceBundles}
              value={sourceBundleId}
              onChange={(bundleId) => {
                setSourceBundleId(bundleId);
                setDestinationTowerId("");
                setDestinationBundleId("");
              }}
              towerName={towerName}
              currentQty={currentQty}
              label="Source Bundle"
              placeholder="Search source bundle number or section"
            />

            <TowerPicker
              towers={data?.towers ?? []}
              value={destinationTowerId}
              onChange={(nextTowerId) => {
                setDestinationTowerId(nextTowerId);
                setDestinationBundleId("");
              }}
              towerName={towerName}
              label="Destination Tower"
              allowAll={false}
              excludeIds={
                selectedSource ? [clean(selectedSource.tower_id)] : []
              }
            />

            {destinationTowerId && selectedSource ? (
              destinationBundles.length ? (
                <BundlePicker
                  bundles={destinationBundles}
                  value={destinationBundleId}
                  onChange={setDestinationBundleId}
                  towerName={towerName}
                  label="Destination Bundle"
                  placeholder="Search matching destination bundle"
                />
              ) : (
                <Text style={styles.warning}>
                  No matching bundle exists at this destination tower. Check
                  the project material import before transferring.
                </Text>
              )
            ) : null}

            {destinationBundleId ? (
              <Text style={styles.destinationNote}>
                Pending incoming quantity for this destination bundle:{" "}
                {pendingTransferInQty(
                  (data?.bundles ?? []).find(
                    (bundle) => clean(bundle.id) === destinationBundleId,
                  ) ?? {
                    id: destinationBundleId,
                    tower_id: destinationTowerId,
                    bundle_no: "",
                  },
                )}
              </Text>
            ) : null}

            <Text style={styles.label}>QUANTITY</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={quantity}
              onChangeText={setQuantity}
            />

            <Text style={styles.label}>NOTES</Text>
            <TextInput
              style={[styles.input, styles.notes]}
              multiline
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional transfer note"
            />

            <Pressable
              style={styles.primary}
              onPress={() => void submitTransfer()}
            >
              <Text style={styles.primaryText}>Create Transfer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </MaterialsShell>
  );
}

const styles = StyleSheet.create({
  primary: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  primaryText: {
    color: "#fff",
    fontWeight: "900",
  },
  empty: {
    paddingVertical: 26,
    alignItems: "center",
  },
  emptyTitle: {
    color: "#475569",
    fontWeight: "900",
  },
  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 13,
    gap: 10,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  cardText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontWeight: "900",
    color: "#0f172a",
  },
  meta: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 10,
  },
  status: {
    maxWidth: "38%",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
  },
  statusText: {
    textAlign: "center",
    textTransform: "uppercase",
    fontSize: 8,
    fontWeight: "900",
    color: "#334155",
  },
  actions: {
    flexDirection: "row",
    gap: 7,
  },
  receive: {
    flex: 1,
    minHeight: 39,
    borderRadius: 9,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
  },
  receiveText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
  },
  cancel: {
    flex: 1,
    minHeight: 39,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff1f2",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    color: "#991b1b",
    fontSize: 11,
    fontWeight: "900",
  },
  disabled: {
    opacity: 0.45,
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
    fontSize: 11,
    fontWeight: "900",
  },
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
  },
  modal: {
    maxHeight: "92%",
    borderRadius: 17,
    backgroundColor: "#f8fafc",
    padding: 15,
    gap: 11,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
  },
  modalSubtitle: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 11,
  },
  close: {
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
  warning: {
    padding: 11,
    borderRadius: 10,
    backgroundColor: "#fff7ed",
    color: "#9a3412",
    fontSize: 11,
    fontWeight: "700",
  },
  destinationNote: {
    fontSize: 10,
    color: "#64748b",
  },
  label: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    color: "#64748b",
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 11,
    color: "#0f172a",
  },
  notes: {
    minHeight: 72,
    textAlignVertical: "top",
  },
});

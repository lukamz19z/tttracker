import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { MaterialsShell } from "@/components/materials/MaterialsShell";
import { MaterialRegisterFilters } from "@/components/materials/MaterialRegisterFilters";
import { useMaterials } from "@/contexts/MaterialsContext";
import {
  cachedBundleMembers,
  loadBundleMembers,
} from "@/lib/api/materials-bundles";
import type {
  BundleCheckStatus,
  BundleRecord,
  MemberCheckStatus,
  MemberRecord,
} from "@/types/materials";

const clean = (value: unknown) => String(value ?? "").trim();
const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function statusLabel(status: BundleCheckStatus) {
  if (status === "not_checked") return "Not checked";
  if (status === "arrived") return "Arrived";
  if (status === "partial") return "Partial";
  if (status === "missing") return "Missing";
  if (status === "issue") return "Issue";
  if (status === "transferred") return "Transferred";
  return status;
}

function memberStatusLabel(status: MemberCheckStatus) {
  if (status === "not_checked") return "Not checked";
  if (status === "arrived") return "Arrived";
  if (status === "not_here") return "Not here";
  if (status === "missing") return "Missing";
  if (status === "issue") return "Issue";
  return status;
}

export default function Bundles() {
  const params = useLocalSearchParams<{
    towerId?: string;
    bundleId?: string;
  }>();

  const {
    data,
    busyBundleId,
    busyMemberId,
    towerName,
    deliveredQty,
    receivedQty,
    currentQty,
    transferOutQty,
    pendingTransferInQty,
    memberCheckFor,
    deriveBundleStatus,
    saveBundleQty,
    clearBundle,
    updateMemberStatus,
    clearMemberStatus,
    isBundlePending,
    isMemberPending,
  } = useMaterials();

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [towerId, setTowerId] = useState(clean(params.towerId));
  const [section, setSection] = useState("");
  const [expandedBundleId, setExpandedBundleId] = useState(
    clean(params.bundleId),
  );
  const [visibleCount, setVisibleCount] = useState(6);
  const [actionBundle, setActionBundle] = useState<BundleRecord | null>(null);
  const [memberAction, setMemberAction] = useState<MemberRecord | null>(null);
  const [packMembersByBundleId, setPackMembersByBundleId] = useState<
    Record<string, MemberRecord[]>
  >({});
  const [packLoadingId, setPackLoadingId] = useState<string | null>(null);
  const [packErrors, setPackErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setVisibleCount(6);
  }, [deferredQuery, section, towerId]);

  useEffect(() => {
    const nextTowerId = clean(params.towerId);
    const nextBundleId = clean(params.bundleId);

    if (nextTowerId) setTowerId(nextTowerId);
    if (nextBundleId) setExpandedBundleId(nextBundleId);
  }, [params.bundleId, params.towerId]);

  const ensureBundleMembers = useCallback(
    async (bundle: BundleRecord, force = false) => {
      const projectId = clean(data?.projectId);
      const bundleId = clean(bundle.id);

      if (!projectId || !bundleId) return;
      if (!force && Object.prototype.hasOwnProperty.call(packMembersByBundleId, bundleId)) {
        return;
      }

      setPackLoadingId(bundleId);
      setPackErrors((current) => {
        const next = { ...current };
        delete next[bundleId];
        return next;
      });

      let hadCachedMembers = false;

      try {
        const cached = await cachedBundleMembers(projectId, bundleId);
        if (cached) {
          hadCachedMembers = true;
          setPackMembersByBundleId((current) => ({
            ...current,
            [bundleId]: cached.value.members ?? [],
          }));
        }

        try {
          const latest = await loadBundleMembers(projectId, bundleId);
          setPackMembersByBundleId((current) => ({
            ...current,
            [bundleId]: latest.members ?? [],
          }));
        } catch (error) {
          if (!hadCachedMembers) throw error;
        }
      } catch (error) {
        setPackErrors((current) => ({
          ...current,
          [bundleId]:
            error instanceof Error
              ? error.message
              : "Bundle members could not be loaded.",
        }));
        setPackMembersByBundleId((current) => ({
          ...current,
          [bundleId]: current[bundleId] ?? [],
        }));
      } finally {
        setPackLoadingId((current) => (current === bundleId ? null : current));
      }
    },
    [data?.projectId, packMembersByBundleId],
  );

  const toggleBundle = useCallback(
    (bundle: BundleRecord) => {
      const bundleId = clean(bundle.id);
      if (!bundleId) return;

      if (expandedBundleId === bundleId) {
        setExpandedBundleId("");
        return;
      }

      setExpandedBundleId(bundleId);
      void ensureBundleMembers(bundle);
    },
    [ensureBundleMembers, expandedBundleId],
  );

  useEffect(() => {
    if (!expandedBundleId || !data?.bundles?.length) return;
    const bundle = data.bundles.find(
      (item) => clean(item.id) === expandedBundleId,
    );
    if (bundle) void ensureBundleMembers(bundle);
  }, [data?.bundles, ensureBundleMembers, expandedBundleId]);

  const indexedBundles = useMemo(() => {
    return (data?.bundles ?? []).map((bundle) => {
      const bundleTowerId = clean(bundle.tower_id);
      const bundleSection = clean(bundle.section) || "General";
      const displayTower = towerName(bundle.tower_id);

      return {
        bundle,
        towerId: bundleTowerId,
        section: bundleSection,
        search: [bundle.bundle_no, bundleSection, displayTower]
          .map(clean)
          .join(" ")
          .toLowerCase(),
      };
    });
  }, [data?.bundles, towerName]);

  const sectionOptions = useMemo(() => {
    const counts = new Map<string, number>();

    for (const row of indexedBundles) {
      if (towerId && row.towerId !== towerId) continue;
      counts.set(row.section, (counts.get(row.section) ?? 0) + 1);
    }

    const options = Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([value, count]) => ({ value, label: value, count }));

    return [
      {
        value: "",
        label: "All Sections",
        count: Array.from(counts.values()).reduce((sum, count) => sum + count, 0),
      },
      ...options,
    ];
  }, [indexedBundles, towerId]);

  useEffect(() => {
    if (!section) return;
    if (sectionOptions.some((option) => option.value === section)) return;
    setSection("");
  }, [section, sectionOptions]);

  const rows = useMemo(() => {
    const search = deferredQuery.trim().toLowerCase();

    return indexedBundles
      .filter((row) => {
        if (towerId && row.towerId !== towerId) return false;
        if (section && row.section !== section) return false;
        if (search && !row.search.includes(search)) return false;
        return true;
      })
      .map((row) => row.bundle);
  }, [deferredQuery, indexedBundles, section, towerId]);

  const summary = useMemo(() => {
    let checked = 0;
    let outstanding = 0;

    for (const bundle of rows) {
      const required = Math.max(numberValue(bundle.qty_required), 0);
      const status = deriveBundleStatus(bundle);

      if (status !== "not_checked") checked += 1;
      outstanding += Math.max(required - currentQty(bundle), 0);
    }

    return {
      bundles: rows.length,
      checked,
      outstanding,
    };
  }, [currentQty, deriveBundleStatus, rows]);

  async function perform(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      Alert.alert(
        "Materials update failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  }

  async function applyBundleAction(
    bundle: BundleRecord,
    action: "missing" | "issue" | "clear",
  ) {
    setActionBundle(null);

    if (action === "missing") {
      Alert.alert(
        "Mark bundle missing?",
        `Bundle ${clean(bundle.bundle_no) || "—"} will be marked missing and its site quantity set to zero.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Mark Missing",
            style: "destructive",
            onPress: () =>
              void perform(() => saveBundleQty(bundle, 0, "missing")),
          },
        ],
      );
      return;
    }

    if (action === "issue") {
      await perform(() =>
        saveBundleQty(bundle, receivedQty(bundle), "issue"),
      );
      return;
    }

    Alert.alert(
      "Clear checks?",
      "This clears this bundle check and its member checks. Supplier delivery history is not deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => void perform(() => clearBundle(bundle)),
        },
      ],
    );
  }

  async function applyMemberAction(
    member: MemberRecord,
    status: MemberCheckStatus | "clear",
  ) {
    setMemberAction(null);

    if (status === "clear") {
      await perform(() => clearMemberStatus(member));
      return;
    }

    await perform(() => updateMemberStatus(member, status));
  }

  return (
    <MaterialsShell
      title="Bundles"
      subtitle="Fast site check-off. Changes save on the phone immediately and sync when a connection is available."
    >
      <MaterialRegisterFilters
        towers={data?.towers ?? []}
        towerId={towerId}
        onTowerChange={setTowerId}
        towerName={towerName}
        query={query}
        onQueryChange={setQuery}
        placeholder="Search bundle number, section or tower"
        filterLabel="Section"
        options={sectionOptions}
        filterValue={section}
        onFilterChange={setSection}
        resultCount={rows.length}
      />

      <View style={styles.summary}>
        <SummaryStat label="Bundles" value={summary.bundles} />
        <SummaryStat label="Checked" value={summary.checked} />
        <SummaryStat
          label="Outstanding"
          value={summary.outstanding}
          warning={summary.outstanding > 0}
        />
      </View>

      {!rows.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No bundles found</Text>
          <Text style={styles.emptyText}>
            Change the tower or search term.
          </Text>
        </View>
      ) : null}

      {rows.slice(0, visibleCount).map((bundle, index) => {
        const actualBundleId = clean(bundle.id);
        const id =
          actualBundleId ||
          `${clean(bundle.tower_id)}:${clean(bundle.bundle_no)}:${index}`;
        const required = Math.max(numberValue(bundle.qty_required), 1);
        const received = receivedQty(bundle);
        const current = currentQty(bundle);
        const status = deriveBundleStatus(bundle);
        const expanded = expandedBundleId === actualBundleId;
        const saving = busyBundleId === actualBundleId;
        const pending = isBundlePending(actualBundleId);
        const members = expanded
          ? packMembersByBundleId[actualBundleId] ?? []
          : [];
        const memberCount = Math.max(
          numberValue(bundle.member_qty),
          packMembersByBundleId[actualBundleId]?.length ?? 0,
        );
        const packLoading = expanded && packLoadingId === actualBundleId;
        const packError = expanded ? packErrors[actualBundleId] : null;

        const transfers = expanded
          ? (data?.transfers ?? []).filter(
              (transfer) =>
                actualBundleId &&
                (clean(transfer.source_bundle_id) === actualBundleId ||
                  clean(transfer.destination_bundle_id) === actualBundleId),
            )
          : [];

        return (
          <View key={id} style={styles.card}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.bundleNo}>
                  Bundle {clean(bundle.bundle_no) || "—"}
                </Text>
                <Text style={styles.bundleMeta} numberOfLines={2}>
                  {clean(bundle.section) || "General"} ·{" "}
                  {towerName(bundle.tower_id)}
                </Text>
              </View>

              <View
                style={[
                  styles.status,
                  status === "arrived" && styles.statusGood,
                  status === "partial" && styles.statusPartial,
                  (status === "missing" || status === "issue") &&
                    styles.statusBad,
                ]}
              >
                <Text style={styles.statusText}>{statusLabel(status)}</Text>
              </View>
            </View>

            {pending ? (
              <Text style={styles.pending}>Saved on device · Pending sync</Text>
            ) : null}

            <Text style={styles.mainQty}>
              Required {required} · Site {received} · Current {current}
            </Text>

            <View style={styles.controls}>
              <Pressable
                style={[
                  styles.qtyButton,
                  (saving || received <= 0) && styles.disabled,
                ]}
                disabled={saving || received <= 0}
                onPress={() =>
                  void perform(() => saveBundleQty(bundle, received - 1))
                }
              >
                <Text style={styles.qtyButtonText}>−</Text>
              </Pressable>

              <View style={styles.qtyValue}>
                {saving ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text style={styles.qtyNumber}>
                    {received} / {required}
                  </Text>
                )}
              </View>

              <Pressable
                style={[
                  styles.qtyButton,
                  (saving || received >= required) && styles.disabled,
                ]}
                disabled={saving || received >= required}
                onPress={() =>
                  void perform(() => saveBundleQty(bundle, received + 1))
                }
              >
                <Text style={styles.qtyButtonText}>+</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.fullButton,
                  (saving || received >= required) && styles.disabled,
                ]}
                disabled={saving || received >= required}
                onPress={() =>
                  void perform(() =>
                    saveBundleQty(bundle, required, "arrived"),
                  )
                }
              >
                <Text style={styles.fullButtonText}>FULL</Text>
              </Pressable>
            </View>

            <View style={styles.footerActions}>
              <Pressable
                style={styles.footerButton}
                disabled={!actualBundleId}
                onPress={() => toggleBundle(bundle)}
              >
                <Text style={styles.footerButtonText}>
                  {expanded
                    ? "Close Pack"
                    : memberCount > 0
                      ? `Open Pack (${memberCount})`
                      : "Open Pack"}
                </Text>
              </Pressable>

              <Pressable
                style={styles.moreButton}
                onPress={() => setActionBundle(bundle)}
              >
                <Text style={styles.moreButtonText}>More</Text>
              </Pressable>
            </View>

            {expanded ? (
              <View style={styles.expanded}>
                <View style={styles.detailBox}>
                  <Text style={styles.detailText}>
                    Supplier delivered: {deliveredQty(bundle)}
                  </Text>
                  <Text style={styles.detailText}>
                    Transferred out: {transferOutQty(bundle)}
                  </Text>
                  <Text style={styles.detailText}>
                    Pending transfer in: {pendingTransferInQty(bundle)}
                  </Text>
                </View>

                {packLoading && !members.length ? (
                  <View style={styles.packLoading}>
                    <ActivityIndicator size="small" />
                    <Text style={styles.packLoadingText}>Loading pack members…</Text>
                  </View>
                ) : packError && !members.length ? (
                  <View style={styles.packErrorBox}>
                    <Text style={styles.packErrorText}>{packError}</Text>
                    <Pressable
                      style={styles.packRetryButton}
                      onPress={() => {
                        setPackMembersByBundleId((current) => {
                          const next = { ...current };
                          delete next[actualBundleId];
                          return next;
                        });
                        void ensureBundleMembers(bundle, true);
                      }}
                    >
                      <Text style={styles.packRetryText}>Retry</Text>
                    </Pressable>
                  </View>
                ) : !members.length ? (
                  <Text style={styles.packEmpty}>
                    No members are linked to this bundle.
                  </Text>
                ) : (
                  members.map((member, memberIndex) => {
                    const memberId = clean(member.id);
                    const memberStatus =
                      memberCheckFor(member)?.status || "not_checked";

                    return (
                      <View
                        key={
                          memberId ||
                          `${clean(member.mark_no)}:${memberIndex}`
                        }
                        style={styles.member}
                      >
                        <View style={styles.memberText}>
                          <Text style={styles.memberMark}>
                            {clean(member.mark_no) || "Member"}
                          </Text>
                          <Text style={styles.memberMeta} numberOfLines={2}>
                            {[
                              clean(member.drawing_number),
                              clean(member.tower_segment),
                              `Qty/Tower ${clean(member.qty_per_tower) || "—"}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                          {isMemberPending(memberId) ? (
                            <Text style={styles.memberPending}>
                              Pending sync
                            </Text>
                          ) : null}
                        </View>

                        <Pressable
                          style={styles.memberStatusButton}
                          disabled={busyMemberId === memberId}
                          onPress={() => setMemberAction(member)}
                        >
                          {busyMemberId === memberId ? (
                            <ActivityIndicator size="small" />
                          ) : (
                            <Text style={styles.memberStatusText}>
                              {memberStatusLabel(memberStatus)}
                            </Text>
                          )}
                        </Pressable>
                      </View>
                    );
                  })
                )}

                {transfers.length ? (
                  <View style={styles.transferBox}>
                    <Text style={styles.transferHeading}>TRANSFER ACTIVITY</Text>
                    {transfers.slice(0, 4).map((transfer, transferIndex) => {
                      const outgoing =
                        clean(transfer.source_bundle_id) === actualBundleId;

                      return (
                        <Text
                          key={
                            clean(transfer.id) ||
                            `transfer-${transferIndex}`
                          }
                          style={styles.transferText}
                        >
                          {outgoing ? "Out" : "In"} · Qty{" "}
                          {numberValue(transfer.quantity)} ·{" "}
                          {outgoing
                            ? towerName(transfer.destination_tower_id)
                            : towerName(transfer.source_tower_id)}
                          {" · "}
                          {clean(transfer.status) || "Recorded"}
                        </Text>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}

      {rows.length > visibleCount ? (
        <Pressable
          style={styles.loadMore}
          onPress={() => setVisibleCount((count) => count + 6)}
        >
          <Text style={styles.loadMoreText}>
            Load 6 more · {rows.length - visibleCount} remaining
          </Text>
        </Pressable>
      ) : null}

      <BundleActionsModal
        bundle={actionBundle}
        onClose={() => setActionBundle(null)}
        onAction={(action) => {
          if (actionBundle) {
            void applyBundleAction(actionBundle, action);
          }
        }}
      />

      <MemberActionsModal
        member={memberAction}
        currentStatus={
          memberAction
            ? memberCheckFor(memberAction)?.status || "not_checked"
            : "not_checked"
        }
        onClose={() => setMemberAction(null)}
        onAction={(status) => {
          if (memberAction) {
            void applyMemberAction(memberAction, status);
          }
        }}
      />
    </MaterialsShell>
  );
}

function SummaryStat({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <View style={styles.summaryStat}>
      <Text style={[styles.summaryValue, warning && styles.warningText]}>
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function BundleActionsModal({
  bundle,
  onClose,
  onAction,
}: {
  bundle: BundleRecord | null;
  onClose: () => void;
  onAction: (action: "missing" | "issue" | "clear") => void;
}) {
  return (
    <Modal
      visible={Boolean(bundle)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>
                Bundle {clean(bundle?.bundle_no) || "—"}
              </Text>
              <Text style={styles.modalMeta}>
                Less-used actions are kept here to keep the site card simple.
              </Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <ActionButton
            label="Mark Missing"
            description="Set site quantity to zero and flag the bundle as missing."
            tone="danger"
            onPress={() => onAction("missing")}
          />
          <ActionButton
            label="Flag Issue"
            description="Keep the current site quantity but flag a bundle issue."
            tone="warning"
            onPress={() => onAction("issue")}
          />
          <ActionButton
            label="Clear Checks"
            description="Clear the bundle and linked member check statuses."
            onPress={() => onAction("clear")}
          />
        </View>
      </View>
    </Modal>
  );
}

function MemberActionsModal({
  member,
  currentStatus,
  onClose,
  onAction,
}: {
  member: MemberRecord | null;
  currentStatus: MemberCheckStatus;
  onClose: () => void;
  onAction: (status: MemberCheckStatus | "clear") => void;
}) {
  const options: [MemberCheckStatus | "clear", string][] = [
    ["arrived", "Arrived"],
    ["not_here", "Not Here"],
    ["missing", "Missing"],
    ["issue", "Issue"],
    ["clear", "Clear"],
  ];

  return (
    <Modal
      visible={Boolean(member)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>
                {clean(member?.mark_no) || "Member"}
              </Text>
              <Text style={styles.modalMeta}>
                Current: {memberStatusLabel(currentStatus)}
              </Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          {options.map(([value, label]) => (
            <Pressable
              key={value}
              style={[
                styles.memberOption,
                value === currentStatus && styles.memberOptionActive,
              ]}
              onPress={() => onAction(value)}
            >
              <Text
                style={[
                  styles.memberOptionText,
                  value === currentStatus && styles.memberOptionTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function ActionButton({
  label,
  description,
  tone = "default",
  onPress,
}: {
  label: string;
  description: string;
  tone?: "default" | "danger" | "warning";
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.actionButton,
        tone === "danger" && styles.actionDanger,
        tone === "warning" && styles.actionWarning,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.actionTitle,
          tone === "danger" && styles.actionDangerText,
          tone === "warning" && styles.actionWarningText,
        ]}
      >
        {label}
      </Text>
      <Text style={styles.actionDescription}>{description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: "row",
    gap: 7,
  },
  summaryStat: {
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
    fontSize: 19,
    fontWeight: "900",
    color: "#0f172a",
  },
  summaryLabel: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
  },
  warningText: {
    color: "#be123c",
  },
  empty: {
    paddingVertical: 28,
    alignItems: "center",
  },
  emptyTitle: {
    fontWeight: "900",
    color: "#334155",
  },
  emptyText: {
    marginTop: 3,
    color: "#94a3b8",
    fontSize: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 13,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  bundleNo: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0f172a",
  },
  bundleMeta: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 11,
  },
  status: {
    flexShrink: 1,
    maxWidth: "38%",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
  },
  statusGood: {
    backgroundColor: "#dcfce7",
  },
  statusPartial: {
    backgroundColor: "#fef3c7",
  },
  statusBad: {
    backgroundColor: "#fee2e2",
  },
  statusText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#334155",
    textAlign: "center",
  },
  pending: {
    color: "#1d4ed8",
    fontSize: 10,
    fontWeight: "900",
  },
  mainQty: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  qtyButton: {
    width: 40,
    height: 42,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyButtonText: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "800",
    color: "#0f172a",
  },
  qtyValue: {
    width: 66,
    height: 42,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyNumber: {
    fontWeight: "900",
    color: "#0f172a",
  },
  fullButton: {
    flex: 1,
    minWidth: 74,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  fullButtonText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
  },
  disabled: {
    opacity: 0.42,
  },
  footerActions: {
    flexDirection: "row",
    gap: 7,
  },
  footerButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  footerButtonText: {
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: "900",
  },
  moreButton: {
    width: 72,    minHeight: 38,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  moreButtonText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900",
  },
  expanded: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
    paddingTop: 10,
    gap: 8,
  },
  detailBox: {
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    padding: 10,
    gap: 3,
  },
  detailText: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "700",
  },
  packEmpty: {
    padding: 10,
    color: "#64748b",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    fontSize: 11,
  },
  packLoading: {
    minHeight: 54,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  packLoadingText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
  },
  packErrorBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fed7aa",
    backgroundColor: "#fff7ed",
    padding: 10,
    gap: 8,
  },
  packErrorText: {
    color: "#9a3412",
    fontSize: 11,
    fontWeight: "700",
  },
  packRetryButton: {
    alignSelf: "flex-start",
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#fdba74",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  packRetryText: {
    color: "#9a3412",
    fontSize: 10,
    fontWeight: "900",
  },
  member: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  memberText: {
    flex: 1,
    minWidth: 0,
  },
  memberMark: {
    fontWeight: "900",
    color: "#0f172a",
  },
  memberMeta: {
    marginTop: 2,
    fontSize: 9,
    color: "#64748b",
  },
  memberPending: {
    marginTop: 2,
    color: "#1d4ed8",
    fontSize: 9,
    fontWeight: "900",
  },
  memberStatusButton: {
    maxWidth: 92,
    minHeight: 34,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 9,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  memberStatusText: {
    fontSize: 9,
    color: "#334155",
    fontWeight: "900",
    textAlign: "center",
  },
  transferBox: {
    borderRadius: 10,
    backgroundColor: "#eef2ff",
    padding: 10,
    gap: 3,
  },
  transferHeading: {
    fontSize: 9,
    fontWeight: "900",
    color: "#4338ca",
  },
  transferText: {
    fontSize: 10,
    color: "#475569",
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
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
  },
  modalCard: {
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    padding: 15,
    gap: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 3,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: "#0f172a",
  },
  modalMeta: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 11,
  },
  closeButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    color: "#475569",
    fontSize: 28,
    lineHeight: 30,
  },
  actionButton: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 11,
    padding: 11,
  },
  actionDanger: {
    borderColor: "#fecaca",
    backgroundColor: "#fff1f2",
  },
  actionWarning: {
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
  },
  actionTitle: {
    color: "#334155",
    fontWeight: "900",
  },
  actionDangerText: {
    color: "#991b1b",
  },
  actionWarningText: {
    color: "#92400e",
  },
  actionDescription: {
    marginTop: 2,
    fontSize: 10,
    color: "#64748b",
  },
  memberOption: {
    minHeight: 43,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  memberOptionActive: {
    borderColor: "#60a5fa",
    backgroundColor: "#eff6ff",
  },
  memberOptionText: {
    color: "#475569",
    fontWeight: "900",
  },
  memberOptionTextActive: {
    color: "#1d4ed8",
  },
});
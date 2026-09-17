import { AppState } from "react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import {
  cachedMaterials,
  cancelMaterialTransfer,
  clearBundleCheck as clearBundleCheckApi,
  clearMemberCheck as clearMemberCheckApi,
  createMaterialTransfer,
  materialCacheKey,
  receiveMaterialTransfer,
  recordMissingReceipt as recordMissingReceiptApi,
  refreshMaterials,
  saveBundleCheck as saveBundleCheckApi,
  saveMemberCheck as saveMemberCheckApi,
} from "@/lib/api/materials";
import { setCache } from "@/lib/offline/db";
import {
  loadMaterialQueue,
  makeClearBundleMutation,
  makeClearMemberMutation,
  makeSaveBundleMutation,
  makeSaveMemberMutation,
  mergeMaterialMutation,
  saveMaterialQueue,
  type PendingMaterialMutation,
} from "@/lib/offline/materialsQueue";
import type {
  BundleCheckRecord,
  BundleCheckStatus,
  BundleRecord,
  CreateTransferInput,
  MaterialPayload,
  MemberCheckRecord,
  MemberCheckStatus,
  MemberRecord,
  RecordMissingReceiptInput,
  TransferRecord,
} from "@/types/materials";

type Value = {
  data: MaterialPayload | null;
  loading: boolean;
  refreshing: boolean;
  cachedAt: string | null;
  error: string | null;
  online: boolean;
  busyBundleId: string | null;
  busyMemberId: string | null;
  busyTransferId: string | null;
  busyIssueKey: string | null;
  pendingSyncCount: number;
  isBundlePending: (bundleId: unknown) => boolean;
  isMemberPending: (memberId: unknown) => boolean;
  refresh: () => Promise<void>;
  towerName: (towerId: unknown) => string;
  deliveredQty: (bundle: BundleRecord) => number;
  bundleCheckFor: (bundle: BundleRecord) => BundleCheckRecord | undefined;
  receivedQty: (bundle: BundleRecord) => number;
  transferOutQty: (bundle: BundleRecord) => number;
  transferInQty: (bundle: BundleRecord) => number;
  pendingTransferInQty: (bundle: BundleRecord) => number;
  currentQty: (bundle: BundleRecord) => number;
  membersForBundle: (bundle: BundleRecord) => MemberRecord[];
  memberCheckFor: (member: MemberRecord) => MemberCheckRecord | undefined;
  deriveBundleStatus: (bundle: BundleRecord) => BundleCheckStatus;
  saveBundleQty: (
    bundle: BundleRecord,
    qtyReceived: number,
    forcedStatus?: Exclude<BundleCheckStatus, "transferred">,
  ) => Promise<void>;
  clearBundle: (bundle: BundleRecord) => Promise<void>;
  updateMemberStatus: (
    member: MemberRecord,
    status: MemberCheckStatus,
  ) => Promise<void>;
  clearMemberStatus: (member: MemberRecord) => Promise<void>;
  createTransfer: (input: CreateTransferInput) => Promise<void>;
  receiveTransfer: (transfer: TransferRecord) => Promise<void>;
  cancelTransfer: (transfer: TransferRecord) => Promise<void>;
  recordMissingReceipt: (input: RecordMissingReceiptInput) => Promise<void>;
};

const Ctx = createContext<Value | undefined>(undefined);

const clean = (value: unknown) => String(value ?? "").trim();
const upper = (value: unknown) => clean(value).toUpperCase();
const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function normaliseBundle(value: unknown) {
  return upper(value).replace(/\s+/g, "");
}

function normaliseSection(value: unknown) {
  return upper(value).replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

function localBundleStatus(
  qtyReceived: number,
  required: number,
  forcedStatus?: Exclude<BundleCheckStatus, "transferred">,
): Exclude<BundleCheckStatus, "transferred"> {
  if (forcedStatus) return forcedStatus;
  if (qtyReceived <= 0) return "not_checked";
  if (qtyReceived >= required) return "arrived";
  return "partial";
}

export function MaterialsProvider({ children }: PropsWithChildren) {
  const { profile } = useAuth();
  const { online } = useSync();
  const projectId = profile?.projectId ?? null;

  const [data, setData] = useState<MaterialPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyBundleId, setBusyBundleId] = useState<string | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [busyTransferId, setBusyTransferId] = useState<string | null>(null);
  const [busyIssueKey, setBusyIssueKey] = useState<string | null>(null);
  const [pendingMutations, setPendingMutations] = useState<
    PendingMaterialMutation[]
  >([]);

  const persist = useCallback(
    (next: MaterialPayload | null) => {
      if (!projectId || !next) return;
      void setCache(materialCacheKey(projectId), next);
    },
    [projectId],
  );

  const replaceQueue = useCallback(
    async (next: PendingMaterialMutation[]) => {
      setPendingMutations(next);
      if (projectId) {
        await saveMaterialQueue(projectId, next);
      }
    },
    [projectId],
  );

  const enqueue = useCallback(
    async (mutation: PendingMaterialMutation) => {
      const current = projectId
        ? await loadMaterialQueue(projectId)
        : pendingMutations;
      const next = mergeMaterialMutation(current, mutation);
      await replaceQueue(next);
      return next;
    },
    [pendingMutations, projectId, replaceQueue],
  );

  const flushQueue = useCallback(
    async (queueOverride?: PendingMaterialMutation[]) => {
      if (!projectId || !online) {
        return queueOverride ?? pendingMutations;
      }

      const queue =
        queueOverride ?? (await loadMaterialQueue(projectId));

      if (!queue.length) {
        await replaceQueue([]);
        return [];
      }

      const remaining: PendingMaterialMutation[] = [];
      let failed = false;

      for (const mutation of queue) {
        if (failed) {
          remaining.push(mutation);
          continue;
        }

        try {
          if (mutation.kind === "save_bundle") {
            await saveBundleCheckApi(mutation.bundleId, mutation.input);
          } else if (mutation.kind === "clear_bundle") {
            await clearBundleCheckApi(mutation.bundleId);
          } else if (mutation.kind === "save_member") {
            await saveMemberCheckApi(mutation.memberId, mutation.input);
          } else {
            await clearMemberCheckApi(mutation.memberId);
          }
        } catch {
          failed = true;
          remaining.push(mutation);
        }
      }

      await replaceQueue(remaining);

      if (!remaining.length) {
        setError(null);
      }

      return remaining;
    },
    [online, projectId, replaceQueue],
  );

  const load = useCallback(
    async (refresh = false) => {
      if (!projectId) {
        setData(null);
        setCachedAt(null);
        setPendingMutations([]);
        return;
      }

      refresh ? setRefreshing(true) : setLoading(true);
      setError(null);

      try {
        const [cached, queued] = await Promise.all([
          cachedMaterials(projectId),
          loadMaterialQueue(projectId),
        ]);

        setPendingMutations(queued);

        if (cached) {
          setData(cached.value);
          setCachedAt(cached.updatedAt);
        }

        let remaining = queued;

        if (online && queued.length) {
          remaining = await flushQueue(queued);
        }

        if (online && remaining.length === 0) {
          try {
            const latest = await refreshMaterials(projectId);
            setData(latest);
            setCachedAt(new Date().toISOString());
          } catch (refreshError) {
            if (!cached) throw refreshError;
            setError(
              refreshError instanceof Error
                ? `${refreshError.message} Showing cached materials.`
                : "Showing cached materials.",
            );
          }
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Materials could not be loaded.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [flushQueue, online, projectId],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void load(true);
      }
    });
    return () => sub.remove();
  }, [load]);

  const towerMap = useMemo(
    () =>
      new Map(
        (data?.towers ?? []).map((tower) => [
          clean(tower.id),
          clean(tower.name) || clean(tower.line) || "Tower",
        ]),
      ),
    [data?.towers],
  );

  const towerName = useCallback(
    (towerId: unknown) => towerMap.get(clean(towerId)) || "Tower",
    [towerMap],
  );

  const duplicateBundleRefs = useMemo(() => {
    const counts = new Map<string, number>();

    for (const bundle of data?.bundles ?? []) {
      const key = `${clean(bundle.tower_id)}::${normaliseBundle(bundle.bundle_no)}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    return counts;
  }, [data?.bundles]);

  const bundleCheckFor = useCallback(
    (bundle: BundleRecord) => {
      const id = clean(bundle.id);

      if (id) {
        const direct = (data?.bundleChecks ?? []).find(
          (row) => clean(row.bundle_id) === id,
        );
        if (direct) return direct;
      }

      const key = `${clean(bundle.tower_id)}::${normaliseBundle(bundle.bundle_no)}`;

      if ((duplicateBundleRefs.get(key) || 0) !== 1) {
        return undefined;
      }

      return (data?.bundleChecks ?? []).find(
        (row) =>
          clean(row.tower_id) === clean(bundle.tower_id) &&
          normaliseBundle(row.bundle_no) === normaliseBundle(bundle.bundle_no),
      );
    },
    [data?.bundleChecks, duplicateBundleRefs],
  );

  const receivedQty = useCallback(
    (bundle: BundleRecord) =>
      Math.max(numberValue(bundleCheckFor(bundle)?.qty_received), 0),
    [bundleCheckFor],
  );

  const deliveredQty = useCallback(
    (bundle: BundleRecord) => {
      const bundleId = clean(bundle.id);
      const bundleNo = normaliseBundle(bundle.bundle_no);
      const towerId = clean(bundle.tower_id);
      const fallbackKey = `${towerId}::${bundleNo}`;
      const allowFallback = (duplicateBundleRefs.get(fallbackKey) || 0) === 1;

      let total = 0;

      for (const delivery of data?.deliveries ?? []) {
        if (clean(delivery.tower_id) && clean(delivery.tower_id) !== towerId) {
          continue;
        }

        const items = Array.isArray(delivery.tower_bundle_delivery_items)
          ? delivery.tower_bundle_delivery_items
          : [];

        for (const item of items) {
          const itemBundleId = clean(item.bundle_id);

          const matches =
            (bundleId && itemBundleId === bundleId) ||
            (!itemBundleId &&
              allowFallback &&
              normaliseBundle(item.bundle_no) === bundleNo);

          if (!matches) continue;

          total += Math.max(
            numberValue(
              item.qty_delivered ??
                item.quantity_delivered ??
                item.qty,
            ),
            0,
          );
        }
      }

      return total;
    },
    [data?.deliveries, duplicateBundleRefs],
  );

  const membersForBundle = useCallback(
    (bundle: BundleRecord) => {
      const bundleId = clean(bundle.id);

      if (bundleId) {
        const direct = (data?.members ?? []).filter(
          (member) => clean(member.bundle_id) === bundleId,
        );
        if (direct.length) return direct;
      }

      const sameReference = (data?.members ?? []).filter(
        (member) =>
          clean(member.tower_id) === clean(bundle.tower_id) &&
          normaliseBundle(member.bundle_reference) ===
            normaliseBundle(bundle.bundle_no),
      );

      if (sameReference.length === 0) return [];

      const exactSection = sameReference.filter(
        (member) =>
          normaliseSection(member.tower_segment || member.section) ===
          normaliseSection(bundle.section),
      );

      if (exactSection.length) return exactSection;

      const key = `${clean(bundle.tower_id)}::${normaliseBundle(bundle.bundle_no)}`;
      return (duplicateBundleRefs.get(key) || 0) === 1 ? sameReference : [];
    },
    [data?.members, duplicateBundleRefs],
  );

  const memberCheckFor = useCallback(
    (member: MemberRecord) => {
      const bundleId = clean(member.bundle_id);
      const markNo = upper(member.mark_no);

      if (bundleId) {
        return (data?.memberChecks ?? []).find(
          (row) =>
            clean(row.bundle_id) === bundleId &&
            upper(row.mark_no) === markNo,
        );
      }

      return undefined;
    },
    [data?.memberChecks],
  );

  const transferOutQty = useCallback(
    (bundle: BundleRecord) => {
      const bundleId = clean(bundle.id);
      if (!bundleId) return 0;

      return (data?.transfers ?? []).reduce((sum, transfer) => {
        const status = clean(transfer.status).toLowerCase();
        if (!["in_transit", "received"].includes(status)) return sum;
        if (clean(transfer.source_bundle_id) !== bundleId) return sum;
        return sum + Math.max(numberValue(transfer.quantity), 0);
      }, 0);
    },
    [data?.transfers],
  );

  const transferInQty = useCallback(
    (bundle: BundleRecord) => {
      const bundleId = clean(bundle.id);
      if (!bundleId) return 0;

      return (data?.transfers ?? []).reduce((sum, transfer) => {
        if (clean(transfer.status) !== "received") return sum;
        if (clean(transfer.destination_bundle_id) !== bundleId) return sum;
        return sum + Math.max(numberValue(transfer.quantity), 0);
      }, 0);
    },
    [data?.transfers],
  );

  const pendingTransferInQty = useCallback(
    (bundle: BundleRecord) => {
      const bundleId = clean(bundle.id);
      if (!bundleId) return 0;

      return (data?.transfers ?? []).reduce((sum, transfer) => {
        if (clean(transfer.status) !== "in_transit") return sum;
        if (clean(transfer.destination_bundle_id) !== bundleId) return sum;
        return sum + Math.max(numberValue(transfer.quantity), 0);
      }, 0);
    },
    [data?.transfers],
  );

  const currentQty = useCallback(
    (bundle: BundleRecord) =>
      Math.max(receivedQty(bundle) - transferOutQty(bundle), 0),
    [receivedQty, transferOutQty],
  );

  const deriveBundleStatus = useCallback(
    (bundle: BundleRecord): BundleCheckStatus => {
      const manual = bundleCheckFor(bundle);
      const current = currentQty(bundle);
      const received = receivedQty(bundle);
      const required = Math.max(numberValue(bundle.qty_required), 1);
      const transferredOut = transferOutQty(bundle);

      if (manual?.status === "issue") return "issue";
      if (received > 0 && current <= 0 && transferredOut > 0) return "transferred";
      if (manual?.status === "missing" && received <= 0) return "missing";
      if (current >= required) return "arrived";
      if (current > 0) return "partial";

      const members = membersForBundle(bundle);
      if (!members.length) return manual?.status || "not_checked";

      const statuses = members.map(
        (member) => memberCheckFor(member)?.status || "not_checked",
      );

      if (statuses.some((status) => status === "issue")) return "issue";
      if (statuses.every((status) => status === "arrived")) return "arrived";
      if (statuses.every((status) => status === "missing")) return "missing";
      if (statuses.some((status) => status !== "not_checked")) return "partial";

      return manual?.status || "not_checked";
    },
    [
      bundleCheckFor,
      currentQty,
      memberCheckFor,
      membersForBundle,
      receivedQty,
      transferOutQty,
    ],
  );

  const applyBundleCheck = useCallback(
    (
      bundle: BundleRecord,
      qtyReceived: number,
      forcedStatus?: Exclude<BundleCheckStatus, "transferred">,
    ) => {
      const bundleId = clean(bundle.id);
      const required = Math.max(numberValue(bundle.qty_required), 1);
      const existing = bundleCheckFor(bundle);

      const optimistic: BundleCheckRecord = {
        ...(existing ?? {}),
        tower_id: clean(bundle.tower_id),
        bundle_id: bundleId,
        bundle_no: clean(bundle.bundle_no),
        qty_received: qtyReceived,
        status: localBundleStatus(qtyReceived, required, forcedStatus),
        notes: clean(existing?.notes),
        checked_by: "Pending sync",
        checked_at: new Date().toISOString(),
      };

      setData((current) => {
        if (!current) return current;
        const next = {
          ...current,
          bundleChecks: [
            ...current.bundleChecks.filter(
              (row) => clean(row.bundle_id) !== bundleId,
            ),
            optimistic,
          ],
        };
        persist(next);
        return next;
      });
    },
    [bundleCheckFor, persist],
  );

  const removeBundleCheck = useCallback(
    (bundleId: string) => {
      setData((current) => {
        if (!current) return current;
        const next = {
          ...current,
          bundleChecks: current.bundleChecks.filter(
            (row) => clean(row.bundle_id) !== bundleId,
          ),
          memberChecks: current.memberChecks.filter(
            (row) => clean(row.bundle_id) !== bundleId,
          ),
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const applyMemberCheck = useCallback(
    (member: MemberRecord, status: MemberCheckStatus) => {
      const memberId = clean(member.id);
      const bundleId = clean(member.bundle_id);
      const markNo = upper(member.mark_no);

      const optimistic: MemberCheckRecord = {
        tower_id: clean(member.tower_id),
        bundle_id: bundleId,
        bundle_no: clean(member.bundle_reference),
        mark_no: clean(member.mark_no),
        status,
        notes: "",
        checked_by: "Pending sync",
        checked_at: new Date().toISOString(),
      };

      setData((current) => {
        if (!current) return current;
        const next = {
          ...current,
          memberChecks: [
            ...current.memberChecks.filter(
              (row) =>
                `${clean(row.bundle_id)}::${upper(row.mark_no)}` !==
                `${bundleId}::${markNo}`,
            ),
            optimistic,
          ],
        };
        persist(next);
        return next;
      });

      return memberId;
    },
    [persist],
  );

  const removeMemberCheck = useCallback(
    (member: MemberRecord) => {
      const bundleId = clean(member.bundle_id);
      const markNo = upper(member.mark_no);

      setData((current) => {
        if (!current) return current;
        const next = {
          ...current,
          memberChecks: current.memberChecks.filter(
            (row) =>
              `${clean(row.bundle_id)}::${upper(row.mark_no)}` !==
              `${bundleId}::${markNo}`,
          ),
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const saveBundleQty = useCallback(
    async (
      bundle: BundleRecord,
      requestedQty: number,
      forcedStatus?: Exclude<BundleCheckStatus, "transferred">,
    ) => {
      const bundleId = clean(bundle.id);
      if (!bundleId) throw new Error("This bundle has no UUID.");

      const required = Math.max(numberValue(bundle.qty_required), 1);
      const qtyReceived = Math.max(
        Math.min(Math.round(requestedQty), required),
        0,
      );
      const input = {
        qtyReceived,
        status: forcedStatus,
      };

      setBusyBundleId(bundleId);
      applyBundleCheck(bundle, qtyReceived, forcedStatus);

      try {
        if (online) {
          try {
            const saved = await saveBundleCheckApi(bundleId, input);

            setData((current) => {
              if (!current) return current;
              const next = {
                ...current,
                bundleChecks: [
                  ...current.bundleChecks.filter(
                    (row) => clean(row.bundle_id) !== bundleId,
                  ),
                  saved,
                ],
              };
              persist(next);
              return next;
            });

            const existingQueue = await loadMaterialQueue(projectId || "");
            const nextQueue = existingQueue.filter(
              (item) =>
                !(
                  (item.kind === "save_bundle" ||
                    item.kind === "clear_bundle") &&
                  item.bundleId === bundleId
                ),
            );
            await replaceQueue(nextQueue);
            return;
          } catch {
            // Fall through to the offline queue.
          }
        }

        await enqueue(makeSaveBundleMutation(bundleId, input));
      } finally {
        setBusyBundleId(null);
      }
    },
    [
      applyBundleCheck,
      enqueue,
      online,
      persist,
      projectId,
      replaceQueue,
    ],
  );

  const clearBundle = useCallback(
    async (bundle: BundleRecord) => {
      const bundleId = clean(bundle.id);
      if (!bundleId) throw new Error("This bundle has no UUID.");

      setBusyBundleId(bundleId);
      removeBundleCheck(bundleId);

      try {
        if (online) {
          try {
            await clearBundleCheckApi(bundleId);
            const existingQueue = await loadMaterialQueue(projectId || "");
            const nextQueue = existingQueue.filter(
              (item) =>
                !(
                  (item.kind === "save_bundle" ||
                    item.kind === "clear_bundle") &&
                  item.bundleId === bundleId
                ),
            );
            await replaceQueue(nextQueue);
            return;
          } catch {
            // Fall through to the offline queue.
          }
        }

        await enqueue(makeClearBundleMutation(bundleId));
      } finally {
        setBusyBundleId(null);
      }
    },
    [
      enqueue,
      online,
      projectId,
      removeBundleCheck,
      replaceQueue,
    ],
  );

  const updateMemberStatus = useCallback(
    async (member: MemberRecord, status: MemberCheckStatus) => {
      const memberId = clean(member.id);
      const bundleId = clean(member.bundle_id);

      if (!memberId) throw new Error("This member has no UUID.");
      if (!bundleId) {
        throw new Error("This member is not linked to a bundle UUID.");
      }

      setBusyMemberId(memberId);
      applyMemberCheck(member, status);

      try {
        if (online) {
          try {
            const saved = await saveMemberCheckApi(memberId, { status });

            setData((current) => {
              if (!current) return current;
              const key = `${clean(saved.bundle_id)}::${upper(saved.mark_no)}`;
              const next = {
                ...current,
                memberChecks: [
                  ...current.memberChecks.filter(
                    (row) =>
                      `${clean(row.bundle_id)}::${upper(row.mark_no)}` !== key,
                  ),
                  saved,
                ],
              };
              persist(next);
              return next;
            });

            const existingQueue = await loadMaterialQueue(projectId || "");
            const nextQueue = existingQueue.filter(
              (item) =>
                !(
                  (item.kind === "save_member" ||
                    item.kind === "clear_member") &&
                  item.memberId === memberId
                ),
            );
            await replaceQueue(nextQueue);
            return;
          } catch {
            // Fall through to the offline queue.
          }
        }

        await enqueue(
          makeSaveMemberMutation(memberId, bundleId, { status }),
        );
      } finally {
        setBusyMemberId(null);
      }
    },
    [
      applyMemberCheck,
      enqueue,
      online,
      persist,
      projectId,
      replaceQueue,
    ],
  );

  const clearMemberStatus = useCallback(
    async (member: MemberRecord) => {
      const memberId = clean(member.id);
      const bundleId = clean(member.bundle_id);

      if (!memberId) throw new Error("This member has no UUID.");
      if (!bundleId) {
        throw new Error("This member is not linked to a bundle UUID.");
      }

      setBusyMemberId(memberId);
      removeMemberCheck(member);

      try {
        if (online) {
          try {
            await clearMemberCheckApi(memberId);
            const existingQueue = await loadMaterialQueue(projectId || "");
            const nextQueue = existingQueue.filter(
              (item) =>
                !(
                  (item.kind === "save_member" ||
                    item.kind === "clear_member") &&
                  item.memberId === memberId
                ),
            );
            await replaceQueue(nextQueue);
            return;
          } catch {
            // Fall through to the offline queue.
          }
        }

        await enqueue(makeClearMemberMutation(memberId, bundleId));
      } finally {
        setBusyMemberId(null);
      }
    },
    [
      enqueue,
      online,
      projectId,
      removeMemberCheck,
      replaceQueue,
    ],
  );

  const requireOnline = useCallback(() => {
    if (!online) {
      throw new Error(
        "This action requires a connection. Bundle/member checks can be queued offline, but transfers and missing-material receipts must sync immediately.",
      );
    }
  }, [online]);

  const createTransfer = useCallback(
    async (input: CreateTransferInput) => {
      requireOnline();
      setBusyTransferId(input.sourceBundleId);
      try {
        await createMaterialTransfer(input);
        await load(true);
      } finally {
        setBusyTransferId(null);
      }
    },
    [load, requireOnline],
  );

  const receiveTransfer = useCallback(
    async (transfer: TransferRecord) => {
      requireOnline();
      const id = clean(transfer.id);
      if (!id) throw new Error("Transfer has no ID.");

      setBusyTransferId(id);
      try {
        await receiveMaterialTransfer(id);
        await load(true);
      } finally {
        setBusyTransferId(null);
      }
    },
    [load, requireOnline],
  );

  const cancelTransfer = useCallback(
    async (transfer: TransferRecord) => {
      requireOnline();
      const id = clean(transfer.id);
      if (!id) throw new Error("Transfer has no ID.");

      setBusyTransferId(id);
      try {
        await cancelMaterialTransfer(id);
        await load(true);
      } finally {
        setBusyTransferId(null);
      }
    },
    [load, requireOnline],
  );

  const recordMissingReceipt = useCallback(
    async (input: RecordMissingReceiptInput) => {
      requireOnline();
      setBusyIssueKey(input.issueKey);
      try {
        await recordMissingReceiptApi(input);
        await load(true);
      } finally {
        setBusyIssueKey(null);
      }
    },
    [load, requireOnline],
  );

  const isBundlePending = useCallback(
    (bundleId: unknown) => {
      const id = clean(bundleId);
      return pendingMutations.some(
        (item) =>
          (item.kind === "save_bundle" || item.kind === "clear_bundle") &&
          item.bundleId === id,
      );
    },
    [pendingMutations],
  );

  const isMemberPending = useCallback(
    (memberId: unknown) => {
      const id = clean(memberId);
      return pendingMutations.some(
        (item) =>
          (item.kind === "save_member" || item.kind === "clear_member") &&
          item.memberId === id,
      );
    },
    [pendingMutations],
  );

  const value = useMemo<Value>(
    () => ({
      data,
      loading,
      refreshing,
      cachedAt,
      error,
      online,
      busyBundleId,
      busyMemberId,
      busyTransferId,
      busyIssueKey,
      pendingSyncCount: pendingMutations.length,
      isBundlePending,
      isMemberPending,
      refresh: () => load(true),
      towerName,
      deliveredQty,
      bundleCheckFor,
      receivedQty,
      transferOutQty,
      transferInQty,
      pendingTransferInQty,
      currentQty,
      membersForBundle,
      memberCheckFor,
      deriveBundleStatus,
      saveBundleQty,
      clearBundle,
      updateMemberStatus,
      clearMemberStatus,
      createTransfer,
      receiveTransfer,
      cancelTransfer,
      recordMissingReceipt,
    }),
    [
      data,
      loading,
      refreshing,
      cachedAt,
      error,
      online,
      busyBundleId,
      busyMemberId,
      busyTransferId,
      busyIssueKey,
      pendingMutations.length,
      isBundlePending,
      isMemberPending,
      load,
      towerName,
      deliveredQty,
      bundleCheckFor,
      receivedQty,
      transferOutQty,
      transferInQty,
      pendingTransferInQty,
      currentQty,
      membersForBundle,
      memberCheckFor,
      deriveBundleStatus,
      saveBundleQty,
      clearBundle,
      updateMemberStatus,
      clearMemberStatus,
      createTransfer,
      receiveTransfer,
      cancelTransfer,
      recordMissingReceipt,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMaterials() {
  const context = useContext(Ctx);
  if (!context) {
    throw new Error("useMaterials must be used inside MaterialsProvider");
  }
  return context;
}

import { AppState } from "react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

const MATERIALS_STALE_MS = 2 * 60_000;

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

  const dataRef = useRef<MaterialPayload | null>(null);
  const projectRef = useRef<string | null>(null);
  const loadPromiseRef = useRef<{ projectId: string; promise: Promise<void> } | null>(null);
  const lastServerRefreshRef = useRef(0);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

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

  const runLoad = useCallback(
    async (forceRefresh = false) => {
      if (!projectId) {
        projectRef.current = null;
        dataRef.current = null;
        lastServerRefreshRef.current = 0;
        setData(null);
        setCachedAt(null);
        setPendingMutations([]);
        setError(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const projectChanged = projectRef.current !== projectId;
      if (projectChanged) {
        projectRef.current = projectId;
        dataRef.current = null;
        lastServerRefreshRef.current = 0;
        setData(null);
        setCachedAt(null);
        setPendingMutations([]);
      }

      if (!dataRef.current) {
        setLoading(true);
      } else if (forceRefresh) {
        setRefreshing(true);
      }

      setError(null);

      try {
        const [cached, queued] = await Promise.all([
          cachedMaterials(projectId),
          loadMaterialQueue(projectId),
        ]);

        if (projectRef.current !== projectId) return;

        setPendingMutations(queued);

        if (cached) {
          dataRef.current = cached.value;
          setData(cached.value);
          setCachedAt(cached.updatedAt);
          setLoading(false);

          const cachedTime = new Date(cached.updatedAt).getTime();
          if (Number.isFinite(cachedTime)) {
            lastServerRefreshRef.current = Math.max(
              lastServerRefreshRef.current,
              cachedTime,
            );
          }
        }

        let remaining = queued;

        if (online && queued.length) {
          remaining = await flushQueue(queued);
          if (projectRef.current !== projectId) return;
        }

        const cacheFresh =
          Boolean(cached) &&
          Date.now() - new Date(cached?.updatedAt ?? 0).getTime() <
            MATERIALS_STALE_MS;

        const recentlyRefreshed =
          Date.now() - lastServerRefreshRef.current < MATERIALS_STALE_MS;

        const shouldRefreshServer =
          online &&
          remaining.length === 0 &&
          (forceRefresh || !cached || (!cacheFresh && !recentlyRefreshed));

        if (shouldRefreshServer) {
          if (dataRef.current) {
            setRefreshing(true);
          }

          try {
            const latest = await refreshMaterials(projectId);
            if (projectRef.current !== projectId) return;

            const now = new Date().toISOString();

            dataRef.current = latest;
            setData(latest);
            setCachedAt(now);
            lastServerRefreshRef.current = Date.now();
            setError(null);
          } catch (refreshError) {
            if (!cached && !dataRef.current) throw refreshError;

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

  const load = useCallback(
    (forceRefresh = false): Promise<void> => {
      const key = projectId ?? "";

      if (
        loadPromiseRef.current &&
        loadPromiseRef.current.projectId === key
      ) {
        return loadPromiseRef.current.promise;
      }

      const task = runLoad(forceRefresh);
      const tracked = task.finally(() => {
        if (loadPromiseRef.current?.promise === tracked) {
          loadPromiseRef.current = null;
        }
      });

      loadPromiseRef.current = { projectId: key, promise: tracked };
      return tracked;
    },
    [projectId, runLoad],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (
        state === "active" &&
        online &&
        Date.now() - lastServerRefreshRef.current >= MATERIALS_STALE_MS
      ) {
        void load(false);
      }
    });

    return () => sub.remove();
  }, [load, online]);

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

  /*
   * Materials can contain thousands of members and delivery rows. Previously
   * every card/status calculation repeatedly scanned those arrays. Build the
   * indexes once whenever the project snapshot changes, then keep the hot UI
   * lookups O(1) (or O(members-in-one-bundle)).
   */
  const bundleCheckIndex = useMemo(() => {
    const byId = new Map<string, BundleCheckRecord>();
    const byTowerRef = new Map<string, BundleCheckRecord>();

    for (const row of data?.bundleChecks ?? []) {
      const bundleId = clean(row.bundle_id);
      const fallbackKey = `${clean(row.tower_id)}::${normaliseBundle(row.bundle_no)}`;

      if (bundleId) byId.set(bundleId, row);
      if (fallbackKey !== "::") byTowerRef.set(fallbackKey, row);
    }

    return { byId, byTowerRef };
  }, [data?.bundleChecks]);

  const memberCheckIndex = useMemo(() => {
    const byBundleMark = new Map<string, MemberCheckRecord>();
    const byBundleId = new Map<string, MemberCheckRecord[]>();

    for (const row of data?.memberChecks ?? []) {
      const bundleId = clean(row.bundle_id);
      const markNo = upper(row.mark_no);

      if (bundleId) {
        const rows = byBundleId.get(bundleId) ?? [];
        rows.push(row);
        byBundleId.set(bundleId, rows);
      }

      if (bundleId && markNo) {
        byBundleMark.set(`${bundleId}::${markNo}`, row);
      }
    }

    return { byBundleMark, byBundleId };
  }, [data?.memberChecks]);

  const memberIndex = useMemo(() => {
    const byBundleId = new Map<string, MemberRecord[]>();
    const byTowerRef = new Map<string, MemberRecord[]>();
    const byTowerRefSection = new Map<string, MemberRecord[]>();

    for (const member of data?.members ?? []) {
      const bundleId = clean(member.bundle_id);
      const towerId = clean(member.tower_id);
      const bundleRef = normaliseBundle(member.bundle_reference);
      const section = normaliseSection(member.tower_segment || member.section);

      if (bundleId) {
        const rows = byBundleId.get(bundleId) ?? [];
        rows.push(member);
        byBundleId.set(bundleId, rows);
      }

      if (towerId && bundleRef) {
        const refKey = `${towerId}::${bundleRef}`;
        const refRows = byTowerRef.get(refKey) ?? [];
        refRows.push(member);
        byTowerRef.set(refKey, refRows);

        if (section) {
          const sectionKey = `${refKey}::${section}`;
          const sectionRows = byTowerRefSection.get(sectionKey) ?? [];
          sectionRows.push(member);
          byTowerRefSection.set(sectionKey, sectionRows);
        }
      }
    }

    return { byBundleId, byTowerRef, byTowerRefSection };
  }, [data?.members]);

  const deliveryIndex = useMemo(() => {
    const byBundleId = new Map<string, number>();
    const legacyByTowerRef = new Map<string, number>();

    for (const delivery of data?.deliveries ?? []) {
      const deliveryTowerId = clean(delivery.tower_id);
      const items = Array.isArray(delivery.tower_bundle_delivery_items)
        ? delivery.tower_bundle_delivery_items
        : [];

      for (const item of items) {
        const qty = Math.max(
          numberValue(
            item.qty_delivered ?? item.quantity_delivered ?? item.qty,
          ),
          0,
        );
        if (qty <= 0) continue;

        const bundleId = clean(item.bundle_id);
        if (bundleId) {
          byBundleId.set(bundleId, (byBundleId.get(bundleId) ?? 0) + qty);
          continue;
        }

        const bundleNo = normaliseBundle(item.bundle_no);
        if (!deliveryTowerId || !bundleNo) continue;

        const key = `${deliveryTowerId}::${bundleNo}`;
        legacyByTowerRef.set(key, (legacyByTowerRef.get(key) ?? 0) + qty);
      }
    }

    return { byBundleId, legacyByTowerRef };
  }, [data?.deliveries]);

  const transferIndex = useMemo(() => {
    const outByBundleId = new Map<string, number>();
    const receivedInByBundleId = new Map<string, number>();
    const pendingInByBundleId = new Map<string, number>();

    for (const transfer of data?.transfers ?? []) {
      const status = clean(transfer.status).toLowerCase();
      const qty = Math.max(numberValue(transfer.quantity), 0);
      if (qty <= 0) continue;

      const sourceId = clean(transfer.source_bundle_id);
      const destinationId = clean(transfer.destination_bundle_id);

      if (sourceId && (status === "in_transit" || status === "received")) {
        outByBundleId.set(
          sourceId,
          (outByBundleId.get(sourceId) ?? 0) + qty,
        );
      }

      if (destinationId && status === "received") {
        receivedInByBundleId.set(
          destinationId,
          (receivedInByBundleId.get(destinationId) ?? 0) + qty,
        );
      }

      if (destinationId && status === "in_transit") {
        pendingInByBundleId.set(
          destinationId,
          (pendingInByBundleId.get(destinationId) ?? 0) + qty,
        );
      }
    }

    return { outByBundleId, receivedInByBundleId, pendingInByBundleId };
  }, [data?.transfers]);

  const bundleCheckFor = useCallback(
    (bundle: BundleRecord) => {
      const id = clean(bundle.id);
      if (id) {
        const direct = bundleCheckIndex.byId.get(id);
        if (direct) return direct;
      }

      const key = `${clean(bundle.tower_id)}::${normaliseBundle(bundle.bundle_no)}`;
      if ((duplicateBundleRefs.get(key) || 0) !== 1) return undefined;
      return bundleCheckIndex.byTowerRef.get(key);
    },
    [bundleCheckIndex, duplicateBundleRefs],
  );

  const receivedQty = useCallback(
    (bundle: BundleRecord) =>
      Math.max(numberValue(bundleCheckFor(bundle)?.qty_received), 0),
    [bundleCheckFor],
  );

  const deliveredQty = useCallback(
    (bundle: BundleRecord) => {
      const bundleId = clean(bundle.id);
      const fallbackKey = `${clean(bundle.tower_id)}::${normaliseBundle(bundle.bundle_no)}`;

      const direct = bundleId ? deliveryIndex.byBundleId.get(bundleId) ?? 0 : 0;
      const legacy =
        (duplicateBundleRefs.get(fallbackKey) || 0) === 1
          ? deliveryIndex.legacyByTowerRef.get(fallbackKey) ?? 0
          : 0;

      return direct + legacy;
    },
    [deliveryIndex, duplicateBundleRefs],
  );

  const membersForBundle = useCallback(
    (bundle: BundleRecord) => {
      const bundleId = clean(bundle.id);
      if (bundleId) {
        const direct = memberIndex.byBundleId.get(bundleId);
        if (direct?.length) return direct;
      }

      const refKey = `${clean(bundle.tower_id)}::${normaliseBundle(bundle.bundle_no)}`;
      const sectionKey = `${refKey}::${normaliseSection(bundle.section)}`;
      const exactSection = memberIndex.byTowerRefSection.get(sectionKey);
      if (exactSection?.length) return exactSection;

      if ((duplicateBundleRefs.get(refKey) || 0) !== 1) return [];
      return memberIndex.byTowerRef.get(refKey) ?? [];
    },
    [duplicateBundleRefs, memberIndex],
  );

  const memberCheckFor = useCallback(
    (member: MemberRecord) => {
      const bundleId = clean(member.bundle_id);
      const markNo = upper(member.mark_no);
      if (!bundleId || !markNo) return undefined;
      return memberCheckIndex.byBundleMark.get(`${bundleId}::${markNo}`);
    },
    [memberCheckIndex],
  );

  const transferOutQty = useCallback(
    (bundle: BundleRecord) => {
      const bundleId = clean(bundle.id);
      return bundleId ? transferIndex.outByBundleId.get(bundleId) ?? 0 : 0;
    },
    [transferIndex],
  );

  const transferInQty = useCallback(
    (bundle: BundleRecord) => {
      const bundleId = clean(bundle.id);
      return bundleId
        ? transferIndex.receivedInByBundleId.get(bundleId) ?? 0
        : 0;
    },
    [transferIndex],
  );

  const pendingTransferInQty = useCallback(
    (bundle: BundleRecord) => {
      const bundleId = clean(bundle.id);
      return bundleId
        ? transferIndex.pendingInByBundleId.get(bundleId) ?? 0
        : 0;
    },
    [transferIndex],
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

      // The performance bootstrap intentionally does not preload the full
      // member catalogue. Derive bundle state directly from the much smaller
      // member-check register when possible, so status remains correct even
      // with data.members = [].
      const bundleId = clean(bundle.id);
      const directChecks = bundleId
        ? memberCheckIndex.byBundleId.get(bundleId) ?? []
        : [];

      if (directChecks.length) {
        const statuses = directChecks.map(
          (check) => check.status || "not_checked",
        );

        if (statuses.some((status) => status === "issue")) return "issue";
        if (statuses.every((status) => status === "arrived")) return "arrived";
        if (statuses.every((status) => status === "missing")) return "missing";
        if (statuses.some((status) => status !== "not_checked")) return "partial";
      }

      // Legacy/fallback caches may still contain members. Keep the old logic
      // available without requiring that catalogue in the normal bootstrap.
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
      memberCheckIndex,
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

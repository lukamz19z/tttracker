import { automaticRetryDue, classifySyncError, safeSyncMessage } from "@/lib/offline/sync-errors";
import { prepareRevisionQueue, qualityQueuePriority } from "@/lib/offline/revision-sync-plan";
import { getCache, setCache } from "@/lib/offline/db";
import { manuallyOffline, setManualOffline } from "@/lib/offline/connectivity";
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
import { AppState } from "react-native";
import * as Network from "expo-network";

import {
  queueRows,
  removeQueueRecord,
  resetQueueFailures,
  updateQueueStatus,
  type QueueRecord,
} from "@/lib/offline/db";
import { syncRevisionQueueRecord } from "@/lib/offline/revision-sync";
import { syncQualityQueueRecord, cleanupQualityRecord } from "@/lib/offline/quality-sync";

type SyncState = {
  ready: boolean;
  online: boolean;
  effectiveOnline: boolean;
  networkOnline: boolean;
  forcedOffline: boolean;
  setForcedOffline: (value: boolean) => Promise<void>;
  setMaterialPendingCount: (value: number) => void;
  registerMaterialSync: (callback: () => Promise<void>) => () => void;
  syncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastError: string | null;
  refresh: () => Promise<void>;
  syncNow: (options?: { manual?: boolean }) => Promise<void>;
};

const SyncContext = createContext<SyncState | null>(null);

function isOnlineState(state: Network.NetworkState) {
  return Boolean(
    state.isConnected && state.isInternetReachable !== false,
  );
}

async function processRecord(record: QueueRecord) {
  if (record.kind === "revision_draft") {
    await syncRevisionQueueRecord(record);
    return;
  }

  if (record.kind.startsWith("quality_")) {
    await syncQualityQueueRecord(record);
    return;
  }

  throw new Error(`Unsupported offline queue item: ${record.kind}`);
}

export function SyncProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(false);
  const [forcedOffline, setForcedOfflineState] = useState(false);
  const [materialPendingCount, setMaterialPendingCount] = useState(0);
  const materialSyncRef = useRef<null | (() => Promise<void>)>(null);
  const registerMaterialSync = useCallback((callback: () => Promise<void>) => {
    materialSyncRef.current = callback;
    return () => { if (materialSyncRef.current === callback) materialSyncRef.current = null; };
  }, []);
  const setForcedOffline = useCallback(async (value: boolean) => {
    setManualOffline(value);
    setForcedOfflineState(value);
    await setCache("sync:forced-offline", value);
  }, []);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const syncAgainRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInvokerRef = useRef<null | ((options?: { manual?: boolean }) => Promise<void>)>(null);

  const applyQueueState = useCallback((rows: QueueRecord[]) => {
    if (!mountedRef.current) return;

    setPendingCount(rows.length);
    setFailedCount(
      rows.filter((row) => ["failed", "retryable_failure", "requires_reconciliation"].includes(row.status)).length,
    );
  }, []);

  const refresh = useCallback(async () => {
    /*
     * Queue inspection is local and cheap. Network inspection is only used to
     * keep the status accurate; refresh itself never starts another sync loop.
     */
    await prepareRevisionQueue();
    const [network, rows] = await Promise.all([
      Network.getNetworkStateAsync(),
      queueRows(),
    ]);

    if (!mountedRef.current) return;

    setOnline(isOnlineState(network));
    applyQueueState(rows);
  }, [applyQueueState]);

  const runSync = useCallback(async (manual: boolean) => {
    /*
     * Check the local queue first. If nothing is waiting there is no reason to
     * perform a network call or show a syncing state.
     */
    await prepareRevisionQueue();
    let rows = await queueRows();
    applyQueueState(rows);

    if (!rows.length && !materialSyncRef.current) {
      if (mountedRef.current) {
        setLastError(null);
      }
      return;
    }

    const network = await Network.getNetworkStateAsync();
    const connected = isOnlineState(network);

    if (mountedRef.current) {
      setOnline(connected);
    }

    if (!connected || manuallyOffline()) return;
    if (manual) { await resetQueueFailures(); rows = await queueRows(); applyQueueState(rows); }

    if (mountedRef.current) {
      setSyncing(true);
      setLastError(null);
    }

    try {
      const ordered = [...rows].sort((a, b) => {
        return qualityQueuePriority(a.kind) - qualityQueuePriority(b.kind) || a.createdAt.localeCompare(b.createdAt);
      });
      for (const record of ordered) {
        if (manuallyOffline()) break;
        if (!manual && !automaticRetryDue(record)) continue;
        try {
          await updateQueueStatus(record.id, "syncing", null);
          await processRecord(record);
          await removeQueueRecord(record.id);
          if (record.kind.startsWith("quality_")) await cleanupQualityRecord(record);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Offline item could not be synced.";

          await updateQueueStatus(record.id, classifySyncError(error), message);

          if (mountedRef.current) {
            setLastError(safeSyncMessage(message));
          }
        }
      }
      if (!manuallyOffline()) await materialSyncRef.current?.();
    } finally {
      const remaining = await queueRows();
      applyQueueState(remaining);
      if (mountedRef.current) setLastError(safeSyncMessage(remaining.find(row => ["failed", "retryable_failure", "requires_reconciliation"].includes(row.status))?.lastError || null));
      const retryable = remaining.filter(row => row.status === "retryable_failure" && row.attempts <= 2);
      if (retryable.length && !manuallyOffline() && mountedRef.current) {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        const delay = retryable.some(row => row.attempts > 1) ? 30_000 : 5_000;
        retryTimerRef.current = setTimeout(() => { retryTimerRef.current = null; void syncInvokerRef.current?.({ manual: false }); }, delay);
      }

      if (mountedRef.current) {
        setSyncing(false);
      }
    }
  }, [applyQueueState]);

  const syncNow = useCallback((options?: { manual?: boolean }): Promise<void> => {
    /* One queue processor at a time, regardless of how many screens request it. */
    if (syncPromiseRef.current) {
      syncAgainRef.current = true;
      return syncPromiseRef.current;
    }

    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    const task = runSync(options?.manual !== false).catch(error => { if (mountedRef.current) setLastError(error instanceof Error ? error.message : "Sync failed. Tap to retry."); });
    const tracked = task.finally(async () => {
      if (syncPromiseRef.current === tracked) {
        syncPromiseRef.current = null;
        if (syncAgainRef.current && !manuallyOffline()) {
          syncAgainRef.current = false;
          if ((await queueRows()).some(row => row.status === "pending")) queueMicrotask(() => { void syncInvokerRef.current?.({ manual: false }); });
        }
      }
    });

    syncPromiseRef.current = tracked;
    return tracked;
  }, [runSync]);

  syncInvokerRef.current = syncNow;
  useEffect(() => {
    mountedRef.current = true;

    /*
     * Initial status check. syncNow() exits locally when the queue is empty,
     * so normal app startup does not create a pointless upload cycle.
     */
    void getCache<boolean>("sync:forced-offline").then(async (cached) => { setManualOffline(Boolean(cached?.value)); setForcedOfflineState(Boolean(cached?.value)); await refresh(); if (mountedRef.current) setReady(true); await syncNow({ manual: false }); }).catch(error => { console.warn("TTTracker connectivity initialization failed:", error); if (mountedRef.current) setReady(true); });

    const appListener = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh().then(() => void syncNow({ manual: false }));
      }
    });

    /*
     * Event-driven retry: queued offline work is sent as soon as connectivity
     * returns. This replaces the old 60-second polling loop.
     */
    const networkListener = Network.addNetworkStateListener((state) => {
      const connected = isOnlineState(state);

      if (mountedRef.current) {
        setOnline(connected);
      }

      if (connected) {
        void syncNow({ manual: false });
      }
    });

    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      appListener.remove();
      networkListener.remove();
    };
  }, [refresh, syncNow]);

  useEffect(() => { if (!forcedOffline && online) void syncNow({ manual: false }); }, [forcedOffline, online, syncNow]);

  const value = useMemo(
    () => ({
      ready,
      online: online && !forcedOffline,
      effectiveOnline: online && !forcedOffline,
      networkOnline: online,
      forcedOffline, setForcedOffline, setMaterialPendingCount, registerMaterialSync,
      syncing,
      pendingCount: pendingCount + materialPendingCount,
      failedCount,
      lastError,
      refresh,
      syncNow,
    }),
    [
      ready,
      online,
      syncing,
      pendingCount,
      failedCount,
      lastError,
      refresh,
      syncNow, forcedOffline, setForcedOffline, materialPendingCount, registerMaterialSync,
    ],
  );

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const value = useContext(SyncContext);

  if (!value) {
    throw new Error("useSync must be used inside SyncProvider.");
  }

  return value;
}

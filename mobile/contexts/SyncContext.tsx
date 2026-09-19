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
  updateQueueStatus,
  type QueueRecord,
} from "@/lib/offline/db";
import { syncRevisionQueueRecord } from "@/lib/offline/revision-sync";
import { syncQualityQueueRecord } from "@/lib/offline/quality-sync";

type SyncState = {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastError: string | null;
  refresh: () => Promise<void>;
  syncNow: () => Promise<void>;
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
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const syncPromiseRef = useRef<Promise<void> | null>(null);

  const applyQueueState = useCallback((rows: QueueRecord[]) => {
    if (!mountedRef.current) return;

    setPendingCount(rows.length);
    setFailedCount(
      rows.filter((row) => row.status === "failed").length,
    );
  }, []);

  const refresh = useCallback(async () => {
    /*
     * Queue inspection is local and cheap. Network inspection is only used to
     * keep the status accurate; refresh itself never starts another sync loop.
     */
    const [network, rows] = await Promise.all([
      Network.getNetworkStateAsync(),
      queueRows(),
    ]);

    if (!mountedRef.current) return;

    setOnline(isOnlineState(network));
    applyQueueState(rows);
  }, [applyQueueState]);

  const runSync = useCallback(async () => {
    /*
     * Check the local queue first. If nothing is waiting there is no reason to
     * perform a network call or show a syncing state.
     */
    const rows = await queueRows();
    applyQueueState(rows);

    if (!rows.length) {
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

    if (!connected) return;

    if (mountedRef.current) {
      setSyncing(true);
      setLastError(null);
    }

    try {
      for (const record of rows) {
        try {
          await updateQueueStatus(record.id, "syncing", null);
          await processRecord(record);
          await removeQueueRecord(record.id);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Offline item could not be synced.";

          await updateQueueStatus(record.id, "failed", message);

          if (mountedRef.current) {
            setLastError(message);
          }
        }
      }
    } finally {
      const remaining = await queueRows();
      applyQueueState(remaining);

      if (mountedRef.current) {
        setSyncing(false);
      }
    }
  }, [applyQueueState]);

  const syncNow = useCallback((): Promise<void> => {
    /* One queue processor at a time, regardless of how many screens request it. */
    if (syncPromiseRef.current) {
      return syncPromiseRef.current;
    }

    const task = runSync();
    const tracked = task.finally(() => {
      if (syncPromiseRef.current === tracked) {
        syncPromiseRef.current = null;
      }
    });

    syncPromiseRef.current = tracked;
    return tracked;
  }, [runSync]);

  useEffect(() => {
    mountedRef.current = true;

    /*
     * Initial status check. syncNow() exits locally when the queue is empty,
     * so normal app startup does not create a pointless upload cycle.
     */
    void refresh().then(() => void syncNow());

    const appListener = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh().then(() => void syncNow());
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
        void syncNow();
      }
    });

    return () => {
      mountedRef.current = false;
      appListener.remove();
      networkListener.remove();
    };
  }, [refresh, syncNow]);

  const value = useMemo(
    () => ({
      online,
      syncing,
      pendingCount,
      failedCount,
      lastError,
      refresh,
      syncNow,
    }),
    [
      online,
      syncing,
      pendingCount,
      failedCount,
      lastError,
      refresh,
      syncNow,
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

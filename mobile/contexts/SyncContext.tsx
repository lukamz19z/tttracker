import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

  const refresh = useCallback(async () => {
    const [network, rows] = await Promise.all([Network.getNetworkStateAsync(), queueRows()]);
    setOnline(Boolean(network.isConnected && network.isInternetReachable !== false));
    setPendingCount(rows.length);
    setFailedCount(rows.filter((row: QueueRecord) => row.status === "failed").length);
  }, []);

  const syncNow = useCallback(async () => {
    const network = await Network.getNetworkStateAsync();
    const connected = Boolean(network.isConnected && network.isInternetReachable !== false);
    setOnline(connected);
    if (!connected || syncing) return;

    setSyncing(true);
    setLastError(null);

    try {
      const rows = await queueRows();
      for (const record of rows) {
        try {
          await updateQueueStatus(record.id, "syncing", null);
          await processRecord(record);
          await removeQueueRecord(record.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Offline item could not be synced.";
          await updateQueueStatus(record.id, "failed", message);
          setLastError(message);
        }
      }
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [refresh, syncing]);

  useEffect(() => {
    void refresh().then(() => void syncNow());
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh().then(() => void syncNow());
    });
    const timer = setInterval(() => void refresh().then(() => void syncNow()), 60_000);
    return () => {
      listener.remove();
      clearInterval(timer);
    };
  }, [refresh, syncNow]);

  const value = useMemo(
    () => ({ online, syncing, pendingCount, failedCount, lastError, refresh, syncNow }),
    [online, syncing, pendingCount, failedCount, lastError, refresh, syncNow],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const value = useContext(SyncContext);
  if (!value) throw new Error("useSync must be used inside SyncProvider.");
  return value;
}

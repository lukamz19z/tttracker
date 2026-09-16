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
import { cachedQuality, refreshQuality } from "@/lib/api/quality";
import type { QualityPayload } from "@/types/quality";

type QualityContextValue = {
  data: QualityPayload | null;
  loading: boolean;
  refreshing: boolean;
  cachedAt: string | null;
  error: string | null;
  refresh: () => Promise<void>;
};

const QualityContext = createContext<QualityContextValue | undefined>(undefined);

export function QualityProvider({ children }: PropsWithChildren) {
  const { profile } = useAuth();
  const { online } = useSync();
  const projectId = profile?.projectId ?? null;

  const [data, setData] = useState<QualityPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (forceRefresh = false) => {
      if (!projectId) {
        setData(null);
        setCachedAt(null);
        setError(null);
        return;
      }

      forceRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);

      try {
        const cached = await cachedQuality(projectId);
        if (cached) {
          setData(cached.value);
          setCachedAt(cached.updatedAt);
        }

        if (online) {
          try {
            const latest = await refreshQuality(projectId);
            setData(latest);
            setCachedAt(new Date().toISOString());
          } catch (refreshError) {
            if (!cached) throw refreshError;
            setError(
              refreshError instanceof Error
                ? `${refreshError.message} Showing cached Quality data.`
                : "Showing cached Quality data.",
            );
          }
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Quality data could not be loaded.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [online, projectId],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && online) void load(true);
    });
    return () => subscription.remove();
  }, [load, online]);

  const value = useMemo<QualityContextValue>(
    () => ({
      data,
      loading,
      refreshing,
      cachedAt,
      error,
      refresh: () => load(true),
    }),
    [data, loading, refreshing, cachedAt, error, load],
  );

  return <QualityContext.Provider value={value}>{children}</QualityContext.Provider>;
}

export function useQuality() {
  const value = useContext(QualityContext);
  if (!value) throw new Error("useQuality must be used inside QualityProvider.");
  return value;
}

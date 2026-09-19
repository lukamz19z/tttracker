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
  cachedQuality,
  refreshQuality,
} from "@/lib/api/quality";
import type { QualityPayload } from "@/types/quality";

type QualityContextValue = {
  data: QualityPayload | null;
  loading: boolean;
  refreshing: boolean;
  cachedAt: string | null;
  error: string | null;
  refresh: () => Promise<void>;
};

const QualityContext =
  createContext<QualityContextValue | undefined>(
    undefined,
  );

const QUALITY_STALE_MS = 2 * 60 * 1000;

function ageMs(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) {
    return Number.POSITIVE_INFINITY;
  }
  return Date.now() - time;
}

export function QualityProvider({
  children,
}: PropsWithChildren) {
  const { profile } = useAuth();
  const { online } = useSync();
  const projectId = profile?.projectId ?? null;

  const [data, setData] =
    useState<QualityPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] =
    useState(false);
  const [cachedAt, setCachedAt] =
    useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);

  const projectRef = useRef<string | null>(null);
  const dataRef = useRef<QualityPayload | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(
    null,
  );

  const runLiveRefresh = useCallback(
    async (
      currentProjectId: string,
      showRefreshState: boolean,
    ) => {
      if (!online) return;

      if (inFlightRef.current) {
        await inFlightRef.current;
        return;
      }

      const task = (async () => {
        if (showRefreshState) {
          setRefreshing(true);
        }

        try {
          const latest =
            await refreshQuality(currentProjectId);

          if (
            projectRef.current !== currentProjectId
          ) {
            return;
          }

          dataRef.current = latest;
          setData(latest);
          setCachedAt(new Date().toISOString());
          setError(null);
        } catch (refreshError) {
          if (
            projectRef.current !== currentProjectId
          ) {
            return;
          }

          setError(
            refreshError instanceof Error
              ? refreshError.message
              : "Quality data could not be refreshed.",
          );
        } finally {
          if (
            projectRef.current === currentProjectId
          ) {
            setRefreshing(false);
          }
        }
      })();

      inFlightRef.current = task;

      try {
        await task;
      } finally {
        if (inFlightRef.current === task) {
          inFlightRef.current = null;
        }
      }
    },
    [online],
  );

  const loadProject = useCallback(
    async (
      currentProjectId: string,
      forceLive: boolean,
    ) => {
      projectRef.current = currentProjectId;

      setLoading(!dataRef.current);
      setError(null);

      let cacheUpdatedAt: string | null = null;

      try {
        const cached =
          await cachedQuality(currentProjectId);

        if (
          projectRef.current !== currentProjectId
        ) {
          return;
        }

        if (cached) {
          dataRef.current = cached.value;
          setData(cached.value);
          setCachedAt(cached.updatedAt);
          cacheUpdatedAt = cached.updatedAt;
        }

        setLoading(false);

        const stale =
          ageMs(cacheUpdatedAt) >= QUALITY_STALE_MS;

        if (
          online &&
          (forceLive || !cached || stale)
        ) {
          await runLiveRefresh(
            currentProjectId,
            Boolean(cached),
          );
        }
      } catch (loadError) {
        if (
          projectRef.current !== currentProjectId
        ) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Quality data could not be loaded.",
        );
        setLoading(false);
      }
    },
    [online, runLiveRefresh],
  );

  useEffect(() => {
    if (!projectId) {
      projectRef.current = null;
      dataRef.current = null;
      setData(null);
      setCachedAt(null);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    void loadProject(projectId, false);
  }, [loadProject, projectId]);

  useEffect(() => {
    const subscription =
      AppState.addEventListener(
        "change",
        (state) => {
          if (
            state !== "active" ||
            !projectRef.current ||
            !online
          ) {
            return;
          }

          if (
            ageMs(cachedAt) >= QUALITY_STALE_MS
          ) {
            void runLiveRefresh(
              projectRef.current,
              Boolean(dataRef.current),
            );
          }
        },
      );

    return () => subscription.remove();
  }, [
    cachedAt,
    online,
    runLiveRefresh,
  ]);

  const refresh = useCallback(async () => {
    const currentProjectId =
      projectRef.current ?? projectId;

    if (!currentProjectId) return;

    await runLiveRefresh(
      currentProjectId,
      Boolean(dataRef.current),
    );
  }, [
    projectId,
    runLiveRefresh,
  ]);

  const value =
    useMemo<QualityContextValue>(
      () => ({
        data,
        loading,
        refreshing,
        cachedAt,
        error,
        refresh,
      }),
      [
        cachedAt,
        data,
        error,
        loading,
        refresh,
        refreshing,
      ],
    );

  return (
    <QualityContext.Provider value={value}>
      {children}
    </QualityContext.Provider>
  );
}

export function useQuality() {
  const value = useContext(QualityContext);

  if (!value) {
    throw new Error(
      "useQuality must be used inside QualityProvider.",
    );
  }

  return value;
}

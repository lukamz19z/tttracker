import AsyncStorage from "@react-native-async-storage/async-storage";
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

import { useAuth } from "@/contexts/AuthContext";
import { apiJson } from "@/lib/api/client";

export type DynamicRole = {
  id: string;
  code: string;
  name: string;
  description: string | null;
};

export type DynamicNavigationItem = {
  code: string;
  section_code: string;
  section_label: string;
  section_sort_order: number;
  label: string;
  route: string;
  icon_key: string;
  permission_code: string | null;
  capability_key: string | null;
  requires_project: boolean;
  sort_order: number;
  active: boolean;
};

export type AppConfig = {
  product_name: string;
  software_owner_name: string;
  software_owner_abn: string | null;
  support_email: string | null;
  privacy_url: string | null;
  terms_url: string | null;
  footer_text: string;
  updated_at?: string | null;
};

export type WorkflowCapability = {
  canReviewEdit: boolean;
  canApprove: boolean;
  canMarkPaid: boolean;
};

export type MobileCapabilities = {
  expense: WorkflowCapability;
  invoice: WorkflowCapability;
  docketReviewerProjectIds: string[];
  hasApprovals: boolean;
};

export type ApprovalCounts = {
  dailyDockets: number;
  expenseClaims: number;
  invoices: number;
};

type AccessMePayload = {
  error?: string;
  roles?: DynamicRole[];
  projects?: Array<{ project_id?: string; id?: string }>;
  project_ids?: string[];
  permissions?: {
    all?: string[];
    web?: string[];
    mobile?: string[];
    sharepoint?: string[];
  };
};

type BootstrapPayload = {
  error?: string;
  navigation?: DynamicNavigationItem[];
  app?: AppConfig;
  capabilities?: MobileCapabilities;
  approvalCounts?: ApprovalCounts;
};

type AccessCache = {
  savedAt: string;
  access: AccessMePayload;
  bootstrap: BootstrapPayload | null;
};

type AccessState = {
  loading: boolean;
  error: string | null;
  roles: DynamicRole[];
  roleCodes: Set<string>;
  roleLabel: string;
  projectIds: string[];
  permissions: Set<string>;
  navigation: DynamicNavigationItem[];
  appConfig: AppConfig;
  capabilities: MobileCapabilities;
  approvalCounts: ApprovalCounts;
  refresh: () => Promise<void>;
  can: (permissionCode: string | null | undefined) => boolean;
  hasRole: (roleCode: string | null | undefined) => boolean;
  hasCapability: (capabilityKey: string | null | undefined) => boolean;
};

const DEFAULT_APP_CONFIG: AppConfig = {
  product_name: "TTTracker",
  software_owner_name: "LMZ Contracting",
  software_owner_abn: null,
  support_email: null,
  privacy_url: null,
  terms_url: null,
  footer_text: "TTTracker · LMZ Contracting",
};

const EMPTY_CAPABILITIES: MobileCapabilities = {
  expense: {
    canReviewEdit: false,
    canApprove: false,
    canMarkPaid: false,
  },
  invoice: {
    canReviewEdit: false,
    canApprove: false,
    canMarkPaid: false,
  },
  docketReviewerProjectIds: [],
  hasApprovals: false,
};

const EMPTY_COUNTS: ApprovalCounts = {
  dailyDockets: 0,
  expenseClaims: 0,
  invoices: 0,
};

/*
 * Full RBAC/bootstrap refreshes are intentionally infrequent. Sensitive APIs
 * still enforce current server-side permissions on every request.
 */
const ACCESS_STALE_MS = 5 * 60_000;
const ACCESS_FALLBACK_CHECK_MS = 5 * 60_000;
const ACCESS_CACHE_PREFIX = "tttracker:mobile-access:v2:";

const AccessContext = createContext<AccessState | null>(null);

function cacheKey(userId: string) {
  return `${ACCESS_CACHE_PREFIX}${userId}`;
}

function normaliseProjectIds(access: AccessMePayload) {
  const values =
    access.project_ids ??
    access.projects?.map(
      (project) => project.project_id ?? project.id ?? "",
    ) ??
    [];

  return Array.from(
    new Set(values.map(String).map((value) => value.trim()).filter(Boolean)),
  );
}

function normaliseMobilePermissions(access: AccessMePayload) {
  return (
    access.permissions?.mobile ??
    (access.permissions?.all ?? []).filter((code) =>
      String(code).startsWith("mobile."),
    )
  );
}

async function readAccessCache(userId: string) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as AccessCache;
    if (!parsed?.access || !parsed.savedAt) return null;
    return parsed;
  } catch (error) {
    console.warn("TTTracker access cache could not be read:", error);
    return null;
  }
}

async function writeAccessCache(userId: string, cache: AccessCache) {
  try {
    await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(cache));
  } catch (error) {
    console.warn("TTTracker access cache could not be saved:", error);
  }
}

export function AccessProvider({ children }: PropsWithChildren) {
  const { session, loading: authLoading } = useAuth();

  const mountedRef = useRef(true);
  const activeUserIdRef = useRef<string | null>(null);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const lastServerRefreshRef = useRef(0);
  const latestAccessRef = useRef<AccessMePayload | null>(null);
  const latestBootstrapRef = useRef<BootstrapPayload | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<DynamicRole[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [navigation, setNavigation] = useState<DynamicNavigationItem[]>([]);
  const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [capabilities, setCapabilities] =
    useState<MobileCapabilities>(EMPTY_CAPABILITIES);
  const [approvalCounts, setApprovalCounts] =
    useState<ApprovalCounts>(EMPTY_COUNTS);

  const clear = useCallback(() => {
    latestAccessRef.current = null;
    latestBootstrapRef.current = null;
    lastServerRefreshRef.current = 0;

    if (!mountedRef.current) return;

    setRoles([]);
    setProjectIds([]);
    setPermissions(new Set());
    setNavigation([]);
    setAppConfig(DEFAULT_APP_CONFIG);
    setCapabilities(EMPTY_CAPABILITIES);
    setApprovalCounts(EMPTY_COUNTS);
    setError(null);
  }, []);

  const applyAccess = useCallback((access: AccessMePayload) => {
    latestAccessRef.current = access;

    if (!mountedRef.current) return;

    setRoles(access.roles ?? []);
    setProjectIds(normaliseProjectIds(access));
    setPermissions(new Set(normaliseMobilePermissions(access)));
  }, []);

  const applyBootstrap = useCallback((bootstrap: BootstrapPayload | null) => {
    if (!bootstrap) return;

    latestBootstrapRef.current = bootstrap;

    if (!mountedRef.current) return;

    setNavigation(bootstrap.navigation ?? []);
    setAppConfig(bootstrap.app ?? DEFAULT_APP_CONFIG);
    setCapabilities(bootstrap.capabilities ?? EMPTY_CAPABILITIES);
    setApprovalCounts(bootstrap.approvalCounts ?? EMPTY_COUNTS);
  }, []);

  const runServerRefresh = useCallback(async () => {
    const userId = session?.user.id ?? null;

    if (!userId) {
      clear();
      if (mountedRef.current) setLoading(false);
      return;
    }

    if (mountedRef.current) {
      setError(null);
    }

    const requestedUserId = userId;

    try {
      /*
       * These requests do not depend on each other, so run them together.
       * This removes an avoidable serial round trip during startup.
       */
      const [accessResult, bootstrapResult] = await Promise.allSettled([
        apiJson<AccessMePayload>("/api/access/me", { timeoutMs: 15_000 }),
        apiJson<BootstrapPayload>("/api/mobile/bootstrap", {
          timeoutMs: 15_000,
        }),
      ]);

      if (
        !mountedRef.current ||
        activeUserIdRef.current !== requestedUserId
      ) {
        return;
      }

      if (accessResult.status === "rejected") {
        throw accessResult.reason;
      }

      applyAccess(accessResult.value);

      if (bootstrapResult.status === "fulfilled") {
        applyBootstrap(bootstrapResult.value);
      } else {
        console.warn(
          "TTTracker /api/mobile/bootstrap failed; keeping cached mobile config:",
          bootstrapResult.reason,
        );
      }

      lastServerRefreshRef.current = Date.now();

      await writeAccessCache(requestedUserId, {
        savedAt: new Date().toISOString(),
        access: accessResult.value,
        bootstrap:
          bootstrapResult.status === "fulfilled"
            ? bootstrapResult.value
            : latestBootstrapRef.current,
      });
    } catch (refreshError) {
      const message =
        refreshError instanceof Error
          ? refreshError.message
          : "Could not load mobile access.";

      console.error("TTTracker access refresh failed:", refreshError);

      if (mountedRef.current) {
        setError(message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [applyAccess, applyBootstrap, clear, session?.user.id]);

  const refresh = useCallback((): Promise<void> => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const task = runServerRefresh();
    const tracked = task.finally(() => {
      if (refreshPromiseRef.current === tracked) {
        refreshPromiseRef.current = null;
      }
    });

    refreshPromiseRef.current = tracked;
    return tracked;
  }, [runServerRefresh]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;

    const userId = session?.user.id ?? null;
    const previousUserId = activeUserIdRef.current;
    activeUserIdRef.current = userId;

    if (!userId) {
      clear();
      setLoading(false);

      if (previousUserId) {
        void AsyncStorage.removeItem(cacheKey(previousUserId));
      }
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      const cached = await readAccessCache(userId);
      if (cancelled || activeUserIdRef.current !== userId) return;

      if (cached) {
        applyAccess(cached.access);
        applyBootstrap(cached.bootstrap);
        setLoading(false);

        const savedAt = new Date(cached.savedAt).getTime();
        if (Number.isFinite(savedAt)) {
          lastServerRefreshRef.current = savedAt;
        }
      }

      /* Always revalidate after cold start, but never block cached UI on it. */
      void refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [
    applyAccess,
    applyBootstrap,
    authLoading,
    clear,
    refresh,
    session?.user.id,
  ]);

  useEffect(() => {
    if (!session?.user.id) return;

    const appListener = AppState.addEventListener("change", (state) => {
      if (
        state === "active" &&
        Date.now() - lastServerRefreshRef.current >= ACCESS_STALE_MS
      ) {
        void refresh();
      }
    });

    /*
     * Low-frequency fallback for a role/permission change while the app stays
     * continuously open. This is 5x less frequent than the old full refresh.
     */
    const interval = setInterval(() => {
      if (
        AppState.currentState === "active" &&
        Date.now() - lastServerRefreshRef.current >= ACCESS_STALE_MS
      ) {
        void refresh();
      }
    }, ACCESS_FALLBACK_CHECK_MS);

    return () => {
      appListener.remove();
      clearInterval(interval);
    };
  }, [refresh, session?.user.id]);

  const roleCodes = useMemo(
    () =>
      new Set(
        roles
          .map((role) => String(role.code ?? "").trim().toLowerCase())
          .filter(Boolean),
      ),
    [roles],
  );

  const roleLabel = useMemo(
    () =>
      roles.length > 0
        ? roles.map((role) => role.name).filter(Boolean).join(", ")
        : "No access role",
    [roles],
  );

  const value = useMemo<AccessState>(
    () => ({
      loading,
      error,
      roles,
      roleCodes,
      roleLabel,
      projectIds,
      permissions,
      navigation,
      appConfig,
      capabilities,
      approvalCounts,
      refresh,
      can: (permissionCode) =>
        !permissionCode || permissions.has(permissionCode),
      hasRole: (roleCode) =>
        !roleCode ||
        roleCodes.has(String(roleCode).trim().toLowerCase()),
      hasCapability: (capabilityKey) => {
        if (!capabilityKey) return true;
        if (capabilityKey === "has_approvals") {
          return capabilities.hasApprovals;
        }
        return false;
      },
    }),
    [
      loading,
      error,
      roles,
      roleCodes,
      roleLabel,
      projectIds,
      permissions,
      navigation,
      appConfig,
      capabilities,
      approvalCounts,
      refresh,
    ],
  );

  return (
    <AccessContext.Provider value={value}>
      {children}
    </AccessContext.Provider>
  );
}

export function useAccess() {
  const value = useContext(AccessContext);

  if (!value) {
    throw new Error("useAccess must be used inside AccessProvider.");
  }

  return value;
}

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

import { apiJson } from "@/lib/api/client";
import { supabase } from "@/lib/supabase";

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
  expense: { canReviewEdit: false, canApprove: false, canMarkPaid: false },
  invoice: { canReviewEdit: false, canApprove: false, canMarkPaid: false },
  docketReviewerProjectIds: [],
  hasApprovals: false,
};

const EMPTY_COUNTS: ApprovalCounts = {
  dailyDockets: 0,
  expenseClaims: 0,
  invoices: 0,
};

const ACCESS_REFRESH_INTERVAL_MS = 60_000;
const AccessContext = createContext<AccessState | null>(null);

export function AccessProvider({ children }: PropsWithChildren) {
  const loadedRef = useRef(false);
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
    setRoles([]);
    setProjectIds([]);
    setPermissions(new Set());
    setNavigation([]);
    setAppConfig(DEFAULT_APP_CONFIG);
    setCapabilities(EMPTY_CAPABILITIES);
    setApprovalCounts(EMPTY_COUNTS);
    setError(null);
    loadedRef.current = false;
  }, []);

  const refresh = useCallback(async () => {
    if (!loadedRef.current) setLoading(true);
    setError(null);

    try {
      const { data } = await supabase.auth.getSession();

      if (__DEV__) {
        console.log(
          "TTTracker RBAC session:",
          data.session ? data.session.user.email ?? data.session.user.id : "NO SESSION",
        );
      }

      if (!data.session) {
        clear();
        return;
      }

      /*
       * RBAC is deliberately loaded separately from the mobile bootstrap.
       * A bootstrap/config failure must never wipe the user's roles and
       * effective mobile permissions.
       */
      let access: AccessMePayload;

      try {
        access = await apiJson<AccessMePayload>("/api/access/me");

        if (__DEV__) {
          console.log("TTTracker RBAC roles:", access.roles ?? []);
          console.log(
            "TTTracker mobile permissions:",
            access.permissions?.mobile ??
              (access.permissions?.all ?? []).filter((code) =>
                String(code).startsWith("mobile."),
              ),
          );
        }
      } catch (accessError) {
        console.error("TTTracker /api/access/me failed:", accessError);
        throw accessError;
      }

      const nextProjectIds =
        access.project_ids ??
        access.projects?.map(
          (project) => project.project_id ?? project.id ?? "",
        ) ??
        [];

      const nextMobilePermissions =
        access.permissions?.mobile ??
        (access.permissions?.all ?? []).filter((code) =>
          String(code).startsWith("mobile."),
        );

      setRoles(access.roles ?? []);
      setProjectIds(
        Array.from(new Set(nextProjectIds.map(String).filter(Boolean))),
      );
      setPermissions(new Set(nextMobilePermissions));

      /*
       * Bootstrap is supplementary. If it fails, preserve RBAC and use
       * safe defaults for navigation/config/workflow extras.
       */
      try {
        const bootstrap =
          await apiJson<BootstrapPayload>("/api/mobile/bootstrap");

        setNavigation(bootstrap.navigation ?? []);
        setAppConfig(bootstrap.app ?? DEFAULT_APP_CONFIG);
        setCapabilities(bootstrap.capabilities ?? EMPTY_CAPABILITIES);
        setApprovalCounts(bootstrap.approvalCounts ?? EMPTY_COUNTS);

        if (__DEV__) {
          console.log(
            "TTTracker mobile bootstrap:",
            `${bootstrap.navigation?.length ?? 0} navigation items`,
          );
        }
      } catch (bootstrapError) {
        console.warn(
          "TTTracker /api/mobile/bootstrap failed; RBAC remains active:",
          bootstrapError,
        );

        setNavigation([]);
        setAppConfig(DEFAULT_APP_CONFIG);
        setCapabilities(EMPTY_CAPABILITIES);
        setApprovalCounts(EMPTY_COUNTS);
      }
    } catch (refreshError) {
      const message =
        refreshError instanceof Error
          ? refreshError.message
          : "Could not load mobile access.";

      console.error("TTTracker access refresh failed:", refreshError);
      setError(message);
    } finally {
      loadedRef.current = true;
      setLoading(false);
    }
  }, [clear]);

  useEffect(() => {
    void refresh();

    const authListener = supabase.auth.onAuthStateChange(() => void refresh());

    const appListener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });

    const interval = setInterval(() => {
      if (AppState.currentState === "active") void refresh();
    }, ACCESS_REFRESH_INTERVAL_MS);

    return () => {
      authListener.data.subscription.unsubscribe();
      appListener.remove();
      clearInterval(interval);
    };
  }, [refresh]);

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
        if (capabilityKey === "has_approvals") return capabilities.hasApprovals;
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

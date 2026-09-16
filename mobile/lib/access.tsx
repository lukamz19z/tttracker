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

type BootstrapPayload = {
  error?: string;
  roles?: DynamicRole[];
  projects?: Array<{ id: string }>;
  permissions?: string[];
  navigation?: DynamicNavigationItem[];
  app?: AppConfig;
  capabilities?: MobileCapabilities;
  approvalCounts?: ApprovalCounts;
};

type AccessState = {
  loading: boolean;
  error: string | null;
  roles: DynamicRole[];
  projectIds: string[];
  permissions: Set<string>;
  navigation: DynamicNavigationItem[];
  appConfig: AppConfig;
  capabilities: MobileCapabilities;
  approvalCounts: ApprovalCounts;
  refresh: () => Promise<void>;
  can: (permissionCode: string | null | undefined) => boolean;
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

const AccessContext = createContext<AccessState | null>(null);

export function AccessProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<DynamicRole[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [navigation, setNavigation] = useState<DynamicNavigationItem[]>([]);
  const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [capabilities, setCapabilities] = useState<MobileCapabilities>(EMPTY_CAPABILITIES);
  const [approvalCounts, setApprovalCounts] = useState<ApprovalCounts>(EMPTY_COUNTS);

  const clear = useCallback(() => {
    setRoles([]);
    setProjectIds([]);
    setPermissions(new Set());
    setNavigation([]);
    setCapabilities(EMPTY_CAPABILITIES);
    setApprovalCounts(EMPTY_COUNTS);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        clear();
        return;
      }

      const payload = await apiJson<BootstrapPayload>("/api/mobile/bootstrap");
      setRoles(payload.roles ?? []);
      setProjectIds((payload.projects ?? []).map((project) => project.id));
      setPermissions(new Set(payload.permissions ?? []));
      setNavigation(payload.navigation ?? []);
      setAppConfig(payload.app ?? DEFAULT_APP_CONFIG);
      setCapabilities(payload.capabilities ?? EMPTY_CAPABILITIES);
      setApprovalCounts(payload.approvalCounts ?? EMPTY_COUNTS);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not load mobile configuration.");
    } finally {
      setLoading(false);
    }
  }, [clear]);

  useEffect(() => {
    void refresh();
    const authListener = supabase.auth.onAuthStateChange(() => void refresh());
    const appListener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });

    return () => {
      authListener.data.subscription.unsubscribe();
      appListener.remove();
    };
  }, [refresh]);

  const value = useMemo<AccessState>(
    () => ({
      loading,
      error,
      roles,
      projectIds,
      permissions,
      navigation,
      appConfig,
      capabilities,
      approvalCounts,
      refresh,
      can: (permissionCode) => !permissionCode || permissions.has(permissionCode),
      hasCapability: (capabilityKey) => {
        if (!capabilityKey) return true;
        if (capabilityKey === "has_approvals") return capabilities.hasApprovals;
        return false;
      },
    }),
    [loading, error, roles, projectIds, permissions, navigation, appConfig, capabilities, approvalCounts, refresh],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const value = useContext(AccessContext);
  if (!value) throw new Error("useAccess must be used inside AccessProvider.");
  return value;
}

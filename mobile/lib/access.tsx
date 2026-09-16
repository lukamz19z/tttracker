import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "./supabase";

const BASE_URL =
  process.env.EXPO_PUBLIC_TTTRACKER_WEB_URL ?? "https://tttracker.com.au";

type Role = { id: string; code: string; name: string };
type ProjectAccess = { project_id: string };
type AccessPayload = {
  error?: string;
  roles?: Role[];
  projects?: ProjectAccess[];
  permissions?: {
    mobile?: string[];
  };
};

type AccessState = {
  loading: boolean;
  roles: Role[];
  projectIds: string[];
  permissions: Set<string>;
  refresh: () => Promise<void>;
  can: (permissionCode: string) => boolean;
};

const AccessContext = createContext<AccessState | null>(null);

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setRoles([]);
        setProjectIds([]);
        setPermissions(new Set());
        return;
      }

      const response = await fetch(`${BASE_URL}/api/access/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as AccessPayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load access.");
      }

      setRoles(payload.roles ?? []);
      setProjectIds((payload.projects ?? []).map((row) => row.project_id));
      setPermissions(new Set(payload.permissions?.mobile ?? []));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => listener.subscription.unsubscribe();
  }, [refresh]);

  const value = useMemo<AccessState>(
    () => ({
      loading,
      roles,
      projectIds,
      permissions,
      refresh,
      can: (permissionCode) => permissions.has(permissionCode),
    }),
    [loading, roles, projectIds, permissions, refresh],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const value = useContext(AccessContext);
  if (!value) throw new Error("useAccess must be used inside AccessProvider.");
  return value;
}

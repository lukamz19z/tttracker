"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createSupabaseBrowser } from "@/lib/supabase";
import { resilientFetch } from "@/lib/backend-resilience";

type Role = { id: string; code: string; name: string };
type ProjectAccess = { project_id: string };

type AccessPayload = {
  error?: string;
  roles?: Role[];
  projects?: ProjectAccess[];
  permissions?: {
    web?: string[];
    mobile?: string[];
    sharepoint?: string[];
  };
};

type AccessContextValue = {
  loading: boolean;
  roles: Role[];
  projectIds: string[];
  webPermissions: Set<string>;
  mobilePermissions: Set<string>;
  sharePointPermissions: Set<string>;
  can: (permissionCode: string) => boolean;
  refresh: () => Promise<void>;
};

const AccessContext = createContext<AccessContextValue | null>(null);
const ACCESS_REFRESH_STALE_MS = 2 * 60_000;

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const loadedRef = useRef(false);
  const requestRef = useRef<Promise<void> | null>(null);
  const lastSuccessRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [webPermissions, setWebPermissions] = useState<Set<string>>(new Set());
  const [mobilePermissions, setMobilePermissions] = useState<Set<string>>(
    new Set(),
  );
  const [sharePointPermissions, setSharePointPermissions] = useState<Set<string>>(
    new Set(),
  );

  const clear = useCallback(() => {
    setRoles([]);
    setProjectIds([]);
    setWebPermissions(new Set());
    setMobilePermissions(new Set());
    setSharePointPermissions(new Set());
    loadedRef.current = false;
  }, []);

  const refresh = useCallback(async () => {
    if (requestRef.current) return requestRef.current;
    if (!loadedRef.current) setLoading(true);
    const task = (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          clear();
          return;
        }

        const response = await resilientFetch("/api/access/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
          signal: AbortSignal.timeout(20_000),
        });
        const payload = (await response.json()) as AccessPayload;
        if (!response.ok) throw new Error(payload.error ?? `Could not load access (${response.status}).`);

        setRoles(payload.roles ?? []);
        setProjectIds((payload.projects ?? []).map((row) => row.project_id));
        setWebPermissions(new Set(payload.permissions?.web ?? []));
        setMobilePermissions(new Set(payload.permissions?.mobile ?? []));
        setSharePointPermissions(new Set(payload.permissions?.sharepoint ?? []));
        lastSuccessRef.current = Date.now();
      } catch (error) {
        console.warn("TTTracker access refresh failed; keeping the current access snapshot.", error instanceof Error ? error.message : "unknown error");
      } finally {
        loadedRef.current = true;
        setLoading(false);
      }
    })();
    const tracked = task.finally(() => { if (requestRef.current === tracked) requestRef.current = null; });
    requestRef.current = tracked;
    return tracked;
  }, [clear, supabase]);

  useEffect(() => {
    void refresh();

    const auth = supabase.auth.onAuthStateChange(() => void refresh());
    const onFocus = () => { if (Date.now() - lastSuccessRef.current >= ACCESS_REFRESH_STALE_MS) void refresh(); };
    window.addEventListener("focus", onFocus);

    return () => {
      auth.data.subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, supabase]);

  const value = useMemo<AccessContextValue>(
    () => ({
      loading,
      roles,
      projectIds,
      webPermissions,
      mobilePermissions,
      sharePointPermissions,
      can: (code) =>
        webPermissions.has(code) ||
        mobilePermissions.has(code) ||
        sharePointPermissions.has(code),
      refresh,
    }),
    [
      loading,
      roles,
      projectIds,
      webPermissions,
      mobilePermissions,
      sharePointPermissions,
      refresh,
    ],
  );

  return (
    <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
  );
}

export function useAccess() {
  const value = useContext(AccessContext);
  if (!value) throw new Error("useAccess must be used inside AccessProvider.");
  return value;
}

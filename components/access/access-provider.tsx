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
const REFRESH_MS = 60_000;

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const loadedRef = useRef(false);
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
    if (!loadedRef.current) setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        clear();
        return;
      }

      const response = await fetch("/api/access/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as AccessPayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load access.");
      }

      setRoles(payload.roles ?? []);
      setProjectIds((payload.projects ?? []).map((row) => row.project_id));
      setWebPermissions(new Set(payload.permissions?.web ?? []));
      setMobilePermissions(new Set(payload.permissions?.mobile ?? []));
      setSharePointPermissions(new Set(payload.permissions?.sharepoint ?? []));
    } finally {
      loadedRef.current = true;
      setLoading(false);
    }
  }, [clear, supabase]);

  useEffect(() => {
    void refresh();

    const auth = supabase.auth.onAuthStateChange(() => void refresh());
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);

    return () => {
      auth.data.subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
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

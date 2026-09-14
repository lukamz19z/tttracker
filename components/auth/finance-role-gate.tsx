"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { createSupabaseBrowser } from "@/lib/supabase";

function normaliseRole(value?: string | null) {
  const role = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");

  if (["finance", "finance_manager", "accounts"].includes(role)) {
    return "finance";
  }

  if (["admin", "administrator", "site_admin"].includes(role)) {
    return "admin";
  }

  return role;
}

function isFinanceAllowedPath(pathname: string) {
  const path = pathname || "/";

  if (
    path === "/expenses/settings" ||
    path.startsWith("/expenses/settings/")
  ) {
    return false;
  }

  if (path === "/expenses" || path.startsWith("/expenses/")) {
    return true;
  }

  if (path === "/profile" || path.startsWith("/profile/")) {
    return true;
  }

  return false;
}

export function FinanceRoleGate({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const pathname = usePathname();
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  const checkAccess = useCallback(async () => {
    setChecking(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        router.replace("/login");
        return;
      }

      const roleResult = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (roleResult.error) throw roleResult.error;

      const nextRole = normaliseRole(roleResult.data?.role);
      setRole(nextRole);

      if (nextRole !== "finance") {
        return;
      }

      if (!isFinanceAllowedPath(pathname)) {
        router.replace("/expenses");
      }
    } catch (error) {
      console.error("Finance role access check failed:", error);
      router.replace("/login");
    } finally {
      setChecking(false);
    }
  }, [pathname, router, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkAccess();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [checkAccess]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm">
          <Loader2 size={18} className="animate-spin text-slate-400" />
          Checking access...
        </div>
      </div>
    );
  }

  if (role === "finance" && !isFinanceAllowedPath(pathname)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 size={22} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return <>{children}</>;
}

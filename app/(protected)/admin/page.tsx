"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, Loader2, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { AdminAccountsPanel } from "@/components/admin/admin-accounts-panel";
import { AdminBrandingPanel } from "@/components/admin/admin-branding-panel";
import { AdminPermissionsPanel } from "@/components/admin/admin-permissions-panel";
import { createSupabaseBrowser } from "@/lib/supabase";

type Tab = "accounts" | "permissions" | "branding";

export default function AdminPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [tab, setTab] = useState<Tab>("accounts");
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAccess = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { window.location.href = "/login"; return; }

    const response = await fetch("/api/access/me", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Could not verify access.");

    const webPermissions = new Set<string>(payload.permissions?.web ?? []);
    if (!webPermissions.has("tt.admin.access")) {
      window.location.href = "/";
      return;
    }
  }, [supabase]);

  useEffect(() => {
    void checkAccess().catch((err) => setError(err instanceof Error ? err.message : "Could not verify access.")).finally(() => setChecking(false));
  }, [checkAccess]);

  if (checking) return <AppShell><div className="flex min-h-[60vh] items-center justify-center"><Loader2 size={28} className="animate-spin text-slate-400" /></div></AppShell>;

  return <AppShell><div className="mx-auto max-w-7xl space-y-6">
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-2 text-slate-400"><ShieldCheck size={18} /><span className="text-sm font-semibold uppercase tracking-wider">Admin</span></div><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Administration</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Manage login accounts, dynamic roles, user permissions, project access, SharePoint access and document branding.</p></section>
    {error ? <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</section> : null}
    <section className="rounded-2xl border border-slate-200 bg-white p-1 shadow-sm"><div className="flex flex-wrap gap-1"><TabButton active={tab === "accounts"} onClick={() => setTab("accounts")} icon={<Users size={16} />} label="Accounts" /><TabButton active={tab === "permissions"} onClick={() => setTab("permissions")} icon={<SlidersHorizontal size={16} />} label="Roles & Permissions" /><TabButton active={tab === "branding"} onClick={() => setTab("branding")} icon={<ImageIcon size={16} />} label="Branding" /></div></section>
    {tab === "accounts" ? <AdminAccountsPanel onOpenAccess={() => setTab("permissions")} /> : tab === "permissions" ? <AdminPermissionsPanel /> : <AdminBrandingPanel />}
  </div></AppShell>;
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{icon}{label}</button>; }

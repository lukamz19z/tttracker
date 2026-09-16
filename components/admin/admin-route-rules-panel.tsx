"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Route, Trash2, X } from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase";

type AccessArea = {
  id: string;
  code: string;
  name: string;
  type: string;
  permission_level?: string | null;
  access_groups?: { id?: string | null; code?: string | null; name?: string | null; sort_order?: number | null } | null;
};

type Rule = {
  id: string;
  name: string;
  route_pattern: string;
  match_type: "exact" | "prefix";
  priority: number;
  is_active: boolean;
  access_area_id: string;
  access_code: string;
  access_name: string;
  group_name?: string | null;
};

type FormState = {
  id: string;
  name: string;
  routePattern: string;
  matchType: "exact" | "prefix";
  accessAreaId: string;
  priority: string;
  isActive: boolean;
};

const EMPTY: FormState = {
  id: "",
  name: "",
  routePattern: "",
  matchType: "prefix",
  accessAreaId: "",
  priority: "100",
  isActive: true,
};

export function AdminRouteRulesPanel() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [rules, setRules] = useState<Rule[]>([]);
  const [areas, setAreas] = useState<AccessArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const apiFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your session has expired.");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${session.access_token}`);
    return fetch(input, { ...init, headers, cache: "no-store" });
  }, [supabase]);

  const load = useCallback(async () => {
    const response = await apiFetch("/api/admin/access/routes");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Could not load route rules.");
    setRules(payload.rules ?? []);
    setAreas(payload.accessAreas ?? []);
  }, [apiFetch]);

  useEffect(() => {
    void (async () => {
      try { await load(); }
      catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not load route rules." }); }
      finally { setLoading(false); }
    })();
  }, [load]);

  const groupedAreas = useMemo(() => {
    const map = new Map<string, AccessArea[]>();
    for (const area of areas) {
      const group = area.access_groups?.name ?? "Other";
      const list = map.get(group) ?? [];
      list.push(area);
      map.set(group, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [areas]);

  function openNew() {
    setForm({ ...EMPTY, accessAreaId: areas[0]?.id ?? "" });
  }

  function openEdit(rule: Rule) {
    setForm({
      id: rule.id,
      name: rule.name,
      routePattern: rule.route_pattern,
      matchType: rule.match_type,
      accessAreaId: rule.access_area_id,
      priority: String(rule.priority),
      isActive: rule.is_active,
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await apiFetch("/api/admin/access/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id || undefined,
          name: form.name,
          route_pattern: form.routePattern,
          match_type: form.matchType,
          access_area_id: form.accessAreaId,
          priority: Number(form.priority || 100),
          is_active: form.isActive,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not save route rule.");
      await load();
      setForm(null);
      setMessage({ tone: "success", text: "Route rule saved." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not save route rule." });
    } finally {
      setSaving(false);
    }
  }

  async function remove(rule: Rule) {
    if (!window.confirm(`Delete route rule "${rule.name}"?`)) return;
    setDeleting(rule.id);
    setMessage(null);
    try {
      const response = await apiFetch(`/api/admin/access/routes?id=${encodeURIComponent(rule.id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not delete route rule.");
      await load();
      setMessage({ tone: "success", text: "Route rule deleted." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not delete route rule." });
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return <section className="flex min-h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white"><Loader2 size={26} className="animate-spin text-slate-400" /></section>;
  }

  return (
    <div className="space-y-5">
      {message ? <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{message.text}</div> : null}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-400"><Route size={18} /><span className="text-xs font-bold uppercase tracking-wider">Website Route Rules</span></div>
            <h3 className="mt-2 text-xl font-bold text-slate-950">Map pages to permissions</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">A route rule points a website route to a database permission. Roles never appear here. Prefix rules automatically protect future pages underneath the same module.</p>
          </div>
          <button type="button" onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Add Route Rule</button>
        </div>

        {rules.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No route rules configured.</div> : (
          <div className="divide-y divide-slate-100">
            {rules.map((rule) => (
              <div key={rule.id} className="grid gap-4 px-6 py-4 lg:grid-cols-[minmax(0,1fr)_220px_120px_auto] lg:items-center">
                <div><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-slate-950">{rule.name}</span><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">{rule.match_type}</span>{!rule.is_active ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Disabled</span> : null}</div><div className="mt-1 font-mono text-xs text-slate-500">{rule.route_pattern}</div></div>
                <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Permission</div><div className="mt-1 text-sm font-semibold text-slate-800">{rule.access_name}</div><div className="text-xs text-slate-400">{rule.access_code}</div></div>
                <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Priority</div><div className="mt-1 text-sm text-slate-700">{rule.priority}</div></div>
                <div className="flex gap-2 lg:justify-end"><button type="button" onClick={() => openEdit(rule)} className="rounded-xl border border-slate-200 p-2 text-slate-600"><Pencil size={16} /></button><button type="button" onClick={() => void remove(rule)} disabled={deleting === rule.id} className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-600 disabled:opacity-50">{deleting === rule.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}</button></div>
              </div>
            ))}
          </div>
        )}
      </section>

      {form ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5"><div><h3 className="text-xl font-bold text-slate-950">{form.id ? "Edit Route Rule" : "Add Route Rule"}</h3><p className="mt-1 text-sm text-slate-500">Map a website path to one database permission.</p></div><button type="button" onClick={() => setForm(null)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X size={19} /></button></div>
            <form onSubmit={save} className="space-y-5 p-6">
              <Field label="Rule name"><input required value={form.name} onChange={(e) => setForm((current) => current ? { ...current, name: e.target.value } : current)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></Field>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]"><Field label="Route"><input required value={form.routePattern} onChange={(e) => setForm((current) => current ? { ...current, routePattern: e.target.value } : current)} placeholder="/assets" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm" /></Field><Field label="Match"><select value={form.matchType} onChange={(e) => setForm((current) => current ? { ...current, matchType: e.target.value as "exact" | "prefix" } : current)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="prefix">Prefix / module</option><option value="exact">Exact page</option></select></Field></div>
              <Field label="Required permission"><select required value={form.accessAreaId} onChange={(e) => setForm((current) => current ? { ...current, accessAreaId: e.target.value } : current)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">Select permission</option>{groupedAreas.map(([group, rows]) => <optgroup key={group} label={group}>{rows.map((area) => <option key={area.id} value={area.id}>{area.name} ({area.code})</option>)}</optgroup>)}</select></Field>
              <div className="grid gap-4 sm:grid-cols-2"><Field label="Priority"><input type="number" value={form.priority} onChange={(e) => setForm((current) => current ? { ...current, priority: e.target.value } : current)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></Field><label className="mt-7 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((current) => current ? { ...current, isActive: e.target.checked } : current)} /> Active</label></div>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-5"><button type="button" onClick={() => setForm(null)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? <Loader2 size={16} className="animate-spin" /> : null} Save Rule</button></div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold text-slate-800">{label}</span>{children}</label>;
}

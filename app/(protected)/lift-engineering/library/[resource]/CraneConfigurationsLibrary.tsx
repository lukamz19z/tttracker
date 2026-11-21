"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Plus, Search, Truck, X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";
import { baseSetupOptions, type BaseConfigurationChart } from "@/lib/lift-engineering/base-configuration";

type Profile = { id: string; name: string; manufacturer: string | null; model: string | null; active: boolean };
type TechnicalRevision = { id: string; revision: string; status: string; created_at: string; created_by: string | null; counterweight_t: number | null; outrigger_state: string | null; data: Record<string, unknown> | null };
type Configuration = { id: string; crane_profile_id: string; name: string; active: boolean; profile: Profile | null; revisions: TechnicalRevision[]; currentRevision: TechnicalRevision | null; revisionCount: number; chartConfigurationCount: number; profileChartConfigurationCount: number; lastUpdated: string };
type Summary = { configurations: Configuration[]; profiles: Profile[]; configurationOptions: BaseConfigurationChart[] };
type FormState = { profileId: string; name: string; counterweight: string; outriggerState: string; outriggerLength: string; outriggerWidth: string; slewRange: string; notes: string; revision: string; customManual: boolean };

const emptyForm: FormState = { profileId: "", name: "", counterweight: "", outriggerState: "", outriggerLength: "", outriggerWidth: "", slewRange: "", notes: "", revision: "Rev A", customManual: false };
const statusStyle = (status: string) => /verified|active|current/i.test(status) ? "bg-emerald-50 text-emerald-700" : /superseded|archived/i.test(status) ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-800";
const craneName = (profile: Profile | null) => profile ? [profile.manufacturer, profile.model || profile.name].filter(Boolean).join(" ") : "Crane profile unavailable";
const revisionData = (revision: TechnicalRevision | null) => revision?.data && typeof revision.data === "object" ? revision.data : {};

export function CraneConfigurationsLibrary() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [summary, setSummary] = useState<Summary>({ configurations: [], profiles: [], configurationOptions: [] });
  const [search, setSearch] = useState(""); const [craneFilter, setCraneFilter] = useState("all"); const [statusFilter, setStatusFilter] = useState("all");
  const [modal, setModal] = useState<"create" | "edit" | "revision" | null>(null); const [form, setForm] = useState<FormState>(emptyForm);
  const [nameTouched, setNameTouched] = useState(false);
  const [editing, setEditing] = useState<Configuration | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const token = useCallback(async () => { const { data: { session } } = await supabase.auth.getSession(); if (!session?.access_token) throw new Error("Your session has expired."); return session.access_token; }, [supabase]);
  const load = useCallback(async () => {
    const accessToken = await token();
    const response = await fetch("/api/lift-engineering/library/configurations/summary", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const payload = await response.json() as Summary & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Crane configurations could not be loaded.");
    setSummary({ configurations: payload.configurations ?? [], profiles: payload.profiles ?? [], configurationOptions: payload.configurationOptions ?? [] });
  }, [token]);
  useEffect(() => { void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Crane configurations could not be loaded.")); }, [load]);

  const filtered = summary.configurations.filter((configuration) => {
    const profile = configuration.profile;
    const searchText = [configuration.name, profile?.name, profile?.manufacturer, profile?.model, configuration.currentRevision?.revision, configuration.currentRevision?.outrigger_state].join(" ").toLocaleLowerCase("en-AU");
    const status = !configuration.active ? "archived" : configuration.currentRevision?.status?.toLowerCase() ?? "draft";
    return searchText.includes(search.toLocaleLowerCase("en-AU")) && (craneFilter === "all" || configuration.crane_profile_id === craneFilter) && (statusFilter === "all" || (statusFilter === "active" ? /verified|active|current/.test(status) : status === statusFilter));
  });

  function beginCreate() { setEditing(null); setForm(emptyForm); setNameTouched(false); setError(""); setModal("create"); }
  function suggestName(state = form) {
    const parts = [state.counterweight ? `${state.counterweight} t` : "", state.outriggerLength && state.outriggerWidth ? `${Number(state.outriggerLength).toFixed(2)} × ${Number(state.outriggerWidth).toFixed(2)} m` : state.outriggerState, state.slewRange].filter(Boolean);
    return parts.join(" / ") || "Crane configuration";
  }
  const chartOptions = form.profileId ? baseSetupOptions(summary.configurationOptions, form.profileId, { counterweightT: form.counterweight === "" ? null : Number(form.counterweight), outriggerLengthM: form.outriggerLength === "" ? null : Number(form.outriggerLength), outriggerWidthM: form.outriggerWidth === "" ? null : Number(form.outriggerWidth) }) : { counterweights: [], outriggers: [], slewRanges: [] };
  const selectedOutriggerKey = form.outriggerLength && form.outriggerWidth ? `${Number(form.outriggerLength).toFixed(6)}|${Number(form.outriggerWidth).toFixed(6)}` : "";
  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    if (key === "name") setNameTouched(true);
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "profileId") {
        next.counterweight = ""; next.outriggerState = ""; next.outriggerLength = ""; next.outriggerWidth = ""; next.slewRange = ""; next.customManual = false;
      }
      if (key === "counterweight") { next.outriggerState = ""; next.outriggerLength = ""; next.outriggerWidth = ""; next.slewRange = ""; }
      if (key === "outriggerState") next.slewRange = "";
      if (key !== "name" && (!editing || modal === "create") && !nameTouched) next.name = suggestName(next);
      return next;
    });
  }
  async function api(path: string, init: RequestInit) {
    const accessToken = await token();
    const response = await fetch(path, { ...init, headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init.headers } });
    const payload = await response.json() as { error?: string; record?: { id: string }; revision?: TechnicalRevision };
    if (!response.ok) throw new Error(payload.error || "Crane configuration could not be saved.");
    return payload;
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (modal === "create") {
        if (!form.profileId) throw new Error("Select a crane profile.");
        const parent = await api("/api/lift-engineering/library/configurations", { method: "POST", body: JSON.stringify({ crane_profile_id: form.profileId, name: form.name.trim() || suggestName(), active: true }) });
        if (!parent.record?.id) throw new Error("Crane configuration was created without a returned record ID.");
        await api("/api/lift-engineering/library/configurations/revisions", { method: "POST", body: JSON.stringify(revisionPayload(parent.record.id)) });
      } else if (modal === "edit" && editing) {
        await api("/api/lift-engineering/library/configurations", { method: "PATCH", body: JSON.stringify({ id: editing.id, name: form.name.trim() || suggestName() }) });
        await api("/api/lift-engineering/library/configurations/revisions", { method: "POST", body: JSON.stringify(revisionPayload(editing.id)) });
      } else if (modal === "revision" && editing) {
        await api("/api/lift-engineering/library/configurations/revisions", { method: "POST", body: JSON.stringify(revisionPayload(editing.id)) });
      }
      setModal(null); setEditing(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Crane configuration could not be saved."); }
    finally { setBusy(false); }
  }
  function revisionPayload(parentId: string) {
    const length = form.outriggerLength === "" ? null : Number(form.outriggerLength);
    const width = form.outriggerWidth === "" ? null : Number(form.outriggerWidth);
    if ((length != null && (!Number.isFinite(length) || length <= 0)) || (width != null && (!Number.isFinite(width) || width <= 0))) throw new Error("Outrigger dimensions must be positive numbers.");
    return { parentId, revision: form.revision.trim() || nextRevision(editing?.currentRevision?.revision), status: "draft", counterweight_t: form.counterweight === "" ? null : Number(form.counterweight), outrigger_state: form.customManual ? form.outriggerState || "Custom / Manual" : form.outriggerState || null, data: { configurationSource: form.customManual ? "custom_manual" : "manufacturer_chart", outriggerLengthM: length, outriggerWidthM: width, slewRange: form.slewRange || null, notes: form.notes.trim() || null } };
  }

  return <AppShell><main className="mx-auto max-w-6xl space-y-5 p-4 md:p-7">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><Link href="/lift-engineering" className="text-sm font-semibold text-blue-700">← Lift Engineering</Link><h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Crane Configurations</h1><p className="mt-1 text-sm text-slate-600">Reusable crane setup configurations used across load charts and lift studies.</p></div><button type="button" onClick={beginCreate} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white"><Plus size={16}/> New Configuration</button></header>
    {error && !modal && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
    <section className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center"><label className="relative min-w-0 flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search configurations…" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm"/></label><select aria-label="Crane filter" value={craneFilter} onChange={(event) => setCraneFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="all">All Cranes</option>{summary.profiles.map((profile) => <option key={profile.id} value={profile.id}>{craneName(profile)}</option>)}</select><select aria-label="Status filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="all">All Statuses</option><option value="draft">Draft</option><option value="active">Active</option><option value="superseded">Superseded</option></select></section>
    {filtered.length > 0 ? <section aria-label="Crane Configurations" className="grid gap-3 lg:grid-cols-2">{filtered.map((configuration) => {
      const revision = configuration.currentRevision; const data = revisionData(revision); const status = !configuration.active ? "Archived" : revision?.status ?? "Draft";
      const outrigger = typeof data.outriggerLengthM === "number" && typeof data.outriggerWidthM === "number" ? `${data.outriggerLengthM.toFixed(2)} × ${data.outriggerWidthM.toFixed(2)} m` : revision?.outrigger_state || "Outrigger setup not recorded";
      return <article key={configuration.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-base font-bold text-slate-900">{configuration.name}</h2><p className="mt-0.5 text-sm text-slate-600">{craneName(configuration.profile)}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(status)}`}>{status}</span></div><div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm"><Field label="Counterweight" value={revision?.counterweight_t == null ? "Not recorded" : `${revision.counterweight_t} t`}/><Field label="Outriggers" value={outrigger}/><Field label="Slew range" value={typeof data.slewRange === "string" ? data.slewRange : "Not recorded"}/><Field label="Current revision" value={revision ? revision.revision : "No revision"}/></div><div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"><span className="text-xs text-slate-500">{configuration.revisionCount} revisions · {configuration.chartConfigurationCount.toLocaleString()} matching chart configurations · Updated {new Date(configuration.lastUpdated).toLocaleDateString()}</span><Link href={`/lift-engineering/library/configurations/${encodeURIComponent(configuration.id)}`} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-bold text-blue-700 hover:bg-blue-50">Open <ArrowRight size={15}/></Link></div></article>;
    })}</section> : summary.configurations.length ? <div className="rounded-xl bg-slate-50 p-8 text-center"><h2 className="font-semibold text-slate-800">No configurations match these filters</h2><button type="button" onClick={() => { setSearch(""); setCraneFilter("all"); setStatusFilter("all"); }} className="mt-2 text-sm font-semibold text-blue-700">Clear filters</button></div> : <div className="rounded-xl bg-slate-50 px-5 py-12 text-center"><span className="mx-auto inline-flex rounded-full bg-white p-3 text-blue-700 shadow-sm"><Truck size={24}/></span><h2 className="mt-3 text-lg font-bold text-slate-900">No crane configurations yet</h2><p className="mx-auto mt-1 max-w-lg text-sm text-slate-600">Create reusable crane setups for use in manufacturer load charts and lift studies.</p><button type="button" onClick={beginCreate} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white">+ Create Configuration</button></div>}
    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModal(null); }}><section role="dialog" aria-modal="true" aria-labelledby="configuration-modal-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"><div className="flex items-start justify-between gap-3"><div><h2 id="configuration-modal-title" className="text-lg font-bold">{modal === "create" ? "New Configuration" : modal === "edit" ? "Edit Configuration" : "New Technical Revision"}</h2><p className="mt-1 text-sm text-slate-600">Technical changes are saved as a draft revision so existing study snapshots remain unchanged.</p></div><button type="button" aria-label="Close" disabled={busy} onClick={() => setModal(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={18}/></button></div>{error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-600 sm:col-span-2">Crane Profile<select required disabled={modal !== "create"} value={form.profileId} onChange={(event) => update("profileId", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">Select a crane profile</option>{summary.profiles.filter((profile) => profile.active).map((profile) => <option key={profile.id} value={profile.id}>{craneName(profile)}</option>)}</select></label>
        <p className="text-xs text-slate-500 sm:col-span-2">Options are derived from imported manufacturer load charts for this crane. Fly/jib and boom selections remain lift-specific.</p>
        {!form.customManual ? <>
          <label className="text-xs font-bold text-slate-600">Counterweight (t)<select required value={form.counterweight} onChange={(event) => update("counterweight", event.target.value)} disabled={!chartOptions.counterweights.length} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">Select counterweight</option>{chartOptions.counterweights.map((value) => <option key={value} value={value}>{value} t</option>)}</select></label>
          <label className="text-xs font-bold text-slate-600">Outrigger Setup<select required value={selectedOutriggerKey} onChange={(event) => { const setup = chartOptions.outriggers.find((item) => `${item.lengthM.toFixed(6)}|${item.widthM.toFixed(6)}` === event.target.value); update("outriggerLength", setup ? String(setup.lengthM) : ""); update("outriggerWidth", setup ? String(setup.widthM) : ""); update("outriggerState", setup?.label ?? ""); }} disabled={!form.counterweight || !chartOptions.outriggers.length} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">Select outrigger setup</option>{chartOptions.outriggers.map((setup) => <option key={`${setup.lengthM}|${setup.widthM}`} value={`${setup.lengthM.toFixed(6)}|${setup.widthM.toFixed(6)}`}>{setup.label}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-600">Slew Range<select required value={form.slewRange} onChange={(event) => update("slewRange", event.target.value)} disabled={!selectedOutriggerKey || !chartOptions.slewRanges.length} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">Select slew range</option>{chartOptions.slewRanges.map((value) => <option key={value}>{value}</option>)}</select></label>
          {!chartOptions.counterweights.length && form.profileId && <p className="self-center text-xs text-amber-800">No manufacturer chart options are available for this crane yet.</p>}
        </> : <>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 sm:col-span-2"><strong>Custom / Manual configuration.</strong> This setup is not validated against imported manufacturer chart data.</div>
          <label className="text-xs font-bold text-slate-600">Counterweight (t)<input required type="number" min="0" step="any" value={form.counterweight} onChange={(event) => update("counterweight", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"/></label>
          <label className="text-xs font-bold text-slate-600">Slew Range<input value={form.slewRange} onChange={(event) => update("slewRange", event.target.value)} placeholder="Manual value" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"/></label>
          <label className="text-xs font-bold text-slate-600">Outrigger Length (m)<input type="number" min="0" step="any" value={form.outriggerLength} onChange={(event) => update("outriggerLength", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"/></label>
          <label className="text-xs font-bold text-slate-600">Outrigger Width / Span (m)<input type="number" min="0" step="any" value={form.outriggerWidth} onChange={(event) => update("outriggerWidth", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"/></label>
        </>}
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 sm:col-span-2"><input type="checkbox" checked={form.customManual} onChange={(event) => update("customManual", event.target.checked)} />Use Custom / Manual setup</label>
        {form.customManual && <label className="text-xs font-bold text-slate-600 sm:col-span-2">Outrigger Setup Description<input value={form.outriggerState} onChange={(event) => update("outriggerState", event.target.value)} placeholder="Custom manufacturer setup" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"/></label>}
        {!form.customManual && <Link href="/lift-engineering/library/charts" className="text-xs font-semibold text-blue-700 sm:col-span-2">Open Lift Charts to import or review manufacturer data <ArrowRight className="inline" size={13}/></Link>}
        <label className="text-xs font-bold text-slate-600">Technical Revision<input required value={form.revision} onChange={(event) => update("revision", event.target.value)} placeholder="Rev A" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"/></label>
        <label className="text-xs font-bold text-slate-600 sm:col-span-2">Configuration Name<input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. 41 t / 8.55 × 8.10 m / 360°" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"/></label>
        <label className="text-xs font-bold text-slate-600 sm:col-span-2">Notes <span className="font-normal">(optional)</span><textarea rows={2} value={form.notes} onChange={(event) => update("notes", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"/></label>
        <div className="flex justify-end gap-2 pt-1 sm:col-span-2"><button type="button" disabled={busy} onClick={() => setModal(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={busy || !form.profileId || (!form.customManual && (!form.counterweight || !selectedOutriggerKey || !form.slewRange))} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Saving…" : modal === "create" ? "Create Configuration" : "Save Draft Revision"}</button></div>
      </form>
    </section></div>}
  </main></AppShell>;
}

function Field({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-0.5 truncate font-medium text-slate-800">{value}</p></div>; }
function nextRevision(current?: string | null) { const match = current?.match(/^(.*?)([A-Z])$/i); return match ? `${match[1]}${String.fromCharCode(match[2].toUpperCase().charCodeAt(0) + 1)}` : current ? `${current} (Draft)` : "Rev A"; }

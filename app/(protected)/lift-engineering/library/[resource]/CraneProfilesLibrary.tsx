"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Search, Truck, X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type CraneProfile = {
  id: string; name: string; manufacturer: string | null; model: string | null; notes: string | null;
  active: boolean; created_at: string; currentRevision: { revision?: string; status?: string } | null;
  revisionCount: number; chartBookCount: number; chartConfigurationCount: number; configurationCount: number; lastUpdated: string;
};

export function CraneProfilesLibrary() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [profiles, setProfiles] = useState<CraneProfile[]>([]);
  const [search, setSearch] = useState(""); const [manufacturer, setManufacturer] = useState("all"); const [status, setStatus] = useState("active");
  const [showCreate, setShowCreate] = useState(false); const [manufacturerValue, setManufacturerValue] = useState("");
  const [model, setModel] = useState(""); const [name, setName] = useState(""); const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your session has expired.");
    const response = await fetch("/api/lift-engineering/library/cranes/summary", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
    const payload = await response.json() as { error?: string; profiles?: CraneProfile[] };
    if (!response.ok) throw new Error(payload.error || "Crane Profiles could not be loaded.");
    setProfiles(payload.profiles ?? []);
  }, [supabase]);
  useEffect(() => { void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Crane Profiles could not be loaded.")); }, [load]);

  const manufacturers = useMemo(() => [...new Set(profiles.map((profile) => profile.manufacturer?.trim()).filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b)), [profiles]);
  const filtered = profiles.filter((profile) => {
    const query = search.trim().toLocaleLowerCase("en-AU");
    const matchesText = !query || [profile.name, profile.manufacturer, profile.model].some((value) => value?.toLocaleLowerCase("en-AU").includes(query));
    return matchesText && (manufacturer === "all" || profile.manufacturer === manufacturer) &&
      (status === "all" || (status === "active" ? profile.active : !profile.active));
  });
  function updateManufacturer(value: string) {
    setManufacturerValue(value);
    if (!name.trim() || name === `${manufacturerValue} ${model}`.trim()) setName(`${value} ${model}`.trim());
  }
  function updateModel(value: string) {
    setModel(value);
    if (!name.trim() || name === `${manufacturerValue} ${model}`.trim()) setName(`${manufacturerValue} ${value}`.trim());
  }
  async function createProfile(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your session has expired.");
      const response = await fetch("/api/lift-engineering/library/cranes", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ manufacturer: manufacturerValue.trim(), model: model.trim(), name: name.trim(), notes: notes.trim() || null, active: true }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Crane Profile could not be created.");
      setShowCreate(false); setManufacturerValue(""); setModel(""); setName(""); setNotes(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Crane Profile could not be created."); }
    finally { setBusy(false); }
  }

  return <AppShell><main className="mx-auto max-w-6xl space-y-6 p-4 md:p-7">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><Link href="/lift-engineering" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700"><ArrowLeft size={15}/> Lift Engineering</Link><h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Crane Profiles</h1><p className="mt-1 text-sm text-slate-600">Reusable crane definitions and technical revisions used across lift studies.</p></div>
      <button type="button" onClick={() => setShowCreate(true)} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-800">+ New Crane Profile</button>
    </header>
    {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
    <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center">
      <label className="relative min-w-0 flex-1"><span className="sr-only">Search crane profiles</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search crane profiles…" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"/></label>
      <select aria-label="Manufacturer" value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="all">All Manufacturers</option>{manufacturers.map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Profile status" value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="all">All Statuses</option><option value="active">Active</option><option value="archived">Archived</option></select>
    </div>
    {filtered.length ? <section aria-label="Crane profiles" className="grid gap-3 md:grid-cols-2">{filtered.map((profile) => <article key={profile.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="rounded-lg bg-blue-50 p-2.5 text-blue-700"><Truck size={20}/></span><div className="min-w-0"><h2 className="truncate text-lg font-bold text-slate-900">{profile.name}</h2><p className="text-sm text-slate-600">{profile.manufacturer || "Manufacturer not specified"}{profile.model ? ` · ${profile.model}` : ""}</p></div></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${profile.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{profile.active ? "Active" : "Archived"}</span></div>
      <div className="mt-4 border-t border-slate-100 pt-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current technical revision</p><p className="mt-1 text-sm font-semibold text-slate-800">{profile.currentRevision?.revision ?? "No revision created"}{profile.currentRevision?.status ? <span className="ml-2 font-normal text-slate-500">· {profile.currentRevision.status}</span> : null}</p></div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600"><span>{profile.revisionCount} {profile.revisionCount === 1 ? "revision" : "revisions"}</span><span>{profile.chartBookCount} {profile.chartBookCount === 1 ? "chart book" : "chart books"}</span>{profile.chartConfigurationCount > 0 && <span>{profile.chartConfigurationCount.toLocaleString()} configurations</span>}</div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-xs text-slate-500">Updated {profile.lastUpdated ? new Date(profile.lastUpdated).toLocaleDateString() : "—"}</span><Link href={`/lift-engineering/library/cranes/${encodeURIComponent(profile.id)}`} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-bold text-blue-700 hover:bg-blue-50">Open <ArrowRight size={15}/></Link></div>
    </article>)}</section> : profiles.length ? <div className="rounded-xl bg-slate-50 px-5 py-10 text-center"><p className="font-semibold text-slate-800">No crane profiles match these filters</p><button type="button" onClick={() => { setSearch(""); setManufacturer("all"); setStatus("all"); }} className="mt-2 text-sm font-semibold text-blue-700">Clear filters</button></div> : <div className="rounded-xl bg-slate-50 px-5 py-12 text-center"><span className="mx-auto inline-flex rounded-full bg-white p-3 text-blue-700 shadow-sm"><Truck size={24}/></span><h2 className="mt-3 text-lg font-bold text-slate-900">No crane profiles yet</h2><p className="mx-auto mt-1 max-w-lg text-sm text-slate-600">Create reusable crane profiles to use across lift studies and manufacturer load charts.</p><button type="button" onClick={() => setShowCreate(true)} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white">+ Create Crane Profile</button></div>}
    {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setShowCreate(false); }}><section role="dialog" aria-modal="true" aria-labelledby="create-crane-profile-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"><div className="flex items-start justify-between"><div><h2 id="create-crane-profile-title" className="text-lg font-bold">New Crane Profile</h2><p className="mt-1 text-sm text-slate-600">Add a reusable crane identity. Technical specifications are managed as revisions.</p></div><button type="button" aria-label="Close" onClick={() => setShowCreate(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={18}/></button></div>
      <form onSubmit={createProfile} className="mt-4 space-y-3"><label className="block text-xs font-bold text-slate-600">Manufacturer<input list="lift-crane-manufacturers" required value={manufacturerValue} onChange={(event) => updateManufacturer(event.target.value)} placeholder="e.g. Grove" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/><datalist id="lift-crane-manufacturers">{manufacturers.map((value) => <option key={value} value={value}/>)}</datalist></label><label className="block text-xs font-bold text-slate-600">Model<input required value={model} onChange={(event) => updateModel(event.target.value)} placeholder="e.g. GMK5220" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label><label className="block text-xs font-bold text-slate-600">Profile Name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Manufacturer + model" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label><label className="block text-xs font-bold text-slate-600">Notes <span className="font-normal">(optional)</span><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label><div className="flex justify-end gap-2 pt-1"><button type="button" disabled={busy} onClick={() => setShowCreate(false)} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Creating…" : "Create Profile"}</button></div></form>
    </section></div>}
  </main></AppShell>;
}

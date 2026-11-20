"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { useAccess } from "@/components/access/access-provider";
import { createSupabaseBrowser } from "@/lib/supabase";

type Project = { id: string; name: string | null; project_number: string | null };
type Tower = { id: string; name: string | null; line: string | null };
type Study = { id: string; study_number: string; title: string; status: string; updated_at: string };

export default function LiftStudiesPage() {
  const { projectIds } = useAccess();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [projects, setProjects] = useState<Project[]>([]); const [projectId, setProjectId] = useState("");
  const [towers, setTowers] = useState<Tower[]>([]); const [towerId, setTowerId] = useState("");
  const [studies, setStudies] = useState<Study[]>([]); const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const api = useCallback(async (url: string, init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your session has expired.");
    const headers = new Headers(init?.headers); headers.set("Authorization", `Bearer ${session.access_token}`);
    if (init?.body) headers.set("Content-Type", "application/json");
    const response = await fetch(url, { ...init, headers, cache: "no-store" });
    const payload = await response.json() as { error?: string; studies?: Study[]; study?: Study };
    if (!response.ok) throw new Error(payload.error || `Lift Study request failed (${response.status}).`);
    return payload;
  }, [supabase]);
  useEffect(() => { let active = true; void (async () => {
    if (!projectIds.length) { setProjects([]); return; }
    const { data, error: queryError } = await supabase.from("projects").select("id,name,project_number").in("id", projectIds).order("project_number");
    if (active && queryError) setError(queryError.message);
    if (active) { setProjects(data ?? []); setProjectId((current) => current || data?.[0]?.id || ""); }
  })(); return () => { active = false; }; }, [projectIds, supabase]);
  useEffect(() => { let active = true; void (async () => { setTowerId(""); if (!projectId) { setTowers([]); return; } const { data, error: towerError } = await supabase.from("towers").select("id,name,line").eq("project_id", projectId).order("name"); if (!active) return; if (towerError) setError(towerError.message); setTowers(data ?? []); })(); return () => { active = false; }; }, [projectId, supabase]);
  const load = useCallback(async () => {
    if (!projectId) { setStudies([]); return; }
    setLoading(true); setError("");
    try { const payload = await api(`/api/lift-engineering/studies?projectId=${encodeURIComponent(projectId)}`); setStudies(payload.studies ?? []); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load Lift Studies."); }
    finally { setLoading(false); }
  }, [api, projectId]);
  useEffect(() => { void load(); }, [load]);
  async function createStudy(event: React.FormEvent) {
    event.preventDefault(); if (!projectId || !title.trim()) return;
    setError("");
    try { await api("/api/lift-engineering/studies", { method: "POST", body: JSON.stringify({ projectId, towerId: towerId || null, title: title.trim() }) }); setTitle(""); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not create Lift Study."); }
  }
  return <AppShell><main className="mx-auto max-w-6xl space-y-5 p-4 md:p-7">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><Link href="/lift-engineering" className="text-sm font-semibold text-blue-700">← Lift Engineering</Link><h1 className="mt-2 text-2xl font-bold">Lift Studies</h1><p className="mt-1 text-sm text-slate-600">Studies are project-scoped; crane, rigging and chart libraries remain reusable.</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold"><RefreshCw size={15}/>Refresh</button></div>
    <section className="rounded-2xl border bg-white p-4 shadow-sm"><label className="text-xs font-bold uppercase text-slate-500">Project<select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="mt-1 block w-full max-w-xl rounded-lg border px-3 py-2 text-sm"><option value="">Select project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.project_number ? `${p.project_number} — ` : ""}{p.name}</option>)}</select></label>
      <label className="mt-3 block max-w-xl text-xs font-bold uppercase text-slate-500">Tower / structure (optional)<select value={towerId} onChange={(e) => setTowerId(e.target.value)} disabled={!projectId} className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm font-normal normal-case"><option value="">Project-wide study</option>{towers.map((tower) => <option key={tower.id} value={tower.id}>{tower.name}{tower.line ? ` · ${tower.line}` : ""}</option>)}</select></label>
      <form onSubmit={createStudy} className="mt-4 flex flex-wrap gap-2"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Study title" className="min-w-64 flex-1 rounded-lg border px-3 py-2 text-sm"/><button disabled={!projectId || !title.trim()} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Plus size={16}/>New Study</button></form>
    </section>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="border-b px-4 py-3 font-bold">Project studies</div>{loading ? <p className="p-5 text-sm text-slate-500">Loading…</p> : studies.length ? <ul className="divide-y">{studies.map((study) => <li key={study.id}><Link href={`/lift-engineering/studies/${study.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-4 hover:bg-slate-50"><span><strong className="text-blue-800">{study.study_number}</strong><span className="ml-3 font-semibold text-slate-900">{study.title}</span></span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{study.status}</span></Link></li>)}</ul> : <p className="p-5 text-sm text-slate-500">{projectId ? "No Lift Studies in this project yet." : "Choose a project to view studies."}</p>}</section>
  </main></AppShell>;
}

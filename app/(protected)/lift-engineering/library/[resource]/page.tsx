"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";
import { ChartPointEditor } from "./ChartPointEditor";
import { RevisionManager } from "./RevisionManager";
import { ChartBookImporter } from "./ChartBookImporter";
import { ManualChartEntry } from "./ManualChartEntry";

const definitions: Record<string, { title: string; fields: Array<{ key: string; label: string; type?: string; required?: boolean }>; keyLabel: string }> = {
  cranes: { title: "Crane Profiles", keyLabel: "name", fields: [{ key: "name", label: "Profile name", required: true }, { key: "manufacturer", label: "Manufacturer" }, { key: "model", label: "Model" }, { key: "notes", label: "Notes" }] },
  configurations: { title: "Crane Configurations", keyLabel: "name", fields: [{ key: "crane_profile_id", label: "Crane profile ID", required: true }, { key: "name", label: "Configuration name", required: true }] },
  rigging: { title: "Rigging Library", keyLabel: "description", fields: [{ key: "description", label: "Description", required: true }, { key: "category", label: "Category" }, { key: "manufacturer", label: "Manufacturer" }, { key: "model", label: "Model" }, { key: "notes", label: "Notes" }] },
  arrangements: { title: "Rigging Arrangements", keyLabel: "name", fields: [{ key: "name", label: "Arrangement name", required: true }, { key: "description", label: "Description" }] },
  templates: { title: "Tower Templates", keyLabel: "name", fields: [{ key: "name", label: "Template name", required: true }, { key: "structure_type", label: "Structure type" }, { key: "description", label: "Description" }] },
  charts: { title: "Load Charts", keyLabel: "name", fields: [{ key: "crane_profile_id", label: "Crane profile ID", required: true }, { key: "name", label: "Chart name", required: true }, { key: "revision", label: "Manufacturer revision", required: true }, { key: "counterweight_t", label: "Counterweight (t)", type: "number" }, { key: "outrigger_state", label: "Outrigger state" }, { key: "slew_sector", label: "Slew sector" }, { key: "boom_configuration", label: "Boom configuration" }, { key: "boom_length_m", label: "Boom length (m)", type: "number" }, { key: "fly_jib", label: "Fly / jib" }, { key: "wind_restriction", label: "Wind restriction" }, { key: "notes", label: "Notes" }] },
  settings: { title: "Calculation Settings", keyLabel: "name", fields: [{ key: "methodology_version", label: "Methodology version", required: true }, { key: "name", label: "Setting name", required: true }, { key: "settings", label: "JSON settings", type: "json", required: true }] },
};
type RecordRow = Record<string, unknown>;

export default function LiftLibraryPage({ params }: { params: Promise<{ resource: string }> }) {
  const [resource, setResource] = useState(""); const [records, setRecords] = useState<RecordRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({}); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState("");
  const [editingId, setEditingId] = useState("");
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const definition = definitions[resource];
  const api = useCallback(async (init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession(); if (!session?.access_token) throw new Error("Your session has expired.");
    const headers = new Headers(init?.headers); headers.set("Authorization", `Bearer ${session.access_token}`);
    if (init?.body) headers.set("Content-Type", "application/json");
    const response = await fetch(`/api/lift-engineering/library/${encodeURIComponent(resource)}`, { ...init, headers, cache: "no-store" });
    const result = await response.json() as { error?: string; records?: RecordRow[]; record?: RecordRow };
    if (!response.ok) throw new Error(result.error || "Lift Engineering library request failed."); return result;
  }, [resource, supabase]);
  const load = useCallback(async () => { if (!definition) return; setError(""); try { const result = await api(); setRecords(result.records ?? []); } catch (e) { setError(e instanceof Error ? e.message : "Library could not be loaded."); } }, [api, definition]);
  useEffect(() => { let active = true; void params.then(({ resource: key }) => { if (active) setResource(key); }); return () => { active = false; }; }, [params]);
  useEffect(() => { void load(); }, [load]);
  async function createRecord(event: React.FormEvent) {
    event.preventDefault(); if (!definition) return; setBusy(true); setError("");
    try {
      const body: Record<string, unknown> = {};
      for (const field of definition.fields) {
        const raw = values[field.key] ?? "";
        if (field.type === "number") body[field.key] = raw === "" ? null : Number(raw);
        else if (field.type === "json") body[field.key] = JSON.parse(raw);
        else body[field.key] = raw.trim() || null;
      }
      await api({ method: editingId ? "PATCH" : "POST", body: JSON.stringify({ ...body, ...(editingId ? { id: editingId } : {}) }) }); setValues({}); setEditingId(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Record could not be saved."); } finally { setBusy(false); }
  }
  async function verifyChart(id: string) {
    setBusy(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession(); if (!session?.access_token) throw new Error("Your session has expired.");
      const response = await fetch(`/api/lift-engineering/library/charts/${encodeURIComponent(id)}/status`, { method: "PATCH", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "Verified" }) });
      const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error || "Chart verification was not accepted.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Chart could not be verified."); }
    finally { setBusy(false); }
  }
  if (!definition) return <AppShell><main className="p-6"><h1 className="text-xl font-bold">Library not found</h1><Link href="/lift-engineering" className="text-blue-700">Return to Lift Engineering</Link></main></AppShell>;
  return <AppShell><main className="mx-auto max-w-6xl space-y-5 p-4 md:p-7"><div><Link href="/lift-engineering" className="text-sm font-semibold text-blue-700">← Lift Engineering</Link><h1 className="mt-2 text-2xl font-bold">{definition.title}</h1><p className="mt-1 text-sm text-slate-600">Library records are reusable. Create a new technical revision when specifications change; existing study snapshots retain their selected revision.</p></div>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {resource === "charts" ? <><ChartBookImporter/><ManualChartEntry charts={records.map((record) => ({ id: String(record.id), name: String(record.name ?? "Load chart"), crane_profile_id: String(record.crane_profile_id ?? ""), configuration_revision_id: String(record.configuration_revision_id ?? ""), source_document: record.source_document as Record<string, unknown> | undefined, manufacturer_configuration: record.manufacturer_configuration as Record<string, unknown> | null | undefined }))} onSaved={() => void load()}/></> : <form onSubmit={createRecord} className="grid gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-2">{definition.fields.map((field) => <label key={field.key} className="text-xs font-bold text-slate-600">{field.label}{field.type === "json" ? <textarea required={field.required} rows={3} value={values[field.key] ?? "{}"} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} className="mt-1 block w-full rounded-lg border px-3 py-2 font-mono text-sm"/> : <input required={field.required} type={field.type ?? "text"} value={values[field.key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm"/>}</label>)}<div className="md:col-span-2 flex gap-2"><button disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Saving…" : editingId ? "Update library record" : "Create library record"}</button>{editingId && <button type="button" onClick={() => { setEditingId(""); setValues({}); }} className="rounded-lg border px-4 py-2 text-sm font-bold">Cancel edit</button>}</div></form>}
    <section className="overflow-hidden rounded-2xl border bg-white"><div className="border-b px-4 py-3 font-bold">Records ({records.length})</div>{records.length ? <ul className="divide-y">{records.map((record) => <li key={String(record.id)} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><span className="font-semibold">{String(record[definition.keyLabel] ?? record.id)} <span className="ml-2 text-xs font-normal text-slate-500">{String(resource === "charts" ? `· ${String(record.status ?? "Draft")} · ${String(record.revision ?? "")}` : record.manufacturer ?? record.model ?? record.revision ?? record.status ?? "")}</span></span><div className="flex gap-2">{resource !== "charts" && <button type="button" onClick={() => { setEditingId(String(record.id)); setValues(Object.fromEntries(definition.fields.map((field) => [field.key, field.type === "json" ? JSON.stringify(record[field.key] ?? {}, null, 2) : String(record[field.key] ?? "")]))); }} className="rounded-lg border px-2 py-1 text-xs font-bold">Edit</button>}{resource === "charts" && record.status === "Imported" && <button type="button" disabled={busy} onClick={() => void verifyChart(String(record.id))} className="rounded-lg border px-2 py-1 text-xs font-bold disabled:opacity-50">Mark Verified</button>}{["cranes","configurations","rigging","templates"].includes(resource) && <button type="button" onClick={() => setSelectedParentId(selectedParentId === String(record.id) ? "" : String(record.id))} className="rounded-lg border px-2 py-1 text-xs font-bold">{selectedParentId === String(record.id) ? "Close revisions" : "Manage revisions"}</button>}</div>{selectedParentId === String(record.id) && <div className="basis-full"><RevisionManager resource={resource} parentId={String(record.id)}/></div>}</li>)}</ul> : <p className="p-4 text-sm text-slate-500">No records yet.</p>}</section>
    {resource === "charts" && <ChartPointEditor charts={records.map((record) => ({ id: String(record.id), name: String(record.name ?? "Load chart"), revision: String(record.revision ?? ""), status: String(record.status ?? "Draft"), manufacturer_configuration: record.manufacturer_configuration as Record<string, unknown> | null }))}/>}
  </main></AppShell>;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase";
import { CHART_CSV_FIELDS, mapChartCsvRecords, parseChartCsv, suggestCsvMappings, type CsvRecord } from "@/lib/lift-engineering/chart-csv";
import { exactChartConfigurationKey } from "@/lib/lift-engineering/chart-configuration";

type Crane = { id: string; name: string; manufacturer: string; model: string };
export function ChartBookImporter() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [cranes, setCranes] = useState<Crane[]>([]);
  const [craneId, setCraneId] = useState("");
  const [revision, setRevision] = useState(""); const [sourcePdfUrl, setSourcePdfUrl] = useState("");
  const [file, setFile] = useState<File | null>(null); const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<CsvRecord[]>([]); const [mapping, setMapping] = useState<Record<string, string>>({});
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [progress, setProgress] = useState("");
  const crane = cranes.find((item) => item.id === craneId);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your session has expired.");
      const response = await fetch("/api/lift-engineering/library/charts/import", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const payload = await response.json() as { error?: string; cranes?: Crane[] };
      if (!response.ok) throw new Error(payload.error || "Crane chart options could not be loaded.");
      if (active) setCranes(payload.cranes ?? []);
    })().catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Crane chart options could not be loaded."); });
    return () => { active = false; };
  }, [supabase]);

  async function selectFile(selected: File | undefined) {
    setMessage(""); setRecords([]); setHeaders([]); setMapping({}); setFile(selected ?? null);
    if (!selected || !crane) return;
    try {
      const parsed = parseChartCsv(await selected.text(), { manufacturer: crane.manufacturer, craneModel: crane.model });
      if (parsed.records.length === 0) throw new Error("This CSV has no rows for the selected manufacturer and crane model.");
      const suggested = suggestCsvMappings(parsed.headers);
      setHeaders(parsed.headers); setRecords(parsed.records); setMapping(suggested);
      if (parsed.records.length < 100_000) setMessage(`${parsed.records.length.toLocaleString()} chart rows selected for ${crane.manufacturer} ${crane.model}.`);
      else setMessage(`${parsed.records.length.toLocaleString()} chart rows selected. Large imports are sent in recoverable batches.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "CSV could not be parsed."); }
  }

  const preview = useMemo(() => {
    if (!records.length || !Object.keys(mapping).length) return [];
    try { return mapChartCsvRecords(records.slice(0, 8), mapping); } catch { return []; }
  }, [records, mapping]);

  async function importRows(mode: "chart-book" | "data-only") {
    if (!craneId || !revision || !records.length || !file) { setMessage("Choose a crane, chart revision and CSV first."); return; }
    setBusy(true); setMessage("");
    const batchSize = 5_000; const totals = { created: 0, points: 0 }; const identities = new Set<string>();
    try {
      for (let offset = 0; offset < records.length; offset += batchSize) {
        const rows = mapChartCsvRecords(records.slice(offset, offset + batchSize), mapping);
        for (const row of rows) identities.add(exactChartConfigurationKey(row.configuration));
        setProgress(`Importing rows ${offset + 1}–${Math.min(offset + rows.length, records.length)} of ${records.length.toLocaleString()}…`);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Your session has expired.");
        const response = await fetch("/api/lift-engineering/library/charts/import", {
          method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ mode, craneProfileId: craneId, revision,
            sourceDocument: { fileName: file.name, sourcePdfUrl: sourcePdfUrl.trim() || null }, rows }),
        });
        const payload = await response.json() as { error?: string; configurationCount?: number; createdConfigurationCount?: number; reusedConfigurationCount?: number; importedPointCount?: number };
        if (!response.ok) throw new Error(payload.error || `Chart import failed at row ${offset + 1}.`);
        totals.created += payload.createdConfigurationCount ?? 0; totals.points += payload.importedPointCount ?? 0;
      }
      setMessage(`${totals.points.toLocaleString()} points imported across ${identities.size.toLocaleString()} exact configurations (${totals.created} new chart records). Imported charts remain unverified.`);
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : "Import failed."} Completed batches are retained; rerunning the same revision is safe and idempotent.`);
    } finally { setBusy(false); setProgress(""); }
  }

  return <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
    <div><h2 className="font-bold">Manufacturer chart import</h2><p className="text-xs text-slate-600">Choose the crane first. Combined CSV files are filtered to its manufacturer/model. Imported rows remain unverified until checked against the source chart.</p></div>
    <div className="grid gap-3 md:grid-cols-3">
      <label className="text-xs font-bold text-slate-600">Crane<select value={craneId} onChange={(event) => { setCraneId(event.target.value); setRecords([]); }} className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm"><option value="">Select crane</option>{cranes.map((item) => <option key={item.id} value={item.id}>{item.manufacturer} {item.model}</option>)}</select></label>
      <p className="self-center text-xs text-slate-500 md:col-span-2">Each imported chart keeps its own counterweight, outrigger, slew and boom/accessory configuration; charts are reusable across study setups.</p>
      <label className="text-xs font-bold text-slate-600">Chart revision label<input value={revision} onChange={(event) => setRevision(event.target.value)} placeholder="e.g. OEM-2026-01" className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm"/></label>
      <label className="text-xs font-bold text-slate-600">CSV dataset<input type="file" accept=".csv,text/csv" disabled={!crane} onChange={(event) => void selectFile(event.target.files?.[0])} className="mt-1 block w-full text-sm"/></label>
      <label className="text-xs font-bold text-slate-600 md:col-span-2">Source chart book URL (optional)<input value={sourcePdfUrl} onChange={(event) => setSourcePdfUrl(event.target.value)} placeholder="Existing controlled manufacturer PDF link" className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm"/></label>
    </div>
    {headers.length > 0 && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-bold">Review column mapping ({Object.values(mapping).filter(Boolean).length} mapped)</summary><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{CHART_CSV_FIELDS.map((field) => <label key={field.key} className="text-xs font-semibold text-slate-600">{field.label}{field.required && <span className="text-rose-600"> *</span>}<select value={mapping[field.key] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value }))} className="mt-1 block w-full rounded border px-2 py-1.5"><option value="">Not mapped</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div><p className="mt-2 text-xs text-slate-500">Empty slew range values are retained as None. An absent fly/jib column is derived from the source’s fitted accessory fields; no fly/jib is added by default.</p></details>}
    {preview.length > 0 && <div className="overflow-auto rounded-lg border"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50"><tr><th className="p-2">Chart</th><th className="p-2">Configuration</th><th className="p-2">Radius</th><th className="p-2">Capacity</th><th className="p-2">Source</th></tr></thead><tbody>{preview.slice(0, 5).map((row, index) => <tr key={index} className="border-t"><td className="p-2">{String(row.configuration.manufacturerChartId ?? row.configuration.chartFamily)}</td><td className="p-2">{String(row.configuration.counterweightT)} t · {String(row.configuration.mainBoomLengthM)} m · {row.configuration.flyJibFitted ? `${String(row.configuration.flyJibType)} ${String(row.configuration.flyJibLengthM)} m / ${String(row.configuration.flyJibAngleMode)} ${String(row.configuration.flyJibAngleDeg ?? `${row.configuration.flyJibAngleMinDeg}–${row.configuration.flyJibAngleMaxDeg}`)}°` : "No fly / jib"}</td><td className="p-2">{row.radiusM} m</td><td className="p-2">{row.capacityT} t</td><td className="p-2">{row.sourceDocument}, p. {row.sourcePage}</td></tr>)}</tbody></table><p className="p-2 text-xs text-slate-500">Preview shows the first mapped rows. {records.length.toLocaleString()} selected rows will be imported in 5,000-row batches.</p></div>}
    <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !preview.length} onClick={() => void importRows("chart-book")} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Import Chart Book</button><button type="button" disabled={busy || !preview.length} onClick={() => void importRows("data-only")} className="rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-50">Import Data Only</button>{busy && <span role="status" className="self-center text-xs text-slate-600">{progress}</span>}</div>
    {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
  </section>;
}

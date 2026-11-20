"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase";
import {
  buildChartCsvBatches, CHART_CSV_FIELDS, CHART_IMPORT_BATCH_SIZE, deduplicateChartCsvRows, mapChartCsvRecords,
  parseChartCsv, suggestCsvMappings, type ChartCsvConflict, type ChartCsvRow, type CsvRecord,
} from "@/lib/lift-engineering/chart-csv";
import { exactChartConfigurationKey } from "@/lib/lift-engineering/chart-configuration";

type Crane = { id: string; name: string; manufacturer: string; model: string };
type Batch = { rows: ChartCsvRow[]; rowStart: number; rowEnd: number };
type ImportTotals = { importedRows: number; createdConfigurations: number; matchedConfigurations: number; upsertedRows: number; skippedRows: number; conflicts: number; completedBatches: number };
type ImportCheckpoint = { signature: string; mode: "chart-book" | "data-only"; batches: Batch[]; pointRows: number; conflicts: ChartCsvConflict[]; totals: ImportTotals; nextBatch: number };
type Progress = { batch: number; totalBatches: number; rowsDone: number; totalRows: number; totals: ImportTotals };
type ImportResponse = { error?: string; code?: string | null; stage?: string; configurationCount?: number; createdConfigurationCount?: number; matchedConfigurationCount?: number; reusedConfigurationCount?: number; importedPointCount?: number; upsertedPointCount?: number; skippedDuplicatePointCount?: number; conflictingDuplicatePointCount?: number };

function initialTotals(skippedRows: number, conflicts: number): ImportTotals {
  return { importedRows: 0, createdConfigurations: 0, matchedConfigurations: 0, upsertedRows: 0, skippedRows, conflicts, completedBatches: 0 };
}

export function ChartBookImporter() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const checkpointRef = useRef<ImportCheckpoint | null>(null);
  const [cranes, setCranes] = useState<Crane[]>([]);
  const [craneId, setCraneId] = useState("");
  const [revision, setRevision] = useState(""); const [sourcePdfUrl, setSourcePdfUrl] = useState("");
  const [file, setFile] = useState<File | null>(null); const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<CsvRecord[]>([]); const [mapping, setMapping] = useState<Record<string, string>>({});
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [progress, setProgress] = useState<Progress | null>(null);
  const [failedBatch, setFailedBatch] = useState(false);
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
    checkpointRef.current = null; setProgress(null); setFailedBatch(false);
    if (!selected || !crane) return;
    try {
      const parsed = parseChartCsv(await selected.text(), { manufacturer: crane.manufacturer, craneModel: crane.model });
      if (parsed.records.length === 0) throw new Error("This CSV has no rows for the selected manufacturer and crane model.");
      const suggested = suggestCsvMappings(parsed.headers);
      setHeaders(parsed.headers); setRecords(parsed.records); setMapping(suggested);
      setMessage(`${parsed.records.length.toLocaleString()} chart rows selected for ${crane.manufacturer} ${crane.model}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "CSV could not be parsed."); }
  }

  const preview = useMemo(() => {
    if (!records.length || !Object.keys(mapping).length) return [];
    try { return mapChartCsvRecords(records.slice(0, 8), mapping); } catch { return []; }
  }, [records, mapping]);

  function checkpointSignature(mode: "chart-book" | "data-only") {
    return JSON.stringify({ craneId, revision: revision.trim(), fileName: file?.name, fileSize: file?.size, mode, mapping });
  }

  async function runImport(mode: "chart-book" | "data-only") {
    if (!craneId || !revision.trim() || !records.length || !file || !crane) { setMessage("Choose a crane, chart revision and CSV first."); return; }
    const signature = checkpointSignature(mode);
    let checkpoint = checkpointRef.current;
    if (!checkpoint || checkpoint.signature !== signature) {
      try {
        const mapped = mapChartCsvRecords(records, mapping);
        const deduplicated = deduplicateChartCsvRows(mapped);
        const batches = buildChartCsvBatches(deduplicated.rows);
        checkpoint = {
          signature, mode, batches, pointRows: deduplicated.rows.length, conflicts: deduplicated.conflicts, nextBatch: 0,
          totals: initialTotals(deduplicated.skippedDuplicateRows, deduplicated.conflicts.length),
        };
        checkpointRef.current = checkpoint;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "CSV mapping or validation failed.");
        return;
      }
    }

    setBusy(true); setFailedBatch(false); setMessage("");
    try {
      for (let index = checkpoint.nextBatch; index < checkpoint.batches.length; index += 1) {
        const batch = checkpoint.batches[index];
        setProgress({ batch: index + 1, totalBatches: checkpoint.batches.length, rowsDone: checkpoint.totals.importedRows, totalRows: checkpoint.pointRows, totals: { ...checkpoint.totals } });
        const batchPoints = new Set(batch.rows.map((row) => `${exactChartConfigurationKey(row.configuration)}|${row.radiusM}`));
        const batchConflicts = checkpoint.conflicts.filter((conflict) => batchPoints.has(`${conflict.configurationKey}|${conflict.radiusM}`));
        let response: Response | null = null;
        let payload: ImportResponse = {};
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) throw new Error("Your session has expired.");
          response = await fetch("/api/lift-engineering/library/charts/import", {
            method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ mode, craneProfileId: craneId, revision: revision.trim(),
              batchNumber: index + 1, totalBatches: checkpoint.batches.length, rowStart: batch.rowStart, rowEnd: batch.rowEnd,
              sourceDocument: { fileName: file.name, sourcePdfUrl: sourcePdfUrl.trim() || null }, pointConflicts: batchConflicts, rows: batch.rows }),
          });
          payload = await response.json().catch(() => ({})) as ImportResponse;
          if (!response.ok) {
            const code = payload.code ? `, Supabase ${payload.code}` : "";
            const stage = payload.stage ? `, ${payload.stage}` : "";
            throw new Error(`Batch ${index + 1} of ${checkpoint.batches.length} failed (rows ${batch.rowStart.toLocaleString()}–${batch.rowEnd.toLocaleString()}, HTTP ${response.status}${code}${stage}): ${payload.error || response.statusText || "Request failed."}`);
          }
        } catch (error) {
          setFailedBatch(true);
          const rawDetail = error instanceof Error ? error.message : "Network request failed before the batch completed.";
          const detail = rawDetail.startsWith(`Batch ${index + 1} of `) ? rawDetail : `Batch ${index + 1} of ${checkpoint.batches.length} failed (rows ${batch.rowStart.toLocaleString()}–${batch.rowEnd.toLocaleString()}, HTTP ${response?.status ?? "unavailable"}): ${rawDetail}`;
          setMessage(`${detail} Completed batches are retained. Retry this batch to resume.`);
          setProgress({ batch: index + 1, totalBatches: checkpoint.batches.length, rowsDone: checkpoint.totals.importedRows, totalRows: checkpoint.pointRows, totals: { ...checkpoint.totals } });
          return;
        }
        checkpoint.totals.importedRows += payload.importedPointCount ?? batch.rows.length;
        checkpoint.totals.createdConfigurations += payload.createdConfigurationCount ?? 0;
        checkpoint.totals.matchedConfigurations += payload.matchedConfigurationCount ?? payload.reusedConfigurationCount ?? 0;
        checkpoint.totals.upsertedRows += payload.upsertedPointCount ?? payload.importedPointCount ?? batch.rows.length;
        checkpoint.totals.skippedRows += payload.skippedDuplicatePointCount ?? 0;
        checkpoint.totals.conflicts += payload.conflictingDuplicatePointCount ?? 0;
        checkpoint.totals.completedBatches += 1;
        checkpoint.nextBatch = index + 1;
        setProgress({ batch: index + 1, totalBatches: checkpoint.batches.length, rowsDone: checkpoint.totals.importedRows, totalRows: checkpoint.pointRows, totals: { ...checkpoint.totals } });
      }
      const totals = checkpoint.totals;
      setMessage(`Import complete: ${totals.importedRows.toLocaleString()} unique points across ${checkpoint.pointRows.toLocaleString()} submitted rows; ${totals.createdConfigurations.toLocaleString()} new configurations, ${totals.matchedConfigurations.toLocaleString()} matched, ${totals.skippedRows.toLocaleString()} duplicate rows collapsed, ${totals.conflicts.toLocaleString()} conflicting duplicate radius points resolved to the lower capacity. Charts remain unverified.`);
      checkpointRef.current = null; setFailedBatch(false);
    } finally { setBusy(false); }
  }

  const completedPercent = progress?.totalRows ? Math.min(100, (progress.rowsDone / progress.totalRows) * 100) : 0;
  const currentCheckpoint = checkpointRef.current;
  const importLabel = crane ? `Importing ${crane.manufacturer} ${crane.model}` : "Importing manufacturer charts";

  return <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
    <div><h2 className="font-bold">Manufacturer chart import</h2><p className="text-xs text-slate-600">Choose the crane first. Combined CSV files are filtered to its manufacturer/model. Imported rows remain unverified until checked against the source chart.</p></div>
    <div className="grid gap-3 md:grid-cols-3">
      <label className="text-xs font-bold text-slate-600">Crane<select value={craneId} onChange={(event) => { setCraneId(event.target.value); setRecords([]); setFile(null); checkpointRef.current = null; setProgress(null); setFailedBatch(false); }} className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm"><option value="">Select crane</option>{cranes.map((item) => <option key={item.id} value={item.id}>{item.manufacturer} {item.model}</option>)}</select></label>
      <p className="self-center text-xs text-slate-500 md:col-span-2">Each imported chart keeps its own counterweight, outrigger, slew and boom/accessory configuration; charts are reusable across study setups.</p>
      <label className="text-xs font-bold text-slate-600">Chart revision label<input value={revision} onChange={(event) => setRevision(event.target.value)} placeholder="e.g. OEM-2026-01" className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm"/></label>
      <label className="text-xs font-bold text-slate-600">CSV dataset<input type="file" accept=".csv,text/csv" disabled={!crane} onChange={(event) => void selectFile(event.target.files?.[0])} className="mt-1 block w-full text-sm"/></label>
      <label className="text-xs font-bold text-slate-600 md:col-span-2">Source chart book URL (optional)<input value={sourcePdfUrl} onChange={(event) => setSourcePdfUrl(event.target.value)} placeholder="Existing controlled manufacturer PDF link" className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm"/></label>
    </div>
    {headers.length > 0 && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-bold">Review column mapping ({Object.values(mapping).filter(Boolean).length} mapped)</summary><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{CHART_CSV_FIELDS.map((field) => <label key={field.key} className="text-xs font-semibold text-slate-600">{field.label}{field.required && <span className="text-rose-600"> *</span>}<select value={mapping[field.key] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value }))} className="mt-1 block w-full rounded border px-2 py-1.5"><option value="">Not mapped</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div><p className="mt-2 text-xs text-slate-500">Empty slew range values are retained as None. An absent fly/jib column is derived from the source’s fitted accessory fields; no fly/jib is added by default.</p></details>}
    {preview.length > 0 && <div className="overflow-auto rounded-lg border"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50"><tr><th className="p-2">Chart</th><th className="p-2">Configuration</th><th className="p-2">Radius</th><th className="p-2">Capacity</th><th className="p-2">Source</th></tr></thead><tbody>{preview.slice(0, 5).map((row, index) => <tr key={index} className="border-t"><td className="p-2">{String(row.configuration.manufacturerChartId ?? row.configuration.chartFamily)}</td><td className="p-2">{String(row.configuration.counterweightT)} t · {String(row.configuration.mainBoomLengthM)} m · {row.configuration.flyJibFitted ? `${String(row.configuration.flyJibType)} ${String(row.configuration.flyJibLengthM)} m / ${String(row.configuration.flyJibAngleMode)} ${String(row.configuration.flyJibAngleDeg ?? `${row.configuration.flyJibAngleMinDeg}–${row.configuration.flyJibAngleMaxDeg}`)}°` : "No fly / jib"}</td><td className="p-2">{row.radiusM} m</td><td className="p-2">{row.capacityT} t</td><td className="p-2">{row.sourceDocument}, p. {row.sourcePage}</td></tr>)}</tbody></table><p className="p-2 text-xs text-slate-500">{records.length.toLocaleString()} selected CSV rows. They are parsed and deduplicated, then sent in batches of {CHART_IMPORT_BATCH_SIZE.toLocaleString()} rows; each POST contains only its current batch.</p></div>}
    <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !preview.length || failedBatch} onClick={() => void runImport("chart-book")} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Import Chart Book</button><button type="button" disabled={busy || !preview.length || failedBatch} onClick={() => void runImport("data-only")} className="rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-50">Import Data Only</button>{failedBatch && <button type="button" disabled={busy} onClick={() => { const cp = checkpointRef.current; if (cp) void runImport(cp.mode); }} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Retry failed batch</button>}{failedBatch && <button type="button" disabled={busy} onClick={() => { checkpointRef.current = null; setFailedBatch(false); setProgress(null); setMessage("Import checkpoint cleared. Completed batches remain in Supabase; starting again is idempotent."); }} className="rounded-lg border px-3 py-2 text-sm font-semibold">Clear checkpoint</button>}</div>
    {progress && <div className="space-y-2 rounded-xl bg-slate-50 p-3" role="status" aria-live="polite"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{busy ? importLabel : failedBatch ? "Import paused" : "Import progress"}</strong><span className="text-xs font-semibold text-slate-600">Batch {progress.batch} / {progress.totalBatches} · {completedPercent.toFixed(1)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-700 transition-all" style={{ width: `${completedPercent}%` }}/></div><p className="text-xs text-slate-600">{progress.rowsDone.toLocaleString()} / {progress.totalRows.toLocaleString()} unique rows written{currentCheckpoint && ` · next batch ${currentCheckpoint.nextBatch + 1}`}</p><div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-6"><Count label="Imported" value={progress.totals.importedRows}/><Count label="Skipped" value={progress.totals.skippedRows}/><Count label="Updated points" value={progress.totals.upsertedRows}/><Count label="Matched" value={progress.totals.matchedConfigurations}/><Count label="New configs" value={progress.totals.createdConfigurations}/><Count label="Failed" value={failedBatch ? 1 : 0}/></div>{progress.totals.conflicts > 0 && <p className="text-xs font-semibold text-amber-800">{progress.totals.conflicts} duplicate configuration/radius conflicts were resolved using the lower capacity. Review against the source chart before verification.</p>}</div>}
    {message && <p role="status" className="whitespace-pre-wrap text-sm text-slate-700">{message}</p>}
  </section>;
}

function Count({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-white px-2.5 py-2"><p className="text-slate-500">{label}</p><p className="font-bold text-slate-800">{value.toLocaleString()}</p></div>;
}

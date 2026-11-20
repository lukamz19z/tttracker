"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase";
import { exactChartConfigurationKey, type ManufacturerChartConfiguration } from "@/lib/lift-engineering/chart-configuration";

type ChartRow = { id: string; name?: string; crane_profile_id?: string; configuration_revision_id?: string; source_document?: Record<string, unknown>; manufacturer_configuration?: Record<string, unknown> | null };
type Crane = { id: string; name: string; manufacturer: string; model: string };
type Point = { radiusM: string; capacityT: string; sourcePage: string };
const emptyPoint = (): Point => ({ radiusM: "", capacityT: "", sourcePage: "" });

export function ManualChartEntry({ charts, onSaved }: { charts: ChartRow[]; onSaved: () => void }) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [cranes, setCranes] = useState<Crane[]>([]); const [craneId, setCraneId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({}); const [custom, setCustom] = useState<Record<string, string>>({});
  const [revision, setRevision] = useState(""); const [name, setName] = useState(""); const [sourceDocumentName, setSourceDocumentName] = useState("");
  const [sourcePdfUrl, setSourcePdfUrl] = useState(""); const [points, setPoints] = useState<Point[]>([emptyPoint()]); const [paste, setPaste] = useState("");
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const token = useCallback(async () => { const { data: { session } } = await supabase.auth.getSession(); if (!session?.access_token) throw new Error("Your session has expired."); return session.access_token; }, [supabase]);
  useEffect(() => {
    let active = true;
    void token().then(async (accessToken) => {
      const response = await fetch("/api/lift-engineering/library/charts/import", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      const data = await response.json() as { error?: string; cranes?: Crane[] };
      if (!response.ok) throw new Error(data.error || "Chart setup options could not be loaded.");
      if (active) setCranes(data.cranes ?? []);
    }).catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Chart setup options could not be loaded."); });
    return () => { active = false; };
  }, [token]);
  const sourceOptions = [...new Set(charts.flatMap((chart) => {
    const source = chart.source_document ?? {}; const docs = Array.isArray(source.documents) ? source.documents : [];
    return [source.fileName, ...docs.map((doc) => typeof doc === "string" ? doc : (doc as Record<string, unknown>).fileName)].filter((value): value is string => typeof value === "string" && !!value);
  }))];
  const valuesFor = (key: string) => [...new Set(charts.filter((chart) => chart.crane_profile_id === craneId)
    .map((chart) => chart.manufacturer_configuration?.[key]).filter((value) => value != null).map(String))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  function selectField(key: string, label: string, opts: string[], customAllowed = true, required = false, numeric = false) {
    const current = values[key] ?? ""; const useCustom = current === "__custom";
    return <div key={key}><label className="block text-xs font-bold text-slate-600">{label}{required && " *"}<select required={required && !useCustom} value={current} onChange={(event) => setValues((old) => ({ ...old, [key]: event.target.value }))} className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm"><option value="">Select {label.toLowerCase()}</option>{opts.map((item) => <option key={item} value={item}>{item}</option>)}{customAllowed && <option value="__custom">Custom value…</option>}</select></label>{useCustom && <input required={required} type={numeric ? "number" : "text"} step={numeric ? "any" : undefined} value={custom[key] ?? ""} onChange={(event) => setCustom((old) => ({ ...old, [key]: event.target.value }))} className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm" placeholder={`Enter ${label.toLowerCase()}`}/>}</div>;
  }
  function normalizedField(key: string) { const value = values[key] === "__custom" ? custom[key] ?? "" : values[key] ?? ""; return value === "" ? null : value; }
  function updatePoint(index: number, key: keyof Point, value: string) { setPoints((rows) => rows.map((row, i) => i === index ? { ...row, [key]: value } : row)); }
  function pasteRows() {
    const rows = paste.trim().split(/\r?\n/).map((line) => line.split("\t")).filter((row) => row.length >= 2);
    if (!rows.length) { setMessage("Paste at least radius and capacity columns from Excel."); return; }
    setPoints(rows.map((row) => ({ radiusM: row[0].trim(), capacityT: row[1].trim(), sourcePage: row[2]?.trim() ?? "" })));
    setMessage(`${rows.length} chart rows pasted. Review before saving.`);
  }
  async function save() {
    setBusy(true); setMessage("");
    try {
      const crane = cranes.find((item) => item.id === craneId);
      const flyFitted = values.flyJibFitted === "true";
      const configuration: ManufacturerChartConfiguration = {
        manufacturer: crane?.manufacturer ?? "", craneModel: crane?.model ?? "", chartFamily: normalizedField("chartFamily"),
        manufacturerChartId: normalizedField("manufacturerChartId"), configurationCode: normalizedField("configurationCode"),
        boomType: normalizedField("boomType"), mainBoomLengthM: Number(normalizedField("mainBoomLengthM")),
        telescopeConfiguration: normalizedField("telescopeConfiguration"), counterweightT: Number(normalizedField("counterweightT")),
        outriggerLengthM: Number(normalizedField("outriggerLengthM")), outriggerWidthM: Number(normalizedField("outriggerWidthM")),
        slewRange: normalizedField("slewRange"), flyJibFitted: flyFitted,
        flyJibType: flyFitted ? normalizedField("flyJibType") : null,
        flyJibLengthM: flyFitted ? Number(normalizedField("flyJibLengthM")) : null,
        flyJibAngleMode: flyFitted ? normalizedField("flyJibAngleMode") : null,
        flyJibAngleDeg: flyFitted && normalizedField("flyJibAngleDeg") ? Number(normalizedField("flyJibAngleDeg")) : null,
        flyJibAngleMinDeg: flyFitted && normalizedField("flyJibAngleMinDeg") ? Number(normalizedField("flyJibAngleMinDeg")) : null,
        flyJibAngleMaxDeg: flyFitted && normalizedField("flyJibAngleMaxDeg") ? Number(normalizedField("flyJibAngleMaxDeg")) : null,
        boomExtensionM: normalizedField("boomExtensionM") ? Number(normalizedField("boomExtensionM")) : null,
        windSpeedMps: normalizedField("windSpeedMps") ? Number(normalizedField("windSpeedMps")) : null,
        reeving: normalizedField("reeving"), singleHookBlock: normalizedField("singleHookBlock"), manufacturerOptions: null,
      };
      configuration.identityKey = exactChartConfigurationKey(configuration);
      const validPoints = points.filter((row) => row.radiusM.trim() && row.capacityT.trim());
      if (!crane || !revision.trim() || !name.trim() || !validPoints.length) throw new Error("Choose a crane, chart name and revision, then enter at least one point.");
      if ([configuration.chartFamily, configuration.boomType, configuration.counterweightT, configuration.outriggerLengthM, configuration.outriggerWidthM, configuration.mainBoomLengthM].some((value) => value == null || value === "" || (typeof value === "number" && !Number.isFinite(value)))) throw new Error("Select valid chart family, boom, counterweight and outrigger dimensions.");
      if (flyFitted && (!configuration.flyJibType || !configuration.flyJibLengthM || !configuration.flyJibAngleMode)) throw new Error("A fitted fly/jib needs a type, length and angle mode.");
      const accessToken = await token(); const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
      const chartResponse = await fetch("/api/lift-engineering/library/charts", { method: "POST", headers, body: JSON.stringify({ crane_profile_id: crane.id,
        name: name.trim(), revision: revision.trim(), counterweight_t: configuration.counterweightT,
        outrigger_state: `${configuration.outriggerLengthM} × ${configuration.outriggerWidthM} m`, slew_sector: configuration.slewRange,
        boom_configuration: configuration.boomType, boom_length_m: configuration.mainBoomLengthM,
        fly_jib: flyFitted ? `${configuration.flyJibType} ${configuration.flyJibLengthM} m` : null,
        manufacturer_configuration: configuration, source_document: { fileName: sourceDocumentName.trim() || null, sourcePdfUrl: sourcePdfUrl.trim() || null }, notes: "Manually entered chart. Draft by default; verify against its controlled manufacturer source." }) });
      const chartPayload = await chartResponse.json() as { error?: string; record?: { id: string } };
      if (!chartResponse.ok || !chartPayload.record?.id) throw new Error(chartPayload.error || "Draft chart could not be created.");
      const pointsResponse = await fetch("/api/lift-engineering/library/charts/points", { method: "POST", headers, body: JSON.stringify({ chartId: chartPayload.record.id,
        rows: validPoints.map((point) => ({ configurationKey: configuration.identityKey, radiusM: Number(point.radiusM), ratedCapacityT: Number(point.capacityT), sourcePage: point.sourcePage.trim() || null })) }) });
      const pointsPayload = await pointsResponse.json() as { error?: string };
      if (!pointsResponse.ok) throw new Error(`Draft chart was created, but its point table failed to save: ${pointsPayload.error || "unknown error"}`);
      setMessage("Draft chart and points saved. It cannot be used for a study until imported or verified."); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Manual chart could not be saved."); }
    finally { setBusy(false); }
  }

  const filteredChartFamilies = valuesFor("chartFamily");
  return <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
    <div><h2 className="font-bold">Add Chart Manually</h2><p className="text-xs text-slate-600">Manual entries are Draft, use exact configuration identity and never interpolate chart capacity.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs font-bold text-slate-600">Crane<select value={craneId} onChange={(event) => { setCraneId(event.target.value); setValues({}); }} className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm"><option value="">Select crane</option>{cranes.map((crane) => <option key={crane.id} value={crane.id}>{crane.manufacturer} {crane.model}</option>)}</select></label>
      <label className="text-xs font-bold text-slate-600">Chart name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm"/></label>
      <label className="text-xs font-bold text-slate-600">Revision<input value={revision} onChange={(event) => setRevision(event.target.value)} className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm"/></label>
      {selectField("chartFamily", "Chart family", filteredChartFamilies, true, true)}
      {selectField("counterweightT", "Counterweight (t)", valuesFor("counterweightT"), true, true, true)}
      {selectField("outriggerLengthM", "Outrigger length / span (m)", valuesFor("outriggerLengthM"), true, true, true)}
      {selectField("outriggerWidthM", "Outrigger width / span (m)", valuesFor("outriggerWidthM"), true, true, true)}
      {selectField("slewRange", "Slew range", valuesFor("slewRange"), true, true)}
      {selectField("boomType", "Boom type", valuesFor("boomType"), true, true)}
      {selectField("mainBoomLengthM", "Main boom length (m)", valuesFor("mainBoomLengthM"), true, true, true)}
      {selectField("telescopeConfiguration", "Telescope configuration", valuesFor("telescopeConfiguration"))}
      {selectField("configurationCode", "Manufacturer configuration / LK code", valuesFor("configurationCode"))}
      <label className="text-xs font-bold text-slate-600">Fly / jib<select value={values.flyJibFitted ?? "false"} onChange={(event) => setValues((old) => ({ ...old, flyJibFitted: event.target.value, flyJibType: "", flyJibLengthM: "", flyJibAngleMode: "", flyJibAngleDeg: "", flyJibAngleMinDeg: "", flyJibAngleMaxDeg: "" }))} className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm"><option value="false">None / Not fitted</option><option value="true">Fitted</option></select></label>
      {values.flyJibFitted === "true" && <>{selectField("flyJibType", "Fly / jib type", valuesFor("flyJibType"), true, true)}{selectField("flyJibLengthM", "Fly / jib length (m)", valuesFor("flyJibLengthM"), true, true, true)}{selectField("flyJibAngleMode", "Angle family / mode", valuesFor("flyJibAngleMode"), true, true)}{selectField("flyJibAngleDeg", "Fixed angle (°)", valuesFor("flyJibAngleDeg"), true, false, true)}{selectField("flyJibAngleMinDeg", "Minimum angle (°)", valuesFor("flyJibAngleMinDeg"), true, false, true)}{selectField("flyJibAngleMaxDeg", "Maximum angle (°)", valuesFor("flyJibAngleMaxDeg"), true, false, true)}</>}
      {selectField("boomExtensionM", "Boom extension (m)", valuesFor("boomExtensionM"), true, false, true)}
      {selectField("windSpeedMps", "Wind limit (m/s)", valuesFor("windSpeedMps"), true, false, true)}
      {selectField("reeving", "Reeving", valuesFor("reeving"))}
      {selectField("singleHookBlock", "Hook block", valuesFor("singleHookBlock"))}
      <label className="text-xs font-bold text-slate-600">Manufacturer chart ID<input value={values.manufacturerChartId ?? ""} onChange={(event) => setValues((old) => ({ ...old, manufacturerChartId: event.target.value }))} className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm"/></label>
      <label className="text-xs font-bold text-slate-600">Source document<select value={sourceDocumentName} onChange={(event) => setSourceDocumentName(event.target.value)} className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm"><option value="">Choose existing / enter custom below</option>{sourceOptions.map((source) => <option key={source}>{source}</option>)}</select></label>
      <label className="text-xs font-bold text-slate-600">Custom source document<input value={sourceDocumentName} onChange={(event) => setSourceDocumentName(event.target.value)} className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm"/></label>
      <label className="text-xs font-bold text-slate-600">Source PDF URL<input value={sourcePdfUrl} onChange={(event) => setSourcePdfUrl(event.target.value)} placeholder="Existing source link, optional" className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm"/></label>
    </div>
    <div className="space-y-2 rounded-lg border p-3"><div className="flex items-center justify-between"><h3 className="text-sm font-bold">Radius / capacity points</h3><button type="button" onClick={() => setPoints((rows) => [...rows, emptyPoint()])} className="rounded border px-2 py-1 text-xs font-bold">Add row</button></div>
      <textarea value={paste} onChange={(event) => setPaste(event.target.value)} rows={2} placeholder="Paste Excel rows: Radius [tab] Capacity [tab] Source page" className="w-full rounded border px-2 py-2 text-xs"/><button type="button" onClick={pasteRows} className="rounded border px-2 py-1 text-xs font-bold">Apply pasted rows</button>
      <div className="space-y-1">{points.map((point, index) => <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2"><input aria-label={`Point ${index + 1} radius`} type="number" min="0" step="0.01" placeholder="Radius m" value={point.radiusM} onChange={(event) => updatePoint(index, "radiusM", event.target.value)} className="rounded border px-2 py-1.5 text-xs"/><input aria-label={`Point ${index + 1} capacity`} type="number" min="0.001" step="0.01" placeholder="Capacity t" value={point.capacityT} onChange={(event) => updatePoint(index, "capacityT", event.target.value)} className="rounded border px-2 py-1.5 text-xs"/><input aria-label={`Point ${index + 1} source page`} placeholder="Page" value={point.sourcePage} onChange={(event) => updatePoint(index, "sourcePage", event.target.value)} className="rounded border px-2 py-1.5 text-xs"/><button type="button" onClick={() => setPoints((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} className="px-2 text-xs font-bold text-rose-700">Delete</button></div>)}</div>
      <button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Saving draft…" : "Save Draft Chart"}</button>{message && <p role="status" className="text-xs text-slate-700">{message}</p>}
    </div>
  </section>;
}

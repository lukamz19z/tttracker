"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase";
import { CHART_CONFIGURATION_DIMENSIONS, chartDimensionValue, chartFacetOptions, clearDownstreamChartSelections, selectNextChartPoint, type ChartConfigurationRecord, type ChartDimension } from "@/lib/lift-engineering/chart-configuration";
import { chartMatchesBaseSetup } from "@/lib/lift-engineering/base-configuration";
import { readLiftJson } from "@/lib/lift-engineering/client-response";

type ChartPoint = { configurationKey: string; radiusM: number; capacityT: number; sourcePage: string | null };
type Chart = Omit<ChartConfigurationRecord, "manufacturer_configuration"> & { name?: string; revision?: string; boom_configuration?: string; source_document?: Record<string, unknown>; manufacturer_configuration?: Record<string, unknown> | null };
export type PointSelection = { chart: Chart; point: ChartPoint | null; requiredRadiusM: number } | null;
type BaseSetup = { revisionId: string; counterweightT: number | null; outriggerLengthM: number | null; outriggerWidthM: number | null; slewRange: string | null; customManual: boolean };
type Props = { charts: Chart[]; craneProfileId: string; baseSetup: BaseSetup | null; initialRadius?: string; onSelect: (selection: PointSelection) => void };

const labels: Record<ChartDimension, string> = {
  chartFamily: "Chart family / boom mode", counterweightT: "Counterweight (t)", outriggerLengthM: "Outrigger length / span (m)",
  outriggerWidthM: "Outrigger width / span (m)", slewRange: "Slew range", boomType: "Boom type", mainBoomLengthM: "Main boom length (m)",
  flyJibFitted: "Fly / jib", flyJibType: "Fly / jib type", flyJibLengthM: "Fly / jib length (m)", flyJibAngleMode: "Fly / jib angle mode",
  flyJibAngleDeg: "Fly / jib fixed angle (°)", flyJibAngleMinDeg: "Fly / jib minimum angle (°)", flyJibAngleMaxDeg: "Fly / jib maximum angle (°)",
  boomExtensionM: "Boom extension (m)", telescopeConfiguration: "Telescope configuration", configurationCode: "Manufacturer configuration / LK code",
  manufacturerChartId: "Manufacturer chart ID", craneModel: "Crane model", windSpeedMps: "Wind limit (m/s)", reeving: "Reeving", singleHookBlock: "Hook block",
  manufacturerOptions: "Other manufacturer configuration",
};
const optionalAccessoryDimensions: ChartDimension[] = ["flyJibType", "flyJibLengthM", "flyJibAngleMode", "flyJibAngleDeg", "flyJibAngleMinDeg", "flyJibAngleMaxDeg"];

function fieldShown(dimension: ChartDimension, charts: Chart[], selected: Partial<Record<ChartDimension, string>>, craneId: string) {
  if (optionalAccessoryDimensions.includes(dimension) && selected.flyJibFitted !== "true") return false;
  const options = chartFacetOptions(charts, dimension, selected, craneId);
  return options.length > 0 && !(options.length === 1 && options[0] === "<none>" && dimension !== "flyJibFitted");
}

export function ChartConfigurationSelector({ charts, craneProfileId, baseSetup, initialRadius = "", onSelect }: Props) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [selected, setSelected] = useState<Partial<Record<ChartDimension, string>>>({});
  const [chartId, setChartId] = useState(""); const [radius, setRadius] = useState(initialRadius);
  const [points, setPoints] = useState<ChartPoint[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const baseKey = baseSetup ? JSON.stringify(baseSetup) : "none";
  const baseReady = Boolean(baseSetup && baseSetup.counterweightT != null && baseSetup.outriggerLengthM != null && baseSetup.outriggerWidthM != null && baseSetup.slewRange);
  const availableCharts = useMemo(() => baseReady ? charts.filter((chart) => chartMatchesBaseSetup(chart, craneProfileId, {
    counterweightT: baseSetup?.counterweightT,
    outriggerLengthM: baseSetup?.outriggerLengthM,
    outriggerWidthM: baseSetup?.outriggerWidthM,
    slewRange: baseSetup?.slewRange,
  })) : [], [charts, craneProfileId, baseReady, baseSetup?.counterweightT, baseSetup?.outriggerLengthM, baseSetup?.outriggerWidthM, baseSetup?.slewRange]);
  const exactCandidates = useMemo(() => availableCharts.filter((chart) => CHART_CONFIGURATION_DIMENSIONS.every((dimension) =>
    !selected[dimension] || chartDimensionValue(chart, dimension) === selected[dimension])), [availableCharts, selected]);
  const selectedChart = exactCandidates.find((chart) => chart.id === chartId) ?? null;
  const identityKey = selectedChart?.manufacturer_configuration?.identityKey;
  const chartKey = typeof identityKey === "string" ? identityKey : selectedChart?.boom_configuration ?? "";
  const radiusNumber = Number(radius);
  const chosenPoint = useMemo(() => selectNextChartPoint(points.filter((point) => point.configurationKey === chartKey), radiusNumber), [points, chartKey, radiusNumber]);

  useEffect(() => { setSelected({}); setChartId(""); setPoints([]); setError(""); onSelect(null); }, [craneProfileId, baseKey, onSelect]);

  const loadPoints = useCallback(async (id: string) => {
    setBusy(true); setError(""); setPoints([]); setChartId(id); onSelect(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your session has expired.");
      const path = `/api/lift-engineering/library/charts/points?chartId=${encodeURIComponent(id)}`;
      const response = await fetch(path, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const operation = `GET ${path}`;
      const payload = await readLiftJson<{ points?: Array<{ configuration_key: string; radius_m: number; rated_capacity_t: number; source_page?: string | null }> }>(response, operation);
      if (!payload) throw new Error(`${operation} failed (${response.status}): The server returned an empty response.`);
      setPoints((payload.points ?? []).map((point) => ({ configurationKey: point.configuration_key, radiusM: Number(point.radius_m), capacityT: Number(point.rated_capacity_t), sourcePage: point.source_page ?? null })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Manufacturer chart points could not be loaded."); }
    finally { setBusy(false); }
  }, [onSelect, supabase]);

  useEffect(() => {
    if (!selectedChart || !Number.isFinite(radiusNumber) || radius === "") { onSelect(null); return; }
    onSelect({ chart: selectedChart, point: chosenPoint, requiredRadiusM: radiusNumber });
  }, [selectedChart, chosenPoint, radius, radiusNumber, onSelect]);

  const sourceDocument = selectedChart?.source_document ?? {};
  const sourceUrl = [sourceDocument.sourcePdfUrl, sourceDocument.webUrl, sourceDocument.url].find((value) => typeof value === "string") as string | undefined;
  const sourcePage = chosenPoint?.sourcePage ?? sourceDocument.sourcePageRange;
  const pageNumber = typeof sourcePage === "string" ? sourcePage.match(/\d+(?:\.\d+)?/)?.[0] : null;
  return <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
    <div><h3 className="text-sm font-bold">Manufacturer chart configuration</h3><p className="text-xs text-slate-600">Options are restricted to the selected base crane counterweight, outrigger geometry and slew range. Each lift selects its own boom and accessory configuration.</p>{baseSetup?.customManual && <p className="mt-1 text-xs font-semibold text-amber-800">Base setup is Custom / Manual. A result is manufacturer-chart-backed only when an exact imported chart configuration matches all selected dimensions.</p>}{!baseReady && <p className="mt-1 text-xs text-amber-800">Select a complete base Crane Configuration in Study Setup before selecting a manufacturer chart.</p>}</div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{CHART_CONFIGURATION_DIMENSIONS.filter((dimension) => dimension !== "manufacturerOptions" && fieldShown(dimension, availableCharts, selected, craneProfileId)).map((dimension) => {
      const values = chartFacetOptions(availableCharts, dimension, selected, craneProfileId);
      return <label key={dimension} className="text-xs font-bold text-slate-600">{labels[dimension]}<select value={selected[dimension] ?? ""} onChange={(event) => {
        const value = event.target.value; setSelected((current) => { const next = clearDownstreamChartSelections(current, dimension); if (value) next[dimension] = value; return next; });
        setChartId(""); setPoints([]); setError(""); onSelect(null);
      }} className="mt-1 block w-full rounded-lg border bg-white px-2 py-2 text-sm"><option value="">Select {labels[dimension].toLowerCase()}</option>{values.map((value) => <option key={value} value={value}>{dimension === "flyJibFitted" ? value === "true" ? "Fitted" : "None / Not fitted" : value === "<none>" ? "None / Not fitted" : value}</option>)}</select></label>;
    })}</div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs font-bold text-slate-600">Exact manufacturer chart<select value={chartId} onChange={(event) => { if (event.target.value) void loadPoints(event.target.value); else { setChartId(""); setPoints([]); onSelect(null); } }} disabled={!exactCandidates.length} className="mt-1 block w-full rounded-lg border bg-white px-2 py-2 text-sm"><option value="">{exactCandidates.length ? "Select exact chart" : "No exact chart matches these selections"}</option>{exactCandidates.map((chart) => <option key={chart.id} value={chart.id}>{String(chart.manufacturer_configuration?.manufacturerChartId ?? chart.name ?? "Chart")} · Rev {chart.revision} · {chart.status}</option>)}</select></label>
      <label className="text-xs font-bold text-slate-600">Required radius (m)<input type="number" min="0" step="0.01" value={radius} onChange={(event) => setRadius(event.target.value)} className="mt-1 block w-full rounded-lg border bg-white px-2 py-2 text-sm"/></label>
      <div className="rounded-lg border bg-white p-2 text-xs"><p>Selected chart radius: <strong>{chosenPoint ? `${chosenPoint.radiusM.toFixed(2)} m` : "—"}</strong></p><p>Available capacity: <strong>{chosenPoint ? `${chosenPoint.capacityT.toFixed(2)} t` : "—"}</strong></p><p>Manufacturer chart ID: <strong>{String(selectedChart?.manufacturer_configuration?.manufacturerChartId ?? selectedChart?.name ?? "—")}</strong></p><p>Source page: <strong>{sourcePage ? String(sourcePage) : "—"}</strong></p></div>
    </div>
    {busy && <p role="status" className="text-xs text-slate-500">Loading exact chart points…</p>}
    {!busy && selectedChart && radius !== "" && !chosenPoint && <p role="alert" className="text-xs font-semibold text-rose-700">No manufacturer capacity is available at or beyond the required radius for this crane configuration.</p>}
    {sourceUrl && <a href={`${sourceUrl}${pageNumber && !String(sourceUrl).includes("#") ? `#page=${encodeURIComponent(pageNumber)}` : ""}`} target="_blank" rel="noreferrer" className="inline-flex rounded-lg border bg-white px-3 py-2 text-xs font-bold text-blue-700">View Source Chart</a>}
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
  </section>;
}

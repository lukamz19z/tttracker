"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase";
type Chart = { id: string; name: string; revision: string };
type Point = { configurationKey: string; radiusM: string; ratedCapacityT: string; sourcePage: string };
const empty: Point = { configurationKey: "", radiusM: "", ratedCapacityT: "", sourcePage: "" };

export function ChartPointEditor({ charts }: { charts: Chart[] }) {
  const supabase = useMemo(() => createSupabaseBrowser(), []); const [chartId, setChartId] = useState(""); const [points, setPoints] = useState<Point[]>([empty]);
  const [saved, setSaved] = useState<Array<Record<string, unknown>>>([]); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const api = useCallback(async (init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession(); if (!session?.access_token) throw new Error("Your session has expired.");
    const headers = new Headers(init?.headers); headers.set("Authorization", `Bearer ${session.access_token}`); if (init?.body) headers.set("Content-Type", "application/json");
    const response = await fetch(`/api/lift-engineering/library/charts/points${init?.method === "POST" ? "" : `?chartId=${encodeURIComponent(chartId)}`}`, { ...init, headers, cache: "no-store" });
    const result = await response.json() as { error?: string; points?: Array<Record<string, unknown>> };
    if (!response.ok) throw new Error(result.error || "Chart point request failed."); return result;
  }, [chartId, supabase]);
  useEffect(() => { let active = true; if (chartId) void api().then((result) => { if (active) setSaved(result.points ?? []); }).catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Could not load chart points."); }); else setSaved([]); return () => { active = false; }; }, [api, chartId]);
  function update(index: number, key: keyof Point, value: string) { setPoints((current) => current.map((row, i) => i === index ? { ...row, [key]: value } : row)); }
  async function save() { setBusy(true); setMessage(""); try { const valid = points.filter((point) => point.configurationKey.trim() && point.radiusM !== "" && point.ratedCapacityT !== ""); if (!chartId || !valid.length) throw new Error("Choose a chart and enter at least one complete point."); const result = await api({ method: "POST", body: JSON.stringify({ chartId, rows: valid.map((point) => ({ configurationKey: point.configurationKey.trim(), radiusM: Number(point.radiusM), ratedCapacityT: Number(point.ratedCapacityT), sourcePage: point.sourcePage.trim() || null })) }) }); setSaved(result.points ?? []); setPoints([empty]); setMessage(`${result.points?.length ?? 0} chart points saved.`); } catch (error) { setMessage(error instanceof Error ? error.message : "Chart points could not be saved."); } finally { setBusy(false); } }
  return <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm"><div><h2 className="font-bold">Load-chart point entry</h2><p className="text-xs text-slate-500">Guided grid entry. Calculations use the next manufacturer radius at or above the required radius; they do not interpolate.</p></div><select value={chartId} onChange={(event) => setChartId(event.target.value)} className="w-full max-w-xl rounded-lg border px-3 py-2 text-sm"><option value="">Select load chart</option>{charts.map((chart) => <option key={chart.id} value={chart.id}>{chart.name} · Rev {chart.revision}</option>)}</select>
    {points.map((point, index) => <div key={index} className="grid gap-2 sm:grid-cols-4"><input aria-label="Configuration key" placeholder="Boom/configuration key" value={point.configurationKey} onChange={(event) => update(index,"configurationKey",event.target.value)} className="rounded border px-2 py-2 text-sm"/><input aria-label="Radius metres" type="number" min="0" step="0.01" placeholder="Radius m" value={point.radiusM} onChange={(event) => update(index,"radiusM",event.target.value)} className="rounded border px-2 py-2 text-sm"/><input aria-label="Rated capacity tonnes" type="number" min="0.001" step="0.01" placeholder="Capacity t" value={point.ratedCapacityT} onChange={(event) => update(index,"ratedCapacityT",event.target.value)} className="rounded border px-2 py-2 text-sm"/><input aria-label="Source page" placeholder="Source page" value={point.sourcePage} onChange={(event) => update(index,"sourcePage",event.target.value)} className="rounded border px-2 py-2 text-sm"/></div>)}
    <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setPoints((current) => [...current, empty])} className="rounded-lg border px-3 py-2 text-sm font-bold">Add chart row</button><button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Save points</button></div>{message && <p role="status" className="text-sm text-slate-600">{message}</p>}
    <p className="text-xs text-slate-500">Stored points: {saved.length}{saved.length ? ` · ${saved.map((point) => `${String(point.configuration_key)} ${String(point.radius_m)}m = ${String(point.rated_capacity_t)}t`).join(" · ")}` : ""}</p>
  </section>;
}

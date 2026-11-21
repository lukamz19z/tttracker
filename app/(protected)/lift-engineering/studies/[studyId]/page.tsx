"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";
import { mapTemplateLiftsToStudyInputs, type TemplateLiftRecord } from "@/lib/lift-engineering/template-study-input";
import { ChartConfigurationSelector, type PointSelection } from "./ChartConfigurationSelector";
import { chartMatchesBaseSetup } from "@/lib/lift-engineering/base-configuration";
import { readLiftJson } from "@/lib/lift-engineering/client-response";

type Option = { id: string; name?: string; manufacturer?: string; model?: string; revision?: string; status?: string; crane_profile_id?: string; configuration_id?: string; template_id?: string; crane_profile_revision_id?: string; mass_kg?: number; boom_configuration?: string; boom_length_m?: number; configuration_revision_id?: string; counterweight_t?: number; outrigger_state?: string; data?: Record<string, unknown> | null; slew_sector?: string; fly_jib?: string | null; manufacturer_configuration?: Record<string, unknown> | null; source_document?: Record<string, unknown> };
type Options = { cranes: Option[]; craneRevisions: Option[]; configurations: Option[]; configurationRevisions: Option[]; templates: Option[]; templateRevisions: Option[]; charts: Option[]; arrangements: Option[]; hooks: Option[]; ropes: Option[]; attachments: Option[] };
type StudyPayload = { study: { id: string; project_id: string; study_number: string; title: string; status: string; current_revision_id: string }; revision: Record<string, unknown> | null; lifts: Array<Record<string, unknown>> };
type LiftDraft = { liftNumber: string; description: string; liftType: string; elementMassKg: string; factor: string; radiusM: string; mainShare: string; auxiliaryShare: string; mainHookId: string; mainRopeId: string; mainAttachmentId: string; mainRiggingArrangementId: string; auxiliaryHookId: string; auxiliaryRopeId: string; auxiliaryAttachmentId: string; auxiliaryRiggingArrangementId: string; chartId: string; auxiliaryChartId: string; configurationKey: string; auxiliaryConfigurationKey: string; phasesJson: string };
type SetupDraft = { craneProfileId: string; craneRevisionId: string; configurationRevisionId: string; templateRevisionId: string; padWidthM: string; padLengthM: string; allowableGroundPressureKpa: string };
const blankLift: LiftDraft = { liftNumber: "", description: "", liftType: "Custom", elementMassKg: "", factor: "1", radiusM: "", mainShare: "1", auxiliaryShare: "0", mainHookId: "", mainRopeId: "", mainAttachmentId: "", mainRiggingArrangementId: "", auxiliaryHookId: "", auxiliaryRopeId: "", auxiliaryAttachmentId: "", auxiliaryRiggingArrangementId: "", chartId: "", auxiliaryChartId: "", configurationKey: "", auxiliaryConfigurationKey: "", phasesJson: "" };
const blankSetup: SetupDraft = { craneProfileId: "", craneRevisionId: "", configurationRevisionId: "", templateRevisionId: "", padWidthM: "", padLengthM: "", allowableGroundPressureKpa: "" };
const inputFields = [
  { key: "liftNumber", label: "Lift number" }, { key: "description", label: "Description" },
  { key: "elementMassKg", label: "Element mass (kg)", type: "number" }, { key: "factor", label: "Effective load factor", type: "number" },
  { key: "radiusM", label: "Required radius (m)", type: "number" }, { key: "mainShare", label: "Main load share", type: "number" },
  { key: "auxiliaryShare", label: "Auxiliary load share", type: "number" },
] as const;

export default function LiftStudyDetailPage({ params }: { params: Promise<{ studyId: string }> }) {
  const [studyId, setStudyId] = useState("");
  const [data, setData] = useState<StudyPayload | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [setupDraft, setSetupDraft] = useState<SetupDraft>(blankSetup);
  const [draft, setDraft] = useState<LiftDraft>(blankLift);
  const [chartSelection, setChartSelection] = useState<PointSelection>(null);
  const [auxiliaryChartSelection, setAuxiliaryChartSelection] = useState<PointSelection>(null);
  const [lifts, setLifts] = useState<Array<Record<string, unknown>>>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const selectedBaseRevision = options?.configurationRevisions.find((row) => row.id === setupDraft.configurationRevisionId) ?? null;
  const baseData = selectedBaseRevision?.data ?? {};
  const selectedBaseSetup = selectedBaseRevision ? {
    revisionId: selectedBaseRevision.id,
    counterweightT: selectedBaseRevision.counterweight_t ?? null,
    outriggerLengthM: typeof baseData.outriggerLengthM === "number" ? baseData.outriggerLengthM : null,
    outriggerWidthM: typeof baseData.outriggerWidthM === "number" ? baseData.outriggerWidthM : null,
    slewRange: typeof baseData.slewRange === "string" ? baseData.slewRange : null,
    customManual: baseData.configurationSource === "custom_manual",
  } : null;

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your session has expired.");
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${session.access_token}`);
    if (init?.body) headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...init, headers, cache: "no-store" });
    const payload = await readLiftJson<Record<string, unknown>>(response, `${init?.method ?? "GET"} ${path}`);
    if (!payload) throw new Error(`${init?.method ?? "GET"} ${path} failed (${response.status}): The server returned an empty response.`);
    return payload;
  }, [supabase]);

  const load = useCallback(async () => {
    if (!studyId) return;
    setError("");
    try {
      const [studyPayload, libraryPayload] = await Promise.all([
        api(`/api/lift-engineering/studies/${studyId}`),
        api(`/api/lift-engineering/studies/${studyId}/options`),
      ]);
      const study = studyPayload as unknown as StudyPayload;
      const library = libraryPayload as unknown as Options;
      setData(study);
      setOptions(library);
      const revision = study.revision ?? {};
      const calculationInputs = revision.calculation_inputs as { studySettings?: Record<string, unknown> } | undefined;
      setSetupDraft({
        craneProfileId: String(library.craneRevisions.find((item) => item.id === String(revision.crane_profile_revision_id ?? ""))?.crane_profile_id ?? ""),
        craneRevisionId: String(revision.crane_profile_revision_id ?? ""),
        configurationRevisionId: String(revision.configuration_revision_id ?? ""),
        templateRevisionId: String(revision.template_revision_id ?? ""),
        padWidthM: String(calculationInputs?.studySettings?.padWidthM ?? ""),
        padLengthM: String(calculationInputs?.studySettings?.padLengthM ?? ""),
        allowableGroundPressureKpa: String(calculationInputs?.studySettings?.allowableGroundPressureKpa ?? ""),
      });
      const snapshot = revision.input_snapshot as { lifts?: Array<Record<string, unknown>> } | undefined;
      if (snapshot?.lifts?.length) setLifts(snapshot.lifts.map((item) => ({ ...item, phases: item.phases ?? [] })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Study could not be loaded.");
    }
  }, [api, studyId]);

  useEffect(() => {
    let active = true;
    void params.then(({ studyId: value }) => { if (active) setStudyId(value); });
    return () => { active = false; };
  }, [params]);
  useEffect(() => { void load(); }, [load]);

  function setField(key: keyof LiftDraft, value: string) { setDraft((current) => ({ ...current, [key]: value })); }

  function addLift() {
    try {
      const selectedChartId = draft.chartId || chartSelection?.chart.id || "";
      const selectedChartKey = draft.configurationKey || String(chartSelection?.chart.manufacturer_configuration?.identityKey ?? chartSelection?.chart.boom_configuration ?? "");
      const requiredRadius = draft.radiusM.trim() ? Number(draft.radiusM) : chartSelection?.requiredRadiusM;
      const phases = draft.phasesJson.trim()
        ? JSON.parse(draft.phasesJson) as unknown
        : [{ key: "main", name: "Main Upend / Place", loadShare: { main: Number(draft.mainShare), auxiliary: Number(draft.auxiliaryShare) }, radiusM: Number(requiredRadius) }];
      if (!Array.isArray(phases)) throw new Error("Operating phases must be a JSON array.");
      if (!draft.liftNumber.trim() || !selectedChartId || !Number.isFinite(Number(draft.elementMassKg)) || !Number.isFinite(Number(requiredRadius)) || !chartSelection?.point) throw new Error("Lift number, element mass, required radius and an exact chart point at or above that radius are required.");
      const usesAuxiliary = phases.some((phase) => Boolean(phase && typeof phase === "object" && "loadShare" in phase && Number((phase as { loadShare?: { auxiliary?: number } }).loadShare?.auxiliary ?? 0) > 0));
      if (usesAuxiliary && !auxiliaryChartSelection?.point) throw new Error("This lift uses the auxiliary hook. Select its exact manufacturer chart configuration and confirm a chart point at or above the required radius.");
      setLifts((current) => [...current, {
        liftNumber: draft.liftNumber.trim(), description: draft.description.trim() || draft.liftNumber.trim(), liftType: draft.liftType,
        elementMassKg: Number(draft.elementMassKg), effectiveLoadFactor: Number(draft.factor),
        mainHookId: draft.mainHookId, mainRopeId: draft.mainRopeId || null, mainAttachmentId: draft.mainAttachmentId || null,
        mainRiggingArrangementId: draft.mainRiggingArrangementId || null, auxiliaryHookId: draft.auxiliaryHookId || null,
        auxiliaryRopeId: draft.auxiliaryRopeId || null, auxiliaryAttachmentId: draft.auxiliaryAttachmentId || null,
        auxiliaryRiggingArrangementId: draft.auxiliaryRiggingArrangementId || null, chartId: selectedChartId,
        auxiliaryChartId: usesAuxiliary ? auxiliaryChartSelection?.chart.id : null, configurationKey: selectedChartKey,
        auxiliaryConfigurationKey: usesAuxiliary ? String(auxiliaryChartSelection?.chart.manufacturer_configuration?.identityKey ?? auxiliaryChartSelection?.chart.boom_configuration ?? "") : selectedChartKey, sequenceNo: current.length + 1, phases,
      }]);
      setDraft({ ...blankLift, liftNumber: `LIFT ${lifts.length + 2}` });
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Lift input is invalid."); }
  }

  async function action(path: string, init?: RequestInit) {
    setBusy(true); setError("");
    try { const response = await api(path, init); setResult(response); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Action failed."); }
    finally { setBusy(false); }
  }

  async function calculate() {
    await action(`/api/lift-engineering/studies/${studyId}/calculate`, { method: "POST", body: JSON.stringify({ lifts }) });
  }

  async function saveSetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await api(`/api/lift-engineering/studies/${studyId}/setup`, { method: "PATCH", body: JSON.stringify({
        craneProfileRevisionId: setupDraft.craneRevisionId,
        configurationRevisionId: setupDraft.configurationRevisionId,
        templateRevisionId: setupDraft.templateRevisionId || null,
        padWidthM: setupDraft.padWidthM === "" ? null : Number(setupDraft.padWidthM),
        padLengthM: setupDraft.padLengthM === "" ? null : Number(setupDraft.padLengthM),
        allowableGroundPressureKpa: setupDraft.allowableGroundPressureKpa === "" ? null : Number(setupDraft.allowableGroundPressureKpa),
      }) });
      setResult(response); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Study setup could not be saved."); }
    finally { setBusy(false); }
  }

  async function loadSelectedTemplate() {
    if (!options || !setupDraft.templateRevisionId || setupDraft.templateRevisionId !== String(data?.revision?.template_revision_id ?? "")) {
      setError("Save the selected template in Study Setup before loading its lift sequence."); return;
    }
    setBusy(true); setError("");
    try {
      const response = await api(`/api/lift-engineering/library/templates/lifts?templateRevisionId=${encodeURIComponent(setupDraft.templateRevisionId)}`);
      const templateLifts = Array.isArray(response.lifts) ? response.lifts as TemplateLiftRecord[] : [];
      if (!templateLifts.length) throw new Error("The selected template revision has no lift sequence.");
      const mapped = mapTemplateLiftsToStudyInputs(templateLifts, options, setupDraft.configurationRevisionId);
      setLifts(mapped); setResult({ loadedTemplateLiftCount: mapped.length });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Template lift sequence could not be loaded."); }
    finally { setBusy(false); }
  }

  const revision = data?.revision ?? {};
  const issued = Boolean(revision.issued_at) || ["submitted", "reviewed", "approved", "returned"].includes(String(revision.status));
  const renderSelect = (label: string, key: keyof LiftDraft, rows: Option[], required = false) => (
    <label className="text-xs font-bold text-slate-600">{label}<select required={required} value={draft[key]} onChange={(event) => setField(key, event.target.value)} className="mt-1 block w-full rounded-lg border bg-white px-2 py-2 text-sm"><option value="">— none —</option>{rows.map((row) => <option key={row.id} value={row.id}>{row.name ?? row.revision ?? row.id}{row.revision ? ` · Rev ${row.revision}` : ""}{row.mass_kg != null ? ` · ${(Number(row.mass_kg) / 1000).toFixed(3)} t` : ""}</option>)}</select></label>
  );

  if (!data) return <AppShell><main className="p-6">{error || "Loading Lift Study…"}</main></AppShell>;
  return <AppShell><main className="mx-auto max-w-7xl space-y-5 p-4 md:p-7">
    <div><Link href="/lift-engineering/studies" className="text-sm font-semibold text-blue-700">← Lift Studies</Link><h1 className="mt-2 text-2xl font-bold">{data.study.study_number} · {data.study.title}</h1><p className="mt-1 text-sm text-slate-600">Project-scoped study · Revision {String(revision.revision_label ?? "A")} · {String(revision.status ?? data.study.status)}</p></div>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {options && <form onSubmit={(event) => void saveSetup(event)} className="grid gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-4">
      <h2 className="font-bold md:col-span-4">Study setup</h2>
      <label className="text-xs font-bold text-slate-600">Crane<select value={setupDraft.craneProfileId} onChange={(event) => { setSetupDraft((current) => ({ ...current, craneProfileId: event.target.value, craneRevisionId: "", configurationRevisionId: "" })); setChartSelection(null); setAuxiliaryChartSelection(null); if (lifts.length) { setLifts([]); setDraft(blankLift); setError("Crane changed. Pending lifts were cleared because their chart selections belong to the previous crane setup."); } }} disabled={issued} required className="mt-1 block w-full rounded-lg border px-2 py-2"><option value="">Select a crane</option>{options.cranes.map((row) => <option key={row.id} value={row.id}>{row.manufacturer} {row.model}</option>)}</select></label>
      <label className="text-xs font-bold text-slate-600">Crane profile revision<select value={setupDraft.craneRevisionId} onChange={(event) => setSetupDraft((current) => ({ ...current, craneRevisionId: event.target.value }))} disabled={issued || !setupDraft.craneProfileId} required className="mt-1 block w-full rounded-lg border px-2 py-2"><option value="">Select a crane revision</option>{options.craneRevisions.filter((row) => row.crane_profile_id === setupDraft.craneProfileId).map((row) => <option key={row.id} value={row.id}>{row.status} · Rev {row.revision}</option>)}</select></label>
      <label className="text-xs font-bold text-slate-600">Configuration revision<select value={setupDraft.configurationRevisionId} onChange={(event) => {
        const nextId = event.target.value; setSetupDraft((current) => ({ ...current, configurationRevisionId: nextId })); setChartSelection(null); setAuxiliaryChartSelection(null);
        const nextRevision = options.configurationRevisions.find((row) => row.id === nextId);
        const nextData = nextRevision?.data ?? {};
        const nextBase = { counterweightT: nextRevision?.counterweight_t ?? null, outriggerLengthM: typeof nextData.outriggerLengthM === "number" ? nextData.outriggerLengthM : null, outriggerWidthM: typeof nextData.outriggerWidthM === "number" ? nextData.outriggerWidthM : null, slewRange: typeof nextData.slewRange === "string" ? nextData.slewRange : null };
        const completeBase = nextBase.counterweightT != null && nextBase.outriggerLengthM != null && nextBase.outriggerWidthM != null && Boolean(nextBase.slewRange);
        const compatibleCharts = new Set(completeBase ? options.charts.filter((chart) => chartMatchesBaseSetup(chart, setupDraft.craneProfileId, nextBase)).map((chart) => chart.id) : []);
        const before = lifts.length; const compatibleLifts = lifts.filter((lift) => compatibleCharts.has(String(lift.chartId)) && (!lift.auxiliaryChartId || compatibleCharts.has(String(lift.auxiliaryChartId)))); setLifts(compatibleLifts);
        setDraft((current) => ({ ...current, chartId: "", auxiliaryChartId: "", configurationKey: "", auxiliaryConfigurationKey: "" }));
        if (before > compatibleLifts.length) setError(`${before - compatibleLifts.length} pending lift${before - compatibleLifts.length === 1 ? " was" : "s were"} cleared because its chart selection does not match the new base crane setup.`);
      }} disabled={issued || !setupDraft.craneProfileId} required className="mt-1 block w-full rounded-lg border px-2 py-2"><option value="">Select a configuration revision</option>{options.configurationRevisions.filter((row) => options.configurations.find((config) => config.id === row.configuration_id)?.crane_profile_id === setupDraft.craneProfileId).map((row) => <option key={row.id} value={row.id}>{options.configurations.find((config) => config.id === row.configuration_id)?.name} · {row.status} · Rev {row.revision}</option>)}</select></label>
      <label className="text-xs font-bold text-slate-600">Template revision<select value={setupDraft.templateRevisionId} onChange={(event) => setSetupDraft((current) => ({ ...current, templateRevisionId: event.target.value }))} disabled={issued} className="mt-1 block w-full rounded-lg border px-2 py-2"><option value="">No template</option>{options.templateRevisions.map((row) => <option key={row.id} value={row.id}>{options.templates.find((template) => template.id === row.template_id)?.name} · Rev {row.revision}</option>)}</select></label>
      {([...[{ key: "padWidthM", label: "Pad width (m)" }, { key: "padLengthM", label: "Pad length (m)" }, { key: "allowableGroundPressureKpa", label: "Allowable ground pressure (kPa)" }] as const]).map((field) => <label key={field.key} className="text-xs font-bold text-slate-600">{field.label}<input type="number" min="0" step="any" value={setupDraft[field.key]} onChange={(event) => setSetupDraft((current) => ({ ...current, [field.key]: event.target.value }))} disabled={issued} className="mt-1 block w-full rounded-lg border px-2 py-2"/></label>)}
      <div className="flex flex-wrap items-end gap-2"><button disabled={issued || busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Save setup</button><button type="button" disabled={issued || busy || !setupDraft.templateRevisionId} onClick={() => void loadSelectedTemplate()} className="rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-50">Load selected template lifts</button></div>
    </form>}
    {!issued && options && <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm"><h2 className="font-bold">Add lift calculation</h2>
    {setupDraft.craneProfileId && <ChartConfigurationSelector charts={options.charts} craneProfileId={setupDraft.craneProfileId} baseSetup={selectedBaseSetup} initialRadius={draft.radiusM} onSelect={setChartSelection}/>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-bold text-slate-600">Lift type<select value={draft.liftType} onChange={(event) => setField("liftType", event.target.value)} className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm">{["Erection", "Box", "Box Flip", "Panel", "Tailing", "Aerial Installation", "Custom"].map((type) => <option key={type}>{type}</option>)}</select></label>
      {inputFields.map((field) => <label key={field.key} className="text-xs font-bold text-slate-600">{field.label}<input type={"type" in field ? field.type : "text"} value={draft[field.key]} onChange={(event) => setField(field.key, event.target.value)} className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm"/></label>)}
      {renderSelect("Main hook", "mainHookId", options.hooks, true)}{renderSelect("Main rope", "mainRopeId", options.ropes)}{renderSelect("Main attachment", "mainAttachmentId", options.attachments)}{renderSelect("Main rigging arrangement", "mainRiggingArrangementId", options.arrangements)}
      {renderSelect("Auxiliary hook", "auxiliaryHookId", options.hooks)}{renderSelect("Auxiliary rope", "auxiliaryRopeId", options.ropes)}{renderSelect("Auxiliary attachment", "auxiliaryAttachmentId", options.attachments)}{renderSelect("Auxiliary rigging arrangement", "auxiliaryRiggingArrangementId", options.arrangements)}
      <details className="rounded-lg border p-3 sm:col-span-2 lg:col-span-4"><summary className="cursor-pointer text-xs font-bold text-slate-700">Auxiliary hook chart configuration (required when an operating phase uses the auxiliary hook)</summary><div className="mt-3"><ChartConfigurationSelector charts={options.charts} craneProfileId={setupDraft.craneProfileId} baseSetup={selectedBaseSetup} initialRadius={draft.radiusM} onSelect={setAuxiliaryChartSelection}/></div></details>
      <label className="text-xs font-bold text-slate-600 sm:col-span-2 lg:col-span-4">Operating phases JSON (optional)<textarea value={draft.phasesJson} onChange={(event) => setField("phasesJson", event.target.value)} placeholder='[{"key":"pick","name":"Pick","loadShare":{"main":0.6,"auxiliary":0.6},"radiusM":25.517}]' rows={2} className="mt-1 block w-full rounded-lg border px-2 py-2 font-mono text-xs"/></label>
    </div><div className="flex flex-wrap gap-2"><button onClick={addLift} type="button" className="rounded-lg border px-4 py-2 text-sm font-bold">Add lift to calculation</button><button disabled={!lifts.length || busy} onClick={() => void calculate()} type="button" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Calculating…" : `Calculate ${lifts.length} lift${lifts.length === 1 ? "" : "s"}`}</button></div><ul className="space-y-1 text-sm text-slate-700">{lifts.map((lift, index) => <li key={`${String(lift.liftNumber)}-${index}`} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>{String(lift.liftNumber)} · {String(lift.description)}</span><button type="button" onClick={() => setLifts((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="text-xs font-bold text-rose-700">Remove</button></li>)}</ul></section>}
    {result && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><h2 className="font-bold text-emerald-950">Result</h2><pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-white/70 p-3 text-xs">{JSON.stringify(result.governingLift ?? result, null, 2)}</pre></section>}
    <div className="flex flex-wrap gap-2">{!issued && <button disabled={busy} onClick={() => void action(`/api/lift-engineering/studies/${studyId}/workflow`, { method: "POST", body: JSON.stringify({ action: "submit" }) })} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-bold text-white">Submit revision</button>}{issued && <button disabled={busy} onClick={() => void action(`/api/lift-engineering/studies/${studyId}/revisions`, { method: "POST", body: "{}" })} className="rounded-lg border px-4 py-2 text-sm font-bold">Create next revision</button>}<button disabled={busy || !revision.output_snapshot} onClick={() => void action(`/api/lift-engineering/studies/${studyId}/pdf`, { method: "POST", body: "{}" })} className="rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-50">Generate PDF</button>{revision.status === "submitted" && <><button disabled={busy} onClick={() => void action(`/api/lift-engineering/studies/${studyId}/workflow`, { method: "POST", body: JSON.stringify({ action: "review" }) })} className="rounded-lg border px-4 py-2 text-sm font-bold">Mark reviewed</button><button disabled={busy} onClick={() => void action(`/api/lift-engineering/studies/${studyId}/workflow`, { method: "POST", body: JSON.stringify({ action: "approve" }) })} className="rounded-lg border px-4 py-2 text-sm font-bold">Approve</button></>}</div>
  </main></AppShell>;
}

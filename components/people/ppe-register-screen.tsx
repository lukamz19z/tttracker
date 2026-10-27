"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, ChevronDown, ClipboardList, Download, LayoutGrid, Package, Printer, RefreshCw, Search, Settings2, ShieldCheck, Users, X } from "lucide-react";
import type { PpeFilters, PpeLine, PpeReport, PpeSummary } from "@/lib/people/ppe";
import { PpeCategories, PpeEmpty, PpeLoading, PpeMetric, PpePeople, ppeButton, ppeInput, ppePrimary } from "./ppe-register-views";
import { PpeRegisterEditor, type PpeEditorProps } from "./ppe-register-editor";

type ScreenProps = {
  report: PpeReport | null; allowed: boolean; accessLoading: boolean; busy: boolean; error: string;
  filters: PpeFilters; change: (key: keyof PpeFilters, value: string | boolean) => void; reset: () => void;
  tab: string; setTab: (tab: string) => void; visible: PpeLine[]; people: PpeLine[][];
  limit: number; more: () => void; refresh: () => void; exportRows: () => void;
  onSize: (summary: PpeSummary) => void; onItem: (row: PpeLine) => void;
  filterDescription: string; editor: PpeEditorProps | null;
};
function FilterSelect({ label, value, onChange, options, className = "" }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return <label className={`relative min-w-0 ${className}`}><span className="sr-only">{label}</span><select value={value} onChange={event => onChange(event.target.value)} className={`${ppeInput} appearance-none pr-8`}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-3.5 text-slate-400" /></label>;
}
export function PpeRegisterScreen(props: ScreenProps) {
  const { report, allowed, accessLoading, busy, error, filters, change, reset, tab, setTab, visible, people, limit, more, refresh, exportRows, onSize, onItem, filterDescription, editor } = props;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const initialLoading = accessLoading || (!report && !error);
  const activeFilterCount = [filters.search, filters.crew !== "all", filters.type !== "all", filters.size, filters.active !== (filters.employee ? "all" : "active"), filters.details !== "all"].filter(Boolean).length;
  const togglePerson = (id: string) => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  if (!accessLoading && !allowed) return <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><ShieldCheck className="text-slate-400" size={22} /><div><h2 className="text-sm font-bold text-slate-900">PPE access required</h2><p className="mt-1 text-sm text-slate-500">You do not have permission to view PPE records.</p></div></div>;
  return <section className="space-y-3" aria-label="PPE Register">
    <style>{`@media print {body *{visibility:hidden}.ppe-print,.ppe-print *{visibility:visible}.ppe-print{position:absolute;left:0;top:0;width:100%;font-size:10pt}.ppe-no-print{display:none!important}.ppe-print table{width:100%;border-collapse:collapse}.ppe-print th,.ppe-print td{border-bottom:1px solid #ddd;padding:5px;text-align:left}.ppe-print tr{break-inside:avoid}}`}</style>
    <header className="ppe-no-print flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
      <div><h2 className="text-xl font-black tracking-tight text-slate-950">PPE Register</h2><p className="mt-1 text-sm text-slate-500">Employee PPE sizing and requirements.</p></div>
      <div className="flex items-center gap-2">
        <button type="button" className={ppePrimary} disabled={!visible.length} onClick={exportRows}><Download size={15} />Export</button>
        <button type="button" className={ppeButton} disabled={busy || !report} onClick={() => window.print()}><Printer size={15} />Print</button>
        {report?.canEdit ? <Link className={ppeButton} href="/people/ppe/configuration" title="PPE Configuration"><Settings2 size={15} /><span className="hidden sm:inline">PPE Configuration</span><span className="sr-only sm:hidden">PPE Configuration</span></Link> : null}
      </div>
    </header>

    <div className="ppe-no-print grid grid-cols-2 gap-2 lg:grid-cols-4">
      <PpeMetric label="Active People" value={report?.metrics.active || 0} detail="Within current filters" icon={<Users size={17} />} loading={initialLoading} />
      <PpeMetric label="PPE Details Complete" value={report?.metrics.complete || 0} detail="All sizing details recorded" icon={<CheckCircle2 size={17} />} loading={initialLoading} />
      <PpeMetric label="Missing PPE Details" value={report?.metrics.missing || 0} detail="People needing size details" icon={<ClipboardList size={17} />} loading={initialLoading} />
      <PpeMetric label="PPE Types" value={report?.metrics.types || 0} detail="Active sizing categories" icon={<Package size={17} />} loading={initialLoading} />
    </div>

    <div className="ppe-no-print flex flex-wrap items-center justify-between gap-2">
      <div role="tablist" aria-label="PPE views" className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100/70 p-1">{[{ name: "Overview", icon: LayoutGrid }, { name: "People", icon: Users }].map(({ name, icon: Icon }) => <button type="button" role="tab" aria-selected={tab === name} aria-controls="ppe-view" id={`ppe-tab-${name}`} key={name} onClick={() => setTab(name)} className={`inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${tab === name ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:bg-white/60 hover:text-slate-800"}`}><Icon size={14} />{name}</button>)}</div>
      <p className="hidden text-xs text-slate-400 sm:block">Employee sizing by person and crew</p>
    </div>

    <div className="ppe-no-print sticky top-16 z-20 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur-sm">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:flex xl:flex-wrap">
        <label className="relative col-span-2 md:col-span-3 xl:min-w-64 xl:flex-1"><span className="sr-only">Search employee or crew</span><Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" /><input className={`${ppeInput} pl-9`} placeholder="Search employee, number or crew…" value={filters.search} onChange={event => change("search", event.target.value)} /></label>
        {report?.canSeeCrews ? <FilterSelect label="Crew" className="xl:w-36" value={filters.crew} onChange={value => change("crew", value)} options={[{ value: "all", label: "All crews" }, { value: "unassigned", label: "Unassigned" }, ...report.crews.map(row => ({ value: row.id, label: [row.crew_number, row.crew_name].filter(Boolean).join(" · ") }))]} /> : null}
        <FilterSelect label="PPE item" className="xl:w-40" value={filters.type} onChange={value => change("type", value)} options={[{ value: "all", label: "All PPE items" }, ...(report?.definitions.filter(row => row.active).map(row => ({ value: row.id, label: row.name })) || [])]} />
        <label className="xl:w-24"><span className="sr-only">Size filter</span><input className={ppeInput} placeholder="Size" value={filters.size === "__missing__" ? "Not recorded" : filters.size} onChange={event => change("size", event.target.value)} /></label>
        <FilterSelect label="PPE details status" className="xl:w-40" value={filters.details} onChange={value => change("details", value)} options={[{ value: "all", label: "All details" }, { value: "complete", label: "Complete" }, { value: "missing", label: "Missing details" }]} />
        <FilterSelect label="Employment status" className="xl:w-40" value={filters.active} onChange={value => change("active", value)} options={[{ value: "active", label: "Active only" }, { value: "all", label: "All employees" }, { value: "inactive", label: "Inactive only" }]} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">{activeFilterCount ? <button type="button" onClick={reset} className="inline-flex h-9 items-center gap-1 px-1 text-xs font-semibold text-slate-500 hover:text-slate-900 focus-visible:underline"><X size={13} />Clear filters</button> : null}<div className="ml-auto flex items-center gap-2"><span className="hidden text-xs text-slate-500 sm:block" aria-live="polite">{busy ? "Refreshing PPE" : report ? `${people.length} ${people.length === 1 ? "person" : "people"} matched` : ""}</span><button type="button" className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-100 disabled:opacity-50" aria-label="Refresh PPE register" title="Refresh PPE register" disabled={busy || accessLoading} onClick={refresh}><RefreshCw size={15} className={busy ? "animate-spin" : ""} /></button></div></div>
    </div>

    {error && !editor ? <div role="alert" className="ppe-no-print flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3"><AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-600" /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-rose-900">PPE data could not be loaded.</p><p className="mt-0.5 text-xs text-rose-700">{report ? "The last loaded register is still shown. " : ""}Please retry. Your existing PPE records have not changed.</p></div><button type="button" onClick={refresh} disabled={busy} className="shrink-0 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-50">Retry</button></div> : null}

    <div id="ppe-view" role="tabpanel" aria-labelledby={`ppe-tab-${tab}`} className="ppe-no-print">
      {initialLoading ? <PpeLoading /> : !visible.length ? <PpeEmpty title="No PPE records match these filters." description="Try another crew, PPE item or size, or clear the filters." onReset={reset} /> : tab === "Overview" ? <PpeCategories lines={visible} definitions={report?.definitions || []} onSize={onSize} /> : <PpePeople people={people} expanded={expanded} onExpand={togglePerson} onItem={onItem} canEdit={Boolean(report?.canEdit)} limit={limit} onMore={more} /> }
    </div>
    <footer className="ppe-no-print flex justify-between gap-2 px-1 text-[11px] text-slate-400"><span>Counts represent employees with each recorded size.</span>{report ? <span>Updated {new Date(report.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> : null}</footer>

    <div className="ppe-print hidden print:block"><h1>PPE Sizing Register — TTTracker People</h1><p>Generated {report ? new Date(report.generatedAt).toLocaleString() : ""}</p><p>Filters: {filterDescription} · View: {tab}</p><table><thead><tr>{["Employee", "Employee Number", "Crew", "PPE Item", "Size", "Status"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={`${row.employee_id}:${row.ppe_type_id}`}><td>{row.full_name}</td><td>{row.payroll_id}</td><td>{row.crew_label}</td><td>{row.item_name}</td><td>{row.size_label}</td><td>{row.status}</td></tr>)}</tbody></table></div>
    {editor ? <PpeRegisterEditor key={`${editor.line.employee_id}:${editor.line.ppe_type_id}`} {...editor} /> : null}
  </section>;
}

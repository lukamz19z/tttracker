"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, CheckCircle2, ChevronDown, ClipboardList, Download, LayoutGrid, Package, Printer, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal, Users, X } from "lucide-react";
import type { PpeFilters, PpeLine, PpeReport, PpeSummary } from "@/lib/people/ppe";
import { PpeCategories, PpeEmpty, PpeLoading, PpeMetric, PpePeople, personPpeStatus, ppeButton, ppeDetailProblems, ppeInput, ppeOutstanding, ppePrimary } from "./ppe-register-views";
import { PpeRegisterEditor, type PpeEditorProps } from "./ppe-register-editor";

type ScreenProps = {
  report: PpeReport | null; allowed: boolean; accessLoading: boolean; busy: boolean; error: string;
  filters: PpeFilters; change: (key: keyof PpeFilters, value: string | boolean) => void; reset: () => void;
  tab: string; setTab: (tab: string) => void; visible: PpeLine[]; people: PpeLine[][];
  limit: number; more: () => void; refresh: () => void; exportRows: (outstanding?: boolean) => void;
  onSize: (summary: PpeSummary) => void; onItem: (row: PpeLine) => void;
  filterDescription: string; editor: PpeEditorProps | null;
};
function FilterSelect({ label, value, onChange, options, className = "" }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return <label className={`relative min-w-0 ${className}`}><span className="sr-only">{label}</span><select value={value} onChange={event => onChange(event.target.value)} className={`${ppeInput} appearance-none pr-8`}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-3.5 text-slate-400" /></label>;
}
function FilterToggle({ label, active, onClick, disabled = false }: { label: string; active: boolean; onClick: () => void; disabled?: boolean }) {
  return <button type="button" aria-pressed={active} disabled={disabled} onClick={onClick} className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${active ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}><span className={`flex size-3.5 items-center justify-center rounded border ${active ? "border-amber-600 bg-amber-600 text-white" : "border-slate-300"}`} aria-hidden="true">{active ? <Check size={10} strokeWidth={3} /> : null}</span>{label}</button>;
}

export function PpeRegisterScreen(props: ScreenProps) {
  const { report, allowed, accessLoading, busy, error, filters, change, reset, tab, setTab, visible, people, limit, more, refresh, exportRows, onSize, onItem, filterDescription, editor } = props;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [group, setGroup] = useState<"person" | "item">("person");
  const scopePeople = useMemo(() => {
    const grouped = new Map<string, PpeLine[]>();
    for (const row of report?.lines || []) grouped.set(row.employee_id, [...(grouped.get(row.employee_id) || []), row]);
    return [...grouped.values()];
  }, [report]);
  const initialLoading = accessLoading || (!report && !error);
  const activeFilterCount = [filters.search, filters.crew !== "all", filters.type !== "all", filters.size, filters.active !== (filters.employee ? "all" : "active"), filters.issued !== "all", filters.missing, filters.outstanding].filter(Boolean).length;
  const togglePerson = (id: string) => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  if (!accessLoading && !allowed) return <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><ShieldCheck className="text-slate-400" size={22} /><div><h2 className="text-sm font-bold text-slate-900">PPE access required</h2><p className="mt-1 text-sm text-slate-500">You do not have permission to view PPE records.</p></div></div>;
  return <section className="space-y-3" aria-label="PPE Register">
    <style>{`@media print {body *{visibility:hidden}.ppe-print,.ppe-print *{visibility:visible}.ppe-print{position:absolute;left:0;top:0;width:100%;font-size:10pt}.ppe-no-print{display:none!important}.ppe-print table{width:100%;border-collapse:collapse}.ppe-print th,.ppe-print td{border-bottom:1px solid #ddd;padding:5px;text-align:left}.ppe-print tr{break-inside:avoid}}`}</style>
    <header className="ppe-no-print flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
      <div><h2 className="text-xl font-black tracking-tight text-slate-950">PPE Register</h2><p className="mt-1 text-sm text-slate-500">Employee sizing, issue status and outstanding PPE.</p></div>
      <div className="flex items-center gap-2">
        <details className="relative"><summary aria-label="Export PPE" className={`${ppePrimary} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}><Download size={15} />Export<ChevronDown size={13} /></summary><div className="absolute right-0 z-30 mt-2 w-56 space-y-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">{[{ label: "Export PPE Register", outstanding: false }, { label: "Export Outstanding PPE", outstanding: true }].map(item => <button type="button" key={item.label} disabled={busy || !report} className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-100 disabled:opacity-50" onClick={event => { exportRows(item.outstanding); event.currentTarget.closest("details")?.removeAttribute("open"); }}><Download size={14} />{item.label}</button>)}</div></details>
        <button type="button" className={ppeButton} disabled={busy || !report} onClick={() => window.print()}><Printer size={15} />Print</button>
        {report?.canEdit ? <Link className={ppeButton} href="/people/ppe/configuration" title="PPE Configuration"><Settings2 size={15} /><span className="hidden sm:inline">PPE Configuration</span><span className="sr-only sm:hidden">PPE Configuration</span></Link> : null}
      </div>
    </header>

    <div className="ppe-no-print grid grid-cols-2 gap-2 lg:grid-cols-4">
      <PpeMetric label="Active People" value={scopePeople.filter(rows => rows[0].active !== false).length} detail="Within current filters" icon={<Users size={17} />} loading={initialLoading} />
      <PpeMetric label="PPE Complete" value={scopePeople.filter(rows => personPpeStatus(rows).label === "Complete").length} detail="Requirements met" icon={<CheckCircle2 size={17} />} loading={initialLoading} />
      <PpeMetric label="Missing Details" value={scopePeople.filter(rows => rows.some(row => ppeDetailProblems(row).length)).length} detail="People needing size details" icon={<ClipboardList size={17} />} loading={initialLoading} />
      <PpeMetric label="Outstanding Items" value={ppeOutstanding(report?.lines || [])} detail="Based on recorded issues" icon={<Package size={17} />} loading={initialLoading} />
    </div>

    <div className="ppe-no-print flex flex-wrap items-center justify-between gap-2">
      <div role="tablist" aria-label="PPE views" className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100/70 p-1">{[{ name: "Overview", icon: LayoutGrid }, { name: "People", icon: Users }, { name: "Outstanding", icon: ClipboardList }].map(({ name, icon: Icon }) => <button type="button" role="tab" aria-selected={tab === name} aria-controls="ppe-view" id={`ppe-tab-${name}`} key={name} onClick={() => setTab(name)} className={`inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${tab === name ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:bg-white/60 hover:text-slate-800"}`}><Icon size={14} />{name}</button>)}</div>
      {tab === "Outstanding" ? <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1" aria-label="Group outstanding PPE">{([{ value: "person", label: "By Person" }, { value: "item", label: "By PPE Item" }] as const).map(item => <button type="button" key={item.value} aria-pressed={group === item.value} onClick={() => setGroup(item.value)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:ring-2 focus-visible:ring-blue-200 ${group === item.value ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{item.label}</button>)}</div> : <p className="hidden text-xs text-slate-400 sm:block">Sizing & recorded issue status</p>}
    </div>

    <div className="ppe-no-print sticky top-16 z-20 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur-sm">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:flex xl:flex-wrap">
        <label className="relative col-span-2 md:col-span-3 xl:min-w-64 xl:flex-1"><span className="sr-only">Search employee or crew</span><Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" /><input className={`${ppeInput} pl-9`} placeholder="Search employee, number or crew…" value={filters.search} onChange={event => change("search", event.target.value)} /></label>
        {report?.canSeeCrews ? <FilterSelect label="Crew" className="xl:w-36" value={filters.crew} onChange={value => change("crew", value)} options={[{ value: "all", label: "All crews" }, { value: "unassigned", label: "Unassigned" }, ...report.crews.map(row => ({ value: row.id, label: [row.crew_number, row.crew_name].filter(Boolean).join(" · ") }))]} /> : null}
        <FilterSelect label="PPE item" className="xl:w-40" value={filters.type} onChange={value => change("type", value)} options={[{ value: "all", label: "All PPE items" }, ...(report?.definitions.filter(row => row.active).map(row => ({ value: row.id, label: row.name })) || [])]} />
        <label className="xl:w-24"><span className="sr-only">Size filter</span><input className={ppeInput} placeholder="Size" value={filters.size === "__missing__" ? "Not recorded" : filters.size} onChange={event => change("size", event.target.value)} /></label>
        <FilterSelect label="Issue filter" className="xl:w-40" value={filters.issued} onChange={value => change("issued", value)} options={[{ value: "all", label: "All issue states" }, { value: "issued", label: "Recorded issues" }, { value: "not-issued", label: "No recorded issue" }]} />
        <FilterSelect label="Employment status" className="xl:w-40" value={filters.active} onChange={value => change("active", value)} options={[{ value: "active", label: "Active only" }, { value: "all", label: "All employees" }, { value: "inactive", label: "Inactive only" }]} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2"><SlidersHorizontal size={14} className="hidden text-slate-400 sm:block" /><FilterToggle label="Missing only" active={filters.missing} onClick={() => change("missing", !filters.missing)} /><FilterToggle label="Outstanding only" active={filters.outstanding || tab === "Outstanding"} disabled={tab === "Outstanding"} onClick={() => change("outstanding", !filters.outstanding)} />{activeFilterCount ? <button type="button" onClick={reset} className="inline-flex h-9 items-center gap-1 px-1 text-xs font-semibold text-slate-500 hover:text-slate-900 focus-visible:underline"><X size={13} />Clear filters</button> : null}<div className="ml-auto flex items-center gap-2"><span className="hidden text-xs text-slate-500 sm:block" aria-live="polite">{busy ? "Refreshing PPE" : report ? `${people.length} ${people.length === 1 ? "person" : "people"} matched` : ""}</span><button type="button" className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-100 disabled:opacity-50" aria-label="Refresh PPE register" title="Refresh PPE register" disabled={busy || accessLoading} onClick={refresh}><RefreshCw size={15} className={busy ? "animate-spin" : ""} /></button></div></div>
    </div>

    {error && !editor ? <div role="alert" className="ppe-no-print flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3"><AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-600" /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-rose-900">PPE data could not be loaded.</p><p className="mt-0.5 text-xs text-rose-700">{report ? "The last loaded register is still shown. " : ""}Please retry. Your existing PPE records have not changed.</p></div><button type="button" onClick={refresh} disabled={busy} className="shrink-0 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-50">Retry</button></div> : null}

    <div id="ppe-view" role="tabpanel" aria-labelledby={`ppe-tab-${tab}`} className="ppe-no-print">
      {initialLoading ? <PpeLoading /> : !visible.length ? <PpeEmpty title={tab === "Outstanding" ? "No outstanding PPE." : "No employees match these filters."} description={tab === "Outstanding" ? "No recorded issue shortfalls were found within these filters." : "Try another crew, PPE item or size, or clear the filters."} onReset={reset} /> : tab === "Overview" || (tab === "Outstanding" && group === "item") ? <PpeCategories lines={visible} definitions={report?.definitions || []} outstandingOnly={tab === "Outstanding"} onSize={row => { setGroup("person"); onSize(row); }} /> : <PpePeople people={people} expanded={expanded} onExpand={togglePerson} onItem={onItem} canEdit={Boolean(report?.canEdit)} limit={limit} onMore={more} />}
    </div>
    <footer className="ppe-no-print flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-400"><span>Issued totals match required sizes. Warehouse stock is separate.</span><div className="flex items-center gap-3">{report ? <span>Updated {new Date(report.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> : null}<Link className="font-semibold text-slate-500 hover:text-blue-700 focus-visible:underline" href="/assets/equipment/inventory">Open PPE Stock →</Link></div></footer>

    <div className="ppe-print hidden print:block"><h1>PPE Register — TTTracker People</h1><p>Generated {report ? new Date(report.generatedAt).toLocaleString() : ""}</p><p>Filters: {filterDescription} · View: {tab}</p><table><thead><tr>{["Employee", "Crew", "PPE Item", "Size", "Required", "Issued", "Outstanding", "Missing"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={`${row.employee_id}:${row.ppe_type_id}`}><td>{row.full_name} {row.payroll_id}</td><td>{row.crew_label}</td><td>{row.item_name}</td><td>{row.size_label}</td><td>{row.required_quantity}</td><td>{row.issued_quantity}</td><td>{row.outstanding_quantity ?? "Not tracked"}</td><td>{row.missing.join("; ")}</td></tr>)}</tbody></table></div>
    {editor ? <PpeRegisterEditor key={`${editor.line.employee_id}:${editor.line.ppe_type_id}`} {...editor} /> : null}
  </section>;
}

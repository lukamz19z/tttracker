"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, ChevronRight, ClipboardCheck, Package, UserRound } from "lucide-react";
import { summarisePpe, type PpeLine, type PpeSummary, type PpeType } from "@/lib/people/ppe";

export const ppeButton = "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:pointer-events-none disabled:opacity-50";
export const ppePrimary = `${ppeButton} !border-slate-950 !bg-slate-950 !text-white hover:!bg-slate-800`;
export const ppeInput = "h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500";

export function PpePill({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "amber" }) {
  const colour = tone === "green" ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70" : tone === "amber" ? "bg-amber-50 text-amber-800 ring-amber-200/70" : "bg-slate-100 text-slate-600 ring-slate-200/70";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold leading-4 ring-1 ring-inset ${colour}`}>{children}</span>;
}

export const ppeDetailProblems = (row: PpeLine) => row.missing;
export function personPpeStatus(rows: PpeLine[]) {
  return rows.some(row => !row.details_complete) ? { label: "Missing details", tone: "amber" as const } : { label: "Complete", tone: "green" as const };
}

export function PpeMetric({ label, value, detail, icon, loading }: { label: string; value: number; detail: string; icon: ReactNode; loading: boolean }) {
  return <div className="flex min-w-0 items-start justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
    <div><p className="text-xs font-semibold text-slate-500">{label}</p>{loading ? <div className="my-1 h-7 w-12 animate-pulse rounded bg-slate-100" /> : <p className="mt-0.5 text-2xl font-black tabular-nums tracking-tight text-slate-950">{value.toLocaleString()}</p>}<p className="mt-0.5 text-[11px] text-slate-500">{detail}</p></div>
    <div className="rounded-xl bg-slate-50 p-2 text-slate-500">{icon}</div>
  </div>;
}

export function PpeLoading() {
  return <div role="status" aria-label="Loading PPE register" className="grid animate-pulse gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(key => <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="h-4 w-32 rounded bg-slate-100" /><div className="mt-2 h-3 w-44 rounded bg-slate-100" /><div className="mt-5 grid grid-cols-4 gap-2">{[0, 1, 2, 3].map(size => <div className="h-16 rounded-xl bg-slate-100" key={size} />)}</div></div>)}<span className="sr-only">Loading PPE register</span></div>;
}

export function PpeEmpty({ title, description, onReset }: { title: string; description: string; onReset: () => void }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center"><div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-500"><ClipboardCheck size={22} /></div><h3 className="text-sm font-bold text-slate-900">{title}</h3><p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{description}</p><button type="button" className={`${ppeButton} mt-4`} onClick={onReset}>Clear filters</button></div>;
}

export function PpeCategories({ lines, definitions, onSize }: {
  lines: PpeLine[]; definitions: PpeType[]; onSize: (row: PpeSummary) => void;
}) {
  const summaries = summarisePpe(lines, definitions);
  return <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">{definitions.filter(type => type.active).map(type => {
    const rows = lines.filter(row => row.ppe_type_id === type.id);
    if (!rows.length) return null;
    const recorded = rows.filter(row => row.size_value?.trim()).length;
    const missing = rows.filter(row => row.missing.length).length;
    return <section key={type.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3"><div className="rounded-xl bg-slate-50 p-2 text-slate-500"><Package size={18} /></div><div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-slate-950">{type.name}</h3><p className="mt-1 text-xs text-slate-500">{recorded} recorded · {missing} missing</p></div></div>
      <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4">{summaries.filter(row => row.ppe_type_id === type.id).map(size => <button type="button" key={size.key} onClick={() => onSize(size)} aria-label={`${type.name}, ${size.size}: show ${size.people} contributing people`} className={`min-h-16 min-w-0 rounded-xl border px-2 py-2.5 text-center transition hover:border-blue-300 hover:bg-blue-50/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${size.size === "Not recorded" ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-slate-50/50"}`}><span className="block break-words text-sm font-extrabold text-slate-900">{size.size}</span><span className="mt-1 block text-[11px] text-slate-500">{size.people} {size.people === 1 ? "person" : "people"}</span></button>)}</div>
      {missing ? <div className="border-t border-slate-100 px-4 py-2"><PpePill tone="amber">Missing size: {missing}</PpePill></div> : null}
    </section>;
  })}</div>;
}

export function PpePeople({ people, expanded, onExpand, onItem, canEdit, limit, onMore }: {
  people: PpeLine[][]; expanded: Set<string>; onExpand: (id: string) => void; onItem: (row: PpeLine) => void; canEdit: boolean; limit: number; onMore: () => void;
}) {
  const columns = "lg:grid lg:grid-cols-[minmax(150px,1.5fr)_minmax(100px,1fr)_minmax(180px,2fr)_130px_100px]";
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className={`${columns} hidden gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold text-slate-500`}><span>Employee</span><span>Crew</span><span>PPE Details</span><span>Missing Details</span><span className="text-right">Actions</span></div>
    <div className="divide-y divide-slate-100">{people.slice(0, limit).map(rows => {
      const person = rows[0], open = expanded.has(person.employee_id), status = personPpeStatus(rows);
      return <Fragment key={person.employee_id}>
        <div className={`${columns} gap-3 px-4 py-3 transition hover:bg-slate-50/70`}>
          <div className="flex min-w-0 items-center gap-2.5"><div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><UserRound size={16} /></div><div className="min-w-0"><Link href={`/people/${person.employee_id}`} className="break-words text-sm font-bold text-slate-950 hover:text-blue-700">{person.full_name}</Link><p className="mt-1 text-xs text-slate-500">{person.payroll_id || "No employee number"}{person.active === false ? " · Inactive" : ""}<span className="lg:hidden"> · {person.crew_label}</span></p></div></div>
          <p className="hidden self-center break-words text-xs text-slate-600 lg:block">{person.crew_label}</p>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5 self-center lg:mt-0">{rows.slice(0, 3).map(row => <span key={row.ppe_type_id} className={`rounded-md px-1.5 py-1 text-[11px] ${row.missing.length ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{row.item_name} <strong>{row.size_label}</strong></span>)}{rows.length > 3 ? <button type="button" onClick={() => onExpand(person.employee_id)} className="rounded-md px-1.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-50">+{rows.length - 3} more</button> : null}</div>
          <div className="mt-3 self-center lg:mt-0"><PpePill tone={status.tone}>{status.label === "Complete" ? <Check size={11} /> : null}{status.label}</PpePill></div>
          <div className="mt-3 self-center text-right lg:mt-0"><button type="button" aria-expanded={open} aria-controls={`ppe-person-${person.employee_id}`} onClick={() => onExpand(person.employee_id)} className={`${ppeButton} w-full !px-2 !text-xs lg:w-auto`}>{open ? "Hide PPE" : "View PPE"}{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button></div>
        </div>
        {open ? <div id={`ppe-person-${person.employee_id}`} className="border-t border-slate-100 bg-slate-50/70 p-3 sm:px-4"><div className="grid gap-2 xl:grid-cols-2">{rows.map(row => <div key={row.ppe_type_id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"><div><h4 className="text-sm font-bold text-slate-900">{row.item_name}</h4><p className="mt-1 text-sm text-slate-600">{row.size_label}</p>{row.missing.length ? <div className="mt-2"><PpePill tone="amber">Size not recorded</PpePill></div> : null}</div>{canEdit ? <button type="button" className="inline-flex min-h-10 shrink-0 items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900 focus-visible:underline" onClick={() => onItem(row)}>Edit PPE<ArrowRight size={13} /></button> : null}</div>)}</div></div> : null}
      </Fragment>;
    })}</div>
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-xs text-slate-500"><span>Showing {Math.min(limit, people.length)} of {people.length} people</span>{people.length > limit ? <button type="button" className="font-bold text-blue-700 hover:underline" onClick={onMore}>Show more people</button> : null}</div>
  </div>;
}

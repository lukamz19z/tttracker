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

// Details come from the canonical server's missing messages; issue shortfalls
// remain separate from sizing problems in the presentation, not recalculated.
export const ppeDetailProblems = (row: PpeLine) => row.missing.filter(message => !message.includes("outstanding"));
export const ppeOutstanding = (rows: PpeLine[]) => rows.reduce((sum, row) => sum + (row.outstanding_quantity ?? 0), 0);

export function personPpeStatus(rows: PpeLine[]) {
  if (rows.some(row => ppeDetailProblems(row).length)) return { label: "Missing details", tone: "amber" as const };
  if (ppeOutstanding(rows)) return { label: "Outstanding", tone: "amber" as const };
  if (rows.every(row => row.required_quantity === 0)) return { label: "Not required", tone: "slate" as const };
  if (rows.some(row => row.outstanding_quantity === null && row.required_quantity > 0)) return { label: "Sizes recorded", tone: "slate" as const };
  return { label: "Complete", tone: "green" as const };
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

export function PpeCategories({ lines, definitions, outstandingOnly = false, onSize }: {
  lines: PpeLine[]; definitions: PpeType[]; outstandingOnly?: boolean; onSize: (row: PpeSummary) => void;
}) {
  const summaries = summarisePpe(lines, definitions);
  const groups = definitions.filter(type => type.active).map(type => ({
    type,
    rows: lines.filter(row => row.ppe_type_id === type.id),
    sizes: summaries.filter(row => row.ppe_type_id === type.id),
  })).filter(group => group.rows.length);
  return <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">{groups.map(({ type, rows, sizes }) => {
    const requiredPeople = new Set(rows.filter(row => row.required_quantity > 0).map(row => row.employee_id)).size;
    const missingSize = rows.filter(row => row.required_quantity > 0 && type.requires_size && !row.size_value).length;
    const outstanding = ppeOutstanding(rows);
    return <section key={type.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3"><div className="rounded-xl bg-slate-50 p-2 text-slate-500"><Package size={18} /></div><div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-slate-950">{type.name}</h3><p className="mt-0.5 text-xs text-slate-500">{requiredPeople} {requiredPeople === 1 ? "person" : "people"} requiring this item</p></div>{outstanding ? <PpePill tone="amber">{outstanding} outstanding</PpePill> : <PpePill tone={type.issue_tracking ? "green" : "slate"}>{type.issue_tracking ? "Up to date" : "Sizing only"}</PpePill>}</div>
      <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4">{sizes.map(size => <button type="button" key={size.key} onClick={() => onSize(size)} aria-label={`${type.name}, ${size.size}: show ${size.people} contributing people`} className={`group min-h-16 min-w-0 rounded-xl border px-2 py-2.5 text-center transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${size.size === "Not recorded" ? "border-amber-200 bg-amber-50/50 hover:bg-amber-50" : "border-slate-200 bg-slate-50/50 hover:border-blue-300 hover:bg-blue-50/60"}`}>
        <span className="block break-words text-sm font-extrabold text-slate-900">{size.size}</span><span className="mt-1 block text-[11px] font-medium text-slate-500">{outstandingOnly ? `${size.outstanding ?? 0} outstanding` : `${size.people} ${size.people === 1 ? "person" : "people"}`}</span>{!outstandingOnly && size.required > 0 ? <span className="mt-0.5 block text-[10px] text-slate-400">{size.required} required</span> : null}
      </button>)}</div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-xs text-slate-500"><span>{rows.reduce((sum, row) => sum + row.required_quantity, 0)} required · {rows.reduce((sum, row) => sum + row.issued_quantity, 0)} issued</span>{missingSize ? <PpePill tone="amber">Missing size: {missingSize}</PpePill> : <span>{type.requires_size ? "Sizes recorded" : "No size required"}</span>}</div>
    </section>;
  })}</div>;
}

export function PpePeople({ people, expanded, onExpand, onItem, canEdit, limit, onMore }: {
  people: PpeLine[][]; expanded: Set<string>; onExpand: (id: string) => void; onItem: (row: PpeLine) => void; canEdit: boolean; limit: number; onMore: () => void;
}) {
  const columns = "lg:grid lg:grid-cols-[minmax(150px,1.7fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(160px,1.8fr)_90px_100px]";
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className={`${columns} hidden gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold text-slate-500`}><span>Employee</span><span>Crew</span><span>PPE status</span><span>Sizes</span><span>Outstanding</span><span className="text-right">Actions</span></div>
    <div className="divide-y divide-slate-100">{people.slice(0, limit).map(rows => {
      const person = rows[0], open = expanded.has(person.employee_id), status = personPpeStatus(rows), outstanding = ppeOutstanding(rows);
      const sized = rows.filter(row => row.size_value || row.required_quantity > 0);
      return <Fragment key={person.employee_id}>
        <div className={`${columns} gap-3 px-4 py-3 transition hover:bg-slate-50/70`}>
          <div className="flex min-w-0 items-center gap-2.5"><div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-600" aria-hidden="true">{person.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("") || <UserRound size={16} />}</div><div className="min-w-0"><Link href={`/people/${person.employee_id}`} className="break-words text-sm font-bold text-slate-950 transition hover:text-blue-700 focus-visible:outline-none focus-visible:underline">{person.full_name}</Link><p className="mt-0.5 text-xs text-slate-500">{person.payroll_id || "No employee number"}{person.active === false ? " · Inactive" : ""}<span className="lg:hidden"> · {person.crew_label}</span></p></div></div>
          <p className="hidden self-center break-words text-xs text-slate-600 lg:block">{person.crew_label}</p>
          <div className="mt-3 flex items-center gap-2 self-center lg:mt-0"><PpePill tone={status.tone}>{status.label === "Complete" ? <Check size={11} /> : null}{status.label}</PpePill>{person.active === false ? <span className="lg:hidden"><PpePill>Inactive</PpePill></span> : null}</div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 self-center lg:mt-0">{sized.slice(0, 3).map(row => <span key={row.ppe_type_id} className={`rounded-md px-1.5 py-1 text-[11px] ${row.size_label === "Not recorded" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{row.item_name} <strong>{row.size_label === "Not recorded" ? "—" : row.size_label}</strong></span>)}{sized.length > 3 ? <button type="button" onClick={() => onExpand(person.employee_id)} className="rounded-md px-1.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-200">+{sized.length - 3} more</button> : null}</div>
          <div className="mt-3 flex items-center gap-2 self-center lg:mt-0"><span className="text-xs text-slate-500 lg:hidden">Outstanding</span><span className={`text-sm font-bold tabular-nums ${outstanding ? "text-amber-800" : "text-slate-400"}`}>{outstanding ? `${outstanding} ${outstanding === 1 ? "item" : "items"}` : "—"}</span></div>
          <div className="mt-3 self-center text-right lg:mt-0"><button type="button" aria-expanded={open} aria-controls={`ppe-person-${person.employee_id}`} onClick={() => onExpand(person.employee_id)} className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 lg:h-9 lg:w-auto">{open ? "Hide PPE" : "View PPE"}{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button></div>
        </div>
        {open ? <div id={`ppe-person-${person.employee_id}`} className="border-t border-slate-100 bg-slate-50/70 p-3 sm:px-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-600"><Package size={14} />PPE requirements & recorded issues</div>
          <div className="grid gap-2 xl:grid-cols-2">{rows.map(row => <div key={row.ppe_type_id} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-bold text-slate-900">{row.item_name}</h4><p className="mt-0.5 text-xs text-slate-500">{row.size_label}</p></div>{row.size_label === "Not recorded" && row.required_quantity > 0 ? <PpePill tone="amber">Missing size</PpePill> : !row.missing.length && row.outstanding_quantity !== null ? <PpePill tone="green">{row.required_quantity ? "Complete" : "Not required"}</PpePill> : null}</div><div className="my-3 grid grid-cols-3 divide-x divide-slate-100 rounded-lg bg-slate-50 py-2 text-center">{[["Required", row.required_quantity], ["Issued", row.issued_quantity], ["Outstanding", row.outstanding_quantity ?? "Not tracked"]].map(([label, value]) => <div key={label} className="px-1"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-0.5 text-sm font-bold tabular-nums text-slate-800">{value}</p></div>)}</div>{row.missing.length ? <ul className="mb-2 space-y-1 text-xs text-amber-800">{row.missing.map(message => <li key={message}>{message}</li>)}</ul> : null}<button type="button" className="inline-flex min-h-8 items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900 focus-visible:outline-none focus-visible:underline" onClick={() => onItem(row)}>{canEdit ? "Edit PPE / Record issue" : "View issue history"}<ArrowRight size={13} /></button></div>)}</div>
        </div> : null}
      </Fragment>;
    })}</div>
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-xs text-slate-500"><span>Showing {Math.min(limit, people.length)} of {people.length} people</span>{people.length > limit ? <button type="button" className="font-bold text-blue-700 hover:underline" onClick={onMore}>Show more people</button> : null}</div>
  </div>;
}

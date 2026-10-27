"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Package, Undo2, X } from "lucide-react";
import type { PpeEvent, PpeLine, PpeType } from "@/lib/people/ppe";
import { PpePill, ppeButton, ppeInput, ppePrimary } from "./ppe-register-views";

export type PpeEditorProps = {
  line: PpeLine; definition?: PpeType; canEdit: boolean; saving: boolean;
  size: string; issuedSize: string; quantity: string; issueQty: string; date: string; notes: string;
  setSize: (value: string) => void; setIssuedSize: (value: string) => void; setQuantity: (value: string) => void; setIssueQty: (value: string) => void; setDate: (value: string) => void; setNotes: (value: string) => void;
  history: PpeEvent[]; historyBusy: boolean; historyError: string; error: string;
  save: () => void; record: (original?: PpeEvent, remaining?: number) => void; close: () => void;
};

export function PpeRegisterEditor(props: PpeEditorProps) {
  const { line, definition, canEdit, saving, size, issuedSize, quantity, issueQty, date, notes, setSize, setIssuedSize, setQuantity, setIssueQty, setDate, setNotes, history, historyBusy, historyError, error, save, record, close } = props;
  const [tab, setTab] = useState<"requirement" | "issue" | "history">(canEdit ? "requirement" : "history");
  const root = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) closeRef.current();
      if (event.key !== "Tab") return;
      const controls = root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKey); previousFocus?.focus(); };
  }, [saving]);
  const safeError = /supabase|relation |column |constraint |schema|sql|migration/i.test(error) ? "PPE changes could not be saved. Please retry." : error;
  const tabs = [{ value: "requirement", label: "Requirement" }, ...(definition?.issue_tracking && canEdit ? [{ value: "issue", label: "Issue PPE" }] : []), { value: "history", label: "Issue history" }];
  return <div className="ppe-no-print fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-sm sm:p-6" onClick={event => { if (event.target === event.currentTarget && !saving) close(); }}>
    <div ref={root} role="dialog" aria-modal="true" aria-labelledby="ppe-edit-title" className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><p className="text-xs font-semibold text-slate-500">{line.full_name}</p><h3 id="ppe-edit-title" className="mt-0.5 text-base font-black text-slate-950">{line.item_name}</h3></div><button ref={closeButton} type="button" aria-label="Close PPE details" disabled={saving} onClick={close} className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-100"><X size={18} /></button></header>
      <div className="flex gap-1 border-b border-slate-100 bg-slate-50/60 px-4 py-2">{tabs.map(item => <button type="button" key={item.value} disabled={saving} aria-pressed={tab === item.value} onClick={() => setTab(item.value as typeof tab)} className={`rounded-lg px-3 py-2 text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-blue-100 ${tab === item.value ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:bg-white/70"}`}>{item.label}</button>)}</div>
      <div className="space-y-4 overflow-y-auto p-5">
        {safeError ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{safeError}</div> : null}
        {tab === "requirement" ? <><div className="grid grid-cols-3 divide-x divide-slate-100 rounded-xl bg-slate-50 py-3 text-center">{[["Required", line.required_quantity], ["Issued", line.issued_quantity], ["Outstanding", line.outstanding_quantity ?? "Not tracked"]].map(([label, value]) => <div key={label}><p className="text-[10px] text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-slate-900">{value}</p></div>)}</div>{canEdit ? <div className="grid grid-cols-2 gap-3"><label className="space-y-1.5 text-xs font-bold text-slate-600"><span>{definition?.requires_size ? "Required size" : "No size required"}</span><input className={ppeInput} disabled={!definition?.requires_size || saving} list="ppe-size-options" value={size} onChange={event => setSize(event.target.value)} placeholder="Select or enter size" /><datalist id="ppe-size-options">{definition?.size_options.map(value => <option key={value} value={value} />)}</datalist></label><label className="space-y-1.5 text-xs font-bold text-slate-600"><span>Required quantity</span><input type="number" min="0" max="1000" disabled={saving} className={ppeInput} value={quantity} placeholder={String(line.required_quantity)} onChange={event => setQuantity(event.target.value)} /></label><p className="col-span-2 text-xs text-slate-500">Leave quantity blank to use the configured default. Saving updates the employee’s PPE record.</p></div> : <p className="text-sm text-slate-600">{line.size_label}</p>}</> : null}
        {tab === "issue" ? <><p className="text-xs leading-5 text-slate-500">Record an actual issue. This does not change the required size or warehouse stock.</p><div className="grid grid-cols-2 gap-3"><label className="space-y-1.5 text-xs font-bold text-slate-600"><span>Issued size</span><input className={ppeInput} list="ppe-issued-options" disabled={!definition?.requires_size || saving} value={issuedSize} onChange={event => setIssuedSize(event.target.value)} /><datalist id="ppe-issued-options">{definition?.size_options.map(value => <option key={value} value={value} />)}</datalist></label><label className="space-y-1.5 text-xs font-bold text-slate-600"><span>Quantity</span><input type="number" min="1" max="1000" disabled={saving} className={ppeInput} value={issueQty} onChange={event => setIssueQty(event.target.value)} /></label><label className="col-span-2 space-y-1.5 text-xs font-bold text-slate-600"><span>Issue date</span><input type="date" disabled={saving} className={ppeInput} value={date} onChange={event => setDate(event.target.value)} /></label><label className="col-span-2 space-y-1.5 text-xs font-bold text-slate-600"><span>Notes <span className="font-normal text-slate-400">(optional)</span></span><textarea disabled={saving} className={`${ppeInput} !h-20 resize-y py-2`} placeholder="Collection or issue notes" value={notes} onChange={event => setNotes(event.target.value)} /></label></div></> : null}
        {tab === "history" ? historyBusy ? <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500"><Loader2 size={17} className="animate-spin" />Loading issue history</div> : historyError ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Issue history could not be loaded. Close and reopen this panel to retry.</p> : !history.some(row => row.ppe_type_id === line.ppe_type_id) ? <div className="py-6 text-center"><Package size={24} className="mx-auto mb-2 text-slate-300" /><p className="text-sm font-semibold text-slate-700">No issues recorded yet.</p><p className="mt-1 text-xs text-slate-500">Actual issues and returns will appear here.</p></div> : <div className="space-y-2">{history.filter(row => row.ppe_type_id === line.ppe_type_id).map(row => {
          const remaining = row.quantity - history.filter(event => event.related_issue_id === row.id).reduce((sum, event) => sum + event.quantity, 0);
          return <div key={row.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div><PpePill tone={row.event_type === "issued" ? "green" : "slate"}>{row.event_type === "issued" ? "Issued" : "Returned"}</PpePill><p className="mt-2 text-xs font-semibold text-slate-700">{row.size_value || "No size required"} · Qty {row.quantity}</p><p className="mt-1 text-[11px] text-slate-400">{new Date(row.issued_at).toLocaleDateString()}</p></div>{row.event_type === "issued" && remaining > 0 && canEdit ? <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50" disabled={saving} onClick={() => { if (window.confirm(`Return the remaining ${remaining} ${line.item_name}?`)) record(row, remaining); }}><Undo2 size={12} />Return {remaining}</button> : null}</div>{row.notes ? <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-500">{row.notes}</p> : null}</div>;
        })}<p className="text-[10px] text-slate-400">Latest 500 events for this employee. Register totals use the complete history.</p></div> : null}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3"><button type="button" className={ppeButton} disabled={saving} onClick={close}>{canEdit && tab !== "history" ? "Cancel" : "Close"}</button>{canEdit && tab !== "history" ? <button type="button" className={ppePrimary} disabled={saving} onClick={tab === "issue" ? () => record() : save}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{saving ? "Saving…" : tab === "issue" ? "Record issue" : "Save PPE"}</button> : null}</footer>
    </div>
  </div>;
}

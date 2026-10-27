"use client";

import { useEffect, useRef } from "react";
import { Check, Loader2, X } from "lucide-react";
import type { PpeLine, PpeType } from "@/lib/people/ppe";
import { ppeButton, ppeInput, ppePrimary } from "./ppe-register-views";

export type PpeEditorProps = {
  line: PpeLine; definition?: PpeType; canEdit: boolean; saving: boolean;
  size: string; setSize: (value: string) => void; error: string;
  save: () => void; close: () => void;
};

export function PpeRegisterEditor(props: PpeEditorProps) {
  const { line, definition, canEdit, saving, size, setSize, error, save, close } = props;
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
  return <div className="ppe-no-print fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-sm sm:p-6" onClick={event => { if (event.target === event.currentTarget && !saving) close(); }}>
    <div ref={root} role="dialog" aria-modal="true" aria-labelledby="ppe-edit-title" className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><p className="text-xs font-semibold text-slate-500">{line.full_name}</p><h3 id="ppe-edit-title" className="mt-0.5 text-base font-black text-slate-950">{line.item_name}</h3></div><button ref={closeButton} type="button" aria-label="Close PPE details" disabled={saving} onClick={close} className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-100"><X size={18} /></button></header>
      <div className="space-y-4 overflow-y-auto p-5">
        {safeError ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{safeError}</div> : null}
        {canEdit ? <label className="block space-y-2 text-xs font-bold text-slate-600"><span>Size / value</span><input className={ppeInput} disabled={saving} list="ppe-size-options" value={size} onChange={event => setSize(event.target.value)} placeholder="Not recorded" /><datalist id="ppe-size-options">{definition?.size_options.map(value => <option key={value} value={value} />)}</datalist><span className="block font-normal text-slate-500">Updates the employee’s existing PPE sizing record.</span></label> : <p className="text-sm text-slate-600">{line.size_label}</p>}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3"><button type="button" className={ppeButton} disabled={saving} onClick={close}>{canEdit ? "Cancel" : "Close"}</button>{canEdit ? <button type="button" className={ppePrimary} disabled={saving} onClick={save}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{saving ? "Saving…" : "Save PPE"}</button> : null}</footer>
    </div>
  </div>;
}

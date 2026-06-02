"use client";

import { Eye, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

function notify(message: string) {
  window.alert(message);
}

export function ModeToggle({ label = "Register mode" }: { label?: string }) {
  const [mode, setMode] = useState<"view" | "edit">("view");

  return (
    <div className="inline-flex items-center border border-slate-200 bg-white p-1">
      <span className="px-2 text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setMode("view")}
        className={`min-h-9 px-3 text-sm font-semibold transition ${
          mode === "view"
            ? "bg-slate-950 text-white"
            : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        View
      </button>
      <button
        type="button"
        onClick={() => setMode("edit")}
        className={`min-h-9 px-3 text-sm font-semibold transition ${
          mode === "edit"
            ? "bg-slate-950 text-white"
            : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        Edit
      </button>
    </div>
  );
}

export function RecordActions({
  recordType,
  recordLabel,
}: {
  recordType: string;
  recordLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => notify(`View ${recordType}: ${recordLabel}`)}
        className="inline-flex min-h-9 items-center gap-1.5 border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Eye size={14} />
        View
      </button>
      <button
        type="button"
        onClick={() => notify(`Edit ${recordType}: ${recordLabel}`)}
        className="inline-flex min-h-9 items-center gap-1.5 border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Pencil size={14} />
        Edit
      </button>
      <button
        type="button"
        onClick={() => {
          const confirmed = window.confirm(
            `Archive ${recordType}: ${recordLabel}? This will be wired as an archive action before real data goes live.`,
          );
          if (confirmed) notify(`${recordLabel} marked for archive workflow.`);
        }}
        className="inline-flex min-h-9 items-center gap-1.5 border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
      >
        <Trash2 size={14} />
        Delete
      </button>
    </div>
  );
}

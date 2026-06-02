"use client";

import { Eye, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";

export function RecordActions({
  recordType,
  recordLabel,
  viewHref,
  editHref,
}: {
  recordType: string;
  recordLabel: string;
  viewHref: string;
  editHref: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={viewHref}
        className="inline-flex min-h-9 items-center gap-1.5 border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Eye size={14} />
        View
      </Link>
      <Link
        href={editHref}
        className="inline-flex min-h-9 items-center gap-1.5 border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Pencil size={14} />
        Edit
      </Link>
      <button
        type="button"
        onClick={() => {
          window.confirm(
            `Archive ${recordType}: ${recordLabel}? This will become an archive/remove action once the database is wired.`,
          );
        }}
        className="inline-flex min-h-9 items-center gap-1.5 border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
      >
        <Trash2 size={14} />
        Delete
      </button>
    </div>
  );
}

"use client";

import { useParams } from "next/navigation";

export default function DayworksPage() {
  const params = useParams();

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Dayworks
        </h1>

        <p className="mt-2 text-slate-600">
          Commercial dayworks register for labour, plant, materials and additional works.
        </p>

        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8">
          <p className="text-slate-500">
            No dayworks created yet.
          </p>
        </div>

      </div>
    </div>
  );
}
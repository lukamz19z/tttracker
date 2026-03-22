"use client";

import Link from "next/link";

export default function TowerHeader({
  projectId,
  tower,
  latestDate,
}: any) {
  return (
    <div className="bg-white border rounded-2xl p-6 mb-6">
      <div className="flex justify-between">
        <div>
          <div className="text-sm text-slate-500">Tower</div>
          <div className="text-3xl font-bold">{tower.name}</div>
          <div className="text-slate-600 mt-1">
            Line: {tower.line || "-"}
          </div>
        </div>

        <div className="flex gap-3">
          <div className="bg-slate-100 rounded-xl px-4 py-3">
            <div className="text-xs text-slate-500">Status</div>
            <div className="font-semibold">{tower.status}</div>
          </div>

          <div className="bg-slate-100 rounded-xl px-4 py-3">
            <div className="text-xs text-slate-500">Progress</div>
            <div className="font-semibold">{tower.progress || 0}%</div>
          </div>

          <div className="bg-slate-100 rounded-xl px-4 py-3">
            <div className="text-xs text-slate-500">Last Docket</div>
            <div className="font-semibold">
              {latestDate || "-"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex gap-3">
        <Link
          href={`/project/${projectId}/tower/${tower.id}/dockets/new`}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          Add Daily Docket
        </Link>

        <button className="bg-slate-900 text-white px-4 py-2 rounded-lg">
          Open Workpack
        </button>

        <button className="border px-4 py-2 rounded-lg">
          Upload Photo Later
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b mt-6 flex gap-2">
        <Link
          href={`/project/${projectId}/tower/${tower.id}`}
          className="px-4 py-2 bg-slate-100 border rounded-t-lg"
        >
          Overview
        </Link>

        <Link
          href={`/project/${projectId}/tower/${tower.id}/dockets`}
          className="px-4 py-2 bg-white border rounded-t-lg font-semibold"
        >
          Daily Dockets
        </Link>
      </div>
    </div>
  );
}
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function TowerHeader({
  projectId,
  tower,
  latestDate,
}: any) {
  const pathname = usePathname();

  function tabStyle(href: string) {
    return `px-4 py-2 border rounded-t-lg ${
      pathname === href
        ? "bg-white font-semibold"
        : "bg-slate-100"
    }`;
  }

  return (
    <div className="bg-white border rounded-2xl p-6 mb-6">

      {/* TOP INFO */}
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
            <div className="font-semibold">
              {tower.progress || 0}%
            </div>
          </div>

          <div className="bg-slate-100 rounded-xl px-4 py-3">
            <div className="text-xs text-slate-500">Last Docket</div>
            <div className="font-semibold">
              {latestDate || "-"}
            </div>
          </div>
        </div>
      </div>

      {/* ACTION BUTTONS */}
      <div className="mt-5 flex gap-3">
        <Link
          href={`/project/${projectId}/tower/${tower.id}/dockets/new`}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          Add Daily Docket
        </Link>

        <Link
          href={`/project/${projectId}/tower/${tower.id}/workpack`}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg"
        >
          Open Workpack
        </Link>

        <button className="border px-4 py-2 rounded-lg">
          Upload Photo
        </button>
      </div>

      {/* MAIN TOWER TABS */}
      <div className="border-b mt-6 flex gap-2 flex-wrap">

        <Link
          href={`/project/${projectId}/tower/${tower.id}`}
          className={tabStyle(
            `/project/${projectId}/tower/${tower.id}`
          )}
        >
          Overview
        </Link>

        <Link
          href={`/project/${projectId}/tower/${tower.id}/dockets`}
          className={tabStyle(
            `/project/${projectId}/tower/${tower.id}/dockets`
          )}
        >
          Daily Dockets
        </Link>

        <Link
          href={`/project/${projectId}/tower/${tower.id}/workpack`}
          className={tabStyle(
            `/project/${projectId}/tower/${tower.id}/workpack`
          )}
        >
          Workpack
        </Link>

        <Link
          href={`/project/${projectId}/tower/${tower.id}/modifications`}
          className={tabStyle(
            `/project/${projectId}/tower/${tower.id}/modifications`
          )}
        >
          Modifications
        </Link>

        <Link
          href={`/project/${projectId}/tower/${tower.id}/defects`}
          className={tabStyle(
            `/project/${projectId}/tower/${tower.id}/defects`
          )}
        >
          Defects
        </Link>

        <Link
          href={`/project/${projectId}/tower/${tower.id}/deliveries`}
          className={tabStyle(
            `/project/${projectId}/tower/${tower.id}/deliveries`
          )}
        >
          Deliveries
        </Link>

        <Link
          href={`/project/${projectId}/tower/${tower.id}/photos`}
          className={tabStyle(
            `/project/${projectId}/tower/${tower.id}/photos`
          )}
        >
          Photos
        </Link>

      </div>

    </div>
  );
}
"use client";

import { useState } from "react";
import Link from "next/link";

type Tower = {
  id: string;
  name: string;
  line: string;
  status: "Not Started" | "In Progress" | "Complete" | "Defect";
  progress: number;
};

export default function TowersPage({
  params,
}: {
  params: { projectId: string };
}) {
  const projectId = params.projectId;

  // ⭐ MOCK DATA (Replace with Supabase later)
  const [towers] = useState<Tower[]>([
    { id: "T001", name: "Tower 001", line: "North", status: "Complete", progress: 100 },
    { id: "T002", name: "Tower 002", line: "North", status: "In Progress", progress: 60 },
    { id: "T003", name: "Tower 003", line: "South", status: "Not Started", progress: 0 },
    { id: "T004", name: "Tower 004", line: "South", status: "Defect", progress: 85 },
  ]);

  const [search, setSearch] = useState("");
  const [filterLine, setFilterLine] = useState("All");

  const lines = ["All", ...Array.from(new Set(towers.map((t) => t.line)))];

  const filtered = towers.filter((t) => {
    return (
      t.name.toLowerCase().includes(search.toLowerCase()) &&
      (filterLine === "All" || t.line === filterLine)
    );
  });

  const total = towers.length;
  const complete = towers.filter((t) => t.status === "Complete").length;
  const progress =
    total === 0
      ? 0
      : Math.round(
          towers.reduce((acc, t) => acc + t.progress, 0) / total
        );

  return (
    <div className="p-8 w-full">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Towers</h1>
          <p className="text-slate-500">
            Manage tower construction progress and inspections
          </p>
        </div>

        <Link
          href={`/project/${projectId}/towers/import`}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700"
        >
          Import Towers
        </Link>
      </div>

      {/* STATS */}
      <div className="grid md:grid-cols-4 gap-4 mb-8">
        <Stat title="Total Towers" value={total} />
        <Stat title="Completed" value={complete} />
        <Stat title="Avg Progress" value={`${progress}%`} />
        <Stat title="Active Lines" value={lines.length - 1} />
      </div>

      {/* SEARCH + FILTER */}
      <div className="flex gap-4 mb-6">
        <input
          className="border rounded-lg p-2 w-72"
          placeholder="Search tower..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="border rounded-lg p-2"
          value={filterLine}
          onChange={(e) => setFilterLine(e.target.value)}
        >
          {lines.map((line) => (
            <option key={line}>{line}</option>
          ))}
        </select>
      </div>

      {/* EMPTY */}
      {towers.length === 0 && (
        <div className="bg-white border rounded-xl p-14 text-center">
          <h2 className="text-xl font-semibold mb-2">
            No towers imported yet
          </h2>
          <p className="text-slate-500 mb-5">
            Import tower CSV to begin tracking progress and defects
          </p>

          <Link
            href={`/project/${projectId}/towers/import`}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
          >
            Import Towers
          </Link>
        </div>
      )}

      {/* TABLE */}
      {towers.length > 0 && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-100 text-left text-sm">
              <tr>
                <th className="p-3">Tower</th>
                <th className="p-3">Line</th>
                <th className="p-3">Status</th>
                <th className="p-3">Progress</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((tower) => (
                <tr key={tower.id} className="border-t hover:bg-slate-50">
                  <td className="p-3 font-medium">{tower.name}</td>
                  <td className="p-3">{tower.line}</td>

                  <td className="p-3">
                    <StatusBadge status={tower.status} />
                  </td>

                  <td className="p-3 w-64">
                    <ProgressBar value={tower.progress} />
                  </td>

                  <td className="p-3">
                    <Link
                      href={`/project/${projectId}/tower/${tower.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* REUPLOAD */}
      {towers.length > 0 && (
        <div className="mt-6">
          <Link
            href={`/project/${projectId}/towers/import`}
            className="text-sm text-slate-500 hover:text-black"
          >
            Re-upload tower file
          </Link>
        </div>
      )}

    </div>
  );
}

function Stat({ title, value }: { title: string; value: any }) {
  return (
    <div className="bg-white border rounded-xl p-5">
      <p className="text-slate-500 text-sm">{title}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: any = {
    Complete: "bg-green-100 text-green-700",
    "In Progress": "bg-blue-100 text-blue-700",
    "Not Started": "bg-slate-200 text-slate-700",
    Defect: "bg-red-100 text-red-700",
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm ${colors[status]}`}>
      {status}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="bg-slate-200 rounded-full h-3 w-full">
      <div
        className="bg-blue-600 h-3 rounded-full"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
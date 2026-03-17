"use client";

import { useState } from "react";
import Link from "next/link";

type Tower = {
  id: string;
  name: string;
  line?: string;
  status?: string;
};

export default function TowersPage({
  params,
}: {
  params: { id: string };
}) {
  const projectId = params.id;

  // TEMP MOCK DATA — replace with Supabase later
  const [towers] = useState<Tower[]>([]);

  const [search, setSearch] = useState("");

  const filteredTowers = towers.filter((t) =>
    t.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 w-full">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Towers</h1>
          <p className="text-slate-500">
            View and manage tower assets for this project
          </p>
        </div>

        <Link
          href={`/project/${projectId}/towers/import`}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          Import Towers
        </Link>
      </div>

      {/* STATS */}
      <div className="flex gap-4 mb-6">
        <div className="bg-white border rounded-xl p-4 w-44">
          <p className="text-slate-500 text-sm">Total Towers</p>
          <p className="text-2xl font-bold">{towers.length}</p>
        </div>
      </div>

      {/* SEARCH */}
      {towers.length > 0 && (
        <input
          className="border rounded-lg p-2 mb-4 w-80"
          placeholder="Search tower name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {/* EMPTY STATE */}
      {towers.length === 0 && (
        <div className="bg-white border rounded-xl p-14 text-center">
          <h2 className="text-xl font-semibold mb-2">
            No towers imported yet
          </h2>
          <p className="text-slate-500 mb-5">
            Import a tower CSV file to begin tracking inspections,
            defects and progress.
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
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-3">Tower ID</th>
                <th className="p-3">Tower Name</th>
                <th className="p-3">Line</th>
                <th className="p-3">Status</th>
                <th className="p-3">Open</th>
              </tr>
            </thead>

            <tbody>
              {filteredTowers.map((tower) => (
                <tr
                  key={tower.id}
                  className="border-t hover:bg-slate-50"
                >
                  <td className="p-3">{tower.id}</td>
                  <td className="p-3">{tower.name}</td>
                  <td className="p-3">{tower.line || "-"}</td>
                  <td className="p-3">
                    {tower.status || "Pending"}
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
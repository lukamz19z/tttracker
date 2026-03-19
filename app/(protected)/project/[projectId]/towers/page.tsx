"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";

type Tower = {
  id: string;
  name: string;
  line?: string;
  status?: string;
  progress?: number;
};

export default function TowersPage({
  params,
}: {
  params: { projectId: string };
}) {
  const projectId = params.projectId;

  const [towers, setTowers] = useState<Tower[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

useEffect(() => {
  if (!projectId) return;
  loadTowers();
}, [projectId]);

async function loadTowers() {
  try {
    const supabase = createSupabaseBrowser();

    console.log("Loading towers for project:", projectId);

    const { data, error } = await supabase
      .from("towers")
      .select("*")
      .eq("project_id", projectId)
      .order("name");

    if (error) {
      console.error("Supabase error:", error);
      setLoading(false);
      return;
    }

    setTowers(data || []);
    setLoading(false);
  } catch (err) {
    console.error("Unexpected load error:", err);
    setLoading(false);
  }
}

  const filtered = towers.filter((t) =>
    t.name?.toLowerCase().includes(search.toLowerCase())
  );

if (loading) {
  return (
    <div className="p-8">
      <p className="text-lg font-semibold">Loading towers...</p>
      <p className="text-slate-500 text-sm">
        If this takes more than 3 seconds check console.
      </p>
    </div>
  );
}

  return (
    <div className="p-8 w-full">

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Towers</h1>
          <p className="text-slate-500">
            View and manage tower assets
          </p>
        </div>

        <Link
          href={`/project/${projectId}/towers/import`}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          Import Towers
        </Link>
      </div>

      {towers.length > 0 && (
        <input
          className="border rounded-lg p-2 mb-4 w-80"
          placeholder="Search tower..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {towers.length === 0 && (
        <div className="bg-white border rounded-xl p-14 text-center">
          <h2 className="text-xl font-semibold mb-2">
            No towers imported yet
          </h2>

          <Link
            href={`/project/${projectId}/towers/import`}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg"
          >
            Import Towers
          </Link>
        </div>
      )}

      {towers.length > 0 && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3">Tower</th>
                <th className="p-3">Line</th>
                <th className="p-3">Status</th>
                <th className="p-3">Progress</th>
                <th className="p-3">Open</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((tower) => (
                <tr key={tower.id} className="border-t">
                  <td className="p-3">{tower.name}</td>
                  <td className="p-3">{tower.line || "-"}</td>
                  <td className="p-3">{tower.status || "Not Started"}</td>
                  <td className="p-3">{tower.progress || 0}%</td>
                  <td className="p-3">
                    <Link
                      href={`/project/${projectId}/tower/${tower.id}`}
                      className="text-blue-600"
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

    </div>
  );
}
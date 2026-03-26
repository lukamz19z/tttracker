"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

export default function TowerDocketsPage() {
  const supabase = createSupabaseBrowser();
  const params = useParams();

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const [tower, setTower] = useState<any>(null);
  const [dockets, setDockets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const { data: towerData } = await supabase
      .from("towers")
      .select("*")
      .eq("id", towerId)
      .single();

    setTower(towerData);

    const { data } = await supabase
      .from("tower_daily_dockets")
      .select("*")
      .eq("tower_id", towerId)
      .order("docket_date", { ascending: false });

    setDockets(data || []);
    setLoading(false);
  }

  if (loading) return <div className="p-8">Loading dockets...</div>;

  return (
    <div className="p-8 space-y-6">

      <TowerHeader projectId={projectId} tower={tower} />

      <div className="bg-white border rounded-2xl p-6 shadow-sm">

        <div className="flex justify-between items-center mb-6">
          <div className="text-xl font-semibold">
            Daily Dockets Register
          </div>

          <Link
            href={`/project/${projectId}/tower/${towerId}/dockets/new`}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
          >
            Add Daily Docket
          </Link>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="text-left py-3">Date</th>
              <th className="text-left">Supervisor</th>
              <th className="text-left">Crew</th>
              <th className="text-left">Progress</th>
              <th className="text-left">Weather</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {dockets.map((d) => (
              <tr key={d.id} className="border-b hover:bg-slate-50">
                <td className="py-3">{d.docket_date}</td>
                <td>{d.supervisor}</td>
                <td>{d.crew_size}</td>
                <td className="font-semibold text-blue-600">
                  {d.progress}%
                </td>
                <td>{d.weather}</td>

                <td className="text-right space-x-2">
                  <Link
                    href={`/project/${projectId}/tower/${towerId}/dockets/${d.id}/edit`}
                    className="bg-blue-600 text-white px-3 py-1 rounded"
                  >
                    Edit
                  </Link>

                  <button
                    onClick={() => deleteDocket(d.id)}
                    className="bg-red-600 text-white px-3 py-1 rounded"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

      </div>
    </div>
  );

  async function deleteDocket(id: string) {
    const confirmDelete = confirm("Delete this docket?");
    if (!confirmDelete) return;

    await supabase
      .from("tower_daily_dockets")
      .delete()
      .eq("id", id);

    load();
  }
}
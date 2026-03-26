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
  const [openDocketId, setOpenDocketId] = useState<string | null>(null);

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

  async function deleteDocket(id: string) {
    const confirmDelete = confirm("Delete this docket?");
    if (!confirmDelete) return;

    await supabase
      .from("tower_daily_dockets")
      .delete()
      .eq("id", id);

    load();
  }

  function getProgress(d: any) {
    const a = Number(d.assembly_percent || 0);
    const e = Number(d.erection_percent || 0);
    return Math.round(a * 0.5 + e * 0.5);
  }

  function getProgressColor(progress: number) {
    if (progress >= 100) return "bg-emerald-500";
    if (progress >= 60) return "bg-blue-500";
    if (progress >= 30) return "bg-amber-500";
    return "bg-slate-400";
  }

  function getSignedBadge(d: any) {
    if (d.client_rep_name && d.signed_date) {
      return (
        <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-semibold">
          Client Signed
        </span>
      );
    }

    return (
      <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-semibold">
        Open
      </span>
    );
  }

  if (loading) return <div className="p-8">Loading Daily Dockets...</div>;

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

        {dockets.length === 0 && (
          <div className="text-center py-20 text-slate-400">
            No daily dockets added yet
          </div>
        )}

        <div className="space-y-4">
          {dockets.map((d) => {
            const progress = getProgress(d);
            const isOpen = openDocketId === d.id;

            return (
              <div
                key={d.id}
                onClick={() =>
                  setOpenDocketId(isOpen ? null : d.id)
                }
                className="border rounded-xl p-5 hover:bg-slate-50 transition cursor-pointer"
              >
                <div className="flex justify-between items-start">

                  <div className="space-y-2">

                    <div className="flex items-center gap-3">
                      <div className="text-lg font-semibold">
                        {d.docket_date}
                      </div>

                      {getSignedBadge(d)}
                    </div>

                    <div className="text-sm text-slate-500">
                      Supervisor: {d.leading_hand || "-"} | Crew: {d.crew || "-"}
                    </div>

                    <div className="text-sm text-slate-500">
                      Weather: {d.weather || "-"}
                    </div>

                  </div>

                  <div className="flex gap-2">
                    <Link
                      href={`/project/${projectId}/tower/${towerId}/dockets/${d.id}/edit`}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-blue-600 text-white px-3 py-1 rounded-lg text-sm"
                    >
                      Edit
                    </Link>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDocket(d.id);
                      }}
                      className="bg-red-600 text-white px-3 py-1 rounded-lg text-sm"
                    >
                      Delete
                    </button>
                  </div>

                </div>

                {/* 🔥 NEW MULTI PROGRESS BARS */}
                <div className="mt-4 space-y-2">

                  {/* OVERALL */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <div className="font-semibold text-slate-700">
                        Overall Progress
                      </div>
                      <div>{progress}%</div>
                    </div>

                    <div className="w-full bg-slate-200 rounded-full h-3">
                      <div
                        className={`${getProgressColor(progress)} h-3 rounded-full`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* ASSEMBLY */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <div>Assembly</div>
                      <div>{d.assembly_percent || 0}%</div>
                    </div>

                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${d.assembly_percent || 0}%` }}
                      />
                    </div>
                  </div>

                  {/* ERECTION */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <div>Erection</div>
                      <div>{d.erection_percent || 0}%</div>
                    </div>

                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-emerald-500 h-2 rounded-full"
                        style={{ width: `${d.erection_percent || 0}%` }}
                      />
                    </div>
                  </div>

                </div>

                {/* EXPANDED VIEW */}
                {isOpen && (
                  <div className="mt-6 border-t pt-4 space-y-4">

                    <div>
                      <div className="text-sm font-semibold mb-2">Delays</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>Weather: {d.weather_delay_hours || 0}h</div>
                        <div>Lightning: {d.lightning_delay_hours || 0}h</div>
                        <div>Toolbox: {d.toolbox_delay_hours || 0}h</div>
                        <div>Other: {d.other_delay_hours || 0}h</div>
                      </div>
                    </div>

                    {d.delays_comments && (
                      <div>
                        <div className="text-sm font-semibold mb-1">Comments</div>
                        <div className="text-sm text-slate-600">
                          {d.delays_comments}
                        </div>
                      </div>
                    )}

                    {d.missing_items_bolts && (
                      <div>
                        <div className="text-sm font-semibold mb-1">Missing Items</div>
                        <div className="text-sm text-slate-600">
                          {d.missing_items_bolts}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-sm font-semibold mb-1">Sign Off</div>
                      <div className="text-sm">
                        BC Rep: {d.bc_rep_name || "-"} <br />
                        Client Rep: {d.client_rep_name || "-"} <br />
                        Signed Date: {d.signed_date || "-"}
                      </div>
                    </div>

                    {d.docket_file_url && (
                      <a
                        href={d.docket_file_url}
                        target="_blank"
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-600 text-sm font-semibold"
                      >
                        View Uploaded Docket →
                      </a>
                    )}

                  </div>
                )}

              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
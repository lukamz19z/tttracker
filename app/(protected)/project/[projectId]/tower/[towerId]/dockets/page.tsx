"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type Docket = {
  id: string;
  docket_date: string;
  crew: string | null;
  leading_hand: string | null;
  assembly_percent: number;
  erection_percent: number;
  weather_delay_hours: number;
  missing_items_bolts: string | null;
  bc_rep_name: string | null;
  client_rep_name: string | null;
  signed_date: string | null;
  created_at: string;
};

type Tower = {
  id: string;
  name: string;
  line: string | null;
  status: string | null;
  progress: number | null;
};

function isClientSigned(d: Docket) {
  return Boolean(d.client_rep_name && d.signed_date);
}

function isBcSigned(d: Docket) {
  return Boolean(d.bc_rep_name);
}

export default function TowerDocketsPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const [tower, setTower] = useState<Tower | null>(null);
  const [dockets, setDockets] = useState<Docket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [towerId]);

  async function load() {
    setLoading(true);

    const { data: towerData } = await supabase
      .from("towers")
      .select("*")
      .eq("id", towerId)
      .single();

    const { data: docketData } = await supabase
      .from("tower_daily_dockets")
      .select("*")
      .eq("tower_id", towerId)
      .order("docket_date", { ascending: false });

    setTower(towerData);
    setDockets(docketData || []);
    setLoading(false);
  }

  const latestDate = useMemo(
    () => (dockets.length ? dockets[0].docket_date : null),
    [dockets]
  );

  if (loading || !tower) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 space-y-6">

      {/* ⭐ TOWER HEADER NOW ABOVE TABLE */}
      <TowerHeader
        projectId={projectId}
        tower={tower}
        latestDate={latestDate}
      />

      {/* TABLE CARD */}
      <div className="bg-white border rounded-2xl overflow-hidden">

        <table className="w-full">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-4">Status</th>
              <th className="p-4">Date</th>
              <th className="p-4">Leading Hand</th>
              <th className="p-4">BC Rep</th>
              <th className="p-4">Assembly</th>
              <th className="p-4">Erection</th>
              <th className="p-4">Weather Delay</th>
              <th className="p-4">Missing Steel</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>

          <tbody>
            {dockets.map((d, i) => {
              const clientSigned = isClientSigned(d);
              const bcSigned = isBcSigned(d);
              const latest = i === 0;

              return (
                <tr
                  key={d.id}
                  className={`border-t hover:bg-slate-50 ${
                    latest ? "bg-blue-50" : ""
                  }`}
                >
                  <td className="p-4">
                    <span
                      className={`px-3 py-1 rounded-lg text-sm font-semibold ${
                        clientSigned
                          ? "bg-emerald-100 text-emerald-700"
                          : bcSigned
                          ? "bg-blue-100 text-blue-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {clientSigned
                        ? "Client Signed"
                        : bcSigned
                        ? "BC Signed"
                        : "Draft"}
                    </span>
                  </td>

                  <td className="p-4 font-semibold">
                    {d.docket_date}
                    {latest && (
                      <span className="ml-2 text-xs text-blue-600">
                        (Latest)
                      </span>
                    )}
                  </td>

                  <td className="p-4">{d.leading_hand || "-"}</td>
                  <td className="p-4">{d.bc_rep_name || "-"}</td>
                  <td className="p-4">
                    <ProgressBar value={d.assembly_percent} />
                  </td>
                  <td className="p-4">
                    <ProgressBar value={d.erection_percent} />
                  </td>
                  <td className="p-4">
                    {d.weather_delay_hours
                      ? `${d.weather_delay_hours}h`
                      : "-"}
                  </td>
                  <td className="p-4">{d.missing_items_bolts || "-"}</td>
                  <td className="p-4">
                    <div className="flex gap-3">
                      <button
                        onClick={() =>
                          router.push(
                            `/project/${projectId}/tower/${towerId}/docket/${d.id}`
                          )
                        }
                        className="text-blue-600 font-semibold"
                      >
                        View
                      </button>

                      {clientSigned ? (
                        <span className="text-slate-400">Locked</span>
                      ) : (
                        <button
                          onClick={() =>
                            router.push(
                              `/project/${projectId}/tower/${towerId}/docket/${d.id}/edit`
                            )
                          }
                          className="text-amber-600 font-semibold"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {dockets.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-slate-500">
                  No dockets recorded yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-32">
      <div className="h-3 bg-slate-200 rounded-lg overflow-hidden">
        <div className="h-3 bg-blue-600" style={{ width: `${value || 0}%` }} />
      </div>
      <p className="text-xs mt-1">{value || 0}%</p>
    </div>
  );
}
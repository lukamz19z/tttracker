"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";

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

function isClientSigned(d: Docket) {
  return Boolean(d.client_rep_name?.trim() && d.signed_date?.trim());
}

function isBcSigned(d: Docket) {
  return Boolean(d.bc_rep_name?.trim());
}

export default function TowerDocketsPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const [dockets, setDockets] = useState<Docket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [towerId]);

  async function load() {
    setLoading(true);

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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Daily Dockets</h1>
          <p className="text-slate-500 text-sm">
            All recorded daily site dockets for this tower
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href={`/project/${projectId}/tower/${towerId}`}
            className="border px-5 py-3 rounded-xl"
          >
            Back to Tower
          </Link>

          <Link
            href={`/project/${projectId}/tower/${towerId}/dockets/new`}
            className="bg-blue-600 text-white px-5 py-3 rounded-xl"
          >
            Add Daily Docket
          </Link>
        </div>
      </div>

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
                      {clientSigned ? "Client Signed" : bcSigned ? "BC Signed" : "Draft"}
                    </span>
                  </td>

                  <td className="p-4 font-semibold">
                    {d.docket_date}
                    {latest && (
                      <span className="ml-2 text-xs text-blue-600">(Latest)</span>
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
                    {d.weather_delay_hours ? `${d.weather_delay_hours}h` : "-"}
                  </td>
                  <td className="p-4">{d.missing_items_bolts || "-"}</td>
                  <td className="p-4">
                    <div className="flex gap-3">
                      <button
                        type="button"
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
                          type="button"
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
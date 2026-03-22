"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";

export default function DocketViewPage() {
  const params = useParams();
  const supabase = createSupabaseBrowser();

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;
  const docketId = params.docketId as string;

  const [docket, setDocket] = useState<any>(null);
  const [labour, setLabour] = useState<any[]>([]);
  const [progress, setProgress] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const { data: d } = await supabase
      .from("tower_daily_dockets")
      .select("*")
      .eq("id", docketId)
      .single();

    const { data: l } = await supabase
      .from("tower_docket_labour")
      .select("*")
      .eq("docket_id", docketId);

    const { data: p } = await supabase
      .from("tower_docket_progress")
      .select("*")
      .eq("docket_id", docketId);

    setDocket(d);
    setLabour(l || []);
    setProgress(p || []);
    setLoading(false);
  }

  async function signDocket() {
    const confirmSign = window.confirm(
      "Signing will LOCK this docket. Continue?"
    );
    if (!confirmSign) return;

    const today = new Date().toISOString().slice(0, 10);

    await supabase
      .from("tower_daily_dockets")
      .update({ signed_date: today })
      .eq("id", docketId);

    load();
  }

  if (loading) return <div className="p-8">Loading docket...</div>;
  if (!docket) return <div className="p-8">Docket not found</div>;

  const isSigned = Boolean(docket.signed_date);

  return (
    <div className="p-8 space-y-6">

      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">
            Daily Docket — {docket.docket_date || "-"}
          </h1>

          <div className="mt-2">
            {isSigned ? (
              <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-lg font-semibold">
                Signed
              </span>
            ) : (
              <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-lg font-semibold">
                Draft
              </span>
            )}
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex gap-3">

          {!isSigned && (
            <Link
              href={`/project/${projectId}/tower/${towerId}/docket/${docketId}/edit`}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg"
            >
              Edit
            </Link>
          )}

          {!isSigned && (
            <button
              onClick={signDocket}
              className="bg-emerald-600 text-white px-5 py-2 rounded-lg"
            >
              Client Sign
            </button>
          )}

          <Link
            href={`/project/${projectId}/tower/${towerId}`}
            className="bg-slate-200 px-5 py-2 rounded-lg"
          >
            ← Back to Tower
          </Link>

        </div>
      </div>

      {/* SUMMARY */}
      <div className="bg-white border rounded-2xl p-6 grid md:grid-cols-4 gap-4">
        <Info label="Crew" value={docket.crew} />
        <Info label="Leading Hand" value={docket.leading_hand} />
        <Info label="Weather" value={docket.weather} />
        <Info label="Missing Steel" value={docket.missing_items_bolts} />
      </div>

      {/* PROGRESS */}
      <div className="bg-white border rounded-2xl p-6">
        <h2 className="text-xl font-semibold mb-4">Section Progress</h2>

        <table className="w-full border rounded-lg overflow-hidden">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-3 text-left">Section</th>
              <th className="p-3 text-left">Assembly %</th>
              <th className="p-3 text-left">Erection %</th>
            </tr>
          </thead>
          <tbody>
            {progress.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-3">{row.section_label}</td>
                <td className="p-3">{row.assembled_qty}%</td>
                <td className="p-3">{row.erected_qty}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* LABOUR */}
      <div className="bg-white border rounded-2xl p-6">
        <h2 className="text-xl font-semibold mb-4">Labour</h2>

        <table className="w-full border rounded-lg overflow-hidden">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-3 text-left">Worker</th>
              <th className="p-3 text-left">Time In</th>
              <th className="p-3 text-left">Time Out</th>
              <th className="p-3 text-left">Hours</th>
            </tr>
          </thead>
          <tbody>
            {labour.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-3">{row.worker_name}</td>
                <td className="p-3">{row.time_in}</td>
                <td className="p-3">{row.time_out}</td>
                <td className="p-3">{row.total_hours}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

function Info({ label, value }: any) {
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="font-semibold">{value || "-"}</p>
    </div>
  );
}
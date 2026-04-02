"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";

type Docket = {
  id: string;
  docket_date: string | null;
  crew: string | null;
  leading_hand: string | null;
  weather: string | null;
  assembly_percent: number | null;
  erection_percent: number | null;
  weather_delay_hours: number | null;
  lightning_delay_hours: number | null;
  toolbox_delay_hours: number | null;
  other_delay_hours: number | null;
  other_delay_reason: string | null;
  delays_comments: string | null;
  missing_items_bolts: string | null;
  bc_rep_name: string | null;
  client_rep_name: string | null;
  signed_date: string | null;
  docket_file_url: string | null;
};

type Labour = {
  id: string;
  worker_name: string | null;
  time_in: string | null;
  time_out: string | null;
  total_hours: number | null;
};

type Progress = {
  id: string;
  section_label: string | null;
  assembled_qty: number | null;
  erected_qty: number | null;
};

function isClientSignedDocket(docket: {
  client_rep_name?: string | null;
  signed_date?: string | null;
}) {
  return Boolean(
    docket.client_rep_name?.trim() && docket.signed_date?.trim()
  );
}

export default function DailyDocketPage() {
  const params = useParams();
  const supabase = createSupabaseBrowser();

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;
  const docketId = params.docketId as string;

  const [docket, setDocket] = useState<Docket | null>(null);
  const [labour, setLabour] = useState<Labour[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [showLabour, setShowLabour] = useState(false);

  // ✅ SAFE EFFECT (no warnings)
  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
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

      if (!isMounted) return;

      setDocket(d || null);
      setLabour(l || []);
      setProgress(p || []);
      setLoading(false);
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [docketId]);

  // ✅ SIGN FUNCTION
  async function clientSignDocket() {
    if (!docket) return;

    if (!docket.client_rep_name?.trim()) {
      alert("Please enter a Client Rep Name before client signing.");
      return;
    }

    const confirmed = window.confirm(
      "Client signing will lock this docket permanently. Continue?"
    );
    if (!confirmed) return;

    setSigning(true);

    const today = new Date().toISOString().slice(0, 10);

    const { error } = await supabase
      .from("tower_daily_dockets")
      .update({ signed_date: today })
      .eq("id", docketId);

    if (error) {
      alert("Failed to client sign docket.");
      setSigning(false);
      return;
    }

    // ✅ reload after signing
    setTimeout(() => location.reload(), 200);
  }

  if (loading) return <div className="p-8">Loading docket...</div>;
  if (!docket) return <div className="p-8">Docket not found.</div>;

  const clientSigned = isClientSignedDocket(docket);
  const bcSigned = Boolean(docket.bc_rep_name?.trim());

  const totalHours = labour.reduce(
    (sum, row) => sum + (row.total_hours || 0),
    0
  );

  return (
    <div className="p-8 max-w-6xl space-y-6">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-slate-500 text-sm">Daily Docket</p>
          <h1 className="text-3xl font-bold">{docket.docket_date || "-"}</h1>

          <div className="mt-3 flex gap-2">
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
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {!clientSigned && (
            <Link
              href={`/project/${projectId}/tower/${towerId}/docket/${docketId}/edit`}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg"
            >
              Edit
            </Link>
          )}

          {!clientSigned && (
            <button
              onClick={clientSignDocket}
              disabled={signing}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg"
            >
              {signing ? "Signing..." : "Client Sign"}
            </button>
          )}

          <Link
            href={`/project/${projectId}/tower/${towerId}/dockets/new?prefill=${docketId}`}
            className="bg-slate-700 text-white px-4 py-2 rounded-lg"
          >
            Create Next Docket (Prefill)
          </Link>
        </div>
      </div>

      {/* LABOUR */}
      <section className="bg-white border rounded-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Labour</h2>

          <button
            onClick={() => setShowLabour(!showLabour)}
            className="text-sm bg-slate-700 text-white px-3 py-1 rounded-lg"
          >
            {showLabour ? "Hide" : "View"}
          </button>
        </div>

        <div className="mb-4 text-sm text-slate-600">
          Total Manhours:{" "}
          <span className="font-semibold">{totalHours.toFixed(1)} hrs</span>
        </div>

        {showLabour && (
          <table className="w-full border rounded-xl overflow-hidden">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3">Worker</th>
                <th className="p-3">Time In</th>
                <th className="p-3">Time Out</th>
                <th className="p-3">Hours</th>
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
        )}
      </section>
    </div>
  );
}
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

function isSignedDocket(docket: {
  signed_date?: string | null;
}) {
  return Boolean(docket.signed_date && docket.signed_date.trim());
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

  useEffect(() => {
    load();
  }, [docketId]);

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

    setDocket(d || null);
    setLabour(l || []);
    setProgress(p || []);
    setLoading(false);
  }

  async function signDocket() {
    if (!docket) return;

    const confirmed = window.confirm(
      "Signing this docket will lock it and prevent further editing. Continue?"
    );
    if (!confirmed) return;

    setSigning(true);

    const today = new Date().toISOString().slice(0, 10);

    const { error } = await supabase
      .from("tower_daily_dockets")
      .update({
        signed_date: today,
      })
      .eq("id", docketId);

    if (error) {
      alert("Failed to sign docket.");
      setSigning(false);
      return;
    }

    await load();
    setSigning(false);
  }

  if (loading) return <div className="p-8">Loading docket...</div>;
  if (!docket) return <div className="p-8">Docket not found.</div>;

  const signed = isSignedDocket(docket);

  return (
    <div className="p-8 max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-slate-500 text-sm">Daily Docket</p>
          <h1 className="text-3xl font-bold">{docket.docket_date || "-"}</h1>

          <span
            className={`inline-block mt-3 px-3 py-1 rounded-lg text-sm font-semibold ${
              signed
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {signed ? "Signed" : "Draft"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {!signed && (
            <>
              <Link
                href={`/project/${projectId}/tower/${towerId}/docket/${docketId}/edit`}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg"
              >
                Edit
              </Link>

              <button
                onClick={signDocket}
                disabled={signing}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg"
              >
                {signing ? "Signing..." : "Client Sign"}
              </button>
            </>
          )}

          <Link
            href={`/project/${projectId}/tower/${towerId}/dockets`}
            className="border px-4 py-2 rounded-lg"
          >
            Back to Dockets
          </Link>

          <Link
            href={`/project/${projectId}/tower/${towerId}`}
            className="border px-4 py-2 rounded-lg"
          >
            Back to Tower
          </Link>
        </div>
      </div>

      <section className="bg-white border rounded-2xl p-6 grid md:grid-cols-2 gap-4">
        <Info label="Crew" value={docket.crew} />
        <Info label="Leading Hand" value={docket.leading_hand} />
        <Info label="Weather" value={docket.weather} />
        <Info
          label="Total Assembly"
          value={docket.assembly_percent !== null ? `${docket.assembly_percent}%` : "-"}
        />
        <Info
          label="Total Erection"
          value={docket.erection_percent !== null ? `${docket.erection_percent}%` : "-"}
        />
        <Info label="Missing Items / Bolts" value={docket.missing_items_bolts} />
      </section>

      <section className="bg-white border rounded-2xl p-6">
        <h2 className="text-xl font-semibold mb-4">Section Progress</h2>
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-3">Section</th>
                <th className="p-3">Assembly %</th>
                <th className="p-3">Erection %</th>
              </tr>
            </thead>
            <tbody>
              {progress.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="p-3">{row.section_label || "-"}</td>
                  <td className="p-3">{row.assembled_qty ?? 0}%</td>
                  <td className="p-3">{row.erected_qty ?? 0}%</td>
                </tr>
              ))}
              {progress.length === 0 && (
                <tr className="border-t">
                  <td colSpan={3} className="p-4 text-slate-500">
                    No progress rows saved.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border rounded-2xl p-6">
        <h2 className="text-xl font-semibold mb-4">Labour</h2>
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-3">Worker Name</th>
                <th className="p-3">Time In</th>
                <th className="p-3">Time Out</th>
                <th className="p-3">Total Hours</th>
              </tr>
            </thead>
            <tbody>
              {labour.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="p-3">{row.worker_name || "-"}</td>
                  <td className="p-3">{row.time_in || "-"}</td>
                  <td className="p-3">{row.time_out || "-"}</td>
                  <td className="p-3">{row.total_hours ?? "-"}</td>
                </tr>
              ))}
              {labour.length === 0 && (
                <tr className="border-t">
                  <td colSpan={4} className="p-4 text-slate-500">
                    No labour rows saved.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-semibold">Delays & Issues</h2>

        <div className="grid md:grid-cols-2 gap-4">
          <Info label="Weather Delay" value={formatHours(docket.weather_delay_hours)} />
          <Info label="Lightning Delay" value={formatHours(docket.lightning_delay_hours)} />
          <Info label="Toolbox Delay" value={formatHours(docket.toolbox_delay_hours)} />
          <Info label="Other Delay" value={formatHours(docket.other_delay_hours)} />
          <Info label="Other Delay Reason" value={docket.other_delay_reason} />
          <Info label="Missing Items / Bolts" value={docket.missing_items_bolts} />
        </div>

        <div>
          <p className="text-sm text-slate-500">Delay / Site Comments</p>
          <p className="font-semibold">{docket.delays_comments || "-"}</p>
        </div>
      </section>

      <section className="bg-white border rounded-2xl p-6 grid md:grid-cols-3 gap-4">
        <Info label="BC Rep Name" value={docket.bc_rep_name} />
        <Info label="Client Rep Name" value={docket.client_rep_name} />
        <Info label="Signed Date" value={docket.signed_date} />
      </section>

      {docket.docket_file_url && (
        <div>
          <a
            href={docket.docket_file_url}
            target="_blank"
            rel="noreferrer"
            className="inline-block bg-blue-600 text-white px-5 py-3 rounded-xl"
          >
            Open Uploaded Docket
          </a>
        </div>
      )}
    </div>
  );
}

function formatHours(value: number | null) {
  if (value === null || value === undefined) return "-";
  return `${value}h`;
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="font-semibold">{value || "-"}</p>
    </div>
  );
}
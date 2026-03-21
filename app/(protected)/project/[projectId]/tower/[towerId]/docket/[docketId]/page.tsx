"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";

export default function DocketViewPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;
  const docketId = params.docketId as string;

  const [docket, setDocket] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const { data } = await supabase
      .from("tower_daily_dockets")
      .select("*")
      .eq("id", docketId)
      .single();

    setDocket(data);
    setLoading(false);
  }

  async function signDocket() {
    const confirmSign = confirm(
      "Client signing will LOCK this docket. Continue?"
    );
    if (!confirmSign) return;

    const today = new Date().toISOString().slice(0, 10);

    await supabase
      .from("tower_daily_dockets")
      .update({
        signed_date: today,
      })
      .eq("id", docketId);

    load();
  }

  if (loading) return <div className="p-8">Loading...</div>;
  if (!docket) return <div className="p-8">Docket not found</div>;

  const isSigned = Boolean(docket.signed_date);

  return (
    <div className="p-8 space-y-6">

      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">
            Daily Docket — {docket.docket_date}
          </h1>

          <div className="mt-2">
            {isSigned ? (
              <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded">
                Signed
              </span>
            ) : (
              <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded">
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
              className="bg-blue-600 text-white px-4 py-2 rounded-lg"
            >
              Edit
            </Link>
          )}

          {!isSigned && (
            <button
              onClick={signDocket}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg"
            >
              Client Sign
            </button>
          )}

          <Link
            href={`/project/${projectId}/towers`}
            className="bg-slate-200 px-4 py-2 rounded-lg"
          >
            ← Back to Towers
          </Link>

        </div>
      </div>

      {/* SUMMARY CARD */}
      <div className="bg-white border rounded-2xl p-6 grid grid-cols-4 gap-4">
        <Info label="Crew" value={docket.crew} />
        <Info label="Leading Hand" value={docket.leading_hand} />
        <Info label="Weather" value={docket.weather} />
        <Info label="Missing Steel" value={docket.missing_items_bolts} />
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
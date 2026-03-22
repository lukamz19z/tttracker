"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

export default function SafetyRegisterPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [docs, setDocs] = useState<any[]>([]);

  const [label, setLabel] = useState("");
  const [lh, setLh] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [file, setFile] = useState<any>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: towerData } = await supabase
      .from("towers")
      .select("*")
      .eq("id", towerId)
      .single();

    setTower(towerData);

    const { data: dockets } = await supabase
      .from("tower_daily_dockets")
      .select("docket_date")
      .eq("tower_id", towerId)
      .order("docket_date", { ascending: false })
      .limit(1);

    if (dockets?.length) setLatestDate(dockets[0].docket_date);

    const { data: safetyDocs } = await supabase
      .from("tower_safety_register")
      .select("*")
      .eq("tower_id", towerId)
      .order("created_at", { ascending: false });

    setDocs(safetyDocs || []);
  }

  async function addDoc() {
    const { data } = await supabase
      .from("tower_safety_register")
      .insert({
        tower_id: towerId,
        document_label: label,
        leading_hand: lh,
        date_from: from,
        date_to: to,
      })
      .select()
      .single();

    if (file && data) {
      const upload = await supabase.storage
        .from("safety_docs")
        .upload(`${data.id}/${file.name}`, file);

      await supabase
        .from("tower_safety_register")
        .update({ file_url: upload.data?.path })
        .eq("id", data.id);
    }

    setLabel("");
    setLh("");
    setFrom("");
    setTo("");
    setFile(null);

    load();
  }

  async function closeOut(docId: string) {
    await supabase
      .from("tower_safety_register")
      .update({ closed_out: true })
      .eq("id", docId);

    load();
  }

  function status(doc: any) {
    const today = new Date().toISOString().slice(0, 10);

    if (doc.closed_out) return "Closed";

    if (doc.date_to && today > doc.date_to) return "Expired";

    if (doc.date_from && today < doc.date_from) return "Upcoming";

    return "Active";
  }

  if (!tower) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 space-y-6">

      {/* HEADER */}
      <TowerHeader
        projectId={projectId}
        tower={tower}
        latestDate={latestDate}
      />

      {/* WORKPACK SUBTABS */}
      <div className="flex gap-2 border-b pb-2">
        <Link className="px-4 py-2 bg-white border rounded-t-lg font-semibold"
          href={`/project/${projectId}/tower/${towerId}/workpack/safety`}>
          Safety
        </Link>

        <Link className="px-4 py-2 bg-slate-100 border rounded-t-lg"
          href={`/project/${projectId}/tower/${towerId}/workpack/itc`}>
          ITCs
        </Link>

        <Link className="px-4 py-2 bg-slate-100 border rounded-t-lg"
          href={`/project/${projectId}/tower/${towerId}/workpack/permits`}>
          Permits
        </Link>

        <Link className="px-4 py-2 bg-slate-100 border rounded-t-lg"
          href={`/project/${projectId}/tower/${towerId}/workpack/lifts`}>
          Lift Studies
        </Link>

        <Link className="px-4 py-2 bg-slate-100 border rounded-t-lg"
          href={`/project/${projectId}/tower/${towerId}/workpack/documents`}>
          Documents
        </Link>
      </div>

      {/* SAFETY CARD */}
      <div className="bg-white border rounded-2xl p-6 space-y-5">

        <div className="text-2xl font-bold">Safety Register</div>

        <div className="grid grid-cols-6 gap-3">

          <input
            placeholder="Document Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="border p-2 rounded"
          />

          <input
            placeholder="Leading Hand"
            value={lh}
            onChange={(e) => setLh(e.target.value)}
            className="border p-2 rounded"
          />

          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border p-2 rounded"
          />

          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border p-2 rounded"
          />

          <input
            type="file"
            onChange={(e: any) => setFile(e.target.files[0])}
            className="border p-2 rounded"
          />

          <button
            onClick={addDoc}
            className="bg-blue-600 text-white rounded"
          >
            Add
          </button>

        </div>

        {docs.map((d) => (
          <div key={d.id}
            className="border rounded-xl p-4 flex justify-between items-center">

            <div>
              <div className="font-semibold">{d.document_label}</div>
              <div className="text-sm text-slate-500">LH: {d.leading_hand}</div>
              <div className="text-sm text-slate-500">
                {d.date_from} → {d.date_to}
              </div>
            </div>

            <div className="flex gap-3 items-center">

              {d.file_url && (
                <a
                  target="_blank"
                  href={`https://YOURPROJECT.supabase.co/storage/v1/object/public/safety_docs/${d.file_url}`}
                  className="text-blue-600"
                >
                  View
                </a>
              )}

              <button className="text-orange-600">
                Edit
              </button>

              {status(d) === "Expired" && !d.closed_out && (
                <button
                  onClick={() => closeOut(d.id)}
                  className="bg-red-500 text-white px-3 py-1 rounded"
                >
                  Close Out
                </button>
              )}

              <div className={`px-3 py-1 rounded-full text-sm
                ${status(d) === "Active" && "bg-green-100 text-green-700"}
                ${status(d) === "Expired" && "bg-red-100 text-red-700"}
                ${status(d) === "Closed" && "bg-slate-200 text-slate-600"}
              `}>
                {status(d)}
              </div>

            </div>

          </div>
        ))}

      </div>
    </div>
  );
}
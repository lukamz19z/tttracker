"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
      .order("date_from", { ascending: false });

    setDocs(safetyDocs || []);
  }

  async function addDoc() {
    await supabase.from("tower_safety_register").insert({
      tower_id: towerId,
      document_label: label,
      leading_hand: lh,
      date_from: from,
      date_to: to,
    });

    setLabel("");
    setLh("");
    setFrom("");
    setTo("");

    load();
  }

  async function uploadFile(e: any, docId: string) {
    const file = e.target.files[0];
    if (!file) return;

    const { data } = await supabase.storage
      .from("safety_docs")
      .upload(`${docId}/${file.name}`, file);

    const fileUrl = data?.path;

    await supabase
      .from("tower_safety_register")
      .update({ file_url: fileUrl })
      .eq("id", docId);

    load();
  }

  function status(doc: any) {
    const today = new Date().toISOString().slice(0, 10);

    if (doc.date_to && today > doc.date_to) return "Expired";
    if (doc.date_from && today < doc.date_from) return "Upcoming";
    return "Active";
  }

  if (!tower) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 space-y-6">

      <TowerHeader
        projectId={projectId}
        tower={tower}
        latestDate={latestDate}
      />

      <div className="bg-white border rounded-2xl p-6 space-y-6">

        <div className="text-2xl font-bold">Safety Register</div>

        {/* ADD FORM */}
        <div className="grid grid-cols-5 gap-3">

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

          <div>
            <div className="text-xs">Date From</div>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border p-2 rounded w-full"
            />
          </div>

          <div>
            <div className="text-xs">Date To</div>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border p-2 rounded w-full"
            />
          </div>

          <button
            onClick={addDoc}
            className="bg-blue-600 text-white rounded"
          >
            Add
          </button>

        </div>

        {/* LIST */}
        <div className="space-y-3">

          {docs.map((d) => (
            <div
              key={d.id}
              className="border rounded-xl p-4 flex justify-between items-center"
            >
              <div>
                <div className="font-semibold">{d.document_label}</div>
                <div className="text-sm text-slate-500">
                  LH: {d.leading_hand}
                </div>
                <div className="text-sm text-slate-500">
                  {d.date_from} → {d.date_to}
                </div>
              </div>

              <div className="flex gap-3 items-center">

                <label className="cursor-pointer bg-slate-100 px-3 py-1 rounded">
                  Upload
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => uploadFile(e, d.id)}
                  />
                </label>

                {d.file_url && (
                  <a
                    href={`https://YOURPROJECT.supabase.co/storage/v1/object/public/safety_docs/${d.file_url}`}
                    target="_blank"
                    className="text-blue-600"
                  >
                    View
                  </a>
                )}

                <button className="text-orange-600">
                  Edit
                </button>

                <div
                  className={`px-3 py-1 rounded-full text-sm ${
                    status(d) === "Active"
                      ? "bg-green-100 text-green-700"
                      : status(d) === "Expired"
                      ? "bg-red-100 text-red-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {status(d)}
                </div>

              </div>
            </div>
          ))}

        </div>

      </div>
    </div>
  );
}
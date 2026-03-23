"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

export default function WorkpackDocumentsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [docName, setDocName] = useState("");
  const [stage, setStage] = useState("");

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

    const { data: docket } = await supabase
      .from("tower_daily_dockets")
      .select("docket_date")
      .eq("tower_id", towerId)
      .order("docket_date", { ascending: false })
      .limit(1);

    if (docket?.length) setLatestDate(docket[0].docket_date);

    const { data: d } = await supabase
      .from("tower_workpack_documents")
      .select("*")
      .eq("tower_id", towerId)
      .order("created_at", { ascending: false });

    setDocs(d || []);
  }

  async function addDoc() {
    if (!docName) return alert("Enter document name");

    await supabase.from("tower_workpack_documents").insert({
      tower_id: towerId,
      document_name: docName,
      stage,
    });

    setDocName("");
    setStage("");
    load();
  }

  if (!tower) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 space-y-6">
      <TowerHeader projectId={projectId} tower={tower} latestDate={latestDate} />

      <div className="bg-white border rounded-2xl p-6 space-y-5">
        <div className="flex justify-between">
          <h1 className="text-2xl font-bold">Workpack Documents</h1>
        </div>

        <div className="flex gap-3">
          <input
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            placeholder="Document Name"
            className="border p-2 rounded"
          />

          <input
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            placeholder="Stage"
            className="border p-2 rounded"
          />

          <button
            onClick={addDoc}
            className="bg-blue-600 text-white px-4 rounded"
          >
            Add Document
          </button>
        </div>

        {docs.map((d) => (
          <Link
            key={d.id}
            href={`/project/${projectId}/tower/${towerId}/workpack/document/${d.id}`}
            className="border rounded-xl p-4 flex justify-between hover:bg-slate-50"
          >
            <div>
              <div className="font-semibold">{d.document_name}</div>
              <div className="text-sm text-slate-500">
                Stage: {d.stage || "-"}
              </div>
            </div>

            <div className="text-sm bg-slate-100 px-3 py-1 rounded">
              {d.status}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
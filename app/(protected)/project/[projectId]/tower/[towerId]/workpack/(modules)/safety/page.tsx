"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type SafetyDoc = {
  id: string;
  tower_id: string;
  document_label: string;
  leading_hand: string | null;
  date_from: string | null;
  date_to: string | null;
  file_url: string | null;
  closed_out: boolean | null;
  created_at?: string;
};

export default function SafetyRegisterPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [docs, setDocs] = useState<SafetyDoc[]>([]);

  const [label, setLabel] = useState("");
  const [lh, setLh] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editLh, setEditLh] = useState("");
  const [editFrom, setEditFrom] = useState("");
  const [editTo, setEditTo] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);

  useEffect(() => {
    load();
  }, [towerId]);

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

    setDocs((safetyDocs || []) as SafetyDoc[]);
  }

  async function addDoc() {
    if (!label.trim()) {
      alert("Enter document label");
      return;
    }

    const { data, error } = await supabase
      .from("tower_safety_register")
      .insert({
        tower_id: towerId,
        document_label: label.trim(),
        leading_hand: lh.trim() || null,
        date_from: from || null,
        date_to: to || null,
      })
      .select()
      .single();

    if (error || !data) {
      alert("Failed to add safety document");
      return;
    }

    if (file) {
      const uploadRes = await supabase.storage
        .from("safety_docs")
        .upload(`${data.id}/${Date.now()}_${file.name}`, file, {
          upsert: true,
        });

      if (!uploadRes.error) {
        await supabase
          .from("tower_safety_register")
          .update({ file_url: uploadRes.data.path })
          .eq("id", data.id);
      }
    }

    setLabel("");
    setLh("");
    setFrom("");
    setTo("");
    setFile(null);

    await load();
  }

  function startEdit(doc: SafetyDoc) {
    setEditingId(doc.id);
    setEditLabel(doc.document_label || "");
    setEditLh(doc.leading_hand || "");
    setEditFrom(doc.date_from || "");
    setEditTo(doc.date_to || "");
    setEditFile(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditLabel("");
    setEditLh("");
    setEditFrom("");
    setEditTo("");
    setEditFile(null);
  }

  async function saveEdit(doc: SafetyDoc) {
    if (!editLabel.trim()) {
      alert("Enter document label");
      return;
    }

    const updatePayload: Partial<SafetyDoc> = {
      document_label: editLabel.trim(),
      leading_hand: editLh.trim() || null,
      date_from: editFrom || null,
      date_to: editTo || null,
    };

    const { error } = await supabase
      .from("tower_safety_register")
      .update(updatePayload)
      .eq("id", doc.id);

    if (error) {
      alert("Failed to update safety document");
      return;
    }

    if (editFile) {
      const uploadRes = await supabase.storage
        .from("safety_docs")
        .upload(`${doc.id}/${Date.now()}_${editFile.name}`, editFile, {
          upsert: true,
        });

      if (!uploadRes.error) {
        await supabase
          .from("tower_safety_register")
          .update({ file_url: uploadRes.data.path })
          .eq("id", doc.id);
      }
    }

    cancelEdit();
    await load();
  }

  async function closeOut(docId: string) {
    await supabase
      .from("tower_safety_register")
      .update({ closed_out: true })
      .eq("id", docId);

    await load();
  }

  function status(doc: SafetyDoc) {
    const today = new Date().toISOString().slice(0, 10);

    if (doc.closed_out) return "Closed";
    if (doc.date_to && today > doc.date_to) return "Expired";
    if (doc.date_from && today < doc.date_from) return "Upcoming";
    return "Active";
  }

  function fileHref(path: string) {
    const { data } = supabase.storage.from("safety_docs").getPublicUrl(path);
    return data.publicUrl;
  }

  if (!tower) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 space-y-6">
      <TowerHeader
        projectId={projectId}
        tower={tower}
        latestDate={latestDate}
      />

      <div className="flex gap-2 border-b pb-2">
        <Link
          className="px-4 py-2 bg-white border rounded-t-lg font-semibold"
          href={`/project/${projectId}/tower/${towerId}/workpack/safety`}
        >
          Safety
        </Link>

        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg"
          href={`/project/${projectId}/tower/${towerId}/workpack/itc`}
        >
          ITCs
        </Link>

        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg"
          href={`/project/${projectId}/tower/${towerId}/workpack/permits`}
        >
          Permits
        </Link>

        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg"
          href={`/project/${projectId}/tower/${towerId}/workpack/lifts`}
        >
          Lift Studies
        </Link>

        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg"
          href={`/project/${projectId}/tower/${towerId}/workpack/documents`}
        >
          Documents
        </Link>
      </div>

      <div className="bg-white border rounded-2xl p-6 space-y-5">
        <div className="text-2xl font-bold">Safety Register</div>

        <div className="grid grid-cols-6 gap-3 items-end">
          <div>
            <label className="block text-xs mb-1">Document Label</label>
            <input
              placeholder="Document Label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="border p-2 rounded w-full"
            />
          </div>

          <div>
            <label className="block text-xs mb-1">Leading Hand</label>
            <input
              placeholder="Leading Hand"
              value={lh}
              onChange={(e) => setLh(e.target.value)}
              className="border p-2 rounded w-full"
            />
          </div>

          <div>
            <label className="block text-xs mb-1">Date From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border p-2 rounded w-full"
            />
          </div>

          <div>
            <label className="block text-xs mb-1">Date To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border p-2 rounded w-full"
            />
          </div>

          <div>
            <label className="block text-xs mb-1">Attach File</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="border p-2 rounded w-full"
            />
          </div>

          <button
            onClick={addDoc}
            className="bg-blue-600 text-white rounded h-[42px]"
          >
            Add
          </button>
        </div>

        {docs.map((d) => {
          const isEditing = editingId === d.id;

          return (
            <div
              key={d.id}
              className="border rounded-xl p-4 flex justify-between items-start"
            >
              {!isEditing ? (
                <>
                  <div>
                    <div className="font-semibold">{d.document_label}</div>
                    <div className="text-sm text-slate-500">
                      LH: {d.leading_hand || "-"}
                    </div>
                    <div className="text-sm text-slate-500">
                      {d.date_from || "-"} → {d.date_to || "-"}
                    </div>
                  </div>

                  <div className="flex gap-3 items-center flex-wrap justify-end">
                    {d.file_url && (
                      <a
                        href={fileHref(d.file_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600"
                      >
                        View
                      </a>
                    )}

                    <button
                      onClick={() => startEdit(d)}
                      className="text-orange-600"
                    >
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

                    <div
                      className={`px-3 py-1 rounded-full text-sm ${
                        status(d) === "Active"
                          ? "bg-green-100 text-green-700"
                          : status(d) === "Expired"
                          ? "bg-red-100 text-red-700"
                          : status(d) === "Closed"
                          ? "bg-slate-200 text-slate-600"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {status(d)}
                    </div>
                  </div>
                </>
              ) : (
                <div className="w-full space-y-4">
                  <div className="grid grid-cols-5 gap-3 items-end">
                    <div>
                      <label className="block text-xs mb-1">Document Label</label>
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="border p-2 rounded w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-xs mb-1">Leading Hand</label>
                      <input
                        value={editLh}
                        onChange={(e) => setEditLh(e.target.value)}
                        className="border p-2 rounded w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-xs mb-1">Date From</label>
                      <input
                        type="date"
                        value={editFrom}
                        onChange={(e) => setEditFrom(e.target.value)}
                        className="border p-2 rounded w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-xs mb-1">Date To</label>
                      <input
                        type="date"
                        value={editTo}
                        onChange={(e) => setEditTo(e.target.value)}
                        className="border p-2 rounded w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-xs mb-1">Replace File</label>
                      <input
                        type="file"
                        onChange={(e) => setEditFile(e.target.files?.[0] || null)}
                        className="border p-2 rounded w-full"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 justify-end">
                    {d.file_url && (
                      <a
                        href={fileHref(d.file_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600"
                      >
                        View
                      </a>
                    )}

                    <button
                      onClick={cancelEdit}
                      className="border px-4 py-2 rounded"
                    >
                      Cancel
                    </button>

                    <button
                      onClick={() => saveEdit(d)}
                      className="bg-blue-600 text-white px-4 py-2 rounded"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
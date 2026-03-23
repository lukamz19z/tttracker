"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type ModificationRow = {
  id: string;
  tower_id: string;
  title: string;
  description: string | null;
  status: "Open" | "Closed";
  raised_by: string | null;
  raised_date: string | null;
  closed_date: string | null;
  file_url: string | null;
  created_at: string;
};

export default function TowerModificationsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [rows, setRows] = useState<ModificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [raisedBy, setRaisedBy] = useState("");
  const [raisedDate, setRaisedDate] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editRaisedBy, setEditRaisedBy] = useState("");
  const [editRaisedDate, setEditRaisedDate] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);

  useEffect(() => {
    load();
  }, [towerId]);

  async function load() {
    setLoading(true);

    const [towerRes, docketRes, modRes] = await Promise.all([
      supabase.from("towers").select("*").eq("id", towerId).single(),
      supabase
        .from("tower_daily_dockets")
        .select("docket_date")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false })
        .limit(1),
      supabase
        .from("tower_modifications")
        .select("*")
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false }),
    ]);

    setTower(towerRes.data || null);
    setLatestDate(docketRes.data?.[0]?.docket_date || null);
    setRows((modRes.data || []) as ModificationRow[]);
    setLoading(false);
  }

  async function uploadFile(file: File, modificationId: string) {
    const path = `${towerId}/${modificationId}/${Date.now()}_${file.name}`;

    const { data, error } = await supabase.storage
      .from("tower-modifications")
      .upload(path, file, { upsert: true });

    if (error || !data) {
      throw new Error("File upload failed.");
    }

    return data.path;
  }

  async function addModification() {
    if (!title.trim()) {
      alert("Enter a title.");
      return;
    }

    const { data, error } = await supabase
      .from("tower_modifications")
      .insert({
        tower_id: towerId,
        title: title.trim(),
        description: description.trim() || null,
        raised_by: raisedBy.trim() || null,
        raised_date: raisedDate || null,
        status: "Open",
      })
      .select()
      .single();

    if (error || !data) {
      alert("Failed to add modification.");
      return;
    }

    if (newFile) {
      try {
        const filePath = await uploadFile(newFile, data.id);

        await supabase
          .from("tower_modifications")
          .update({ file_url: filePath })
          .eq("id", data.id);
      } catch (err) {
        console.error(err);
        alert("Modification saved, but file upload failed.");
      }
    }

    setTitle("");
    setDescription("");
    setRaisedBy("");
    setRaisedDate("");
    setNewFile(null);

    await load();
  }

  function startEdit(row: ModificationRow) {
    setEditingId(row.id);
    setEditTitle(row.title || "");
    setEditDescription(row.description || "");
    setEditRaisedBy(row.raised_by || "");
    setEditRaisedDate(row.raised_date || "");
    setEditFile(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
    setEditRaisedBy("");
    setEditRaisedDate("");
    setEditFile(null);
  }

  async function saveEdit(row: ModificationRow) {
    if (!editTitle.trim()) {
      alert("Enter a title.");
      return;
    }

    const { error } = await supabase
      .from("tower_modifications")
      .update({
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        raised_by: editRaisedBy.trim() || null,
        raised_date: editRaisedDate || null,
      })
      .eq("id", row.id);

    if (error) {
      alert("Failed to update modification.");
      return;
    }

    if (editFile) {
      try {
        const filePath = await uploadFile(editFile, row.id);

        await supabase
          .from("tower_modifications")
          .update({ file_url: filePath })
          .eq("id", row.id);
      } catch (err) {
        console.error(err);
        alert("Modification updated, but file upload failed.");
      }
    }

    cancelEdit();
    await load();
  }

  async function closeOut(row: ModificationRow) {
    const { error } = await supabase
      .from("tower_modifications")
      .update({
        status: "Closed",
        closed_date: new Date().toISOString().slice(0, 10),
      })
      .eq("id", row.id);

    if (error) {
      alert("Failed to close modification.");
      return;
    }

    await load();
  }

  async function reopen(row: ModificationRow) {
    const { error } = await supabase
      .from("tower_modifications")
      .update({
        status: "Open",
        closed_date: null,
      })
      .eq("id", row.id);

    if (error) {
      alert("Failed to reopen modification.");
      return;
    }

    await load();
  }

  async function deleteModification(row: ModificationRow) {
    const confirmed = window.confirm("Delete this modification?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("tower_modifications")
      .delete()
      .eq("id", row.id);

    if (error) {
      alert("Failed to delete modification.");
      return;
    }

    await load();
  }

  function fileHref(path: string) {
    const { data } = supabase.storage
      .from("tower-modifications")
      .getPublicUrl(path);

    return data.publicUrl;
  }

  if (loading) return <div className="p-8">Loading modifications...</div>;
  if (!tower) return <div className="p-8">Tower not found.</div>;

  const openCount = rows.filter((r) => r.status === "Open").length;
  const closedCount = rows.filter((r) => r.status === "Closed").length;

  return (
    <div className="p-8 space-y-6">
      <TowerHeader
        projectId={projectId}
        tower={tower}
        latestDate={latestDate}
      />

      

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <div className="flex justify-between items-start gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Modifications Register</h1>
            <p className="text-slate-500 mt-1">
              Track tower modifications and engineering changes for PM review and ITC reference.
            </p>
          </div>

          <div className="flex gap-3 flex-wrap">
            <StatusCard label="Open" value={String(openCount)} />
            <StatusCard label="Closed" value={String(closedCount)} />
          </div>
        </div>

        {/* ADD FORM */}
        <div className="border rounded-xl p-4 bg-slate-50 space-y-4">
          <div className="text-lg font-semibold">Add Modification</div>

          <div className="grid md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-xs mb-1">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="border p-2 rounded w-full bg-white"
                placeholder="Short title"
              />
            </div>

            <div>
              <label className="block text-xs mb-1">Raised By</label>
              <input
                value={raisedBy}
                onChange={(e) => setRaisedBy(e.target.value)}
                className="border p-2 rounded w-full bg-white"
                placeholder="Name"
              />
            </div>

            <div>
              <label className="block text-xs mb-1">Raised Date</label>
              <input
                type="date"
                value={raisedDate}
                onChange={(e) => setRaisedDate(e.target.value)}
                className="border p-2 rounded w-full bg-white"
              />
            </div>

            <div>
              <label className="block text-xs mb-1">Attach File</label>
              <input
                type="file"
                onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                className="border p-2 rounded w-full bg-white"
              />
            </div>

            <button
              onClick={addModification}
              className="bg-blue-600 text-white rounded h-[42px]"
            >
              Add
            </button>
          </div>

          <div>
            <label className="block text-xs mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="border p-2 rounded w-full bg-white min-h-[90px]"
              placeholder="Describe the modification, mismatch, issue, rectification, etc."
            />
          </div>
        </div>

        {/* ROWS */}
        <div className="space-y-3">
          {rows.length === 0 && (
            <div className="border rounded-xl p-6 text-slate-500 text-center">
              No modifications recorded yet.
            </div>
          )}

          {rows.map((row) => {
            const isEditing = editingId === row.id;

            return (
              <div key={row.id} className="border rounded-xl p-4">
                {!isEditing ? (
                  <div className="flex justify-between items-start gap-4 flex-wrap">
                    <div className="space-y-1">
                      <div className="font-semibold">{row.title}</div>
                      <div className="text-sm text-slate-500">
                        Raised By: {row.raised_by || "-"}
                      </div>
                      <div className="text-sm text-slate-500">
                        Raised Date: {row.raised_date || "-"}
                      </div>
                      <div className="text-sm text-slate-500">
                        Closed Date: {row.closed_date || "-"}
                      </div>
                      <div className="text-sm text-slate-600">
                        {row.description || "-"}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      {row.file_url && (
                        <a
                          href={fileHref(row.file_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600"
                        >
                          View
                        </a>
                      )}

                      <button
                        onClick={() => startEdit(row)}
                        className="text-orange-600"
                      >
                        Edit
                      </button>

                      {row.status === "Open" ? (
                        <button
                          onClick={() => closeOut(row)}
                          className="bg-red-500 text-white px-3 py-1 rounded"
                        >
                          Close Out
                        </button>
                      ) : (
                        <button
                          onClick={() => reopen(row)}
                          className="bg-slate-700 text-white px-3 py-1 rounded"
                        >
                          Reopen
                        </button>
                      )}

                      <button
                        onClick={() => deleteModification(row)}
                        className="text-red-600"
                      >
                        Delete
                      </button>

                      <StatusPill status={row.status} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-4 gap-3 items-end">
                      <div>
                        <label className="block text-xs mb-1">Title</label>
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="border p-2 rounded w-full"
                        />
                      </div>

                      <div>
                        <label className="block text-xs mb-1">Raised By</label>
                        <input
                          value={editRaisedBy}
                          onChange={(e) => setEditRaisedBy(e.target.value)}
                          className="border p-2 rounded w-full"
                        />
                      </div>

                      <div>
                        <label className="block text-xs mb-1">Raised Date</label>
                        <input
                          type="date"
                          value={editRaisedDate}
                          onChange={(e) => setEditRaisedDate(e.target.value)}
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

                    <div>
                      <label className="block text-xs mb-1">Description</label>
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="border p-2 rounded w-full min-h-[90px]"
                      />
                    </div>

                    <div className="flex justify-end gap-3">
                      {row.file_url && (
                        <a
                          href={fileHref(row.file_url)}
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
                        onClick={() => saveEdit(row)}
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
    </div>
  );
}

function StatusCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="bg-slate-100 rounded-xl px-4 py-3 min-w-[110px]">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: "Open" | "Closed" }) {
  return (
    <div
      className={`px-3 py-1 rounded-full text-sm ${
        status === "Open"
          ? "bg-yellow-100 text-yellow-700"
          : "bg-green-100 text-green-700"
      }`}
    >
      {status}
    </div>
  );
}
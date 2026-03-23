"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type ModificationFile = {
  id: string;
  modification_id: string;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

type ModificationRow = {
  id: string;
  tower_id: string;
  mod_number: string;
  title: string;
  description: string | null;
  status: "Open" | "Closed";
  raised_by: string | null;
  raised_date: string | null;
  closed_by: string | null;
  closed_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  tower_modification_files?: ModificationFile[];
};

type PreviewState = {
  url: string;
  name: string;
  mimeType: string;
} | null;

type FilterType = "All" | "Open" | "Closed";

export default function TowerModificationsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [rows, setRows] = useState<ModificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUserLabel, setCurrentUserLabel] = useState("Unknown User");

  const [filter, setFilter] = useState<FilterType>("All");
  const [preview, setPreview] = useState<PreviewState>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [raisedBy, setRaisedBy] = useState("");
  const [raisedDate, setRaisedDate] = useState("");
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editRaisedBy, setEditRaisedBy] = useState("");
  const [editRaisedDate, setEditRaisedDate] = useState("");
  const [editFiles, setEditFiles] = useState<File[]>([]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [towerId]);

  async function load() {
    setLoading(true);

    const authRes = await supabase.auth.getUser();
    const authUser = authRes.data.user;
    setCurrentUserLabel(
      authUser?.email || authUser?.user_metadata?.full_name || "Unknown User"
    );

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
        .select(
          `
            *,
            tower_modification_files (
              id,
              modification_id,
              file_path,
              file_name,
              mime_type,
              uploaded_by,
              uploaded_at
            )
          `
        )
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false }),
    ]);

    if (towerRes.error) {
      console.error("Tower load error:", towerRes.error);
    }
    if (docketRes.error) {
      console.error("Docket load error:", docketRes.error);
    }
    if (modRes.error) {
      console.error("Modification load error:", modRes.error);
    }

    const loadedRows = ((modRes.data || []) as ModificationRow[]).map((row) => ({
      ...row,
      tower_modification_files: [...(row.tower_modification_files || [])].sort(
        (a, b) =>
          new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime()
      ),
    }));

    setTower(towerRes.data || null);
    setLatestDate(docketRes.data?.[0]?.docket_date || null);
    setRows(loadedRows);
    setLoading(false);
  }

  function getTowerLabel(t: any) {
    return (
      t?.tower_number ||
      t?.structure_number ||
      t?.tower_no ||
      t?.name ||
      (t?.id ? String(t.id).slice(0, 8).toUpperCase() : "TOWER")
    );
  }

  async function generateModNumber() {
    const towerLabel = getTowerLabel(tower);

    const { count, error } = await supabase
      .from("tower_modifications")
      .select("*", { count: "exact", head: true })
      .eq("tower_id", towerId);

    if (error) {
      console.error(error);
      throw new Error("Failed to generate modification number.");
    }

    const nextNo = String((count ?? 0) + 1).padStart(3, "0");
    return `MOD-${towerLabel}-${nextNo}`;
  }

  async function uploadFiles(files: File[], modificationId: string) {
    if (!files.length) return;

    for (const file of files) {
      const safeName = file.name.replace(/\s+/g, "_");
      const path = `${towerId}/${modificationId}/${Date.now()}_${safeName}`;

      const { data, error } = await supabase.storage
        .from("tower-modifications")
        .upload(path, file, { upsert: true });

      if (error || !data) {
        console.error(error);
        throw new Error(`Failed to upload ${file.name}`);
      }

      const { error: fileInsertError } = await supabase
        .from("tower_modification_files")
        .insert({
          modification_id: modificationId,
          file_path: data.path,
          file_name: file.name,
          mime_type: file.type || null,
          uploaded_by: currentUserLabel,
        });

      if (fileInsertError) {
        console.error(fileInsertError);
        throw new Error(`Failed to save file record for ${file.name}`);
      }
    }
  }

  function resetAddForm() {
    setTitle("");
    setDescription("");
    setRaisedBy("");
    setRaisedDate("");
    setNewFiles([]);
    const input = document.getElementById("new-mod-files") as HTMLInputElement | null;
    if (input) input.value = "";
  }

  function resetEditForm() {
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
    setEditRaisedBy("");
    setEditRaisedDate("");
    setEditFiles([]);
    const input = document.getElementById("edit-mod-files") as HTMLInputElement | null;
    if (input) input.value = "";
  }

  async function addModification() {
    if (!title.trim()) {
      alert("Enter a title.");
      return;
    }

    try {
      setSaving(true);

      const modNumber = await generateModNumber();

      const { data, error } = await supabase
        .from("tower_modifications")
        .insert({
          tower_id: towerId,
          mod_number: modNumber,
          title: title.trim(),
          description: description.trim() || null,
          status: "Open",
          raised_by: raisedBy.trim() || currentUserLabel,
          raised_date: raisedDate || new Date().toISOString().slice(0, 10),
          created_by: currentUserLabel,
        })
        .select()
        .single();

      if (error || !data) {
        console.error(error);
        throw new Error("Failed to add modification.");
      }

      await uploadFiles(newFiles, data.id);

      resetAddForm();
      await load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to add modification.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: ModificationRow) {
    setEditingId(row.id);
    setEditTitle(row.title || "");
    setEditDescription(row.description || "");
    setEditRaisedBy(row.raised_by || "");
    setEditRaisedDate(row.raised_date || "");
    setEditFiles([]);
  }

  function cancelEdit() {
    resetEditForm();
  }

  async function saveEdit(row: ModificationRow) {
    if (!editTitle.trim()) {
      alert("Enter a title.");
      return;
    }

    try {
      setSaving(true);

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
        console.error(error);
        throw new Error("Failed to update modification.");
      }

      if (editFiles.length) {
        await uploadFiles(editFiles, row.id);
      }

      resetEditForm();
      await load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to update modification.");
    } finally {
      setSaving(false);
    }
  }

  async function closeOut(row: ModificationRow) {
    try {
      const { error } = await supabase
        .from("tower_modifications")
        .update({
          status: "Closed",
          closed_date: new Date().toISOString().slice(0, 10),
          closed_by: currentUserLabel,
        })
        .eq("id", row.id);

      if (error) {
        console.error(error);
        throw new Error("Failed to close modification.");
      }

      await load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to close modification.");
    }
  }

  async function reopen(row: ModificationRow) {
    try {
      const { error } = await supabase
        .from("tower_modifications")
        .update({
          status: "Open",
          closed_date: null,
          closed_by: null,
        })
        .eq("id", row.id);

      if (error) {
        console.error(error);
        throw new Error("Failed to reopen modification.");
      }

      await load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to reopen modification.");
    }
  }

  async function deleteAttachedFile(file: ModificationFile) {
    const confirmed = window.confirm(`Delete file "${file.file_name || "attachment"}"?`);
    if (!confirmed) return;

    try {
      const { error: storageError } = await supabase.storage
        .from("tower-modifications")
        .remove([file.file_path]);

      if (storageError) {
        console.error(storageError);
      }

      const { error } = await supabase
        .from("tower_modification_files")
        .delete()
        .eq("id", file.id);

      if (error) {
        console.error(error);
        throw new Error("Failed to delete attachment.");
      }

      await load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to delete attachment.");
    }
  }

  async function deleteModification(row: ModificationRow) {
    const confirmed = window.confirm(
      `Delete modification ${row.mod_number}? This will also remove all attachments.`
    );
    if (!confirmed) return;

    try {
      const filePaths =
        row.tower_modification_files?.map((f) => f.file_path).filter(Boolean) || [];

      if (filePaths.length) {
        const { error: storageError } = await supabase.storage
          .from("tower-modifications")
          .remove(filePaths);

        if (storageError) {
          console.error(storageError);
        }
      }

      const { error } = await supabase
        .from("tower_modifications")
        .delete()
        .eq("id", row.id);

      if (error) {
        console.error(error);
        throw new Error("Failed to delete modification.");
      }

      await load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to delete modification.");
    }
  }

  function fileHref(path: string) {
    const { data } = supabase.storage
      .from("tower-modifications")
      .getPublicUrl(path);

    return data.publicUrl;
  }

  function isImage(file: ModificationFile) {
    return (file.mime_type || "").startsWith("image/");
  }

  function prettyDate(value: string | null | undefined) {
    if (!value) return "-";
    return new Date(value).toLocaleDateString();
  }

  const openCount = rows.filter((r) => r.status === "Open").length;
  const closedCount = rows.filter((r) => r.status === "Closed").length;

  const filteredRows = useMemo(() => {
    if (filter === "All") return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  if (loading) return <div className="p-8">Loading modifications...</div>;
  if (!tower) return <div className="p-8">Tower not found.</div>;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <TowerHeader
        projectId={projectId}
        tower={tower}
        latestDate={latestDate}
      />

      <div className="bg-white border rounded-2xl p-4 md:p-6 space-y-6">
        <div className="flex justify-between items-start gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Modifications Register</h1>
            <p className="text-slate-500 mt-1 max-w-3xl">
              Track tower modifications, site issues, photos, engineering changes,
              close-outs, and review history.
            </p>
          </div>

          <div className="flex gap-3 flex-wrap">
            <StatusCard label="Total" value={String(rows.length)} />
            <StatusCard label="Open" value={String(openCount)} />
            <StatusCard label="Closed" value={String(closedCount)} />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <FilterButton
            label="All"
            active={filter === "All"}
            onClick={() => setFilter("All")}
          />
          <FilterButton
            label="Open"
            active={filter === "Open"}
            onClick={() => setFilter("Open")}
          />
          <FilterButton
            label="Closed"
            active={filter === "Closed"}
            onClick={() => setFilter("Closed")}
          />
        </div>

        <div className="border rounded-xl p-4 bg-slate-50 space-y-4">
          <div className="text-lg font-semibold">Add Modification</div>

          <div className="grid md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
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
          </div>

          <div>
            <label className="block text-xs mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="border p-2 rounded w-full bg-white min-h-[100px]"
              placeholder="Describe the issue, modification, mismatch, rectification, engineering change, etc."
            />
          </div>

          <div>
            <label className="block text-xs mb-1">Attach Photos / Files</label>
            <input
              id="new-mod-files"
              type="file"
              multiple
              onChange={(e) => setNewFiles(Array.from(e.target.files || []))}
              className="border p-2 rounded w-full bg-white"
            />
            {newFiles.length > 0 && (
              <div className="text-sm text-slate-500 mt-2">
                {newFiles.length} file(s) selected
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={addModification}
              disabled={saving}
              className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Add Modification"}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {filteredRows.length === 0 && (
            <div className="border rounded-xl p-6 text-slate-500 text-center">
              No modifications found for this filter.
            </div>
          )}

          {filteredRows.map((row) => {
            const isEditing = editingId === row.id;
            const attachments = row.tower_modification_files || [];

            return (
              <div key={row.id} className="border rounded-2xl p-4 space-y-4">
                {!isEditing ? (
                  <>
                    <div className="flex justify-between items-start gap-4 flex-wrap">
                      <div className="space-y-1 min-w-[260px]">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="text-sm font-semibold text-blue-700">
                            {row.mod_number}
                          </div>
                          <StatusPill status={row.status} />
                        </div>

                        <div className="text-lg font-semibold">{row.title}</div>

                        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 text-sm text-slate-500 pt-1">
                          <div>Raised By: {row.raised_by || "-"}</div>
                          <div>Raised Date: {prettyDate(row.raised_date)}</div>
                          <div>Closed By: {row.closed_by || "-"}</div>
                          <div>Closed Date: {prettyDate(row.closed_date)}</div>
                          <div>Created By: {row.created_by || "-"}</div>
                          <div>Created: {prettyDate(row.created_at)}</div>
                        </div>

                        <div className="text-sm text-slate-700 pt-2 whitespace-pre-wrap">
                          {row.description || "-"}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => startEdit(row)}
                          className="border px-3 py-1.5 rounded"
                        >
                          Edit
                        </button>

                        {row.status === "Open" ? (
                          <button
                            onClick={() => closeOut(row)}
                            className="bg-red-500 text-white px-3 py-1.5 rounded"
                          >
                            Close Out
                          </button>
                        ) : (
                          <button
                            onClick={() => reopen(row)}
                            className="bg-slate-700 text-white px-3 py-1.5 rounded"
                          >
                            Reopen
                          </button>
                        )}

                        <button
                          onClick={() => deleteModification(row)}
                          className="text-red-600 px-2 py-1"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {attachments.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-slate-700">
                          Attachments
                        </div>

                        <div className="flex gap-3 flex-wrap">
                          {attachments.map((file) => {
                            const url = fileHref(file.file_path);

                            if (isImage(file)) {
                              return (
                                <div
                                  key={file.id}
                                  className="w-[120px] space-y-1"
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPreview({
                                        url,
                                        name: file.file_name || "Image",
                                        mimeType: file.mime_type || "image/*",
                                      })
                                    }
                                    className="block w-[120px] h-[120px] border rounded-xl overflow-hidden bg-slate-100"
                                  >
                                    <img
                                      src={url}
                                      alt={file.file_name || "Attachment"}
                                      className="w-full h-full object-cover"
                                    />
                                  </button>
                                  <div className="text-[11px] text-slate-500 truncate">
                                    {file.file_name || "Image"}
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <a
                                key={file.id}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="border rounded-xl px-3 py-3 text-sm hover:bg-slate-50"
                              >
                                {file.file_name || "Open file"}
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="text-sm font-semibold text-blue-700">
                      {row.mod_number}
                    </div>

                    <div className="grid md:grid-cols-4 gap-3">
                      <div className="md:col-span-2">
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
                    </div>

                    <div>
                      <label className="block text-xs mb-1">Description</label>
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="border p-2 rounded w-full min-h-[100px]"
                      />
                    </div>

                    {attachments.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Existing Attachments</div>
                        <div className="flex gap-3 flex-wrap">
                          {attachments.map((file) => {
                            const url = fileHref(file.file_path);

                            if (isImage(file)) {
                              return (
                                <div key={file.id} className="w-[120px] space-y-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPreview({
                                        url,
                                        name: file.file_name || "Image",
                                        mimeType: file.mime_type || "image/*",
                                      })
                                    }
                                    className="block w-[120px] h-[120px] border rounded-xl overflow-hidden bg-slate-100"
                                  >
                                    <img
                                      src={url}
                                      alt={file.file_name || "Attachment"}
                                      className="w-full h-full object-cover"
                                    />
                                  </button>
                                  <div className="text-[11px] text-slate-500 truncate">
                                    {file.file_name || "Image"}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => deleteAttachedFile(file)}
                                    className="text-xs text-red-600"
                                  >
                                    Delete file
                                  </button>
                                </div>
                              );
                            }

                            return (
                              <div key={file.id} className="border rounded-xl px-3 py-3 text-sm">
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600"
                                >
                                  {file.file_name || "Open file"}
                                </a>
                                <button
                                  type="button"
                                  onClick={() => deleteAttachedFile(file)}
                                  className="block text-xs text-red-600 mt-2"
                                >
                                  Delete file
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs mb-1">Add More Files</label>
                      <input
                        id="edit-mod-files"
                        type="file"
                        multiple
                        onChange={(e) => setEditFiles(Array.from(e.target.files || []))}
                        className="border p-2 rounded w-full"
                      />
                      {editFiles.length > 0 && (
                        <div className="text-sm text-slate-500 mt-2">
                          {editFiles.length} new file(s) selected
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-3">
                      <button
                        onClick={cancelEdit}
                        className="border px-4 py-2 rounded"
                      >
                        Cancel
                      </button>

                      <button
                        onClick={() => saveEdit(row)}
                        disabled={saving}
                        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="relative w-full max-w-6xl max-h-[90vh] bg-white rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-medium truncate">{preview.name}</div>
              <button
                onClick={() => setPreview(null)}
                className="border rounded px-3 py-1"
              >
                Close
              </button>
            </div>

            <div className="p-4 flex items-center justify-center bg-slate-100 max-h-[calc(90vh-65px)] overflow-auto">
              {preview.mimeType.startsWith("image/") ? (
                <img
                  src={preview.url}
                  alt={preview.name}
                  className="max-w-full max-h-[75vh] object-contain rounded"
                />
              ) : (
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600"
                >
                  Open file
                </a>
              )}
            </div>
          </div>
        </div>
      )}
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
      <div className="font-semibold text-lg">{value}</div>
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

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full border ${
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-700 border-slate-300"
      }`}
    >
      {label}
    </button>
  );
}
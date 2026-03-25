"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type TowerRow = {
  id: string;
  tower_number?: string | null;
  structure_number?: string | null;
  tower_no?: string | null;
  name?: string | null;
  progress?: number | null;
  status?: string | null;
  [key: string]: unknown;
};

type DefectRow = {
  id: string;
  tower_id: string;
  member_number: string | null;
  segment: string | null;
  description: string | null;
  severity: "Minor" | "Major" | "Critical";
  status: "Open" | "In Progress" | "Fixed" | "Closed";
  photo_url: string | null; // legacy single-photo field, still supported
  uploaded_by: string | null;
  created_at: string;
  updated_at: string | null;
  completed_by: string | null;
  completed_at: string | null;
};

type DefectPhotoRow = {
  id: string;
  defect_id: string;
  photo_path: string;
  created_at: string;
};

type DefectActionRow = {
  id: string;
  defect_id: string;
  action_note: string;
  created_by: string | null;
  created_at: string;
};

type EditFormState = {
  id: string;
  member_number: string;
  segment: string;
  description: string;
  severity: "Minor" | "Major" | "Critical";
  status: "Open" | "In Progress" | "Fixed" | "Closed";
};

export default function TowerDefectsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<TowerRow | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [rows, setRows] = useState<DefectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    member_number: "",
    segment: "",
    description: "",
    severity: "Minor" as DefectRow["severity"],
    status: "Open" as DefectRow["status"],
    files: [] as File[],
  });

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoModalTitle, setPhotoModalTitle] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState<DefectPhotoRow[]>([]);

  const [actionsModalOpen, setActionsModalOpen] = useState(false);
  const [selectedDefectForActions, setSelectedDefectForActions] = useState<DefectRow | null>(null);
  const [actions, setActions] = useState<DefectActionRow[]>([]);
  const [newAction, setNewAction] = useState("");
  const [addingAction, setAddingAction] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!towerId) return;
    void load();
  }, [towerId]);

  async function load() {
    setLoading(true);

    const [towerRes, docketRes, defectRes] = await Promise.all([
      supabase.from("towers").select("*").eq("id", towerId).single(),
      supabase
        .from("tower_daily_dockets")
        .select("docket_date")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false })
        .limit(1),
      supabase
        .from("tower_defects")
        .select("*")
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false }),
    ]);

    if (towerRes.error) console.error("Tower load error:", towerRes.error);
    if (docketRes.error) console.error("Docket load error:", docketRes.error);
    if (defectRes.error) console.error("Defect load error:", defectRes.error);

    setTower((towerRes.data as TowerRow) || null);
    setLatestDate(docketRes.data?.[0]?.docket_date || null);
    setRows(((defectRes.data || []) as DefectRow[]) ?? []);
    setLoading(false);
  }

  async function uploadFilesForDefect(defectId: string, files: File[]) {
    if (!files.length) return;

    for (const file of files) {
      const safeName = file.name.replace(/\s+/g, "_");
      const path = `${towerId}/${defectId}/${Date.now()}_${safeName}`;

      const { error: storageError } = await supabase.storage
        .from("defect-photos")
        .upload(path, file, { upsert: true });

      if (storageError) {
        console.error(storageError);
        throw new Error(`Failed to upload ${file.name}`);
      }

      const { error: insertError } = await supabase.from("defect_photos").insert({
        defect_id: defectId,
        photo_path: path,
      });

      if (insertError) {
        console.error(insertError);
        throw new Error(`Failed to save file record for ${file.name}`);
      }
    }
  }

  function resetAddForm() {
    setForm({
      member_number: "",
      segment: "",
      description: "",
      severity: "Minor",
      status: "Open",
      files: [],
    });

    const input = document.getElementById("defect-files-input") as HTMLInputElement | null;
    if (input) input.value = "";
  }

  async function saveDefect() {
    if (!towerId) {
      alert("Tower not loaded yet.");
      return;
    }

    if (!form.description.trim()) {
      alert("Enter a defect description.");
      return;
    }

    try {
      setSaving(true);

      const authRes = await supabase.auth.getUser();
      const userLabel =
        authRes.data.user?.email ||
        authRes.data.user?.user_metadata?.full_name ||
        "Unknown User";

      const legacyPhotoPath = form.files.length > 0 ? `pending` : null;

      const { data, error } = await supabase
        .from("tower_defects")
        .insert({
          tower_id: towerId,
          member_number: form.member_number.trim() || null,
          segment: form.segment.trim() || null,
          description: form.description.trim(),
          severity: form.severity,
          status: form.status,
          photo_url: legacyPhotoPath,
          uploaded_by: userLabel,
        })
        .select()
        .single();

      if (error || !data) {
        console.error(error);
        throw new Error(error?.message || "Failed to save defect.");
      }

      if (form.files.length > 0) {
        await uploadFilesForDefect(data.id, form.files);

        const firstFilePath = `${towerId}/${data.id}/`;
        const { data: photoRows } = await supabase
          .from("defect_photos")
          .select("*")
          .eq("defect_id", data.id)
          .order("created_at", { ascending: true })
          .limit(1);

        const firstPhoto = photoRows?.[0];
        if (firstPhoto?.photo_path) {
          await supabase
            .from("tower_defects")
            .update({ photo_url: firstPhoto.photo_path, updated_at: new Date().toISOString() })
            .eq("id", data.id);
        } else {
          console.log("No first photo found after upload, path prefix:", firstFilePath);
        }
      }

      resetAddForm();
      await load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to save defect.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteDefect(defect: DefectRow) {
    const confirmed = window.confirm("Delete defect and all linked photos/actions?");
    if (!confirmed) return;

    try {
      const { data: photoRows, error: photoListError } = await supabase
        .from("defect_photos")
        .select("*")
        .eq("defect_id", defect.id);

      if (photoListError) {
        console.error(photoListError);
      }

      const filePaths = (photoRows || []).map((p) => p.photo_path).filter(Boolean);

      if (filePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("defect-photos")
          .remove(filePaths);

        if (storageError) {
          console.error(storageError);
        }
      }

      const { error } = await supabase.from("tower_defects").delete().eq("id", defect.id);

      if (error) {
        console.error(error);
        throw new Error(error.message || "Failed to delete defect.");
      }

      await load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to delete defect.");
    }
  }

  function startEdit(defect: DefectRow) {
    setEditForm({
      id: defect.id,
      member_number: defect.member_number || "",
      segment: defect.segment || "",
      description: defect.description || "",
      severity: defect.severity,
      status: defect.status,
    });
    setEditModalOpen(true);
  }

  function closeEditModal() {
    setEditModalOpen(false);
    setEditForm(null);
  }

  async function saveEdit() {
    if (!editForm) return;

    if (!editForm.description.trim()) {
      alert("Enter a defect description.");
      return;
    }

    try {
      setSavingEdit(true);

      const { error } = await supabase
        .from("tower_defects")
        .update({
          member_number: editForm.member_number.trim() || null,
          segment: editForm.segment.trim() || null,
          description: editForm.description.trim(),
          severity: editForm.severity,
          status: editForm.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editForm.id);

      if (error) {
        console.error(error);
        throw new Error(error.message || "Failed to update defect.");
      }

      closeEditModal();
      await load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to update defect.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function openPhotos(defect: DefectRow) {
    try {
      const { data, error } = await supabase
        .from("defect_photos")
        .select("*")
        .eq("defect_id", defect.id)
        .order("created_at", { ascending: true });

      if (error) {
        console.error(error);
        throw new Error(error.message || "Failed to load photos.");
      }

      const photoRows = (data || []) as DefectPhotoRow[];

      // Fallback for older defects that only used photo_url
      if (!photoRows.length && defect.photo_url) {
        setSelectedPhotos([
          {
            id: "legacy-photo",
            defect_id: defect.id,
            photo_path: defect.photo_url,
            created_at: defect.created_at,
          },
        ]);
      } else {
        setSelectedPhotos(photoRows);
      }

      setPhotoModalTitle(
        `Photos - Member ${defect.member_number || "-"} / ${defect.segment || "-"}`
      );
      setPhotoModalOpen(true);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to load photos.");
    }
  }

  function closePhotosModal() {
    setPhotoModalOpen(false);
    setSelectedPhotos([]);
    setPhotoModalTitle("");
    setPreviewUrl(null);
  }

  function getPhotoPublicUrl(path: string) {
    if (path.startsWith("http://") || path.startsWith("https://")) return path;

    const { data } = supabase.storage.from("defect-photos").getPublicUrl(path);
    return data.publicUrl;
  }

  async function openActions(defect: DefectRow) {
    try {
      const { data, error } = await supabase
        .from("defect_actions")
        .select("*")
        .eq("defect_id", defect.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        throw new Error(error.message || "Failed to load actions.");
      }

      setSelectedDefectForActions(defect);
      setActions((data || []) as DefectActionRow[]);
      setNewAction("");
      setActionsModalOpen(true);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to load actions.");
    }
  }

  function closeActionsModal() {
    setActionsModalOpen(false);
    setSelectedDefectForActions(null);
    setActions([]);
    setNewAction("");
  }

  async function addAction() {
    if (!selectedDefectForActions) return;
    if (!newAction.trim()) {
      alert("Enter an action.");
      return;
    }

    try {
      setAddingAction(true);

      const authRes = await supabase.auth.getUser();
      const userLabel =
        authRes.data.user?.email ||
        authRes.data.user?.user_metadata?.full_name ||
        "Unknown User";

      const { error } = await supabase.from("defect_actions").insert({
        defect_id: selectedDefectForActions.id,
        action_note: newAction.trim(),
        created_by: userLabel,
      });

      if (error) {
        console.error(error);
        throw new Error(error.message || "Failed to add action.");
      }

      const { data, error: reloadError } = await supabase
        .from("defect_actions")
        .select("*")
        .eq("defect_id", selectedDefectForActions.id)
        .order("created_at", { ascending: false });

      if (reloadError) {
        console.error(reloadError);
      }

      setActions((data || []) as DefectActionRow[]);
      setNewAction("");
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to add action.");
    } finally {
      setAddingAction(false);
    }
  }

  async function signOffDefect(defect: DefectRow) {
    const confirmed = window.confirm("Sign off this defect as completed and close it?");
    if (!confirmed) return;

    try {
      const authRes = await supabase.auth.getUser();
      const userLabel =
        authRes.data.user?.email ||
        authRes.data.user?.user_metadata?.full_name ||
        "Unknown User";

      const { error } = await supabase
        .from("tower_defects")
        .update({
          status: "Closed",
          completed_by: userLabel,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", defect.id);

      if (error) {
        console.error(error);
        throw new Error(error.message || "Failed to sign off defect.");
      }

      await load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to sign off defect.");
    }
  }

  function prettyDateTime(value: string | null | undefined) {
    if (!value) return "-";
    return new Date(value).toLocaleString();
  }

  const stats = useMemo(() => {
    const open = rows.filter((r) => r.status === "Open").length;
    const inProgress = rows.filter((r) => r.status === "In Progress").length;
    const fixed = rows.filter((r) => r.status === "Fixed").length;
    const closed = rows.filter((r) => r.status === "Closed").length;
    return { open, inProgress, fixed, closed, total: rows.length };
  }, [rows]);

  if (loading) return <div className="p-8">Loading defects...</div>;
  if (!tower) return <div className="p-8">Tower not found.</div>;

  return (
    <div className="p-8 space-y-6">
      <TowerHeader projectId={projectId} tower={tower} latestDate={latestDate} />

      <div className="bg-white border rounded-2xl p-6 space-y-4">
        <div className="flex justify-between items-start gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Tower Defects Register</h1>
            <p className="text-slate-500 mt-1">
              Log defects, attach multiple photos, track actions, and sign off completed items.
            </p>
          </div>

          <div className="flex gap-3 flex-wrap">
            <StatCard label="Total" value={String(stats.total)} />
            <StatCard label="Open" value={String(stats.open)} />
            <StatCard label="In Progress" value={String(stats.inProgress)} />
            <StatCard label="Closed" value={String(stats.closed)} />
          </div>
        </div>

        <div className="border rounded-xl p-4 bg-slate-50 space-y-4">
          <div className="text-lg font-semibold">Log Defect</div>

          <div className="grid md:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs mb-1">Member Number</label>
              <input
                placeholder="Member Number"
                className="border p-2 rounded w-full bg-white"
                value={form.member_number}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, member_number: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="block text-xs mb-1">Segment</label>
              <input
                placeholder="Segment"
                className="border p-2 rounded w-full bg-white"
                value={form.segment}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, segment: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="block text-xs mb-1">Severity</label>
              <select
                className="border p-2 rounded w-full bg-white"
                value={form.severity}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    severity: e.target.value as DefectRow["severity"],
                  }))
                }
              >
                <option>Minor</option>
                <option>Major</option>
                <option>Critical</option>
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1">Status</label>
              <select
                className="border p-2 rounded w-full bg-white"
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    status: e.target.value as DefectRow["status"],
                  }))
                }
              >
                <option>Open</option>
                <option>In Progress</option>
                <option>Fixed</option>
                <option>Closed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1">Photos</label>
              <input
                id="defect-files-input"
                type="file"
                multiple
                className="border p-2 rounded w-full bg-white"
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    files: Array.from(e.target.files || []),
                  }))
                }
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={saveDefect}
                disabled={saving}
                className="bg-red-600 text-white rounded px-4 py-2 w-full disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1">Defect Description</label>
            <textarea
              placeholder="Defect Description"
              className="border p-2 rounded w-full bg-white min-h-[90px]"
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
            />
          </div>

          {form.files.length > 0 && (
            <div className="text-sm text-slate-500">
              {form.files.length} file(s) selected
            </div>
          )}
        </div>

        <div className="overflow-x-auto bg-white border rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3 text-left">Member</th>
                <th className="p-3 text-left">Segment</th>
                <th className="p-3 text-left">Description</th>
                <th className="p-3 text-left">Severity</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Photos</th>
                <th className="p-3 text-left">Actions</th>
                <th className="p-3 text-left">Completion</th>
                <th className="p-3 text-left">Edit</th>
                <th className="p-3 text-left">Delete</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => {
                const sevColor =
                  r.severity === "Critical"
                    ? "bg-red-100 text-red-700"
                    : r.severity === "Major"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-yellow-100 text-yellow-700";

                const statColor =
                  r.status === "Closed"
                    ? "bg-green-100 text-green-700"
                    : r.status === "Fixed"
                    ? "bg-blue-100 text-blue-700"
                    : r.status === "In Progress"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-red-100 text-red-700";

                return (
                  <tr key={r.id} className="border-t hover:bg-slate-50">
                    <td className="p-3">{r.member_number || "-"}</td>
                    <td className="p-3">{r.segment || "-"}</td>
                    <td className="p-3">{r.description || "-"}</td>

                    <td className="p-3">
                      <span className={`px-3 py-1 rounded-full text-sm ${sevColor}`}>
                        {r.severity}
                      </span>
                    </td>

                    <td className="p-3">
                      <span className={`px-3 py-1 rounded-full text-sm ${statColor}`}>
                        {r.status}
                      </span>
                    </td>

                    <td className="p-3">
                      <button
                        onClick={() => openPhotos(r)}
                        className="bg-slate-200 px-3 py-1 rounded hover:bg-slate-300"
                      >
                        View
                      </button>
                    </td>

                    <td className="p-3">
                      <button
                        onClick={() => openActions(r)}
                        className="bg-sky-200 px-3 py-1 rounded hover:bg-sky-300"
                      >
                        Open
                      </button>
                    </td>

                    <td className="p-3">
                      {r.status !== "Closed" ? (
                        <button
                          onClick={() => signOffDefect(r)}
                          className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                        >
                          Sign Off
                        </button>
                      ) : (
                        <div className="text-xs text-slate-600">
                          <div className="font-medium">Signed Off</div>
                          <div>{r.completed_by || "-"}</div>
                          <div>{prettyDateTime(r.completed_at)}</div>
                        </div>
                      )}
                    </td>

                    <td className="p-3">
                      <button
                        onClick={() => startEdit(r)}
                        className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                      >
                        Edit
                      </button>
                    </td>

                    <td className="p-3">
                      <button
                        onClick={() => deleteDefect(r)}
                        className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-slate-500">
                    No defects logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {photoModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-semibold">{photoModalTitle}</div>
              <button
                onClick={closePhotosModal}
                className="border rounded px-3 py-1"
              >
                Close
              </button>
            </div>

            <div className="p-4 overflow-auto max-h-[calc(90vh-65px)]">
              {selectedPhotos.length === 0 ? (
                <div className="text-slate-500">No photos attached to this defect.</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {selectedPhotos.map((photo) => {
                    const url = getPhotoPublicUrl(photo.photo_path);

                    return (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => setPreviewUrl(url)}
                        className="border rounded-xl overflow-hidden bg-slate-100 aspect-square"
                      >
                        <img
                          src={url}
                          alt="Defect"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {previewUrl && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4">
          <div className="relative w-full max-w-6xl max-h-[90vh] bg-white rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-medium">Photo Preview</div>
              <button
                onClick={() => setPreviewUrl(null)}
                className="border rounded px-3 py-1"
              >
                Close
              </button>
            </div>

            <div className="p-4 bg-slate-100 flex items-center justify-center max-h-[calc(90vh-65px)] overflow-auto">
              <img
                src={previewUrl}
                alt="Defect preview"
                className="max-w-full max-h-[75vh] object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}

      {actionsModalOpen && selectedDefectForActions && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <div className="font-semibold">Defect Actions</div>
                <div className="text-sm text-slate-500">
                  Member {selectedDefectForActions.member_number || "-"} /{" "}
                  {selectedDefectForActions.segment || "-"}
                </div>
              </div>
              <button
                onClick={closeActionsModal}
                className="border rounded px-3 py-1"
              >
                Close
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-auto max-h-[calc(90vh-65px)]">
              <div className="border rounded-xl p-4 bg-slate-50">
                <label className="block text-xs mb-1">Add Action</label>
                <div className="flex gap-3">
                  <input
                    className="border p-2 rounded flex-1 bg-white"
                    placeholder="Enter action / rectification note"
                    value={newAction}
                    onChange={(e) => setNewAction(e.target.value)}
                  />
                  <button
                    onClick={addAction}
                    disabled={addingAction}
                    className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
                  >
                    {addingAction ? "Adding..." : "Add"}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {actions.length === 0 && (
                  <div className="text-slate-500">No actions logged yet.</div>
                )}

                {actions.map((a) => (
                  <div key={a.id} className="border rounded-xl p-4">
                    <div className="text-sm whitespace-pre-wrap">{a.action_note}</div>
                    <div className="text-xs text-slate-500 mt-2">
                      {a.created_by || "-"} — {prettyDateTime(a.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {editModalOpen && editForm && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-semibold">Edit Defect</div>
              <button
                onClick={closeEditModal}
                className="border rounded px-3 py-1"
              >
                Close
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs mb-1">Member Number</label>
                <input
                  className="border p-2 rounded w-full"
                  value={editForm.member_number}
                  onChange={(e) =>
                    setEditForm((prev) =>
                      prev ? { ...prev, member_number: e.target.value } : prev
                    )
                  }
                />
              </div>

              <div>
                <label className="block text-xs mb-1">Segment</label>
                <input
                  className="border p-2 rounded w-full"
                  value={editForm.segment}
                  onChange={(e) =>
                    setEditForm((prev) =>
                      prev ? { ...prev, segment: e.target.value } : prev
                    )
                  }
                />
              </div>

              <div>
                <label className="block text-xs mb-1">Defect Description</label>
                <textarea
                  className="border p-2 rounded w-full min-h-[110px]"
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm((prev) =>
                      prev ? { ...prev, description: e.target.value } : prev
                    )
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1">Severity</label>
                  <select
                    className="border p-2 rounded w-full"
                    value={editForm.severity}
                    onChange={(e) =>
                      setEditForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              severity: e.target.value as EditFormState["severity"],
                            }
                          : prev
                      )
                    }
                  >
                    <option>Minor</option>
                    <option>Major</option>
                    <option>Critical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs mb-1">Status</label>
                  <select
                    className="border p-2 rounded w-full"
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              status: e.target.value as EditFormState["status"],
                            }
                          : prev
                      )
                    }
                  >
                    <option>Open</option>
                    <option>In Progress</option>
                    <option>Fixed</option>
                    <option>Closed</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={closeEditModal}
                  className="border px-4 py-2 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={savingEdit}
                  className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
                >
                  {savingEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-100 rounded-xl px-4 py-3 min-w-[110px]">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold text-lg">{value}</div>
    </div>
  );
}
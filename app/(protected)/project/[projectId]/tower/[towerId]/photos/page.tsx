"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type TowerRow = {
  id?: string;
  tower_number?: string | null;
  structure_number?: string | null;
  tower_no?: string | null;
  name?: string | null;
  progress?: number | null;
  status?: string | null;
  [key: string]: unknown;
};

type TowerPhoto = {
  id: string;
  entry_id: string;
  photo_path: string;
  created_at?: string;
};

type TowerPhotoEntry = {
  id: string;
  tower_id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  uploaded_by: string | null;
  created_at: string;
  photos: TowerPhoto[];
};

export default function TowerPhotosPage() {
  const params = useParams();
  const towerId = params.towerId as string;
  const projectId = params.projectId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<TowerRow | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);

  const [entries, setEntries] = useState<TowerPhotoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [files, setFiles] = useState<File[]>([]);

  const [preview, setPreview] = useState<string | null>(null);

  // ⭐ EDIT STATE
  const [editingEntry, setEditingEntry] = useState<TowerPhotoEntry | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("General");

  useEffect(() => {
    if (!towerId) return;
    loadPage();
  }, [towerId]);

  async function loadPage() {
    setLoading(true);

    const [towerRes, docketRes, entriesRes] = await Promise.all([
      supabase.from("towers").select("*").eq("id", towerId).single(),
      supabase
        .from("tower_daily_dockets")
        .select("docket_date")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false })
        .limit(1),
      supabase
        .from("tower_photo_entries")
        .select("*")
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false }),
    ]);

    setTower(towerRes.data || null);
    setLatestDate(docketRes.data?.[0]?.docket_date || null);

    const fullEntries: TowerPhotoEntry[] = await Promise.all(
      (entriesRes.data || []).map(async (entry: any) => {
        const { data } = await supabase
          .from("tower_photos")
          .select("*")
          .eq("entry_id", entry.id);

        return {
          ...entry,
          photos: data || [],
        };
      })
    );

    setEntries(fullEntries);
    setLoading(false);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files || []));
  }

  async function saveEntry() {
    if (!title.trim()) return alert("Enter title");
    if (files.length === 0) return alert("Select photos");

    setSaving(true);

    const { data: user } = await supabase.auth.getUser();

    const { data: entry } = await supabase
      .from("tower_photo_entries")
      .insert({
        tower_id: towerId,
        title,
        description,
        category,
        uploaded_by: user.user?.email || "Unknown",
      })
      .select()
      .single();

    for (const file of files) {
      const path = `${towerId}/${entry.id}/${Date.now()}_${file.name}`;

      await supabase.storage.from("tower-photos").upload(path, file);

      await supabase.from("tower_photos").insert({
        entry_id: entry.id,
        photo_path: path,
      });
    }

    setTitle("");
    setDescription("");
    setFiles([]);

    loadPage();
    setSaving(false);
  }

  function getPhotoUrl(path: string) {
    return supabase.storage.from("tower-photos").getPublicUrl(path).data
      .publicUrl;
  }

  // ⭐ DELETE ENTRY
  async function deleteEntry(entry: TowerPhotoEntry) {
    const confirmDelete = confirm(
      "Delete this photo entry and all images?"
    );
    if (!confirmDelete) return;

    for (const photo of entry.photos) {
      await supabase.storage.from("tower-photos").remove([photo.photo_path]);
    }

    await supabase.from("tower_photos").delete().eq("entry_id", entry.id);
    await supabase.from("tower_photo_entries").delete().eq("id", entry.id);

    loadPage();
  }

  // ⭐ OPEN EDIT
  function openEdit(entry: TowerPhotoEntry) {
    setEditingEntry(entry);
    setEditTitle(entry.title || "");
    setEditDescription(entry.description || "");
    setEditCategory(entry.category || "General");
  }

  // ⭐ SAVE EDIT
  async function saveEdit() {
    if (!editingEntry) return;

    await supabase
      .from("tower_photo_entries")
      .update({
        title: editTitle,
        description: editDescription,
        category: editCategory,
      })
      .eq("id", editingEntry.id);

    setEditingEntry(null);
    loadPage();
  }

  if (loading) return <div className="p-8">Loading...</div>;
  if (!tower) return <div className="p-8">Tower not found</div>;

  return (
    <div className="p-8 space-y-6">
      <TowerHeader
        projectId={projectId}
        tower={tower}
        latestDate={latestDate}
      />

      {/* Upload */}
      <div className="bg-white border rounded-2xl p-6">
        <div className="text-xl font-bold mb-4">Upload Photo Entry</div>

        <input
          className="border rounded-lg p-2 w-full mb-3"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          className="border rounded-lg p-2 w-full mb-3"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <input type="file" multiple onChange={handleFileChange} />

        <button
          onClick={saveEntry}
          className="bg-red-600 text-white px-5 py-2 rounded-lg ml-3"
        >
          {saving ? "Saving..." : "Save Entry"}
        </button>
      </div>

      {/* Feed */}
      {entries.map((entry) => (
        <div key={entry.id} className="bg-white border rounded-2xl p-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-bold text-lg">{entry.title}</div>
              <div className="text-sm text-slate-500">
                {entry.uploaded_by}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => openEdit(entry)}
                className="bg-blue-600 text-white px-3 py-1 rounded"
              >
                Edit
              </button>

              <button
                onClick={() => deleteEntry(entry)}
                className="bg-red-600 text-white px-3 py-1 rounded"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 mt-4">
            {entry.photos.map((p) => (
              <img
                key={p.id}
                src={getPhotoUrl(p.photo_path)}
                className="rounded-lg cursor-pointer"
                onClick={() =>
                  setPreview(getPhotoUrl(p.photo_path))
                }
              />
            ))}
          </div>
        </div>
      ))}

      {/* EDIT MODAL */}
      {editingEntry && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center">
          <div className="bg-white p-6 rounded-2xl w-[500px] space-y-3">
            <div className="font-bold text-lg">Edit Photo Entry</div>

            <input
              className="border rounded-lg p-2 w-full"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />

            <textarea
              className="border rounded-lg p-2 w-full"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />

            <select
              className="border rounded-lg p-2 w-full"
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
            >
              <option>General</option>
              <option>Assembly</option>
              <option>Erection</option>
              <option>Delivery</option>
              <option>Milestone</option>
            </select>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingEntry(null)}
                className="px-4 py-2 border rounded-lg"
              >
                Cancel
              </button>

              <button
                onClick={saveEdit}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMAGE VIEWER */}
      {preview && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center">
          <img
            src={preview}
            className="max-h-[90vh] max-w-[90vw]"
          />
          <button
            onClick={() => setPreview(null)}
            className="absolute top-6 right-6 bg-white px-4 py-2 rounded"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
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

type TowerPhotoEntryBase = {
  id: string;
  tower_id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  uploaded_by: string | null;
  created_at: string;
};

type TowerPhotoEntry = TowerPhotoEntryBase & {
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

  useEffect(() => {
    if (!towerId) return;
    void loadPage();
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

    if (towerRes.error) {
      console.error("Tower load error:", towerRes.error);
    }

    if (docketRes.error) {
      console.error("Docket load error:", docketRes.error);
    }

    if (entriesRes.error) {
      console.error("Photo entries load error:", entriesRes.error);
    }

    setTower((towerRes.data as TowerRow) || null);
    setLatestDate(docketRes.data?.[0]?.docket_date || null);

    const baseEntries = (entriesRes.data || []) as TowerPhotoEntryBase[];

    const fullEntries: TowerPhotoEntry[] = await Promise.all(
      baseEntries.map(async (entry) => {
        const { data: photoData, error: photoError } = await supabase
          .from("tower_photos")
          .select("*")
          .eq("entry_id", entry.id)
          .order("created_at", { ascending: true });

        if (photoError) {
          console.error("Photo load error:", photoError);
        }

        return {
          ...entry,
          photos: (photoData || []) as TowerPhoto[],
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
    if (!title.trim()) {
      alert("Enter a title.");
      return;
    }

    if (files.length === 0) {
      alert("Select at least one photo.");
      return;
    }

    try {
      setSaving(true);

      const authRes = await supabase.auth.getUser();
      const userLabel =
        authRes.data.user?.email ||
        authRes.data.user?.user_metadata?.full_name ||
        "Unknown User";

      const { data: entryData, error: entryError } = await supabase
        .from("tower_photo_entries")
        .insert({
          tower_id: towerId,
          title: title.trim(),
          description: description.trim() || null,
          category,
          uploaded_by: userLabel,
        })
        .select()
        .single();

      if (entryError || !entryData) {
        console.error(entryError);
        throw new Error(entryError?.message || "Failed to create photo entry.");
      }

      for (const file of files) {
        const safeName = file.name.replace(/\s+/g, "_");
        const path = `${towerId}/${entryData.id}/${Date.now()}_${safeName}`;

        const { error: storageError } = await supabase.storage
          .from("tower-photos")
          .upload(path, file, { upsert: true });

        if (storageError) {
          console.error(storageError);
          throw new Error(`Failed to upload ${file.name}`);
        }

        const { error: photoInsertError } = await supabase
          .from("tower_photos")
          .insert({
            entry_id: entryData.id,
            photo_path: path,
          });

        if (photoInsertError) {
          console.error(photoInsertError);
          throw new Error(`Failed to save file record for ${file.name}`);
        }
      }

      setTitle("");
      setDescription("");
      setCategory("General");
      setFiles([]);

      const input = document.getElementById("tower-photo-files") as HTMLInputElement | null;
      if (input) input.value = "";

      await loadPage();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to save photo entry.");
    } finally {
      setSaving(false);
    }
  }

  function getPhotoUrl(path: string) {
    return supabase.storage.from("tower-photos").getPublicUrl(path).data.publicUrl;
  }

  function categoryColour(cat: string | null) {
    switch (cat) {
      case "Assembly":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "Erection":
        return "bg-green-100 text-green-700 border-green-200";
      case "Delivery":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "Foundations":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "Safety":
        return "bg-red-100 text-red-700 border-red-200";
      case "Milestone":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  }

  if (loading) {
    return <div className="p-8">Loading photos...</div>;
  }

  if (!tower) {
    return <div className="p-8">Tower not found.</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <TowerHeader projectId={projectId} tower={tower} latestDate={latestDate} />

      {/* Upload Entry */}
      <div className="bg-white border rounded-2xl p-6 space-y-5 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold">Photo Portfolio</h1>
          <p className="text-slate-500 mt-1">
            Upload grouped site, assembly, erection, and progress photos in an
            Instagram-style timeline.
          </p>
        </div>

        <div className="border rounded-xl p-4 bg-slate-50 space-y-4">
          <div className="text-lg font-semibold">Upload Photo Entry</div>

          <div>
            <label className="block text-xs mb-1">Title</label>
            <input
              className="border rounded-lg p-2 w-full bg-white"
              placeholder="Example: Body section erection complete"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs mb-1">Description</label>
            <textarea
              className="border rounded-lg p-2 w-full bg-white min-h-[110px]"
              placeholder="Describe what these photos show..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs mb-1">Category</label>
              <select
                className="border rounded-lg p-2 w-full bg-white"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option>General</option>
                <option>Assembly</option>
                <option>Erection</option>
                <option>Delivery</option>
                <option>Foundations</option>
                <option>Safety</option>
                <option>Milestone</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs mb-1">Upload Photos</label>

              <div className="flex flex-wrap items-center gap-3">
                <label
                  htmlFor="tower-photo-files"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 cursor-pointer hover:bg-slate-50"
                >
                  Choose Photos
                </label>

                <input
                  id="tower-photo-files"
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />

                <div className="text-sm text-slate-500">
                  {files.length === 0
                    ? "No files selected"
                    : `${files.length} file(s) selected`}
                </div>
              </div>
            </div>
          </div>

          {files.length > 0 && (
            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs font-medium text-slate-500 mb-2">
                Selected Files
              </div>
              <div className="space-y-1">
                {files.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="text-sm text-slate-700">
                    {file.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={saveEntry}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Entry"}
            </button>
          </div>
        </div>
      </div>

      {/* Instagram Feed */}
      <div className="space-y-6">
        {entries.length === 0 && (
          <div className="bg-white border rounded-2xl p-8 text-center text-slate-500">
            No photo entries yet.
          </div>
        )}

        {entries.map((entry) => (
          <div
            key={entry.id}
            className="bg-white border rounded-2xl p-6 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-lg font-bold">{entry.title || "-"}</div>
                <div className="text-sm text-slate-500 mt-1">
                  {entry.uploaded_by || "-"} •{" "}
                  {new Date(entry.created_at).toLocaleDateString()}
                </div>
              </div>

              <div
                className={`px-3 py-1 rounded-full text-sm border ${categoryColour(
                  entry.category
                )}`}
              >
                {entry.category || "General"}
              </div>
            </div>

            {entry.description && (
              <div className="mt-4 text-sm text-slate-700 whitespace-pre-wrap">
                {entry.description}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
              {entry.photos.map((photo) => {
                const photoUrl = getPhotoUrl(photo.photo_path);

                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setPreview(photoUrl)}
                    className="block rounded-2xl overflow-hidden border bg-slate-100 aspect-square hover:opacity-90 transition"
                  >
                    <img
                      src={photoUrl}
                      alt="Tower photo"
                      className="w-full h-full object-cover"
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Fullscreen Viewer */}
      {preview && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <button
            onClick={() => setPreview(null)}
            className="absolute top-6 right-6 bg-white px-4 py-2 rounded-lg shadow"
          >
            Close
          </button>

          <img
            src={preview}
            alt="Preview"
            className="max-h-[85vh] max-w-[90vw] rounded-2xl"
          />
        </div>
      )}
    </div>
  );
}
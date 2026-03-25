"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type Photo = {
  id: string;
  entry_id: string;
  photo_path: string;
};

type PhotoEntry = {
  id: string;
  tower_id: string;
  title: string;
  description: string;
  category: string;
  uploaded_by: string;
  created_at: string;
  photos: Photo[];
};

export default function TowerPhotosPage() {
  const params = useParams();
  const towerId = params.towerId as string;
  const projectId = params.projectId as string;

  const supabase = createSupabaseBrowser();

  const [entries, setEntries] = useState<PhotoEntry[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    const { data, error } = await supabase
      .from("tower_photo_entries")
      .select("*")
      .eq("tower_id", towerId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    const full: PhotoEntry[] = await Promise.all(
      (data || []).map(async (entry: any) => {
        const { data: photos } = await supabase
          .from("tower_photos")
          .select("*")
          .eq("entry_id", entry.id);

        return {
          ...entry,
          photos: photos || [],
        };
      })
    );

    setEntries(full);
  }

  async function saveEntry() {
    if (!title) {
      alert("Title required");
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("tower_photo_entries")
      .insert({
        tower_id: towerId,
        title,
        description,
        category,
        uploaded_by: user?.email,
      })
      .select()
      .single();

    if (error || !data) {
      alert(error?.message);
      setSaving(false);
      return;
    }

    for (const file of files) {
      const path = `${towerId}/${data.id}/${Date.now()}-${file.name}`;

      await supabase.storage.from("tower-photos").upload(path, file);

      await supabase.from("tower_photos").insert({
        entry_id: data.id,
        photo_path: path,
      });
    }

    setTitle("");
    setDescription("");
    setFiles([]);

    await loadEntries();

    setSaving(false);
  }

  function getPhotoUrl(path: string) {
    return supabase.storage
      .from("tower-photos")
      .getPublicUrl(path).data.publicUrl;
  }

  function categoryColour(category: string) {
    switch (category) {
      case "Assembly":
        return "bg-blue-100 text-blue-700";
      case "Erection":
        return "bg-green-100 text-green-700";
      case "Delivery":
        return "bg-yellow-100 text-yellow-700";
      case "Foundations":
        return "bg-purple-100 text-purple-700";
      case "Safety":
        return "bg-red-100 text-red-700";
      case "Milestone":
        return "bg-emerald-100 text-emerald-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  }

  return (
    <div className="p-8 space-y-6">
      <TowerHeader projectId={projectId} tower={{}} latestDate={null} />

      {/* Upload Card */}
      <div className="bg-white border rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="text-xl font-semibold">Upload Photo Entry</div>

        <input
          className="border rounded-lg p-2 w-full"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          className="border rounded-lg p-2 w-full"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="flex gap-3">
          <select
            className="border rounded-lg p-2"
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

          <input
            type="file"
            multiple
            onChange={(e) =>
              setFiles(Array.from(e.target.files || []))
            }
          />
        </div>

        <button
          onClick={saveEntry}
          className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg"
        >
          {saving ? "Saving..." : "Save Entry"}
        </button>
      </div>

      {/* Instagram Feed */}
      <div className="space-y-6">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="bg-white border rounded-2xl p-6 shadow-sm"
          >
            <div className="flex justify-between items-center">
              <div>
                <div className="text-lg font-bold">{entry.title}</div>
                <div className="text-sm text-slate-500">
                  {entry.uploaded_by} •{" "}
                  {new Date(entry.created_at).toLocaleDateString()}
                </div>
              </div>

              <div
                className={`px-3 py-1 rounded-full text-sm ${categoryColour(
                  entry.category
                )}`}
              >
                {entry.category}
              </div>
            </div>

            <div className="mt-3 text-sm">{entry.description}</div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              {entry.photos.map((photo) => (
                <img
                  key={photo.id}
                  src={getPhotoUrl(photo.photo_path)}
                  onClick={() =>
                    setPreview(getPhotoUrl(photo.photo_path))
                  }
                  className="w-full h-40 object-cover rounded-xl cursor-pointer hover:opacity-80 transition"
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Fullscreen Viewer */}
      {preview && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
          <img
            src={preview}
            className="max-h-[85vh] max-w-[90vw] rounded-xl"
          />
          <button
            onClick={() => setPreview(null)}
            className="absolute top-6 right-6 bg-white px-4 py-2 rounded-lg shadow"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type TowerPhoto = {
  id: string;
  entry_id: string;
  photo_path: string;
  sort_order: number;
};

type TowerPhotoEntry = {
  id: string;
  title: string | null;
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
  photos: TowerPhoto[];
};

export default function TowerPhotosPage() {
  const params = useParams();
  const towerId = params.towerId as string;
  const projectId = params.projectId as string;

  const supabase = createSupabaseBrowser();

  const [entries, setEntries] = useState<TowerPhotoEntry[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const [dragging, setDragging] = useState<TowerPhoto | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: entryData } = await supabase
      .from("tower_photo_entries")
      .select("*")
      .eq("tower_id", towerId)
      .order("created_at", { ascending: false });

    const full = await Promise.all(
      (entryData || []).map(async (entry: any) => {
        const { data: photos } = await supabase
          .from("tower_photos")
          .select("*")
          .eq("entry_id", entry.id)
          .order("sort_order");

        return { ...entry, photos: photos || [] };
      })
    );

    setEntries(full);
  }

  function getUrl(path: string) {
    return supabase.storage.from("tower-photos").getPublicUrl(path).data
      .publicUrl;
  }

  function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files || []));
  }

  async function saveEntry() {
    if (!title) return alert("Title required");

    const { data: entry } = await supabase
      .from("tower_photo_entries")
      .insert({ tower_id: towerId, title, description })
      .select()
      .single();

    let order = 0;

    for (const file of files) {
      const path = `${towerId}/${entry.id}/${Date.now()}_${file.name}`;

      await supabase.storage.from("tower-photos").upload(path, file);

      await supabase.from("tower_photos").insert({
        entry_id: entry.id,
        photo_path: path,
        sort_order: order++,
      });
    }

    setFiles([]);
    setTitle("");
    setDescription("");

    load();
  }

  // ⭐ DELETE INDIVIDUAL PHOTO
  async function deletePhoto(photo: TowerPhoto) {
    const confirmDelete = confirm("Delete this photo?");
    if (!confirmDelete) return;

    await supabase.storage.from("tower-photos").remove([photo.photo_path]);

    await supabase.from("tower_photos").delete().eq("id", photo.id);

    load();
  }

  // ⭐ DRAG START
  function onDragStart(photo: TowerPhoto) {
    setDragging(photo);
  }

  // ⭐ DROP
  async function onDrop(
    entry: TowerPhotoEntry,
    targetPhoto: TowerPhoto
  ) {
    if (!dragging) return;

    const newPhotos = [...entry.photos];
    const from = newPhotos.findIndex((p) => p.id === dragging.id);
    const to = newPhotos.findIndex((p) => p.id === targetPhoto.id);

    const moved = newPhotos.splice(from, 1)[0];
    newPhotos.splice(to, 0, moved);

    // update UI instantly
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entry.id ? { ...e, photos: newPhotos } : e
      )
    );

    // save order
    for (let i = 0; i < newPhotos.length; i++) {
      await supabase
        .from("tower_photos")
        .update({ sort_order: i })
        .eq("id", newPhotos[i].id);
    }

    setDragging(null);
  }

  return (
    <div className="p-8 space-y-6">
      <TowerHeader projectId={projectId} tower={{}} latestDate={null} />

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

        <input type="file" multiple onChange={handleFiles} />

        <button
          onClick={saveEntry}
          className="bg-red-600 text-white px-5 py-2 rounded-lg ml-3"
        >
          Save Entry
        </button>
      </div>

      {/* Feed */}
      {entries.map((entry) => (
        <div key={entry.id} className="bg-white border rounded-2xl p-6">
          <div className="font-bold text-lg mb-3">{entry.title}</div>

          <div className="grid grid-cols-4 gap-3">
            {entry.photos.map((photo) => (
              <div
                key={photo.id}
                draggable
                onDragStart={() => onDragStart(photo)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(entry, photo)}
                className="relative"
              >
                <img
                  src={getUrl(photo.photo_path)}
                  className="rounded-lg cursor-pointer"
                  onClick={() => setPreview(getUrl(photo.photo_path))}
                />

                <button
                  onClick={() => deletePhoto(photo)}
                  className="absolute top-1 right-1 bg-red-600 text-white text-xs px-2 py-1 rounded"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Viewer */}
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
"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
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
  cover_photo_path?: string | null;
  [key: string]: unknown;
};

type TowerPhoto = {
  id: string;
  entry_id: string;
  photo_path: string;
  sort_order: number | null;
  created_at?: string | null;
};

type TowerPhotoEntryBase = {
  id: string;
  tower_id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  uploaded_by: string | null;
  is_milestone: boolean | null;
  created_at: string;
};

type TowerPhotoEntry = TowerPhotoEntryBase & {
  photos: TowerPhoto[];
};

type EditEntryState = {
  id: string;
  title: string;
  description: string;
  category: string;
  is_milestone: boolean;
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
  const [savingNewEntry, setSavingNewEntry] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [isMilestone, setIsMilestone] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const [preview, setPreview] = useState<string | null>(null);

  const [editingEntry, setEditingEntry] = useState<EditEntryState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [addingPhotosEntryId, setAddingPhotosEntryId] = useState<string | null>(null);
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [savingExtraPhotos, setSavingExtraPhotos] = useState(false);

  const [draggingPhoto, setDraggingPhoto] = useState<TowerPhoto | null>(null);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);

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
          .order("sort_order", { ascending: true });

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

  function handleNewFilesChange(e: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files || []));
  }

  function handleExtraFilesChange(e: ChangeEvent<HTMLInputElement>) {
    setExtraFiles(Array.from(e.target.files || []));
  }

  function resetNewEntryForm() {
    setTitle("");
    setDescription("");
    setCategory("General");
    setIsMilestone(false);
    setFiles([]);

    const input = document.getElementById("tower-photo-files") as HTMLInputElement | null;
    if (input) input.value = "";
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

  const coverPhotoUrl = useMemo(() => {
    if (!tower?.cover_photo_path) return null;
    return getPhotoUrl(tower.cover_photo_path);
  }, [tower]);

  async function uploadFilesToEntry(entryId: string, uploadFiles: File[]) {
    if (!uploadFiles.length) return;

    const { data: existingPhotos, error: countError } = await supabase
      .from("tower_photos")
      .select("*")
      .eq("entry_id", entryId)
      .order("sort_order", { ascending: true });

    if (countError) {
      console.error(countError);
      throw new Error("Failed to read existing photos.");
    }

    let nextOrder = existingPhotos?.length || 0;

    for (const file of uploadFiles) {
      const safeName = file.name.replace(/\s+/g, "_");
      const path = `${towerId}/${entryId}/${Date.now()}_${safeName}`;

      const { error: storageError } = await supabase.storage
        .from("tower-photos")
        .upload(path, file, { upsert: true });

      if (storageError) {
        console.error(storageError);
        throw new Error(`Failed to upload ${file.name}`);
      }

      const { error: insertError } = await supabase.from("tower_photos").insert({
        entry_id: entryId,
        photo_path: path,
        sort_order: nextOrder,
      });

      if (insertError) {
        console.error(insertError);
        throw new Error(`Failed to save file record for ${file.name}`);
      }

      nextOrder += 1;
    }
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
      setSavingNewEntry(true);

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
          is_milestone: isMilestone,
          uploaded_by: userLabel,
        })
        .select()
        .single();

      if (entryError || !entryData) {
        console.error(entryError);
        throw new Error(entryError?.message || "Failed to create photo entry.");
      }

      await uploadFilesToEntry(entryData.id, files);

      resetNewEntryForm();
      await loadPage();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to save photo entry.");
    } finally {
      setSavingNewEntry(false);
    }
  }

  function openEditModal(entry: TowerPhotoEntry) {
    setEditingEntry({
      id: entry.id,
      title: entry.title || "",
      description: entry.description || "",
      category: entry.category || "General",
      is_milestone: !!entry.is_milestone,
    });
  }

  function closeEditModal() {
    setEditingEntry(null);
  }

  async function saveEdit() {
    if (!editingEntry) return;

    if (!editingEntry.title.trim()) {
      alert("Enter a title.");
      return;
    }

    try {
      setSavingEdit(true);

      const { error } = await supabase
        .from("tower_photo_entries")
        .update({
          title: editingEntry.title.trim(),
          description: editingEntry.description.trim() || null,
          category: editingEntry.category,
          is_milestone: editingEntry.is_milestone,
        })
        .eq("id", editingEntry.id);

      if (error) {
        console.error(error);
        throw new Error(error.message || "Failed to update entry.");
      }

      closeEditModal();
      await loadPage();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to update entry.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteEntry(entry: TowerPhotoEntry) {
    const confirmed = window.confirm("Delete this entire photo entry and all of its photos?");
    if (!confirmed) return;

    try {
      setBusyEntryId(entry.id);

      const filePaths = entry.photos.map((photo) => photo.photo_path).filter(Boolean);

      if (filePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("tower-photos")
          .remove(filePaths);

        if (storageError) {
          console.error(storageError);
        }
      }

      const { error: photoDeleteError } = await supabase
        .from("tower_photos")
        .delete()
        .eq("entry_id", entry.id);

      if (photoDeleteError) {
        console.error(photoDeleteError);
        throw new Error(photoDeleteError.message || "Failed to delete entry photos.");
      }

      const { error: entryDeleteError } = await supabase
        .from("tower_photo_entries")
        .delete()
        .eq("id", entry.id);

      if (entryDeleteError) {
        console.error(entryDeleteError);
        throw new Error(entryDeleteError.message || "Failed to delete entry.");
      }

      if (tower?.cover_photo_path && entry.photos.some((p) => p.photo_path === tower.cover_photo_path)) {
        await supabase
          .from("towers")
          .update({ cover_photo_path: null })
          .eq("id", towerId);
      }

      await loadPage();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to delete entry.");
    } finally {
      setBusyEntryId(null);
    }
  }

  async function deletePhoto(entry: TowerPhotoEntry, photo: TowerPhoto) {
    const confirmed = window.confirm("Delete this photo?");
    if (!confirmed) return;

    try {
      setBusyEntryId(entry.id);

      const { error: storageError } = await supabase.storage
        .from("tower-photos")
        .remove([photo.photo_path]);

      if (storageError) {
        console.error(storageError);
      }

      const { error: rowDeleteError } = await supabase
        .from("tower_photos")
        .delete()
        .eq("id", photo.id);

      if (rowDeleteError) {
        console.error(rowDeleteError);
        throw new Error(rowDeleteError.message || "Failed to delete photo.");
      }

      if (tower?.cover_photo_path === photo.photo_path) {
        await supabase
          .from("towers")
          .update({ cover_photo_path: null })
          .eq("id", towerId);
      }

      await resequencePhotos(entry.id);
      await loadPage();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to delete photo.");
    } finally {
      setBusyEntryId(null);
    }
  }

  async function resequencePhotos(entryId: string) {
    const { data, error } = await supabase
      .from("tower_photos")
      .select("*")
      .eq("entry_id", entryId)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    const photos = (data || []) as TowerPhoto[];

    for (let i = 0; i < photos.length; i += 1) {
      await supabase
        .from("tower_photos")
        .update({ sort_order: i })
        .eq("id", photos[i].id);
    }
  }

  async function saveNewPhotoOrder(entry: TowerPhotoEntry, orderedPhotos: TowerPhoto[]) {
    for (let i = 0; i < orderedPhotos.length; i += 1) {
      await supabase
        .from("tower_photos")
        .update({ sort_order: i })
        .eq("id", orderedPhotos[i].id);
    }

    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, photos: orderedPhotos } : e))
    );
  }

  function onDragStart(photo: TowerPhoto) {
    setDraggingPhoto(photo);
  }

  async function onDrop(entry: TowerPhotoEntry, targetPhoto: TowerPhoto) {
    if (!draggingPhoto) return;
    if (draggingPhoto.id === targetPhoto.id) return;

    const currentPhotos = [...entry.photos];
    const fromIndex = currentPhotos.findIndex((p) => p.id === draggingPhoto.id);
    const toIndex = currentPhotos.findIndex((p) => p.id === targetPhoto.id);

    if (fromIndex === -1 || toIndex === -1) {
      setDraggingPhoto(null);
      return;
    }

    const moved = currentPhotos.splice(fromIndex, 1)[0];
    currentPhotos.splice(toIndex, 0, moved);

    try {
      setBusyEntryId(entry.id);
      await saveNewPhotoOrder(entry, currentPhotos);
    } catch (err) {
      console.error(err);
      alert("Failed to save photo order.");
    } finally {
      setDraggingPhoto(null);
      setBusyEntryId(null);
    }
  }

  async function addPhotosToExistingEntry() {
    if (!addingPhotosEntryId) return;

    if (extraFiles.length === 0) {
      alert("Select at least one photo.");
      return;
    }

    try {
      setSavingExtraPhotos(true);
      await uploadFilesToEntry(addingPhotosEntryId, extraFiles);

      setExtraFiles([]);
      setAddingPhotosEntryId(null);

      const input = document.getElementById("add-more-photos-input") as HTMLInputElement | null;
      if (input) input.value = "";

      await loadPage();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to add more photos.");
    } finally {
      setSavingExtraPhotos(false);
    }
  }

  async function setTowerCover(photoPath: string) {
    try {
      const { error } = await supabase
        .from("towers")
        .update({ cover_photo_path: photoPath })
        .eq("id", towerId);

      if (error) {
        console.error(error);
        throw new Error(error.message || "Failed to set cover photo.");
      }

      await loadPage();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to set tower cover photo.");
    }
  }

  async function removeTowerCover() {
  const confirmRemove = confirm("Remove tower cover photo?");
  if (!confirmRemove) return;

  await supabase
    .from("towers")
    .update({ cover_photo_path: null })
    .eq("id", towerId);

  await loadPage();
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

{coverPhotoUrl && (
  <div className="bg-white border rounded-2xl p-6 shadow-sm space-y-4">
    <div className="text-xl font-semibold">Tower Cover Photo</div>

    <div className="rounded-2xl overflow-hidden border bg-slate-100 max-w-3xl">
      <img
        src={coverPhotoUrl}
        className="w-full h-[320px] object-cover"
      />
    </div>

    <button
      onClick={removeTowerCover}
      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
    >
      Remove Cover Photo
    </button>
  </div>
)}

      <div className="bg-white border rounded-2xl p-6 space-y-5 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold">Photo Portfolio</h1>
          <p className="text-slate-500 mt-1">
            Upload grouped site, assembly, erection, and progress photos in an Instagram-style timeline.
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

          <div className="grid md:grid-cols-4 gap-4 items-end">
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

            <div>
              <label className="block text-xs mb-1">Milestone Highlight</label>
              <label className="flex items-center gap-2 border rounded-lg p-2 bg-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={isMilestone}
                  onChange={(e) => setIsMilestone(e.target.checked)}
                />
                <span className="text-sm">Mark as milestone</span>
              </label>
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
                  onChange={handleNewFilesChange}
                />

                <div className="text-sm text-slate-500">
                  {files.length === 0 ? "No files selected" : `${files.length} file(s) selected`}
                </div>
              </div>
            </div>
          </div>

          {files.length > 0 && (
            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs font-medium text-slate-500 mb-2">Selected Files</div>
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
              disabled={savingNewEntry}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg disabled:opacity-50"
            >
              {savingNewEntry ? "Saving..." : "Save Entry"}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {entries.length === 0 && (
          <div className="bg-white border rounded-2xl p-8 text-center text-slate-500">
            No photo entries yet.
          </div>
        )}

        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`bg-white border rounded-2xl p-6 shadow-sm ${
              entry.is_milestone ? "ring-2 ring-emerald-300 border-emerald-200" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-lg font-bold">{entry.title || "-"}</div>
                  {entry.is_milestone && (
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                      Milestone
                    </span>
                  )}
                </div>

                <div className="text-sm text-slate-500 mt-1">
                  {entry.uploaded_by || "-"} • {new Date(entry.created_at).toLocaleDateString()}
                </div>
              </div>

              <div
                className={`px-3 py-1 rounded-full text-sm border ${categoryColour(entry.category)}`}
              >
                {entry.category || "General"}
              </div>
            </div>

            {entry.description && (
              <div className="mt-4 text-sm text-slate-700 whitespace-pre-wrap">
                {entry.description}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-5">
              <button
                onClick={() => openEditModal(entry)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm"
              >
                Edit Entry
              </button>

              <button
                onClick={() => deleteEntry(entry)}
                disabled={busyEntryId === entry.id}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm disabled:opacity-50"
              >
                Delete Entry
              </button>

              <button
                onClick={() => {
                  setAddingPhotosEntryId(entry.id);
                  setExtraFiles([]);
                }}
                className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-sm"
              >
                Add Photos
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
              {entry.photos.map((photo) => {
                const photoUrl = getPhotoUrl(photo.photo_path);
                const isCover = tower.cover_photo_path === photo.photo_path;

                return (
                  <div
                    key={photo.id}
                    draggable
                    onDragStart={() => onDragStart(photo)}
                    onDragOver={(e: DragEvent<HTMLDivElement>) => e.preventDefault()}
                    onDrop={() => onDrop(entry, photo)}
                    className="relative rounded-2xl overflow-hidden border bg-slate-100 aspect-square"
                  >
                    <button
                      type="button"
                      onClick={() => setPreview(photoUrl)}
                      className="block w-full h-full"
                    >
                      <img
                        src={photoUrl}
                        alt="Tower photo"
                        className="w-full h-full object-cover hover:opacity-90 transition"
                      />
                    </button>

                    <div className="absolute top-2 left-2 flex flex-wrap gap-2">
                      {isCover && (
                        <span className="px-2 py-1 rounded-md text-xs font-medium bg-white/90 text-slate-800">
                          Cover
                        </span>
                      )}
                    </div>

                    <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-2">
                      <button
                        onClick={() => setTowerCover(photo.photo_path)}
                        className="bg-white/90 hover:bg-white text-slate-800 text-xs px-2 py-1 rounded"
                      >
                        Set Cover
                      </button>

                      <button
                        onClick={() => deletePhoto(entry, photo)}
                        className="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1 rounded"
                      >
                        Delete Photo
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {editingEntry && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl p-6 space-y-4">
            <div className="text-xl font-semibold">Edit Photo Entry</div>

            <div>
              <label className="block text-xs mb-1">Title</label>
              <input
                className="border rounded-lg p-2 w-full"
                value={editingEntry.title}
                onChange={(e) =>
                  setEditingEntry((prev) =>
                    prev ? { ...prev, title: e.target.value } : prev
                  )
                }
              />
            </div>

            <div>
              <label className="block text-xs mb-1">Description</label>
              <textarea
                className="border rounded-lg p-2 w-full min-h-[110px]"
                value={editingEntry.description}
                onChange={(e) =>
                  setEditingEntry((prev) =>
                    prev ? { ...prev, description: e.target.value } : prev
                  )
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs mb-1">Category</label>
                <select
                  className="border rounded-lg p-2 w-full"
                  value={editingEntry.category}
                  onChange={(e) =>
                    setEditingEntry((prev) =>
                      prev ? { ...prev, category: e.target.value } : prev
                    )
                  }
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

              <div>
                <label className="block text-xs mb-1">Milestone Highlight</label>
                <label className="flex items-center gap-2 border rounded-lg p-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingEntry.is_milestone}
                    onChange={(e) =>
                      setEditingEntry((prev) =>
                        prev ? { ...prev, is_milestone: e.target.checked } : prev
                      )
                    }
                  />
                  <span className="text-sm">Mark as milestone</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={closeEditModal}
                className="border px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {addingPhotosEntryId && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="text-xl font-semibold">Add Photos to Existing Entry</div>

            <div>
              <label className="block text-xs mb-1">Upload Photos</label>

              <div className="flex flex-wrap items-center gap-3">
                <label
                  htmlFor="add-more-photos-input"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 cursor-pointer hover:bg-slate-50"
                >
                  Choose Photos
                </label>

                <input
                  id="add-more-photos-input"
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handleExtraFilesChange}
                />

                <div className="text-sm text-slate-500">
                  {extraFiles.length === 0
                    ? "No files selected"
                    : `${extraFiles.length} file(s) selected`}
                </div>
              </div>
            </div>

            {extraFiles.length > 0 && (
              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs font-medium text-slate-500 mb-2">Selected Files</div>
                <div className="space-y-1">
                  {extraFiles.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="text-sm text-slate-700">
                      {file.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setAddingPhotosEntryId(null);
                  setExtraFiles([]);
                }}
                className="border px-4 py-2 rounded-lg"
              >
                Cancel
              </button>

              <button
                onClick={addPhotosToExistingEntry}
                disabled={savingExtraPhotos}
                className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {savingExtraPhotos ? "Uploading..." : "Add Photos"}
              </button>
            </div>
          </div>
        </div>
      )}

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
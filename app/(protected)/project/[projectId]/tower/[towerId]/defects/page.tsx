"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase";

type Defect = {
  id: string;
  member_number: string;
  segment: string;
  description: string;
  photo_url: string | null;
  uploaded_by: string;
  created_at: string;
};

export default function TowerDefectsPage({
  params,
}: {
  params: { towerId: string };
}) {
  const supabase = createSupabaseBrowser();

  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    member_number: "",
    segment: "",
    description: "",
    photo: null as File | null,
  });

  useEffect(() => {
    loadDefects();
  }, []);

  async function loadDefects() {
    setLoading(true);

    const { data } = await supabase
      .from("tower_defects")
      .select("*")
      .eq("tower_id", params.towerId)
      .order("created_at", { ascending: false });

    if (data) setDefects(data);
    setLoading(false);
  }

  async function uploadPhoto(file: File) {
    const fileName = `${Date.now()}_${file.name}`;

    const { error } = await supabase.storage
      .from("defect-photos")
      .upload(fileName, file);

    if (error) {
      alert("Photo upload failed");
      return null;
    }

    const { data } = supabase.storage
      .from("defect-photos")
      .getPublicUrl(fileName);

    return data.publicUrl;
  }

  async function saveDefect() {
    if (!form.description) {
      alert("Enter description");
      return;
    }

    setSaving(true);

    let photoUrl = null;

    if (form.photo) {
      photoUrl = await uploadPhoto(form.photo);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from("tower_defects").insert({
      tower_id: params.towerId,
      member_number: form.member_number,
      segment: form.segment,
      description: form.description,
      photo_url: photoUrl,
      uploaded_by: user?.email,
    });

    setForm({
      member_number: "",
      segment: "",
      description: "",
      photo: null,
    });

    await loadDefects();
    setSaving(false);
  }

  async function deleteDefect(id: string) {
    if (!confirm("Delete defect?")) return;

    await supabase.from("tower_defects").delete().eq("id", id);
    loadDefects();
  }

  const filtered = defects.filter(
    (d) =>
      d.member_number?.toLowerCase().includes(search.toLowerCase()) ||
      d.segment?.toLowerCase().includes(search.toLowerCase()) ||
      d.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-3xl font-bold mb-6">Tower Defects</h1>

      {/* FORM */}
      <div className="bg-white border rounded-xl p-6 mb-8 shadow">
        <h2 className="text-xl font-semibold mb-4">Log New Defect</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="font-semibold">Member Number</label>
            <input
              className="border p-2 w-full rounded mt-1"
              value={form.member_number}
              onChange={(e) =>
                setForm({ ...form, member_number: e.target.value })
              }
            />
          </div>

          <div>
            <label className="font-semibold">Segment</label>
            <input
              className="border p-2 w-full rounded mt-1"
              value={form.segment}
              onChange={(e) =>
                setForm({ ...form, segment: e.target.value })
              }
            />
          </div>

          <div>
            <label className="font-semibold">Photo Upload</label>
            <input
              type="file"
              className="border p-2 w-full rounded mt-1"
              onChange={(e) =>
                setForm({ ...form, photo: e.target.files?.[0] || null })
              }
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="font-semibold">Description</label>
          <textarea
            className="border p-2 w-full rounded mt-1"
            rows={3}
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
          />
        </div>

        <button
          onClick={saveDefect}
          disabled={saving}
          className="bg-red-600 text-white px-6 py-3 rounded-xl text-lg hover:bg-red-700"
        >
          {saving ? "Saving..." : "Save Defect"}
        </button>
      </div>

      {/* SEARCH */}
      <input
        placeholder="Search defects..."
        className="border p-3 rounded w-full mb-4"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* REGISTER */}
      {loading ? (
        <p>Loading defects...</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((d) => (
            <div
              key={d.id}
              className="border rounded-xl p-4 bg-white shadow"
            >
              <div className="flex justify-between">
                <div>
                  <p className="font-semibold text-lg">
                    Member: {d.member_number || "-"}
                  </p>
                  <p className="text-sm text-gray-600">
                    Segment: {d.segment || "-"}
                  </p>
                </div>

                <button
                  onClick={() => deleteDefect(d.id)}
                  className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300"
                >
                  Delete
                </button>
              </div>

              <p className="mt-2">{d.description}</p>

              {d.photo_url && (
                <img
                  src={d.photo_url}
                  className="mt-3 rounded max-w-xs border"
                />
              )}

              <p className="text-xs text-gray-500 mt-3">
                Uploaded by {d.uploaded_by} —{" "}
                {new Date(d.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
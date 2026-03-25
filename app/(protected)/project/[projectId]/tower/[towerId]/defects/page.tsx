"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type Defect = {
  id: string;
  member_number: string;
  segment: string;
  description: string;
  severity: string;
  status: string;
  photo_url: string | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
};

export default function TowerDefectsPage() {
  const params = useParams();

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [rows, setRows] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);

  const [preview, setPreview] = useState<string | null>(null);
  const [editing, setEditing] = useState<Defect | null>(null);

  const [form, setForm] = useState({
    member_number: "",
    segment: "",
    description: "",
    severity: "Minor",
    status: "Open",
    photo: null as File | null,
  });

  useEffect(() => {
    if (!towerId) return;
    load();
  }, [towerId]);

  async function load() {
    setLoading(true);

    const towerRes = await supabase
      .from("towers")
      .select("*")
      .eq("id", towerId)
      .single();

    setTower(towerRes.data);

    const defectRes = await supabase
      .from("tower_defects")
      .select("*")
      .eq("tower_id", towerId)
      .order("created_at", { ascending: false });

    setRows(defectRes.data || []);

    setLoading(false);
  }

  async function uploadPhoto(file: File) {
    const name = `${Date.now()}_${file.name}`;

    await supabase.storage.from("defect-photos").upload(name, file);

    const { data } = supabase.storage
      .from("defect-photos")
      .getPublicUrl(name);

    return data.publicUrl;
  }

  async function saveDefect() {
    let photoUrl = null;

    if (form.photo) photoUrl = await uploadPhoto(form.photo);

    const { data: auth } = await supabase.auth.getUser();

    const { error } = await supabase.from("tower_defects").insert({
      tower_id: towerId,
      member_number: form.member_number,
      segment: form.segment,
      description: form.description,
      severity: form.severity,
      status: form.status,
      photo_url: photoUrl,
      uploaded_by: auth.user?.email,
    });

    if (error) return alert(error.message);

    setForm({
      member_number: "",
      segment: "",
      description: "",
      severity: "Minor",
      status: "Open",
      photo: null,
    });

    load();
  }

  async function deleteDefect(id: string) {
    if (!confirm("Delete defect?")) return;
    await supabase.from("tower_defects").delete().eq("id", id);
    load();
  }

  async function updateDefect() {
    if (!editing) return;

    await supabase
      .from("tower_defects")
      .update({
        member_number: editing.member_number,
        segment: editing.segment,
        description: editing.description,
        severity: editing.severity,
        status: editing.status,
        updated_at: new Date(),
      })
      .eq("id", editing.id);

    setEditing(null);
    load();
  }

  if (loading) return <div className="p-8">Loading defects...</div>;
  if (!tower) return <div className="p-8">Tower not found.</div>;

  return (
    <div className="p-8 space-y-6">
      <TowerHeader projectId={projectId} tower={tower} />

      {/* LOG DEFECT */}
      <div className="bg-white border rounded-2xl p-6 space-y-4">
        <div className="text-xl font-semibold">Log Defect</div>

        <div className="grid md:grid-cols-6 gap-3">
          <input
            placeholder="Member"
            className="border p-2 rounded"
            value={form.member_number}
            onChange={(e) =>
              setForm({ ...form, member_number: e.target.value })
            }
          />

          <input
            placeholder="Segment"
            className="border p-2 rounded"
            value={form.segment}
            onChange={(e) =>
              setForm({ ...form, segment: e.target.value })
            }
          />

          <select
            className="border p-2 rounded"
            value={form.severity}
            onChange={(e) =>
              setForm({ ...form, severity: e.target.value })
            }
          >
            <option>Minor</option>
            <option>Major</option>
            <option>Critical</option>
          </select>

          <select
            className="border p-2 rounded"
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value })
            }
          >
            <option>Open</option>
            <option>In Progress</option>
            <option>Fixed</option>
            <option>Closed</option>
          </select>

          <input
            type="file"
            className="border p-2 rounded"
            onChange={(e) =>
              setForm({ ...form, photo: e.target.files?.[0] || null })
            }
          />

          <button
            onClick={saveDefect}
            className="bg-red-600 text-white rounded px-4"
          >
            Save
          </button>
        </div>

        <textarea
          placeholder="Description"
          className="border p-2 rounded w-full"
          value={form.description}
          onChange={(e) =>
            setForm({ ...form, description: e.target.value })
          }
        />
      </div>

      {/* REGISTER */}
      <div className="bg-white border rounded-2xl p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="p-3">Member</th>
              <th className="p-3">Segment</th>
              <th className="p-3">Description</th>
              <th className="p-3">Severity</th>
              <th className="p-3">Status</th>
              <th className="p-3">Photo</th>
              <th className="p-3">Actions</th>
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
                  <td className="p-3">{r.member_number}</td>
                  <td className="p-3">{r.segment}</td>
                  <td className="p-3">{r.description}</td>

                  <td className="p-3">
                    <span className={`px-3 py-1 rounded-full ${sevColor}`}>
                      {r.severity}
                    </span>
                  </td>

                  <td className="p-3">
                    <span className={`px-3 py-1 rounded-full ${statColor}`}>
                      {r.status}
                    </span>
                  </td>

                  <td className="p-3">
                    {r.photo_url && (
                      <button
                        onClick={() => setPreview(r.photo_url)}
                        className="bg-slate-200 px-3 py-1 rounded"
                      >
                        View
                      </button>
                    )}
                  </td>

                  <td className="p-3 flex gap-2">
                    <button
                      onClick={() => setEditing(r)}
                      className="bg-blue-600 text-white px-3 py-1 rounded"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => deleteDefect(r.id)}
                      className="bg-red-600 text-white px-3 py-1 rounded"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* IMAGE MODAL */}
      {preview && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
          <div className="bg-white p-4 rounded-xl">
            <img src={preview} className="max-h-[80vh]" />
            <button
              onClick={() => setPreview(null)}
              className="mt-4 bg-slate-800 text-white px-4 py-2 rounded"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editing && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
          <div className="bg-white p-6 rounded-xl space-y-3 w-[500px]">
            <div className="text-lg font-semibold">Edit Defect</div>

            <input
              className="border p-2 w-full"
              value={editing.member_number}
              onChange={(e) =>
                setEditing({ ...editing, member_number: e.target.value })
              }
            />

            <input
              className="border p-2 w-full"
              value={editing.segment}
              onChange={(e) =>
                setEditing({ ...editing, segment: e.target.value })
              }
            />

            <textarea
              className="border p-2 w-full"
              value={editing.description}
              onChange={(e) =>
                setEditing({ ...editing, description: e.target.value })
              }
            />

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setEditing(null)}
                className="border px-4 py-2 rounded"
              >
                Cancel
              </button>

              <button
                onClick={updateDefect}
                className="bg-blue-600 text-white px-4 py-2 rounded"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

export default function DefectsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);

  const [form, setForm] = useState({
    member: "",
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
    const { data: towerData } = await supabase
      .from("towers")
      .select("*")
      .eq("id", towerId)
      .single();

    setTower(towerData);

    const { data } = await supabase
      .from("tower_defects")
      .select("*")
      .eq("tower_id", towerId)
      .order("created_at", { ascending: false });

    setRows(data || []);
  }

  async function uploadPhoto(file: File) {
    const path = `tower-${towerId}/${Date.now()}-${file.name}`;

    const { error } = await supabase.storage
      .from("defect-photos")
      .upload(path, file);

    if (error) {
      alert(error.message);
      return null;
    }

    const { data } = supabase.storage
      .from("defect-photos")
      .getPublicUrl(path);

    console.log("PHOTO URL:", data.publicUrl);

    return data.publicUrl;
  }

  async function save() {
    let photoUrl = null;

    if (form.photo) {
      photoUrl = await uploadPhoto(form.photo);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("tower_defects").insert({
      tower_id: towerId,
      member_number: form.member,
      segment: form.segment,
      description: form.description,
      severity: form.severity,
      status: form.status,
      photo_url: photoUrl,
      uploaded_by: user?.email,
    });

    if (error) return alert(error.message);

    setForm({
      member: "",
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

  if (!tower) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 space-y-6">

      <TowerHeader projectId={projectId} tower={tower} />

      {/* LOG */}
      <div className="bg-white border rounded-xl p-6 space-y-3">
        <div className="text-xl font-semibold">Log Defect</div>

        <div className="grid grid-cols-6 gap-3">
          <input
            placeholder="Member"
            className="border p-2"
            value={form.member}
            onChange={(e) =>
              setForm({ ...form, member: e.target.value })
            }
          />

          <input
            placeholder="Segment"
            className="border p-2"
            value={form.segment}
            onChange={(e) =>
              setForm({ ...form, segment: e.target.value })
            }
          />

          <select
            className="border p-2"
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
            className="border p-2"
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
            className="border p-2"
            onChange={(e) =>
              setForm({ ...form, photo: e.target.files?.[0] || null })
            }
          />

          <button
            onClick={save}
            className="bg-red-600 text-white"
          >
            Save
          </button>
        </div>

        <textarea
          placeholder="Description"
          className="border p-2 w-full"
          value={form.description}
          onChange={(e) =>
            setForm({ ...form, description: e.target.value })
          }
        />
      </div>

      {/* TABLE */}
      <div className="bg-white border rounded-xl p-4">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2">Member</th>
              <th className="p-2">Segment</th>
              <th className="p-2">Description</th>
              <th className="p-2">Severity</th>
              <th className="p-2">Status</th>
              <th className="p-2">Photo</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-slate-50">
                <td className="p-2">{r.member_number}</td>
                <td className="p-2">{r.segment}</td>
                <td className="p-2">{r.description}</td>
                <td className="p-2">{r.severity}</td>
                <td className="p-2">{r.status}</td>

                <td className="p-2">
                  {r.photo_url && (
                    <button
                      onClick={() => {
                        console.log("OPEN IMAGE:", r.photo_url);
                        setPreview(r.photo_url);
                      }}
                      className="bg-slate-200 px-2 py-1"
                    >
                      View
                    </button>
                  )}
                </td>

                <td className="p-2 flex gap-2">
                  <button
                    onClick={() => setEditing(r)}
                    className="bg-blue-600 text-white px-2"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => deleteDefect(r.id)}
                    className="bg-red-600 text-white px-2"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* IMAGE MODAL */}
      {preview && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded">
            <img src={preview} className="max-h-[80vh]" />
            <button
              onClick={() => setPreview(null)}
              className="mt-3 bg-black text-white px-4 py-2"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editing && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded space-y-3 w-[450px]">
            <div className="font-semibold text-lg">Edit Defect</div>

            <input
              className="border p-2 w-full"
              value={editing.member_number}
              onChange={(e) =>
                setEditing({ ...editing, member_number: e.target.value })
              }
            />

            <textarea
              className="border p-2 w-full"
              value={editing.description}
              onChange={(e) =>
                setEditing({ ...editing, description: e.target.value })
              }
            />

            <select
              className="border p-2 w-full"
              value={editing.severity}
              onChange={(e) =>
                setEditing({ ...editing, severity: e.target.value })
              }
            >
              <option>Minor</option>
              <option>Major</option>
              <option>Critical</option>
            </select>

            <select
              className="border p-2 w-full"
              value={editing.status}
              onChange={(e) =>
                setEditing({ ...editing, status: e.target.value })
              }
            >
              <option>Open</option>
              <option>In Progress</option>
              <option>Fixed</option>
              <option>Closed</option>
            </select>

            <div className="flex justify-end gap-3">
              <button onClick={() => setEditing(null)}>Cancel</button>
              <button
                onClick={updateDefect}
                className="bg-blue-600 text-white px-4 py-2"
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
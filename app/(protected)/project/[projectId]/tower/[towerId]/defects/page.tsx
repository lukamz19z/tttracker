"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase";

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

export default function DefectsPage({
  params,
}: {
  params: { towerId: string; projectId: string };
}) {
  const supabase = createSupabaseBrowser();

  const [rows, setRows] = useState<Defect[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    member_number: "",
    segment: "",
    description: "",
    severity: "Minor",
    status: "Open",
    photo: null as File | null,
  });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const { data } = await supabase
      .from("tower_defects")
      .select("*")
      .eq("tower_id", params.towerId)
      .order("created_at", { ascending: false });

    if (data) setRows(data);

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

  async function save() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let photoUrl = null;

    if (form.photo) {
      photoUrl = await uploadPhoto(form.photo);
    }

    await supabase.from("tower_defects").insert({
      tower_id: params.towerId,
      member_number: form.member_number,
      segment: form.segment,
      description: form.description,
      severity: form.severity,
      status: form.status,
      photo_url: photoUrl,
      uploaded_by: user?.email,
    });

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

  async function updateField(id: string, field: string, value: any) {
    await supabase
      .from("tower_defects")
      .update({
        [field]: value,
        updated_at: new Date(),
      })
      .eq("id", id);

    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete defect?")) return;
    await supabase.from("tower_defects").delete().eq("id", id);
    load();
  }

  const filtered = rows.filter(
    (r) =>
      r.member_number?.toLowerCase().includes(search.toLowerCase()) ||
      r.segment?.toLowerCase().includes(search.toLowerCase()) ||
      r.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl">
      <h1 className="text-3xl font-bold mb-6">Tower Defects Register</h1>

      {/* FORM */}
      <div className="bg-white border rounded-xl p-6 shadow mb-8">
        <h2 className="text-xl font-semibold mb-4">Log Defect</h2>

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
            onClick={save}
            className="bg-red-600 text-white rounded px-4"
          >
            Save
          </button>
        </div>

        <textarea
          placeholder="Description..."
          className="border p-2 rounded w-full mt-3"
          value={form.description}
          onChange={(e) =>
            setForm({ ...form, description: e.target.value })
          }
        />
      </div>

      {/* SEARCH */}
      <input
        placeholder="Search..."
        className="border p-3 rounded w-full mb-4"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* TABLE */}
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="overflow-x-auto bg-white border rounded-xl shadow">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3">Member</th>
                <th className="p-3">Segment</th>
                <th className="p-3">Description</th>
                <th className="p-3">Severity</th>
                <th className="p-3">Status</th>
                <th className="p-3">Photo</th>
                <th className="p-3">Logged By</th>
                <th className="p-3">Updated</th>
                <th className="p-3"></th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.member_number}</td>
                  <td className="p-2">{r.segment}</td>
                  <td className="p-2">{r.description}</td>

                  <td className="p-2">
                    <select
                      value={r.severity}
                      onChange={(e) =>
                        updateField(r.id, "severity", e.target.value)
                      }
                    >
                      <option>Minor</option>
                      <option>Major</option>
                      <option>Critical</option>
                    </select>
                  </td>

                  <td className="p-2">
                    <select
                      value={r.status}
                      onChange={(e) =>
                        updateField(r.id, "status", e.target.value)
                      }
                    >
                      <option>Open</option>
                      <option>In Progress</option>
                      <option>Fixed</option>
                      <option>Closed</option>
                    </select>
                  </td>

                  <td className="p-2">
                    {r.photo_url && (
                      <img
                        src={r.photo_url}
                        className="w-16 h-16 object-cover rounded"
                      />
                    )}
                  </td>

                  <td className="p-2">{r.uploaded_by}</td>

                  <td className="p-2">
                    {new Date(r.updated_at).toLocaleString()}
                  </td>

                  <td className="p-2">
                    <button
                      onClick={() => remove(r.id)}
                      className="bg-gray-200 px-3 py-1 rounded"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
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

    await supabase.storage
      .from("defect-photos")
      .upload(name, file);

    const { data } = supabase.storage
      .from("defect-photos")
      .getPublicUrl(name);

    return data.publicUrl;
  }

  async function saveDefect() {
    if (!towerId) {
      alert("Tower not loaded yet");
      return;
    }

    let photoUrl = null;

    if (form.photo) {
      photoUrl = await uploadPhoto(form.photo);
    }

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

    if (error) {
      alert(error.message);
      return;
    }

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

  if (loading) return <div className="p-8">Loading defects...</div>;
  if (!tower) return <div className="p-8">Tower not found.</div>;

  return (
    <div className="p-8 space-y-6">

      <TowerHeader projectId={projectId} tower={tower} />

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

      <div className="bg-white border rounded-2xl p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="p-2">Member</th>
              <th className="p-2">Segment</th>
              <th className="p-2">Description</th>
              <th className="p-2">Severity</th>
              <th className="p-2">Status</th>
              <th className="p-2">Photo</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.member_number}</td>
                <td className="p-2">{r.segment}</td>
                <td className="p-2">{r.description}</td>
                <td className="p-2">{r.severity}</td>
                <td className="p-2">{r.status}</td>
                <td className="p-2">
                  {r.photo_url && (
                    <img src={r.photo_url} className="w-16 h-16 object-cover" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

export default function DefectsPage() {

  const params = useParams();
  const towerId = params.towerId as string;
  const projectId = params.projectId as string;

  const supabase = createSupabaseBrowser();

  const [rows, setRows] = useState<any[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);

  const [form, setForm] = useState({
    member: "",
    segment: "",
    description: "",
    severity: "Minor",
    status: "Open",
    photos: [] as File[],
  });

  useEffect(() => {
    load();
  }, [towerId]);

  async function load() {

    const { data } = await supabase
      .from("tower_defects")
      .select("*")
      .eq("tower_id", towerId)
      .order("created_at", { ascending: false });

    setRows(data || []);
  }

  async function uploadPhotos(defectId: string) {

    for (let file of form.photos) {

      const path = `${towerId}/${Date.now()}-${file.name}`;

      await supabase.storage.from("defect-photos").upload(path, file);

      await supabase.from("defect_photos").insert({
        defect_id: defectId,
        photo_path: path
      });
    }
  }

  async function saveDefect() {

    const { data: auth } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("tower_defects")
      .insert({
        tower_id: towerId,
        member_number: form.member,
        segment: form.segment,
        description: form.description,
        severity: form.severity,
        status: form.status,
        uploaded_by: auth.user?.email
      })
      .select()
      .single();

    if (error) return alert(error.message);

    await uploadPhotos(data.id);

    setForm({
      member: "",
      segment: "",
      description: "",
      severity: "Minor",
      status: "Open",
      photos: []
    });

    load();
  }

  async function loadActions(defectId: string) {

    const { data } = await supabase
      .from("defect_actions")
      .select("*")
      .eq("defect_id", defectId)
      .order("created_at", { ascending: false });

    setActions(data || []);
  }

  async function addAction(defectId: string, note: string) {

    const { data: auth } = await supabase.auth.getUser();

    await supabase.from("defect_actions").insert({
      defect_id: defectId,
      action_note: note,
      created_by: auth.user?.email
    });

    loadActions(defectId);
  }

  async function loadPhotos(defectId: string) {

    const { data } = await supabase
      .from("defect_photos")
      .select("*")
      .eq("defect_id", defectId);

    setPhotos(data || []);
  }

  return (
    <div className="p-8 space-y-6">

      <TowerHeader projectId={projectId} tower={{ id: towerId }} />

      {/* LOG DEFECT */}
      <div className="bg-white border rounded-xl p-6 space-y-3">
        <div className="text-xl font-semibold">Log Defect</div>

        <div className="grid grid-cols-6 gap-3">

          <input
            placeholder="Member Number"
            className="border p-2"
            value={form.member}
            onChange={(e)=>setForm({...form, member:e.target.value})}
          />

          <input
            placeholder="Segment"
            className="border p-2"
            value={form.segment}
            onChange={(e)=>setForm({...form, segment:e.target.value})}
          />

          <select
            className="border p-2"
            value={form.severity}
            onChange={(e)=>setForm({...form, severity:e.target.value})}
          >
            <option>Minor</option>
            <option>Major</option>
            <option>Critical</option>
          </select>

          <select
            className="border p-2"
            value={form.status}
            onChange={(e)=>setForm({...form, status:e.target.value})}
          >
            <option>Open</option>
            <option>In Progress</option>
            <option>Closed</option>
          </select>

          <input
            type="file"
            multiple
            className="border p-2"
            onChange={(e)=>setForm({...form, photos:Array.from(e.target.files || [])})}
          />

          <button
            onClick={saveDefect}
            className="bg-red-600 text-white"
          >
            Save
          </button>

        </div>

        <textarea
          placeholder="Defect Description"
          className="border p-2 w-full"
          value={form.description}
          onChange={(e)=>setForm({...form, description:e.target.value})}
        />
      </div>

      {/* DEFECT LIST */}
      <div className="bg-white border rounded-xl p-4">

        {rows.map((r)=>(
          <div key={r.id} className="border rounded-lg p-4 mb-3">

            <div className="flex justify-between">

              <div>
                <div className="font-semibold">
                  Member {r.member_number} — {r.segment}
                </div>

                <div className="text-sm text-gray-500">
                  {r.description}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={()=>loadPhotos(r.id)}
                  className="bg-slate-200 px-3 py-1"
                >
                  Photos
                </button>

                <button
                  onClick={()=>loadActions(r.id)}
                  className="bg-blue-200 px-3 py-1"
                >
                  Actions
                </button>
              </div>

            </div>

          </div>
        ))}

      </div>

      {/* PHOTO VIEWER */}
      {photos.length > 0 && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
          <div className="bg-white p-4 rounded-xl flex gap-3">

            {photos.map((p)=>{

              const { data } = supabase.storage
                .from("defect-photos")
                .getPublicUrl(p.photo_path);

              return (
                <img
                  key={p.id}
                  src={data.publicUrl}
                  className="h-40 cursor-pointer"
                  onClick={()=>setPreview(data.publicUrl)}
                />
              );
            })}

            <button onClick={()=>setPhotos([])}>Close</button>

          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center">
          <img src={preview} className="max-h-[80vh]" />
          <button onClick={()=>setPreview(null)}>Close</button>
        </div>
      )}

      {/* ACTION VIEWER */}
      {actions.length > 0 && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
          <div className="bg-white p-6 rounded-xl w-[500px] space-y-3">

            <div className="font-semibold text-lg">Defect Actions</div>

            {actions.map((a)=>(
              <div key={a.id} className="border p-2">
                <div>{a.action_note}</div>
                <div className="text-xs text-gray-500">
                  {a.created_by} — {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
            ))}

            <button onClick={()=>setActions([])}>Close</button>

          </div>
        </div>
      )}

    </div>
  );
}
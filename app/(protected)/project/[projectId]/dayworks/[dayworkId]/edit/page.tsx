"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

type Tower = {
  id: string;
  name?: string | null;
};

type Employee = {
  id: string;
  full_name: string;
  role: string | null;
  active?: boolean | null;
};

type PersonRow = {
  employee_id: string;
  employee_name: string;
  role: string;
  start_time: string;
  finish_time: string;
  total_hours: number;
  activity: string;
};

type ResourceRow = {
  resource_name: string;
  hours: string;
  activity: string;
  notes: string;
};
type DayworkPersonDbRow = {
  employee_id?: string | null;
  employee_name?: string | null;
  role?: string | null;
  start_time?: string | null;
  finish_time?: string | null;
  total_hours?: number | string | null;
  activity?: string | null;
};

type DayworkResourceDbRow = {
  resource_name?: string | null;
  hours?: number | string | null;
  activity?: string | null;
  notes?: string | null;
};
const WORK_TYPES = [
  "Steel delivery",
  "Bolt chasing",
  "Crane support",
  "Stringing support",
  "Weather delay",
  "Mobilisation",
  "Demobilisation",
  "Moving blocks",
  "Standby",
  "Rework",
  "Material handling",
  "Other",
];

const STATUSES = ["Draft", "Submitted", "Approved", "Rejected", "Invoiced"];

function calculateHours(start: string, finish: string) {
  if (!start || !finish) return 0;

  const [startHour, startMinute] = start.split(":").map(Number);
  const [finishHour, finishMinute] = finish.split(":").map(Number);

  const startTotal = startHour * 60 + startMinute;
  const finishTotal = finishHour * 60 + finishMinute;

  let diff = finishTotal - startTotal;
  if (diff < 0) diff += 24 * 60;

  return Math.max(0, Number((diff / 60).toFixed(2)));
}

export default function EditDayworkPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const dayworkId = params.dayworkId as string;
  const supabase = createSupabaseBrowser();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [docketNumber, setDocketNumber] = useState("");
  const [dayworkDate, setDayworkDate] = useState("");
  const [workType, setWorkType] = useState("Other");
  const [status, setStatus] = useState("Draft");
  const [towerId, setTowerId] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [completedBy, setCompletedBy] = useState("");
  const [comments, setComments] = useState("");

  const [towers, setTowers] = useState<Tower[]>([]);
  
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [resources, setResources] = useState<ResourceRow[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: dayworkData, error: dayworkError } = await supabase
        .from("dayworks")
        .select("*")
        .eq("id", dayworkId)
        .single();

      if (dayworkError || !dayworkData) {
        console.error("daywork load error", dayworkError);
        setLoading(false);
        return;
      }

      const { data: towerData } = await supabase
        .from("towers")
        .select("id, name")
        .eq("project_id", projectId)
        .order("name", { ascending: true });



      const { data: peopleData } = await supabase
        .from("daywork_people")
        .select("*")
        .eq("daywork_id", dayworkId);

      const { data: resourceData } = await supabase
        .from("daywork_resources")
        .select("*")
        .eq("daywork_id", dayworkId);

      setDocketNumber(dayworkData.docket_number || "");
      setDayworkDate(dayworkData.daywork_date || "");
      setWorkType(dayworkData.work_type || "Other");
      setStatus(dayworkData.status || "Draft");
      setTowerId(dayworkData.tower_id || "");
      setLocation(dayworkData.location || "");
      setDescription(dayworkData.description || "");
      setCompletedBy(dayworkData.completed_by || "");
      setComments(dayworkData.comments || "");

      setTowers((towerData as Tower[]) || []);


      setPeople(
        ((peopleData || []) as DayworkPersonDbRow[]).map((p) => ({
          employee_id: p.employee_id || "",
          employee_name: p.employee_name || "",
          role: p.role || "",
          start_time: p.start_time ? String(p.start_time).slice(0, 5) : "",
          finish_time: p.finish_time ? String(p.finish_time).slice(0, 5) : "",
          total_hours: Number(p.total_hours || 0),
          activity: p.activity || "",
        }))
      );

      setResources(
        ((resourceData || []) as DayworkResourceDbRow[]).map((r) => ({
          resource_name: r.resource_name || "",
          hours: r.hours ? String(r.hours) : "",
          activity: r.activity || "",
          notes: r.notes || "",
        }))
      );

      setLoading(false);
    }

    if (dayworkId) void load();
  }, [dayworkId, projectId, supabase]);

  const totalPersonHours = people.reduce((sum, p) => sum + Number(p.total_hours || 0), 0);
  const totalResourceHours = resources.reduce((sum, r) => sum + Number(r.hours || 0), 0);

  function updatePerson(index: number, changes: Partial<PersonRow>) {
    setPeople((prev) => {
      const next = [...prev];
      const updated = { ...next[index], ...changes };
      updated.total_hours = calculateHours(updated.start_time, updated.finish_time);
      next[index] = updated;
      return next;
    });
  }

  function addPerson() {
    setPeople((prev) => [
      ...prev,
      {
        employee_id: "",
        employee_name: "",
        role: "",
        start_time: "",
        finish_time: "",
        total_hours: 0,
        activity: "",
      },
    ]);
  }

  function removePerson(index: number) {
    setPeople((prev) => prev.filter((_, i) => i !== index));
  }

  function updateResource(index: number, changes: Partial<ResourceRow>) {
    setResources((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...changes };
      return next;
    });
  }

  function addResource() {
    setResources((prev) => [
      ...prev,
      {
        resource_name: "",
        hours: "",
        activity: "",
        notes: "",
      },
    ]);
  }

  function removeResource(index: number) {
    setResources((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveChanges() {
    setSaving(true);

    const { error: dayworkError } = await supabase
      .from("dayworks")
      .update({
        tower_id: towerId || null,
        daywork_date: dayworkDate,
        work_type: workType,
        status,
        location: location.trim() || null,
        description: description.trim(),
        completed_by: completedBy.trim() || null,
        comments: comments.trim() || null,
      })
      .eq("id", dayworkId);

    if (dayworkError) {
      alert(dayworkError.message);
      setSaving(false);
      return;
    }

    await supabase.from("daywork_people").delete().eq("daywork_id", dayworkId);
    await supabase.from("daywork_resources").delete().eq("daywork_id", dayworkId);

    const validPeople = people.filter((p) => p.employee_name.trim());

    if (validPeople.length > 0) {
      const { error } = await supabase.from("daywork_people").insert(
        validPeople.map((p) => ({
          daywork_id: dayworkId,
          employee_id: p.employee_id || null,
          employee_name: p.employee_name.trim(),
          role: p.role.trim() || null,
          start_time: p.start_time || null,
          finish_time: p.finish_time || null,
          total_hours: p.total_hours || 0,
          activity: p.activity.trim() || null,
        }))
      );

      if (error) {
        alert(error.message);
        setSaving(false);
        return;
      }
    }

    const validResources = resources.filter((r) => r.resource_name.trim());

    if (validResources.length > 0) {
      const { error } = await supabase.from("daywork_resources").insert(
        validResources.map((r) => ({
          daywork_id: dayworkId,
          resource_name: r.resource_name.trim(),
          hours: r.hours ? Number(r.hours) : 0,
          activity: r.activity.trim() || null,
          notes: r.notes.trim() || null,
        }))
      );

      if (error) {
        alert(error.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    router.push(`/project/${projectId}/dayworks/${dayworkId}`);
  }

  if (loading) return <div className="p-8">Loading daywork editor...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Edit Daywork
        </h1>
        <p className="mt-2 text-slate-600">{docketNumber}</p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
        <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-4">
          <input type="date" className="rounded-xl border border-slate-300 px-3 py-2.5" value={dayworkDate} onChange={(e) => setDayworkDate(e.target.value)} />

          <select className="rounded-xl border border-slate-300 px-3 py-2.5" value={workType} onChange={(e) => setWorkType(e.target.value)}>
            {WORK_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>

          <select className="rounded-xl border border-slate-300 px-3 py-2.5" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>

          <select className="rounded-xl border border-slate-300 px-3 py-2.5" value={towerId} onChange={(e) => setTowerId(e.target.value)}>
            <option value="">General project works</option>
            {towers.map((tower) => <option key={tower.id} value={tower.id}>{tower.name}</option>)}
          </select>

          <input className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>

        <textarea
          className="min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2.5"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex justify-between">
          <h2 className="text-xl font-bold">Personnel</h2>
          <button type="button" onClick={addPerson} className="rounded-xl border px-4 py-2 text-sm font-semibold">
            + Add Personnel
          </button>
        </div>

        {people.map((person, index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid md:grid-cols-2 xl:grid-cols-6 gap-3">
              <input
                className="rounded-xl border border-slate-300 px-3 py-2.5"
                placeholder="Employee"
                value={person.employee_name}
                onChange={(e) => updatePerson(index, { employee_name: e.target.value, employee_id: "" })}
              />
              <input className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Role" value={person.role} onChange={(e) => updatePerson(index, { role: e.target.value })} />
              <input type="time" className="rounded-xl border border-slate-300 px-3 py-2.5" value={person.start_time} onChange={(e) => updatePerson(index, { start_time: e.target.value })} />
              <input type="time" className="rounded-xl border border-slate-300 px-3 py-2.5" value={person.finish_time} onChange={(e) => updatePerson(index, { finish_time: e.target.value })} />
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-semibold">{person.total_hours.toFixed(2)}</div>
              <button type="button" onClick={() => removePerson(index)} className="rounded-xl border border-rose-200 text-rose-600">
                Remove
              </button>
            </div>
            <input className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Activity" value={person.activity} onChange={(e) => updatePerson(index, { activity: e.target.value })} />
          </div>
        ))}

        <div className="rounded-2xl border bg-slate-50 p-4">
          Total Personnel Hours: <strong>{totalPersonHours.toFixed(2)}</strong>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex justify-between">
          <h2 className="text-xl font-bold">Resources</h2>
          <button type="button" onClick={addResource} className="rounded-xl border px-4 py-2 text-sm font-semibold">
            + Add Resource
          </button>
        </div>

        {resources.map((resource, index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
              <input className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Resource" value={resource.resource_name} onChange={(e) => updateResource(index, { resource_name: e.target.value })} />
              <input type="number" className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Hours" value={resource.hours} onChange={(e) => updateResource(index, { hours: e.target.value })} />
              <input className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Activity" value={resource.activity} onChange={(e) => updateResource(index, { activity: e.target.value })} />
              <button type="button" onClick={() => removeResource(index)} className="rounded-xl border border-rose-200 text-rose-600">
                Remove
              </button>
            </div>
            <input className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Notes" value={resource.notes} onChange={(e) => updateResource(index, { notes: e.target.value })} />
          </div>
        ))}

        <div className="rounded-2xl border bg-slate-50 p-4">
          Total Resource Hours: <strong>{totalResourceHours.toFixed(2)}</strong>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Completed By" value={completedBy} onChange={(e) => setCompletedBy(e.target.value)} />
        <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Comments" value={comments} onChange={(e) => setComments(e.target.value)} />

        <div className="flex gap-3">
          <button type="button" onClick={() => router.push(`/project/${projectId}/dayworks/${dayworkId}`)} className="rounded-2xl border px-5 py-3 text-sm font-semibold">
            Cancel
          </button>
          <button type="button" disabled={saving} onClick={saveChanges} className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white">
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
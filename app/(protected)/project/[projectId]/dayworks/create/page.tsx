"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

type Project = {
  id: string;
  name: string;
  project_number?: string | null;
};

type Tower = {
  id: string;
  name?: string | null;
  line?: string | null;
  extra_data?: Record<string, unknown> | null;
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

function getTowerName(tower: Tower) {
  return tower.name || "Unnamed Tower";
}

function getEmployeeName(employee: Employee) {
  return employee.full_name || "Unnamed Employee";
}

function calculateHours(start: string, finish: string) {
  if (!start || !finish) return 0;

  const [startHour, startMinute] = start.split(":").map(Number);
  const [finishHour, finishMinute] = finish.split(":").map(Number);

  if (
    !Number.isFinite(startHour) ||
    !Number.isFinite(startMinute) ||
    !Number.isFinite(finishHour) ||
    !Number.isFinite(finishMinute)
  ) {
    return 0;
  }

  const startTotal = startHour * 60 + startMinute;
  const finishTotal = finishHour * 60 + finishMinute;

  let diff = finishTotal - startTotal;
  if (diff < 0) diff += 24 * 60;

  return Math.max(0, Number((diff / 60).toFixed(2)));
}

function buildDocketNumber(projectNumber: string, sequenceNo: number) {
  return `${projectNumber}-DW-${String(sequenceNo).padStart(4, "0")}`;
}

export default function CreateDayworkPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const supabase = createSupabaseBrowser();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [project, setProject] = useState<Project | null>(null);
  const [towers, setTowers] = useState<Tower[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  

  const [sequenceNo, setSequenceNo] = useState(1);
  const [dayworkDate, setDayworkDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [workType, setWorkType] = useState("Steel delivery");
  const [towerId, setTowerId] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [completedBy, setCompletedBy] = useState("");
  const [comments, setComments] = useState("");

  const [people, setPeople] = useState<PersonRow[]>([
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

  const [resources, setResources] = useState<ResourceRow[]>([
    {
      resource_name: "",
      hours: "",
      activity: "",
      notes: "",
    },
  ]);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .select("id, name, project_number")
        .eq("id", projectId)
        .single();

      if (projectError) console.error("project load error", projectError);

      const { data: towerData, error: towerError } = await supabase
        .from("towers")
        .select("id, name, line, extra_data")
        .eq("project_id", projectId)
        .order("name", { ascending: true });

      if (towerError) console.error("tower load error", towerError);

      const { data: employeeData, error: employeeError } = await supabase
        .from("employees")
        .select("id, full_name, role, active")
        .eq("active", true)
        .order("full_name", { ascending: true });

      if (employeeError) console.error("employee load error", employeeError);

      const { data: latestDaywork, error: sequenceError } = await supabase
        .from("dayworks")
        .select("sequence_no")
        .eq("project_id", projectId)
        .order("sequence_no", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sequenceError) console.error("sequence load error", sequenceError);

      setProject((projectData as Project) || null);
      setTowers((towerData as Tower[]) || []);
      setEmployees((employeeData as Employee[]) || []);

      const nextSequence = latestDaywork?.sequence_no
        ? Number(latestDaywork.sequence_no) + 1
        : 1;

      setSequenceNo(nextSequence);
      setLoading(false);
    }

    if (projectId) void load();
  }, [projectId, supabase]);

  const docketNumber = useMemo(() => {
    const projectNumber = project?.project_number || "PROJECT-NUMBER";
    return buildDocketNumber(projectNumber, sequenceNo);
  }, [project?.project_number, sequenceNo]);


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

  async function saveDaywork(status: "Draft" | "Submitted") {
    if (!project) return;

    if (!project.project_number) {
      alert("Project number is missing. Add the project number before creating dayworks.");
      return;
    }

    if (!description.trim()) {
      alert("Add a short description of the work completed.");
      return;
    }

    setSaving(true);

    const { data: daywork, error: dayworkError } = await supabase
      .from("dayworks")
      .insert([
        {
          project_id: projectId,
          tower_id: towerId || null,
          docket_number: docketNumber,
          sequence_no: sequenceNo,
          daywork_date: dayworkDate,
          work_type: workType,
          location: location.trim() || null,
          description: description.trim(),
          completed_by: completedBy.trim() || null,
          comments: comments.trim() || null,
          status,
        },
      ])
      .select("id")
      .single();

    if (dayworkError || !daywork) {
      console.error("daywork save error", dayworkError);
      alert(dayworkError?.message || "Failed to save daywork.");
      setSaving(false);
      return;
    }

    const validPeople = people.filter((person) => person.employee_name.trim());

    if (validPeople.length > 0) {
      const { error: peopleError } = await supabase.from("daywork_people").insert(
        validPeople.map((person) => ({
          daywork_id: daywork.id,
          employee_id: person.employee_id || null,
          employee_name: person.employee_name.trim(),
          role: person.role.trim() || null,
          start_time: person.start_time || null,
          finish_time: person.finish_time || null,
          total_hours: person.total_hours || 0,
          activity: person.activity.trim() || null,
        }))
      );

      if (peopleError) {
        console.error("people save error", peopleError);
        alert(peopleError.message);
        setSaving(false);
        return;
      }
    }

    const validResources = resources.filter((resource) =>
      resource.resource_name.trim()
    );

    if (validResources.length > 0) {
      const { error: resourcesError } = await supabase
        .from("daywork_resources")
        .insert(
          validResources.map((resource) => ({
            daywork_id: daywork.id,
            resource_name: resource.resource_name.trim(),
            hours: resource.hours ? Number(resource.hours) : 0,
            activity: resource.activity.trim() || null,
            notes: resource.notes.trim() || null,
          }))
        );

      if (resourcesError) {
        console.error("resources save error", resourcesError);
        alert(resourcesError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    router.push(`/project/${projectId}/dayworks`);
  }

  const totalPersonHours = people.reduce(
    (sum, person) => sum + person.total_hours,
    0
  );

  const totalResourceHours = resources.reduce((sum, resource) => {
    const value = Number(resource.hours || 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  if (loading) {
    return <div className="p-8">Loading dayworks docket...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
<div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
  <div>
    <div className="flex items-center gap-3 mb-3">
      <button
        type="button"
        onClick={() => router.push(`/project/${projectId}/dayworks`)}
        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
      >
        ← Back
      </button>
    </div>

    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
      Create Daywork Docket
    </h1>

    <p className="mt-2 text-slate-600">
      Record the work completed, personnel involved, hours worked and resources used.
    </p>
  </div>

  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
    <div className="text-xs uppercase tracking-wide text-slate-500">
      Docket Number
    </div>

    <div className="mt-1 text-lg font-black text-slate-900">
      {docketNumber}
    </div>
  </div>
</div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-bold text-slate-900">Docket Details</h2>

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Date</label>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              value={dayworkDate}
              onChange={(e) => setDayworkDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Work Type</label>
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              value={workType}
              onChange={(e) => setWorkType(e.target.value)}
            >
              {WORK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

<div>
  <label className="block text-xs text-slate-500 mb-1">
    Tower / Area
  </label>

  <select
    className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
    value={towerId}
    onChange={(e) => setTowerId(e.target.value)}
  >
    <option value="">
      General project works
    </option>

    {towers.map((tower) => (
      <option key={tower.id} value={tower.id}>
        {getTowerName(tower)}
      </option>
    ))}
  </select>

  <p className="mt-1 text-xs text-slate-400">
    Optional — select a tower if the work was tied to a specific location.
  </p>
</div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Location</label>
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              placeholder="e.g. T13 pad, laydown yard"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Work completed</label>
          <textarea
            className="min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2.5"
            placeholder="Example: Moved crane blocks from T13 to T14 and assisted with crane mobilisation."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Personnel Involved</h2>
            <p className="mt-1 text-sm text-slate-600">
              Select employees and record the time spent on this work.
            </p>
          </div>

          <button
            type="button"
            onClick={addPerson}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            + Add Personnel
          </button>
        </div>



        <div className="space-y-3">
          {people.map((person, index) => (
            <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid md:grid-cols-2 xl:grid-cols-6 gap-3">
                <div className="xl:col-span-2 relative">
                  <label className="block text-xs text-slate-500 mb-1">Employee</label>
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                    placeholder="Search employee..."
                    value={person.employee_name}
                    onChange={(e) =>
                      updatePerson(index, {
                        employee_id: "",
                        employee_name: e.target.value,
                        role: "",
                      })
                    }
                  />

                  {person.employee_name && !person.employee_id && (
                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                      {employees
                        .filter((employee) =>
                          [employee.full_name, employee.role]
                            .join(" ")
                            .toLowerCase()
                            .includes(person.employee_name.toLowerCase())
                        )
                        .slice(0, 8)
                        .map((employee) => (
                          <button
                            key={employee.id}
                            type="button"
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onClick={() =>
                              updatePerson(index, {
                                employee_id: employee.id,
                                employee_name: getEmployeeName(employee),
                                role: employee.role || "",
                              })
                            }
                          >
                            <div className="font-medium text-slate-900">
                              {getEmployeeName(employee)}
                            </div>
                            {employee.role && (
                              <div className="text-xs text-slate-500">
                                {employee.role}
                              </div>
                            )}
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">Role</label>
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                    value={person.role}
                    onChange={(e) => updatePerson(index, { role: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">Start</label>
                  <input
                    type="time"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                    value={person.start_time}
                    onChange={(e) => updatePerson(index, { start_time: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">Finish</label>
                  <input
                    type="time"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                    value={person.finish_time}
                    onChange={(e) => updatePerson(index, { finish_time: e.target.value })}
                  />
                </div>


                <div>
                  <label className="block text-xs text-slate-500 mb-1">Total</label>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-semibold text-slate-900">
                    {person.total_hours.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid md:grid-cols-[1fr_auto] gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Activity</label>
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                    placeholder="e.g. Truck unloading, bolt chasing, moving blocks"
                    value={person.activity}
                    onChange={(e) => updatePerson(index, { activity: e.target.value })}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => removePerson(index)}
                  disabled={people.length === 1}
                  className="self-end rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Total Personnel Hours
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {totalPersonHours.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Resources Used</h2>
            <p className="mt-1 text-sm text-slate-600">
              Record plant, equipment, trucks or other resources used for the work.
            </p>
          </div>

          <button
            type="button"
            onClick={addResource}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            + Add Resource
          </button>
        </div>

        <div className="space-y-3">
          {resources.map((resource, index) => (
            <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Resource</label>
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                    placeholder="e.g. Telehandler, Crane, Truck"
                    value={resource.resource_name}
                    onChange={(e) =>
                      updateResource(index, { resource_name: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">Hours Used</label>
                  <input
                    type="number"
                    step="0.25"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                    value={resource.hours}
                    onChange={(e) => updateResource(index, { hours: e.target.value })}
                  />
                </div>

                <div className="xl:col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">Activity</label>
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                    placeholder="e.g. Steel unloading, crane block relocation"
                    value={resource.activity}
                    onChange={(e) =>
                      updateResource(index, { activity: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="mt-3 grid md:grid-cols-[1fr_auto] gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Notes</label>
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                    value={resource.notes}
                    onChange={(e) => updateResource(index, { notes: e.target.value })}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => removeResource(index)}
                  disabled={resources.length === 1}
                  className="self-end rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Total Resource Hours
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {totalResourceHours.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Completion</h2>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Completed By</label>
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              value={completedBy}
              onChange={(e) => setCompletedBy(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Comments</label>
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => saveDaywork("Draft")}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Draft"}
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => saveDaywork("Submitted")}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? "Submitting..." : "Submit Daywork"}
          </button>
        </div>
      </div>
    </div>
  );
}
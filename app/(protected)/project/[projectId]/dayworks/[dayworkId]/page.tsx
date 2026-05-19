"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

type Daywork = {
  id: string;
  project_id: string;
  tower_id?: string | null;
  docket_number: string;
  daywork_date: string;
  work_type: string;
  location?: string | null;
  description?: string | null;
  completed_by?: string | null;
  comments?: string | null;
  status: string;
};

type PersonRow = {
  id: string;
  employee_name: string;
  role?: string | null;
  start_time?: string | null;
  finish_time?: string | null;
  total_hours?: number | null;
  activity?: string | null;
};

type ResourceRow = {
  id: string;
  resource_name: string;
  hours?: number | null;
  activity?: string | null;
  notes?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-AU");
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  return value.slice(0, 5);
}

export default function ViewDayworkPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const dayworkId = params.dayworkId as string;
  const supabase = createSupabaseBrowser();

  const [loading, setLoading] = useState(true);
  const [daywork, setDaywork] = useState<Daywork | null>(null);
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

      if (dayworkError) console.error("daywork load error", dayworkError);

      const { data: peopleData, error: peopleError } = await supabase
        .from("daywork_people")
        .select("*")
        .eq("daywork_id", dayworkId);

      if (peopleError) console.error("people load error", peopleError);

      const { data: resourceData, error: resourceError } = await supabase
        .from("daywork_resources")
        .select("*")
        .eq("daywork_id", dayworkId);

      if (resourceError) console.error("resources load error", resourceError);

      setDaywork((dayworkData as Daywork) || null);
      setPeople((peopleData as PersonRow[]) || []);
      setResources((resourceData as ResourceRow[]) || []);
      setLoading(false);
    }

    if (dayworkId) void load();
  }, [dayworkId, supabase]);

  const totalPeopleHours = people.reduce((sum, p) => sum + Number(p.total_hours || 0), 0);
  const totalResourceHours = resources.reduce((sum, r) => sum + Number(r.hours || 0), 0);

  if (loading) return <div className="p-8">Loading daywork...</div>;

  if (!daywork) {
    return (
      <div className="p-8">
        <p>Daywork not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {daywork.docket_number}
            </h1>
            <p className="mt-2 text-slate-600">{daywork.work_type}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/project/${projectId}/dayworks`}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold hover:bg-slate-50"
            >
              Back
            </Link>

            <Link
              href={`/project/${projectId}/dayworks/${dayworkId}/edit`}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Edit
            </Link>
          </div>
        </div>

        <div className="mt-6 grid md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Date</div>
            <div className="mt-1 font-semibold text-slate-900">{formatDate(daywork.daywork_date)}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Status</div>
            <div className="mt-1 font-semibold text-slate-900">{daywork.status}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Location</div>
            <div className="mt-1 font-semibold text-slate-900">{daywork.location || "-"}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Completed By</div>
            <div className="mt-1 font-semibold text-slate-900">{daywork.completed_by || "-"}</div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Work Completed</h2>
        <p className="mt-4 whitespace-pre-wrap text-slate-700">
          {daywork.description || "-"}
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Personnel</h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-3 pr-4">Name</th>
                <th className="py-3 pr-4">Role</th>
                <th className="py-3 pr-4">Start</th>
                <th className="py-3 pr-4">Finish</th>
                <th className="py-3 pr-4">Hours</th>
                <th className="py-3 pr-4">Activity</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-4 font-semibold">{p.employee_name}</td>
                  <td className="py-3 pr-4">{p.role || "-"}</td>
                  <td className="py-3 pr-4">{formatTime(p.start_time)}</td>
                  <td className="py-3 pr-4">{formatTime(p.finish_time)}</td>
                  <td className="py-3 pr-4">{Number(p.total_hours || 0).toFixed(2)}</td>
                  <td className="py-3 pr-4">{p.activity || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total Personnel Hours</div>
          <div className="mt-1 text-2xl font-bold">{totalPeopleHours.toFixed(2)}</div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Resources</h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-3 pr-4">Resource</th>
                <th className="py-3 pr-4">Hours</th>
                <th className="py-3 pr-4">Activity</th>
                <th className="py-3 pr-4">Notes</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-4 font-semibold">{r.resource_name}</td>
                  <td className="py-3 pr-4">{Number(r.hours || 0).toFixed(2)}</td>
                  <td className="py-3 pr-4">{r.activity || "-"}</td>
                  <td className="py-3 pr-4">{r.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total Resource Hours</div>
          <div className="mt-1 text-2xl font-bold">{totalResourceHours.toFixed(2)}</div>
        </div>
      </div>

      {daywork.comments && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Comments</h2>
          <p className="mt-4 text-slate-700">{daywork.comments}</p>
        </div>
      )}
    </div>
  );
}
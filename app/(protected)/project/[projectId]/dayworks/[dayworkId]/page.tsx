"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

type Daywork = {
  id: string;
  project_id: string;
  tower_id?: string | null;
  source_type?: string | null;
  source_docket_id?: string | null;
  source_tower_id?: string | null;
  docket_number: string;
  daywork_date: string;
  work_type: string;
  work_type_code?: string | null;
  delay_code?: string | null;
  delay_hours?: number | null;
  location?: string | null;
  description?: string | null;
  completed_by?: string | null;
  comments?: string | null;
  commercial_status?: string | null;
  commercial_classification?: string | null;
  status: string;
};

type PersonRow = {
  id: string;
  employee_name: string;
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

function extractField(text: string | null | undefined, key: string) {
  if (!text) return "-";

  const line = text
    .split("\n")
    .find((x) => x.toLowerCase().startsWith(key.toLowerCase()));

  const value = line?.split(":").slice(1).join(":").trim();

  return value || "-";
}

function extractSummary(text: string | null | undefined) {
  if (!text) return "-";

  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.includes(":"));

  return firstLine || "-";
}

function statusClass(status: string) {
  const s = status.toLowerCase();

  if (s === "approved") return "bg-emerald-100 text-emerald-700";
  if (s === "submitted") return "bg-blue-100 text-blue-700";
  if (s === "invoiced") return "bg-purple-100 text-purple-700";
  if (s === "rejected") return "bg-rose-100 text-rose-700";

  return "bg-slate-100 text-slate-700";
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
        .select("id, employee_name, start_time, finish_time, total_hours, activity")
        .eq("daywork_id", dayworkId)
        .order("employee_name", { ascending: true });

      if (peopleError) console.error("people load error", peopleError);

      const { data: resourceData, error: resourceError } = await supabase
        .from("daywork_resources")
        .select("id, resource_name, hours, activity, notes")
        .eq("daywork_id", dayworkId)
        .order("resource_name", { ascending: true });

      if (resourceError) console.error("resources load error", resourceError);

      setDaywork((dayworkData as Daywork) || null);
      setPeople((peopleData as PersonRow[]) || []);
      setResources((resourceData as ResourceRow[]) || []);
      setLoading(false);
    }

    if (dayworkId) void load();
  }, [dayworkId, supabase]);

  const totalPeopleHours = useMemo(() => {
    return people.reduce((sum, p) => sum + Number(p.total_hours || 0), 0);
  }, [people]);

  const totalResourceHours = useMemo(() => {
    return resources.reduce((sum, r) => sum + Number(r.hours || 0), 0);
  }, [resources]);

  const summary = extractSummary(daywork?.description);
  const reason = extractField(daywork?.description, "Reason");
  const labourImpact = extractField(daywork?.description, "Labour affected");
  const plantImpact = extractField(daywork?.description, "Plant affected");

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

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700">
                {daywork.work_type_code ? `${daywork.work_type_code} - ` : ""}
                {daywork.work_type}
              </span>

              <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(daywork.status)}`}>
                {daywork.status}
              </span>

              {daywork.source_type === "daily_docket_delay" && (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700">
                  Linked Daily Docket
                </span>
              )}
            </div>
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
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Date
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {formatDate(daywork.daywork_date)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Location
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {daywork.location || "-"}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Completed By
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {daywork.completed_by || "-"}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Commercial Status
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {daywork.commercial_status || "Pending Review"}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              Work Summary
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Captured details for commercial review and traceability.
            </p>
          </div>

          <div className="rounded-full bg-blue-100 px-4 py-2">
            <span className="text-xs font-bold uppercase tracking-wide text-blue-700">
              {daywork.work_type}
            </span>
          </div>
        </div>

        <div className="mt-6 grid md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <div className="text-xs uppercase tracking-wide text-blue-600">
              Delay Hours
            </div>
            <div className="mt-2 text-3xl font-black text-slate-900">
              {Number(daywork.delay_hours || 0).toFixed(2)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Personnel
            </div>
            <div className="mt-2 text-3xl font-black text-slate-900">
              {people.length}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Personnel Hours
            </div>
            <div className="mt-2 text-3xl font-black text-slate-900">
              {totalPeopleHours.toFixed(2)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Resource Hours
            </div>
            <div className="mt-2 text-3xl font-black text-slate-900">
              {totalResourceHours.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="mt-6 grid lg:grid-cols-[1.1fr_0.9fr] gap-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
              Summary
            </div>
            <div className="text-base font-semibold text-slate-900">
              {summary}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
              Reason
            </div>
            <div className="text-base font-semibold text-slate-900">
              {reason}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
              Labour Impact
            </div>
            <div className="text-base font-semibold text-slate-900">
              {labourImpact}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
              Plant Impact
            </div>
            <div className="text-base font-semibold text-slate-900">
              {plantImpact}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Personnel</h2>
            <p className="mt-1 text-sm text-slate-500">
              Labour copied from the source docket or entered manually on this daywork.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Total Personnel Hours
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {totalPeopleHours.toFixed(2)}
            </div>
          </div>
        </div>

        {people.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
            No personnel rows recorded.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Start</th>
                  <th className="py-3 pr-4">Finish</th>
                  <th className="py-3 pr-4">Hours</th>
                  <th className="py-3 pr-4">Activity</th>
                </tr>
              </thead>

              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4 font-semibold text-slate-900">
                      {p.employee_name}
                    </td>
                    <td className="py-3 pr-4">{formatTime(p.start_time)}</td>
                    <td className="py-3 pr-4">{formatTime(p.finish_time)}</td>
                    <td className="py-3 pr-4 font-semibold">
                      {Number(p.total_hours || 0).toFixed(2)}
                    </td>
                    <td className="py-3 pr-4">{p.activity || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Resources</h2>
            <p className="mt-1 text-sm text-slate-500">
              Plant, equipment, trucks, cranes or other resources attached to this daywork.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Total Resource Hours
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {totalResourceHours.toFixed(2)}
            </div>
          </div>
        </div>

        {resources.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
            No resources recorded.
          </div>
        ) : (
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
                    <td className="py-3 pr-4 font-semibold text-slate-900">
                      {r.resource_name}
                    </td>
                    <td className="py-3 pr-4 font-semibold">
                      {Number(r.hours || 0).toFixed(2)}
                    </td>
                    <td className="py-3 pr-4">{r.activity || "-"}</td>
                    <td className="py-3 pr-4">{r.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

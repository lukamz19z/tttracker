"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

type Daywork = {
  id: string;
  project_id: string;
  tower_id?: string | null;
  docket_number: string;
  sequence_no: number;
  daywork_date: string;
  work_type: string;
  location?: string | null;
  description?: string | null;
  completed_by?: string | null;
  status: string;
  created_at?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-AU");
}

function statusClass(status: string) {
  const s = status.toLowerCase();

  if (s === "approved") return "bg-emerald-100 text-emerald-700";
  if (s === "submitted") return "bg-blue-100 text-blue-700";
  if (s === "invoiced") return "bg-purple-100 text-purple-700";
  if (s === "rejected") return "bg-rose-100 text-rose-700";

  return "bg-slate-100 text-slate-700";
}

export default function DayworksRegisterPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const supabase = createSupabaseBrowser();

  const [loading, setLoading] = useState(true);
  const [dayworks, setDayworks] = useState<Daywork[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadDayworks() {
      setLoading(true);

      const { data, error } = await supabase
        .from("dayworks")
        .select("*")
        .eq("project_id", projectId)
        .order("sequence_no", { ascending: false });

      if (error) {
        console.error("dayworks load error", error);
      }

      setDayworks((data as Daywork[]) || []);
      setLoading(false);
    }

    if (projectId) void loadDayworks();
  }, [projectId, supabase]);

  const filteredDayworks = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return dayworks;

    return dayworks.filter((dw) => {
      const text = [
        dw.docket_number,
        dw.work_type,
        dw.location,
        dw.description,
        dw.completed_by,
        dw.status,
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(q);
    });
  }, [dayworks, search]);

  const totalDraft = dayworks.filter((d) => d.status === "Draft").length;
  const totalSubmitted = dayworks.filter((d) => d.status === "Submitted").length;
  const totalApproved = dayworks.filter((d) => d.status === "Approved").length;

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Dayworks
            </h1>

            <p className="mt-2 text-slate-600">
              Record site dayworks including work completed, personnel, hours and resources used.
            </p>
          </div>

          <Link
            href={`/project/${projectId}/dayworks/create`}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Create Daywork
          </Link>
        </div>

        <div className="mt-6 grid md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Total
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {dayworks.length}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Draft
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {totalDraft}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Submitted
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {totalSubmitted}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Approved
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {totalApproved}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Dayworks Register
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Search by docket number, work type, location or status.
            </p>
          </div>

          <input
            className="w-full md:w-80 rounded-2xl border border-slate-300 px-4 py-3 text-sm"
            placeholder="Search dayworks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="mt-6 text-slate-500">Loading dayworks...</div>
        ) : filteredDayworks.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-slate-500">
            No dayworks found.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-3 pr-4 font-medium">Docket No.</th>
                  <th className="py-3 pr-4 font-medium">Date</th>
                  <th className="py-3 pr-4 font-medium">Work Type</th>
                  <th className="py-3 pr-4 font-medium">Location</th>
                  <th className="py-3 pr-4 font-medium">Completed By</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                </tr>
              </thead>

              <tbody>
                {filteredDayworks.map((dw) => (
                  <tr key={dw.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4 font-semibold text-slate-900">
                      {dw.docket_number}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {formatDate(dw.daywork_date)}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {dw.work_type}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {dw.location || "-"}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {dw.completed_by || "-"}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(dw.status)}`}>
                        {dw.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
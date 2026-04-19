"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

type Tower = {
  id: string;
  name?: string | null;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
  tower_number?: string | null;
  structure_number?: string | null;
  tower_no?: string | null;
  extra_data?: Record<string, unknown> | null;
};

type StatusFilter = "All" | "Not Started" | "In Progress" | "Complete";

function getTowerLabel(tower: Tower) {
  return (
    tower.tower_number ||
    tower.structure_number ||
    tower.tower_no ||
    tower.name ||
    "Unnamed Tower"
  );
}

function normalizeStatus(status?: string | null): Exclude<StatusFilter, "All"> {
  const value = (status || "").trim().toLowerCase();

  if (value === "complete" || value === "completed") return "Complete";
  if (value === "in progress") return "In Progress";
  return "Not Started";
}

function formatLabel(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function getStatusBadgeClasses(status: string) {
  if (status === "Complete") {
    return "bg-green-50 text-green-700 border-green-200";
  }
  if (status === "In Progress") {
    return "bg-blue-50 text-blue-700 border-blue-200";
  }
  return "bg-slate-50 text-slate-700 border-slate-200";
}

export default function TowersPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [towers, setTowers] = useState<Tower[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    async function run() {
      setLoading(true);

      const { data, error } = await supabase
        .from("towers")
        .select("*")
        .eq("project_id", projectId)
        .order("name");

      if (cancelled) return;

      if (error) {
        console.error(error);
        setTowers([]);
        setLoading(false);
        return;
      }

      setTowers((data as Tower[]) || []);
      setLoading(false);
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [projectId, supabase]);

  const summary = useMemo(() => {
    const total = towers.length;
    const complete = towers.filter(
      (t) => normalizeStatus(t.status) === "Complete"
    ).length;
    const inProgress = towers.filter(
      (t) => normalizeStatus(t.status) === "In Progress"
    ).length;
    const notStarted = towers.filter(
      (t) => normalizeStatus(t.status) === "Not Started"
    ).length;

    const avgProgress =
      total > 0
        ? Math.round(
            towers.reduce((sum, t) => sum + Number(t.progress || 0), 0) / total
          )
        : 0;

    return {
      total,
      complete,
      inProgress,
      notStarted,
      avgProgress,
    };
  }, [towers]);

  const dynamicColumns = useMemo(() => {
    const counts = new Map<string, number>();

    towers.forEach((tower) => {
      const extra = tower.extra_data;
      if (!extra) return;

      Object.keys(extra).forEach((key) => {
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key]) => key);
  }, [towers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return towers.filter((tower) => {
      const status = normalizeStatus(tower.status);

      if (statusFilter !== "All" && status !== statusFilter) {
        return false;
      }

      if (!q) return true;

      const baseFields = [
        getTowerLabel(tower),
        tower.name || "",
        tower.line || "",
        status,
        String(tower.progress || 0),
      ];

      const extraFields = tower.extra_data
        ? Object.values(tower.extra_data).map((v) => formatValue(v))
        : [];

      return [...baseFields, ...extraFields].some((value) =>
        value.toLowerCase().includes(q)
      );
    });
  }, [towers, search, statusFilter]);

  if (loading) {
    return <div className="p-8">Loading towers...</div>;
  }

  return (
    <div className="p-8 w-full space-y-6">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Towers</h1>
          <p className="text-slate-500 mt-1">
            View, search and open tower assets for this project.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {towers.length > 0 && (
            <Link
              href={`/project/${projectId}/towers/import`}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg"
            >
              Re-upload Towers
            </Link>
          )}
        </div>
      </div>

      {towers.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Total Towers" value={String(summary.total)} />
          <SummaryCard
            label="In Progress"
            value={String(summary.inProgress)}
            tone="blue"
          />
          <SummaryCard
            label="Complete"
            value={String(summary.complete)}
            tone="green"
          />
          <SummaryCard
            label="Avg Progress"
            value={`${summary.avgProgress}%`}
            tone="slate"
          />
        </div>
      )}

      {towers.length > 0 && (
        <div className="bg-white border rounded-2xl p-4 md:p-5 space-y-4">
          <div className="flex gap-3 flex-wrap items-center">
            <input
              className="border rounded-lg px-3 py-2 w-full md:w-80"
              placeholder="Search tower, line, status, imported fields..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              className="border rounded-lg px-3 py-2"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="All">All Statuses</option>
              <option value="Not Started">Not Started</option>
              <option value="In Progress">In Progress</option>
              <option value="Complete">Complete</option>
            </select>

            <div className="text-sm text-slate-500 md:ml-auto">
              Showing <span className="font-medium">{filtered.length}</span> of{" "}
              <span className="font-medium">{towers.length}</span> towers
            </div>
          </div>
        </div>
      )}

      {towers.length === 0 && (
        <div className="bg-white border rounded-2xl p-14 text-center">
          <h2 className="text-xl font-semibold mb-2">No towers imported yet</h2>
          <p className="text-slate-500 mb-6">
            Import your project tower CSV to start tracking progress, defects,
            dockets and deliveries.
          </p>

          <Link
            href={`/project/${projectId}/towers/import`}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg"
          >
            Import Towers
          </Link>
        </div>
      )}

      {towers.length > 0 && (
        <div className="bg-white border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3 text-left">Tower</th>
                  <th className="p-3 text-left">Line</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Progress</th>
                  {dynamicColumns.map((column) => (
                    <th key={column} className="p-3 text-left">
                      {formatLabel(column)}
                    </th>
                  ))}
                  <th className="p-3 text-left">Open</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((tower) => {
                  const status = normalizeStatus(tower.status);
                  const progress = Number(tower.progress || 0);

                  return (
                    <tr
                      key={tower.id}
                      className="border-t hover:bg-slate-50 transition-colors"
                    >
                      <td className="p-3">
                        <div className="font-semibold">{getTowerLabel(tower)}</div>
                        {tower.name && tower.name !== getTowerLabel(tower) && (
                          <div className="text-xs text-slate-500 mt-1">
                            {tower.name}
                          </div>
                        )}
                      </td>

                      <td className="p-3">{tower.line || "-"}</td>

                      <td className="p-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${getStatusBadgeClasses(
                            status
                          )}`}
                        >
                          {status}
                        </span>
                      </td>

                      <td className="p-3 min-w-[180px]">
                        <div className="flex items-center justify-between gap-3 text-sm mb-1">
                          <span className="text-slate-500">Progress</span>
                          <span className="font-medium">{progress}%</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className={`h-2.5 rounded-full ${
                              progress >= 100
                                ? "bg-green-600"
                                : progress > 0
                                ? "bg-blue-600"
                                : "bg-slate-300"
                            }`}
                            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                          />
                        </div>
                      </td>

                      {dynamicColumns.map((column) => (
                        <td key={column} className="p-3">
                          {formatValue(tower.extra_data?.[column])}
                        </td>
                      ))}

                      <td className="p-3">
                        <Link
                          href={`/project/${projectId}/tower/${tower.id}`}
                          className="inline-flex items-center rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={5 + dynamicColumns.length}
                      className="p-10 text-center text-slate-500"
                    >
                      No towers match your search or filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "blue" | "green" | "slate";
}) {
  const classes: Record<typeof tone, string> = {
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    green: "border-green-200 bg-green-50 text-green-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
  };

  return (
    <div className={`border rounded-2xl p-4 ${classes[tone]}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
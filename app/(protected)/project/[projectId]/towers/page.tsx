"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import { getUserRole } from "@/lib/roles";

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
type UserRole = "admin" | "editor" | "viewer" | string | null;

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

function getStatusBadgeClasses(status: string) {
  if (status === "Complete") {
    return "bg-green-50 text-green-700 border-green-200";
  }
  if (status === "In Progress") {
    return "bg-blue-50 text-blue-700 border-blue-200";
  }
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function getTowerType(tower: Tower) {
  const extra = tower.extra_data || {};

  const candidates = [
    extra["type"],
    extra["Type"],
    extra["tower_type"],
    extra["Tower Type"],
    extra["tower type"],
  ];

  const found = candidates.find(
    (value) => value !== null && value !== undefined && String(value).trim() !== ""
  );

  return found ? String(found) : "-";
}

export default function TowersPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [towers, setTowers] = useState<Tower[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [role, setRole] = useState<UserRole>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canManageTowers = role === "admin" || role === "editor";

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      const userRole = await getUserRole();
      if (!cancelled) {
        setRole(userRole);
      }
    }

    loadRole();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return towers.filter((tower) => {
      const status = normalizeStatus(tower.status);

      if (statusFilter !== "All" && status !== statusFilter) {
        return false;
      }

      if (!q) return true;

      const searchableFields = [
        getTowerLabel(tower),
        tower.name || "",
        tower.line || "",
        status,
        String(tower.progress || 0),
        getTowerType(tower),
      ];

      return searchableFields.some((value) =>
        value.toLowerCase().includes(q)
      );
    });
  }, [towers, search, statusFilter]);

  async function handleDeleteTower(tower: Tower) {
    const label = getTowerLabel(tower);

    const confirmed = window.confirm(
      `Delete tower "${label}"?\n\nThis may also remove related records depending on your database relationships.`
    );

    if (!confirmed) return;

    setDeletingId(tower.id);

    try {
      const { error } = await supabase.from("towers").delete().eq("id", tower.id);

      if (error) {
        throw error;
      }

      setTowers((prev) => prev.filter((t) => t.id !== tower.id));
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to delete tower.");
    } finally {
      setDeletingId(null);
    }
  }

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
          {canManageTowers && towers.length > 0 && (
            <Link
              href={`/project/${projectId}/towers/new`}
              className="border px-4 py-2 rounded-lg hover:bg-slate-50"
            >
              Add Tower
            </Link>
          )}

          {canManageTowers && towers.length > 0 && (
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
              className="border rounded-lg px-3 py-2 w-full md:w-96"
              placeholder="Search tower, line, status or type..."
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

          <div className="flex justify-center gap-3 flex-wrap">
            {canManageTowers ? (
              <>
                <Link
                  href={`/project/${projectId}/towers/new`}
                  className="border px-6 py-3 rounded-lg hover:bg-slate-50"
                >
                  Add Tower Manually
                </Link>
                <Link
                  href={`/project/${projectId}/towers/import`}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg"
                >
                  Import Towers
                </Link>
              </>
            ) : (
              <div className="text-slate-500">
                No towers available for this project yet.
              </div>
            )}
          </div>
        </div>
      )}

      {towers.length > 0 && (
        <div className="bg-white border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3 text-left">Tower</th>
                  <th className="p-3 text-left">Type</th>
                  <th className="p-3 text-left">Line</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Progress</th>
                  <th className="p-3 text-left">Open</th>
                  {canManageTowers && (
                    <th className="p-3 text-left">Delete</th>
                  )}
                </tr>
              </thead>

              <tbody>
                {filtered.map((tower) => {
                  const status = normalizeStatus(tower.status);
                  const progress = Number(tower.progress || 0);
                  const label = getTowerLabel(tower);

                  return (
                    <tr
                      key={tower.id}
                      className="border-t hover:bg-slate-50 transition-colors"
                    >
                      <td className="p-3">
                        <div className="font-semibold">{label}</div>
                        {tower.name && tower.name !== label && (
                          <div className="text-xs text-slate-500 mt-1">
                            {tower.name}
                          </div>
                        )}
                      </td>

                      <td className="p-3">{getTowerType(tower)}</td>

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
                            style={{
                              width: `${Math.max(0, Math.min(100, progress))}%`,
                            }}
                          />
                        </div>
                      </td>

                      <td className="p-3">
                        <Link
                          href={`/project/${projectId}/tower/${tower.id}`}
                          className="inline-flex items-center rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
                        >
                          Open
                        </Link>
                      </td>

                      {canManageTowers && (
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => handleDeleteTower(tower)}
                            disabled={deletingId === tower.id}
                            className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-2 text-sm font-medium hover:bg-red-100 disabled:opacity-60"
                          >
                            {deletingId === tower.id ? "Deleting..." : "Delete"}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={canManageTowers ? 7 : 6}
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
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Search, ShieldAlert, TriangleAlert } from "lucide-react";

import { createSupabaseBrowser } from "@/lib/supabase";

type TowerRow = {
  id: string;
  name: string | null;
  line: string | null;
  extra_data?: Record<string, unknown> | null;
};

type DefectRow = {
  id: string;
  tower_id: string;
  defect_number?: string | null;
  issue_type_id?: string | null;
  member_number?: string | null;
  segment?: string | null;
  drawing_number?: string | null;
  description?: string | null;
  severity?: string | null;
  status?: string | null;
  assigned_to_label?: string | null;
  created_at?: string | null;
};

function safe(value: unknown) {
  return value == null ? "" : String(value);
}

function towerLabel(tower: TowerRow | undefined) {
  if (!tower) return "Unknown tower";
  const extra = tower.extra_data || {};
  return (
    safe(extra["Tower Number"]) ||
    safe(extra["tower_number"]) ||
    safe(extra["Structure Number"]) ||
    safe(extra["structure_number"]) ||
    safe(tower.name) ||
    "Unnamed tower"
  );
}

function severityClasses(value: string | null | undefined) {
  if (value === "Critical") return "border-red-200 bg-red-50 text-red-700";
  if (value === "Major") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function statusClasses(value: string | null | undefined) {
  if (value === "Closed" || value === "Fixed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (value === "In Progress") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function ProjectDefectsPage() {
  const params = useParams();
  const projectId = String(params.projectId || "");
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [towers, setTowers] = useState<TowerRow[]>([]);
  const [defects, setDefects] = useState<DefectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [towerId, setTowerId] = useState("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [towerRes, defectRes] = await Promise.all([
        supabase
          .from("towers")
          .select("id,name,line,extra_data")
          .eq("project_id", projectId),
        supabase
          .from("tower_defects")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      if (towerRes.error || defectRes.error) {
        setError(
          towerRes.error?.message ||
            defectRes.error?.message ||
            "Project defects could not be loaded.",
        );
      }

      setTowers((towerRes.data || []) as TowerRow[]);
      setDefects((defectRes.data || []) as DefectRow[]);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, supabase]);

  const towerById = useMemo(
    () => new Map(towers.map((tower) => [tower.id, tower])),
    [towers],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return defects.filter((defect) => {
      if (towerId && defect.tower_id !== towerId) return false;
      if (status && defect.status !== status) return false;
      if (severity && defect.severity !== severity) return false;
      if (!q) return true;

      return [
        towerLabel(towerById.get(defect.tower_id)),
        defect.defect_number,
        defect.member_number,
        defect.segment,
        defect.drawing_number,
        defect.description,
        defect.assigned_to_label,
      ]
        .map(safe)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [defects, search, severity, status, towerById, towerId]);

  const open = defects.filter(
    (defect) => !["Closed", "Fixed"].includes(safe(defect.status)),
  ).length;
  const critical = defects.filter((defect) => defect.severity === "Critical").length;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
          Quality
        </div>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
          Defects
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Project-wide defect register. Tower pages remain the detailed capture
          and evidence workflow.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric icon={TriangleAlert} label="Total defects" value={defects.length} />
        <Metric icon={ShieldAlert} label="Open / active" value={open} />
        <Metric icon={TriangleAlert} label="Critical" value={critical} />
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Tower">
            <select
              value={towerId}
              onChange={(event) => setTowerId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">All towers</option>
              {[...towers]
                .sort((a, b) =>
                  towerLabel(a).localeCompare(towerLabel(b), undefined, {
                    numeric: true,
                    sensitivity: "base",
                  }),
                )
                .map((tower) => (
                  <option key={tower.id} value={tower.id}>
                    {towerLabel(tower)}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Status">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">All statuses</option>
              {Array.from(new Set(defects.map((row) => safe(row.status)).filter(Boolean)))
                .sort()
                .map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Severity">
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">All severities</option>
              {Array.from(
                new Set(defects.map((row) => safe(row.severity)).filter(Boolean)),
              )
                .sort()
                .map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Search">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-3 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Defect, member, drawing..."
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
          </Field>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="font-black text-slate-950">Project defect register</div>
          <div className="mt-1 text-xs text-slate-500">
            {loading ? "Loading..." : `${filtered.length} records shown`}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading defects…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">
            No defects match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-black">Defect</th>
                  <th className="px-5 py-3 font-black">Tower</th>
                  <th className="px-5 py-3 font-black">Location / member</th>
                  <th className="px-5 py-3 font-black">Description</th>
                  <th className="px-5 py-3 font-black">Severity</th>
                  <th className="px-5 py-3 font-black">Status</th>
                  <th className="px-5 py-3 font-black">Assigned</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((defect) => (
                  <tr
                    key={defect.id}
                    className="border-t border-slate-100 align-top hover:bg-slate-50"
                  >
                    <td className="px-5 py-4 font-black text-slate-950">
                      {defect.defect_number || "Defect"}
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-900">
                      {towerLabel(towerById.get(defect.tower_id))}
                    </td>
                    <td className="px-5 py-4">
                      {[defect.segment, defect.member_number, defect.drawing_number]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="max-w-md px-5 py-4 text-slate-600">
                      {defect.description || "—"}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-black ${severityClasses(
                          defect.severity,
                        )}`}
                      >
                        {defect.severity || "—"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusClasses(
                          defect.status,
                        )}`}
                      >
                        {defect.status || "Open"}
                      </span>
                    </td>
                    <td className="px-5 py-4">{defect.assigned_to_label || "—"}</td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/project/${projectId}/tower/${defect.tower_id}/defects`}
                        className="font-black text-blue-600 hover:underline"
                      >
                        Open tower
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof TriangleAlert;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
        <Icon size={16} />
        {label}
      </div>
      <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}

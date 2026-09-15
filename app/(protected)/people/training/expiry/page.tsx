"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Download,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";
import { trainingDaysUntil } from "@/lib/training/compliance";

type Employee = {
  id: string;
  payroll_id: string | null;
  full_name: string;
  role: string | null;
  crew_id: string | null;
  active: boolean | null;
};

type Crew = {
  id: string;
  crew_number: string | null;
  crew_name: string | null;
};

type Project = {
  id: string;
  name: string;
  project_number: string | null;
};

type TrainingType = {
  id: string;
  name: string;
  category: string | null;
};

type TrainingRecord = {
  id: string;
  employee_id: string;
  training_type_id: string | null;
  training_name: string;
  certificate_number: string | null;
  provider: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  does_not_expire: boolean | null;
  workflow_status: string | null;
  record_status: string | null;
  current_version: boolean | null;
  superseded_at: string | null;
  revoked_at: string | null;
  project_id: string | null;
};

type ExpiryBand =
  | "all"
  | "expired"
  | "7"
  | "14"
  | "30"
  | "60"
  | "90"
  | "no_expiry"
  | "pending";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function crewLabel(crew?: Crew | null) {
  if (!crew) return "Unassigned";
  const number = clean(crew.crew_number);
  const name = clean(crew.crew_name);
  if (number && name) return `Crew ${number} · ${name}`;
  if (number) return `Crew ${number}`;
  return name || "Unassigned";
}

function bandFor(record: TrainingRecord): ExpiryBand {
  const workflow = clean(record.workflow_status);

  if (
    workflow === "pending_review" ||
    workflow === "changes_required"
  ) {
    return "pending";
  }

  if (record.does_not_expire) return "no_expiry";

  const days = trainingDaysUntil(record.expiry_date);
  if (days === null) return "all";
  if (days < 0) return "expired";
  if (days <= 7) return "7";
  if (days <= 14) return "14";
  if (days <= 30) return "30";
  if (days <= 60) return "60";
  if (days <= 90) return "90";
  return "all";
}

function withinBand(record: TrainingRecord, band: ExpiryBand) {
  if (band === "all") return true;

  if (band === "pending") {
    return ["pending_review", "changes_required"].includes(
      clean(record.workflow_status),
    );
  }

  if (band === "no_expiry") return Boolean(record.does_not_expire);

  const days = trainingDaysUntil(record.expiry_date);
  if (days === null) return false;

  if (band === "expired") return days < 0;

  const limit = Number(band);
  return days >= 0 && days <= limit;
}

function urgencyClasses(record: TrainingRecord) {
  if (
    ["pending_review", "changes_required"].includes(
      clean(record.workflow_status),
    )
  ) {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }

  if (record.does_not_expire) {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  const days = trainingDaysUntil(record.expiry_date);

  if (days === null) {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }
  if (days < 0) {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  if (days <= 30) {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  if (days <= 90) {
    return "border-yellow-200 bg-yellow-50 text-yellow-900";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function statusText(record: TrainingRecord) {
  const workflow = clean(record.workflow_status);
  if (workflow === "pending_review") return "Pending Review";
  if (workflow === "changes_required") return "Changes Required";
  if (record.does_not_expire) return "Does not expire";

  const days = trainingDaysUntil(record.expiry_date);
  if (days === null) return "No expiry date";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "Expires today";
  return `${days} days remaining`;
}

function csv(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function TrainingExpiryDashboardPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [types, setTypes] = useState<TrainingType[]>([]);
  const [records, setRecords] = useState<TrainingRecord[]>([]);

  const [band, setBand] = useState<ExpiryBand>("all");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [crewFilter, setCrewFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    const [
      employeeResult,
      crewResult,
      projectResult,
      typeResult,
      recordResult,
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id,payroll_id,full_name,role,crew_id,active")
        .eq("active", true)
        .order("full_name"),
      supabase
        .from("crews")
        .select("id,crew_number,crew_name")
        .order("crew_number"),
      supabase
        .from("projects")
        .select("id,name,project_number")
        .order("name"),
      supabase
        .from("training_types")
        .select("id,name,category")
        .eq("active", true)
        .order("name"),
      supabase
        .from("employee_training_records")
        .select(
          "id,employee_id,training_type_id,training_name,certificate_number,provider,issue_date,expiry_date,does_not_expire,workflow_status,record_status,current_version,superseded_at,revoked_at,project_id",
        ),
    ]);

    const firstError = [
      employeeResult.error,
      crewResult.error,
      projectResult.error,
      typeResult.error,
      recordResult.error,
    ].find(Boolean);

    if (firstError) throw new Error(firstError.message);

    setEmployees((employeeResult.data ?? []) as Employee[]);
    setCrews((crewResult.data ?? []) as Crew[]);
    setProjects((projectResult.data ?? []) as Project[]);
    setTypes((typeResult.data ?? []) as TrainingType[]);
    setRecords((recordResult.data ?? []) as TrainingRecord[]);
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      try {
        await loadData();
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the expiry dashboard.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData]);

  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );

  const crewById = useMemo(
    () => new Map(crews.map((crew) => [crew.id, crew])),
    [crews],
  );

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const activeRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          record.current_version !== false &&
          !record.superseded_at &&
          !record.revoked_at &&
          clean(record.workflow_status) !== "rejected",
      ),
    [records],
  );

  const counts = useMemo(() => {
    const expiringWithin = (days: number) =>
      activeRecords.filter((record) => {
        if (record.does_not_expire) return false;
        const remaining = trainingDaysUntil(record.expiry_date);
        return (
          remaining !== null &&
          remaining >= 0 &&
          remaining <= days
        );
      }).length;

    return {
      expired: activeRecords.filter((record) => {
        const remaining = trainingDaysUntil(record.expiry_date);
        return (
          !record.does_not_expire &&
          remaining !== null &&
          remaining < 0
        );
      }).length,
      seven: expiringWithin(7),
      fourteen: expiringWithin(14),
      thirty: expiringWithin(30),
      sixty: expiringWithin(60),
      ninety: expiringWithin(90),
      noExpiry: activeRecords.filter(
        (record) => record.does_not_expire,
      ).length,
      pending: activeRecords.filter((record) =>
        ["pending_review", "changes_required"].includes(
          clean(record.workflow_status),
        ),
      ).length,
    };
  }, [activeRecords]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return activeRecords
      .filter((record) => {
        const employee = employeeById.get(record.employee_id);
        if (!employee) return false;

        if (!withinBand(record, band)) return false;

        if (
          projectFilter !== "all" &&
          record.project_id !== projectFilter
        ) {
          return false;
        }

        if (
          typeFilter !== "all" &&
          record.training_type_id !== typeFilter
        ) {
          return false;
        }

        if (
          crewFilter !== "all" &&
          (employee.crew_id || "unassigned") !== crewFilter
        ) {
          return false;
        }

        if (!query) return true;

        const crew = employee.crew_id
          ? crewById.get(employee.crew_id)
          : null;
        const project = record.project_id
          ? projectById.get(record.project_id)
          : null;

        return [
          employee.full_name,
          employee.payroll_id,
          employee.role,
          crewLabel(crew),
          record.training_name,
          record.certificate_number,
          record.provider,
          project?.name,
          project?.project_number,
          statusText(record),
        ]
          .map(clean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const aDays = a.does_not_expire
          ? Number.MAX_SAFE_INTEGER
          : trainingDaysUntil(a.expiry_date) ??
            Number.MAX_SAFE_INTEGER;
        const bDays = b.does_not_expire
          ? Number.MAX_SAFE_INTEGER
          : trainingDaysUntil(b.expiry_date) ??
            Number.MAX_SAFE_INTEGER;

        return aDays - bDays;
      });
  }, [
    activeRecords,
    band,
    crewById,
    crewFilter,
    employeeById,
    projectById,
    projectFilter,
    search,
    typeFilter,
  ]);

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      await loadData();
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to refresh expiry data.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  function exportCsv() {
    const headers = [
      "Employee",
      "Payroll ID",
      "Role",
      "Crew",
      "Training",
      "Certificate Number",
      "Provider",
      "Issue Date",
      "Expiry Date",
      "Days Remaining",
      "Project",
      "Status",
    ];

    const rows = filtered.map((record) => {
      const employee = employeeById.get(record.employee_id);
      const crew = employee?.crew_id
        ? crewById.get(employee.crew_id)
        : null;
      const project = record.project_id
        ? projectById.get(record.project_id)
        : null;

      return [
        employee?.full_name,
        employee?.payroll_id,
        employee?.role,
        crewLabel(crew),
        record.training_name,
        record.certificate_number,
        record.provider,
        record.issue_date,
        record.does_not_expire
          ? "Does not expire"
          : record.expiry_date,
        record.does_not_expire
          ? ""
          : trainingDaysUntil(record.expiry_date) ?? "",
        project
          ? `${
              project.project_number
                ? `${project.project_number} - `
                : ""
            }${project.name}`
          : "",
        statusText(record),
      ];
    });

    const content = [
      headers.map(csv).join(","),
      ...rows.map((row) => row.map(csv).join(",")),
    ].join("\n");

    const blob = new Blob([content], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `training-expiry-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 size={30} className="animate-spin text-slate-400" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 sm:px-6">
        <Link
          href="/people/training"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-black text-slate-700"
        >
          <ArrowLeft size={16} />
          Back to Training
        </Link>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-amber-700">
                <CalendarClock size={17} />
                Renewal risk
              </div>
              <h1 className="mt-2 text-3xl font-black text-slate-950">
                Expiry Dashboard
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                See what is expired, what is coming due and which submitted
                renewals are still waiting for verification.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"
              >
                <RefreshCw
                  size={16}
                  className={refreshing ? "animate-spin" : ""}
                />
                Refresh
              </button>
              <button
                type="button"
                onClick={exportCsv}
                disabled={filtered.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"
              >
                <Download size={16} />
                Export CSV
              </button>
              <Link
                href="/people/training/planner"
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-black text-white"
              >
                Plan Training
              </Link>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <BandCard
            label="Expired"
            value={counts.expired}
            active={band === "expired"}
            onClick={() => setBand("expired")}
            danger
          />
          <BandCard
            label="≤ 7 days"
            value={counts.seven}
            active={band === "7"}
            onClick={() => setBand("7")}
          />
          <BandCard
            label="≤ 14 days"
            value={counts.fourteen}
            active={band === "14"}
            onClick={() => setBand("14")}
          />
          <BandCard
            label="≤ 30 days"
            value={counts.thirty}
            active={band === "30"}
            onClick={() => setBand("30")}
          />
          <BandCard
            label="≤ 60 days"
            value={counts.sixty}
            active={band === "60"}
            onClick={() => setBand("60")}
          />
          <BandCard
            label="≤ 90 days"
            value={counts.ninety}
            active={band === "90"}
            onClick={() => setBand("90")}
          />
          <BandCard
            label="No expiry"
            value={counts.noExpiry}
            active={band === "no_expiry"}
            onClick={() => setBand("no_expiry")}
          />
          <BandCard
            label="Pending"
            value={counts.pending}
            active={band === "pending"}
            onClick={() => setBand("pending")}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="relative xl:col-span-2">
              <Search
                size={16}
                className="absolute left-3 top-3.5 text-slate-400"
              />
              <input
                className={`${inputClass} pl-9`}
                placeholder="Search employee, Training, provider..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <select
              className={inputClass}
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="all">All Training types</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>

            <select
              className={inputClass}
              value={projectFilter}
              onChange={(event) =>
                setProjectFilter(event.target.value)
              }
            >
              <option value="all">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.project_number
                    ? `${project.project_number} - `
                    : ""}
                  {project.name}
                </option>
              ))}
            </select>

            <select
              className={inputClass}
              value={crewFilter}
              onChange={(event) => setCrewFilter(event.target.value)}
            >
              <option value="all">All crews</option>
              <option value="unassigned">Unassigned</option>
              {crews.map((crew) => (
                <option key={crew.id} value={crew.id}>
                  {crewLabel(crew)}
                </option>
              ))}
            </select>
          </div>

          {band !== "all" ? (
            <button
              type="button"
              onClick={() => setBand("all")}
              className="mt-3 text-sm font-black text-blue-700"
            >
              Clear expiry band
            </button>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Training</th>
                  <th className="px-4 py-3">Expiry</th>
                  <th className="px-4 py-3">Risk</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((record) => {
                  const employee = employeeById.get(record.employee_id);
                  const project = record.project_id
                    ? projectById.get(record.project_id)
                    : null;

                  return (
                    <tr key={record.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <div className="font-black text-slate-950">
                          {employee?.full_name ?? "Unknown employee"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {employee?.role || "No role"} ·{" "}
                          {crewLabel(
                            employee?.crew_id
                              ? crewById.get(employee.crew_id)
                              : null,
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-bold text-slate-900">
                          {record.training_name}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {record.certificate_number || "No certificate #"}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {record.does_not_expire
                          ? "Does not expire"
                          : dateLabel(record.expiry_date)}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${urgencyClasses(
                            record,
                          )}`}
                        >
                          {statusText(record)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {record.provider || "—"}
                      </td>
                      <td className="px-4 py-4">
                        {project
                          ? `${
                              project.project_number
                                ? `${project.project_number} - `
                                : ""
                            }${project.name}`
                          : "—"}
                      </td>
                      <td className="px-4 py-4">
                        <Link
                          href={`/people/training/register?employeeId=${encodeURIComponent(
                            record.employee_id,
                          )}&trainingTypeId=${encodeURIComponent(
                            record.training_type_id || "",
                          )}`}
                          className="font-black text-blue-700"
                        >
                          Open Register
                        </Link>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-sm font-semibold text-slate-500"
                    >
                      No Training records match the selected expiry filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function BandCard({
  label,
  value,
  active,
  onClick,
  danger = false,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left shadow-sm transition ${
        active
          ? danger
            ? "border-rose-400 bg-rose-100"
            : "border-blue-400 bg-blue-50"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 flex items-center gap-2 text-2xl font-black text-slate-950">
        {danger ? <AlertTriangle size={18} /> : null}
        {value}
      </div>
    </button>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Filter,
  GraduationCap,
  Loader2,
  RefreshCw,
  Search,
  UploadCloud,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";
import {
  trainingComplianceLabel,
  trainingDaysUntil,
  type TrainingComplianceStatus,
} from "@/lib/training/compliance";

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
  active: boolean | null;
};

type TrainingRecord = {
  id: string;
  employee_id: string;
  training_type_id: string | null;
  training_name: string;
  training_short_code: string | null;
  category: string | null;
  certificate_number: string | null;
  class_codes: string[] | null;
  option_codes: string[] | null;
  provider: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  does_not_expire: boolean | null;
  workflow_status: string | null;
  record_status: string | null;
  project_id: string | null;
  sharepoint_web_url: string | null;
  sharepoint_file_name: string | null;
  current_version: boolean | null;
  superseded_at: string | null;
  revoked_at: string | null;
  created_at: string | null;
};

type RegisterStatus =
  | TrainingComplianceStatus
  | "changes_required"
  | "rejected"
  | "superseded";

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

function recordStatus(record: TrainingRecord): RegisterStatus {
  const workflow = clean(record.workflow_status).toLowerCase();
  const status = clean(record.record_status).toLowerCase();

  if (record.revoked_at || status === "revoked") return "revoked";
  if (record.superseded_at || status === "superseded") return "superseded";
  if (workflow === "pending_review") return "pending_review";
  if (workflow === "changes_required") return "changes_required";
  if (workflow === "rejected" || status === "rejected") return "rejected";

  if (
    workflow === "approved" ||
    ["current", "expired", "approved"].includes(status)
  ) {
    if (record.does_not_expire || !record.expiry_date) return "current";

    const days = trainingDaysUntil(record.expiry_date);
    if (days !== null && days < 0) return "expired";
    if (days !== null && days <= 60) return "expiring";
    return "current";
  }

  return "missing";
}

function statusLabel(status: RegisterStatus) {
  if (
    [
      "current",
      "expiring",
      "expired",
      "missing",
      "pending_review",
      "revoked",
      "not_required",
    ].includes(status)
  ) {
    return trainingComplianceLabel(
      status as TrainingComplianceStatus,
    );
  }

  if (status === "changes_required") return "Changes Required";
  if (status === "rejected") return "Rejected";
  return "Superseded";
}

function statusClasses(status: RegisterStatus) {
  if (status === "current") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "expiring") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (
    status === "expired" ||
    status === "rejected" ||
    status === "revoked"
  ) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (
    status === "pending_review" ||
    status === "changes_required"
  ) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function csv(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function TrainingRegisterPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [records, setRecords] = useState<TrainingRecord[]>([]);

  const [search, setSearch] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [trainingTypeFilter, setTrainingTypeFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [historyMode, setHistoryMode] = useState<"current" | "all">(
    "current",
  );
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
        .select("id,name,category,active")
        .order("category")
        .order("name"),
      supabase
        .from("employee_training_records")
        .select(
          "id,employee_id,training_type_id,training_name,training_short_code,category,certificate_number,class_codes,option_codes,provider,issue_date,expiry_date,does_not_expire,workflow_status,record_status,project_id,sharepoint_web_url,sharepoint_file_name,current_version,superseded_at,revoked_at,created_at",
        )
        .order("created_at", { ascending: false }),
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
    setTrainingTypes((typeResult.data ?? []) as TrainingType[]);
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
            : "Unable to load the Training Register.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData]);

  useEffect(() => {
    if (loading) return;

    const params = new URLSearchParams(window.location.search);
    const requestedEmployee = clean(params.get("employeeId"));
    const requestedType = clean(params.get("trainingTypeId"));
    const requestedProject = clean(params.get("projectId"));

    if (
      requestedEmployee &&
      employees.some((employee) => employee.id === requestedEmployee)
    ) {
      setEmployeeFilter(requestedEmployee);
    }

    if (
      requestedType &&
      trainingTypes.some((type) => type.id === requestedType)
    ) {
      setTrainingTypeFilter(requestedType);
    }

    if (
      requestedProject &&
      projects.some((project) => project.id === requestedProject)
    ) {
      setProjectFilter(requestedProject);
    }
  }, [
    employees,
    loading,
    projects,
    trainingTypes,
  ]);

  const employeeById = useMemo(
    () => new Map(employees.map((item) => [item.id, item])),
    [employees],
  );

  const crewById = useMemo(
    () => new Map(crews.map((item) => [item.id, item])),
    [crews],
  );

  const projectById = useMemo(
    () => new Map(projects.map((item) => [item.id, item])),
    [projects],
  );

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          trainingTypes
            .map((type) => clean(type.category))
            .filter(Boolean),
        ),
      ).sort(),
    [trainingTypes],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return records.filter((record) => {
      const employee = employeeById.get(record.employee_id);
      if (!employee || employee.active === false) return false;

      if (
        historyMode === "current" &&
        (record.current_version === false || record.superseded_at)
      ) {
        return false;
      }

      if (
        employeeFilter !== "all" &&
        record.employee_id !== employeeFilter
      ) {
        return false;
      }

      if (
        trainingTypeFilter !== "all" &&
        record.training_type_id !== trainingTypeFilter
      ) {
        return false;
      }

      if (
        projectFilter !== "all" &&
        record.project_id !== projectFilter
      ) {
        return false;
      }

      if (
        categoryFilter !== "all" &&
        clean(record.category) !== categoryFilter
      ) {
        return false;
      }

      const status = recordStatus(record);
      if (statusFilter !== "all" && status !== statusFilter) {
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
        record.training_short_code,
        record.certificate_number,
        record.provider,
        record.category,
        record.class_codes?.join(" "),
        record.option_codes?.join(" "),
        project?.name,
        project?.project_number,
        statusLabel(status),
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [
    categoryFilter,
    crewById,
    employeeById,
    employeeFilter,
    historyMode,
    projectById,
    projectFilter,
    records,
    search,
    statusFilter,
    trainingTypeFilter,
  ]);

  const counts = useMemo(() => {
    const current = records.filter(
      (record) =>
        record.current_version !== false &&
        !record.superseded_at &&
        recordStatus(record) === "current",
    ).length;
    const expiring = records.filter(
      (record) =>
        record.current_version !== false &&
        !record.superseded_at &&
        recordStatus(record) === "expiring",
    ).length;
    const expired = records.filter(
      (record) =>
        record.current_version !== false &&
        !record.superseded_at &&
        recordStatus(record) === "expired",
    ).length;
    const pending = records.filter((record) =>
      ["pending_review", "changes_required"].includes(
        clean(record.workflow_status),
      ),
    ).length;

    return { current, expiring, expired, pending };
  }, [records]);

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      await loadData();
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to refresh the Training Register.",
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
      "Category",
      "Certificate Number",
      "Classes / Options",
      "Provider",
      "Issue Date",
      "Expiry Date",
      "Days Remaining",
      "Status",
      "Project",
      "Workflow",
      "SharePoint",
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
        record.category,
        record.certificate_number,
        (record.option_codes?.length
          ? record.option_codes
          : record.class_codes ?? []
        ).join(", "),
        record.provider,
        record.issue_date,
        record.does_not_expire
          ? "Does not expire"
          : record.expiry_date,
        record.does_not_expire
          ? ""
          : trainingDaysUntil(record.expiry_date) ?? "",
        statusLabel(recordStatus(record)),
        project
          ? `${project.project_number ? `${project.project_number} - ` : ""}${project.name}`
          : "",
        record.workflow_status,
        record.sharepoint_web_url,
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
    link.download = `training-register-${new Date()
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
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-blue-700">
                <GraduationCap size={17} />
                Controlled register
              </div>
              <h1 className="mt-2 text-3xl font-black text-slate-950">
                Training Register
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Search approved, pending and historical Training records.
                New evidence is still added through the controlled upload
                workflow rather than edited directly in this register.
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
                href="/people/training/new"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white"
              >
                <UploadCloud size={16} />
                Add Training
              </Link>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Current" value={counts.current} />
          <Metric label="Expiring ≤ 60 days" value={counts.expiring} />
          <Metric label="Expired" value={counts.expired} />
          <Metric label="Awaiting review" value={counts.pending} />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-black text-slate-700">
            <Filter size={16} />
            Search & filters
          </div>

          <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <label className="relative lg:col-span-2">
              <Search
                size={16}
                className="absolute left-3 top-3.5 text-slate-400"
              />
              <input
                className={`${inputClass} pl-9`}
                placeholder="Employee, certificate, provider, class..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <Select
              value={employeeFilter}
              onChange={setEmployeeFilter}
              options={[
                { value: "all", label: "All employees" },
                ...employees
                  .filter((employee) => employee.active !== false)
                  .map((employee) => ({
                    value: employee.id,
                    label: employee.full_name,
                  })),
              ]}
            />

            <Select
              value={trainingTypeFilter}
              onChange={setTrainingTypeFilter}
              options={[
                { value: "all", label: "All Training types" },
                ...trainingTypes.map((type) => ({
                  value: type.id,
                  label: type.name,
                })),
              ]}
            />

            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "All statuses" },
                { value: "current", label: "Current" },
                { value: "expiring", label: "Expiring" },
                { value: "expired", label: "Expired" },
                { value: "pending_review", label: "Pending review" },
                { value: "changes_required", label: "Changes required" },
                { value: "rejected", label: "Rejected" },
                { value: "revoked", label: "Revoked" },
                { value: "superseded", label: "Superseded" },
              ]}
            />

            <Select
              value={historyMode}
              onChange={(value) =>
                setHistoryMode(value as "current" | "all")
              }
              options={[
                { value: "current", label: "Current versions" },
                { value: "all", label: "Include history" },
              ]}
            />

            <Select
              value={projectFilter}
              onChange={setProjectFilter}
              options={[
                { value: "all", label: "All projects" },
                ...projects.map((project) => ({
                  value: project.id,
                  label: `${
                    project.project_number
                      ? `${project.project_number} - `
                      : ""
                  }${project.name}`,
                })),
              ]}
            />

            <Select
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: "all", label: "All categories" },
                ...categories.map((category) => ({
                  value: category,
                  label: category,
                })),
              ]}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 text-sm font-black text-slate-700">
            {filtered.length} record{filtered.length === 1 ? "" : "s"}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1400px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Training</th>
                  <th className="px-4 py-3">Certificate</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Issue</th>
                  <th className="px-4 py-3">Expiry</th>
                  <th className="px-4 py-3">Days</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((record) => {
                  const employee = employeeById.get(record.employee_id);
                  const crew = employee?.crew_id
                    ? crewById.get(employee.crew_id)
                    : null;
                  const project = record.project_id
                    ? projectById.get(record.project_id)
                    : null;
                  const status = recordStatus(record);
                  const days = record.does_not_expire
                    ? null
                    : trainingDaysUntil(record.expiry_date);

                  return (
                    <tr key={record.id} className="align-top hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <div className="font-black text-slate-950">
                          {employee?.full_name ?? "Unknown employee"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {employee?.payroll_id || "No payroll ID"} ·{" "}
                          {crewLabel(crew)}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-bold text-slate-900">
                          {record.training_name}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {record.category || "Uncategorised"}
                          {record.option_codes?.length
                            ? ` · ${record.option_codes.join(", ")}`
                            : ""}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {record.certificate_number || "—"}
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {record.provider || "—"}
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {dateLabel(record.issue_date)}
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {record.does_not_expire
                          ? "Does not expire"
                          : dateLabel(record.expiry_date)}
                      </td>
                      <td className="px-4 py-4 font-bold text-slate-700">
                        {record.does_not_expire
                          ? "—"
                          : days ?? "—"}
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {project
                          ? `${
                              project.project_number
                                ? `${project.project_number} - `
                                : ""
                            }${project.name}`
                          : "—"}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${statusClasses(
                            status,
                          )}`}
                        >
                          {statusLabel(status)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {record.sharepoint_web_url ? (
                          <a
                            href={record.sharepoint_web_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 font-black text-blue-700 hover:text-blue-900"
                          >
                            <ExternalLink size={15} />
                            Open
                          </a>
                        ) : (
                          <span className="text-slate-400">Not published</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-5 py-12 text-center text-sm font-semibold text-slate-500"
                    >
                      No Training records match the selected filters.
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

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      className={inputClass}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-black text-slate-950">
        {value}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  FileText,
  Filter,
  GraduationCap,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type Employee = {
  id: string;
  full_name: string;
  role: string | null;
  crew_id: string | null;
  user_id: string | null;
  active: boolean | null;
};

type Crew = {
  id: string;
  crew_number: string | null;
  crew_name: string | null;
  active: boolean | null;
};

type Project = {
  id: string;
  name: string;
  project_number: string | null;
  status: string | null;
};

type ProjectAccessRow = {
  project_id: string;
  user_id: string;
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
  category: string | null;
  certificate_number: string | null;
  provider: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  does_not_expire: boolean | null;
  record_status: string | null;
  superseded_at: string | null;
  revoked_at: string | null;
  notes: string | null;
};

type RenewalStatus =
  | "overdue"
  | "due_7"
  | "due_30"
  | "due_60"
  | "due_90"
  | "future";

type RenewalRow = {
  record: TrainingRecord;
  employee: Employee;
  crew: Crew | null;
  projectNames: string[];
  trainingType: TrainingType | null;
  daysRemaining: number;
  status: RenewalStatus;
};

type StatusFilter =
  | "all"
  | "overdue"
  | "due_7"
  | "due_30"
  | "due_60"
  | "due_90"
  | "future";

type DocumentFilter = "all" | "has_number" | "missing_number";

const DAY_MS = 86_400_000;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalise(value: unknown) {
  return clean(value).replace(/\s+/g, " ").toLowerCase();
}

function crewLabel(crew: Crew | null | undefined) {
  if (!crew) return "Unassigned";

  const number = clean(crew.crew_number);
  const name = clean(crew.crew_name);

  if (number && name) return `Crew ${number} · ${name}`;
  if (number) return `Crew ${number}`;
  if (name) return name;

  return "Unassigned";
}

function projectLabel(project: Project) {
  return project.project_number
    ? `${project.project_number} · ${project.name}`
    : project.name;
}

function parseDate(value?: string | null) {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(from: Date, to: Date) {
  const fromUtc = Date.UTC(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
  );
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());

  return Math.ceil((toUtc - fromUtc) / DAY_MS);
}

function daysUntil(value?: string | null) {
  const date = parseDate(value);
  if (!date) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return daysBetween(today, date);
}

function formatDate(value?: string | null) {
  const date = parseDate(value);
  if (!date) return "Not set";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function renewalStatus(daysRemaining: number): RenewalStatus {
  if (daysRemaining < 0) return "overdue";
  if (daysRemaining <= 7) return "due_7";
  if (daysRemaining <= 30) return "due_30";
  if (daysRemaining <= 60) return "due_60";
  if (daysRemaining <= 90) return "due_90";
  return "future";
}

function statusLabel(status: RenewalStatus) {
  if (status === "overdue") return "Overdue";
  if (status === "due_7") return "Due in 7 days";
  if (status === "due_30") return "Due in 30 days";
  if (status === "due_60") return "Due in 60 days";
  if (status === "due_90") return "Due in 90 days";
  return "Future";
}

function statusClasses(status: RenewalStatus) {
  if (status === "overdue") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (status === "due_7") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  if (status === "due_30") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (status === "due_60") {
    return "border-yellow-200 bg-yellow-50 text-yellow-800";
  }
  if (status === "due_90") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function progressClasses(status: RenewalStatus) {
  if (status === "overdue") return "bg-rose-500";
  if (status === "due_7") return "bg-orange-500";
  if (status === "due_30") return "bg-amber-500";
  if (status === "due_60") return "bg-yellow-500";
  if (status === "due_90") return "bg-sky-500";
  return "bg-slate-400";
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

function isInactiveProject(project: Project) {
  return ["completed", "closed", "archived", "inactive"].includes(
    normalise(project.status),
  );
}

export default function TrainingRenewalsPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectAccess, setProjectAccess] = useState<ProjectAccessRow[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [records, setRecords] = useState<TrainingRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [crewFilter, setCrewFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [trainingTypeFilter, setTrainingTypeFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [documentFilter, setDocumentFilter] =
    useState<DocumentFilter>("all");
  const [includeInactiveProjects, setIncludeInactiveProjects] =
    useState(false);

  const [selectedRenewalId, setSelectedRenewalId] = useState<string | null>(
    null,
  );

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    const [
      employeeResult,
      crewResult,
      projectResult,
      projectAccessResult,
      trainingTypeResult,
      recordResult,
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, role, crew_id, user_id, active")
        .eq("active", true)
        .order("full_name", { ascending: true }),
      supabase
        .from("crews")
        .select("id, crew_number, crew_name, active")
        .order("crew_number", { ascending: true }),
      supabase
        .from("projects")
        .select("id, name, project_number, status")
        .order("name", { ascending: true }),
      supabase
        .from("project_access")
        .select("project_id, user_id"),
      supabase
        .from("training_types")
        .select("id, name, category, active")
        .order("category", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("employee_training_records")
        .select(
          "id, employee_id, training_type_id, training_name, category, certificate_number, provider, issue_date, expiry_date, does_not_expire, record_status, superseded_at, revoked_at, notes",
        )
        .is("superseded_at", null)
        .order("expiry_date", { ascending: true, nullsFirst: false }),
    ]);

    if (employeeResult.error) throw new Error(employeeResult.error.message);
    if (crewResult.error) throw new Error(crewResult.error.message);
    if (projectResult.error) throw new Error(projectResult.error.message);
    if (projectAccessResult.error) {
      throw new Error(projectAccessResult.error.message);
    }
    if (trainingTypeResult.error) {
      throw new Error(trainingTypeResult.error.message);
    }
    if (recordResult.error) throw new Error(recordResult.error.message);

    setEmployees((employeeResult.data ?? []) as Employee[]);
    setCrews((crewResult.data ?? []) as Crew[]);
    setProjects((projectResult.data ?? []) as Project[]);
    setProjectAccess(
      (projectAccessResult.data ?? []) as ProjectAccessRow[],
    );
    setTrainingTypes((trainingTypeResult.data ?? []) as TrainingType[]);
    setRecords((recordResult.data ?? []) as TrainingRecord[]);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await loadData();
        } catch (error) {
          setMessage({
            tone: "error",
            text:
              error instanceof Error
                ? error.message
                : "Unable to load training renewals.",
          });
        } finally {
          setLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
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

  const trainingTypeById = useMemo(
    () =>
      new Map(
        trainingTypes.map((trainingType) => [
          trainingType.id,
          trainingType,
        ]),
      ),
    [trainingTypes],
  );

  const projectNamesByUserId = useMemo(() => {
    const map = new Map<string, string[]>();

    projectAccess.forEach((row) => {
      const project = projectById.get(row.project_id);
      if (!project) return;
      if (!includeInactiveProjects && isInactiveProject(project)) return;

      const list = map.get(row.user_id) ?? [];
      list.push(projectLabel(project));
      map.set(row.user_id, list);
    });

    map.forEach((names, userId) => {
      map.set(
        userId,
        [...new Set(names)].sort((a, b) => a.localeCompare(b)),
      );
    });

    return map;
  }, [includeInactiveProjects, projectAccess, projectById]);

  const renewalRows = useMemo<RenewalRow[]>(() => {
    return records
      .filter((record) => {
        const employee = employeeById.get(record.employee_id);
        if (!employee || employee.active === false) return false;
        if (record.does_not_expire) return false;
        if (!record.expiry_date) return false;
        if (record.revoked_at) return false;

        const status = normalise(record.record_status);
        if (["superseded", "cancelled", "void", "revoked"].includes(status)) {
          return false;
        }

        return daysUntil(record.expiry_date) !== null;
      })
      .map((record) => {
        const employee = employeeById.get(record.employee_id)!;
        const daysRemaining = daysUntil(record.expiry_date) ?? 0;
        const crew = employee.crew_id
          ? crewById.get(employee.crew_id) ?? null
          : null;

        return {
          record,
          employee,
          crew,
          projectNames: employee.user_id
            ? projectNamesByUserId.get(employee.user_id) ?? []
            : [],
          trainingType: record.training_type_id
            ? trainingTypeById.get(record.training_type_id) ?? null
            : null,
          daysRemaining,
          status: renewalStatus(daysRemaining),
        };
      })
      .sort((a, b) => {
        if (a.daysRemaining !== b.daysRemaining) {
          return a.daysRemaining - b.daysRemaining;
        }

        return a.employee.full_name.localeCompare(b.employee.full_name);
      });
  }, [
    crewById,
    employeeById,
    projectNamesByUserId,
    records,
    trainingTypeById,
  ]);

  const activeProjects = useMemo(
    () =>
      includeInactiveProjects
        ? projects
        : projects.filter((project) => !isInactiveProject(project)),
    [includeInactiveProjects, projects],
  );

  const roleOptions = useMemo(() => {
    return [
      ...new Set(
        employees.map((employee) => clean(employee.role)).filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return renewalRows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) {
        return false;
      }

      if (
        employeeFilter !== "all" &&
        row.employee.id !== employeeFilter
      ) {
        return false;
      }

      if (crewFilter === "unassigned" && row.employee.crew_id) {
        return false;
      }

      if (
        crewFilter !== "all" &&
        crewFilter !== "unassigned" &&
        row.employee.crew_id !== crewFilter
      ) {
        return false;
      }

      if (
        projectFilter !== "all" &&
        !row.projectNames.includes(
          projectLabel(projectById.get(projectFilter)!),
        )
      ) {
        return false;
      }

      if (
        trainingTypeFilter !== "all" &&
        row.record.training_type_id !== trainingTypeFilter
      ) {
        return false;
      }

      if (
        roleFilter !== "all" &&
        clean(row.employee.role) !== roleFilter
      ) {
        return false;
      }

      if (
        documentFilter === "has_number" &&
        !clean(row.record.certificate_number)
      ) {
        return false;
      }

      if (
        documentFilter === "missing_number" &&
        clean(row.record.certificate_number)
      ) {
        return false;
      }

      if (!query) return true;

      return [
        row.employee.full_name,
        row.employee.role,
        crewLabel(row.crew),
        row.projectNames.join(" "),
        row.trainingType?.name,
        row.record.training_name,
        row.record.category,
        row.record.certificate_number,
        row.record.provider,
        row.record.notes,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [
    crewFilter,
    documentFilter,
    employeeFilter,
    projectById,
    projectFilter,
    renewalRows,
    roleFilter,
    search,
    statusFilter,
    trainingTypeFilter,
  ]);

  const selectedRenewal = selectedRenewalId
    ? renewalRows.find((row) => row.record.id === selectedRenewalId) ?? null
    : null;

  const overdueCount = renewalRows.filter(
    (row) => row.status === "overdue",
  ).length;
  const due7Count = renewalRows.filter(
    (row) => row.status === "due_7",
  ).length;
  const due30Count = renewalRows.filter(
    (row) => row.status === "due_30",
  ).length;
  const due60Count = renewalRows.filter(
    (row) => row.status === "due_60",
  ).length;
  const due90Count = renewalRows.filter(
    (row) => row.status === "due_90",
  ).length;

  const employeesAtRisk = useMemo(
    () =>
      new Set(
        renewalRows
          .filter((row) => row.daysRemaining <= 30)
          .map((row) => row.employee.id),
      ).size,
    [renewalRows],
  );

  const monthlySummary = useMemo(() => {
    const map = new Map<string, number>();

    renewalRows
      .filter((row) => row.daysRemaining >= 0 && row.daysRemaining <= 365)
      .forEach((row) => {
        const date = parseDate(row.record.expiry_date);
        if (!date) return;

        const key = `${date.getFullYear()}-${String(
          date.getMonth() + 1,
        ).padStart(2, "0")}`;

        map.set(key, (map.get(key) ?? 0) + 1);
      });

    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 12)
      .map(([key, count]) => {
        const [year, month] = key.split("-").map(Number);
        const label = new Intl.DateTimeFormat("en-AU", {
          month: "short",
          year: "numeric",
        }).format(new Date(year, month - 1, 1));

        return { key, label, count };
      });
  }, [renewalRows]);

  const maxMonthlyCount = Math.max(
    1,
    ...monthlySummary.map((item) => item.count),
  );

  const trainingTypeSummary = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();

    renewalRows
      .filter((row) => row.daysRemaining <= 90)
      .forEach((row) => {
        const key =
          row.record.training_type_id ?? row.record.training_name;
        const name =
          row.trainingType?.name || row.record.training_name;

        const current = map.get(key) ?? { name, count: 0 };
        current.count += 1;
        map.set(key, current);
      });

    return [...map.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [renewalRows]);

  async function refreshData() {
    setRefreshing(true);
    setMessage(null);

    try {
      await loadData();
      setMessage({
        tone: "success",
        text: "Training renewals refreshed.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to refresh training renewals.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setEmployeeFilter("all");
    setCrewFilter("all");
    setProjectFilter("all");
    setTrainingTypeFilter("all");
    setRoleFilter("all");
    setDocumentFilter("all");
  }

  function exportRenewals() {
    const header = [
      "Employee",
      "Role",
      "Crew",
      "Projects",
      "Training",
      "Category",
      "Certificate Number",
      "Provider",
      "Issue Date",
      "Expiry Date",
      "Days Remaining",
      "Renewal Status",
    ];

    const rows = filteredRows.map((row) => [
      row.employee.full_name,
      row.employee.role ?? "",
      crewLabel(row.crew),
      row.projectNames.join("; "),
      row.trainingType?.name ?? row.record.training_name,
      row.trainingType?.category ?? row.record.category ?? "",
      row.record.certificate_number ?? "",
      row.record.provider ?? "",
      row.record.issue_date ?? "",
      row.record.expiry_date ?? "",
      row.daysRemaining,
      statusLabel(row.status),
    ]);

    const csv = [
      header.map(csvCell).join(","),
      ...rows.map((row) => row.map(csvCell).join(",")),
    ].join("\n");

    downloadTextFile(
      `training-renewals-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
    );
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[65vh] items-center justify-center">
          <Loader2 size={30} className="animate-spin text-slate-400" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <Link
                href="/people/training"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft size={16} />
                Back to Training Register
              </Link>

              <div className="mt-5 flex items-center gap-2 text-slate-400">
                <CalendarClock size={18} />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Renewal Control
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Training Renewals
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Prioritise expired and upcoming licences, certificates, VOCs
                and competencies. Filter by employee, crew, project or training
                type and export the current action list.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refreshData()}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw
                  size={16}
                  className={refreshing ? "animate-spin" : ""}
                />
                Refresh
              </button>

              <button
                type="button"
                onClick={exportRenewals}
                disabled={filteredRows.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Download size={16} />
                Export CSV
              </button>
            </div>
          </div>
        </section>

        {message ? (
          <section
            className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
              message.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            <div className="flex items-center gap-2">
              {message.tone === "success" ? (
                <CheckCircle2 size={17} />
              ) : (
                <X size={17} />
              )}
              {message.text}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
          <MetricCard
            label="Overdue"
            value={String(overdueCount)}
            detail="Already expired"
            tone={overdueCount > 0 ? "rose" : "slate"}
            icon={<ShieldAlert size={20} />}
          />
          <MetricCard
            label="Next 7 Days"
            value={String(due7Count)}
            detail="Immediate action"
            tone={due7Count > 0 ? "orange" : "slate"}
            icon={<AlertTriangle size={20} />}
          />
          <MetricCard
            label="Next 30 Days"
            value={String(due30Count)}
            detail="Book renewal"
            tone={due30Count > 0 ? "amber" : "slate"}
            icon={<CalendarClock size={20} />}
          />
          <MetricCard
            label="Next 60 Days"
            value={String(due60Count)}
            detail="Upcoming"
            tone={due60Count > 0 ? "yellow" : "slate"}
            icon={<CalendarClock size={20} />}
          />
          <MetricCard
            label="Next 90 Days"
            value={String(due90Count)}
            detail="Plan ahead"
            tone={due90Count > 0 ? "sky" : "slate"}
            icon={<CalendarClock size={20} />}
          />
          <MetricCard
            label="People at Risk"
            value={String(employeesAtRisk)}
            detail="Overdue or due in 30 days"
            tone={employeesAtRisk > 0 ? "rose" : "slate"}
            icon={<UsersRound size={20} />}
          />
          <MetricCard
            label="Tracked Records"
            value={String(renewalRows.length)}
            detail="Expiring records"
            tone="slate"
            icon={<ShieldCheck size={20} />}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Renewals by Month
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Expiry workload across the next twelve months.
              </p>
            </div>

            {monthlySummary.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                No renewals are scheduled in the next twelve months.
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {monthlySummary.map((item) => (
                  <div
                    key={item.key}
                    className="grid grid-cols-[100px_minmax(0,1fr)_40px] items-center gap-3"
                  >
                    <div className="text-sm font-semibold text-slate-600">
                      {item.label}
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-700"
                        style={{
                          width: `${Math.max(
                            4,
                            (item.count / maxMonthlyCount) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="text-right text-sm font-bold text-slate-800">
                      {item.count}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-950">
                Highest Renewal Demand
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Training types due within 90 days.
              </p>
            </div>

            <div className="space-y-2 p-4">
              {trainingTypeSummary.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  No renewal demand found.
                </div>
              ) : (
                trainingTypeSummary.map((item, index) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-400">
                        #{index + 1}
                      </div>
                      <div className="mt-1 truncate font-bold text-slate-900">
                        {item.name}
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">
                      {item.count}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-slate-500">
              <Filter size={17} />
              <span className="text-sm font-semibold">Filters</span>
            </div>

            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-semibold text-slate-500 hover:text-slate-900"
            >
              Clear filters
            </button>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_190px_220px_210px_220px_220px_200px_190px]">
            <label className="relative block">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search employee, training, project or number..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </label>

            <SelectField
              value={statusFilter}
              onChange={(value) =>
                setStatusFilter(value as StatusFilter)
              }
              options={[
                { value: "all", label: "All renewal statuses" },
                { value: "overdue", label: "Overdue" },
                { value: "due_7", label: "Due in 7 days" },
                { value: "due_30", label: "Due in 30 days" },
                { value: "due_60", label: "Due in 60 days" },
                { value: "due_90", label: "Due in 90 days" },
                { value: "future", label: "More than 90 days" },
              ]}
            />

            <SelectField
              value={employeeFilter}
              onChange={setEmployeeFilter}
              options={[
                { value: "all", label: "All employees" },
                ...employees.map((employee) => ({
                  value: employee.id,
                  label: employee.full_name,
                })),
              ]}
            />

            <SelectField
              value={crewFilter}
              onChange={setCrewFilter}
              options={[
                { value: "all", label: "All crews" },
                { value: "unassigned", label: "Unassigned" },
                ...crews
                  .filter((crew) => crew.active !== false)
                  .map((crew) => ({
                    value: crew.id,
                    label: crewLabel(crew),
                  })),
              ]}
            />

            <SelectField
              value={projectFilter}
              onChange={setProjectFilter}
              options={[
                { value: "all", label: "All projects" },
                ...activeProjects.map((project) => ({
                  value: project.id,
                  label: projectLabel(project),
                })),
              ]}
            />

            <SelectField
              value={trainingTypeFilter}
              onChange={setTrainingTypeFilter}
              options={[
                { value: "all", label: "All training types" },
                ...trainingTypes.map((trainingType) => ({
                  value: trainingType.id,
                  label: trainingType.name,
                })),
              ]}
            />

            <SelectField
              value={roleFilter}
              onChange={setRoleFilter}
              options={[
                { value: "all", label: "All roles" },
                ...roleOptions.map((role) => ({
                  value: role,
                  label: role,
                })),
              ]}
            />

            <SelectField
              value={documentFilter}
              onChange={(value) =>
                setDocumentFilter(value as DocumentFilter)
              }
              options={[
                { value: "all", label: "All record details" },
                { value: "has_number", label: "Has certificate number" },
                { value: "missing_number", label: "Missing certificate number" },
              ]}
            />
          </div>

          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={includeInactiveProjects}
              onChange={(event) =>
                setIncludeInactiveProjects(event.target.checked)
              }
              className="h-4 w-4 rounded border-slate-300"
            />
            Include inactive projects in project matching
          </label>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Renewal Action Queue
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {filteredRows.length} record
                {filteredRows.length === 1 ? "" : "s"} shown. Most urgent
                renewals appear first.
              </p>
            </div>

            <div className="text-xs font-semibold text-slate-400">
              Expired records remain visible until renewed or superseded.
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="p-10">
              <EmptyState
                icon={<CheckCircle2 size={30} />}
                title="No renewals match"
                description="Adjust the filters or confirm expiry dates have been entered in the training register."
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <RenewalRowCard
                  key={row.record.id}
                  row={row}
                  onOpen={() => setSelectedRenewalId(row.record.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedRenewal ? (
        <RenewalDetailModal
          row={selectedRenewal}
          onClose={() => setSelectedRenewalId(null)}
        />
      ) : null}
    </AppShell>
  );
}

function RenewalRowCard({
  row,
  onOpen,
}: {
  row: RenewalRow;
  onOpen: () => void;
}) {
  const windowProgress =
    row.daysRemaining < 0
      ? 100
      : Math.max(3, Math.min(100, ((90 - row.daysRemaining) / 90) * 100));

  return (
    <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.75fr)_auto] xl:items-center">
      <div className="min-w-0">
        <Link
          href={`/people/${row.employee.id}`}
          className="font-bold text-slate-950 hover:text-blue-700"
        >
          {row.employee.full_name}
        </Link>
        <p className="mt-1 text-sm text-slate-500">
          {row.employee.role || "Position not set"}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {crewLabel(row.crew)}
        </p>
      </div>

      <div className="min-w-0">
        <div className="font-bold text-slate-900">
          {row.trainingType?.name || row.record.training_name}
        </div>
        <div className="mt-1 text-sm text-slate-500">
          {row.trainingType?.category ||
            row.record.category ||
            "Uncategorised"}
        </div>
        <div className="mt-1 text-xs text-slate-400">
          {row.record.certificate_number || "No certificate number"}
        </div>
      </div>

      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Projects
        </div>
        <div className="mt-2 text-sm font-semibold text-slate-700">
          {row.projectNames.length > 0
            ? row.projectNames.slice(0, 2).join(", ")
            : "No linked project"}
        </div>
        {row.projectNames.length > 2 ? (
          <div className="mt-1 text-xs text-slate-400">
            +{row.projectNames.length - 2} more
          </div>
        ) : null}
      </div>

      <div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(
            row.status,
          )}`}
        >
          {statusLabel(row.status)}
        </span>

        <div className="mt-2 text-sm font-semibold text-slate-700">
          {formatDate(row.record.expiry_date)}
        </div>

        <div
          className={`mt-1 text-xs font-semibold ${
            row.daysRemaining < 0
              ? "text-rose-600"
              : row.daysRemaining <= 30
                ? "text-amber-700"
                : "text-slate-400"
          }`}
        >
          {row.daysRemaining < 0
            ? `${Math.abs(row.daysRemaining)} days overdue`
            : `${row.daysRemaining} days remaining`}
        </div>

        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${progressClasses(row.status)}`}
            style={{ width: `${windowProgress}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 xl:justify-end">
        <Link
          href={`/people/${row.employee.id}`}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <GraduationCap size={15} />
          Profile
        </Link>

        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Eye size={15} />
          Review
        </button>
      </div>
    </div>
  );
}

function RenewalDetailModal({
  row,
  onClose,
}: {
  row: RenewalRow;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
      <div className="my-auto w-full max-w-4xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-950">
                {row.employee.full_name}
              </h2>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(
                  row.status,
                )}`}
              >
                {statusLabel(row.status)}
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-500">
              {row.trainingType?.name || row.record.training_name}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DetailMetric
              label="Expiry"
              value={formatDate(row.record.expiry_date)}
              tone={row.status === "overdue" ? "rose" : "amber"}
            />
            <DetailMetric
              label="Days Remaining"
              value={String(row.daysRemaining)}
              tone={row.daysRemaining < 0 ? "rose" : "amber"}
            />
            <DetailMetric
              label="Crew"
              value={crewLabel(row.crew)}
              tone="slate"
            />
            <DetailMetric
              label="Projects"
              value={String(row.projectNames.length)}
              tone="sky"
            />
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <InfoBlock
              label="Employee"
              value={row.employee.full_name}
            />
            <InfoBlock
              label="Role"
              value={row.employee.role || "Not set"}
            />
            <InfoBlock
              label="Training"
              value={row.trainingType?.name || row.record.training_name}
            />
            <InfoBlock
              label="Category"
              value={
                row.trainingType?.category ||
                row.record.category ||
                "Uncategorised"
              }
            />
            <InfoBlock
              label="Certificate Number"
              value={row.record.certificate_number || "Not set"}
            />
            <InfoBlock
              label="Provider"
              value={row.record.provider || "Not set"}
            />
            <InfoBlock
              label="Issue Date"
              value={formatDate(row.record.issue_date)}
            />
            <InfoBlock
              label="Expiry Date"
              value={formatDate(row.record.expiry_date)}
            />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center gap-2 text-slate-700">
              <FileText size={17} />
              <h3 className="font-bold">Linked Projects</h3>
            </div>

            {row.projectNames.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                This employee does not currently have project access linked to
                their login.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {row.projectNames.map((projectName) => (
                  <span
                    key={projectName}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm"
                  >
                    {projectName}
                  </span>
                ))}
              </div>
            )}
          </section>

          {row.record.notes ? (
            <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
              <div className="font-bold text-blue-900">
                Operational Notes
              </div>
              <p className="mt-2 text-sm leading-6 text-blue-800">
                {row.record.notes}
              </p>
            </section>
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-between">
            <Link
              href={`/people/${row.employee.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <UserRound size={16} />
              Open Employee Profile
            </Link>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "rose" | "orange" | "amber" | "yellow" | "sky" | "slate";
  icon: React.ReactNode;
}) {
  const classes =
    tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : tone === "orange"
        ? "border-orange-200 bg-orange-50 text-orange-800"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : tone === "yellow"
            ? "border-yellow-200 bg-yellow-50 text-yellow-800"
            : tone === "sky"
              ? "border-sky-200 bg-sky-50 text-sky-800"
              : "border-slate-200 bg-white text-slate-800";

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${classes}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{label}</div>
          <div className="mt-2 text-3xl font-bold tracking-tight">
            {value}
          </div>
          <div className="mt-1 text-xs opacity-70">{detail}</div>
        </div>

        <div className="rounded-xl bg-white/70 p-2.5">{icon}</div>
      </div>
    </div>
  );
}

function DetailMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "rose" | "amber" | "sky" | "slate";
}) {
  const classes =
    tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "sky"
          ? "border-sky-200 bg-sky-50 text-sky-800"
          : "border-slate-200 bg-slate-50 text-slate-800";

  return (
    <div className={`rounded-2xl border p-4 ${classes}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="mt-2 text-lg font-bold">{value}</div>
    </div>
  );
}

function InfoBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-sm font-bold text-slate-800">
        {value}
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
        {icon}
      </div>

      <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>

      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
        {description}
      </p>
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="relative block">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-9 text-sm font-medium text-slate-700 outline-none ring-slate-200 focus:ring-2"
      >
        {options.map((option) => (
          <option
            key={`${option.value}-${option.label}`}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>

      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
    </label>
  );
}
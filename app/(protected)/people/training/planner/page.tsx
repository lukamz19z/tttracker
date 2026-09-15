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
  CalendarDays,
  CheckSquare,
  Download,
  Loader2,
  Search,
  Square,
  UploadCloud,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";
import {
  combinedRequirementsForEmployee,
  evaluateTrainingRequirement,
  isTrainingRecordApproved,
  trainingComplianceLabel,
  trainingDaysUntil,
  type ProjectTrainingRequirementLike,
  type RoleTrainingRequirementLike,
  type TrainingComplianceStatus,
  type TrainingRecordLike,
} from "@/lib/training/compliance";

type Project = {
  id: string;
  name: string;
  project_number: string | null;
  status: string | null;
};

type Employee = {
  id: string;
  payroll_id: string | null;
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
};

type TrainingType = {
  id: string;
  name: string;
  short_code: string | null;
  category: string | null;
  active: boolean | null;
};

type ProjectAccess = {
  project_id: string;
  user_id: string;
};

type PopulationOverride = {
  project_id: string;
  employee_id: string;
  included: boolean;
};

type RoleRequirement = RoleTrainingRequirementLike & {
  id: string;
};

type ProjectRequirement = ProjectTrainingRequirementLike & {
  id: string;
};

type TrainingRecord = TrainingRecordLike & {
  training_name: string;
};

type PlannerRow = {
  key: string;
  employee: Employee;
  trainingTypeId: string;
  trainingName: string;
  status: TrainingComplianceStatus;
  daysRemaining: number | null;
  recordId: string | null;
  source: "requirement" | "expiry";
  projectId: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function projectLabel(project?: Project | null) {
  if (!project) return "Company-wide";
  return project.project_number
    ? `${project.project_number} · ${project.name}`
    : project.name;
}

function crewLabel(crew?: Crew | null) {
  if (!crew) return "Unassigned";
  const number = clean(crew.crew_number);
  const name = clean(crew.crew_name);
  if (number && name) return `Crew ${number} · ${name}`;
  if (number) return `Crew ${number}`;
  return name || "Unassigned";
}

function isInactiveProject(project: Project) {
  return ["completed", "closed", "archived", "inactive"].includes(
    clean(project.status).toLowerCase(),
  );
}

function statusClasses(status: TrainingComplianceStatus) {
  switch (status) {
    case "current":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "expiring":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "pending_review":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "missing":
    case "expired":
    case "revoked":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "not_required":
      return "border-slate-200 bg-slate-50 text-slate-500";
  }
}

function csv(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function TrainingPlannerPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [types, setTypes] = useState<TrainingType[]>([]);
  const [projectAccess, setProjectAccess] = useState<ProjectAccess[]>([]);
  const [population, setPopulation] = useState<PopulationOverride[]>([]);
  const [roleRequirements, setRoleRequirements] = useState<
    RoleRequirement[]
  >([]);
  const [projectRequirements, setProjectRequirements] = useState<
    ProjectRequirement[]
  >([]);
  const [records, setRecords] = useState<TrainingRecord[]>([]);

  const [projectId, setProjectId] = useState("");
  const [trainingTypeId, setTrainingTypeId] = useState("all");
  const [horizon, setHorizon] = useState("90");
  const [search, setSearch] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    const [
      projectResult,
      employeeResult,
      crewResult,
      typeResult,
      accessResult,
      populationResult,
      roleRequirementResult,
      projectRequirementResult,
      recordResult,
    ] = await Promise.all([
      supabase
        .from("projects")
        .select("id,name,project_number,status")
        .order("name"),
      supabase
        .from("employees")
        .select(
          "id,payroll_id,full_name,role,crew_id,user_id,active",
        )
        .eq("active", true)
        .order("full_name"),
      supabase
        .from("crews")
        .select("id,crew_number,crew_name")
        .order("crew_number"),
      supabase
        .from("training_types")
        .select("id,name,short_code,category,active")
        .eq("active", true)
        .order("name"),
      supabase
        .from("project_access")
        .select("project_id,user_id"),
      supabase
        .from("project_training_people")
        .select("project_id,employee_id,included"),
      supabase
        .from("role_training_requirements")
        .select(
          "id,role_name,training_type_id,requirement_level,renewal_lead_days,accepted_alternative_training_type_ids,required_option_codes,active",
        )
        .eq("active", true),
      supabase
        .from("project_training_requirements")
        .select(
          "id,project_id,training_type_id,requirement_level,renewal_lead_days,accepted_alternative_training_type_ids,required_option_codes,applies_to_role,active",
        )
        .eq("active", true),
      supabase
        .from("employee_training_records")
        .select(
          "id,employee_id,training_type_id,training_name,workflow_status,record_status,current_version,superseded_at,revoked_at,does_not_expire,expiry_date,issue_date,created_at,option_codes",
        ),
    ]);

    const firstError = [
      projectResult.error,
      employeeResult.error,
      crewResult.error,
      typeResult.error,
      accessResult.error,
      populationResult.error,
      roleRequirementResult.error,
      projectRequirementResult.error,
      recordResult.error,
    ].find(Boolean);

    if (firstError) throw new Error(firstError.message);

    setProjects((projectResult.data ?? []) as Project[]);
    setEmployees((employeeResult.data ?? []) as Employee[]);
    setCrews((crewResult.data ?? []) as Crew[]);
    setTypes((typeResult.data ?? []) as TrainingType[]);
    setProjectAccess((accessResult.data ?? []) as ProjectAccess[]);
    setPopulation(
      (populationResult.data ?? []) as PopulationOverride[],
    );
    setRoleRequirements(
      (roleRequirementResult.data ?? []) as RoleRequirement[],
    );
    setProjectRequirements(
      (projectRequirementResult.data ?? []) as ProjectRequirement[],
    );
    setRecords((recordResult.data ?? []) as TrainingRecord[]);
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      try {
        await loadData();
      } catch (error) {
        setMessage({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : "Unable to load the Training Planner.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData]);

  const typeById = useMemo(
    () => new Map(types.map((type) => [type.id, type])),
    [types],
  );

  const crewById = useMemo(
    () => new Map(crews.map((crew) => [crew.id, crew])),
    [crews],
  );

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const projectPeople = useMemo(() => {
    if (!projectId) return employees;

    const linkedUsers = new Set(
      projectAccess
        .filter((row) => row.project_id === projectId)
        .map((row) => row.user_id),
    );

    const overrides = new Map(
      population
        .filter((row) => row.project_id === projectId)
        .map((row) => [row.employee_id, row.included]),
    );

    return employees.filter((employee) => {
      if (overrides.has(employee.id)) {
        return overrides.get(employee.id) === true;
      }

      return Boolean(
        employee.user_id && linkedUsers.has(employee.user_id),
      );
    });
  }, [employees, population, projectAccess, projectId]);

  const horizonDays = Number(horizon) || 90;

  const plannerRows = useMemo<PlannerRow[]>(() => {
    const rows = new Map<string, PlannerRow>();

    for (const employee of projectPeople) {
      const requirements = combinedRequirementsForEmployee({
        employee,
        projectId: projectId || null,
        roleRequirements,
        projectRequirements,
      });

      for (const requirement of requirements) {
        const result = evaluateTrainingRequirement({
          employeeId: employee.id,
          requirement,
          records,
          defaultLeadDays: horizonDays,
        });

        const shouldShow =
          result.status === "missing" ||
          result.status === "expired" ||
          result.status === "revoked" ||
          result.status === "pending_review" ||
          (result.status === "expiring" &&
            (result.daysRemaining ?? Number.MAX_SAFE_INTEGER) <=
              horizonDays) ||
          (showCurrent && result.status === "current");

        if (!shouldShow) continue;

        const key = `${employee.id}|${requirement.training_type_id}`;

        rows.set(key, {
          key,
          employee,
          trainingTypeId: requirement.training_type_id,
          trainingName:
            typeById.get(requirement.training_type_id)?.name ??
            "Training",
          status: result.status,
          daysRemaining: result.daysRemaining,
          recordId: result.record?.id ?? null,
          source: "requirement",
          projectId: projectId || null,
        });
      }
    }

    // Also include approved records that are expiring within the planning
    // window even when the Training type is not a formal role/project
    // requirement. This makes the planner useful for general renewals too.
    for (const record of records) {
      if (!isTrainingRecordApproved(record)) continue;
      if (record.does_not_expire || !record.expiry_date) continue;

      const employee = projectPeople.find(
        (item) => item.id === record.employee_id,
      );
      if (!employee) continue;

      const days = trainingDaysUntil(record.expiry_date);
      if (days === null) continue;

      const status: TrainingComplianceStatus =
        days < 0
          ? "expired"
          : days <= horizonDays
            ? "expiring"
            : "current";

      if (status === "current" && !showCurrent) continue;

      const trainingTypeId = clean(record.training_type_id);
      if (!trainingTypeId) continue;

      const key = `${employee.id}|${trainingTypeId}`;
      if (rows.has(key)) continue;

      rows.set(key, {
        key,
        employee,
        trainingTypeId,
        trainingName:
          typeById.get(trainingTypeId)?.name ||
          record.training_name ||
          "Training",
        status,
        daysRemaining: days,
        recordId: record.id,
        source: "expiry",
        projectId: projectId || null,
      });
    }

    return Array.from(rows.values()).sort((a, b) => {
      const rank = (status: TrainingComplianceStatus) => {
        if (status === "missing") return 0;
        if (status === "revoked") return 1;
        if (status === "expired") return 2;
        if (status === "pending_review") return 3;
        if (status === "expiring") return 4;
        return 5;
      };

      const statusDiff = rank(a.status) - rank(b.status);
      if (statusDiff !== 0) return statusDiff;

      const dayDiff =
        (a.daysRemaining ?? Number.MAX_SAFE_INTEGER) -
        (b.daysRemaining ?? Number.MAX_SAFE_INTEGER);

      if (dayDiff !== 0) return dayDiff;

      return a.employee.full_name.localeCompare(b.employee.full_name);
    });
  }, [
    horizonDays,
    projectId,
    projectPeople,
    projectRequirements,
    records,
    roleRequirements,
    showCurrent,
    typeById,
  ]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return plannerRows.filter((row) => {
      if (
        trainingTypeId !== "all" &&
        row.trainingTypeId !== trainingTypeId
      ) {
        return false;
      }

      if (!query) return true;

      return [
        row.employee.full_name,
        row.employee.payroll_id,
        row.employee.role,
        crewLabel(
          row.employee.crew_id
            ? crewById.get(row.employee.crew_id)
            : null,
        ),
        row.trainingName,
        trainingComplianceLabel(row.status),
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [
    crewById,
    plannerRows,
    search,
    trainingTypeId,
  ]);

  const selectedSet = useMemo(
    () => new Set(selectedKeys),
    [selectedKeys],
  );

  const selectedRows = useMemo(
    () => filtered.filter((row) => selectedSet.has(row.key)),
    [filtered, selectedSet],
  );

  useEffect(() => {
    setSelectedKeys((current) =>
      current.filter((key) =>
        plannerRows.some((row) => row.key === key),
      ),
    );
  }, [plannerRows]);

  const summary = useMemo(
    () => ({
      missing: filtered.filter((row) => row.status === "missing")
        .length,
      expired: filtered.filter((row) => row.status === "expired")
        .length,
      expiring: filtered.filter((row) => row.status === "expiring")
        .length,
      pending: filtered.filter(
        (row) => row.status === "pending_review",
      ).length,
      selected: selectedRows.length,
    }),
    [filtered, selectedRows.length],
  );

  function toggleSelection(key: string) {
    setSelectedKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  function selectByStatus(
    statuses: TrainingComplianceStatus[],
  ) {
    setSelectedKeys(
      filtered
        .filter((row) => statuses.includes(row.status))
        .map((row) => row.key),
    );
  }

  function selectAllVisible() {
    setSelectedKeys(filtered.map((row) => row.key));
  }

  function clearSelection() {
    setSelectedKeys([]);
  }

  const selectedTypeIds = useMemo(
    () =>
      Array.from(
        new Set(selectedRows.map((row) => row.trainingTypeId)),
      ),
    [selectedRows],
  );

  const bulkUploadHref = useMemo(() => {
    if (
      selectedRows.length === 0 ||
      selectedTypeIds.length !== 1
    ) {
      return null;
    }

    const params = new URLSearchParams();
    params.set("trainingTypeId", selectedTypeIds[0]);

    if (projectId) params.set("projectId", projectId);

    params.set(
      "employeeIds",
      Array.from(
        new Set(selectedRows.map((row) => row.employee.id)),
      ).join(","),
    );

    return `/people/training/bulk-upload?${params.toString()}`;
  }, [projectId, selectedRows, selectedTypeIds]);

  function exportPlan() {
    const headers = [
      "Selected",
      "Employee",
      "Payroll ID",
      "Role",
      "Crew",
      "Training",
      "Status",
      "Days Remaining",
      "Project",
      "Source",
    ];

    const rows = filtered.map((row) => [
      selectedSet.has(row.key) ? "Yes" : "No",
      row.employee.full_name,
      row.employee.payroll_id,
      row.employee.role,
      crewLabel(
        row.employee.crew_id
          ? crewById.get(row.employee.crew_id)
          : null,
      ),
      row.trainingName,
      trainingComplianceLabel(row.status),
      row.daysRemaining ?? "",
      projectId
        ? projectLabel(projectById.get(projectId))
        : "Company-wide",
      row.source,
    ]);

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
    link.download = `training-gap-analysis-${new Date()
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
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-violet-700">
                <CalendarDays size={17} />
                Gap analysis
              </div>
              <h1 className="mt-2 text-3xl font-black text-slate-950">
                Training Planner
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                Find missing, expired and upcoming Training, then tick or untick
                exactly who you want in the next course or renewal group.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportPlan}
                disabled={filtered.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"
              >
                <Download size={16} />
                Export Gap Analysis
              </button>

              {bulkUploadHref ? (
                <Link
                  href={bulkUploadHref}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white"
                >
                  <UploadCloud size={16} />
                  Open Bulk Upload ({selectedRows.length})
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  title={
                    selectedRows.length === 0
                      ? "Select people first."
                      : "Select rows for one Training type at a time."
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-black text-slate-500"
                >
                  <UploadCloud size={16} />
                  Open Bulk Upload
                </button>
              )}
            </div>
          </div>
        </section>

        {message ? (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
              message.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <select
              className={inputClass}
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                clearSelection();
              }}
            >
              <option value="">Company-wide / role requirements</option>
              {projects
                .filter((project) => !isInactiveProject(project))
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {projectLabel(project)}
                  </option>
                ))}
            </select>

            <select
              className={inputClass}
              value={trainingTypeId}
              onChange={(event) => {
                setTrainingTypeId(event.target.value);
                clearSelection();
              }}
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
              value={horizon}
              onChange={(event) => setHorizon(event.target.value)}
            >
              <option value="30">Next 30 days</option>
              <option value="60">Next 60 days</option>
              <option value="90">Next 90 days</option>
              <option value="180">Next 6 months</option>
              <option value="365">Next 12 months</option>
            </select>

            <label className="relative">
              <Search
                size={16}
                className="absolute left-3 top-3.5 text-slate-400"
              />
              <input
                className={`${inputClass} pl-9`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search people..."
              />
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                checked={showCurrent}
                onChange={(event) =>
                  setShowCurrent(event.target.checked)
                }
              />
              Include current
            </label>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Missing" value={summary.missing} />
          <Metric label="Expired" value={summary.expired} />
          <Metric label={`Expiring ≤ ${horizonDays}d`} value={summary.expiring} />
          <Metric label="Pending Review" value={summary.pending} />
          <Metric label="Selected" value={summary.selected} />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={selectAllVisible}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700"
            >
              Select All Visible
            </button>
            <button
              type="button"
              onClick={() =>
                selectByStatus(["missing", "expired", "revoked"])
              }
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-black text-rose-700"
            >
              Select Gaps
            </button>
            <button
              type="button"
              onClick={() => selectByStatus(["expiring"])}
              className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-black text-amber-800"
            >
              Select Expiring
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700"
            >
              Clear Selection
            </button>

            {selectedRows.length > 0 &&
            selectedTypeIds.length > 1 ? (
              <span className="text-sm font-semibold text-amber-700">
                Select one Training type before opening Bulk Upload.
              </span>
            ) : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1150px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-14 px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Training</th>
                  <th className="px-4 py-3">Gap / Risk</th>
                  <th className="px-4 py-3">Days</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((row) => {
                  const checked = selectedSet.has(row.key);

                  return (
                    <tr
                      key={row.key}
                      className={
                        checked ? "bg-blue-50/50" : "hover:bg-slate-50"
                      }
                    >
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => toggleSelection(row.key)}
                          className="text-blue-700"
                          aria-label={
                            checked
                              ? "Remove from plan"
                              : "Add to plan"
                          }
                        >
                          {checked ? (
                            <CheckSquare size={21} />
                          ) : (
                            <Square size={21} />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-black text-slate-950">
                          {row.employee.full_name}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {row.employee.role || "No role"} ·{" "}
                          {crewLabel(
                            row.employee.crew_id
                              ? crewById.get(row.employee.crew_id)
                              : null,
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 font-bold text-slate-900">
                        {row.trainingName}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${statusClasses(
                            row.status,
                          )}`}
                        >
                          {trainingComplianceLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-bold text-slate-700">
                        {row.daysRemaining ?? "—"}
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {projectLabel(
                          row.projectId
                            ? projectById.get(row.projectId)
                            : null,
                        )}
                      </td>
                      <td className="px-4 py-4 text-slate-500">
                        {row.source === "requirement"
                          ? "Compliance requirement"
                          : "Upcoming expiry"}
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
                      No gaps or upcoming expiries match this planning window.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          This planner intentionally uses the existing controlled Bulk Upload
          flow for certificates. It does not invent a second certificate
          register. The selected people and Training type are handed directly
          to Bulk Upload.
        </section>
      </main>
    </AppShell>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

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

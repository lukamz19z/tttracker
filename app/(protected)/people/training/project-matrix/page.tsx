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
  Grid3X3,
  Loader2,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";
import {
  combinedRequirementsForEmployee,
  evaluateTrainingRequirement,
  isBlockingTrainingStatus,
  isCompliantTrainingStatus,
  trainingComplianceLabel,
  type ProjectTrainingRequirementLike,
  type RoleTrainingRequirementLike,
  type TrainingComplianceStatus,
  type TrainingRecordLike,
  type TrainingRequirementLike,
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
  id: string;
  project_id: string;
  employee_id: string;
  included: boolean;
  source: string | null;
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

type MatrixRow = {
  employee: Employee;
  requirements: Map<string, TrainingRequirementLike>;
  cells: Map<
    string,
    ReturnType<typeof evaluateTrainingRequirement>
  >;
  mandatoryTotal: number;
  mandatoryCompliant: number;
  blockers: number;
  pending: number;
  expiring: number;
  score: number;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function projectLabel(project?: Project | null) {
  if (!project) return "Unknown project";
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

function cellClasses(status: TrainingComplianceStatus) {
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
      return "border-slate-200 bg-slate-50 text-slate-400";
  }
}

function cellText(status: TrainingComplianceStatus) {
  switch (status) {
    case "current":
      return "✓";
    case "expiring":
      return "⚠";
    case "pending_review":
      return "P";
    case "missing":
      return "—";
    case "expired":
      return "EXP";
    case "revoked":
      return "REV";
    case "not_required":
      return "";
  }
}

function csv(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function ProjectTrainingMatrixPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [types, setTypes] = useState<TrainingType[]>([]);
  const [projectAccess, setProjectAccess] = useState<ProjectAccess[]>([]);
  const [overrides, setOverrides] = useState<PopulationOverride[]>([]);
  const [roleRequirements, setRoleRequirements] = useState<
    RoleRequirement[]
  >([]);
  const [projectRequirements, setProjectRequirements] = useState<
    ProjectRequirement[]
  >([]);
  const [records, setRecords] = useState<TrainingRecord[]>([]);

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "ready" | "blocked" | "expiring" | "pending"
  >("all");
  const [populationOpen, setPopulationOpen] = useState(false);
  const [populationSearch, setPopulationSearch] = useState("");
  const [savingPopulation, setSavingPopulation] = useState(false);
  const [includeInactiveProjects, setIncludeInactiveProjects] =
    useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
      overrideResult,
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
        .select("id,project_id,employee_id,included,source"),
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
      overrideResult.error,
      roleRequirementResult.error,
      projectRequirementResult.error,
      recordResult.error,
    ].find(Boolean);

    if (firstError) throw new Error(firstError.message);

    const loadedProjects = (projectResult.data ?? []) as Project[];

    setProjects(loadedProjects);
    setEmployees((employeeResult.data ?? []) as Employee[]);
    setCrews((crewResult.data ?? []) as Crew[]);
    setTypes((typeResult.data ?? []) as TrainingType[]);
    setProjectAccess((accessResult.data ?? []) as ProjectAccess[]);
    setOverrides((overrideResult.data ?? []) as PopulationOverride[]);
    setRoleRequirements(
      (roleRequirementResult.data ?? []) as RoleRequirement[],
    );
    setProjectRequirements(
      (projectRequirementResult.data ?? []) as ProjectRequirement[],
    );
    setRecords((recordResult.data ?? []) as TrainingRecord[]);

    setSelectedProjectId((current) => {
      if (
        current &&
        loadedProjects.some((project) => project.id === current)
      ) {
        return current;
      }

      return (
        loadedProjects.find((project) => !isInactiveProject(project))
          ?.id ??
        loadedProjects[0]?.id ??
        ""
      );
    });
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
              : "Unable to load the Project Training Matrix.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData]);

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const crewById = useMemo(
    () => new Map(crews.map((crew) => [crew.id, crew])),
    [crews],
  );

  const typeById = useMemo(
    () => new Map(types.map((type) => [type.id, type])),
    [types],
  );

  const visibleProjects = useMemo(
    () =>
      includeInactiveProjects
        ? projects
        : projects.filter((project) => !isInactiveProject(project)),
    [includeInactiveProjects, projects],
  );

  const linkedUserIds = useMemo(
    () =>
      new Set(
        projectAccess
          .filter(
            (row) => row.project_id === selectedProjectId,
          )
          .map((row) => row.user_id),
      ),
    [projectAccess, selectedProjectId],
  );

  const overrideByEmployee = useMemo(
    () =>
      new Map(
        overrides
          .filter(
            (row) => row.project_id === selectedProjectId,
          )
          .map((row) => [row.employee_id, row]),
      ),
    [overrides, selectedProjectId],
  );

  const isIncluded = useCallback(
    (employee: Employee) => {
      const override = overrideByEmployee.get(employee.id);
      if (override) return override.included;

      return Boolean(
        employee.user_id && linkedUserIds.has(employee.user_id),
      );
    },
    [linkedUserIds, overrideByEmployee],
  );

  const includedEmployees = useMemo(
    () => employees.filter(isIncluded),
    [employees, isIncluded],
  );

  const matrixRows = useMemo<MatrixRow[]>(() => {
    return includedEmployees.map((employee) => {
      const requirements = combinedRequirementsForEmployee({
        employee,
        projectId: selectedProjectId,
        roleRequirements,
        projectRequirements,
      });

      const requirementMap = new Map(
        requirements.map((requirement) => [
          requirement.training_type_id,
          requirement,
        ]),
      );

      const cells = new Map<
        string,
        ReturnType<typeof evaluateTrainingRequirement>
      >();

      let mandatoryTotal = 0;
      let mandatoryCompliant = 0;
      let blockers = 0;
      let pending = 0;
      let expiring = 0;

      for (const requirement of requirements) {
        const cell = evaluateTrainingRequirement({
          employeeId: employee.id,
          requirement,
          records,
          defaultLeadDays: 60,
        });

        cells.set(requirement.training_type_id, cell);

        if (requirement.requirement_level !== "recommended") {
          mandatoryTotal += 1;
          if (isCompliantTrainingStatus(cell.status)) {
            mandatoryCompliant += 1;
          }
          if (isBlockingTrainingStatus(cell.status)) {
            blockers += 1;
          }
          if (cell.status === "pending_review") {
            pending += 1;
          }
          if (cell.status === "expiring") {
            expiring += 1;
          }
        }
      }

      return {
        employee,
        requirements: requirementMap,
        cells,
        mandatoryTotal,
        mandatoryCompliant,
        blockers,
        pending,
        expiring,
        score:
          mandatoryTotal === 0
            ? 100
            : Math.round(
                (mandatoryCompliant / mandatoryTotal) * 100,
              ),
      };
    });
  }, [
    includedEmployees,
    projectRequirements,
    records,
    roleRequirements,
    selectedProjectId,
  ]);

  const visibleColumnIds = useMemo(() => {
    const ids = new Set<string>();

    for (const row of matrixRows) {
      for (const trainingTypeId of row.requirements.keys()) {
        ids.add(trainingTypeId);
      }
    }

    return Array.from(ids).sort((a, b) =>
      (typeById.get(a)?.name ?? "").localeCompare(
        typeById.get(b)?.name ?? "",
      ),
    );
  }, [matrixRows, typeById]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return matrixRows.filter((row) => {
      if (
        query &&
        ![
          row.employee.full_name,
          row.employee.payroll_id,
          row.employee.role,
          crewLabel(
            row.employee.crew_id
              ? crewById.get(row.employee.crew_id)
              : null,
          ),
        ]
          .map(clean)
          .join(" ")
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }

      if (statusFilter === "ready") {
        return row.blockers === 0 && row.pending === 0;
      }

      if (statusFilter === "blocked") {
        return row.blockers > 0;
      }

      if (statusFilter === "expiring") {
        return row.expiring > 0;
      }

      if (statusFilter === "pending") {
        return row.pending > 0;
      }

      return true;
    });
  }, [crewById, matrixRows, search, statusFilter]);

  const summary = useMemo(() => {
    const ready = matrixRows.filter(
      (row) => row.blockers === 0 && row.pending === 0,
    ).length;

    return {
      people: matrixRows.length,
      ready,
      blocked: matrixRows.filter((row) => row.blockers > 0).length,
      expiring: matrixRows.filter((row) => row.expiring > 0).length,
      pending: matrixRows.filter((row) => row.pending > 0).length,
      compliance:
        matrixRows.length === 0
          ? 0
          : Math.round(
              matrixRows.reduce((sum, row) => sum + row.score, 0) /
                matrixRows.length,
            ),
    };
  }, [matrixRows]);

  async function savePopulationRows(
    rows: Array<{ employee_id: string; included: boolean; source: string }>,
  ) {
    if (!selectedProjectId || rows.length === 0) return;

    setSavingPopulation(true);
    setMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = rows.map((row) => ({
        project_id: selectedProjectId,
        employee_id: row.employee_id,
        included: row.included,
        source: row.source,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("project_training_people")
        .upsert(payload, {
          onConflict: "project_id,employee_id",
        });

      if (error) throw new Error(error.message);

      await loadData();
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to update project Training population.",
      });
    } finally {
      setSavingPopulation(false);
    }
  }

  async function toggleEmployee(employee: Employee, included: boolean) {
    await savePopulationRows([
      {
        employee_id: employee.id,
        included,
        source: "manual",
      },
    ]);
  }

  async function applyPopulation(
    mode: "all" | "none" | "project_access",
  ) {
    const rows = employees.map((employee) => ({
      employee_id: employee.id,
      included:
        mode === "all"
          ? true
          : mode === "none"
            ? false
            : Boolean(
                employee.user_id &&
                  linkedUserIds.has(employee.user_id),
              ),
      source:
        mode === "project_access"
          ? "project_access"
          : "manual",
    }));

    await savePopulationRows(rows);
  }

  async function refresh() {
    setRefreshing(true);
    setMessage(null);
    try {
      await loadData();
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to refresh the project matrix.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  function exportMatrix() {
    const headers = [
      "Employee",
      "Payroll ID",
      "Role",
      "Crew",
      "Compliance %",
      "Ready",
      ...visibleColumnIds.map(
        (id) => typeById.get(id)?.name ?? id,
      ),
    ];

    const rows = filteredRows.map((row) => [
      row.employee.full_name,
      row.employee.payroll_id,
      row.employee.role,
      crewLabel(
        row.employee.crew_id
          ? crewById.get(row.employee.crew_id)
          : null,
      ),
      row.score,
      row.blockers === 0 && row.pending === 0 ? "Yes" : "No",
      ...visibleColumnIds.map((id) => {
        const cell = row.cells.get(id);
        return cell
          ? trainingComplianceLabel(cell.status)
          : "Not Required";
      }),
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
    link.download = `project-training-matrix-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const populationFiltered = useMemo(() => {
    const query = populationSearch.trim().toLowerCase();
    return employees.filter((employee) => {
      if (!query) return true;

      return [
        employee.full_name,
        employee.payroll_id,
        employee.role,
        crewLabel(
          employee.crew_id
            ? crewById.get(employee.crew_id)
            : null,
        ),
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [crewById, employees, populationSearch]);

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
      <main className="mx-auto w-full max-w-[1800px] space-y-6 px-4 py-6 sm:px-6">
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
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                <Grid3X3 size={17} />
                Mobilisation readiness
              </div>
              <h1 className="mt-2 text-3xl font-black text-slate-950">
                Project Training Matrix
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                Project requirements and role requirements are evaluated
                against approved Training records. The population is adjustable:
                tick or untick people without changing their employee profile.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPopulationOpen((current) => !current)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700"
              >
                <Users size={16} />
                Project People
              </button>
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
                onClick={exportMatrix}
                disabled={filteredRows.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"
              >
                <Download size={16} />
                Export CSV
              </button>
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
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <label>
              <span className="mb-2 block text-sm font-black text-slate-700">
                Project
              </span>
              <select
                className={inputClass}
                value={selectedProjectId}
                onChange={(event) =>
                  setSelectedProjectId(event.target.value)
                }
              >
                <option value="">Select project...</option>
                {visibleProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {projectLabel(project)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                checked={includeInactiveProjects}
                onChange={(event) =>
                  setIncludeInactiveProjects(event.target.checked)
                }
              />
              Include inactive projects
            </label>
          </div>
        </section>

        {populationOpen ? (
          <section className="rounded-3xl border border-blue-200 bg-blue-50/40 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  Project Training Population
                </h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-600">
                  Project access is used as the initial suggestion. Any manual
                  tick/untick below overrides that suggestion for Training
                  compliance only.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void applyPopulation("project_access")}
                  disabled={savingPopulation}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700"
                >
                  Use Project Linked
                </button>
                <button
                  type="button"
                  onClick={() => void applyPopulation("all")}
                  disabled={savingPopulation}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => void applyPopulation("none")}
                  disabled={savingPopulation}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700"
                >
                  Clear All
                </button>
              </div>
            </div>

            <label className="relative mt-4 block">
              <Search
                size={16}
                className="absolute left-3 top-3.5 text-slate-400"
              />
              <input
                className={`${inputClass} pl-9`}
                value={populationSearch}
                onChange={(event) =>
                  setPopulationSearch(event.target.value)
                }
                placeholder="Search project people..."
              />
            </label>

            <div className="mt-4 grid max-h-80 gap-2 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
              {populationFiltered.map((employee) => (
                <label
                  key={employee.id}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={isIncluded(employee)}
                    disabled={savingPopulation}
                    onChange={(event) =>
                      void toggleEmployee(
                        employee,
                        event.target.checked,
                      )
                    }
                  />
                  <span>
                    <span className="block text-sm font-black text-slate-900">
                      {employee.full_name}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {employee.role || "No role"} ·{" "}
                      {crewLabel(
                        employee.crew_id
                          ? crewById.get(employee.crew_id)
                          : null,
                      )}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Project people" value={summary.people} />
          <Metric label="Ready" value={summary.ready} />
          <Metric label="Blocked" value={summary.blocked} />
          <Metric label="Expiring" value={summary.expiring} />
          <Metric label="Pending review" value={summary.pending} />
          <Metric label="Compliance" value={`${summary.compliance}%`} />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
            <label className="relative">
              <Search
                size={16}
                className="absolute left-3 top-3.5 text-slate-400"
              />
              <input
                className={`${inputClass} pl-9`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search project matrix..."
              />
            </label>

            <select
              className={inputClass}
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as
                    | "all"
                    | "ready"
                    | "blocked"
                    | "expiring"
                    | "pending",
                )
              }
            >
              <option value="all">All people</option>
              <option value="ready">Ready</option>
              <option value="blocked">Blocked</option>
              <option value="expiring">Has expiring Training</option>
              <option value="pending">Has pending evidence</option>
            </select>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-auto">
            <table className="border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 min-w-72 border-b border-r border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600">
                    Employee
                  </th>
                  <th className="sticky top-0 z-20 min-w-28 border-b border-r border-slate-200 bg-slate-100 px-3 py-3 text-center text-xs font-black uppercase tracking-wide text-slate-600">
                    Compliance
                  </th>
                  {visibleColumnIds.map((trainingTypeId) => {
                    const type = typeById.get(trainingTypeId);
                    return (
                      <th
                        key={trainingTypeId}
                        className="sticky top-0 z-20 min-w-36 border-b border-r border-slate-200 bg-slate-100 px-3 py-3 text-center"
                      >
                        <div className="text-xs font-black text-slate-800">
                          {type?.short_code || type?.name || "Training"}
                        </div>
                        {type?.short_code ? (
                          <div className="mt-1 text-[10px] font-semibold text-slate-500">
                            {type.name}
                          </div>
                        ) : null}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.employee.id}>
                    <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-4 py-3">
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
                    <td className="border-b border-r border-slate-100 p-2 text-center">
                      <div
                        className={`mx-auto rounded-xl px-2 py-2 text-sm font-black ${
                          row.blockers === 0 && row.pending === 0
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-rose-50 text-rose-800"
                        }`}
                      >
                        {row.score}%
                      </div>
                    </td>

                    {visibleColumnIds.map((trainingTypeId) => {
                      const cell = row.cells.get(trainingTypeId);

                      if (!cell) {
                        return (
                          <td
                            key={trainingTypeId}
                            className="border-b border-r border-slate-100 p-2"
                          >
                            <div className="mx-auto h-12 w-20 rounded-xl border border-slate-100 bg-slate-50" />
                          </td>
                        );
                      }

                      return (
                        <td
                          key={trainingTypeId}
                          className="border-b border-r border-slate-100 p-2 text-center"
                        >
                          <Link
                            href={`/people/training/register?employeeId=${encodeURIComponent(
                              row.employee.id,
                            )}&trainingTypeId=${encodeURIComponent(
                              trainingTypeId,
                            )}&projectId=${encodeURIComponent(
                              selectedProjectId,
                            )}`}
                            title={`${trainingComplianceLabel(
                              cell.status,
                            )}${
                              cell.daysRemaining !== null
                                ? ` · ${cell.daysRemaining} days`
                                : ""
                            }`}
                            className={`mx-auto flex h-12 w-20 items-center justify-center rounded-xl border text-xs font-black ${cellClasses(
                              cell.status,
                            )}`}
                          >
                            {cellText(cell.status)}
                          </Link>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredRows.length === 0 ? (
            <div className="p-10 text-center text-sm font-semibold text-slate-500">
              No employees are currently included in this project matrix or
              match the selected filter.
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <strong>Project:</strong>{" "}
          {projectLabel(projectById.get(selectedProjectId))}. Role-specific
          requirements are automatically merged with project requirements.
          Recommended requirements are displayed but do not block mobilisation.
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
  value: number | string;
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

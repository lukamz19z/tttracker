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
  Check,
  ChevronDown,
  Download,
  Grid3X3,
  Loader2,
  RefreshCw,
  Search,
  Users,
  X,
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

type TrainingOption = {
  id: string;
  training_type_id: string;
  name: string;
  code: string;
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

type ProjectRole = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  active: boolean | null;
};

type ProjectRoleAssignment = {
  id: string;
  project_role_id: string;
  employee_id: string;
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
  projectRoleIds: string[];
  projectRoleNames: string[];
  requirements: Map<string, TrainingRequirementLike>;
  cells: Map<string, ReturnType<typeof evaluateTrainingRequirement>>;
  mandatoryTotal: number;
  mandatoryCompliant: number;
  blockers: number;
  pending: number;
  expiring: number;
  score: number;
};

type MatrixColumn = {
  key: string;
  trainingTypeId: string;
  optionCode: string | null;
  optionName: string | null;
};

type SelectOption = {
  value: string;
  label: string;
  group?: string;
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

function optionKey(trainingTypeId: string, code: string) {
  return `${trainingTypeId}::${clean(code).toUpperCase()}`;
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
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "revoked":
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
  const [options, setOptions] = useState<TrainingOption[]>([]);
  const [projectAccess, setProjectAccess] = useState<ProjectAccess[]>([]);
  const [overrides, setOverrides] = useState<PopulationOverride[]>([]);
  const [projectRoles, setProjectRoles] = useState<ProjectRole[]>([]);
  const [projectRoleAssignments, setProjectRoleAssignments] = useState<ProjectRoleAssignment[]>([]);
  const [roleRequirements, setRoleRequirements] = useState<RoleRequirement[]>([]);
  const [projectRequirements, setProjectRequirements] = useState<ProjectRequirement[]>([]);
  const [records, setRecords] = useState<TrainingRecord[]>([]);

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "ready" | "blocked" | "expiring" | "pending"
  >("all");
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([]);
  const [selectedOptionKeys, setSelectedOptionKeys] = useState<string[]>([]);
  const [populationOpen, setPopulationOpen] = useState(false);
  const [populationSearch, setPopulationSearch] = useState("");
  const [savingPopulation, setSavingPopulation] = useState(false);
  const [includeInactiveProjects, setIncludeInactiveProjects] = useState(false);

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
      optionResult,
      accessResult,
      overrideResult,
      projectRoleResult,
      projectRoleAssignmentResult,
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
        .select("id,payroll_id,full_name,role,crew_id,user_id,active")
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
        .from("training_type_options")
        .select("id,training_type_id,name,code,active")
        .eq("active", true)
        .order("sort_order")
        .order("name"),
      supabase.from("project_access").select("project_id,user_id"),
      supabase
        .from("project_training_people")
        .select("id,project_id,employee_id,included,source"),
      supabase
        .from("project_training_roles")
        .select("id,project_id,name,description,active")
        .eq("active", true)
        .order("name"),
      supabase
        .from("project_training_role_assignments")
        .select("id,project_role_id,employee_id"),
      supabase
        .from("role_training_requirements")
        .select(
          "id,role_name,training_type_id,requirement_level,renewal_lead_days,accepted_alternative_training_type_ids,required_option_codes,active",
        )
        .eq("active", true),
      supabase
        .from("project_training_requirements")
        .select(
          "id,project_id,project_role_id,training_type_id,requirement_level,renewal_lead_days,accepted_alternative_training_type_ids,required_option_codes,applies_to_role,active",
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
      optionResult.error,
      accessResult.error,
      overrideResult.error,
      projectRoleResult.error,
      projectRoleAssignmentResult.error,
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
    setOptions((optionResult.data ?? []) as TrainingOption[]);
    setProjectAccess((accessResult.data ?? []) as ProjectAccess[]);
    setOverrides((overrideResult.data ?? []) as PopulationOverride[]);
    setProjectRoles((projectRoleResult.data ?? []) as ProjectRole[]);
    setProjectRoleAssignments(
      (projectRoleAssignmentResult.data ?? []) as ProjectRoleAssignment[],
    );
    setRoleRequirements((roleRequirementResult.data ?? []) as RoleRequirement[]);
    setProjectRequirements(
      (projectRequirementResult.data ?? []) as ProjectRequirement[],
    );
    setRecords((recordResult.data ?? []) as TrainingRecord[]);

    setSelectedProjectId((current) => {
      if (current && loadedProjects.some((project) => project.id === current)) {
        return current;
      }
      return (
        loadedProjects.find((project) => !isInactiveProject(project))?.id ??
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
  const roleById = useMemo(
    () => new Map(projectRoles.map((role) => [role.id, role])),
    [projectRoles],
  );

  const visibleProjects = useMemo(
    () =>
      includeInactiveProjects
        ? projects
        : projects.filter((project) => !isInactiveProject(project)),
    [includeInactiveProjects, projects],
  );

  const selectedProjectRoles = useMemo(
    () =>
      projectRoles.filter(
        (role) => role.project_id === selectedProjectId && role.active !== false,
      ),
    [projectRoles, selectedProjectId],
  );

  const linkedUserIds = useMemo(
    () =>
      new Set(
        projectAccess
          .filter((row) => row.project_id === selectedProjectId)
          .map((row) => row.user_id),
      ),
    [projectAccess, selectedProjectId],
  );

  const projectRoleAssignedEmployeeIds = useMemo(() => {
    const selectedRoleSet = new Set(selectedProjectRoles.map((role) => role.id));
    return new Set(
      projectRoleAssignments
        .filter((assignment) => selectedRoleSet.has(assignment.project_role_id))
        .map((assignment) => assignment.employee_id),
    );
  }, [projectRoleAssignments, selectedProjectRoles]);

  const overrideByEmployee = useMemo(
    () =>
      new Map(
        overrides
          .filter((row) => row.project_id === selectedProjectId)
          .map((row) => [row.employee_id, row]),
      ),
    [overrides, selectedProjectId],
  );

  const isIncluded = useCallback(
    (employee: Employee) => {
      const override = overrideByEmployee.get(employee.id);
      if (override) return override.included;
      if (projectRoleAssignedEmployeeIds.has(employee.id)) return true;

      return Boolean(
        employee.user_id && linkedUserIds.has(employee.user_id),
      );
    },
    [linkedUserIds, overrideByEmployee, projectRoleAssignedEmployeeIds],
  );

  const includedEmployees = useMemo(
    () => employees.filter(isIncluded),
    [employees, isIncluded],
  );

  const projectRoleIdsByEmployee = useMemo(() => {
    const selectedRoleSet = new Set(selectedProjectRoles.map((role) => role.id));
    const map = new Map<string, string[]>();
    for (const assignment of projectRoleAssignments) {
      if (!selectedRoleSet.has(assignment.project_role_id)) continue;
      const current = map.get(assignment.employee_id) ?? [];
      current.push(assignment.project_role_id);
      map.set(assignment.employee_id, current);
    }
    return map;
  }, [projectRoleAssignments, selectedProjectRoles]);

  const matrixRows = useMemo<MatrixRow[]>(() => {
    return includedEmployees.map((employee) => {
      const projectRoleIds = projectRoleIdsByEmployee.get(employee.id) ?? [];
      const requirements = combinedRequirementsForEmployee({
        employee,
        projectId: selectedProjectId,
        roleRequirements,
        projectRequirements,
        projectRoleIds,
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
          if (isCompliantTrainingStatus(cell.status)) mandatoryCompliant += 1;
          if (isBlockingTrainingStatus(cell.status)) blockers += 1;
          if (cell.status === "pending_review") pending += 1;
          if (cell.status === "expiring") expiring += 1;
        }
      }

      return {
        employee,
        projectRoleIds,
        projectRoleNames: projectRoleIds
          .map((id) => roleById.get(id)?.name)
          .filter((name): name is string => Boolean(name)),
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
            : Math.round((mandatoryCompliant / mandatoryTotal) * 100),
      };
    });
  }, [
    includedEmployees,
    projectRequirements,
    projectRoleIdsByEmployee,
    records,
    roleById,
    roleRequirements,
    selectedProjectId,
  ]);

  const requiredTypeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of matrixRows) {
      for (const trainingTypeId of row.requirements.keys()) ids.add(trainingTypeId);
    }
    return ids;
  }, [matrixRows]);

  const ticketFilterOptions = useMemo<SelectOption[]>(
    () =>
      Array.from(requiredTypeIds)
        .map((id) => typeById.get(id))
        .filter((type): type is TrainingType => Boolean(type))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((type) => ({
          value: type.id,
          label: type.short_code ? `${type.short_code} · ${type.name}` : type.name,
          group: clean(type.category) || "Other",
        })),
    [requiredTypeIds, typeById],
  );

  const classFilterOptions = useMemo<SelectOption[]>(() => {
    const allowedTypeIds = new Set(
      selectedTypeIds.length > 0 ? selectedTypeIds : Array.from(requiredTypeIds),
    );
    const requiredCodesByType = new Map<string, Set<string>>();

    for (const row of matrixRows) {
      for (const requirement of row.requirements.values()) {
        const codes = requiredCodesByType.get(requirement.training_type_id) ?? new Set<string>();
        for (const code of requirement.required_option_codes ?? []) {
          codes.add(clean(code).toUpperCase());
        }
        requiredCodesByType.set(requirement.training_type_id, codes);
      }
    }

    return options
      .filter((option) => {
        if (!allowedTypeIds.has(option.training_type_id)) return false;
        const requiredCodes = requiredCodesByType.get(option.training_type_id);
        return Boolean(requiredCodes?.has(clean(option.code).toUpperCase()));
      })
      .map((option) => {
        const type = typeById.get(option.training_type_id);
        const typeLabel = type?.short_code || type?.name || "Training";
        return {
          value: optionKey(option.training_type_id, option.code),
          label: `${typeLabel} · ${option.name} (${option.code})`,
          group: type?.name || "Training",
        };
      });
  }, [matrixRows, options, requiredTypeIds, selectedTypeIds, typeById]);

  useEffect(() => {
    const allowedTypes = new Set(ticketFilterOptions.map((option) => option.value));
    setSelectedTypeIds((current) => current.filter((id) => allowedTypes.has(id)));
  }, [ticketFilterOptions]);

  useEffect(() => {
    const allowedOptions = new Set(classFilterOptions.map((option) => option.value));
    setSelectedOptionKeys((current) =>
      current.filter((value) => allowedOptions.has(value)),
    );
  }, [classFilterOptions]);

  useEffect(() => {
    const allowedRoles = new Set(selectedProjectRoles.map((role) => role.id));
    setSelectedRoleIds((current) => current.filter((id) => allowedRoles.has(id)));
  }, [selectedProjectRoles]);

  const columns = useMemo<MatrixColumn[]>(() => {
    const selectedOptionSet = new Set(selectedOptionKeys);
    const selectedTypeSet = new Set(selectedTypeIds);
    const optionTypeIds = new Set(
      selectedOptionKeys
        .map((value) => value.split("::")[0])
        .filter(Boolean),
    );
    const result: MatrixColumn[] = [];

    for (const trainingTypeId of Array.from(requiredTypeIds).sort((a, b) =>
      (typeById.get(a)?.name ?? "").localeCompare(typeById.get(b)?.name ?? ""),
    )) {
      if (selectedTypeSet.size > 0 && !selectedTypeSet.has(trainingTypeId)) continue;
      if (selectedTypeSet.size === 0 && optionTypeIds.size > 0 && !optionTypeIds.has(trainingTypeId)) continue;

      const requirementCodes = new Set<string>();
      for (const row of matrixRows) {
        const requirement = row.requirements.get(trainingTypeId);
        for (const code of requirement?.required_option_codes ?? []) {
          requirementCodes.add(clean(code).toUpperCase());
        }
      }

      if (requirementCodes.size > 0) {
        const configured = options.filter(
          (option) =>
            option.training_type_id === trainingTypeId &&
            requirementCodes.has(clean(option.code).toUpperCase()),
        );
        const selectedConfigured = configured.filter((option) =>
          selectedOptionSet.has(optionKey(trainingTypeId, option.code)),
        );
        const toShow = selectedConfigured.length > 0 ? selectedConfigured : configured;

        for (const option of toShow) {
          result.push({
            key: optionKey(trainingTypeId, option.code),
            trainingTypeId,
            optionCode: option.code,
            optionName: option.name,
          });
        }
        continue;
      }

      result.push({
        key: trainingTypeId,
        trainingTypeId,
        optionCode: null,
        optionName: null,
      });
    }

    return result;
  }, [matrixRows, options, requiredTypeIds, selectedOptionKeys, selectedTypeIds, typeById]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const selectedRoleSet = new Set(selectedRoleIds);

    return matrixRows.filter((row) => {
      if (
        selectedRoleSet.size > 0 &&
        !row.projectRoleIds.some((id) => selectedRoleSet.has(id))
      ) {
        return false;
      }

      if (
        query &&
        ![
          row.employee.full_name,
          row.employee.payroll_id,
          row.employee.role,
          row.projectRoleNames.join(" "),
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

      if (statusFilter === "ready") return row.blockers === 0 && row.pending === 0;
      if (statusFilter === "blocked") return row.blockers > 0;
      if (statusFilter === "expiring") return row.expiring > 0;
      if (statusFilter === "pending") return row.pending > 0;
      return true;
    });
  }, [crewById, matrixRows, search, selectedRoleIds, statusFilter]);

  const summary = useMemo(() => {
    const rows = filteredRows;
    const ready = rows.filter((row) => row.blockers === 0 && row.pending === 0).length;
    return {
      people: rows.length,
      ready,
      blocked: rows.filter((row) => row.blockers > 0).length,
      expiring: rows.filter((row) => row.expiring > 0).length,
      pending: rows.filter((row) => row.pending > 0).length,
      compliance:
        rows.length === 0
          ? 0
          : Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length),
    };
  }, [filteredRows]);

  function cellForColumn(row: MatrixRow, column: MatrixColumn) {
    const requirement = row.requirements.get(column.trainingTypeId);
    if (!requirement) return null;

    if (column.optionCode) {
      const requiredCodes = (requirement.required_option_codes ?? []).map((code) =>
        clean(code).toUpperCase(),
      );
      if (!requiredCodes.includes(clean(column.optionCode).toUpperCase())) return null;

      return evaluateTrainingRequirement({
        employeeId: row.employee.id,
        requirement: {
          ...requirement,
          required_option_codes: [column.optionCode],
        },
        records,
        defaultLeadDays: 60,
      });
    }

    return row.cells.get(column.trainingTypeId) ?? null;
  }

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
        .upsert(payload, { onConflict: "project_id,employee_id" });
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
      { employee_id: employee.id, included, source: "manual" },
    ]);
  }

  async function applyPopulation(mode: "all" | "none" | "project_access") {
    const rows = employees.map((employee) => ({
      employee_id: employee.id,
      included:
        mode === "all"
          ? true
          : mode === "none"
            ? false
            : Boolean(employee.user_id && linkedUserIds.has(employee.user_id)),
      source: mode === "project_access" ? "project_access" : "manual",
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
        text: error instanceof Error ? error.message : "Unable to refresh the project matrix.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  function clearMatrixFilters() {
    setSelectedRoleIds([]);
    setSelectedTypeIds([]);
    setSelectedOptionKeys([]);
  }

  function exportMatrix() {
    const headers = [
      "Employee",
      "Payroll ID",
      "Employee Role",
      "Project Role",
      "Crew",
      "Compliance %",
      "Ready",
      ...columns.map((column) => {
        const type = typeById.get(column.trainingTypeId);
        return column.optionCode
          ? `${type?.name ?? "Training"} - ${column.optionName ?? column.optionCode} (${column.optionCode})`
          : type?.name ?? column.trainingTypeId;
      }),
    ];

    const rows = filteredRows.map((row) => [
      row.employee.full_name,
      row.employee.payroll_id,
      row.employee.role,
      row.projectRoleNames.join("; "),
      crewLabel(
        row.employee.crew_id ? crewById.get(row.employee.crew_id) : null,
      ),
      row.score,
      row.blockers === 0 && row.pending === 0 ? "Yes" : "No",
      ...columns.map((column) => {
        const cell = cellForColumn(row, column);
        return cell ? trainingComplianceLabel(cell.status) : "Not Required";
      }),
    ]);

    const content = [
      headers.map(csv).join(","),
      ...rows.map((row) => row.map(csv).join(",")),
    ].join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `project-training-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
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
        crewLabel(employee.crew_id ? crewById.get(employee.crew_id) : null),
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
      <main className="mx-auto w-full max-w-[1800px] space-y-5 px-4 py-6 sm:px-6">
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
                Project roles and project-specific requirements are merged with
                company role requirements. Ticket and class filters let you keep
                the matrix narrow enough to use on site.
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
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
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
              <span className="mb-2 block text-sm font-black text-slate-700">Project</span>
              <select
                className={inputClass}
                value={selectedProjectId}
                onChange={(event) => {
                  setSelectedProjectId(event.target.value);
                  clearMatrixFilters();
                }}
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
                onChange={(event) => setIncludeInactiveProjects(event.target.checked)}
              />
              Include inactive projects
            </label>
          </div>
        </section>

        {populationOpen ? (
          <section className="rounded-3xl border border-blue-200 bg-blue-50/40 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-950">Project Training Population</h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-600">
                  Project access is the starting point. Manual inclusions or exclusions
                  below affect Training compliance only.
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
              <Search size={16} className="absolute left-3 top-3.5 text-slate-400" />
              <input
                className={`${inputClass} pl-9`}
                value={populationSearch}
                onChange={(event) => setPopulationSearch(event.target.value)}
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
                      void toggleEmployee(employee, event.target.checked)
                    }
                  />
                  <span>
                    <span className="block text-sm font-black text-slate-900">
                      {employee.full_name}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {employee.role || "No employee role"} ·{" "}
                      {crewLabel(
                        employee.crew_id ? crewById.get(employee.crew_id) : null,
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
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-sm font-black text-slate-700">Matrix filters</div>
            {(selectedRoleIds.length > 0 ||
              selectedTypeIds.length > 0 ||
              selectedOptionKeys.length > 0) && (
              <button
                type="button"
                onClick={clearMatrixFilters}
                className="inline-flex items-center gap-1.5 text-xs font-black text-slate-500 hover:text-slate-900"
              >
                <X size={14} />
                Clear filters
              </button>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="relative xl:col-span-2">
              <Search size={16} className="absolute left-3 top-3.5 text-slate-400" />
              <input
                className={`${inputClass} pl-9`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search employee, role or crew..."
              />
            </label>

            <MultiSelectFilter
              label="Project roles"
              emptyLabel="All project roles"
              selected={selectedRoleIds}
              onChange={setSelectedRoleIds}
              options={selectedProjectRoles.map((role) => ({
                value: role.id,
                label: role.name,
              }))}
              disabled={selectedProjectRoles.length === 0}
            />

            <MultiSelectFilter
              label="Tickets"
              emptyLabel="All required tickets"
              selected={selectedTypeIds}
              onChange={setSelectedTypeIds}
              options={ticketFilterOptions}
              disabled={ticketFilterOptions.length === 0}
            />

            <MultiSelectFilter
              label="Classes / options"
              emptyLabel="All required classes"
              selected={selectedOptionKeys}
              onChange={setSelectedOptionKeys}
              options={classFilterOptions}
              disabled={classFilterOptions.length === 0}
            />

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
                    Employee / Project Role
                  </th>
                  <th className="sticky top-0 z-20 min-w-24 border-b border-r border-slate-200 bg-slate-100 px-2 py-3 text-center text-xs font-black uppercase tracking-wide text-slate-600">
                    Compliance
                  </th>
                  {columns.map((column) => {
                    const type = typeById.get(column.trainingTypeId);
                    return (
                      <th
                        key={column.key}
                        className="sticky top-0 z-20 min-w-28 border-b border-r border-slate-200 bg-slate-100 px-2 py-3 text-center"
                      >
                        <div className="text-xs font-black text-slate-800">
                          {type?.short_code || type?.name || "Training"}
                        </div>
                        {column.optionCode ? (
                          <div className="mt-1 rounded-md bg-white/80 px-1.5 py-1 text-[10px] font-black text-slate-600">
                            {column.optionName || column.optionCode}
                            <span className="ml-1 text-slate-400">{column.optionCode}</span>
                          </div>
                        ) : type?.short_code ? (
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
                      <div className="font-black text-slate-950">{row.employee.full_name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {row.employee.role || "No employee role"} ·{" "}
                        {crewLabel(
                          row.employee.crew_id
                            ? crewById.get(row.employee.crew_id)
                            : null,
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {row.projectRoleNames.length > 0 ? (
                          row.projectRoleNames.map((name) => (
                            <span
                              key={name}
                              className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700"
                            >
                              {name}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400">
                            No project role assigned
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="border-b border-r border-slate-100 p-1.5 text-center">
                      <div
                        className={`mx-auto rounded-lg px-2 py-2 text-sm font-black ${
                          row.blockers === 0 && row.pending === 0
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-rose-50 text-rose-800"
                        }`}
                      >
                        {row.score}%
                      </div>
                    </td>

                    {columns.map((column) => {
                      const cell = cellForColumn(row, column);
                      if (!cell) {
                        return (
                          <td
                            key={column.key}
                            className="border-b border-r border-slate-100 p-1.5"
                          >
                            <div className="mx-auto h-10 w-16 rounded-lg border border-slate-100 bg-slate-50" />
                          </td>
                        );
                      }

                      return (
                        <td
                          key={column.key}
                          className="border-b border-r border-slate-100 p-1.5 text-center"
                        >
                          <Link
                            href={`/people/training/register?employeeId=${encodeURIComponent(
                              row.employee.id,
                            )}&trainingTypeId=${encodeURIComponent(
                              column.trainingTypeId,
                            )}&projectId=${encodeURIComponent(selectedProjectId)}`}
                            title={`${trainingComplianceLabel(cell.status)}${
                              cell.daysRemaining !== null
                                ? ` · ${cell.daysRemaining} days`
                                : ""
                            }`}
                            className={`mx-auto flex h-10 w-16 items-center justify-center rounded-lg border text-[11px] font-black ${cellClasses(
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

          {columns.length === 0 ? (
            <div className="p-10 text-center text-sm font-semibold text-slate-500">
              No project Training requirements match the selected ticket filters.
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-10 text-center text-sm font-semibold text-slate-500">
              No employees are currently included in this project matrix or match
              the selected filters.
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <strong>Project:</strong> {projectLabel(projectById.get(selectedProjectId))}.
          Project-defined roles determine project-specific minimum tickets and
          classes. Company role requirements still merge underneath as baseline
          requirements. Removed/revoked evidence is treated as history; a required
          qualification becomes Missing rather than leaving a stale REV cell.
        </section>
      </main>
    </AppShell>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function MultiSelectFilter({
  label,
  emptyLabel,
  options,
  selected,
  onChange,
  disabled = false,
}: {
  label: string;
  emptyLabel: string;
  options: SelectOption[];
  selected: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return options;
    return options.filter((option) =>
      `${option.label} ${option.group ?? ""}`.toLowerCase().includes(value),
    );
  }, [options, query]);

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`${inputClass} flex items-center justify-between gap-3 text-left disabled:bg-slate-50 disabled:text-slate-400`}
      >
        <span className="min-w-0 truncate">
          {selected.length === 0 ? emptyLabel : `${label}: ${selected.length} selected`}
        </span>
        <ChevronDown size={16} className="shrink-0 text-slate-400" />
      </button>

      {open && !disabled ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[min(440px,90vw)] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-3 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className={`${inputClass} py-2.5 pl-9`}
              />
            </div>
            {selected.length > 0 ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-600"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="mt-3 max-h-72 overflow-y-auto">
            {filtered.map((option) => {
              const checked = selected.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggle(option.value)}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      checked
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-300 bg-white text-transparent"
                    }`}
                  >
                    <Check size={13} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-800">
                      {option.label}
                    </span>
                    {option.group ? (
                      <span className="mt-0.5 block text-xs text-slate-400">
                        {option.group}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm font-semibold text-slate-400">
                No matches.
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 w-full rounded-xl bg-slate-950 px-3 py-2.5 text-sm font-black text-white"
          >
            Done
          </button>
        </div>
      ) : null}
    </div>
  );
}

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
      <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
    </div>
  );
}

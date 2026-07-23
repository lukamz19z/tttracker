"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  History,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  UserRound,
  Users,
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
  expiry_date: string | null;
  does_not_expire: boolean | null;
  status: string | null;
  superseded_at: string | null;
  sharepoint_web_url?: string | null;
  created_at?: string | null;
};

type RoleRequirement = {
  id: string;
  role_name: string;
  training_type_id: string;
  requirement_level: "mandatory" | "recommended";
  renewal_lead_days: number | null;
  accepted_alternative_training_type_ids: string[] | null;
  active: boolean | null;
};

type ProjectRequirement = {
  id: string;
  project_id: string;
  training_type_id: string;
  requirement_level: "mandatory" | "recommended";
  renewal_lead_days: number | null;
  accepted_alternative_training_type_ids: string[] | null;
  applies_to_role: string | null;
  active: boolean | null;
};

type RequirementCheck = {
  key: string;
  source: "role" | "project";
  sourceLabel: string;
  trainingTypeId: string;
  trainingName: string;
  requirementLevel: "mandatory" | "recommended";
  renewalLeadDays: number;
  alternatives: string[];
  status: "current" | "due" | "expired" | "missing";
  record: TrainingRecord | null;
};

type EmployeeCompliance = {
  employee: Employee;
  crew: Crew | null;
  projects: Project[];
  checks: RequirementCheck[];
  mandatoryChecks: RequirementCheck[];
  recommendedChecks: RequirementCheck[];
  compliantMandatory: number;
  mandatoryTotal: number;
  compliancePercent: number;
  blocked: boolean;
  dueCount: number;
  expiredCount: number;
  missingCount: number;
};

type RiskSummary = {
  id: string;
  name: string;
  people: number;
  compliant: number;
  blocked: number;
  percent: number;
};

type AttentionItem = {
  employeeId: string;
  employeeName: string;
  role: string;
  crew: string;
  projects: string;
  issue: string;
  detail: string;
  severity: "critical" | "warning" | "info";
  href: string;
};

const DAY_MS = 86_400_000;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalise(value: unknown) {
  return clean(value).replace(/\s+/g, " ").toLowerCase();
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value?: string | null) {
  const target = parseDate(value);
  if (!target) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const fromUtc = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const toUtc = Date.UTC(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  );

  return Math.ceil((toUtc - fromUtc) / DAY_MS);
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

function isInactiveProject(project: Project) {
  return ["completed", "closed", "archived", "inactive"].includes(
    normalise(project.status),
  );
}

function recordIsUsable(record: TrainingRecord) {
  const status = normalise(record.status);

  return (
    !record.superseded_at &&
    !["revoked", "superseded", "cancelled", "void"].includes(status)
  );
}

function recordStatus(
  record: TrainingRecord,
  renewalLeadDays: number,
): "current" | "due" | "expired" {
  if (record.does_not_expire || !record.expiry_date) return "current";

  const remaining = daysUntil(record.expiry_date);
  if (remaining === null) return "current";
  if (remaining < 0) return "expired";
  if (remaining <= renewalLeadDays) return "due";
  return "current";
}

function bestRecord(
  employeeRecords: TrainingRecord[],
  primaryId: string,
  alternatives: string[],
  renewalLeadDays: number,
) {
  const acceptedIds = new Set([primaryId, ...alternatives]);

  const matching = employeeRecords
    .filter(
      (record) =>
        recordIsUsable(record) &&
        Boolean(record.training_type_id) &&
        acceptedIds.has(record.training_type_id!),
    )
    .sort((a, b) => {
      const statusRank = {
        current: 0,
        due: 1,
        expired: 2,
      };

      const aStatus = recordStatus(a, renewalLeadDays);
      const bStatus = recordStatus(b, renewalLeadDays);

      if (statusRank[aStatus] !== statusRank[bStatus]) {
        return statusRank[aStatus] - statusRank[bStatus];
      }

      const aExpiry = parseDate(a.expiry_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bExpiry = parseDate(b.expiry_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;

      return bExpiry - aExpiry;
    });

  return matching[0] ?? null;
}

function percent(value: number, total: number) {
  if (total <= 0) return 100;
  return Math.round((value / total) * 100);
}

function toneForPercent(value: number) {
  if (value >= 95) return "emerald";
  if (value >= 85) return "amber";
  return "rose";
}


export default function TrainingPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectAccess, setProjectAccess] = useState<ProjectAccessRow[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [roleRequirements, setRoleRequirements] = useState<RoleRequirement[]>([]);
  const [projectRequirements, setProjectRequirements] = useState<
    ProjectRequirement[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [crewFilter, setCrewFilter] = useState("all");
  const [includeInactiveProjects, setIncludeInactiveProjects] = useState(false);
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
      roleRequirementResult,
      projectRequirementResult,
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, role, crew_id, user_id, active")
        .eq("active", true)
        .order("full_name"),
      supabase
        .from("crews")
        .select("id, crew_number, crew_name, active")
        .order("crew_number"),
      supabase
        .from("projects")
        .select("id, name, project_number, status")
        .order("name"),
      supabase.from("project_access").select("project_id, user_id"),
      supabase
        .from("training_types")
        .select("id, name, category, active")
        .order("category")
        .order("name"),
      supabase
        .from("employee_training_records")
        .select(
          "id, employee_id, training_type_id, training_name, category, certificate_number, expiry_date, does_not_expire, status, superseded_at, sharepoint_web_url, created_at",
        )
        .is("superseded_at", null),
      supabase
        .from("role_training_requirements")
        .select(
          "id, role_name, training_type_id, requirement_level, renewal_lead_days, accepted_alternative_training_type_ids, active",
        )
        .eq("active", true),
      supabase
        .from("project_training_requirements")
        .select(
          "id, project_id, training_type_id, requirement_level, renewal_lead_days, accepted_alternative_training_type_ids, applies_to_role, active",
        )
        .eq("active", true),
    ]);

    const results = [
      employeeResult,
      crewResult,
      projectResult,
      projectAccessResult,
      trainingTypeResult,
      recordResult,
      roleRequirementResult,
      projectRequirementResult,
    ];

    const error = results.find((result) => result.error)?.error;
    if (error) throw new Error(error.message);

    setEmployees((employeeResult.data ?? []) as Employee[]);
    setCrews((crewResult.data ?? []) as Crew[]);
    setProjects((projectResult.data ?? []) as Project[]);
    setProjectAccess((projectAccessResult.data ?? []) as ProjectAccessRow[]);
    setTrainingTypes((trainingTypeResult.data ?? []) as TrainingType[]);
    setRecords((recordResult.data ?? []) as TrainingRecord[]);
    setRoleRequirements(
      (roleRequirementResult.data ?? []) as RoleRequirement[],
    );
    setProjectRequirements(
      (projectRequirementResult.data ?? []) as ProjectRequirement[],
    );
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
                : "Unable to load the training dashboard.",
          });
        } finally {
          setLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  const crewById = useMemo(
    () => new Map(crews.map((crew) => [crew.id, crew])),
    [crews],
  );

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const trainingTypeById = useMemo(
    () => new Map(trainingTypes.map((item) => [item.id, item])),
    [trainingTypes],
  );

  const recordsByEmployee = useMemo(() => {
    const map = new Map<string, TrainingRecord[]>();

    records.forEach((record) => {
      const list = map.get(record.employee_id) ?? [];
      list.push(record);
      map.set(record.employee_id, list);
    });

    return map;
  }, [records]);

  const projectsByUserId = useMemo(() => {
    const map = new Map<string, Project[]>();

    projectAccess.forEach((row) => {
      const project = projectById.get(row.project_id);
      if (!project) return;
      if (!includeInactiveProjects && isInactiveProject(project)) return;

      const list = map.get(row.user_id) ?? [];
      list.push(project);
      map.set(row.user_id, list);
    });

    return map;
  }, [
    includeInactiveProjects,
    projectAccess,
    projectById,
  ]);

  const complianceRows = useMemo<EmployeeCompliance[]>(() => {
    return employees
      .filter((employee) => employee.active !== false)
      .map((employee) => {
        const employeeRecords = recordsByEmployee.get(employee.id) ?? [];
        const employeeProjects = employee.user_id
          ? projectsByUserId.get(employee.user_id) ?? []
          : [];

        const checks: RequirementCheck[] = [];

        roleRequirements
          .filter(
            (requirement) =>
              requirement.active !== false &&
              normalise(requirement.role_name) === normalise(employee.role),
          )
          .forEach((requirement) => {
            const alternatives =
              requirement.accepted_alternative_training_type_ids ?? [];
            const leadDays = requirement.renewal_lead_days ?? 60;
            const record = bestRecord(
              employeeRecords,
              requirement.training_type_id,
              alternatives,
              leadDays,
            );

            checks.push({
              key: `role-${requirement.id}`,
              source: "role",
              sourceLabel: clean(requirement.role_name) || "Role",
              trainingTypeId: requirement.training_type_id,
              trainingName:
                trainingTypeById.get(requirement.training_type_id)?.name ??
                "Unknown training",
              requirementLevel: requirement.requirement_level,
              renewalLeadDays: leadDays,
              alternatives,
              status: record ? recordStatus(record, leadDays) : "missing",
              record,
            });
          });

        employeeProjects.forEach((project) => {
          projectRequirements
            .filter((requirement) => {
              if (
                requirement.active === false ||
                requirement.project_id !== project.id
              ) {
                return false;
              }

              const role = clean(requirement.applies_to_role);
              return !role || normalise(role) === normalise(employee.role);
            })
            .forEach((requirement) => {
              const duplicate = checks.some(
                (check) =>
                  check.trainingTypeId === requirement.training_type_id &&
                  check.requirementLevel === requirement.requirement_level,
              );

              if (duplicate) return;

              const alternatives =
                requirement.accepted_alternative_training_type_ids ?? [];
              const leadDays = requirement.renewal_lead_days ?? 60;
              const record = bestRecord(
                employeeRecords,
                requirement.training_type_id,
                alternatives,
                leadDays,
              );

              checks.push({
                key: `project-${requirement.id}`,
                source: "project",
                sourceLabel: project.name,
                trainingTypeId: requirement.training_type_id,
                trainingName:
                  trainingTypeById.get(requirement.training_type_id)?.name ??
                  "Unknown training",
                requirementLevel: requirement.requirement_level,
                renewalLeadDays: leadDays,
                alternatives,
                status: record ? recordStatus(record, leadDays) : "missing",
                record,
              });
            });
        });

        const mandatoryChecks = checks.filter(
          (check) => check.requirementLevel === "mandatory",
        );
        const recommendedChecks = checks.filter(
          (check) => check.requirementLevel === "recommended",
        );
        const compliantMandatory = mandatoryChecks.filter(
          (check) => check.status === "current" || check.status === "due",
        ).length;
        const expiredCount = checks.filter(
          (check) => check.status === "expired",
        ).length;
        const missingCount = checks.filter(
          (check) => check.status === "missing",
        ).length;
        const dueCount = checks.filter(
          (check) => check.status === "due",
        ).length;
        const blocked = mandatoryChecks.some(
          (check) =>
            check.status === "expired" || check.status === "missing",
        );

        return {
          employee,
          crew: employee.crew_id
            ? crewById.get(employee.crew_id) ?? null
            : null,
          projects: employeeProjects,
          checks,
          mandatoryChecks,
          recommendedChecks,
          compliantMandatory,
          mandatoryTotal: mandatoryChecks.length,
          compliancePercent: percent(
            compliantMandatory,
            mandatoryChecks.length,
          ),
          blocked,
          dueCount,
          expiredCount,
          missingCount,
        };
      })
      .sort((a, b) => {
        if (a.blocked !== b.blocked) return a.blocked ? -1 : 1;
        if (a.compliancePercent !== b.compliancePercent) {
          return a.compliancePercent - b.compliancePercent;
        }
        return a.employee.full_name.localeCompare(b.employee.full_name);
      });
  }, [
    crewById,
    employees,
    projectRequirements,
    projectsByUserId,
    recordsByEmployee,
    roleRequirements,
    trainingTypeById,
  ]);

  const visibleProjects = useMemo(
    () =>
      includeInactiveProjects
        ? projects
        : projects.filter((project) => !isInactiveProject(project)),
    [includeInactiveProjects, projects],
  );

  const filteredCompliance = useMemo(() => {
    const query = search.trim().toLowerCase();

    return complianceRows.filter((row) => {
      if (
        crewFilter !== "all" &&
        row.employee.crew_id !== crewFilter
      ) {
        return false;
      }

      if (
        projectFilter !== "all" &&
        !row.projects.some((project) => project.id === projectFilter)
      ) {
        return false;
      }

      if (!query) return true;

      return [
        row.employee.full_name,
        row.employee.role,
        crewLabel(row.crew),
        row.projects.map((project) => project.name).join(" "),
        row.checks.map((check) => check.trainingName).join(" "),
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [complianceRows, crewFilter, projectFilter, search]);

  const companyMandatoryTotal = complianceRows.reduce(
    (sum, row) => sum + row.mandatoryTotal,
    0,
  );
  const companyMandatoryCompliant = complianceRows.reduce(
    (sum, row) => sum + row.compliantMandatory,
    0,
  );
  const companyCompliancePercent = percent(
    companyMandatoryCompliant,
    companyMandatoryTotal,
  );
  const fullyCompliantCount = complianceRows.filter(
    (row) => !row.blocked && row.compliancePercent === 100,
  ).length;
  const blockedCount = complianceRows.filter((row) => row.blocked).length;
  const duePeopleCount = complianceRows.filter(
    (row) => row.dueCount > 0,
  ).length;

  const expiredRecords = records.filter((record) => {
    if (!recordIsUsable(record)) return false;
    if (record.does_not_expire || !record.expiry_date) return false;
    const remaining = daysUntil(record.expiry_date);
    return remaining !== null && remaining < 0;
  }).length;

  const due30Records = records.filter((record) => {
    if (!recordIsUsable(record)) return false;
    if (record.does_not_expire || !record.expiry_date) return false;
    const remaining = daysUntil(record.expiry_date);
    return remaining !== null && remaining >= 0 && remaining <= 30;
  }).length;

  const projectRisk = useMemo<RiskSummary[]>(() => {
    return visibleProjects
      .map((project) => {
        const people = complianceRows.filter((row) =>
          row.projects.some((item) => item.id === project.id),
        );
        const compliant = people.filter((row) => !row.blocked).length;
        const blocked = people.length - compliant;

        return {
          id: project.id,
          name: projectLabel(project),
          people: people.length,
          compliant,
          blocked,
          percent: percent(compliant, people.length),
        };
      })
      .filter((item) => item.people > 0)
      .sort((a, b) => a.percent - b.percent || b.people - a.people);
  }, [complianceRows, visibleProjects]);

  const crewRisk = useMemo<RiskSummary[]>(() => {
    return crews
      .filter((crew) => crew.active !== false)
      .map((crew) => {
        const people = complianceRows.filter(
          (row) => row.employee.crew_id === crew.id,
        );
        const compliant = people.filter((row) => !row.blocked).length;
        const blocked = people.length - compliant;

        return {
          id: crew.id,
          name: crewLabel(crew),
          people: people.length,
          compliant,
          blocked,
          percent: percent(compliant, people.length),
        };
      })
      .filter((item) => item.people > 0)
      .sort((a, b) => a.percent - b.percent || b.people - a.people);
  }, [complianceRows, crews]);

  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];

    complianceRows.forEach((row) => {
      row.checks
        .filter((check) => check.status !== "current")
        .forEach((check) => {
          const severity =
            check.status === "expired" || check.status === "missing"
              ? "critical"
              : "warning";

          const detail =
            check.status === "missing"
              ? `${check.trainingName} is missing`
              : check.status === "expired"
                ? `${check.trainingName} expired ${formatDate(
                    check.record?.expiry_date,
                  )}`
                : `${check.trainingName} expires ${formatDate(
                    check.record?.expiry_date,
                  )}`;

          items.push({
            employeeId: row.employee.id,
            employeeName: row.employee.full_name,
            role: row.employee.role || "Role not set",
            crew: crewLabel(row.crew),
            projects:
              row.projects.map((project) => project.name).join(", ") ||
              "No project",
            issue:
              check.status === "missing"
                ? "Missing training"
                : check.status === "expired"
                  ? "Expired training"
                  : "Renewal due",
            detail,
            severity,
            href: `/people/${row.employee.id}`,
          });
        });
    });

    return items
      .sort((a, b) => {
        const rank = { critical: 0, warning: 1, info: 2 };
        if (rank[a.severity] !== rank[b.severity]) {
          return rank[a.severity] - rank[b.severity];
        }
        return a.employeeName.localeCompare(b.employeeName);
      })
      .slice(0, 12);
  }, [complianceRows]);

  async function refreshData() {
    setRefreshing(true);
    setMessage(null);

    try {
      await loadData();
      setMessage({
        tone: "success",
        text: "Training dashboard refreshed.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to refresh the training dashboard.",
      });
    } finally {
      setRefreshing(false);
    }
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
                href="/people"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft size={16} />
                Back to People
              </Link>

              <div className="mt-5 flex items-center gap-2 text-slate-400">
                <LayoutDashboard size={18} />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Training Management
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Training Dashboard
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                A company-wide view of mobilisation readiness, training risk,
                expiring qualifications and the people, crews and projects that
                need immediate attention.
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
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-slate-500">
                <ListChecks size={17} />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Quick Links
                </span>
              </div>
              <h2 className="mt-2 text-lg font-bold text-slate-950">
                Training Management
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Open the key training registers, compliance tools and administration pages.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <QuickLinkButton
              href="/people/training/register"
              title="Training Register"
              description="Employee records"
              icon={<GraduationCap size={18} />}
              tone="slate"
            />
            <QuickLinkButton
              href="/people/training/renewals"
              title="Renewals"
              description="Expired and upcoming"
              icon={<CalendarClock size={18} />}
              tone="amber"
            />
            <QuickLinkButton
              href="/people/training/project-compliance"
              title="Project Compliance"
              description="Mobilisation readiness"
              icon={<ShieldCheck size={18} />}
              tone="emerald"
            />
            <QuickLinkButton
              href="/people/training/requirements"
              title="Role Requirements"
              description="Role-based rules"
              icon={<Settings2 size={18} />}
              tone="violet"
            />
            <QuickLinkButton
              href="/people/training/project-requirements"
              title="Project Requirements"
              description="Project-specific rules"
              icon={<ListChecks size={18} />}
              tone="blue"
            />
            <QuickLinkButton
              href="/people/training/calendar"
              title="Training Calendar"
              description="Courses and bookings"
              icon={<CalendarDays size={18} />}
              tone="blue"
            />
            <QuickLinkButton
              href="/people/training/verification"
              title="Verification Queue"
              description="Evidence review"
              icon={<BadgeCheck size={18} />}
              tone="emerald"
            />
            <QuickLinkButton
              href="/people/training/history"
              title="Training History"
              description="Audit trail"
              icon={<History size={18} />}
              tone="violet"
            />
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
            label="Active Employees"
            value={String(complianceRows.length)}
            detail="Included in dashboard"
            tone="slate"
            icon={<Users size={20} />}
          />
          <MetricCard
            label="Company Compliance"
            value={`${companyCompliancePercent}%`}
            detail="Mandatory requirements"
            tone={toneForPercent(companyCompliancePercent)}
            icon={<ShieldCheck size={20} />}
          />
          <MetricCard
            label="Fully Compliant"
            value={String(fullyCompliantCount)}
            detail="No mobilisation blockers"
            tone="emerald"
            icon={<UserCheck size={20} />}
          />
          <MetricCard
            label="Blocked"
            value={String(blockedCount)}
            detail="Missing or expired mandatory"
            tone={blockedCount > 0 ? "rose" : "slate"}
            icon={<ShieldAlert size={20} />}
          />
          <MetricCard
            label="Renewals Due"
            value={String(duePeopleCount)}
            detail="People with due training"
            tone={duePeopleCount > 0 ? "amber" : "slate"}
            icon={<CalendarClock size={20} />}
          />
          <MetricCard
            label="Expired Records"
            value={String(expiredRecords)}
            detail="All active employee records"
            tone={expiredRecords > 0 ? "rose" : "slate"}
            icon={<AlertTriangle size={20} />}
          />
          <MetricCard
            label="Due in 30 Days"
            value={String(due30Records)}
            detail="Upcoming expiries"
            tone={due30Records > 0 ? "amber" : "slate"}
            icon={<TrendingUp size={20} />}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Company Compliance
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Mandatory role and project requirements currently satisfied.
                </p>
              </div>

              <div className="text-4xl font-bold tracking-tight text-slate-950">
                {companyCompliancePercent}%
              </div>
            </div>

            <div className="mt-6 h-5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${
                  companyCompliancePercent >= 95
                    ? "bg-emerald-500"
                    : companyCompliancePercent >= 85
                      ? "bg-amber-500"
                      : "bg-rose-500"
                }`}
                style={{ width: `${companyCompliancePercent}%` }}
              />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <SummaryTile
                label="Requirements Met"
                value={companyMandatoryCompliant}
                detail={`of ${companyMandatoryTotal} mandatory checks`}
              />
              <SummaryTile
                label="Blocked People"
                value={blockedCount}
                detail="Require action before mobilisation"
              />
              <SummaryTile
                label="Renewal Warnings"
                value={complianceRows.reduce(
                  (sum, row) => sum + row.dueCount,
                  0,
                )}
                detail="Current but within lead time"
              />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">
              Dashboard Filters
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Narrow the employee readiness table.
            </p>

            <div className="mt-5 space-y-3">
              <label className="relative block">
                <Search
                  size={17}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search employee, role or training..."
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </label>

              <SelectField
                value={projectFilter}
                onChange={setProjectFilter}
                options={[
                  { value: "all", label: "All projects" },
                  ...visibleProjects.map((project) => ({
                    value: project.id,
                    label: projectLabel(project),
                  })),
                ]}
              />

              <SelectField
                value={crewFilter}
                onChange={setCrewFilter}
                options={[
                  { value: "all", label: "All crews" },
                  ...crews
                    .filter((crew) => crew.active !== false)
                    .map((crew) => ({
                      value: crew.id,
                      label: crewLabel(crew),
                    })),
                ]}
              />

              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={includeInactiveProjects}
                  onChange={(event) =>
                    setIncludeInactiveProjects(event.target.checked)
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
                Include inactive projects
              </label>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <RiskPanel
            title="Project Risk"
            description="Lowest compliance projects appear first."
            icon={<ClipboardCheck size={18} />}
            items={projectRisk}
            emptyText="No project-linked employees were found."
          />
          <RiskPanel
            title="Crew Risk"
            description="Crew compliance against mandatory requirements."
            icon={<UsersRound size={18} />}
            items={crewRisk}
            emptyText="No active crew allocations were found."
          />
        </section>

        <section>
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-950">
                People Requiring Attention
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                The highest-priority missing, expired and due training items.
              </p>
            </div>

            {attentionItems.length === 0 ? (
              <div className="p-10">
                <EmptyState
                  icon={<BadgeCheck size={30} />}
                  title="No immediate training risks"
                  description="No missing, expired or due requirements were found."
                />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {attentionItems.map((item, index) => (
                  <Link
                    key={`${item.employeeId}-${item.detail}-${index}`}
                    href={item.href}
                    className="grid gap-3 p-5 hover:bg-slate-50 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-center"
                  >
                    <div>
                      <div className="font-bold text-slate-950">
                        {item.employeeName}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {item.role} · {item.crew}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {item.projects}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-bold text-slate-800">
                        {item.issue}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {item.detail}
                      </div>
                    </div>

                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                        item.severity === "critical"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-amber-200 bg-amber-50 text-amber-800"
                      }`}
                    >
                      {item.severity === "critical" ? "Action now" : "Plan renewal"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Employee Readiness
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {filteredCompliance.length} active employee
                {filteredCompliance.length === 1 ? "" : "s"} shown.
              </p>
            </div>

            <Link
              href="/people/training/project-compliance"
              className="text-sm font-semibold text-blue-700 hover:text-blue-900"
            >
              Open detailed compliance
            </Link>
          </div>

          {filteredCompliance.length === 0 ? (
            <div className="p-10">
              <EmptyState
                icon={<UserRound size={30} />}
                title="No employees match"
                description="Change the dashboard filters to show more employees."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Employee</th>
                    <th className="px-5 py-3 font-semibold">Crew / Projects</th>
                    <th className="px-5 py-3 font-semibold">Compliance</th>
                    <th className="px-5 py-3 font-semibold">Issues</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCompliance.map((row) => (
                    <tr key={row.employee.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-950">
                          {row.employee.full_name}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {row.employee.role || "Role not set"}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-700">
                          {crewLabel(row.crew)}
                        </div>
                        <div className="mt-1 max-w-xs text-xs text-slate-500">
                          {row.projects.length
                            ? row.projects
                                .map((project) => project.name)
                                .join(", ")
                            : "No linked project"}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${
                                row.compliancePercent >= 95
                                  ? "bg-emerald-500"
                                  : row.compliancePercent >= 85
                                    ? "bg-amber-500"
                                    : "bg-rose-500"
                              }`}
                              style={{
                                width: `${row.compliancePercent}%`,
                              }}
                            />
                          </div>
                          <span className="font-bold text-slate-800">
                            {row.compliancePercent}%
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {row.compliantMandatory} of {row.mandatoryTotal} mandatory
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {row.expiredCount > 0 ? (
                            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                              {row.expiredCount} expired
                            </span>
                          ) : null}
                          {row.missingCount > 0 ? (
                            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                              {row.missingCount} missing
                            </span>
                          ) : null}
                          {row.dueCount > 0 ? (
                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                              {row.dueCount} due
                            </span>
                          ) : null}
                          {row.expiredCount === 0 &&
                          row.missingCount === 0 &&
                          row.dueCount === 0 ? (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                              No issues
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                            row.blocked
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : row.dueCount > 0
                                ? "border-amber-200 bg-amber-50 text-amber-800"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {row.blocked
                            ? "Blocked"
                            : row.dueCount > 0
                              ? "Compliant · renewal due"
                              : "Ready"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/people/${row.employee.id}`}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <UserRound size={15} />
                          Profile
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
    </AppShell>
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
  tone: "emerald" | "amber" | "rose" | "slate";
  icon: React.ReactNode;
}) {
  const classes =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-800"
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

function SummaryTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-600">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function RiskPanel({
  title,
  description,
  icon,
  items,
  emptyText,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  items: RiskSummary[];
  emptyText: string;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2 text-slate-700">
          {icon}
          <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>

      {items.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-3 p-5">
          {items.slice(0, 8).map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-200 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate font-bold text-slate-900">
                    {item.name}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.people} people · {item.blocked} blocked
                  </div>
                </div>
                <div
                  className={`text-xl font-bold ${
                    item.percent >= 95
                      ? "text-emerald-700"
                      : item.percent >= 85
                        ? "text-amber-700"
                        : "text-rose-700"
                  }`}
                >
                  {item.percent}%
                </div>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${
                    item.percent >= 95
                      ? "bg-emerald-500"
                      : item.percent >= 85
                        ? "bg-amber-500"
                        : "bg-rose-500"
                  }`}
                  style={{ width: `${item.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function QuickLinkButton({
  href,
  title,
  description,
  icon,
  tone,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  tone: "slate" | "violet" | "blue" | "emerald" | "amber";
}) {
  const iconClasses =
    tone === "violet"
      ? "bg-violet-100 text-violet-700"
      : tone === "blue"
        ? "bg-blue-100 text-blue-700"
        : tone === "emerald"
          ? "bg-emerald-100 text-emerald-700"
          : tone === "amber"
            ? "bg-amber-100 text-amber-700"
            : "bg-slate-100 text-slate-700";

  return (
    <Link
      href={href}
      className="group flex min-h-24 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-sm"
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClasses}`}
      >
        {icon}
      </div>

      <div className="min-w-0">
        <h3 className="font-bold text-slate-950 group-hover:text-blue-700">
          {title}
        </h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {description}
        </p>
      </div>
    </Link>
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

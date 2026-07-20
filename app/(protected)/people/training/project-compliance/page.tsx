"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleOff,
  ClipboardCheck,
  Download,
  Eye,
  FileWarning,
  Filter,
  GraduationCap,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type Project = {
  id: string;
  name: string;
  project_number: string | null;
  status: string | null;
};

type Crew = {
  id: string;
  name: string;
  project_id: string | null;
};

type Employee = {
  id: string;
  full_name: string;
  role: string | null;
  active: boolean | null;
  crew_id: string | null;
  project_id: string | null;
};

type TrainingType = {
  id: string;
  name: string;
  short_code: string | null;
  category: string | null;
  expiry_required: boolean | null;
  active: boolean | null;
};

type RoleRequirement = {
  id: string;
  role_name: string;
  training_type_id: string;
  requirement_level: "mandatory" | "recommended";
  renewal_lead_days: number | null;
  accepted_alternative_training_type_ids: string[] | null;
  notes: string | null;
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
  notes: string | null;
  active: boolean | null;
};

type TrainingRecord = {
  id: string;
  employee_id: string;
  training_type_id: string;
  issue_date: string | null;
  expiry_date: string | null;
  status: string | null;
  verification_status: string | null;
  revoked_at: string | null;
  notes: string | null;
};

type TrainingDocument = {
  id: string;
  employee_training_record_id: string;
  document_type_id: string | null;
  file_name: string | null;
  file_url: string | null;
  active: boolean | null;
};

type DocumentRequirement = {
  id: string;
  training_type_id: string;
  training_document_type_id: string;
  required: boolean | null;
};

type ComplianceStatus =
  | "current"
  | "expiring"
  | "expired"
  | "missing"
  | "missing_document"
  | "revoked"
  | "recommended_missing";

type RequirementSource = "role" | "project";

type EvaluatedRequirement = {
  key: string;
  source: RequirementSource;
  sourceLabel: string;
  trainingTypeId: string;
  requirementLevel: "mandatory" | "recommended";
  renewalLeadDays: number;
  acceptedAlternativeTrainingTypeIds: string[];
  notes: string | null;
  status: ComplianceStatus;
  statusLabel: string;
  record: TrainingRecord | null;
  matchedTrainingTypeId: string | null;
  missingDocumentCount: number;
  requiredDocumentCount: number;
  daysRemaining: number | null;
};

type EmployeeCompliance = {
  employee: Employee;
  project: Project | null;
  crew: Crew | null;
  requirements: EvaluatedRequirement[];
  mandatoryTotal: number;
  mandatoryCompliant: number;
  recommendedTotal: number;
  recommendedCompliant: number;
  score: number;
  mobilisationReady: boolean;
  currentCount: number;
  expiringCount: number;
  expiredCount: number;
  missingCount: number;
  missingDocumentCount: number;
  revokedCount: number;
  blockerCount: number;
};

type StatusFilter =
  | "all"
  | "ready"
  | "blocked"
  | "current"
  | "expiring"
  | "expired"
  | "missing"
  | "missing_document"
  | "revoked";

const DAY_MS = 86_400_000;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalise(value: unknown) {
  return clean(value).replace(/\s+/g, " ").toLowerCase();
}

function parseDate(value: string | null | undefined) {
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
  const toUtc = Date.UTC(
    to.getFullYear(),
    to.getMonth(),
    to.getDate(),
  );

  return Math.ceil((toUtc - fromUtc) / DAY_MS);
}

function formatDate(value: string | null | undefined) {
  const date = parseDate(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
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

function plural(value: number, singular: string, pluralLabel?: string) {
  return `${value} ${
    value === 1 ? singular : pluralLabel ?? `${singular}s`
  }`;
}

function statusLabel(status: ComplianceStatus) {
  switch (status) {
    case "current":
      return "Current";
    case "expiring":
      return "Expiring";
    case "expired":
      return "Expired";
    case "missing":
      return "Missing";
    case "missing_document":
      return "Missing Document";
    case "revoked":
      return "Revoked";
    case "recommended_missing":
      return "Recommended Missing";
  }
}

function statusClasses(status: ComplianceStatus) {
  switch (status) {
    case "current":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "expiring":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "expired":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "missing":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "missing_document":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "revoked":
      return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700";
    case "recommended_missing":
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}

function isCompliantStatus(status: ComplianceStatus) {
  return status === "current" || status === "expiring";
}

function isBlockerStatus(status: ComplianceStatus) {
  return (
    status === "expired" ||
    status === "missing" ||
    status === "missing_document" ||
    status === "revoked"
  );
}

export default function ProjectTrainingCompliancePage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [projects, setProjects] = useState<Project[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [roleRequirements, setRoleRequirements] = useState<RoleRequirement[]>([]);
  const [projectRequirements, setProjectRequirements] = useState<
    ProjectRequirement[]
  >([]);
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
  const [trainingDocuments, setTrainingDocuments] = useState<
    TrainingDocument[]
  >([]);
  const [documentRequirements, setDocumentRequirements] = useState<
    DocumentRequirement[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [search, setSearch] = useState("");
  const [crewFilter, setCrewFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [includeInactiveProjects, setIncludeInactiveProjects] = useState(false);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null,
  );

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    const [
      projectResult,
      crewResult,
      employeeResult,
      trainingTypeResult,
      roleRequirementResult,
      projectRequirementResult,
      recordResult,
      documentResult,
      documentRequirementResult,
    ] = await Promise.all([
      supabase
        .from("projects")
        .select("id, name, project_number, status")
        .order("name", { ascending: true }),
      supabase
        .from("crews")
        .select("id, name, project_id")
        .order("name", { ascending: true }),
      supabase
        .from("employees")
        .select("id, full_name, role, active, crew_id, project_id")
        .eq("active", true)
        .order("full_name", { ascending: true }),
      supabase
        .from("training_types")
        .select(
          "id, name, short_code, category, expiry_required, active",
        )
        .order("name", { ascending: true }),
      supabase
        .from("role_training_requirements")
        .select(
          "id, role_name, training_type_id, requirement_level, renewal_lead_days, accepted_alternative_training_type_ids, notes, active",
        )
        .eq("active", true),
      supabase
        .from("project_training_requirements")
        .select(
          "id, project_id, training_type_id, requirement_level, renewal_lead_days, accepted_alternative_training_type_ids, applies_to_role, notes, active",
        )
        .eq("active", true),
      supabase
        .from("employee_training_records")
        .select(
          "id, employee_id, training_type_id, issue_date, expiry_date, status, verification_status, revoked_at, notes",
        ),
      supabase
        .from("employee_training_documents")
        .select(
          "id, employee_training_record_id, document_type_id, file_name, file_url, active",
        )
        .eq("active", true),
      supabase
        .from("training_type_document_requirements")
        .select(
          "id, training_type_id, training_document_type_id, required",
        )
        .eq("required", true),
    ]);

    const errors = [
      projectResult.error,
      crewResult.error,
      employeeResult.error,
      trainingTypeResult.error,
      roleRequirementResult.error,
      projectRequirementResult.error,
      recordResult.error,
      documentResult.error,
      documentRequirementResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      const firstError = errors[0];
      throw new Error(firstError?.message ?? "Unable to load compliance data.");
    }

    setProjects((projectResult.data ?? []) as Project[]);
    setCrews((crewResult.data ?? []) as Crew[]);
    setEmployees((employeeResult.data ?? []) as Employee[]);
    setTrainingTypes((trainingTypeResult.data ?? []) as TrainingType[]);
    setRoleRequirements(
      (roleRequirementResult.data ?? []) as RoleRequirement[],
    );
    setProjectRequirements(
      (projectRequirementResult.data ?? []) as ProjectRequirement[],
    );
    setTrainingRecords((recordResult.data ?? []) as TrainingRecord[]);
    setTrainingDocuments((documentResult.data ?? []) as TrainingDocument[]);
    setDocumentRequirements(
      (documentRequirementResult.data ?? []) as DocumentRequirement[],
    );

    if (!selectedProjectId && (projectResult.data ?? []).length > 0) {
      setSelectedProjectId(projectResult.data?.[0]?.id ?? "");
    }
  }, [selectedProjectId, supabase]);

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
                : "Unable to load project training compliance.",
          });
        } finally {
          setLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const crewById = useMemo(
    () => new Map(crews.map((crew) => [crew.id, crew])),
    [crews],
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

  const recordsByEmployeeId = useMemo(() => {
    const map = new Map<string, TrainingRecord[]>();

    trainingRecords.forEach((record) => {
      const list = map.get(record.employee_id) ?? [];
      list.push(record);
      map.set(record.employee_id, list);
    });

    return map;
  }, [trainingRecords]);

  const documentsByRecordId = useMemo(() => {
    const map = new Map<string, TrainingDocument[]>();

    trainingDocuments.forEach((document) => {
      const list = map.get(document.employee_training_record_id) ?? [];
      list.push(document);
      map.set(document.employee_training_record_id, list);
    });

    return map;
  }, [trainingDocuments]);

  const requiredDocumentTypeIdsByTrainingTypeId = useMemo(() => {
    const map = new Map<string, string[]>();

    documentRequirements.forEach((requirement) => {
      const list = map.get(requirement.training_type_id) ?? [];
      list.push(requirement.training_document_type_id);
      map.set(requirement.training_type_id, list);
    });

    return map;
  }, [documentRequirements]);

  const selectedProject = selectedProjectId
    ? projectById.get(selectedProjectId) ?? null
    : null;

  const visibleProjects = useMemo(() => {
    if (includeInactiveProjects) return projects;

    return projects.filter((project) => {
      const status = normalise(project.status);
      return !["completed", "closed", "archived", "inactive"].includes(status);
    });
  }, [includeInactiveProjects, projects]);

  const projectEmployees = useMemo(() => {
    if (!selectedProjectId) return [];

    const projectCrewIds = new Set(
      crews
        .filter((crew) => crew.project_id === selectedProjectId)
        .map((crew) => crew.id),
    );

    return employees.filter(
      (employee) =>
        employee.project_id === selectedProjectId ||
        (employee.crew_id ? projectCrewIds.has(employee.crew_id) : false),
    );
  }, [crews, employees, selectedProjectId]);

  const evaluateRequirement = useCallback(
    ({
      employee,
      trainingTypeId,
      requirementLevel,
      renewalLeadDays,
      acceptedAlternativeTrainingTypeIds,
      source,
      sourceLabel,
      notes,
      key,
    }: {
      employee: Employee;
      trainingTypeId: string;
      requirementLevel: "mandatory" | "recommended";
      renewalLeadDays: number;
      acceptedAlternativeTrainingTypeIds: string[];
      source: RequirementSource;
      sourceLabel: string;
      notes: string | null;
      key: string;
    }): EvaluatedRequirement => {
      const today = new Date();
      const candidateTrainingTypeIds = [
        trainingTypeId,
        ...acceptedAlternativeTrainingTypeIds,
      ];

      const employeeRecords = recordsByEmployeeId.get(employee.id) ?? [];

      const candidates = employeeRecords
        .filter((record) =>
          candidateTrainingTypeIds.includes(record.training_type_id),
        )
        .sort((a, b) => {
          const aExpiry = parseDate(a.expiry_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const bExpiry = parseDate(b.expiry_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
          return bExpiry - aExpiry;
        });

      const record =
        candidates.find((candidate) => {
          const status = normalise(candidate.status);
          return !["superseded", "cancelled", "void"].includes(status);
        }) ?? null;

      if (!record) {
        const missingStatus: ComplianceStatus =
          requirementLevel === "mandatory"
            ? "missing"
            : "recommended_missing";

        return {
          key,
          source,
          sourceLabel,
          trainingTypeId,
          requirementLevel,
          renewalLeadDays,
          acceptedAlternativeTrainingTypeIds,
          notes,
          status: missingStatus,
          statusLabel: statusLabel(missingStatus),
          record: null,
          matchedTrainingTypeId: null,
          missingDocumentCount: 0,
          requiredDocumentCount:
            requiredDocumentTypeIdsByTrainingTypeId.get(trainingTypeId)
              ?.length ?? 0,
          daysRemaining: null,
        };
      }

      if (
        record.revoked_at ||
        ["revoked", "suspended", "invalid"].includes(normalise(record.status))
      ) {
        return {
          key,
          source,
          sourceLabel,
          trainingTypeId,
          requirementLevel,
          renewalLeadDays,
          acceptedAlternativeTrainingTypeIds,
          notes,
          status: "revoked",
          statusLabel: statusLabel("revoked"),
          record,
          matchedTrainingTypeId: record.training_type_id,
          missingDocumentCount: 0,
          requiredDocumentCount:
            requiredDocumentTypeIdsByTrainingTypeId.get(
              record.training_type_id,
            )?.length ?? 0,
          daysRemaining: null,
        };
      }

      const requiredDocumentTypeIds =
        requiredDocumentTypeIdsByTrainingTypeId.get(
          record.training_type_id,
        ) ?? [];

      const recordDocuments = documentsByRecordId.get(record.id) ?? [];
      const uploadedDocumentTypeIds = new Set(
        recordDocuments
          .map((document) => document.document_type_id)
          .filter((value): value is string => Boolean(value)),
      );

      const missingDocumentCount = requiredDocumentTypeIds.filter(
        (documentTypeId) => !uploadedDocumentTypeIds.has(documentTypeId),
      ).length;

      if (missingDocumentCount > 0) {
        return {
          key,
          source,
          sourceLabel,
          trainingTypeId,
          requirementLevel,
          renewalLeadDays,
          acceptedAlternativeTrainingTypeIds,
          notes,
          status: "missing_document",
          statusLabel: statusLabel("missing_document"),
          record,
          matchedTrainingTypeId: record.training_type_id,
          missingDocumentCount,
          requiredDocumentCount: requiredDocumentTypeIds.length,
          daysRemaining: record.expiry_date
            ? daysBetween(today, parseDate(record.expiry_date) ?? today)
            : null,
        };
      }

      const expiryDate = parseDate(record.expiry_date);

      if (!expiryDate) {
        return {
          key,
          source,
          sourceLabel,
          trainingTypeId,
          requirementLevel,
          renewalLeadDays,
          acceptedAlternativeTrainingTypeIds,
          notes,
          status: "current",
          statusLabel: statusLabel("current"),
          record,
          matchedTrainingTypeId: record.training_type_id,
          missingDocumentCount: 0,
          requiredDocumentCount: requiredDocumentTypeIds.length,
          daysRemaining: null,
        };
      }

      const daysRemaining = daysBetween(today, expiryDate);

      if (daysRemaining < 0) {
        return {
          key,
          source,
          sourceLabel,
          trainingTypeId,
          requirementLevel,
          renewalLeadDays,
          acceptedAlternativeTrainingTypeIds,
          notes,
          status: "expired",
          statusLabel: statusLabel("expired"),
          record,
          matchedTrainingTypeId: record.training_type_id,
          missingDocumentCount: 0,
          requiredDocumentCount: requiredDocumentTypeIds.length,
          daysRemaining,
        };
      }

      if (daysRemaining <= renewalLeadDays) {
        return {
          key,
          source,
          sourceLabel,
          trainingTypeId,
          requirementLevel,
          renewalLeadDays,
          acceptedAlternativeTrainingTypeIds,
          notes,
          status: "expiring",
          statusLabel: statusLabel("expiring"),
          record,
          matchedTrainingTypeId: record.training_type_id,
          missingDocumentCount: 0,
          requiredDocumentCount: requiredDocumentTypeIds.length,
          daysRemaining,
        };
      }

      return {
        key,
        source,
        sourceLabel,
        trainingTypeId,
        requirementLevel,
        renewalLeadDays,
        acceptedAlternativeTrainingTypeIds,
        notes,
        status: "current",
        statusLabel: statusLabel("current"),
        record,
        matchedTrainingTypeId: record.training_type_id,
        missingDocumentCount: 0,
        requiredDocumentCount: requiredDocumentTypeIds.length,
        daysRemaining,
      };
    },
    [
      documentsByRecordId,
      recordsByEmployeeId,
      requiredDocumentTypeIdsByTrainingTypeId,
    ],
  );

  const complianceRows = useMemo<EmployeeCompliance[]>(() => {
    if (!selectedProjectId) return [];

    return projectEmployees.map((employee) => {
      const roleKey = normalise(employee.role);

      const applicableRoleRequirements = roleRequirements.filter(
        (requirement) =>
          requirement.active !== false &&
          normalise(requirement.role_name) === roleKey,
      );

      const applicableProjectRequirements = projectRequirements.filter(
        (requirement) => {
          if (
            requirement.active === false ||
            requirement.project_id !== selectedProjectId
          ) {
            return false;
          }

          const appliesToRole = normalise(requirement.applies_to_role);
          return !appliesToRole || appliesToRole === roleKey;
        },
      );

      const evaluatedRoleRequirements = applicableRoleRequirements.map(
        (requirement) =>
          evaluateRequirement({
            employee,
            trainingTypeId: requirement.training_type_id,
            requirementLevel: requirement.requirement_level,
            renewalLeadDays: Number(requirement.renewal_lead_days) || 60,
            acceptedAlternativeTrainingTypeIds:
              requirement.accepted_alternative_training_type_ids ?? [],
            source: "role",
            sourceLabel: `Role · ${requirement.role_name}`,
            notes: requirement.notes,
            key: `role-${requirement.id}`,
          }),
      );

      const evaluatedProjectRequirements = applicableProjectRequirements.map(
        (requirement) =>
          evaluateRequirement({
            employee,
            trainingTypeId: requirement.training_type_id,
            requirementLevel: requirement.requirement_level,
            renewalLeadDays: Number(requirement.renewal_lead_days) || 60,
            acceptedAlternativeTrainingTypeIds:
              requirement.accepted_alternative_training_type_ids ?? [],
            source: "project",
            sourceLabel: requirement.applies_to_role
              ? `Project · ${requirement.applies_to_role}`
              : "Project · All personnel",
            notes: requirement.notes,
            key: `project-${requirement.id}`,
          }),
      );

      const combined = [
        ...evaluatedRoleRequirements,
        ...evaluatedProjectRequirements,
      ];

      const deduplicated = new Map<string, EvaluatedRequirement>();

      combined.forEach((requirement) => {
        const dedupeKey = `${requirement.trainingTypeId}-${requirement.requirementLevel}`;

        const existing = deduplicated.get(dedupeKey);

        if (!existing) {
          deduplicated.set(dedupeKey, requirement);
          return;
        }

        if (existing.source === "role" && requirement.source === "project") {
          deduplicated.set(dedupeKey, requirement);
        }
      });

      const requirements = [...deduplicated.values()];

      const mandatoryRequirements = requirements.filter(
        (requirement) => requirement.requirementLevel === "mandatory",
      );
      const recommendedRequirements = requirements.filter(
        (requirement) => requirement.requirementLevel === "recommended",
      );

      const mandatoryCompliant = mandatoryRequirements.filter((requirement) =>
        isCompliantStatus(requirement.status),
      ).length;

      const recommendedCompliant = recommendedRequirements.filter(
        (requirement) => isCompliantStatus(requirement.status),
      ).length;

      const mandatoryTotal = mandatoryRequirements.length;
      const recommendedTotal = recommendedRequirements.length;

      const score =
        mandatoryTotal > 0
          ? Math.round((mandatoryCompliant / mandatoryTotal) * 100)
          : 100;

      const blockerCount = mandatoryRequirements.filter((requirement) =>
        isBlockerStatus(requirement.status),
      ).length;

      return {
        employee,
        project: projectById.get(selectedProjectId) ?? null,
        crew: employee.crew_id
          ? crewById.get(employee.crew_id) ?? null
          : null,
        requirements,
        mandatoryTotal,
        mandatoryCompliant,
        recommendedTotal,
        recommendedCompliant,
        score,
        mobilisationReady: blockerCount === 0,
        currentCount: requirements.filter(
          (requirement) => requirement.status === "current",
        ).length,
        expiringCount: requirements.filter(
          (requirement) => requirement.status === "expiring",
        ).length,
        expiredCount: requirements.filter(
          (requirement) => requirement.status === "expired",
        ).length,
        missingCount: requirements.filter(
          (requirement) => requirement.status === "missing",
        ).length,
        missingDocumentCount: requirements.filter(
          (requirement) => requirement.status === "missing_document",
        ).length,
        revokedCount: requirements.filter(
          (requirement) => requirement.status === "revoked",
        ).length,
        blockerCount,
      };
    });
  }, [
    crewById,
    evaluateRequirement,
    projectById,
    projectEmployees,
    projectRequirements,
    roleRequirements,
    selectedProjectId,
  ]);

  const availableCrews = useMemo(() => {
    const values = new Map<string, string>();

    complianceRows.forEach((row) => {
      if (row.crew) values.set(row.crew.id, row.crew.name);
    });

    return [...values.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [complianceRows]);

  const availableRoles = useMemo(() => {
    const values = new Set<string>();

    complianceRows.forEach((row) => {
      const role = clean(row.employee.role);
      if (role) values.add(role);
    });

    return [...values].sort((a, b) => a.localeCompare(b));
  }, [complianceRows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return complianceRows
      .filter((row) => {
        if (crewFilter !== "all" && row.crew?.id !== crewFilter) {
          return false;
        }

        if (
          roleFilter !== "all" &&
          clean(row.employee.role) !== roleFilter
        ) {
          return false;
        }

        if (statusFilter === "ready" && !row.mobilisationReady) {
          return false;
        }

        if (statusFilter === "blocked" && row.mobilisationReady) {
          return false;
        }

        if (
          [
            "current",
            "expiring",
            "expired",
            "missing",
            "missing_document",
            "revoked",
          ].includes(statusFilter) &&
          !row.requirements.some(
            (requirement) => requirement.status === statusFilter,
          )
        ) {
          return false;
        }

        if (!query) return true;

        return [
          row.employee.full_name,
          row.employee.role,
          row.crew?.name,
          ...row.requirements.map(
            (requirement) =>
              trainingTypeById.get(requirement.trainingTypeId)?.name ?? "",
          ),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        if (a.mobilisationReady !== b.mobilisationReady) {
          return a.mobilisationReady ? 1 : -1;
        }

        if (a.score !== b.score) return a.score - b.score;

        return a.employee.full_name.localeCompare(b.employee.full_name);
      });
  }, [
    complianceRows,
    crewFilter,
    roleFilter,
    search,
    statusFilter,
    trainingTypeById,
  ]);

  const selectedEmployeeCompliance = selectedEmployeeId
    ? complianceRows.find(
        (row) => row.employee.id === selectedEmployeeId,
      ) ?? null
    : null;

  const totalPersonnel = complianceRows.length;
  const readyPersonnel = complianceRows.filter(
    (row) => row.mobilisationReady,
  ).length;
  const blockedPersonnel = totalPersonnel - readyPersonnel;
  const projectScore =
    totalPersonnel > 0
      ? Math.round(
          complianceRows.reduce((sum, row) => sum + row.score, 0) /
            totalPersonnel,
        )
      : 100;

  const expiringItems = complianceRows.reduce(
    (sum, row) => sum + row.expiringCount,
    0,
  );
  const missingItems = complianceRows.reduce(
    (sum, row) =>
      sum +
      row.missingCount +
      row.missingDocumentCount +
      row.revokedCount,
    0,
  );

  const crewSummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        total: number;
        ready: number;
        blocked: number;
        averageScore: number;
        scoreSum: number;
      }
    >();

    complianceRows.forEach((row) => {
      const id = row.crew?.id ?? "unassigned";
      const name = row.crew?.name ?? "Unassigned";

      const current = map.get(id) ?? {
        id,
        name,
        total: 0,
        ready: 0,
        blocked: 0,
        averageScore: 0,
        scoreSum: 0,
      };

      current.total += 1;
      current.scoreSum += row.score;

      if (row.mobilisationReady) current.ready += 1;
      else current.blocked += 1;

      current.averageScore = Math.round(current.scoreSum / current.total);

      map.set(id, current);
    });

    return [...map.values()].sort((a, b) => {
      if (a.blocked !== b.blocked) return b.blocked - a.blocked;
      return a.name.localeCompare(b.name);
    });
  }, [complianceRows]);

  async function refreshData() {
    setRefreshing(true);
    setMessage(null);

    try {
      await loadData();
      setMessage({
        tone: "success",
        text: "Project training compliance refreshed.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to refresh project compliance.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  function exportCompliance() {
    const header = [
      "Project",
      "Employee",
      "Role",
      "Crew",
      "Mobilisation Status",
      "Compliance Score",
      "Mandatory Compliant",
      "Mandatory Total",
      "Current",
      "Expiring",
      "Expired",
      "Missing",
      "Missing Documents",
      "Revoked",
      "Blockers",
    ];

    const rows = filteredRows.map((row) => [
      row.project?.name ?? "",
      row.employee.full_name,
      row.employee.role ?? "",
      row.crew?.name ?? "Unassigned",
      row.mobilisationReady ? "Ready" : "Blocked",
      `${row.score}%`,
      row.mandatoryCompliant,
      row.mandatoryTotal,
      row.currentCount,
      row.expiringCount,
      row.expiredCount,
      row.missingCount,
      row.missingDocumentCount,
      row.revokedCount,
      row.blockerCount,
    ]);

    const csv = [
      header.map(csvCell).join(","),
      ...rows.map((row) => row.map(csvCell).join(",")),
    ].join("\n");

    const date = new Date().toISOString().slice(0, 10);
    downloadTextFile(
      `project-training-compliance-${date}.csv`,
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
                <ClipboardCheck size={18} />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Mobilisation Assurance
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Project Training Compliance
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Compare each employee assigned to a project against their
                role requirements and project-specific training rules. Use
                this page to identify mobilisation blockers, upcoming
                renewals, missing evidence and crew-level risk.
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
                onClick={exportCompliance}
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

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
            <div className="min-w-0 flex-1">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Project
              </label>

              <SelectField
                value={selectedProjectId}
                onChange={(value) => {
                  setSelectedProjectId(value);
                  setCrewFilter("all");
                  setSelectedEmployeeId(null);
                }}
                options={[
                  {
                    value: "",
                    label: "Select a project",
                  },
                  ...visibleProjects.map((project) => ({
                    value: project.id,
                    label: `${
                      project.project_number
                        ? `${project.project_number} · `
                        : ""
                    }${project.name}`,
                  })),
                ]}
              />
            </div>

            <button
              type="button"
              onClick={() =>
                setIncludeInactiveProjects((current) => !current)
              }
              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                includeInactiveProjects
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {includeInactiveProjects ? (
                <CheckCircle2 size={16} />
              ) : (
                <CircleOff size={16} />
              )}
              Include inactive projects
            </button>
          </div>
        </section>

        {!selectedProject ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-12 shadow-sm">
            <EmptyState
              icon={<BriefcaseBusiness size={30} />}
              title="Select a project"
              description="Choose a project above to calculate mobilisation readiness and training compliance for assigned employees."
            />
          </section>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              <MetricCard
                label="Project Score"
                value={`${projectScore}%`}
                detail="Average mandatory compliance"
                icon={<ShieldCheck size={20} />}
                tone={
                  projectScore >= 95
                    ? "emerald"
                    : projectScore >= 80
                      ? "amber"
                      : "rose"
                }
              />

              <MetricCard
                label="Personnel"
                value={String(totalPersonnel)}
                detail="Assigned to project"
                icon={<UsersRound size={20} />}
                tone="slate"
              />

              <MetricCard
                label="Ready"
                value={String(readyPersonnel)}
                detail="No mandatory blockers"
                icon={<UserRoundCheck size={20} />}
                tone="emerald"
              />

              <MetricCard
                label="Blocked"
                value={String(blockedPersonnel)}
                detail="Action required"
                icon={<ShieldAlert size={20} />}
                tone={blockedPersonnel > 0 ? "rose" : "slate"}
              />

              <MetricCard
                label="Expiring"
                value={String(expiringItems)}
                detail="Inside renewal window"
                icon={<CalendarClock size={20} />}
                tone={expiringItems > 0 ? "amber" : "slate"}
              />

              <MetricCard
                label="Missing / Invalid"
                value={String(missingItems)}
                detail="Training or evidence gaps"
                icon={<FileWarning size={20} />}
                tone={missingItems > 0 ? "rose" : "slate"}
              />
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-slate-500">
                <Filter size={17} />
                <span className="text-sm font-semibold">Filters</span>
              </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_240px_230px_230px]">
                <label className="relative block">
                  <Search
                    size={17}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search employee, role, crew or training..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-200 focus:ring-2"
                  />
                </label>

                <SelectField
                  value={crewFilter}
                  onChange={setCrewFilter}
                  options={[
                    {
                      value: "all",
                      label: "All crews",
                    },
                    ...availableCrews.map((crew) => ({
                      value: crew.id,
                      label: crew.name,
                    })),
                  ]}
                />

                <SelectField
                  value={roleFilter}
                  onChange={setRoleFilter}
                  options={[
                    {
                      value: "all",
                      label: "All roles",
                    },
                    ...availableRoles.map((role) => ({
                      value: role,
                      label: role,
                    })),
                  ]}
                />

                <SelectField
                  value={statusFilter}
                  onChange={(value) =>
                    setStatusFilter(value as StatusFilter)
                  }
                  options={[
                    {
                      value: "all",
                      label: "All statuses",
                    },
                    {
                      value: "ready",
                      label: "Mobilisation ready",
                    },
                    {
                      value: "blocked",
                      label: "Blocked",
                    },
                    {
                      value: "current",
                      label: "Has current items",
                    },
                    {
                      value: "expiring",
                      label: "Has expiring items",
                    },
                    {
                      value: "expired",
                      label: "Has expired items",
                    },
                    {
                      value: "missing",
                      label: "Has missing training",
                    },
                    {
                      value: "missing_document",
                      label: "Has missing documents",
                    },
                    {
                      value: "revoked",
                      label: "Has revoked items",
                    },
                  ]}
                />
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.7fr)]">
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">
                      Personnel Compliance
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {plural(filteredRows.length, "employee")} match the
                      current filters.
                    </p>
                  </div>

                  <div className="text-xs font-semibold text-slate-400">
                    Blocked personnel are shown first
                  </div>
                </div>

                {filteredRows.length === 0 ? (
                  <div className="p-10">
                    <EmptyState
                      icon={<UsersRound size={28} />}
                      title="No matching personnel"
                      description="Change the current filters or confirm employees and crews are assigned to this project."
                    />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-5 py-3 font-semibold">
                            Employee
                          </th>
                          <th className="px-5 py-3 font-semibold">
                            Crew
                          </th>
                          <th className="px-5 py-3 font-semibold">
                            Status
                          </th>
                          <th className="px-5 py-3 font-semibold">
                            Score
                          </th>
                          <th className="px-5 py-3 font-semibold">
                            Issues
                          </th>
                          <th className="px-5 py-3 text-right font-semibold">
                            View
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-200">
                        {filteredRows.map((row) => (
                          <tr
                            key={row.employee.id}
                            className="hover:bg-slate-50"
                          >
                            <td className="px-5 py-4">
                              <div className="font-bold text-slate-950">
                                {row.employee.full_name}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {row.employee.role || "No role assigned"}
                              </div>
                            </td>

                            <td className="px-5 py-4 text-slate-600">
                              {row.crew?.name ?? "Unassigned"}
                            </td>

                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                  row.mobilisationReady
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-rose-200 bg-rose-50 text-rose-700"
                                }`}
                              >
                                {row.mobilisationReady ? (
                                  <BadgeCheck size={14} />
                                ) : (
                                  <AlertTriangle size={14} />
                                )}
                                {row.mobilisationReady
                                  ? "Ready"
                                  : "Blocked"}
                              </span>
                            </td>

                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className={`h-full rounded-full ${
                                      row.score >= 95
                                        ? "bg-emerald-500"
                                        : row.score >= 80
                                          ? "bg-amber-500"
                                          : "bg-rose-500"
                                    }`}
                                    style={{
                                      width: `${Math.max(
                                        0,
                                        Math.min(100, row.score),
                                      )}%`,
                                    }}
                                  />
                                </div>
                                <span className="font-bold text-slate-800">
                                  {row.score}%
                                </span>
                              </div>
                            </td>

                            <td className="px-5 py-4">
                              {row.blockerCount > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {row.expiredCount > 0 ? (
                                    <IssuePill
                                      label={`${row.expiredCount} expired`}
                                      tone="rose"
                                    />
                                  ) : null}

                                  {row.missingCount > 0 ? (
                                    <IssuePill
                                      label={`${row.missingCount} missing`}
                                      tone="rose"
                                    />
                                  ) : null}

                                  {row.missingDocumentCount > 0 ? (
                                    <IssuePill
                                      label={`${row.missingDocumentCount} documents`}
                                      tone="orange"
                                    />
                                  ) : null}

                                  {row.revokedCount > 0 ? (
                                    <IssuePill
                                      label={`${row.revokedCount} revoked`}
                                      tone="fuchsia"
                                    />
                                  ) : null}
                                </div>
                              ) : row.expiringCount > 0 ? (
                                <IssuePill
                                  label={`${row.expiringCount} expiring`}
                                  tone="amber"
                                />
                              ) : (
                                <span className="text-xs font-semibold text-emerald-600">
                                  No blockers
                                </span>
                              )}
                            </td>

                            <td className="px-5 py-4">
                              <div className="flex justify-end gap-2">
                                <Link
                                  href={`/people/${row.employee.id}`}
                                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"
                                  aria-label="Open employee profile"
                                >
                                  <GraduationCap size={15} />
                                </Link>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedEmployeeId(row.employee.id)
                                  }
                                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"
                                  aria-label="View compliance detail"
                                >
                                  <Eye size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-5 py-4">
                    <h2 className="text-lg font-bold text-slate-950">
                      Crew Summary
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Mobilisation readiness by crew.
                    </p>
                  </div>

                  <div className="space-y-3 p-4">
                    {crewSummaries.length === 0 ? (
                      <EmptyState
                        icon={<UsersRound size={26} />}
                        title="No crews found"
                        description="Crew summaries will appear once personnel are assigned."
                      />
                    ) : (
                      crewSummaries.map((crew) => (
                        <button
                          key={crew.id}
                          type="button"
                          onClick={() =>
                            setCrewFilter(
                              crew.id === "unassigned"
                                ? "all"
                                : crew.id,
                            )
                          }
                          className="w-full rounded-2xl border border-slate-200 p-4 text-left hover:bg-slate-50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-bold text-slate-950">
                                {crew.name}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {plural(crew.total, "employee")}
                              </div>
                            </div>

                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                                crew.blocked > 0
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              {crew.averageScore}%
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <SmallCount
                              label="Ready"
                              value={crew.ready}
                              tone="emerald"
                            />
                            <SmallCount
                              label="Blocked"
                              value={crew.blocked}
                              tone={crew.blocked > 0 ? "rose" : "slate"}
                            />
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
                  <div className="flex items-center gap-2 text-slate-300">
                    <ShieldCheck size={17} />
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      Mobilisation Rule
                    </span>
                  </div>

                  <h3 className="mt-3 text-lg font-bold">
                    Ready means no mandatory blockers
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Expiring records remain compliant until their expiry
                    date. Missing, expired, revoked and missing-document
                    mandatory requirements block mobilisation.
                  </p>
                </section>
              </div>
            </section>
          </>
        )}
      </div>

      {selectedEmployeeCompliance ? (
        <EmployeeComplianceModal
          row={selectedEmployeeCompliance}
          trainingTypeById={trainingTypeById}
          onClose={() => setSelectedEmployeeId(null)}
        />
      ) : null}
    </AppShell>
  );
}

function EmployeeComplianceModal({
  row,
  trainingTypeById,
  onClose,
}: {
  row: EmployeeCompliance;
  trainingTypeById: Map<string, TrainingType>;
  onClose: () => void;
}) {
  const sortedRequirements = [...row.requirements].sort((a, b) => {
    if (a.requirementLevel !== b.requirementLevel) {
      return a.requirementLevel === "mandatory" ? -1 : 1;
    }

    if (a.status !== b.status) {
      if (isBlockerStatus(a.status)) return -1;
      if (isBlockerStatus(b.status)) return 1;
    }

    return (
      trainingTypeById
        .get(a.trainingTypeId)
        ?.name.localeCompare(
          trainingTypeById.get(b.trainingTypeId)?.name ?? "",
        ) ?? 0
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
      <div className="my-auto w-full max-w-5xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-950">
                {row.employee.full_name}
              </h2>

              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  row.mobilisationReady
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {row.mobilisationReady ? (
                  <BadgeCheck size={14} />
                ) : (
                  <AlertTriangle size={14} />
                )}
                {row.mobilisationReady
                  ? "Mobilisation Ready"
                  : "Mobilisation Blocked"}
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-500">
              {[row.employee.role, row.crew?.name, row.project?.name]
                .filter(Boolean)
                .join(" · ")}
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
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <DetailMetric
              label="Score"
              value={`${row.score}%`}
              tone={
                row.score >= 95
                  ? "emerald"
                  : row.score >= 80
                    ? "amber"
                    : "rose"
              }
            />
            <DetailMetric
              label="Mandatory"
              value={`${row.mandatoryCompliant}/${row.mandatoryTotal}`}
              tone="slate"
            />
            <DetailMetric
              label="Expiring"
              value={String(row.expiringCount)}
              tone={row.expiringCount > 0 ? "amber" : "slate"}
            />
            <DetailMetric
              label="Blockers"
              value={String(row.blockerCount)}
              tone={row.blockerCount > 0 ? "rose" : "slate"}
            />
            <DetailMetric
              label="Recommended"
              value={`${row.recommendedCompliant}/${row.recommendedTotal}`}
              tone="sky"
            />
          </section>

          {sortedRequirements.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck size={28} />}
              title="No requirements apply"
              description="No active role or project requirements currently apply to this employee."
            />
          ) : (
            <div className="space-y-3">
              {sortedRequirements.map((requirement) => {
                const requiredTrainingType = trainingTypeById.get(
                  requirement.trainingTypeId,
                );
                const matchedTrainingType = requirement.matchedTrainingTypeId
                  ? trainingTypeById.get(
                      requirement.matchedTrainingTypeId,
                    )
                  : null;

                return (
                  <div
                    key={requirement.key}
                    className="rounded-2xl border border-slate-200 p-5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-950">
                            {requiredTrainingType?.name ??
                              "Unknown training type"}
                          </h3>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(
                              requirement.status,
                            )}`}
                          >
                            {requirement.statusLabel}
                          </span>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                              requirement.requirementLevel === "mandatory"
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-sky-200 bg-sky-50 text-sky-700"
                            }`}
                          >
                            {requirement.requirementLevel === "mandatory"
                              ? "Mandatory"
                              : "Recommended"}
                          </span>
                        </div>

                        <div className="mt-2 text-sm text-slate-500">
                          {requirement.sourceLabel}
                        </div>

                        {matchedTrainingType &&
                        matchedTrainingType.id !==
                          requirement.trainingTypeId ? (
                          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                            Satisfied by accepted alternative:{" "}
                            <span className="font-bold">
                              {matchedTrainingType.name}
                            </span>
                          </div>
                        ) : null}

                        {requirement.notes ? (
                          <p className="mt-3 text-sm leading-6 text-slate-600">
                            {requirement.notes}
                          </p>
                        ) : null}
                      </div>

                      <div className="grid min-w-[280px] gap-2 sm:grid-cols-2">
                        <InfoBlock
                          label="Issued"
                          value={formatDate(
                            requirement.record?.issue_date,
                          )}
                        />
                        <InfoBlock
                          label="Expires"
                          value={formatDate(
                            requirement.record?.expiry_date,
                          )}
                        />
                        <InfoBlock
                          label="Days remaining"
                          value={
                            requirement.daysRemaining === null
                              ? "Non-expiring"
                              : String(requirement.daysRemaining)
                          }
                        />
                        <InfoBlock
                          label="Documents"
                          value={
                            requirement.requiredDocumentCount === 0
                              ? "Not required"
                              : `${Math.max(
                                  0,
                                  requirement.requiredDocumentCount -
                                    requirement.missingDocumentCount,
                                )}/${requirement.requiredDocumentCount}`
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-between">
            <Link
              href={`/people/${row.employee.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <GraduationCap size={16} />
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
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: "emerald" | "rose" | "amber" | "slate";
}) {
  const classes =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-800"
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
  tone: "emerald" | "rose" | "amber" | "slate" | "sky";
}) {
  const classes =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "rose"
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
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function SmallCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "rose" | "slate";
}) {
  const classes =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "rose"
        ? "bg-rose-50 text-rose-700"
        : "bg-slate-50 text-slate-700";

  return (
    <div className={`rounded-xl px-3 py-2 ${classes}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

function IssuePill({
  label,
  tone,
}: {
  label: string;
  tone: "rose" | "amber" | "orange" | "fuchsia";
}) {
  const classes =
    tone === "rose"
      ? "bg-rose-100 text-rose-700"
      : tone === "amber"
        ? "bg-amber-100 text-amber-800"
        : tone === "orange"
          ? "bg-orange-100 text-orange-700"
          : "bg-fuchsia-100 text-fuchsia-700";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}>
      {label}
    </span>
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
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-700">
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

      <h3 className="mt-4 text-lg font-bold text-slate-900">
        {title}
      </h3>

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

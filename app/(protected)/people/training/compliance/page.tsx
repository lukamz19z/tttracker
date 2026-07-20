"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  UserRoundX,
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
  active: boolean | null;
};

type Crew = {
  id: string;
  crew_number: string | null;
  crew_name: string | null;
  leading_hand: string | null;
  active: boolean | null;
};

type TrainingType = {
  id: string;
  name: string;
  short_code: string | null;
  category: string | null;
  record_kind: string | null;
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
  provider: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  does_not_expire: boolean | null;
  record_status: string | null;
  superseded_at: string | null;
  revoked_at: string | null;
  created_at: string | null;
};

type TrainingDocument = {
  id: string;
  training_record_id: string;
  document_type_name: string;
  sharepoint_web_url: string | null;
  active: boolean | null;
};

type DocumentRequirement = {
  id: string;
  training_type_id: string;
  document_type_id: string;
  required: boolean;
  minimum_count: number;
};

type ComplianceStatus =
  | "compliant"
  | "expiring"
  | "expired"
  | "missing_document"
  | "missing_training"
  | "revoked"
  | "superseded";

type ComplianceIssue = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  crewId: string | null;
  crewLabel: string;
  trainingRecordId: string | null;
  trainingTypeId: string | null;
  trainingName: string;
  category: string;
  expiryDate: string | null;
  daysRemaining: number | null;
  status: ComplianceStatus;
  missingDocumentCount: number;
  detail: string;
};

type EmployeeComplianceSummary = {
  employee: Employee;
  crew: Crew | null;
  current: number;
  expiring: number;
  expired: number;
  missingDocuments: number;
  missingTraining: number;
  totalRecords: number;
  score: number;
  status: "compliant" | "attention" | "critical";
};

type CrewComplianceSummary = {
  crew: Crew | null;
  employeeCount: number;
  compliantEmployees: number;
  attentionEmployees: number;
  criticalEmployees: number;
  score: number;
};

type TrainingTypeComplianceSummary = {
  trainingTypeId: string | null;
  trainingName: string;
  category: string;
  current: number;
  expiring: number;
  expired: number;
  missingDocuments: number;
  total: number;
  score: number;
};

type ViewKey = "issues" | "employees" | "crews" | "trainingTypes";

const EXPIRY_WARNING_DAYS = 60;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value?: string | null) {
  const date = parseDate(value);
  if (!date) return "Not recorded";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function daysUntil(value?: string | null) {
  const date = parseDate(value);
  if (!date) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
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

function isHistoricalRecord(record: TrainingRecord) {
  return Boolean(
    record.superseded_at ||
      record.revoked_at ||
      record.record_status === "superseded" ||
      record.record_status === "revoked",
  );
}

function recordExpiryStatus(record: TrainingRecord): ComplianceStatus {
  if (record.revoked_at || record.record_status === "revoked") {
    return "revoked";
  }

  if (record.superseded_at || record.record_status === "superseded") {
    return "superseded";
  }

  if (record.does_not_expire) return "compliant";

  const remaining = daysUntil(record.expiry_date);

  if (remaining === null) return "compliant";
  if (remaining < 0) return "expired";
  if (remaining <= EXPIRY_WARNING_DAYS) return "expiring";
  return "compliant";
}

function statusLabel(status: ComplianceStatus) {
  if (status === "compliant") return "Compliant";
  if (status === "expiring") return "Expiring";
  if (status === "expired") return "Expired";
  if (status === "missing_document") return "Missing document";
  if (status === "missing_training") return "No training records";
  if (status === "revoked") return "Revoked";
  return "Superseded";
}

function statusClasses(status: ComplianceStatus) {
  if (status === "compliant") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "expiring") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (
    status === "expired" ||
    status === "revoked" ||
    status === "missing_training"
  ) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
}

function percent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadTextFile(
  filename: string,
  content: string,
  mimeType = "text/csv;charset=utf-8;",
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function TrainingCompliancePage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
  const [trainingDocuments, setTrainingDocuments] = useState<
    TrainingDocument[]
  >([]);
  const [documentRequirements, setDocumentRequirements] = useState<
    DocumentRequirement[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeView, setActiveView] = useState<ViewKey>("issues");

  const [search, setSearch] = useState("");
  const [crewFilter, setCrewFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | ComplianceStatus
  >("all");
  const [expiryWindow, setExpiryWindow] = useState<
    "all" | "7" | "30" | "60" | "90"
  >("all");

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    const [
      employeeResult,
      crewResult,
      trainingTypeResult,
      recordResult,
      documentResult,
      requirementResult,
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, role, crew_id, active")
        .eq("active", true)
        .order("full_name", { ascending: true }),
      supabase
        .from("crews")
        .select("id, crew_number, crew_name, leading_hand, active")
        .order("crew_number", { ascending: true }),
      supabase
        .from("training_types")
        .select("id, name, short_code, category, record_kind, active")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("employee_training_records")
        .select(
          "id, employee_id, training_type_id, training_name, training_short_code, category, certificate_number, class_codes, provider, issue_date, expiry_date, does_not_expire, record_status, superseded_at, revoked_at, created_at",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("employee_training_documents")
        .select(
          "id, training_record_id, document_type_name, sharepoint_web_url, active",
        ),
      supabase
        .from("training_type_document_requirements")
        .select(
          "id, training_type_id, document_type_id, required, minimum_count",
        ),
    ]);

    if (employeeResult.error) {
      throw new Error(employeeResult.error.message);
    }
    if (crewResult.error) throw new Error(crewResult.error.message);
    if (trainingTypeResult.error) {
      throw new Error(trainingTypeResult.error.message);
    }
    if (recordResult.error) throw new Error(recordResult.error.message);
    if (documentResult.error) throw new Error(documentResult.error.message);
    if (requirementResult.error) {
      throw new Error(requirementResult.error.message);
    }

    setEmployees((employeeResult.data ?? []) as Employee[]);
    setCrews((crewResult.data ?? []) as Crew[]);
    setTrainingTypes((trainingTypeResult.data ?? []) as TrainingType[]);
    setTrainingRecords((recordResult.data ?? []) as TrainingRecord[]);
    setTrainingDocuments(
      (documentResult.data ?? []) as TrainingDocument[],
    );
    setDocumentRequirements(
      (requirementResult.data ?? []) as DocumentRequirement[],
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
                : "Unable to load training compliance.",
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

  const documentsByRecord = useMemo(() => {
    const map = new Map<string, TrainingDocument[]>();

    trainingDocuments.forEach((document) => {
      if (document.active === false) return;
      const current = map.get(document.training_record_id) ?? [];
      current.push(document);
      map.set(document.training_record_id, current);
    });

    return map;
  }, [trainingDocuments]);

  const requiredDocumentCountByType = useMemo(() => {
    const map = new Map<string, number>();

    documentRequirements.forEach((requirement) => {
      if (!requirement.required) return;

      const minimum = Math.max(1, requirement.minimum_count ?? 1);
      map.set(
        requirement.training_type_id,
        (map.get(requirement.training_type_id) ?? 0) + minimum,
      );
    });

    return map;
  }, [documentRequirements]);

  const activeRecords = useMemo(
    () =>
      trainingRecords.filter(
        (record) =>
          !isHistoricalRecord(record) && employeeById.has(record.employee_id),
      ),
    [employeeById, trainingRecords],
  );

  const complianceIssues = useMemo(() => {
    const issues: ComplianceIssue[] = [];

    activeRecords.forEach((record) => {
      const employee = employeeById.get(record.employee_id);
      if (!employee) return;

      const crew = employee.crew_id
        ? crewById.get(employee.crew_id) ?? null
        : null;

      const expiryStatus = recordExpiryStatus(record);
      const remaining = daysUntil(record.expiry_date);

      if (expiryStatus === "expired" || expiryStatus === "expiring") {
        issues.push({
          id: `${record.id}-${expiryStatus}`,
          employeeId: employee.id,
          employeeName: employee.full_name,
          employeeRole: employee.role || "Role not set",
          crewId: employee.crew_id,
          crewLabel: crewLabel(crew),
          trainingRecordId: record.id,
          trainingTypeId: record.training_type_id,
          trainingName: record.training_name,
          category: record.category || "Uncategorised",
          expiryDate: record.expiry_date,
          daysRemaining: remaining,
          status: expiryStatus,
          missingDocumentCount: 0,
          detail:
            expiryStatus === "expired"
              ? `${Math.abs(remaining ?? 0)} days overdue`
              : `${remaining ?? 0} days remaining`,
        });
      }

      const requiredDocumentCount = record.training_type_id
        ? requiredDocumentCountByType.get(record.training_type_id) ?? 0
        : 0;

      const uploadedDocumentCount =
        documentsByRecord.get(record.id)?.length ?? 0;

      const missingDocumentCount = Math.max(
        0,
        requiredDocumentCount - uploadedDocumentCount,
      );

      if (missingDocumentCount > 0) {
        issues.push({
          id: `${record.id}-missing-document`,
          employeeId: employee.id,
          employeeName: employee.full_name,
          employeeRole: employee.role || "Role not set",
          crewId: employee.crew_id,
          crewLabel: crewLabel(crew),
          trainingRecordId: record.id,
          trainingTypeId: record.training_type_id,
          trainingName: record.training_name,
          category: record.category || "Uncategorised",
          expiryDate: record.expiry_date,
          daysRemaining: remaining,
          status: "missing_document",
          missingDocumentCount,
          detail: `${missingDocumentCount} required document${
            missingDocumentCount === 1 ? "" : "s"
          } missing`,
        });
      }
    });

    employees.forEach((employee) => {
      const records = activeRecords.filter(
        (record) => record.employee_id === employee.id,
      );

      if (records.length > 0) return;

      const crew = employee.crew_id
        ? crewById.get(employee.crew_id) ?? null
        : null;

      issues.push({
        id: `${employee.id}-missing-training`,
        employeeId: employee.id,
        employeeName: employee.full_name,
        employeeRole: employee.role || "Role not set",
        crewId: employee.crew_id,
        crewLabel: crewLabel(crew),
        trainingRecordId: null,
        trainingTypeId: null,
        trainingName: "Training register",
        category: "Employee compliance",
        expiryDate: null,
        daysRemaining: null,
        status: "missing_training",
        missingDocumentCount: 0,
        detail: "No active training records",
      });
    });

    return issues.sort((a, b) => {
      const priority: Record<ComplianceStatus, number> = {
        expired: 1,
        missing_training: 2,
        missing_document: 3,
        expiring: 4,
        revoked: 5,
        superseded: 6,
        compliant: 7,
      };

      const priorityDifference =
        priority[a.status] - priority[b.status];

      if (priorityDifference !== 0) return priorityDifference;

      return a.employeeName.localeCompare(b.employeeName);
    });
  }, [
    activeRecords,
    crewById,
    documentsByRecord,
    employeeById,
    employees,
    requiredDocumentCountByType,
  ]);

  const employeeSummaries = useMemo<EmployeeComplianceSummary[]>(() => {
    return employees.map((employee) => {
      const records = activeRecords.filter(
        (record) => record.employee_id === employee.id,
      );

      let current = 0;
      let expiring = 0;
      let expired = 0;
      let missingDocuments = 0;

      records.forEach((record) => {
        const expiryStatus = recordExpiryStatus(record);

        if (expiryStatus === "expired") expired += 1;
        else if (expiryStatus === "expiring") expiring += 1;
        else current += 1;

        const requiredDocumentCount = record.training_type_id
          ? requiredDocumentCountByType.get(record.training_type_id) ?? 0
          : 0;

        const uploadedDocumentCount =
          documentsByRecord.get(record.id)?.length ?? 0;

        if (uploadedDocumentCount < requiredDocumentCount) {
          missingDocuments += 1;
        }
      });

      const missingTraining = records.length === 0 ? 1 : 0;
      const issueCount =
        expired + expiring + missingDocuments + missingTraining;

      const score =
        records.length === 0
          ? 0
          : percent(
              Math.max(
                0,
                records.length - expired - missingDocuments,
              ),
              records.length,
            );

      const status: EmployeeComplianceSummary["status"] =
        expired > 0 || missingTraining > 0
          ? "critical"
          : expiring > 0 || missingDocuments > 0
            ? "attention"
            : "compliant";

      return {
        employee,
        crew: employee.crew_id
          ? crewById.get(employee.crew_id) ?? null
          : null,
        current,
        expiring,
        expired,
        missingDocuments,
        missingTraining,
        totalRecords: records.length,
        score: issueCount === 0 ? 100 : score,
        status,
      };
    });
  }, [
    activeRecords,
    crewById,
    documentsByRecord,
    employees,
    requiredDocumentCountByType,
  ]);

  const crewSummaries = useMemo<CrewComplianceSummary[]>(() => {
    const grouped = new Map<string, EmployeeComplianceSummary[]>();

    employeeSummaries.forEach((summary) => {
      const key = summary.employee.crew_id || "unassigned";
      const current = grouped.get(key) ?? [];
      current.push(summary);
      grouped.set(key, current);
    });

    return [...grouped.entries()]
      .map(([key, summaries]) => {
        const crew =
          key === "unassigned" ? null : crewById.get(key) ?? null;

        const compliantEmployees = summaries.filter(
          (summary) => summary.status === "compliant",
        ).length;
        const attentionEmployees = summaries.filter(
          (summary) => summary.status === "attention",
        ).length;
        const criticalEmployees = summaries.filter(
          (summary) => summary.status === "critical",
        ).length;

        return {
          crew,
          employeeCount: summaries.length,
          compliantEmployees,
          attentionEmployees,
          criticalEmployees,
          score: percent(compliantEmployees, summaries.length),
        };
      })
      .sort((a, b) => a.score - b.score);
  }, [crewById, employeeSummaries]);

  const trainingTypeSummaries =
    useMemo<TrainingTypeComplianceSummary[]>(() => {
      const map = new Map<string, TrainingTypeComplianceSummary>();

      activeRecords.forEach((record) => {
        const key =
          record.training_type_id || `manual:${record.training_name}`;

        const current = map.get(key) ?? {
          trainingTypeId: record.training_type_id,
          trainingName: record.training_name,
          category: record.category || "Uncategorised",
          current: 0,
          expiring: 0,
          expired: 0,
          missingDocuments: 0,
          total: 0,
          score: 0,
        };

        const expiryStatus = recordExpiryStatus(record);

        if (expiryStatus === "expired") current.expired += 1;
        else if (expiryStatus === "expiring") current.expiring += 1;
        else current.current += 1;

        const requiredDocumentCount = record.training_type_id
          ? requiredDocumentCountByType.get(record.training_type_id) ?? 0
          : 0;

        const uploadedDocumentCount =
          documentsByRecord.get(record.id)?.length ?? 0;

        if (uploadedDocumentCount < requiredDocumentCount) {
          current.missingDocuments += 1;
        }

        current.total += 1;
        map.set(key, current);
      });

      return [...map.values()]
        .map((summary) => ({
          ...summary,
          score: percent(
            Math.max(
              0,
              summary.total -
                summary.expired -
                summary.missingDocuments,
            ),
            summary.total,
          ),
        }))
        .sort((a, b) => a.score - b.score);
    }, [
      activeRecords,
      documentsByRecord,
      requiredDocumentCountByType,
    ]);

  const categories = useMemo(() => {
    const values = new Set<string>();

    trainingTypes.forEach((type) => {
      if (clean(type.category)) values.add(clean(type.category));
    });

    activeRecords.forEach((record) => {
      if (clean(record.category)) values.add(clean(record.category));
    });

    return [...values].sort();
  }, [activeRecords, trainingTypes]);

  const filteredIssues = useMemo(() => {
    const query = search.trim().toLowerCase();

    return complianceIssues.filter((issue) => {
      if (crewFilter !== "all" && issue.crewId !== crewFilter) {
        return false;
      }

      if (
        categoryFilter !== "all" &&
        issue.category !== categoryFilter
      ) {
        return false;
      }

      if (statusFilter !== "all" && issue.status !== statusFilter) {
        return false;
      }

      if (
        expiryWindow !== "all" &&
        issue.daysRemaining !== null
      ) {
        const maxDays = Number(expiryWindow);

        if (
          issue.daysRemaining < 0 ||
          issue.daysRemaining > maxDays
        ) {
          return false;
        }
      } else if (
        expiryWindow !== "all" &&
        issue.daysRemaining === null
      ) {
        return false;
      }

      if (!query) return true;

      return [
        issue.employeeName,
        issue.employeeRole,
        issue.crewLabel,
        issue.trainingName,
        issue.category,
        issue.detail,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [
    categoryFilter,
    complianceIssues,
    crewFilter,
    expiryWindow,
    search,
    statusFilter,
  ]);

  const filteredEmployeeSummaries = useMemo(() => {
    const query = search.trim().toLowerCase();

    return employeeSummaries.filter((summary) => {
      if (
        crewFilter !== "all" &&
        summary.employee.crew_id !== crewFilter
      ) {
        return false;
      }

      if (!query) return true;

      return [
        summary.employee.full_name,
        summary.employee.role,
        crewLabel(summary.crew),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [crewFilter, employeeSummaries, search]);

  const filteredCrewSummaries = useMemo(() => {
    const query = search.trim().toLowerCase();

    return crewSummaries.filter((summary) => {
      if (
        crewFilter !== "all" &&
        summary.crew?.id !== crewFilter
      ) {
        return false;
      }

      if (!query) return true;

      return crewLabel(summary.crew)
        .toLowerCase()
        .includes(query);
    });
  }, [crewFilter, crewSummaries, search]);

  const filteredTrainingTypeSummaries = useMemo(() => {
    const query = search.trim().toLowerCase();

    return trainingTypeSummaries.filter((summary) => {
      if (
        categoryFilter !== "all" &&
        summary.category !== categoryFilter
      ) {
        return false;
      }

      if (!query) return true;

      return [summary.trainingName, summary.category]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [categoryFilter, search, trainingTypeSummaries]);

  const totalExpired = complianceIssues.filter(
    (issue) => issue.status === "expired",
  ).length;

  const totalExpiring = complianceIssues.filter(
    (issue) => issue.status === "expiring",
  ).length;

  const totalMissingDocuments = complianceIssues.filter(
    (issue) => issue.status === "missing_document",
  ).length;

  const employeesWithNoTraining = complianceIssues.filter(
    (issue) => issue.status === "missing_training",
  ).length;

  const compliantEmployees = employeeSummaries.filter(
    (summary) => summary.status === "compliant",
  ).length;

  const overallCompliance = percent(
    compliantEmployees,
    employeeSummaries.length,
  );

  const criticalEmployeeCount = employeeSummaries.filter(
    (summary) => summary.status === "critical",
  ).length;

  const attentionEmployeeCount = employeeSummaries.filter(
    (summary) => summary.status === "attention",
  ).length;

  async function refreshData() {
    setRefreshing(true);
    setMessage(null);

    try {
      await loadData();
      setMessage({
        tone: "success",
        text: "Training compliance refreshed.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to refresh training compliance.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  function exportIssues() {
    const header = [
      "Employee",
      "Role",
      "Crew",
      "Training",
      "Category",
      "Status",
      "Expiry",
      "Days Remaining",
      "Detail",
    ];

    const rows = filteredIssues.map((issue) => [
      issue.employeeName,
      issue.employeeRole,
      issue.crewLabel,
      issue.trainingName,
      issue.category,
      statusLabel(issue.status),
      issue.expiryDate ? formatDate(issue.expiryDate) : "",
      issue.daysRemaining ?? "",
      issue.detail,
    ]);

    const csv = [
      header.map(csvCell).join(","),
      ...rows.map((row) => row.map(csvCell).join(",")),
    ].join("\n");

    const date = new Date().toISOString().slice(0, 10);
    downloadTextFile(`training-compliance-issues-${date}.csv`, csv);
  }

  function exportEmployees() {
    const header = [
      "Employee",
      "Role",
      "Crew",
      "Compliance Score",
      "Current",
      "Expiring",
      "Expired",
      "Missing Documents",
      "No Training",
      "Status",
    ];

    const rows = filteredEmployeeSummaries.map((summary) => [
      summary.employee.full_name,
      summary.employee.role || "",
      crewLabel(summary.crew),
      `${summary.score}%`,
      summary.current,
      summary.expiring,
      summary.expired,
      summary.missingDocuments,
      summary.missingTraining,
      summary.status,
    ]);

    const csv = [
      header.map(csvCell).join(","),
      ...rows.map((row) => row.map(csvCell).join(",")),
    ].join("\n");

    const date = new Date().toISOString().slice(0, 10);
    downloadTextFile(`employee-training-compliance-${date}.csv`, csv);
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
                <ShieldCheck size={18} />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Company Compliance
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Training Compliance Dashboard
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Company-wide visibility of expired training, upcoming
                renewals, missing documents and employees requiring
                immediate action.
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
                onClick={
                  activeView === "employees"
                    ? exportEmployees
                    : exportIssues
                }
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
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

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Overall Compliance"
            value={`${overallCompliance}%`}
            detail={`${compliantEmployees} of ${employees.length} employees`}
            icon={<ShieldCheck size={21} />}
            tone={
              overallCompliance >= 95
                ? "emerald"
                : overallCompliance >= 80
                  ? "amber"
                  : "rose"
            }
          />

          <MetricCard
            label="Critical Employees"
            value={String(criticalEmployeeCount)}
            detail="Expired or no training"
            icon={<ShieldAlert size={21} />}
            tone={criticalEmployeeCount > 0 ? "rose" : "slate"}
          />

          <MetricCard
            label="Attention Required"
            value={String(attentionEmployeeCount)}
            detail="Expiring or document gaps"
            icon={<TriangleAlert size={21} />}
            tone={attentionEmployeeCount > 0 ? "amber" : "slate"}
          />

          <MetricCard
            label="Expired Records"
            value={String(totalExpired)}
            detail="Immediate action"
            icon={<AlertTriangle size={21} />}
            tone={totalExpired > 0 ? "rose" : "slate"}
          />

          <MetricCard
            label="Missing Documents"
            value={String(totalMissingDocuments)}
            detail="Required evidence absent"
            icon={<FileText size={21} />}
            tone={totalMissingDocuments > 0 ? "amber" : "slate"}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <ActionPanel
            title="Expired"
            value={totalExpired}
            description="Training records already past their expiry date."
            tone="rose"
            icon={<AlertTriangle size={19} />}
            onClick={() => {
              setActiveView("issues");
              setStatusFilter("expired");
            }}
          />

          <ActionPanel
            title={`Expiring within ${EXPIRY_WARNING_DAYS} days`}
            value={totalExpiring}
            description="Renewals requiring planning before mobilisation."
            tone="amber"
            icon={<CalendarClock size={19} />}
            onClick={() => {
              setActiveView("issues");
              setStatusFilter("expiring");
              setExpiryWindow("60");
            }}
          />

          <ActionPanel
            title="Employees with no records"
            value={employeesWithNoTraining}
            description="Active people without any active training record."
            tone="rose"
            icon={<UserRoundX size={19} />}
            onClick={() => {
              setActiveView("issues");
              setStatusFilter("missing_training");
            }}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-slate-500">
            <Filter size={17} />
            <span className="text-sm font-semibold">Filters</span>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_210px_220px_200px_170px]">
            <label className="relative block">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search employee, crew, training type or issue..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </label>

            <SelectField
              value={crewFilter}
              onChange={setCrewFilter}
              options={[
                { value: "all", label: "All crews" },
                ...crews.map((crew) => ({
                  value: crew.id,
                  label: crewLabel(crew),
                })),
              ]}
            />

            <SelectField
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

            <SelectField
              value={statusFilter}
              onChange={(value) =>
                setStatusFilter(value as "all" | ComplianceStatus)
              }
              options={[
                { value: "all", label: "All statuses" },
                { value: "expired", label: "Expired" },
                { value: "expiring", label: "Expiring" },
                {
                  value: "missing_document",
                  label: "Missing document",
                },
                {
                  value: "missing_training",
                  label: "No training records",
                },
              ]}
            />

            <SelectField
              value={expiryWindow}
              onChange={(value) =>
                setExpiryWindow(
                  value as "all" | "7" | "30" | "60" | "90",
                )
              }
              options={[
                { value: "all", label: "Any expiry" },
                { value: "7", label: "Next 7 days" },
                { value: "30", label: "Next 30 days" },
                { value: "60", label: "Next 60 days" },
                { value: "90", label: "Next 90 days" },
              ]}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex gap-2 overflow-x-auto border-b border-slate-200 px-4 pt-4">
            <TabButton
              active={activeView === "issues"}
              label={`Action Items (${filteredIssues.length})`}
              onClick={() => setActiveView("issues")}
            />
            <TabButton
              active={activeView === "employees"}
              label={`Employees (${filteredEmployeeSummaries.length})`}
              onClick={() => setActiveView("employees")}
            />
            <TabButton
              active={activeView === "crews"}
              label={`Crews (${filteredCrewSummaries.length})`}
              onClick={() => setActiveView("crews")}
            />
            <TabButton
              active={activeView === "trainingTypes"}
              label={`Training Types (${filteredTrainingTypeSummaries.length})`}
              onClick={() => setActiveView("trainingTypes")}
            />
          </div>

          <div className="p-5">
            {activeView === "issues" ? (
              <IssuesView issues={filteredIssues} />
            ) : null}

            {activeView === "employees" ? (
              <EmployeesView summaries={filteredEmployeeSummaries} />
            ) : null}

            {activeView === "crews" ? (
              <CrewsView summaries={filteredCrewSummaries} />
            ) : null}

            {activeView === "trainingTypes" ? (
              <TrainingTypesView
                summaries={filteredTrainingTypeSummaries}
              />
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function IssuesView({ issues }: { issues: ComplianceIssue[] }) {
  if (issues.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 size={30} />}
        title="No matching compliance issues"
        description="The selected filters do not contain any expired, expiring or incomplete records."
      />
    );
  }

  return (
    <div className="space-y-3">
      {issues.map((issue) => (
        <div
          key={issue.id}
          className="rounded-2xl border border-slate-200 bg-white p-5"
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.75fr)_minmax(0,0.75fr)_auto] xl:items-center">
            <div>
              <Link
                href={`/people/${issue.employeeId}`}
                className="font-bold text-slate-950 hover:underline"
              >
                {issue.employeeName}
              </Link>
              <div className="mt-1 text-sm text-slate-500">
                {issue.employeeRole}
              </div>
              <div className="mt-1 text-xs font-medium text-slate-400">
                {issue.crewLabel}
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-900">
                {issue.trainingName}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {issue.category}
              </div>
            </div>

            <div>
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(
                  issue.status,
                )}`}
              >
                {statusLabel(issue.status)}
              </span>
              <div className="mt-2 text-sm font-semibold text-slate-700">
                {issue.detail}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Expiry
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-700">
                {issue.expiryDate
                  ? formatDate(issue.expiryDate)
                  : "Not applicable"}
              </div>
            </div>

            <Link
              href={`/people/${issue.employeeId}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Open Profile
              <ExternalLink size={14} />
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmployeesView({
  summaries,
}: {
  summaries: EmployeeComplianceSummary[];
}) {
  if (summaries.length === 0) {
    return (
      <EmptyState
        icon={<UsersRound size={30} />}
        title="No employees found"
        description="No employee records match the selected filters."
      />
    );
  }

  return (
    <div className="space-y-3">
      {summaries.map((summary) => (
        <div
          key={summary.employee.id}
          className="rounded-2xl border border-slate-200 bg-white p-5"
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_170px_minmax(0,1fr)_150px_auto] xl:items-center">
            <div>
              <Link
                href={`/people/${summary.employee.id}`}
                className="font-bold text-slate-950 hover:underline"
              >
                {summary.employee.full_name}
              </Link>
              <div className="mt-1 text-sm text-slate-500">
                {summary.employee.role || "Role not set"}
              </div>
              <div className="mt-1 text-xs font-medium text-slate-400">
                {crewLabel(summary.crew)}
              </div>
            </div>

            <ScoreRing value={summary.score} />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat label="Current" value={summary.current} />
              <MiniStat label="Expiring" value={summary.expiring} />
              <MiniStat label="Expired" value={summary.expired} />
              <MiniStat
                label="Missing docs"
                value={summary.missingDocuments}
              />
            </div>

            <EmployeeStatusBadge status={summary.status} />

            <Link
              href={`/people/${summary.employee.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              View Employee
              <ExternalLink size={14} />
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function CrewsView({
  summaries,
}: {
  summaries: CrewComplianceSummary[];
}) {
  if (summaries.length === 0) {
    return (
      <EmptyState
        icon={<UsersRound size={30} />}
        title="No crews found"
        description="No crew summaries match the selected filters."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {summaries.map((summary) => (
        <div
          key={summary.crew?.id || "unassigned"}
          className="rounded-2xl border border-slate-200 bg-white p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-950">
                {crewLabel(summary.crew)}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {summary.employeeCount} employee
                {summary.employeeCount === 1 ? "" : "s"}
              </p>
            </div>

            <ScoreRing value={summary.score} compact />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <MiniStat
              label="Compliant"
              value={summary.compliantEmployees}
            />
            <MiniStat
              label="Attention"
              value={summary.attentionEmployees}
            />
            <MiniStat
              label="Critical"
              value={summary.criticalEmployees}
            />
          </div>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${
                summary.score >= 95
                  ? "bg-emerald-500"
                  : summary.score >= 80
                    ? "bg-amber-500"
                    : "bg-rose-500"
              }`}
              style={{ width: `${summary.score}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TrainingTypesView({
  summaries,
}: {
  summaries: TrainingTypeComplianceSummary[];
}) {
  if (summaries.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={30} />}
        title="No training types found"
        description="No training type summaries match the selected filters."
      />
    );
  }

  return (
    <div className="space-y-3">
      {summaries.map((summary) => (
        <div
          key={
            summary.trainingTypeId ||
            `${summary.trainingName}-${summary.category}`
          }
          className="rounded-2xl border border-slate-200 bg-white p-5"
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_150px_minmax(0,1fr)_180px] xl:items-center">
            <div>
              <h3 className="font-bold text-slate-950">
                {summary.trainingName}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {summary.category}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {summary.total} active record
                {summary.total === 1 ? "" : "s"}
              </p>
            </div>

            <ScoreRing value={summary.score} />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat label="Current" value={summary.current} />
              <MiniStat label="Expiring" value={summary.expiring} />
              <MiniStat label="Expired" value={summary.expired} />
              <MiniStat
                label="Missing docs"
                value={summary.missingDocuments}
              />
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${
                  summary.score >= 95
                    ? "bg-emerald-500"
                    : summary.score >= 80
                      ? "bg-amber-500"
                      : "bg-rose-500"
                }`}
                style={{ width: `${summary.score}%` }}
              />
            </div>
          </div>
        </div>
      ))}
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
  tone: "emerald" | "amber" | "rose" | "slate";
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

function ActionPanel({
  title,
  value,
  description,
  tone,
  icon,
  onClick,
}: {
  title: string;
  value: number;
  description: string;
  tone: "rose" | "amber";
  icon: React.ReactNode;
  onClick: () => void;
}) {
  const classes =
    tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md ${classes}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-bold">{title}</div>
          <div className="mt-2 text-3xl font-bold">{value}</div>
          <p className="mt-2 text-sm leading-6 opacity-80">
            {description}
          </p>
        </div>
        <div className="rounded-xl bg-white/70 p-2.5">{icon}</div>
      </div>
    </button>
  );
}

function ScoreRing({
  value,
  compact = false,
}: {
  value: number;
  compact?: boolean;
}) {
  const size = compact ? "h-14 w-14 text-sm" : "h-16 w-16 text-base";

  return (
    <div
      className={`flex items-center justify-center rounded-full border-4 ${size} ${
        value >= 95
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : value >= 80
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-rose-200 bg-rose-50 text-rose-700"
      }`}
    >
      <span className="font-bold">{value}%</span>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="text-xs font-semibold text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
    </div>
  );
}

function EmployeeStatusBadge({
  status,
}: {
  status: EmployeeComplianceSummary["status"];
}) {
  const classes =
    status === "compliant"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "attention"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-rose-200 bg-rose-50 text-rose-700";

  const label =
    status === "compliant"
      ? "Compliant"
      : status === "attention"
        ? "Attention"
        : "Critical";

  return (
    <span
      className={`inline-flex w-fit rounded-full border px-3 py-1.5 text-xs font-semibold ${classes}`}
    >
      {label}
    </span>
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
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
        {description}
      </p>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-t-xl px-4 py-3 text-sm font-semibold ${
        active
          ? "border-b-2 border-slate-950 text-slate-950"
          : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {label}
    </button>
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
          <option key={`${option.value}-${option.label}`} value={option.value}>
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

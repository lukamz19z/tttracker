"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  FileWarning,
  Filter,
  Grid3X3,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
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
  sort_order: number | null;
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

type CellStatus =
  | "current"
  | "non_expiring"
  | "expiring"
  | "expired"
  | "missing"
  | "missing_document"
  | "revoked";

type MatrixCell = {
  employeeId: string;
  trainingTypeId: string;
  trainingRecordId: string | null;
  status: CellStatus;
  expiryDate: string | null;
  issueDate: string | null;
  daysRemaining: number | null;
  certificateNumber: string | null;
  provider: string | null;
  classCodes: string[];
  missingDocumentCount: number;
  uploadedDocumentCount: number;
  requiredDocumentCount: number;
};

type EmployeeRowSummary = {
  employee: Employee;
  crew: Crew | null;
  cells: Record<string, MatrixCell>;
  compliant: number;
  expiring: number;
  expired: number;
  missing: number;
  missingDocuments: number;
  total: number;
  score: number;
};

type TrainingColumnSummary = {
  trainingType: TrainingType;
  current: number;
  expiring: number;
  expired: number;
  missing: number;
  missingDocuments: number;
  total: number;
  score: number;
};

type SortKey = "employee" | "crew" | "score" | "critical";

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
      record.record_status === "superseded",
  );
}

function statusLabel(status: CellStatus) {
  if (status === "current") return "Current";
  if (status === "non_expiring") return "No expiry";
  if (status === "expiring") return "Expiring";
  if (status === "expired") return "Expired";
  if (status === "missing") return "Missing";
  if (status === "missing_document") return "Missing document";
  return "Revoked";
}

function statusShortLabel(status: CellStatus) {
  if (status === "current") return "OK";
  if (status === "non_expiring") return "N/E";
  if (status === "expiring") return "DUE";
  if (status === "expired") return "EXP";
  if (status === "missing") return "—";
  if (status === "missing_document") return "DOC";
  return "REV";
}

function statusClasses(status: CellStatus) {
  if (status === "current") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100";
  }

  if (status === "non_expiring") {
    return "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100";
  }

  if (status === "expiring") {
    return "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100";
  }

  if (status === "expired" || status === "revoked") {
    return "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100";
  }

  if (status === "missing_document") {
    return "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100";
  }

  return "border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100";
}

function percent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
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

export default function TrainingMatrixPage() {
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

  const [search, setSearch] = useState("");
  const [crewFilter, setCrewFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | CellStatus
  >("all");
  const [sortKey, setSortKey] = useState<SortKey>("employee");
  const [hideCompliantRows, setHideCompliantRows] = useState(false);
  const [hideEmptyColumns, setHideEmptyColumns] = useState(false);
  const [showArchivedTypes, setShowArchivedTypes] = useState(false);
  const [compactMode, setCompactMode] = useState(false);

  const [selectedCell, setSelectedCell] = useState<{
    employee: Employee;
    trainingType: TrainingType;
    cell: MatrixCell;
  } | null>(null);

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    const [
      employeeResult,
      crewResult,
      typeResult,
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
        .select(
          "id, name, short_code, category, record_kind, active, sort_order",
        )
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
    if (typeResult.error) throw new Error(typeResult.error.message);
    if (recordResult.error) throw new Error(recordResult.error.message);
    if (documentResult.error) throw new Error(documentResult.error.message);
    if (requirementResult.error) {
      throw new Error(requirementResult.error.message);
    }

    setEmployees((employeeResult.data ?? []) as Employee[]);
    setCrews((crewResult.data ?? []) as Crew[]);
    setTrainingTypes((typeResult.data ?? []) as TrainingType[]);
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
                : "Unable to load the training matrix.",
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

  const requiredDocumentsByType = useMemo(() => {
    const map = new Map<string, number>();

    documentRequirements.forEach((requirement) => {
      if (!requirement.required) return;

      map.set(
        requirement.training_type_id,
        (map.get(requirement.training_type_id) ?? 0) +
          Math.max(1, requirement.minimum_count ?? 1),
      );
    });

    return map;
  }, [documentRequirements]);

  const latestRecordByEmployeeAndType = useMemo(() => {
    const map = new Map<string, TrainingRecord>();

    trainingRecords.forEach((record) => {
      if (!record.training_type_id || isHistoricalRecord(record)) {
        return;
      }

      const key = `${record.employee_id}:${record.training_type_id}`;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, record);
        return;
      }

      const existingDate = new Date(
        existing.created_at ?? "1970-01-01",
      ).getTime();

      const recordDate = new Date(
        record.created_at ?? "1970-01-01",
      ).getTime();

      if (recordDate > existingDate) {
        map.set(key, record);
      }
    });

    return map;
  }, [trainingRecords]);

  const visibleTrainingTypes = useMemo(() => {
    return trainingTypes.filter((trainingType) => {
      if (!showArchivedTypes && trainingType.active === false) {
        return false;
      }

      if (
        categoryFilter !== "all" &&
        clean(trainingType.category) !== categoryFilter
      ) {
        return false;
      }

      return true;
    });
  }, [categoryFilter, showArchivedTypes, trainingTypes]);

  const matrixRows = useMemo<EmployeeRowSummary[]>(() => {
    return employees.map((employee) => {
      const cells: Record<string, MatrixCell> = {};

      let compliant = 0;
      let expiring = 0;
      let expired = 0;
      let missing = 0;
      let missingDocuments = 0;

      visibleTrainingTypes.forEach((trainingType) => {
        const key = `${employee.id}:${trainingType.id}`;
        const record = latestRecordByEmployeeAndType.get(key);

        if (!record) {
          cells[trainingType.id] = {
            employeeId: employee.id,
            trainingTypeId: trainingType.id,
            trainingRecordId: null,
            status: "missing",
            expiryDate: null,
            issueDate: null,
            daysRemaining: null,
            certificateNumber: null,
            provider: null,
            classCodes: [],
            missingDocumentCount: 0,
            uploadedDocumentCount: 0,
            requiredDocumentCount:
              requiredDocumentsByType.get(trainingType.id) ?? 0,
          };

          missing += 1;
          return;
        }

        const requiredDocumentCount =
          requiredDocumentsByType.get(trainingType.id) ?? 0;

        const uploadedDocumentCount =
          documentsByRecord.get(record.id)?.length ?? 0;

        const missingDocumentCount = Math.max(
          0,
          requiredDocumentCount - uploadedDocumentCount,
        );

        const remaining = daysUntil(record.expiry_date);

        let status: CellStatus = "current";

        if (record.revoked_at || record.record_status === "revoked") {
          status = "revoked";
        } else if (missingDocumentCount > 0) {
          status = "missing_document";
        } else if (record.does_not_expire) {
          status = "non_expiring";
        } else if (remaining !== null && remaining < 0) {
          status = "expired";
        } else if (
          remaining !== null &&
          remaining <= EXPIRY_WARNING_DAYS
        ) {
          status = "expiring";
        }

        if (status === "current" || status === "non_expiring") {
          compliant += 1;
        } else if (status === "expiring") {
          expiring += 1;
        } else if (status === "missing_document") {
          missingDocuments += 1;
        } else {
          expired += 1;
        }

        cells[trainingType.id] = {
          employeeId: employee.id,
          trainingTypeId: trainingType.id,
          trainingRecordId: record.id,
          status,
          expiryDate: record.expiry_date,
          issueDate: record.issue_date,
          daysRemaining: remaining,
          certificateNumber: record.certificate_number,
          provider: record.provider,
          classCodes: record.class_codes ?? [],
          missingDocumentCount,
          uploadedDocumentCount,
          requiredDocumentCount,
        };
      });

      const total = visibleTrainingTypes.length;
      const score = percent(compliant, total);

      return {
        employee,
        crew: employee.crew_id
          ? crewById.get(employee.crew_id) ?? null
          : null,
        cells,
        compliant,
        expiring,
        expired,
        missing,
        missingDocuments,
        total,
        score,
      };
    });
  }, [
    crewById,
    documentsByRecord,
    employees,
    latestRecordByEmployeeAndType,
    requiredDocumentsByType,
    visibleTrainingTypes,
  ]);

  const columnSummaries = useMemo<TrainingColumnSummary[]>(() => {
    return visibleTrainingTypes.map((trainingType) => {
      let current = 0;
      let expiring = 0;
      let expired = 0;
      let missing = 0;
      let missingDocuments = 0;

      matrixRows.forEach((row) => {
        const cell = row.cells[trainingType.id];
        if (!cell) return;

        if (
          cell.status === "current" ||
          cell.status === "non_expiring"
        ) {
          current += 1;
        } else if (cell.status === "expiring") {
          expiring += 1;
        } else if (cell.status === "missing") {
          missing += 1;
        } else if (cell.status === "missing_document") {
          missingDocuments += 1;
        } else {
          expired += 1;
        }
      });

      const total = matrixRows.length;

      return {
        trainingType,
        current,
        expiring,
        expired,
        missing,
        missingDocuments,
        total,
        score: percent(current, total),
      };
    });
  }, [matrixRows, visibleTrainingTypes]);

  const visibleColumns = useMemo(() => {
    if (!hideEmptyColumns) return visibleTrainingTypes;

    const summaryById = new Map(
      columnSummaries.map((summary) => [
        summary.trainingType.id,
        summary,
      ]),
    );

    return visibleTrainingTypes.filter((trainingType) => {
      const summary = summaryById.get(trainingType.id);
      return Boolean(summary && summary.total - summary.missing > 0);
    });
  }, [columnSummaries, hideEmptyColumns, visibleTrainingTypes]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    const rows = matrixRows.filter((row) => {
      if (
        crewFilter !== "all" &&
        row.employee.crew_id !== crewFilter
      ) {
        return false;
      }

      if (hideCompliantRows && row.score === 100) {
        return false;
      }

      if (statusFilter !== "all") {
        const hasStatus = visibleColumns.some(
          (trainingType) =>
            row.cells[trainingType.id]?.status === statusFilter,
        );

        if (!hasStatus) return false;
      }

      if (!query) return true;

      return [
        row.employee.full_name,
        row.employee.role,
        crewLabel(row.crew),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

    return [...rows].sort((a, b) => {
      if (sortKey === "crew") {
        return crewLabel(a.crew).localeCompare(crewLabel(b.crew));
      }

      if (sortKey === "score") {
        return a.score - b.score;
      }

      if (sortKey === "critical") {
        const aCritical =
          a.expired + a.missing + a.missingDocuments;
        const bCritical =
          b.expired + b.missing + b.missingDocuments;

        return bCritical - aCritical;
      }

      return a.employee.full_name.localeCompare(
        b.employee.full_name,
      );
    });
  }, [
    crewFilter,
    hideCompliantRows,
    matrixRows,
    search,
    sortKey,
    statusFilter,
    visibleColumns,
  ]);

  const categories = useMemo(() => {
    const values = new Set<string>();

    trainingTypes.forEach((trainingType) => {
      if (clean(trainingType.category)) {
        values.add(clean(trainingType.category));
      }
    });

    return [...values].sort();
  }, [trainingTypes]);

  const totalCells = filteredRows.length * visibleColumns.length;

  const compliantCells = useMemo(() => {
    let count = 0;

    filteredRows.forEach((row) => {
      visibleColumns.forEach((trainingType) => {
        const status = row.cells[trainingType.id]?.status;

        if (status === "current" || status === "non_expiring") {
          count += 1;
        }
      });
    });

    return count;
  }, [filteredRows, visibleColumns]);

  const expiringCells = useMemo(() => {
    let count = 0;

    filteredRows.forEach((row) => {
      visibleColumns.forEach((trainingType) => {
        if (row.cells[trainingType.id]?.status === "expiring") {
          count += 1;
        }
      });
    });

    return count;
  }, [filteredRows, visibleColumns]);

  const expiredCells = useMemo(() => {
    let count = 0;

    filteredRows.forEach((row) => {
      visibleColumns.forEach((trainingType) => {
        const status = row.cells[trainingType.id]?.status;

        if (status === "expired" || status === "revoked") {
          count += 1;
        }
      });
    });

    return count;
  }, [filteredRows, visibleColumns]);

  const missingCells = useMemo(() => {
    let count = 0;

    filteredRows.forEach((row) => {
      visibleColumns.forEach((trainingType) => {
        if (row.cells[trainingType.id]?.status === "missing") {
          count += 1;
        }
      });
    });

    return count;
  }, [filteredRows, visibleColumns]);

  const missingDocumentCells = useMemo(() => {
    let count = 0;

    filteredRows.forEach((row) => {
      visibleColumns.forEach((trainingType) => {
        if (
          row.cells[trainingType.id]?.status ===
          "missing_document"
        ) {
          count += 1;
        }
      });
    });

    return count;
  }, [filteredRows, visibleColumns]);

  const overallScore = percent(compliantCells, totalCells);

  async function refreshData() {
    setRefreshing(true);
    setMessage(null);

    try {
      await loadData();
      setMessage({
        tone: "success",
        text: "Training matrix refreshed.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to refresh the training matrix.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  function exportMatrix() {
    const header = [
      "Employee",
      "Role",
      "Crew",
      "Compliance Score",
      ...visibleColumns.map(
        (trainingType) =>
          trainingType.short_code || trainingType.name,
      ),
    ];

    const rows = filteredRows.map((row) => [
      row.employee.full_name,
      row.employee.role || "",
      crewLabel(row.crew),
      `${row.score}%`,
      ...visibleColumns.map((trainingType) => {
        const cell = row.cells[trainingType.id];

        if (!cell) return "Missing";

        const expiry = cell.expiryDate
          ? ` - ${formatDate(cell.expiryDate)}`
          : "";

        return `${statusLabel(cell.status)}${expiry}`;
      }),
    ]);

    const csv = [
      header.map(csvCell).join(","),
      ...rows.map((row) => row.map(csvCell).join(",")),
    ].join("\n");

    const date = new Date().toISOString().slice(0, 10);
    downloadTextFile(`training-matrix-${date}.csv`, csv);
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
      <div className="mx-auto max-w-[1800px] space-y-6">
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
                <Grid3X3 size={18} />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Employee × Training
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Training Matrix
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Review every active employee against every configured
                training type. Select a matrix cell to inspect expiry,
                certificate, class code and document information.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/people/training/types"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <SlidersHorizontal size={16} />
                Manage Types
              </Link>

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
                onClick={exportMatrix}
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

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard
            label="Matrix Compliance"
            value={`${overallScore}%`}
            detail={`${compliantCells} of ${totalCells} cells`}
            icon={<ShieldCheck size={20} />}
            tone={
              overallScore >= 95
                ? "emerald"
                : overallScore >= 80
                  ? "amber"
                  : "rose"
            }
          />

          <MetricCard
            label="Employees"
            value={String(filteredRows.length)}
            detail={`${employees.length} active total`}
            icon={<UsersRound size={20} />}
            tone="slate"
          />

          <MetricCard
            label="Training Types"
            value={String(visibleColumns.length)}
            detail={`${trainingTypes.length} configured`}
            icon={<Grid3X3 size={20} />}
            tone="slate"
          />

          <MetricCard
            label="Expiring"
            value={String(expiringCells)}
            detail={`Within ${EXPIRY_WARNING_DAYS} days`}
            icon={<CalendarClock size={20} />}
            tone={expiringCells > 0 ? "amber" : "slate"}
          />

          <MetricCard
            label="Expired"
            value={String(expiredCells)}
            detail="Immediate action"
            icon={<ShieldAlert size={20} />}
            tone={expiredCells > 0 ? "rose" : "slate"}
          />

          <MetricCard
            label="Missing"
            value={String(missingCells + missingDocumentCells)}
            detail={`${missingDocumentCells} document gaps`}
            icon={<FileWarning size={20} />}
            tone={
              missingCells + missingDocumentCells > 0
                ? "violet"
                : "slate"
            }
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-slate-500">
            <Filter size={17} />
            <span className="text-sm font-semibold">
              Matrix controls
            </span>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px_190px_190px]">
            <label className="relative block">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search employee, role or crew..."
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
                setStatusFilter(value as "all" | CellStatus)
              }
              options={[
                { value: "all", label: "Any status" },
                { value: "current", label: "Current" },
                { value: "non_expiring", label: "No expiry" },
                { value: "expiring", label: "Expiring" },
                { value: "expired", label: "Expired" },
                { value: "missing", label: "Missing" },
                {
                  value: "missing_document",
                  label: "Missing document",
                },
                { value: "revoked", label: "Revoked" },
              ]}
            />

            <SelectField
              value={sortKey}
              onChange={(value) => setSortKey(value as SortKey)}
              options={[
                { value: "employee", label: "Sort: Employee" },
                { value: "crew", label: "Sort: Crew" },
                { value: "score", label: "Sort: Lowest score" },
                {
                  value: "critical",
                  label: "Sort: Most critical",
                },
              ]}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <ToggleButton
              active={hideCompliantRows}
              icon={
                hideCompliantRows ? (
                  <EyeOff size={15} />
                ) : (
                  <Eye size={15} />
                )
              }
              label="Hide compliant employees"
              onClick={() =>
                setHideCompliantRows((current) => !current)
              }
            />

            <ToggleButton
              active={hideEmptyColumns}
              icon={
                hideEmptyColumns ? (
                  <EyeOff size={15} />
                ) : (
                  <Eye size={15} />
                )
              }
              label="Hide empty training columns"
              onClick={() =>
                setHideEmptyColumns((current) => !current)
              }
            />

            <ToggleButton
              active={showArchivedTypes}
              icon={
                showArchivedTypes ? (
                  <Eye size={15} />
                ) : (
                  <EyeOff size={15} />
                )
              }
              label="Show archived training types"
              onClick={() =>
                setShowArchivedTypes((current) => !current)
              }
            />

            <ToggleButton
              active={compactMode}
              icon={<Grid3X3 size={15} />}
              label="Compact cells"
              onClick={() => setCompactMode((current) => !current)}
            />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
            <Legend status="current" />
            <Legend status="non_expiring" />
            <Legend status="expiring" />
            <Legend status="expired" />
            <Legend status="missing" />
            <Legend status="missing_document" />
            <Legend status="revoked" />
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-bold text-slate-950">
              Employee Training Matrix
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {filteredRows.length} employee
              {filteredRows.length === 1 ? "" : "s"} across{" "}
              {visibleColumns.length} training type
              {visibleColumns.length === 1 ? "" : "s"}.
            </p>
          </div>

          {filteredRows.length === 0 ||
          visibleColumns.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="max-h-[72vh] overflow-auto">
              <table className="min-w-max border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-40 min-w-[280px] border-b border-r border-slate-200 bg-slate-950 px-4 py-3 text-left text-white">
                      Employee
                    </th>

                    <th className="sticky left-[280px] top-0 z-40 min-w-[100px] border-b border-r border-slate-200 bg-slate-950 px-3 py-3 text-center text-white">
                      Score
                    </th>

                    {visibleColumns.map((trainingType) => {
                      const summary = columnSummaries.find(
                        (item) =>
                          item.trainingType.id === trainingType.id,
                      );

                      return (
                        <th
                          key={trainingType.id}
                          className={`sticky top-0 z-30 border-b border-r border-slate-200 bg-slate-900 text-white ${
                            compactMode
                              ? "min-w-[92px] max-w-[92px] px-2 py-3"
                              : "min-w-[140px] max-w-[140px] px-3 py-3"
                          }`}
                        >
                          <div className="mx-auto flex flex-col items-center">
                            <span className="line-clamp-2 text-center text-xs font-bold leading-5">
                              {trainingType.short_code ||
                                trainingType.name}
                            </span>

                            {!compactMode ? (
                              <span className="mt-1 line-clamp-2 text-center text-[10px] font-medium leading-4 text-slate-300">
                                {trainingType.name}
                              </span>
                            ) : null}

                            <span className="mt-2 rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-slate-200">
                              {summary?.score ?? 0}%
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {filteredRows.map((row, rowIndex) => (
                    <tr key={row.employee.id}>
                      <td
                        className={`sticky left-0 z-20 min-w-[280px] border-b border-r border-slate-200 px-4 py-3 ${
                          rowIndex % 2 === 0
                            ? "bg-white"
                            : "bg-slate-50"
                        }`}
                      >
                        <Link
                          href={`/people/${row.employee.id}`}
                          className="font-bold text-slate-950 hover:underline"
                        >
                          {row.employee.full_name}
                        </Link>
                        <div className="mt-1 text-xs text-slate-500">
                          {row.employee.role || "Role not set"}
                        </div>
                        <div className="mt-1 text-[11px] font-medium text-slate-400">
                          {crewLabel(row.crew)}
                        </div>
                      </td>

                      <td
                        className={`sticky left-[280px] z-20 min-w-[100px] border-b border-r border-slate-200 px-3 py-3 text-center ${
                          rowIndex % 2 === 0
                            ? "bg-white"
                            : "bg-slate-50"
                        }`}
                      >
                        <ScoreBadge value={row.score} />
                      </td>

                      {visibleColumns.map((trainingType) => {
                        const cell = row.cells[trainingType.id];

                        return (
                          <td
                            key={`${row.employee.id}-${trainingType.id}`}
                            className={`border-b border-r border-slate-200 p-1.5 ${
                              rowIndex % 2 === 0
                                ? "bg-white"
                                : "bg-slate-50/70"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedCell({
                                  employee: row.employee,
                                  trainingType,
                                  cell,
                                })
                              }
                              className={`flex w-full flex-col items-center justify-center rounded-xl border text-center transition ${statusClasses(
                                cell.status,
                              )} ${
                                compactMode
                                  ? "min-h-[58px] px-1.5 py-2"
                                  : "min-h-[74px] px-2 py-2.5"
                              }`}
                            >
                              <span className="text-xs font-bold">
                                {statusShortLabel(cell.status)}
                              </span>

                              {!compactMode ? (
                                <span className="mt-1 text-[10px] font-semibold leading-4 opacity-80">
                                  {cell.status === "expiring" &&
                                  cell.daysRemaining !== null
                                    ? `${cell.daysRemaining}d`
                                    : cell.status === "expired" &&
                                        cell.daysRemaining !== null
                                      ? `${Math.abs(
                                          cell.daysRemaining,
                                        )}d overdue`
                                      : cell.expiryDate
                                        ? formatDate(cell.expiryDate)
                                        : statusLabel(cell.status)}
                                </span>
                              ) : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>

                <tfoot>
                  <tr>
                    <td className="sticky bottom-0 left-0 z-40 border-r border-t border-slate-200 bg-slate-950 px-4 py-3 font-bold text-white">
                      Training Type Compliance
                    </td>

                    <td className="sticky bottom-0 left-[280px] z-40 border-r border-t border-slate-200 bg-slate-950 px-3 py-3 text-center text-xs font-semibold text-slate-300">
                      Summary
                    </td>

                    {visibleColumns.map((trainingType) => {
                      const summary = columnSummaries.find(
                        (item) =>
                          item.trainingType.id === trainingType.id,
                      );

                      return (
                        <td
                          key={`summary-${trainingType.id}`}
                          className="sticky bottom-0 z-30 border-r border-t border-slate-200 bg-slate-900 px-2 py-3 text-center"
                        >
                          <div
                            className={`text-sm font-bold ${
                              (summary?.score ?? 0) >= 95
                                ? "text-emerald-300"
                                : (summary?.score ?? 0) >= 80
                                  ? "text-amber-300"
                                  : "text-rose-300"
                            }`}
                          >
                            {summary?.score ?? 0}%
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">
                            {summary?.current ?? 0}/
                            {summary?.total ?? 0}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </div>

      {selectedCell ? (
        <CellDetailModal
          employee={selectedCell.employee}
          trainingType={selectedCell.trainingType}
          cell={selectedCell.cell}
          documents={
            selectedCell.cell.trainingRecordId
              ? documentsByRecord.get(
                  selectedCell.cell.trainingRecordId,
                ) ?? []
              : []
          }
          onClose={() => setSelectedCell(null)}
        />
      ) : null}
    </AppShell>
  );
}

function CellDetailModal({
  employee,
  trainingType,
  cell,
  documents,
  onClose,
}: {
  employee: Employee;
  trainingType: TrainingType;
  cell: MatrixCell;
  documents: TrainingDocument[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
      <div className="my-auto w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-950">
                {trainingType.name}
              </h2>

              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(
                  cell.status,
                )}`}
              >
                {statusLabel(cell.status)}
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-500">
              {employee.full_name}
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
          {cell.status === "missing" ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <UserRound
                size={28}
                className="mx-auto text-slate-400"
              />
              <h3 className="mt-3 font-bold text-slate-900">
                No current record
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                This employee does not have an active{" "}
                {trainingType.name} record.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailCard
                  label="Issue date"
                  value={formatDate(cell.issueDate)}
                />
                <DetailCard
                  label="Expiry date"
                  value={
                    cell.status === "non_expiring"
                      ? "Does not expire"
                      : formatDate(cell.expiryDate)
                  }
                />
                <DetailCard
                  label="Certificate number"
                  value={cell.certificateNumber || "Not recorded"}
                />
                <DetailCard
                  label="Provider"
                  value={cell.provider || "Not recorded"}
                />
                <DetailCard
                  label="Class codes"
                  value={
                    cell.classCodes.length > 0
                      ? cell.classCodes.join(", ")
                      : "Not recorded"
                  }
                />
                <DetailCard
                  label="Days remaining"
                  value={
                    cell.daysRemaining === null
                      ? "Not applicable"
                      : cell.daysRemaining < 0
                        ? `${Math.abs(
                            cell.daysRemaining,
                          )} days overdue`
                        : `${cell.daysRemaining} days`
                  }
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-slate-900">
                      Document compliance
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {cell.uploadedDocumentCount} uploaded of{" "}
                      {cell.requiredDocumentCount} required.
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      cell.missingDocumentCount > 0
                        ? "bg-violet-100 text-violet-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {cell.missingDocumentCount > 0
                      ? `${cell.missingDocumentCount} missing`
                      : "Complete"}
                  </span>
                </div>

                {documents.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {documents.map((document) => (
                      <div
                        key={document.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                      >
                        <span className="text-sm font-semibold text-slate-700">
                          {document.document_type_name}
                        </span>

                        {document.sharepoint_web_url ? (
                          <a
                            href={document.sharepoint_web_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-semibold text-slate-950 hover:underline"
                          >
                            Open
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">
                            No link
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">
                    No active documents have been recorded.
                  </p>
                )}
              </div>
            </>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>

            <Link
              href={`/people/${employee.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Open Employee Profile
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailCard({
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
      <div className="mt-2 text-sm font-bold text-slate-900">
        {value}
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
  tone: "emerald" | "amber" | "rose" | "violet" | "slate";
}) {
  const classes =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : tone === "violet"
            ? "border-violet-200 bg-violet-50 text-violet-800"
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

function ToggleButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${
        active
          ? "border-slate-950 bg-slate-950 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ScoreBadge({ value }: { value: number }) {
  const classes =
    value >= 95
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : value >= 80
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-rose-200 bg-rose-50 text-rose-700";

  return (
    <span
      className={`inline-flex min-w-[58px] justify-center rounded-full border px-2.5 py-1 text-xs font-bold ${classes}`}
    >
      {value}%
    </span>
  );
}

function Legend({ status }: { status: CellStatus }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`h-3.5 w-3.5 rounded border ${
          statusClasses(status).split(" hover:")[0]
        }`}
      />
      {statusLabel(status)}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="p-12 text-center">
      <Grid3X3 size={32} className="mx-auto text-slate-300" />
      <h3 className="mt-4 text-lg font-bold text-slate-900">
        No matrix data found
      </h3>
      <p className="mt-2 text-sm text-slate-500">
        Adjust the filters or create active training types and employee
        records.
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

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Download,
  ExternalLink,
  FileCheck2,
  FilePlus2,
  Filter,
  GraduationCap,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type AuditRow = {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  action_label: string;
  description: string | null;
  reason: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;

  performed_by: string | null;
  performed_by_name: string | null;

  employee_id: string | null;
  employee_name: string | null;

  training_type_id: string | null;
  training_type_name: string | null;
  training_category: string | null;

  training_record_id: string | null;
  course_id: string | null;
  course_title: string | null;
  course_attendee_id: string | null;

  project_id: string | null;
  project_name: string | null;
};

type Employee = {
  id: string;
  full_name: string;
  active: boolean | null;
};

type TrainingType = {
  id: string;
  name: string;
  category: string | null;
  active: boolean | null;
};

type Project = {
  id: string;
  name: string;
};

type Filters = {
  eventType: string;
  employeeId: string;
  trainingTypeId: string;
  projectId: string;
  performedBy: string;
  dateFrom: string;
  dateTo: string;
};

const pageSize = 50;

const initialFilters: Filters = {
  eventType: "all",
  employeeId: "all",
  trainingTypeId: "all",
  projectId: "all",
  performedBy: "all",
  dateFrom: "",
  dateTo: "",
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not set";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTime(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dateKey(value: string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function displayEventType(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function objectEntries(value: Record<string, unknown> | null) {
  if (!value) return [];

  return Object.entries(value).filter(
    ([key]) =>
      ![
        "id",
        "created_at",
        "updated_at",
        "employee_id",
        "training_type_id",
        "course_id",
      ].includes(key),
  );
}

function valueLabel(value: unknown) {
  if (value === null || value === undefined || value === "") return "Blank";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function eventStyle(eventType: string) {
  if (
    [
      "verification_approved",
      "course_completed",
      "certificate_uploaded",
      "course_certificate_uploaded",
      "training_record_created",
    ].includes(eventType)
  ) {
    return {
      icon: CheckCircle2,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
      iconTone: "bg-emerald-100 text-emerald-700",
    };
  }

  if (
    [
      "verification_rejected",
      "training_record_revoked",
      "training_record_deleted",
      "course_deleted",
      "course_cancelled",
      "certificate_document_deleted",
    ].includes(eventType)
  ) {
    return {
      icon: XCircle,
      tone: "border-rose-200 bg-rose-50 text-rose-700",
      iconTone: "bg-rose-100 text-rose-700",
    };
  }

  if (
    [
      "training_record_superseded",
      "training_record_details_changed",
      "course_updated",
      "attendance_updated",
      "course_result_updated",
      "training_record_status_changed",
    ].includes(eventType)
  ) {
    return {
      icon: RotateCcw,
      tone: "border-amber-200 bg-amber-50 text-amber-800",
      iconTone: "bg-amber-100 text-amber-800",
    };
  }

  if (
    [
      "course_created",
      "employee_allocated_to_course",
      "employee_removed_from_course",
    ].includes(eventType)
  ) {
    return {
      icon: GraduationCap,
      tone: "border-blue-200 bg-blue-50 text-blue-700",
      iconTone: "bg-blue-100 text-blue-700",
    };
  }

  return {
    icon: Activity,
    tone: "border-slate-200 bg-slate-50 text-slate-700",
    iconTone: "bg-slate-100 text-slate-700",
  };
}

export default function TrainingHistoryPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"timeline" | "table">("timeline");
  const [selectedRow, setSelectedRow] = useState<AuditRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [auditResult, employeeResult, typeResult, projectResult] =
      await Promise.all([
        supabase
          .from("training_audit_log_view")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("employees")
          .select("id, full_name, active")
          .order("full_name"),
        supabase
          .from("training_types")
          .select("id, name, category, active")
          .order("category")
          .order("name"),
        supabase.from("projects").select("id, name").order("name"),
      ]);

    const error =
      auditResult.error ||
      employeeResult.error ||
      typeResult.error ||
      projectResult.error;

    if (error) throw new Error(error.message);

    setRows((auditResult.data ?? []) as AuditRow[]);
    setEmployees((employeeResult.data ?? []) as Employee[]);
    setTrainingTypes((typeResult.data ?? []) as TrainingType[]);
    setProjects((projectResult.data ?? []) as Project[]);
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      try {
        await loadData();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to load training history.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData]);

  const eventTypes = useMemo(
    () => Array.from(new Set(rows.map((row) => row.event_type))).sort(),
    [rows],
  );

  const performedByOptions = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((row) => clean(row.performed_by_name))
            .filter(Boolean),
        ),
      ).sort(),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (
        filters.eventType !== "all" &&
        row.event_type !== filters.eventType
      ) {
        return false;
      }

      if (
        filters.employeeId !== "all" &&
        row.employee_id !== filters.employeeId
      ) {
        return false;
      }

      if (
        filters.trainingTypeId !== "all" &&
        row.training_type_id !== filters.trainingTypeId
      ) {
        return false;
      }

      if (
        filters.projectId !== "all" &&
        row.project_id !== filters.projectId
      ) {
        return false;
      }

      if (
        filters.performedBy !== "all" &&
        clean(row.performed_by_name) !== filters.performedBy
      ) {
        return false;
      }

      if (
        filters.dateFrom &&
        new Date(row.created_at).getTime() <
          new Date(`${filters.dateFrom}T00:00:00`).getTime()
      ) {
        return false;
      }

      if (
        filters.dateTo &&
        new Date(row.created_at).getTime() >
          new Date(`${filters.dateTo}T23:59:59`).getTime()
      ) {
        return false;
      }

      if (!query) return true;

      return [
        row.action_label,
        row.description,
        row.reason,
        row.event_type,
        row.entity_type,
        row.employee_name,
        row.training_type_name,
        row.training_category,
        row.course_title,
        row.project_name,
        row.performed_by_name,
        JSON.stringify(row.old_values ?? {}),
        JSON.stringify(row.new_values ?? {}),
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [filters, rows, search]);

  useEffect(() => {
    setPage(1);
  }, [filters, search]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));

  const groupedRows = useMemo(() => {
    const groups = new Map<string, AuditRow[]>();

    paginatedRows.forEach((row) => {
      const key = dateKey(row.created_at);
      const existing = groups.get(key) ?? [];
      existing.push(row);
      groups.set(key, existing);
    });

    return Array.from(groups.entries());
  }, [paginatedRows]);

  const metrics = useMemo(() => {
    return {
      total: filteredRows.length,
      approvals: filteredRows.filter(
        (row) => row.event_type === "verification_approved",
      ).length,
      uploads: filteredRows.filter((row) =>
        ["certificate_uploaded", "course_certificate_uploaded"].includes(
          row.event_type,
        ),
      ).length,
      courseEvents: filteredRows.filter((row) =>
        row.entity_type.includes("course"),
      ).length,
      changes: filteredRows.filter((row) =>
        [
          "training_record_details_changed",
          "course_updated",
          "attendance_updated",
          "course_result_updated",
        ].includes(row.event_type),
      ).length,
      rejections: filteredRows.filter(
        (row) => row.event_type === "verification_rejected",
      ).length,
    };
  }, [filteredRows]);

  async function refreshData() {
    setRefreshing(true);
    setMessage(null);

    try {
      await loadData();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to refresh training history.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setFilters(initialFilters);
  }

  function exportCsv() {
    const headers = [
      "Date",
      "Action",
      "Event Type",
      "Employee",
      "Employee Number",
      "Training",
      "Course",
      "Project",
      "Performed By",
      "Description",
      "Reason",
      "Old Values",
      "New Values",
    ];

    const lines = filteredRows.map((row) =>
      [
        formatDateTime(row.created_at),
        row.action_label,
        row.event_type,
        row.employee_name ?? "",
        row.training_type_name ?? "",
        row.course_title ?? "",
        row.project_name ?? "",
        row.performed_by_name ?? "",
        row.description ?? "",
        row.reason ?? "",
        JSON.stringify(row.old_values ?? {}),
        JSON.stringify(row.new_values ?? {}),
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    );

    const blob = new Blob([[headers.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `training-history-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
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
                href="/people/training/dashboard"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft size={16} />
                Back to Training Dashboard
              </Link>

              <div className="mt-5 flex items-center gap-2 text-slate-400">
                <History size={18} />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Audit Centre
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Training History
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Search the complete audit trail for certificates, training
                records, verification decisions, course changes, attendance and
                employee allocations.
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
                onClick={exportCsv}
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
          <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
            {message}
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard
            label="Audit Events"
            value={metrics.total}
            icon={<Activity size={19} />}
          />
          <MetricCard
            label="Approvals"
            value={metrics.approvals}
            icon={<BadgeCheck size={19} />}
          />
          <MetricCard
            label="Uploads"
            value={metrics.uploads}
            icon={<FilePlus2 size={19} />}
          />
          <MetricCard
            label="Course Activity"
            value={metrics.courseEvents}
            icon={<GraduationCap size={19} />}
          />
          <MetricCard
            label="Record Changes"
            value={metrics.changes}
            icon={<RotateCcw size={19} />}
          />
          <MetricCard
            label="Rejections"
            value={metrics.rejections}
            icon={<XCircle size={19} />}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px_220px]">
            <label className="relative block">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search employee, training, course, certificate action or user..."
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </label>

            <SelectField
              value={filters.eventType}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  eventType: value,
                }))
              }
              options={[
                { value: "all", label: "All activity types" },
                ...eventTypes.map((value) => ({
                  value,
                  label: displayEventType(value),
                })),
              ]}
            />

            <SelectField
              value={filters.employeeId}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  employeeId: value,
                }))
              }
              options={[
                { value: "all", label: "All employees" },
                ...employees.map((employee) => ({
                  value: employee.id,
                  label: employee.full_name,
                })),
              ]}
            />

            <SelectField
              value={filters.trainingTypeId}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  trainingTypeId: value,
                }))
              }
              options={[
                { value: "all", label: "All training types" },
                ...trainingTypes.map((type) => ({
                  value: type.id,
                  label: type.category
                    ? `${type.category} · ${type.name}`
                    : type.name,
                })),
              ]}
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-[220px_220px_170px_170px_auto]">
            <SelectField
              value={filters.projectId}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  projectId: value,
                }))
              }
              options={[
                { value: "all", label: "All projects" },
                ...projects.map((project) => ({
                  value: project.id,
                  label: project.name,
                })),
              ]}
            />

            <SelectField
              value={filters.performedBy}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  performedBy: value,
                }))
              }
              options={[
                { value: "all", label: "Changed by anyone" },
                ...performedByOptions.map((name) => ({
                  value: name,
                  label: name,
                })),
              ]}
            />

            <DateField
              value={filters.dateFrom}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  dateFrom: value,
                }))
              }
              label="From"
            />

            <DateField
              value={filters.dateTo}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  dateTo: value,
                }))
              }
              label="To"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm font-semibold text-slate-500 hover:text-slate-800"
              >
                Clear filters
              </button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Audit Timeline
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {filteredRows.length} event
                {filteredRows.length === 1 ? "" : "s"} match the current
                filters.
              </p>
            </div>

            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setViewMode("timeline")}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  viewMode === "timeline"
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                Timeline
              </button>

              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  viewMode === "table"
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                Table
              </button>
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="p-12 text-center">
              <History size={38} className="mx-auto text-slate-300" />
              <h3 className="mt-4 text-lg font-bold text-slate-900">
                No audit events found
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                New activity will appear after the audit SQL and triggers are
                installed.
              </p>
            </div>
          ) : viewMode === "timeline" ? (
            <div className="p-5">
              <div className="space-y-8">
                {groupedRows.map(([day, events]) => (
                  <div key={day}>
                    <div className="mb-4 flex items-center gap-3">
                      <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                        <CalendarDays size={17} />
                      </div>

                      <div>
                        <div className="font-bold text-slate-950">
                          {formatDate(day)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {events.length} event
                          {events.length === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>

                    <div className="ml-4 border-l-2 border-slate-100 pl-7">
                      <div className="space-y-4">
                        {events.map((row) => (
                          <TimelineItem
                            key={row.id}
                            row={row}
                            onOpen={() => setSelectedRow(row)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <AuditTable
              rows={paginatedRows}
              onOpen={(row) => setSelectedRow(row)}
            />
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            totalRows={filteredRows.length}
            onPageChange={setPage}
          />
        </section>
      </div>

      {selectedRow ? (
        <AuditDrawer row={selectedRow} onClose={() => setSelectedRow(null)} />
      ) : null}
    </AppShell>
  );
}

function TimelineItem({
  row,
  onOpen,
}: {
  row: AuditRow;
  onOpen: () => void;
}) {
  const style = eventStyle(row.event_type);
  const Icon = style.icon;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-sm"
    >
      <div
        className={`absolute -left-[42px] top-5 flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-white ${style.iconTone}`}
      >
        <Icon size={15} />
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-bold text-slate-950">{row.action_label}</div>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${style.tone}`}
            >
              {displayEventType(row.event_type)}
            </span>
          </div>

          {row.description ? (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {row.description}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
            {row.employee_name ? (
              <span className="inline-flex items-center gap-1">
                <UserRound size={13} />
                {row.employee_name}
              </span>
            ) : null}

            {row.training_type_name ? (
              <span className="inline-flex items-center gap-1">
                <ShieldCheck size={13} />
                {row.training_type_name}
              </span>
            ) : null}

            {row.course_title ? (
              <span className="inline-flex items-center gap-1">
                <GraduationCap size={13} />
                {row.course_title}
              </span>
            ) : null}

            {row.project_name ? (
              <span>{row.project_name}</span>
            ) : null}

            <span>
              Changed by {row.performed_by_name || "System"}
            </span>
          </div>
        </div>

        <div className="shrink-0 text-xs font-semibold text-slate-400">
          {formatTime(row.created_at)}
        </div>
      </div>
    </button>
  );
}

function AuditTable({
  rows,
  onOpen,
}: {
  rows: AuditRow[];
  onOpen: (row: AuditRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr className="border-b border-slate-200">
            <th className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-600">
              Date
            </th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">
              Action
            </th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">
              Employee
            </th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">
              Training
            </th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">
              Course / Project
            </th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">
              Changed By
            </th>
            <th className="px-4 py-3" />
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => {
            const style = eventStyle(row.event_type);

            return (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                  {formatDateTime(row.created_at)}
                </td>

                <td className="px-4 py-4">
                  <div className="font-semibold text-slate-900">
                    {row.action_label}
                  </div>
                  <span
                    className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style.tone}`}
                  >
                    {displayEventType(row.event_type)}
                  </span>
                </td>

                <td className="px-4 py-4">
                  <div className="font-medium text-slate-800">
                    {row.employee_name || "—"}
                  </div>
                </td>

                <td className="px-4 py-4">
                  <div className="font-medium text-slate-800">
                    {row.training_type_name || "—"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {row.training_category || ""}
                  </div>
                </td>

                <td className="px-4 py-4 text-slate-600">
                  <div>{row.course_title || "—"}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {row.project_name || ""}
                  </div>
                </td>

                <td className="px-4 py-4 text-slate-600">
                  {row.performed_by_name || "System"}
                </td>

                <td className="px-4 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => onOpen(row)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
                  >
                    View
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AuditDrawer({
  row,
  onClose,
}: {
  row: AuditRow;
  onClose: () => void;
}) {
  const style = eventStyle(row.event_type);
  const Icon = style.icon;

  const oldEntries = objectEntries(row.old_values);
  const newEntries = objectEntries(row.new_values);

  const changedKeys = Array.from(
    new Set([
      ...oldEntries.map(([key]) => key),
      ...newEntries.map(([key]) => key),
    ]),
  ).filter(
    (key) =>
      valueLabel(row.old_values?.[key]) !== valueLabel(row.new_values?.[key]),
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45">
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Audit Event
            </div>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">
              {row.action_label}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${style.tone}`}
              >
                <Icon size={14} />
                {displayEventType(row.event_type)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
          >
            <XCircle size={20} />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <Detail label="Date" value={formatDateTime(row.created_at)} />
            <Detail
              label="Changed by"
              value={row.performed_by_name || "System"}
            />
            <Detail
              label="Employee"
              value={row.employee_name || "Not linked"}
            />
            <Detail
              label="Training type"
              value={row.training_type_name || "Not linked"}
            />
            <Detail
              label="Course"
              value={row.course_title || "Not linked"}
            />
            <Detail
              label="Project"
              value={row.project_name || "Not linked"}
            />
            <Detail label="Entity" value={displayEventType(row.entity_type)} />
          </section>

          {row.description ? (
            <section>
              <h3 className="text-lg font-bold text-slate-950">
                Description
              </h3>
              <p className="mt-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
                {row.description}
              </p>
            </section>
          ) : null}

          {row.reason ? (
            <section>
              <h3 className="text-lg font-bold text-slate-950">
                Reason / Notes
              </h3>
              <p className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                {row.reason}
              </p>
            </section>
          ) : null}

          <section>
            <h3 className="text-lg font-bold text-slate-950">
              Changes
            </h3>

            {changedKeys.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                This event does not contain a field-by-field change set.
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {changedKeys.map((key) => (
                  <div
                    key={key}
                    className="rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      {displayEventType(key)}
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                      <div className="rounded-xl bg-rose-50 p-3">
                        <div className="text-xs font-semibold text-rose-600">
                          Old
                        </div>
                        <div className="mt-1 break-words text-sm font-medium text-rose-900">
                          {valueLabel(row.old_values?.[key])}
                        </div>
                      </div>

                      <ChevronRight
                        size={18}
                        className="hidden text-slate-300 sm:block"
                      />

                      <div className="rounded-xl bg-emerald-50 p-3">
                        <div className="text-xs font-semibold text-emerald-600">
                          New
                        </div>
                        <div className="mt-1 break-words text-sm font-medium text-emerald-900">
                          {valueLabel(row.new_values?.[key])}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {row.metadata && Object.keys(row.metadata).length > 0 ? (
            <section>
              <h3 className="text-lg font-bold text-slate-950">
                Event Metadata
              </h3>
              <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                {JSON.stringify(row.metadata, null, 2)}
              </pre>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-600">{label}</div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            {value}
          </div>
        </div>

        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
          {icon}
        </div>
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  totalRows,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalRows: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-500">
        Page {page} of {totalPages} · {totalRows} total events
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
        >
          <ChevronLeft size={16} />
          Previous
        </button>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
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
      <Filter
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
      />

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm font-medium text-slate-700 outline-none ring-slate-200 focus:ring-2"
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

function DateField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
        {label}
      </span>

      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-14 pr-3 text-sm font-medium text-slate-700 outline-none ring-slate-200 focus:ring-2"
      />
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

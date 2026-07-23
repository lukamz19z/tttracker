"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  Eye,
  FileCheck2,
  FileSearch,
  FileWarning,
  Filter,
  History,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  X,
  XCircle,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type VerificationState =
  | "pending_verification"
  | "current"
  | "rejected"
  | "revoked"
  | "superseded";

type TrainingType = {
  id: string;
  name: string;
  category: string | null;
  default_expiry_months: number | null;
  does_not_expire: boolean | null;
  active: boolean | null;
};

type Employee = {
  id: string;
  full_name: string;
  employee_number: string | null;
  role: string | null;
  crew_id: string | null;
  active: boolean | null;
};

type TrainingRecord = {
  id: string;
  employee_id: string;
  training_type_id: string;
  training_name: string | null;
  category: string | null;
  certificate_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  does_not_expire: boolean | null;
  record_status: VerificationState | string | null;
  superseded_at: string | null;
  revoked_at: string | null;
  created_at: string | null;
  verified_at?: string | null;
  verified_by?: string | null;
  verification_notes?: string | null;
  source?: string | null;
};

type TrainingDocument = {
  id: string;
  employee_training_record_id: string;
  document_type_id?: string | null;
  file_name: string | null;
  sharepoint_web_url: string | null;
  created_at: string | null;
  uploaded_by?: string | null;
};

type CourseAttendee = {
  id: string;
  course_id: string;
  employee_id: string;
  employee_training_record_id: string | null;
  certificate_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  certificate_sharepoint_url: string | null;
  certificate_file_name: string | null;
  result_status: string | null;
};

type Course = {
  id: string;
  title: string;
  training_type_id: string;
  start_at: string;
  end_at: string;
  status: string;
};

type VerificationItem = {
  record: TrainingRecord;
  employee: Employee | null;
  trainingType: TrainingType | null;
  documents: TrainingDocument[];
  courseAttendee: CourseAttendee | null;
  course: Course | null;
  warnings: VerificationWarning[];
  duplicateRecords: TrainingRecord[];
};

type VerificationWarning = {
  code:
    | "missing_document"
    | "missing_issue_date"
    | "missing_expiry"
    | "expiry_before_issue"
    | "inactive_employee"
    | "duplicate_certificate"
    | "duplicate_current_record"
    | "training_type_mismatch"
    | "course_result_not_passed";
  label: string;
  severity: "high" | "medium" | "low";
};

type FilterState = {
  status: "all" | "pending" | "warning" | "ready";
  trainingTypeId: string;
  employeeStatus: "all" | "active" | "inactive";
  documentState: "all" | "with_document" | "missing_document";
  dateRange: "all" | "7_days" | "30_days" | "90_days";
};

const initialFilters: FilterState = {
  status: "all",
  trainingTypeId: "all",
  employeeStatus: "all",
  documentState: "all",
  dateRange: "all",
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";

  const date = new Date(`${value}T00:00:00`);

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

function daysSince(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function warningTone(severity: VerificationWarning["severity"]) {
  if (severity === "high") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (severity === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-blue-200 bg-blue-50 text-blue-700";
}

function statusTone(status: string | null | undefined) {
  if (status === "current") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "rejected" || status === "revoked") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (status === "superseded") {
    return "border-slate-200 bg-slate-100 text-slate-600";
  }

  return "border-amber-200 bg-amber-50 text-amber-800";
}

function normalisedCertificate(value: string | null | undefined) {
  return clean(value).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function recordMatchesDateRange(
  record: TrainingRecord,
  range: FilterState["dateRange"],
) {
  if (range === "all") return true;
  if (!record.created_at) return false;

  const created = new Date(record.created_at);
  if (Number.isNaN(created.getTime())) return false;

  const days = range === "7_days" ? 7 : range === "30_days" ? 30 : 90;
  return created.getTime() >= Date.now() - days * 86_400_000;
}

function deriveWarnings(
  record: TrainingRecord,
  employee: Employee | null,
  trainingType: TrainingType | null,
  documents: TrainingDocument[],
  duplicateRecords: TrainingRecord[],
  courseAttendee: CourseAttendee | null,
): VerificationWarning[] {
  const warnings: VerificationWarning[] = [];

  if (documents.length === 0) {
    warnings.push({
      code: "missing_document",
      label: "No certificate document attached",
      severity: "high",
    });
  }

  if (!record.issue_date) {
    warnings.push({
      code: "missing_issue_date",
      label: "Issue date is missing",
      severity: "high",
    });
  }

  const doesNotExpire =
    record.does_not_expire === true || trainingType?.does_not_expire === true;

  if (!doesNotExpire && !record.expiry_date) {
    warnings.push({
      code: "missing_expiry",
      label: "Expiry date is missing",
      severity: "high",
    });
  }

  if (
    record.issue_date &&
    record.expiry_date &&
    new Date(record.expiry_date).getTime() <
      new Date(record.issue_date).getTime()
  ) {
    warnings.push({
      code: "expiry_before_issue",
      label: "Expiry date is before issue date",
      severity: "high",
    });
  }

  if (employee?.active === false) {
    warnings.push({
      code: "inactive_employee",
      label: "Employee is inactive",
      severity: "medium",
    });
  }

  const certificateNumber = normalisedCertificate(record.certificate_number);

  if (
    certificateNumber &&
    duplicateRecords.some(
      (duplicate) =>
        duplicate.id !== record.id &&
        normalisedCertificate(duplicate.certificate_number) ===
          certificateNumber,
    )
  ) {
    warnings.push({
      code: "duplicate_certificate",
      label: "Certificate number may be duplicated",
      severity: "high",
    });
  }

  if (
    duplicateRecords.some(
      (duplicate) =>
        duplicate.id !== record.id &&
        duplicate.employee_id === record.employee_id &&
        duplicate.training_type_id === record.training_type_id &&
        duplicate.record_status === "current",
    )
  ) {
    warnings.push({
      code: "duplicate_current_record",
      label: "Employee already has a current record of this type",
      severity: "medium",
    });
  }

  if (
    trainingType &&
    record.training_name &&
    clean(record.training_name).toLowerCase() !==
      trainingType.name.toLowerCase()
  ) {
    warnings.push({
      code: "training_type_mismatch",
      label: "Stored training name does not match the selected training type",
      severity: "low",
    });
  }

  if (
    courseAttendee &&
    courseAttendee.result_status &&
    courseAttendee.result_status !== "passed"
  ) {
    warnings.push({
      code: "course_result_not_passed",
      label: "Linked course attendee is not marked as passed",
      severity: "high",
    });
  }

  return warnings;
}

export default function TrainingVerificationQueuePage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [documents, setDocuments] = useState<TrainingDocument[]>([]);
  const [courseAttendees, setCourseAttendees] = useState<CourseAttendee[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [bulkActionOpen, setBulkActionOpen] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    const [
      recordResult,
      employeeResult,
      trainingTypeResult,
      documentResult,
      attendeeResult,
      courseResult,
    ] = await Promise.all([
      supabase
        .from("employee_training_records")
        .select("*")
        .in("record_status", ["pending_verification", "pending", "rejected"])
        .order("created_at", { ascending: false }),
      supabase
        .from("employees")
        .select("id, full_name, employee_number, role, crew_id, active")
        .order("full_name"),
      supabase
        .from("training_types")
        .select(
          "id, name, category, default_expiry_months, does_not_expire, active",
        )
        .order("category")
        .order("name"),
      supabase
        .from("employee_training_documents")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("training_course_attendees")
        .select(
          "id, course_id, employee_id, employee_training_record_id, certificate_number, issue_date, expiry_date, certificate_sharepoint_url, certificate_file_name, result_status",
        ),
      supabase
        .from("training_courses")
        .select("id, title, training_type_id, start_at, end_at, status"),
    ]);

    const error =
      recordResult.error ||
      employeeResult.error ||
      trainingTypeResult.error ||
      documentResult.error ||
      attendeeResult.error ||
      courseResult.error;

    if (error) throw new Error(error.message);

    const verificationRecords = (recordResult.data ?? []) as TrainingRecord[];

    if (verificationRecords.length > 0) {
      const employeeIds = Array.from(
        new Set(verificationRecords.map((record) => record.employee_id)),
      );
      const trainingTypeIds = Array.from(
        new Set(verificationRecords.map((record) => record.training_type_id)),
      );

      const duplicateResult = await supabase
        .from("employee_training_records")
        .select("*")
        .or(
          [
            employeeIds.length
              ? `employee_id.in.(${employeeIds.join(",")})`
              : "",
            trainingTypeIds.length
              ? `training_type_id.in.(${trainingTypeIds.join(",")})`
              : "",
          ]
            .filter(Boolean)
            .join(","),
        )
        .order("created_at", { ascending: false });

      if (!duplicateResult.error && duplicateResult.data) {
        const merged = new Map<string, TrainingRecord>();

        (duplicateResult.data as TrainingRecord[]).forEach((record) =>
          merged.set(record.id, record),
        );
        verificationRecords.forEach((record) => merged.set(record.id, record));

        setRecords(Array.from(merged.values()));
      } else {
        setRecords(verificationRecords);
      }
    } else {
      setRecords([]);
    }

    setEmployees((employeeResult.data ?? []) as Employee[]);
    setTrainingTypes((trainingTypeResult.data ?? []) as TrainingType[]);
    setDocuments((documentResult.data ?? []) as TrainingDocument[]);
    setCourseAttendees((attendeeResult.data ?? []) as CourseAttendee[]);
    setCourses((courseResult.data ?? []) as Course[]);
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
              : "Unable to load the verification queue.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData]);

  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );

  const trainingTypeById = useMemo(
    () => new Map(trainingTypes.map((type) => [type.id, type])),
    [trainingTypes],
  );

  const documentsByRecordId = useMemo(() => {
    const map = new Map<string, TrainingDocument[]>();

    documents.forEach((document) => {
      const list = map.get(document.employee_training_record_id) ?? [];
      list.push(document);
      map.set(document.employee_training_record_id, list);
    });

    return map;
  }, [documents]);

  const attendeeByRecordId = useMemo(() => {
    const map = new Map<string, CourseAttendee>();

    courseAttendees.forEach((attendee) => {
      if (attendee.employee_training_record_id) {
        map.set(attendee.employee_training_record_id, attendee);
      }
    });

    return map;
  }, [courseAttendees]);

  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  );

  const pendingRecords = useMemo(
    () =>
      records.filter((record) =>
        ["pending_verification", "pending", "rejected"].includes(
          clean(record.record_status),
        ),
      ),
    [records],
  );

  const verificationItems = useMemo<VerificationItem[]>(() => {
    return pendingRecords.map((record) => {
      const employee = employeeById.get(record.employee_id) ?? null;
      const trainingType =
        trainingTypeById.get(record.training_type_id) ?? null;
      const recordDocuments = documentsByRecordId.get(record.id) ?? [];
      const courseAttendee = attendeeByRecordId.get(record.id) ?? null;
      const course = courseAttendee
        ? courseById.get(courseAttendee.course_id) ?? null
        : null;

      const duplicateRecords = records.filter((candidate) => {
        if (candidate.id === record.id) return false;

        const sameCertificate =
          normalisedCertificate(candidate.certificate_number) &&
          normalisedCertificate(candidate.certificate_number) ===
            normalisedCertificate(record.certificate_number);

        const sameEmployeeAndType =
          candidate.employee_id === record.employee_id &&
          candidate.training_type_id === record.training_type_id;

        return Boolean(sameCertificate || sameEmployeeAndType);
      });

      return {
        record,
        employee,
        trainingType,
        documents: recordDocuments,
        courseAttendee,
        course,
        duplicateRecords,
        warnings: deriveWarnings(
          record,
          employee,
          trainingType,
          recordDocuments,
          duplicateRecords,
          courseAttendee,
        ),
      };
    });
  }, [
    attendeeByRecordId,
    courseById,
    documentsByRecordId,
    employeeById,
    pendingRecords,
    records,
    trainingTypeById,
  ]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return verificationItems.filter((item) => {
      if (
        filters.status === "pending" &&
        !["pending_verification", "pending"].includes(
          clean(item.record.record_status),
        )
      ) {
        return false;
      }

      if (filters.status === "warning" && item.warnings.length === 0) {
        return false;
      }

      if (filters.status === "ready" && item.warnings.length > 0) {
        return false;
      }

      if (
        filters.trainingTypeId !== "all" &&
        item.record.training_type_id !== filters.trainingTypeId
      ) {
        return false;
      }

      if (
        filters.employeeStatus === "active" &&
        item.employee?.active === false
      ) {
        return false;
      }

      if (
        filters.employeeStatus === "inactive" &&
        item.employee?.active !== false
      ) {
        return false;
      }

      if (
        filters.documentState === "with_document" &&
        item.documents.length === 0
      ) {
        return false;
      }

      if (
        filters.documentState === "missing_document" &&
        item.documents.length > 0
      ) {
        return false;
      }

      if (!recordMatchesDateRange(item.record, filters.dateRange)) {
        return false;
      }

      if (!query) return true;

      return [
        item.employee?.full_name,
        item.employee?.employee_number,
        item.employee?.role,
        item.trainingType?.name,
        item.trainingType?.category,
        item.record.training_name,
        item.record.category,
        item.record.certificate_number,
        item.record.issue_date,
        item.record.expiry_date,
        item.course?.title,
        ...item.documents.map((document) => document.file_name),
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [filters, search, verificationItems]);

  const selectedItem =
    verificationItems.find((item) => item.record.id === selectedRecordId) ??
    null;

  const allVisibleSelected =
    filteredItems.length > 0 &&
    filteredItems.every((item) => selectedIds.includes(item.record.id));

  const pendingCount = verificationItems.filter((item) =>
    ["pending_verification", "pending"].includes(
      clean(item.record.record_status),
    ),
  ).length;

  const warningCount = verificationItems.filter(
    (item) => item.warnings.length > 0,
  ).length;

  const missingDocumentsCount = verificationItems.filter(
    (item) => item.documents.length === 0,
  ).length;

  const readyCount = verificationItems.filter(
    (item) =>
      ["pending_verification", "pending"].includes(
        clean(item.record.record_status),
      ) && item.warnings.length === 0,
  ).length;

  async function refreshData() {
    setRefreshing(true);
    setMessage(null);

    try {
      await loadData();
      setSelectedIds([]);
      setMessage({
        tone: "success",
        text: "Verification queue refreshed.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to refresh the verification queue.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  function toggleSelected(recordId: string) {
    setSelectedIds((current) =>
      current.includes(recordId)
        ? current.filter((id) => id !== recordId)
        : [...current, recordId],
    );
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        const visibleIds = new Set(
          filteredItems.map((item) => item.record.id),
        );
        return current.filter((id) => !visibleIds.has(id));
      }

      return Array.from(
        new Set([
          ...current,
          ...filteredItems.map((item) => item.record.id),
        ]),
      );
    });
  }

  async function approveRecords(recordIds: string[]) {
    if (recordIds.length === 0) return;

    setSaving(true);
    setMessage(null);

    try {
      const selected = verificationItems.filter((item) =>
        recordIds.includes(item.record.id),
      );

      const blocked = selected.filter((item) =>
        item.warnings.some((warning) => warning.severity === "high"),
      );

      if (blocked.length > 0) {
        const proceed = window.confirm(
          `${blocked.length} selected record${
            blocked.length === 1 ? " has" : "s have"
          } high-priority warnings. Approve anyway?`,
        );

        if (!proceed) {
          setSaving(false);
          return;
        }
      }

      const patch: Record<string, unknown> = {
        record_status: "current",
      };

      const { error } = await supabase
        .from("employee_training_records")
        .update(patch)
        .in("id", recordIds);

      if (error) throw error;

      await loadData();

      setSelectedIds((current) =>
        current.filter((id) => !recordIds.includes(id)),
      );

      if (
        selectedRecordId &&
        recordIds.includes(selectedRecordId)
      ) {
        setSelectedRecordId(null);
      }

      setMessage({
        tone: "success",
        text: `${recordIds.length} training record${
          recordIds.length === 1 ? "" : "s"
        } approved.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to approve the selected records.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function rejectRecords(recordIds: string[], reason: string) {
    if (recordIds.length === 0) return;

    setSaving(true);
    setMessage(null);

    try {
      const payload: Record<string, unknown> = {
        record_status: "rejected",
      };

      if (reason.trim()) {
        payload.verification_notes = reason.trim();
      }

      let result = await supabase
        .from("employee_training_records")
        .update(payload)
        .in("id", recordIds);

      if (
        result.error &&
        payload.verification_notes
      ) {
        result = await supabase
          .from("employee_training_records")
          .update({ record_status: "rejected" })
          .in("id", recordIds);
      }

      if (result.error) throw result.error;

      await loadData();

      setSelectedIds((current) =>
        current.filter((id) => !recordIds.includes(id)),
      );
      setRejectModalOpen(false);
      setRejectReason("");
      setBulkActionOpen(false);

      if (
        selectedRecordId &&
        recordIds.includes(selectedRecordId)
      ) {
        setSelectedRecordId(null);
      }

      setMessage({
        tone: "success",
        text: `${recordIds.length} training record${
          recordIds.length === 1 ? "" : "s"
        } rejected.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to reject the selected records.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveReviewNotes() {
    if (!selectedItem) return;

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("employee_training_records")
        .update({ verification_notes: reviewNotes.trim() || null })
        .eq("id", selectedItem.record.id);

      if (error) {
        setMessage({
          tone: "error",
          text:
            "The verification_notes column does not exist yet. Add it if you want review notes stored on the record.",
        });
        return;
      }

      await loadData();
      setMessage({
        tone: "success",
        text: "Review notes saved.",
      });
    } finally {
      setSaving(false);
    }
  }

  function openItem(item: VerificationItem) {
    setSelectedRecordId(item.record.id);
    setReviewNotes(item.record.verification_notes ?? "");
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
                <ShieldCheck size={18} />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Training Management
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Verification Queue
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Review training records and certificate evidence before they
                become active in the employee training register.
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

              <Link
                href="/people/training/history"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <History size={16} />
                Training History
              </Link>
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
            {message.text}
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Awaiting Verification"
            value={pendingCount}
            detail="Pending review"
            icon={<ShieldCheck size={20} />}
          />
          <MetricCard
            label="Warnings"
            value={warningCount}
            detail="Records needing attention"
            icon={<AlertTriangle size={20} />}
          />
          <MetricCard
            label="Missing Documents"
            value={missingDocumentsCount}
            detail="No evidence linked"
            icon={<FileWarning size={20} />}
          />
          <MetricCard
            label="Ready to Approve"
            value={readyCount}
            detail="No detected warnings"
            icon={<BadgeCheck size={20} />}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_190px_220px_200px]">
            <label className="relative block">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search employee, certificate, training type or course..."
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </label>

            <SelectField
              value={filters.status}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  status: value as FilterState["status"],
                }))
              }
              options={[
                { value: "all", label: "All queue items" },
                { value: "pending", label: "Pending only" },
                { value: "warning", label: "With warnings" },
                { value: "ready", label: "Ready to approve" },
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

            <SelectField
              value={filters.dateRange}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  dateRange: value as FilterState["dateRange"],
                }))
              }
              options={[
                { value: "all", label: "Any upload date" },
                { value: "7_days", label: "Last 7 days" },
                { value: "30_days", label: "Last 30 days" },
                { value: "90_days", label: "Last 90 days" },
              ]}
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-[220px_220px_auto]">
            <SelectField
              value={filters.employeeStatus}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  employeeStatus:
                    value as FilterState["employeeStatus"],
                }))
              }
              options={[
                { value: "all", label: "All employees" },
                { value: "active", label: "Active employees" },
                { value: "inactive", label: "Inactive employees" },
              ]}
            />

            <SelectField
              value={filters.documentState}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  documentState:
                    value as FilterState["documentState"],
                }))
              }
              options={[
                { value: "all", label: "All documents" },
                { value: "with_document", label: "Has document" },
                { value: "missing_document", label: "Missing document" },
              ]}
            />

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setFilters(initialFilters);
                  setSearch("");
                }}
                className="text-sm font-semibold text-slate-500 hover:text-slate-800"
              >
                Clear filters
              </button>
            </div>
          </div>
        </section>

        {selectedIds.length > 0 ? (
          <section className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-semibold text-blue-900">
              {selectedIds.length} record
              {selectedIds.length === 1 ? "" : "s"} selected
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void approveRecords(selectedIds)}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <CheckCircle2 size={16} />
                Approve Selected
              </button>

              <button
                type="button"
                onClick={() => {
                  setRejectReason("");
                  setBulkActionOpen(true);
                  setRejectModalOpen(true);
                }}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                <XCircle size={16} />
                Reject Selected
              </button>

              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-800"
              >
                Clear
              </button>
            </div>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Records Awaiting Review
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {filteredItems.length} record
                {filteredItems.length === 1 ? "" : "s"} shown.
              </p>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
                className="h-4 w-4 rounded border-slate-300"
              />
              Select all visible
            </label>
          </div>

          {filteredItems.length === 0 ? (
            <div className="p-12 text-center">
              <FileCheck2 size={38} className="mx-auto text-slate-300" />
              <h3 className="mt-4 text-lg font-bold text-slate-900">
                Verification queue is clear
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                No training records match the current filters.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredItems.map((item) => {
                const selected = selectedIds.includes(item.record.id);
                const age = daysSince(item.record.created_at);
                const highWarnings = item.warnings.filter(
                  (warning) => warning.severity === "high",
                ).length;

                return (
                  <div
                    key={item.record.id}
                    className={`grid gap-4 p-5 transition hover:bg-slate-50 xl:grid-cols-[32px_minmax(0,1.2fr)_minmax(0,1fr)_160px_180px] xl:items-center ${
                      selected ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <div>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelected(item.record.id)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className="min-w-0 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate font-bold text-slate-950">
                          {item.employee?.full_name ?? "Unknown employee"}
                        </div>

                        {item.employee?.active === false ? (
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            Inactive
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1 truncate text-sm font-semibold text-slate-700">
                        {item.trainingType?.name ??
                          item.record.training_name ??
                          "Unknown training"}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>
                          Cert: {item.record.certificate_number || "Not set"}
                        </span>
                        <span>
                          Uploaded {formatDateTime(item.record.created_at)}
                        </span>
                        {age !== null ? <span>{age} days ago</span> : null}
                      </div>
                    </button>

                    <div>
                      <div className="grid gap-1 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-1">
                        <span>
                          Issue:{" "}
                          <strong className="text-slate-800">
                            {formatDate(item.record.issue_date)}
                          </strong>
                        </span>
                        <span>
                          Expiry:{" "}
                          <strong className="text-slate-800">
                            {item.record.does_not_expire
                              ? "Does not expire"
                              : formatDate(item.record.expiry_date)}
                          </strong>
                        </span>
                      </div>

                      {item.documents.length > 0 ? (
                        <a
                          href={item.documents[0].sharepoint_web_url ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900"
                        >
                          <FileSearch size={13} />
                          {item.documents[0].file_name || "Open certificate"}
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                          <FileWarning size={13} />
                          No document
                        </div>
                      )}
                    </div>

                    <div>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(
                          item.record.record_status,
                        )}`}
                      >
                        {clean(item.record.record_status).replaceAll(
                          "_",
                          " ",
                        ) || "pending"}
                      </span>

                      <div className="mt-2">
                        {item.warnings.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <Check size={13} />
                            Ready to approve
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
                            <AlertTriangle size={13} />
                            {item.warnings.length} warning
                            {item.warnings.length === 1 ? "" : "s"}
                            {highWarnings > 0
                              ? ` · ${highWarnings} high`
                              : ""}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
                      >
                        <Eye size={15} />
                        Review
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void approveRecords([item.record.id])
                        }
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <Check size={15} />
                        Approve
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {selectedItem ? (
        <ReviewDrawer
          item={selectedItem}
          reviewNotes={reviewNotes}
          setReviewNotes={setReviewNotes}
          saving={saving}
          onClose={() => setSelectedRecordId(null)}
          onSaveNotes={() => void saveReviewNotes()}
          onApprove={() =>
            void approveRecords([selectedItem.record.id])
          }
          onReject={() => {
            setRejectReason("");
            setBulkActionOpen(false);
            setRejectModalOpen(true);
          }}
        />
      ) : null}

      {rejectModalOpen ? (
        <RejectModal
          reason={rejectReason}
          setReason={setRejectReason}
          saving={saving}
          count={
            bulkActionOpen
              ? selectedIds.length
              : selectedItem
                ? 1
                : 0
          }
          onClose={() => {
            setRejectModalOpen(false);
            setRejectReason("");
            setBulkActionOpen(false);
          }}
          onConfirm={() => {
            const ids = bulkActionOpen
              ? selectedIds
              : selectedItem
                ? [selectedItem.record.id]
                : [];

            void rejectRecords(ids, rejectReason);
          }}
        />
      ) : null}
    </AppShell>
  );
}

function ReviewDrawer({
  item,
  reviewNotes,
  setReviewNotes,
  saving,
  onClose,
  onSaveNotes,
  onApprove,
  onReject,
}: {
  item: VerificationItem;
  reviewNotes: string;
  setReviewNotes: (value: string) => void;
  saving: boolean;
  onClose: () => void;
  onSaveNotes: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const primaryDocument = item.documents[0] ?? null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45">
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Certificate Verification
            </div>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">
              {item.employee?.full_name ?? "Unknown employee"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {item.trainingType?.name ??
                item.record.training_name ??
                "Unknown training type"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <section className="flex flex-wrap gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(
                item.record.record_status,
              )}`}
            >
              {clean(item.record.record_status).replaceAll("_", " ")}
            </span>

            {item.warnings.length === 0 ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Ready to approve
              </span>
            ) : (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                {item.warnings.length} warning
                {item.warnings.length === 1 ? "" : "s"}
              </span>
            )}
          </section>

          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <Detail
              label="Employee number"
              value={item.employee?.employee_number || "Not set"}
            />
            <Detail label="Role" value={item.employee?.role || "Not set"} />
            <Detail
              label="Training category"
              value={
                item.trainingType?.category ||
                item.record.category ||
                "Not set"
              }
            />
            <Detail
              label="Certificate number"
              value={item.record.certificate_number || "Not set"}
            />
            <Detail
              label="Issue date"
              value={formatDate(item.record.issue_date)}
            />
            <Detail
              label="Expiry date"
              value={
                item.record.does_not_expire
                  ? "Does not expire"
                  : formatDate(item.record.expiry_date)
              }
            />
            <Detail
              label="Uploaded"
              value={formatDateTime(item.record.created_at)}
            />
            <Detail
              label="Source"
              value={item.course ? `Course · ${item.course.title}` : "Manual"}
            />
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-950">
              Verification Checks
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Resolve high-priority warnings before approval where possible.
            </p>

            <div className="mt-4 space-y-2">
              {item.warnings.length === 0 ? (
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                  <CheckCircle2 size={20} />
                  No automated warnings were detected.
                </div>
              ) : (
                item.warnings.map((warning) => (
                  <div
                    key={warning.code}
                    className={`flex items-start gap-3 rounded-2xl border p-4 ${warningTone(
                      warning.severity,
                    )}`}
                  >
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold">{warning.label}</div>
                      <div className="mt-1 text-xs uppercase tracking-wide opacity-70">
                        {warning.severity} priority
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-950">
                  Certificate Evidence
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Files remain stored in SharePoint.
                </p>
              </div>

              {primaryDocument?.sharepoint_web_url ? (
                <a
                  href={primaryDocument.sharepoint_web_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900"
                >
                  Open in SharePoint
                  <ExternalLink size={15} />
                </a>
              ) : null}
            </div>

            <div className="mt-4">
              {item.documents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-rose-300 bg-rose-50 p-6 text-center">
                  <FileWarning size={30} className="mx-auto text-rose-400" />
                  <div className="mt-3 font-bold text-rose-800">
                    No certificate document linked
                  </div>
                  <p className="mt-1 text-sm text-rose-700">
                    A document should normally be linked before approval.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {item.documents.map((document) => (
                    <a
                      key={document.id}
                      href={document.sharepoint_web_url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900">
                          {document.file_name || "Certificate document"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Added {formatDateTime(document.created_at)}
                        </div>
                      </div>
                      <ExternalLink size={17} className="text-slate-400" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </section>

          {item.duplicateRecords.length > 0 ? (
            <section>
              <h3 className="text-lg font-bold text-slate-950">
                Possible Existing Records
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Review these before creating another current record.
              </p>

              <div className="mt-4 space-y-3">
                {item.duplicateRecords.slice(0, 8).map((duplicate) => (
                  <div
                    key={duplicate.id}
                    className="rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {duplicate.training_name ||
                            item.trainingType?.name ||
                            "Training record"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Certificate{" "}
                          {duplicate.certificate_number || "not set"} · Issue{" "}
                          {formatDate(duplicate.issue_date)}
                        </div>
                      </div>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(
                          duplicate.record_status,
                        )}`}
                      >
                        {clean(duplicate.record_status).replaceAll("_", " ")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {item.course ? (
            <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <ClipboardCheck size={20} className="mt-0.5 text-blue-700" />
                <div>
                  <div className="font-bold text-blue-900">
                    Linked course: {item.course.title}
                  </div>
                  <div className="mt-1 text-sm text-blue-800">
                    {formatDateTime(item.course.start_at)} · Result{" "}
                    {item.courseAttendee?.result_status || "not set"}
                  </div>
                  <Link
                    href="/people/training/courses"
                    className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-900"
                  >
                    Open course management
                    <ChevronRight size={14} />
                  </Link>
                </div>
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="text-lg font-bold text-slate-950">
              Review Notes
            </h3>
            <textarea
              value={reviewNotes}
              onChange={(event) => setReviewNotes(event.target.value)}
              rows={4}
              placeholder="Record any verification notes, corrections or follow-up required..."
              className="mt-3 w-full rounded-2xl border border-slate-200 p-3 text-sm outline-none ring-slate-200 focus:ring-2"
            />

            <button
              type="button"
              onClick={onSaveNotes}
              disabled={saving}
              className="mt-3 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Save Notes
            </button>
          </section>

          <section className="sticky bottom-0 flex flex-col gap-2 border-t border-slate-200 bg-white pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onReject}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            >
              <XCircle size={16} />
              Reject
            </button>

            <button
              type="button"
              onClick={onApprove}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <CheckCircle2 size={16} />
              )}
              Approve Record
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function RejectModal({
  reason,
  setReason,
  saving,
  count,
  onClose,
  onConfirm,
}: {
  reason: string;
  setReason: (value: string) => void;
  saving: boolean;
  count: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              Reject Training Record{count === 1 ? "" : "s"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {count} selected record{count === 1 ? "" : "s"} will be marked
              rejected.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
          >
            <X size={19} />
          </button>
        </div>

        <div className="p-6">
          <label className="block">
            <div className="mb-2 text-sm font-semibold text-slate-700">
              Rejection reason
            </div>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={5}
              placeholder="Explain what is missing, incorrect or needs to be resubmitted..."
              className="w-full rounded-2xl border border-slate-200 p-3 text-sm outline-none ring-slate-200 focus:ring-2"
            />
          </label>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <XCircle size={16} />
              )}
              Reject
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
}: {
  label: string;
  value: number;
  detail: string;
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
          <div className="mt-1 text-xs text-slate-500">{detail}</div>
        </div>

        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
          {icon}
        </div>
      </div>
    </div>
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

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Filter,
  HardHat,
  History,
  LayoutDashboard,
  Library,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Upload,
  Users,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type TrainingStatus = "current" | "expiring" | "expired" | "missing";

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
  active: boolean | null;
};

type TrainingType = {
  id: string;
  name: string;
  category: string | null;
  default_expiry_months: number | null;
  does_not_expire: boolean | null;
  active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type TrainingRecord = {
  id: string;
  employee_id: string;
  training_type_id: string | null;
  training_name: string;
  category: string | null;
  certificate_number: string | null;
  class_codes: string[] | null;
  provider: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  does_not_expire: boolean | null;
  notes: string | null;
  sharepoint_item_id: string | null;
  sharepoint_drive_id: string | null;
  sharepoint_web_url: string | null;
  sharepoint_file_name: string | null;
  status: string | null;
  supersedes_record_id: string | null;
  superseded_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  uploaded_by: string | null;
};

type RecordForm = {
  employeeId: string;
  trainingTypeId: string;
  trainingName: string;
  category: string;
  certificateNumber: string;
  classCodes: string;
  provider: string;
  issueDate: string;
  expiryDate: string;
  doesNotExpire: boolean;
  notes: string;
  sharepointWebUrl: string;
  sharepointFileName: string;
};

type TrainingTypeForm = {
  name: string;
  category: string;
  defaultExpiryMonths: string;
  doesNotExpire: boolean;
  active: boolean;
};

const EMPTY_RECORD_FORM: RecordForm = {
  employeeId: "",
  trainingTypeId: "",
  trainingName: "",
  category: "",
  certificateNumber: "",
  classCodes: "",
  provider: "",
  issueDate: "",
  expiryDate: "",
  doesNotExpire: false,
  notes: "",
  sharepointWebUrl: "",
  sharepointFileName: "",
};

const EMPTY_TYPE_FORM: TrainingTypeForm = {
  name: "",
  category: "",
  defaultExpiryMonths: "",
  doesNotExpire: false,
  active: true,
};

const DEFAULT_CATEGORIES = [
  "High Risk Licence",
  "VOC",
  "General Training",
  "Medical / First Aid",
  "Client Requirement",
  "Internal Competency",
  "Driver Licence",
  "Plant / Equipment",
  "Site Induction",
  "Other",
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function csvSafe(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
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

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
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

function daysUntil(value?: string | null) {
  const date = parseDate(value);
  if (!date) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function calculateStatus(record: TrainingRecord): TrainingStatus {
  if (record.does_not_expire) {
    return record.sharepoint_web_url ? "current" : "missing";
  }

  if (!record.expiry_date) return "missing";

  const days = daysUntil(record.expiry_date);
  if (days === null) return "missing";
  if (days < 0) return "expired";
  if (days <= 60) return "expiring";

  return "current";
}

function statusLabel(status: TrainingStatus) {
  if (status === "current") return "Current";
  if (status === "expiring") return "Expiring";
  if (status === "expired") return "Expired";
  return "Missing details";
}

function statusClasses(status: TrainingStatus) {
  if (status === "current") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "expiring") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (status === "expired") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function classCodesArray(value: string) {
  return value
    .split(/[,;\n]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function addMonthsToDate(dateValue: string, months: number | null) {
  if (!dateValue || !months || months <= 0) return "";

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

export default function TrainingRegisterPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [records, setRecords] = useState<TrainingRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingRecord, setSavingRecord] = useState(false);
  const [savingType, setSavingType] = useState(false);
  const [togglingTypeId, setTogglingTypeId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TrainingStatus>(
    "all",
  );
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [crewFilter, setCrewFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [documentFilter, setDocumentFilter] = useState<
    "all" | "attached" | "missing"
  >("all");

  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TrainingRecord | null>(
    null,
  );
  const [recordForm, setRecordForm] = useState<RecordForm>(EMPTY_RECORD_FORM);

  const [typeManagerOpen, setTypeManagerOpen] = useState(false);
  const [typeEditorOpen, setTypeEditorOpen] = useState(false);
  const [editingType, setEditingType] = useState<TrainingType | null>(null);
  const [typeForm, setTypeForm] = useState<TrainingTypeForm>(EMPTY_TYPE_FORM);
  const [typeSearch, setTypeSearch] = useState("");
  const [typeStatusFilter, setTypeStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );

  const crewById = useMemo(
    () => new Map(crews.map((crew) => [crew.id, crew])),
    [crews],
  );

  const loadData = useCallback(async () => {
    const [employeeResult, crewResult, typeResult, recordResult] =
      await Promise.all([
        supabase
          .from("employees")
          .select("id, full_name, role, crew_id, active")
          .order("full_name"),
        supabase
          .from("crews")
          .select("id, crew_number, crew_name, active")
          .order("crew_number"),
        supabase
          .from("training_types")
          .select(
            "id, name, category, default_expiry_months, does_not_expire, active, created_at, updated_at",
          )
          .order("category")
          .order("name"),
        supabase
          .from("employee_training_records")
          .select(
            "id, employee_id, training_type_id, training_name, category, certificate_number, class_codes, provider, issue_date, expiry_date, does_not_expire, notes, sharepoint_item_id, sharepoint_drive_id, sharepoint_web_url, sharepoint_file_name, status, supersedes_record_id, superseded_at, created_at, updated_at, uploaded_by",
          )
          .is("superseded_at", null)
          .order("expiry_date", { ascending: true, nullsFirst: false }),
      ]);

    if (employeeResult.error) throw new Error(employeeResult.error.message);
    if (crewResult.error) throw new Error(crewResult.error.message);
    if (typeResult.error) throw new Error(typeResult.error.message);
    if (recordResult.error) throw new Error(recordResult.error.message);

    setEmployees((employeeResult.data ?? []) as Employee[]);
    setCrews((crewResult.data ?? []) as Crew[]);
    setTrainingTypes((typeResult.data ?? []) as TrainingType[]);
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
                : "Unable to load the training register.",
          });
        } finally {
          setLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  async function refreshData() {
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
            : "Unable to refresh the training register.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.active !== false),
    [employees],
  );

  const categories = useMemo(() => {
    const values = new Set<string>(DEFAULT_CATEGORIES);

    trainingTypes.forEach((type) => {
      if (clean(type.category)) values.add(clean(type.category));
    });

    records.forEach((record) => {
      if (clean(record.category)) values.add(clean(record.category));
    });

    return [...values].sort();
  }, [records, trainingTypes]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    return records.filter((record) => {
      const employee = employeeById.get(record.employee_id);
      if (!employee || employee.active === false) return false;

      const crew = employee.crew_id
        ? crewById.get(employee.crew_id)
        : undefined;
      const status = calculateStatus(record);
      const hasDocument = Boolean(record.sharepoint_web_url);

      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (employeeFilter !== "all" && record.employee_id !== employeeFilter) {
        return false;
      }

      if (crewFilter === "unassigned" && employee.crew_id) return false;
      if (
        crewFilter !== "all" &&
        crewFilter !== "unassigned" &&
        employee.crew_id !== crewFilter
      ) {
        return false;
      }

      if (
        categoryFilter !== "all" &&
        clean(record.category) !== categoryFilter
      ) {
        return false;
      }

      if (documentFilter === "attached" && !hasDocument) return false;
      if (documentFilter === "missing" && hasDocument) return false;

      if (!query) return true;

      return [
        employee.full_name,
        employee.role,
        crewLabel(crew),
        record.training_name,
        record.category,
        record.certificate_number,
        record.provider,
        record.class_codes?.join(" "),
        record.notes,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [
    categoryFilter,
    crewById,
    crewFilter,
    documentFilter,
    employeeById,
    employeeFilter,
    records,
    search,
    statusFilter,
  ]);

  const filteredTrainingTypes = useMemo(() => {
    const query = typeSearch.trim().toLowerCase();

    return trainingTypes.filter((type) => {
      const active = type.active !== false;

      if (typeStatusFilter === "active" && !active) return false;
      if (typeStatusFilter === "inactive" && active) return false;

      if (!query) return true;

      return [type.name, type.category, type.default_expiry_months]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [trainingTypes, typeSearch, typeStatusFilter]);

  const currentCount = records.filter(
    (record) =>
      employeeById.get(record.employee_id)?.active !== false &&
      calculateStatus(record) === "current",
  ).length;

  const expiringCount = records.filter(
    (record) =>
      employeeById.get(record.employee_id)?.active !== false &&
      calculateStatus(record) === "expiring",
  ).length;

  const expiredCount = records.filter(
    (record) =>
      employeeById.get(record.employee_id)?.active !== false &&
      calculateStatus(record) === "expired",
  ).length;

  const missingDocumentCount = records.filter(
    (record) =>
      employeeById.get(record.employee_id)?.active !== false &&
      !record.sharepoint_web_url,
  ).length;

  function openCreateRecord() {
    setEditingRecord(null);
    setRecordForm(EMPTY_RECORD_FORM);
    setRecordModalOpen(true);
    setMessage(null);
  }

  function openEditRecord(record: TrainingRecord) {
    setEditingRecord(record);
    setRecordForm({
      employeeId: record.employee_id,
      trainingTypeId: clean(record.training_type_id),
      trainingName: clean(record.training_name),
      category: clean(record.category),
      certificateNumber: clean(record.certificate_number),
      classCodes: (record.class_codes ?? []).join(", "),
      provider: clean(record.provider),
      issueDate: clean(record.issue_date),
      expiryDate: clean(record.expiry_date),
      doesNotExpire: Boolean(record.does_not_expire),
      notes: clean(record.notes),
      sharepointWebUrl: clean(record.sharepoint_web_url),
      sharepointFileName: clean(record.sharepoint_file_name),
    });
    setRecordModalOpen(true);
    setMessage(null);
  }

  function closeRecordModal() {
    if (savingRecord) return;
    setRecordModalOpen(false);
    setEditingRecord(null);
    setRecordForm(EMPTY_RECORD_FORM);
  }

  function applyTrainingType(trainingTypeId: string) {
    const selectedType = trainingTypes.find(
      (type) => type.id === trainingTypeId,
    );

    setRecordForm((current) => {
      const expiryDate = selectedType?.does_not_expire
        ? ""
        : current.issueDate && selectedType?.default_expiry_months
          ? addMonthsToDate(
              current.issueDate,
              selectedType.default_expiry_months,
            )
          : current.expiryDate;

      return {
        ...current,
        trainingTypeId,
        trainingName: selectedType?.name ?? current.trainingName,
        category: selectedType?.category ?? current.category,
        doesNotExpire: Boolean(selectedType?.does_not_expire),
        expiryDate,
      };
    });
  }

  function updateIssueDate(issueDate: string) {
    const selectedType = trainingTypes.find(
      (type) => type.id === recordForm.trainingTypeId,
    );

    setRecordForm((current) => ({
      ...current,
      issueDate,
      expiryDate:
        !current.doesNotExpire && selectedType?.default_expiry_months
          ? addMonthsToDate(issueDate, selectedType.default_expiry_months)
          : current.expiryDate,
    }));
  }

  async function saveRecord() {
    setMessage(null);

    if (!recordForm.employeeId) {
      setMessage({ tone: "error", text: "Select an employee." });
      return;
    }

    if (!recordForm.trainingName.trim()) {
      setMessage({
        tone: "error",
        text: "Enter a certificate or licence name.",
      });
      return;
    }

    if (!recordForm.doesNotExpire && !recordForm.expiryDate) {
      setMessage({
        tone: "error",
        text: "Enter an expiry date or select Does not expire.",
      });
      return;
    }

    setSavingRecord(true);

    const payload = {
      employee_id: recordForm.employeeId,
      training_type_id: recordForm.trainingTypeId || null,
      training_name: recordForm.trainingName.trim(),
      category: recordForm.category.trim() || null,
      certificate_number: recordForm.certificateNumber.trim() || null,
      class_codes: classCodesArray(recordForm.classCodes),
      provider: recordForm.provider.trim() || null,
      issue_date: recordForm.issueDate || null,
      expiry_date: recordForm.doesNotExpire
        ? null
        : recordForm.expiryDate || null,
      does_not_expire: recordForm.doesNotExpire,
      notes: recordForm.notes.trim() || null,
      sharepoint_web_url: recordForm.sharepointWebUrl.trim() || null,
      sharepoint_file_name: recordForm.sharepointFileName.trim() || null,
      status: null,
      updated_at: new Date().toISOString(),
    };

    try {
      const result = editingRecord
        ? await supabase
            .from("employee_training_records")
            .update(payload)
            .eq("id", editingRecord.id)
        : await supabase.from("employee_training_records").insert(payload);

      if (result.error) throw new Error(result.error.message);

      await loadData();
      closeRecordModal();
      setMessage({
        tone: "success",
        text: editingRecord
          ? "Training record updated."
          : "Training record added.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to save the training record.",
      });
    } finally {
      setSavingRecord(false);
    }
  }

  function openCreateType() {
    setEditingType(null);
    setTypeForm(EMPTY_TYPE_FORM);
    setTypeEditorOpen(true);
    setMessage(null);
  }

  function openEditType(type: TrainingType) {
    setEditingType(type);
    setTypeForm({
      name: type.name,
      category: clean(type.category),
      defaultExpiryMonths:
        type.default_expiry_months === null
          ? ""
          : String(type.default_expiry_months),
      doesNotExpire: Boolean(type.does_not_expire),
      active: type.active !== false,
    });
    setTypeEditorOpen(true);
    setMessage(null);
  }

  function closeTypeEditor() {
    if (savingType) return;
    setTypeEditorOpen(false);
    setEditingType(null);
    setTypeForm(EMPTY_TYPE_FORM);
  }

  async function saveTrainingType() {
    setMessage(null);

    const name = typeForm.name.trim();
    if (!name) {
      setMessage({ tone: "error", text: "Enter a training type name." });
      return;
    }

    const duplicate = trainingTypes.some(
      (type) =>
        type.id !== editingType?.id &&
        type.name.trim().toLowerCase() === name.toLowerCase(),
    );

    if (duplicate) {
      setMessage({
        tone: "error",
        text: "A training type with this name already exists.",
      });
      return;
    }

    const expiryMonths = typeForm.doesNotExpire
      ? null
      : typeForm.defaultExpiryMonths
        ? Number(typeForm.defaultExpiryMonths)
        : null;

    if (
      expiryMonths !== null &&
      (!Number.isInteger(expiryMonths) || expiryMonths <= 0)
    ) {
      setMessage({
        tone: "error",
        text: "Default expiry months must be a whole number greater than zero.",
      });
      return;
    }

    setSavingType(true);

    const payload = {
      name,
      category: typeForm.category.trim() || null,
      default_expiry_months: expiryMonths,
      does_not_expire: typeForm.doesNotExpire,
      active: typeForm.active,
      updated_at: new Date().toISOString(),
    };

    try {
      const result = editingType
        ? await supabase
            .from("training_types")
            .update(payload)
            .eq("id", editingType.id)
        : await supabase.from("training_types").insert(payload);

      if (result.error) throw new Error(result.error.message);

      await loadData();
      closeTypeEditor();
      setMessage({
        tone: "success",
        text: editingType
          ? `${name} was updated.`
          : `${name} was added to the training type library.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to save the training type.",
      });
    } finally {
      setSavingType(false);
    }
  }

  async function toggleTrainingType(type: TrainingType) {
    setTogglingTypeId(type.id);
    setMessage(null);

    const nextActive = type.active === false;

    try {
      const { error } = await supabase
        .from("training_types")
        .update({
          active: nextActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", type.id);

      if (error) throw new Error(error.message);

      await loadData();
      setMessage({
        tone: "success",
        text: `${type.name} is now ${nextActive ? "active" : "inactive"}.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to update the training type.",
      });
    } finally {
      setTogglingTypeId(null);
    }
  }

  function exportRegister() {
    const headers = [
      "Employee",
      "Position",
      "Crew",
      "Certificate / Licence",
      "Category",
      "Certificate Number",
      "Classes",
      "Provider",
      "Issue Date",
      "Expiry Date",
      "Days Remaining",
      "Status",
      "SharePoint Document",
    ];

    const rows = filteredRecords.map((record) => {
      const employee = employeeById.get(record.employee_id);
      const crew = employee?.crew_id
        ? crewById.get(employee.crew_id)
        : undefined;
      const status = calculateStatus(record);
      const days = record.does_not_expire
        ? "Does not expire"
        : daysUntil(record.expiry_date);

      return [
        employee?.full_name ?? "",
        employee?.role ?? "",
        crewLabel(crew),
        record.training_name,
        record.category,
        record.certificate_number,
        record.class_codes?.join(", "),
        record.provider,
        record.issue_date,
        record.does_not_expire ? "Does not expire" : record.expiry_date,
        days ?? "",
        statusLabel(status),
        record.sharepoint_web_url,
      ];
    });

    const csv = [
      headers.map(csvSafe).join(","),
      ...rows.map((row) => row.map(csvSafe).join(",")),
    ].join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `training-register-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();

    URL.revokeObjectURL(url);
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
                <ShieldCheck size={18} />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Workforce Compliance
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Training Register
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Track certificates, licences, VOCs and expiry dates. Create new
                training types directly from this page whenever the business
                needs to track something new.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refreshData()}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw
                  size={16}
                  className={refreshing ? "animate-spin" : ""}
                />
                Refresh
              </button>

              <button
                type="button"
                onClick={exportRegister}
                disabled={filteredRecords.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                <Download size={16} />
                Export CSV
              </button>

              <button
                type="button"
                onClick={() => setTypeManagerOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                <Library size={16} />
                Manage Types
              </button>

              <button
                type="button"
                onClick={openCreateRecord}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                <Plus size={16} />
                Add Record
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-slate-400">
                <LayoutDashboard size={17} />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Training Management
                </span>
              </div>
              <h2 className="mt-2 text-xl font-bold text-slate-950">
                Training tools
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                Open role rules, project mobilisation checks, renewals, course
                planning and verification from one place.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <TrainingModuleCard
              href="/people/training/requirements"
              title="Role Requirements"
              description="Define mandatory and recommended training for each employee role."
              icon={<Settings2 size={20} />}
              tone="violet"
            />
            <TrainingModuleCard
              href="/people/training/project-compliance"
              title="Project Compliance"
              description="Check mobilisation readiness, blockers and crew compliance by project."
              icon={<ShieldCheck size={20} />}
              tone="emerald"
            />
            <TrainingModuleCard
              href="/people/training/renewals"
              title="Renewals"
              description="Action expired, expiring, missing and unverified training records."
              icon={<CalendarClock size={20} />}
              tone="amber"
            />
            <TrainingModuleCard
              href="/people/training/project-requirements"
              title="Project Requirements"
              description="Configure inductions, licences and competencies unique to each project."
              icon={<ListChecks size={20} />}
              tone="blue"
            />
            <TrainingModuleCard
              href="/people/training/dashboard"
              title="Training Dashboard"
              description="View company-wide compliance, project risk and management KPIs."
              icon={<LayoutDashboard size={20} />}
              tone="slate"
            />
            <TrainingModuleCard
              href="/people/training/courses"
              title="Courses"
              description="Create training sessions, assign personnel and complete attendance."
              icon={<BookOpenCheck size={20} />}
              tone="blue"
            />
            <TrainingModuleCard
              href="/people/training/calendar"
              title="Training Calendar"
              description="See upcoming courses, trainers, locations, capacity and bookings."
              icon={<CalendarDays size={20} />}
              tone="amber"
            />
            <TrainingModuleCard
              href="/people/training/verification"
              title="Verification Queue"
              description="Review uploaded certificates and approve, reject or request clearer evidence."
              icon={<BadgeCheck size={20} />}
              tone="emerald"
            />
            <TrainingModuleCard
              href="/people/training/history"
              title="Training History"
              description="Review the complete chronological training history for each employee."
              icon={<History size={20} />}
              tone="violet"
            />
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            label="Active people"
            value={String(activeEmployees.length)}
            detail="Included in register"
            icon={<Users size={20} />}
          />
          <KpiCard
            label="Current"
            value={String(currentCount)}
            detail="More than 60 days"
            icon={<CheckCircle2 size={20} />}
          />
          <KpiCard
            label="Expiring"
            value={String(expiringCount)}
            detail="Within 60 days"
            icon={<CalendarClock size={20} />}
            tone={expiringCount > 0 ? "amber" : "default"}
          />
          <KpiCard
            label="Expired"
            value={String(expiredCount)}
            detail="Requires action"
            icon={<AlertTriangle size={20} />}
            tone={expiredCount > 0 ? "rose" : "default"}
          />
          <KpiCard
            label="Missing document"
            value={String(missingDocumentCount)}
            detail="No SharePoint link"
            icon={<FileText size={20} />}
            tone={missingDocumentCount > 0 ? "amber" : "default"}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-slate-500">
            <Filter size={17} />
            <span className="text-sm font-semibold">Filters</span>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_220px_200px_220px_190px]">
            <label className="relative block">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search employee, certificate, number or class..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </label>

            <SelectField
              value={statusFilter}
              onChange={(value) =>
                setStatusFilter(value as "all" | TrainingStatus)
              }
              options={[
                { value: "all", label: "All statuses" },
                { value: "current", label: "Current" },
                { value: "expiring", label: "Expiring" },
                { value: "expired", label: "Expired" },
                { value: "missing", label: "Missing details" },
              ]}
            />

            <SelectField
              value={employeeFilter}
              onChange={setEmployeeFilter}
              options={[
                { value: "all", label: "All employees" },
                ...activeEmployees.map((employee) => ({
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
              value={documentFilter}
              onChange={(value) =>
                setDocumentFilter(value as "all" | "attached" | "missing")
              }
              options={[
                { value: "all", label: "All documents" },
                { value: "attached", label: "Document attached" },
                { value: "missing", label: "Document missing" },
              ]}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Certificate & Licence Register
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {filteredRecords.length} record
                {filteredRecords.length === 1 ? "" : "s"} shown
              </p>
            </div>

            <div className="text-xs font-medium text-slate-400">
              Statuses are calculated automatically from expiry dates.
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-64 items-center justify-center">
              <Loader2 size={26} className="animate-spin text-slate-400" />
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="p-10 text-center">
              <HardHat size={32} className="mx-auto text-slate-300" />
              <h3 className="mt-4 text-lg font-bold text-slate-900">
                No training records found
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Add a record or create a new training type first.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredRecords.map((record) => {
                const employee = employeeById.get(record.employee_id);
                if (!employee) return null;

                const crew = employee.crew_id
                  ? crewById.get(employee.crew_id)
                  : undefined;

                return (
                  <TrainingRow
                    key={record.id}
                    record={record}
                    employee={employee}
                    crew={crew}
                    onEdit={() => openEditRecord(record)}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>

      {recordModalOpen ? (
        <TrainingRecordModal
          form={recordForm}
          setForm={setRecordForm}
          editingRecord={editingRecord}
          employees={activeEmployees}
          trainingTypes={trainingTypes.filter(
            (type) =>
              type.active !== false || type.id === recordForm.trainingTypeId,
          )}
          categories={categories}
          saving={savingRecord}
          onTrainingTypeChange={applyTrainingType}
          onIssueDateChange={updateIssueDate}
          onClose={closeRecordModal}
          onSave={() => void saveRecord()}
          onOpenTypeManager={() => {
            setRecordModalOpen(false);
            setTypeManagerOpen(true);
          }}
        />
      ) : null}

      {typeManagerOpen ? (
        <TrainingTypeManagerModal
          trainingTypes={filteredTrainingTypes}
          search={typeSearch}
          statusFilter={typeStatusFilter}
          togglingTypeId={togglingTypeId}
          onSearchChange={setTypeSearch}
          onStatusFilterChange={setTypeStatusFilter}
          onClose={() => setTypeManagerOpen(false)}
          onCreate={openCreateType}
          onEdit={openEditType}
          onToggle={(type) => void toggleTrainingType(type)}
        />
      ) : null}

      {typeEditorOpen ? (
        <TrainingTypeEditorModal
          form={typeForm}
          setForm={setTypeForm}
          editingType={editingType}
          categories={categories}
          saving={savingType}
          onClose={closeTypeEditor}
          onSave={() => void saveTrainingType()}
        />
      ) : null}
    </AppShell>
  );
}

function TrainingRow({
  record,
  employee,
  crew,
  onEdit,
}: {
  record: TrainingRecord;
  employee: Employee;
  crew: Crew | undefined;
  onEdit: () => void;
}) {
  const status = calculateStatus(record);
  const days = record.does_not_expire ? null : daysUntil(record.expiry_date);

  return (
    <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.75fr)_minmax(0,0.75fr)_minmax(0,0.8fr)_auto] xl:items-center">
      <div className="min-w-0">
        <Link
          href={`/people/${employee.id}`}
          className="font-bold text-slate-950 hover:text-blue-700"
        >
          {employee.full_name}
        </Link>
        <p className="mt-1 text-sm text-slate-500">
          {employee.role || "Position not set"}
        </p>
        <p className="mt-1 text-xs text-slate-400">{crewLabel(crew)}</p>
      </div>

      <div>
        <div className="font-bold text-slate-900">{record.training_name}</div>
        <div className="mt-1 text-sm text-slate-500">
          {record.category || "Uncategorised"}
        </div>

        {record.class_codes?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {record.class_codes.map((code) => (
              <span
                key={`${record.id}-${code}`}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
              >
                {code}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Number
        </div>
        <div className="mt-2 text-sm font-semibold text-slate-700">
          {record.certificate_number || "Not set"}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Expiry
        </div>
        <div className="mt-2 text-sm font-semibold text-slate-700">
          {record.does_not_expire
            ? "Does not expire"
            : formatDate(record.expiry_date)}
        </div>

        {!record.does_not_expire && days !== null ? (
          <div
            className={`mt-1 text-xs font-medium ${
              days < 0
                ? "text-rose-600"
                : days <= 60
                  ? "text-amber-700"
                  : "text-slate-400"
            }`}
          >
            {days < 0
              ? `${Math.abs(days)} days overdue`
              : `${days} days remaining`}
          </div>
        ) : null}
      </div>

      <div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(
            status,
          )}`}
        >
          {statusLabel(status)}
        </span>

        <div className="mt-2">
          {record.sharepoint_web_url ? (
            <a
              href={record.sharepoint_web_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900"
            >
              <ExternalLink size={13} />
              {record.sharepoint_file_name || "Open document"}
            </a>
          ) : (
            <span className="text-xs font-medium text-amber-700">
              No document attached
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 xl:justify-end">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Edit3 size={15} />
          Edit
        </button>

        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Upload size={15} />
          Renew
        </button>
      </div>
    </div>
  );
}

function TrainingRecordModal({
  form,
  setForm,
  editingRecord,
  employees,
  trainingTypes,
  categories,
  saving,
  onTrainingTypeChange,
  onIssueDateChange,
  onClose,
  onSave,
  onOpenTypeManager,
}: {
  form: RecordForm;
  setForm: React.Dispatch<React.SetStateAction<RecordForm>>;
  editingRecord: TrainingRecord | null;
  employees: Employee[];
  trainingTypes: TrainingType[];
  categories: string[];
  saving: boolean;
  onTrainingTypeChange: (trainingTypeId: string) => void;
  onIssueDateChange: (issueDate: string) => void;
  onClose: () => void;
  onSave: () => void;
  onOpenTypeManager: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
      <div className="my-auto w-full max-w-4xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              {editingRecord ? "Update Training Record" : "Add Training Record"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Store register details in TTTracker and link the supporting
              document from SharePoint.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-60"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <section>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
                  Certificate Details
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Select an existing type or create a new one from this page.
                </p>
              </div>

              <button
                type="button"
                onClick={onOpenTypeManager}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Library size={15} />
                Manage Training Types
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Employee">
                <SelectField
                  value={form.employeeId}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      employeeId: value,
                    }))
                  }
                  options={[
                    { value: "", label: "Select employee..." },
                    ...employees.map((employee) => ({
                      value: employee.id,
                      label: employee.full_name,
                    })),
                  ]}
                />
              </Field>

              <Field label="Training type">
                <SelectField
                  value={form.trainingTypeId}
                  onChange={onTrainingTypeChange}
                  options={[
                    { value: "", label: "Manual / other..." },
                    ...trainingTypes.map((type) => ({
                      value: type.id,
                      label: `${type.name}${
                        type.category ? ` — ${type.category}` : ""
                      }`,
                    })),
                  ]}
                />
              </Field>

              <Field label="Certificate / licence name">
                <input
                  value={form.trainingName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      trainingName: event.target.value,
                    }))
                  }
                  placeholder="e.g. EWP VOC"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </Field>

              <Field label="Category">
                <SelectField
                  value={form.category}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      category: value,
                    }))
                  }
                  options={[
                    { value: "", label: "Select category..." },
                    ...categories.map((category) => ({
                      value: category,
                      label: category,
                    })),
                  ]}
                />
              </Field>

              <Field label="Certificate / licence number">
                <input
                  value={form.certificateNumber}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      certificateNumber: event.target.value,
                    }))
                  }
                  placeholder="Optional"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </Field>

              <Field label="Classes / competencies">
                <input
                  value={form.classCodes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      classCodes: event.target.value,
                    }))
                  }
                  placeholder="e.g. DG, RB, RI, RA"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </Field>

              <Field label="Provider">
                <input
                  value={form.provider}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      provider: event.target.value,
                    }))
                  }
                  placeholder="Training provider"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </Field>

              <Field label="Issue date">
                <input
                  type="date"
                  value={form.issueDate}
                  onChange={(event) => onIssueDateChange(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </Field>

              <Field label="Expiry date">
                <input
                  type="date"
                  value={form.expiryDate}
                  disabled={form.doesNotExpire}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      expiryDate: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2 disabled:bg-slate-100"
                />
              </Field>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
                <input
                  type="checkbox"
                  checked={form.doesNotExpire}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      doesNotExpire: event.target.checked,
                      expiryDate: event.target.checked
                        ? ""
                        : current.expiryDate,
                    }))
                  }
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-900">
                    Does not expire
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    Use this where there is no fixed expiry date.
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-4">
              <Field label="Operational notes">
                <textarea
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  rows={3}
                  placeholder="Operational notes only"
                  className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex items-center gap-2 text-blue-900">
              <FileText size={18} />
              <h3 className="font-bold">SharePoint Document</h3>
            </div>

            <p className="mt-2 text-sm leading-6 text-blue-800">
              This version stores the SharePoint link only. Direct PDF upload
              will be connected through Microsoft Graph later.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="SharePoint document URL">
                <input
                  type="url"
                  value={form.sharepointWebUrl}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      sharepointWebUrl: event.target.value,
                    }))
                  }
                  placeholder="Paste SharePoint file link"
                  className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm outline-none ring-blue-200 focus:ring-2"
                />
              </Field>

              <Field label="File name">
                <input
                  value={form.sharepointFileName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      sharepointFileName: event.target.value,
                    }))
                  }
                  placeholder="e.g. EWP-VOC.pdf"
                  className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm outline-none ring-blue-200 focus:ring-2"
                />
              </Field>
            </div>
          </section>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {editingRecord ? "Save Changes" : "Add Record"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrainingTypeManagerModal({
  trainingTypes,
  search,
  statusFilter,
  togglingTypeId,
  onSearchChange,
  onStatusFilterChange,
  onClose,
  onCreate,
  onEdit,
  onToggle,
}: {
  trainingTypes: TrainingType[];
  search: string;
  statusFilter: "all" | "active" | "inactive";
  togglingTypeId: string | null;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: "all" | "active" | "inactive") => void;
  onClose: () => void;
  onCreate: () => void;
  onEdit: (type: TrainingType) => void;
  onToggle: (type: TrainingType) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
      <div className="my-auto w-full max-w-5xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-slate-400">
              <Library size={17} />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Training Type Library
              </span>
            </div>

            <h2 className="mt-2 text-xl font-bold text-slate-950">
              Manage Training Types
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Add any new licence, VOC, ticket, certificate or competency
              without changing the code or database structure.
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

        <div className="space-y-5 p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
              <label className="relative block">
                <Search
                  size={17}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Search training type or category..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </label>

              <SelectField
                value={statusFilter}
                onChange={(value) =>
                  onStatusFilterChange(value as "all" | "active" | "inactive")
                }
                options={[
                  { value: "all", label: "All types" },
                  { value: "active", label: "Active types" },
                  { value: "inactive", label: "Inactive types" },
                ]}
              />
            </div>

            <button
              type="button"
              onClick={onCreate}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Plus size={16} />
              Add Training Type
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            {trainingTypes.length === 0 ? (
              <div className="p-10 text-center">
                <Library size={30} className="mx-auto text-slate-300" />
                <h3 className="mt-4 font-bold text-slate-900">
                  No training types found
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Add the first type or adjust the current filters.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {trainingTypes.map((type) => {
                  const active = type.active !== false;

                  return (
                    <div
                      key={type.id}
                      className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_auto] lg:items-center"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-950">
                            {type.name}
                          </h3>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              active
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          {type.category || "Uncategorised"}
                        </p>
                      </div>

                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Default expiry
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-700">
                          {type.does_not_expire
                            ? "Does not expire"
                            : type.default_expiry_months
                              ? `${type.default_expiry_months} months`
                              : "No default"}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          New records
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-700">
                          {active ? "Available" : "Hidden"}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <button
                          type="button"
                          onClick={() => onEdit(type)}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Edit3 size={15} />
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => onToggle(type)}
                          disabled={togglingTypeId === type.id}
                          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
                            active
                              ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          }`}
                        >
                          {togglingTypeId === type.id ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : active ? (
                            <ToggleLeft size={15} />
                          ) : (
                            <ToggleRight size={15} />
                          )}
                          {active ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
            Deactivating a type does not remove historical employee records. It
            only hides the type from new-record dropdowns.
          </div>
        </div>
      </div>
    </div>
  );
}

function TrainingTypeEditorModal({
  form,
  setForm,
  editingType,
  categories,
  saving,
  onClose,
  onSave,
}: {
  form: TrainingTypeForm;
  setForm: React.Dispatch<React.SetStateAction<TrainingTypeForm>>;
  editingType: TrainingType | null;
  categories: string[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              {editingType ? "Edit Training Type" : "Add Training Type"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Define how this licence, certificate, VOC or competency behaves.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-60"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <Field label="Training type name">
            <input
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="e.g. EWP VOC"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <SelectField
                value={form.category}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    category: value,
                  }))
                }
                options={[
                  { value: "", label: "Select category..." },
                  ...categories.map((category) => ({
                    value: category,
                    label: category,
                  })),
                ]}
              />
            </Field>

            <Field label="Default expiry months">
              <input
                type="number"
                min={1}
                step={1}
                value={form.defaultExpiryMonths}
                disabled={form.doesNotExpire}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    defaultExpiryMonths: event.target.value,
                  }))
                }
                placeholder="e.g. 24"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2 disabled:bg-slate-100"
              />
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
            <input
              type="checkbox"
              checked={form.doesNotExpire}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  doesNotExpire: event.target.checked,
                  defaultExpiryMonths: event.target.checked
                    ? ""
                    : current.defaultExpiryMonths,
                }))
              }
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="block text-sm font-bold text-slate-900">
                Does not expire
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                New records using this type will not require an expiry date.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  active: event.target.checked,
                }))
              }
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="block text-sm font-bold text-slate-900">
                Active training type
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                Active types appear when adding new employee training records.
              </span>
            </span>
          </label>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {editingType ? "Save Changes" : "Add Training Type"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrainingModuleCard({
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
  tone: "slate" | "blue" | "emerald" | "amber" | "violet";
}) {
  const iconClasses =
    tone === "blue"
      ? "bg-blue-100 text-blue-700"
      : tone === "emerald"
        ? "bg-emerald-100 text-emerald-700"
        : tone === "amber"
          ? "bg-amber-100 text-amber-800"
          : tone === "violet"
            ? "bg-violet-100 text-violet-700"
            : "bg-slate-100 text-slate-700";

  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClasses}`}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold text-slate-950">{title}</h3>
            <ExternalLink
              size={15}
              className="shrink-0 text-slate-300 transition group-hover:text-slate-700"
            />
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>
    </Link>
  );
}

function KpiCard({
  label,
  value,
  detail,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone?: "default" | "amber" | "rose";
}) {
  const classes =
    tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50"
        : "border-slate-200 bg-white";

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${classes}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-500">{label}</div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            {value}
          </div>
          <div className="mt-1 text-xs text-slate-400">{detail}</div>
        </div>

        <div className="rounded-xl bg-white/70 p-2.5 text-slate-700">
          {icon}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-800">
        {label}
      </span>
      {children}
    </label>
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

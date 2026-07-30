"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  UploadCloud,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type ValidityMode = "never" | "manual" | "automatic";
type ValidityUnit = "days" | "weeks" | "months" | "years";
type SubtypeMode = "none" | "single" | "multiple";
type FilenameDateField = "none" | "issue_date" | "expiry_date";
type ReplaceChoice = "replace" | "add" | "cancel" | null;

type Employee = {
  id: string;
  payrollId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  active: boolean;
};

type Project = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

type TrainingType = {
  id: string;
  category_id: string | null;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  requires_issue_date: boolean;
  requires_expiry_date: boolean;
  requires_certificate_number: boolean;
  requires_issuer: boolean;
  requires_project: boolean;
  requires_document: boolean;
  allows_multiple_current: boolean;
  subtype_mode: SubtypeMode;
  validity_mode: ValidityMode;
  validity_interval_value: number | null;
  validity_interval_unit: ValidityUnit | null;
  filename_date_field: FilenameDateField;
  filename_components: string[];
  sort_order: number;
};

type TrainingOption = {
  id: string;
  training_type_id: string;
  name: string;
  code: string;
  description: string | null;
  sort_order: number;
  active: boolean;
};

type ExistingRecord = {
  id: string;
  certificate_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  status: string | null;
  option_codes: string[];
};

type FormState = {
  employeeId: string;
  trainingTypeId: string;
  selectedOptionIds: string[];
  projectId: string;
  issuer: string;
  certificateNumber: string;
  issueDate: string;
  expiryDate: string;
  notes: string;
  file: File | null;
};

type Message = {
  tone: "success" | "error";
  text: string;
};

const EMPTY_FORM: FormState = {
  employeeId: "",
  trainingTypeId: "",
  selectedOptionIds: [],
  projectId: "",
  issuer: "",
  certificateNumber: "",
  issueDate: "",
  expiryDate: "",
  notes: "",
  file: null,
};

const clean = (value: unknown) => String(value ?? "").trim();

function firstNonEmpty(
  row: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = clean(row[key]);
    if (value) return value;
  }
  return "";
}

function toBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return fallback;
  return !["false", "0", "inactive", "archived"].includes(
    String(value).toLowerCase(),
  );
}

function normaliseEmployee(row: Record<string, unknown>): Employee {
  const firstName = firstNonEmpty(row, [
    "first_name",
    "firstname",
    "given_name",
    "givenName",
  ]);
  const lastName = firstNonEmpty(row, [
    "last_name",
    "lastname",
    "surname",
    "family_name",
    "familyName",
  ]);
  const storedName = firstNonEmpty(row, [
    "full_name",
    "name",
    "display_name",
    "displayName",
  ]);
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") ||
    storedName ||
    "Unnamed employee";

  return {
    id: clean(row.id),
    payrollId:
      firstNonEmpty(row, [
        "payroll_id",
        "employee_id",
        "employee_code",
        "employee_number",
        "staff_id",
        "code",
      ]) || "",
    firstName:
      firstName || storedName.split(/\s+/).slice(0, -1).join(" "),
    lastName:
      lastName || storedName.split(/\s+/).slice(-1).join(""),
    displayName,
    active: toBoolean(row.active ?? row.is_active ?? row.status, true),
  };
}

function normaliseProject(row: Record<string, unknown>): Project {
  return {
    id: clean(row.id),
    code:
      firstNonEmpty(row, [
        "project_code",
        "code",
        "project_number",
        "job_number",
      ]) || "PROJECT",
    name:
      firstNonEmpty(row, ["name", "project_name", "title"]) ||
      "Unnamed project",
    active: toBoolean(row.active ?? row.is_active ?? row.status, true),
  };
}

function normaliseFilenameComponents(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [
      "employee_id",
      "employee_name",
      "record_code",
      "option_code",
      "project_code",
      "expiry_date",
    ];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function addInterval(
  issueDate: string,
  value: number | null,
  unit: ValidityUnit | null,
): string {
  if (!issueDate || !value || !unit) return "";

  const [year, month, day] = issueDate.split("-").map(Number);
  if (!year || !month || !day) return "";

  const date = new Date(Date.UTC(year, month - 1, day));

  if (unit === "days") date.setUTCDate(date.getUTCDate() + value);
  if (unit === "weeks") date.setUTCDate(date.getUTCDate() + value * 7);
  if (unit === "months") date.setUTCMonth(date.getUTCMonth() + value);
  if (unit === "years") date.setUTCFullYear(date.getUTCFullYear() + value);

  return date.toISOString().slice(0, 10);
}

function safeFilenamePart(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/&/g, "AND")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function employeeFilenameName(employee: Employee | null): string {
  if (!employee) return "SURNAME_FIRSTNAME";

  const surname = safeFilenamePart(employee.lastName || "SURNAME");
  const firstName = safeFilenamePart(employee.firstName || "FIRSTNAME");

  return `${surname}_${firstName}`;
}

function buildFilename(params: {
  employee: Employee | null;
  trainingType: TrainingType | null;
  selectedOptions: TrainingOption[];
  project: Project | null;
  issueDate: string;
  expiryDate: string;
  originalFile: File | null;
}): string {
  const {
    employee,
    trainingType,
    selectedOptions,
    project,
    issueDate,
    expiryDate,
    originalFile,
  } = params;

  const extension =
    originalFile?.name.split(".").pop()?.toLowerCase() || "pdf";

  if (!trainingType) {
    return `EMP###_SURNAME_FIRSTNAME_RECORD_CODE.${extension}`;
  }

  const values: Record<string, string> = {
    employee_id: safeFilenamePart(employee?.payrollId || "PAYROLL"),
    employee_name: employeeFilenameName(employee),
    record_code: safeFilenamePart(trainingType.code || "RECORD_CODE"),
    option_code: selectedOptions
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((option) => safeFilenamePart(option.code))
      .filter(Boolean)
      .join("-"),
    project_code: project ? safeFilenamePart(project.code) : "",
    issue_date:
      trainingType.filename_date_field === "issue_date" ? issueDate : "",
    expiry_date:
      trainingType.filename_date_field === "expiry_date" ? expiryDate : "",
    document_side: "",
  };

  const configured = normaliseFilenameComponents(
    trainingType.filename_components,
  );

  const components = [
    "employee_id",
    "employee_name",
    "record_code",
    trainingType.subtype_mode === "none" ? null : "option_code",
    trainingType.requires_project ? "project_code" : null,
    trainingType.filename_date_field === "issue_date" ? "issue_date" : null,
    trainingType.filename_date_field === "expiry_date"
      ? "expiry_date"
      : null,
    "document_side",
  ].filter((item): item is string => Boolean(item));

  const ordered = configured.filter((item) => components.includes(item));

  for (const item of components) {
    if (!ordered.includes(item)) ordered.push(item);
  }

  const parts = ordered
    .map((component) => values[component] || "")
    .filter(Boolean);

  return `${parts.join("_")}.${extension}`;
}

function formatDate(value: string | null): string {
  if (!value) return "No date";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function optionCodesFromRecord(row: Record<string, unknown>): string[] {
  const candidates = [
    row.option_codes,
    row.class_codes,
    row.licence_classes,
    row.selected_options,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((item) => clean(item)).filter(Boolean);
    }

    if (typeof candidate === "string" && candidate.trim()) {
      return candidate
        .split(/[,\s]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

export default function NewTrainingRecordPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [options, setOptions] = useState<TrainingOption[]>([]);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const [existingRecords, setExistingRecords] = useState<ExistingRecord[]>([]);
  const [replaceChoice, setReplaceChoice] = useState<ReplaceChoice>(null);
  const [replaceRecordId, setReplaceRecordId] = useState("");

  const loadReferenceData = useCallback(async () => {
    const [employeeResult, projectResult, typeResult, optionResult] =
      await Promise.all([
        supabase.from("employees").select("*"),
        supabase.from("projects").select("*"),
        supabase
          .from("training_types")
          .select(
            "id, category_id, name, code:short_code, description, active, requires_issue_date, requires_expiry_date, requires_certificate_number, requires_issuer, requires_project, requires_document, allows_multiple_current, subtype_mode, validity_mode, validity_interval_value, validity_interval_unit, filename_date_field, filename_components, sort_order",
          )
          .eq("active", true)
          .order("sort_order")
          .order("name"),
        supabase
          .from("training_type_options")
          .select(
            "id, training_type_id, name, code, description, sort_order, active",
          )
          .eq("active", true)
          .order("sort_order")
          .order("name"),
      ]);

    const error =
      employeeResult.error ??
      projectResult.error ??
      typeResult.error ??
      optionResult.error;

    if (error) throw new Error(error.message);

    setEmployees(
      ((employeeResult.data ?? []) as Record<string, unknown>[])
        .map(normaliseEmployee)
        .filter((employee) => employee.id && employee.active)
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    );

    setProjects(
      ((projectResult.data ?? []) as Record<string, unknown>[])
        .map(normaliseProject)
        .filter((project) => project.id && project.active)
        .sort((a, b) => a.name.localeCompare(b.name)),
    );

    setTrainingTypes(
      (typeResult.data ?? []).map((item) => ({
        ...(item as Omit<TrainingType, "filename_components">),
        validity_mode:
          (item.validity_mode as ValidityMode | null) ??
          (item.requires_expiry_date ? "manual" : "never"),
        validity_interval_value:
          (item.validity_interval_value as number | null) ?? null,
        validity_interval_unit:
          (item.validity_interval_unit as ValidityUnit | null) ?? null,
        filename_date_field:
          (item.filename_date_field as FilenameDateField | null) ??
          (item.requires_expiry_date ? "expiry_date" : "none"),
        filename_components: normaliseFilenameComponents(
          item.filename_components,
        ),
      })),
    );

    setOptions((optionResult.data ?? []) as TrainingOption[]);
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      try {
        await loadReferenceData();
      } catch (error) {
        setMessage({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : "Unable to load training data.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadReferenceData]);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === form.employeeId) ?? null,
    [employees, form.employeeId],
  );

  const selectedType = useMemo(
    () =>
      trainingTypes.find((trainingType) => trainingType.id === form.trainingTypeId) ??
      null,
    [trainingTypes, form.trainingTypeId],
  );

  const availableOptions = useMemo(
    () =>
      options.filter(
        (option) =>
          option.training_type_id === form.trainingTypeId && option.active,
      ),
    [options, form.trainingTypeId],
  );

  const selectedOptions = useMemo(
    () =>
      availableOptions.filter((option) =>
        form.selectedOptionIds.includes(option.id),
      ),
    [availableOptions, form.selectedOptionIds],
  );

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === form.projectId) ?? null,
    [projects, form.projectId],
  );

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.toLowerCase().trim();
    if (!query) return employees;

    return employees.filter((employee) =>
      [
        employee.payrollId,
        employee.displayName,
        employee.firstName,
        employee.lastName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [employeeSearch, employees]);

  const generatedFilename = useMemo(
    () =>
      buildFilename({
        employee: selectedEmployee,
        trainingType: selectedType,
        selectedOptions,
        project: selectedProject,
        issueDate: form.issueDate,
        expiryDate: form.expiryDate,
        originalFile: form.file,
      }),
    [
      form.expiryDate,
      form.file,
      form.issueDate,
      selectedEmployee,
      selectedOptions,
      selectedProject,
      selectedType,
    ],
  );

  useEffect(() => {
    if (!selectedType) return;

    if (selectedType.validity_mode === "automatic") {
      const calculated = addInterval(
        form.issueDate,
        selectedType.validity_interval_value,
        selectedType.validity_interval_unit,
      );

      setForm((current) =>
        current.expiryDate === calculated
          ? current
          : { ...current, expiryDate: calculated },
      );
      return;
    }

    if (selectedType.validity_mode === "never" && form.expiryDate) {
      setForm((current) => ({ ...current, expiryDate: "" }));
    }
  }, [
    form.expiryDate,
    form.issueDate,
    selectedType,
  ]);

  useEffect(() => {
    setExistingRecords([]);
    setReplaceChoice(null);
    setReplaceRecordId("");

    if (!form.employeeId || !form.trainingTypeId) return;

    void (async () => {
      setCheckingExisting(true);

      const { data, error } = await supabase
        .from("employee_training_records")
        .select("*")
        .eq("employee_id", form.employeeId)
        .eq("training_type_id", form.trainingTypeId)
        .is("superseded_at", null)
        .order("created_at", { ascending: false });

      setCheckingExisting(false);

      if (error) {
        setMessage({
          tone: "error",
          text: `Unable to check current records: ${error.message}`,
        });
        return;
      }

      const currentRecords = (
        (data ?? []) as Record<string, unknown>[]
      ).filter((row) => {
        const status = clean(row.status).toLowerCase();
        return !["superseded", "archived", "cancelled"].includes(status);
      });

      const normalised = currentRecords.map(
        (row): ExistingRecord => ({
          id: clean(row.id),
          certificate_number: clean(row.certificate_number) || null,
          issue_date: clean(row.issue_date) || null,
          expiry_date: clean(row.expiry_date) || null,
          status: clean(row.status) || null,
          option_codes: optionCodesFromRecord(row),
        }),
      );

      setExistingRecords(normalised);

      if (
        normalised.length > 0 &&
        selectedType &&
        !selectedType.allows_multiple_current
      ) {
        setReplaceChoice("replace");
        setReplaceRecordId(normalised[0].id);
      }
    })();
  }, [
    form.employeeId,
    form.trainingTypeId,
    selectedType,
    supabase,
  ]);

  function chooseTrainingType(trainingTypeId: string) {
    const nextType =
      trainingTypes.find((trainingType) => trainingType.id === trainingTypeId) ??
      null;

    setForm((current) => ({
      ...current,
      trainingTypeId,
      selectedOptionIds: [],
      projectId: "",
      issuer: "",
      certificateNumber: "",
      issueDate: "",
      expiryDate: "",
      notes: "",
      file: current.file,
    }));

    setExistingRecords([]);
    setReplaceChoice(null);
    setReplaceRecordId("");

    if (nextType?.validity_mode === "never") {
      setForm((current) => ({ ...current, expiryDate: "" }));
    }
  }

  function toggleOption(optionId: string) {
    if (!selectedType || selectedType.subtype_mode === "none") return;

    setForm((current) => {
      if (selectedType.subtype_mode === "single") {
        return {
          ...current,
          selectedOptionIds: current.selectedOptionIds.includes(optionId)
            ? []
            : [optionId],
        };
      }

      return {
        ...current,
        selectedOptionIds: current.selectedOptionIds.includes(optionId)
          ? current.selectedOptionIds.filter((id) => id !== optionId)
          : [...current.selectedOptionIds, optionId],
      };
    });
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setForm((current) => ({ ...current, file }));
  }

  function validate(): string | null {
    if (!form.employeeId) return "Select an employee.";
    if (!form.trainingTypeId) return "Select a training type.";
    if (!selectedType) return "The selected training type is unavailable.";

    if (
      selectedType.subtype_mode !== "none" &&
      form.selectedOptionIds.length === 0
    ) {
      return "Select the required class or endorsement.";
    }

    if (selectedType.requires_project && !form.projectId) {
      return "Select the project.";
    }

    if (selectedType.requires_issuer && !form.issuer.trim()) {
      return "Enter the issuing organisation.";
    }

    if (
      selectedType.requires_certificate_number &&
      !form.certificateNumber.trim()
    ) {
      return "Enter the certificate or licence number.";
    }

    if (
      (selectedType.requires_issue_date ||
        selectedType.validity_mode === "automatic") &&
      !form.issueDate
    ) {
      return "Enter the issue date.";
    }

    if (
      selectedType.validity_mode === "manual" &&
      selectedType.requires_expiry_date &&
      !form.expiryDate
    ) {
      return "Enter the expiry date.";
    }

    if (
      selectedType.validity_mode === "automatic" &&
      !form.expiryDate
    ) {
      return "The expiry date could not be calculated. Check the configured renewal interval.";
    }

    if (selectedType.requires_document && !form.file) {
      return "Select the certificate or licence document.";
    }

    if (existingRecords.length > 0) {
      if (!replaceChoice || replaceChoice === "cancel") {
        return "Choose whether to replace a current record or add another current record.";
      }

      if (replaceChoice === "replace" && !replaceRecordId) {
        return "Select the current record being replaced.";
      }

      if (
        replaceChoice === "add" &&
        !selectedType.allows_multiple_current
      ) {
        return "This training type does not allow multiple current records.";
      }
    }

    return null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const validationError = validate();
    if (validationError) {
      setMessage({ tone: "error", text: validationError });
      return;
    }

    if (!selectedEmployee || !selectedType) return;

    setSubmitting(true);

    try {
      const payload = new FormData();

      payload.set("employeeId", selectedEmployee.id);
      payload.set("payrollId", selectedEmployee.payrollId);
      payload.set("employeeFirstName", selectedEmployee.firstName);
      payload.set("employeeLastName", selectedEmployee.lastName);
      payload.set("trainingTypeId", selectedType.id);
      payload.set("trainingTypeCode", selectedType.code);
      payload.set(
        "selectedOptionIds",
        JSON.stringify(form.selectedOptionIds),
      );
      payload.set(
        "selectedOptionCodes",
        JSON.stringify(
          selectedOptions
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((option) => option.code),
        ),
      );
      payload.set("projectId", form.projectId);
      payload.set("projectCode", selectedProject?.code ?? "");
      payload.set("issuer", form.issuer.trim());
      payload.set("certificateNumber", form.certificateNumber.trim());
      payload.set("issueDate", form.issueDate);
      payload.set("expiryDate", form.expiryDate);
      payload.set("notes", form.notes.trim());
      payload.set("generatedFilename", generatedFilename);
      payload.set("replacementMode", replaceChoice ?? "none");
      payload.set("supersedesRecordId", replaceRecordId);

      if (form.file) payload.set("file", form.file);

      const response = await fetch("/api/training/records/upload", {
        method: "POST",
        body: payload,
      });

      const result = (await response.json().catch(() => null)) as
        | { error?: string; recordId?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          result?.error || "The training record could not be uploaded.",
        );
      }

      setMessage({
        tone: "success",
        text: `Training record uploaded as ${generatedFilename}.`,
      });

      setForm(EMPTY_FORM);
      setEmployeeSearch("");
      setExistingRecords([]);
      setReplaceChoice(null);
      setReplaceRecordId("");
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "The training record could not be uploaded.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[55vh] items-center justify-center">
          <Loader2 className="animate-spin text-slate-500" size={28} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-blue-700">
                <UploadCloud size={17} />
                Training records
              </div>
              <h1 className="text-3xl font-black tracking-tight text-slate-950">
                Add Training Record
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Upload a certificate or licence, calculate its expiry from the
                configured validity rules and save it to the employee’s
                SharePoint training folder.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadReferenceData()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
              <Link
                href="/people/training"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <ArrowLeft size={16} />
                Back to Training
              </Link>
            </div>
          </div>
        </header>

        {message ? (
          <div
            className={`flex items-start gap-3 rounded-2xl border p-4 text-sm font-semibold ${
              message.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            {message.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
            ) : (
              <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            )}
            <span>{message.text}</span>
            <button
              type="button"
              onClick={() => setMessage(null)}
              className="ml-auto rounded-lg p-1 hover:bg-black/5"
              aria-label="Dismiss message"
            >
              <X size={16} />
            </button>
          </div>
        ) : null}

        <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <section className="space-y-6">
            <Card
              title="1. Employee"
              description="Select the employee who owns this training record."
            >
              <div className="mb-3">
                <label className="relative block">
                  <Search
                    size={17}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={employeeSearch}
                    onChange={(event) => setEmployeeSearch(event.target.value)}
                    placeholder="Search by payroll ID or employee name"
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
              </div>

              <select
                value={form.employeeId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    employeeId: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="">Select employee</option>
                {filteredEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.payrollId || 'No Payroll ID'} — {employee.displayName}
                  </option>
                ))}
              </select>
            </Card>

            <Card
              title="2. Training type"
              description="The selected type controls classes, required fields, validity and the filename."
            >
              <select
                value={form.trainingTypeId}
                onChange={(event) => chooseTrainingType(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="">Select training type</option>
                {trainingTypes.map((trainingType) => (
                  <option key={trainingType.id} value={trainingType.id}>
                    {trainingType.name} ({trainingType.code})
                  </option>
                ))}
              </select>

              {selectedType?.description ? (
                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                  {selectedType.description}
                </p>
              ) : null}

              {selectedType?.subtype_mode !== "none" ? (
                <div className="mt-5">
                  <div className="mb-2 text-sm font-black text-slate-900">
                    Classes / endorsements
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {availableOptions.map((option) => {
                      const selected = form.selectedOptionIds.includes(option.id);

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleOption(option.id)}
                          className={`rounded-xl border px-3 py-3 text-left transition ${
                            selected
                              ? "border-blue-600 bg-blue-50 ring-2 ring-blue-100"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <div className="text-sm font-black text-slate-900">
                            {option.code}
                          </div>
                          <div className="mt-0.5 text-xs font-medium text-slate-600">
                            {option.name}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {availableOptions.length === 0 ? (
                    <p className="mt-2 text-sm font-semibold text-amber-700">
                      No active classes or endorsements are configured for this
                      training type.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </Card>

            <Card
              title="3. Record information"
              description="Only fields enabled for the selected training type are shown."
            >
              {!selectedType ? (
                <EmptyState text="Select a training type to display its record fields." />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {selectedType.requires_project ? (
                    <Field label="Project" required>
                      <select
                        value={form.projectId}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            projectId: event.target.value,
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="">Select project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.code} — {project.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}

                  {selectedType.requires_issuer ? (
                    <Field label="Issuing organisation" required>
                      <input
                        value={form.issuer}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            issuer: event.target.value,
                          }))
                        }
                        className={inputClass}
                        placeholder="e.g. RTO or licensing authority"
                      />
                    </Field>
                  ) : null}

                  {selectedType.requires_certificate_number ? (
                    <Field label="Certificate / licence number" required>
                      <input
                        value={form.certificateNumber}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            certificateNumber: event.target.value,
                          }))
                        }
                        className={inputClass}
                        placeholder="Enter document number"
                      />
                    </Field>
                  ) : null}

                  {selectedType.requires_issue_date ||
                  selectedType.validity_mode === "automatic" ? (
                    <Field label="Issue date" required>
                      <input
                        type="date"
                        value={form.issueDate}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            issueDate: event.target.value,
                          }))
                        }
                        className={inputClass}
                      />
                    </Field>
                  ) : null}

                  {selectedType.validity_mode === "manual" ? (
                    <Field
                      label="Expiry date"
                      required={selectedType.requires_expiry_date}
                    >
                      <input
                        type="date"
                        value={form.expiryDate}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            expiryDate: event.target.value,
                          }))
                        }
                        className={inputClass}
                      />
                    </Field>
                  ) : null}

                  {selectedType.validity_mode === "automatic" ? (
                    <Field label="Calculated expiry date" required>
                      <div className="relative">
                        <CalendarDays
                          size={17}
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          type="date"
                          value={form.expiryDate}
                          readOnly
                          className={`${inputClass} bg-slate-100 pl-10 text-slate-700`}
                        />
                      </div>
                      <p className="mt-1.5 text-xs font-semibold text-slate-500">
                        Issue date + {selectedType.validity_interval_value ?? "—"}{" "}
                        {selectedType.validity_interval_unit ?? "configured interval"}.
                      </p>
                    </Field>
                  ) : null}

                  {selectedType.validity_mode === "never" ? (
                    <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
                      This training type is configured not to expire.
                    </div>
                  ) : null}

                  <div className="sm:col-span-2">
                    <Field label="Internal notes">
                      <textarea
                        value={form.notes}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                        rows={4}
                        className={inputClass}
                        placeholder="Optional notes for administrators"
                      />
                    </Field>
                  </div>
                </div>
              )}
            </Card>

            <Card
              title="4. Certificate or licence document"
              description="The backend will upload the file to the employee’s configured SharePoint folder."
            >
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-blue-400 hover:bg-blue-50">
                <UploadCloud size={34} className="text-blue-700" />
                <span className="mt-3 text-sm font-black text-slate-900">
                  {form.file ? form.file.name : "Choose a document"}
                </span>
                <span className="mt-1 text-xs font-semibold text-slate-500">
                  PDF, image or supported certificate file
                </span>
                <input
                  type="file"
                  className="sr-only"
                  onChange={onFileChange}
                  accept=".pdf,.png,.jpg,.jpeg,.heic,.webp"
                />
              </label>

              {form.file ? (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText size={18} className="shrink-0 text-slate-500" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-slate-900">
                        {form.file.name}
                      </div>
                      <div className="text-xs font-semibold text-slate-500">
                        {(form.file.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({ ...current, file: null }))
                    }
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <X size={17} />
                  </button>
                </div>
              ) : null}
            </Card>

            {checkingExisting ? (
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-600 shadow-sm">
                <Loader2 className="animate-spin" size={17} />
                Checking for current records…
              </div>
            ) : null}

            {existingRecords.length > 0 && selectedType ? (
              <Card
                title="5. Existing current record"
                description="Choose explicitly whether this upload replaces a current record."
              >
                <div className="space-y-3">
                  {existingRecords.map((record) => (
                    <label
                      key={record.id}
                      className={`block rounded-xl border p-4 ${
                        replaceChoice === "replace" &&
                        replaceRecordId === record.id
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="replacement-record"
                          checked={
                            replaceChoice === "replace" &&
                            replaceRecordId === record.id
                          }
                          onChange={() => {
                            setReplaceChoice("replace");
                            setReplaceRecordId(record.id);
                          }}
                          className="mt-1"
                        />
                        <div>
                          <div className="font-black text-slate-900">
                            {selectedType.name}
                            {record.option_codes.length
                              ? ` — ${record.option_codes.join(", ")}`
                              : ""}
                          </div>
                          <div className="mt-1 text-sm font-semibold text-slate-600">
                            Issue: {formatDate(record.issue_date)} · Expiry:{" "}
                            {formatDate(record.expiry_date)}
                          </div>
                          {record.certificate_number ? (
                            <div className="mt-1 text-xs font-semibold text-slate-500">
                              Number: {record.certificate_number}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </label>
                  ))}

                  {selectedType.allows_multiple_current ? (
                    <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
                      <input
                        type="radio"
                        name="replacement-record"
                        checked={replaceChoice === "add"}
                        onChange={() => {
                          setReplaceChoice("add");
                          setReplaceRecordId("");
                        }}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-black text-slate-900">
                          Add another current record
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-600">
                          Keep the existing record current and add this upload as
                          an additional current record.
                        </div>
                      </div>
                    </label>
                  ) : null}
                </div>
              </Card>
            ) : null}
          </section>

          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <Card
              title="Upload summary"
              description="Review the record before submitting."
            >
              <SummaryRow
                label="Employee"
                value={
                  selectedEmployee
                    ? `${selectedEmployee.payrollId || 'No Payroll ID'} — ${selectedEmployee.displayName}`
                    : "Not selected"
                }
              />
              <SummaryRow
                label="Training type"
                value={
                  selectedType
                    ? `${selectedType.name} (${selectedType.code})`
                    : "Not selected"
                }
              />
              <SummaryRow
                label="Classes"
                value={
                  selectedOptions.length
                    ? selectedOptions.map((option) => option.code).join(", ")
                    : "None"
                }
              />
              <SummaryRow
                label="Issue date"
                value={form.issueDate ? formatDate(form.issueDate) : "Not set"}
              />
              <SummaryRow
                label="Expiry date"
                value={
                  selectedType?.validity_mode === "never"
                    ? "Does not expire"
                    : form.expiryDate
                      ? formatDate(form.expiryDate)
                      : "Not set"
                }
              />

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-950 p-4">
                <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                  Generated filename
                </div>
                <div className="mt-2 break-all font-mono text-sm font-bold leading-6 text-white">
                  {generatedFilename}
                </div>
              </div>
            </Card>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <UploadCloud size={18} />
              )}
              {submitting ? "Uploading…" : "Upload Training Record"}
            </button>

            <p className="px-2 text-xs font-semibold leading-5 text-slate-500">
              This page sends the record and document to{" "}
              <code>/api/training/records/upload</code>. That server route must
              upload to SharePoint, insert the Supabase record and process any
              selected superseding action.
            </p>
          </aside>
        </form>
      </main>
    </AppShell>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black text-slate-800">
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0">
      <span className="text-sm font-semibold text-slate-500">{label}</span>
      <span className="max-w-[62%] text-right text-sm font-black text-slate-900">
        {value}
      </span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">
      {text}
    </div>
  );
}

"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  UserRound,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type Employee = {
  id: string;
  payroll_id: string | null;
  full_name: string;
  role: string | null;
  user_id: string | null;
  active: boolean | null;
};

type Project = {
  id: string;
  name: string;
  project_number: string | null;
  status: string | null;
};

type TrainingType = {
  id: string;
  category_id: string | null;
  name: string;
  short_code: string | null;
  category: string | null;
  active: boolean | null;
  requires_issue_date: boolean | null;
  requires_expiry_date: boolean | null;
  allows_no_expiry: boolean | null;
  validity_mode: string | null;
  validity_interval_value: number | null;
  validity_interval_unit: string | null;
  requires_certificate_number: boolean | null;
  requires_issuer: boolean | null;
  requires_project: boolean | null;
  requires_document: boolean | null;
  document_upload_type: string | null;
  allows_multiple_current: boolean | null;
  subtype_mode: string | null;
  requires_review: boolean | null;
};

type TrainingOption = {
  id: string;
  training_type_id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean | null;
  sort_order: number | null;
};

type CustomField = {
  id: string;
  training_type_id: string;
  field_key: string;
  label: string;
  field_type: string;
  required: boolean;
  options: unknown;
  placeholder: string | null;
  help_text: string | null;
  active: boolean;
  sort_order: number;
};

type ExistingRecord = {
  id: string;
  employee_id: string;
  training_type_id: string | null;
  certificate_number: string | null;
  option_codes: string[] | null;
  class_codes: string[] | null;
  issue_date: string | null;
  expiry_date: string | null;
  workflow_status: string | null;
  current_version: boolean | null;
  superseded_at: string | null;
  revoked_at: string | null;
};

type Message = { tone: "success" | "error"; text: string };

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normaliseRole(value: unknown) {
  return clean(value).toLowerCase().replace(/\s+/g, "_");
}

function canManageOtherEmployees(role: string) {
  return [
    "admin",
    "administrator",
    "site_admin",
    "hseq",
    "safety",
    "safety_officer",
  ].includes(normaliseRole(role));
}

function addInterval(
  issueDate: string,
  value: number | null,
  unit: string | null,
) {
  if (!issueDate || !value || !unit) return "";

  const date = new Date(`${issueDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  if (unit === "days") date.setDate(date.getDate() + value);
  if (unit === "weeks") date.setDate(date.getDate() + value * 7);
  if (unit === "months") date.setMonth(date.getMonth() + value);
  if (unit === "years") date.setFullYear(date.getFullYear() + value);

  return date.toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function fieldOptions(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

export default function AddTrainingRecordPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [currentRole, setCurrentRole] = useState("");
  const [selfEmployeeId, setSelfEmployeeId] = useState("");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [types, setTypes] = useState<TrainingType[]>([]);
  const [options, setOptions] = useState<TrainingOption[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  const [employeeId, setEmployeeId] = useState("");
  const [trainingTypeId, setTrainingTypeId] = useState("");
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");
  const [issuer, setIssuer] = useState("");
  const [certificateNumber, setCertificateNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [metadata, setMetadata] = useState<Record<string, unknown>>({});
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);

  const [existingRecords, setExistingRecords] = useState<ExistingRecord[]>([]);
  const [replaceChoice, setReplaceChoice] = useState<"replace" | "add" | null>(null);
  const [replaceRecordId, setReplaceRecordId] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const apiFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${session.access_token}`);

      return fetch(url, {
        ...init,
        headers,
        cache: "no-store",
      });
    },
    [supabase],
  );

  const loadReferenceData = useCallback(async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) throw new Error("You must be signed in.");

    const [
      roleResult,
      employeeResult,
      projectResult,
      typeResult,
      optionResult,
      fieldResult,
    ] = await Promise.all([
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("employees")
        .select("id,payroll_id,full_name,role,user_id,active")
        .eq("active", true)
        .order("full_name"),
      supabase
        .from("projects")
        .select("id,name,project_number,status")
        .order("name"),
      supabase
        .from("training_types")
        .select(
          "id,category_id,name,short_code,category,active,requires_issue_date,requires_expiry_date,allows_no_expiry,validity_mode,validity_interval_value,validity_interval_unit,requires_certificate_number,requires_issuer,requires_project,requires_document,document_upload_type,allows_multiple_current,subtype_mode,requires_review",
        )
        .eq("active", true)
        .order("sort_order")
        .order("name"),
      supabase
        .from("training_type_options")
        .select(
          "id,training_type_id,name,code,description,active,sort_order",
        )
        .eq("active", true)
        .order("sort_order")
        .order("name"),
      supabase
        .from("training_type_fields")
        .select(
          "id,training_type_id,field_key,label,field_type,required,options,placeholder,help_text,active,sort_order",
        )
        .eq("active", true)
        .order("sort_order"),
    ]);

    const errors = [
      roleResult.error,
      employeeResult.error,
      projectResult.error,
      typeResult.error,
      optionResult.error,
      fieldResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw new Error(errors[0]?.message || "Unable to load Training form.");
    }

    const loadedEmployees = (employeeResult.data ?? []) as Employee[];
    const role = normaliseRole(roleResult.data?.role);
    const self = loadedEmployees.find((item) => item.user_id === user.id);

    setCurrentRole(role);
    setSelfEmployeeId(self?.id ?? "");
    setEmployees(loadedEmployees);
    setProjects((projectResult.data ?? []) as Project[]);
    setTypes((typeResult.data ?? []) as TrainingType[]);
    setOptions((optionResult.data ?? []) as TrainingOption[]);
    setCustomFields((fieldResult.data ?? []) as CustomField[]);

    setEmployeeId((current) => {
      if (current && loadedEmployees.some((item) => item.id === current)) {
        return current;
      }

      if (self?.id) return self.id;
      if (canManageOtherEmployees(role)) return loadedEmployees[0]?.id ?? "";
      return "";
    });
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
              : "Unable to load Training form.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadReferenceData]);

  const selectedEmployee = employees.find((item) => item.id === employeeId) ?? null;
  const selectedType = types.find((item) => item.id === trainingTypeId) ?? null;
  const canChooseEmployee = canManageOtherEmployees(currentRole);

  const typeOptions = useMemo(
    () => options.filter((item) => item.training_type_id === trainingTypeId),
    [options, trainingTypeId],
  );

  const typeFields = useMemo(
    () => customFields.filter((item) => item.training_type_id === trainingTypeId),
    [customFields, trainingTypeId],
  );

  const selectedOptions = typeOptions.filter((option) =>
    selectedOptionIds.includes(option.id),
  );

  useEffect(() => {
    setSelectedOptionIds([]);
    setMetadata({});
    setProjectId("");
    setIssuer("");
    setCertificateNumber("");
    setIssueDate("");
    setExpiryDate("");
    setNotes("");
    setSingleFile(null);
    setFrontFile(null);
    setBackFile(null);
    setExistingRecords([]);
    setReplaceChoice(null);
    setReplaceRecordId("");
  }, [trainingTypeId]);

  useEffect(() => {
    if (!selectedType) return;

    if (selectedType.validity_mode === "never") {
      setExpiryDate("");
      return;
    }

    if (selectedType.validity_mode === "automatic" && issueDate) {
      setExpiryDate(
        addInterval(
          issueDate,
          selectedType.validity_interval_value,
          selectedType.validity_interval_unit,
        ),
      );
    }
  }, [issueDate, selectedType]);

  useEffect(() => {
    if (!employeeId || !trainingTypeId) {
      setExistingRecords([]);
      return;
    }

    void (async () => {
      const { data, error } = await supabase
        .from("employee_training_records")
        .select(
          "id,employee_id,training_type_id,certificate_number,option_codes,class_codes,issue_date,expiry_date,workflow_status,current_version,superseded_at,revoked_at",
        )
        .eq("employee_id", employeeId)
        .eq("training_type_id", trainingTypeId)
        .eq("current_version", true)
        .is("superseded_at", null)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Existing Training records could not be loaded", error);
        setExistingRecords([]);
        return;
      }

      const rows = ((data ?? []) as ExistingRecord[]).filter(
        (record) => clean(record.workflow_status) === "approved",
      );

      setExistingRecords(rows);

      if (rows.length === 0) {
        setReplaceChoice(null);
        setReplaceRecordId("");
      } else if (rows.length === 1 && selectedType?.allows_multiple_current === false) {
        setReplaceChoice("replace");
        setReplaceRecordId(rows[0].id);
      }
    })();
  }, [employeeId, selectedType?.allows_multiple_current, supabase, trainingTypeId]);

  function customFieldMissing(field: CustomField) {
    const value = metadata[field.field_key];
    return (
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0) ||
      (field.field_type === "checkbox" && value !== true)
    );
  }

  function validate() {
    if (!selectedEmployee) return "Select the employee.";
    if (!selectedType) return "Select the Training Type.";

    if (!canChooseEmployee && selectedEmployee.id !== selfEmployeeId) {
      return "You can only upload Training evidence for your own employee profile.";
    }

    if (selectedType.requires_project && !projectId) {
      return "Select the project.";
    }

    if (selectedType.requires_issuer && !issuer.trim()) {
      return "Enter the provider / issuing organisation.";
    }

    if (selectedType.requires_certificate_number && !certificateNumber.trim()) {
      return "Enter the certificate or licence number.";
    }

    if (selectedType.requires_issue_date && !issueDate) {
      return "Enter the issue date.";
    }

    if (
      selectedType.validity_mode !== "never" &&
      selectedType.requires_expiry_date &&
      !expiryDate
    ) {
      return "Enter the expiry date.";
    }

    for (const field of typeFields) {
      if (field.required && customFieldMissing(field)) {
        return `Enter ${field.label}.`;
      }
    }

    if (selectedType.requires_document) {
      if (selectedType.document_upload_type === "front_back") {
        if (!frontFile || !backFile) return "Upload both the front and back files.";
      } else if (!singleFile) {
        return "Upload the required certificate / licence evidence.";
      }
    }

    if (existingRecords.length > 0) {
      if (!replaceChoice) {
        return "Choose whether this upload replaces a current record or is added as another current record.";
      }

      if (replaceChoice === "replace" && !replaceRecordId) {
        return "Select the current record being replaced.";
      }

      if (replaceChoice === "add" && selectedType.allows_multiple_current === false) {
        return "This Training Type does not allow multiple current records.";
      }
    }

    return null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const error = validate();
    if (error) {
      setMessage({ tone: "error", text: error });
      return;
    }

    if (!selectedEmployee || !selectedType) return;

    setSubmitting(true);

    try {
      const form = new FormData();
      form.set("employeeId", selectedEmployee.id);
      form.set("trainingTypeId", selectedType.id);
      form.set("projectId", projectId);
      form.set("issuer", issuer.trim());
      form.set("certificateNumber", certificateNumber.trim());
      form.set("issueDate", issueDate);
      form.set("expiryDate", expiryDate);
      form.set("notes", notes.trim());
      form.set("metadata", JSON.stringify(metadata));
      form.set("selectedOptionIds", JSON.stringify(selectedOptionIds));
      form.set(
        "selectedOptionCodes",
        JSON.stringify(selectedOptions.map((option) => option.code)),
      );
      form.set(
        "documentUploadType",
        selectedType.document_upload_type || "single",
      );
      form.set("replacementMode", replaceChoice ?? "none");
      form.set("supersedesRecordId", replaceRecordId);
      form.set("source", selectedEmployee.id === selfEmployeeId ? "employee_self_service" : "website_admin");

      if (singleFile) form.set("file", singleFile);
      if (frontFile) form.set("frontFile", frontFile);
      if (backFile) form.set("backFile", backFile);

      const response = await apiFetch("/api/training/records/upload", {
        method: "POST",
        body: form,
      });

      const responseText = await response.text();

      let result: {
        error?: string;
        workflowStatus?: string;
        notificationWarning?: string | null;
      } | null = null;

      if (responseText) {
        try {
          result = JSON.parse(responseText) as {
            error?: string;
            workflowStatus?: string;
            notificationWarning?: string | null;
          };
        } catch {
          result = null;
        }
      }

      if (!response.ok) {
        const serverMessage = clean(result?.error);
        const rawMessage = clean(responseText);

        console.error("Training upload failed", {
          status: response.status,
          statusText: response.statusText,
          response: rawMessage,
        });

        throw new Error(
          serverMessage ||
            (rawMessage && !rawMessage.startsWith("<")
              ? `Upload failed (${response.status}): ${rawMessage.slice(0, 500)}`
              : `Upload failed (${response.status} ${response.statusText}). The upload API did not return a valid TTTracker error response.`),
        );
      }

      const successText =
        result?.workflowStatus === "approved"
          ? "Training record approved automatically and published to SharePoint."
          : "Training record submitted. The document will be published to SharePoint after approval.";

      setMessage({
        tone: result?.notificationWarning ? "error" : "success",
        text: result?.notificationWarning
          ? `${successText} ${result.notificationWarning}`
          : successText,
      });

      setTrainingTypeId("");
      setSelectedOptionIds([]);
      setProjectId("");
      setIssuer("");
      setCertificateNumber("");
      setIssueDate("");
      setExpiryDate("");
      setNotes("");
      setMetadata({});
      setSingleFile(null);
      setFrontFile(null);
      setBackFile(null);
      setExistingRecords([]);
      setReplaceChoice(null);
      setReplaceRecordId("");
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "The Training record could not be uploaded.",
      });
    } finally {
      setSubmitting(false);
    }
  }

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
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <Link
            href="/people/training"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back to Training
          </Link>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-blue-700">
                <UploadCloud size={17} />
                Training records
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                Upload Training Record
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                Employees can upload their own evidence. Admin/HSEQ can select an
                employee and upload on their behalf. Type-specific rules and
                required fields come from Training Configuration.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/people/training"
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700"
              >
                Training Register
              </Link>
              {canChooseEmployee ? (
                <Link
                  href="/people/training/bulk-upload"
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700"
                >
                  Bulk Upload
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => void loadReferenceData()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
          </div>
        </section>

        {message ? (
          <section
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
              message.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            <div className="flex items-start gap-2">
              {message.tone === "success" ? (
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              )}
              {message.text}
            </div>
          </section>
        ) : null}

        {!selfEmployeeId && !canChooseEmployee ? (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
            <div className="flex items-start gap-3">
              <UserRound size={22} className="mt-0.5" />
              <div>
                <div className="font-black">No employee profile is linked to your login</div>
                <div className="mt-1 text-sm font-semibold leading-6">
                  Ask an administrator to link your TTTracker login to your existing employee profile before using self-service Training upload.
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-6">
            <Card title="1. Employee" description={canChooseEmployee ? "Select the employee or leave yourself selected." : "Your linked employee profile is used automatically."}>
              {canChooseEmployee ? (
                <Field label="Employee" required>
                  <select className={inputClass} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
                    <option value="">Select...</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.payroll_id ? `${employee.payroll_id} - ` : ""}{employee.full_name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="font-black text-slate-950">{selectedEmployee?.full_name || "No linked employee"}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">{selectedEmployee?.payroll_id || "No Payroll ID"}</div>
                </div>
              )}
            </Card>

            <Card title="2. Training Type" description="The selected type controls the fields, expiry logic and document requirements.">
              <Field label="Training Type" required>
                <select className={inputClass} value={trainingTypeId} onChange={(event) => setTrainingTypeId(event.target.value)}>
                  <option value="">Select...</option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}{type.short_code ? ` (${type.short_code})` : ""}
                    </option>
                  ))}
                </select>
              </Field>

              {typeOptions.length > 0 ? (
                <div className="mt-4">
                  <div className="mb-2 text-sm font-black text-slate-800">Classes / endorsements</div>
                  <div className="flex flex-wrap gap-2">
                    {typeOptions.map((option) => {
                      const checked = selectedOptionIds.includes(option.id);
                      const single = selectedType?.subtype_mode === "single";

                      return (
                        <label key={option.id} className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-bold ${checked ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700"}`}>
                          <input
                            type={single ? "radio" : "checkbox"}
                            name={single ? "training-option" : undefined}
                            className="mr-2"
                            checked={checked}
                            onChange={() => {
                              setSelectedOptionIds((current) => {
                                if (single) return [option.id];
                                return checked ? current.filter((id) => id !== option.id) : [...current, option.id];
                              });
                            }}
                          />
                          {option.code || option.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </Card>

            {selectedType ? (
              <Card title="3. Record Details" description="Only the fields enabled by this Training Type are shown.">
                <div className="grid gap-4 md:grid-cols-2">
                  {selectedType.requires_project ? (
                    <Field label="Project" required>
                      <select className={inputClass} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                        <option value="">Select...</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.project_number ? `${project.project_number} - ` : ""}{project.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}

                  {selectedType.requires_issuer ? (
                    <Field label="Provider / Issuer" required>
                      <input className={inputClass} value={issuer} onChange={(event) => setIssuer(event.target.value)} />
                    </Field>
                  ) : null}

                  {selectedType.requires_certificate_number ? (
                    <Field label="Certificate / Licence Number" required>
                      <input className={inputClass} value={certificateNumber} onChange={(event) => setCertificateNumber(event.target.value)} />
                    </Field>
                  ) : null}

                  {(selectedType.requires_issue_date || selectedType.validity_mode === "automatic") ? (
                    <Field label="Issue Date" required>
                      <input type="date" className={inputClass} value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
                    </Field>
                  ) : null}

                  {selectedType.validity_mode !== "never" && selectedType.requires_expiry_date ? (
                    <Field label="Expiry Date" required>
                      <input
                        type="date"
                        className={inputClass}
                        value={expiryDate}
                        readOnly={selectedType.validity_mode === "automatic"}
                        onChange={(event) => setExpiryDate(event.target.value)}
                      />
                    </Field>
                  ) : null}
                </div>

                {typeFields.length > 0 ? (
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {typeFields.map((field) => (
                      <DynamicField
                        key={field.id}
                        field={field}
                        value={metadata[field.field_key]}
                        onChange={(value) => setMetadata((current) => ({ ...current, [field.field_key]: value }))}
                      />
                    ))}
                  </div>
                ) : null}

                <div className="mt-4">
                  <Field label="Notes">
                    <textarea className={`${inputClass} min-h-24`} value={notes} onChange={(event) => setNotes(event.target.value)} />
                  </Field>
                </div>
              </Card>
            ) : null}

            {selectedType?.requires_document ? (
              <Card title="4. Evidence" description="The file is held in TTTracker staging until review, then published to SharePoint after approval.">
                {selectedType.document_upload_type === "front_back" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Front" required>
                      <input type="file" className={fileInputClass} onChange={(event) => setFrontFile(event.target.files?.[0] ?? null)} />
                    </Field>
                    <Field label="Back" required>
                      <input type="file" className={fileInputClass} onChange={(event) => setBackFile(event.target.files?.[0] ?? null)} />
                    </Field>
                  </div>
                ) : (
                  <Field label="Certificate / Licence / Evidence" required>
                    <input type="file" className={fileInputClass} onChange={(event) => setSingleFile(event.target.files?.[0] ?? null)} />
                  </Field>
                )}
                <div className="mt-3 text-xs font-semibold leading-5 text-slate-500">
                  Final filenames are generated server-side from your configured Training filename rules.
                </div>
              </Card>
            ) : null}

            {existingRecords.length > 0 ? (
              <Card title="5. Existing Current Record" description="The old record stays current until the replacement is approved.">
                <div className="space-y-3">
                  {existingRecords.map((record) => {
                    const codes = record.option_codes?.length ? record.option_codes : record.class_codes ?? [];
                    return (
                      <label key={record.id} className={`block rounded-xl border p-4 ${replaceChoice === "replace" && replaceRecordId === record.id ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}>
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="replacement-record"
                            checked={replaceChoice === "replace" && replaceRecordId === record.id}
                            onChange={() => {
                              setReplaceChoice("replace");
                              setReplaceRecordId(record.id);
                            }}
                            className="mt-1"
                          />
                          <div>
                            <div className="font-black text-slate-900">Replace this record{codes.length ? ` — ${codes.join(", ")}` : ""}</div>
                            <div className="mt-1 text-sm font-semibold text-slate-600">Issue: {formatDate(record.issue_date)} · Expiry: {formatDate(record.expiry_date)}</div>
                            {record.certificate_number ? <div className="mt-1 text-xs font-semibold text-slate-500">Number: {record.certificate_number}</div> : null}
                          </div>
                        </div>
                      </label>
                    );
                  })}

                  {selectedType?.allows_multiple_current ? (
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
                        <div className="font-black text-slate-900">Add another current record</div>
                        <div className="mt-1 text-sm font-semibold text-slate-600">Keep the existing approved record current as well.</div>
                      </div>
                    </label>
                  ) : null}
                </div>
              </Card>
            ) : null}
          </section>

          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <Card title="Submission Summary">
              <SummaryRow label="Employee" value={selectedEmployee ? `${selectedEmployee.payroll_id || "No Payroll ID"} — ${selectedEmployee.full_name}` : "Not selected"} />
              <SummaryRow label="Training" value={selectedType ? `${selectedType.name}${selectedType.short_code ? ` (${selectedType.short_code})` : ""}` : "Not selected"} />
              <SummaryRow label="Classes" value={selectedOptions.length ? selectedOptions.map((item) => item.code).join(", ") : "None"} />
              <SummaryRow label="Issue" value={issueDate ? formatDate(issueDate) : "Not set"} />
              <SummaryRow label="Expiry" value={selectedType?.validity_mode === "never" ? "Does not expire" : expiryDate ? formatDate(expiryDate) : "Not set"} />
              <SummaryRow label="Review" value={selectedType?.requires_review === false ? "Auto-approved" : "Reviewer approval required"} />
            </Card>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-900">
              <div className="flex items-start gap-2">
                <ShieldCheck size={18} className="mt-0.5 shrink-0" />
                <div>
                  Evidence requiring review is not published to SharePoint until a configured reviewer approves it.
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !selectedEmployee || !selectedType}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-200 disabled:opacity-50"
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
              {submitting ? "Submitting..." : "Submit Training Record"}
            </button>
          </aside>
        </form>
      </main>
    </AppShell>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

const fileInputClass =
  "block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-black file:text-slate-700";

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p> : null}
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
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black text-slate-800">
        {label}{required ? <span className="ml-1 text-rose-600">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0">
      <span className="text-sm font-semibold text-slate-500">{label}</span>
      <span className="max-w-[62%] text-right text-sm font-black text-slate-900">{value}</span>
    </div>
  );
}

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: CustomField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const options = fieldOptions(field.options);

  if (field.field_type === "checkbox") {
    return (
      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 rounded border-slate-300" />
        <span className="text-sm font-black text-slate-800">{field.label}{field.required ? <span className="ml-1 text-rose-600">*</span> : null}</span>
      </label>
    );
  }

  if (field.field_type === "select") {
    return (
      <Field label={field.label} required={field.required}>
        <select className={inputClass} value={clean(value)} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select...</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </Field>
    );
  }

  if (field.field_type === "multiselect") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <div>
        <div className="mb-2 text-sm font-black text-slate-800">{field.label}{field.required ? <span className="ml-1 text-rose-600">*</span> : null}</div>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const checked = selected.includes(option);
            return (
              <label key={option} className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-bold ${checked ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700"}`}>
                <input type="checkbox" className="mr-2" checked={checked} onChange={() => onChange(checked ? selected.filter((item) => item !== option) : [...selected, option])} />
                {option}
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.field_type === "textarea") {
    return (
      <Field label={field.label} required={field.required}>
        <textarea className={`${inputClass} min-h-24`} placeholder={field.placeholder ?? ""} value={clean(value)} onChange={(event) => onChange(event.target.value)} />
      </Field>
    );
  }

  const type = field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text";

  return (
    <Field label={field.label} required={field.required}>
      <input
        type={type}
        className={inputClass}
        placeholder={field.placeholder ?? ""}
        value={clean(value)}
        onChange={(event) => onChange(field.field_type === "number" ? Number(event.target.value) : event.target.value)}
      />
    </Field>
  );
}

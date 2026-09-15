"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Loader2,
  Search,
  UploadCloud,
  Users,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type Employee = {
  id: string;
  payroll_id: string | null;
  full_name: string;
  role: string | null;
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
  name: string;
  short_code: string | null;
  category: string | null;
  active: boolean | null;
  allow_bulk_upload: boolean | null;
  requires_project: boolean | null;
  requires_issuer: boolean | null;
  requires_certificate_number: boolean | null;
  requires_issue_date: boolean | null;
  requires_expiry_date: boolean | null;
  requires_document: boolean | null;
  document_upload_type: string | null;
  validity_mode: string | null;
  validity_interval_value: number | null;
  validity_interval_unit: string | null;
};

type TrainingOption = {
  id: string;
  training_type_id: string;
  name: string;
  code: string;
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

type PersonDraft = {
  certificateNumber: string;
  file: File | null;
  frontFile: File | null;
  backFile: File | null;
};

type Message = {
  tone: "success" | "error";
  text: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
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

function optionsArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item))
    : [];
}

export default function TrainingBulkUploadPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [types, setTypes] = useState<TrainingType[]>([]);
  const [options, setOptions] = useState<TrainingOption[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");
  const [provider, setProvider] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, PersonDraft>>({});
  const [metadata, setMetadata] = useState<Record<string, unknown>>({});

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
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

  const loadData = useCallback(async () => {
    const [
      employeeResult,
      projectResult,
      typeResult,
      optionResult,
      fieldResult,
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id,payroll_id,full_name,role,active")
        .eq("active", true)
        .order("full_name"),
      supabase
        .from("projects")
        .select("id,name,project_number,status")
        .order("name"),
      supabase
        .from("training_types")
        .select(
          "id,name,short_code,category,active,allow_bulk_upload,requires_project,requires_issuer,requires_certificate_number,requires_issue_date,requires_expiry_date,requires_document,document_upload_type,validity_mode,validity_interval_value,validity_interval_unit",
        )
        .eq("active", true)
        .order("sort_order")
        .order("name"),
      supabase
        .from("training_type_options")
        .select("id,training_type_id,name,code,active,sort_order")
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
      employeeResult.error,
      projectResult.error,
      typeResult.error,
      optionResult.error,
      fieldResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw new Error(errors[0]?.message || "Unable to load Bulk Training Upload.");
    }

    setEmployees((employeeResult.data ?? []) as Employee[]);
    setProjects((projectResult.data ?? []) as Project[]);
    setTypes(
      ((typeResult.data ?? []) as TrainingType[]).filter(
        (item) => item.allow_bulk_upload !== false,
      ),
    );
    setOptions((optionResult.data ?? []) as TrainingOption[]);
    setCustomFields((fieldResult.data ?? []) as CustomField[]);
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
              : "Unable to load Bulk Training Upload.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData]);

  const selectedType = useMemo(
    () => types.find((item) => item.id === selectedTypeId) ?? null,
    [selectedTypeId, types],
  );

  const typeOptions = useMemo(
    () => options.filter((item) => item.training_type_id === selectedTypeId),
    [options, selectedTypeId],
  );

  const typeFields = useMemo(
    () =>
      customFields.filter(
        (item) => item.training_type_id === selectedTypeId,
      ),
    [customFields, selectedTypeId],
  );

  useEffect(() => {
    if (
      selectedType?.validity_mode === "automatic" &&
      issueDate
    ) {
      setExpiryDate(
        addInterval(
          issueDate,
          selectedType.validity_interval_value,
          selectedType.validity_interval_unit,
        ),
      );
    }

    if (selectedType?.validity_mode === "never") {
      setExpiryDate("");
    }
  }, [issueDate, selectedType]);

  useEffect(() => {
    setSelectedOptionIds([]);
    setMetadata({});
  }, [selectedTypeId]);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return employees;

    return employees.filter((employee) =>
      [
        employee.full_name,
        employee.payroll_id,
        employee.role,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [employees, search]);

  const selectedEmployees = useMemo(
    () =>
      selectedEmployeeIds
        .map((id) => employees.find((item) => item.id === id))
        .filter((item): item is Employee => Boolean(item)),
    [employees, selectedEmployeeIds],
  );

  function toggleEmployee(employeeId: string) {
    setSelectedEmployeeIds((current) => {
      const exists = current.includes(employeeId);
      const next = exists
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId];

      if (!exists) {
        setDrafts((draftCurrent) => ({
          ...draftCurrent,
          [employeeId]: draftCurrent[employeeId] ?? {
            certificateNumber: "",
            file: null,
            frontFile: null,
            backFile: null,
          },
        }));
      }

      return next;
    });
  }

  function updateDraft(
    employeeId: string,
    patch: Partial<PersonDraft>,
  ) {
    setDrafts((current) => {
      const existing = current[employeeId];

      const nextDraft: PersonDraft = existing
        ? {
            ...existing,
            ...patch,
          }
        : {
            certificateNumber: "",
            file: null,
            frontFile: null,
            backFile: null,
            ...patch,
          };

      return {
        ...current,
        [employeeId]: nextDraft,
      };
    });
  }

  function setCustomFieldValue(field: CustomField, value: unknown) {
    setMetadata((current) => ({
      ...current,
      [field.field_key]: value,
    }));
  }

  function validate() {
    if (!selectedType) return "Select the Training Type.";
    if (selectedEmployeeIds.length === 0) return "Select at least one employee.";

    if (selectedType.requires_project && !projectId) {
      return "Select the project.";
    }

    if (selectedType.requires_issuer && !provider.trim()) {
      return "Enter the provider / issuing organisation.";
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
      if (field.required) {
        const value = metadata[field.field_key];
        const missing =
          value === null ||
          value === undefined ||
          value === "" ||
          (Array.isArray(value) && value.length === 0) ||
          value === false;

        if (missing) return `Enter ${field.label}.`;
      }
    }

    for (const employeeId of selectedEmployeeIds) {
      const draft = drafts[employeeId] ?? {
        certificateNumber: "",
        file: null,
        frontFile: null,
        backFile: null,
      };

      const employee = employees.find((item) => item.id === employeeId);

      if (
        selectedType.requires_certificate_number &&
        !draft.certificateNumber.trim()
      ) {
        return `Enter the certificate/licence number for ${
          employee?.full_name ?? "each selected employee"
        }.`;
      }

      if (selectedType.requires_document) {
        if (selectedType.document_upload_type === "front_back") {
          if (!draft.frontFile || !draft.backFile) {
            return `Upload front and back evidence for ${
              employee?.full_name ?? "each selected employee"
            }.`;
          }
        } else if (!draft.file) {
          return `Upload evidence for ${
            employee?.full_name ?? "each selected employee"
          }.`;
        }
      }
    }

    return null;
  }

  async function submit() {
    const validation = validate();

    if (validation) {
      setMessage({ tone: "error", text: validation });
      return;
    }

    if (!selectedType) return;

    setSubmitting(true);
    setMessage(null);
    setProgress({ done: 0, total: selectedEmployees.length });

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: batch, error: batchError } = await supabase
        .from("training_upload_batches")
        .insert({
          training_type_id: selectedType.id,
          project_id: projectId || null,
          provider: provider.trim() || null,
          course_reference: null,
          issue_date: issueDate || null,
          expiry_date:
            selectedType.validity_mode === "never"
              ? null
              : expiryDate || null,
          metadata,
          source: "website_bulk",
          created_by: user?.id ?? null,
          created_by_name:
            clean(user?.user_metadata?.full_name) ||
            clean(user?.email) ||
            null,
        })
        .select("id")
        .single();

      if (batchError) throw new Error(batchError.message);

      const selectedOptionCodes = typeOptions
        .filter((option) => selectedOptionIds.includes(option.id))
        .map((option) => option.code);

      const failures: string[] = [];

      for (let index = 0; index < selectedEmployees.length; index += 1) {
        const employee = selectedEmployees[index];
        const draft = drafts[employee.id];

        try {
          const form = new FormData();

          form.set("employeeId", employee.id);
          form.set("trainingTypeId", selectedType.id);
          form.set("projectId", projectId);
          form.set("issuer", provider.trim());
          form.set(
            "certificateNumber",
            draft?.certificateNumber.trim() || "",
          );
          form.set("issueDate", issueDate);
          form.set("expiryDate", expiryDate);
          form.set("notes", notes.trim());
          form.set("selectedOptionIds", JSON.stringify(selectedOptionIds));
          form.set(
            "selectedOptionCodes",
            JSON.stringify(selectedOptionCodes),
          );
          form.set("metadata", JSON.stringify(metadata));
          form.set(
            "documentUploadType",
            selectedType.document_upload_type || "single",
          );
          form.set("replacementMode", "none");
          form.set("batchId", batch.id);
          form.set("source", "website_bulk");

          if (draft?.file) form.set("file", draft.file);
          if (draft?.frontFile) form.set("frontFile", draft.frontFile);
          if (draft?.backFile) form.set("backFile", draft.backFile);

          const response = await apiFetch(
            "/api/training/records/upload",
            {
              method: "POST",
              body: form,
            },
          );

          const result = await response.json().catch(() => null);

          if (!response.ok) {
            throw new Error(
              result?.error || "Training record could not be uploaded.",
            );
          }
        } catch (error) {
          failures.push(
            `${employee.full_name}: ${
              error instanceof Error
                ? error.message
                : "Upload failed"
            }`,
          );
        } finally {
          setProgress({
            done: index + 1,
            total: selectedEmployees.length,
          });
        }
      }

      if (failures.length > 0) {
        setMessage({
          tone: "error",
          text: `${selectedEmployees.length - failures.length} uploaded; ${
            failures.length
          } failed. ${failures.join(" | ")}`,
        });
      } else {
        setMessage({
          tone: "success",
          text: `${selectedEmployees.length} training records submitted as one batch. Records requiring review are now in the Verification Queue.`,
        });

        setSelectedEmployeeIds([]);
        setDrafts({});
        setSelectedOptionIds([]);
        setNotes("");
      }
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Bulk Training Upload failed.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="animate-spin text-slate-400" size={30} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-blue-700">
                <Users size={17} />
                Training administration
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                Bulk Training / VOC Upload
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                Select everyone who completed the same course, enter the common
                dates/provider once, then add each person&apos;s certificate
                number and evidence.
              </p>
            </div>

            <div className="flex gap-2">
              <Link
                href="/people/training"
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700"
              >
                Training Register
              </Link>
              <Link
                href="/people/training/configuration/workflow"
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700"
              >
                Workflow Settings
              </Link>
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

        <section className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="space-y-6">
            <Card
              title="1. Course / qualification"
              description="These values apply to every selected employee."
            >
              <div className="space-y-4">
                <Field label="Training Type" required>
                  <select
                    className={inputClass}
                    value={selectedTypeId}
                    onChange={(event) =>
                      setSelectedTypeId(event.target.value)
                    }
                  >
                    <option value="">Select...</option>
                    {types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                        {type.short_code
                          ? ` (${type.short_code})`
                          : ""}
                      </option>
                    ))}
                  </select>
                </Field>

                {selectedType?.requires_project ? (
                  <Field label="Project" required>
                    <select
                      className={inputClass}
                      value={projectId}
                      onChange={(event) =>
                        setProjectId(event.target.value)
                      }
                    >
                      <option value="">Select...</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.project_number
                            ? `${project.project_number} - `
                            : ""}
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}

                {selectedType?.requires_issuer ? (
                  <Field label="Provider / Issuer" required>
                    <input
                      className={inputClass}
                      value={provider}
                      onChange={(event) =>
                        setProvider(event.target.value)
                      }
                    />
                  </Field>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Issue Date"
                    required={Boolean(selectedType?.requires_issue_date)}
                  >
                    <input
                      type="date"
                      className={inputClass}
                      value={issueDate}
                      onChange={(event) =>
                        setIssueDate(event.target.value)
                      }
                    />
                  </Field>

                  {selectedType?.validity_mode !== "never" ? (
                    <Field
                      label="Expiry Date"
                      required={Boolean(
                        selectedType?.requires_expiry_date,
                      )}
                    >
                      <input
                        type="date"
                        className={inputClass}
                        value={expiryDate}
                        readOnly={
                          selectedType?.validity_mode === "automatic"
                        }
                        onChange={(event) =>
                          setExpiryDate(event.target.value)
                        }
                      />
                    </Field>
                  ) : null}
                </div>

                {typeOptions.length > 0 ? (
                  <div>
                    <div className="mb-2 text-sm font-black text-slate-800">
                      Classes / Options
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {typeOptions.map((option) => {
                        const checked =
                          selectedOptionIds.includes(option.id);

                        return (
                          <label
                            key={option.id}
                            className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-bold ${
                              checked
                                ? "border-blue-300 bg-blue-50 text-blue-800"
                                : "border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mr-2"
                              checked={checked}
                              onChange={() =>
                                setSelectedOptionIds((current) =>
                                  checked
                                    ? current.filter(
                                        (id) => id !== option.id,
                                      )
                                    : [...current, option.id],
                                )
                              }
                            />
                            {option.code || option.name}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {typeFields.map((field) => (
                  <DynamicField
                    key={field.id}
                    field={field}
                    value={metadata[field.field_key]}
                    onChange={(value) =>
                      setCustomFieldValue(field, value)
                    }
                  />
                ))}

                <Field label="Notes">
                  <textarea
                    className={`${inputClass} min-h-24`}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </Field>
              </div>
            </Card>

            <Card
              title="2. Select employees"
              description={`${selectedEmployeeIds.length} selected`}
            >
              <div className="relative mb-3">
                <Search
                  size={17}
                  className="absolute left-3 top-3.5 text-slate-400"
                />
                <input
                  className={`${inputClass} pl-10`}
                  placeholder="Search employee, payroll ID or role..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <div className="max-h-130 space-y-2 overflow-y-auto pr-1">
                {filteredEmployees.map((employee) => {
                  const checked =
                    selectedEmployeeIds.includes(employee.id);

                  return (
                    <label
                      key={employee.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                        checked
                          ? "border-blue-300 bg-blue-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEmployee(employee.id)}
                        className="h-5 w-5 rounded border-slate-300"
                      />
                      <div>
                        <div className="font-black text-slate-900">
                          {employee.full_name}
                        </div>
                        <div className="text-xs font-semibold text-slate-500">
                          {employee.payroll_id || "No Payroll ID"}
                          {employee.role ? ` · ${employee.role}` : ""}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card
              title="3. Individual evidence"
              description="Only the employee-specific values are entered here."
            >
              {selectedEmployees.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                  <FileUp
                    size={30}
                    className="mx-auto text-slate-400"
                  />
                  <div className="mt-3 font-black text-slate-900">
                    Select employees first
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    Their certificate/evidence rows will appear here.
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedEmployees.map((employee) => {
                    const draft =
                      drafts[employee.id] ?? {
                        certificateNumber: "",
                        file: null,
                        frontFile: null,
                        backFile: null,
                      };

                    return (
                      <div
                        key={employee.id}
                        className="rounded-2xl border border-slate-200 p-4"
                      >
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div>
                            <div className="font-black text-slate-950">
                              {employee.full_name}
                            </div>
                            <div className="text-xs font-semibold text-slate-500">
                              {employee.payroll_id || "No Payroll ID"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              toggleEmployee(employee.id)
                            }
                            className="rounded-lg border border-slate-200 p-2 text-slate-500"
                          >
                            <X size={15} />
                          </button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          {selectedType?.requires_certificate_number ? (
                            <Field
                              label="Certificate / Licence No."
                              required
                            >
                              <input
                                className={inputClass}
                                value={draft.certificateNumber}
                                onChange={(event) =>
                                  updateDraft(employee.id, {
                                    certificateNumber:
                                      event.target.value,
                                  })
                                }
                              />
                            </Field>
                          ) : null}

                          {selectedType?.requires_document &&
                          selectedType.document_upload_type ===
                            "front_back" ? (
                            <>
                              <Field label="Front" required>
                                <input
                                  type="file"
                                  className={fileInputClass}
                                  onChange={(event) =>
                                    updateDraft(employee.id, {
                                      frontFile:
                                        event.target.files?.[0] ??
                                        null,
                                    })
                                  }
                                />
                              </Field>
                              <Field label="Back" required>
                                <input
                                  type="file"
                                  className={fileInputClass}
                                  onChange={(event) =>
                                    updateDraft(employee.id, {
                                      backFile:
                                        event.target.files?.[0] ??
                                        null,
                                    })
                                  }
                                />
                              </Field>
                            </>
                          ) : selectedType?.requires_document ? (
                            <Field label="Certificate / Evidence" required>
                              <input
                                type="file"
                                className={fileInputClass}
                                onChange={(event) =>
                                  updateDraft(employee.id, {
                                    file:
                                      event.target.files?.[0] ??
                                      null,
                                  })
                                }
                              />
                            </Field>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <div className="sticky bottom-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-xl">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                    Batch
                  </div>
                  <div className="mt-1 text-xl font-black text-slate-950">
                    {selectedEmployeeIds.length} employee
                    {selectedEmployeeIds.length === 1 ? "" : "s"}
                  </div>
                  {submitting ? (
                    <div className="mt-1 text-sm font-semibold text-blue-700">
                      Uploading {progress.done} of {progress.total}...
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={
                    submitting || selectedEmployeeIds.length === 0
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-6 py-4 text-sm font-black text-white shadow-lg shadow-blue-200 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <UploadCloud size={18} />
                  )}
                  {submitting
                    ? "Submitting Batch..."
                    : "Submit Training Batch"}
                </button>
              </div>
            </div>
          </div>
        </section>
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
        {description ? (
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {description}
          </p>
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
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black text-slate-800">
        {label}
        {required ? <span className="ml-1 text-rose-600">*</span> : null}
      </span>
      {children}
    </label>
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
  const options = optionsArray(field.options);

  if (field.field_type === "checkbox") {
    return (
      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <input
          type="checkbox"
          className="h-5 w-5 rounded border-slate-300"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="text-sm font-black text-slate-800">
          {field.label}
          {field.required ? (
            <span className="ml-1 text-rose-600">*</span>
          ) : null}
        </span>
      </label>
    );
  }

  if (field.field_type === "select") {
    return (
      <Field label={field.label} required={field.required}>
        <select
          className={inputClass}
          value={clean(value)}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select...</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  if (field.field_type === "multiselect") {
    const selected = Array.isArray(value)
      ? value.map(String)
      : [];

    return (
      <div>
        <div className="mb-2 text-sm font-black text-slate-800">
          {field.label}
          {field.required ? (
            <span className="ml-1 text-rose-600">*</span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const checked = selected.includes(option);
            return (
              <label
                key={option}
                className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-bold ${
                  checked
                    ? "border-blue-300 bg-blue-50 text-blue-800"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked
                        ? selected.filter((item) => item !== option)
                        : [...selected, option],
                    )
                  }
                />
                {option}
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  const inputType =
    field.field_type === "number"
      ? "number"
      : field.field_type === "date"
        ? "date"
        : "text";

  if (field.field_type === "textarea") {
    return (
      <Field label={field.label} required={field.required}>
        <textarea
          className={`${inputClass} min-h-24`}
          placeholder={field.placeholder ?? ""}
          value={clean(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      </Field>
    );
  }

  return (
    <Field label={field.label} required={field.required}>
      <input
        type={inputType}
        className={inputClass}
        placeholder={field.placeholder ?? ""}
        value={clean(value)}
        onChange={(event) =>
          onChange(
            field.field_type === "number"
              ? Number(event.target.value)
              : event.target.value,
          )
        }
      />
    </Field>
  );
}

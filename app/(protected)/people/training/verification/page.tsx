"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type RecordRow = {
  id: string;
  employee_id: string;
  training_type_id: string | null;
  training_name: string;
  training_short_code: string | null;
  category: string | null;
  certificate_number: string | null;
  provider: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  does_not_expire: boolean | null;
  notes: string | null;
  project_id: string | null;
  metadata: Record<string, unknown> | null;
  option_codes: string[] | null;
  workflow_status: string | null;
  record_status: string | null;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
  submitted_at: string | null;
  review_comment: string | null;
};

type Employee = {
  id: string;
  payroll_id: string | null;
  full_name: string;
};

type Project = {
  id: string;
  name: string;
  project_number: string | null;
};

type DocumentRow = {
  id: string;
  training_record_id: string;
  document_side: string | null;
  generated_file_name: string;
  original_file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  staging_path: string | null;
  sharepoint_web_url: string | null;
  active: boolean | null;
};

type Message = {
  tone: "success" | "error";
  text: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function dateTimeLabel(value: string | null) {
  if (!value) return "—";
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

function bytesLabel(value: number | null) {
  if (!value || value <= 0) return "";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TrainingVerificationPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [records, setRecords] = useState<RecordRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
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
    const response = await apiFetch("/api/training/review/queue");
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        payload?.error || "Unable to load the Verification Queue.",
      );
    }

    const loadedRecords = (payload?.records ?? []) as RecordRow[];

    setRecords(loadedRecords);
    setEmployees((payload?.employees ?? []) as Employee[]);
    setProjects((payload?.projects ?? []) as Project[]);
    setDocuments((payload?.documents ?? []) as DocumentRow[]);

    const requestedRecordId =
      typeof window !== "undefined"
        ? clean(
            new URLSearchParams(window.location.search).get(
              "training_record_id",
            ) ||
              new URLSearchParams(window.location.search).get(
                "recordId",
              ),
          )
        : "";

    setSelectedId((current) => {
      if (
        requestedRecordId &&
        loadedRecords.some((row) => row.id === requestedRecordId)
      ) {
        return requestedRecordId;
      }

      if (
        current &&
        loadedRecords.some((row) => row.id === current)
      ) {
        return current;
      }

      return loadedRecords[0]?.id ?? null;
    });
  }, [apiFetch]);

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
              : "Unable to load the Verification Queue.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData]);

  const employeeById = useMemo(
    () => new Map(employees.map((item) => [item.id, item])),
    [employees],
  );

  const projectById = useMemo(
    () => new Map(projects.map((item) => [item.id, item])),
    [projects],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return records.filter((record) => {
      if (!query) return true;

      const employee = employeeById.get(record.employee_id);
      const project = record.project_id
        ? projectById.get(record.project_id)
        : null;

      return [
        employee?.full_name,
        employee?.payroll_id,
        record.training_name,
        record.training_short_code,
        record.certificate_number,
        record.provider,
        project?.name,
        project?.project_number,
        record.workflow_status,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [employeeById, projectById, records, search]);

  const selected =
    records.find((record) => record.id === selectedId) ?? null;

  const selectedEmployee = selected
    ? employeeById.get(selected.employee_id)
    : null;

  const selectedProject =
    selected?.project_id
      ? projectById.get(selected.project_id)
      : null;

  const selectedDocuments = selected
    ? documents.filter(
        (document) =>
          document.training_record_id === selected.id &&
          document.active !== false,
      )
    : [];

  async function review(action: "approve" | "request_changes" | "reject") {
    if (!selected) return;

    if (
      (action === "request_changes" || action === "reject") &&
      !reviewComment.trim()
    ) {
      setMessage({
        tone: "error",
        text:
          action === "reject"
            ? "Enter the reason for rejection."
            : "Describe the changes required.",
      });
      return;
    }

    if (
      action === "approve" &&
      !window.confirm(
        `Approve ${selected.training_name} for ${
          selectedEmployee?.full_name ?? "this employee"
        } and publish the staged evidence to SharePoint?`,
      )
    ) {
      return;
    }

    setBusyAction(action);
    setMessage(null);

    try {
      const response = await apiFetch(
        `/api/training/review/${selected.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            comment: reviewComment.trim(),
          }),
        },
      );

      const responseText = await response.text();

      let payload: {
        error?: string;
        notificationWarning?: string | null;
        workflowStatus?: string;
      } | null = null;

      if (responseText) {
        try {
          payload = JSON.parse(responseText) as {
            error?: string;
            notificationWarning?: string | null;
            workflowStatus?: string;
          };
        } catch {
          payload = null;
        }
      }

      if (!response.ok) {
        const serverMessage = clean(payload?.error);
        const rawMessage = clean(responseText);

        console.error("Training review action failed", {
          status: response.status,
          statusText: response.statusText,
          response: rawMessage,
          recordId: selected.id,
          action,
        });

        throw new Error(
          serverMessage ||
            (rawMessage && !rawMessage.startsWith("<")
              ? `Review failed (${response.status}): ${rawMessage.slice(0, 500)}`
              : `Review failed (${response.status} ${response.statusText}). The review API returned HTML instead of JSON. Confirm app/api/training/review/[recordId]/route.ts exists and check the Next.js terminal for a route compile error.`),
        );
      }

      const successText =
        action === "approve"
          ? "Training record approved and published to SharePoint."
          : action === "request_changes"
            ? "Changes requested and saved."
            : "Training record rejected and saved.";

      setMessage({
        tone: payload?.notificationWarning ? "error" : "success",
        text: payload?.notificationWarning
          ? `${successText} ${payload.notificationWarning}`
          : successText,
      });

      setReviewComment("");
      await loadData();
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to process the Training review.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function notifyReviewers() {
    if (!selected) return;

    setBusyAction("notify");
    setMessage(null);

    try {
      const response = await apiFetch(
        `/api/training/review/${selected.id}/notify`,
        {
          method: "POST",
        },
      );

      const responseText = await response.text();

      let payload: {
        error?: string;
        notified?: number;
        alreadyNotified?: number;
        pushAttempted?: number;
        emailSent?: number;
        message?: string;
      } | null = null;

      if (responseText) {
        try {
          payload = JSON.parse(responseText) as {
            error?: string;
            notified?: number;
            alreadyNotified?: number;
            pushAttempted?: number;
            message?: string;
          };
        } catch {
          payload = null;
        }
      }

      if (!response.ok) {
        const serverMessage = clean(payload?.error);
        const rawMessage = clean(responseText);

        throw new Error(
          serverMessage ||
            (rawMessage && !rawMessage.startsWith("<")
              ? `Notification failed (${response.status}): ${rawMessage.slice(0, 500)}`
              : `Notification failed (${response.status} ${response.statusText}). Confirm app/api/training/review/[recordId]/notify/route.ts exists.`),
        );
      }

      const notified = Number(payload?.notified ?? 0);
      const already = Number(payload?.alreadyNotified ?? 0);
      const pushAttempted = Number(payload?.pushAttempted ?? 0);
      const emailSent = Number(payload?.emailSent ?? 0);

      setMessage({
        tone: "success",
        text:
          payload?.message ||
          `${notified} reviewer notification${notified === 1 ? "" : "s"} created${
            already > 0
              ? `; ${already} reviewer${already === 1 ? "" : "s"} already had one`
              : ""
          }${pushAttempted > 0 ? `; ${pushAttempted} push notification${pushAttempted === 1 ? "" : "s"} attempted` : ""}${
            emailSent > 0
              ? `; ${emailSent} reviewer email${emailSent === 1 ? "" : "s"} sent`
              : ""
          }.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to notify Training reviewers.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function openEvidence(document: DocumentRow) {
    try {
      const response = await apiFetch(
        `/api/training/documents/${document.id}`,
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error || "The evidence file could not be opened.",
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");

      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to open the evidence file.",
      });
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
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                <ShieldCheck size={17} />
                Training assurance
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                Verification Queue
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Review employee evidence before it becomes the approved record
                and is published to the configured SharePoint employee folder.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/people/training/configuration/workflow"
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700"
              >
                Reviewer Settings
              </Link>
              <button
                type="button"
                onClick={() => void notifyReviewers()}
                disabled={!selected || Boolean(busyAction)}
                className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-800 disabled:opacity-50"
              >
                {busyAction === "notify" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <BellRing size={16} />
                )}
                Notify Reviewers
              </button>
              <button
                type="button"
                onClick={() => void loadData()}
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

        <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-3.5 text-slate-400"
                />
                <input
                  className={`${inputClass} pl-9`}
                  placeholder="Search queue..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="mt-3 text-xs font-black uppercase tracking-wide text-slate-500">
                {filtered.length} item{filtered.length === 1 ? "" : "s"} awaiting action
              </div>
            </div>

            <div className="max-h-[720px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-10 text-center">
                  <CheckCircle2
                    size={34}
                    className="mx-auto text-emerald-500"
                  />
                  <div className="mt-3 font-black text-slate-900">
                    Queue clear
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    No Training records currently require review.
                  </div>
                </div>
              ) : (
                filtered.map((record) => {
                  const employee = employeeById.get(record.employee_id);
                  const active = selectedId === record.id;

                  return (
                    <button
                      key={record.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(record.id);
                        setReviewComment(record.review_comment ?? "");
                      }}
                      className={`block w-full border-b border-slate-100 p-4 text-left last:border-b-0 ${
                        active ? "bg-blue-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-black text-slate-950">
                            {employee?.full_name ?? "Unknown employee"}
                          </div>
                          <div className="mt-1 text-sm font-bold text-slate-700">
                            {record.training_name}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Submitted {dateTimeLabel(record.submitted_at)}
                          </div>
                        </div>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${
                            record.workflow_status === "changes_required"
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : "border-blue-200 bg-blue-50 text-blue-800"
                          }`}
                        >
                          {record.workflow_status === "changes_required"
                            ? "Changes"
                            : "Pending"}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            {!selected ? (
              <div className="flex min-h-96 items-center justify-center text-center">
                <div>
                  <ShieldCheck
                    size={36}
                    className="mx-auto text-slate-300"
                  />
                  <div className="mt-3 font-black text-slate-900">
                    Select a record
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    Choose a queue item to review the evidence.
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                      {selectedEmployee?.payroll_id || "Employee"}
                    </div>
                    <h2 className="mt-1 text-2xl font-black text-slate-950">
                      {selectedEmployee?.full_name || "Unknown employee"}
                    </h2>
                    <div className="mt-1 text-base font-bold text-blue-700">
                      {selected.training_name}
                      {selected.training_short_code
                        ? ` · ${selected.training_short_code}`
                        : ""}
                    </div>
                  </div>
                  <div className="text-right text-xs font-semibold text-slate-500">
                    Submitted by
                    <div className="mt-1 text-sm font-black text-slate-900">
                      {selected.submitted_by_name ||
                        selected.submitted_by_email ||
                        "TTTracker User"}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Info label="Certificate / Licence No." value={selected.certificate_number || "—"} />
                  <Info label="Provider" value={selected.provider || "—"} />
                  <Info label="Issue Date" value={dateLabel(selected.issue_date)} />
                  <Info
                    label="Expiry Date"
                    value={
                      selected.does_not_expire
                        ? "Does not expire"
                        : dateLabel(selected.expiry_date)
                    }
                  />
                  <Info
                    label="Project"
                    value={
                      selectedProject
                        ? `${
                            selectedProject.project_number
                              ? `${selectedProject.project_number} - `
                              : ""
                          }${selectedProject.name}`
                        : "Company / not project-specific"
                    }
                  />
                  <Info
                    label="Classes / Options"
                    value={
                      selected.option_codes?.length
                        ? selected.option_codes.join(", ")
                        : "—"
                    }
                  />
                </div>

                {selected.metadata &&
                Object.keys(selected.metadata).length > 0 ? (
                  <div>
                    <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">
                      Additional data
                    </h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      {Object.entries(selected.metadata)
                        .filter(
                          ([key]) =>
                            !["replacement_mode"].includes(key),
                        )
                        .map(([key, value]) => (
                          <Info
                            key={key}
                            label={key.replaceAll("_", " ")}
                            value={
                              Array.isArray(value)
                                ? value.join(", ")
                                : String(value ?? "—")
                            }
                          />
                        ))}
                    </div>
                  </div>
                ) : null}

                {selected.notes ? (
                  <div>
                    <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-slate-500">
                      Notes
                    </h3>
                    <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                      {selected.notes}
                    </div>
                  </div>
                ) : null}

                <div>
                  <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">
                    Evidence
                  </h3>

                  {selectedDocuments.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
                      No document is attached to this record.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedDocuments.map((document) => (
                        <div
                          key={document.id}
                          className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex items-start gap-3">
                            <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                              <FileText size={18} />
                            </div>
                            <div>
                              <div className="font-black text-slate-900">
                                {document.generated_file_name}
                              </div>
                              <div className="mt-1 text-xs font-semibold text-slate-500">
                                {document.document_side || "document"}
                                {document.file_size_bytes
                                  ? ` · ${bytesLabel(
                                      document.file_size_bytes,
                                    )}`
                                  : ""}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => void openEvidence(document)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50"
                          >
                            <Eye size={16} />
                            Open Evidence
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block">
                    <span className="mb-2 block text-sm font-black text-slate-800">
                      Review comment
                    </span>
                    <textarea
                      className={`${inputClass} min-h-28`}
                      placeholder="Required when requesting changes or rejecting..."
                      value={reviewComment}
                      onChange={(event) =>
                        setReviewComment(event.target.value)
                      }
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => void review("reject")}
                    disabled={Boolean(busyAction)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm font-black text-rose-700 disabled:opacity-50"
                  >
                    {busyAction === "reject" ? (
                      <Loader2 size={17} className="animate-spin" />
                    ) : (
                      <XCircle size={17} />
                    )}
                    Reject
                  </button>

                  <button
                    type="button"
                    onClick={() => void review("request_changes")}
                    disabled={Boolean(busyAction)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm font-black text-amber-800 disabled:opacity-50"
                  >
                    {busyAction === "request_changes" ? (
                      <Loader2 size={17} className="animate-spin" />
                    ) : (
                      <AlertTriangle size={17} />
                    )}
                    Request Changes
                  </button>

                  <button
                    type="button"
                    onClick={() => void review("approve")}
                    disabled={Boolean(busyAction)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3.5 text-sm font-black text-white disabled:opacity-50"
                  >
                    {busyAction === "approve" ? (
                      <Loader2 size={17} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={17} />
                    )}
                    Approve & Publish
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </AppShell>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-black text-slate-900">{value}</div>
    </div>
  );
}

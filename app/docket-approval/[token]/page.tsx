"use client";

import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
} from "lucide-react";

type ClientContentKey =
  | "daily_site_summary"
  | "rfi_references"
  | "progress"
  | "workforce"
  | "raw_manhours"
  | "plant"
  | "mobilisation"
  | "travel"
  | "delays"
  | "missing_materials"
  | "received_materials"
  | "bundle_transfers"
  | "safety";

type ClientBundleTransfer = {
  id: string;
  transferNo: number | null;
  bundleNo: string;
  bundleSection: string | null;
  quantity: number;
  sourceTowerId: string;
  sourceTowerName: string;
  destinationTowerId: string;
  destinationTowerName: string;
  transferredAt: string | null;
  receivedAt: string | null;
  replacement: {
    originalQty: number;
    deliveredQty: number;
    remainingQty: number;
    status: "Outstanding" | "Partially Replaced" | "Replaced";
  };
  notes: string | null;
};

type ApprovalResponse = {
  success: boolean;
  docket: {
    docketId: string;
    status: string | null;
    revision: number | null;
    docketDate: string | null;
    crew: string | null;
    leadingHand: string | null;
    bcRepresentative: string | null;
    bcRepresentativeEmail: string | null;
    bcApprovedBy: string | null;
    bcApprovedEmail: string | null;
    bcApprovedAt: string | null;
    project: {
      name: string | null;
      projectNumber: string | null;
      client: string | null;
    };
    tower: {
      name: string;
      towersWorked?: string[];
    };
    towersWorked?: string[];
    clientContentKeys?: ClientContentKey[];
    visibleSections?: ClientContentKey[];
    dailySiteSummary?: string | null;
    rfiReferences?: string[];
    bundleTransfers?: ClientBundleTransfer[];
    recipient: {
      name: string | null;
      email: string | null;
    };
    expiresAt: string | null;
  };
};

type SubmitResult = {
  success?: boolean;
  status?: string;
  error?: string;
  warning?: string | null;
  final?: {
    fileName?: string | null;
    webUrl?: string | null;
  };
};

const CLIENT_CONTENT_OPTIONS: Array<{
  key: ClientContentKey;
  label: string;
}> = [
  { key: "daily_site_summary", label: "Daily Site Summary" },
  { key: "rfi_references", label: "RFI References" },
  { key: "progress", label: "Progress" },
  { key: "workforce", label: "Workforce" },
  { key: "raw_manhours", label: "Raw Manhours" },
  { key: "plant", label: "Plant & Equipment" },
  { key: "mobilisation", label: "Mobilisation" },
  { key: "travel", label: "Travel" },
  { key: "delays", label: "Delays / Disruptions" },
  { key: "missing_materials", label: "Missing Materials" },
  { key: "received_materials", label: "Materials Received" },
  { key: "bundle_transfers", label: "Bundle Transfers" },
  { key: "safety", label: "Safety / Incidents" },
];

function clientContentLabel(key: ClientContentKey) {
  return (
    CLIENT_CONTENT_OPTIONS.find((option) => option.key === key)?.label ||
    key.replaceAll("_", " ")
  );
}

function transferStatusClasses(
  status: ClientBundleTransfer["replacement"]["status"],
) {
  if (status === "Replaced") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "Partially Replaced") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-rose-200 bg-rose-50 text-rose-700";
}

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null) {
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

function statusLabel(value: string | null) {
  switch (value) {
    case "client_pending":
      return "Pending Client Approval";
    case "final":
      return "Approved";
    case "client_changes_requested":
      return "Changes Required";
    default:
      return "Daily Docket";
  }
}

function signatureApproxBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

export default function ClientDailyDocketApprovalPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const pdfUrl = token ? `/api/daily-dockets/client/${encodeURIComponent(token)}/pdf` : "#";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [docket, setDocket] = useState<ApprovalResponse["docket"] | null>(null);

  const [comments, setComments] = useState("");
  const [signature, setSignature] = useState("");
  const [submitting, setSubmitting] = useState<"approve" | "request_changes" | null>(
    null,
  );
  const [completed, setCompleted] = useState<SubmitResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        const response = await fetch(
          `/api/daily-dockets/client/${encodeURIComponent(token)}`,
          {
            method: "GET",
            cache: "no-store",
          },
        );

        const payload = (await response.json().catch(() => null)) as
          | ApprovalResponse
          | { error?: string }
          | null;

        if (!response.ok) {
          throw new Error(
            payload && "error" in payload && payload.error
              ? payload.error
              : "This Daily Docket approval link could not be loaded.",
          );
        }

        if (
          !payload ||
          !("success" in payload) ||
          !payload.success ||
          !("docket" in payload)
        ) {
          throw new Error("This Daily Docket approval link could not be loaded.");
        }

        if (cancelled) return;

        setDocket(payload.docket);
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "This Daily Docket approval link could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = useCallback(
    async (action: "approve" | "request_changes") => {
      if (!token || !docket) return;

      if (action === "approve" && !signature) {
        setSubmitError("Please sign the Daily Docket before approving it.");
        return;
      }

      if (action === "approve" && signatureApproxBytes(signature) > 400 * 1024) {
        setSubmitError("Your signature is too large. Clear it and sign again.");
        return;
      }

      if (action === "request_changes" && !comments.trim()) {
        setSubmitError(
          "Please enter the changes required before sending the docket back.",
        );
        return;
      }

      const confirmed = window.confirm(
        action === "approve"
          ? "Approve this Daily Docket? Your name, signature and approval time will be recorded on the final copy."
          : "Send these requested changes back to BC for review?",
      );

      if (!confirmed) return;

      setSubmitError(null);
      setSubmitting(action);

      try {
        const response = await fetch(
          `/api/daily-dockets/client/${encodeURIComponent(token)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action,
              signatureDataUrl: action === "approve" ? signature : undefined,
              comments: comments.trim() || undefined,
            }),
          },
        );

        const payload = (await response.json().catch(() => null)) as
          | SubmitResult
          | null;

        if (!response.ok) {
          throw new Error(
            payload?.error || "Your response could not be submitted.",
          );
        }

        setCompleted(payload ?? { success: true });
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? error.message
            : "Your response could not be submitted.",
        );
      } finally {
        setSubmitting(null);
      }
    },
    [comments, docket, signature, token],
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-700 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading Daily Docket
          </div>
        </div>
      </main>
    );
  }

  if (loadError || !docket) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-2xl">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <FileCheck2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">TTTracker</p>
                  <p className="text-xs text-slate-500">Daily Docket Approval</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h1 className="mt-4 text-xl font-bold text-slate-900">
                Approval link unavailable
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {loadError ||
                  "This Daily Docket approval link is no longer available."}
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (completed) {
    const approved = completed.status === "final";

    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-2xl">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <FileCheck2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">TTTracker</p>
                  <p className="text-xs text-slate-500">Daily Docket Approval</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h1 className="mt-5 text-2xl font-bold text-slate-900">
                {approved ? "Daily Docket approved" : "Changes requested"}
              </h1>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
                {approved
                  ? "Your approval has been recorded. The final Daily Docket has been generated and distributed to the configured recipients."
                  : "Your requested changes have been sent back to the TTTracker project team for review."}
              </p>

              <div className="mt-7 rounded-xl bg-slate-50 px-5 py-4 text-left">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SummaryItem label="Project" value={docket.project.name || "—"} />
                  <SummaryItem label="Tower" value={docket.tower.name} />
                  <SummaryItem
                    label="Docket Date"
                    value={formatDate(docket.docketDate)}
                  />
                  <SummaryItem
                    label="Revision"
                    value={`R${String(Math.max(1, Number(docket.revision || 1))).padStart(2, "0")}`}
                  />
                  <SummaryItem
                    label="Client Representative"
                    value={docket.recipient.name || "—"}
                  />
                  <SummaryItem
                    label="Client Email"
                    value={docket.recipient.email || "—"}
                  />
                </div>
              </div>

              {completed.warning ? (
                <div className="mx-auto mt-6 max-w-lg rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-800">
                  {completed.warning}
                </div>
              ) : null}

              {approved && completed.final?.webUrl ? (
                <a
                  href={completed.final.webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Final Daily Docket
                </a>
              ) : null}

              <p className="mt-6 text-xs text-slate-500">
                You can close this page.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const visibleContentKeys =
    docket.visibleSections?.length
      ? docket.visibleSections
      : docket.clientContentKeys || [];

  const visibleContent = new Set<ClientContentKey>(visibleContentKeys);
  const towersWorked =
    docket.towersWorked?.length
      ? docket.towersWorked
      : docket.tower.towersWorked || [];
  const bundleTransfers = docket.bundleTransfers || [];

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">TTTracker</p>
              <p className="text-xs text-slate-500">Daily Docket Approval</p>
            </div>
          </div>

          <div className="hidden items-center gap-2 text-xs font-medium text-slate-500 sm:flex">
            <ShieldCheck className="h-4 w-4" />
            Secure approval
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-6">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      {docket.project.projectNumber || "Project"}
                    </p>
                    <h1 className="mt-1 text-2xl font-bold text-slate-900">
                      {docket.project.name || "Daily Docket"}
                    </h1>
                    <p className="mt-1 text-sm text-slate-600">
                      {docket.tower.name} · {formatDate(docket.docketDate)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                      R{String(Math.max(1, Number(docket.revision || 1))).padStart(2, "0")}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                      {statusLabel(docket.status)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid gap-px bg-slate-200 sm:grid-cols-2">
                <SummaryBlock
                  label="Tower"
                  value={docket.tower.name}
                />
                <SummaryBlock
                  label="Docket Date"
                  value={formatDate(docket.docketDate)}
                />
                {visibleContent.has("workforce") ? (
                  <>
                    <SummaryBlock
                      label="Crew"
                      value={docket.crew || "—"}
                    />
                    <SummaryBlock
                      label="Leading Hand"
                      value={docket.leadingHand || "—"}
                    />
                  </>
                ) : null}
                <SummaryBlock
                  label="BC Representative"
                  value={docket.bcRepresentative || "—"}
                  subvalue={docket.bcRepresentativeEmail || undefined}
                />
                <SummaryBlock
                  label="BC Approved By"
                  value={docket.bcApprovedBy || "—"}
                  subvalue={
                    [
                      docket.bcApprovedEmail,
                      docket.bcApprovedAt
                        ? formatDateTime(docket.bcApprovedAt)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  }
                />
              </div>

              {visibleContent.has("progress") && towersWorked.length > 1 ? (
                <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Towers Worked
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {towersWorked.map((towerWorked) => (
                      <span
                        key={towerWorked}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
                      >
                        {towerWorked}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Information included in this issue
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    These are the Daily Docket sections selected by BC for client review on this revision.
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {visibleContentKeys.length} section
                  {visibleContentKeys.length === 1 ? "" : "s"}
                </span>
              </div>

              {visibleContentKeys.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {visibleContentKeys.map((key) => (
                    <span
                      key={key}
                      className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800"
                    >
                      {clientContentLabel(key)}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  No client-visible sections were returned for this revision.
                </div>
              )}

              <p className="mt-4 text-xs leading-5 text-slate-500">
                The issued PDF is the controlled review document and contains the selected detailed sections.
              </p>
            </div>

            {visibleContent.has("daily_site_summary") ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-semibold text-slate-900">
                  Daily Site Summary
                </h2>
                {docket.dailySiteSummary ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {docket.dailySiteSummary}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    No Daily Site Summary was recorded.
                  </p>
                )}
              </div>
            ) : null}

            {visibleContent.has("rfi_references") ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-6 shadow-sm">
                <h2 className="text-base font-semibold text-slate-900">
                  RFI References
                </h2>
                {docket.rfiReferences?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {docket.rfiReferences.map((reference) => (
                      <span
                        key={reference}
                        className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-800"
                      >
                        {reference}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    No RFI references were recorded.
                  </p>
                )}
              </div>
            ) : null}

            {visibleContent.has("bundle_transfers") ? (
              <div className="rounded-2xl border border-blue-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      Bundle Transfers
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Bundles used at this workfront that were taken from another tower, including the source-tower replacement status.
                    </p>
                  </div>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                    {bundleTransfers.length} transfer
                    {bundleTransfers.length === 1 ? "" : "s"}
                  </span>
                </div>

                {bundleTransfers.length ? (
                  <div className="mt-4 space-y-3">
                    {bundleTransfers.map((transfer) => (
                      <div
                        key={transfer.id}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-semibold text-slate-900">
                              Bundle {transfer.bundleNo}
                              {transfer.bundleSection
                                ? ` · ${transfer.bundleSection}`
                                : ""}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              Taken from{" "}
                              <strong>{transfer.sourceTowerName}</strong>
                              {" · "}
                              Qty {transfer.quantity}
                            </p>
                            {transfer.receivedAt || transfer.transferredAt ? (
                              <p className="mt-1 text-xs text-slate-500">
                                {formatDateTime(
                                  transfer.receivedAt ||
                                    transfer.transferredAt,
                                )}
                              </p>
                            ) : null}
                          </div>

                          <span
                            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${transferStatusClasses(
                              transfer.replacement.status,
                            )}`}
                          >
                            Source replacement:{" "}
                            {transfer.replacement.status}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <TransferMetric
                            label="Taken"
                            value={transfer.replacement.originalQty}
                          />
                          <TransferMetric
                            label="Replaced"
                            value={transfer.replacement.deliveredQty}
                          />
                          <TransferMetric
                            label="Still Missing"
                            value={transfer.replacement.remainingQty}
                          />
                        </div>

                        {transfer.notes ? (
                          <p className="mt-3 text-sm leading-6 text-slate-600">
                            {transfer.notes}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    No bundles were recorded as taken from another tower on this Daily Docket.
                  </div>
                )}
              </div>
            ) : null}

            <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Daily Docket PDF</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Review the issued R{String(Math.max(1, Number(docket.revision || 1))).padStart(2, "0")} Daily Docket before submitting your response.
                  </p>
                </div>
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-300 bg-white px-4 py-2.5 text-sm font-semibold text-blue-900 shadow-sm transition hover:bg-blue-50">
                  <ExternalLink className="h-4 w-4" />
                  View Daily Docket PDF
                </a>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">
                Review acknowledgement
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                By approving this Daily Docket, you confirm that the docket has
                been reviewed and accepted on behalf of the client. Your configured name and email, signature and approval time will be recorded on the final copy.
              </p>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-700" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Secure approval link
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      This link is unique to this Daily Docket and will stop
                      working after it is completed, replaced or expires.
                    </p>
                    {docket.expiresAt ? (
                      <p className="mt-2 text-xs font-medium text-slate-700">
                        Expires {formatDateTime(docket.expiresAt)}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Client response
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Complete the details below to approve the docket or request
                  changes.
                </p>
              </div>

              <form
                className="mt-6 space-y-5"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  void submit("approve");
                }}
              >
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Client Representative
                  </p>
                  <p className="mt-2 text-sm font-bold text-slate-900">
                    {docket.recipient.name || "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {docket.recipient.email || "—"}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    This identity is fixed to the configured client contact for this secure approval link and cannot be edited.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="client-comments"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Comments
                  </label>
                  <textarea
                    id="client-comments"
                    value={comments}
                    disabled={submitting !== null}
                    onChange={(event) => setComments(event.target.value)}
                    rows={4}
                    className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    placeholder="Optional for approval. Required when requesting changes."
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label className="block text-sm font-medium text-slate-700">
                      Signature
                    </label>
                    {signature ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Signed
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2">
                    <SignaturePad
                      value={signature}
                      disabled={submitting !== null}
                      onChange={setSignature}
                    />
                  </div>
                </div>

                {submitError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {submitError}
                  </div>
                ) : null}

                <div className="grid gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={submitting !== null}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting === "approve" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileCheck2 className="h-4 w-4" />
                    )}
                    Approve Daily Docket
                  </button>

                  <button
                    type="button"
                    disabled={submitting !== null}
                    onClick={() => void submit("request_changes")}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting === "request_changes" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Request Changes
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function TransferMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

function SummaryBlock({
  label,
  value,
  subvalue,
}: {
  label: string;
  value: string;
  subvalue?: string;
}) {
  return (
    <div className="bg-white px-6 py-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
      {subvalue ? (
        <p className="mt-1 text-xs text-slate-500">{subvalue}</p>
      ) : null}
    </div>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function SignaturePad({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const prepareCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);

    const nextWidth = Math.max(1, Math.round(rect.width * ratio));
    const nextHeight = Math.max(1, Math.round(rect.height * ratio));

    if (canvas.width === nextWidth && canvas.height === nextHeight) return;

    const previous = value;

    canvas.width = nextWidth;
    canvas.height = nextHeight;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2;
    context.strokeStyle = "#0f172a";

    if (previous) {
      const image = new Image();
      image.onload = () => {
        const currentCanvas = canvasRef.current;
        const currentContext = currentCanvas?.getContext("2d");
        if (!currentCanvas || !currentContext) return;

        const currentRect = currentCanvas.getBoundingClientRect();
        const currentRatio = Math.max(window.devicePixelRatio || 1, 1);

        currentContext.setTransform(
          currentRatio,
          0,
          0,
          currentRatio,
          0,
          0,
        );
        currentContext.drawImage(
          image,
          0,
          0,
          currentRect.width,
          currentRect.height,
        );
      };
      image.src = previous;
    }
  }, [value]);

  useEffect(() => {
    prepareCanvas();

    const handleResize = () => prepareCanvas();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [prepareCanvas]);

  const pointFromEvent = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const startDrawing = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(event);
  };

  const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || !drawingRef.current) return;

    const canvas = canvasRef.current;
    const previousPoint = lastPointRef.current;
    const point = pointFromEvent(event);

    if (!canvas || !previousPoint || !point) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.beginPath();
    context.moveTo(previousPoint.x, previousPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();

    lastPointRef.current = point;
  };

  const finishDrawing = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas || !drawingRef.current) return;

    drawingRef.current = false;
    lastPointRef.current = null;

    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }

    onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) {
      onChange("");
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      onChange("");
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white">
      <canvas
        ref={canvasRef}
        className={`block h-40 w-full touch-none ${
          disabled ? "cursor-not-allowed bg-slate-100" : "cursor-crosshair bg-white"
        }`}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
        aria-label="Client signature pad"
      />

      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-xs text-slate-500">
          Sign using your mouse, finger or stylus
        </p>
        <button
          type="button"
          disabled={disabled || !value}
          onClick={clear}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>
    </div>
  );
}

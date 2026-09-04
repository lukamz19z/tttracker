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

type ApprovalResponse = {
  success: boolean;
  docket: {
    docketId: string;
    status: string | null;
    docketDate: string | null;
    crew: string | null;
    leadingHand: string | null;
    bcRepresentative: string | null;
    bcApprovedBy: string | null;
    bcApprovedAt: string | null;
    project: {
      name: string | null;
      projectNumber: string | null;
      client: string | null;
    };
    tower: {
      name: string;
    };
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
  final?: {
    fileName?: string | null;
    webUrl?: string | null;
  };
};

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

export default function ClientDailyDocketApprovalPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const pdfUrl = token ? `/api/daily-dockets/client/${encodeURIComponent(token)}/pdf` : "#";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [docket, setDocket] = useState<ApprovalResponse["docket"] | null>(null);

  const [name, setName] = useState("");
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
        setName(payload.docket.recipient.name || "");
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

      const trimmedName = name.trim();

      if (!trimmedName) {
        setSubmitError("Enter your name before submitting your response.");
        return;
      }

      if (action === "approve" && !signature) {
        setSubmitError("Please sign the Daily Docket before approving it.");
        return;
      }

      if (action === "request_changes" && !comments.trim()) {
        setSubmitError(
          "Please enter the changes required before sending the docket back.",
        );
        return;
      }

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
              name: trimmedName,
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
    [comments, docket, name, signature, token],
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
                  <SummaryItem label="Client Representative" value={name} />
                </div>
              </div>

              <p className="mt-6 text-xs text-slate-500">
                You can close this page.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

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

                  <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    {statusLabel(docket.status)}
                  </span>
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
                <SummaryBlock
                  label="Crew"
                  value={docket.crew || "—"}
                />
                <SummaryBlock
                  label="Leading Hand"
                  value={docket.leadingHand || "—"}
                />
                <SummaryBlock
                  label="BC Representative"
                  value={docket.bcRepresentative || "—"}
                />
                <SummaryBlock
                  label="BC Approved By"
                  value={docket.bcApprovedBy || "—"}
                  subvalue={
                    docket.bcApprovedAt
                      ? formatDateTime(docket.bcApprovedAt)
                      : undefined
                  }
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">
                Review acknowledgement
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                By approving this Daily Docket, you confirm that the docket has
                been reviewed and accepted on behalf of the client. Your name,
                signature and approval time will be recorded on the final copy.
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
                <div>
                  <label
                    htmlFor="client-name"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Client Representative
                  </label>
                  <input
                    id="client-name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    placeholder="Full name"
                  />
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
                    
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
              >
                <ExternalLink size={16} />
                View Daily Docket PDF
              </a>
<SignaturePad
                      value={signature}
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
  onChange,
}: {
  value: string;
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
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(event);
  };

  const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;

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
        className="block h-40 w-full touch-none bg-white"
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

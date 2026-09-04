"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Loader2,
  MessageSquareWarning,
  ShieldCheck,
} from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase";

type DocketRow = {
  id: string;
  project_id: string;
  tower_id: string;
  docket_date: string | null;
  crew: string | null;
  leading_hand: string | null;
  weather: string | null;
  rate_type: string | null;
  approval_status: string | null;
  assembly_percent: number | null;
  erection_percent: number | null;
  raw_manhours: number | null;
  production_manhours: number | null;
  bc_rep_name: string | null;
  bc_signature_data_url: string | null;
  bc_signed_at: string | null;
  bc_submitted_at: string | null;
  bc_approved_at: string | null;
  bc_approved_name: string | null;
  bc_approved_email: string | null;
  client_rep_name: string | null;
  client_approved_at: string | null;
  sharepoint_web_url: string | null;
  draft_sharepoint_web_url: string | null;
  final_sharepoint_web_url: string | null;
};

type ProjectRow = {
  id: string;
  name: string | null;
  project_number: string | null;
};

type TowerRow = {
  id: string;
  name: string | null;
  line: string | null;
};

type LabourRow = {
  id?: string;
  worker_name: string | null;
  time_in: string | null;
  time_out: string | null;
  total_hours: number | null;
  production_hours: number | null;
};

type DelayRow = {
  id?: string;
  delay_type: string | null;
  delay_reason: string | null;
  delay_hours: number | null;
};

type ProgressRow = {
  id?: string;
  progress_model?: string | null;
  section_code?: string | null;
  section_label?: string | null;
  assembled_qty?: number | null;
  erected_qty?: number | null;
  assembly_today?: number | null;
  erection_today?: number | null;
};

type ReviewResponse = {
  success?: boolean;
  status?: string;
  error?: string;
};

function formatDate(value: string | null) {
  if (!value) return "—";

  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;

  const date = new Date(Number(year), Number(month) - 1, Number(day));

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

function formatHours(value: number | null) {
  return Number(value || 0).toFixed(2);
}

function formatPercent(value: number | null) {
  return `${Math.round(Number(value || 0))}%`;
}

function roleLabel(value: string) {
  switch (value) {
    case "admin":
      return "Administrator";
    case "commercial":
      return "Commercial";
    case "hseq":
      return "HSEQ";
    case "asset_manager":
      return "Asset Manager";
    case "editor":
      return "Editor";
    case "crew":
      return "Crew / Field";
    case "viewer":
      return "Viewer";
    default:
      return value;
  }
}

function normalizeRole(value: string | null | undefined) {
  switch ((value || "").trim().toLowerCase()) {
    case "site_admin":
    case "administrator":
      return "admin";
    case "commercial_manager":
      return "commercial";
    case "safety":
    case "safety_manager":
      return "hseq";
    case "mechanic":
    case "assets":
      return "asset_manager";
    case "leading_hand":
    case "field":
      return "crew";
    default:
      return (value || "").trim().toLowerCase();
  }
}

function statusLabel(value: string | null) {
  switch (value) {
    case "submitted_bc":
      return "Pending BC Approval";
    case "bc_changes_requested":
    case "client_changes_requested":
      return "Changes Required";
    case "client_pending":
      return "Pending Client Approval";
    case "final":
    case "legacy_final":
      return "Approved";
    default:
      return "In Progress";
  }
}

export default function DailyDocketBcReviewPage() {
  const params = useParams<{
    projectId: string;
    towerId: string;
    docketId: string;
  }>();

  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const projectId = params?.projectId ?? "";
  const towerId = params?.towerId ?? "";
  const docketId = params?.docketId ?? "";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [tower, setTower] = useState<TowerRow | null>(null);
  const [docket, setDocket] = useState<DocketRow | null>(null);
  const [labour, setLabour] = useState<LabourRow[]>([]);
  const [delays, setDelays] = useState<DelayRow[]>([]);
  const [progress, setProgress] = useState<ProgressRow[]>([]);

  const [currentRole, setCurrentRole] = useState("");
  const [allowedReviewer, setAllowedReviewer] = useState(false);
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState<
    "approve" | "request_changes" | null
  >(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<
    "approved" | "changes_requested" | null
  >(null);

  useEffect(() => {
    if (!projectId || !towerId || !docketId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw new Error("You must be signed in to review this Daily Docket.");
        }

        const [
          projectRes,
          towerRes,
          docketRes,
          labourRes,
          delayRes,
          progressRes,
          roleRes,
          configRes,
        ] = await Promise.all([
          supabase
            .from("projects")
            .select("id, name, project_number")
            .eq("id", projectId)
            .single(),
          supabase
            .from("towers")
            .select("id, name, line")
            .eq("id", towerId)
            .eq("project_id", projectId)
            .single(),
          supabase
            .from("tower_daily_dockets")
            .select(`
              id,
              project_id,
              tower_id,
              docket_date,
              crew,
              leading_hand,
              weather,
              rate_type,
              approval_status,
              assembly_percent,
              erection_percent,
              raw_manhours,
              production_manhours,
              bc_rep_name,
              bc_signature_data_url,
              bc_signed_at,
              bc_submitted_at,
              bc_approved_at,
              bc_approved_name,
              bc_approved_email,
              client_rep_name,
              client_approved_at,
              sharepoint_web_url,
              draft_sharepoint_web_url,
              final_sharepoint_web_url
            `)
            .eq("id", docketId)
            .eq("project_id", projectId)
            .eq("tower_id", towerId)
            .single(),
          supabase
            .from("tower_docket_labour")
            .select("id, worker_name, time_in, time_out, total_hours, production_hours")
            .eq("docket_id", docketId)
            .order("worker_name"),
          supabase
            .from("tower_docket_delays")
            .select("id, delay_type, delay_reason, delay_hours")
            .eq("docket_id", docketId),
          supabase
            .from("tower_docket_progress")
            .select(`
              id,
              progress_model,
              section_code,
              section_label,
              assembled_qty,
              erected_qty,
              assembly_today,
              erection_today
            `)
            .eq("docket_id", docketId),
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("project_docket_approval_roles")
            .select("role, receives_bc_review")
            .eq("project_id", projectId)
            .eq("receives_bc_review", true),
        ]);

        if (projectRes.error || !projectRes.data) {
          throw new Error("Project could not be loaded.");
        }

        if (towerRes.error || !towerRes.data) {
          throw new Error("Tower could not be loaded.");
        }

        if (docketRes.error || !docketRes.data) {
          throw new Error("Daily Docket could not be loaded.");
        }

        const role = normalizeRole(
          (roleRes.data as { role?: string | null } | null)?.role,
        );

        const configuredRoles = new Set(
          ((configRes.data || []) as { role: string; receives_bc_review: boolean }[])
            .filter((row) => row.receives_bc_review)
            .map((row) => normalizeRole(row.role)),
        );

        if (!cancelled) {
          setProject(projectRes.data as ProjectRow);
          setTower(towerRes.data as TowerRow);
          setDocket(docketRes.data as DocketRow);
          setLabour((labourRes.data || []) as LabourRow[]);
          setDelays((delayRes.data || []) as DelayRow[]);
          setProgress((progressRes.data || []) as ProgressRow[]);
          setCurrentRole(role);
          setAllowedReviewer(configuredRoles.has(role));
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Daily Docket review could not be loaded.",
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
  }, [docketId, projectId, supabase, towerId]);

  const towerName = tower?.name || "Tower";

  const totalProgress = Math.round(
    Number(docket?.assembly_percent || 0) * 0.5 +
      Number(docket?.erection_percent || 0) * 0.5,
  );

  const totalDelayHours = delays.reduce(
    (sum, row) => sum + Number(row.delay_hours || 0),
    0,
  );

  async function submitReview(action: "approve" | "request_changes") {
    if (!docketId || !docket) return;

    if (!allowedReviewer) {
      setSubmitError("You are not configured as a BC reviewer for this project.");
      return;
    }

    if (docket.approval_status !== "submitted_bc") {
      setSubmitError("This Daily Docket is no longer awaiting BC approval.");
      return;
    }

    if (action === "request_changes" && !comments.trim()) {
      setSubmitError("Enter the required changes before sending the docket back.");
      return;
    }

    const confirmed = window.confirm(
      action === "approve"
        ? "Approve this Daily Docket and send it to the client for approval?"
        : "Send this Daily Docket back for changes?",
    );

    if (!confirmed) return;

    setSubmitting(action);
    setSubmitError(null);

    try {
      const response = await fetch(
        `/api/daily-dockets/${encodeURIComponent(docketId)}/bc-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            comments: comments.trim() || undefined,
          }),
        },
      );

      const result = (await response.json().catch(() => null)) as
        | ReviewResponse
        | null;

      if (!response.ok) {
        throw new Error(
          result?.error || "The Daily Docket review could not be completed.",
        );
      }

      if (action === "approve") {
        setCompleted("approved");
        setDocket((prev) =>
          prev ? { ...prev, approval_status: "client_pending" } : prev,
        );
      } else {
        setCompleted("changes_requested");
        setDocket((prev) =>
          prev ? { ...prev, approval_status: "bc_changes_requested" } : prev,
        );
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "The Daily Docket review could not be completed.",
      );
    } finally {
      setSubmitting(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-700 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading Daily Docket review
          </div>
        </div>
      </main>
    );
  }

  if (loadError || !project || !tower || !docket) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">
            Review unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {loadError || "This Daily Docket could not be loaded."}
          </p>
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>
      </main>
    );
  }

  if (completed) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <p className="text-sm font-semibold text-slate-900">TTTracker</p>
            <p className="text-xs text-slate-500">Daily Docket Review</p>
          </div>

          <div className="px-6 py-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-7 w-7" />
            </div>

            <h1 className="mt-5 text-2xl font-bold text-slate-900">
              {completed === "approved"
                ? "Daily Docket approved"
                : "Changes requested"}
            </h1>

            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
              {completed === "approved"
                ? "The draft Daily Docket has been published and the configured client contacts have been sent their approval link."
                : "The Daily Docket has been returned to the project team for amendment."}
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(
                  `/project/${projectId}/tower/${towerId}/dockets`,
                )
              }
              className="mt-7 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Return to Daily Dockets
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/project/${projectId}/tower/${towerId}/dockets`,
                )
              }
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              aria-label="Back to Daily Dockets"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div>
              <p className="text-sm font-semibold text-slate-900">TTTracker</p>
              <p className="text-xs text-slate-500">Daily Docket Review</p>
            </div>
          </div>

          <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
            {statusLabel(docket.approval_status)}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {!allowedReviewer ? (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Review access not configured</p>
                <p className="mt-1">
                  Your website role is{" "}
                  <strong>{roleLabel(currentRole || "unknown")}</strong>, but
                  this role is not configured to approve Daily Dockets for this
                  project.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-5">
                <p className="text-sm font-medium text-slate-500">
                  {project.project_number || "Project"}
                </p>
                <h1 className="mt-1 text-2xl font-bold text-slate-900">
                  {project.name || "Daily Docket"}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  {towerName} · {formatDate(docket.docket_date)}
                </p>
              </div>

              <div className="grid gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryBlock label="Crew" value={docket.crew || "—"} />
                <SummaryBlock
                  label="Leading Hand"
                  value={docket.leading_hand || "—"}
                />
                <SummaryBlock label="Weather" value={docket.weather || "—"} />
                <SummaryBlock
                  label="Rate Type"
                  value={
                    docket.rate_type === "schedule_of_rates"
                      ? "Schedule of Rates"
                      : "Tonnage Rate"
                  }
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Progress & Hours
              </h2>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <MetricCard
                  label="Assembly"
                  value={formatPercent(docket.assembly_percent)}
                />
                <MetricCard
                  label="Erection"
                  value={formatPercent(docket.erection_percent)}
                />
                <MetricCard label="Total Progress" value={`${totalProgress}%`} />
                <MetricCard
                  label="Raw MH"
                  value={formatHours(docket.raw_manhours)}
                />
                <MetricCard
                  label="Production MH"
                  value={formatHours(docket.production_manhours)}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  Section Progress
                </h2>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">
                        Section
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Assembly
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Erection
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {progress.length ? (
                      progress.map((row, index) => {
                        const isV2 = row.progress_model === "section_v2";
                        const assembly = isV2
                          ? Number(row.assembly_today || 0)
                          : Number(row.assembled_qty || 0);
                        const erection = isV2
                          ? Number(row.erection_today || 0)
                          : Number(row.erected_qty || 0);

                        return (
                          <tr
                            key={row.id || `${row.section_code}-${index}`}
                            className="border-t border-slate-200"
                          >
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {row.section_label ||
                                row.section_code ||
                                `Section ${index + 1}`}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-700">
                              {Math.round(assembly)}%
                            </td>
                            <td className="px-4 py-3 text-right text-slate-700">
                              {Math.round(erection)}%
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-5 text-center text-slate-500"
                        >
                          No progress rows recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  Labour
                </h2>
                <span className="text-sm font-medium text-slate-500">
                  {labour.length} worker{labour.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">
                        Worker
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Time
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Raw Hrs
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Prod Hrs
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {labour.length ? (
                      labour.map((row, index) => (
                        <tr
                          key={row.id || `${row.worker_name}-${index}`}
                          className="border-t border-slate-200"
                        >
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {row.worker_name || "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {row.time_in || "—"} - {row.time_out || "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {formatHours(row.total_hours)}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {formatHours(row.production_hours)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-5 text-center text-slate-500"
                        >
                          No labour rows recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  Delays
                </h2>
                <span className="text-sm font-medium text-slate-500">
                  {totalDelayHours.toFixed(2)} hrs
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {delays.length ? (
                  delays.map((row, index) => (
                    <div
                      key={row.id || index}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {(row.delay_type || "Delay")
                              .replaceAll("_", " ")
                              .replace(/\b\w/g, (char) => char.toUpperCase())}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            {row.delay_reason || "No reason entered"}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-slate-700">
                          {formatHours(row.delay_hours)} hrs
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    No delay rows recorded.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                BC Representative Sign-off
              </h2>

              <div className="mt-5 grid gap-5 md:grid-cols-[1fr_260px]">
                <div className="space-y-3">
                  <SummaryLine
                    label="Representative"
                    value={docket.bc_rep_name || "—"}
                  />
                  <SummaryLine
                    label="Signed"
                    value={formatDateTime(docket.bc_signed_at)}
                  />
                  <SummaryLine
                    label="Submitted for Approval"
                    value={formatDateTime(docket.bc_submitted_at)}
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  {docket.bc_signature_data_url ? (
                    <img
                      src={docket.bc_signature_data_url}
                      alt="BC Representative signature"
                      className="h-28 w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-28 items-center justify-center text-sm text-slate-500">
                      No signature recorded
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900">
                    BC Approval
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-slate-500">
                    Review the docket before sending it to the client.
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Clock3 className="h-4 w-4" />
                  {statusLabel(docket.approval_status)}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Submitted {formatDateTime(docket.bc_submitted_at)}
                </p>
              </div>

              <div className="mt-5">
                <label
                  htmlFor="review-comments"
                  className="block text-sm font-medium text-slate-700"
                >
                  Review Comments
                </label>
                <textarea
                  id="review-comments"
                  rows={5}
                  value={comments}
                  disabled={
                    !allowedReviewer ||
                    docket.approval_status !== "submitted_bc" ||
                    submitting !== null
                  }
                  onChange={(event) => setComments(event.target.value)}
                  className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100"
                  placeholder="Optional for approval. Required if changes are requested."
                />
              </div>

              {submitError ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {submitError}
                </div>
              ) : null}

              <div className="mt-5 grid gap-3">
                <button
                  type="button"
                  disabled={
                    !allowedReviewer ||
                    docket.approval_status !== "submitted_bc" ||
                    submitting !== null
                  }
                  onClick={() => void submitReview("approve")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting === "approve" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileCheck2 className="h-4 w-4" />
                  )}
                  Approve & Send to Client
                </button>

                <button
                  type="button"
                  disabled={
                    !allowedReviewer ||
                    docket.approval_status !== "submitted_bc" ||
                    submitting !== null
                  }
                  onClick={() => void submitReview("request_changes")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting === "request_changes" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MessageSquareWarning className="h-4 w-4" />
                  )}
                  Request Changes
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">
                Review Checks
              </h3>

              <div className="mt-4 space-y-3 text-sm">
                <CheckItem
                  ok={Boolean(docket.bc_rep_name)}
                  label="BC representative recorded"
                />
                <CheckItem
                  ok={Boolean(docket.bc_signature_data_url)}
                  label="BC signature captured"
                />
                <CheckItem
                  ok={Boolean(docket.docket_date)}
                  label="Docket date recorded"
                />
                <CheckItem
                  ok={labour.length > 0}
                  label="Labour recorded"
                />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function SummaryBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function SummaryLine({
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

function CheckItem({
  ok,
  label,
}: {
  ok: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex h-5 w-5 items-center justify-center rounded-full ${
          ok
            ? "bg-emerald-100 text-emerald-700"
            : "bg-slate-100 text-slate-400"
        }`}
      >
        {ok ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5" />
        )}
      </div>
      <span className={ok ? "text-slate-700" : "text-slate-500"}>
        {label}
      </span>
    </div>
  );
}

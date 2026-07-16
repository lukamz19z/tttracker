"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Download,
  Eye,
  FileText,
  Filter,
  Library,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase";
import { PageHeader, PageShell } from "../components";

type AssessmentStatus =
  | "draft"
  | "in_progress"
  | "ready_for_review"
  | "approved"
  | "superseded"
  | "cancelled";

type OverallResult =
  | "assessment_incomplete"
  | "suitable"
  | "suitable_with_actions"
  | "restricted_use"
  | "not_suitable";

type AssessmentRegisterRow = {
  id: string;
  assessment_number: string;
  asset_group: string;
  asset_source_table: string;
  asset_id: string;
  asset_type: string | null;
  asset_number: string;
  asset_display_name: string | null;
  assessment_date: string;
  assessment_purpose: string;
  assessor_name: string;
  completed_by_name: string | null;
  reviewer_name: string | null;
  status: AssessmentStatus;
  overall_result: OverallResult;
  revision_number: number;
  review_due_date: string | null;
  in_place_count: number;
  required_count: number;
  not_applicable_count: number;
  unable_to_verify_count: number;
  low_required_count: number;
  medium_required_count: number;
  high_required_count: number;
  critical_required_count: number;
  report_pdf_path: string | null;
  report_generated_at: string | null;
  finalised_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  template_name: string;
  template_code: string;
  template_version: number;
};

type StatusFilter =
  | "all"
  | AssessmentStatus
  | "actions_required"
  | "review_due";

type ResultFilter = "all" | OverallResult;

function prettify(value: string | null | undefined): string {
  if (!value) return "—";

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusClasses(status: AssessmentStatus): string {
  if (status === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "ready_for_review") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (status === "in_progress") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "draft") {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  if (status === "superseded") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  return "border-rose-200 bg-rose-50 text-rose-700";
}

function resultClasses(result: OverallResult): string {
  if (result === "suitable") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (result === "suitable_with_actions") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (result === "restricted_use") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (result === "not_suitable") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
}

function isReviewDue(
  reviewDueDate: string | null,
  status: AssessmentStatus,
): boolean {
  if (!reviewDueDate || status !== "approved") {
    return false;
  }

  const due = new Date(`${reviewDueDate}T23:59:59`);
  const today = new Date();

  return due.getTime() <= today.getTime();
}

function isReviewDueSoon(
  reviewDueDate: string | null,
  status: AssessmentStatus,
): boolean {
  if (!reviewDueDate || status !== "approved") {
    return false;
  }

  const due = new Date(`${reviewDueDate}T23:59:59`);
  const today = new Date();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const difference = due.getTime() - today.getTime();

  return difference > 0 && difference <= thirtyDays;
}

export default function RiskAssessmentsPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [assessments, setAssessments] = useState<AssessmentRegisterRow[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");
  const [resultFilter, setResultFilter] =
    useState<ResultFilter>("all");
  const [assetGroupFilter, setAssetGroupFilter] = useState("all");
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");

  const loadAssessments = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("asset_risk_assessment_register")
      .select("*")
      .order("assessment_date", { ascending: false })
      .order("updated_at", { ascending: false });

    if (error) {
      console.error(error);
      setErrorMessage(
        `Failed to load risk assessments: ${error.message}`,
      );
      setLoading(false);
      return;
    }

    setAssessments((data ?? []) as AssessmentRegisterRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAssessments();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadAssessments]);

  const assetGroupOptions = useMemo(() => {
    return Array.from(
      new Set(
        assessments
          .map((assessment) => assessment.asset_group)
          .filter(Boolean),
      ),
    ).sort();
  }, [assessments]);

  const assetTypeOptions = useMemo(() => {
    return Array.from(
      new Set(
        assessments
          .map((assessment) => assessment.asset_type)
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort();
  }, [assessments]);

  const filteredAssessments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return assessments.filter((assessment) => {
      if (statusFilter === "actions_required") {
        if (assessment.required_count <= 0) {
          return false;
        }
      } else if (statusFilter === "review_due") {
        if (
          !isReviewDue(
            assessment.review_due_date,
            assessment.status,
          ) &&
          !isReviewDueSoon(
            assessment.review_due_date,
            assessment.status,
          )
        ) {
          return false;
        }
      } else if (
        statusFilter !== "all" &&
        assessment.status !== statusFilter
      ) {
        return false;
      }

      if (
        resultFilter !== "all" &&
        assessment.overall_result !== resultFilter
      ) {
        return false;
      }

      if (
        assetGroupFilter !== "all" &&
        assessment.asset_group !== assetGroupFilter
      ) {
        return false;
      }

      if (
        assetTypeFilter !== "all" &&
        assessment.asset_type !== assetTypeFilter
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchable = [
        assessment.assessment_number,
        assessment.asset_number,
        assessment.asset_display_name,
        assessment.asset_type,
        assessment.asset_group,
        assessment.assessor_name,
        assessment.completed_by_name,
        assessment.reviewer_name,
        assessment.template_name,
        assessment.template_code,
        assessment.assessment_purpose,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [
    assessments,
    search,
    statusFilter,
    resultFilter,
    assetGroupFilter,
    assetTypeFilter,
  ]);

  const approvedCount = assessments.filter(
    (assessment) => assessment.status === "approved",
  ).length;

  const activeCount = assessments.filter((assessment) =>
    ["draft", "in_progress", "ready_for_review"].includes(
      assessment.status,
    ),
  ).length;

  const actionsRequiredCount = assessments.filter(
    (assessment) => assessment.required_count > 0,
  ).length;

  const reviewDueCount = assessments.filter(
    (assessment) =>
      isReviewDue(
        assessment.review_due_date,
        assessment.status,
      ) ||
      isReviewDueSoon(
        assessment.review_due_date,
        assessment.status,
      ),
  ).length;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setResultFilter("all");
    setAssetGroupFilter("all");
    setAssetTypeFilter("all");
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Assets"
        title="Risk Assessments"
        description="Create controlled risk assessment reports for vehicles, trailers, cranes, telehandlers and other plant using reusable, prebuilt templates."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/assets/risk-assessments/templates"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Settings2 size={16} />
              Templates
            </Link>

            <Link
              href="/assets/risk-assessments/library"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Library size={16} />
              Risk Library
            </Link>

            <button
              type="button"
              onClick={() => void loadAssessments()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={loading ? "animate-spin" : ""}
              />
              Refresh
            </button>

            <Link
              href="/assets/risk-assessments/new"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus size={16} />
              New Assessment
            </Link>
          </div>
        }
      />

      <div className="space-y-6 px-4 pb-10 sm:px-6 lg:px-8">
        {errorMessage && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <span>{errorMessage}</span>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Approved"
            value={approvedCount}
            helper="Current approved reports"
            icon={<CheckCircle2 size={20} />}
            tone="emerald"
          />

          <SummaryCard
            title="Active"
            value={activeCount}
            helper="Draft, in progress or review"
            icon={<Clock3 size={20} />}
            tone="blue"
          />

          <SummaryCard
            title="Actions Required"
            value={actionsRequiredCount}
            helper="Assessments with treatments"
            icon={<Wrench size={20} />}
            tone="amber"
          />

          <SummaryCard
            title="Review Due"
            value={reviewDueCount}
            helper="Overdue or due within 30 days"
            icon={<ShieldAlert size={20} />}
            tone="rose"
          />
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5 sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-slate-900 p-3 text-white">
                    <ClipboardList size={21} />
                  </div>

                  <div>
                    <h2 className="text-xl font-black text-slate-950">
                      Risk Assessment Register
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Search, continue, review and open completed reports.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <FilterButton
                  active={statusFilter === "all"}
                  onClick={() => setStatusFilter("all")}
                >
                  All
                </FilterButton>

                <FilterButton
                  active={statusFilter === "in_progress"}
                  onClick={() => setStatusFilter("in_progress")}
                >
                  In Progress
                </FilterButton>

                <FilterButton
                  active={statusFilter === "ready_for_review"}
                  onClick={() =>
                    setStatusFilter("ready_for_review")
                  }
                >
                  Review
                </FilterButton>

                <FilterButton
                  active={statusFilter === "actions_required"}
                  onClick={() =>
                    setStatusFilter("actions_required")
                  }
                >
                  Actions Required
                </FilterButton>

                <FilterButton
                  active={statusFilter === "review_due"}
                  onClick={() => setStatusFilter("review_due")}
                >
                  Review Due
                </FilterButton>
              </div>
            </div>

            <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_190px_190px_190px]">
              <label className="relative block">
                <Search
                  size={17}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  placeholder="Search assessment number, asset, registration, assessor or template..."
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <select
                value={resultFilter}
                onChange={(event) =>
                  setResultFilter(
                    event.target.value as ResultFilter,
                  )
                }
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                <option value="all">All results</option>
                <option value="assessment_incomplete">
                  Assessment incomplete
                </option>
                <option value="suitable">Suitable</option>
                <option value="suitable_with_actions">
                  Suitable with actions
                </option>
                <option value="restricted_use">
                  Restricted use
                </option>
                <option value="not_suitable">
                  Not suitable
                </option>
              </select>

              <select
                value={assetGroupFilter}
                onChange={(event) =>
                  setAssetGroupFilter(event.target.value)
                }
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                <option value="all">All asset groups</option>

                {assetGroupOptions.map((group) => (
                  <option key={group} value={group}>
                    {prettify(group)}
                  </option>
                ))}
              </select>

              <select
                value={assetTypeFilter}
                onChange={(event) =>
                  setAssetTypeFilter(event.target.value)
                }
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                <option value="all">All asset types</option>

                {assetTypeOptions.map((assetType) => (
                  <option key={assetType} value={assetType}>
                    {prettify(assetType)}
                  </option>
                ))}
              </select>
            </div>

            {(search ||
              statusFilter !== "all" ||
              resultFilter !== "all" ||
              assetGroupFilter !== "all" ||
              assetTypeFilter !== "all") && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-slate-500">
                  Showing {filteredAssessments.length} of{" "}
                  {assessments.length} assessments
                </p>

                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-bold text-slate-700 hover:text-slate-950"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex min-h-72 items-center justify-center p-8">
              <div className="text-center">
                <RefreshCw
                  size={28}
                  className="mx-auto animate-spin text-slate-400"
                />
                <p className="mt-3 text-sm font-medium text-slate-500">
                  Loading risk assessments...
                </p>
              </div>
            </div>
          ) : filteredAssessments.length === 0 ? (
            <div className="flex min-h-80 items-center justify-center p-8">
              <div className="max-w-md text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                  <FileText size={26} />
                </div>

                <h3 className="mt-4 text-lg font-black text-slate-900">
                  {assessments.length === 0
                    ? "No risk assessments yet"
                    : "No matching assessments"}
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {assessments.length === 0
                    ? "Select an existing asset and create its first risk assessment using one of the published templates."
                    : "Adjust the search or filters to find the assessment you need."}
                </p>

                {assessments.length === 0 ? (
                  <Link
                    href="/assets/risk-assessments/new"
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
                  >
                    <Plus size={16} />
                    Create First Assessment
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <TableHeader>Assessment</TableHeader>
                      <TableHeader>Asset</TableHeader>
                      <TableHeader>Status</TableHeader>
                      <TableHeader>Result</TableHeader>
                      <TableHeader>Actions</TableHeader>
                      <TableHeader>Review</TableHeader>
                      <TableHeader align="right">Open</TableHeader>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredAssessments.map((assessment) => {
                      const overdue = isReviewDue(
                        assessment.review_due_date,
                        assessment.status,
                      );
                      const dueSoon = isReviewDueSoon(
                        assessment.review_due_date,
                        assessment.status,
                      );

                      return (
                        <tr
                          key={assessment.id}
                          className="transition hover:bg-slate-50"
                        >
                          <td className="px-5 py-4 align-top">
                            <div className="font-black text-slate-950">
                              {assessment.assessment_number}
                            </div>
                            <div className="mt-1 text-xs font-semibold text-slate-500">
                              {formatDate(
                                assessment.assessment_date,
                              )}{" "}
                              · Revision {assessment.revision_number}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {assessment.template_name} V
                              {assessment.template_version}
                            </div>
                          </td>

                          <td className="px-5 py-4 align-top">
                            <div className="font-black text-slate-950">
                              {assessment.asset_number}
                            </div>
                            <div className="mt-1 text-sm text-slate-600">
                              {assessment.asset_display_name ||
                                prettify(assessment.asset_type)}
                            </div>
                            <div className="mt-1 text-xs font-semibold text-slate-400">
                              {prettify(assessment.asset_group)}
                            </div>
                          </td>

                          <td className="px-5 py-4 align-top">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black uppercase tracking-wide ${statusClasses(
                                assessment.status,
                              )}`}
                            >
                              {prettify(assessment.status)}
                            </span>
                            <div className="mt-2 text-xs text-slate-500">
                              Assessor: {assessment.assessor_name}
                            </div>
                          </td>

                          <td className="px-5 py-4 align-top">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${resultClasses(
                                assessment.overall_result,
                              )}`}
                            >
                              {prettify(
                                assessment.overall_result,
                              )}
                            </span>
                          </td>

                          <td className="px-5 py-4 align-top">
                            <div className="flex flex-wrap gap-2">
                              <CountBadge
                                label="In place"
                                value={assessment.in_place_count}
                                tone="emerald"
                              />

                              <CountBadge
                                label="Required"
                                value={assessment.required_count}
                                tone={
                                  assessment.required_count > 0
                                    ? "rose"
                                    : "slate"
                                }
                              />

                              {assessment.unable_to_verify_count >
                                0 && (
                                <CountBadge
                                  label="Unable"
                                  value={
                                    assessment.unable_to_verify_count
                                  }
                                  tone="amber"
                                />
                              )}
                            </div>

                            {(assessment.high_required_count > 0 ||
                              assessment.critical_required_count >
                                0) && (
                              <div className="mt-2 text-xs font-black text-rose-700">
                                {assessment.critical_required_count}{" "}
                                critical ·{" "}
                                {assessment.high_required_count} high
                              </div>
                            )}
                          </td>

                          <td className="px-5 py-4 align-top">
                            <div
                              className={`text-sm font-bold ${
                                overdue
                                  ? "text-rose-700"
                                  : dueSoon
                                    ? "text-amber-700"
                                    : "text-slate-700"
                              }`}
                            >
                              {formatDate(
                                assessment.review_due_date,
                              )}
                            </div>

                            <div className="mt-1 text-xs font-semibold">
                              {overdue && (
                                <span className="text-rose-600">
                                  Overdue
                                </span>
                              )}
                              {dueSoon && !overdue && (
                                <span className="text-amber-600">
                                  Due within 30 days
                                </span>
                              )}
                              {!overdue && !dueSoon && (
                                <span className="text-slate-400">
                                  {assessment.status === "approved"
                                    ? "Current"
                                    : "Not finalised"}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-5 py-4 text-right align-top">
                            <div className="flex justify-end gap-2">
                              {assessment.report_pdf_path && (
                                <a
                                  href={assessment.report_pdf_path}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Open PDF"
                                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:bg-slate-100"
                                >
                                  <Download size={16} />
                                </a>
                              )}

                              {assessment.status === "approved" && (
                                <Link
                                  href={`/assets/risk-assessments/${assessment.id}/report`}
                                  title="View report"
                                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:bg-slate-100"
                                >
                                  <Eye size={16} />
                                </Link>
                              )}

                              <Link
                                href={`/assets/risk-assessments/${assessment.id}`}
                                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800"
                              >
                                {assessment.status === "approved"
                                  ? "Open"
                                  : "Continue"}
                                <ChevronRight size={15} />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-200 lg:hidden">
                {filteredAssessments.map((assessment) => {
                  const overdue = isReviewDue(
                    assessment.review_due_date,
                    assessment.status,
                  );
                  const dueSoon = isReviewDueSoon(
                    assessment.review_due_date,
                    assessment.status,
                  );

                  return (
                    <article key={assessment.id} className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-black text-slate-950">
                            {assessment.assessment_number}
                          </h3>
                          <p className="mt-1 text-sm font-bold text-slate-700">
                            {assessment.asset_number}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {assessment.asset_display_name ||
                              prettify(assessment.asset_type)}
                          </p>
                        </div>

                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-black uppercase ${statusClasses(
                            assessment.status,
                          )}`}
                        >
                          {prettify(assessment.status)}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-black ${resultClasses(
                            assessment.overall_result,
                          )}`}
                        >
                          {prettify(assessment.overall_result)}
                        </span>

                        <CountBadge
                          label="Required"
                          value={assessment.required_count}
                          tone={
                            assessment.required_count > 0
                              ? "rose"
                              : "slate"
                          }
                        />
                      </div>

                      <dl className="mt-4 grid grid-cols-2 gap-3">
                        <MobileDetail
                          label="Assessment date"
                          value={formatDate(
                            assessment.assessment_date,
                          )}
                        />
                        <MobileDetail
                          label="Review due"
                          value={formatDate(
                            assessment.review_due_date,
                          )}
                          danger={overdue}
                          warning={dueSoon}
                        />
                        <MobileDetail
                          label="Assessor"
                          value={assessment.assessor_name}
                        />
                        <MobileDetail
                          label="Updated"
                          value={formatDateTime(
                            assessment.updated_at,
                          )}
                        />
                      </dl>

                      <div className="mt-5 flex flex-wrap gap-2">
                        {assessment.status === "approved" && (
                          <Link
                            href={`/assets/risk-assessments/${assessment.id}/report`}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700"
                          >
                            <Eye size={15} />
                            Report
                          </Link>
                        )}

                        <Link
                          href={`/assets/risk-assessments/${assessment.id}`}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-sm font-bold text-white"
                        >
                          {assessment.status === "approved"
                            ? "Open Assessment"
                            : "Continue Assessment"}
                          <ChevronRight size={15} />
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-blue-600 p-3 text-white">
              <Archive size={20} />
            </div>

            <div>
              <h2 className="text-lg font-black text-blue-950">
                Controlled assessment history
              </h2>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-blue-900">
                Approved assessments remain tied to the exact published
                template version used at the time. Reassessments should
                create a new assessment rather than modifying the
                approved historical record.
              </p>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function SummaryCard({
  title,
  value,
  helper,
  icon,
  tone,
}: {
  title: string;
  value: number;
  helper: string;
  icon: React.ReactNode;
  tone: "emerald" | "blue" | "amber" | "rose";
}) {
  const classes = {
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-950",
    blue: "border-blue-200 bg-blue-50 text-blue-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    rose: "border-rose-200 bg-rose-50 text-rose-950",
  }[tone];

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${classes}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] opacity-70">
            {title}
          </p>
          <p className="mt-2 text-3xl font-black">{value}</p>
          <p className="mt-2 text-xs font-semibold opacity-70">
            {helper}
          </p>
        </div>

        <div className="rounded-xl bg-white/70 p-2.5">{icon}</div>
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function TableHeader({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function CountBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "rose" | "slate";
}) {
  const classes = {
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    slate: "border-slate-200 bg-slate-100 text-slate-600",
  }[tone];

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-black ${classes}`}
    >
      {label}: {value}
    </span>
  );
}

function MobileDetail({
  label,
  value,
  danger = false,
  warning = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </dt>
      <dd
        className={`mt-1 text-sm font-black ${
          danger
            ? "text-rose-700"
            : warning
              ? "text-amber-700"
              : "text-slate-900"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

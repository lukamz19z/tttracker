"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Eye,
  FileCheck2,
  FileText,
  Filter,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type FinancialStatus =
  | "draft"
  | "submitted"
  | "changes_required"
  | "rejected"
  | "approved"
  | "paid";

type FinancialCategory = {
  id: string;
  name: string;
  active: boolean;
};

type Project = {
  id: string;
  name: string;
  project_number: string | null;
};

type ExpenseClaim = {
  id: string;
  submission_number: string;
  submission_type: "expense_claim";
  status: FinancialStatus;
  revision: number;
  submitted_for_employee_id: string | null;
  created_by: string;
  submitted_by: string | null;
  project_id: string | null;
  claim_period_start: string | null;
  claim_period_end: string | null;
  description: string | null;
  notes: string | null;
  subtotal_ex_gst: number | string | null;
  gst_amount: number | string | null;
  total_amount: number | string | null;
  submitted_at: string | null;
  changes_requested_at: string | null;
  changes_required_reason: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  approved_at: string | null;
  approved_by_name: string | null;
  approved_by_email: string | null;
  paid_at: string | null;
  payment_reference: string | null;
  created_at: string;
  updated_at: string;
};

type AllocationType = "general" | "project" | "vehicle" | "plant" | "fleet_job";

type ExpenseItem = {
  id: string;
  submission_id: string;
  category_id: string | null;
  expense_date: string;
  supplier: string | null;
  description: string;
  quantity: number | string;
  unit_amount_ex_gst: number | string | null;
  amount_ex_gst: number | string;
  gst_amount: number | string;
  amount_inc_gst: number | string;
  notes: string | null;
  sort_order: number;
  project_id: string | null;
  gst_applicable: boolean;
  asset_type: "Vehicle" | "Plant" | null;
  vehicle_asset_id: string | null;
  plant_asset_id: string | null;
  fleet_job_id: string | null;
};

type VehicleAsset = {
  id: string;
  vehicle_id: string | null;
  vehicle_rego: string | null;
  make: string | null;
  model: string | null;
  category: string | null;
  status: string | null;
};

type PlantAsset = {
  id: string;
  asset_id: string | null;
  make: string | null;
  model: string | null;
  plant_type: string | null;
  serial_number: string | null;
  rego: string | null;
  asset_status: string | null;
};

type FleetJob = {
  id: string;
  job_number: string | null;
  asset_type: string | null;
  vehicle_asset_id: string | null;
  plant_asset_id: string | null;
  asset_label: string | null;
  status: string | null;
};

type ExpenseAttachment = {
  id: string;
  submission_id: string;
  item_id: string | null;
  attachment_type: "receipt" | "invoice" | "supporting_document";
  file_name: string;
  content_type: string | null;
  file_size_bytes: number | null;
  uploaded_at: string;
};

type AttachmentUploadResponse = {
  attachment?: ExpenseAttachment;
  error?: string;
};

type FinancialAccessRule = {
  id: string;
  principal_type: "role" | "user";
  role: string | null;
  user_id: string | null;
  can_review_edit: boolean;
  can_approve: boolean;
  can_mark_paid: boolean;
  active: boolean;
};

type Employee = {
  id: string;
  full_name: string;
  user_id?: string | null;
};

type DraftItem = {
  id?: string;
  categoryId: string;
  expenseDate: string;
  description: string;
  amountIncGst: string;
  gstAmount: string;
  notes: string;
  allocationType: AllocationType;
  vehicleAssetId: string;
  plantAssetId: string;
  fleetJobId: string;
};

type ClaimDraft = {
  projectId: string;
  description: string;
  notes: string;
  items: DraftItem[];
};

const EMPTY_ITEM: DraftItem = {
  categoryId: "",
  expenseDate: new Date().toISOString().slice(0, 10),
  description: "",
  amountIncGst: "",
  gstAmount: "",
  notes: "",
  allocationType: "project",
  vehicleAssetId: "",
  plantAssetId: "",
  fleetJobId: "",
};

const EMPTY_CLAIM: ClaimDraft = {
  projectId: "",
  description: "",
  notes: "",
  items: [{ ...EMPTY_ITEM }],
};

function asNumber(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function currency(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(value);
}

function shortDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function statusLabel(status: FinancialStatus) {
  switch (status) {
    case "draft":
      return "Draft";
    case "submitted":
      return "Pending Approval";
    case "changes_required":
      return "Changes Required";
    case "rejected":
      return "Rejected";
    case "approved":
      return "Approved";
    case "paid":
      return "Paid";
  }
}

function vehicleLabel(asset: VehicleAsset) {
  return [
    asset.vehicle_id,
    asset.vehicle_rego,
    [asset.make, asset.model].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ") || "Vehicle";
}

function plantLabel(asset: PlantAsset) {
  return [
    asset.asset_id,
    asset.rego,
    [asset.make, asset.model].filter(Boolean).join(" "),
    asset.plant_type,
  ]
    .filter(Boolean)
    .join(" · ") || "Plant";
}

function fleetJobLabel(job: FleetJob) {
  return [job.job_number, job.asset_label, job.status].filter(Boolean).join(" · ") || "Fleet Job";
}

function statusClass(status: FinancialStatus) {
  switch (status) {
    case "submitted":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "changes_required":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "rejected":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "paid":
      return "border-blue-200 bg-blue-50 text-blue-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

export default function ExpenseClaimsPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [attachments, setAttachments] = useState<ExpenseAttachment[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicleAssets, setVehicleAssets] = useState<VehicleAsset[]>([]);
  const [plantAssets, setPlantAssets] = useState<PlantAsset[]>([]);
  const [fleetJobs, setFleetJobs] = useState<FleetJob[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState("");
  const [accessRules, setAccessRules] = useState<FinancialAccessRule[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | FinancialStatus>("all");
  const [viewFilter, setViewFilter] = useState<"all" | "mine">("all");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingClaim, setEditingClaim] = useState<ExpenseClaim | null>(null);
  const [draft, setDraft] = useState<ClaimDraft>(EMPTY_CLAIM);
  const [saving, setSaving] = useState(false);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [viewingAttachmentId, setViewingAttachmentId] = useState<string | null>(
    null,
  );

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewingClaim, setReviewingClaim] = useState<ExpenseClaim | null>(null);
  const [reviewComments, setReviewComments] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  async function readApiJson<T extends { error?: string }>(
    response: Response,
    context = "Finance API",
  ): Promise<T> {
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();

    if (!contentType.toLowerCase().includes("application/json")) {
      const status = `${response.status} ${response.statusText}`.trim();
      const routeHint =
        response.status === 404
          ? " The API route was not found. Confirm app/api/expenses/claims/review/route.ts exists, then restart the Next.js dev server."
          : " The server returned an HTML error page instead of JSON; check the Next.js server/build log for the underlying route error.";

      throw new Error(
        `${context} returned ${status || "an invalid response"}.${routeHint}`,
      );
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`${context} returned invalid JSON (${response.status}).`);
    }
  }

  const apiFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${session.access_token}`);

      return fetch(input, {
        ...init,
        headers,
        cache: "no-store",
      });
    },
    [supabase],
  );

  const loadAll = useCallback(async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) {
      window.location.href = "/login";
      return;
    }

    setCurrentUserId(user.id);

    const [
      claimResult,
      itemResult,
      attachmentResult,
      categoryResult,
      projectResult,
      employeeResult,
      vehicleResult,
      plantResult,
      fleetJobResult,
      roleResult,
      accessRuleResult,
    ] = await Promise.all([
      supabase
        .from("financial_submissions")
        .select(
          "id, submission_number, submission_type, status, revision, submitted_for_employee_id, created_by, submitted_by, project_id, claim_period_start, claim_period_end, description, notes, subtotal_ex_gst, gst_amount, total_amount, submitted_at, changes_requested_at, changes_required_reason, rejected_at, rejection_reason, approved_at, approved_by_name, approved_by_email, paid_at, payment_reference, created_at, updated_at",
        )
        .eq("submission_type", "expense_claim")
        .order("created_at", { ascending: false }),
      supabase
        .from("financial_submission_items")
        .select(
          "id, submission_id, category_id, expense_date, supplier, description, quantity, unit_amount_ex_gst, amount_ex_gst, gst_amount, amount_inc_gst, notes, sort_order, project_id, gst_applicable, asset_type, vehicle_asset_id, plant_asset_id, fleet_job_id",
        )
        .order("sort_order"),
      supabase
        .from("financial_attachments")
        .select(
          "id, submission_id, item_id, attachment_type, file_name, content_type, file_size_bytes, uploaded_at",
        )
        .order("uploaded_at", { ascending: false }),
      supabase
        .from("financial_categories")
        .select("id, name, active")
        .order("sort_order")
        .order("name"),
      supabase
        .from("projects")
        .select("id, name, project_number")
        .order("name"),
      supabase
        .from("employees")
        .select("id, full_name, user_id")
        .order("full_name"),
      supabase
        .from("vehicle_assets")
        .select("id, vehicle_id, vehicle_rego, make, model, category, status")
        .order("vehicle_id"),
      supabase
        .from("plant_assets")
        .select("id, asset_id, make, model, plant_type, serial_number, rego, asset_status")
        .order("asset_id"),
      supabase
        .from("fleet_jobs")
        .select("id, job_number, asset_type, vehicle_asset_id, plant_asset_id, asset_label, status")
        .order("created_at", { ascending: false }),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("financial_access_rules")
        .select(
          "id, principal_type, role, user_id, can_review_edit, can_approve, can_mark_paid, active",
        )
        .eq("active", true)
        .or("applies_to.eq.all,applies_to.eq.expense_claim"),
    ]);

    if (claimResult.error) throw claimResult.error;
    if (itemResult.error) throw itemResult.error;
    if (attachmentResult.error) throw attachmentResult.error;
    if (categoryResult.error) throw categoryResult.error;
    if (projectResult.error) throw projectResult.error;
    if (employeeResult.error) throw employeeResult.error;
    if (vehicleResult.error) throw vehicleResult.error;
    if (plantResult.error) throw plantResult.error;
    if (fleetJobResult.error) throw fleetJobResult.error;
    if (roleResult.error) throw roleResult.error;
    if (accessRuleResult.error) throw accessRuleResult.error;

    setClaims((claimResult.data ?? []) as ExpenseClaim[]);
    setItems((itemResult.data ?? []) as ExpenseItem[]);
    setAttachments((attachmentResult.data ?? []) as ExpenseAttachment[]);
    setCategories((categoryResult.data ?? []) as FinancialCategory[]);
    setProjects((projectResult.data ?? []) as Project[]);
    setEmployees((employeeResult.data ?? []) as Employee[]);
    setVehicleAssets((vehicleResult.data ?? []) as VehicleAsset[]);
    setPlantAssets((plantResult.data ?? []) as PlantAsset[]);
    setFleetJobs((fleetJobResult.data ?? []) as FleetJob[]);
    setCurrentRole(String(roleResult.data?.role ?? "").trim().toLowerCase());
    setAccessRules(
      (accessRuleResult.data ?? []) as FinancialAccessRule[],
    );

    const employee = (employeeResult.data ?? []).find(
      (row) => row.user_id === user.id,
    ) as Employee | undefined;

    setCurrentEmployeeId(employee?.id ?? null);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await loadAll();
        } catch (error) {
          setMessage({
            tone: "error",
            text:
              error instanceof Error
                ? error.message
                : "Failed to load expense claims.",
          });
        } finally {
          setLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadAll]);

  useEffect(() => {
    if (loading || claims.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const openId = params.get("open");

    if (!openId || reviewOpen || editorOpen) return;

    const claim = claims.find((item) => item.id === openId);
    if (claim) {
      openReviewClaim(claim);
    }
  }, [claims, editorOpen, loading, reviewOpen]);

  async function refreshData() {
    setRefreshing(true);
    setMessage(null);

    try {
      await loadAll();
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to refresh expense claims.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  const claimItems = useMemo(() => {
    const map = new Map<string, ExpenseItem[]>();

    for (const item of items) {
      const existing = map.get(item.submission_id) ?? [];
      existing.push(item);
      map.set(item.submission_id, existing);
    }

    return map;
  }, [items]);

  const filteredClaims = useMemo(() => {
    const query = search.trim().toLowerCase();

    return claims.filter((claim) => {
      if (statusFilter !== "all" && claim.status !== statusFilter) return false;

      if (
        viewFilter === "mine" &&
        claim.created_by !== currentUserId &&
        claim.submitted_by !== currentUserId &&
        claim.submitted_for_employee_id !== currentEmployeeId
      ) {
        return false;
      }

      if (!query) return true;

      const project = projects.find((item) => item.id === claim.project_id);
      const itemText = (claimItems.get(claim.id) ?? [])
        .map((item) => item.description)
        .join(" ");

      return [
        claim.submission_number,
        claim.description,
        project?.name,
        project?.project_number,
        itemText,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [
    claimItems,
    claims,
    currentEmployeeId,
    currentUserId,
    projects,
    search,
    statusFilter,
    viewFilter,
  ]);

  const financePermissions = useMemo(() => {
    const role = currentRole.trim().toLowerCase();
    const isAdmin = role === "admin";

    // Approval authority is intentionally exact-user based.
    // The Finance website role grants module access only.
    const matching = accessRules.filter(
      (rule) =>
        rule.active &&
        rule.principal_type === "user" &&
        rule.user_id === currentUserId,
    );

    return {
      isAdmin,
      hasExactUserRule: matching.length > 0,
      canReviewEdit:
        isAdmin || matching.some((rule) => rule.can_review_edit),
      canApprove:
        isAdmin || matching.some((rule) => rule.can_approve),
      canMarkPaid:
        isAdmin || matching.some((rule) => rule.can_mark_paid),
    };
  }, [accessRules, currentRole, currentUserId]);

  const reviewingItems = useMemo(() => {
    if (!reviewingClaim) return [];
    return claimItems.get(reviewingClaim.id) ?? [];
  }, [claimItems, reviewingClaim]);

  const reviewingReceipts = useMemo(() => {
    if (!reviewingClaim) return [];
    return attachments.filter(
      (attachment) =>
        attachment.submission_id === reviewingClaim.id &&
        attachment.attachment_type === "receipt",
    );
  }, [attachments, reviewingClaim]);

  const reviewingDocuments = useMemo(() => {
    if (!reviewingClaim) return [];
    return attachments.filter(
      (attachment) =>
        attachment.submission_id === reviewingClaim.id &&
        attachment.attachment_type === "supporting_document",
    );
  }, [attachments, reviewingClaim]);

  const missingReviewReceiptCount = useMemo(() => {
    if (!reviewingClaim) return 0;

    const receiptItemIds = new Set(
      reviewingReceipts
        .map((attachment) => attachment.item_id)
        .filter((itemId): itemId is string => Boolean(itemId)),
    );

    return reviewingItems.filter((item) => !receiptItemIds.has(item.id)).length;
  }, [reviewingClaim, reviewingItems, reviewingReceipts]);

  const outstandingTotal = claims
    .filter((claim) =>
      ["submitted", "changes_required", "approved"].includes(claim.status),
    )
    .reduce((sum, claim) => sum + asNumber(claim.total_amount), 0);

  const myOutstanding = claims
    .filter(
      (claim) =>
        (claim.created_by === currentUserId ||
          claim.submitted_by === currentUserId ||
          claim.submitted_for_employee_id === currentEmployeeId) &&
        ["submitted", "changes_required"].includes(claim.status),
    )
    .reduce((sum, claim) => sum + asNumber(claim.total_amount), 0);

  function openReviewClaim(claim: ExpenseClaim) {
    setReviewingClaim(claim);
    setReviewComments("");
    setPaymentReference(claim.payment_reference ?? "");
    setReviewError(null);
    setReviewOpen(true);
  }

  async function runReviewAction(
    action: "request_changes" | "deny" | "approve" | "mark_paid",
  ) {
    if (!reviewingClaim) return;

    if (
      (action === "request_changes" || action === "deny") &&
      !reviewComments.trim()
    ) {
      const validationMessage =
        action === "deny"
          ? "Enter the reason for denying this Expense Claim."
          : "Enter what needs to be changed.";

      setReviewError(validationMessage);
      setMessage({
        tone: "error",
        text: validationMessage,
      });
      return;
    }

    const confirmed = window.confirm(
      action === "approve"
        ? `Approve ${reviewingClaim.submission_number} and publish the controlled approved PDF to SharePoint?`
        : action === "deny"
          ? `Deny ${reviewingClaim.submission_number}? The submitter will be notified with your reason.`
          : action === "request_changes"
            ? `Return ${reviewingClaim.submission_number} to the submitter for changes?`
            : `Mark ${reviewingClaim.submission_number} as paid?`,
    );

    if (!confirmed) return;

    setReviewSaving(true);
    setReviewError(null);
    setMessage(null);

    try {
      const response = await apiFetch(
        "/api/expenses/claims/review",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            submissionId: reviewingClaim.id,
            action,
            comments: reviewComments.trim(),
            paymentReference: paymentReference.trim(),
          }),
        },
      );

      const payload = await readApiJson<{
        error?: string;
        status?: FinancialStatus;
      }>(response, "Expense Claim review API");

      if (!response.ok) {
        throw new Error(payload.error ?? "Expense Claim review failed.");
      }

      await loadAll();

      setReviewOpen(false);
      setReviewingClaim(null);
      setReviewComments("");
      setPaymentReference("");

      setMessage({
        tone: "success",
        text:
          action === "request_changes"
            ? "Changes requested."
            : action === "deny"
              ? "Expense Claim denied."
              : action === "approve"
                ? "Expense Claim approved and archived to SharePoint."
                : "Expense Claim marked as paid.",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Expense Claim review failed.";

      setReviewError(errorMessage);
      setMessage({
        tone: "error",
        text: errorMessage,
      });
    } finally {
      setReviewSaving(false);
    }
  }

  function openNewClaim() {
    setEditingClaim(null);
    setDraft({
      ...EMPTY_CLAIM,
      items: [{ ...EMPTY_ITEM }],
    });
    setEditorOpen(true);
  }

  function openEditClaim(claim: ExpenseClaim) {
    const existingItems = claimItems.get(claim.id) ?? [];

    setEditingClaim(claim);
    setDraft({
      projectId: claim.project_id ?? "",
      description: claim.description ?? "",
      notes: claim.notes ?? "",
      items:
        existingItems.length > 0
          ? existingItems.map((item) => ({
              id: item.id,
              categoryId: item.category_id ?? "",
              expenseDate: item.expense_date,
              description: item.description,
              amountIncGst: String(item.amount_inc_gst ?? ""),
              gstAmount: String(item.gst_amount ?? ""),
              notes: item.notes ?? "",
              allocationType: item.fleet_job_id
                ? "fleet_job"
                : item.vehicle_asset_id
                  ? "vehicle"
                  : item.plant_asset_id
                    ? "plant"
                    : item.project_id
                      ? "project"
                      : "general",
              vehicleAssetId: item.vehicle_asset_id ?? "",
              plantAssetId: item.plant_asset_id ?? "",
              fleetJobId: item.fleet_job_id ?? "",
            }))
          : [{ ...EMPTY_ITEM }],
    });
    setEditorOpen(true);
  }

  function allocationLabel(item: ExpenseItem) {
    if (item.fleet_job_id) {
      const job = fleetJobs.find((row) => row.id === item.fleet_job_id);
      return job ? `Fleet Job · ${fleetJobLabel(job)}` : "Fleet Job";
    }

    if (item.vehicle_asset_id) {
      const asset = vehicleAssets.find((row) => row.id === item.vehicle_asset_id);
      return asset ? `Vehicle · ${vehicleLabel(asset)}` : "Vehicle";
    }

    if (item.plant_asset_id) {
      const asset = plantAssets.find((row) => row.id === item.plant_asset_id);
      return asset ? `Plant · ${plantLabel(asset)}` : "Plant";
    }

    if (item.project_id) {
      const project = projects.find((row) => row.id === item.project_id);
      return project
        ? `Project · ${project.project_number || project.name}`
        : "Project";
    }

    return "Company / General";
  }

  function updateDraftItem(index: number, patch: Partial<DraftItem>) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  }

  function addDraftItem() {
    setDraft((current) => ({
      ...current,
      items: [...current.items, { ...EMPTY_ITEM }],
    }));
  }

  function removeDraftItem(index: number) {
    setDraft((current) => ({
      ...current,
      items:
        current.items.length === 1
          ? [{ ...EMPTY_ITEM }]
          : current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function validateDraftItems() {
    const validItems = draft.items.filter(
      (item) =>
        item.description.trim() &&
        asNumber(item.amountIncGst) > 0,
    );

    if (validItems.length === 0) {
      throw new Error(
        "Add at least one expense item with a description and amount.",
      );
    }

    if (validItems.some((item) => !item.categoryId)) {
      throw new Error("Select a category for each expense item.");
    }

    if (validItems.some((item) => !item.expenseDate)) {
      throw new Error("Enter a date for each expense item.");
    }

    if (
      validItems.some(
        (item) => item.allocationType === "project" && !draft.projectId,
      )
    ) {
      throw new Error(
        "Select a project for expense items allocated to Project.",
      );
    }

    if (
      validItems.some(
        (item) => item.allocationType === "vehicle" && !item.vehicleAssetId,
      )
    ) {
      throw new Error("Select a vehicle for each Vehicle allocation.");
    }

    if (
      validItems.some(
        (item) => item.allocationType === "plant" && !item.plantAssetId,
      )
    ) {
      throw new Error("Select a plant asset for each Plant allocation.");
    }

    if (
      validItems.some(
        (item) => item.allocationType === "fleet_job" && !item.fleetJobId,
      )
    ) {
      throw new Error("Select a Fleet Job for each Fleet Job allocation.");
    }

    return validItems;
  }

  async function persistClaim({
    submitForApproval,
    closeAfterSave,
    showSuccessMessage = true,
  }: {
    submitForApproval: boolean;
    closeAfterSave: boolean;
    showSuccessMessage?: boolean;
  }) {
    const validItems = validateDraftItems();

    if (
      editingClaim &&
      !["draft", "changes_required"].includes(editingClaim.status)
    ) {
      throw new Error(
        "This Expense Claim is locked while it is pending approval or after approval.",
      );
    }

    setSaving(true);
    setMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Your session has expired.");
      }

      let submissionId = editingClaim?.id ?? null;
      const nextRevision = Math.max(
        0,
        Number(editingClaim?.revision ?? 0),
      );

      const submissionPayload = {
        submission_type: "expense_claim" as const,
        status: editingClaim?.status ?? "draft",
        revision: nextRevision,
        submitted_for_employee_id: currentEmployeeId,
        created_by: editingClaim?.created_by ?? user.id,
        submitted_by: editingClaim?.submitted_by ?? null,
        project_id: draft.projectId || null,
        claim_period_start: null,
        claim_period_end: null,
        description: draft.description.trim() || null,
        notes: draft.notes.trim() || null,
        submitted_at: editingClaim?.submitted_at ?? null,
        changes_required_reason:
          editingClaim?.changes_required_reason ?? null,
        changes_requested_at:
          editingClaim?.changes_requested_at ?? null,
      };

      if (submissionId) {
        const result = await supabase
          .from("financial_submissions")
          .update(submissionPayload)
          .eq("id", submissionId);

        if (result.error) throw result.error;
      } else {
        const result = await supabase
          .from("financial_submissions")
          .insert(submissionPayload)
          .select("id")
          .single();

        if (result.error) throw result.error;
        submissionId = result.data.id;
      }

      if (!submissionId) {
        throw new Error("Could not save the expense claim.");
      }

      const existing = claimItems.get(submissionId) ?? [];
      const existingIds = new Set(existing.map((item) => item.id));
      const retainedIds = new Set(
        validItems.map((item) => item.id).filter(Boolean) as string[],
      );

      const idsToDelete = [...existingIds].filter(
        (id) => !retainedIds.has(id),
      );

      if (idsToDelete.length > 0) {
        const deleteResult = await supabase
          .from("financial_submission_items")
          .delete()
          .in("id", idsToDelete);

        if (deleteResult.error) throw deleteResult.error;
      }

      const savedItems: DraftItem[] = [];

      for (let index = 0; index < validItems.length; index += 1) {
        const item = validItems[index];
        const totalInc = asNumber(item.amountIncGst);

        const selectedFleetJob =
          item.allocationType === "fleet_job"
            ? fleetJobs.find((job) => job.id === item.fleetJobId) ?? null
            : null;

        const vehicleAssetId =
          item.allocationType === "vehicle"
            ? item.vehicleAssetId || null
            : item.allocationType === "fleet_job"
              ? selectedFleetJob?.vehicle_asset_id ?? null
              : null;

        const plantAssetId =
          item.allocationType === "plant"
            ? item.plantAssetId || null
            : item.allocationType === "fleet_job"
              ? selectedFleetJob?.plant_asset_id ?? null
              : null;

        const assetType: "Vehicle" | "Plant" | null = vehicleAssetId
          ? "Vehicle"
          : plantAssetId
            ? "Plant"
            : null;

        const payload = {
          submission_id: submissionId,
          category_id: item.categoryId || null,
          expense_date: item.expenseDate,
          supplier: null,
          description: item.description.trim(),
          quantity: 1,
          unit_amount_ex_gst: totalInc,
          amount_ex_gst: totalInc,
          gst_amount: 0,
          amount_inc_gst: totalInc,
          notes: item.notes.trim() || null,
          sort_order: index,
          project_id:
            item.allocationType === "general"
              ? null
              : draft.projectId || null,
          gst_applicable: false,
          asset_type: assetType,
          vehicle_asset_id: vehicleAssetId,
          plant_asset_id: plantAssetId,
          fleet_job_id:
            item.allocationType === "fleet_job" ? item.fleetJobId || null : null,
        };

        if (item.id) {
          const updateResult = await supabase
            .from("financial_submission_items")
            .update(payload)
            .eq("id", item.id);

          if (updateResult.error) throw updateResult.error;

          savedItems.push({
            ...item,
            id: item.id,
          });
        } else {
          const insertResult = await supabase
            .from("financial_submission_items")
            .insert(payload)
            .select("id")
            .single();

          if (insertResult.error) throw insertResult.error;

          savedItems.push({
            ...item,
            id: insertResult.data.id,
          });
        }
      }

      if (!submitForApproval) {
        const eventType = editingClaim ? "edited" : "created";

        const eventResult = await supabase
          .from("financial_submission_events")
          .insert({
            submission_id: submissionId,
            revision: nextRevision,
            event_type: eventType,
            performed_by: user.id,
            comments: null,
            metadata: {
              source: "website",
              submission_type: "expense_claim",
            },
          });

        if (eventResult.error) throw eventResult.error;
      }

      if (submitForApproval) {
        const response = await apiFetch(
          "/api/expenses/claims/submit",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              submissionId,
            }),
          },
        );

        const payload = await readApiJson<{
          error?: string;
          warning?: string | null;
          revision?: number;
        }>(response, "Expense Claim submit API");

        if (!response.ok) {
          throw new Error(
            payload.error ??
              "The Expense Claim could not be submitted for approval.",
          );
        }

        if (payload.warning) {
          setMessage({
            tone: "error",
            text: payload.warning,
          });
        }
      }

      const { data: savedClaim, error: savedClaimError } = await supabase
        .from("financial_submissions")
        .select(
          "id, submission_number, submission_type, status, revision, submitted_for_employee_id, created_by, submitted_by, project_id, claim_period_start, claim_period_end, description, notes, subtotal_ex_gst, gst_amount, total_amount, submitted_at, changes_requested_at, changes_required_reason, rejected_at, rejection_reason, approved_at, approved_by_name, approved_by_email, paid_at, payment_reference, created_at, updated_at",
        )
        .eq("id", submissionId)
        .single();

      if (savedClaimError) throw savedClaimError;

      await loadAll();

      if (closeAfterSave) {
        setEditorOpen(false);
        setEditingClaim(null);
        setDraft({
          ...EMPTY_CLAIM,
          items: [{ ...EMPTY_ITEM }],
        });
      } else {
        setEditingClaim(savedClaim as ExpenseClaim);
        setDraft((current) => ({
          ...current,
          items: savedItems,
        }));
      }

      if (showSuccessMessage) {
        setMessage({
          tone: "success",
          text: submitForApproval
            ? "Expense claim submitted for approval."
            : "Expense claim saved.",
        });
      }

      return {
        submissionId,
        savedItems,
        claim: savedClaim as ExpenseClaim,
      };
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await persistClaim({
        submitForApproval: false,
        closeAfterSave: true,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to save the expense claim.",
      });
    }
  }

  async function handleSubmitForApproval() {
    try {
      await persistClaim({
        submitForApproval: true,
        closeAfterSave: true,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to submit the expense claim.",
      });
    }
  }

  async function chooseAndUploadReceipt(
    itemIndex: number,
    replaceAttachmentId?: string,
  ) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";
    input.multiple = false;

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      void uploadReceipt(itemIndex, file, replaceAttachmentId);
    };

    input.click();
  }

  async function uploadReceipt(
    itemIndex: number,
    file: File,
    replaceAttachmentId?: string,
  ) {
    setMessage(null);

    try {
      let submissionId = editingClaim?.id ?? null;
      let itemId = draft.items[itemIndex]?.id ?? null;

      if (!submissionId || !itemId) {
        const saved = await persistClaim({
          submitForApproval: false,
          closeAfterSave: false,
          showSuccessMessage: false,
        });

        submissionId = saved.submissionId;
        itemId = saved.savedItems[itemIndex]?.id ?? null;
      }

      if (!submissionId || !itemId) {
        throw new Error(
          "The expense item could not be saved before uploading its receipt.",
        );
      }

      setUploadingItemId(itemId);

      const formData = new FormData();
      formData.set("file", file);
      formData.set("submissionId", submissionId);
      formData.set("itemId", itemId);
      if (replaceAttachmentId) {
        formData.set("replaceAttachmentId", replaceAttachmentId);
      }

      const response = await apiFetch(
        "/api/expenses/attachments/upload",
        {
          method: "POST",
          body: formData,
        },
      );

      const payload = await readApiJson<
        AttachmentUploadResponse & { warning?: string | null }
      >(response, "Receipt upload API");

      if (!response.ok || !payload.attachment) {
        throw new Error(payload.error ?? "Receipt upload failed.");
      }

      await loadAll();

      setMessage({
        tone: payload.warning ? "error" : "success",
        text: payload.warning ?? `${file.name} uploaded.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Receipt upload failed.",
      });
    } finally {
      setUploadingItemId(null);
    }
  }

  async function removeReceipt(attachment: ExpenseAttachment) {
    if (attachment.attachment_type !== "receipt") return;

    if (
      !window.confirm(
        `Remove receipt ${attachment.file_name}? You can upload a replacement before submitting.`,
      )
    ) {
      return;
    }

    setDeletingAttachmentId(attachment.id);
    setMessage(null);

    try {
      const response = await apiFetch(
        `/api/expenses/attachments/${encodeURIComponent(attachment.id)}`,
        { method: "DELETE" },
      );

      const payload = await readApiJson<{ error?: string; success?: boolean }>(
        response,
        "Receipt delete API",
      );

      if (!response.ok) {
        throw new Error(payload.error ?? "Receipt could not be removed.");
      }

      await loadAll();
      setMessage({ tone: "success", text: "Receipt removed." });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error ? error.message : "Receipt could not be removed.",
      });
    } finally {
      setDeletingAttachmentId(null);
    }
  }

  async function viewAttachment(attachment: ExpenseAttachment) {
    setViewingAttachmentId(attachment.id);
    setMessage(null);

    const previewWindow = window.open("", "_blank");

    try {
      const response = await apiFetch(
        `/api/expenses/attachments/${attachment.id}/content`,
      );

      if (!response.ok) {
        let errorMessage = "Could not open the attachment.";

        try {
          const payload = (await response.json()) as { error?: string };
          errorMessage = payload.error ?? errorMessage;
        } catch {
          // Use the fallback message.
        }

        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      if (previewWindow) {
        previewWindow.location.href = objectUrl;
      } else {
        window.location.href = objectUrl;
      }

      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      previewWindow?.close();

      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not open the attachment.",
      });
    } finally {
      setViewingAttachmentId(null);
    }
  }

  async function deleteDraft(claim: ExpenseClaim) {
    if (claim.status !== "draft") return;

    if (!window.confirm(`Delete ${claim.submission_number}?`)) return;

    setMessage(null);

    try {
      const result = await supabase
        .from("financial_submissions")
        .delete()
        .eq("id", claim.id);

      if (result.error) throw result.error;

      await loadAll();
      setMessage({
        tone: "success",
        text: `${claim.submission_number} deleted.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to delete the expense claim.",
      });
    }
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
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-slate-400">
                <ReceiptText size={18} />
                <p className="text-sm font-semibold uppercase tracking-wider">
                  Expenses & Invoices
                </p>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Expense Claims
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Create, submit and review company expense claims with project, asset
                and Fleet Job allocation, receipts and itemised categories.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/expenses"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <ArrowLeft size={16} />
                Dashboard
              </Link>

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
                onClick={openNewClaim}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Plus size={16} />
                New Expense Claim
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

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="All Claims"
            value={String(claims.length)}
            detail="Visible to you"
            icon={<ReceiptText size={20} />}
          />
          <MetricCard
            label="My Outstanding"
            value={currency(myOutstanding)}
            detail="Submitted or changes required"
            icon={<CalendarDays size={20} />}
          />
          <MetricCard
            label="Company Outstanding"
            value={currency(outstandingTotal)}
            detail="Waiting on action/payment"
            icon={<CircleDollarSign size={20} />}
          />
          <MetricCard
            label="Receipts"
            value={String(
              attachments.filter(
                (attachment) => attachment.attachment_type === "receipt",
              ).length,
            )}
            detail="Uploaded receipt records"
            icon={<FileText size={20} />}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
            <label className="relative block">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search claim number, project or description..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </label>

            <SelectField
              value={viewFilter}
              onChange={(value) => setViewFilter(value as "all" | "mine")}
              options={[
                { value: "all", label: "All Visible Claims" },
                { value: "mine", label: "My Claims" },
              ]}
            />

            <SelectField
              value={statusFilter}
              onChange={(value) =>
                setStatusFilter(value as "all" | FinancialStatus)
              }
              options={[
                { value: "all", label: "All Statuses" },
                { value: "draft", label: "Draft" },
                { value: "submitted", label: "Pending Approval" },
                { value: "changes_required", label: "Changes Required" },
                { value: "rejected", label: "Rejected" },
                { value: "approved", label: "Approved" },
                { value: "paid", label: "Paid" },
              ]}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Expense Claims Register
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {filteredClaims.length} claim
                {filteredClaims.length === 1 ? "" : "s"} shown
              </p>
            </div>
            <Filter size={18} className="text-slate-400" />
          </div>

          {filteredClaims.length === 0 ? (
            <div className="p-12 text-center">
              <ReceiptText size={34} className="mx-auto text-slate-300" />
              <h3 className="mt-4 text-lg font-bold text-slate-900">
                No expense claims found
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Create a new claim or change the filters above.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredClaims.map((claim) => {
                const project = projects.find(
                  (item) => item.id === claim.project_id,
                );
                const owner = employees.find(
                  (employee) => employee.id === claim.submitted_for_employee_id,
                );
                const canEdit =
                  ["draft", "changes_required"].includes(claim.status) &&
                  (claim.created_by === currentUserId ||
                    claim.submitted_by === currentUserId ||
                    claim.submitted_for_employee_id === currentEmployeeId ||
                    financePermissions.isAdmin);
                const claimReceiptCount = attachments.filter(
                  (attachment) =>
                    attachment.submission_id === claim.id &&
                    attachment.attachment_type === "receipt",
                ).length;

                return (
                  <div
                    key={claim.id}
                    className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_140px_150px_auto] xl:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-950">
                          {claim.submission_number}
                        </h3>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(
                            claim.status,
                          )}`}
                        >
                          {statusLabel(claim.status)}
                        </span>
                      </div>

                      <p className="mt-1 truncate text-sm text-slate-600">
                        {claim.description || "No claim description"}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span>
                          {owner?.full_name || "Employee not linked"}
                        </span>
                        <span>{project?.project_number || project?.name || "No project"}</span>
                        <span>{claimReceiptCount} receipt{claimReceiptCount === 1 ? "" : "s"}</span>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Submitted
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {shortDate(claim.submitted_at ?? claim.created_at)}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Items
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-700">
                        {(claimItems.get(claim.id) ?? []).length}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Total
                      </div>
                      <div className="mt-1 text-base font-bold text-slate-950">
                        {currency(asNumber(claim.total_amount))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <button
                        type="button"
                        onClick={() => openReviewClaim(claim)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Eye size={15} />
                        {claim.status === "submitted" &&
                        (financePermissions.canReviewEdit ||
                          financePermissions.canApprove)
                          ? "Review"
                          : "View"}
                      </button>

                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => openEditClaim(claim)}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil size={15} />
                          {claim.status === "draft"
                            ? "Edit Draft"
                            : "Edit & Resubmit"}
                        </button>
                      ) : null}

                      {claim.status === "draft" &&
                      claim.created_by === currentUserId ? (
                        <button
                          type="button"
                          onClick={() => void deleteDraft(claim)}
                          className="rounded-xl border border-rose-200 bg-white p-2 text-rose-700 hover:bg-rose-50"
                          aria-label={`Delete ${claim.submission_number}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {reviewOpen && reviewingClaim ? (
        <ModalShell
          title={`Expense Claim ${reviewingClaim.submission_number}`}
          description="Review the claim details and receipts before taking action."
          onClose={() => {
            setReviewOpen(false);
            setReviewingClaim(null);
            setReviewError(null);
          }}
          wide
        >
          <div className="space-y-6">
            {reviewError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    size={18}
                    className="mt-0.5 shrink-0 text-rose-700"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-rose-900">
                      Review action failed
                    </div>
                    <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-rose-800">
                      {reviewError}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {reviewSaving ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center gap-3 text-sm font-semibold text-blue-900">
                  <Loader2 size={17} className="animate-spin" />
                  Processing review action. You can still close this window if needed.
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Status
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(
                      reviewingClaim.status,
                    )}`}
                  >
                    {statusLabel(reviewingClaim.status)}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    R{String(Math.max(1, reviewingClaim.revision || 1)).padStart(2, "0")}
                  </span>
                </div>
                {reviewingClaim.submitted_at ? (
                  <div className="mt-2 text-xs text-slate-500">
                    Submitted {shortDate(reviewingClaim.submitted_at)}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Employee
                </div>
                <div className="mt-2 text-sm font-bold text-slate-900">
                  {employees.find(
                    (employee) =>
                      employee.id ===
                      reviewingClaim.submitted_for_employee_id,
                  )?.full_name || "Employee not linked"}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Project
                </div>
                <div className="mt-2 text-sm font-bold text-slate-900">
                  {(() => {
                    const project = projects.find(
                      (item) => item.id === reviewingClaim.project_id,
                    );
                    return (
                      project?.project_number ||
                      project?.name ||
                      "Company / General"
                    );
                  })()}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-950 p-4 text-white">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                  Total
                </div>
                <div className="mt-2 text-xl font-bold">
                  {currency(asNumber(reviewingClaim.total_amount))}
                </div>
              </div>
            </div>

            {reviewingClaim.status === "submitted" ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <FileCheck2 size={17} />
                    Review checklist
                  </div>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                    <div className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Items
                      </div>
                      <div className="mt-1 font-bold text-slate-900">
                        {reviewingItems.length}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Receipts
                      </div>
                      <div className="mt-1 font-bold text-slate-900">
                        {reviewingReceipts.length}
                      </div>
                    </div>
                    <div
                      className={`rounded-xl px-3 py-2.5 ring-1 ${
                        missingReviewReceiptCount === 0
                          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                          : "bg-rose-50 text-rose-800 ring-rose-200"
                      }`}
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">
                        Receipt check
                      </div>
                      <div className="mt-1 font-bold">
                        {missingReviewReceiptCount === 0
                          ? "Complete"
                          : `${missingReviewReceiptCount} missing`}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className={`rounded-2xl border p-4 ${
                    financePermissions.canReviewEdit ||
                    financePermissions.canApprove
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <ShieldCheck
                      size={18}
                      className={
                        financePermissions.canReviewEdit ||
                        financePermissions.canApprove
                          ? "mt-0.5 text-emerald-700"
                          : "mt-0.5 text-amber-700"
                      }
                    />
                    <div>
                      <div
                        className={`text-sm font-bold ${
                          financePermissions.canReviewEdit ||
                          financePermissions.canApprove
                            ? "text-emerald-900"
                            : "text-amber-900"
                        }`}
                      >
                        {financePermissions.canReviewEdit ||
                        financePermissions.canApprove
                          ? "Approval authority confirmed"
                          : "No approval authority"}
                      </div>
                      <p
                        className={`mt-1 text-sm leading-5 ${
                          financePermissions.canReviewEdit ||
                          financePermissions.canApprove
                            ? "text-emerald-800"
                            : "text-amber-800"
                        }`}
                      >
                        {financePermissions.isAdmin
                          ? "Administrator override is active."
                          : financePermissions.hasExactUserRule
                            ? "Your individual Finance Settings assignment controls the actions available below."
                            : "Finance module access alone does not grant review or approval rights. An administrator must assign you individually in Finance Settings."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-sm font-bold text-slate-950">
                {reviewingClaim.description || "Expense Claim"}
              </div>
              {reviewingClaim.notes ? (
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  {reviewingClaim.notes}
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              {(claimItems.get(reviewingClaim.id) ?? []).map(
                (item, index) => {
                  const category = categories.find(
                    (categoryItem) =>
                      categoryItem.id === item.category_id,
                  );
                  const itemAttachments = attachments.filter(
                    (attachment) =>
                      attachment.submission_id === reviewingClaim.id &&
                      attachment.item_id === item.id,
                  );

                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 bg-white p-5"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Item {index + 1} · {category?.name || "No category"} ·{" "}
                            {shortDate(item.expense_date)}
                          </div>
                          <div className="mt-1 text-base font-bold text-slate-950">
                            {item.description}
                          </div>
                          <div className="mt-2 inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            {allocationLabel(item)}
                          </div>
                          {item.notes ? (
                            <div className="mt-2 text-sm text-slate-500">
                              {item.notes}
                            </div>
                          ) : null}
                        </div>

                        <div className="shrink-0 text-lg font-bold text-slate-950">
                          {currency(asNumber(item.amount_inc_gst))}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {itemAttachments.length ? (
                          itemAttachments.map((attachment) => (
                            <button
                              key={attachment.id}
                              type="button"
                              onClick={() =>
                                void viewAttachment(attachment)
                              }
                              disabled={
                                viewingAttachmentId === attachment.id
                              }
                              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                            >
                              {viewingAttachmentId === attachment.id ? (
                                <Loader2
                                  size={15}
                                  className="animate-spin"
                                />
                              ) : (
                                <Eye size={15} />
                              )}
                              {attachment.file_name}
                            </button>
                          ))
                        ) : (
                          <span className="text-sm font-semibold text-rose-600">
                            No receipt uploaded
                          </span>
                        )}
                      </div>
                    </div>
                  );
                },
              )}
            </div>

            {reviewingClaim.changes_required_reason ? (
              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
                <div className="text-sm font-bold text-orange-800">
                  Changes requested
                </div>
                <div className="mt-1 text-sm leading-6 text-orange-700">
                  {reviewingClaim.changes_required_reason}
                </div>
              </div>
            ) : null}

            {reviewingClaim.status === "rejected" ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-rose-900">
                  <Ban size={16} />
                  Expense Claim denied
                </div>
                <div className="mt-2 text-sm leading-6 text-rose-800">
                  {reviewingClaim.rejection_reason ||
                    "This Expense Claim was denied."}
                </div>
                {reviewingClaim.rejected_at ? (
                  <div className="mt-2 text-xs font-medium text-rose-700">
                    {shortDate(reviewingClaim.rejected_at)}
                  </div>
                ) : null}
              </div>
            ) : null}

            {(reviewingClaim.status === "approved" ||
              reviewingClaim.status === "paid") &&
            reviewingDocuments.length > 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-800">
                    <FileCheck2 size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-950">
                      Approved SharePoint record
                    </div>
                    <p className="mt-1 text-sm leading-5 text-slate-500">
                      The controlled approved Expense Claim PDF has been archived to SharePoint.
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {reviewingDocuments.map((attachment) => (
                        <button
                          key={attachment.id}
                          type="button"
                          onClick={() => void viewAttachment(attachment)}
                          disabled={viewingAttachmentId === attachment.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          {viewingAttachmentId === attachment.id ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <Eye size={15} />
                          )}
                          {attachment.file_name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {reviewingClaim.status === "approved" ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-sm font-bold text-emerald-800">
                  Approved
                </div>
                <div className="mt-1 text-sm text-emerald-700">
                  {reviewingClaim.approved_by_name || "TTTracker reviewer"}
                  {reviewingClaim.approved_at
                    ? ` · ${shortDate(reviewingClaim.approved_at)}`
                    : ""}
                </div>
              </div>
            ) : null}

            {reviewingClaim.status === "paid" ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="text-sm font-bold text-blue-800">
                  Paid
                </div>
                <div className="mt-1 text-sm text-blue-700">
                  {shortDate(reviewingClaim.paid_at)}
                  {reviewingClaim.payment_reference
                    ? ` · ${reviewingClaim.payment_reference}`
                    : ""}
                </div>
              </div>
            ) : null}

            {reviewingClaim.status === "submitted" &&
            (financePermissions.canReviewEdit ||
              financePermissions.canApprove) ? (
              <Field label="Reviewer comments / reason">
                <textarea
                  value={reviewComments}
                  onChange={(event) =>
                    setReviewComments(event.target.value)
                  }
                  rows={4}
                  placeholder="Optional approval note, or enter the required changes / denial reason."
                  className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </Field>
            ) : null}

            {reviewingClaim.status === "approved" &&
            financePermissions.canMarkPaid ? (
              <Field label="Payment reference">
                <input
                  value={paymentReference}
                  onChange={(event) =>
                    setPaymentReference(event.target.value)
                  }
                  placeholder="Optional payment reference"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </Field>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setReviewOpen(false);
                  setReviewingClaim(null);
                  setReviewError(null);
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>

              {reviewingClaim.status === "submitted" &&
              (financePermissions.canReviewEdit ||
                financePermissions.canApprove) ? (
                <button
                  type="button"
                  onClick={() =>
                    void runReviewAction("request_changes")
                  }
                  disabled={reviewSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-800 hover:bg-orange-100 disabled:opacity-60"
                >
                  {reviewSaving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <MessageSquareText size={16} />
                  )}
                  Request Changes
                </button>
              ) : null}

              {reviewingClaim.status === "submitted" &&
              financePermissions.canApprove ? (
                <button
                  type="button"
                  onClick={() => void runReviewAction("deny")}
                  disabled={reviewSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                >
                  {reviewSaving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Ban size={16} />
                  )}
                  Deny
                </button>
              ) : null}

              {reviewingClaim.status === "submitted" &&
              financePermissions.canApprove ? (
                <button
                  type="button"
                  onClick={() => void runReviewAction("approve")}
                  disabled={reviewSaving || missingReviewReceiptCount > 0}
                  title={
                    missingReviewReceiptCount > 0
                      ? "Every expense item must have a receipt before approval."
                      : "Approve and archive the controlled PDF to SharePoint."
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  {reviewSaving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  Approve & Archive
                </button>
              ) : null}

              {reviewingClaim.status === "approved" &&
              financePermissions.canMarkPaid ? (
                <button
                  type="button"
                  onClick={() => void runReviewAction("mark_paid")}
                  disabled={reviewSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {reviewSaving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CreditCard size={16} />
                  )}
                  Mark Paid
                </button>
              ) : null}
            </div>
          </div>
        </ModalShell>
      ) : null}

      {editorOpen ? (
        <ModalShell
          title={editingClaim ? "Edit Expense Claim" : "New Expense Claim"}
          description="Enter each expense as a separate item. Keep it simple: date, category, what it was for, total amount and receipt."
          onClose={() => setEditorOpen(false)}
          wide
        >
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Project">
                <SelectField
                  value={draft.projectId}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      projectId: value,
                    }))
                  }
                  options={[
                    { value: "", label: "No project / Company expense" },
                    ...projects.map((project) => ({
                      value: project.id,
                      label: project.project_number
                        ? `${project.project_number} — ${project.name}`
                        : project.name,
                    })),
                  ]}
                />
              </Field>

              <Field label="Claim description">
                <input
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="e.g. Site travel expenses"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </Field>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-950">
                    Expense Items
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Keep it simple: what was it for, how much was it, and upload the receipt.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={addDraftItem}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Plus size={15} />
                  Add Item
                </button>
              </div>

              <div className="mt-4 space-y-4">
                {draft.items.map((item, index) => (
                  <div
                    key={item.id ?? `new-${index}`}
                    className="rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-slate-900">
                        Item {index + 1}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDraftItem(index)}
                        className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                        aria-label={`Remove item ${index + 1}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <Field label="Date">
                        <input
                          type="date"
                          value={item.expenseDate}
                          onChange={(event) =>
                            updateDraftItem(index, {
                              expenseDate: event.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                        />
                      </Field>

                      <Field label="Category">
                        <SelectField
                          value={item.categoryId}
                          onChange={(value) =>
                            updateDraftItem(index, {
                              categoryId: value,
                            })
                          }
                          options={[
                            { value: "", label: "Select category..." },
                            ...categories
                              .filter((category) => category.active)
                              .map((category) => ({
                                value: category.id,
                                label: category.name,
                              })),
                          ]}
                        />
                      </Field>

                      <Field label="What was it for?">
                        <input
                          value={item.description}
                          onChange={(event) =>
                            updateDraftItem(index, {
                              description: event.target.value,
                            })
                          }
                          placeholder="What was purchased?"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                        />
                      </Field>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <Field label="Cost Allocation">
                        <SelectField
                          value={item.allocationType}
                          onChange={(value) =>
                            updateDraftItem(index, {
                              allocationType: value as AllocationType,
                              vehicleAssetId:
                                value === "vehicle" ? item.vehicleAssetId : "",
                              plantAssetId:
                                value === "plant" ? item.plantAssetId : "",
                              fleetJobId:
                                value === "fleet_job" ? item.fleetJobId : "",
                            })
                          }
                          options={[
                            { value: "general", label: "Company / General" },
                            { value: "project", label: "Project" },
                            { value: "vehicle", label: "Vehicle" },
                            { value: "plant", label: "Plant" },
                            { value: "fleet_job", label: "Fleet Job" },
                          ]}
                        />
                      </Field>

                      {item.allocationType === "project" ? (
                        <Field label="Allocated Project">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
                            {projects.find((project) => project.id === draft.projectId)
                              ? (() => {
                                  const project = projects.find(
                                    (row) => row.id === draft.projectId,
                                  );
                                  return (
                                    project?.project_number ||
                                    project?.name ||
                                    "Selected project"
                                  );
                                })()
                              : "Select the claim project above"}
                          </div>
                        </Field>
                      ) : null}

                      {item.allocationType === "vehicle" ? (
                        <Field label="Vehicle">
                          <SelectField
                            value={item.vehicleAssetId}
                            onChange={(value) =>
                              updateDraftItem(index, { vehicleAssetId: value })
                            }
                            options={[
                              { value: "", label: "Select vehicle..." },
                              ...vehicleAssets.map((asset) => ({
                                value: asset.id,
                                label: vehicleLabel(asset),
                              })),
                            ]}
                          />
                        </Field>
                      ) : null}

                      {item.allocationType === "plant" ? (
                        <Field label="Plant Asset">
                          <SelectField
                            value={item.plantAssetId}
                            onChange={(value) =>
                              updateDraftItem(index, { plantAssetId: value })
                            }
                            options={[
                              { value: "", label: "Select plant..." },
                              ...plantAssets.map((asset) => ({
                                value: asset.id,
                                label: plantLabel(asset),
                              })),
                            ]}
                          />
                        </Field>
                      ) : null}

                      {item.allocationType === "fleet_job" ? (
                        <Field label="Fleet Job">
                          <SelectField
                            value={item.fleetJobId}
                            onChange={(value) =>
                              updateDraftItem(index, { fleetJobId: value })
                            }
                            options={[
                              { value: "", label: "Select Fleet Job..." },
                              ...fleetJobs.map((job) => ({
                                value: job.id,
                                label: fleetJobLabel(job),
                              })),
                            ]}
                          />
                        </Field>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <Field label="Total Amount">
                        <input
                          inputMode="decimal"
                          value={item.amountIncGst}
                          onChange={(event) =>
                            updateDraftItem(index, {
                              amountIncGst: event.target.value,
                            })
                          }
                          placeholder="0.00"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                        />
                      </Field>

                      <Field label="Receipt">
                        <div className="space-y-2">
                          {item.id &&
                          attachments.some(
                            (attachment) =>
                              attachment.item_id === item.id &&
                              attachment.attachment_type === "receipt",
                          )
                            ? attachments
                                .filter(
                                  (attachment) =>
                                    attachment.item_id === item.id &&
                                    attachment.attachment_type === "receipt",
                                )
                                .map((attachment) => (
                                  <div
                                    key={attachment.id}
                                    className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => void viewAttachment(attachment)}
                                      disabled={
                                        viewingAttachmentId === attachment.id ||
                                        deletingAttachmentId === attachment.id
                                      }
                                      className="flex w-full items-center justify-between gap-3 text-left text-xs font-semibold text-emerald-800 disabled:opacity-60"
                                    >
                                      <span className="min-w-0 truncate">
                                        {attachment.file_name}
                                      </span>
                                      {viewingAttachmentId === attachment.id ? (
                                        <Loader2 size={14} className="shrink-0 animate-spin" />
                                      ) : (
                                        <Eye size={14} className="shrink-0" />
                                      )}
                                    </button>

                                    <div className="mt-2 flex flex-wrap gap-2 border-t border-emerald-200 pt-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void chooseAndUploadReceipt(
                                            index,
                                            attachment.id,
                                          )
                                        }
                                        disabled={
                                          saving ||
                                          Boolean(uploadingItemId) ||
                                          Boolean(deletingAttachmentId)
                                        }
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60"
                                      >
                                        <Upload size={13} />
                                        Replace
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void removeReceipt(attachment)}
                                        disabled={
                                          saving ||
                                          Boolean(uploadingItemId) ||
                                          Boolean(deletingAttachmentId)
                                        }
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-60"
                                      >
                                        {deletingAttachmentId === attachment.id ? (
                                          <Loader2 size={13} className="animate-spin" />
                                        ) : (
                                          <Trash2 size={13} />
                                        )}
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                ))
                            : null}

                          <button
                            type="button"
                            onClick={() => void chooseAndUploadReceipt(index)}
                            disabled={
                              saving ||
                              Boolean(uploadingItemId) ||
                              Boolean(deletingAttachmentId)
                            }
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            {uploadingItemId && uploadingItemId === item.id ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Upload size={15} />
                            )}
                            {item.id
                              ? attachments.some(
                                  (attachment) =>
                                    attachment.item_id === item.id &&
                                    attachment.attachment_type === "receipt",
                                )
                                ? "Upload Additional Receipt"
                                : "Upload Receipt"
                              : "Save Draft & Upload Receipt"}
                          </button>
                        </div>
                      </Field>
                    </div>

                    <div className="mt-4">
                      <Field label="Item notes">
                        <textarea
                          value={item.notes}
                          onChange={(event) =>
                            updateDraftItem(index, {
                              notes: event.target.value,
                            })
                          }
                          rows={2}
                          className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex justify-end">
                <div className="rounded-xl bg-slate-950 px-4 py-3 text-white">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                    Claim Total
                  </div>
                  <div className="mt-1 text-xl font-bold">
                    {currency(
                      draft.items.reduce(
                        (sum, item) => sum + asNumber(item.amountIncGst),
                        0,
                      ),
                    )}
                  </div>
                </div>
              </div>
            </div>

            <Field label="General notes">
              <textarea
                value={draft.notes}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Anything the reviewer should know."
                className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </Field>

            {editingClaim?.status === "changes_required" &&
            editingClaim.changes_required_reason ? (
              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
                <div className="text-sm font-bold text-orange-800">
                  Changes requested
                </div>
                <div className="mt-1 text-sm leading-6 text-orange-700">
                  {editingClaim.changes_required_reason}
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
              <strong className="text-slate-800">Save Draft</strong> keeps the claim editable. You can return later, change the expense or asset allocation, replace receipts, then submit it for approval. Once submitted, the claim is locked until a reviewer requests changes.
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                disabled={saving}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving || Boolean(uploadingItemId) || Boolean(deletingAttachmentId)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {editingClaim?.status === "changes_required"
                  ? "Save Changes"
                  : "Save Draft"}
              </button>

              <button
                type="button"
                onClick={() => void handleSubmitForApproval()}
                disabled={saving || Boolean(uploadingItemId) || Boolean(deletingAttachmentId)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                Submit for Approval
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-500">{label}</div>
          <div className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-950">
            {value}
          </div>
          <div className="mt-1 text-xs text-slate-400">{detail}</div>
        </div>
        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
          {icon}
        </div>
      </div>
    </div>
  );
}

function ModalShell({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
      <div
        className={`my-auto w-full rounded-3xl border border-slate-200 bg-white shadow-2xl ${
          wide ? "max-w-6xl" : "max-w-2xl"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
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

        <div className="p-6">{children}</div>
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

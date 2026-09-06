"use client";

import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  FileText,
  Filter,
  Loader2,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
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

type Employee = {
  id: string;
  full_name: string;
  user_id?: string | null;
};

type DraftItem = {
  id?: string;
  categoryId: string;
  expenseDate: string;
  supplier: string;
  description: string;
  amountIncGst: string;
  gstAmount: string;
  notes: string;
};

type ClaimDraft = {
  projectId: string;
  claimPeriodStart: string;
  claimPeriodEnd: string;
  description: string;
  notes: string;
  items: DraftItem[];
};

const EMPTY_ITEM: DraftItem = {
  categoryId: "",
  expenseDate: new Date().toISOString().slice(0, 10),
  supplier: "",
  description: "",
  amountIncGst: "",
  gstAmount: "",
  notes: "",
};

const EMPTY_CLAIM: ClaimDraft = {
  projectId: "",
  claimPeriodStart: "",
  claimPeriodEnd: "",
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
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | FinancialStatus>("all");
  const [viewFilter, setViewFilter] = useState<"all" | "mine">("all");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingClaim, setEditingClaim] = useState<ExpenseClaim | null>(null);
  const [draft, setDraft] = useState<ClaimDraft>(EMPTY_CLAIM);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

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
    ] = await Promise.all([
      supabase
        .from("financial_submissions")
        .select(
          "id, submission_number, submission_type, status, submitted_for_employee_id, created_by, submitted_by, project_id, claim_period_start, claim_period_end, description, notes, subtotal_ex_gst, gst_amount, total_amount, submitted_at, changes_requested_at, changes_required_reason, rejected_at, rejection_reason, approved_at, approved_by_name, approved_by_email, paid_at, payment_reference, created_at, updated_at",
        )
        .eq("submission_type", "expense_claim")
        .order("created_at", { ascending: false }),
      supabase
        .from("financial_submission_items")
        .select(
          "id, submission_id, category_id, expense_date, supplier, description, quantity, unit_amount_ex_gst, amount_ex_gst, gst_amount, amount_inc_gst, notes, sort_order",
        )
        .order("sort_order"),
      supabase
        .from("financial_attachments")
        .select(
          "id, submission_id, item_id, attachment_type, file_name, content_type, file_size_bytes, uploaded_at",
        )
        .eq("attachment_type", "receipt")
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
    ]);

    if (claimResult.error) throw claimResult.error;
    if (itemResult.error) throw itemResult.error;
    if (attachmentResult.error) throw attachmentResult.error;
    if (categoryResult.error) throw categoryResult.error;
    if (projectResult.error) throw projectResult.error;
    if (employeeResult.error) throw employeeResult.error;

    setClaims((claimResult.data ?? []) as ExpenseClaim[]);
    setItems((itemResult.data ?? []) as ExpenseItem[]);
    setAttachments((attachmentResult.data ?? []) as ExpenseAttachment[]);
    setCategories((categoryResult.data ?? []) as FinancialCategory[]);
    setProjects((projectResult.data ?? []) as Project[]);
    setEmployees((employeeResult.data ?? []) as Employee[]);

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
        .map((item) => `${item.supplier ?? ""} ${item.description}`)
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
      claimPeriodStart: claim.claim_period_start ?? "",
      claimPeriodEnd: claim.claim_period_end ?? "",
      description: claim.description ?? "",
      notes: claim.notes ?? "",
      items:
        existingItems.length > 0
          ? existingItems.map((item) => ({
              id: item.id,
              categoryId: item.category_id ?? "",
              expenseDate: item.expense_date,
              supplier: item.supplier ?? "",
              description: item.description,
              amountIncGst: String(item.amount_inc_gst ?? ""),
              gstAmount: String(item.gst_amount ?? ""),
              notes: item.notes ?? "",
            }))
          : [{ ...EMPTY_ITEM }],
    });
    setEditorOpen(true);
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

  async function saveClaim(
    event: FormEvent<HTMLFormElement>,
    submitForApproval = false,
  ) {
    event.preventDefault();

    const validItems = draft.items.filter(
      (item) =>
        item.description.trim() &&
        asNumber(item.amountIncGst) > 0,
    );

    if (validItems.length === 0) {
      setMessage({
        tone: "error",
        text: "Add at least one expense item with a description and amount.",
      });
      return;
    }

    if (validItems.some((item) => !item.categoryId)) {
      setMessage({
        tone: "error",
        text: "Select a category for each expense item.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Your session has expired.");

      let submissionId = editingClaim?.id ?? null;

      const submissionPayload = {
        submission_type: "expense_claim",
        status: submitForApproval ? "submitted" : editingClaim?.status ?? "draft",
        submitted_for_employee_id: currentEmployeeId,
        created_by: editingClaim?.created_by ?? user.id,
        submitted_by: submitForApproval ? user.id : editingClaim?.submitted_by ?? null,
        project_id: draft.projectId || null,
        claim_period_start: draft.claimPeriodStart || null,
        claim_period_end: draft.claimPeriodEnd || null,
        description: draft.description.trim() || null,
        notes: draft.notes.trim() || null,
        submitted_at: submitForApproval
          ? new Date().toISOString()
          : editingClaim?.submitted_at ?? null,
        changes_required_reason:
          editingClaim?.status === "changes_required" && submitForApproval
            ? null
            : editingClaim?.changes_required_reason ?? null,
        changes_requested_at:
          editingClaim?.status === "changes_required" && submitForApproval
            ? null
            : editingClaim?.changes_requested_at ?? null,
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

      if (!submissionId) throw new Error("Could not save the expense claim.");

      const existing = claimItems.get(submissionId) ?? [];
      const existingIds = new Set(existing.map((item) => item.id));
      const retainedIds = new Set(validItems.map((item) => item.id).filter(Boolean));

      const idsToDelete = [...existingIds].filter((id) => !retainedIds.has(id));

      if (idsToDelete.length > 0) {
        const deleteResult = await supabase
          .from("financial_submission_items")
          .delete()
          .in("id", idsToDelete);

        if (deleteResult.error) throw deleteResult.error;
      }

      for (let index = 0; index < validItems.length; index += 1) {
        const item = validItems[index];
        const totalInc = asNumber(item.amountIncGst);
        const gst = Math.max(0, asNumber(item.gstAmount));
        const exGst = Math.max(0, totalInc - gst);

        const payload = {
          submission_id: submissionId,
          category_id: item.categoryId || null,
          expense_date: item.expenseDate,
          supplier: item.supplier.trim() || null,
          description: item.description.trim(),
          quantity: 1,
          unit_amount_ex_gst: exGst,
          amount_ex_gst: exGst,
          gst_amount: gst,
          amount_inc_gst: totalInc,
          notes: item.notes.trim() || null,
          sort_order: index,
        };

        if (item.id) {
          const updateResult = await supabase
            .from("financial_submission_items")
            .update(payload)
            .eq("id", item.id);

          if (updateResult.error) throw updateResult.error;
        } else {
          const insertResult = await supabase
            .from("financial_submission_items")
            .insert(payload);

          if (insertResult.error) throw insertResult.error;
        }
      }

      const eventType = submitForApproval
        ? editingClaim?.status === "changes_required"
          ? "resubmitted"
          : "submitted"
        : editingClaim
          ? "edited"
          : "created";

      const eventResult = await supabase
        .from("financial_submission_events")
        .insert({
          submission_id: submissionId,
          revision: editingClaim?.status === "changes_required" && submitForApproval
            ? (editingClaim ? 1 : 0)
            : 0,
          event_type: eventType,
          performed_by: user.id,
          comments: null,
          metadata: {
            source: "website",
            submission_type: "expense_claim",
          },
        });

      if (eventResult.error) throw eventResult.error;

      await loadAll();
      setEditorOpen(false);
      setEditingClaim(null);
      setDraft({
        ...EMPTY_CLAIM,
        items: [{ ...EMPTY_ITEM }],
      });

      setMessage({
        tone: "success",
        text: submitForApproval
          ? "Expense claim submitted for approval."
          : "Expense claim saved.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to save the expense claim.",
      });
    } finally {
      setSaving(false);
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
                Create, submit and review company expense claims with project
                allocation and itemised categories.
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
            value={String(attachments.length)}
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
                placeholder="Search claim number, project, supplier or description..."
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
                const canEdit = ["draft", "submitted", "changes_required"].includes(
                  claim.status,
                );
                const claimReceiptCount = attachments.filter(
                  (attachment) => attachment.submission_id === claim.id,
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
                        Claim period
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {claim.claim_period_start || claim.claim_period_end
                          ? `${shortDate(claim.claim_period_start)} – ${shortDate(
                              claim.claim_period_end,
                            )}`
                          : shortDate(claim.created_at)}
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
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => openEditClaim(claim)}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil size={15} />
                          Edit
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

      {editorOpen ? (
        <ModalShell
          title={editingClaim ? "Edit Expense Claim" : "New Expense Claim"}
          description="Enter each expense as a separate line item. Receipts can be linked to items once SharePoint upload is connected."
          onClose={() => setEditorOpen(false)}
          wide
        >
          <form
            onSubmit={(event) => void saveClaim(event, false)}
            className="space-y-6"
          >
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

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Claim period start">
                <input
                  type="date"
                  value={draft.claimPeriodStart}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      claimPeriodStart: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </Field>

              <Field label="Claim period end">
                <input
                  type="date"
                  value={draft.claimPeriodEnd}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      claimPeriodEnd: event.target.value,
                    }))
                  }
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
                    Enter the total paid and GST shown on the receipt.
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

                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

                      <Field label="Supplier">
                        <input
                          value={item.supplier}
                          onChange={(event) =>
                            updateDraftItem(index, {
                              supplier: event.target.value,
                            })
                          }
                          placeholder="e.g. BP, Bunnings"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                        />
                      </Field>

                      <Field label="Description">
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

                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <Field label="Amount paid (inc. GST)">
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

                      <Field label="GST">
                        <input
                          inputMode="decimal"
                          value={item.gstAmount}
                          onChange={(event) =>
                            updateDraftItem(index, {
                              gstAmount: event.target.value,
                            })
                          }
                          placeholder="0.00"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                        />
                      </Field>

                      <Field label="Receipt">
                        <button
                          type="button"
                          disabled
                          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-400"
                          title="SharePoint upload endpoint will be connected next."
                        >
                          <Upload size={15} />
                          Upload Receipt
                        </button>
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
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save
              </button>

              <button
                type="button"
                onClick={(event) =>
                  void saveClaim(
                    event as unknown as FormEvent<HTMLFormElement>,
                    true,
                  )
                }
                disabled={saving}
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

"use client";

import {
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  FileText,
  FolderOpen,
  HardDrive,
  Loader2,
  Mail,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Smartphone,
  Trash2,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type WebsiteRole =
  | "admin"
  | "hseq"
  | "asset_manager"
  | "commercial"
  | "editor"
  | "crew"
  | "viewer";

type FinancialSubmissionType = "expense_claim" | "invoice";

type FinancialStatus =
  | "draft"
  | "submitted"
  | "changes_required"
  | "rejected"
  | "approved"
  | "paid";

type DatePreset =
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "financial_year"
  | "all";

type DashboardTab = "dashboard" | "settings";

type Project = {
  id: string;
  name: string;
  project_number: string | null;
};

type Submission = {
  id: string;
  submission_number: string;
  submission_type: FinancialSubmissionType;
  status: FinancialStatus;
  project_id: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  description: string | null;
  total_amount: number | string | null;
  submitted_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  due_date: string | null;
  created_at: string;
};

type SubmissionItem = {
  id: string;
  submission_id: string;
  category_id: string | null;
  amount_inc_gst: number | string | null;
};

type FinancialCategory = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type FinancialAccessRule = {
  id: string;
  applies_to: "all" | FinancialSubmissionType;
  principal_type: "role" | "user";
  role: string | null;
  user_id: string | null;
  receives_email: boolean;
  receives_in_app: boolean;
  can_review_edit: boolean;
  can_approve: boolean;
  can_mark_paid: boolean;
  active: boolean;
};


type FinancialSettings = {
  id: boolean;
  sharepoint_site_id: string | null;
  sharepoint_site_name: string | null;
  sharepoint_site_url: string | null;
  sharepoint_drive_id: string | null;
  sharepoint_drive_name: string | null;
  sharepoint_base_folder: string;
  sharepoint_configured_at: string | null;
  sharepoint_configured_by: string | null;
  approval_email_enabled: boolean;
  approval_in_app_enabled: boolean;
  approval_push_enabled: boolean;
  reminder_email_enabled: boolean;
  reminder_in_app_enabled: boolean;
  reminder_push_enabled: boolean;
  claim_pending_reminder_days: number;
  claim_pending_second_reminder_days: number;
  approved_unpaid_reminder_days: number;
  invoice_due_soon_days: number;
  invoice_overdue_reminder_days: number;
  reminders_enabled: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

type SharePointLibraryOption = {
  id: string;
  name: string;
  webUrl: string | null;
};

type SharePointDiscoveryResponse = {
  site?: {
    id: string;
    name: string;
    webUrl: string | null;
  };
  libraries?: SharePointLibraryOption[];
  settings?: FinancialSettings;
  library?: SharePointLibraryOption;
  error?: string;
};

type AdminApiUser = {
  user_id?: string;
  id?: string;
  email?: string | null;
  website_role?: string | null;
  role?: string | null;
  employee?: {
    full_name?: string | null;
  } | null;
  employee_name?: string | null;
};

type AdminUsersResponse = {
  users?: AdminApiUser[];
  error?: string;
};

type ReviewerUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

type CategoryDraft = {
  name: string;
  description: string;
};

type RuleDraft = {
  appliesTo: "all" | FinancialSubmissionType;
  principalType: "role" | "user";
  role: WebsiteRole;
  userId: string;
  receivesEmail: boolean;
  receivesInApp: boolean;
  canReviewEdit: boolean;
  canApprove: boolean;
  canMarkPaid: boolean;
};


const DEFAULT_FINANCIAL_SETTINGS: FinancialSettings = {
  id: true,
  sharepoint_site_id: null,
  sharepoint_site_name: null,
  sharepoint_site_url: null,
  sharepoint_drive_id: null,
  sharepoint_drive_name: null,
  sharepoint_base_folder: "Expenses & Invoices",
  sharepoint_configured_at: null,
  sharepoint_configured_by: null,
  approval_email_enabled: true,
  approval_in_app_enabled: true,
  approval_push_enabled: true,
  reminder_email_enabled: true,
  reminder_in_app_enabled: true,
  reminder_push_enabled: true,
  claim_pending_reminder_days: 2,
  claim_pending_second_reminder_days: 5,
  approved_unpaid_reminder_days: 3,
  invoice_due_soon_days: 7,
  invoice_overdue_reminder_days: 1,
  reminders_enabled: true,
  created_at: "",
  updated_at: "",
  updated_by: null,
};

const WEBSITE_ROLES: Array<{ value: WebsiteRole; label: string }> = [
  { value: "admin", label: "Administrator" },
  { value: "hseq", label: "HSEQ" },
  { value: "asset_manager", label: "Asset Manager" },
  { value: "commercial", label: "Commercial" },
  { value: "editor", label: "Editor" },
  { value: "crew", label: "Crew / Field" },
  { value: "viewer", label: "Viewer" },
];

const EMPTY_CATEGORY: CategoryDraft = {
  name: "",
  description: "",
};

const EMPTY_RULE: RuleDraft = {
  appliesTo: "all",
  principalType: "role",
  role: "commercial",
  userId: "",
  receivesEmail: true,
  receivesInApp: true,
  canReviewEdit: true,
  canApprove: false,
  canMarkPaid: false,
};

function normaliseRole(value?: string | null): WebsiteRole {
  const role = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");

  if (role === "administrator" || role === "site_admin") return "admin";
  if (role === "safety" || role === "safety_manager") return "hseq";
  if (role === "assets" || role === "mechanic") return "asset_manager";
  if (role === "commercial_manager") return "commercial";
  if (role === "leading_hand" || role === "field") return "crew";

  if (
    [
      "admin",
      "hseq",
      "asset_manager",
      "commercial",
      "editor",
      "crew",
      "viewer",
    ].includes(role)
  ) {
    return role as WebsiteRole;
  }

  return "viewer";
}

function roleLabel(role?: string | null) {
  const normalised = normaliseRole(role);
  return (
    WEBSITE_ROLES.find((item) => item.value === normalised)?.label ??
    normalised
  );
}

function asNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function currency(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
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

function getDateRange(preset: DatePreset) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (preset === "all") {
    return { start: null as Date | null, end: null as Date | null };
  }

  if (preset === "this_month") {
    return {
      start: new Date(year, month, 1),
      end: new Date(year, month + 1, 1),
    };
  }

  if (preset === "last_month") {
    return {
      start: new Date(year, month - 1, 1),
      end: new Date(year, month, 1),
    };
  }

  if (preset === "last_3_months") {
    return {
      start: new Date(year, month - 2, 1),
      end: new Date(year, month + 1, 1),
    };
  }

  const financialYearStart =
    month >= 6 ? new Date(year, 6, 1) : new Date(year - 1, 6, 1);

  return {
    start: financialYearStart,
    end: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  };
}

function isWithinRange(value: string, preset: DatePreset) {
  if (preset === "all") return true;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const { start, end } = getDateRange(preset);

  return Boolean(
    (!start || date >= start) &&
      (!end || date < end),
  );
}

export default function ExpensesDashboardPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [tab, setTab] = useState<DashboardTab>("dashboard");
  const [datePreset, setDatePreset] = useState<DatePreset>("this_month");

  const [currentRole, setCurrentRole] = useState<WebsiteRole>("viewer");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [items, setItems] = useState<SubmissionItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [accessRules, setAccessRules] = useState<FinancialAccessRule[]>([]);
  const [reviewerUsers, setReviewerUsers] = useState<ReviewerUser[]>([]);
  const [financeSettings, setFinanceSettings] = useState<FinancialSettings>(
    DEFAULT_FINANCIAL_SETTINGS,
  );
  const [financeSettingsSaving, setFinanceSettingsSaving] = useState(false);
  const [sharePointDiscovering, setSharePointDiscovering] = useState(false);
  const [sharePointLibraries, setSharePointLibraries] = useState<
    SharePointLibraryOption[]
  >([]);
  const [selectedSharePointDriveId, setSelectedSharePointDriveId] =
    useState("");

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<FinancialCategory | null>(null);
  const [categoryDraft, setCategoryDraft] =
    useState<CategoryDraft>(EMPTY_CATEGORY);
  const [categorySaving, setCategorySaving] = useState(false);

  const [ruleOpen, setRuleOpen] = useState(false);
  const [editingRule, setEditingRule] =
    useState<FinancialAccessRule | null>(null);
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(EMPTY_RULE);
  const [ruleSaving, setRuleSaving] = useState(false);

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const isAdmin = currentRole === "admin";

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

  const loadDashboard = useCallback(async () => {
    const [
      userResult,
      submissionResult,
      itemResult,
      projectResult,
      categoryResult,
    ] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("financial_submissions")
        .select(
          "id, submission_number, submission_type, status, project_id, supplier_name, invoice_number, description, total_amount, submitted_at, approved_at, paid_at, due_date, created_at",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("financial_submission_items")
        .select("id, submission_id, category_id, amount_inc_gst"),
      supabase
        .from("projects")
        .select("id, name, project_number")
        .order("name"),
      supabase
        .from("financial_categories")
        .select("id, name, description, active, sort_order, created_at, updated_at")
        .order("sort_order")
        .order("name"),
    ]);

    if (userResult.error) throw userResult.error;
    if (submissionResult.error) throw submissionResult.error;
    if (itemResult.error) throw itemResult.error;
    if (projectResult.error) throw projectResult.error;
    if (categoryResult.error) throw categoryResult.error;

    const user = userResult.data.user;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const roleResult = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (roleResult.error) throw roleResult.error;

    setCurrentRole(normaliseRole(roleResult.data?.role));
    setSubmissions((submissionResult.data ?? []) as Submission[]);
    setItems((itemResult.data ?? []) as SubmissionItem[]);
    setProjects((projectResult.data ?? []) as Project[]);
    setCategories((categoryResult.data ?? []) as FinancialCategory[]);
  }, [supabase]);

  const loadSettings = useCallback(async () => {
    if (!isAdmin) return;

    setSettingsLoading(true);

    try {
      const [ruleResult, settingsResult] = await Promise.all([
        supabase
          .from("financial_access_rules")
          .select(
            "id, applies_to, principal_type, role, user_id, receives_email, receives_in_app, can_review_edit, can_approve, can_mark_paid, active",
          )
          .order("applies_to")
          .order("principal_type"),
        supabase
          .from("financial_settings")
          .select(
            "id, sharepoint_site_id, sharepoint_site_name, sharepoint_site_url, sharepoint_drive_id, sharepoint_drive_name, sharepoint_base_folder, sharepoint_configured_at, sharepoint_configured_by, approval_email_enabled, approval_in_app_enabled, approval_push_enabled, reminder_email_enabled, reminder_in_app_enabled, reminder_push_enabled, claim_pending_reminder_days, claim_pending_second_reminder_days, approved_unpaid_reminder_days, invoice_due_soon_days, invoice_overdue_reminder_days, reminders_enabled, created_at, updated_at, updated_by",
          )
          .eq("id", true)
          .maybeSingle(),
      ]);

      if (ruleResult.error) throw ruleResult.error;
      if (settingsResult.error) throw settingsResult.error;

      setAccessRules((ruleResult.data ?? []) as FinancialAccessRule[]);
      setFinanceSettings(
        settingsResult.data
          ? (settingsResult.data as FinancialSettings)
          : DEFAULT_FINANCIAL_SETTINGS,
      );

      const response = await apiFetch("/api/admin/users");
      const payload = (await response.json()) as AdminUsersResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load TTTracker users.");
      }

      const mappedUsers = (payload.users ?? [])
        .map((user): ReviewerUser | null => {
          const id = String(user.user_id ?? user.id ?? "").trim();
          if (!id) return null;

          const email = String(user.email ?? "").trim();
          const name =
            String(
              user.employee?.full_name ??
                user.employee_name ??
                email ??
                "TTTracker user",
            ).trim() || "TTTracker user";

          return {
            id,
            email,
            name,
            role: normaliseRole(user.website_role ?? user.role),
          };
        })
        .filter((user): user is ReviewerUser => Boolean(user))
        .sort((a, b) => a.name.localeCompare(b.name));

      setReviewerUsers(mappedUsers);
    } finally {
      setSettingsLoading(false);
    }
  }, [apiFetch, isAdmin, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await loadDashboard();
        } catch (error) {
          setMessage({
            tone: "error",
            text:
              error instanceof Error
                ? error.message
                : "Failed to load Expenses & Invoices.",
          });
        } finally {
          setLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  useEffect(() => {
    if (tab !== "settings" || !isAdmin) return;

    const timer = window.setTimeout(() => {
      void loadSettings().catch((error) => {
        setMessage({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : "Failed to load financial settings.",
        });
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isAdmin, loadSettings, tab]);

  async function refreshAll() {
    setRefreshing(true);
    setMessage(null);

    try {
      await loadDashboard();

      if (tab === "settings" && isAdmin) {
        await loadSettings();
      }
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to refresh Expenses & Invoices.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  const filteredSubmissions = useMemo(
    () =>
      submissions.filter((submission) =>
        isWithinRange(submission.created_at, datePreset),
      ),
    [datePreset, submissions],
  );

  const filteredSubmissionIds = useMemo(
    () => new Set(filteredSubmissions.map((submission) => submission.id)),
    [filteredSubmissions],
  );

  const filteredItems = useMemo(
    () =>
      items.filter((item) => filteredSubmissionIds.has(item.submission_id)),
    [filteredSubmissionIds, items],
  );

  const pendingExpenseClaims = filteredSubmissions.filter(
    (submission) =>
      submission.submission_type === "expense_claim" &&
      ["submitted", "changes_required"].includes(submission.status),
  );

  const pendingInvoices = filteredSubmissions.filter(
    (submission) =>
      submission.submission_type === "invoice" &&
      ["submitted", "changes_required"].includes(submission.status),
  );

  const approvedThisPeriod = filteredSubmissions
    .filter((submission) => submission.status === "approved")
    .reduce((sum, submission) => sum + asNumber(submission.total_amount), 0);

  const awaitingPayment = filteredSubmissions
    .filter((submission) => submission.status === "approved")
    .reduce((sum, submission) => sum + asNumber(submission.total_amount), 0);

  const totalSpend = filteredSubmissions
    .filter((submission) =>
      ["approved", "paid"].includes(submission.status),
    )
    .reduce((sum, submission) => sum + asNumber(submission.total_amount), 0);

  const categorySummary = useMemo(() => {
    const totals = new Map<string, number>();

    for (const item of filteredItems) {
      const key = item.category_id ?? "uncategorised";
      totals.set(key, (totals.get(key) ?? 0) + asNumber(item.amount_inc_gst));
    }

    const rows = Array.from(totals.entries()).map(([categoryId, total]) => {
      const category = categories.find((item) => item.id === categoryId);

      return {
        id: categoryId,
        name: category?.name ?? "Uncategorised",
        total,
      };
    });

    return rows.sort((a, b) => b.total - a.total);
  }, [categories, filteredItems]);

  const projectSummary = useMemo(() => {
    const totals = new Map<
      string,
      { claims: number; invoices: number; outstanding: number }
    >();

    for (const submission of filteredSubmissions) {
      if (!submission.project_id) continue;

      const current = totals.get(submission.project_id) ?? {
        claims: 0,
        invoices: 0,
        outstanding: 0,
      };

      const amount = asNumber(submission.total_amount);

      if (submission.submission_type === "expense_claim") {
        current.claims += amount;
      } else {
        current.invoices += amount;
      }

      if (["submitted", "changes_required", "approved"].includes(submission.status)) {
        current.outstanding += amount;
      }

      totals.set(submission.project_id, current);
    }

    return Array.from(totals.entries())
      .map(([projectId, totalsForProject]) => {
        const project = projects.find((item) => item.id === projectId);

        return {
          id: projectId,
          name: project?.name ?? "Unknown project",
          projectNumber: project?.project_number ?? null,
          ...totalsForProject,
          total: totalsForProject.claims + totalsForProject.invoices,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [filteredSubmissions, projects]);

  const outstandingRows = useMemo(
    () =>
      submissions
        .filter((submission) =>
          ["submitted", "changes_required", "approved"].includes(
            submission.status,
          ),
        )
        .sort((a, b) => {
          const aDate = new Date(a.due_date ?? a.submitted_at ?? a.created_at);
          const bDate = new Date(b.due_date ?? b.submitted_at ?? b.created_at);
          return aDate.getTime() - bDate.getTime();
        })
        .slice(0, 8),
    [submissions],
  );


  async function discoverSharePointLibraries() {
    setSharePointDiscovering(true);
    setMessage(null);

    try {
      const response = await apiFetch("/api/expenses/sharepoint/discover");
      const payload = (await response.json()) as SharePointDiscoveryResponse;

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Could not discover SharePoint libraries.",
        );
      }

      const libraries = payload.libraries ?? [];
      setSharePointLibraries(libraries);

      const existingDriveId = financeSettings.sharepoint_drive_id ?? "";
      const existingStillAvailable = libraries.some(
        (library) => library.id === existingDriveId,
      );

      const financeLibrary =
        libraries.find(
          (library) => library.name.trim().toLowerCase() === "finance",
        ) ?? null;

      const nextDriveId = existingStillAvailable
        ? existingDriveId
        : financeLibrary?.id ?? "";

      setSelectedSharePointDriveId(nextDriveId);

      setFinanceSettings((current) => ({
        ...current,
        sharepoint_site_id: payload.site?.id ?? current.sharepoint_site_id,
        sharepoint_site_name:
          payload.site?.name ?? current.sharepoint_site_name,
        sharepoint_site_url:
          payload.site?.webUrl ?? current.sharepoint_site_url,
        sharepoint_drive_id: nextDriveId || current.sharepoint_drive_id,
        sharepoint_drive_name:
          libraries.find((library) => library.id === nextDriveId)?.name ??
          current.sharepoint_drive_name,
      }));

      setMessage({
        tone: "success",
        text:
          financeLibrary && !existingStillAvailable
            ? 'SharePoint connected. The "Finance" library was found automatically.'
            : `SharePoint connected. ${libraries.length} document ${
                libraries.length === 1 ? "library" : "libraries"
              } found.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not discover SharePoint libraries.",
      });
    } finally {
      setSharePointDiscovering(false);
    }
  }

  async function connectSharePointLibrary() {
    if (!selectedSharePointDriveId) {
      setMessage({
        tone: "error",
        text: "Select the Finance SharePoint library.",
      });
      return;
    }

    setSharePointDiscovering(true);
    setMessage(null);

    try {
      const response = await apiFetch("/api/expenses/sharepoint/discover", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          driveId: selectedSharePointDriveId,
          baseFolder:
            financeSettings.sharepoint_base_folder.trim() ||
            "Expenses & Invoices",
        }),
      });

      const payload = (await response.json()) as SharePointDiscoveryResponse;

      if (!response.ok || !payload.settings) {
        throw new Error(
          payload.error ?? "Could not save the SharePoint destination.",
        );
      }

      setFinanceSettings(payload.settings);
      setSelectedSharePointDriveId(
        payload.settings.sharepoint_drive_id ?? "",
      );

      setMessage({
        tone: "success",
        text: `${payload.library?.name ?? "Finance"} connected for Expenses & Invoices.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not save the SharePoint destination.",
      });
    } finally {
      setSharePointDiscovering(false);
    }
  }

  async function saveFinanceSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const siteId = financeSettings.sharepoint_site_id?.trim() || null;
    const driveId = financeSettings.sharepoint_drive_id?.trim() || null;
    const baseFolder = financeSettings.sharepoint_base_folder.trim();

    if (!baseFolder) {
      setMessage({
        tone: "error",
        text: "Enter a SharePoint base folder.",
      });
      return;
    }

    if (
      financeSettings.claim_pending_second_reminder_days <
      financeSettings.claim_pending_reminder_days
    ) {
      setMessage({
        tone: "error",
        text: "The second pending reminder cannot be earlier than the first reminder.",
      });
      return;
    }

    setFinanceSettingsSaving(true);
    setMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const now = new Date().toISOString();
      const sharePointConfigured = Boolean(siteId && driveId);

      const payload = {
        sharepoint_site_id: siteId,
        sharepoint_site_name:
          financeSettings.sharepoint_site_name?.trim() || null,
        sharepoint_site_url:
          financeSettings.sharepoint_site_url?.trim() || null,
        sharepoint_drive_id: driveId,
        sharepoint_drive_name:
          financeSettings.sharepoint_drive_name?.trim() || null,
        sharepoint_base_folder: baseFolder,
        sharepoint_configured_at: sharePointConfigured
          ? financeSettings.sharepoint_configured_at ?? now
          : null,
        sharepoint_configured_by: sharePointConfigured
          ? financeSettings.sharepoint_configured_by ?? user.id
          : null,
        approval_email_enabled: financeSettings.approval_email_enabled,
        approval_in_app_enabled: financeSettings.approval_in_app_enabled,
        approval_push_enabled: financeSettings.approval_push_enabled,
        reminder_email_enabled: financeSettings.reminder_email_enabled,
        reminder_in_app_enabled: financeSettings.reminder_in_app_enabled,
        reminder_push_enabled: financeSettings.reminder_push_enabled,
        claim_pending_reminder_days:
          financeSettings.claim_pending_reminder_days,
        claim_pending_second_reminder_days:
          financeSettings.claim_pending_second_reminder_days,
        approved_unpaid_reminder_days:
          financeSettings.approved_unpaid_reminder_days,
        invoice_due_soon_days: financeSettings.invoice_due_soon_days,
        invoice_overdue_reminder_days:
          financeSettings.invoice_overdue_reminder_days,
        reminders_enabled: financeSettings.reminders_enabled,
        updated_by: user.id,
      };

      const result = await supabase
        .from("financial_settings")
        .update(payload)
        .eq("id", true)
        .select(
          "id, sharepoint_site_id, sharepoint_site_name, sharepoint_site_url, sharepoint_drive_id, sharepoint_drive_name, sharepoint_base_folder, sharepoint_configured_at, sharepoint_configured_by, approval_email_enabled, approval_in_app_enabled, approval_push_enabled, reminder_email_enabled, reminder_in_app_enabled, reminder_push_enabled, claim_pending_reminder_days, claim_pending_second_reminder_days, approved_unpaid_reminder_days, invoice_due_soon_days, invoice_overdue_reminder_days, reminders_enabled, created_at, updated_at, updated_by",
        )
        .single();

      if (result.error) throw result.error;

      setFinanceSettings(result.data as FinancialSettings);

      setMessage({
        tone: "success",
        text: "Finance settings saved.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to save finance settings.",
      });
    } finally {
      setFinanceSettingsSaving(false);
    }
  }

  function openNewCategory() {
    setEditingCategory(null);
    setCategoryDraft(EMPTY_CATEGORY);
    setCategoryOpen(true);
  }

  function openEditCategory(category: FinancialCategory) {
    setEditingCategory(category);
    setCategoryDraft({
      name: category.name,
      description: category.description ?? "",
    });
    setCategoryOpen(true);
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = categoryDraft.name.trim();

    if (!name) {
      setMessage({ tone: "error", text: "Enter a category name." });
      return;
    }

    setCategorySaving(true);
    setMessage(null);

    try {
      if (editingCategory) {
        const result = await supabase
          .from("financial_categories")
          .update({
            name,
            description: categoryDraft.description.trim() || null,
          })
          .eq("id", editingCategory.id);

        if (result.error) throw result.error;
      } else {
        const nextSort =
          categories.reduce(
            (highest, category) => Math.max(highest, category.sort_order),
            -1,
          ) + 1;

        const {
          data: { user },
        } = await supabase.auth.getUser();

        const result = await supabase.from("financial_categories").insert({
          name,
          description: categoryDraft.description.trim() || null,
          sort_order: nextSort,
          created_by: user?.id ?? null,
        });

        if (result.error) throw result.error;
      }

      await loadDashboard();
      setCategoryOpen(false);
      setEditingCategory(null);
      setCategoryDraft(EMPTY_CATEGORY);
      setMessage({
        tone: "success",
        text: editingCategory
          ? "Category updated."
          : "Category created.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to save category.",
      });
    } finally {
      setCategorySaving(false);
    }
  }

  async function toggleCategory(category: FinancialCategory) {
    setMessage(null);

    try {
      const result = await supabase
        .from("financial_categories")
        .update({ active: !category.active })
        .eq("id", category.id);

      if (result.error) throw result.error;

      await loadDashboard();

      setMessage({
        tone: "success",
        text: `${category.name} ${
          category.active ? "deactivated" : "activated"
        }.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to update category.",
      });
    }
  }

  async function deleteCategory(category: FinancialCategory) {
    if (
      !window.confirm(
        `Delete "${category.name}"? Existing items will become uncategorised.`,
      )
    ) {
      return;
    }

    setMessage(null);

    try {
      const result = await supabase
        .from("financial_categories")
        .delete()
        .eq("id", category.id);

      if (result.error) throw result.error;

      await loadDashboard();

      setMessage({
        tone: "success",
        text: `${category.name} deleted.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to delete category.",
      });
    }
  }

  function openNewRule() {
    setEditingRule(null);
    setRuleDraft(EMPTY_RULE);
    setRuleOpen(true);
  }

  function openEditRule(rule: FinancialAccessRule) {
    setEditingRule(rule);
    setRuleDraft({
      appliesTo: rule.applies_to,
      principalType: rule.principal_type,
      role: normaliseRole(rule.role),
      userId: rule.user_id ?? "",
      receivesEmail: rule.receives_email,
      receivesInApp: rule.receives_in_app,
      canReviewEdit: rule.can_review_edit,
      canApprove: rule.can_approve,
      canMarkPaid: rule.can_mark_paid,
    });
    setRuleOpen(true);
  }

  async function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (ruleDraft.principalType === "user" && !ruleDraft.userId) {
      setMessage({ tone: "error", text: "Select a TTTracker user." });
      return;
    }

    if (
      !ruleDraft.receivesEmail &&
      !ruleDraft.receivesInApp &&
      !ruleDraft.canReviewEdit &&
      !ruleDraft.canApprove &&
      !ruleDraft.canMarkPaid
    ) {
      setMessage({
        tone: "error",
        text: "Enable at least one notification or permission.",
      });
      return;
    }

    setRuleSaving(true);
    setMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        applies_to: ruleDraft.appliesTo,
        principal_type: ruleDraft.principalType,
        role:
          ruleDraft.principalType === "role" ? ruleDraft.role : null,
        user_id:
          ruleDraft.principalType === "user" ? ruleDraft.userId : null,
        receives_email: ruleDraft.receivesEmail,
        receives_in_app: ruleDraft.receivesInApp,
        can_review_edit: ruleDraft.canReviewEdit,
        can_approve: ruleDraft.canApprove,
        can_mark_paid: ruleDraft.canMarkPaid,
        active: true,
        created_by: user?.id ?? null,
      };

      if (editingRule) {
        const result = await supabase
          .from("financial_access_rules")
          .update(payload)
          .eq("id", editingRule.id);

        if (result.error) throw result.error;
      } else {
        const result = await supabase
          .from("financial_access_rules")
          .insert(payload);

        if (result.error) throw result.error;
      }

      await loadSettings();
      setRuleOpen(false);
      setEditingRule(null);
      setRuleDraft(EMPTY_RULE);

      setMessage({
        tone: "success",
        text: editingRule
          ? "Reviewer settings updated."
          : "Reviewer added.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to save reviewer settings.",
      });
    } finally {
      setRuleSaving(false);
    }
  }

  async function deleteRule(rule: FinancialAccessRule) {
    const label =
      rule.principal_type === "role"
        ? roleLabel(rule.role)
        : reviewerUsers.find((user) => user.id === rule.user_id)?.name ??
          "this user";

    if (!window.confirm(`Remove financial access for ${label}?`)) return;

    setMessage(null);

    try {
      const result = await supabase
        .from("financial_access_rules")
        .delete()
        .eq("id", rule.id);

      if (result.error) throw result.error;

      await loadSettings();

      setMessage({
        tone: "success",
        text: `Financial access removed for ${label}.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to remove reviewer.",
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
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-slate-400">
                <WalletCards size={18} />
                <p className="text-sm font-semibold uppercase tracking-wider">
                  Finance
                </p>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Expenses & Invoices
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Company-wide expense and invoice tracking, approvals and spend
                reporting.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/expenses/claims"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <ReceiptText size={16} />
                Expense Claims
              </Link>

              <Link
                href="/expenses/invoices"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <FileText size={16} />
                Invoices
              </Link>

              <button
                type="button"
                onClick={() => void refreshAll()}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <RefreshCw
                  size={16}
                  className={refreshing ? "animate-spin" : ""}
                />
                Refresh
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setTab("dashboard")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
                tab === "dashboard"
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <BarChart3 size={16} />
              Dashboard
            </button>

            {isAdmin ? (
              <button
                type="button"
                onClick={() => setTab("settings")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
                  tab === "settings"
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Settings size={16} />
                Settings
              </button>
            ) : null}
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
                <Check size={17} />
              ) : (
                <X size={17} />
              )}
              {message.text}
            </div>
          </section>
        ) : null}

        {tab === "dashboard" ? (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">
                    Company Spend
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Dashboard figures below use the selected reporting period.
                  </p>
                </div>

                <div className="w-full md:w-56">
                  <SelectField
                    value={datePreset}
                    onChange={(value) => setDatePreset(value as DatePreset)}
                    options={[
                      { value: "this_month", label: "This Month" },
                      { value: "last_month", label: "Last Month" },
                      { value: "last_3_months", label: "Last 3 Months" },
                      { value: "financial_year", label: "This Financial Year" },
                      { value: "all", label: "All Time" },
                    ]}
                  />
                </div>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                label="Outstanding Claims"
                value={String(pendingExpenseClaims.length)}
                detail={currency(
                  pendingExpenseClaims.reduce(
                    (sum, item) => sum + asNumber(item.total_amount),
                    0,
                  ),
                )}
                icon={<ReceiptText size={20} />}
              />

              <MetricCard
                label="Outstanding Invoices"
                value={String(pendingInvoices.length)}
                detail={currency(
                  pendingInvoices.reduce(
                    (sum, item) => sum + asNumber(item.total_amount),
                    0,
                  ),
                )}
                icon={<FileText size={20} />}
              />

              <MetricCard
                label="Approved"
                value={currency(approvedThisPeriod)}
                detail="Approved, not yet paid"
                icon={<ShieldCheck size={20} />}
              />

              <MetricCard
                label="Awaiting Payment"
                value={currency(awaitingPayment)}
                detail="Approved submissions"
                icon={<CalendarDays size={20} />}
              />

              <MetricCard
                label="Recorded Spend"
                value={currency(totalSpend)}
                detail="Approved + paid"
                icon={<CircleDollarSign size={20} />}
              />
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <DashboardCard
                title="Category Summary"
                description="Spend recorded against configured categories."
              >
                {categorySummary.length === 0 ? (
                  <EmptyState
                    title="No category spend yet"
                    description="Category totals will appear as expense and invoice items are recorded."
                  />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {categorySummary.slice(0, 10).map((row) => (
                      <div
                        key={row.id}
                        className="flex items-center justify-between gap-4 py-3"
                      >
                        <span className="text-sm font-semibold text-slate-700">
                          {row.name}
                        </span>
                        <span className="text-sm font-bold text-slate-950">
                          {currency(row.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </DashboardCard>

              <DashboardCard
                title="Project Expense Summary"
                description="Company spend allocated to TTTracker projects."
              >
                {projectSummary.length === 0 ? (
                  <EmptyState
                    title="No project allocations yet"
                    description="Project totals will appear when claims or invoices are allocated to a project."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          <th className="pb-3 pr-4">Project</th>
                          <th className="pb-3 pr-4 text-right">Claims</th>
                          <th className="pb-3 pr-4 text-right">Invoices</th>
                          <th className="pb-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {projectSummary.slice(0, 10).map((row) => (
                          <tr key={row.id}>
                            <td className="py-3 pr-4">
                              <div className="text-sm font-semibold text-slate-800">
                                {row.name}
                              </div>
                              {row.projectNumber ? (
                                <div className="mt-0.5 text-xs text-slate-400">
                                  {row.projectNumber}
                                </div>
                              ) : null}
                            </td>
                            <td className="py-3 pr-4 text-right text-sm text-slate-600">
                              {currency(row.claims)}
                            </td>
                            <td className="py-3 pr-4 text-right text-sm text-slate-600">
                              {currency(row.invoices)}
                            </td>
                            <td className="py-3 text-right text-sm font-bold text-slate-950">
                              {currency(row.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </DashboardCard>
            </section>

            <DashboardCard
              title="Outstanding"
              description="Claims, invoices and approved items still requiring action."
            >
              {outstandingRows.length === 0 ? (
                <EmptyState
                  title="Nothing outstanding"
                  description="There are no submissions currently waiting for approval, changes or payment."
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {outstandingRows.map((submission) => (
                    <Link
                      key={submission.id}
                      href={
                        submission.submission_type === "invoice"
                          ? `/expenses/invoices?open=${submission.id}`
                          : `/expenses/claims?open=${submission.id}`
                      }
                      className="grid gap-3 py-4 transition hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_170px_150px_130px] sm:items-center sm:px-2"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-950">
                            {submission.submission_number}
                          </span>
                          <span className="text-xs font-medium text-slate-400">
                            {submission.submission_type === "invoice"
                              ? "Invoice"
                              : "Expense Claim"}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm text-slate-500">
                          {submission.supplier_name ||
                            submission.description ||
                            "No description"}
                        </p>
                      </div>

                      <div className="text-sm text-slate-600">
                        {submission.due_date
                          ? `Due ${shortDate(submission.due_date)}`
                          : submission.submitted_at
                            ? `Submitted ${shortDate(submission.submitted_at)}`
                            : shortDate(submission.created_at)}
                      </div>

                      <div>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(
                            submission.status,
                          )}`}
                        >
                          {statusLabel(submission.status)}
                        </span>
                      </div>

                      <div className="text-left text-sm font-bold text-slate-950 sm:text-right">
                        {currency(asNumber(submission.total_amount))}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </DashboardCard>
          </>
        ) : isAdmin ? (
          <>
            {settingsLoading ? (
              <div className="flex min-h-72 items-center justify-center rounded-3xl border border-slate-200 bg-white">
                <Loader2 size={28} className="animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                <form
                  onSubmit={saveFinanceSettings}
                  className="rounded-3xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <HardDrive size={18} className="text-slate-400" />
                        <h2 className="text-xl font-bold text-slate-950">
                          Finance Storage & Notifications
                        </h2>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        Company-wide storage and reminder settings used by the
                        website and mobile app.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={financeSettingsSaving}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {financeSettingsSaving ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Save size={16} />
                      )}
                      Save Settings
                    </button>
                  </div>

                  <div className="space-y-8 px-6 py-6">
                    <div>
                      <div className="flex items-center gap-2">
                        <FolderOpen size={17} className="text-slate-400" />
                        <h3 className="text-base font-bold text-slate-950">
                          SharePoint Storage
                        </h3>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        Receipts, invoices and approved finance documents will
                        be stored in this SharePoint library. These values are
                        saved in TTTracker configuration, not hard-coded into
                        the app.
                      </p>

                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                                  financeSettings.sharepoint_site_id &&
                                  financeSettings.sharepoint_drive_id
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {financeSettings.sharepoint_site_id &&
                                financeSettings.sharepoint_drive_id
                                  ? "Connected"
                                  : "Not Connected"}
                              </span>

                              {financeSettings.sharepoint_site_name ? (
                                <span className="text-sm font-semibold text-slate-700">
                                  {financeSettings.sharepoint_site_name}
                                </span>
                              ) : null}

                              {financeSettings.sharepoint_drive_name ? (
                                <span className="text-sm text-slate-500">
                                  → {financeSettings.sharepoint_drive_name}
                                </span>
                              ) : null}
                            </div>

                            <p className="mt-2 text-sm leading-6 text-slate-500">
                              TTTracker finds the SharePoint site and document
                              libraries automatically using the existing
                              Microsoft Graph connection. You do not need to
                              enter Site IDs or Drive IDs manually.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => void discoverSharePointLibraries()}
                            disabled={sharePointDiscovering}
                            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                          >
                            {sharePointDiscovering ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <RefreshCw size={16} />
                            )}
                            {financeSettings.sharepoint_drive_id
                              ? "Change Library"
                              : "Connect SharePoint"}
                          </button>
                        </div>

                        {sharePointLibraries.length > 0 ? (
                          <div className="mt-5 grid gap-4 border-t border-slate-200 pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                            <Field label="SharePoint Library">
                              <SelectField
                                value={selectedSharePointDriveId}
                                onChange={(value) => {
                                  setSelectedSharePointDriveId(value);

                                  const selected =
                                    sharePointLibraries.find(
                                      (library) => library.id === value,
                                    ) ?? null;

                                  setFinanceSettings((current) => ({
                                    ...current,
                                    sharepoint_drive_id: value || null,
                                    sharepoint_drive_name:
                                      selected?.name ?? null,
                                  }));
                                }}
                                options={[
                                  {
                                    value: "",
                                    label: "Select document library...",
                                  },
                                  ...sharePointLibraries.map((library) => ({
                                    value: library.id,
                                    label: library.name,
                                  })),
                                ]}
                              />
                            </Field>

                            <Field label="Base Folder">
                              <input
                                value={financeSettings.sharepoint_base_folder}
                                onChange={(event) =>
                                  setFinanceSettings((current) => ({
                                    ...current,
                                    sharepoint_base_folder:
                                      event.target.value,
                                  }))
                                }
                                placeholder="Expenses & Invoices"
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                              />
                            </Field>

                            <button
                              type="button"
                              onClick={() => void connectSharePointLibrary()}
                              disabled={
                                sharePointDiscovering ||
                                !selectedSharePointDriveId
                              }
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                            >
                              {sharePointDiscovering ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Check size={16} />
                              )}
                              Use Library
                            </button>
                          </div>
                        ) : null}

                        {financeSettings.sharepoint_configured_at ? (
                          <div className="mt-3 text-xs text-slate-400">
                            Connected{" "}
                            {shortDate(
                              financeSettings.sharepoint_configured_at,
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-8">
                      <div className="flex items-center gap-2">
                        <Bell size={17} className="text-slate-400" />
                        <h3 className="text-base font-bold text-slate-950">
                          Approval Notifications
                        </h3>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        These are company-wide delivery channels. Individual
                        reviewer rules still determine who receives them.
                      </p>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <CheckField
                          label="Email"
                          checked={financeSettings.approval_email_enabled}
                          onChange={(checked) =>
                            setFinanceSettings((current) => ({
                              ...current,
                              approval_email_enabled: checked,
                            }))
                          }
                        />
                        <CheckField
                          label="In-App"
                          checked={financeSettings.approval_in_app_enabled}
                          onChange={(checked) =>
                            setFinanceSettings((current) => ({
                              ...current,
                              approval_in_app_enabled: checked,
                            }))
                          }
                        />
                        <CheckField
                          label="Phone Push"
                          checked={financeSettings.approval_push_enabled}
                          onChange={(checked) =>
                            setFinanceSettings((current) => ({
                              ...current,
                              approval_push_enabled: checked,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-8">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <CalendarDays
                              size={17}
                              className="text-slate-400"
                            />
                            <h3 className="text-base font-bold text-slate-950">
                              Reminders
                            </h3>
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            Reminder timing is shared by Expense Claims and
                            Invoices and can be changed here without a code
                            update.
                          </p>
                        </div>

                        <CheckField
                          label="Enable Reminders"
                          checked={financeSettings.reminders_enabled}
                          onChange={(checked) =>
                            setFinanceSettings((current) => ({
                              ...current,
                              reminders_enabled: checked,
                            }))
                          }
                        />
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <CheckField
                          label="Reminder Email"
                          checked={financeSettings.reminder_email_enabled}
                          onChange={(checked) =>
                            setFinanceSettings((current) => ({
                              ...current,
                              reminder_email_enabled: checked,
                            }))
                          }
                        />
                        <CheckField
                          label="Reminder In-App"
                          checked={financeSettings.reminder_in_app_enabled}
                          onChange={(checked) =>
                            setFinanceSettings((current) => ({
                              ...current,
                              reminder_in_app_enabled: checked,
                            }))
                          }
                        />
                        <CheckField
                          label="Reminder Push"
                          checked={financeSettings.reminder_push_enabled}
                          onChange={(checked) =>
                            setFinanceSettings((current) => ({
                              ...current,
                              reminder_push_enabled: checked,
                            }))
                          }
                        />
                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        <NumberField
                          label="First Approval Reminder"
                          value={financeSettings.claim_pending_reminder_days}
                          suffix="days"
                          min={1}
                          max={30}
                          onChange={(value) =>
                            setFinanceSettings((current) => ({
                              ...current,
                              claim_pending_reminder_days: value,
                            }))
                          }
                        />

                        <NumberField
                          label="Second Approval Reminder"
                          value={
                            financeSettings.claim_pending_second_reminder_days
                          }
                          suffix="days"
                          min={1}
                          max={60}
                          onChange={(value) =>
                            setFinanceSettings((current) => ({
                              ...current,
                              claim_pending_second_reminder_days: value,
                            }))
                          }
                        />

                        <NumberField
                          label="Approved, Not Paid"
                          value={
                            financeSettings.approved_unpaid_reminder_days
                          }
                          suffix="days"
                          min={1}
                          max={60}
                          onChange={(value) =>
                            setFinanceSettings((current) => ({
                              ...current,
                              approved_unpaid_reminder_days: value,
                            }))
                          }
                        />

                        <NumberField
                          label="Invoice Due Soon"
                          value={financeSettings.invoice_due_soon_days}
                          suffix="days before"
                          min={0}
                          max={60}
                          onChange={(value) =>
                            setFinanceSettings((current) => ({
                              ...current,
                              invoice_due_soon_days: value,
                            }))
                          }
                        />

                        <NumberField
                          label="Overdue Reminder"
                          value={
                            financeSettings.invoice_overdue_reminder_days
                          }
                          suffix="days"
                          min={1}
                          max={30}
                          onChange={(value) =>
                            setFinanceSettings((current) => ({
                              ...current,
                              invoice_overdue_reminder_days: value,
                            }))
                          }
                        />
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <Mail size={17} className="text-slate-400" />
                          <div className="mt-2 text-sm font-bold text-slate-900">
                            Email
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            Approval and reminder emails use configured finance
                            recipients and the TTTracker review link.
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <Bell size={17} className="text-slate-400" />
                          <div className="mt-2 text-sm font-bold text-slate-900">
                            In-App
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            Finance events will use the existing TTTracker
                            notification centre.
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <Smartphone size={17} className="text-slate-400" />
                          <div className="mt-2 text-sm font-bold text-slate-900">
                            Phone Push
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            Mobile users can be deep-linked directly to the
                            relevant claim or invoice.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </form>

                <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-slate-950">
                        Categories
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Categories are configured here and used by both Expense
                        Claims and Invoices.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={openNewCategory}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      <Plus size={16} />
                      Add Category
                    </button>
                  </div>

                  {categories.length === 0 ? (
                    <div className="p-8">
                      <EmptyState
                        title="No categories configured"
                        description="Create the categories your team should use when entering expenses and invoices."
                      />
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {categories.map((category) => (
                        <div
                          key={category.id}
                          className="grid gap-4 px-6 py-4 sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:items-center"
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-bold text-slate-950">
                                {category.name}
                              </h3>
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  category.active
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {category.active ? "Active" : "Inactive"}
                              </span>
                            </div>
                            {category.description ? (
                              <p className="mt-1 text-sm text-slate-500">
                                {category.description}
                              </p>
                            ) : null}
                          </div>

                          <div className="text-sm text-slate-500">
                            Order {category.sort_order + 1}
                          </div>

                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <button
                              type="button"
                              onClick={() => void toggleCategory(category)}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              {category.active ? "Deactivate" : "Activate"}
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditCategory(category)}
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil size={14} />
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => void deleteCategory(category)}
                              className="rounded-xl border border-rose-200 bg-white p-2 text-rose-700 hover:bg-rose-50"
                              aria-label={`Delete ${category.name}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-slate-950">
                        Reviewers & Approvals
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Control who receives notifications and who can review,
                        approve or mark financial submissions as paid.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={openNewRule}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      <Plus size={16} />
                      Add Reviewer
                    </button>
                  </div>

                  {accessRules.length === 0 ? (
                    <div className="p-8">
                      <EmptyState
                        title="No reviewers configured"
                        description="Administrators still retain full access. Add roles or individual users for finance review and approval."
                      />
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {accessRules.map((rule) => {
                        const user =
                          rule.principal_type === "user"
                            ? reviewerUsers.find(
                                (item) => item.id === rule.user_id,
                              )
                            : null;

                        const name =
                          rule.principal_type === "role"
                            ? roleLabel(rule.role)
                            : user?.name || user?.email || "TTTracker user";

                        return (
                          <div
                            key={rule.id}
                            className="grid gap-4 px-6 py-5 xl:grid-cols-[minmax(0,1.15fr)_160px_minmax(0,1.2fr)_auto] xl:items-center"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                {rule.principal_type === "role" ? (
                                  <Users size={16} className="text-slate-400" />
                                ) : (
                                  <ShieldCheck
                                    size={16}
                                    className="text-slate-400"
                                  />
                                )}
                                <h3 className="font-bold text-slate-950">
                                  {name}
                                </h3>
                              </div>
                              {user?.email ? (
                                <p className="mt-1 text-sm text-slate-500">
                                  {user.email}
                                </p>
                              ) : null}
                            </div>

                            <div className="text-sm font-semibold text-slate-600">
                              {rule.applies_to === "all"
                                ? "Claims & Invoices"
                                : rule.applies_to === "expense_claim"
                                  ? "Expense Claims"
                                  : "Invoices"}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {rule.can_review_edit ? (
                                <PermissionPill label="Review / Edit" />
                              ) : null}
                              {rule.can_approve ? (
                                <PermissionPill label="Approve" />
                              ) : null}
                              {rule.can_mark_paid ? (
                                <PermissionPill label="Mark Paid" />
                              ) : null}
                              {rule.receives_email ? (
                                <PermissionPill
                                  label="Email"
                                  icon={<Bell size={12} />}
                                />
                              ) : null}
                              {rule.receives_in_app ? (
                                <PermissionPill label="In-App" />
                              ) : null}
                            </div>

                            <div className="flex gap-2 xl:justify-end">
                              <button
                                type="button"
                                onClick={() => openEditRule(rule)}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                <Pencil size={14} />
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => void deleteRule(rule)}
                                className="rounded-xl border border-rose-200 bg-white p-2 text-rose-700 hover:bg-rose-50"
                                aria-label={`Remove ${name}`}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        ) : null}
      </div>

      {categoryOpen ? (
        <ModalShell
          title={editingCategory ? "Edit Category" : "Add Category"}
          description="This category will be available in both Expense Claims and Invoices."
          onClose={() => setCategoryOpen(false)}
        >
          <form onSubmit={saveCategory} className="space-y-5">
            <Field label="Category name">
              <input
                value={categoryDraft.name}
                onChange={(event) =>
                  setCategoryDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="e.g. Fuel, Accommodation, Vehicle Repairs"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </Field>

            <Field label="Description">
              <textarea
                value={categoryDraft.description}
                onChange={(event) =>
                  setCategoryDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Optional guidance for staff."
                className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </Field>

            <ModalActions
              onCancel={() => setCategoryOpen(false)}
              saving={categorySaving}
              saveLabel={editingCategory ? "Save Category" : "Add Category"}
            />
          </form>
        </ModalShell>
      ) : null}

      {ruleOpen ? (
        <ModalShell
          title={editingRule ? "Edit Reviewer" : "Add Reviewer"}
          description="Configure finance notifications and approval permissions."
          onClose={() => setRuleOpen(false)}
        >
          <form onSubmit={saveRule} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Applies to">
                <SelectField
                  value={ruleDraft.appliesTo}
                  onChange={(value) =>
                    setRuleDraft((current) => ({
                      ...current,
                      appliesTo: value as RuleDraft["appliesTo"],
                    }))
                  }
                  options={[
                    { value: "all", label: "Claims & Invoices" },
                    { value: "expense_claim", label: "Expense Claims" },
                    { value: "invoice", label: "Invoices" },
                  ]}
                />
              </Field>

              <Field label="Assign access to">
                <SelectField
                  value={ruleDraft.principalType}
                  onChange={(value) =>
                    setRuleDraft((current) => ({
                      ...current,
                      principalType: value as "role" | "user",
                    }))
                  }
                  options={[
                    { value: "role", label: "Website Role" },
                    { value: "user", label: "Specific User" },
                  ]}
                />
              </Field>
            </div>

            {ruleDraft.principalType === "role" ? (
              <Field label="Website role">
                <SelectField
                  value={ruleDraft.role}
                  onChange={(value) =>
                    setRuleDraft((current) => ({
                      ...current,
                      role: value as WebsiteRole,
                    }))
                  }
                  options={WEBSITE_ROLES}
                />
              </Field>
            ) : (
              <Field label="TTTracker user">
                <SelectField
                  value={ruleDraft.userId}
                  onChange={(value) =>
                    setRuleDraft((current) => ({
                      ...current,
                      userId: value,
                    }))
                  }
                  options={[
                    { value: "", label: "Select user..." },
                    ...reviewerUsers.map((user) => ({
                      value: user.id,
                      label: `${user.name}${
                        user.email && user.email !== user.name
                          ? ` — ${user.email}`
                          : ""
                      }`,
                    })),
                  ]}
                />
              </Field>
            )}

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">
                Permissions
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <CheckField
                  label="Review / Edit"
                  checked={ruleDraft.canReviewEdit}
                  onChange={(checked) =>
                    setRuleDraft((current) => ({
                      ...current,
                      canReviewEdit: checked,
                    }))
                  }
                />
                <CheckField
                  label="Approve"
                  checked={ruleDraft.canApprove}
                  onChange={(checked) =>
                    setRuleDraft((current) => ({
                      ...current,
                      canApprove: checked,
                    }))
                  }
                />
                <CheckField
                  label="Mark Paid"
                  checked={ruleDraft.canMarkPaid}
                  onChange={(checked) =>
                    setRuleDraft((current) => ({
                      ...current,
                      canMarkPaid: checked,
                    }))
                  }
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">
                Notifications
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <CheckField
                  label="Email notifications"
                  checked={ruleDraft.receivesEmail}
                  onChange={(checked) =>
                    setRuleDraft((current) => ({
                      ...current,
                      receivesEmail: checked,
                    }))
                  }
                />
                <CheckField
                  label="In-app notifications"
                  checked={ruleDraft.receivesInApp}
                  onChange={(checked) =>
                    setRuleDraft((current) => ({
                      ...current,
                      receivesInApp: checked,
                    }))
                  }
                />
              </div>
            </div>

            <ModalActions
              onCancel={() => setRuleOpen(false)}
              saving={ruleSaving}
              saveLabel={editingRule ? "Save Reviewer" : "Add Reviewer"}
            />
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

function DashboardCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="px-6 py-4">{children}</div>
    </section>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="py-8 text-center">
      <div className="text-sm font-bold text-slate-800">{title}</div>
      <div className="mx-auto mt-1 max-w-lg text-sm leading-6 text-slate-500">
        {description}
      </div>
    </div>
  );
}

function PermissionPill({
  label,
  icon,
}: {
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
      {icon}
      {label}
    </span>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300"
      />
      <span className="text-sm font-semibold text-slate-700">{label}</span>
    </label>
  );
}


function NumberField({
  label,
  value,
  suffix,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <div className="relative">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            onChange(Number.isFinite(next) ? next : min);
          }}
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-20 text-sm outline-none ring-slate-200 focus:ring-2"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
          {suffix}
        </span>
      </div>
    </Field>
  );
}

function ModalShell({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
      <div className="my-auto w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
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

function ModalActions({
  onCancel,
  saving,
  saveLabel,
}: {
  onCancel: () => void;
  saving: boolean;
  saveLabel: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        Cancel
      </button>

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {saving ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Save size={16} />
        )}
        {saveLabel}
      </button>
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

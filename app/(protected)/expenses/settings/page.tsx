"use client";

import {
  ArrowLeft,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  HardDrive,
  Loader2,
  Mail,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type FinancialSubmissionType = "expense_claim" | "invoice";

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
  principal_type: "user" | "role";
  role: string | null;
  user_id: string | null;
  receives_email: boolean;
  receives_in_app: boolean;
  receives_push: boolean;
  can_review_edit: boolean;
  can_approve: boolean;
  can_mark_paid: boolean;
  active: boolean;
};

type FinancialSettings = {
  id: boolean;
  accounts_email: string | null;
  accounts_notification_enabled: boolean;
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
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

type SharePointLibrary = {
  id: string;
  name: string;
  webUrl: string | null;
};

type SharePointResponse = {
  site?: { id: string; name: string; webUrl: string | null };
  libraries?: SharePointLibrary[];
  library?: SharePointLibrary;
  settings?: FinancialSettings;
  error?: string;
};

type AdminApiUser = {
  user_id?: string;
  id?: string;
  email?: string | null;
  website_role?: string | null;
  role?: string | null;
  employee?: { full_name?: string | null } | null;
  employee_name?: string | null;
};

type AdminUsersResponse = {
  users?: AdminApiUser[];
  error?: string;
};

type FinanceUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

type ReviewerDraft = {
  appliesTo: "all" | FinancialSubmissionType;
  userId: string;
  receivesEmail: boolean;
  receivesInApp: boolean;
  receivesPush: boolean;
  canReviewEdit: boolean;
  canApprove: boolean;
  canMarkPaid: boolean;
};

type CategoryDraft = {
  name: string;
  description: string;
};

const DEFAULT_SETTINGS: FinancialSettings = {
  id: true,
  accounts_email: null,
  accounts_notification_enabled: true,
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
  created_at: "",
  updated_at: "",
  updated_by: null,
};

const EMPTY_REVIEWER: ReviewerDraft = {
  appliesTo: "all",
  userId: "",
  receivesEmail: true,
  receivesInApp: true,
  receivesPush: true,
  canReviewEdit: true,
  canApprove: true,
  canMarkPaid: false,
};

const EMPTY_CATEGORY: CategoryDraft = {
  name: "",
  description: "",
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function roleLabel(value?: string | null) {
  const role = clean(value).toLowerCase().replaceAll(" ", "_");

  switch (role) {
    case "admin":
      return "Administrator";
    case "finance":
      return "Finance";
    case "commercial":
      return "Commercial";
    case "asset_manager":
      return "Asset Manager";
    case "hseq":
      return "HSEQ";
    case "editor":
      return "Editor";
    case "crew":
      return "Crew / Field";
    case "viewer":
      return "Viewer";
    default:
      return role || "User";
  }
}

function scopeLabel(value: FinancialAccessRule["applies_to"]) {
  if (value === "expense_claim") return "Expense Claims";
  if (value === "invoice") return "Invoices";
  return "Expenses & Invoices";
}

export default function FinanceSettingsPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [settings, setSettings] = useState<FinancialSettings>(DEFAULT_SETTINGS);
  const [reviewers, setReviewers] = useState<FinancialAccessRule[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [users, setUsers] = useState<FinanceUser[]>([]);

  const [savingSettings, setSavingSettings] = useState(false);
  const [sharePointLibraries, setSharePointLibraries] = useState<SharePointLibrary[]>([]);
  const [selectedDriveId, setSelectedDriveId] = useState("");
  const [sharePointWorking, setSharePointWorking] = useState(false);

  const [reviewerOpen, setReviewerOpen] = useState(false);
  const [editingReviewer, setEditingReviewer] = useState<FinancialAccessRule | null>(null);
  const [reviewerDraft, setReviewerDraft] = useState<ReviewerDraft>(EMPTY_REVIEWER);
  const [reviewerSaving, setReviewerSaving] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<FinancialCategory | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(EMPTY_CATEGORY);
  const [categorySaving, setCategorySaving] = useState(false);

  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

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

      return fetch(input, { ...init, headers, cache: "no-store" });
    },
    [supabase],
  );

  const loadSettings = useCallback(async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
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

    const admin = clean(roleResult.data?.role).toLowerCase() === "admin";
    setIsAdmin(admin);
    if (!admin) return;

    const [settingsResult, reviewerResult, categoryResult, usersResponse] = await Promise.all([
      supabase
        .from("financial_settings")
        .select(
          "id,accounts_email,accounts_notification_enabled,sharepoint_site_id,sharepoint_site_name,sharepoint_site_url,sharepoint_drive_id,sharepoint_drive_name,sharepoint_base_folder,sharepoint_configured_at,sharepoint_configured_by,approval_email_enabled,approval_in_app_enabled,approval_push_enabled,created_at,updated_at,updated_by",
        )
        .eq("id", true)
        .maybeSingle(),
      supabase
        .from("financial_access_rules")
        .select(
          "id,applies_to,principal_type,role,user_id,receives_email,receives_in_app,receives_push,can_review_edit,can_approve,can_mark_paid,active",
        )
        .eq("principal_type", "user")
        .eq("active", true)
        .order("applies_to"),
      supabase
        .from("financial_categories")
        .select("id,name,description,active,sort_order,created_at,updated_at")
        .order("sort_order")
        .order("name"),
      apiFetch("/api/admin/users"),
    ]);

    if (settingsResult.error) throw settingsResult.error;
    if (reviewerResult.error) throw reviewerResult.error;
    if (categoryResult.error) throw categoryResult.error;

    const usersPayload = (await usersResponse.json()) as AdminUsersResponse;
    if (!usersResponse.ok) {
      throw new Error(usersPayload.error ?? "Failed to load TTTracker users.");
    }

    setSettings(
      settingsResult.data
        ? (settingsResult.data as FinancialSettings)
        : DEFAULT_SETTINGS,
    );
    setSelectedDriveId(settingsResult.data?.sharepoint_drive_id ?? "");
    setReviewers((reviewerResult.data ?? []) as FinancialAccessRule[]);
    setCategories((categoryResult.data ?? []) as FinancialCategory[]);

    setUsers(
      (usersPayload.users ?? [])
        .map((raw): FinanceUser | null => {
          const id = clean(raw.user_id ?? raw.id);
          if (!id) return null;

          const email = clean(raw.email);
          const name =
            clean(raw.employee?.full_name ?? raw.employee_name ?? email) ||
            "TTTracker user";

          return {
            id,
            email,
            name,
            role: clean(raw.website_role ?? raw.role).toLowerCase(),
          };
        })
        .filter((item): item is FinanceUser => Boolean(item))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }, [apiFetch, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await loadSettings();
        } catch (error) {
          setMessage({
            tone: "error",
            text:
              error instanceof Error
                ? error.message
                : "Failed to load Finance settings.",
          });
        } finally {
          setLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadSettings]);

  async function refreshAll() {
    setRefreshing(true);
    setMessage(null);

    try {
      await loadSettings();
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to refresh Finance settings.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function saveMainSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const accountsEmail = clean(settings.accounts_email);
    const baseFolder = clean(settings.sharepoint_base_folder);

    if (!baseFolder) {
      setMessage({ tone: "error", text: "Enter the SharePoint base folder." });
      return;
    }

    if (accountsEmail && !/^\S+@\S+\.\S+$/.test(accountsEmail)) {
      setMessage({ tone: "error", text: "Enter a valid Accounts email address." });
      return;
    }

    setSavingSettings(true);
    setMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Your session has expired.");

      const now = new Date().toISOString();
      const configured = Boolean(settings.sharepoint_site_id && settings.sharepoint_drive_id);

      const payload = {
        id: true,
        accounts_email: accountsEmail || null,
        accounts_notification_enabled: settings.accounts_notification_enabled,
        sharepoint_site_id: clean(settings.sharepoint_site_id) || null,
        sharepoint_site_name: clean(settings.sharepoint_site_name) || null,
        sharepoint_site_url: clean(settings.sharepoint_site_url) || null,
        sharepoint_drive_id: clean(settings.sharepoint_drive_id) || null,
        sharepoint_drive_name: clean(settings.sharepoint_drive_name) || null,
        sharepoint_base_folder: baseFolder,
        sharepoint_configured_at: configured
          ? settings.sharepoint_configured_at ?? now
          : null,
        sharepoint_configured_by: configured
          ? settings.sharepoint_configured_by ?? user.id
          : null,
        approval_email_enabled: settings.approval_email_enabled,
        approval_in_app_enabled: settings.approval_in_app_enabled,
        approval_push_enabled: settings.approval_push_enabled,
        updated_by: user.id,
      };

      const result = await supabase
        .from("financial_settings")
        .upsert(payload, { onConflict: "id" })
        .select(
          "id,accounts_email,accounts_notification_enabled,sharepoint_site_id,sharepoint_site_name,sharepoint_site_url,sharepoint_drive_id,sharepoint_drive_name,sharepoint_base_folder,sharepoint_configured_at,sharepoint_configured_by,approval_email_enabled,approval_in_app_enabled,approval_push_enabled,created_at,updated_at,updated_by",
        )
        .single();

      if (result.error) throw result.error;
      setSettings(result.data as FinancialSettings);
      setMessage({ tone: "success", text: "Finance settings saved." });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to save Finance settings.",
      });
    } finally {
      setSavingSettings(false);
    }
  }

  async function discoverSharePoint() {
    setSharePointWorking(true);
    setMessage(null);

    try {
      const response = await apiFetch("/api/expenses/sharepoint/discover");
      const payload = (await response.json()) as SharePointResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not discover SharePoint libraries.");
      }

      const libraries = payload.libraries ?? [];
      setSharePointLibraries(libraries);

      const currentDrive = settings.sharepoint_drive_id ?? "";
      const currentExists = libraries.some((item) => item.id === currentDrive);
      const financeLibrary =
        libraries.find((item) => item.name.trim().toLowerCase() === "finance") ?? null;
      const nextDrive = currentExists ? currentDrive : financeLibrary?.id ?? "";

      setSelectedDriveId(nextDrive);
      setSettings((current) => ({
        ...current,
        sharepoint_site_id: payload.site?.id ?? current.sharepoint_site_id,
        sharepoint_site_name: payload.site?.name ?? current.sharepoint_site_name,
        sharepoint_site_url: payload.site?.webUrl ?? current.sharepoint_site_url,
        sharepoint_drive_id: nextDrive || current.sharepoint_drive_id,
        sharepoint_drive_name:
          libraries.find((item) => item.id === nextDrive)?.name ??
          current.sharepoint_drive_name,
      }));

      setMessage({
        tone: "success",
        text: `${libraries.length} SharePoint document ${libraries.length === 1 ? "library" : "libraries"} found.`,
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
      setSharePointWorking(false);
    }
  }

  async function connectSharePoint() {
    if (!selectedDriveId) {
      setMessage({ tone: "error", text: "Select a SharePoint document library." });
      return;
    }

    setSharePointWorking(true);
    setMessage(null);

    try {
      const response = await apiFetch("/api/expenses/sharepoint/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveId: selectedDriveId,
          baseFolder: clean(settings.sharepoint_base_folder) || "Expenses & Invoices",
        }),
      });

      const payload = (await response.json()) as SharePointResponse;
      if (!response.ok || !payload.settings) {
        throw new Error(payload.error ?? "Could not save the SharePoint destination.");
      }

      setSettings(payload.settings);
      setSelectedDriveId(payload.settings.sharepoint_drive_id ?? "");
      setMessage({
        tone: "success",
        text: `${payload.library?.name ?? "Finance"} connected.`,
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
      setSharePointWorking(false);
    }
  }

  function openNewReviewer() {
    setEditingReviewer(null);
    setReviewerDraft(EMPTY_REVIEWER);
    setUserSearch("");
    setReviewerOpen(true);
  }

  function openEditReviewer(rule: FinancialAccessRule) {
    setEditingReviewer(rule);
    setReviewerDraft({
      appliesTo: rule.applies_to,
      userId: rule.user_id ?? "",
      receivesEmail: rule.receives_email,
      receivesInApp: rule.receives_in_app,
      receivesPush: rule.receives_push,
      canReviewEdit: rule.can_review_edit,
      canApprove: rule.can_approve,
      canMarkPaid: rule.can_mark_paid,
    });

    const selected = users.find((user) => user.id === rule.user_id);
    setUserSearch(selected?.name ?? selected?.email ?? "");
    setReviewerOpen(true);
  }

  async function saveReviewer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!reviewerDraft.userId) {
      setMessage({ tone: "error", text: "Select a TTTracker user." });
      return;
    }

    if (
      !reviewerDraft.canReviewEdit &&
      !reviewerDraft.canApprove &&
      !reviewerDraft.canMarkPaid
    ) {
      setMessage({
        tone: "error",
        text: "Enable at least one Finance permission.",
      });
      return;
    }

    const duplicate = reviewers.find(
      (rule) =>
        rule.id !== editingReviewer?.id &&
        rule.user_id === reviewerDraft.userId &&
        rule.applies_to === reviewerDraft.appliesTo,
    );

    if (duplicate) {
      setMessage({
        tone: "error",
        text: "That user already has a Finance rule for this scope.",
      });
      return;
    }

    setReviewerSaving(true);
    setMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        applies_to: reviewerDraft.appliesTo,
        principal_type: "user" as const,
        role: null,
        user_id: reviewerDraft.userId,
        receives_email: reviewerDraft.receivesEmail,
        receives_in_app: reviewerDraft.receivesInApp,
        receives_push: reviewerDraft.receivesPush,
        can_review_edit: reviewerDraft.canReviewEdit,
        can_approve: reviewerDraft.canApprove,
        can_mark_paid: reviewerDraft.canMarkPaid,
        active: true,
        created_by: user?.id ?? null,
      };

      if (editingReviewer) {
        const result = await supabase
          .from("financial_access_rules")
          .update(payload)
          .eq("id", editingReviewer.id);

        if (result.error) throw result.error;
      } else {
        const result = await supabase.from("financial_access_rules").insert(payload);
        if (result.error) throw result.error;
      }

      await loadSettings();
      setReviewerOpen(false);
      setEditingReviewer(null);
      setReviewerDraft(EMPTY_REVIEWER);
      setMessage({
        tone: "success",
        text: editingReviewer ? "Finance user updated." : "Finance user added.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to save Finance user.",
      });
    } finally {
      setReviewerSaving(false);
    }
  }

  async function removeReviewer(rule: FinancialAccessRule) {
    const selected = users.find((user) => user.id === rule.user_id);
    const label = selected?.name || selected?.email || "this user";

    if (!window.confirm(`Remove Finance permissions for ${label}?`)) return;

    try {
      const result = await supabase
        .from("financial_access_rules")
        .delete()
        .eq("id", rule.id);

      if (result.error) throw result.error;
      await loadSettings();
      setMessage({
        tone: "success",
        text: `Finance permissions removed for ${label}.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to remove Finance user.",
      });
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

    const name = clean(categoryDraft.name);
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
            description: clean(categoryDraft.description) || null,
          })
          .eq("id", editingCategory.id);

        if (result.error) throw result.error;
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const nextSort =
          categories.reduce(
            (highest, category) => Math.max(highest, category.sort_order),
            -1,
          ) + 1;

        const result = await supabase.from("financial_categories").insert({
          name,
          description: clean(categoryDraft.description) || null,
          sort_order: nextSort,
          created_by: user?.id ?? null,
        });

        if (result.error) throw result.error;
      }

      await loadSettings();
      setCategoryOpen(false);
      setEditingCategory(null);
      setCategoryDraft(EMPTY_CATEGORY);
      setMessage({
        tone: "success",
        text: editingCategory ? "Category updated." : "Category created.",
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
    try {
      const result = await supabase
        .from("financial_categories")
        .update({ active: !category.active })
        .eq("id", category.id);

      if (result.error) throw result.error;
      await loadSettings();
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
    if (!window.confirm(`Delete "${category.name}"?`)) return;

    try {
      const result = await supabase
        .from("financial_categories")
        .delete()
        .eq("id", category.id);

      if (result.error) throw result.error;
      await loadSettings();
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

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    return users
      .filter((user) =>
        !query
          ? true
          : [user.name, user.email, roleLabel(user.role)]
              .join(" ")
              .toLowerCase()
              .includes(query),
      )
      .slice(0, 12);
  }, [userSearch, users]);

  const expenseApprovers = reviewers.filter(
    (rule) =>
      rule.can_approve &&
      (rule.applies_to === "all" || rule.applies_to === "expense_claim"),
  ).length;

  const invoiceApprovers = reviewers.filter(
    (rule) =>
      rule.can_approve &&
      (rule.applies_to === "all" || rule.applies_to === "invoice"),
  ).length;

  const financeRoleUsers = users.filter((user) => user.role === "finance");

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[65vh] items-center justify-center">
          <Loader2 size={30} className="animate-spin text-slate-400" />
        </div>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl py-12">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <ShieldCheck size={38} className="mx-auto text-slate-300" />
            <h1 className="mt-4 text-2xl font-bold text-slate-950">Finance Settings</h1>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Finance Settings are restricted to Administrators. Finance-role users can use the Finance module without being able to change approvers, storage or company settings.
            </p>
            <Link
              href="/expenses"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <ArrowLeft size={16} />
              Back to Finance
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 pb-12">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-slate-400">
                <Settings size={18} />
                <p className="text-sm font-semibold uppercase tracking-wider">Finance</p>
              </div>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Finance Settings</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Configure exact-user approvers, Accounts notifications, SharePoint storage, approval channels and Finance categories.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/expenses"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <ArrowLeft size={16} />
                Finance Dashboard
              </Link>
              <button
                type="button"
                onClick={() => void refreshAll()}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                Refresh
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
              {message.tone === "success" ? <CheckCircle2 size={17} /> : <X size={17} />}
              {message.text}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Finance Users"
            value={String(financeRoleUsers.length)}
            detail="Module access role"
            icon={<Users size={20} />}
          />
          <MetricCard
            label="Expense Approvers"
            value={String(expenseApprovers)}
            detail="Exact logged-in users"
            icon={<ReceiptText size={20} />}
          />
          <MetricCard
            label="Invoice Approvers"
            value={String(invoiceApprovers)}
            detail="Exact logged-in users"
            icon={<FileText size={20} />}
          />
          <MetricCard
            label="Accounts Email"
            value={settings.accounts_email ? "Configured" : "Not Set"}
            detail={settings.accounts_email || "Final invoice notification"}
            icon={<Mail size={20} />}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-slate-400" />
              <h2 className="text-xl font-bold text-slate-950">Finance Access Model</h2>
            </div>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
              The <strong>finance</strong> website role controls who can enter the Finance module. Approval authority is separate and is assigned below to exact TTTracker users by user ID.
            </p>
          </div>

          <div className="grid gap-4 p-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2">
                <Users size={17} className="text-slate-400" />
                <h3 className="font-bold text-slate-950">Finance Role</h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Role assignment remains under Admin → Users. A Finance-role user should only see Finance/Profile navigation once the central role guard is updated.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {financeRoleUsers.length ? (
                  financeRoleUsers.map((user) => (
                    <span
                      key={user.id}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      {user.name}
                    </span>
                  ))
                ) : (
                  <span className="text-sm font-semibold text-amber-700">No users currently have the Finance role.</span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-center gap-2">
                <UserRoundCheck size={17} className="text-emerald-700" />
                <h3 className="font-bold text-emerald-950">Exact-User Approval</h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-emerald-800">
                Finance review, approval, denial and payment permissions come from exact user-ID rules. The Finance role alone does not give approval authority.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <UserRoundCheck size={18} className="text-slate-400" />
                <h2 className="text-xl font-bold text-slate-950">Finance Reviewers & Approvers</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Assign exact TTTracker users to Expense Claims, Invoices or both.
              </p>
            </div>

            <button
              type="button"
              onClick={openNewReviewer}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Plus size={16} />
              Add Finance User
            </button>
          </div>

          {reviewers.length === 0 ? (
            <EmptyState
              title="No Finance reviewers configured"
              description="Add at least one Expense approver before submitting BCC-EXP claims and one Invoice approver before enabling supplier invoices."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {reviewers.map((rule) => {
                const user = users.find((item) => item.id === rule.user_id);
                const name = user?.name || user?.email || "TTTracker user";

                return (
                  <div
                    key={rule.id}
                    className="grid gap-4 px-6 py-5 xl:grid-cols-[minmax(0,1.1fr)_180px_minmax(0,1.3fr)_auto] xl:items-center"
                  >
                    <div>
                      <div className="font-bold text-slate-950">{name}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                        {user?.email ? <span>{user.email}</span> : null}
                        <span>{roleLabel(user?.role)}</span>
                      </div>
                    </div>

                    <div className="text-sm font-semibold text-slate-600">{scopeLabel(rule.applies_to)}</div>

                    <div className="flex flex-wrap gap-2">
                      {rule.can_review_edit ? <PermissionPill label="Review / Changes" /> : null}
                      {rule.can_approve ? <PermissionPill label="Approve / Deny" /> : null}
                      {rule.can_mark_paid ? <PermissionPill label="Mark Paid" /> : null}
                      {rule.receives_email ? <PermissionPill label="Email" icon={<Mail size={12} />} /> : null}
                      {rule.receives_in_app ? <PermissionPill label="In-App" icon={<Bell size={12} />} /> : null}
                      {rule.receives_push ? <PermissionPill label="Push" icon={<Smartphone size={12} />} /> : null}
                    </div>

                    <div className="flex gap-2 xl:justify-end">
                      <button
                        type="button"
                        onClick={() => openEditReviewer(rule)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeReviewer(rule)}
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

        <form
          onSubmit={saveMainSettings}
          className="rounded-3xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <HardDrive size={18} className="text-slate-400" />
                <h2 className="text-xl font-bold text-slate-950">Workflow & Storage</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Configure Accounts notification, SharePoint storage and approval channels.
              </p>
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {savingSettings ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save Settings
            </button>
          </div>

          <div className="space-y-8 p-6">
            <div>
              <div className="flex items-center gap-2">
                <Mail size={17} className="text-slate-400" />
                <h3 className="text-base font-bold text-slate-950">Accounts Notification</h3>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                For supplier invoices: approval → SharePoint filing → final notification to Accounts. The original submitter is separately notified of the approval outcome.
              </p>

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_250px] lg:items-end">
                <Field label="Accounts email">
                  <input
                    type="email"
                    value={settings.accounts_email ?? ""}
                    onChange={(event) =>
                      setSettings((current) => ({ ...current, accounts_email: event.target.value }))
                    }
                    placeholder="accounts@bc-contracting.com.au"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                  />
                </Field>

                <CheckField
                  label="Notify Accounts after approval"
                  checked={settings.accounts_notification_enabled}
                  onChange={(checked) =>
                    setSettings((current) => ({
                      ...current,
                      accounts_notification_enabled: checked,
                    }))
                  }
                />
              </div>
            </div>

            <div className="border-t border-slate-200 pt-8">
              <div className="flex items-center gap-2">
                <HardDrive size={17} className="text-slate-400" />
                <h3 className="text-base font-bold text-slate-950">SharePoint Storage</h3>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Approved Finance documents are filed once in SharePoint. TTTracker keeps database links back to the same document.
              </p>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          settings.sharepoint_site_id && settings.sharepoint_drive_id
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {settings.sharepoint_site_id && settings.sharepoint_drive_id
                          ? "Connected"
                          : "Not Connected"}
                      </span>
                      {settings.sharepoint_site_name ? (
                        <span className="text-sm font-semibold text-slate-700">{settings.sharepoint_site_name}</span>
                      ) : null}
                      {settings.sharepoint_drive_name ? (
                        <span className="text-sm text-slate-500">→ {settings.sharepoint_drive_name}</span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      The existing Microsoft Graph connection is used to discover the site and document libraries.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void discoverSharePoint()}
                    disabled={sharePointWorking}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    {sharePointWorking ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    {settings.sharepoint_drive_id ? "Change Library" : "Connect SharePoint"}
                  </button>
                </div>

                {sharePointLibraries.length > 0 ? (
                  <div className="mt-5 grid gap-4 border-t border-slate-200 pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                    <Field label="SharePoint Library">
                      <SelectField
                        value={selectedDriveId}
                        onChange={(value) => {
                          setSelectedDriveId(value);
                          const selected = sharePointLibraries.find((item) => item.id === value) ?? null;
                          setSettings((current) => ({
                            ...current,
                            sharepoint_drive_id: value || null,
                            sharepoint_drive_name: selected?.name ?? null,
                          }));
                        }}
                        options={[
                          { value: "", label: "Select document library..." },
                          ...sharePointLibraries.map((item) => ({ value: item.id, label: item.name })),
                        ]}
                      />
                    </Field>

                    <Field label="Base Folder">
                      <input
                        value={settings.sharepoint_base_folder}
                        onChange={(event) =>
                          setSettings((current) => ({
                            ...current,
                            sharepoint_base_folder: event.target.value,
                          }))
                        }
                        placeholder="Expenses & Invoices"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                      />
                    </Field>

                    <button
                      type="button"
                      onClick={() => void connectSharePoint()}
                      disabled={sharePointWorking || !selectedDriveId}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {sharePointWorking ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      Use Library
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-8">
              <div className="flex items-center gap-2">
                <Bell size={17} className="text-slate-400" />
                <h3 className="text-base font-bold text-slate-950">Approval Notification Channels</h3>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                These switches enable each channel company-wide. Individual reviewer preferences above still apply.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <CheckField
                  label="Email"
                  icon={<Mail size={15} />}
                  checked={settings.approval_email_enabled}
                  onChange={(checked) =>
                    setSettings((current) => ({ ...current, approval_email_enabled: checked }))
                  }
                />
                <CheckField
                  label="In-App"
                  icon={<Bell size={15} />}
                  checked={settings.approval_in_app_enabled}
                  onChange={(checked) =>
                    setSettings((current) => ({ ...current, approval_in_app_enabled: checked }))
                  }
                />
                <CheckField
                  label="Phone Push"
                  icon={<Smartphone size={15} />}
                  checked={settings.approval_push_enabled}
                  onChange={(checked) =>
                    setSettings((current) => ({ ...current, approval_push_enabled: checked }))
                  }
                />
              </div>
            </div>
          </div>
        </form>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Finance Categories</h2>
              <p className="mt-1 text-sm text-slate-500">
                Shared categories for BCC-EXP Expense Claims and BCC-INV Invoice line items.
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
            <EmptyState
              title="No Finance categories"
              description="Add categories such as Fuel, Accommodation, Vehicle Repairs, Plant Repairs, Materials and Travel."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="grid gap-4 px-6 py-4 sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-950">{category.name}</h3>
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
                      <p className="mt-1 text-sm text-slate-500">{category.description}</p>
                    ) : null}
                  </div>

                  <div className="text-sm text-slate-500">Order {category.sort_order + 1}</div>

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
      </div>

      {reviewerOpen ? (
        <ModalShell
          title={editingReviewer ? "Edit Finance User" : "Add Finance User"}
          description="Approval authority is tied to this exact logged-in TTTracker user."
          onClose={() => setReviewerOpen(false)}
        >
          <form onSubmit={saveReviewer} className="space-y-5">
            <Field label="Applies to">
              <SelectField
                value={reviewerDraft.appliesTo}
                onChange={(value) =>
                  setReviewerDraft((current) => ({
                    ...current,
                    appliesTo: value as ReviewerDraft["appliesTo"],
                  }))
                }
                options={[
                  { value: "all", label: "Expense Claims & Invoices" },
                  { value: "expense_claim", label: "Expense Claims" },
                  { value: "invoice", label: "Invoices" },
                ]}
              />
            </Field>

            <Field label="TTTracker user">
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-3.5 text-slate-400"
                />
                <input
                  value={userSearch}
                  onChange={(event) => {
                    setUserSearch(event.target.value);
                    setReviewerDraft((current) => ({ ...current, userId: "" }));
                  }}
                  placeholder="Search name or email..."
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </div>

              <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1">
                {filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setReviewerDraft((current) => ({ ...current, userId: user.id }));
                      setUserSearch(user.name || user.email);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50 ${
                      reviewerDraft.userId === user.id ? "bg-emerald-50" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-800">{user.name}</span>
                      <span className="block truncate text-xs text-slate-400">
                        {user.email || "No email"} · {roleLabel(user.role)}
                      </span>
                    </span>
                    {reviewerDraft.userId === user.id ? (
                      <CheckCircle2 size={17} className="shrink-0 text-emerald-700" />
                    ) : null}
                  </button>
                ))}
              </div>
            </Field>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">Permissions</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <CheckField
                  label="Review / Request Changes"
                  checked={reviewerDraft.canReviewEdit}
                  onChange={(checked) =>
                    setReviewerDraft((current) => ({ ...current, canReviewEdit: checked }))
                  }
                />
                <CheckField
                  label="Approve / Deny"
                  checked={reviewerDraft.canApprove}
                  onChange={(checked) =>
                    setReviewerDraft((current) => ({ ...current, canApprove: checked }))
                  }
                />
                <CheckField
                  label="Mark Paid"
                  checked={reviewerDraft.canMarkPaid}
                  onChange={(checked) =>
                    setReviewerDraft((current) => ({ ...current, canMarkPaid: checked }))
                  }
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">Notifications</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <CheckField
                  label="Email"
                  checked={reviewerDraft.receivesEmail}
                  onChange={(checked) =>
                    setReviewerDraft((current) => ({ ...current, receivesEmail: checked }))
                  }
                />
                <CheckField
                  label="In-App"
                  checked={reviewerDraft.receivesInApp}
                  onChange={(checked) =>
                    setReviewerDraft((current) => ({ ...current, receivesInApp: checked }))
                  }
                />
                <CheckField
                  label="Phone Push"
                  checked={reviewerDraft.receivesPush}
                  onChange={(checked) =>
                    setReviewerDraft((current) => ({ ...current, receivesPush: checked }))
                  }
                />
              </div>
            </div>

            <ModalActions
              onCancel={() => setReviewerOpen(false)}
              saving={reviewerSaving}
              saveLabel={editingReviewer ? "Save Finance User" : "Add Finance User"}
            />
          </form>
        </ModalShell>
      ) : null}

      {categoryOpen ? (
        <ModalShell
          title={editingCategory ? "Edit Category" : "Add Category"}
          description="Categories are shared by Expense Claims and supplier Invoices."
          onClose={() => setCategoryOpen(false)}
        >
          <form onSubmit={saveCategory} className="space-y-5">
            <Field label="Category name">
              <input
                value={categoryDraft.name}
                onChange={(event) =>
                  setCategoryDraft((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="e.g. Fuel, Accommodation, Vehicle Repairs"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </Field>

            <Field label="Description">
              <textarea
                value={categoryDraft.description}
                onChange={(event) =>
                  setCategoryDraft((current) => ({ ...current, description: event.target.value }))
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
          <div className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-950">{value}</div>
          <div className="mt-1 truncate text-xs text-slate-400">{detail}</div>
        </div>
        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">{icon}</div>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-6 py-10 text-center">
      <div className="text-sm font-bold text-slate-800">{title}</div>
      <div className="mx-auto mt-1 max-w-xl text-sm leading-6 text-slate-500">{description}</div>
    </div>
  );
}

function PermissionPill({ label, icon }: { label: string; icon?: React.ReactNode }) {
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
  icon,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300"
      />
      {icon ? <span className="text-slate-400">{icon}</span> : null}
      <span className="text-sm font-semibold text-slate-700">{label}</span>
    </label>
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
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {saveLabel}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-800">{label}</span>
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

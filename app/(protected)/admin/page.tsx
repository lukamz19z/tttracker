"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Building2,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Upload,
  Users,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";
import { AdminPermissionsPanel } from "@/components/admin/admin-permissions-panel";

type WebsiteRole =
  | "admin"
  | "hseq"
  | "asset_manager"
  | "commercial"
  | "editor"
  | "crew"
  | "viewer";

type MobileRole =
  | "admin"
  | "hseq"
  | "asset_manager"
  | "commercial"
  | "editor"
  | "crew"
  | "viewer";

type Project = {
  id: string;
  name: string;
  project_number?: string | null;
  location?: string | null;
  status?: string | null;
};

type EmployeeSummary = {
  id: string;
  full_name: string;
  role?: string | null;
  user_id?: string | null;
};

type ProjectAccess = {
  project_id: string;
  role?: string | null;
};

type ApiUser = {
  user_id?: string;
  id?: string;
  email?: string | null;
  website_role?: string | null;
  role?: string | null;
  mobile_role?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  is_active?: boolean | null;
  active?: boolean | null;
  employee?: EmployeeSummary | null;
  employee_id?: string | null;
  employee_name?: string | null;
  project_access?: ProjectAccess[] | null;
  project_ids?: string[] | null;
};

type UsersResponse = {
  users?: ApiUser[];
  employees?: EmployeeSummary[];
  projects?: Project[];
  error?: string;
};

type AdminUser = {
  userId: string;
  email: string;
  websiteRole: WebsiteRole;
  mobileRole: MobileRole;
  createdAt: string | null;
  lastSignInAt: string | null;
  isActive: boolean;
  employee: EmployeeSummary | null;
  projectIds: string[];
};

type CreateForm = {
  email: string;
  password: string;
  confirmPassword: string;
  websiteRole: WebsiteRole;
  mobileRole: MobileRole;
  projectIds: string[];
};

type EditForm = {
  websiteRole: WebsiteRole;
  mobileRole: MobileRole;
  projectIds: string[];
};

type BrandingRecord = {
  company_name: string;
  logo_file_name: string | null;
  logo_content_type: string | null;
  logo_sharepoint_item_id: string | null;
  logo_sharepoint_drive_id: string | null;
  logo_updated_at: string | null;
};

type BrandingResponse = {
  branding?: BrandingRecord;
  logo_url?: string | null;
  error?: string;
};

const EMPTY_CREATE_FORM: CreateForm = {
  email: "",
  password: "",
  confirmPassword: "",
  websiteRole: "viewer",
  mobileRole: "crew",
  projectIds: [],
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

const MOBILE_ROLES: Array<{ value: MobileRole; label: string }> = [
  { value: "admin", label: "Administrator" },
  { value: "hseq", label: "HSEQ" },
  { value: "asset_manager", label: "Asset Manager" },
  { value: "commercial", label: "Commercial" },
  { value: "editor", label: "Editor" },
  { value: "crew", label: "Crew / Field" },
  { value: "viewer", label: "Viewer" },
];

function normaliseWebsiteRole(value?: string | null): WebsiteRole {
  const role = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");

  if (role === "administrator" || role === "site_admin") return "admin";
  if (role === "safety" || role === "safety_manager") return "hseq";
  if (role === "assets") return "asset_manager";
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

function normaliseMobileRole(value?: string | null): MobileRole {
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
    return role as MobileRole;
  }

  return "crew";
}

function roleLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "Never";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function mapApiUser(user: ApiUser): AdminUser | null {
  const userId = String(user.user_id ?? user.id ?? "").trim();
  if (!userId) return null;

  const nestedAccess = Array.isArray(user.project_access)
    ? user.project_access.map((row) => row.project_id).filter(Boolean)
    : [];

  const directAccess = Array.isArray(user.project_ids)
    ? user.project_ids.filter(Boolean)
    : [];

  const fallbackEmployee =
    user.employee ??
    (user.employee_id || user.employee_name
      ? {
          id: String(user.employee_id ?? ""),
          full_name: String(user.employee_name ?? "Linked employee"),
        }
      : null);

  return {
    userId,
    email: String(user.email ?? "").trim(),
    websiteRole: normaliseWebsiteRole(user.website_role ?? user.role),
    mobileRole: normaliseMobileRole(user.mobile_role),
    createdAt: user.created_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
    isActive: user.is_active ?? user.active ?? true,
    employee: fallbackEmployee,
    projectIds: directAccess.length > 0 ? directAccess : nestedAccess,
  };
}

export default function AdminPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [adminTab, setAdminTab] = useState<"users" | "permissions" | "branding">("users");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState("");
  const [websiteRoleFilter, setWebsiteRoleFilter] = useState<
    "all" | WebsiteRole
  >("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] =
    useState<CreateForm>(EMPTY_CREATE_FORM);
  const [createSaving, setCreateSaving] = useState(false);

  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [passwordUser, setPasswordUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const [branding, setBranding] = useState<BrandingRecord>({
    company_name: "BC Contracting",
    logo_file_name: null,
    logo_content_type: null,
    logo_sharepoint_item_id: null,
    logo_sharepoint_drive_id: null,
    logo_updated_at: null,
  });
  const [brandingLogoUrl, setBrandingLogoUrl] = useState<string | null>(null);
  const [brandingFile, setBrandingFile] = useState<File | null>(null);
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [brandingSaving, setBrandingSaving] = useState(false);

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
    const response = await apiFetch("/api/admin/users");
    const payload = (await response.json()) as UsersResponse;

    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to load user accounts.");
    }

    const mappedUsers = (payload.users ?? [])
      .map(mapApiUser)
      .filter((user): user is AdminUser => Boolean(user))
      .sort((a, b) => a.email.localeCompare(b.email));

    setUsers(mappedUsers);

    if (Array.isArray(payload.projects)) {
      setProjects(
        [...payload.projects].sort((a, b) => a.name.localeCompare(b.name)),
      );
    } else {
      const projectResult = await supabase
        .from("projects")
        .select("id, name, project_number, location, status")
        .order("name");

      if (projectResult.error) {
        throw new Error(projectResult.error.message);
      }

      setProjects((projectResult.data ?? []) as Project[]);
    }
  }, [apiFetch, supabase]);

  const checkAdminAndLoad = useCallback(async () => {
    setCheckingRole(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const roleResult = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const currentRole = String(roleResult.data?.role ?? "").toLowerCase();

    if (currentRole !== "admin") {
      window.location.href = "/";
      return;
    }

    setCheckingRole(false);
    await loadAll();
  }, [loadAll, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await checkAdminAndLoad();
        } catch (error) {
          setMessage({
            tone: "error",
            text:
              error instanceof Error
                ? error.message
                : "Failed to load user accounts.",
          });
        } finally {
          setLoading(false);
          setCheckingRole(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [checkAdminAndLoad]);

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
            : "Failed to refresh user accounts.",
      });
    } finally {
      setRefreshing(false);
    }
  }


  const loadBranding = useCallback(async () => {
    setBrandingLoading(true);

    try {
      const response = await apiFetch("/api/admin/branding");
      const payload = (await response.json()) as BrandingResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load document branding.");
      }

      if (payload.branding) {
        setBranding(payload.branding);
      }

      setBrandingLogoUrl(payload.logo_url ?? null);
      setBrandingFile(null);
    } finally {
      setBrandingLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (adminTab !== "branding") return;

    const timer = window.setTimeout(() => {
      void loadBranding().catch((error) => {
        setMessage({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : "Failed to load document branding.",
        });
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [adminTab, loadBranding]);

  async function saveBranding() {
    const companyName = branding.company_name.trim();

    if (!companyName) {
      setMessage({ tone: "error", text: "Enter the company name." });
      return;
    }

    if (brandingFile) {
      const allowed = ["image/png", "image/jpeg"];
      if (!allowed.includes(brandingFile.type)) {
        setMessage({
          tone: "error",
          text: "The logo must be a PNG or JPEG image.",
        });
        return;
      }

      if (brandingFile.size > 2 * 1024 * 1024) {
        setMessage({
          tone: "error",
          text: "The logo must be smaller than 2 MB.",
        });
        return;
      }
    }

    setBrandingSaving(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.set("company_name", companyName);

      if (brandingFile) {
        formData.set("logo", brandingFile);
      }

      const response = await apiFetch("/api/admin/branding", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as BrandingResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save document branding.");
      }

      if (payload.branding) {
        setBranding(payload.branding);
      }

      setBrandingLogoUrl(payload.logo_url ?? null);
      setBrandingFile(null);
      setMessage({
        tone: "success",
        text: "Document branding updated successfully.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to save document branding.",
      });
    } finally {
      setBrandingSaving(false);
    }
  }

  async function removeBrandingLogo() {
    if (!window.confirm("Remove the current document logo?")) return;

    setBrandingSaving(true);
    setMessage(null);

    try {
      const response = await apiFetch("/api/admin/branding", {
        method: "DELETE",
      });

      const payload = (await response.json()) as BrandingResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to remove the logo.");
      }

      if (payload.branding) {
        setBranding(payload.branding);
      }

      setBrandingLogoUrl(null);
      setBrandingFile(null);
      setMessage({
        tone: "success",
        text: "Document logo removed.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error ? error.message : "Failed to remove the logo.",
      });
    } finally {
      setBrandingSaving(false);
    }
  }

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return users.filter((user) => {
      if (
        websiteRoleFilter !== "all" &&
        user.websiteRole !== websiteRoleFilter
      ) {
        return false;
      }

      if (!query) return true;

      return [
        user.email,
        user.employee?.full_name,
        user.employee?.role,
        roleLabel(user.websiteRole),
        roleLabel(user.mobileRole),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [search, users, websiteRoleFilter]);

  const activeCount = users.filter((user) => user.isActive).length;
  const adminCount = users.filter(
    (user) => user.websiteRole === "admin",
  ).length;
  const unlinkedCount = users.filter((user) => !user.employee).length;

  function openEdit(user: AdminUser) {
    setEditingUser(user);
    setEditForm({
      websiteRole: user.websiteRole,
      mobileRole: user.mobileRole,
      projectIds: [...user.projectIds],
    });
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const email = createForm.email.trim().toLowerCase();

    if (!email) {
      setMessage({ tone: "error", text: "Enter an email address." });
      return;
    }

    if (createForm.password.length < 8) {
      setMessage({
        tone: "error",
        text: "The temporary password must be at least 8 characters.",
      });
      return;
    }

    if (createForm.password !== createForm.confirmPassword) {
      setMessage({ tone: "error", text: "The passwords do not match." });
      return;
    }

    setCreateSaving(true);

    try {
      const response = await apiFetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password: createForm.password,
          website_role: createForm.websiteRole,
          role: createForm.websiteRole,
          mobile_role: createForm.mobileRole,
          employee_id: null,
          crew_id: null,
          project_ids: createForm.projectIds,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create user.");
      }

      await loadAll();
      setCreateForm(EMPTY_CREATE_FORM);
      setCreateOpen(false);
      setMessage({
        tone: "success",
        text: "The login account was created successfully.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to create the login account.",
      });
    } finally {
      setCreateSaving(false);
    }
  }

  async function saveUserAccess() {
    if (!editingUser || !editForm) return;

    setEditSaving(true);
    setMessage(null);

    try {
      const response = await apiFetch("/api/admin/update-user-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: editingUser.userId,
          website_role: editForm.websiteRole,
          role: editForm.websiteRole,
          mobile_role: editForm.mobileRole,
          employee_id: editingUser.employee?.id || null,
          crew_id: null,
          project_ids: editForm.projectIds,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update user access.");
      }

      await loadAll();
      setEditingUser(null);
      setEditForm(null);
      setMessage({
        tone: "success",
        text: `Access updated for ${editingUser.email}.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to update user access.",
      });
    } finally {
      setEditSaving(false);
    }
  }

  async function updatePassword() {
    if (!passwordUser) return;

    if (newPassword.length < 8) {
      setMessage({
        tone: "error",
        text: "The new password must be at least 8 characters.",
      });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setMessage({ tone: "error", text: "The passwords do not match." });
      return;
    }

    setPasswordSaving(true);
    setMessage(null);

    try {
      const response = await apiFetch("/api/admin/update-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: passwordUser.userId,
          password: newPassword,
          new_password: newPassword,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update password.");
      }

      setPasswordUser(null);
      setNewPassword("");
      setConfirmNewPassword("");
      setMessage({
        tone: "success",
        text: `Password updated for ${passwordUser.email}.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to update the password.",
      });
    } finally {
      setPasswordSaving(false);
    }
  }

  if (checkingRole) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 size={28} className="animate-spin text-slate-400" />
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
                <ShieldCheck size={18} />
                <p className="text-sm font-semibold uppercase tracking-wider">
                  Admin
                </p>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Administration
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Manage login access, role permissions and company document
                branding used across TTTracker generated documents.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
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
                onClick={() => {
                  setCreateForm(EMPTY_CREATE_FORM);
                  setCreateOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Plus size={16} />
                Create User
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setAdminTab("users")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
                adminTab === "users"
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Users size={16} />
              Users
            </button>

            <button
              type="button"
              onClick={() => setAdminTab("permissions")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
                adminTab === "permissions"
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <SlidersHorizontal size={16} />
              Roles & Permissions
            </button>

            <button
              type="button"
              onClick={() => setAdminTab("branding")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
                adminTab === "branding"
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <ImageIcon size={16} />
              Branding
            </button>
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

        {adminTab === "users" ? (
          <>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Login accounts"
            value={String(users.length)}
            detail="All system accounts"
            icon={<Users size={20} />}
          />
          <MetricCard
            label="Active"
            value={String(activeCount)}
            detail={`${users.length - activeCount} inactive`}
            icon={<CheckCircle2 size={20} />}
          />
          <MetricCard
            label="Administrators"
            value={String(adminCount)}
            detail="Full system access"
            icon={<ShieldCheck size={20} />}
          />
          <MetricCard
            label="Not linked"
            value={String(unlinkedCount)}
            detail="No employee profile"
            icon={<UserCog size={20} />}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative block">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search email, linked employee or role..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </label>

            <SelectField
              value={websiteRoleFilter}
              onChange={(value) =>
                setWebsiteRoleFilter(value as "all" | WebsiteRole)
              }
              options={[
                { value: "all", label: "All website roles" },
                ...WEBSITE_ROLES,
              ]}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-bold text-slate-950">
              Login Accounts
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {filteredUsers.length} account
              {filteredUsers.length === 1 ? "" : "s"} shown
            </p>
          </div>

          {loading ? (
            <div className="flex min-h-64 items-center justify-center">
              <Loader2 size={26} className="animate-spin text-slate-400" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-10 text-center">
              <Users size={30} className="mx-auto text-slate-300" />
              <h3 className="mt-4 text-lg font-bold text-slate-900">
                No accounts found
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Check the filter or create a new login account.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredUsers.map((user) => (
                <UserRow
                  key={user.userId}
                  user={user}
                  projects={projects}
                  onEdit={() => openEdit(user)}
                  onPassword={() => {
                    setPasswordUser(user);
                    setNewPassword("");
                    setConfirmNewPassword("");
                  }}
                />
              ))}
            </div>
          )}
        </section>
          </>
        ) : adminTab === "permissions" ? (
          <AdminPermissionsPanel />
        ) : (
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                  <Building2 size={22} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-950">
                    Document Branding
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Company branding used on Daily Dockets and other generated
                    TTTracker documents.
                  </p>
                </div>
              </div>
            </div>

            {brandingLoading ? (
              <div className="flex min-h-72 items-center justify-center">
                <Loader2 size={28} className="animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-6">
                  <Field label="Company name">
                    <input
                      value={branding.company_name}
                      onChange={(event) =>
                        setBranding((current) => ({
                          ...current,
                          company_name: event.target.value,
                        }))
                      }
                      placeholder="BC Contracting"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                    />
                  </Field>

                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      Company logo
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Upload a clean PNG or JPEG. A transparent PNG is preferred.
                      Maximum file size 2 MB.
                    </p>

                    <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100">
                      <Upload size={18} />
                      {brandingFile ? brandingFile.name : "Choose logo"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        className="hidden"
                        onChange={(event) =>
                          setBrandingFile(event.target.files?.[0] ?? null)
                        }
                      />
                    </label>

                    {brandingFile ? (
                      <p className="mt-2 text-xs text-slate-500">
                        New logo selected. Save branding to upload it.
                      </p>
                    ) : branding.logo_file_name ? (
                      <p className="mt-2 text-xs text-slate-500">
                        Current file: {branding.logo_file_name}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-5">
                    <button
                      type="button"
                      onClick={() => void saveBranding()}
                      disabled={brandingSaving}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {brandingSaving ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Save size={16} />
                      )}
                      Save Branding
                    </button>

                    {branding.logo_sharepoint_item_id ? (
                      <button
                        type="button"
                        onClick={() => void removeBrandingLogo()}
                        disabled={brandingSaving}
                        className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                      >
                        Remove Logo
                      </button>
                    ) : null}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Document preview
                  </div>

                  <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex min-h-28 items-center justify-between gap-5 border-b border-slate-200 px-5 py-4">
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
                          {brandingLogoUrl ? (
                            <img
                              src={brandingLogoUrl}
                              alt="Current company logo"
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <ImageIcon size={25} className="text-slate-300" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-slate-950">
                            {branding.company_name || "Company"}
                          </div>
                          <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Daily Docket
                          </div>
                        </div>
                      </div>

                      <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                        DRAFT
                      </span>
                    </div>

                    <div className="space-y-3 p-5">
                      <div className="h-2 w-2/3 rounded bg-slate-200" />
                      <div className="h-2 w-full rounded bg-slate-100" />
                      <div className="h-2 w-5/6 rounded bg-slate-100" />
                      <div className="mt-5 h-px bg-slate-200" />
                      <div className="text-[10px] text-slate-400">
                        TTTracker • Uncontrolled when printed
                      </div>
                    </div>
                  </div>

                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    The saved logo is kept in the controlled SharePoint branding
                    location. TTTracker stores only the SharePoint reference and
                    retrieves the image server-side when generating documents.
                  </p>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {createOpen ? (
        <ModalShell
          title="Create Login Account"
          description="Create the system login here. Link it to an employee profile from People."
          onClose={() => setCreateOpen(false)}
        >
          <form onSubmit={createUser} className="space-y-5">
            <Field label="Email address">
              <input
                type="email"
                value={createForm.email}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Temporary password">
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </Field>

              <Field label="Confirm password">
                <input
                  type="password"
                  value={createForm.confirmPassword}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      confirmPassword: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Website role">
                <SelectField
                  value={createForm.websiteRole}
                  onChange={(value) =>
                    setCreateForm((current) => ({
                      ...current,
                      websiteRole: value as WebsiteRole,
                    }))
                  }
                  options={WEBSITE_ROLES}
                />
              </Field>

              <Field label="Mobile role">
                <SelectField
                  value={createForm.mobileRole}
                  onChange={(value) =>
                    setCreateForm((current) => ({
                      ...current,
                      mobileRole: value as MobileRole,
                    }))
                  }
                  options={MOBILE_ROLES}
                />
              </Field>
            </div>

            <ProjectSelector
              projects={projects}
              selectedIds={createForm.projectIds}
              onChange={(projectIds) =>
                setCreateForm((current) => ({
                  ...current,
                  projectIds,
                }))
              }
            />

            <ModalActions
              onCancel={() => setCreateOpen(false)}
              saving={createSaving}
              saveLabel="Create User"
            />
          </form>
        </ModalShell>
      ) : null}

      {editingUser && editForm ? (
        <ModalShell
          title="Edit User Access"
          description={editingUser.email}
          onClose={() => {
            setEditingUser(null);
            setEditForm(null);
          }}
        >
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">
                Employee profile
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {editingUser.employee
                  ? `Linked to ${editingUser.employee.full_name}`
                  : "No employee profile linked. Assign this login from People."}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Website role">
                <SelectField
                  value={editForm.websiteRole}
                  onChange={(value) =>
                    setEditForm((current) =>
                      current
                        ? {
                            ...current,
                            websiteRole: value as WebsiteRole,
                          }
                        : current,
                    )
                  }
                  options={WEBSITE_ROLES}
                />
              </Field>

              <Field label="Mobile role">
                <SelectField
                  value={editForm.mobileRole}
                  onChange={(value) =>
                    setEditForm((current) =>
                      current
                        ? {
                            ...current,
                            mobileRole: value as MobileRole,
                          }
                        : current,
                    )
                  }
                  options={MOBILE_ROLES}
                />
              </Field>
            </div>

            <ProjectSelector
              projects={projects}
              selectedIds={editForm.projectIds}
              onChange={(projectIds) =>
                setEditForm((current) =>
                  current ? { ...current, projectIds } : current,
                )
              }
            />

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setEditingUser(null);
                  setEditForm(null);
                }}
                disabled={editSaving}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void saveUserAccess()}
                disabled={editSaving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {editSaving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : null}
                Save Access
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {passwordUser ? (
        <ModalShell
          title="Reset Password"
          description={`Set a new password for ${passwordUser.email}.`}
          onClose={() => setPasswordUser(null)}
        >
          <div className="space-y-5">
            <Field label="New password">
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </Field>

            <Field label="Confirm new password">
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(event) =>
                  setConfirmNewPassword(event.target.value)
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </Field>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPasswordUser(null)}
                disabled={passwordSaving}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void updatePassword()}
                disabled={passwordSaving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {passwordSaving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <KeyRound size={16} />
                )}
                Update Password
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </AppShell>
  );
}

function UserRow({
  user,
  projects,
  onEdit,
  onPassword,
}: {
  user: AdminUser;
  projects: Project[];
  onEdit: () => void;
  onPassword: () => void;
}) {
  const projectNames = user.projectIds
    .map((projectId) => projects.find((project) => project.id === projectId))
    .filter((project): project is Project => Boolean(project))
    .map((project) => project.project_number || project.name);

  return (
    <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-bold text-slate-950">{user.email}</h3>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              user.isActive
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {user.isActive ? "Active" : "Inactive"}
          </span>
        </div>

        <p className="mt-1 text-sm text-slate-500">
          {user.employee
            ? `Linked to ${user.employee.full_name}`
            : "No employee profile linked"}
        </p>

        <p className="mt-1 text-xs text-slate-400">
          Last sign-in: {formatDate(user.lastSignInAt)}
        </p>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Roles
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <RoleBadge label={roleLabel(user.websiteRole)} />
          <RoleBadge label={roleLabel(user.mobileRole)} blue />
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Project access
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {projectNames.length > 0
            ? projectNames.slice(0, 3).join(", ")
            : "No projects assigned"}
          {projectNames.length > 3
            ? ` +${projectNames.length - 3} more`
            : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 lg:justify-end">
        <button
          type="button"
          onClick={onPassword}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <KeyRound size={15} />
          Password
        </button>

        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <UserCog size={15} />
          Access
        </button>
      </div>
    </div>
  );
}

function ProjectSelector({
  projects,
  selectedIds,
  onChange,
}: {
  projects: Project[];
  selectedIds: string[];
  onChange: (projectIds: string[]) => void;
}) {
  function toggle(projectId: string) {
    onChange(
      selectedIds.includes(projectId)
        ? selectedIds.filter((id) => id !== projectId)
        : [...selectedIds, projectId],
    );
  }

  return (
    <div>
      <div className="text-sm font-bold text-slate-900">Project access</div>
      <p className="mt-1 text-xs text-slate-500">
        Select the projects this login can open.
      </p>

      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 p-3">
        {projects.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">
            No projects available.
          </p>
        ) : (
          projects.map((project) => (
            <label
              key={project.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(project.id)}
                onChange={() => toggle(project.id)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">
                  {project.name}
                </span>
                {project.project_number ? (
                  <span className="block text-xs text-slate-400">
                    {project.project_number}
                  </span>
                ) : null}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
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
        <div>
          <div className="text-sm font-semibold text-slate-500">{label}</div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
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
        {saving ? <Loader2 size={16} className="animate-spin" /> : null}
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

function RoleBadge({
  label,
  blue = false,
}: {
  label: string;
  blue?: boolean;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        blue
          ? "bg-blue-100 text-blue-700"
          : "bg-slate-100 text-slate-700"
      }`}
    >
      {label}
    </span>
  );
}
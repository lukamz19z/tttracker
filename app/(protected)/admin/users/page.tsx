"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  BriefcaseBusiness,
  KeyRound,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  UserPlus,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type WebsiteRole = "admin" | "editor" | "viewer";
type MobileRole = "admin" | "leading_hand" | "mechanic" | "crew";

type Employee = {
  id: string;
  full_name: string;
  role: string | null;
  crew_id: string | null;
  active: boolean | null;
  user_id: string | null;
  shirt_size?: string | null;
  jacket_size?: string | null;
  glove_size?: string | null;
  pants_size?: string | null;
};

type Crew = {
  id: string;
  crew_number: string;
  crew_name: string | null;
  leading_hand: string | null;
  active: boolean | null;
};

type Project = {
  id: string;
  name: string;
  project_number: string | null;
  location: string | null;
  status: string | null;
};

type ProjectAccess = {
  project_id: string;
  role: WebsiteRole;
};

type AdminUser = {
  user_id: string;
  email: string;
  website_role: WebsiteRole;
  mobile_role: MobileRole;
  created_at: string | null;
  last_sign_in_at: string | null;
  employee: Employee | null;
  project_access: ProjectAccess[];
};

type UsersResponse = {
  users: AdminUser[];
  employees: Employee[];
  crews: Crew[];
  projects: Project[];
};

type UserFormState = {
  email: string;
  password: string;
  websiteRole: WebsiteRole;
  mobileRole: MobileRole;
  employeeId: string;
  crewId: string;
  projectIds: string[];
};

const EMPTY_FORM: UserFormState = {
  email: "",
  password: "",
  websiteRole: "viewer",
  mobileRole: "crew",
  employeeId: "",
  crewId: "",
  projectIds: [],
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function roleLabel(role: WebsiteRole | MobileRole) {
  return role.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AdminUsersPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [checkingRole, setCheckingRole] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<UserFormState>(EMPTY_FORM);

  const [editWebsiteRole, setEditWebsiteRole] =
    useState<WebsiteRole>("viewer");
  const [editMobileRole, setEditMobileRole] =
    useState<MobileRole>("crew");
  const [editEmployeeId, setEditEmployeeId] = useState("");
  const [editCrewId, setEditCrewId] = useState("");
  const [editProjectIds, setEditProjectIds] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");

  const selectedUser =
    users.find((user) => user.user_id === selectedUserId) ?? null;

  const apiFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your session has expired. Sign in again.");
      }

      return fetch(input, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${session.access_token}`,
        },
      });
    },
    [supabase],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const response = await apiFetch("/api/admin/users");

      const payload = (await response.json()) as UsersResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load users.");
      }

      setUsers(payload.users ?? []);
      setEmployees(payload.employees ?? []);
      setCrews(payload.crews ?? []);
      setProjects(payload.projects ?? []);

      setSelectedUserId((current) => {
        if (current && payload.users.some((user) => user.user_id === current)) {
          return current;
        }
        return payload.users[0]?.user_id ?? null;
      });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to load user data.",
      );
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  const checkRoleAndLoad = useCallback(async () => {
    setCheckingRole(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (String(data?.role ?? "").toLowerCase() !== "admin") {
      router.push("/");
      return;
    }

    setCheckingRole(false);
    await loadAll();
  }, [loadAll, router, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkRoleAndLoad();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [checkRoleAndLoad]);

  useEffect(() => {
    if (!selectedUser) return;

    setEditWebsiteRole(selectedUser.website_role);
    setEditMobileRole(selectedUser.mobile_role);
    setEditEmployeeId(selectedUser.employee?.id ?? "");
    setEditCrewId(selectedUser.employee?.crew_id ?? "");
    setEditProjectIds(
      selectedUser.project_access.map((access) => access.project_id),
    );
    setNewPassword("");
  }, [selectedUser]);

  const unlinkedEmployees = useMemo(
    () => employees.filter((employee) => !employee.user_id),
    [employees],
  );

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;

    return users.filter((user) =>
      [
        user.email,
        user.website_role,
        user.mobile_role,
        user.employee?.full_name,
        user.employee?.role,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [search, users]);

  function toggleCreateProject(projectId: string) {
    setCreateForm((current) => ({
      ...current,
      projectIds: current.projectIds.includes(projectId)
        ? current.projectIds.filter((id) => id !== projectId)
        : [...current.projectIds, projectId],
    }));
  }

  function toggleEditProject(projectId: string) {
    setEditProjectIds((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId],
    );
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await apiFetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: createForm.email,
          password: createForm.password,
          website_role: createForm.websiteRole,
          mobile_role: createForm.mobileRole,
          employee_id: createForm.employeeId || null,
          crew_id: createForm.crewId || null,
          project_ids: createForm.projectIds,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create user.");
      }

      setCreateForm(EMPTY_FORM);
      setMessage("User created and linked successfully.");
      await loadAll();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to create user.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveSelectedUser() {
    if (!selectedUser) return;

    setSaving(true);
    setMessage("");

    try {
      const response = await apiFetch("/api/admin/update-user-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: selectedUser.user_id,
          website_role: editWebsiteRole,
          mobile_role: editMobileRole,
          employee_id: editEmployeeId || null,
          crew_id: editCrewId || null,
          project_ids: editProjectIds,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update user.");
      }

      setMessage("User access and profile link updated.");
      await loadAll();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to update user.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updatePassword() {
    if (!selectedUser || !newPassword.trim()) {
      setMessage("Enter a new password.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await apiFetch("/api/admin/update-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: selectedUser.user_id,
          password: newPassword,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update password.");
      }

      setNewPassword("");
      setMessage("Password updated.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to update password.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (checkingRole) {
    return (
      <AppShell>
        <div className="p-6 text-sm text-slate-500">
          Checking permissions...
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <Link
                href="/admin"
                className="mb-4 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-slate-50"
              >
                ← Back to Admin Centre
              </Link>

              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-900 p-3 text-white">
                  <Users size={22} />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">
                    User & Mobile Access
                  </h1>
                  <p className="mt-1 text-slate-500">
                    Create accounts, link employees, assign website and mobile
                    roles, crews and project access.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void loadAll()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold hover:bg-slate-200 disabled:opacity-60"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>

          {message ? (
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              {message}
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            icon={<Users size={18} />}
            label="Active accounts"
            value={users.length}
          />
          <SummaryCard
            icon={<BriefcaseBusiness size={18} />}
            label="Unlinked employees"
            value={unlinkedEmployees.length}
          />
          <SummaryCard
            icon={<Smartphone size={18} />}
            label="Mobile admins"
            value={users.filter((user) => user.mobile_role === "admin").length}
          />
          <SummaryCard
            icon={<ShieldCheck size={18} />}
            label="Website admins"
            value={users.filter((user) => user.website_role === "admin").length}
          />
        </section>

        <div className="grid gap-6 xl:grid-cols-[430px_1fr]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <UserPlus size={19} />
                <h2 className="text-xl font-bold">Create User</h2>
              </div>

              <form onSubmit={createUser} className="mt-5 space-y-4">
                <Field
                  label="Email"
                  value={createForm.email}
                  onChange={(value) =>
                    setCreateForm((current) => ({
                      ...current,
                      email: value,
                    }))
                  }
                  type="email"
                  placeholder="name@company.com"
                />

                <Field
                  label="Temporary password"
                  value={createForm.password}
                  onChange={(value) =>
                    setCreateForm((current) => ({
                      ...current,
                      password: value,
                    }))
                  }
                  type="password"
                  placeholder="Minimum 8 characters"
                />

                <SelectField
                  label="Employee profile"
                  value={createForm.employeeId}
                  onChange={(value) => {
                    const employee = employees.find((item) => item.id === value);
                    setCreateForm((current) => ({
                      ...current,
                      employeeId: value,
                      crewId: employee?.crew_id ?? current.crewId,
                    }));
                  }}
                >
                  <option value="">No employee link</option>
                  {unlinkedEmployees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name} · {employee.role ?? "No position"}
                    </option>
                  ))}
                </SelectField>

                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label="Website role"
                    value={createForm.websiteRole}
                    onChange={(value) =>
                      setCreateForm((current) => ({
                        ...current,
                        websiteRole: value as WebsiteRole,
                      }))
                    }
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </SelectField>

                  <SelectField
                    label="Mobile role"
                    value={createForm.mobileRole}
                    onChange={(value) =>
                      setCreateForm((current) => ({
                        ...current,
                        mobileRole: value as MobileRole,
                      }))
                    }
                  >
                    <option value="crew">Crew</option>
                    <option value="leading_hand">Leading Hand</option>
                    <option value="mechanic">Mechanic</option>
                    <option value="admin">Admin</option>
                  </SelectField>
                </div>

                <SelectField
                  label="Crew"
                  value={createForm.crewId}
                  onChange={(value) =>
                    setCreateForm((current) => ({
                      ...current,
                      crewId: value,
                    }))
                  }
                >
                  <option value="">No crew allocation</option>
                  {crews
                    .filter((crew) => crew.active !== false)
                    .map((crew) => (
                      <option key={crew.id} value={crew.id}>
                        Crew {crew.crew_number}
                        {crew.crew_name ? ` · ${crew.crew_name}` : ""}
                      </option>
                    ))}
                </SelectField>

                <ProjectChecks
                  projects={projects}
                  selectedIds={createForm.projectIds}
                  onToggle={toggleCreateProject}
                />

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Create & Link User"}
                </button>
              </form>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold">Users</h2>

              <div className="relative mt-4">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, email or role..."
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
                />
              </div>

              <div className="mt-4 max-h-[680px] space-y-2 overflow-auto pr-1">
                {loading ? (
                  <div className="p-4 text-sm text-slate-500">
                    Loading users...
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500">
                    No users found.
                  </div>
                ) : (
                  filteredUsers.map((user) => (
                    <button
                      key={user.user_id}
                      type="button"
                      onClick={() => setSelectedUserId(user.user_id)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        selectedUserId === user.user_id
                          ? "border-slate-900 bg-slate-50"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="font-semibold text-slate-900">
                        {user.employee?.full_name ?? user.email}
                      </div>
                      <div className="mt-1 truncate text-xs text-slate-500">
                        {user.email}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <RolePill kind="website" role={user.website_role} />
                        <RolePill kind="mobile" role={user.mobile_role} />
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          {user.project_access.length} projects
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            {!selectedUser ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-500 shadow-sm">
                Select a user to manage their linked employee profile and
                access.
              </section>
            ) : (
              <>
                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <BadgeCheck size={20} className="text-emerald-600" />
                        <h2 className="text-2xl font-bold">
                          {selectedUser.employee?.full_name ??
                            selectedUser.email}
                        </h2>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedUser.email}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Created {formatDate(selectedUser.created_at)} · Last sign
                        in {formatDate(selectedUser.last_sign_in_at)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <RolePill
                        kind="website"
                        role={selectedUser.website_role}
                      />
                      <RolePill kind="mobile" role={selectedUser.mobile_role} />
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <SelectField
                      label="Linked employee"
                      value={editEmployeeId}
                      onChange={(value) => {
                        const employee = employees.find(
                          (item) => item.id === value,
                        );
                        setEditEmployeeId(value);
                        setEditCrewId(employee?.crew_id ?? "");
                      }}
                    >
                      <option value="">No employee link</option>
                      {employees
                        .filter(
                          (employee) =>
                            !employee.user_id ||
                            employee.user_id === selectedUser.user_id,
                        )
                        .map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.full_name} ·{" "}
                            {employee.role ?? "No position"}
                          </option>
                        ))}
                    </SelectField>

                    <SelectField
                      label="Crew"
                      value={editCrewId}
                      onChange={setEditCrewId}
                    >
                      <option value="">No crew allocation</option>
                      {crews.map((crew) => (
                        <option key={crew.id} value={crew.id}>
                          Crew {crew.crew_number}
                          {crew.crew_name ? ` · ${crew.crew_name}` : ""}
                        </option>
                      ))}
                    </SelectField>

                    <SelectField
                      label="Website role"
                      value={editWebsiteRole}
                      onChange={(value) =>
                        setEditWebsiteRole(value as WebsiteRole)
                      }
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </SelectField>

                    <SelectField
                      label="Mobile role"
                      value={editMobileRole}
                      onChange={(value) =>
                        setEditMobileRole(value as MobileRole)
                      }
                    >
                      <option value="crew">Crew</option>
                      <option value="leading_hand">Leading Hand</option>
                      <option value="mechanic">Mechanic</option>
                      <option value="admin">Admin</option>
                    </SelectField>
                  </div>

                  {selectedUser.employee ? (
                    <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-4">
                      <ProfileDatum
                        label="Position"
                        value={selectedUser.employee.role ?? "—"}
                      />
                      <ProfileDatum
                        label="Shirt"
                        value={selectedUser.employee.shirt_size ?? "—"}
                      />
                      <ProfileDatum
                        label="Jacket"
                        value={selectedUser.employee.jacket_size ?? "—"}
                      />
                      <ProfileDatum
                        label="Gloves / Pants"
                        value={[
                          selectedUser.employee.glove_size,
                          selectedUser.employee.pants_size,
                        ]
                          .filter(Boolean)
                          .join(" / ") || "—"}
                      />
                    </div>
                  ) : null}

                  <div className="mt-6">
                    <ProjectChecks
                      projects={projects}
                      selectedIds={editProjectIds}
                      onToggle={toggleEditProject}
                    />
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void saveSelectedUser()}
                      disabled={saving}
                      className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {saving ? "Saving..." : "Save User Access"}
                    </button>
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-2">
                    <KeyRound size={19} />
                    <h2 className="text-xl font-bold">Password Reset</h2>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <input
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      type="password"
                      placeholder="Enter a new password"
                      className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void updatePassword()}
                      disabled={saving}
                      className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      Update Password
                    </button>
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-bold">
                    Mobile Profile Connection
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    The mobile profile will use this linked employee record.
                    Employees can later update approved non-sensitive details
                    such as clothing sizes and contact preferences, while their
                    role, crew, licences and competencies remain controlled by
                    authorised website users.
                  </p>

                  <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                    Tickets and licences should be displayed from your existing
                    training or competency tables. Do not duplicate them in the
                    mobile app; the app should read the same live records used
                    by the employee page.
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <div className="mt-3 text-3xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
      >
        {children}
      </select>
    </label>
  );
}

function ProjectChecks({
  projects,
  selectedIds,
  onToggle,
}: {
  projects: Project[];
  selectedIds: string[];
  onToggle: (projectId: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-semibold text-slate-500">
        Project access
      </legend>
      <div className="mt-2 max-h-56 space-y-2 overflow-auto rounded-2xl border border-slate-200 p-3">
        {projects.length === 0 ? (
          <p className="text-sm text-slate-500">No projects available.</p>
        ) : (
          projects.map((project) => (
            <label
              key={project.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(project.id)}
                onChange={() => onToggle(project.id)}
                className="mt-1 h-4 w-4 rounded border-slate-300"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">
                  {project.project_number
                    ? `${project.project_number} · ${project.name}`
                    : project.name}
                </span>
                <span className="block text-xs text-slate-500">
                  {project.location ?? "Location not set"} ·{" "}
                  {project.status ?? "Status not set"}
                </span>
              </span>
            </label>
          ))
        )}
      </div>
    </fieldset>
  );
}

function RolePill({
  kind,
  role,
}: {
  kind: "website" | "mobile";
  role: WebsiteRole | MobileRole;
}) {
  const classes =
    kind === "website"
      ? "bg-blue-100 text-blue-700"
      : "bg-violet-100 text-violet-700";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${classes}`}
    >
      {kind === "website" ? "Web" : "App"} · {roleLabel(role)}
    </span>
  );
}

function ProfileDatum({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

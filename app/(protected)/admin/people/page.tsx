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
  Download,
  KeyRound,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type WebsiteRole = "admin" | "editor" | "viewer";
type MobileRole = "admin" | "leading_hand" | "mechanic" | "crew";
type StatusFilter = "all" | "active" | "inactive";
type AccountFilter = "all" | "linked" | "unlinked";

type Employee = {
  id: string;
  full_name: string;
  role: string | null;
  crew_id: string | null;
  active: boolean | null;
  user_id: string | null;
  notes: string | null;
  shirt_size: string | null;
  jacket_size: string | null;
  glove_size: string | null;
  pants_size: string | null;
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
  website_role?: WebsiteRole;
  mobile_role?: MobileRole;
  created_at: string | null;
  last_sign_in_at: string | null;
  employee: Employee | null;
  project_access?: ProjectAccess[];
};

type UsersResponse = {
  users: AdminUser[];
  employees: Employee[];
  crews: Crew[];
  projects: Project[];
};

type PersonRecord = {
  key: string;
  employee: Employee;
  user: AdminUser | null;
};

type PersonForm = {
  fullName: string;
  role: string;
  crewId: string;
  active: boolean;
  notes: string;
  shirtSize: string;
  jacketSize: string;
  gloveSize: string;
  pantsSize: string;
  email: string;
  password: string;
  websiteRole: WebsiteRole;
  mobileRole: MobileRole;
  projectIds: string[];
};

const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
const JACKET_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
const GLOVE_SIZES = ["S", "M", "L", "XL", "2XL"];

const EMPTY_FORM: PersonForm = {
  fullName: "",
  role: "",
  crewId: "",
  active: true,
  notes: "",
  shirtSize: "",
  jacketSize: "",
  gloveSize: "",
  pantsSize: "",
  email: "",
  password: "",
  websiteRole: "viewer",
  mobileRole: "crew",
  projectIds: [],
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-AU");
}

function roleLabel(role?: WebsiteRole | MobileRole | null): string {
  if (!role) return "Not assigned";

  return String(role)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function hasMissingPpe(employee: Employee): boolean {
  return (
    !clean(employee.shirt_size) ||
    !clean(employee.jacket_size) ||
    !clean(employee.glove_size) ||
    !clean(employee.pants_size)
  );
}

function csvSafe(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function AdminPeoplePage() {
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [crewFilter, setCrewFilter] = useState("");

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null,
  );
  const [form, setForm] = useState<PersonForm>(EMPTY_FORM);
  const [createMode, setCreateMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

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
        throw new Error(payload.error ?? "Failed to load people.");
      }

      const normalisedUsers = (payload.users ?? []).map((user) => ({
        ...user,
        project_access: Array.isArray(user.project_access)
          ? user.project_access
          : [],
      }));

      setUsers(normalisedUsers);
      setEmployees(payload.employees ?? []);
      setCrews(payload.crews ?? []);
      setProjects(payload.projects ?? []);

      setSelectedEmployeeId((current) => {
        if (
          current &&
          (payload.employees ?? []).some((employee) => employee.id === current)
        ) {
          return current;
        }

        return (payload.employees ?? [])[0]?.id ?? null;
      });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to load people.",
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

  const people = useMemo<PersonRecord[]>(() => {
    return employees.map((employee) => ({
      key: employee.id,
      employee,
      user:
        users.find(
          (user) =>
            user.user_id === employee.user_id ||
            user.employee?.id === employee.id,
        ) ?? null,
    }));
  }, [employees, users]);

  const selectedPerson =
    people.find((person) => person.employee.id === selectedEmployeeId) ?? null;

  useEffect(() => {
    if (!selectedPerson || createMode) return;

    const { employee, user } = selectedPerson;

    setForm({
      fullName: employee.full_name ?? "",
      role: employee.role ?? "",
      crewId: employee.crew_id ?? "",
      active: employee.active !== false,
      notes: employee.notes ?? "",
      shirtSize: employee.shirt_size ?? "",
      jacketSize: employee.jacket_size ?? "",
      gloveSize: employee.glove_size ?? "",
      pantsSize: employee.pants_size ?? "",
      email: user?.email ?? "",
      password: "",
      websiteRole: user?.website_role ?? "viewer",
      mobileRole: user?.mobile_role ?? "crew",
      projectIds: (user?.project_access ?? []).map(
        (access) => access.project_id,
      ),
    });

    setNewPassword("");
    setDeleteConfirm("");
    setDeleteOpen(false);
  }, [createMode, selectedPerson]);

  const activeCount = people.filter(
    (person) => person.employee.active !== false,
  ).length;
  const inactiveCount = people.length - activeCount;
  const noAccountCount = people.filter((person) => !person.user).length;
  const missingPpeCount = people.filter(
    (person) =>
      person.employee.active !== false && hasMissingPpe(person.employee),
  ).length;

  const crewLabel = useCallback(
    (crewId: string | null) => {
      if (!crewId) return "Unassigned";
      const crew = crews.find((item) => item.id === crewId);
      if (!crew) return "Unassigned";

      return `${crew.crew_number}${
        crew.crew_name ? ` - ${crew.crew_name}` : ""
      }`;
    },
    [crews],
  );

  const filteredPeople = useMemo(() => {
    const term = search.trim().toLowerCase();

    return people.filter(({ employee, user }) => {
      const isActive = employee.active !== false;
      const searchable = [
        employee.full_name,
        employee.role,
        employee.notes,
        user?.email,
        user?.website_role,
        user?.mobile_role,
        crewLabel(employee.crew_id),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const statusMatches =
        statusFilter === "all" ||
        (statusFilter === "active" && isActive) ||
        (statusFilter === "inactive" && !isActive);

      const accountMatches =
        accountFilter === "all" ||
        (accountFilter === "linked" && Boolean(user)) ||
        (accountFilter === "unlinked" && !user);

      const crewMatches =
        !crewFilter || employee.crew_id === crewFilter;

      return (
        searchable.includes(term) &&
        statusMatches &&
        accountMatches &&
        crewMatches
      );
    });
  }, [
    accountFilter,
    crewFilter,
    crewLabel,
    people,
    search,
    statusFilter,
  ]);

  function startCreate() {
    setCreateMode(true);
    setSelectedEmployeeId(null);
    setForm(EMPTY_FORM);
    setNewPassword("");
    setDeleteOpen(false);
    setDeleteConfirm("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelCreate() {
    setCreateMode(false);
    setSelectedEmployeeId(people[0]?.employee.id ?? null);
  }

  function selectPerson(employeeId: string) {
    setCreateMode(false);
    setSelectedEmployeeId(employeeId);
  }

  function toggleProject(projectId: string) {
    setForm((current) => ({
      ...current,
      projectIds: current.projectIds.includes(projectId)
        ? current.projectIds.filter((id) => id !== projectId)
        : [...current.projectIds, projectId],
    }));
  }

  async function savePerson(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!form.fullName.trim()) {
      setMessage("Enter the person's full name.");
      return;
    }

    if (createMode && form.email.trim() && form.password.trim().length < 8) {
      setMessage("Temporary password must be at least 8 characters.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      if (createMode) {
        const duplicate = employees.some(
          (employee) =>
            employee.full_name.trim().toLowerCase() ===
            form.fullName.trim().toLowerCase(),
        );

        if (duplicate) {
          throw new Error("A person with this name already exists.");
        }

        const { data: createdEmployee, error: employeeError } = await supabase
          .from("employees")
          .insert({
            full_name: form.fullName.trim(),
            role: form.role.trim() || null,
            crew_id: form.crewId || null,
            active: form.active,
            notes: form.notes.trim() || null,
            shirt_size: form.shirtSize || null,
            jacket_size: form.jacketSize || null,
            glove_size: form.gloveSize || null,
            pants_size: form.pantsSize.trim() || null,
          })
          .select("id")
          .single();

        if (employeeError || !createdEmployee) {
          throw employeeError ?? new Error("Could not create employee.");
        }

        if (form.email.trim()) {
          const response = await apiFetch("/api/admin/create-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: form.email.trim(),
              password: form.password,
              website_role: form.websiteRole,
              mobile_role: form.mobileRole,
              employee_id: createdEmployee.id,
              crew_id: form.crewId || null,
              project_ids: form.projectIds,
            }),
          });

          const payload = (await response.json()) as { error?: string };

          if (!response.ok) {
            await supabase
              .from("employees")
              .delete()
              .eq("id", createdEmployee.id);
            throw new Error(payload.error ?? "Failed to create user account.");
          }
        }

        setMessage("Person created successfully.");
        setCreateMode(false);
        await loadAll();
        setSelectedEmployeeId(createdEmployee.id);
        return;
      }

      if (!selectedPerson) {
        throw new Error("Select a person first.");
      }

      const { error: employeeError } = await supabase
        .from("employees")
        .update({
          full_name: form.fullName.trim(),
          role: form.role.trim() || null,
          crew_id: form.crewId || null,
          active: form.active,
          notes: form.notes.trim() || null,
          shirt_size: form.shirtSize || null,
          jacket_size: form.jacketSize || null,
          glove_size: form.gloveSize || null,
          pants_size: form.pantsSize.trim() || null,
        })
        .eq("id", selectedPerson.employee.id);

      if (employeeError) throw employeeError;

      if (selectedPerson.user) {
        const response = await apiFetch("/api/admin/update-user-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: selectedPerson.user.user_id,
            website_role: form.websiteRole,
            mobile_role: form.mobileRole,
            employee_id: selectedPerson.employee.id,
            crew_id: form.crewId || null,
            project_ids: form.projectIds,
          }),
        });

        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to update user access.");
        }
      } else if (form.email.trim()) {
        if (form.password.trim().length < 8) {
          throw new Error(
            "Enter a temporary password of at least 8 characters to create the account.",
          );
        }

        const response = await apiFetch("/api/admin/create-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: form.email.trim(),
            password: form.password,
            website_role: form.websiteRole,
            mobile_role: form.mobileRole,
            employee_id: selectedPerson.employee.id,
            crew_id: form.crewId || null,
            project_ids: form.projectIds,
          }),
        });

        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to create user account.");
        }
      }

      setMessage("Person details and access updated.");
      await loadAll();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to save person.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updatePassword() {
    if (!selectedPerson?.user || newPassword.trim().length < 8) {
      setMessage("Enter a new password of at least 8 characters.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await apiFetch("/api/admin/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: selectedPerson.user.user_id,
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

  async function permanentlyDeletePerson() {
    if (!selectedPerson) return;

    if (deleteConfirm.trim().toUpperCase() !== "DELETE") {
      setMessage("Type DELETE to confirm permanent removal.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await apiFetch("/api/admin/delete-person", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: selectedPerson.employee.id,
          user_id: selectedPerson.user?.user_id ?? null,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete person.");
      }

      setDeleteOpen(false);
      setDeleteConfirm("");
      setSelectedEmployeeId(null);
      setMessage("Person permanently deleted.");
      await loadAll();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to delete person.",
      );
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const headers = [
      "Name",
      "Email",
      "Role",
      "Crew",
      "Status",
      "Website Role",
      "Mobile Role",
      "Projects",
      "Shirt",
      "Jacket",
      "Gloves",
      "Pants",
      "Notes",
    ];

    const rows = filteredPeople.map(({ employee, user }) => [
      employee.full_name,
      user?.email ?? "",
      employee.role ?? "",
      crewLabel(employee.crew_id),
      employee.active !== false ? "Active" : "Inactive",
      user?.website_role ?? "",
      user?.mobile_role ?? "",
      String((user?.project_access ?? []).length),
      employee.shirt_size ?? "",
      employee.jacket_size ?? "",
      employee.glove_size ?? "",
      employee.pants_size ?? "",
      employee.notes ?? "",
    ]);

    const csv = [
      headers.map(csvSafe).join(","),
      ...rows.map((row) => row.map(csvSafe).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `people-register-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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

  const editingPerson = createMode ? null : selectedPerson;

  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px] space-y-6">
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
                  <h1 className="text-3xl font-bold tracking-tight">People</h1>
                  <p className="mt-1 text-slate-500">
                    One place for employee details, PPE sizing, crews, account
                    access, mobile roles and project permissions.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportCsv}
                disabled={filteredPeople.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
              >
                <Download size={16} />
                Export
              </button>

              <button
                type="button"
                onClick={() => void loadAll()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw size={16} />
                Refresh
              </button>

              <button
                type="button"
                onClick={startCreate}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <UserPlus size={16} />
                Add Person
              </button>
            </div>
          </div>

          {message ? (
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              {message}
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard icon={<Users size={18} />} label="Total people" value={people.length} />
          <SummaryCard icon={<BadgeCheck size={18} />} label="Active" value={activeCount} />
          <SummaryCard icon={<UserX size={18} />} label="Inactive" value={inactiveCount} />
          <SummaryCard icon={<Smartphone size={18} />} label="No account" value={noAccountCount} />
          <SummaryCard icon={<BriefcaseBusiness size={18} />} label="Missing PPE" value={missingPpeCount} />
        </section>

        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">People Register</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {filteredPeople.length} of {people.length} people shown
                </p>
              </div>
            </div>

            <div className="relative mt-4">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email, role or crew..."
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
              />
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>

              <select
                value={accountFilter}
                onChange={(event) =>
                  setAccountFilter(event.target.value as AccountFilter)
                }
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="all">All accounts</option>
                <option value="linked">Has login</option>
                <option value="unlinked">No login</option>
              </select>

              <select
                value={crewFilter}
                onChange={(event) => setCrewFilter(event.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="">All crews</option>
                {crews.map((crew) => (
                  <option key={crew.id} value={crew.id}>
                    {crew.crew_number}
                    {crew.crew_name ? ` · ${crew.crew_name}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 max-h-[900px] space-y-2 overflow-auto pr-1">
              {loading ? (
                <div className="p-4 text-sm text-slate-500">Loading people...</div>
              ) : filteredPeople.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">No people found.</div>
              ) : (
                filteredPeople.map(({ employee, user }) => (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => selectPerson(employee.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      !createMode && selectedEmployeeId === employee.id
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900">
                          {employee.full_name}
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-500">
                          {user?.email ?? "No login account"}
                        </div>
                      </div>

                      <StatusPill active={employee.active !== false} />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {employee.role ?? "No role"}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {crewLabel(employee.crew_id)}
                      </span>
                      {user ? (
                        <>
                          <RolePill kind="website" role={user.website_role} />
                          <RolePill kind="mobile" role={user.mobile_role} />
                        </>
                      ) : null}
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <form onSubmit={savePerson} className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-2xl font-bold">
                    {createMode
                      ? "Add Person"
                      : editingPerson?.employee.full_name ?? "Select a person"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {createMode
                      ? "Create the employee profile and optionally create their login."
                      : editingPerson?.user
                        ? `Last sign in ${formatDate(editingPerson.user.last_sign_in_at)}`
                        : "This person does not currently have a login account."}
                  </p>
                </div>

                {createMode ? (
                  <button
                    type="button"
                    onClick={cancelCreate}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                ) : editingPerson ? (
                  <StatusPill active={editingPerson.employee.active !== false} />
                ) : null}
              </div>

              {createMode || editingPerson ? (
                <>
                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <Field
                      label="Full name"
                      value={form.fullName}
                      onChange={(value) =>
                        setForm((current) => ({ ...current, fullName: value }))
                      }
                    />

                    <Field
                      label="Role / trade"
                      value={form.role}
                      onChange={(value) =>
                        setForm((current) => ({ ...current, role: value }))
                      }
                      placeholder="Rigger, Crane Operator, Supervisor..."
                    />

                    <SelectField
                      label="Crew"
                      value={form.crewId}
                      onChange={(value) =>
                        setForm((current) => ({ ...current, crewId: value }))
                      }
                    >
                      <option value="">Unassigned</option>
                      {crews
                        .filter((crew) => crew.active !== false)
                        .map((crew) => (
                          <option key={crew.id} value={crew.id}>
                            {crew.crew_number}
                            {crew.crew_name ? ` · ${crew.crew_name}` : ""}
                          </option>
                        ))}
                    </SelectField>

                    <SelectField
                      label="Status"
                      value={form.active ? "active" : "inactive"}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          active: value === "active",
                        }))
                      }
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </SelectField>
                  </div>

                  {!form.active ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      Inactive people remain in historical records but should be
                      excluded from future expiry warnings, active selectors,
                      crew lists and compliance reminders.
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <TextArea
                      label="Notes"
                      value={form.notes}
                      onChange={(value) =>
                        setForm((current) => ({ ...current, notes: value }))
                      }
                    />
                  </div>
                </>
              ) : (
                <p className="mt-6 text-sm text-slate-500">
                  Select a person from the register or add a new person.
                </p>
              )}
            </section>

            {createMode || editingPerson ? (
              <>
                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-bold">PPE & Uniform Sizing</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Used by the inventory module for live stock planning.
                  </p>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <SelectField
                      label="Shirt size"
                      value={form.shirtSize}
                      onChange={(value) =>
                        setForm((current) => ({ ...current, shirtSize: value }))
                      }
                    >
                      <option value="">Not recorded</option>
                      {SHIRT_SIZES.map((size) => (
                        <option key={size}>{size}</option>
                      ))}
                    </SelectField>

                    <SelectField
                      label="Jacket size"
                      value={form.jacketSize}
                      onChange={(value) =>
                        setForm((current) => ({ ...current, jacketSize: value }))
                      }
                    >
                      <option value="">Not recorded</option>
                      {JACKET_SIZES.map((size) => (
                        <option key={size}>{size}</option>
                      ))}
                    </SelectField>

                    <SelectField
                      label="Glove size"
                      value={form.gloveSize}
                      onChange={(value) =>
                        setForm((current) => ({ ...current, gloveSize: value }))
                      }
                    >
                      <option value="">Not recorded</option>
                      {GLOVE_SIZES.map((size) => (
                        <option key={size}>{size}</option>
                      ))}
                    </SelectField>

                    <Field
                      label="Pants size"
                      value={form.pantsSize}
                      onChange={(value) =>
                        setForm((current) => ({ ...current, pantsSize: value }))
                      }
                      placeholder="87R, 92, 97L..."
                    />
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={19} />
                    <h2 className="text-xl font-bold">Account & Access</h2>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <Field
                      label={editingPerson?.user ? "Email" : "Email (optional)"}
                      value={form.email}
                      onChange={(value) =>
                        setForm((current) => ({ ...current, email: value }))
                      }
                      type="email"
                      disabled={Boolean(editingPerson?.user)}
                    />

                    {!editingPerson?.user ? (
                      <Field
                        label="Temporary password"
                        value={form.password}
                        onChange={(value) =>
                          setForm((current) => ({ ...current, password: value }))
                        }
                        type="password"
                        placeholder="Minimum 8 characters"
                      />
                    ) : (
                      <ProfileDatum
                        label="Account created"
                        value={formatDate(editingPerson.user.created_at)}
                      />
                    )}

                    <SelectField
                      label="Website role"
                      value={form.websiteRole}
                      onChange={(value) =>
                        setForm((current) => ({
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
                      value={form.mobileRole}
                      onChange={(value) =>
                        setForm((current) => ({
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

                  <div className="mt-6">
                    <ProjectChecks
                      projects={projects}
                      selectedIds={form.projectIds}
                      onToggle={toggleProject}
                    />
                  </div>
                </section>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {saving
                      ? "Saving..."
                      : createMode
                        ? "Create Person"
                        : "Save Changes"}
                  </button>
                </div>
              </>
            ) : null}

            {!createMode && editingPerson?.user ? (
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
            ) : null}

            {!createMode && editingPerson ? (
              <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
                <div className="flex items-center gap-2 text-rose-800">
                  <Trash2 size={19} />
                  <h2 className="text-xl font-bold">Danger Zone</h2>
                </div>

                <p className="mt-2 text-sm leading-6 text-rose-700">
                  Deactivate people who have left the business. Permanent
                  deletion should only be used for duplicate, test or incorrect
                  records. Historical dockets and prestarts retain their stored
                  names.
                </p>

                {!deleteOpen ? (
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                    className="mt-4 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    Delete Person Permanently
                  </button>
                ) : (
                  <div className="mt-4 rounded-2xl border border-rose-300 bg-white p-4">
                    <p className="text-sm font-semibold text-rose-800">
                      Type DELETE to permanently remove{" "}
                      {editingPerson.employee.full_name}.
                    </p>

                    <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                      <input
                        value={deleteConfirm}
                        onChange={(event) => setDeleteConfirm(event.target.value)}
                        placeholder="DELETE"
                        className="min-w-0 flex-1 rounded-xl border border-rose-300 px-3 py-2.5 text-sm"
                      />

                      <button
                        type="button"
                        onClick={() => void permanentlyDeletePerson()}
                        disabled={
                          saving ||
                          deleteConfirm.trim().toUpperCase() !== "DELETE"
                        }
                        className="rounded-xl bg-rose-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
                      >
                        Permanently Delete
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDeleteOpen(false);
                          setDeleteConfirm("");
                        }}
                        className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>
            ) : null}
          </form>
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
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
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
        disabled={disabled}
        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-100 disabled:text-slate-500"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-500">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
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

      <div className="mt-2 max-h-64 space-y-2 overflow-auto rounded-2xl border border-slate-200 p-3">
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
  role?: WebsiteRole | MobileRole | null;
}) {
  const classes =
    kind === "website"
      ? "bg-blue-100 text-blue-700"
      : "bg-violet-100 text-violet-700";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}
    >
      {kind === "website" ? "Web" : "App"} · {roleLabel(role)}
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
        active
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-200 text-slate-600"
      }`}
    >
      {active ? "Active" : "Inactive"}
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
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

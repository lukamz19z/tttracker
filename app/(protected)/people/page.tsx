"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Download,
  Edit3,
  ExternalLink,
  HardHat,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Shirt,
  UserCheck,
  UserMinus,
  UserRoundX,
  Users,
  UsersRound,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

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
  created_at?: string | null;
};

type Crew = {
  id: string;
  crew_number: string | null;
  crew_name: string | null;
  leading_hand: string | null;
  active: boolean | null;
};

type ApiUser = {
  user_id?: string | null;
  id?: string | null;
  email?: string | null;
  employee?: { id?: string | null; full_name?: string | null } | null;
  employee_id?: string | null;
  employee_name?: string | null;
};

type UsersResponse = {
  users?: ApiUser[];
  error?: string;
};

type LoginAccount = {
  userId: string;
  email: string;
  linkedEmployeeId: string | null;
  linkedEmployeeName: string | null;
};

type EmployeeForm = {
  fullName: string;
  role: string;
  crewId: string;
  active: boolean;
  notes: string;
  shirtSize: string;
  jacketSize: string;
  gloveSize: string;
  pantsSize: string;
  userId: string;
};

const EMPTY_FORM: EmployeeForm = {
  fullName: "",
  role: "",
  crewId: "",
  active: true,
  notes: "",
  shirtSize: "",
  jacketSize: "",
  gloveSize: "",
  pantsSize: "",
  userId: "",
};

const SHIRT_SIZES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
];

const JACKET_SIZES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
];

const GLOVE_SIZES = ["S", "M", "L", "XL", "2XL"];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function csvSafe(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function crewLabel(crew: Crew | null | undefined) {
  if (!crew) return "Unassigned";

  const number = clean(crew.crew_number);
  const name = clean(crew.crew_name);

  if (number && name) return `Crew ${number} · ${name}`;
  if (number) return `Crew ${number}`;
  if (name) return name;

  return "Unassigned";
}

function hasCompletePpe(employee: Employee) {
  return Boolean(
    clean(employee.shirt_size) &&
      clean(employee.jacket_size) &&
      clean(employee.glove_size) &&
      clean(employee.pants_size),
  );
}

function mapApiUser(user: ApiUser): LoginAccount | null {
  const userId = clean(user.user_id ?? user.id);
  if (!userId) return null;

  return {
    userId,
    email: clean(user.email) || "Email not available",
    linkedEmployeeId:
      clean(user.employee?.id) || clean(user.employee_id) || null,
    linkedEmployeeName:
      clean(user.employee?.full_name) || clean(user.employee_name) || null,
  };
}

export default function PeoplePage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loginAccounts, setLoginAccounts] = useState<LoginAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("active");
  const [crewFilter, setCrewFilter] = useState("all");
  const [ppeFilter, setPpeFilter] = useState<
    "all" | "complete" | "missing"
  >("all");
  const [loginFilter, setLoginFilter] = useState<
    "all" | "linked" | "unlinked"
  >("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] =
    useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM);
  const [statusEmployee, setStatusEmployee] = useState<Employee | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const crewById = useMemo(
    () => new Map(crews.map((crew) => [crew.id, crew])),
    [crews],
  );

  const loginByUserId = useMemo(
    () => new Map(loginAccounts.map((account) => [account.userId, account])),
    [loginAccounts],
  );

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

  const loadLoginAccounts = useCallback(async () => {
    const response = await apiFetch("/api/admin/users");
    const payload = (await response.json()) as UsersResponse;

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to load login accounts.");
    }

    setLoginAccounts(
      (payload.users ?? [])
        .map(mapApiUser)
        .filter((account): account is LoginAccount => Boolean(account))
        .sort((a, b) => a.email.localeCompare(b.email)),
    );
  }, [apiFetch]);

  const loadData = useCallback(async () => {
    const [employeesResult, crewsResult] = await Promise.all([
      supabase
        .from("employees")
        .select(
          "id, full_name, role, crew_id, active, user_id, notes, shirt_size, jacket_size, glove_size, pants_size, created_at",
        )
        .order("full_name", { ascending: true }),
      supabase
        .from("crews")
        .select("id, crew_number, crew_name, leading_hand, active")
        .order("crew_number", { ascending: true }),
    ]);

    if (employeesResult.error) {
      throw new Error(employeesResult.error.message);
    }

    if (crewsResult.error) {
      throw new Error(crewsResult.error.message);
    }

    setEmployees((employeesResult.data ?? []) as Employee[]);
    setCrews((crewsResult.data ?? []) as Crew[]);

    try {
      await loadLoginAccounts();
    } catch (error) {
      console.warn("Login accounts could not be loaded", error);
      setLoginAccounts([]);
    }
  }, [loadLoginAccounts, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await loadData();
        } catch (error) {
          setMessage({
            tone: "error",
            text:
              error instanceof Error
                ? error.message
                : "Unable to load the people register.",
          });
        } finally {
          setLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  async function refreshData() {
    setRefreshing(true);
    setMessage(null);

    try {
      await loadData();
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to refresh the people register.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();

    return employees.filter((employee) => {
      const crew = crewById.get(clean(employee.crew_id));
      const login = employee.user_id
        ? loginByUserId.get(employee.user_id)
        : null;
      const active = employee.active !== false;
      const ppeComplete = hasCompletePpe(employee);
      const linked = Boolean(employee.user_id);

      if (statusFilter === "active" && !active) return false;
      if (statusFilter === "inactive" && active) return false;

      if (crewFilter === "unassigned" && employee.crew_id) return false;
      if (
        crewFilter !== "all" &&
        crewFilter !== "unassigned" &&
        clean(employee.crew_id) !== crewFilter
      ) {
        return false;
      }

      if (ppeFilter === "complete" && !ppeComplete) return false;
      if (ppeFilter === "missing" && ppeComplete) return false;

      if (loginFilter === "linked" && !linked) return false;
      if (loginFilter === "unlinked" && linked) return false;

      if (!query) return true;

      const searchable = [
        employee.full_name,
        employee.role,
        employee.notes,
        employee.shirt_size,
        employee.jacket_size,
        employee.glove_size,
        employee.pants_size,
        crewLabel(crew),
        login?.email,
        active ? "active" : "inactive",
        linked ? "linked login" : "no login",
      ]
        .map(clean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [
    crewById,
    crewFilter,
    loginByUserId,
    employees,
    loginFilter,
    ppeFilter,
    search,
    statusFilter,
  ]);

  const activeCount = employees.filter(
    (employee) => employee.active !== false,
  ).length;
  const inactiveCount = employees.length - activeCount;
  const noCrewCount = employees.filter(
    (employee) => employee.active !== false && !employee.crew_id,
  ).length;
  const noLoginCount = employees.filter(
    (employee) => employee.active !== false && !employee.user_id,
  ).length;
  const missingPpeCount = employees.filter(
    (employee) =>
      employee.active !== false && !hasCompletePpe(employee),
  ).length;

  const availableLoginAccounts = useMemo(() => {
    return loginAccounts.filter((account) => {
      if (account.userId === editingEmployee?.user_id) return true;
      return !account.linkedEmployeeId;
    });
  }, [editingEmployee?.user_id, loginAccounts]);

  function openCreate() {
    setEditingEmployee(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
    setMessage(null);
  }

  function openEdit(employee: Employee) {
    setEditingEmployee(employee);
    setForm({
      fullName: clean(employee.full_name),
      role: clean(employee.role),
      crewId: clean(employee.crew_id),
      active: employee.active !== false,
      notes: clean(employee.notes),
      shirtSize: clean(employee.shirt_size),
      jacketSize: clean(employee.jacket_size),
      gloveSize: clean(employee.glove_size),
      pantsSize: clean(employee.pants_size),
      userId: clean(employee.user_id),
    });
    setFormOpen(true);
    setMessage(null);
  }

  function closeForm() {
    if (saving) return;

    setFormOpen(false);
    setEditingEmployee(null);
    setForm(EMPTY_FORM);
  }

  async function saveEmployee() {
    setMessage(null);

    const fullName = form.fullName.trim();

    if (!fullName) {
      setMessage({
        tone: "error",
        text: "Enter the person's full name.",
      });
      return;
    }

    const duplicate = employees.some(
      (employee) =>
        employee.id !== editingEmployee?.id &&
        employee.full_name.trim().toLowerCase() === fullName.toLowerCase(),
    );

    if (duplicate) {
      setMessage({
        tone: "error",
        text: "A person with this name already exists.",
      });
      return;
    }

    if (form.userId) {
      const linkedToAnotherEmployee = employees.find(
        (employee) =>
          employee.id !== editingEmployee?.id &&
          employee.user_id === form.userId,
      );

      if (linkedToAnotherEmployee) {
        setMessage({
          tone: "error",
          text: `That login is already linked to ${linkedToAnotherEmployee.full_name}.`,
        });
        return;
      }
    }

    setSaving(true);

    const payload = {
      full_name: fullName,
      role: form.role.trim() || null,
      crew_id: form.crewId || null,
      active: form.active,
      notes: form.notes.trim() || null,
      shirt_size: form.shirtSize || null,
      jacket_size: form.jacketSize || null,
      glove_size: form.gloveSize || null,
      pants_size: form.pantsSize.trim() || null,
      user_id: form.userId || null,
    };

    try {
      const result = editingEmployee
        ? await supabase
            .from("employees")
            .update(payload)
            .eq("id", editingEmployee.id)
        : await supabase.from("employees").insert(payload);

      if (result.error) {
        throw new Error(result.error.message);
      }

      await loadData();
      setFormOpen(false);
      setEditingEmployee(null);
      setForm(EMPTY_FORM);
      setMessage({
        tone: "success",
        text: editingEmployee
          ? `${fullName} was updated.`
          : `${fullName} was added to People.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to save the employee profile.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function confirmEmployeeStatusChange() {
    if (!statusEmployee) return;

    const nextActive = statusEmployee.active === false;
    setStatusSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("employees")
        .update({ active: nextActive })
        .eq("id", statusEmployee.id);

      if (error) {
        throw new Error(error.message);
      }

      await loadData();
      setStatusEmployee(null);
      setMessage({
        tone: "success",
        text: `${statusEmployee.full_name} is now ${
          nextActive ? "active" : "inactive"
        }.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to update the employee status.",
      });
    } finally {
      setStatusSaving(false);
    }
  }

  function exportRegister() {
    const headers = [
      "Name",
      "Position / Trade",
      "Crew",
      "Status",
      "Login Linked",
      "Login Email",
      "Shirt Size",
      "Jacket Size",
      "Glove Size",
      "Pants Size",
      "PPE Complete",
      "Operational Notes",
    ];

    const rows = filteredEmployees.map((employee) => [
      employee.full_name,
      employee.role,
      crewLabel(crewById.get(clean(employee.crew_id))),
      employee.active !== false ? "Active" : "Inactive",
      employee.user_id ? "Yes" : "No",
      employee.user_id ? loginByUserId.get(employee.user_id)?.email ?? "" : "",
      employee.shirt_size,
      employee.jacket_size,
      employee.glove_size,
      employee.pants_size,
      hasCompletePpe(employee) ? "Yes" : "No",
      employee.notes,
    ]);

    const csv = [
      headers.map(csvSafe).join(","),
      ...rows.map((row) => row.map(csvSafe).join(",")),
    ].join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `people-register-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-slate-400">
                <Users size={18} />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Workforce
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                People
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Manage employee profiles, crew allocation, linked login accounts
                and PPE sizing. Open a person to manage their detailed profile.
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
                onClick={exportRegister}
                disabled={filteredEmployees.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                <Download size={16} />
                Export CSV
              </button>

              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                <Plus size={16} />
                Add Person
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

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            label="Total people"
            value={String(employees.length)}
            detail={`${activeCount} active`}
            icon={<Users size={20} />}
          />
          <KpiCard
            label="Active"
            value={String(activeCount)}
            detail={`${inactiveCount} inactive`}
            icon={<UserCheck size={20} />}
          />
          <KpiCard
            label="No crew"
            value={String(noCrewCount)}
            detail="Active people only"
            icon={<UsersRound size={20} />}
          />
          <KpiCard
            label="No login"
            value={String(noLoginCount)}
            detail="Assign from employee profile"
            icon={<UserRoundX size={20} />}
          />
          <KpiCard
            label="Missing PPE"
            value={String(missingPpeCount)}
            detail="Incomplete sizing"
            icon={<Shirt size={20} />}
          />
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <NavigationCard
            icon={<UsersRound size={20} />}
            title="Crews"
            description="Build crews and allocate active employees to one crew at a time."
            href="/people/crews"
            label="Open crews"
          />
<NavigationCard
  icon={<HardHat size={20} />}
  title="Training Register"
  description="Manage licences, VOCs, certificates, inductions, competencies and expiry tracking."
  href="/people/training"
  label="Open training register"
/>
          <NavigationCard
            icon={<Shirt size={20} />}
            title="PPE Register"
            description="Current employee sizing is already included in this register and can later receive a dedicated view."
            disabled
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_220px_190px_190px]">
            <label className="relative block">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, login email, trade, crew or PPE size..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </label>

            <SelectField
              value={statusFilter}
              onChange={(value) =>
                setStatusFilter(value as "all" | "active" | "inactive")
              }
              options={[
                { value: "all", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />

            <SelectField
              value={crewFilter}
              onChange={setCrewFilter}
              options={[
                { value: "all", label: "All crews" },
                { value: "unassigned", label: "Unassigned" },
                ...crews.map((crew) => ({
                  value: crew.id,
                  label: crewLabel(crew),
                })),
              ]}
            />

            <SelectField
              value={ppeFilter}
              onChange={(value) =>
                setPpeFilter(value as "all" | "complete" | "missing")
              }
              options={[
                { value: "all", label: "All PPE records" },
                { value: "complete", label: "PPE complete" },
                { value: "missing", label: "PPE missing" },
              ]}
            />

            <SelectField
              value={loginFilter}
              onChange={(value) =>
                setLoginFilter(value as "all" | "linked" | "unlinked")
              }
              options={[
                { value: "all", label: "All login links" },
                { value: "linked", label: "Login linked" },
                { value: "unlinked", label: "No login linked" },
              ]}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                People Register
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {filteredEmployees.length} person
                {filteredEmployees.length === 1 ? "" : "s"} shown
              </p>
            </div>

            <div className="text-xs font-medium text-slate-400">
              Select View Profile to open the employee record.
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-64 items-center justify-center">
              <Loader2 size={26} className="animate-spin text-slate-400" />
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="p-10 text-center">
              <Users size={30} className="mx-auto text-slate-300" />
              <h3 className="mt-4 text-lg font-bold text-slate-900">
                No people found
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Adjust the filters or add the first person.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredEmployees.map((employee) => (
                <EmployeeRow
                  key={employee.id}
                  employee={employee}
                  crew={crewById.get(clean(employee.crew_id))}
                  login={
                    employee.user_id
                      ? loginByUserId.get(employee.user_id)
                      : undefined
                  }
                  onEdit={() => openEdit(employee)}
                  onRequestStatusChange={() => setStatusEmployee(employee)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {formOpen ? (
        <EmployeeModal
          form={form}
          setForm={setForm}
          employee={editingEmployee}
          crews={crews}
          availableLoginAccounts={availableLoginAccounts}
          saving={saving}
          onClose={closeForm}
          onSave={() => void saveEmployee()}
        />
      ) : null}

      {statusEmployee ? (
        <StatusConfirmationModal
          employee={statusEmployee}
          saving={statusSaving}
          onClose={() => {
            if (!statusSaving) setStatusEmployee(null);
          }}
          onConfirm={() => void confirmEmployeeStatusChange()}
        />
      ) : null}
    </AppShell>
  );
}

function EmployeeRow({
  employee,
  crew,
  login,
  onEdit,
  onRequestStatusChange,
}: {
  employee: Employee;
  crew: Crew | undefined;
  login: LoginAccount | undefined;
  onEdit: () => void;
  onRequestStatusChange: () => void;
}) {
  const active = employee.active !== false;
  const ppeComplete = hasCompletePpe(employee);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_auto] xl:items-center">
      <div className="min-w-0">
        <Link
          href={`/people/${employee.id}`}
          className="group inline-flex min-w-0 items-center gap-2"
        >
          <h3 className="truncate font-bold text-slate-950 group-hover:text-blue-700">
            {employee.full_name}
          </h3>
          <ExternalLink
            size={14}
            className="shrink-0 text-slate-300 group-hover:text-blue-600"
          />
        </Link>

        <div className="mt-1">
          <StatusBadge active={active} />
        </div>

        <p className="mt-1 text-sm text-slate-500">
          {employee.role || "Position not set"}
        </p>

        {employee.notes ? (
          <p className="mt-1 line-clamp-1 text-xs text-slate-400">
            {employee.notes}
          </p>
        ) : null}
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Crew
        </div>
        <div className="mt-2 text-sm font-semibold text-slate-700">
          {crewLabel(crew)}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Login
        </div>
        <div className="mt-2">
          <SmallBadge
            label={employee.user_id ? "Linked" : "Not linked"}
            tone={employee.user_id ? "emerald" : "slate"}
          />
          {login?.email ? (
            <div className="mt-1 truncate text-xs text-slate-500">
              {login.email}
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          PPE sizing
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <SizeBadge label="Shirt" value={employee.shirt_size} />
          <SizeBadge label="Jacket" value={employee.jacket_size} />
          <SizeBadge label="Gloves" value={employee.glove_size} />
          <SizeBadge label="Pants" value={employee.pants_size} />
          {!ppeComplete ? (
            <SmallBadge label="Incomplete" tone="amber" />
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
        <Link
          href={`/people/${employee.id}`}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          View Profile
          <ArrowRight size={15} />
        </Link>

        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Edit3 size={15} />
          Quick Edit
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label={`More actions for ${employee.full_name}`}
            aria-expanded={menuOpen}
          >
            <MoreHorizontal size={18} />
          </button>

          {menuOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-30 cursor-default"
                aria-label="Close actions menu"
                onClick={() => setMenuOpen(false)}
              />

              <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <Link
                  href={`/people/${employee.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => setMenuOpen(false)}
                >
                  View full profile
                  <ArrowRight size={15} />
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit();
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Quick edit
                  <Edit3 size={15} />
                </button>

                <div className="my-1 border-t border-slate-100" />

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onRequestStatusChange();
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${
                    active
                      ? "text-rose-700 hover:bg-rose-50"
                      : "text-emerald-700 hover:bg-emerald-50"
                  }`}
                >
                  {active ? "Deactivate person" : "Reactivate person"}
                  {active ? <UserMinus size={15} /> : <UserCheck size={15} />}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmployeeModal({
  form,
  setForm,
  employee,
  crews,
  availableLoginAccounts,
  saving,
  onClose,
  onSave,
}: {
  form: EmployeeForm;
  setForm: React.Dispatch<React.SetStateAction<EmployeeForm>>;
  employee: Employee | null;
  crews: Crew[];
  availableLoginAccounts: LoginAccount[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
      <div className="my-auto w-full max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              {employee ? "Edit Person" : "Add Person"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Manage the operational profile and optionally assign an existing
              login account created in Admin.
            </p>
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

        <div className="space-y-6 p-6">
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
              Operational Profile
            </h3>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Full name">
                <input
                  value={form.fullName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      fullName: event.target.value,
                    }))
                  }
                  placeholder="Employee name"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </Field>

              <Field label="Position / trade">
                <input
                  value={form.role}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      role: event.target.value,
                    }))
                  }
                  placeholder="e.g. Rigger, Crane Operator"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </Field>

              <Field label="Crew">
                <SelectField
                  value={form.crewId}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      crewId: value,
                    }))
                  }
                  options={[
                    { value: "", label: "Unassigned" },
                    ...crews
                      .filter((crew) => crew.active !== false)
                      .map((crew) => ({
                        value: crew.id,
                        label: crewLabel(crew),
                      })),
                  ]}
                />
              </Field>

              <Field label="Status">
                <SelectField
                  value={form.active ? "active" : "inactive"}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      active: value === "active",
                    }))
                  }
                  options={[
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                />
              </Field>
            </div>

            <div className="mt-4">
              <Field label="Linked login account">
                <SelectField
                  value={form.userId}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      userId: value,
                    }))
                  }
                  options={[
                    { value: "", label: "No login assigned" },
                    ...availableLoginAccounts.map((account) => ({
                      value: account.userId,
                      label: account.email,
                    })),
                  ]}
                />
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Only unassigned login accounts are shown. Create new accounts
                  and manage roles or passwords from Admin.
                </p>
              </Field>
            </div>

            <div className="mt-4">
              <Field label="Operational notes">
                <textarea
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  rows={3}
                  placeholder="Operational notes only. Do not record private or sensitive information."
                  className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center gap-2">
              <Shirt size={18} className="text-slate-500" />
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                PPE Sizing
              </h3>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Shirt">
                <SelectField
                  value={form.shirtSize}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      shirtSize: value,
                    }))
                  }
                  options={[
                    { value: "", label: "Not set" },
                    ...SHIRT_SIZES.map((size) => ({
                      value: size,
                      label: size,
                    })),
                  ]}
                />
              </Field>

              <Field label="Jacket">
                <SelectField
                  value={form.jacketSize}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      jacketSize: value,
                    }))
                  }
                  options={[
                    { value: "", label: "Not set" },
                    ...JACKET_SIZES.map((size) => ({
                      value: size,
                      label: size,
                    })),
                  ]}
                />
              </Field>

              <Field label="Gloves">
                <SelectField
                  value={form.gloveSize}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      gloveSize: value,
                    }))
                  }
                  options={[
                    { value: "", label: "Not set" },
                    ...GLOVE_SIZES.map((size) => ({
                      value: size,
                      label: size,
                    })),
                  ]}
                />
              </Field>

              <Field label="Pants">
                <input
                  value={form.pantsSize}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      pantsSize: event.target.value,
                    }))
                  }
                  placeholder="e.g. 87R"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </Field>
            </div>
          </section>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {employee ? "Save Changes" : "Add Person"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusConfirmationModal({
  employee,
  saving,
  onClose,
  onConfirm,
}: {
  employee: Employee;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const active = employee.active !== false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <div
              className={`inline-flex rounded-2xl p-3 ${
                active
                  ? "bg-rose-100 text-rose-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {active ? <UserMinus size={22} /> : <UserCheck size={22} />}
            </div>

            <h2 className="mt-4 text-xl font-bold text-slate-950">
              {active ? "Deactivate" : "Reactivate"} {employee.full_name}?
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              {active
                ? "This person will be removed from active operational selections, but their historical records will remain."
                : "This person will become available again in active operational selections."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-60"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {active ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <ul className="space-y-2 text-sm text-slate-600">
                <li>• Removed from active crew and personnel selectors.</li>
                <li>• Excluded from future training and compliance reminders.</li>
                <li>• Historical dockets, prestarts and records are preserved.</li>
                <li>• The person can be reactivated later.</li>
              </ul>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
              Reactivating restores the person to active lists and operational
              workflows. Their existing crew and login links remain unchanged.
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={saving}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${
                active
                  ? "bg-rose-700 hover:bg-rose-800"
                  : "bg-emerald-700 hover:bg-emerald-800"
              }`}
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : active ? (
                <UserMinus size={16} />
              ) : (
                <UserCheck size={16} />
              )}
              {active ? "Deactivate Person" : "Reactivate Person"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavigationCard({
  icon,
  title,
  description,
  href,
  label,
  disabled = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href?: string;
  label?: string;
  disabled?: boolean;
}) {
  const content = (
    <>
      <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
        {icon}
      </div>
      <h2 className="mt-4 font-bold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      <div className="mt-4 text-sm font-semibold text-slate-700">
        {disabled ? "Coming next" : label}
      </div>
    </>
  );

  if (disabled || !href) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 opacity-75">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      {content}
    </Link>
  );
}

function KpiCard({
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

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        active
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function SmallBadge({
  label,
  tone,
}: {
  label: string;
  tone: "emerald" | "amber" | "slate";
}) {
  const classes =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-600";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}>
      {label}
    </span>
  );
}

function SizeBadge({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <span
      title={label}
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        value
          ? "bg-slate-100 text-slate-700"
          : "bg-rose-50 text-rose-600"
      }`}
    >
      {label}: {value || "—"}
    </span>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  Edit3,
  HardHat,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Shirt,
  UserCheck,
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
  updated_at?: string | null;
};

type Crew = {
  id: string;
  crew_number: string | null;
  crew_name: string | null;
  leading_hand: string | null;
  active: boolean | null;
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

export default function PeoplePage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
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

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const crewById = useMemo(
    () => new Map(crews.map((crew) => [crew.id, crew])),
    [crews],
  );

  const loadData = useCallback(async () => {
    const [employeesResult, crewsResult] = await Promise.all([
      supabase
        .from("employees")
        .select(
          "id, full_name, role, crew_id, active, user_id, notes, shirt_size, jacket_size, glove_size, pants_size, created_at, updated_at",
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
  }, [supabase]);

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

  async function toggleEmployeeStatus(employee: Employee) {
    const nextActive = employee.active === false;

    if (
      !nextActive &&
      !window.confirm(
        `Deactivate ${employee.full_name}? They will be removed from active operational lists but their history will remain.`,
      )
    ) {
      return;
    }

    setMessage(null);

    const { error } = await supabase
      .from("employees")
      .update({ active: nextActive })
      .eq("id", employee.id);

    if (error) {
      setMessage({ tone: "error", text: error.message });
      return;
    }

    await loadData();
    setMessage({
      tone: "success",
      text: `${employee.full_name} is now ${
        nextActive ? "active" : "inactive"
      }.`,
    });
  }

  function exportRegister() {
    const headers = [
      "Name",
      "Position / Trade",
      "Crew",
      "Status",
      "Login Linked",
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
                Manage operational employee profiles, crew allocation, login
                links and PPE sizing. No private HR, medical, payroll or personal
                identification information is stored here.
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
            detail="Can be linked later"
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
            description="Crew structures remain in the existing page for now and will be moved into People next."
            href="/people/crews"
            label="Open current crews"
          />
          <NavigationCard
            icon={<HardHat size={20} />}
            title="Training Register"
            description="Certificates, licences, VOC records and SharePoint documents will be added next."
            disabled
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
                placeholder="Search name, trade, crew or PPE size..."
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
              Inactive people remain available for historical records.
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
                  onEdit={() => openEdit(employee)}
                  onToggleStatus={() => void toggleEmployeeStatus(employee)}
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
          saving={saving}
          onClose={closeForm}
          onSave={() => void saveEmployee()}
        />
      ) : null}
    </AppShell>
  );
}

function EmployeeRow({
  employee,
  crew,
  onEdit,
  onToggleStatus,
}: {
  employee: Employee;
  crew: Crew | undefined;
  onEdit: () => void;
  onToggleStatus: () => void;
}) {
  const active = employee.active !== false;
  const ppeComplete = hasCompletePpe(employee);

  return (
    <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_auto] xl:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-bold text-slate-950">
            {employee.full_name}
          </h3>
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

      <div className="flex flex-wrap gap-2 xl:justify-end">
        <button
          type="button"
          onClick={onToggleStatus}
          className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
            active
              ? "border-slate-200 text-slate-600 hover:bg-slate-50"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          {active ? "Deactivate" : "Reactivate"}
        </button>

        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Edit3 size={15} />
          Edit
        </button>
      </div>
    </div>
  );
}

function EmployeeModal({
  form,
  setForm,
  employee,
  crews,
  saving,
  onClose,
  onSave,
}: {
  form: EmployeeForm;
  setForm: React.Dispatch<React.SetStateAction<EmployeeForm>>;
  employee: Employee | null;
  crews: Crew[];
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
              Operational details only. Do not enter private HR, medical,
              payroll or identification information.
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

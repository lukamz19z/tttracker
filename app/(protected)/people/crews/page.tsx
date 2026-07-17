"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  UsersRound,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type Crew = {
  id: string;
  crew_number: string;
  crew_name: string | null;
  leading_hand: string | null;
  active: boolean | null;
};

type Employee = {
  id: string;
  full_name: string;
  role: string | null;
  crew_id: string | null;
  active: boolean | null;
};

type CrewForm = {
  crewNumber: string;
  crewName: string;
  leadingHand: string;
  active: boolean;
};

const EMPTY_CREW_FORM: CrewForm = {
  crewNumber: "",
  crewName: "",
  leadingHand: "",
  active: true,
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function crewLabel(crew: Crew) {
  const number = clean(crew.crew_number);
  const name = clean(crew.crew_name);

  if (number && name) return `Crew ${number} · ${name}`;
  if (number) return `Crew ${number}`;
  if (name) return name;

  return "Unnamed crew";
}

export default function PeopleCrewsPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [crews, setCrews] = useState<Crew[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingCrew, setSavingCrew] = useState(false);
  const [assigningEmployeeId, setAssigningEmployeeId] = useState<string | null>(
    null,
  );
  const [removingEmployeeId, setRemovingEmployeeId] = useState<string | null>(
    null,
  );
  const [deletingCrewId, setDeletingCrewId] = useState<string | null>(null);

  const [crewPanelOpen, setCrewPanelOpen] = useState(true);
  const [assignmentPanelOpen, setAssignmentPanelOpen] = useState(true);

  const [editingCrewId, setEditingCrewId] = useState<string | null>(null);
  const [crewForm, setCrewForm] =
    useState<CrewForm>(EMPTY_CREW_FORM);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("active");

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    const [crewResult, employeeResult] = await Promise.all([
      supabase
        .from("crews")
        .select("id, crew_number, crew_name, leading_hand, active")
        .order("crew_number", { ascending: true }),
      supabase
        .from("employees")
        .select("id, full_name, role, crew_id, active")
        .order("full_name", { ascending: true }),
    ]);

    if (crewResult.error) {
      throw new Error(crewResult.error.message);
    }

    if (employeeResult.error) {
      throw new Error(employeeResult.error.message);
    }

    setCrews((crewResult.data ?? []) as Crew[]);
    setEmployees((employeeResult.data ?? []) as Employee[]);
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
                : "Unable to load crew allocations.",
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
            : "Unable to refresh crew allocations.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.active !== false),
    [employees],
  );

  const unassignedEmployees = useMemo(
    () => activeEmployees.filter((employee) => !employee.crew_id),
    [activeEmployees],
  );

  const crewMembersByCrew = useMemo(() => {
    const map = new Map<string, Employee[]>();

    for (const crew of crews) {
      map.set(crew.id, []);
    }

    for (const employee of activeEmployees) {
      if (!employee.crew_id) continue;

      const members = map.get(employee.crew_id) ?? [];
      members.push(employee);
      map.set(employee.crew_id, members);
    }

    return map;
  }, [activeEmployees, crews]);

  const filteredCrews = useMemo(() => {
    const query = search.trim().toLowerCase();

    return crews.filter((crew) => {
      const active = crew.active !== false;

      if (statusFilter === "active" && !active) return false;
      if (statusFilter === "inactive" && active) return false;

      if (!query) return true;

      const members = crewMembersByCrew.get(crew.id) ?? [];

      return [
        crew.crew_number,
        crew.crew_name,
        crew.leading_hand,
        ...members.map((member) => member.full_name),
        ...members.map((member) => member.role),
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [crewMembersByCrew, crews, search, statusFilter]);

  const activeCrewCount = crews.filter((crew) => crew.active !== false).length;
  const inactiveCrewCount = crews.length - activeCrewCount;
  const assignedWorkerCount = activeEmployees.filter(
    (employee) => Boolean(employee.crew_id),
  ).length;

  function resetCrewForm() {
    setEditingCrewId(null);
    setCrewForm(EMPTY_CREW_FORM);
  }

  function editCrew(crew: Crew) {
    setEditingCrewId(crew.id);
    setCrewForm({
      crewNumber: clean(crew.crew_number),
      crewName: clean(crew.crew_name),
      leadingHand: clean(crew.leading_hand),
      active: crew.active !== false,
    });
    setCrewPanelOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveCrew() {
    setMessage(null);

    const crewNumber = crewForm.crewNumber.trim();

    if (!crewNumber) {
      setMessage({ tone: "error", text: "Enter a crew number." });
      return;
    }

    const duplicate = crews.some(
      (crew) =>
        crew.id !== editingCrewId &&
        crew.crew_number.trim().toLowerCase() === crewNumber.toLowerCase(),
    );

    if (duplicate) {
      setMessage({
        tone: "error",
        text: "This crew number already exists.",
      });
      return;
    }

    setSavingCrew(true);

    const payload = {
      crew_number: crewNumber,
      crew_name: crewForm.crewName.trim() || null,
      leading_hand: crewForm.leadingHand.trim() || null,
      active: crewForm.active,
    };

    try {
      const result = editingCrewId
        ? await supabase
            .from("crews")
            .update(payload)
            .eq("id", editingCrewId)
        : await supabase.from("crews").insert(payload);

      if (result.error) {
        throw new Error(result.error.message);
      }

      await loadData();
      resetCrewForm();

      setMessage({
        tone: "success",
        text: editingCrewId
          ? `Crew ${crewNumber} was updated.`
          : `Crew ${crewNumber} was created.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to save the crew.",
      });
    } finally {
      setSavingCrew(false);
    }
  }

  async function deleteCrew(crew: Crew) {
    const members = crewMembersByCrew.get(crew.id) ?? [];

    const confirmed = window.confirm(
      members.length > 0
        ? `Delete ${crewLabel(crew)}? ${members.length} assigned worker${
            members.length === 1 ? "" : "s"
          } will be unassigned first.`
        : `Delete ${crewLabel(crew)}?`,
    );

    if (!confirmed) return;

    setDeletingCrewId(crew.id);
    setMessage(null);

    try {
      if (members.length > 0) {
        const unassignResult = await supabase
          .from("employees")
          .update({ crew_id: null })
          .eq("crew_id", crew.id);

        if (unassignResult.error) {
          throw new Error(unassignResult.error.message);
        }
      }

      const deleteResult = await supabase
        .from("crews")
        .delete()
        .eq("id", crew.id);

      if (deleteResult.error) {
        throw new Error(deleteResult.error.message);
      }

      await loadData();

      if (editingCrewId === crew.id) {
        resetCrewForm();
      }

      setMessage({
        tone: "success",
        text: `${crewLabel(crew)} was deleted.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to delete the crew.",
      });
    } finally {
      setDeletingCrewId(null);
    }
  }

  async function assignEmployeeToCrew(
    employeeId: string,
    crewId: string,
  ) {
    if (!employeeId || !crewId) return;

    setAssigningEmployeeId(employeeId);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("employees")
        .update({ crew_id: crewId })
        .eq("id", employeeId);

      if (error) {
        throw new Error(error.message);
      }

      await loadData();

      const employee = employees.find((item) => item.id === employeeId);
      const crew = crews.find((item) => item.id === crewId);

      setMessage({
        tone: "success",
        text: `${
          employee?.full_name ?? "Worker"
        } was assigned to ${crew ? crewLabel(crew) : "the crew"}.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to assign the worker.",
      });
    } finally {
      setAssigningEmployeeId(null);
    }
  }

  async function unassignEmployee(employee: Employee) {
    setRemovingEmployeeId(employee.id);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("employees")
        .update({ crew_id: null })
        .eq("id", employee.id);

      if (error) {
        throw new Error(error.message);
      }

      await loadData();

      setMessage({
        tone: "success",
        text: `${employee.full_name} was removed from the crew.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to remove the worker.",
      });
    } finally {
      setRemovingEmployeeId(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link
                href="/people"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft size={16} />
                Back to People
              </Link>

              <div className="mt-5 flex items-center gap-2 text-slate-400">
                <UsersRound size={18} />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Workforce Allocation
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Crews
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Build and maintain crew structures, assign active workers and
                keep each person allocated to one crew at a time.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void refreshData()}
              disabled={refreshing}
              className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
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

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Total crews"
            value={String(crews.length)}
            detail={`${activeCrewCount} active`}
          />
          <MetricCard
            label="Active crews"
            value={String(activeCrewCount)}
            detail={`${inactiveCrewCount} inactive`}
          />
          <MetricCard
            label="Active workers"
            value={String(activeEmployees.length)}
            detail="Available workforce"
          />
          <MetricCard
            label="Assigned"
            value={String(assignedWorkerCount)}
            detail="Workers in crews"
          />
          <MetricCard
            label="Unassigned"
            value={String(unassignedEmployees.length)}
            detail="Needs allocation"
            alert={unassignedEmployees.length > 0}
          />
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setCrewPanelOpen((current) => !current)}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"
          >
            <div>
              <h2 className="text-xl font-bold text-slate-950">
                Crew Setup
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Create a new crew or update an existing crew.
              </p>
            </div>

            {crewPanelOpen ? (
              <ChevronUp size={20} className="text-slate-400" />
            ) : (
              <ChevronDown size={20} className="text-slate-400" />
            )}
          </button>

          {crewPanelOpen ? (
            <div className="border-t border-slate-200 p-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="font-bold text-slate-950">
                      {editingCrewId ? "Edit Crew" : "Create Crew"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Leading hand remains a crew-level field for compatibility
                      with the existing database.
                    </p>
                  </div>

                  {editingCrewId ? (
                    <button
                      type="button"
                      onClick={resetCrewForm}
                      disabled={savingCrew}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[0.7fr_1fr_1fr_0.7fr_auto]">
                  <InputField
                    label="Crew number"
                    value={crewForm.crewNumber}
                    onChange={(value) =>
                      setCrewForm((current) => ({
                        ...current,
                        crewNumber: value,
                      }))
                    }
                    placeholder="e.g. 1"
                  />

                  <InputField
                    label="Crew name"
                    value={crewForm.crewName}
                    onChange={(value) =>
                      setCrewForm((current) => ({
                        ...current,
                        crewName: value,
                      }))
                    }
                    placeholder="Optional"
                  />

                  <InputField
                    label="Leading hand"
                    value={crewForm.leadingHand}
                    onChange={(value) =>
                      setCrewForm((current) => ({
                        ...current,
                        leadingHand: value,
                      }))
                    }
                    placeholder="Optional"
                  />

                  <SelectField
                    label="Status"
                    value={crewForm.active ? "active" : "inactive"}
                    onChange={(value) =>
                      setCrewForm((current) => ({
                        ...current,
                        active: value === "active",
                      }))
                    }
                    options={[
                      { value: "active", label: "Active" },
                      { value: "inactive", label: "Inactive" },
                    ]}
                  />

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => void saveCrew()}
                      disabled={savingCrew}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 lg:w-auto"
                    >
                      {savingCrew ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : editingCrewId ? (
                        <Edit3 size={16} />
                      ) : (
                        <Plus size={16} />
                      )}
                      {editingCrewId ? "Update Crew" : "Create Crew"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setAssignmentPanelOpen((current) => !current)}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"
          >
            <div>
              <h2 className="text-xl font-bold text-slate-950">
                Crew Assignment Board
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Assign unallocated workers to crews and remove members when
                allocations change.
              </p>
            </div>

            {assignmentPanelOpen ? (
              <ChevronUp size={20} className="text-slate-400" />
            ) : (
              <ChevronDown size={20} className="text-slate-400" />
            )}
          </button>

          {assignmentPanelOpen ? (
            <div className="border-t border-slate-200 p-5">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px]">
                <label className="relative block">
                  <Search
                    size={17}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search crews, leading hands or workers..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-200 focus:ring-2"
                  />
                </label>

                <SelectField
                  value={statusFilter}
                  onChange={(value) =>
                    setStatusFilter(
                      value as "all" | "active" | "inactive",
                    )
                  }
                  options={[
                    { value: "all", label: "All crews" },
                    { value: "active", label: "Active crews" },
                    { value: "inactive", label: "Inactive crews" },
                  ]}
                />
              </div>

              {loading ? (
                <div className="flex min-h-64 items-center justify-center">
                  <Loader2 size={26} className="animate-spin text-slate-400" />
                </div>
              ) : filteredCrews.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <UsersRound
                    size={30}
                    className="mx-auto text-slate-300"
                  />
                  <h3 className="mt-4 text-lg font-bold text-slate-900">
                    No crews found
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Create a crew or adjust the current filters.
                  </p>
                </div>
              ) : (
                <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
                  {filteredCrews.map((crew) => {
                    const members = crewMembersByCrew.get(crew.id) ?? [];

                    return (
                      <CrewCard
                        key={crew.id}
                        crew={crew}
                        members={members}
                        unassignedEmployees={unassignedEmployees}
                        assigningEmployeeId={assigningEmployeeId}
                        removingEmployeeId={removingEmployeeId}
                        deleting={deletingCrewId === crew.id}
                        onAssign={(employeeId) =>
                          void assignEmployeeToCrew(employeeId, crew.id)
                        }
                        onRemove={(employee) =>
                          void unassignEmployee(employee)
                        }
                        onEdit={() => editCrew(crew)}
                        onDelete={() => void deleteCrew(crew)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

function CrewCard({
  crew,
  members,
  unassignedEmployees,
  assigningEmployeeId,
  removingEmployeeId,
  deleting,
  onAssign,
  onRemove,
  onEdit,
  onDelete,
}: {
  crew: Crew;
  members: Employee[];
  unassignedEmployees: Employee[];
  assigningEmployeeId: string | null;
  removingEmployeeId: string | null;
  deleting: boolean;
  onAssign: (employeeId: string) => void;
  onRemove: (employee: Employee) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="flex h-full flex-col rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Crew
          </div>
          <h3 className="mt-1 text-2xl font-bold text-slate-950">
            {crew.crew_number}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {crew.crew_name || "No crew name"}
          </p>
        </div>

        <StatusBadge active={crew.active !== false} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <InfoBlock
          label="Leading hand"
          value={crew.leading_hand || "Not set"}
        />
        <InfoBlock label="Members" value={String(members.length)} />
      </div>

      <div className="mt-4">
        <label className="mb-2 block text-sm font-bold text-slate-800">
          Add worker
        </label>

        <select
          value=""
          disabled={
            crew.active === false ||
            unassignedEmployees.length === 0 ||
            assigningEmployeeId !== null
          }
          onChange={(event) => {
            const employeeId = event.target.value;
            if (employeeId) onAssign(employeeId);
          }}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none ring-slate-200 focus:ring-2 disabled:bg-slate-100 disabled:text-slate-400"
        >
          <option value="">
            {crew.active === false
              ? "Crew is inactive"
              : unassignedEmployees.length === 0
                ? "No unassigned workers"
                : assigningEmployeeId
                  ? "Assigning worker..."
                  : "Select unassigned worker..."}
          </option>

          {unassignedEmployees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name}
              {employee.role ? ` — ${employee.role}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5 flex-1">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-800">
            Members
          </h4>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
            {members.length}
          </span>
        </div>

        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-900">
                  {member.full_name}
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-500">
                  {member.role || "Position not set"}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onRemove(member)}
                disabled={removingEmployeeId === member.id}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
              >
                {removingEmployeeId === member.id ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <UserMinus size={13} />
                )}
                Remove
              </button>
            </div>
          ))}

          {members.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-sm text-slate-500">
              No workers assigned.
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Edit3 size={15} />
          Edit Crew
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
        >
          {deleting ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Trash2 size={15} />
          )}
          Delete
        </button>
      </div>
    </article>
  );
}

function MetricCard({
  label,
  value,
  detail,
  alert = false,
}: {
  label: string;
  value: string;
  detail: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        alert
          ? "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <div
        className={`text-sm font-semibold ${
          alert ? "text-amber-700" : "text-slate-500"
        }`}
      >
        {label}
      </div>
      <div
        className={`mt-2 text-3xl font-bold tracking-tight ${
          alert ? "text-amber-950" : "text-slate-950"
        }`}
      >
        {value}
      </div>
      <div
        className={`mt-1 text-xs ${
          alert ? "text-amber-700" : "text-slate-400"
        }`}
      >
        {detail}
      </div>
    </div>
  );
}

function InfoBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-bold text-slate-800">
        {value}
      </div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-800">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="relative block">
      {label ? (
        <span className="mb-2 block text-sm font-bold text-slate-800">
          {label}
        </span>
      ) : null}

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
        className={`pointer-events-none absolute right-3 text-slate-400 ${
          label ? "bottom-3" : "top-1/2 -translate-y-1/2"
        }`}
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
          : "bg-slate-200 text-slate-500"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

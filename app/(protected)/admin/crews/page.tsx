"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
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

export default function CrewsPage() {
  const supabase = createSupabaseBrowser();

  const [crews, setCrews] = useState<Crew[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [crewPanelOpen, setCrewPanelOpen] = useState(true);
  const [assignmentPanelOpen, setAssignmentPanelOpen] = useState(true);

  const [editingCrewId, setEditingCrewId] = useState<string | null>(null);
  const [crewNumber, setCrewNumber] = useState("");
  const [crewName, setCrewName] = useState("");
  const [leadingHand, setLeadingHand] = useState("");
  const [active, setActive] = useState(true);

  const loadData = useCallback(async () => {
    const [{ data: crewData }, { data: employeeData }] = await Promise.all([
      supabase.from("crews").select("*").order("crew_number"),
      supabase.from("employees").select("*").order("full_name"),
    ]);

    setCrews((crewData || []) as Crew[]);
    setEmployees((employeeData || []) as Employee[]);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.active !== false),
    [employees]
  );

  const unassignedEmployees = useMemo(
    () => activeEmployees.filter((e) => !e.crew_id),
    [activeEmployees]
  );

  function resetCrewForm() {
    setEditingCrewId(null);
    setCrewNumber("");
    setCrewName("");
    setLeadingHand("");
    setActive(true);
  }

  function editCrew(crew: Crew) {
    setEditingCrewId(crew.id);
    setCrewNumber(crew.crew_number || "");
    setCrewName(crew.crew_name || "");
    setLeadingHand(crew.leading_hand || "");
    setActive(crew.active !== false);
    setCrewPanelOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveCrew() {
    if (!crewNumber.trim()) {
      alert("Enter crew number");
      return;
    }

    const duplicate = crews.some(
      (c) =>
        c.id !== editingCrewId &&
        c.crew_number.trim().toLowerCase() === crewNumber.trim().toLowerCase()
    );

    if (duplicate) {
      alert("This crew number already exists.");
      return;
    }

    const payload = {
      crew_number: crewNumber.trim(),
      crew_name: crewName.trim() || null,
      leading_hand: leadingHand.trim() || null,
      active,
    };

    const res = editingCrewId
      ? await supabase.from("crews").update(payload).eq("id", editingCrewId)
      : await supabase.from("crews").insert(payload);

    if (res.error) {
      alert(res.error.message);
      return;
    }

    resetCrewForm();
    await loadData();
  }

  async function deleteCrew(crewId: string) {
    if (!confirm("Delete this crew? Assigned workers will be unassigned first.")) {
      return;
    }

    const unassignRes = await supabase
      .from("employees")
      .update({ crew_id: null })
      .eq("crew_id", crewId);

    if (unassignRes.error) {
      alert(unassignRes.error.message);
      return;
    }

    const deleteRes = await supabase.from("crews").delete().eq("id", crewId);

    if (deleteRes.error) {
      alert(deleteRes.error.message);
      return;
    }

    await loadData();
  }

  async function assignEmployeeToCrew(employeeId: string, crewId: string) {
    if (!employeeId || !crewId) return;

    const { error } = await supabase
      .from("employees")
      .update({ crew_id: crewId })
      .eq("id", employeeId);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  }

  async function unassignEmployee(employeeId: string) {
    const { error } = await supabase
      .from("employees")
      .update({ crew_id: null })
      .eq("id", employeeId);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  }

  function crewMembers(crewId: string) {
    return activeEmployees.filter((e) => e.crew_id === crewId);
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50 transition"
            >
              ← Back to Admin
            </Link>

            <h1 className="text-3xl font-bold mt-4">Crews</h1>
            <p className="text-slate-500">
              Build flexible crews. Workers can only be assigned to one crew at a time.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Metric label="Crews" value={String(crews.length)} />
            <Metric label="Workers" value={String(activeEmployees.length)} />
            <Metric label="Unassigned" value={String(unassignedEmployees.length)} />
          </div>
        </div>

        <section className="bg-white border rounded-3xl shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setCrewPanelOpen((v) => !v)}
            className="w-full px-5 py-4 flex justify-between items-center text-left"
          >
            <div>
              <h2 className="text-xl font-bold">Crew Setup</h2>
              <p className="text-sm text-slate-500">
                Create and edit crews one at a time.
              </p>
            </div>
            <span className="text-xl">{crewPanelOpen ? "−" : "+"}</span>
          </button>

          {crewPanelOpen && (
            <div className="border-t p-5">
              <div className="rounded-2xl border bg-slate-50 p-4">
                <h3 className="font-bold mb-3">
                  {editingCrewId ? "Edit Crew" : "Create Crew"}
                </h3>

                <div className="grid md:grid-cols-5 gap-3">
                  <Input label="Crew Number" value={crewNumber} onChange={setCrewNumber} />
                  <Input label="Crew Name" value={crewName} onChange={setCrewName} />
                  <Input label="Leading Hand" value={leadingHand} onChange={setLeadingHand} />

                  <div>
                    <label className="block text-sm font-medium mb-1">Status</label>
                    <select
                      className="border rounded-xl p-3 w-full bg-white"
                      value={active ? "active" : "inactive"}
                      onChange={(e) => setActive(e.target.value === "active")}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={saveCrew}
                      className="bg-slate-900 text-white px-5 py-3 rounded-xl font-semibold w-full"
                    >
                      {editingCrewId ? "Update Crew" : "Create Crew"}
                    </button>

                    {editingCrewId && (
                      <button
                        type="button"
                        onClick={resetCrewForm}
                        className="border px-4 py-3 rounded-xl font-semibold bg-white"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="bg-white border rounded-3xl shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setAssignmentPanelOpen((v) => !v)}
            className="w-full px-5 py-4 flex justify-between items-center text-left"
          >
            <div>
              <h2 className="text-xl font-bold">Crew Assignment Board</h2>
              <p className="text-sm text-slate-500">
                Assign workers using dropdowns. Already assigned workers cannot be repeated.
              </p>
            </div>
            <span className="text-xl">{assignmentPanelOpen ? "−" : "+"}</span>
          </button>

          {assignmentPanelOpen && (
            <div className="border-t p-5">
              <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-5">
                {crews.map((crew) => {
                  const members = crewMembers(crew.id);

                  return (
                    <div key={crew.id} className="border rounded-3xl p-5 bg-slate-50 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase text-slate-400">Crew</p>
                          <h3 className="text-2xl font-bold">{crew.crew_number}</h3>
                          <p className="text-sm text-slate-500">{crew.crew_name || "—"}</p>
                        </div>

                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            crew.active !== false
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-500"
                          }`}
                        >
                          {crew.active !== false ? "Active" : "Inactive"}
                        </span>
                      </div>

                      <div className="rounded-2xl bg-white border p-3">
                        <p className="text-xs uppercase text-slate-400">Leading Hand</p>
                        <p className="font-semibold">{crew.leading_hand || "—"}</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Add Worker
                        </label>
                        <select
                          className="border rounded-xl p-3 w-full bg-white"
                          value=""
                          onChange={(e) => assignEmployeeToCrew(e.target.value, crew.id)}
                        >
                          <option value="">Select unassigned worker...</option>
                          {unassignedEmployees.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.full_name}
                              {employee.role ? ` - ${employee.role}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm font-semibold">
                          Members ({members.length})
                        </div>

                        {members.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center justify-between gap-3 bg-white border rounded-2xl px-3 py-2"
                          >
                            <div>
                              <p className="font-semibold text-sm">{member.full_name}</p>
                              <p className="text-xs text-slate-500">{member.role || "—"}</p>
                            </div>

                            <button
                              type="button"
                              onClick={() => unassignEmployee(member.id)}
                              className="text-xs border px-3 py-1 rounded-lg text-red-600"
                            >
                              Remove
                            </button>
                          </div>
                        ))}

                        {members.length === 0 && (
                          <div className="bg-white border rounded-2xl px-3 py-3 text-sm text-slate-500">
                            No workers assigned.
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => editCrew(crew)}
                          className="border bg-white px-4 py-2 rounded-xl text-sm font-semibold"
                        >
                          Edit Crew
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteCrew(crew.id)}
                          className="border bg-white px-4 py-2 rounded-xl text-sm font-semibold text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}

                {crews.length === 0 && (
                  <div className="border rounded-3xl p-6 text-slate-500">
                    No crews created yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        type={type}
        className="border rounded-xl p-3 w-full bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border rounded-2xl px-5 py-4 shadow-sm min-w-30">
      <p className="text-xs uppercase text-slate-400">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
}
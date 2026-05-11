"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type Crew = {
  id: string;
  crew_number: string;
  crew_name: string | null;
};

type Employee = {
  id: string;
  full_name: string;
  role: string | null;
  crew_id: string | null;
  active: boolean | null;
  notes: string | null;
};

export default function EmployeesPage() {
  const supabase = createSupabaseBrowser();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(true);
  const [registerOpen, setRegisterOpen] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [crewId, setCrewId] = useState("");
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);

    const [{ data: employeeData }, { data: crewData }] = await Promise.all([
      supabase.from("employees").select("*").order("full_name"),
      supabase
        .from("crews")
        .select("id, crew_number, crew_name")
        .order("crew_number"),
    ]);

    setEmployees((employeeData || []) as Employee[]);
    setCrews((crewData || []) as Crew[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  const activeCount = useMemo(
    () => employees.filter((e) => e.active !== false).length,
    [employees]
  );

  function resetForm() {
    setEditingId(null);
    setFullName("");
    setRole("");
    setCrewId("");
    setActive(true);
    setNotes("");
  }

  function editEmployee(employee: Employee) {
    setEditingId(employee.id);
    setFullName(employee.full_name || "");
    setRole(employee.role || "");
    setCrewId(employee.crew_id || "");
    setActive(employee.active !== false);
    setNotes(employee.notes || "");
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveEmployee() {
    if (!fullName.trim()) {
      alert("Enter worker full name");
      return;
    }

    const duplicate = employees.some(
      (e) =>
        e.id !== editingId &&
        e.full_name.trim().toLowerCase() === fullName.trim().toLowerCase()
    );

    if (duplicate) {
      alert("A worker with this name already exists.");
      return;
    }

    const payload = {
      full_name: fullName.trim(),
      role: role.trim() || null,
      crew_id: crewId || null,
      active,
      notes: notes.trim() || null,
    };

    const res = editingId
      ? await supabase.from("employees").update(payload).eq("id", editingId)
      : await supabase.from("employees").insert(payload);

    if (res.error) {
      alert(res.error.message);
      return;
    }

    resetForm();
    await loadData();
  }

  async function deleteEmployee(id: string) {
    if (!confirm("Delete this worker profile?")) return;

    const { error } = await supabase.from("employees").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  }

  function crewLabel(crewIdValue: string | null) {
    if (!crewIdValue) return "Unassigned";

    const crew = crews.find((c) => c.id === crewIdValue);
    if (!crew) return "Unassigned";

    return `${crew.crew_number}${crew.crew_name ? ` - ${crew.crew_name}` : ""}`;
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

            <h1 className="text-3xl font-bold mt-4">Worker Profiles</h1>
            <p className="text-slate-500">
              Basic operational worker profiles used for crews and daily dockets.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Metric label="Total Workers" value={String(employees.length)} />
            <Metric label="Active" value={String(activeCount)} />
          </div>
        </div>

        <section className="bg-white border rounded-3xl shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className="w-full px-5 py-4 flex justify-between items-center text-left"
          >
            <div>
              <h2 className="text-xl font-bold">
                {editingId ? "Edit Worker Profile" : "Create Worker Profile"}
              </h2>
              <p className="text-sm text-slate-500">
                Full name, role, linked crew and basic notes only.
              </p>
            </div>

            <span className="text-xl">{formOpen ? "−" : "+"}</span>
          </button>

          {formOpen && (
            <div className="border-t p-5 space-y-4">
              <div className="grid md:grid-cols-5 gap-3">
                <Input label="Full Name" value={fullName} onChange={setFullName} />
                <Input label="Role / Trade" value={role} onChange={setRole} />

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Linked Crew
                  </label>
                  <select
                    className="border rounded-xl p-3 w-full"
                    value={crewId}
                    onChange={(e) => setCrewId(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {crews.map((crew) => (
                      <option key={crew.id} value={crew.id}>
                        {crew.crew_number}
                        {crew.crew_name ? ` - ${crew.crew_name}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    className="border rounded-xl p-3 w-full"
                    value={active ? "active" : "inactive"}
                    onChange={(e) => setActive(e.target.value === "active")}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <Input label="Notes" value={notes} onChange={setNotes} />
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={saveEmployee}
                  className="bg-slate-900 text-white px-5 py-3 rounded-xl font-semibold"
                >
                  {editingId ? "Update Worker" : "Create Worker"}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="border px-5 py-3 rounded-xl font-semibold"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="bg-white border rounded-3xl shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setRegisterOpen((v) => !v)}
            className="w-full px-5 py-4 flex justify-between items-center text-left"
          >
            <div>
              <h2 className="text-xl font-bold">Worker Register</h2>
              <p className="text-sm text-slate-500">
                View, edit or delete worker profiles.
              </p>
            </div>

            <span className="text-xl">{registerOpen ? "−" : "+"}</span>
          </button>

          {registerOpen && (
            <div className="border-t">
              {loading ? (
                <div className="p-5 text-slate-500">Loading...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-left">
                      <tr>
                        <th className="p-3">Worker</th>
                        <th className="p-3">Role</th>
                        <th className="p-3">Crew</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Notes</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {employees.map((employee) => (
                        <tr key={employee.id} className="border-t">
                          <td className="p-3 font-semibold">{employee.full_name}</td>
                          <td className="p-3">{employee.role || "—"}</td>
                          <td className="p-3">{crewLabel(employee.crew_id)}</td>
                          <td className="p-3">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                employee.active !== false
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {employee.active !== false ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="p-3">{employee.notes || "—"}</td>
                          <td className="p-3">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => editEmployee(employee)}
                                className="border px-3 py-2 rounded-lg"
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => deleteEmployee(employee.id)}
                                className="border px-3 py-2 rounded-lg text-red-600"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {employees.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-5 text-center text-slate-500">
                            No worker profiles created yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        className="border rounded-xl p-3 w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border rounded-2xl px-5 py-4 shadow-sm min-w-35">
      <p className="text-xs uppercase text-slate-400">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
}
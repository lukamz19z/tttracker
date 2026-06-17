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
  shirt_size: string | null;
  jacket_size: string | null;
  glove_size: string | null;
  pants_size: string | null;
};

const shirtSizes = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
const jacketSizes = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
const gloveSizes = ["S", "M", "L", "XL", "2XL"];

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

  const [shirtSize, setShirtSize] = useState("");
  const [jacketSize, setJacketSize] = useState("");
  const [gloveSize, setGloveSize] = useState("");
  const [pantsSize, setPantsSize] = useState("");

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
    [employees],
  );

  function resetForm() {
    setEditingId(null);
    setFullName("");
    setRole("");
    setCrewId("");
    setActive(true);
    setNotes("");
    setShirtSize("");
    setJacketSize("");
    setGloveSize("");
    setPantsSize("");
  }

  function editEmployee(employee: Employee) {
    setEditingId(employee.id);
    setFullName(employee.full_name || "");
    setRole(employee.role || "");
    setCrewId(employee.crew_id || "");
    setActive(employee.active !== false);
    setNotes(employee.notes || "");
    setShirtSize(employee.shirt_size || "");
    setJacketSize(employee.jacket_size || "");
    setGloveSize(employee.glove_size || "");
    setPantsSize(employee.pants_size || "");
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
        e.full_name.trim().toLowerCase() === fullName.trim().toLowerCase(),
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
      shirt_size: shirtSize || null,
      jacket_size: jacketSize || null,
      glove_size: gloveSize || null,
      pants_size: pantsSize.trim() || null,
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
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-slate-50"
            >
              ← Back to Admin
            </Link>

            <h1 className="mt-4 text-3xl font-bold">Worker Profiles</h1>
            <p className="text-slate-500">
              Worker profiles, crew allocation and PPE sizing for live inventory
              minimums.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Metric label="Total Workers" value={String(employees.length)} />
            <Metric label="Active" value={String(activeCount)} />
          </div>
        </div>

        <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <div>
              <h2 className="text-xl font-bold">
                {editingId ? "Edit Worker Profile" : "Create Worker Profile"}
              </h2>
              <p className="text-sm text-slate-500">
                Record crew details and PPE sizing for inventory forecasting.
              </p>
            </div>

            <span className="text-xl">{formOpen ? "−" : "+"}</span>
          </button>

          {formOpen && (
            <div className="space-y-5 border-t p-5">
              <section>
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
                  Worker Details
                </h3>

                <div className="grid gap-3 md:grid-cols-5">
                  <Input label="Full Name" value={fullName} onChange={setFullName} />
                  <Input label="Role / Trade" value={role} onChange={setRole} />

                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Linked Crew
                    </label>
                    <select
                      className="w-full rounded-xl border p-3"
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
                    <label className="mb-1 block text-sm font-medium">Status</label>
                    <select
                      className="w-full rounded-xl border p-3"
                      value={active ? "active" : "inactive"}
                      onChange={(e) => setActive(e.target.value === "active")}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  <Input label="Notes" value={notes} onChange={setNotes} />
                </div>
              </section>

              <section className="rounded-2xl border bg-slate-50 p-4">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
                  PPE Sizing
                </h3>

                <div className="grid gap-3 md:grid-cols-4">
                  <SelectInput
                    label="Shirt Size"
                    value={shirtSize}
                    onChange={setShirtSize}
                    options={shirtSizes}
                  />

                  <SelectInput
                    label="Jacket Size"
                    value={jacketSize}
                    onChange={setJacketSize}
                    options={jacketSizes}
                  />

                  <SelectInput
                    label="Glove Size"
                    value={gloveSize}
                    onChange={setGloveSize}
                    options={gloveSizes}
                  />

                  <Input
                    label="Pants Size"
                    value={pantsSize}
                    onChange={setPantsSize}
                    placeholder="e.g. 87R, 92, 97L"
                  />
                </div>

                <p className="mt-3 text-sm text-slate-500">
                  These sizes can be used by Inventory to calculate live minimum
                  stock for shirts, jackets, gloves and pants.
                </p>
              </section>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveEmployee}
                  className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white"
                >
                  {editingId ? "Update Worker" : "Create Worker"}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl border px-5 py-3 font-semibold"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setRegisterOpen((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <div>
              <h2 className="text-xl font-bold">Worker Register</h2>
              <p className="text-sm text-slate-500">
                View, edit or delete worker profiles and PPE sizing.
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
                  <table className="w-full min-w-[1000px] text-sm">
                    <thead className="bg-slate-100 text-left">
                      <tr>
                        <th className="p-3">Worker</th>
                        <th className="p-3">Role</th>
                        <th className="p-3">Crew</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">PPE Sizes</th>
                        <th className="p-3">Notes</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {employees.map((employee) => (
                        <tr key={employee.id} className="border-t">
                          <td className="p-3 font-semibold">
                            {employee.full_name}
                          </td>
                          <td className="p-3">{employee.role || "—"}</td>
                          <td className="p-3">{crewLabel(employee.crew_id)}</td>
                          <td className="p-3">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                employee.active !== false
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {employee.active !== false ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="grid gap-1 text-xs text-slate-600">
                              <span>
                                <strong>Shirt:</strong>{" "}
                                {employee.shirt_size || "—"}
                              </span>
                              <span>
                                <strong>Jacket:</strong>{" "}
                                {employee.jacket_size || "—"}
                              </span>
                              <span>
                                <strong>Gloves:</strong>{" "}
                                {employee.glove_size || "—"}
                              </span>
                              <span>
                                <strong>Pants:</strong>{" "}
                                {employee.pants_size || "—"}
                              </span>
                            </div>
                          </td>
                          <td className="p-3">{employee.notes || "—"}</td>
                          <td className="p-3">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => editEmployee(employee)}
                                className="rounded-lg border px-3 py-2"
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => deleteEmployee(employee.id)}
                                className="rounded-lg border px-3 py-2 text-red-600"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {employees.length === 0 && (
                        <tr>
                          <td
                            colSpan={7}
                            className="p-5 text-center text-slate-500"
                          >
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
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <input
        className="w-full rounded-xl border p-3"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <select
        className="w-full rounded-xl border bg-white p-3"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Not recorded</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-35 rounded-2xl border bg-white px-5 py-4 shadow-sm">
      <p className="text-xs uppercase text-slate-400">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
}
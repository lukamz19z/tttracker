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

function clean(value: string | number | null | undefined) {
  return String(value ?? "").trim();
}

function csvSafe(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export default function EmployeesPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

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

  const [search, setSearch] = useState("");
  const [crewFilter, setCrewFilter] = useState("All Crews");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [ppeFilter, setPpeFilter] = useState("All PPE Records");

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

const crewLabel = useCallback(
  (crewIdValue: string | null) => {
    if (!crewIdValue) return "Unassigned";

    const crew = crews.find((c) => c.id === crewIdValue);
    if (!crew) return "Unassigned";

    return `${crew.crew_number}${
      crew.crew_name ? ` - ${crew.crew_name}` : ""
    }`;
  },
  [crews],
);

  function hasMissingPpe(employee: Employee) {
    return (
      !clean(employee.shirt_size) ||
      !clean(employee.jacket_size) ||
      !clean(employee.glove_size) ||
      !clean(employee.pants_size)
    );
  }

  const missingPpeCount = useMemo(
    () => employees.filter((employee) => employee.active !== false && hasMissingPpe(employee)).length,
    [employees],
  );

  const crewOptions = useMemo(() => {
    return [
      "All Crews",
      ...Array.from(new Set(employees.map((employee) => crewLabel(employee.crew_id)))).sort(),
    ];
}, [employees, crewLabel]);

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();

    return employees.filter((employee) => {
      const crew = crewLabel(employee.crew_id);
      const status = employee.active !== false ? "Active" : "Inactive";
      const missingPpe = hasMissingPpe(employee);

      const searchable = [
        employee.full_name,
        employee.role,
        crew,
        status,
        employee.notes,
        employee.shirt_size,
        employee.jacket_size,
        employee.glove_size,
        employee.pants_size,
      ]
        .join(" ")
        .toLowerCase();

      return (
        searchable.includes(term) &&
        (crewFilter === "All Crews" || crew === crewFilter) &&
        (statusFilter === "All Statuses" || status === statusFilter) &&
        (ppeFilter === "All PPE Records" ||
          (ppeFilter === "Missing PPE Sizes" && missingPpe) ||
          (ppeFilter === "Complete PPE Sizes" && !missingPpe))
      );
    });
 }, [
  employees,
  search,
  crewFilter,
  statusFilter,
  ppeFilter,
  crewLabel,
]);

  const printedAt = new Date().toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const printFilterSummary = [
    search ? `Search: ${search}` : null,
    crewFilter !== "All Crews" ? `Crew: ${crewFilter}` : null,
    statusFilter !== "All Statuses" ? `Status: ${statusFilter}` : null,
    ppeFilter !== "All PPE Records" ? `PPE: ${ppeFilter}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

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

  function exportCsv() {
    const headers = [
      "Worker",
      "Role",
      "Crew",
      "Status",
      "Shirt Size",
      "Jacket Size",
      "Glove Size",
      "Pants Size",
      "PPE Complete",
      "Notes",
    ];

    const rows = filteredEmployees.map((employee) => [
      clean(employee.full_name),
      clean(employee.role),
      crewLabel(employee.crew_id),
      employee.active !== false ? "Active" : "Inactive",
      clean(employee.shirt_size),
      clean(employee.jacket_size),
      clean(employee.glove_size),
      clean(employee.pants_size),
      hasMissingPpe(employee) ? "No" : "Yes",
      clean(employee.notes),
    ]);

    const csv = [
      headers.map(csvSafe).join(","),
      ...rows.map((row) => row.map(csvSafe).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `worker-ppe-register-${date}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  function printRegister() {
    window.print();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-slate-50"
            >
              ← Back to Admin
            </Link>

            <h1 className="mt-4 text-3xl font-bold">Worker Profiles</h1>
            <p className="text-slate-500">
              Worker profiles, crew allocation and PPE sizing for live inventory minimums.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Metric label="Total Workers" value={String(employees.length)} />
            <Metric label="Active" value={String(activeCount)} />
            <Metric label="Missing PPE" value={String(missingPpeCount)} />
          </div>
        </div>

        <section className="overflow-hidden rounded-3xl border bg-white shadow-sm print:hidden">
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
                    <label className="mb-1 block text-sm font-medium">Linked Crew</label>
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
                  These sizes can be used by Inventory to calculate live minimum stock for shirts,
                  jackets, gloves and pants.
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

        <section className="overflow-hidden rounded-3xl border bg-white shadow-sm print:hidden">
          <button
            type="button"
            onClick={() => setRegisterOpen((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <div>
              <h2 className="text-xl font-bold">Worker Register</h2>
              <p className="text-sm text-slate-500">
                Filter, export or print worker PPE sizing sheets.
              </p>
            </div>

            <span className="text-xl">{registerOpen ? "−" : "+"}</span>
          </button>

          {registerOpen && (
            <div className="border-t">
              <div className="grid gap-3 border-b bg-slate-50 p-5 md:grid-cols-5">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search worker, role, size..."
                  className="rounded-xl border bg-white p-3 text-sm"
                />

                <select
                  value={crewFilter}
                  onChange={(e) => setCrewFilter(e.target.value)}
                  className="rounded-xl border bg-white p-3 text-sm"
                >
                  {crewOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border bg-white p-3 text-sm"
                >
                  <option>All Statuses</option>
                  <option>Active</option>
                  <option>Inactive</option>
                </select>

                <select
                  value={ppeFilter}
                  onChange={(e) => setPpeFilter(e.target.value)}
                  className="rounded-xl border bg-white p-3 text-sm"
                >
                  <option>All PPE Records</option>
                  <option>Missing PPE Sizes</option>
                  <option>Complete PPE Sizes</option>
                </select>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={exportCsv}
                    disabled={filteredEmployees.length === 0}
                    className="rounded-xl border bg-white px-4 py-3 text-sm font-semibold disabled:opacity-50"
                  >
                    Export CSV
                  </button>

                  <button
                    type="button"
                    onClick={printRegister}
                    disabled={filteredEmployees.length === 0}
                    className="rounded-xl border bg-white px-4 py-3 text-sm font-semibold disabled:opacity-50"
                  >
                    Print PDF
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="p-5 text-slate-500">Loading...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1050px] text-sm">
                    <thead className="bg-slate-100 text-left">
                      <tr>
                        <th className="p-3">Worker</th>
                        <th className="p-3">Role</th>
                        <th className="p-3">Crew</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Shirt</th>
                        <th className="p-3">Jacket</th>
                        <th className="p-3">Gloves</th>
                        <th className="p-3">Pants</th>
                        <th className="p-3">Notes</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredEmployees.map((employee) => (
                        <tr
                          key={employee.id}
                          className={`border-t ${hasMissingPpe(employee) ? "bg-amber-50/50" : ""}`}
                        >
                          <td className="p-3 font-semibold">{employee.full_name}</td>
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
                          <td className="p-3">{employee.shirt_size || "—"}</td>
                          <td className="p-3">{employee.jacket_size || "—"}</td>
                          <td className="p-3">{employee.glove_size || "—"}</td>
                          <td className="p-3">{employee.pants_size || "—"}</td>
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

                      {filteredEmployees.length === 0 && (
                        <tr>
                          <td colSpan={10} className="p-5 text-center text-slate-500">
                            No worker profiles match the current filters.
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

        <section className="print-area hidden">
          <div className="mb-4">
            <h1 className="text-xl font-black text-slate-950">Worker PPE Register</h1>
            <p className="mt-1 text-sm font-semibold text-slate-700">
              {filteredEmployees.length} filtered worker(s)
            </p>
            <p className="mt-1 text-xs text-slate-500">Printed: {printedAt}</p>
            <p className="mt-1 text-xs text-slate-500">
              Filters: {printFilterSummary || "All workers"}
            </p>
          </div>

          <table className="w-full border-collapse text-left text-[10px]">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Role</th>
                <th>Crew</th>
                <th>Status</th>
                <th>Shirt</th>
                <th>Jacket</th>
                <th>Gloves</th>
                <th>Pants</th>
                <th>Notes</th>
              </tr>
            </thead>

            <tbody>
              {filteredEmployees.map((employee) => (
                <tr key={employee.id}>
                  <td>{employee.full_name}</td>
                  <td>{employee.role || "-"}</td>
                  <td>{crewLabel(employee.crew_id)}</td>
                  <td>{employee.active !== false ? "Active" : "Inactive"}</td>
                  <td>{employee.shirt_size || ""}</td>
                  <td>{employee.jacket_size || ""}</td>
                  <td>{employee.glove_size || ""}</td>
                  <td>{employee.pants_size || ""}</td>
                  <td>{employee.notes || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <style jsx global>{`
          @media print {
            body * {
              visibility: hidden;
            }

            .print-area,
            .print-area * {
              visibility: visible;
            }

            .print-area {
              display: block !important;
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              padding: 12px;
              background: white;
            }

            .print-area table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }

            .print-area th,
            .print-area td {
              border: 1px solid #cbd5e1;
              padding: 4px 5px;
              vertical-align: top;
              line-height: 1.25;
              word-break: break-word;
            }

            .print-area th {
              background: #f1f5f9;
              font-weight: 800;
              text-transform: uppercase;
            }

            @page {
              size: landscape;
              margin: 8mm;
            }
          }
        `}</style>
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
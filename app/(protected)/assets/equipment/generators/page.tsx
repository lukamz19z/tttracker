/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Edit,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { createSupabaseBrowser } from "../../../../../lib/supabase";
import { PageHeader, PageShell, RegisterList } from "../../components";

type Crew = {
  id: string;
  crew_number: string;
  crew_name: string | null;
  active?: boolean | null;
};

type Generator = {
  id: string;
  generator_number: string;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  kva: string | null;
  fuel_type: string | null;
  current_hours: number | null;
  last_service_date: string | null;
  next_service_due_hours: number | null;
  crew_id: string | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type FormState = {
  make: string;
  model: string;
  serial_number: string;
  kva: string;
  fuel_type: string;
  current_hours: string;
  last_service_date: string;
  next_service_due_hours: string;
  crew_id: string;
  status: string;
  notes: string;
};

const blankForm: FormState = {
  make: "",
  model: "",
  serial_number: "",
  kva: "",
  fuel_type: "Diesel",
  current_hours: "",
  last_service_date: "",
  next_service_due_hours: "",
  crew_id: "",
  status: "Active",
  notes: "",
};

const fuelTypeOptions = ["Diesel", "Petrol", "Other"];

const statusOptions = ["Active", "Out of Service", "Missing", "Retired"];

function clean(value: string | number | null | undefined) {
  return String(value ?? "").trim();
}

function crewLabel(crew: Crew) {
  return `${crew.crew_number}${crew.crew_name ? ` - ${crew.crew_name}` : ""}`;
}

function csvSafe(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function formatShortDate(value: string | null) {
  if (!value) return "No date";

  return new Date(value).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toNumberOrNull(value: string) {
  const number = Number(value);

  if (!value || Number.isNaN(number)) return null;

  return number;
}

function getNextGeneratorNumber(items: Generator[]) {
  const highest = items.reduce((max, item) => {
    const match = clean(item.generator_number).match(/^GEN-(\d+)$/i);
    if (!match) return max;

    const number = Number(match[1]);
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);

  return `GEN-${String(highest + 1).padStart(3, "0")}`;
}

function getServiceStatus(currentHours: number | null, nextServiceDueHours: number | null) {
  if (currentHours === null || nextServiceDueHours === null) {
    return {
      label: "No Service Setup",
      className: "border-slate-200 bg-slate-50 text-slate-700",
    };
  }

  const hoursRemaining = nextServiceDueHours - currentHours;

  if (hoursRemaining < 0) {
    return {
      label: "Overdue",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  if (hoursRemaining <= 25) {
    return {
      label: "Due Soon",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: "Current",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}

function statusClass(status: string | null) {
  const value = clean(status).toLowerCase();

  if (value === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "out of service") return "border-rose-200 bg-rose-50 text-rose-700";
  if (value === "missing") return "border-amber-200 bg-amber-50 text-amber-700";
  if (value === "retired") return "border-slate-200 bg-slate-50 text-slate-700";

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold ${className}`}
    >
      {label}
    </span>
  );
}

export default function GeneratorsPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [items, setItems] = useState<Generator[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [crewFilter, setCrewFilter] = useState("All Crews");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [fuelFilter, setFuelFilter] = useState("All Fuel Types");
  const [serviceFilter, setServiceFilter] = useState("All Service");

  const [form, setForm] = useState<FormState>(blankForm);

  const nextNumber = useMemo(() => getNextGeneratorNumber(items), [items]);

  const crewById = useMemo(() => {
    return new Map(crews.map((crew) => [crew.id, crew]));
  }, [crews]);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [generatorsResult, crewsResult] = await Promise.all([
      supabase
        .from("equipment_generators")
        .select("*")
        .order("generator_number", { ascending: true }),
      supabase
        .from("crews")
        .select("id, crew_number, crew_name, active")
        .order("crew_number", { ascending: true }),
    ]);

    if (generatorsResult.error) {
      console.error("Failed to load generators:", generatorsResult.error.message);
      setItems([]);
    } else {
      setItems((generatorsResult.data ?? []) as Generator[]);
    }

    if (crewsResult.error) {
      console.error("Failed to load crews:", crewsResult.error.message);
      setCrews([]);
    } else {
      setCrews(
        ((crewsResult.data ?? []) as Crew[]).filter(
          (crew) => crew.active !== false,
        ),
      );
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const crewOptions = useMemo(() => {
    return [
      "All Crews",
      ...Array.from(new Set(crews.map(crewLabel).filter(Boolean))).sort(),
    ];
  }, [crews]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();

    return items.filter((item) => {
      const crew = item.crew_id ? crewById.get(item.crew_id) : null;
      const crewText = crew ? crewLabel(crew) : "Unallocated";
      const serviceStatus = getServiceStatus(
        item.current_hours,
        item.next_service_due_hours,
      ).label;

      const searchable = [
        item.generator_number,
        item.make,
        item.model,
        item.serial_number,
        item.kva,
        item.fuel_type,
        item.current_hours,
        item.next_service_due_hours,
        item.status,
        item.notes,
        crewText,
        serviceStatus,
      ]
        .join(" ")
        .toLowerCase();

      return (
        searchable.includes(term) &&
        (crewFilter === "All Crews" || crewText === crewFilter) &&
        (statusFilter === "All Statuses" || clean(item.status) === statusFilter) &&
        (fuelFilter === "All Fuel Types" || clean(item.fuel_type) === fuelFilter) &&
        (serviceFilter === "All Service" || serviceStatus === serviceFilter)
      );
    });
  }, [
    items,
    search,
    crewFilter,
    statusFilter,
    fuelFilter,
    serviceFilter,
    crewById,
  ]);

  function openAddForm() {
    setEditingId(null);
    setForm(blankForm);
    setShowForm(true);
  }

  function openEditForm(item: Generator) {
    setEditingId(item.id);
    setForm({
      make: clean(item.make),
      model: clean(item.model),
      serial_number: clean(item.serial_number),
      kva: clean(item.kva),
      fuel_type: clean(item.fuel_type) || "Diesel",
      current_hours:
        item.current_hours === null || item.current_hours === undefined
          ? ""
          : String(item.current_hours),
      last_service_date: clean(item.last_service_date),
      next_service_due_hours:
        item.next_service_due_hours === null ||
        item.next_service_due_hours === undefined
          ? ""
          : String(item.next_service_due_hours),
      crew_id: clean(item.crew_id),
      status: clean(item.status) || "Active",
      notes: clean(item.notes),
    });
    setShowForm(true);
  }

  function closeForm() {
    setEditingId(null);
    setForm(blankForm);
    setShowForm(false);
  }

  async function handleSave() {
    setSaving(true);

    const payload = {
      make: clean(form.make) || null,
      model: clean(form.model) || null,
      serial_number: clean(form.serial_number) || null,
      kva: clean(form.kva) || null,
      fuel_type: clean(form.fuel_type) || null,
      current_hours: toNumberOrNull(form.current_hours),
      last_service_date: clean(form.last_service_date) || null,
      next_service_due_hours: toNumberOrNull(form.next_service_due_hours),
      crew_id: clean(form.crew_id) || null,
      status: clean(form.status) || "Active",
      notes: clean(form.notes) || null,
      updated_at: new Date().toISOString(),
    };

    if (!editingId) {
      const { error } = await supabase.from("equipment_generators").insert({
        generator_number: nextNumber,
        ...payload,
      });

      if (error) {
        alert(`Failed to save generator: ${error.message}`);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase
        .from("equipment_generators")
        .update(payload)
        .eq("id", editingId);

      if (error) {
        alert(`Failed to update generator: ${error.message}`);
        setSaving(false);
        return;
      }
    }

    closeForm();
    await loadData();
    setSaving(false);
  }

  async function handleDelete(item: Generator) {
    const confirmed = window.confirm(
      `Delete ${item.generator_number} from the generator register?`,
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("equipment_generators")
      .delete()
      .eq("id", item.id);

    if (error) {
      alert(`Failed to delete generator: ${error.message}`);
      return;
    }

    await loadData();
  }

  function exportCsv() {
    const headers = [
      "Generator Number",
      "Make",
      "Model",
      "Serial Number",
      "kVA",
      "Fuel Type",
      "Current Hours",
      "Last Service Date",
      "Next Service Due Hours",
      "Service Status",
      "Crew",
      "Status",
      "Notes",
    ];

    const rows = filteredItems.map((item) => {
      const crew = item.crew_id ? crewById.get(item.crew_id) : null;

      return [
        clean(item.generator_number),
        clean(item.make),
        clean(item.model),
        clean(item.serial_number),
        clean(item.kva),
        clean(item.fuel_type),
        clean(item.current_hours),
        clean(item.last_service_date),
        clean(item.next_service_due_hours),
        getServiceStatus(item.current_hours, item.next_service_due_hours).label,
        crew ? crewLabel(crew) : "Unallocated",
        clean(item.status) || "Active",
        clean(item.notes),
      ];
    });

    const csv = [
      headers.map(csvSafe).join(","),
      ...rows.map((row) => row.map(csvSafe).join(",")),
    ].join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `generators-${date}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Equipment Register"
        title="Generators"
        description="Track generator IDs, serial numbers, kVA, fuel type, service hours and crew allocation."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            <button
              type="button"
              onClick={exportCsv}
              disabled={filteredItems.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} />
              Export CSV
            </button>

            <button
              type="button"
              onClick={openAddForm}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus size={16} />
              Add Generator
            </button>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Total Generators
          </p>
          <p className="mt-2 text-3xl font-black text-slate-950">
            {items.length}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Registered generators.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-black text-slate-950">
              Generator Register
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {loading
                ? "Loading generators..."
                : `${filteredItems.length} of ${items.length} generators shown`}
            </p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <div className="relative md:col-span-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search GEN number, make, model..."
                className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
              />
            </div>

            <select
              value={crewFilter}
              onChange={(event) => setCrewFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              {crewOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              <option>All Statuses</option>
              {statusOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>

            <select
              value={fuelFilter}
              onChange={(event) => setFuelFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              <option>All Fuel Types</option>
              {fuelTypeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>

            <select
              value={serviceFilter}
              onChange={(event) => setServiceFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              <option>All Service</option>
              <option>Current</option>
              <option>Due Soon</option>
              <option>Overdue</option>
              <option>No Service Setup</option>
            </select>
          </div>
        </div>
      </section>

      <RegisterList
        title="Registered Generators"
        description={
          loading
            ? "Loading generators..."
            : `${filteredItems.length} generators shown`
        }
        items={filteredItems}
        getKey={(item) => item.id}
        columns={[
          {
            label: "Generator",
            render: (item) => (
              <div>
                <p className="font-black text-slate-950">
                  {item.generator_number}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {[clean(item.make), clean(item.model)].filter(Boolean).join(" ") ||
                    "No make/model"}
                </p>
              </div>
            ),
          },
          {
            label: "Serial / kVA",
            render: (item) => (
              <div>
                <p className="font-semibold text-slate-950">
                  {clean(item.serial_number) || "No serial"}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {clean(item.kva) ? `${clean(item.kva)} kVA` : "No kVA"}
                </p>
              </div>
            ),
          },
          {
            label: "Fuel",
            render: (item) => clean(item.fuel_type) || "—",
          },
          {
            label: "Service",
            render: (item) => {
              const service = getServiceStatus(
                item.current_hours,
                item.next_service_due_hours,
              );

              return (
                <div>
                  <p className="font-semibold text-slate-950">
                    {item.current_hours ?? "—"} hrs
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Due: {item.next_service_due_hours ?? "—"} hrs
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Last service: {formatShortDate(item.last_service_date)}
                  </p>
                  <div className="mt-1">
                    <Pill label={service.label} className={service.className} />
                  </div>
                </div>
              );
            },
          },
          {
            label: "Crew",
            render: (item) => {
              const crew = item.crew_id ? crewById.get(item.crew_id) : null;
              return crew ? crewLabel(crew) : "Unallocated";
            },
          },
          {
            label: "Status",
            render: (item) => (
              <Pill
                label={clean(item.status) || "Active"}
                className={statusClass(item.status)}
              />
            ),
          },
          {
            label: "Notes",
            render: (item) => clean(item.notes) || "—",
          },
          {
            label: "Actions",
            render: (item) => (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openEditForm(item)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <Edit size={14} />
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => void handleDelete(item)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 shadow-sm hover:bg-rose-100"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            ),
          },
        ]}
        renderMobile={(item) => {
          const crew = item.crew_id ? crewById.get(item.crew_id) : null;
          const service = getServiceStatus(
            item.current_hours,
            item.next_service_due_hours,
          );

          return (
            <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-950">
                    {item.generator_number}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {[clean(item.make), clean(item.model)].filter(Boolean).join(" ") ||
                      "No make/model"}
                  </p>
                </div>

                <Pill
                  label={clean(item.status) || "Active"}
                  className={statusClass(item.status)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Serial
                  </p>
                  <p className="font-semibold text-slate-800">
                    {clean(item.serial_number) || "—"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    kVA
                  </p>
                  <p className="font-semibold text-slate-800">
                    {clean(item.kva) || "—"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Fuel
                  </p>
                  <p className="font-semibold text-slate-800">
                    {clean(item.fuel_type) || "—"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Crew
                  </p>
                  <p className="font-semibold text-slate-800">
                    {crew ? crewLabel(crew) : "Unallocated"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Current Hours
                  </p>
                  <p className="font-semibold text-slate-800">
                    {item.current_hours ?? "—"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Service Due
                  </p>
                  <p className="font-semibold text-slate-800">
                    {item.next_service_due_hours ?? "—"}
                  </p>
                </div>

                <div className="col-span-2">
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Service Status
                  </p>
                  <div className="mt-1">
                    <Pill label={service.label} className={service.className} />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openEditForm(item)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                >
                  <Edit size={14} />
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => void handleDelete(item)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </div>
          );
        }}
      />

      {showForm ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4">
          <div className="mx-auto my-6 w-full max-w-4xl rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 rounded-t-3xl border-b border-slate-200 bg-white p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  {editingId ? "Edit Generator" : "New Generator"}
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  {editingId ? "Update Generator" : "Add Generator"}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {editingId
                    ? "Update generator details, service hours and allocation."
                    : `Next asset ID will be ${nextNumber}.`}
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-5 p-5">
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Generator Number
                    <input
                      value={
                        editingId
                          ? items.find((item) => item.id === editingId)
                              ?.generator_number || ""
                          : nextNumber
                      }
                      disabled
                      className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 outline-none"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Serial Number
                    <input
                      value={form.serial_number}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          serial_number: event.target.value,
                        }))
                      }
                      placeholder="Enter serial number"
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Make
                    <input
                      value={form.make}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          make: event.target.value,
                        }))
                      }
                      placeholder="e.g. Honda"
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Model
                    <input
                      value={form.model}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          model: event.target.value,
                        }))
                      }
                      placeholder="e.g. EU70is"
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    kVA
                    <input
                      value={form.kva}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          kva: event.target.value,
                        }))
                      }
                      placeholder="e.g. 7"
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Fuel Type
                    <select
                      value={form.fuel_type}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          fuel_type: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    >
                      {fuelTypeOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Current Hours
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={form.current_hours}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          current_hours: event.target.value,
                        }))
                      }
                      placeholder="e.g. 120.5"
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Next Service Due Hours
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={form.next_service_due_hours}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          next_service_due_hours: event.target.value,
                        }))
                      }
                      placeholder="e.g. 250"
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Last Service Date
                    <input
                      type="date"
                      value={form.last_service_date}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          last_service_date: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Crew Allocation
                    <select
                      value={form.crew_id}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          crew_id: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    >
                      <option value="">Unallocated</option>
                      {crews.map((crew) => (
                        <option key={crew.id} value={crew.id}>
                          {crewLabel(crew)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Status
                    <select
                      value={form.status}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          status: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    >
                      {statusOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                    Notes
                    <textarea
                      value={form.notes}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      rows={4}
                      placeholder="Optional notes..."
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    />
                  </label>
                </div>
              </section>
            </div>

            <div className="flex flex-wrap justify-end gap-2 rounded-b-3xl border-t border-slate-200 bg-white p-5">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-400"
              >
                <Save size={16} />
                {saving ? "Saving..." : editingId ? "Save Changes" : "Save Generator"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
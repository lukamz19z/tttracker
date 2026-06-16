/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
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
  prestart_frequency: string | null;
  crew_id: string | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type FormState = {
  last_service_date: string;
  prestart_frequency: string;
  crew_id: string;
  status: string;
  notes: string;
  make: string;
  model: string;
  serial_number: string;
  kva: string;
  fuel_type: string;
  current_hours: string;
  next_service_due_hours: string;
};

const blankForm: FormState = {
  last_service_date: "",
  prestart_frequency: "Weekly",
  crew_id: "",
  status: "Active",
  notes: "",
  make: "",
  model: "",
  serial_number: "",
  kva: "",
  fuel_type: "Diesel",
  current_hours: "",
  next_service_due_hours: "",
};

const frequencyOptions = ["Weekly", "Monthly", "Not Required"];
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

function statusClass(status: string | null) {
  const value = clean(status).toLowerCase();

  if (value === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (value === "out of service") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (value === "missing") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (value === "retired") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function frequencyClass(frequency: string | null) {
  const value = clean(frequency).toLowerCase();

  if (value === "weekly") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (value === "monthly") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  if (value === "not required") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function serviceClass(lastServiceDate: string | null) {
  if (!lastServiceDate) {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastService = new Date(`${lastServiceDate}T00:00:00`);
  const diffDays = Math.floor(
    (today.getTime() - lastService.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays > 180) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (diffDays > 90) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function serviceLabel(lastServiceDate: string | null) {
  if (!lastServiceDate) return "No service date";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastService = new Date(`${lastServiceDate}T00:00:00`);
  const diffDays = Math.floor(
    (today.getTime() - lastService.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays > 180) return "Review service";
  if (diffDays > 90) return "Service ageing";
  return "Recently serviced";
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
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [crewFilter, setCrewFilter] = useState("All Crews");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [frequencyFilter, setFrequencyFilter] = useState("All Frequencies");

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

      const searchable = [
        item.generator_number,
        item.make,
        item.model,
        item.serial_number,
        item.kva,
        item.fuel_type,
        item.current_hours,
        item.last_service_date,
        item.next_service_due_hours,
        item.prestart_frequency,
        item.status,
        item.notes,
        crewText,
      ]
        .join(" ")
        .toLowerCase();

      return (
        searchable.includes(term) &&
        (crewFilter === "All Crews" || crewText === crewFilter) &&
        (statusFilter === "All Statuses" || clean(item.status) === statusFilter) &&
        (frequencyFilter === "All Frequencies" ||
          clean(item.prestart_frequency) === frequencyFilter)
      );
    });
  }, [items, search, crewFilter, statusFilter, frequencyFilter, crewById]);

  function openAddForm() {
    setEditingId(null);
    setForm(blankForm);
    setMoreDetailsOpen(false);
    setShowForm(true);
  }

  function openEditForm(item: Generator) {
    setEditingId(item.id);
    setForm({
      last_service_date: clean(item.last_service_date),
      prestart_frequency: clean(item.prestart_frequency) || "Weekly",
      crew_id: clean(item.crew_id),
      status: clean(item.status) || "Active",
      notes: clean(item.notes),
      make: clean(item.make),
      model: clean(item.model),
      serial_number: clean(item.serial_number),
      kva: clean(item.kva),
      fuel_type: clean(item.fuel_type) || "Diesel",
      current_hours:
        item.current_hours === null || item.current_hours === undefined
          ? ""
          : String(item.current_hours),
      next_service_due_hours:
        item.next_service_due_hours === null ||
        item.next_service_due_hours === undefined
          ? ""
          : String(item.next_service_due_hours),
    });
    setMoreDetailsOpen(false);
    setShowForm(true);
  }

  function closeForm() {
    setEditingId(null);
    setForm(blankForm);
    setMoreDetailsOpen(false);
    setShowForm(false);
  }

  async function handleSave() {
    setSaving(true);

    const payload = {
      last_service_date: clean(form.last_service_date) || null,
      prestart_frequency: clean(form.prestart_frequency) || "Weekly",
      crew_id: clean(form.crew_id) || null,
      status: clean(form.status) || "Active",
      notes: clean(form.notes) || null,
      make: clean(form.make) || null,
      model: clean(form.model) || null,
      serial_number: clean(form.serial_number) || null,
      kva: clean(form.kva) || null,
      fuel_type: clean(form.fuel_type) || null,
      current_hours: toNumberOrNull(form.current_hours),
      next_service_due_hours: toNumberOrNull(form.next_service_due_hours),
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
      "Asset ID",
      "Last Service",
      "Prestart Frequency",
      "Crew",
      "Status",
      "Notes",
      "Make",
      "Model",
      "Serial Number",
      "kVA",
      "Fuel Type",
      "Current Hours",
      "Next Service Due Hours",
    ];

    const rows = filteredItems.map((item) => {
      const crew = item.crew_id ? crewById.get(item.crew_id) : null;

      return [
        clean(item.generator_number),
        clean(item.last_service_date),
        clean(item.prestart_frequency),
        crew ? crewLabel(crew) : "Unallocated",
        clean(item.status) || "Active",
        clean(item.notes),
        clean(item.make),
        clean(item.model),
        clean(item.serial_number),
        clean(item.kva),
        clean(item.fuel_type),
        clean(item.current_hours),
        clean(item.next_service_due_hours),
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
        description="Track generator asset IDs, last service, prestart frequency, crew allocation and status."
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

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search GEN number, crew, notes..."
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
              value={frequencyFilter}
              onChange={(event) => setFrequencyFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              <option>All Frequencies</option>
              {frequencyOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
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
            label: "Asset ID",
            render: (item) => (
              <div>
                <p className="font-black text-slate-950">
                  {item.generator_number}
                </p>
                {(clean(item.make) || clean(item.model) || clean(item.serial_number)) ? (
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {[clean(item.make), clean(item.model), clean(item.serial_number)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            ),
          },
          {
            label: "Last Service",
            render: (item) => (
              <div>
                <p className="font-semibold text-slate-950">
                  {formatShortDate(item.last_service_date)}
                </p>
                <div className="mt-1">
                  <Pill
                    label={serviceLabel(item.last_service_date)}
                    className={serviceClass(item.last_service_date)}
                  />
                </div>
              </div>
            ),
          },
          {
            label: "Prestart Frequency",
            render: (item) => (
              <Pill
                label={clean(item.prestart_frequency) || "Weekly"}
                className={frequencyClass(item.prestart_frequency)}
              />
            ),
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

          return (
            <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-950">
                    {item.generator_number}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {crew ? crewLabel(crew) : "Unallocated"}
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
                    Last Service
                  </p>
                  <p className="font-semibold text-slate-800">
                    {formatShortDate(item.last_service_date)}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Prestart
                  </p>
                  <div className="mt-1">
                    <Pill
                      label={clean(item.prestart_frequency) || "Weekly"}
                      className={frequencyClass(item.prestart_frequency)}
                    />
                  </div>
                </div>

                <div className="col-span-2">
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Notes
                  </p>
                  <p className="font-semibold text-slate-800">
                    {clean(item.notes) || "—"}
                  </p>
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
          <div className="mx-auto my-6 w-full max-w-3xl rounded-3xl bg-white shadow-2xl">
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
                    ? "Update generator service, prestart frequency and allocation."
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
                    Asset ID
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
                    Last Service
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
                    Prestart Frequency
                    <select
                      value={form.prestart_frequency}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          prestart_frequency: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    >
                      {frequencyOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
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

              <section className="rounded-2xl border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setMoreDetailsOpen((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left"
                >
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                      Optional Generator Details
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Make, model, serial number, kVA, fuel type and hours.
                    </p>
                  </div>

                  {moreDetailsOpen ? (
                    <ChevronUp size={18} />
                  ) : (
                    <ChevronDown size={18} />
                  )}
                </button>

                {moreDetailsOpen ? (
                  <div className="grid gap-4 border-t border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
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
                  </div>
                ) : null}
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
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Save Changes"
                    : "Save Generator"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
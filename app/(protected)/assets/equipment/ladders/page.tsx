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

type Ladder = {
  id: string;
  ladder_number: string;
  make: string | null;
  ladder_type: string | null;
  height: string | null;
  crew_id: string | null;
  status: string | null;
  last_internal_inspection: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type FormState = {
  make: string;
  ladder_type: string;
  height: string;
  crew_id: string;
  status: string;
  last_internal_inspection: string;
  notes: string;
};

const blankForm: FormState = {
  make: "",
  ladder_type: "Step Ladder",
  height: "",
  crew_id: "",
  status: "Active",
  last_internal_inspection: "",
  notes: "",
};

const ladderTypeOptions = [
  "Step Ladder",
  "Extension Ladder",
  "Platform Ladder",
  "Fibreglass Ladder",
  "Other",
];

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

function getNextLadderNumber(items: Ladder[]) {
  const highest = items.reduce((max, item) => {
    const match = clean(item.ladder_number).match(/^LAD-(\d+)$/i);
    if (!match) return max;

    const number = Number(match[1]);
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);

  return `LAD-${String(highest + 1).padStart(3, "0")}`;
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

function inspectionClass(lastInspection: string | null) {
  if (!lastInspection) {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const inspectionDate = new Date(`${lastInspection}T00:00:00`);
  const diffDays = Math.floor(
    (today.getTime() - inspectionDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays > 90) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (diffDays > 60) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function inspectionLabel(lastInspection: string | null) {
  if (!lastInspection) return "No inspection date";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const inspectionDate = new Date(`${lastInspection}T00:00:00`);
  const diffDays = Math.floor(
    (today.getTime() - inspectionDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays > 90) return "Review inspection";
  if (diffDays > 60) return "Inspection ageing";
  return "Recently inspected";
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

export default function LaddersPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [items, setItems] = useState<Ladder[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [crewFilter, setCrewFilter] = useState("All Crews");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [inspectionFilter, setInspectionFilter] = useState("All Inspections");

  const [form, setForm] = useState<FormState>(blankForm);

  const nextNumber = useMemo(() => getNextLadderNumber(items), [items]);

  const crewById = useMemo(() => {
    return new Map(crews.map((crew) => [crew.id, crew]));
  }, [crews]);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [laddersResult, crewsResult] = await Promise.all([
      supabase
        .from("equipment_ladders")
        .select("*")
        .order("ladder_number", { ascending: true }),
      supabase
        .from("crews")
        .select("id, crew_number, crew_name, active")
        .order("crew_number", { ascending: true }),
    ]);

    if (laddersResult.error) {
      console.error("Failed to load ladders:", laddersResult.error.message);
      setItems([]);
    } else {
      setItems((laddersResult.data ?? []) as Ladder[]);
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

  const typeOptions = useMemo(() => {
    return [
      "All Types",
      ...Array.from(
        new Set([
          ...ladderTypeOptions,
          ...items.map((item) => clean(item.ladder_type)),
        ].filter(Boolean)),
      ).sort(),
    ];
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();

    return items.filter((item) => {
      const crew = item.crew_id ? crewById.get(item.crew_id) : null;
      const crewText = crew ? crewLabel(crew) : "Unallocated";
      const inspectionStatus = inspectionLabel(item.last_internal_inspection);

      const searchable = [
        item.ladder_number,
        item.make,
        item.ladder_type,
        item.height,
        item.status,
        item.notes,
        item.last_internal_inspection,
        crewText,
        inspectionStatus,
      ]
        .join(" ")
        .toLowerCase();

      return (
        searchable.includes(term) &&
        (crewFilter === "All Crews" || crewText === crewFilter) &&
        (statusFilter === "All Statuses" || clean(item.status) === statusFilter) &&
        (typeFilter === "All Types" || clean(item.ladder_type) === typeFilter) &&
        (inspectionFilter === "All Inspections" ||
          inspectionStatus === inspectionFilter)
      );
    });
  }, [
    items,
    search,
    crewFilter,
    statusFilter,
    typeFilter,
    inspectionFilter,
    crewById,
  ]);

  function openAddForm() {
    setEditingId(null);
    setForm(blankForm);
    setShowForm(true);
  }

  function openEditForm(item: Ladder) {
    setEditingId(item.id);
    setForm({
      make: clean(item.make),
      ladder_type: clean(item.ladder_type) || "Step Ladder",
      height: clean(item.height),
      crew_id: clean(item.crew_id),
      status: clean(item.status) || "Active",
      last_internal_inspection: clean(item.last_internal_inspection),
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
      ladder_type: clean(form.ladder_type) || null,
      height: clean(form.height) || null,
      crew_id: clean(form.crew_id) || null,
      status: clean(form.status) || "Active",
      last_internal_inspection: clean(form.last_internal_inspection) || null,
      notes: clean(form.notes) || null,
      updated_at: new Date().toISOString(),
    };

    if (!editingId) {
      const { error } = await supabase.from("equipment_ladders").insert({
        ladder_number: nextNumber,
        ...payload,
      });

      if (error) {
        alert(`Failed to save ladder: ${error.message}`);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase
        .from("equipment_ladders")
        .update(payload)
        .eq("id", editingId);

      if (error) {
        alert(`Failed to update ladder: ${error.message}`);
        setSaving(false);
        return;
      }
    }

    closeForm();
    await loadData();
    setSaving(false);
  }

  async function handleDelete(item: Ladder) {
    const confirmed = window.confirm(
      `Delete ${item.ladder_number} from the ladder register?`,
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("equipment_ladders")
      .delete()
      .eq("id", item.id);

    if (error) {
      alert(`Failed to delete ladder: ${error.message}`);
      return;
    }

    await loadData();
  }

  function exportCsv() {
    const headers = [
      "Asset ID",
      "Make",
      "Ladder Type",
      "Height",
      "Crew",
      "Status",
      "Last Internal Inspection",
      "Inspection Status",
      "Notes",
    ];

    const rows = filteredItems.map((item) => {
      const crew = item.crew_id ? crewById.get(item.crew_id) : null;

      return [
        clean(item.ladder_number),
        clean(item.make),
        clean(item.ladder_type),
        clean(item.height),
        crew ? crewLabel(crew) : "Unallocated",
        clean(item.status) || "Active",
        clean(item.last_internal_inspection),
        inspectionLabel(item.last_internal_inspection),
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
    link.download = `ladders-${date}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Equipment Register"
        title="Ladders"
        description="Track ladder asset IDs, make, type, height, internal inspections, crew allocation and status."
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
              Add Ladder
            </button>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Total Ladders
          </p>
          <p className="mt-2 text-3xl font-black text-slate-950">
            {items.length}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Registered ladders.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-black text-slate-950">
              Ladder Register
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {loading
                ? "Loading ladders..."
                : `${filteredItems.length} of ${items.length} ladders shown`}
            </p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search LAD number, make, type..."
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
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              {typeOptions.map((option) => (
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
              value={inspectionFilter}
              onChange={(event) => setInspectionFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              <option>All Inspections</option>
              <option>Recently inspected</option>
              <option>Inspection ageing</option>
              <option>Review inspection</option>
              <option>No inspection date</option>
            </select>
          </div>
        </div>
      </section>

      <RegisterList
        title="Registered Ladders"
        description={
          loading
            ? "Loading ladders..."
            : `${filteredItems.length} ladders shown`
        }
        items={filteredItems}
        getKey={(item) => item.id}
        columns={[
          {
            label: "Asset ID",
            render: (item) => (
              <p className="font-black text-slate-950">
                {item.ladder_number}
              </p>
            ),
          },
          {
            label: "Make / Type",
            render: (item) => (
              <div>
                <p className="font-bold text-slate-950">
                  {clean(item.make) || "No make"}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {clean(item.ladder_type) || "No type"}
                </p>
              </div>
            ),
          },
          {
            label: "Height",
            render: (item) => clean(item.height) || "—",
          },
          {
            label: "Crew",
            render: (item) => {
              const crew = item.crew_id ? crewById.get(item.crew_id) : null;
              return crew ? crewLabel(crew) : "Unallocated";
            },
          },
          {
            label: "Last Internal Inspection",
            render: (item) => (
              <div>
                <p className="font-semibold text-slate-950">
                  {formatShortDate(item.last_internal_inspection)}
                </p>
                <div className="mt-1">
                  <Pill
                    label={inspectionLabel(item.last_internal_inspection)}
                    className={inspectionClass(item.last_internal_inspection)}
                  />
                </div>
              </div>
            ),
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
                    {item.ladder_number}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {[clean(item.make), clean(item.ladder_type)]
                      .filter(Boolean)
                      .join(" · ") || "No make/type"}
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
                    Height
                  </p>
                  <p className="font-semibold text-slate-800">
                    {clean(item.height) || "—"}
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

                <div className="col-span-2">
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Last Inspection
                  </p>
                  <p className="font-semibold text-slate-800">
                    {formatShortDate(item.last_internal_inspection)}
                  </p>
                  <div className="mt-1">
                    <Pill
                      label={inspectionLabel(item.last_internal_inspection)}
                      className={inspectionClass(item.last_internal_inspection)}
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
                  {editingId ? "Edit Ladder" : "New Ladder"}
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  {editingId ? "Update Ladder" : "Add Ladder"}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {editingId
                    ? "Update ladder details, inspection date and allocation."
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
                              ?.ladder_number || ""
                          : nextNumber
                      }
                      disabled
                      className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 outline-none"
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
                      placeholder="e.g. Bailey"
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Ladder Type
                    <select
                      value={form.ladder_type}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          ladder_type: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    >
                      {ladderTypeOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Height
                    <input
                      value={form.height}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          height: event.target.value,
                        }))
                      }
                      placeholder="e.g. 2.4m"
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
                    Last Internal Inspection
                    <input
                      type="date"
                      value={form.last_internal_inspection}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          last_internal_inspection: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    />
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
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Save Changes"
                    : "Save Ladder"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
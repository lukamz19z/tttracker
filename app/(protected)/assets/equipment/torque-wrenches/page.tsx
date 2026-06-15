/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { createSupabaseBrowser } from "../../../../../lib/supabase";
import { PageHeader, PageShell, RegisterList } from "../../components";

type Crew = {
  id: string;
  crew_number: string;
  crew_name: string | null;
  active?: boolean | null;
};

type TorqueWrench = {
  id: string;
  torque_wrench_number: string;
  serial_number: string | null;
  expiry_date: string | null;
  crew_id: string | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type FormState = {
  serial_number: string;
  expiry_date: string;
  crew_id: string;
  status: string;
  notes: string;
};

const blankForm: FormState = {
  serial_number: "",
  expiry_date: "",
  crew_id: "",
  status: "Active",
  notes: "",
};

function clean(value: string | number | null | undefined) {
  return String(value ?? "").trim();
}

function crewLabel(crew: Crew) {
  return `${crew.crew_number}${crew.crew_name ? ` - ${crew.crew_name}` : ""}`;
}

function formatShortDate(value: string | null) {
  if (!value) return "No expiry";

  return new Date(value).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function csvSafe(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function getNextTorqueWrenchNumber(items: TorqueWrench[]) {
  const highest = items.reduce((max, item) => {
    const match = clean(item.torque_wrench_number).match(/^TW-(\d+)$/i);
    if (!match) return max;

    const number = Number(match[1]);
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);

  return `TW-${String(highest + 1).padStart(3, "0")}`;
}

function getExpiryStatus(expiryDate: string | null) {
  if (!expiryDate) {
    return {
      label: "No Expiry",
      className: "border-slate-200 bg-slate-50 text-slate-700",
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(`${expiryDate}T00:00:00`);
  const diffDays = Math.ceil(
    (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays < 0) {
    return {
      label: "Expired",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  if (diffDays <= 30) {
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

function Pill({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold ${className}`}
    >
      {label}
    </span>
  );
}

export default function TorqueWrenchesPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [items, setItems] = useState<TorqueWrench[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [crewFilter, setCrewFilter] = useState("All Crews");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [expiryFilter, setExpiryFilter] = useState("All Expiry");

  const [form, setForm] = useState<FormState>(blankForm);

  const nextNumber = useMemo(() => getNextTorqueWrenchNumber(items), [items]);

  const crewById = useMemo(() => {
    return new Map(crews.map((crew) => [crew.id, crew]));
  }, [crews]);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [torqueResult, crewsResult] = await Promise.all([
      supabase
        .from("equipment_torque_wrenches")
        .select("*")
        .order("torque_wrench_number", { ascending: true }),
      supabase
        .from("crews")
        .select("id, crew_number, crew_name, active")
        .order("crew_number", { ascending: true }),
    ]);

    if (torqueResult.error) {
      console.error("Failed to load torque wrenches:", torqueResult.error.message);
      setItems([]);
    } else {
      setItems((torqueResult.data ?? []) as TorqueWrench[]);
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
      const expiryStatus = getExpiryStatus(item.expiry_date).label;

      const searchable = [
        item.torque_wrench_number,
        item.serial_number,
        item.expiry_date,
        item.status,
        item.notes,
        crewText,
        expiryStatus,
      ]
        .join(" ")
        .toLowerCase();

      return (
        searchable.includes(term) &&
        (crewFilter === "All Crews" || crewText === crewFilter) &&
        (statusFilter === "All Statuses" || clean(item.status) === statusFilter) &&
        (expiryFilter === "All Expiry" || expiryStatus === expiryFilter)
      );
    });
  }, [items, search, crewFilter, statusFilter, expiryFilter, crewById]);

  function openAddForm() {
    setEditingId(null);
    setForm(blankForm);
    setShowForm(true);
  }

  function openEditForm(item: TorqueWrench) {
    setEditingId(item.id);
    setForm({
      serial_number: clean(item.serial_number),
      expiry_date: clean(item.expiry_date),
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

    if (!editingId) {
      const payload = {
        torque_wrench_number: nextNumber,
        serial_number: clean(form.serial_number) || null,
        expiry_date: clean(form.expiry_date) || null,
        crew_id: clean(form.crew_id) || null,
        status: clean(form.status) || "Active",
        notes: clean(form.notes) || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("equipment_torque_wrenches")
        .insert(payload);

      if (error) {
        alert(`Failed to save torque wrench: ${error.message}`);
        setSaving(false);
        return;
      }
    } else {
      const payload = {
        serial_number: clean(form.serial_number) || null,
        expiry_date: clean(form.expiry_date) || null,
        crew_id: clean(form.crew_id) || null,
        status: clean(form.status) || "Active",
        notes: clean(form.notes) || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("equipment_torque_wrenches")
        .update(payload)
        .eq("id", editingId);

      if (error) {
        alert(`Failed to update torque wrench: ${error.message}`);
        setSaving(false);
        return;
      }
    }

    closeForm();
    await loadData();
    setSaving(false);
  }

  async function handleDelete(item: TorqueWrench) {
    const confirmed = window.confirm(
      `Delete ${item.torque_wrench_number} from the torque wrench register?`,
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("equipment_torque_wrenches")
      .delete()
      .eq("id", item.id);

    if (error) {
      alert(`Failed to delete torque wrench: ${error.message}`);
      return;
    }

    await loadData();
  }

  function exportCsv() {
    const headers = [
      "Torque Wrench Number",
      "Serial Number",
      "Expiry Date",
      "Expiry Status",
      "Crew Allocation",
      "Status",
      "Notes",
    ];

    const rows = filteredItems.map((item) => {
      const crew = item.crew_id ? crewById.get(item.crew_id) : null;

      return [
        item.torque_wrench_number,
        clean(item.serial_number),
        clean(item.expiry_date),
        getExpiryStatus(item.expiry_date).label,
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
    link.download = `torque-wrenches-${date}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Equipment Register"
        title="Torque Wrenches"
        description="Track torque wrench asset numbers, serial numbers, calibration expiry dates and crew allocation."
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
              Export CSV
            </button>

            <button
              type="button"
              onClick={openAddForm}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus size={16} />
              Add Torque Wrench
            </button>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Total Torque Wrenches
          </p>
          <p className="mt-2 text-3xl font-black text-slate-950">
            {items.length}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Registered torque wrenches.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950">
                Torque Wrench Register
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {loading
                  ? "Loading torque wrenches..."
                  : `${filteredItems.length} of ${items.length} torque wrenches shown`}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="relative md:col-span-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search TW number, serial, crew..."
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
              <option>Active</option>
              <option>Out of Service</option>
              <option>Missing</option>
              <option>Retired</option>
            </select>

            <select
              value={expiryFilter}
              onChange={(event) => setExpiryFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              <option>All Expiry</option>
              <option>Current</option>
              <option>Due Soon</option>
              <option>Expired</option>
              <option>No Expiry</option>
            </select>
          </div>
        </div>
      </section>

      <RegisterList
        title="Registered Torque Wrenches"
        description={
          loading
            ? "Loading torque wrenches..."
            : `${filteredItems.length} torque wrenches shown`
        }
        items={filteredItems}
        getKey={(item) => item.id}
        columns={[
          {
            label: "Torque Wrench No.",
            render: (item) => (
              <p className="font-black text-slate-950">
                {item.torque_wrench_number}
              </p>
            ),
          },
          {
            label: "Serial Number",
            render: (item) => clean(item.serial_number) || "—",
          },
          {
            label: "Expiry",
            render: (item) => {
              const expiry = getExpiryStatus(item.expiry_date);

              return (
                <div>
                  <p className="font-semibold text-slate-950">
                    {formatShortDate(item.expiry_date)}
                  </p>
                  <div className="mt-1">
                    <Pill label={expiry.label} className={expiry.className} />
                  </div>
                </div>
              );
            },
          },
          {
            label: "Crew Allocation",
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
          const expiry = getExpiryStatus(item.expiry_date);

          return (
            <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-950">
                    {item.torque_wrench_number}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    Serial: {clean(item.serial_number) || "—"}
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
                    Expiry
                  </p>
                  <p className="font-semibold text-slate-800">
                    {formatShortDate(item.expiry_date)}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Expiry Status
                  </p>
                  <div className="mt-1">
                    <Pill label={expiry.label} className={expiry.className} />
                  </div>
                </div>

                <div className="col-span-2">
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Crew
                  </p>
                  <p className="font-semibold text-slate-800">
                    {crew ? crewLabel(crew) : "Unallocated"}
                  </p>
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
                  {editingId ? "Edit Torque Wrench" : "New Torque Wrench"}
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  {editingId ? "Update Torque Wrench" : "Add Torque Wrench"}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {editingId
                    ? "Update serial number, expiry, crew allocation or status."
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
                    Torque Wrench Number
                    <input
                      value={
                        editingId
                          ? items.find((item) => item.id === editingId)
                              ?.torque_wrench_number || ""
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
                    Expiry Date
                    <input
                      type="date"
                      value={form.expiry_date}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          expiry_date: event.target.value,
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
                      <option>Active</option>
                      <option>Out of Service</option>
                      <option>Missing</option>
                      <option>Retired</option>
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
                {saving ? "Saving..." : editingId ? "Save Changes" : "Save Torque Wrench"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
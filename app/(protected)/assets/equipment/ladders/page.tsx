"use client";

import Link from "next/link";
import { flushSync } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Edit,
  FileText,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { createSupabaseBrowser } from "../../../../../lib/supabase";
import { LadderReplacementLinks } from "@/components/assets/ladder-replacement-links";
import { LadderPrintRegister } from "@/components/assets/ladder-print-register";
import { defaultLadderHeightMeasurement, filterLadders, ladderCsv, ladderHeightLabel, ladderHeightMeasurements, ladderMeasurementLabel, duplicateLadderMessage, ladderNumberKey, ladderRelations, ladderStatuses, type Ladder } from "@/lib/assets/ladders";
import { PageHeader, PageShell, RegisterList } from "../../components";

type Crew = {
  id: string;
  crew_number: string;
  crew_name: string | null;
  active?: boolean | null;
};

type FormState = {
  ladder_number: string;
  serial_number: string;
  height_measurement_type: string;
  supersedes_ladder_id: string;
  make: string;
  ladder_type: string;
  height: string;
  crew_id: string;
  status: string;
  last_internal_inspection: string;
  notes: string;
};

const blankForm: FormState = {
  ladder_number: "",
  serial_number: "",
  height_measurement_type: defaultLadderHeightMeasurement,
  supersedes_ladder_id: "",
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

const statusOptions = ladderStatuses;

function clean(value: string | number | null | undefined) {
  return String(value ?? "").trim();
}

function crewLabel(crew: Crew) {
  return `${crew.crew_number}${crew.crew_name ? ` - ${crew.crew_name}` : ""}`;
}

function formatShortDate(value: string | null) {
  if (!value) return "No date";

  return new Date(value).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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

  if (value === "retired" || value === "superseded") {
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
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [inspectionFilter, setInspectionFilter] = useState("All Inspections");

  const [printedAt, setPrintedAt] = useState("");
  const [form, setForm] = useState<FormState>(blankForm);

  const [canEdit, setCanEdit] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [replacementSearch, setReplacementSearch] = useState("");
  const editingLadder = items.find(item => item.id === editingId);
  const selectedPrevious = items.find(item => item.id === form.supersedes_ladder_id);
  const apiRequest = useCallback(async <T,>(url: string, init: RequestInit = {}): Promise<T> => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Your session has expired. Sign in again.");
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" }, cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Ladder Register request failed.");
    return result as T;
  }, [supabase]);

  const crewById = useMemo(() => {
    return new Map(crews.map((crew) => [crew.id, crew]));
  }, [crews]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [laddersResult, crewsResult] = await Promise.all([
        apiRequest<{ items: Ladder[]; canEdit: boolean }>("/api/assets/equipment/ladder"),
        supabase.from("crews").select("id, crew_number, crew_name, active").order("crew_number", { ascending: true }),
      ]);
      if (crewsResult.error) throw new Error(`Ladder crew query failed: ${crewsResult.error.message}`);
      setItems(laddersResult.items);
      setCanEdit(laddersResult.canEdit);
      setCrews(((crewsResult.data ?? []) as Crew[]).filter(crew => crew.active !== false));
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Ladder Register could not be loaded.");
    } finally { setLoading(false); }
  }, [supabase, apiRequest]);

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

  const ladderCrewLabel = useCallback((item: Ladder) => {
    const crew = item.crew_id ? crewById.get(item.crew_id) : null;
    return crew ? crewLabel(crew) : "Unallocated";
  }, [crewById]);
  const filteredItems = useMemo(() => filterLadders(items, {
    search, crew: crewFilter, status: statusFilter, type: typeFilter, inspection: inspectionFilter,
  }, ladderCrewLabel, inspectionLabel), [items, search, crewFilter, statusFilter, typeFilter, inspectionFilter, ladderCrewLabel]);
  const printFilterSummary = [
    search ? `Search: ${search}` : null,
    crewFilter !== "All Crews" ? `Crew: ${crewFilter}` : null,
    statusFilter !== "All" ? `Status: ${statusFilter}` : null,
    typeFilter !== "All Types" ? `Type: ${typeFilter}` : null,
    inspectionFilter !== "All Inspections" ? `Inspection: ${inspectionFilter}` : null,
  ].filter(Boolean).join(" \u00b7 ");
  useEffect(() => {
    const beforePrint = () => flushSync(() => setPrintedAt(new Date().toLocaleString("en-AU", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    })));
    window.addEventListener("beforeprint", beforePrint);
    return () => window.removeEventListener("beforeprint", beforePrint);
  }, []);
  function printFilteredRegister() {
    window.print();
  }

  function openAddForm() {
    setEditingId(null);
    setForm(blankForm);
    setFormError("");
    setReplacementSearch("");
    setShowForm(true);
  }

  function openEditForm(item: Ladder) {
    setEditingId(item.id);
    setFormError("");
    setReplacementSearch("");
    setForm({
      ladder_number: item.ladder_number,
      serial_number: clean(item.serial_number),
      height_measurement_type: clean(item.height_measurement_type),
      supersedes_ladder_id: item.supersedes_ladder_id || "",
      make: clean(item.make),
      ladder_type: clean(item.ladder_type),
      height: clean(item.height),
      crew_id: clean(item.crew_id),
      status: clean(item.status) || "Active",
      last_internal_inspection: clean(item.last_internal_inspection),
      notes: clean(item.notes),
    });
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;
    setEditingId(null);
    setForm(blankForm);
    setShowForm(false);
  }

  async function handleSave() {
    if (saving) return;
    setFormError("");
    const number = form.ladder_number.trim();
    if (!number || number.length > 120 || /[\x00-\x1f\x7f]/.test(number)) {
      setFormError("Enter a Ladder Register Number of 1 to 120 characters.");
      return;
    }
    if (items.some(item => item.id !== editingId && item.id !== selectedPrevious?.id && clean(item.status).toLowerCase() !== "superseded" && ladderNumberKey(item.ladder_number) === ladderNumberKey(number))) {
      setFormError(duplicateLadderMessage(number));
      return;
    }
    if (!editingId && selectedPrevious && !window.confirm(`${selectedPrevious.ladder_number} will be marked as Superseded by ${number}.`)) return;
    setSaving(true);
    let savedId: string;
    try {
      const result = await apiRequest<{ item: Ladder }>("/api/assets/equipment/ladder", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({ ...form, ladder_number: number, id: editingId || undefined,
          updated_at: editingId ? items.find(item => item.id === editingId)?.updated_at : undefined,
          confirm_supersedes: !editingId && Boolean(selectedPrevious),
        }),
      });
      if (!result.item?.id) throw new Error("Ladder save succeeded without returning the saved asset ID.");
      savedId = result.item.id;
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Ladder could not be saved.");
      setSaving(false);
      return;
    }

    if (savedId) {
      try {
        await apiRequest(`/api/assets/equipment/ladder/${savedId}`, { method: "POST" });
      } catch (sharePointError) {
        alert(
          `Ladder saved, but its SharePoint folder could not be synchronised: ${
            sharePointError instanceof Error
              ? sharePointError.message
              : "Unknown SharePoint error."
          }`,
        );
      }
    }

    setEditingId(null);
    setForm(blankForm);
    setShowForm(false);
    await loadData();
    setSaving(false);
  }

  async function handleDelete(item: Ladder) {
    const confirmed = window.confirm(
      `Delete ${item.ladder_number} from the ladder register?`,
    );

    if (!confirmed) return;

    try {
      await apiRequest(`/api/assets/equipment/ladder?id=${item.id}`, { method: "DELETE" });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Ladder could not be deleted.");
      return;
    }

    await loadData();
  }

  function exportCsv() {
    const csv = ladderCsv(filteredItems, items, ladderCrewLabel, inspectionLabel);

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
      <div className="ladder-screen-only space-y-5">
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

            <button type="button" onClick={printFilteredRegister} disabled={loading || !filteredItems.length}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
              <Printer size={16} />Print PDF
            </button>
            {canEdit ? <button
              type="button"
              onClick={openAddForm}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus size={16} />
              Add Ladder
            </button> : null}
          </div>
        }
      />

      {loadError ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{loadError}</div> : null}
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
                placeholder="Search register number, serial, make, type..."
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
              <option>All</option>
              {[...statusOptions, "Superseded"].map((option) => (
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
            label: "Ladder Register Number",
            render: (item) => (
              <div><Link className="font-black text-slate-950 hover:text-blue-700" href={`/assets/equipment/records/ladder/${item.id}`}>{item.ladder_number}</Link><p className="mt-1 text-xs text-slate-500">Serial: {clean(item.serial_number) || "\u2014"}</p><LadderReplacementLinks {...ladderRelations(item, items)} /></div>
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
            render: (item) => <div>{ladderHeightLabel(item.height)}<p className="mt-1 text-xs text-slate-500">{ladderMeasurementLabel(item.height_measurement_type)}</p></div>,
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
                <Link
                  href={`/assets/equipment/records/ladder/${item.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 shadow-sm hover:bg-blue-100"
                >
                  <FileText size={14} />
                  Documents
                </Link>

                {canEdit ? <button
                  type="button"
                  onClick={() => openEditForm(item)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <Edit size={14} />
                  Edit
                </button> : null}

                {canEdit && !item.supersedes_ladder_id && !items.some(row => row.supersedes_ladder_id === item.id) ? <button
                  type="button"
                  onClick={() => void handleDelete(item)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 shadow-sm hover:bg-rose-100"
                >
                  <Trash2 size={14} />
                  Delete
                </button> : null}
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
                  <Link className="font-black text-slate-950 hover:text-blue-700" href={`/assets/equipment/records/ladder/${item.id}`}>{item.ladder_number}</Link>
                  <p className="mt-1 text-xs text-slate-500">Serial: {clean(item.serial_number) || "\u2014"}</p>
                  <LadderReplacementLinks {...ladderRelations(item, items)} />
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
                    {ladderHeightLabel(item.height)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{ladderMeasurementLabel(item.height_measurement_type)}</p>
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
                <Link
                  href={`/assets/equipment/records/ladder/${item.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 shadow-sm hover:bg-blue-100"
                >
                  <FileText size={14} />
                  Documents
                </Link>

                {canEdit ? <button
                  type="button"
                  onClick={() => openEditForm(item)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                >
                  <Edit size={14} />
                  Edit
                </button> : null}

                {canEdit && !item.supersedes_ladder_id && !items.some(row => row.supersedes_ladder_id === item.id) ? <button
                  type="button"
                  onClick={() => void handleDelete(item)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700"
                >
                  <Trash2 size={14} />
                  Delete
                </button> : null}
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
                    : "Enter the register number shown on the physical ladder."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-5 p-5">
              {formError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{formError}</p> : null}
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Ladder Register Number *
                    <input
                      value={form.ladder_number}
                      onChange={event => setForm(current => ({ ...current, ladder_number: event.target.value }))}
                      disabled={Boolean(editingId)}
                      required
                      maxLength={120}
                      placeholder="e.g. LAD-001-R1"
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 disabled:bg-slate-100"
                    />
                    <span className="text-xs font-normal text-slate-500">{editingId ? "Register identifiers remain locked after creation." : "Enter the identifier used on the physical ladder / asset register."}</span>
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Serial Number
                    <input value={form.serial_number} maxLength={500} onChange={event => setForm(current => ({ ...current, serial_number: event.target.value }))} placeholder="Manufacturer / supplier serial (optional)" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
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
                      <option value="">Not specified</option>
                      {Array.from(new Set([...ladderTypeOptions, form.ladder_type].filter(Boolean))).map((option) => (
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
                      placeholder="e.g. 1.8 m"
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Height Measurement
                    <input list="ladder-height-measurements" value={form.height_measurement_type} maxLength={120} onChange={event => setForm(current => ({ ...current, height_measurement_type: event.target.value }))} placeholder="Not specified" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
                    <datalist id="ladder-height-measurements">{ladderHeightMeasurements.map(value => <option key={value} value={value} />)}</datalist>
                    <span className="text-xs font-normal text-slate-500">Choose a measurement basis or enter another. Include units in Height, e.g. 1.8 m.</span>
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
                      {(form.status === "Superseded" ? ["Superseded"] : statusOptions).map((option) => (
                        <option key={option}>{option}</option>
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

                  {!editingId ? <div className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                    <label htmlFor="ladder-supersedes-search">Supersedes (optional)</label>
                    <input id="ladder-supersedes-search" placeholder="Search an existing ladder number" value={replacementSearch} onChange={event => setReplacementSearch(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium" />
                    <select aria-label="Supersedes ladder" value={form.supersedes_ladder_id} onChange={event => setForm(current => ({ ...current, supersedes_ladder_id: event.target.value, status: event.target.value ? "Active" : current.status }))} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium">
                      <option value="">Does not supersede another ladder</option>
                      {items.filter(item => !items.some(row => row.supersedes_ladder_id === item.id) && clean(item.status).toLowerCase() !== "superseded" && (item.id === form.supersedes_ladder_id || item.ladder_number.toLowerCase().includes(replacementSearch.trim().toLowerCase()))).map(item => <option key={item.id} value={item.id}>{item.ladder_number} - {item.status || "Active"}</option>)}
                    </select>
                    {selectedPrevious ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{selectedPrevious.ladder_number} will be marked as Superseded by {form.ladder_number.trim() || "the new ladder"}. Both records and their histories will be retained.</p> : null}
                  </div> : <div className="md:col-span-2">{editingLadder ? <LadderReplacementLinks {...ladderRelations(editingLadder, items)} /> : null}</div>}

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
                disabled={saving}
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
      </div>
      <LadderPrintRegister items={filteredItems} allItems={items} crewLabel={ladderCrewLabel} inspectionLabel={inspectionLabel} printedAt={printedAt} filterSummary={printFilterSummary} />
    </PageShell>
  );
}
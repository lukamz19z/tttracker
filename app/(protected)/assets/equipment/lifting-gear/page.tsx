/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  Download,
  Edit,
  FileUp,
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

type LiftingGear = {
  id: string;
  serial_id: string;
  equipment_type: string | null;
  description: string | null;
  inspected_on: string | null;
  next_inspection_due: string | null;
  event_type: string | null;
  comment: string | null;
  status: string | null;
  crew_id: string | null;
  crew_label: string | null;
  tag: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type FormState = {
  serial_id: string;
  equipment_type: string;
  description: string;
  inspected_on: string;
  next_inspection_due: string;
  event_type: string;
  comment: string;
  status: string;
  crew_id: string;
  tag: string;
};

type CsvRow = Record<string, string | number | null | undefined>;

const blankForm: FormState = {
  serial_id: "",
  equipment_type: "Round Sling",
  description: "",
  inspected_on: "",
  next_inspection_due: "",
  event_type: "Visual Inspection",
  comment: "",
  status: "Passed",
  crew_id: "",
  tag: "Blue",
};

const equipmentTypeOptions = [
  "Round Sling",
  "Chain Sling",
  "Shackle",
  "Lifting Eye",
  "Snatch Block",
  "Lever Hoist (Block)",
  "Lifter",
  "Pole Strap",
  "Lanyard",
  "Harness (Fall Arrest)",
  "Rescue Kit",
  "Wire Rope Assembly / Sling",
  "Lifting Device",
  "Fall Protection (Other)",
  "Chain Sling Component",
  "Other",
];

const eventTypeOptions = [
  "Visual Inspection",
  "Test Certificate",
  "Repair",
  "Added to Register",
  "Retired",
];

const statusOptions = ["Passed", "Failed", "Out of Service", "Missing", "Retired"];

const tagOptions = ["Blue", "Red", "Yellow", "Green"];

function clean(value: string | number | null | undefined) {
  return String(value ?? "").trim();
}

function normaliseText(value: string | number | null | undefined) {
  return clean(value).replace(/\s+/g, " ");
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

function parseCsvDate(value: string | number | null | undefined) {
  const raw = clean(value);

  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const match = raw.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,}|\d{1,2})[-/ ](\d{2,4})$/);

  if (!match) {
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime())
      ? null
      : fallback.toISOString().slice(0, 10);
  }

  const day = Number(match[1]);
  const monthRaw = match[2];
  const yearRaw = Number(match[3]);

  const monthNames: Record<string, number> = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };

  const month =
    /^\d+$/.test(monthRaw)
      ? Number(monthRaw) - 1
      : monthNames[monthRaw.toLowerCase()];

  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return null;
  }

  const date = new Date(year, month, day);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

function getDueStatus(nextInspectionDue: string | null) {
  if (!nextInspectionDue) {
    return {
      label: "No Due Date",
      className: "border-slate-200 bg-slate-50 text-slate-700",
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(`${nextInspectionDue}T00:00:00`);
  const diffDays = Math.ceil(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays < 0) {
    return {
      label: "Overdue",
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

  if (value === "passed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "failed") return "border-rose-200 bg-rose-50 text-rose-700";
  if (value === "out of service") return "border-rose-200 bg-rose-50 text-rose-700";
  if (value === "missing") return "border-amber-200 bg-amber-50 text-amber-700";
  if (value === "retired") return "border-slate-200 bg-slate-50 text-slate-700";

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function tagClass(tag: string | null) {
  const value = clean(tag).toLowerCase();

  if (value === "blue") return "border-blue-200 bg-blue-50 text-blue-700";
  if (value === "red") return "border-rose-200 bg-rose-50 text-rose-700";
  if (value === "yellow") return "border-amber-200 bg-amber-50 text-amber-700";
  if (value === "green") return "border-emerald-200 bg-emerald-50 text-emerald-700";

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

function getCsvValue(row: CsvRow, possibleHeaders: string[]) {
  const entries = Object.entries(row);
  const wanted = possibleHeaders.map((header) =>
    header.toLowerCase().replace(/\s+/g, ""),
  );

  const match = entries.find(([key]) =>
    wanted.includes(key.toLowerCase().replace(/\s+/g, "")),
  );

  return clean(match?.[1]);
}

export default function LiftingGearPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [items, setItems] = useState<LiftingGear[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [equipmentTypeFilter, setEquipmentTypeFilter] = useState("All Types");
  const [crewFilter, setCrewFilter] = useState("All Crews");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [tagFilter, setTagFilter] = useState("All Tags");
  const [dueFilter, setDueFilter] = useState("All Due");

  const [form, setForm] = useState<FormState>(blankForm);

  const crewById = useMemo(() => {
    return new Map(crews.map((crew) => [crew.id, crew]));
  }, [crews]);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [gearResult, crewsResult] = await Promise.all([
      supabase
        .from("equipment_lifting_gear")
        .select("*")
        .order("crew_label", { ascending: true })
        .order("equipment_type", { ascending: true })
        .order("serial_id", { ascending: true }),
      supabase
        .from("crews")
        .select("id, crew_number, crew_name, active")
        .order("crew_number", { ascending: true }),
    ]);

    if (gearResult.error) {
      console.error("Failed to load lifting gear:", gearResult.error.message);
      setItems([]);
    } else {
      setItems((gearResult.data ?? []) as LiftingGear[]);
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
      ...Array.from(
        new Set([
          ...crews.map(crewLabel),
          ...items.map((item) => clean(item.crew_label)),
        ].filter(Boolean)),
      ).sort(),
    ];
  }, [crews, items]);

  const equipmentTypeOptionsForFilter = useMemo(() => {
    return [
      "All Types",
      ...Array.from(
        new Set([
          ...equipmentTypeOptions,
          ...items.map((item) => clean(item.equipment_type)),
        ].filter(Boolean)),
      ).sort(),
    ];
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();

    return items.filter((item) => {
      const crew = item.crew_id ? crewById.get(item.crew_id) : null;
      const crewText = crew ? crewLabel(crew) : clean(item.crew_label) || "Unallocated";
      const dueStatus = getDueStatus(item.next_inspection_due).label;

      const searchable = [
        item.serial_id,
        item.equipment_type,
        item.description,
        item.inspected_on,
        item.next_inspection_due,
        item.event_type,
        item.comment,
        item.status,
        crewText,
        item.tag,
        dueStatus,
      ]
        .join(" ")
        .toLowerCase();

      return (
        searchable.includes(term) &&
        (equipmentTypeFilter === "All Types" ||
          clean(item.equipment_type) === equipmentTypeFilter) &&
        (crewFilter === "All Crews" || crewText === crewFilter) &&
        (statusFilter === "All Statuses" || clean(item.status) === statusFilter) &&
        (tagFilter === "All Tags" || clean(item.tag) === tagFilter) &&
        (dueFilter === "All Due" || dueStatus === dueFilter)
      );
    });
  }, [
    items,
    search,
    equipmentTypeFilter,
    crewFilter,
    statusFilter,
    tagFilter,
    dueFilter,
    crewById,
  ]);

  function openAddForm() {
    setEditingId(null);
    setForm(blankForm);
    setShowForm(true);
  }

  function openEditForm(item: LiftingGear) {
    setEditingId(item.id);
    setForm({
      serial_id: clean(item.serial_id),
      equipment_type: clean(item.equipment_type) || "Round Sling",
      description: clean(item.description),
      inspected_on: clean(item.inspected_on),
      next_inspection_due: clean(item.next_inspection_due),
      event_type: clean(item.event_type) || "Visual Inspection",
      comment: clean(item.comment),
      status: clean(item.status) || "Passed",
      crew_id: clean(item.crew_id),
      tag: clean(item.tag) || "Blue",
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

    if (!clean(form.serial_id)) {
      alert("Serial ID is required.");
      setSaving(false);
      return;
    }

    const selectedCrew = form.crew_id ? crewById.get(form.crew_id) : null;

    const payload = {
      serial_id: clean(form.serial_id),
      equipment_type: clean(form.equipment_type) || null,
      description: clean(form.description) || null,
      inspected_on: clean(form.inspected_on) || null,
      next_inspection_due: clean(form.next_inspection_due) || null,
      event_type: clean(form.event_type) || null,
      comment: clean(form.comment) || null,
      status: clean(form.status) || "Passed",
      crew_id: clean(form.crew_id) || null,
      crew_label: selectedCrew ? crewLabel(selectedCrew) : null,
      tag: clean(form.tag) || null,
      updated_at: new Date().toISOString(),
    };

    if (!editingId) {
      const { error } = await supabase.from("equipment_lifting_gear").insert(payload);

      if (error) {
        alert(`Failed to save lifting gear: ${error.message}`);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase
        .from("equipment_lifting_gear")
        .update(payload)
        .eq("id", editingId);

      if (error) {
        alert(`Failed to update lifting gear: ${error.message}`);
        setSaving(false);
        return;
      }
    }

    closeForm();
    await loadData();
    setSaving(false);
  }

  async function handleDelete(item: LiftingGear) {
    const confirmed = window.confirm(
      `Delete ${item.serial_id} from the lifting gear register?`,
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("equipment_lifting_gear")
      .delete()
      .eq("id", item.id);

    if (error) {
      alert(`Failed to delete lifting gear: ${error.message}`);
      return;
    }

    await loadData();
  }

  function exportCsv() {
    const headers = [
      "Serial ID",
      "Equipment Type",
      "Description",
      "Inspected on",
      "Next Inspection Due",
      "Event Type",
      "Comment",
      "Status",
      "Crew",
      "Tag",
    ];

    const rows = filteredItems.map((item) => {
      const crew = item.crew_id ? crewById.get(item.crew_id) : null;

      return [
        clean(item.serial_id),
        clean(item.equipment_type),
        clean(item.description),
        clean(item.inspected_on),
        clean(item.next_inspection_due),
        clean(item.event_type),
        clean(item.comment),
        clean(item.status),
        crew ? crewLabel(crew) : clean(item.crew_label),
        clean(item.tag),
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
    link.download = `lifting-gear-${date}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  async function handleImportCsv(file: File) {
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        const rows = result.data || [];

        const payloads = rows
          .map((row) => {
            const serialId = getCsvValue(row, ["Serial ID", "SerialID", "Serial"]);

            if (!serialId) return null;

            const crewValue = getCsvValue(row, ["Crew"]);
            const matchedCrew = crews.find((crew) => {
              return (
                crew.crew_number === crewValue ||
                crewLabel(crew) === crewValue ||
                `Crew ${crew.crew_number}` === crewValue
              );
            });

            return {
              serial_id: serialId,
              equipment_type:
                normaliseText(
                  getCsvValue(row, ["Equipment Type", "EquipmentType", "Type"]),
                ) || null,
              description:
                normaliseText(getCsvValue(row, ["Description", "Desc"])) || null,
              inspected_on: parseCsvDate(
                getCsvValue(row, ["Inspected on", "Inspected On", "Inspection Date"]),
              ),
              next_inspection_due: parseCsvDate(
                getCsvValue(row, [
                  "Next Inspection Due",
                  "NextInspectionDue",
                  "Due Date",
                ]),
              ),
              event_type:
                normaliseText(getCsvValue(row, ["Event Type", "EventType"])) ||
                "Visual Inspection",
              comment: normaliseText(getCsvValue(row, ["Comment", "Comments"])) || null,
              status: normaliseText(getCsvValue(row, ["Status"])) || "Passed",
              crew_id: matchedCrew?.id || null,
              crew_label: matchedCrew ? crewLabel(matchedCrew) : crewValue || null,
              tag: normaliseText(getCsvValue(row, ["Tag", "Tag Colour", "Tag Color"])) || null,
              updated_at: new Date().toISOString(),
            };
          })
          .filter(Boolean);

        if (payloads.length === 0) {
          alert("No valid rows found. Make sure the CSV includes a Serial ID column.");
          return;
        }

        const { error } = await supabase
          .from("equipment_lifting_gear")
          .upsert(payloads, {
            onConflict: "serial_id",
          });

        if (error) {
          alert(`CSV import failed: ${error.message}`);
          return;
        }

        alert(`Imported ${payloads.length} lifting gear items.`);
        await loadData();

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      },
      error: (error) => {
        alert(`CSV import failed: ${error.message}`);
      },
    });
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Equipment Register"
        title="Lifting Gear"
        description="Track lifting gear by serial ID, inspection date, due date, status, crew allocation and tag colour."
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
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <FileUp size={16} />
              Import CSV
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImportCsv(file);
              }}
            />

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
              Add Item
            </button>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Total Lifting Gear
          </p>
          <p className="mt-2 text-3xl font-black text-slate-950">
            {items.length}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Registered lifting gear items.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-black text-slate-950">
              Lifting Gear Register
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {loading
                ? "Loading lifting gear..."
                : `${filteredItems.length} of ${items.length} items shown`}
            </p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-6">
            <div className="relative md:col-span-2">
              <Search
                size={16}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search serial, 6.0MT, yellow, 3T, chain sling..."
                className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
              />
            </div>

            <select
              value={equipmentTypeFilter}
              onChange={(event) => setEquipmentTypeFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              {equipmentTypeOptionsForFilter.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>

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
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              <option>All Tags</option>
              {tagOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>

            <select
              value={dueFilter}
              onChange={(event) => setDueFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 md:col-span-2"
            >
              <option>All Due</option>
              <option>Current</option>
              <option>Due Soon</option>
              <option>Overdue</option>
              <option>No Due Date</option>
            </select>
          </div>
        </div>
      </section>

      <RegisterList
        title="Registered Lifting Gear"
        description={
          loading
            ? "Loading lifting gear..."
            : `${filteredItems.length} lifting gear items shown`
        }
        items={filteredItems}
        getKey={(item) => item.id}
        columns={[
          {
            label: "Serial ID",
            render: (item) => (
              <p className="font-black text-slate-950">{item.serial_id}</p>
            ),
          },
          {
            label: "Type / Description",
            render: (item) => (
              <div>
                <p className="font-bold text-slate-950">
                  {clean(item.equipment_type) || "Equipment"}
                </p>
                <p className="mt-1 max-w-md whitespace-pre-wrap text-xs font-semibold text-slate-500">
                  {clean(item.description) || "—"}
                </p>
              </div>
            ),
          },
          {
            label: "Inspection",
            render: (item) => {
              const due = getDueStatus(item.next_inspection_due);

              return (
                <div>
                  <p className="font-semibold text-slate-950">
                    Due: {formatShortDate(item.next_inspection_due)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Inspected: {formatShortDate(item.inspected_on)}
                  </p>
                  <div className="mt-1">
                    <Pill label={due.label} className={due.className} />
                  </div>
                </div>
              );
            },
          },
          {
            label: "Crew",
            render: (item) => {
              const crew = item.crew_id ? crewById.get(item.crew_id) : null;
              return crew ? crewLabel(crew) : clean(item.crew_label) || "Unallocated";
            },
          },
          {
            label: "Status / Tag",
            render: (item) => (
              <div className="flex flex-wrap gap-2">
                <Pill
                  label={clean(item.status) || "Passed"}
                  className={statusClass(item.status)}
                />
                <Pill
                  label={clean(item.tag) || "No Tag"}
                  className={tagClass(item.tag)}
                />
              </div>
            ),
          },
          {
            label: "Comment",
            render: (item) => clean(item.comment) || "—",
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
          const due = getDueStatus(item.next_inspection_due);

          return (
            <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-950">{item.serial_id}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {clean(item.equipment_type) || "Equipment"}
                  </p>
                </div>

                <Pill
                  label={clean(item.status) || "Passed"}
                  className={statusClass(item.status)}
                />
              </div>

              <p className="whitespace-pre-wrap text-sm font-semibold text-slate-700">
                {clean(item.description) || "—"}
              </p>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Due
                  </p>
                  <p className="font-semibold text-slate-800">
                    {formatShortDate(item.next_inspection_due)}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Due Status
                  </p>
                  <div className="mt-1">
                    <Pill label={due.label} className={due.className} />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Crew
                  </p>
                  <p className="font-semibold text-slate-800">
                    {crew ? crewLabel(crew) : clean(item.crew_label) || "Unallocated"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Tag
                  </p>
                  <div className="mt-1">
                    <Pill
                      label={clean(item.tag) || "No Tag"}
                      className={tagClass(item.tag)}
                    />
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
                  {editingId ? "Edit Lifting Gear" : "New Lifting Gear"}
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  {editingId ? "Update Lifting Gear" : "Add Lifting Gear"}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Use the supplier serial ID as the primary identifier.
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
                    Serial ID
                    <input
                      value={form.serial_id}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          serial_id: event.target.value,
                        }))
                      }
                      placeholder="e.g. 17707931"
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Equipment Type
                    <select
                      value={form.equipment_type}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          equipment_type: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    >
                      {equipmentTypeOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                    Description
                    <textarea
                      value={form.description}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      rows={4}
                      placeholder="e.g. LEGEND 3T (yellow) 6.0MT"
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Inspected On
                    <input
                      type="date"
                      value={form.inspected_on}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          inspected_on: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Next Inspection Due
                    <input
                      type="date"
                      value={form.next_inspection_due}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          next_inspection_due: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Event Type
                    <select
                      value={form.event_type}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          event_type: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    >
                      {eventTypeOptions.map((option) => (
                        <option key={option}>{option}</option>
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

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Crew
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
                    Tag Colour
                    <select
                      value={form.tag}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          tag: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    >
                      {tagOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                    Comment
                    <textarea
                      value={form.comment}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          comment: event.target.value,
                        }))
                      }
                      rows={4}
                      placeholder="Optional comments..."
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
                {saving ? "Saving..." : editingId ? "Save Changes" : "Save Item"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
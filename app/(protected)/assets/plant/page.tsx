"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  Download,
  FileUp,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import {
  ActionButton,
  KpiCard,
  PageHeader,
  PageShell,
  RegisterList,
  StatusBadge,
} from "../components";
import { RecordActions } from "../record-actions";

type Tone = "emerald" | "amber" | "rose" | "blue";

type PlantAsset = {
  id: string;
  asset_id: string | null;
  name: string | null;
  make: string | null;
  model: string | null;
  plant_type: string | null;
  serial_number: string | null;
  rego: string | null;
  crew: string | null;
  project: string | null;
  next_service_date: string | null;
  cranesafe_expiry: string | null;
  insurance_expiry: string | null;
  hired: boolean | null;
  hired_from: string | null;
  hire_term: string | null;
  notes: string | null;
};

type PlantForm = Omit<PlantAsset, "id">;

type EnhancedPlantAsset = PlantAsset & {
  calculatedStatus: string;
  tone: Tone;
};

type CrewOption = {
  id: string;
  crew_number: string;
  crew_name: string | null;
  leading_hand: string | null;
  active: boolean | null;
};

type ProjectOption = {
  id: string;
  name: string;
};

const emptyAsset: PlantForm = {
  asset_id: "",
  name: "",
  make: "",
  model: "",
  plant_type: "",
  serial_number: "",
  rego: "",
  crew: "",
  project: "",
  next_service_date: "",
  cranesafe_expiry: "",
  insurance_expiry: "",
  hired: false,
  hired_from: "",
  hire_term: "",
  notes: "",
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function formatDate(value: string | null) {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function getAssetStatus(asset: PlantAsset) {
  const serviceDays = daysUntil(asset.next_service_date);
  const cranesafeDays = daysUntil(asset.cranesafe_expiry);
  const insuranceDays = daysUntil(asset.insurance_expiry);

  const expiryDays = [serviceDays, cranesafeDays, insuranceDays].filter(
    (day): day is number => day !== null
  );

  if (expiryDays.some((day) => day < 0)) return "Review";
  if (expiryDays.some((day) => day <= 30)) return "Due Soon";
  if (clean(asset.crew) || clean(asset.project)) return "In Use";

  return "Available";
}

function getTone(status: string): Tone {
  const value = status.toLowerCase();

  if (value.includes("available")) return "emerald";
  if (value.includes("due")) return "amber";
  if (value.includes("review") || value.includes("expired") || value.includes("out")) {
    return "rose";
  }

  return "blue";
}

function normaliseKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readValue(row: Record<string, unknown>, keys: string[]) {
  const lookup = new Map<string, unknown>();

  Object.entries(row).forEach(([key, value]) => {
    lookup.set(normaliseKey(key), value);
  });

  for (const key of keys) {
    const value = lookup.get(normaliseKey(key));

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

function toBoolean(value: string) {
  const cleanValue = value.toLowerCase().trim();

  return ["yes", "y", "true", "1", "hired"].includes(cleanValue);
}

function toDateInput(value: string) {
  if (!value) return "";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toISOString().slice(0, 10);
}

export default function PlantPage() {
  const supabase = useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    return createClient(supabaseUrl, supabaseAnonKey);
  }, []);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [assets, setAssets] = useState<PlantAsset[]>([]);
  const [crews, setCrews] = useState<CrewOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All plant types");
  const [projectFilter, setProjectFilter] = useState("All projects");
  const [statusFilter, setStatusFilter] = useState("All statuses");

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlantForm>(emptyAsset);

  useEffect(() => {
    let cancelled = false;

async function fetchInitialData() {
  const [assetResult, crewResult, projectResult] = await Promise.all([
    supabase.from("plant_assets").select("*").order("asset_id", { ascending: true }),

    supabase
      .from("crews")
      .select("id, crew_number, crew_name, leading_hand, active")
      .neq("active", false)
      .order("crew_number", { ascending: true }),

    supabase
      .from("projects")
      .select("id, name")
      .order("name", { ascending: true }),
  ]);

      if (cancelled) return;

      if (assetResult.error) {
        console.error(assetResult.error.message);
        setAssets([]);
      } else {
        setAssets((assetResult.data ?? []) as PlantAsset[]);
      }

      if (crewResult.error) {
        console.error(crewResult.error.message);
        setCrews([]);
      } else {
        setCrews((crewResult.data ?? []) as CrewOption[]);
      }

      if (projectResult.error) {
        console.error(projectResult.error.message);
        setProjects([]);
      } else {
        setProjects((projectResult.data ?? []) as ProjectOption[]);
      }

      setLoading(false);
    }

    void fetchInitialData();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function loadAssets() {
    setLoading(true);

    const { data, error } = await supabase
      .from("plant_assets")
      .select("*")
      .order("asset_id", { ascending: true });

    if (error) {
      console.error(error.message);
      setAssets([]);
    } else {
      setAssets((data ?? []) as PlantAsset[]);
    }

    setLoading(false);
  }

  const enhancedAssets = useMemo<EnhancedPlantAsset[]>(() => {
    return assets.map((asset) => {
      const calculatedStatus = getAssetStatus(asset);

      return {
        ...asset,
        calculatedStatus,
        tone: getTone(calculatedStatus),
      };
    });
  }, [assets]);

  const plantTypes = useMemo(() => {
    return [
      "All plant types",
      ...Array.from(new Set(assets.map((asset) => clean(asset.plant_type)).filter(Boolean))).sort(),
    ];
  }, [assets]);

  const projectOptions = useMemo(() => {
    return [
      "All projects",
      ...Array.from(new Set(assets.map((asset) => clean(asset.project)).filter(Boolean))).sort(),
    ];
  }, [assets]);

  const statuses = useMemo(() => {
    return [
      "All statuses",
      ...Array.from(new Set(enhancedAssets.map((asset) => asset.calculatedStatus))).sort(),
    ];
  }, [enhancedAssets]);

  const filteredAssets = useMemo(() => {
    const query = search.toLowerCase().trim();

    return enhancedAssets.filter((asset) => {
      const haystack = [
        asset.asset_id,
        asset.name,
        asset.make,
        asset.model,
        asset.plant_type,
        asset.serial_number,
        asset.rego,
        asset.crew,
        asset.project,
        asset.hired_from,
        asset.hire_term,
        asset.notes,
      ]
        .map((value) => clean(value))
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || haystack.includes(query);
      const matchesType = typeFilter === "All plant types" || clean(asset.plant_type) === typeFilter;
      const matchesProject =
        projectFilter === "All projects" || clean(asset.project) === projectFilter;
      const matchesStatus =
        statusFilter === "All statuses" || asset.calculatedStatus === statusFilter;

      return matchesSearch && matchesType && matchesProject && matchesStatus;
    });
  }, [enhancedAssets, search, typeFilter, projectFilter, statusFilter]);

  const kpis = useMemo(() => {
    return {
      total: assets.length,
      available: enhancedAssets.filter((asset) => asset.calculatedStatus === "Available").length,
      dueSoon: enhancedAssets.filter((asset) => asset.calculatedStatus === "Due Soon").length,
      review: enhancedAssets.filter((asset) => asset.calculatedStatus === "Review").length,
    };
  }, [assets.length, enhancedAssets]);

  function openNewForm() {
    setEditingId(null);
    setForm(emptyAsset);
    setFormOpen(true);
  }

  function openEditForm(asset: PlantAsset) {
    setEditingId(asset.id);
    setForm({
      asset_id: clean(asset.asset_id),
      name: clean(asset.name),
      make: clean(asset.make),
      model: clean(asset.model),
      plant_type: clean(asset.plant_type),
      serial_number: clean(asset.serial_number),
      rego: clean(asset.rego),
      crew: clean(asset.crew),
      project: clean(asset.project),
      next_service_date: clean(asset.next_service_date),
      cranesafe_expiry: clean(asset.cranesafe_expiry),
      insurance_expiry: clean(asset.insurance_expiry),
      hired: Boolean(asset.hired),
      hired_from: clean(asset.hired_from),
      hire_term: clean(asset.hire_term),
      notes: clean(asset.notes),
    });
    setFormOpen(true);
  }

  async function saveAsset() {
    if (!clean(form.asset_id)) {
      alert("Asset ID is required.");
      return;
    }

    setSaving(true);

    const payload = {
      ...form,
      asset_id: clean(form.asset_id),
      hired_from: form.hired ? clean(form.hired_from) : "",
      hire_term: form.hired ? clean(form.hire_term) : "",
      updated_at: new Date().toISOString(),
    };

    const result = editingId
      ? await supabase.from("plant_assets").update(payload).eq("id", editingId)
      : await supabase.from("plant_assets").upsert(payload, { onConflict: "asset_id" });

    if (result.error) {
      alert(result.error.message);
    } else {
      setFormOpen(false);
      await loadAssets();
    }

    setSaving(false);
  }

  async function deleteAsset(id: string) {
    const confirmed = window.confirm("Delete this plant item?");
    if (!confirmed) return;

    const { error } = await supabase.from("plant_assets").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadAssets();
  }

  async function uploadPlantDocument(assetId: string, documentType: string, file: File) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const folder = documentType.replace(/\s+/g, "_").toLowerCase();
    const uniqueName = crypto.randomUUID();
const path = `${assetId}/${folder}/${uniqueName}-${safeName}`;

    const upload = await supabase.storage.from("plant_docs").upload(path, file, {
      upsert: false,
    });

    if (upload.error) {
      alert(upload.error.message);
      return;
    }

    const { data } = supabase.storage.from("plant_docs").getPublicUrl(path);

    const insert = await supabase.from("plant_asset_documents").insert({
      plant_asset_id: assetId,
      document_type: documentType,
      file_name: file.name,
      file_url: data.publicUrl,
    });

    if (insert.error) {
      alert(insert.error.message);
      return;
    }

    alert(`${documentType} uploaded.`);
  }

  function handleCsvUpload(file: File) {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async ({ data }) => {
        const rows = data
          .map((row) => {
            const hired = toBoolean(readValue(row, ["Hired", "Hire", "Wet Hire", "Dry Hire"]));

            return {
              asset_id: readValue(row, ["Asset ID", "Asset", "Plant ID", "Plant No", "Plant Number"]),
              name: readValue(row, ["Name", "Description", "Asset Name", "Plant Name"]),
              make: readValue(row, ["Make", "Manufacturer"]),
              model: readValue(row, ["Model"]),
              plant_type: readValue(row, ["Type", "Plant Type", "Category"]),
              serial_number: readValue(row, ["Serial", "Serial Number", "VIN"]),
              rego: readValue(row, ["Rego", "Registration", "Registration Number"]),
              crew: readValue(row, ["Crew", "Allocated Crew"]),
              project: readValue(row, ["Project", "Job", "Allocation"]),
              next_service_date: toDateInput(
                readValue(row, ["Next Service", "Next Service Date", "Service Due"])
              ),
              cranesafe_expiry: toDateInput(
                readValue(row, ["CraneSafe", "Crane Safe", "CraneSafe Expiry"])
              ),
              insurance_expiry: toDateInput(readValue(row, ["Insurance", "Insurance Expiry"])),
              hired,
              hired_from: hired ? readValue(row, ["Hired From", "Hire Company", "Owner"]) : "",
              hire_term: hired ? readValue(row, ["Hire Term", "Term"]) : "",
              notes: readValue(row, ["Notes", "Comments"]),
              updated_at: new Date().toISOString(),
            };
          })
          .filter((row) => clean(row.asset_id));

        if (!rows.length) {
          alert("No valid plant rows found. Make sure the CSV has an Asset ID column.");
          return;
        }

        setSaving(true);

        const { error } = await supabase
          .from("plant_assets")
          .upsert(rows, { onConflict: "asset_id" });

        if (error) {
          alert(error.message);
        } else {
          await loadAssets();
        }

        setSaving(false);
      },
      error: (error) => {
        alert(error.message);
      },
    });
  }

  function exportCsv() {
    const rows = filteredAssets.map((asset) => ({
      "Asset ID": clean(asset.asset_id),
      Name: clean(asset.name),
      Make: clean(asset.make),
      Model: clean(asset.model),
      Type: clean(asset.plant_type),
      Serial: clean(asset.serial_number),
      Rego: clean(asset.rego),
      Crew: clean(asset.crew),
      Project: clean(asset.project),
      Status: asset.calculatedStatus,
      "Next Service": clean(asset.next_service_date),
      "CraneSafe Expiry": clean(asset.cranesafe_expiry),
      "Insurance Expiry": clean(asset.insurance_expiry),
      Hired: asset.hired ? "Yes" : "No",
      "Hired From": clean(asset.hired_from),
      "Hire Term": clean(asset.hire_term),
      Notes: clean(asset.notes),
    }));

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "plant-assets.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Asset Register"
        title="Plant"
        description="Major plant register for cranes, telehandlers, generators and hired plant. Upload, save, edit and manage live plant records."
        actions={
          <>
            <ActionButton href="/assets/maintenance/new" variant="secondary" icon={<Wrench size={16} />}>
              Raise Job
            </ActionButton>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <FileUp size={16} />
              Upload CSV
            </button>

            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Download size={16} />
              Export
            </button>

            <button
              type="button"
              onClick={openNewForm}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus size={16} />
              Add Plant
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) handleCsvUpload(file);

                event.target.value = "";
              }}
            />
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Plant" value={String(kpis.total)} detail="live register rows" tone="blue" />
        <KpiCard label="Available" value={String(kpis.available)} detail="ready for allocation" tone="emerald" />
        <KpiCard label="Due Soon" value={String(kpis.dueSoon)} detail="service or compliance" tone="amber" />
        <KpiCard label="Review" value={String(kpis.review)} detail="expired or fleet check" tone="rose" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search asset, rego, make, serial..."
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />

          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          >
            {plantTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>

          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          >
            {projectOptions.map((project) => (
              <option key={project}>{project}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          >
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </div>
      </section>

      <RegisterList
        title="Plant Register"
        description={loading ? "Loading plant register..." : `${filteredAssets.length} plant items shown.`}
        items={filteredAssets}
        getKey={(asset) => asset.id}
        columns={[
          {
            label: "Asset",
            render: (asset) => (
              <div>
                <p className="font-semibold text-slate-950">{clean(asset.asset_id)}</p>
                <p className="mt-1 text-slate-600">{clean(asset.name) || "Unnamed plant"}</p>
              </div>
            ),
          },
          { label: "Type", render: (asset) => clean(asset.plant_type) || "N/A" },
          {
            label: "Make / Model",
            render: (asset) => `${clean(asset.make) || "N/A"} ${clean(asset.model)}`.trim(),
          },
          {
            label: "Allocation",
            render: (asset) => (
              <div>
                <p className="font-semibold text-slate-950">{clean(asset.crew) || "Unassigned"}</p>
                <p className="mt-1 text-slate-600">{clean(asset.project) || "No project"}</p>
              </div>
            ),
          },
          { label: "Rego", render: (asset) => clean(asset.rego) || "No Rego" },
          { label: "Next Service", render: (asset) => formatDate(asset.next_service_date) },
          {
            label: "Hire",
            render: (asset) =>
              asset.hired
                ? `${clean(asset.hired_from) || "Hired"} / ${clean(asset.hire_term) || "No term"}`
                : "Owned",
          },
          {
            label: "Status",
            render: (asset) => <StatusBadge label={asset.calculatedStatus} tone={asset.tone} />,
          },
          {
            label: "Actions",
            render: (asset) => (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditForm(asset)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw size={14} />
                  Update
                </button>

                <button
                  type="button"
                  onClick={() => void deleteAsset(asset.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 size={14} />
                  Delete
                </button>

                <RecordActions
                  recordType="plant"
                  recordLabel={`${clean(asset.asset_id)} ${clean(asset.name)}`}
                  viewHref={`/assets/plant/${asset.id}`}
                  editHref={`/assets/plant/${asset.id}/edit`}
                />
              </div>
            ),
          },
        ]}
        renderMobile={(asset) => (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{clean(asset.asset_id)}</p>
                <p className="mt-1 text-sm text-slate-600">{clean(asset.name) || "Unnamed plant"}</p>
              </div>

              <StatusBadge label={asset.calculatedStatus} tone={asset.tone} />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Type</p>
                <p>{clean(asset.plant_type) || "N/A"}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Rego</p>
                <p>{clean(asset.rego) || "No Rego"}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Crew</p>
                <p>{clean(asset.crew) || "Unassigned"}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Service</p>
                <p>{formatDate(asset.next_service_date)}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => openEditForm(asset)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw size={14} />
              Update Asset
            </button>
          </div>
        )}
      />

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                  {editingId ? "Update Plant" : "Add Plant"}
                </p>
                <h2 className="text-xl font-bold text-slate-950">Plant Asset Details</h2>
              </div>

              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["Asset ID", "asset_id"],
                ["Name", "name"],
                ["Make", "make"],
                ["Model", "model"],
                ["Type", "plant_type"],
                ["Serial Number", "serial_number"],
                ["Rego", "rego"],
              ].map(([label, key]) => (
                <label key={key} className="space-y-1 text-sm">
                  <span className="font-semibold text-slate-600">{label}</span>
                  <input
                    value={String(form[key as keyof PlantForm] ?? "")}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        [key]: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
                  />
                </label>
              ))}

              <label className="space-y-1 text-sm">
                <span className="font-semibold text-slate-600">Crew</span>
                <select
                  value={clean(form.crew)}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, crew: event.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
                >
                  <option value="">Unassigned</option>
{crews.map((crew) => {
  const label = crew.crew_name
    ? `${crew.crew_number} - ${crew.crew_name}`
    : crew.crew_number;

  return (
    <option
      key={crew.id}
      value={label}
    >
      {label}
    </option>
  );
})}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-semibold text-slate-600">Project</span>
                <select
                  value={clean(form.project)}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, project: event.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.name}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-semibold text-slate-600">Next Service</span>
                <input
                  type="date"
                  value={clean(form.next_service_date)}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      next_service_date: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-semibold text-slate-600">CraneSafe Expiry</span>
                <input
                  type="date"
                  value={clean(form.cranesafe_expiry)}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      cranesafe_expiry: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-semibold text-slate-600">Insurance Expiry</span>
                <input
                  type="date"
                  value={clean(form.insurance_expiry)}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      insurance_expiry: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
                />
              </label>
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(form.hired)}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    hired: event.target.checked,
                    hired_from: event.target.checked ? previous.hired_from : "",
                    hire_term: event.target.checked ? previous.hire_term : "",
                  }))
                }
              />
              Hired plant
            </label>

            {form.hired && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="font-semibold text-slate-600">Hired From</span>
                  <input
                    value={clean(form.hired_from)}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, hired_from: event.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
                  />
                </label>

                <label className="space-y-1 text-sm">
                  <span className="font-semibold text-slate-600">Hire Term</span>
                  <select
                    value={clean(form.hire_term)}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, hire_term: event.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
                  >
                    <option value="">Select term</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Project Duration">Project Duration</option>
                    <option value="As Required">As Required</option>
                  </select>
                </label>
              </div>
            )}

            <label className="mt-3 block space-y-1 text-sm">
              <span className="font-semibold text-slate-600">Notes</span>
              <textarea
                value={clean(form.notes)}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    notes: event.target.value,
                  }))
                }
                rows={4}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
              />
            </label>

            {editingId && (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-bold text-slate-950">Plant Documents</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Upload service history, insurance documents and crane compliance documents.
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {["Service History", "Insurance Document", "Crane Document"].map((type) => (
                    <label
                      key={type}
                      className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm hover:bg-slate-50"
                    >
                      <FileUp size={18} className="mb-2 text-slate-500" />
                      <span className="font-semibold text-slate-700">{type}</span>
                      <span className="mt-1 text-xs text-slate-400">PDF, image or document</span>
                      <input
                        type="file"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];

                          if (file && editingId) {
                            void uploadPlantDocument(editingId, type, file);
                          }

                          event.target.value = "";
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {!editingId && (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Save the plant item first, then reopen it to upload service history, insurance
                documents and crane documents.
              </div>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void saveAsset()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? "Saving..." : "Save Asset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
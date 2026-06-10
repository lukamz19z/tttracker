/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import {
  Download,
  Eye,
  FileUp,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Truck,
  Wrench,
  X,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { PageHeader, PageShell, RegisterList } from "../components";

type Tone = "emerald" | "amber" | "rose" | "blue" | "teal" | "slate";
type PlantType = "Crane" | "Telehandler" | "Other" | "";
type AssetStatus =
  | "Available"
  | "In Use"
  | "Off Hire"
  | "Superseded"
  | "Inactive"
  | "";

type PlantAsset = {
  id: string;
  asset_id: string | null;
  make: string | null;
  model: string | null;
  plant_type: string | null;
  serial_number: string | null;
  rego: string | null;
  crew: string | null;
  project: string | null;
  cranesafe_expiry: string | null;
  insurance_expiry: string | null;
  hired: boolean | null;
  hired_from: string | null;
  hire_term: string | null;
  asset_status: string | null;
  off_hire_date: string | null;
  superseded_by: string | null;
  inactive_reason: string | null;
  notes: string | null;
};

type PlantForm = Omit<PlantAsset, "id">;

type EnhancedPlantAsset = PlantAsset & {
  calculatedStatus: string;
  tone: Tone;
};

type CrewOption = {
  id: string;
  crew_number: string | null;
  crew_name: string | null;
  leading_hand: string | null;
  active: boolean | null;
};

type ProjectOption = {
  id: string;
  name: string;
};

type PendingDocument = {
  documentType: string;
  file: File;
};

const plantTypeOptions: PlantType[] = ["Crane", "Telehandler", "Other"];

const assetStatusOptions: AssetStatus[] = [
  "Available",
  "In Use",
  "Off Hire",
  "Superseded",
  "Inactive",
];

const baseDocumentTypes = [
  "Risk Assessment",
  "Service History",
  "Insurance Document",
];

const emptyAsset: PlantForm = {
  asset_id: "",
  make: "",
  model: "",
  plant_type: "",
  serial_number: "",
  rego: "",
  crew: "",
  project: "",
  cranesafe_expiry: "",
  insurance_expiry: "",
  hired: false,
  hired_from: "",
  hire_term: "",
  asset_status: "Available",
  off_hire_date: "",
  superseded_by: "",
  inactive_reason: "",
  notes: "",
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function isAssetCrane(asset: PlantAsset) {
  return clean(asset.plant_type).toLowerCase() === "crane";
}

function isAssetTelehandler(asset: PlantAsset) {
  return clean(asset.plant_type).toLowerCase() === "telehandler";
}

function isFormCrane(form: PlantForm) {
  return clean(form.plant_type).toLowerCase() === "crane";
}

function isFormTelehandler(form: PlantForm) {
  return clean(form.plant_type).toLowerCase() === "telehandler";
}

function getMakeModel(asset: PlantAsset) {
  return [asset.make, asset.model].map(clean).filter(Boolean).join(" ");
}

function getDocumentTypesForPlantType(plantType: string | null | undefined) {
  const type = clean(plantType).toLowerCase();

  if (type === "crane") {
    return [
      ...baseDocumentTypes,
      "Registration Document",
      "CraneSafe Certificate",
      "Load Charts",
      "Operator Manual",
      "Other Documents",
    ];
  }

  if (type === "telehandler") {
    return [
      ...baseDocumentTypes,
      "Prestart / Inspection Document",
      "Load Charts",
      "Operator Manual",
      "Other Documents",
    ];
  }

  return [...baseDocumentTypes, "Manual", "Other Documents"];
}

function getAssetStatus(asset: PlantAsset) {
  const manualStatus = clean(asset.asset_status);

  if (manualStatus === "Off Hire") return "Off Hire";
  if (manualStatus === "Superseded") return "Superseded";
  if (manualStatus === "Inactive") return "Inactive";
  if (manualStatus === "In Use") return "In Use";
  if (manualStatus === "Available") return "Available";

  if (asset.hired && clean(asset.off_hire_date)) return "Off Hire";
  if (clean(asset.superseded_by)) return "Superseded";
  if (clean(asset.crew) || clean(asset.project)) return "In Use";

  return "Available";
}

function getTone(status: string): Tone {
  if (status === "Available" || status === "Active") return "emerald";
  if (status === "In Use" || status === "On Hire") return "teal";

  if (
    status === "Off Hire" ||
    status === "Inactive" ||
    status === "Retired" ||
    status === "Superseded" ||
    status === "Not Hired"
  ) {
    return "rose";
  }

  return "amber";
}

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  const classes =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "teal"
        ? "border-teal-200 bg-teal-50 text-teal-700"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : tone === "amber"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : tone === "blue"
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold ${classes}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function StatCard({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string;
  value: number;
  detail: string;
  tone: Tone;
  icon: React.ReactNode;
}) {
  const classes =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-blue-200 bg-blue-50 text-blue-800";

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${classes}`}>
      <div className="flex items-center gap-4">
        <div className="rounded-2xl bg-white/70 p-3 shadow-sm">{icon}</div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide opacity-75">
            {label}
          </p>
          <p className="mt-1 text-3xl font-black">{value}</p>
          <p className="text-sm font-medium opacity-80">{detail}</p>
        </div>
      </div>
    </div>
  );
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

  const [assets, setAssets] = useState<PlantAsset[]>([]);
  const [crews, setCrews] = useState<CrewOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [pendingDocuments, setPendingDocuments] = useState<PendingDocument[]>(
    [],
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All Plant Types");
  const [projectFilter, setProjectFilter] = useState("All Projects");
  const [statusFilter, setStatusFilter] = useState("All Statuses");

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlantForm>(emptyAsset);
  const [manageAsset, setManageAsset] = useState<EnhancedPlantAsset | null>(
    null,
  );

  const loadAssets = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("plant_assets")
      .select("*")
      .order("asset_id", { ascending: true });

    if (error) {
      console.error("Failed to load plant assets:", error.message);
      setAssets([]);
    } else {
      setAssets((data ?? []) as PlantAsset[]);
    }

    setLoading(false);
  }, [supabase]);

  const loadSupportingData = useCallback(async () => {
    const [crewResult, projectResult] = await Promise.all([
      supabase
        .from("crews")
        .select("id, crew_number, crew_name, leading_hand, active")
        .order("crew_number", { ascending: true }),
      supabase.from("projects").select("id, name").order("name", {
        ascending: true,
      }),
    ]);

    setCrews(crewResult.error ? [] : ((crewResult.data ?? []) as CrewOption[]));
    setProjects(
      projectResult.error ? [] : ((projectResult.data ?? []) as ProjectOption[]),
    );
  }, [supabase]);

  useEffect(() => {
    void loadAssets();
    void loadSupportingData();
  }, [loadAssets, loadSupportingData]);

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
      "All Plant Types",
      ...Array.from(new Set(enhancedAssets.map((asset) => clean(asset.plant_type))))
        .filter(Boolean)
        .sort(),
    ];
  }, [enhancedAssets]);

  const projectOptions = useMemo(() => {
    return [
      "All Projects",
      ...Array.from(new Set(enhancedAssets.map((asset) => clean(asset.project))))
        .filter(Boolean)
        .sort(),
    ];
  }, [enhancedAssets]);

  const statusOptions = useMemo(() => {
    return [
      "All Statuses",
      ...Array.from(
        new Set(enhancedAssets.map((asset) => clean(asset.calculatedStatus))),
      )
        .filter(Boolean)
        .sort(),
    ];
  }, [enhancedAssets]);

  const filteredAssets = useMemo(() => {
    const term = search.trim().toLowerCase();

    return enhancedAssets.filter((asset) => {
      const makeModel = getMakeModel(asset);

      const searchable = [
        asset.asset_id,
        asset.make,
        asset.model,
        makeModel,
        asset.plant_type,
        asset.serial_number,
        asset.rego,
        asset.crew,
        asset.project,
        asset.hired_from,
        asset.hire_term,
        asset.asset_status,
        asset.calculatedStatus,
        asset.inactive_reason,
        asset.notes,
      ]
        .join(" ")
        .toLowerCase();

      return (
        searchable.includes(term) &&
        (typeFilter === "All Plant Types" ||
          clean(asset.plant_type) === typeFilter) &&
        (projectFilter === "All Projects" ||
          clean(asset.project) === projectFilter) &&
        (statusFilter === "All Statuses" ||
          asset.calculatedStatus === statusFilter)
      );
    });
  }, [enhancedAssets, search, typeFilter, projectFilter, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: enhancedAssets.length,
      cranes: enhancedAssets.filter(
        (asset) => clean(asset.plant_type) === "Crane",
      ).length,
      telehandlers: enhancedAssets.filter(
        (asset) => clean(asset.plant_type) === "Telehandler",
      ).length,
      inUse: enhancedAssets.filter(
        (asset) => asset.calculatedStatus === "In Use",
      ).length,
    };
  }, [enhancedAssets]);

  function openNewForm() {
    setEditingId(null);
    setForm(emptyAsset);
    setPendingDocuments([]);
    setManageAsset(null);
    setFormOpen(true);
  }

  async function uploadPlantDocument(
    assetId: string,
    documentType: string,
    file: File,
  ) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const folder = documentType.replace(/\s+/g, "_").toLowerCase();
    const uniqueName = crypto.randomUUID();
    const path = `${assetId}/${folder}/${uniqueName}-${safeName}`;

    const upload = await supabase.storage.from("plant_docs").upload(path, file, {
      upsert: false,
    });

    if (upload.error) throw new Error(upload.error.message);

    const { data } = supabase.storage.from("plant_docs").getPublicUrl(path);

    const insert = await supabase.from("plant_asset_documents").insert({
      plant_asset_id: assetId,
      document_type: documentType,
      file_name: file.name,
      file_url: data.publicUrl,
    });

    if (insert.error) throw new Error(insert.error.message);
  }

  async function saveAsset() {
    if (!clean(form.asset_id)) {
      alert("Asset ID is required.");
      return;
    }

    if (!clean(form.plant_type)) {
      alert("Plant type is required.");
      return;
    }

    setSaving(true);

    const assetStatus = clean(form.asset_status) || "Available";

    const payload = {
      ...form,
      asset_id: clean(form.asset_id),
      make: clean(form.make),
      model: clean(form.model),
      plant_type: clean(form.plant_type),
      serial_number: clean(form.serial_number),
      rego: isFormTelehandler(form) ? "" : clean(form.rego),
      crew: clean(form.crew),
      project: clean(form.project),
      cranesafe_expiry: isFormCrane(form)
        ? clean(form.cranesafe_expiry) || null
        : null,
      insurance_expiry: clean(form.insurance_expiry) || null,
      hired: Boolean(form.hired),
      hired_from: form.hired ? clean(form.hired_from) : "",
      hire_term: form.hired ? clean(form.hire_term) : "",
      asset_status: assetStatus,
      off_hire_date:
        assetStatus === "Off Hire" ? clean(form.off_hire_date) || null : null,
      superseded_by:
        assetStatus === "Superseded" ? clean(form.superseded_by) || null : null,
      inactive_reason:
        assetStatus === "Inactive" ||
        assetStatus === "Superseded" ||
        assetStatus === "Off Hire"
          ? clean(form.inactive_reason)
          : "",
      notes: clean(form.notes),
      updated_at: new Date().toISOString(),
    };

    const result = editingId
      ? await supabase
          .from("plant_assets")
          .update(payload)
          .eq("id", editingId)
          .select("id")
          .single()
      : await supabase
          .from("plant_assets")
          .upsert(payload, { onConflict: "asset_id" })
          .select("id")
          .single();

    if (result.error) {
      alert(result.error.message);
      setSaving(false);
      return;
    }

    const savedAssetId = result.data?.id;

    if (savedAssetId && pendingDocuments.length > 0) {
      try {
        for (const document of pendingDocuments) {
          await uploadPlantDocument(
            savedAssetId,
            document.documentType,
            document.file,
          );
        }
      } catch (error) {
        alert(error instanceof Error ? error.message : "Document upload failed.");
        setSaving(false);
        return;
      }
    }

    setFormOpen(false);
    setPendingDocuments([]);
    await loadAssets();
    setSaving(false);
  }

  function exportCsv() {
    const rows = filteredAssets.map((asset) => ({
      "Asset ID": clean(asset.asset_id),
      Make: clean(asset.make),
      Model: clean(asset.model),
      Type: clean(asset.plant_type),
      Serial: clean(asset.serial_number),
      Rego: isAssetTelehandler(asset) ? "N/A" : clean(asset.rego),
      Crew: clean(asset.crew),
      Project: clean(asset.project),
      Status: asset.calculatedStatus,
      "Off Hire Date": clean(asset.off_hire_date),
      "Superseded By": clean(asset.superseded_by),
      "Inactive Reason": clean(asset.inactive_reason),
      "CraneSafe Expiry": isAssetCrane(asset)
        ? clean(asset.cranesafe_expiry)
        : "N/A",
      "Insurance Expiry": clean(asset.insurance_expiry),
      Hired: asset.hired ? "Yes" : "No",
      "Hired From": clean(asset.hired_from),
      "Hire Term": clean(asset.hire_term),
      Notes: clean(asset.notes),
    }));

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);

    const link = document.createElement("a");
    link.href = url;
    link.download = `plant-register-${date}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  function addPendingDocument(documentType: string, file: File) {
    setPendingDocuments((previous) => [...previous, { documentType, file }]);
  }

  function removePendingDocument(index: number) {
    setPendingDocuments((previous) =>
      previous.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Asset Register"
        title="Plant"
        description="Track cranes, telehandlers and other major plant. Keep the register simple here, then open the view page for full detail."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadAssets()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            <button
              type="button"
              onClick={exportCsv}
              disabled={filteredAssets.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} />
              Export CSV
            </button>

            <button
              type="button"
              onClick={openNewForm}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus size={16} />
              Add Plant
            </button>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Plant"
          value={stats.total}
          detail="All registered plant"
          tone="blue"
          icon={<Wrench size={22} />}
        />

        <StatCard
          label="Cranes"
          value={stats.cranes}
          detail="Crane assets"
          tone="emerald"
          icon={<ShieldCheck size={22} />}
        />

        <StatCard
          label="Telehandlers"
          value={stats.telehandlers}
          detail="Telehandler assets"
          tone="amber"
          icon={<Truck size={22} />}
        />

        <StatCard
          label="In Use"
          value={stats.inUse}
          detail="Currently allocated"
          tone="rose"
          icon={<Settings size={22} />}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setManageAsset(null);
            }}
            placeholder="Search asset ID, make, model, serial..."
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          />

          <select
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value);
              setManageAsset(null);
            }}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          >
            {plantTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>

          <select
            value={projectFilter}
            onChange={(event) => {
              setProjectFilter(event.target.value);
              setManageAsset(null);
            }}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          >
            {projectOptions.map((project) => (
              <option key={project}>{project}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setManageAsset(null);
            }}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          >
            {statusOptions.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Export CSV will export the plant items currently shown after search and
          filters.
        </div>
      </section>

      <RegisterList
        title="Plant Register"
        description={
          loading
            ? "Loading plant register..."
            : `${filteredAssets.length} of ${enhancedAssets.length} plant items shown`
        }
        items={filteredAssets}
        getKey={(asset) => asset.id}
        columns={[
          {
            label: "Asset ID",
            render: (asset) => (
              <div className="flex items-center gap-3">
                <div className="hidden rounded-xl bg-slate-100 p-2 text-slate-600 sm:flex">
                  <Wrench size={16} />
                </div>

                <span className="font-bold text-slate-950">
                  {clean(asset.asset_id) || "No ID"}
                </span>
              </div>
            ),
          },
          {
            label: "Type",
            render: (asset) => clean(asset.plant_type) || "N/A",
          },
          {
            label: "Make & Model",
            render: (asset) => getMakeModel(asset) || "N/A",
          },
          {
            label: "Allocation",
            render: (asset) => (
              <div>
                <p className="font-semibold text-slate-950">
                  {clean(asset.project) || "Unallocated project"}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {clean(asset.crew) || "Unallocated crew"}
                </p>
              </div>
            ),
          },
          {
            label: "Status",
            render: (asset) => (
              <StatusPill label={asset.calculatedStatus} tone={asset.tone} />
            ),
          },
          {
            label: "Actions",
            render: (asset) => (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/assets/plant/${asset.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <Eye size={14} />
                  View Asset
                </Link>

                <button
                  type="button"
                  onClick={() => setManageAsset(asset)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800"
                >
                  <Settings size={14} />
                  Manage
                </button>
              </div>
            ),
          },
        ]}
        renderMobile={(asset) => {
          const makeModel = getMakeModel(asset);

          return (
            <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-1">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                    <Wrench size={16} />
                  </div>

                  <div>
                    <p className="font-bold text-slate-950">
                      {clean(asset.asset_id) || "No ID"}
                    </p>
                    <p className="text-sm text-slate-600">
                      {clean(asset.plant_type) || "No plant type"}
                    </p>
                  </div>
                </div>

                <StatusPill label={asset.calculatedStatus} tone={asset.tone} />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Make & Model
                  </p>
                  <p className="font-semibold text-slate-800">
                    {makeModel || "N/A"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Rego
                  </p>
                  <p className="font-semibold text-slate-800">
                    {isAssetTelehandler(asset)
                      ? "N/A"
                      : clean(asset.rego) || "No rego"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Project
                  </p>
                  <p className="font-semibold text-slate-800">
                    {clean(asset.project) || "Unallocated"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Crew
                  </p>
                  <p className="font-semibold text-slate-800">
                    {clean(asset.crew) || "Unallocated"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/assets/plant/${asset.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                >
                  <Eye size={14} />
                  View Asset
                </Link>

                <button
                  type="button"
                  onClick={() => setManageAsset(asset)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white"
                >
                  <Settings size={14} />
                  Manage
                </button>
              </div>
            </div>
          );
        }}
      />

      {manageAsset ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Manage Asset
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  {clean(manageAsset.asset_id) || "Plant Asset"}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {clean(manageAsset.plant_type) || "No type"} ·{" "}
                  {getMakeModel(manageAsset) || "No make/model"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setManageAsset(null)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              <Link
                href={`/assets/plant/${manageAsset.id}/edit`}
                className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:bg-white"
              >
                <Pencil size={20} className="mt-1 text-slate-700" />
                <div>
                  <p className="text-base font-black text-slate-950">
                    Edit Details
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Use this for asset details, allocation, hire status,
                    documents and notes.
                  </p>
                </div>
              </Link>

              <Link
                href={`/assets/plant/${manageAsset.id}/update`}
                className="flex items-start gap-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 hover:bg-orange-100"
              >
                <Wrench size={20} className="mt-1 text-orange-700" />
                <div>
                  <p className="text-base font-black text-orange-800">
                    Update Asset
                  </p>
                  <p className="mt-1 text-sm text-orange-700">
                    Use this for services, inspections, repairs, modifications
                    and project transfers.
                  </p>
                </div>
              </Link>

              <Link
                href={`/assets/plant/${manageAsset.id}/compliance`}
                className="flex items-start gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 hover:bg-blue-100"
              >
                <ShieldCheck size={20} className="mt-1 text-blue-700" />
                <div>
                  <p className="text-base font-black text-blue-800">
                    Compliance
                  </p>
                  <p className="mt-1 text-sm text-blue-700">
                    Review plant compliance records, risk assessments,
                    CraneSafe and insurance details.
                  </p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  {editingId ? "Update Plant" : "Add Plant"}
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  Plant Asset Details
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Add the basic plant details here. Full servicing and history
                  can be handled from the asset update page.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["Asset ID", "asset_id"],
                ["Make", "make"],
                ["Model", "model"],
                ["Serial Number", "serial_number"],
                ...(isFormTelehandler(form) ? [] : [["Rego", "rego"]]),
              ].map(([label, key]) => (
                <label key={key} className="space-y-1 text-sm">
                  <span className="font-bold text-slate-600">{label}</span>
                  <input
                    value={String(form[key as keyof PlantForm] ?? "")}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        [key]: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>
              ))}

              <label className="space-y-1 text-sm">
                <span className="font-bold text-slate-600">Type</span>
                <select
                  value={clean(form.plant_type)}
                  onChange={(event) => {
                    const nextType = event.target.value;

                    setForm((previous) => ({
                      ...previous,
                      plant_type: nextType,
                      rego: nextType === "Telehandler" ? "" : previous.rego,
                      cranesafe_expiry:
                        nextType === "Crane" ? previous.cranesafe_expiry : "",
                    }));
                  }}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                >
                  <option value="">Select type</option>
                  {plantTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-bold text-slate-600">Status</span>
                <select
                  value={clean(form.asset_status) || "Available"}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      asset_status: event.target.value,
                      off_hire_date:
                        event.target.value === "Off Hire"
                          ? previous.off_hire_date
                          : "",
                      superseded_by:
                        event.target.value === "Superseded"
                          ? previous.superseded_by
                          : "",
                      inactive_reason:
                        event.target.value === "Inactive" ||
                        event.target.value === "Superseded" ||
                        event.target.value === "Off Hire"
                          ? previous.inactive_reason
                          : "",
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                >
                  {assetStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              {clean(form.asset_status) === "Off Hire" && (
                <label className="space-y-1 text-sm">
                  <span className="font-bold text-slate-600">
                    Off Hire Date
                  </span>
                  <input
                    type="date"
                    value={clean(form.off_hire_date)}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        off_hire_date: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>
              )}

              {clean(form.asset_status) === "Superseded" && (
                <label className="space-y-1 text-sm">
                  <span className="font-bold text-slate-600">
                    Superseded By
                  </span>
                  <select
                    value={clean(form.superseded_by)}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        superseded_by: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  >
                    <option value="">Select replacement asset</option>
                    {assets
                      .filter((asset) => asset.id !== editingId)
                      .map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {clean(asset.asset_id)}{" "}
                          {getMakeModel(asset) || clean(asset.plant_type)}
                        </option>
                      ))}
                  </select>
                </label>
              )}

              {(clean(form.asset_status) === "Inactive" ||
                clean(form.asset_status) === "Superseded" ||
                clean(form.asset_status) === "Off Hire") && (
                <label className="space-y-1 text-sm">
                  <span className="font-bold text-slate-600">
                    Reason / Notes
                  </span>
                  <input
                    value={clean(form.inactive_reason)}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        inactive_reason: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>
              )}

              <label className="space-y-1 text-sm">
                <span className="font-bold text-slate-600">Crew</span>
                <select
                  value={clean(form.crew)}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      crew: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                >
                  <option value="">Unassigned</option>
                  {crews.map((crew) => {
                    const crewNumber = clean(crew.crew_number);
                    const crewName = clean(crew.crew_name);
                    const leadingHand = clean(crew.leading_hand);

                    const label = [
                      crewNumber || "Unnamed Crew",
                      crewName,
                      leadingHand ? `LH: ${leadingHand}` : "",
                    ]
                      .filter(Boolean)
                      .join(" - ");

                    return (
                      <option key={crew.id} value={crewNumber || label}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-bold text-slate-600">Project</span>
                <select
                  value={clean(form.project)}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      project: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.name}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>

              {isFormCrane(form) && (
                <label className="space-y-1 text-sm">
                  <span className="font-bold text-slate-600">
                    CraneSafe Expiry
                  </span>
                  <input
                    type="date"
                    value={clean(form.cranesafe_expiry)}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        cranesafe_expiry: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>
              )}

              <label className="space-y-1 text-sm">
                <span className="font-bold text-slate-600">
                  Insurance Expiry
                </span>
                <input
                  type="date"
                  value={clean(form.insurance_expiry)}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      insurance_expiry: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                />
              </label>
            </div>

            <label className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(form.hired)}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    hired: event.target.checked,
                    hired_from: event.target.checked ? previous.hired_from : "",
                    hire_term: event.target.checked ? previous.hire_term : "",
                    asset_status:
                      !event.target.checked && previous.asset_status === "Off Hire"
                        ? "Available"
                        : previous.asset_status,
                  }))
                }
              />
              Hired plant
            </label>

            {form.hired && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="font-bold text-slate-600">Hired From</span>
                  <input
                    value={clean(form.hired_from)}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        hired_from: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>

                <label className="space-y-1 text-sm">
                  <span className="font-bold text-slate-600">Hire Term</span>
                  <select
                    value={clean(form.hire_term)}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        hire_term: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
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
              <span className="font-bold text-slate-600">Notes</span>
              <textarea
                value={clean(form.notes)}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    notes: event.target.value,
                  }))
                }
                rows={4}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
              />
            </label>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-black text-slate-950">
                Initial Documentation
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Add service, insurance, manuals, load charts and plant-specific
                documents before saving.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                {getDocumentTypesForPlantType(form.plant_type).map((type) => (
                  <label
                    key={type}
                    className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm hover:bg-slate-50"
                  >
                    <FileUp size={18} className="mb-2 text-slate-500" />
                    <span className="font-bold text-slate-700">{type}</span>
                    <span className="mt-1 text-xs text-slate-400">
                      PDF, image or document
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];

                        if (file) {
                          addPendingDocument(type, file);
                        }

                        event.target.value = "";
                      }}
                    />
                  </label>
                ))}
              </div>

              {pendingDocuments.length > 0 && (
                <div className="mt-4 space-y-2">
                  {pendingDocuments.map((document, index) => (
                    <div
                      key={`${document.documentType}-${document.file.name}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-bold text-slate-700">
                          {document.documentType}
                        </p>
                        <p className="text-xs text-slate-500">
                          {document.file.name}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removePendingDocument(index)}
                        className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void saveAsset()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
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
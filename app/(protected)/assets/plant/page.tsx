/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { PageHeader, PageShell, RegisterList } from "../components";

type Tone = "emerald" | "amber" | "rose" | "blue" | "teal" | "slate";

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

type EnhancedPlant = PlantAsset & {
  calculated_status: string;
  tone: Tone;
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function getMakeModel(asset: PlantAsset) {
  return [asset.make, asset.model].map(clean).filter(Boolean).join(" ");
}

function getCalculatedStatus(asset: PlantAsset) {
  const manualStatus = clean(asset.asset_status);

  if (manualStatus) return manualStatus;
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

function csvSafe(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
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

  const [plantAssets, setPlantAssets] = useState<PlantAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All Plant Types");
  const [projectFilter, setProjectFilter] = useState("All Projects");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [manageAsset, setManageAsset] = useState<EnhancedPlant | null>(null);

  const loadPlantAssets = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("plant_assets")
      .select("*")
      .order("asset_id", { ascending: true });

    if (error) {
      console.error("Failed to load plant assets:", error.message);
      setPlantAssets([]);
    } else {
      setPlantAssets((data ?? []) as PlantAsset[]);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadPlantAssets();
  }, [loadPlantAssets]);

  const enhancedPlant = useMemo<EnhancedPlant[]>(() => {
    return plantAssets.map((asset) => {
      const calculated_status = getCalculatedStatus(asset);

      return {
        ...asset,
        calculated_status,
        tone: getTone(calculated_status),
      };
    });
  }, [plantAssets]);

  const typeOptions = useMemo(() => {
    return [
      "All Plant Types",
      ...Array.from(new Set(enhancedPlant.map((asset) => clean(asset.plant_type))))
        .filter(Boolean)
        .sort(),
    ];
  }, [enhancedPlant]);

  const projectOptions = useMemo(() => {
    return [
      "All Projects",
      ...Array.from(new Set(enhancedPlant.map((asset) => clean(asset.project))))
        .filter(Boolean)
        .sort(),
    ];
  }, [enhancedPlant]);

  const statusOptions = useMemo(() => {
    return [
      "All Statuses",
      ...Array.from(
        new Set(enhancedPlant.map((asset) => clean(asset.calculated_status))),
      )
        .filter(Boolean)
        .sort(),
    ];
  }, [enhancedPlant]);

  const filteredPlant = useMemo(() => {
    const term = search.trim().toLowerCase();

    return enhancedPlant.filter((asset) => {
      const makeModel = getMakeModel(asset);

      const searchable = [
        asset.asset_id,
        asset.rego,
        asset.make,
        asset.model,
        makeModel,
        asset.plant_type,
        asset.serial_number,
        asset.project,
        asset.crew,
        asset.hired_from,
        asset.hire_term,
        asset.calculated_status,
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
          asset.calculated_status === statusFilter)
      );
    });
  }, [enhancedPlant, search, typeFilter, projectFilter, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: enhancedPlant.length,
      cranes: enhancedPlant.filter(
        (asset) => clean(asset.plant_type) === "Crane",
      ).length,
      telehandlers: enhancedPlant.filter(
        (asset) => clean(asset.plant_type) === "Telehandler",
      ).length,
      inUse: enhancedPlant.filter(
        (asset) => asset.calculated_status === "In Use",
      ).length,
    };
  }, [enhancedPlant]);

  function exportFilteredPlant() {
    const headers = [
      "Asset ID",
      "Type",
      "Make",
      "Model",
      "Serial Number",
      "Rego",
      "Project",
      "Crew",
      "Status",
      "Hired",
      "Hired From",
      "Hire Term",
      "CraneSafe Expiry",
      "Insurance Expiry",
      "Off Hire Date",
      "Superseded By",
      "Inactive Reason",
      "Notes",
    ];

    const rows = filteredPlant.map((asset) => [
      clean(asset.asset_id),
      clean(asset.plant_type),
      clean(asset.make),
      clean(asset.model),
      clean(asset.serial_number),
      clean(asset.rego),
      clean(asset.project),
      clean(asset.crew),
      clean(asset.calculated_status),
      asset.hired ? "Yes" : "No",
      clean(asset.hired_from),
      clean(asset.hire_term),
      clean(asset.cranesafe_expiry),
      clean(asset.insurance_expiry),
      clean(asset.off_hire_date),
      clean(asset.superseded_by),
      clean(asset.inactive_reason),
      clean(asset.notes),
    ]);

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
    link.download = `plant-register-${date}.csv`;
    link.click();

    URL.revokeObjectURL(url);
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
              onClick={() => void loadPlantAssets()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            <button
              type="button"
              onClick={exportFilteredPlant}
              disabled={filteredPlant.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} />
              Export CSV
            </button>

            <Link
              href="/assets/plant/new"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus size={16} />
              Add Plant
            </Link>
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
            placeholder="Search asset ID, rego, make, model..."
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
            {typeOptions.map((option) => (
              <option key={option}>{option}</option>
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
            {projectOptions.map((option) => (
              <option key={option}>{option}</option>
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
            {statusOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Export CSV will export the plant assets currently shown after search and
          filters.
        </div>
      </section>

      <RegisterList
        title="Plant Register"
        description={
          loading
            ? "Loading plant..."
            : `${filteredPlant.length} of ${enhancedPlant.length} plant assets shown`
        }
        items={filteredPlant}
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
              <StatusPill
                label={asset.calculated_status}
                tone={asset.tone}
              />
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

                <StatusPill
                  label={asset.calculated_status}
                  tone={asset.tone}
                />
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
                    {clean(asset.rego) || "No rego"}
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
                    Use this for basic plant details, allocation, hire status,
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
                    Use this for services, repairs, modifications, inspections
                    and close-out updates.
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
                    Review risk assessments, CraneSafe, insurance and other
                    plant compliance items.
                  </p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
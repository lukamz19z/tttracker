"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CircleAlert,
  Download,
  Eye,
  Gauge,
  HardHat,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";

import { createSupabaseBrowser } from "@/lib/supabase";
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
  asset_status: string | null;

  hired: boolean | null;
  hired_from: string | null;

  current_engine_hours: number | string | null;
  last_service_date: string | null;
  last_service_hours: number | string | null;
  next_service_due: string | null;
  next_service_hours: number | string | null;
  next_inspection_due: string | null;

  rego_expiry: string | null;
  insurance_expiry: string | null;
  cranesafe_expiry: string | null;
  ten_year_inspection_due: string | null;
  risk_assessment_date: string | null;

  sharepoint_folder_id: string | null;
  sharepoint_web_url: string | null;
};

type FleetJobRow = {
  id: string;
  plant_asset_id: string | null;
  status: string | null;
};

type AssetDocumentRow = {
  id: string;
  plant_asset_id: string | null;
  is_current: boolean | null;
  active: boolean | null;
};

type EnhancedPlant = PlantAsset & {
  calculated_status: string;
  status_tone: Tone;
  compliance_label: "Overdue" | "Due Soon" | "Current" | "Not Set";
  compliance_tone: Tone;
  open_jobs: number;
  current_documents: number;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getMakeModel(asset: PlantAsset) {
  return [clean(asset.make), clean(asset.model)].filter(Boolean).join(" ");
}

function csvSafe(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function dateLabel(value: unknown) {
  const raw = clean(value);
  if (!raw) return "—";

  const parsed = new Date(`${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;

  return parsed.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(value: unknown) {
  const raw = clean(value);
  if (!raw) return null;

  const target = new Date(`${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function calculatedStatus(asset: PlantAsset) {
  const stored = clean(asset.asset_status);
  if (stored) return stored;
  if (clean(asset.project) || clean(asset.crew)) return "In Use";
  return "Available";
}

function statusTone(status: string): Tone {
  const value = clean(status).toLowerCase();

  if (["available", "active"].includes(value)) return "emerald";
  if (["in use", "on hire"].includes(value)) return "teal";
  if (["off hire", "inactive", "retired", "superseded"].includes(value)) {
    return "rose";
  }

  return "amber";
}

function complianceState(asset: PlantAsset) {
  let hasTracked = false;
  let dueSoon = false;
  let overdue = false;

  const dates = [
    asset.rego_expiry,
    asset.insurance_expiry,
    asset.cranesafe_expiry,
    asset.ten_year_inspection_due,
    asset.next_service_due,
    asset.next_inspection_due,
  ];

  for (const value of dates) {
    const days = daysUntil(value);
    if (days === null) continue;
    hasTracked = true;
    if (days < 0) overdue = true;
    else if (days <= 30) dueSoon = true;
  }

  const currentHours = numeric(asset.current_engine_hours);
  const nextHours = numeric(asset.next_service_hours);

  if (currentHours !== null && nextHours !== null) {
    hasTracked = true;
    const remaining = nextHours - currentHours;
    if (remaining <= 0) overdue = true;
    else if (remaining <= 50) dueSoon = true;
  }

  if (overdue) return { label: "Overdue" as const, tone: "rose" as Tone };
  if (dueSoon) return { label: "Due Soon" as const, tone: "amber" as Tone };
  if (hasTracked) return { label: "Current" as const, tone: "emerald" as Tone };
  return { label: "Not Set" as const, tone: "slate" as Tone };
}

function isOpenJob(status: unknown) {
  const value = clean(status).toLowerCase();
  return !["completed", "closed", "cancelled", "canceled", "resolved"].includes(
    value,
  );
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${classes}`}
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
  icon: ReactNode;
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
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [assets, setAssets] = useState<PlantAsset[]>([]);
  const [fleetJobs, setFleetJobs] = useState<FleetJobRow[]>([]);
  const [documents, setDocuments] = useState<AssetDocumentRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All Plant Types");
  const [projectFilter, setProjectFilter] = useState("All Projects");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [complianceFilter, setComplianceFilter] = useState("All Compliance");
  const [manageAsset, setManageAsset] = useState<EnhancedPlant | null>(null);

  const fetchAssets = useCallback(async () => {
    const [assetResult, jobResult, documentResult] = await Promise.all([
      supabase.from("plant_assets").select("*").order("asset_id"),
      supabase
        .from("fleet_jobs")
        .select("id,plant_asset_id,status")
        .not("plant_asset_id", "is", null),
      supabase
        .from("asset_documents")
        .select("id,plant_asset_id,is_current,active")
        .eq("asset_type", "plant")
        .eq("active", true),
    ]);

    const errors = [
      assetResult.error?.message,
      jobResult.error?.message,
      documentResult.error?.message,
    ].filter(Boolean);

    return {
      errorMessage: errors.join(" · "),
      assets: (assetResult.data ?? []) as PlantAsset[],
      fleetJobs: (jobResult.data ?? []) as FleetJobRow[],
      documents: (documentResult.data ?? []) as AssetDocumentRow[],
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    void fetchAssets()
      .then((result) => {
        if (cancelled) return;

        setErrorMessage(result.errorMessage);
        setAssets(result.assets);
        setFleetJobs(result.fleetJobs);
        setDocuments(result.documents);
      })
      .catch((error: unknown) => {
        if (cancelled) return;

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load the plant register.",
        );
        setAssets([]);
        setFleetJobs([]);
        setDocuments([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchAssets]);

  const refreshAssets = useCallback(() => {
    setLoading(true);
    setErrorMessage("");

    void fetchAssets()
      .then((result) => {
        setErrorMessage(result.errorMessage);
        setAssets(result.assets);
        setFleetJobs(result.fleetJobs);
        setDocuments(result.documents);
      })
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not refresh the plant register.",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [fetchAssets]);

  const enhancedAssets = useMemo<EnhancedPlant[]>(() => {
    return assets.map((asset) => {
      const status = calculatedStatus(asset);
      const compliance = complianceState(asset);

      return {
        ...asset,
        calculated_status: status,
        status_tone: statusTone(status),
        compliance_label: compliance.label,
        compliance_tone: compliance.tone,
        open_jobs: fleetJobs.filter(
          (job) => job.plant_asset_id === asset.id && isOpenJob(job.status),
        ).length,
        current_documents: documents.filter(
          (document) =>
            document.plant_asset_id === asset.id &&
            document.active !== false &&
            document.is_current !== false,
        ).length,
      };
    });
  }, [assets, documents, fleetJobs]);

  const typeOptions = useMemo(
    () => [
      "All Plant Types",
      ...Array.from(
        new Set(enhancedAssets.map((asset) => clean(asset.plant_type))),
      )
        .filter(Boolean)
        .sort(),
    ],
    [enhancedAssets],
  );

  const projectOptions = useMemo(
    () => [
      "All Projects",
      ...Array.from(
        new Set(enhancedAssets.map((asset) => clean(asset.project))),
      )
        .filter(Boolean)
        .sort(),
    ],
    [enhancedAssets],
  );

  const statusOptions = useMemo(
    () => [
      "All Statuses",
      ...Array.from(
        new Set(enhancedAssets.map((asset) => asset.calculated_status)),
      )
        .filter(Boolean)
        .sort(),
    ],
    [enhancedAssets],
  );

  const filteredAssets = useMemo(() => {
    const term = search.trim().toLowerCase();

    return enhancedAssets.filter((asset) => {
      const searchable = [
        asset.asset_id,
        asset.rego,
        asset.make,
        asset.model,
        asset.plant_type,
        asset.serial_number,
        asset.project,
        asset.crew,
        asset.hired_from,
        asset.calculated_status,
        asset.compliance_label,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase();

      return (
        searchable.includes(term) &&
        (typeFilter === "All Plant Types" ||
          clean(asset.plant_type) === typeFilter) &&
        (projectFilter === "All Projects" ||
          clean(asset.project) === projectFilter) &&
        (statusFilter === "All Statuses" ||
          asset.calculated_status === statusFilter) &&
        (complianceFilter === "All Compliance" ||
          asset.compliance_label === complianceFilter)
      );
    });
  }, [
    complianceFilter,
    enhancedAssets,
    projectFilter,
    search,
    statusFilter,
    typeFilter,
  ]);

  const stats = useMemo(
    () => ({
      total: enhancedAssets.length,
      inUse: enhancedAssets.filter(
        (asset) => clean(asset.calculated_status).toLowerCase() === "in use",
      ).length,
      dueSoon: enhancedAssets.filter(
        (asset) => asset.compliance_label === "Due Soon",
      ).length,
      overdue: enhancedAssets.filter(
        (asset) => asset.compliance_label === "Overdue",
      ).length,
    }),
    [enhancedAssets],
  );

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
      "Current Hours",
      "Next Service Date",
      "Next Service Hours",
      "Next Inspection",
      "Rego Expiry",
      "Insurance Expiry",
      "CraneSafe Expiry",
      "10 Year Inspection",
      "Compliance",
      "Open Fleet Jobs",
      "Current Documents",
    ];

    const rows = filteredAssets.map((asset) => [
      asset.asset_id,
      asset.plant_type,
      asset.make,
      asset.model,
      asset.serial_number,
      asset.rego,
      asset.project,
      asset.crew,
      asset.calculated_status,
      asset.current_engine_hours,
      asset.next_service_due,
      asset.next_service_hours,
      asset.next_inspection_due,
      asset.rego_expiry,
      asset.insurance_expiry,
      asset.cranesafe_expiry,
      asset.ten_year_inspection_due,
      asset.compliance_label,
      asset.open_jobs,
      asset.current_documents,
    ]);

    const csv = [
      headers.map(csvSafe).join(","),
      ...rows.map((row) => row.map(csvSafe).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `plant-register-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Asset Register"
        title="Plant"
        description="Current plant register linked to servicing, inspections, Fleet Jobs, controlled SharePoint documents and the Update Asset workflow."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={refreshAssets}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            <button
              type="button"
              onClick={exportFilteredPlant}
              disabled={filteredAssets.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <Download size={16} />
              Export CSV
            </button>

            <Link
              href="/assets/update?assetType=plant"
              className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-orange-700"
            >
              <Wrench size={16} />
              Update Plant
            </Link>

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

      {errorMessage ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {errorMessage}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Plant"
          value={stats.total}
          detail="All registered plant"
          tone="blue"
          icon={<HardHat size={22} />}
        />
        <StatCard
          label="In Use"
          value={stats.inUse}
          detail="Currently allocated"
          tone="emerald"
          icon={<Truck size={22} />}
        />
        <StatCard
          label="Due Soon"
          value={stats.dueSoon}
          detail="Service or compliance within 30 days"
          tone="amber"
          icon={<Gauge size={22} />}
        />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          detail="Service or compliance action required"
          tone="rose"
          icon={<CircleAlert size={22} />}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search ID, rego, make, serial, crew..."
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-slate-100"
          />

          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
          >
            {typeOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>

          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
          >
            {projectOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
          >
            {statusOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>

          <select
            value={complianceFilter}
            onChange={(event) => setComplianceFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
          >
            {["All Compliance", "Current", "Due Soon", "Overdue", "Not Set"].map(
              (option) => (
                <option key={option}>{option}</option>
              ),
            )}
          </select>
        </div>
      </section>

      <RegisterList
        title="Plant Register"
        description={
          loading
            ? "Loading plant..."
            : `${filteredAssets.length} of ${enhancedAssets.length} plant assets shown`
        }
        items={filteredAssets}
        getKey={(asset) => asset.id}
        columns={[
          {
            label: "Plant",
            render: (asset) => (
              <div>
                <div className="font-black text-slate-950">
                  {clean(asset.asset_id) || "No ID"}
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  {clean(asset.plant_type) || "No type"} ·{" "}
                  {clean(asset.rego) || clean(asset.serial_number) || "No rego/serial"}
                </div>
              </div>
            ),
          },
          {
            label: "Make & Model",
            render: (asset) => getMakeModel(asset) || "N/A",
          },
          {
            label: "Allocation",
            render: (asset) => (
              <div>
                <div className="font-semibold text-slate-900">
                  {clean(asset.project) || "Unallocated project"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {clean(asset.crew) || "Unallocated crew"}
                </div>
              </div>
            ),
          },
          {
            label: "Service",
            render: (asset) => (
              <div className="space-y-1">
                <div className="font-semibold text-slate-900">
                  {dateLabel(asset.next_service_due)}
                </div>
                <div className="text-xs text-slate-500">
                  {numeric(asset.next_service_hours) !== null
                    ? `${Number(asset.next_service_hours).toLocaleString("en-AU")} h`
                    : "No hours target"}
                </div>
              </div>
            ),
          },
          {
            label: "Compliance",
            render: (asset) => (
              <div className="space-y-2">
                <StatusPill
                  label={asset.compliance_label}
                  tone={asset.compliance_tone}
                />
                <div className="text-xs text-slate-500">
                  CraneSafe {dateLabel(asset.cranesafe_expiry)} · 10YR{" "}
                  {dateLabel(asset.ten_year_inspection_due)}
                </div>
              </div>
            ),
          },
          {
            label: "Status",
            render: (asset) => (
              <div className="space-y-2">
                <StatusPill
                  label={asset.calculated_status}
                  tone={asset.status_tone}
                />
                {asset.open_jobs > 0 ? (
                  <div className="text-xs font-bold text-rose-700">
                    {asset.open_jobs} open Fleet Job
                    {asset.open_jobs === 1 ? "" : "s"}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">No open Fleet Jobs</div>
                )}
              </div>
            ),
          },
          {
            label: "Actions",
            render: (asset) => (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/assets/plant/${asset.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                >
                  <Eye size={14} />
                  View
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
            ),
          },
        ]}
        renderMobile={(asset) => (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-black text-slate-950">
                  {clean(asset.asset_id) || "No ID"}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {clean(asset.plant_type) || "No type"} ·{" "}
                  {getMakeModel(asset) || "No make/model"}
                </div>
              </div>
              <StatusPill
                label={asset.compliance_label}
                tone={asset.compliance_tone}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Status" value={asset.calculated_status} />
              <Info
                label="Current Hours"
                value={
                  numeric(asset.current_engine_hours) !== null
                    ? `${Number(asset.current_engine_hours).toLocaleString("en-AU")} h`
                    : "—"
                }
              />
              <Info
                label="Next Service"
                value={
                  dateLabel(asset.next_service_due) +
                  (numeric(asset.next_service_hours) !== null
                    ? ` · ${Number(asset.next_service_hours).toLocaleString("en-AU")} h`
                    : "")
                }
              />
              <Info label="Fleet Jobs" value={String(asset.open_jobs)} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/assets/plant/${asset.id}`}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
              >
                View Asset
              </Link>
              <Link
                href={`/assets/update?assetType=plant&assetId=${asset.id}`}
                className="rounded-xl bg-orange-600 px-3 py-2 text-xs font-bold text-white"
              >
                Update Asset
              </Link>
            </div>
          </div>
        )}
      />

      {loading ? (
        <div className="fixed bottom-5 right-5 flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-xl">
          <Loader2 size={16} className="animate-spin" />
          Loading plant
        </div>
      ) : null}

      {manageAsset ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Manage Plant
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
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              <ManageLink
                href={`/assets/plant/${manageAsset.id}`}
                icon={<Eye size={20} />}
                title="View Asset"
                description="Service history, documents, spend, prestarts and Fleet Jobs."
              />
              <ManageLink
                href={`/assets/update?assetType=plant&assetId=${manageAsset.id}`}
                icon={<Wrench size={20} />}
                title="Update Asset"
                description="Service, repair, modification, inspection, compliance or allocation update."
                accent="orange"
              />
              <ManageLink
                href={`/assets/services/new?assetType=plant&assetId=${manageAsset.id}`}
                icon={<ShieldCheck size={20} />}
                title="Record Service"
                description="Record either a BC internal service or an external mechanic / workshop service."
                accent="emerald"
              />
              <ManageLink
                href={`/assets/plant/${manageAsset.id}/edit`}
                icon={<Pencil size={20} />}
                title="Edit Master Details"
                description="Permanent setup information such as ID, type, make/model, serial and hire status."
              />

              {manageAsset.sharepoint_web_url ? (
                <a
                  href={manageAsset.sharepoint_web_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 hover:bg-blue-100"
                >
                  <Settings size={20} className="mt-1 text-blue-700" />
                  <div>
                    <div className="font-black text-blue-900">
                      Open SharePoint Folder
                    </div>
                    <div className="mt-1 text-sm text-blue-700">
                      Open the controlled Asset document folder.
                    </div>
                  </div>
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase text-slate-400">{label}</div>
      <div className="mt-1 font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function ManageLink({
  href,
  icon,
  title,
  description,
  accent = "slate",
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  accent?: "slate" | "orange" | "emerald";
}) {
  const classes =
    accent === "orange"
      ? "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100"
      : accent === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
        : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-white";

  return (
    <Link
      href={href}
      className={`flex items-start gap-4 rounded-2xl border p-4 ${classes}`}
    >
      <div className="mt-1">{icon}</div>
      <div>
        <div className="font-black">{title}</div>
        <div className="mt-1 text-sm opacity-85">{description}</div>
      </div>
    </Link>
  );
}

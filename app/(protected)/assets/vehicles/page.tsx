"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Car,
  CircleAlert,
  Download,
  Eye,
  Gauge,
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

type VehicleAsset = {
  id: string;
  vehicle_id: string | null;
  vehicle_rego: string | null;
  make: string | null;
  model: string | null;
  category: string | null;
  project: string | null;
  crew: string | null;
  status: string | null;

  current_odometer_km: number | string | null;
  next_service_due: string | null;
  next_service_km: number | string | null;
  next_inspection_due: string | null;

  rego_expiry: string | null;
  insurance_expiry: string | null;
  risk_assessment_date: string | null;

  sharepoint_folder_id: string | null;
  sharepoint_web_url: string | null;
};

type FleetJobRow = {
  id: string;
  vehicle_asset_id: string | null;
  status: string | null;
};

type AssetDocumentRow = {
  id: string;
  vehicle_asset_id: string | null;
  is_current: boolean | null;
  active: boolean | null;
};

type EnhancedVehicle = VehicleAsset & {
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

function getMakeModel(vehicle: VehicleAsset) {
  return [clean(vehicle.make), clean(vehicle.model)].filter(Boolean).join(" ");
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

function statusTone(status: string): Tone {
  const value = clean(status).toLowerCase();

  if (["available", "active"].includes(value)) return "emerald";
  if (["in use", "on hire"].includes(value)) return "teal";
  if (["off hire", "inactive", "retired", "superseded"].includes(value)) {
    return "rose";
  }

  return "amber";
}

function complianceState(vehicle: VehicleAsset) {
  let hasTrackedDate = false;
  let dueSoon = false;
  let overdue = false;

  const dates = [
    vehicle.rego_expiry,
    vehicle.insurance_expiry,
    vehicle.next_service_due,
    vehicle.next_inspection_due,
  ];

  for (const value of dates) {
    const days = daysUntil(value);
    if (days === null) continue;
    hasTrackedDate = true;
    if (days < 0) overdue = true;
    else if (days <= 30) dueSoon = true;
  }

  const currentKm = numeric(vehicle.current_odometer_km);
  const nextKm = numeric(vehicle.next_service_km);

  if (currentKm !== null && nextKm !== null) {
    hasTrackedDate = true;
    const remaining = nextKm - currentKm;
    if (remaining <= 0) overdue = true;
    else if (remaining <= 1000) dueSoon = true;
  }

  if (overdue) {
    return { label: "Overdue" as const, tone: "rose" as Tone };
  }

  if (dueSoon) {
    return { label: "Due Soon" as const, tone: "amber" as Tone };
  }

  if (hasTrackedDate) {
    return { label: "Current" as const, tone: "emerald" as Tone };
  }

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

export default function VehiclesPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [vehicles, setVehicles] = useState<VehicleAsset[]>([]);
  const [fleetJobs, setFleetJobs] = useState<FleetJobRow[]>([]);
  const [documents, setDocuments] = useState<AssetDocumentRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [projectFilter, setProjectFilter] = useState("All Projects");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [complianceFilter, setComplianceFilter] = useState("All Compliance");
  const [manageVehicle, setManageVehicle] = useState<EnhancedVehicle | null>(
    null,
  );

  const fetchVehicles = useCallback(async () => {
    const [vehicleResult, jobResult, documentResult] = await Promise.all([
      supabase.from("vehicle_assets").select("*").order("vehicle_id"),
      supabase
        .from("fleet_jobs")
        .select("id,vehicle_asset_id,status")
        .not("vehicle_asset_id", "is", null),
      supabase
        .from("asset_documents")
        .select("id,vehicle_asset_id,is_current,active")
        .eq("asset_type", "vehicle")
        .eq("active", true),
    ]);

    const errors = [
      vehicleResult.error?.message,
      jobResult.error?.message,
      documentResult.error?.message,
    ].filter(Boolean);

    return {
      errorMessage: errors.join(" · "),
      vehicles: (vehicleResult.data ?? []) as VehicleAsset[],
      fleetJobs: (jobResult.data ?? []) as FleetJobRow[],
      documents: (documentResult.data ?? []) as AssetDocumentRow[],
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    void fetchVehicles()
      .then((result) => {
        if (cancelled) return;

        setErrorMessage(result.errorMessage);
        setVehicles(result.vehicles);
        setFleetJobs(result.fleetJobs);
        setDocuments(result.documents);
      })
      .catch((error: unknown) => {
        if (cancelled) return;

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load the vehicle register.",
        );
        setVehicles([]);
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
  }, [fetchVehicles]);

  const refreshVehicles = useCallback(() => {
    setLoading(true);
    setErrorMessage("");

    void fetchVehicles()
      .then((result) => {
        setErrorMessage(result.errorMessage);
        setVehicles(result.vehicles);
        setFleetJobs(result.fleetJobs);
        setDocuments(result.documents);
      })
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not refresh the vehicle register.",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [fetchVehicles]);

  const enhancedVehicles = useMemo<EnhancedVehicle[]>(() => {
    return vehicles.map((vehicle) => {
      const calculatedStatus = clean(vehicle.status) || "Available";
      const compliance = complianceState(vehicle);

      const openJobs = fleetJobs.filter(
        (job) =>
          job.vehicle_asset_id === vehicle.id && isOpenJob(job.status),
      ).length;

      const currentDocuments = documents.filter(
        (document) =>
          document.vehicle_asset_id === vehicle.id &&
          document.active !== false &&
          document.is_current !== false,
      ).length;

      return {
        ...vehicle,
        calculated_status: calculatedStatus,
        status_tone: statusTone(calculatedStatus),
        compliance_label: compliance.label,
        compliance_tone: compliance.tone,
        open_jobs: openJobs,
        current_documents: currentDocuments,
      };
    });
  }, [documents, fleetJobs, vehicles]);

  const categoryOptions = useMemo(
    () => [
      "All Categories",
      ...Array.from(
        new Set(enhancedVehicles.map((vehicle) => clean(vehicle.category))),
      )
        .filter(Boolean)
        .sort(),
    ],
    [enhancedVehicles],
  );

  const projectOptions = useMemo(
    () => [
      "All Projects",
      ...Array.from(
        new Set(enhancedVehicles.map((vehicle) => clean(vehicle.project))),
      )
        .filter(Boolean)
        .sort(),
    ],
    [enhancedVehicles],
  );

  const statusOptions = useMemo(
    () => [
      "All Statuses",
      ...Array.from(
        new Set(
          enhancedVehicles.map((vehicle) => vehicle.calculated_status),
        ),
      )
        .filter(Boolean)
        .sort(),
    ],
    [enhancedVehicles],
  );

  const filteredVehicles = useMemo(() => {
    const term = search.trim().toLowerCase();

    return enhancedVehicles.filter((vehicle) => {
      const searchable = [
        vehicle.vehicle_id,
        vehicle.vehicle_rego,
        vehicle.make,
        vehicle.model,
        vehicle.category,
        vehicle.project,
        vehicle.crew,
        vehicle.calculated_status,
        vehicle.compliance_label,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase();

      return (
        searchable.includes(term) &&
        (categoryFilter === "All Categories" ||
          clean(vehicle.category) === categoryFilter) &&
        (projectFilter === "All Projects" ||
          clean(vehicle.project) === projectFilter) &&
        (statusFilter === "All Statuses" ||
          vehicle.calculated_status === statusFilter) &&
        (complianceFilter === "All Compliance" ||
          vehicle.compliance_label === complianceFilter)
      );
    });
  }, [
    categoryFilter,
    complianceFilter,
    enhancedVehicles,
    projectFilter,
    search,
    statusFilter,
  ]);

  const stats = useMemo(
    () => ({
      total: enhancedVehicles.length,
      active: enhancedVehicles.filter(
        (vehicle) =>
          !["inactive", "retired", "superseded", "off hire"].includes(
            clean(vehicle.calculated_status).toLowerCase(),
          ),
      ).length,
      dueSoon: enhancedVehicles.filter(
        (vehicle) => vehicle.compliance_label === "Due Soon",
      ).length,
      overdue: enhancedVehicles.filter(
        (vehicle) => vehicle.compliance_label === "Overdue",
      ).length,
    }),
    [enhancedVehicles],
  );

  function exportFilteredVehicles() {
    const headers = [
      "Vehicle ID",
      "Rego",
      "Make",
      "Model",
      "Category",
      "Project",
      "Crew",
      "Status",
      "Current KM",
      "Next Service Date",
      "Next Service KM",
      "Next Inspection",
      "Rego Expiry",
      "Insurance Expiry",
      "Compliance",
      "Open Fleet Jobs",
      "Current Documents",
    ];

    const rows = filteredVehicles.map((vehicle) => [
      vehicle.vehicle_id,
      vehicle.vehicle_rego,
      vehicle.make,
      vehicle.model,
      vehicle.category,
      vehicle.project,
      vehicle.crew,
      vehicle.calculated_status,
      vehicle.current_odometer_km,
      vehicle.next_service_due,
      vehicle.next_service_km,
      vehicle.next_inspection_due,
      vehicle.rego_expiry,
      vehicle.insurance_expiry,
      vehicle.compliance_label,
      vehicle.open_jobs,
      vehicle.current_documents,
    ]);

    const csv = [
      headers.map(csvSafe).join(","),
      ...rows.map((row) => row.map(csvSafe).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vehicle-register-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Asset Register"
        title="Vehicles"
        description="Current vehicle register linked to servicing, inspections, Fleet Jobs, controlled SharePoint documents and the Update Asset workflow."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={refreshVehicles}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            <button
              type="button"
              onClick={exportFilteredVehicles}
              disabled={filteredVehicles.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <Download size={16} />
              Export CSV
            </button>

            <Link
              href="/assets/update?assetType=vehicle"
              className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-orange-700"
            >
              <Wrench size={16} />
              Update Vehicle
            </Link>

            <Link
              href="/assets/vehicles/new"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus size={16} />
              Add Vehicle
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
          label="Total Vehicles"
          value={stats.total}
          detail="All registered vehicles"
          tone="blue"
          icon={<Car size={22} />}
        />
        <StatCard
          label="Active"
          value={stats.active}
          detail="Available or operational"
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
            placeholder="Search ID, rego, make, model, crew..."
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-slate-100"
          />

          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
          >
            {categoryOptions.map((option) => (
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
        title="Vehicle Register"
        description={
          loading
            ? "Loading vehicles..."
            : `${filteredVehicles.length} of ${enhancedVehicles.length} vehicles shown`
        }
        items={filteredVehicles}
        getKey={(vehicle) => vehicle.id}
        columns={[
          {
            label: "Vehicle",
            render: (vehicle) => (
              <div>
                <div className="font-black text-slate-950">
                  {clean(vehicle.vehicle_id) || "No ID"}
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  {clean(vehicle.vehicle_rego) || "No rego"} ·{" "}
                  {clean(vehicle.category) || "No category"}
                </div>
              </div>
            ),
          },
          {
            label: "Make & Model",
            render: (vehicle) => getMakeModel(vehicle) || "N/A",
          },
          {
            label: "Allocation",
            render: (vehicle) => (
              <div>
                <div className="font-semibold text-slate-900">
                  {clean(vehicle.project) || "Unallocated project"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {clean(vehicle.crew) || "Unallocated crew"}
                </div>
              </div>
            ),
          },
          {
            label: "Service",
            render: (vehicle) => (
              <div className="space-y-1">
                <div className="font-semibold text-slate-900">
                  {dateLabel(vehicle.next_service_due)}
                </div>
                <div className="text-xs text-slate-500">
                  {numeric(vehicle.next_service_km) !== null
                    ? `${Number(vehicle.next_service_km).toLocaleString("en-AU")} km`
                    : "No KM target"}
                </div>
              </div>
            ),
          },
          {
            label: "Compliance",
            render: (vehicle) => (
              <div className="space-y-2">
                <StatusPill
                  label={vehicle.compliance_label}
                  tone={vehicle.compliance_tone}
                />
                <div className="text-xs text-slate-500">
                  Rego {dateLabel(vehicle.rego_expiry)} · Insurance{" "}
                  {dateLabel(vehicle.insurance_expiry)}
                </div>
              </div>
            ),
          },
          {
            label: "Status",
            render: (vehicle) => (
              <div className="space-y-2">
                <StatusPill
                  label={vehicle.calculated_status}
                  tone={vehicle.status_tone}
                />
                {vehicle.open_jobs > 0 ? (
                  <div className="text-xs font-bold text-rose-700">
                    {vehicle.open_jobs} open Fleet Job
                    {vehicle.open_jobs === 1 ? "" : "s"}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">No open Fleet Jobs</div>
                )}
              </div>
            ),
          },
          {
            label: "Actions",
            render: (vehicle) => (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/assets/vehicles/${vehicle.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                >
                  <Eye size={14} />
                  View
                </Link>
                <button
                  type="button"
                  onClick={() => setManageVehicle(vehicle)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white"
                >
                  <Settings size={14} />
                  Manage
                </button>
              </div>
            ),
          },
        ]}
        renderMobile={(vehicle) => (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-black text-slate-950">
                  {clean(vehicle.vehicle_id) || "No ID"}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {clean(vehicle.vehicle_rego) || "No rego"} ·{" "}
                  {getMakeModel(vehicle) || "No make/model"}
                </div>
              </div>
              <StatusPill
                label={vehicle.compliance_label}
                tone={vehicle.compliance_tone}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Status" value={vehicle.calculated_status} />
              <Info
                label="Current KM"
                value={
                  numeric(vehicle.current_odometer_km) !== null
                    ? `${Number(vehicle.current_odometer_km).toLocaleString("en-AU")} km`
                    : "—"
                }
              />
              <Info
                label="Next Service"
                value={
                  dateLabel(vehicle.next_service_due) +
                  (numeric(vehicle.next_service_km) !== null
                    ? ` · ${Number(vehicle.next_service_km).toLocaleString("en-AU")} km`
                    : "")
                }
              />
              <Info
                label="Fleet Jobs"
                value={String(vehicle.open_jobs)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/assets/vehicles/${vehicle.id}`}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
              >
                View Asset
              </Link>
              <Link
                href={`/assets/update?assetType=vehicle&assetId=${vehicle.id}`}
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
          Loading vehicles
        </div>
      ) : null}

      {manageVehicle ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Manage Vehicle
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  {clean(manageVehicle.vehicle_id) || "Vehicle"}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {clean(manageVehicle.vehicle_rego) || "No rego"} ·{" "}
                  {getMakeModel(manageVehicle) || "No make/model"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManageVehicle(null)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              <ManageLink
                href={`/assets/vehicles/${manageVehicle.id}`}
                icon={<Eye size={20} />}
                title="View Asset"
                description="Service history, documents, spend, prestarts and Fleet Jobs."
              />
              <ManageLink
                href={`/assets/update?assetType=vehicle&assetId=${manageVehicle.id}`}
                icon={<Wrench size={20} />}
                title="Update Asset"
                description="Service, repair, modification, inspection, compliance or allocation update."
                accent="orange"
              />
              <ManageLink
                href={`/assets/services/new?assetType=vehicle&assetId=${manageVehicle.id}`}
                icon={<ShieldCheck size={20} />}
                title="Record Service"
                description="Record either a BC internal service or an external mechanic / workshop service."
                accent="emerald"
              />
              <ManageLink
                href={`/assets/vehicles/${manageVehicle.id}/edit`}
                icon={<Pencil size={20} />}
                title="Edit Master Details"
                description="Permanent setup information such as ID, rego, make/model and ownership."
              />

              {manageVehicle.sharepoint_web_url ? (
                <a
                  href={manageVehicle.sharepoint_web_url}
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

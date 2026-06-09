/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Plus,
  RefreshCw,
  Settings,
  Wrench,
  X,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { PageHeader, PageShell, RegisterList } from "../components";

type Tone = "slate" | "blue" | "emerald" | "amber" | "rose" | "violet";

type FleetJobStatus =
  | "Open"
  | "In Progress"
  | "Waiting Parts"
  | "Booked"
  | "Completed"
  | "Closed";

type FleetJobPriority = "Low" | "Medium" | "High" | "Critical";
type FleetJobSource = "Manual" | "Prestart" | "Service" | "Defect" | "Compliance";
type AssetType = "Vehicle" | "Plant";

type FleetJob = {
  id: string;
  job_number: string | null;

  source_type: string | null;
  source_id: string | null;
  vehicle_asset_id: string | null;
  asset_label: string | null;

  asset_type: string | null;
  vehicle_id: string | null;
  plant_id: string | null;
  prestart_id: string | null;

  title: string | null;
  description: string | null;
  source: string | null;
  priority: string | null;
  status: string | null;

  project: string | null;
  crew: string | null;

  reported_by: string | null;
  assigned_to: string | null;
  vendor: string | null;

  reported_date: string | null;
  due_date: string | null;
  completed_date: string | null;

  cost: number | null;
  notes: string | null;

  created_at: string | null;
  updated_at: string | null;
};

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
};

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
};

type EnhancedFleetJob = FleetJob & {
  calculated_status: FleetJobStatus;
  calculated_priority: FleetJobPriority;
  calculated_source: FleetJobSource;
  calculated_asset_type: AssetType;
  resolved_vehicle_id: string | null;
  resolved_prestart_id: string | null;
  display_asset_label: string;
  asset_detail: string;
  tone: Tone;
  priorityTone: Tone;
  isPrestartLinked: boolean;
};

type JobForm = {
  asset_type: AssetType;
  vehicle_id: string;
  plant_id: string;
  title: string;
  description: string;
  source: FleetJobSource;
  priority: FleetJobPriority;
  status: FleetJobStatus;
  project: string;
  crew: string;
  reported_by: string;
  assigned_to: string;
  vendor: string;
  reported_date: string;
  due_date: string;
  completed_date: string;
  cost: string;
  notes: string;
};

const emptyForm: JobForm = {
  asset_type: "Vehicle",
  vehicle_id: "",
  plant_id: "",
  title: "",
  description: "",
  source: "Manual",
  priority: "Medium",
  status: "Open",
  project: "",
  crew: "",
  reported_by: "",
  assigned_to: "",
  vendor: "",
  reported_date: new Date().toISOString().slice(0, 10),
  due_date: "",
  completed_date: "",
  cost: "",
  notes: "",
};

const statuses: FleetJobStatus[] = [
  "Open",
  "In Progress",
  "Waiting Parts",
  "Booked",
  "Completed",
  "Closed",
];

const priorities: FleetJobPriority[] = ["Low", "Medium", "High", "Critical"];

const sources: FleetJobSource[] = [
  "Manual",
  "Prestart",
  "Service",
  "Defect",
  "Compliance",
];

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function csvSafe(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function dateDisplay(value: string | null | undefined) {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getStatusTone(status: string): Tone {
  if (status === "Completed" || status === "Closed") return "emerald";
  if (status === "In Progress" || status === "Booked") return "blue";
  if (status === "Waiting Parts") return "amber";
  if (status === "Open") return "rose";
  return "slate";
}

function getPriorityTone(priority: string): Tone {
  if (priority === "Critical") return "rose";
  if (priority === "High") return "amber";
  if (priority === "Medium") return "blue";
  return "slate";
}

function toFleetJobStatus(value: string | null): FleetJobStatus {
  return statuses.includes(value as FleetJobStatus)
    ? (value as FleetJobStatus)
    : "Open";
}

function toFleetJobPriority(value: string | null): FleetJobPriority {
  return priorities.includes(value as FleetJobPriority)
    ? (value as FleetJobPriority)
    : "Medium";
}

function toFleetJobSource(value: string | null, sourceType?: string | null): FleetJobSource {
  if (sources.includes(value as FleetJobSource)) return value as FleetJobSource;

  const sourceText = clean(sourceType).toLowerCase();

  if (sourceText.includes("prestart")) return "Prestart";
  if (sourceText.includes("service")) return "Service";
  if (sourceText.includes("defect")) return "Defect";
  if (sourceText.includes("compliance")) return "Compliance";

  return "Manual";
}

function toAssetType(value: string | null, plantId?: string | null): AssetType {
  if (value === "Plant" || plantId) return "Plant";
  return "Vehicle";
}

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  const classes =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "violet"
        ? "border-violet-200 bg-violet-50 text-violet-700"
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
          : tone === "violet"
            ? "border-violet-200 bg-violet-50 text-violet-800"
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

export default function FleetJobsPage() {
  const supabase = useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    return createClient(supabaseUrl, supabaseAnonKey);
  }, []);

  const [jobs, setJobs] = useState<FleetJob[]>([]);
  const [vehicles, setVehicles] = useState<VehicleAsset[]>([]);
  const [plantAssets, setPlantAssets] = useState<PlantAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [priorityFilter, setPriorityFilter] = useState("All Priorities");
  const [assetFilter, setAssetFilter] = useState("All Assets");
  const [sourceFilter, setSourceFilter] = useState("All Sources");

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<JobForm>(emptyForm);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [jobsResult, vehiclesResult, plantResult] = await Promise.all([
      supabase
        .from("fleet_jobs")
        .select("*")
        .order("created_at", { ascending: false }),

      supabase
        .from("vehicle_assets")
        .select(
          "id, vehicle_id, vehicle_rego, make, model, category, project, crew, status",
        )
        .order("vehicle_id", { ascending: true }),

      supabase
        .from("plant_assets")
        .select(
          "id, asset_id, make, model, plant_type, serial_number, rego, crew, project, asset_status",
        )
        .order("asset_id", { ascending: true }),
    ]);

    setJobs(jobsResult.error ? [] : ((jobsResult.data ?? []) as FleetJob[]));
    setVehicles(
      vehiclesResult.error ? [] : ((vehiclesResult.data ?? []) as VehicleAsset[]),
    );
    setPlantAssets(
      plantResult.error ? [] : ((plantResult.data ?? []) as PlantAsset[]),
    );

    if (jobsResult.error) console.error(jobsResult.error.message);
    if (vehiclesResult.error) console.error(vehiclesResult.error.message);
    if (plantResult.error) console.error(plantResult.error.message);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const vehicleMap = useMemo(() => {
    return new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  }, [vehicles]);

  const plantMap = useMemo(() => {
    return new Map(plantAssets.map((asset) => [asset.id, asset]));
  }, [plantAssets]);

  const enhancedJobs = useMemo<EnhancedFleetJob[]>(() => {
    return jobs.map((job) => {
      const resolved_vehicle_id = job.vehicle_id || job.vehicle_asset_id || null;
      const resolved_prestart_id = job.prestart_id || job.source_id || null;

      const calculated_asset_type = toAssetType(job.asset_type, job.plant_id);
      const calculated_status = toFleetJobStatus(job.status);
      const calculated_priority = toFleetJobPriority(job.priority);
      const calculated_source = toFleetJobSource(job.source, job.source_type);

      const vehicle = resolved_vehicle_id
        ? vehicleMap.get(resolved_vehicle_id)
        : null;

      const plant = job.plant_id ? plantMap.get(job.plant_id) : null;

      const display_asset_label =
        calculated_asset_type === "Vehicle"
          ? [
              vehicle?.vehicle_id,
              vehicle?.vehicle_rego,
              vehicle?.make,
              vehicle?.model,
            ]
              .map(clean)
              .filter(Boolean)
              .join(" · ") ||
            clean(job.asset_label) ||
            "Vehicle not linked"
          : [
              plant?.asset_id,
              plant?.rego,
              plant?.make,
              plant?.model,
              plant?.plant_type,
            ]
              .map(clean)
              .filter(Boolean)
              .join(" · ") ||
            clean(job.asset_label) ||
            "Plant not linked";

      const asset_detail =
        calculated_asset_type === "Vehicle"
          ? [vehicle?.project ?? job.project, vehicle?.crew ?? job.crew]
              .map(clean)
              .filter(Boolean)
              .join(" · ") || "No allocation"
          : [plant?.project ?? job.project, plant?.crew ?? job.crew]
              .map(clean)
              .filter(Boolean)
              .join(" · ") || "No allocation";

      const isPrestartLinked =
        calculated_source === "Prestart" ||
        clean(job.source_type).toLowerCase().includes("prestart") ||
        Boolean(job.prestart_id);

      return {
        ...job,
        calculated_status,
        calculated_priority,
        calculated_source,
        calculated_asset_type,
        resolved_vehicle_id,
        resolved_prestart_id,
        display_asset_label,
        asset_detail,
        tone: getStatusTone(calculated_status),
        priorityTone: getPriorityTone(calculated_priority),
        isPrestartLinked,
      };
    });
  }, [jobs, vehicleMap, plantMap]);

  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase();

    return enhancedJobs.filter((job) => {
      const searchable = [
        job.job_number,
        job.title,
        job.description,
        job.display_asset_label,
        job.asset_detail,
        job.calculated_asset_type,
        job.calculated_source,
        job.calculated_priority,
        job.calculated_status,
        job.project,
        job.crew,
        job.vendor,
        job.reported_by,
        job.assigned_to,
        job.notes,
        job.source_type,
        job.asset_label,
      ]
        .join(" ")
        .toLowerCase();

      return (
        searchable.includes(term) &&
        (statusFilter === "All Statuses" ||
          job.calculated_status === statusFilter) &&
        (priorityFilter === "All Priorities" ||
          job.calculated_priority === priorityFilter) &&
        (assetFilter === "All Assets" ||
          job.calculated_asset_type === assetFilter) &&
        (sourceFilter === "All Sources" ||
          job.calculated_source === sourceFilter)
      );
    });
  }, [
    enhancedJobs,
    search,
    statusFilter,
    priorityFilter,
    assetFilter,
    sourceFilter,
  ]);

  const stats = useMemo(() => {
    const active = enhancedJobs.filter(
      (job) =>
        job.calculated_status !== "Completed" &&
        job.calculated_status !== "Closed",
    );

    const overdue = active.filter((job) => {
      if (!job.due_date) return false;
      const due = new Date(job.due_date);
      const today = new Date();
      due.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      return due < today;
    });

    return {
      total: enhancedJobs.length,
      active: active.length,
      overdue: overdue.length,
      prestarts: enhancedJobs.filter((job) => job.isPrestartLinked).length,
      completed: enhancedJobs.filter(
        (job) =>
          job.calculated_status === "Completed" ||
          job.calculated_status === "Closed",
      ).length,
    };
  }, [enhancedJobs]);

  function exportFilteredJobs() {
    const headers = [
      "Job Number",
      "Title",
      "Asset Type",
      "Asset",
      "Source",
      "Priority",
      "Status",
      "Project",
      "Crew",
      "Reported Date",
      "Due Date",
      "Completed Date",
      "Vendor",
      "Cost",
      "Prestart ID",
    ];

    const rows = filteredJobs.map((job) => [
      clean(job.job_number),
      clean(job.title),
      job.calculated_asset_type,
      job.display_asset_label,
      job.calculated_source,
      job.calculated_priority,
      job.calculated_status,
      clean(job.project),
      clean(job.crew),
      clean(job.reported_date),
      clean(job.due_date),
      clean(job.completed_date),
      clean(job.vendor),
      job.cost ?? "",
      clean(job.resolved_prestart_id),
    ]);

    const csv = [
      headers.map(csvSafe).join(","),
      ...rows.map((row) => row.map(csvSafe).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `fleet-jobs-${date}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  async function createJob() {
    if (!form.title.trim()) return;

    setSaving(true);

    const selectedVehicle =
      form.asset_type === "Vehicle" ? vehicleMap.get(form.vehicle_id) : null;
    const selectedPlant =
      form.asset_type === "Plant" ? plantMap.get(form.plant_id) : null;

    const assetLabel =
      form.asset_type === "Vehicle"
        ? [
            selectedVehicle?.vehicle_id,
            selectedVehicle?.vehicle_rego,
            selectedVehicle?.make,
            selectedVehicle?.model,
          ]
            .map(clean)
            .filter(Boolean)
            .join(" · ")
        : [
            selectedPlant?.asset_id,
            selectedPlant?.rego,
            selectedPlant?.make,
            selectedPlant?.model,
          ]
            .map(clean)
            .filter(Boolean)
            .join(" · ");

    const payload = {
      job_number: `FJ-${Date.now().toString().slice(-6)}`,

      source_type: form.source.toLowerCase(),
      source_id: null,
      vehicle_asset_id:
        form.asset_type === "Vehicle" ? form.vehicle_id || null : null,
      asset_label: assetLabel || null,

      asset_type: form.asset_type,
      vehicle_id: form.asset_type === "Vehicle" ? form.vehicle_id || null : null,
      plant_id: form.asset_type === "Plant" ? form.plant_id || null : null,
      prestart_id: null,

      title: form.title.trim(),
      description: form.description.trim() || null,
      source: form.source,
      priority: form.priority,
      status: form.status,

      project:
        form.project.trim() ||
        selectedVehicle?.project ||
        selectedPlant?.project ||
        null,
      crew:
        form.crew.trim() || selectedVehicle?.crew || selectedPlant?.crew || null,

      reported_by: form.reported_by.trim() || null,
      assigned_to: form.assigned_to.trim() || null,
      vendor: form.vendor.trim() || null,

      reported_date: form.reported_date || null,
      due_date: form.due_date || null,
      completed_date: form.completed_date || null,

      cost: form.cost ? Number(form.cost) : null,
      notes: form.notes.trim() || null,
    };

    const { error } = await supabase.from("fleet_jobs").insert(payload);

    if (error) {
      console.error("Failed to create fleet job:", error.message);
      alert(error.message);
    } else {
      setShowCreate(false);
      setForm(emptyForm);
      await loadData();
    }

    setSaving(false);
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Asset Register"
        title="Fleet Jobs"
        description="Track vehicle and plant jobs from prestarts, defects, services, compliance items and manual maintenance requests."
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
              onClick={exportFilteredJobs}
              disabled={filteredJobs.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} />
              Export CSV
            </button>

            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus size={16} />
              New Fleet Job
            </button>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total Jobs"
          value={stats.total}
          detail="All fleet jobs"
          tone="blue"
          icon={<Wrench size={22} />}
        />

        <StatCard
          label="Active"
          value={stats.active}
          detail="Open or in progress"
          tone="amber"
          icon={<Clock size={22} />}
        />

        <StatCard
          label="Overdue"
          value={stats.overdue}
          detail="Past due date"
          tone="rose"
          icon={<AlertTriangle size={22} />}
        />

        <StatCard
          label="From Prestarts"
          value={stats.prestarts}
          detail="Auto-linked issues"
          tone="violet"
          icon={<Settings size={22} />}
        />

        <StatCard
          label="Closed"
          value={stats.completed}
          detail="Completed or closed"
          tone="emerald"
          icon={<CheckCircle2 size={22} />}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-5">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search job, asset, rego, plant ID, prestart..."
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 md:col-span-2"
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          >
            <option>All Statuses</option>
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          >
            <option>All Priorities</option>
            {priorities.map((priority) => (
              <option key={priority}>{priority}</option>
            ))}
          </select>

          <select
            value={assetFilter}
            onChange={(event) => setAssetFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          >
            <option>All Assets</option>
            <option>Vehicle</option>
            <option>Plant</option>
          </select>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <select
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          >
            <option>All Sources</option>
            {sources.map((source) => (
              <option key={source}>{source}</option>
            ))}
          </select>

          <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700">
            Failed prestart issues now appear here as linked Fleet Jobs.
          </div>
        </div>
      </section>

      <RegisterList
        title="Fleet Jobs Register"
        description={
          loading
            ? "Loading fleet jobs..."
            : `${filteredJobs.length} of ${enhancedJobs.length} jobs shown`
        }
        items={filteredJobs}
        getKey={(job) => job.id}
        columns={[
          {
            label: "Job",
            render: (job) => (
              <div>
                <p className="font-bold text-slate-950">
                  {clean(job.title) || "Untitled job"}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {clean(job.job_number) || "No job number"}
                </p>
              </div>
            ),
          },
          {
            label: "Asset",
            render: (job) => (
              <div>
                <p className="font-semibold text-slate-950">
                  {job.display_asset_label}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {job.calculated_asset_type} · {job.asset_detail}
                </p>
              </div>
            ),
          },
          {
            label: "Source",
            render: (job) => (
              <div className="space-y-1">
                <StatusPill
                  label={job.calculated_source}
                  tone={job.isPrestartLinked ? "violet" : "slate"}
                />
                {job.isPrestartLinked ? (
                  <p className="text-xs font-semibold text-violet-700">
                    Linked prestart
                  </p>
                ) : null}
              </div>
            ),
          },
          {
            label: "Priority",
            render: (job) => (
              <StatusPill
                label={job.calculated_priority}
                tone={job.priorityTone}
              />
            ),
          },
          {
            label: "Status",
            render: (job) => (
              <StatusPill label={job.calculated_status} tone={job.tone} />
            ),
          },
          {
            label: "Due",
            render: (job) => (
              <div>
                <p className="font-semibold text-slate-950">
                  {dateDisplay(job.due_date)}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Reported: {dateDisplay(job.reported_date)}
                </p>
              </div>
            ),
          },
          {
            label: "Actions",
            render: (job) => (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/assets/fleet-jobs/${job.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <Eye size={14} />
                  View Job
                </Link>

                <Link
                  href={
                    job.calculated_asset_type === "Vehicle" &&
                    job.resolved_vehicle_id
                      ? `/assets/vehicles/${job.resolved_vehicle_id}`
                      : job.plant_id
                        ? `/assets/plant/${job.plant_id}`
                        : "/assets"
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800"
                >
                  <Settings size={14} />
                  Asset
                </Link>
              </div>
            ),
          },
        ]}
        renderMobile={(job) => (
          <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-slate-950">
                  {clean(job.title) || "Untitled job"}
                </p>
                <p className="text-sm text-slate-600">
                  {clean(job.job_number) || "No job number"}
                </p>
              </div>

              <StatusPill label={job.calculated_status} tone={job.tone} />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  Asset
                </p>
                <p className="font-semibold text-slate-800">
                  {job.display_asset_label}
                </p>
              </div>

              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  Source
                </p>
                <StatusPill
                  label={job.calculated_source}
                  tone={job.isPrestartLinked ? "violet" : "slate"}
                />
              </div>

              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  Priority
                </p>
                <StatusPill
                  label={job.calculated_priority}
                  tone={job.priorityTone}
                />
              </div>

              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  Due
                </p>
                <p className="font-semibold text-slate-800">
                  {dateDisplay(job.due_date)}
                </p>
              </div>
            </div>

            <Link
              href={`/assets/fleet-jobs/${job.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
            >
              <Eye size={14} />
              View Job
            </Link>
          </div>
        )}
      />

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  New Fleet Job
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  Create Job
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Link this job to a vehicle or plant asset.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-sm font-bold text-slate-700">
                  Asset Type
                </span>
                <select
                  value={form.asset_type}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      asset_type: event.target.value as AssetType,
                      vehicle_id: "",
                      plant_id: "",
                    })
                  }
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
                >
                  <option>Vehicle</option>
                  <option>Plant</option>
                </select>
              </label>

              {form.asset_type === "Vehicle" ? (
                <label className="grid gap-1.5">
                  <span className="text-sm font-bold text-slate-700">
                    Vehicle
                  </span>
                  <select
                    value={form.vehicle_id}
                    onChange={(event) =>
                      setForm({ ...form, vehicle_id: event.target.value })
                    }
                    className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
                  >
                    <option value="">Select vehicle</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {[
                          vehicle.vehicle_id,
                          vehicle.vehicle_rego,
                          vehicle.make,
                          vehicle.model,
                        ]
                          .map(clean)
                          .filter(Boolean)
                          .join(" · ")}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="grid gap-1.5">
                  <span className="text-sm font-bold text-slate-700">
                    Plant
                  </span>
                  <select
                    value={form.plant_id}
                    onChange={(event) =>
                      setForm({ ...form, plant_id: event.target.value })
                    }
                    className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
                  >
                    <option value="">Select plant</option>
                    {plantAssets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {[
                          asset.asset_id,
                          asset.rego,
                          asset.make,
                          asset.model,
                          asset.plant_type,
                        ]
                          .map(clean)
                          .filter(Boolean)
                          .join(" · ")}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="grid gap-1.5 md:col-span-2">
                <span className="text-sm font-bold text-slate-700">
                  Job Title
                </span>
                <input
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  placeholder="Example: Replace tyre / Service due / Defect from prestart"
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-sm font-bold text-slate-700">
                  Source
                </span>
                <select
                  value={form.source}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      source: event.target.value as FleetJobSource,
                    })
                  }
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
                >
                  {sources.map((source) => (
                    <option key={source}>{source}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5">
                <span className="text-sm font-bold text-slate-700">
                  Priority
                </span>
                <select
                  value={form.priority}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      priority: event.target.value as FleetJobPriority,
                    })
                  }
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
                >
                  {priorities.map((priority) => (
                    <option key={priority}>{priority}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5">
                <span className="text-sm font-bold text-slate-700">
                  Status
                </span>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value as FleetJobStatus,
                    })
                  }
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
                >
                  {statuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5">
                <span className="text-sm font-bold text-slate-700">
                  Due Date
                </span>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(event) =>
                    setForm({ ...form, due_date: event.target.value })
                  }
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
                />
              </label>

              <label className="grid gap-1.5 md:col-span-2">
                <span className="text-sm font-bold text-slate-700">
                  Description
                </span>
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  rows={4}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void createJob()}
                disabled={saving || !form.title.trim()}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Create Job"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
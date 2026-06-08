"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  ExternalLink,
  Loader2,
  Save,
  Settings,
  Truck,
  Wrench,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import {
  ActionButton,
  DetailGrid,
  PageHeader,
  PageShell,
  StatusBadge,
} from "../../components";

type Tone = "slate" | "blue" | "emerald" | "amber" | "rose" | "violet";

type FleetJob = {
  id: string;
  job_number: string | null;
  asset_type: string | null;
  vehicle_id: string | null;
  plant_id: string | null;
  prestart_id: string | null;
  source_type: string | null;
  source_id: string | null;
  source: string | null;
  asset_label: string | null;
  title: string | null;
  description: string | null;
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

const statuses = [
  "Open",
  "In Progress",
  "Waiting Parts",
  "Booked",
  "Completed",
  "Closed",
];

const priorities = ["Low", "Medium", "High", "Critical"];

function clean(value: string | null | undefined) {
  return value?.trim() || "";
}

function dateDisplay(value: string | null | undefined) {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function moneyDisplay(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

function statusTone(status: string | null | undefined): Tone {
  if (status === "Completed" || status === "Closed") return "emerald";
  if (status === "In Progress" || status === "Booked") return "blue";
  if (status === "Waiting Parts") return "amber";
  if (status === "Open") return "rose";
  return "slate";
}

function priorityTone(priority: string | null | undefined): Tone {
  if (priority === "Critical") return "rose";
  if (priority === "High") return "amber";
  if (priority === "Medium") return "blue";
  return "slate";
}

export default function FleetJobDetailPage({
  params,
}: {
  params: { jobID: string };
}) {
  const supabase = useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    return createClient(supabaseUrl, supabaseAnonKey);
  }, []);

  const [job, setJob] = useState<FleetJob | null>(null);
  const [vehicle, setVehicle] = useState<VehicleAsset | null>(null);
  const [plant, setPlant] = useState<PlantAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [status, setStatus] = useState("Open");
  const [priority, setPriority] = useState("Medium");
  const [vendor, setVendor] = useState("");
  const [cost, setCost] = useState("");
  const [completedDate, setCompletedDate] = useState("");
  const [notes, setNotes] = useState("");

  async function loadJob() {
    setLoading(true);

    const { data, error } = await supabase
      .from("fleet_jobs")
      .select("*")
      .eq("id", params.jobID)
      .single();

    if (error || !data) {
      console.error("Failed to load fleet job:", error?.message);
      setJob(null);
      setLoading(false);
      return;
    }

    const loadedJob = data as FleetJob;

    setJob(loadedJob);
    setStatus(loadedJob.status || "Open");
    setPriority(loadedJob.priority || "Medium");
    setVendor(loadedJob.vendor || "");
    setCost(
      loadedJob.cost !== null && loadedJob.cost !== undefined
        ? String(loadedJob.cost)
        : "",
    );
    setCompletedDate(loadedJob.completed_date || "");
    setNotes(loadedJob.notes || "");

    if (loadedJob.vehicle_id) {
      const { data: vehicleData } = await supabase
        .from("vehicle_assets")
        .select(
          "id, vehicle_id, vehicle_rego, make, model, category, project, crew, status",
        )
        .eq("id", loadedJob.vehicle_id)
        .maybeSingle();

      setVehicle((vehicleData as VehicleAsset) || null);
    }

    if (loadedJob.plant_id) {
      const { data: plantData } = await supabase
        .from("plant_assets")
        .select(
          "id, asset_id, make, model, plant_type, serial_number, rego, crew, project, asset_status",
        )
        .eq("id", loadedJob.plant_id)
        .maybeSingle();

      setPlant((plantData as PlantAsset) || null);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.jobID]);

  async function saveUpdates() {
    if (!job) return;

    setSaving(true);

    const { error } = await supabase
      .from("fleet_jobs")
      .update({
        status,
        priority,
        vendor: vendor.trim() || null,
        cost: cost ? Number(cost) : null,
        completed_date: completedDate || null,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (error) {
      console.error("Failed to update fleet job:", error.message);
      alert(error.message);
    } else {
      await loadJob();
    }

    setSaving(false);
  }

  const assetType = job?.asset_type === "Plant" ? "Plant" : "Vehicle";

  const assetTitle =
    assetType === "Vehicle"
      ? [
          vehicle?.vehicle_id,
          vehicle?.vehicle_rego,
          vehicle?.make,
          vehicle?.model,
        ]
          .map(clean)
          .filter(Boolean)
          .join(" · ") ||
        clean(job?.asset_label) ||
        "Vehicle not linked"
      : [plant?.asset_id, plant?.rego, plant?.make, plant?.model]
          .map(clean)
          .filter(Boolean)
          .join(" · ") ||
        clean(job?.asset_label) ||
        "Plant not linked";

  const assetHref =
    assetType === "Vehicle" && job?.vehicle_id
      ? `/assets/vehicles/${job.vehicle_id}`
      : assetType === "Plant" && job?.plant_id
        ? `/assets/plant/${job.plant_id}`
        : "/assets";

  if (loading) {
    return (
      <PageShell>
        <div className="flex min-h-[400px] items-center justify-center border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3 text-sm font-semibold text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading fleet job...
          </div>
        </div>
      </PageShell>
    );
  }

  if (!job) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Fleet Job"
          title="Job Not Found"
          description="This fleet job could not be found."
          actions={
            <ActionButton
              href="/assets/fleet-jobs"
              variant="secondary"
              icon={<ArrowLeft size={16} />}
            >
              Back to Fleet Jobs
            </ActionButton>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Fleet Job"
        title={job.title || "Untitled Fleet Job"}
        description={`${job.job_number || "No job number"} · ${assetTitle}`}
        actions={
          <>
            <ActionButton
              href="/assets/fleet-jobs"
              variant="secondary"
              icon={<ArrowLeft size={16} />}
            >
              Back
            </ActionButton>

            <ActionButton
              href={assetHref}
              variant="secondary"
              icon={<ExternalLink size={16} />}
            >
              View Asset
            </ActionButton>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          label="Status"
          value={job.status || "Open"}
          icon={<ClipboardList size={20} />}
          tone={statusTone(job.status)}
        />

        <SummaryCard
          label="Priority"
          value={job.priority || "Medium"}
          icon={<Wrench size={20} />}
          tone={priorityTone(job.priority)}
        />

        <SummaryCard
          label="Due Date"
          value={dateDisplay(job.due_date)}
          icon={<Calendar size={20} />}
          tone="blue"
        />

        <SummaryCard
          label="Cost"
          value={moneyDisplay(job.cost)}
          icon={<DollarSign size={20} />}
          tone="slate"
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-5">
          <section className="border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Job Details
                </h2>
                <p className="text-sm text-slate-600">
                  Maintenance, defect, service or compliance job information.
                </p>
              </div>

              <StatusBadge
                label={job.status || "Open"}
                tone={statusTone(job.status)}
              />
            </div>

            <DetailGrid
              items={[
                { label: "Job Number", value: job.job_number || "N/A" },
                { label: "Source", value: job.source || job.source_type || "N/A" },
                { label: "Reported", value: dateDisplay(job.reported_date) },
                { label: "Created", value: dateDisplay(job.created_at) },
                { label: "Project", value: job.project || "N/A" },
                { label: "Crew", value: job.crew || "N/A" },
                { label: "Reported By", value: job.reported_by || "N/A" },
                { label: "Assigned To", value: job.assigned_to || "N/A" },
              ]}
            />

            <div className="mt-5 border-t border-slate-200 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Description
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {job.description || "No description provided."}
              </p>
            </div>
          </section>

          <section className="border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              {assetType === "Vehicle" ? (
                <Truck size={20} className="text-slate-600" />
              ) : (
                <Building2 size={20} className="text-slate-600" />
              )}
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Linked Asset
                </h2>
                <p className="text-sm text-slate-600">{assetTitle}</p>
              </div>
            </div>

            {assetType === "Vehicle" ? (
              <DetailGrid
                items={[
                  { label: "Type", value: "Vehicle" },
                  { label: "Vehicle ID", value: vehicle?.vehicle_id || "N/A" },
                  { label: "Rego", value: vehicle?.vehicle_rego || "N/A" },
                  { label: "Category", value: vehicle?.category || "N/A" },
                  {
                    label: "Make / Model",
                    value:
                      [vehicle?.make, vehicle?.model]
                        .map(clean)
                        .filter(Boolean)
                        .join(" ") || "N/A",
                  },
                  { label: "Project", value: vehicle?.project || job.project || "N/A" },
                  { label: "Crew", value: vehicle?.crew || job.crew || "N/A" },
                  { label: "Status", value: vehicle?.status || "N/A" },
                ]}
              />
            ) : (
              <DetailGrid
                items={[
                  { label: "Type", value: "Plant" },
                  { label: "Asset ID", value: plant?.asset_id || "N/A" },
                  { label: "Rego", value: plant?.rego || "N/A" },
                  { label: "Plant Type", value: plant?.plant_type || "N/A" },
                  {
                    label: "Make / Model",
                    value:
                      [plant?.make, plant?.model]
                        .map(clean)
                        .filter(Boolean)
                        .join(" ") || "N/A",
                  },
                  { label: "Project", value: plant?.project || job.project || "N/A" },
                  { label: "Crew", value: plant?.crew || job.crew || "N/A" },
                  { label: "Status", value: plant?.asset_status || "N/A" },
                ]}
              />
            )}

            <div className="mt-5">
              <Link
                href={assetHref}
                className="inline-flex min-h-10 items-center gap-2 border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Settings size={16} />
                Open Asset Record
              </Link>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">
              Update Job
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Quick update for status, priority, vendor, cost and close-out notes.
            </p>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Status
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                >
                  {statuses.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Priority
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                  className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                >
                  {priorities.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Vendor / Mechanic
                <input
                  value={vendor}
                  onChange={(event) => setVendor(event.target.value)}
                  className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Cost
                <input
                  type="number"
                  value={cost}
                  onChange={(event) => setCost(event.target.value)}
                  className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Completed Date
                <input
                  type="date"
                  value={completedDate}
                  onChange={(event) => setCompletedDate(event.target.value)}
                  className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Notes
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={5}
                  className="border border-slate-300 bg-white px-3 py-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                />
              </label>

              <button
                type="button"
                onClick={() => void saveUpdates()}
                disabled={saving}
                className="inline-flex min-h-11 items-center justify-center gap-2 bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                Save Updates
              </button>
            </div>
          </section>

          <section className="border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
              <CheckCircle2 size={20} />
              Close Out
            </h2>

            <div className="mt-4 space-y-3 text-sm">
              <InfoRow label="Completed Date" value={dateDisplay(job.completed_date)} />
              <InfoRow label="Vendor" value={job.vendor || "N/A"} />
              <InfoRow label="Cost" value={moneyDisplay(job.cost)} />
              <InfoRow label="Updated" value={dateDisplay(job.updated_at)} />
            </div>

            <div className="mt-5 border-t border-slate-200 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Notes
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {job.notes || "No notes recorded."}
              </p>
            </div>
          </section>
        </aside>
      </section>
    </PageShell>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: Tone;
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "border-amber-100 bg-amber-50 text-amber-700"
        : tone === "rose"
          ? "border-rose-100 bg-rose-50 text-rose-700"
          : tone === "blue"
            ? "border-blue-100 bg-blue-50 text-blue-700"
            : tone === "violet"
              ? "border-violet-100 bg-violet-50 text-violet-700"
              : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`border p-4 shadow-sm ${toneClass}`}>
      <div className="flex items-center gap-3">
        <div className="bg-white/70 p-2">{icon}</div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
            {label}
          </p>
          <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="text-right font-bold text-slate-900">{value}</span>
    </div>
  );
}
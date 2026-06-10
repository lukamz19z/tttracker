/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  AlertTriangle,
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
import { DetailGrid, PageHeader, PageShell, StatusBadge } from "../../components";

type Tone = "slate" | "blue" | "emerald" | "amber" | "rose" | "violet";

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

type VehiclePrestart = {
  id: string;
  vehicle_asset_id: string | null;
  asset_label: string | null;
  fleet_job_id: string | null;
  severity: string | null;
  failed_items?: unknown;
  flagged_items?: unknown;
  defects?: unknown;
  issues?: unknown;
  checklist_values?: unknown;
  checklist?: unknown;
  created_at: string | null;
  prestart_date?: string | null;
  employee_name?: string | null;
  operator_name?: string | null;
  comments?: string | null;
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

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function timestampDisplay() {
  return new Date().toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function moneyDisplay(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";

  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

function toneForStatus(status: string | null | undefined): Tone {
  if (status === "Completed" || status === "Closed") return "emerald";
  if (status === "In Progress" || status === "Booked") return "blue";
  if (status === "Waiting Parts") return "amber";
  if (status === "Open") return "rose";
  return "slate";
}

function toneForPriority(priority: string | null | undefined): Tone {
  if (priority === "Critical") return "rose";
  if (priority === "High") return "amber";
  if (priority === "Medium") return "blue";
  return "slate";
}

function normaliseFailedItems(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => {
        if (typeof item === "string") {
          const lowered = item.toLowerCase();
          return lowered !== "yes" && lowered !== "na" && lowered !== "n/a";
        }

        if (typeof item === "object" && item !== null) {
          const record = item as Record<string, unknown>;
          const answer = String(
            record.answer || record.value || record.status || "",
          ).toLowerCase();

          return (
            answer === "no" ||
            answer === "fail" ||
            answer === "failed" ||
            answer === "defect"
          );
        }

        return false;
      })
      .map(([key, item]) => {
        if (typeof item === "object" && item !== null) {
          const record = item as Record<string, unknown>;
          const comment = record.comment ? ` - ${String(record.comment)}` : "";
          return `${key}${comment}`;
        }

        return key;
      });
  }

  if (typeof value === "string") {
    try {
      return normaliseFailedItems(JSON.parse(value));
    } catch {
      return value
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function getPrestartFlaggedItems(
  prestart: VehiclePrestart | null,
  job: FleetJob,
) {
  const fromPrestart = [
    ...normaliseFailedItems(prestart?.failed_items),
    ...normaliseFailedItems(prestart?.flagged_items),
    ...normaliseFailedItems(prestart?.defects),
    ...normaliseFailedItems(prestart?.issues),
    ...normaliseFailedItems(prestart?.checklist_values),
    ...normaliseFailedItems(prestart?.checklist),
  ];

  if (fromPrestart.length > 0) return Array.from(new Set(fromPrestart));

  const description = clean(job.description);

  if (description) {
    return description
      .split(/\n|•/)
      .map((item) => item.trim())
      .filter((item) => item.length > 3)
      .slice(0, 12);
  }

  return [];
}

function formatIssueLabel(item: string) {
  const [rawLabel, ...commentParts] = item.split(" - ");
  const label = rawLabel
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
  const comment = commentParts.join(" - ");

  return { label, comment };
}

function appendJobNote(existingNotes: string | null, heading: string, body: string) {
  const entry = `[${timestampDisplay()}] ${heading}\n${body.trim()}`;
  return [existingNotes?.trim(), entry].filter(Boolean).join("\n\n");
}

export default function FleetJobDetailPage() {
  const params = useParams();

  const jobId = useMemo(() => {
    const raw = Object.values(params)[0];
    if (Array.isArray(raw)) return raw[0] || "";
    return raw || "";
  }, [params]);

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
  const [prestart, setPrestart] = useState<VehiclePrestart | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [status, setStatus] = useState("Open");
  const [priority, setPriority] = useState("Medium");
  const [vendor, setVendor] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [completedDate, setCompletedDate] = useState("");
  const [cost, setCost] = useState("");
  const [progressUpdate, setProgressUpdate] = useState("");
  const [closeOutComments, setCloseOutComments] = useState("");

  const loadJob = useCallback(async () => {
    if (!jobId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("fleet_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();

    if (error || !data) {
      console.error("Failed to load fleet job:", error?.message);
      setJob(null);
      setVehicle(null);
      setPlant(null);
      setPrestart(null);
      setLoading(false);
      return;
    }

    const loadedJob = data as FleetJob;

    setJob(loadedJob);
    setStatus(loadedJob.status || "Open");
    setPriority(loadedJob.priority || "Medium");
    setVendor(loadedJob.vendor || "");
    setAssignedTo(loadedJob.assigned_to || "");
    setDueDate(loadedJob.due_date || "");
    setCompletedDate(loadedJob.completed_date || "");
    setCost(
      loadedJob.cost !== null && loadedJob.cost !== undefined
        ? String(loadedJob.cost)
        : "",
    );
    setProgressUpdate("");
    setCloseOutComments("");

    const resolvedVehicleId = loadedJob.vehicle_id || loadedJob.vehicle_asset_id;
    const resolvedPrestartId = loadedJob.prestart_id || loadedJob.source_id;

    if (resolvedVehicleId) {
      const { data: vehicleData, error: vehicleError } = await supabase
        .from("vehicle_assets")
        .select(
          "id, vehicle_id, vehicle_rego, make, model, category, project, crew, status",
        )
        .eq("id", resolvedVehicleId)
        .maybeSingle();

      if (vehicleError) {
        console.error("Failed to load linked vehicle:", vehicleError.message);
      }

      setVehicle((vehicleData as VehicleAsset) || null);
    } else {
      setVehicle(null);
    }

    if (loadedJob.plant_id) {
      const { data: plantData, error: plantError } = await supabase
        .from("plant_assets")
        .select(
          "id, asset_id, make, model, plant_type, serial_number, rego, crew, project, asset_status",
        )
        .eq("id", loadedJob.plant_id)
        .maybeSingle();

      if (plantError) {
        console.error("Failed to load linked plant:", plantError.message);
      }

      setPlant((plantData as PlantAsset) || null);
    } else {
      setPlant(null);
    }

    if (
      resolvedPrestartId &&
      (loadedJob.source === "Prestart" ||
        clean(loadedJob.source_type).toLowerCase().includes("prestart"))
    ) {
      const { data: prestartData, error: prestartError } = await supabase
        .from("vehicle_prestarts")
        .select("*")
        .eq("id", resolvedPrestartId)
        .maybeSingle();

      if (prestartError) {
        console.error("Failed to load linked prestart:", prestartError.message);
      }

      setPrestart((prestartData as VehiclePrestart) || null);
    } else {
      setPrestart(null);
    }

    setLoading(false);
  }, [jobId, supabase]);

  useEffect(() => {
    void loadJob();
  }, [loadJob]);

  const assetType = job?.asset_type === "Plant" || job?.plant_id ? "Plant" : "Vehicle";

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

  const resolvedVehicleId = job?.vehicle_id || job?.vehicle_asset_id || null;
  const resolvedPrestartId = job?.prestart_id || job?.source_id || null;

  const assetHref =
    assetType === "Vehicle" && resolvedVehicleId
      ? `/assets/vehicles/${resolvedVehicleId}`
      : assetType === "Plant" && job?.plant_id
        ? `/assets/plant/${job.plant_id}`
        : "/assets";

  const assetUpdateHref =
    assetType === "Vehicle" && resolvedVehicleId
      ? `/assets/vehicles/${resolvedVehicleId}/update`
      : assetType === "Plant" && job?.plant_id
        ? `/assets/plant/${job.plant_id}/update`
        : assetHref;

  const prestartHref = resolvedPrestartId
    ? `/assets/prestarts/${resolvedPrestartId}`
    : "/assets/prestarts";

  const failedItems = job ? getPrestartFlaggedItems(prestart, job) : [];
  const isClosed = job?.status === "Completed" || job?.status === "Closed";

  async function saveUpdates(nextStatus?: string) {
    if (!job) return;

    const finalStatus = nextStatus || status;
    const isClosing = finalStatus === "Completed" || finalStatus === "Closed";

    if (isClosing && !closeOutComments.trim()) {
      alert(
        "Close-out comments are required before completing or closing this job. Add what happened and where the asset update was recorded.",
      );
      return;
    }

    setSaving(true);

    const finalCompletedDate =
      isClosing && !completedDate ? todayDate() : completedDate || null;

    let finalNotes = job.notes || null;

    if (progressUpdate.trim()) {
      finalNotes = appendJobNote(finalNotes, "Progress Update", progressUpdate);
    }

    if (isClosing && closeOutComments.trim()) {
      finalNotes = appendJobNote(
        finalNotes,
        "Close Out",
        `${closeOutComments.trim()}\n\nAsset update record: ${assetTitle} update page.`,
      );
    }

    const { error } = await supabase
      .from("fleet_jobs")
      .update({
        status: finalStatus,
        priority,
        vendor: vendor.trim() || null,
        assigned_to: assignedTo.trim() || null,
        due_date: dueDate || null,
        completed_date: finalCompletedDate,
        cost: cost ? Number(cost) : null,
        notes: finalNotes,
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

  if (loading) {
    return (
      <PageShell>
        <div className="flex min-h-100 items-center justify-center border border-slate-200 bg-white p-8 shadow-sm">
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
          description={`No fleet job was found for route value: ${jobId || "missing id"}.`}
          actions={
            <Link
              href="/assets/fleet-jobs"
              className="inline-flex min-h-10 items-center gap-2 border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Back to Fleet Jobs
            </Link>
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
            <Link
              href="/assets/fleet-jobs"
              className="inline-flex min-h-10 items-center gap-2 border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Back
            </Link>

            <Link
              href={assetHref}
              className="inline-flex min-h-10 items-center gap-2 border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ExternalLink size={16} />
              View Asset
            </Link>

            <Link
              href={assetUpdateHref}
              className="inline-flex min-h-10 items-center gap-2 bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Settings size={16} />
              Record Asset Update
            </Link>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Status" value={job.status || "Open"} icon={<ClipboardList size={20} />} tone={toneForStatus(job.status)} />
        <SummaryCard label="Priority" value={job.priority || "Medium"} icon={<Wrench size={20} />} tone={toneForPriority(job.priority)} />
        <SummaryCard label="Due Date" value={dateDisplay(job.due_date)} icon={<Calendar size={20} />} tone="blue" />
        <SummaryCard label="Cost" value={moneyDisplay(job.cost)} icon={<DollarSign size={20} />} tone="slate" />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.35fr_0.9fr]">
        <div className="space-y-5">
          <section className="border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Job Details</h2>
                <p className="text-sm text-slate-600">
                  Fleet job notification, source details and linked asset context.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <StatusBadge label={job.status || "Open"} tone={toneForStatus(job.status)} />
                <StatusBadge label={job.priority || "Medium"} tone={toneForPriority(job.priority)} />
              </div>
            </div>

            <DetailGrid
              items={[
                { label: "Job Number", value: job.job_number || "N/A" },
                { label: "Source", value: job.source || job.source_type || "N/A" },
                { label: "Asset Type", value: assetType },
                { label: "Reported", value: dateDisplay(job.reported_date) },
                { label: "Created", value: dateDisplay(job.created_at) },
                { label: "Updated", value: dateDisplay(job.updated_at) },
                { label: "Project", value: job.project || vehicle?.project || plant?.project || "N/A" },
                { label: "Crew", value: job.crew || vehicle?.crew || plant?.crew || "N/A" },
                { label: "Reported By", value: job.reported_by || "N/A" },
                { label: "Assigned To", value: job.assigned_to || "N/A" },
                { label: "Vendor", value: job.vendor || "N/A" },
                { label: "Completed", value: dateDisplay(job.completed_date) },
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
              <Truck size={20} className="text-slate-600" />
              <div>
                <h2 className="text-lg font-bold text-slate-950">Linked Asset</h2>
                <p className="text-sm text-slate-600">{assetTitle}</p>
              </div>
            </div>

            {assetType === "Vehicle" ? (
              <DetailGrid
                items={[
                  { label: "Vehicle ID", value: vehicle?.vehicle_id || "N/A" },
                  { label: "Rego", value: vehicle?.vehicle_rego || "N/A" },
                  { label: "Category", value: vehicle?.category || "N/A" },
                  {
                    label: "Make / Model",
                    value: [vehicle?.make, vehicle?.model].map(clean).filter(Boolean).join(" ") || "N/A",
                  },
                  { label: "Project", value: vehicle?.project || job.project || "N/A" },
                  { label: "Crew", value: vehicle?.crew || job.crew || "N/A" },
                  { label: "Status", value: vehicle?.status || "N/A" },
                  { label: "Asset Label", value: job.asset_label || "N/A" },
                ]}
              />
            ) : (
              <DetailGrid
                items={[
                  { label: "Asset ID", value: plant?.asset_id || "N/A" },
                  { label: "Rego", value: plant?.rego || "N/A" },
                  { label: "Plant Type", value: plant?.plant_type || "N/A" },
                  { label: "Serial", value: plant?.serial_number || "N/A" },
                  {
                    label: "Make / Model",
                    value: [plant?.make, plant?.model].map(clean).filter(Boolean).join(" ") || "N/A",
                  },
                  { label: "Project", value: plant?.project || job.project || "N/A" },
                  { label: "Crew", value: plant?.crew || job.crew || "N/A" },
                  { label: "Status", value: plant?.asset_status || "N/A" },
                ]}
              />
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={assetHref}
                className="inline-flex min-h-10 items-center gap-2 border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <ExternalLink size={16} />
                Open Asset Record
              </Link>

              <Link
                href={assetUpdateHref}
                className="inline-flex min-h-10 items-center gap-2 bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <Settings size={16} />
                Record Modification / Service
              </Link>
            </div>
          </section>

          <section className="overflow-hidden border border-violet-100 bg-white shadow-sm">
            <div className="border-b border-violet-100 bg-violet-50 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-white p-2 text-violet-700 shadow-sm">
                    <AlertTriangle size={20} />
                  </div>

                  <div>
                    <h2 className="text-lg font-bold text-slate-950">
                      Linked Prestart Issue
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      This fleet job was raised from a failed prestart item.
                    </p>
                  </div>
                </div>

                <StatusBadge
                  label={prestart?.severity ? prestart.severity.toUpperCase() : "PRESTART"}
                  tone={prestart?.severity === "major" ? "rose" : "amber"}
                />
              </div>
            </div>

            {resolvedPrestartId ? (
              <div className="p-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MiniInfo label="Date" value={dateDisplay(prestart?.prestart_date || prestart?.created_at)} />
                  <MiniInfo
                    label="Operator"
                    value={prestart?.employee_name || prestart?.operator_name || job.reported_by || "N/A"}
                  />
                  <MiniInfo label="Asset" value={prestart?.asset_label || job.asset_label || assetTitle} />
                  <MiniInfo label="Source" value="Prestart" />
                </div>

                <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-rose-500">
                        Flagged Items
                      </p>
                      <p className="mt-1 text-sm text-rose-700">
                        Items marked as failed or requiring attention during the prestart.
                      </p>
                    </div>

                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-rose-700 shadow-sm">
                      {failedItems.length} issue{failedItems.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {failedItems.length > 0 ? (
                    <div className="mt-4 grid gap-3">
                      {failedItems.map((item, index) => {
                        const { label, comment } = formatIssueLabel(item);

                        return (
                          <div
                            key={`${item}-${index}`}
                            className="rounded-xl border border-rose-100 bg-white p-4 shadow-sm"
                          >
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-black text-rose-700">
                                {index + 1}
                              </div>

                              <div>
                                <p className="text-sm font-black text-slate-950">
                                  {label}
                                </p>

                                {comment ? (
                                  <p className="mt-1 text-sm font-semibold text-rose-700">
                                    {comment}
                                  </p>
                                ) : (
                                  <p className="mt-1 text-sm text-slate-500">
                                    No additional comment provided.
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
                      No checklist item list was found, but this job is linked to a prestart.
                    </p>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href={prestartHref}
                    className="inline-flex min-h-10 items-center gap-2 border border-violet-200 bg-violet-50 px-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
                  >
                    <ExternalLink size={16} />
                    Open Prestart
                  </Link>

                  <Link
                    href={assetUpdateHref}
                    className="inline-flex min-h-10 items-center gap-2 border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Settings size={16} />
                    Record Asset Update
                  </Link>
                </div>
              </div>
            ) : (
              <div className="p-5">
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                  This job is not linked to a prestart.
                </p>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Action Job</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Track progress here. Record actual modifications, service details or repairs on the asset update page.
            </p>

            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
              Fleet Jobs are for notification and progress tracking. Use{" "}
              <Link href={assetUpdateHref} className="font-black underline">
                Record Asset Update
              </Link>{" "}
              to document what was actually changed, repaired, serviced or modified.
            </div>

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
                Assigned To
                <input
                  value={assignedTo}
                  onChange={(event) => setAssignedTo(event.target.value)}
                  placeholder="Employee, mechanic or responsible person"
                  className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Vendor / Mechanic
                <input
                  value={vendor}
                  onChange={(event) => setVendor(event.target.value)}
                  placeholder="Workshop, supplier or mechanic"
                  className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Due Date
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
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
                Cost
                <input
                  type="number"
                  value={cost}
                  onChange={(event) => setCost(event.target.value)}
                  placeholder="0.00"
                  className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Progress Update
                <textarea
                  value={progressUpdate}
                  onChange={(event) => setProgressUpdate(event.target.value)}
                  rows={4}
                  placeholder="Optional. Example: Booked with mechanic, parts ordered, waiting on workshop availability..."
                  className="border border-slate-300 bg-white px-3 py-3 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Close-out Comments
                <textarea
                  value={closeOutComments}
                  onChange={(event) => setCloseOutComments(event.target.value)}
                  rows={5}
                  placeholder="Required only when completing/closing. Include what happened and where the asset update was recorded."
                  className="border border-slate-300 bg-white px-3 py-3 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                />
              </label>

              <button
                type="button"
                onClick={() => void saveUpdates()}
                disabled={saving}
                className="inline-flex min-h-11 items-center justify-center gap-2 bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save Progress Update
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStatus("In Progress");
                    void saveUpdates("In Progress");
                  }}
                  disabled={saving}
                  className="inline-flex min-h-10 items-center justify-center gap-2 border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                  Start Job
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStatus("Waiting Parts");
                    void saveUpdates("Waiting Parts");
                  }}
                  disabled={saving}
                  className="inline-flex min-h-10 items-center justify-center gap-2 border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                >
                  Waiting Parts
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCompletedDate(completedDate || todayDate());
                    setStatus("Completed");
                    void saveUpdates("Completed");
                  }}
                  disabled={saving || isClosed}
                  className="inline-flex min-h-10 items-center justify-center gap-2 border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Complete
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStatus("Open");
                    setCompletedDate("");
                    void saveUpdates("Open");
                  }}
                  disabled={saving}
                  className="inline-flex min-h-10 items-center justify-center gap-2 border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Reopen
                </button>
              </div>
            </div>
          </section>

          <section className="border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
              <CheckCircle2 size={20} />
              Job Notes / Close Out
            </h2>

            <div className="mt-4 space-y-3 text-sm">
              <InfoRow label="Current Status" value={job.status || "Open"} />
              <InfoRow label="Completed Date" value={dateDisplay(job.completed_date)} />
              <InfoRow label="Vendor" value={job.vendor || "N/A"} />
              <InfoRow label="Cost" value={moneyDisplay(job.cost)} />
              <InfoRow label="Last Updated" value={dateDisplay(job.updated_at)} />
            </div>

            <div className="mt-5 border-t border-slate-200 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Progress / Close-out History
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {job.notes || "No progress or close-out comments recorded."}
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

function MiniInfo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-950">{value}</p>
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
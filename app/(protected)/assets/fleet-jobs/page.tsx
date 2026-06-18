/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { PageHeader, PageShell } from "../components";

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

type FleetJobUpdate = {
  id: string;
  fleet_job_id: string;
  update_type: string | null;
  status: string | null;
  comment: string | null;
  created_at: string | null;
};

type FaultCorrection = {
  id: string;
  fault: string;
  prestart_comment: string;
  correction: string;
};

type JobSummaryRow = {
  id: string;
  fault: string;
  prestart_comment: string;
  correction: string;
};

type AssetHistoryRecord = {
  id: string;
  fleet_job_id: string | null;
  history_type: string | null;
  history_date: string | null;
  title: string | null;
  created_at: string | null;
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
  latest_update_type: string | null;
  latest_update_status: string | null;
  has_asset_history: boolean;
  status_note: string;
  displayed_date: string | null;
  displayed_date_label: "Due" | "Completed";
  summary_title: "Issues Raised" | "Corrections Completed";
  summary_rows: JobSummaryRow[];
  close_out_comment: string;
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

const activeStatuses: FleetJobStatus[] = [
  "Open",
  "In Progress",
  "Waiting Parts",
  "Booked",
];

const completedStatuses: FleetJobStatus[] = ["Completed", "Closed"];
const priorities: FleetJobPriority[] = ["Low", "Medium", "High", "Critical"];
const sources: FleetJobSource[] = ["Manual", "Prestart", "Service", "Defect", "Compliance"];

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function csvSafe(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function dateDisplay(value: string | null | undefined) {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleDateString("en-AU", {
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
  return statuses.includes(value as FleetJobStatus) ? (value as FleetJobStatus) : "Open";
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

function isClosedStatus(status: FleetJobStatus) {
  return completedStatuses.includes(status);
}

function latestByDate(items: FleetJobUpdate[]) {
  return [...items].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  })[0];
}

const faultCorrectionJsonStart = "[[FAULT_CORRECTIONS_JSON_START]]";
const faultCorrectionJsonEnd = "[[FAULT_CORRECTIONS_JSON_END]]";

function stripFaultCorrectionJson(value: string | null | undefined) {
  if (!value) return "";

  const startIndex = value.indexOf(faultCorrectionJsonStart);
  const endIndex = value.indexOf(faultCorrectionJsonEnd);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return value;
  }

  return `${value.slice(0, startIndex)}${value.slice(
    endIndex + faultCorrectionJsonEnd.length,
  )}`;
}

function parseFaultCorrectionsFromComment(
  comment: string | null | undefined,
): FaultCorrection[] {
  if (!comment) return [];

  const startIndex = comment.indexOf(faultCorrectionJsonStart);
  const endIndex = comment.indexOf(faultCorrectionJsonEnd);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return [];
  }

  const rawJson = comment
    .slice(startIndex + faultCorrectionJsonStart.length, endIndex)
    .trim();

  try {
    const parsed = JSON.parse(rawJson) as FaultCorrection[];

    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((row, index) => ({
        id: clean(row.id) || `fault-${index}`,
        fault: clean(row.fault) || `Fault ${index + 1}`,
        prestart_comment:
          clean(row.prestart_comment) || "No additional prestart comment provided.",
        correction: clean(row.correction),
      }))
      .filter((row) => clean(row.fault));
  } catch {
    return [];
  }
}

function extractGeneralCloseOutComment(comment: string | null | undefined) {
  const withoutJson = stripFaultCorrectionJson(comment);

  return withoutJson
    .replace(/\n?Fault Corrections:[\s\S]*$/, "")
    .replace(/\n?Asset history recorded as:[\s\S]*$/, "")
    .replace(/\n?Asset update record:[\s\S]*$/, "")
    .trim();
}

function latestUpdateByType(
  updates: FleetJobUpdate[],
  match: (value: string) => boolean,
) {
  return latestByDate(
    updates.filter((update) => match(clean(update.update_type).toLowerCase())),
  );
}

function splitIssueText(value: string | null | undefined): JobSummaryRow[] {
  const text = stripFaultCorrectionJson(value).trim();

  if (!text) return [];

  return text
    .split(/\n|•|;/)
    .map((item) => item.replace(/^[-*✓•\s]+/, "").trim())
    .filter((item) => item.length > 2)
    .slice(0, 8)
    .map((item, index) => {
      const [rawFault, ...commentParts] = item.split(" - ");
      const fault = (rawFault || item)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())
        .trim();

      return {
        id: `issue-${index}`,
        fault: fault || `Issue ${index + 1}`,
        prestart_comment: commentParts.join(" - ").trim(),
        correction: "",
      };
    });
}

function buildJobSummaryRows(
  job: FleetJob,
  updates: FleetJobUpdate[],
  calculatedStatus: FleetJobStatus,
): {
  title: "Issues Raised" | "Corrections Completed";
  rows: JobSummaryRow[];
  closeOutComment: string;
} {
  const latestCloseOut = latestUpdateByType(
    updates,
    (type) => type === "close out" || type === "close out edited",
  );
  const latestFaultCorrection = latestUpdateByType(
    updates,
    (type) => type === "fault corrections",
  );

  const closeOutCorrections = parseFaultCorrectionsFromComment(
    latestCloseOut?.comment,
  );
  const savedCorrections = parseFaultCorrectionsFromComment(
    latestFaultCorrection?.comment,
  );
  const isClosed = isClosedStatus(calculatedStatus);

  if (isClosed && closeOutCorrections.length > 0) {
    return {
      title: "Corrections Completed",
      rows: closeOutCorrections,
      closeOutComment: extractGeneralCloseOutComment(latestCloseOut?.comment),
    };
  }

  if (savedCorrections.length > 0) {
    return {
      title: isClosed ? "Corrections Completed" : "Issues Raised",
      rows: savedCorrections,
      closeOutComment: extractGeneralCloseOutComment(latestCloseOut?.comment),
    };
  }

  if (closeOutCorrections.length > 0) {
    return {
      title: isClosed ? "Corrections Completed" : "Issues Raised",
      rows: closeOutCorrections,
      closeOutComment: extractGeneralCloseOutComment(latestCloseOut?.comment),
    };
  }

  return {
    title: isClosed ? "Corrections Completed" : "Issues Raised",
    rows: splitIssueText(job.description),
    closeOutComment: extractGeneralCloseOutComment(latestCloseOut?.comment),
  };
}

function statusFromUpdates(job: FleetJob, updates: FleetJobUpdate[], hasAssetHistory: boolean): FleetJobStatus {
  const jobStatus = toFleetJobStatus(job.status);
  const latestUpdate = latestByDate(updates);
  const latestUpdateStatus = toFleetJobStatus(latestUpdate?.status ?? null);
  const latestUpdateType = clean(latestUpdate?.update_type).toLowerCase();

  if (latestUpdateType === "reopened") return "Open";
  if (latestUpdateType.includes("close out") && hasAssetHistory) return "Completed";
  if (latestUpdate?.status && statuses.includes(latestUpdate.status as FleetJobStatus)) {
    return latestUpdateStatus;
  }

  if (hasAssetHistory && isClosedStatus(jobStatus)) return "Completed";

  return jobStatus;
}

function statusNoteForJob(job: FleetJob, status: FleetJobStatus, latestUpdate?: FleetJobUpdate, hasAssetHistory?: boolean) {
  const updateType = clean(latestUpdate?.update_type);

  if (updateType === "Reopened") return "Reopened for further action";
  if (status === "Waiting Parts") return "Waiting on parts / supplier";
  if (status === "Booked") return "Booked with mechanic / workshop";
  if (status === "In Progress") return "Currently being actioned";
  if (status === "Completed" || status === "Closed") {
    return hasAssetHistory ? "Closed out and asset history recorded" : "Closed out";
  }

  if (job.due_date) return `Due ${dateDisplay(job.due_date)}`;
  return "Awaiting action";
}

function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  const classes =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : tone === "violet"
            ? "border-violet-200 bg-violet-50 text-violet-700"
            : tone === "blue"
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${classes}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function CompactKpi({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  const classes =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : tone === "blue"
            ? "border-blue-200 bg-blue-50 text-blue-800"
            : "border-slate-200 bg-slate-50 text-slate-800";

  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${classes}`}>
      <p className="text-xs font-black uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function SectionTitle({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count: number;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-600">
            {count}
          </span>
        </div>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      {children}
    </div>
  );
}

function JobSummary({ job }: { job: EnhancedFleetJob }) {
  const isCompleted = completedStatuses.includes(job.calculated_status);
  const rows = job.summary_rows;

  if (rows.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">
          {job.summary_title}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {job.description || job.close_out_comment || "No issue summary recorded."}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`mt-3 rounded-xl border p-3 ${
        isCompleted
          ? "border-emerald-100 bg-emerald-50/70"
          : "border-amber-100 bg-amber-50/70"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={`text-xs font-black uppercase tracking-wide ${
            isCompleted ? "text-emerald-700" : "text-amber-700"
          }`}
        >
          {job.summary_title}
        </p>

        <span
          className={`rounded-full bg-white px-2.5 py-1 text-xs font-black shadow-sm ${
            isCompleted ? "text-emerald-700" : "text-amber-700"
          }`}
        >
          {rows.length} item{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
        {rows.slice(0, 4).map((row, index) => {
          const primaryText = isCompleted
            ? row.correction || row.fault
            : row.fault;
          const secondaryText = isCompleted
            ? row.fault
            : row.prestart_comment || row.correction;

          return (
            <li key={`${row.id}-${index}`} className="flex gap-2">
              <span
                className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                  isCompleted ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              <span>
                <span className="font-bold text-slate-950">
                  {isCompleted ? "Corrected:" : "Issue:"}
                </span>{" "}
                {primaryText}
                {secondaryText ? (
                  <span className="block text-xs font-semibold text-slate-500">
                    {isCompleted ? `Original fault: ${secondaryText}` : secondaryText}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      {rows.length > 4 ? (
        <p className="mt-2 text-xs font-semibold text-slate-500">
          +{rows.length - 4} more item{rows.length - 4 === 1 ? "" : "s"}.
          Open the job to view the full correction table.
        </p>
      ) : null}

      {isCompleted && job.close_out_comment ? (
        <div className="mt-3 rounded-lg border border-emerald-100 bg-white p-2 text-xs leading-5 text-slate-600">
          <span className="font-black text-slate-700">Close-out:</span>{" "}
          {job.close_out_comment}
        </div>
      ) : null}
    </div>
  );
}

function JobCard({ job }: { job: EnhancedFleetJob }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-slate-950">{job.job_number || "No job #"}</p>
            <StatusBadge label={job.calculated_status} tone={job.tone} />
            <StatusBadge label={job.calculated_priority} tone={job.priorityTone} />
          </div>

          <h3 className="mt-2 text-base font-black text-slate-950">{job.title || "Untitled fleet job"}</h3>

          <JobSummary job={job} />

          <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
            <p><span className="font-black text-slate-500">Asset:</span> {job.display_asset_label}</p>
            <p><span className="font-black text-slate-500">Allocation:</span> {job.asset_detail}</p>
            <p><span className="font-black text-slate-500">Source:</span> {job.calculated_source}</p>
            <p><span className="font-black text-slate-500">{job.displayed_date_label}:</span> {dateDisplay(job.displayed_date)}</p>
            <p><span className="font-black text-slate-500">Assigned:</span> {job.assigned_to || "N/A"}</p>
            <p><span className="font-black text-slate-500">Vendor:</span> {job.vendor || "N/A"}</p>
            <p><span className="font-black text-slate-500">Cost:</span> {moneyDisplay(job.cost)}</p>
            <p><span className="font-black text-slate-500">Note:</span> {job.status_note}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col">
          <Link
            href={`/assets/fleet-jobs/${job.id}`}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-sm font-bold text-white hover:bg-slate-800"
          >
            <Eye size={16} />
            View Job
          </Link>

          {job.calculated_asset_type === "Vehicle" && job.resolved_vehicle_id ? (
            <Link
              href={`/assets/vehicles/${job.resolved_vehicle_id}`}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <Settings size={16} />
              Asset
            </Link>
          ) : job.calculated_asset_type === "Plant" && job.plant_id ? (
            <Link
              href={`/assets/plant/${job.plant_id}`}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <Settings size={16} />
              Asset
            </Link>
          ) : null}
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
  const [updates, setUpdates] = useState<FleetJobUpdate[]>([]);
  const [assetHistory, setAssetHistory] = useState<AssetHistoryRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleAsset[]>([]);
  const [plantAssets, setPlantAssets] = useState<PlantAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [priorityFilter, setPriorityFilter] = useState("All Priorities");
  const [assetFilter, setAssetFilter] = useState("All Assets");
  const [sourceFilter, setSourceFilter] = useState("All Sources");

  const [showCompleted, setShowCompleted] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<JobForm>(emptyForm);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [jobsResult, vehiclesResult, plantResult, updatesResult, assetHistoryResult] = await Promise.all([
      supabase.from("fleet_jobs").select("*").order("created_at", { ascending: false }),

      supabase
        .from("vehicle_assets")
        .select("id, vehicle_id, vehicle_rego, make, model, category, project, crew, status")
        .order("vehicle_id", { ascending: true }),

      supabase
        .from("plant_assets")
        .select("id, asset_id, make, model, plant_type, serial_number, rego, crew, project, asset_status")
        .order("asset_id", { ascending: true }),

      supabase
        .from("fleet_job_updates")
        .select("id, fleet_job_id, update_type, status, comment, created_at")
        .order("created_at", { ascending: false }),

      supabase
        .from("asset_history")
        .select("id, fleet_job_id, history_type, history_date, title, created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (jobsResult.error) {
      console.error("Failed to load fleet jobs:", jobsResult.error.message);
      setJobs([]);
    } else {
      setJobs((jobsResult.data ?? []) as FleetJob[]);
    }

    if (vehiclesResult.error) {
      console.error("Failed to load vehicles:", vehiclesResult.error.message);
      setVehicles([]);
    } else {
      setVehicles((vehiclesResult.data ?? []) as VehicleAsset[]);
    }

    if (plantResult.error) {
      console.error("Failed to load plant:", plantResult.error.message);
      setPlantAssets([]);
    } else {
      setPlantAssets((plantResult.data ?? []) as PlantAsset[]);
    }

    if (updatesResult.error) {
      console.error("Failed to load fleet job updates:", updatesResult.error.message);
      setUpdates([]);
    } else {
      setUpdates((updatesResult.data ?? []) as FleetJobUpdate[]);
    }

    if (assetHistoryResult.error) {
      console.error("Failed to load asset history:", assetHistoryResult.error.message);
      setAssetHistory([]);
    } else {
      setAssetHistory((assetHistoryResult.data ?? []) as AssetHistoryRecord[]);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const vehicleMap = useMemo(() => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])), [vehicles]);
  const plantMap = useMemo(() => new Map(plantAssets.map((asset) => [asset.id, asset])), [plantAssets]);

  const updatesByJobId = useMemo(() => {
    const map = new Map<string, FleetJobUpdate[]>();
    updates.forEach((update) => {
      const existing = map.get(update.fleet_job_id) ?? [];
      existing.push(update);
      map.set(update.fleet_job_id, existing);
    });
    return map;
  }, [updates]);

  const assetHistoryByJobId = useMemo(() => {
    const map = new Map<string, AssetHistoryRecord[]>();
    assetHistory.forEach((record) => {
      if (!record.fleet_job_id) return;
      const existing = map.get(record.fleet_job_id) ?? [];
      existing.push(record);
      map.set(record.fleet_job_id, existing);
    });
    return map;
  }, [assetHistory]);

  const enhancedJobs = useMemo<EnhancedFleetJob[]>(() => {
    return jobs.map((job) => {
      const jobUpdates = updatesByJobId.get(job.id) ?? [];
      const latestUpdate = latestByDate(jobUpdates);
      const jobAssetHistory = assetHistoryByJobId.get(job.id) ?? [];
      const hasAssetHistory = jobAssetHistory.length > 0;

      const resolved_vehicle_id = job.vehicle_id || job.vehicle_asset_id || null;
      const resolved_prestart_id = job.prestart_id || job.source_id || null;

      const calculated_asset_type = toAssetType(job.asset_type, job.plant_id);
      const calculated_status = statusFromUpdates(job, jobUpdates, hasAssetHistory);
      const calculated_priority = toFleetJobPriority(job.priority);
      const calculated_source = toFleetJobSource(job.source, job.source_type);

      const vehicle = resolved_vehicle_id ? vehicleMap.get(resolved_vehicle_id) : null;
      const plant = job.plant_id ? plantMap.get(job.plant_id) : null;

      const display_asset_label =
        calculated_asset_type === "Vehicle"
          ? [vehicle?.vehicle_id, vehicle?.vehicle_rego, vehicle?.make, vehicle?.model]
              .map(clean)
              .filter(Boolean)
              .join(" · ") ||
            clean(job.asset_label) ||
            "Vehicle not linked"
          : [plant?.asset_id, plant?.rego, plant?.make, plant?.model, plant?.plant_type]
              .map(clean)
              .filter(Boolean)
              .join(" · ") ||
            clean(job.asset_label) ||
            "Plant not linked";

      const asset_detail =
        calculated_asset_type === "Vehicle"
          ? [vehicle?.project ?? job.project, vehicle?.crew ?? job.crew].map(clean).filter(Boolean).join(" · ") || "No allocation"
          : [plant?.project ?? job.project, plant?.crew ?? job.crew].map(clean).filter(Boolean).join(" · ") || "No allocation";

      const isPrestartLinked =
        calculated_source === "Prestart" ||
        clean(job.source_type).toLowerCase().includes("prestart") ||
        Boolean(job.prestart_id);

      const displayed_date_label = isClosedStatus(calculated_status) ? "Completed" : "Due";
      const displayed_date = isClosedStatus(calculated_status)
        ? job.completed_date || jobAssetHistory[0]?.history_date || latestUpdate?.created_at || job.updated_at
        : job.due_date;

      const jobSummary = buildJobSummaryRows(
        job,
        jobUpdates,
        calculated_status,
      );

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
        latest_update_type: latestUpdate?.update_type ?? null,
        latest_update_status: latestUpdate?.status ?? null,
        has_asset_history: hasAssetHistory,
        status_note: statusNoteForJob(job, calculated_status, latestUpdate, hasAssetHistory),
        displayed_date,
        displayed_date_label,
        summary_title: jobSummary.title,
        summary_rows: jobSummary.rows,
        close_out_comment: jobSummary.closeOutComment,
      };
    });
  }, [jobs, vehicleMap, plantMap, updatesByJobId, assetHistoryByJobId]);

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
        job.status_note,
        job.close_out_comment,
        job.summary_rows
          .map((row) => [row.fault, row.prestart_comment, row.correction].join(" "))
          .join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return (
        searchable.includes(term) &&
        (statusFilter === "All Statuses" || job.calculated_status === statusFilter) &&
        (priorityFilter === "All Priorities" || job.calculated_priority === priorityFilter) &&
        (assetFilter === "All Assets" || job.calculated_asset_type === assetFilter) &&
        (sourceFilter === "All Sources" || job.calculated_source === sourceFilter)
      );
    });
  }, [enhancedJobs, search, statusFilter, priorityFilter, assetFilter, sourceFilter]);

  const activeJobs = useMemo(() => {
    return filteredJobs.filter((job) => activeStatuses.includes(job.calculated_status));
  }, [filteredJobs]);

  const completedJobs = useMemo(() => {
    return filteredJobs.filter((job) => completedStatuses.includes(job.calculated_status));
  }, [filteredJobs]);

  const stats = useMemo(() => {
    return {
      open: enhancedJobs.filter((job) => job.calculated_status === "Open").length,
      inProgress: enhancedJobs.filter((job) => job.calculated_status === "In Progress" || job.calculated_status === "Booked").length,
      waitingParts: enhancedJobs.filter((job) => job.calculated_status === "Waiting Parts").length,
      completed: enhancedJobs.filter((job) => completedStatuses.includes(job.calculated_status)).length,
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
      "Status Note",
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
      job.status_note,
      clean(job.project),
      clean(job.crew),
      clean(job.reported_date),
      clean(job.due_date),
      clean(job.completed_date),
      clean(job.vendor),
      job.cost ?? "",
      clean(job.resolved_prestart_id),
    ]);

    const csv = [headers.map(csvSafe).join(","), ...rows.map((row) => row.map(csvSafe).join(","))].join("\n");
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

    const selectedVehicle = form.asset_type === "Vehicle" ? vehicleMap.get(form.vehicle_id) : null;
    const selectedPlant = form.asset_type === "Plant" ? plantMap.get(form.plant_id) : null;

    const assetLabel =
      form.asset_type === "Vehicle"
        ? [selectedVehicle?.vehicle_id, selectedVehicle?.vehicle_rego, selectedVehicle?.make, selectedVehicle?.model]
            .map(clean)
            .filter(Boolean)
            .join(" · ")
        : [selectedPlant?.asset_id, selectedPlant?.rego, selectedPlant?.make, selectedPlant?.model]
            .map(clean)
            .filter(Boolean)
            .join(" · ");

    const { error } = await supabase.from("fleet_jobs").insert({
      asset_type: form.asset_type,
      vehicle_id: form.asset_type === "Vehicle" ? form.vehicle_id || null : null,
      vehicle_asset_id: form.asset_type === "Vehicle" ? form.vehicle_id || null : null,
      plant_id: form.asset_type === "Plant" ? form.plant_id || null : null,
      asset_label: assetLabel || null,
      title: form.title.trim(),
      description: form.description.trim() || null,
      source: form.source,
      source_type: form.source,
      priority: form.priority,
      status: form.status,
      project:
        form.project.trim() ||
        (form.asset_type === "Vehicle" ? selectedVehicle?.project : selectedPlant?.project) ||
        null,
      crew:
        form.crew.trim() ||
        (form.asset_type === "Vehicle" ? selectedVehicle?.crew : selectedPlant?.crew) ||
        null,
      reported_by: form.reported_by.trim() || null,
      assigned_to: form.assigned_to.trim() || null,
      vendor: form.vendor.trim() || null,
      reported_date: form.reported_date || new Date().toISOString().slice(0, 10),
      due_date: form.due_date || null,
      completed_date: form.completed_date || null,
      cost: form.cost ? Number(form.cost) : null,
      notes: form.notes.trim() || null,
    });

    if (error) {
      console.error("Failed to create fleet job:", error.message);
      alert(error.message);
    } else {
      setShowCreate(false);
      setForm({ ...emptyForm, reported_date: new Date().toISOString().slice(0, 10) });
      await loadData();
    }

    setSaving(false);
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Fleet Jobs"
        title="Fleet Job Register"
        description="Track vehicle and plant defects, prestart issues, repairs, services and close-outs. Active and completed jobs are split so the register stays easy to read."
        actions={
          <>
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            <button
              type="button"
              onClick={exportFilteredJobs}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <Download size={16} />
              Export CSV
            </button>

            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-3 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              <Plus size={16} />
              Add Fleet Job
            </button>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CompactKpi label="Open" value={stats.open} tone="rose" />
        <CompactKpi label="In Progress / Booked" value={stats.inProgress} tone="blue" />
        <CompactKpi label="Waiting Parts" value={stats.waitingParts} tone="amber" />
        <CompactKpi label="Completed" value={stats.completed} tone="emerald" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1.3fr_repeat(4,1fr)]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search job number, asset, status, notes..."
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
            />
          </label>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
          >
            <option>All Statuses</option>
            {statuses.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
          >
            <option>All Priorities</option>
            {priorities.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          <select
            value={assetFilter}
            onChange={(event) => setAssetFilter(event.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
          >
            <option>All Assets</option>
            <option>Vehicle</option>
            <option>Plant</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
          >
            <option>All Sources</option>
            {sources.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
      </section>

      {loading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="inline-flex items-center gap-3 text-sm font-bold text-slate-600">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Loading fleet jobs...
          </div>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <SectionTitle
              title="Active Fleet Jobs"
              description="Open, in progress, waiting parts and booked jobs that still need action."
              count={activeJobs.length}
            />

            <div className="mt-4 space-y-3">
              {activeJobs.length > 0 ? (
                activeJobs.map((job) => <JobCard key={job.id} job={job} />)
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
                  No active fleet jobs match the current filters.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <SectionTitle
              title="Completed Fleet Jobs"
              description="Closed-out jobs are kept separate so active work stays clear."
              count={completedJobs.length}
            >
              <button
                type="button"
                onClick={() => setShowCompleted((current) => !current)}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                {showCompleted ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {showCompleted ? "Hide Completed" : "Show Completed"}
              </button>
            </SectionTitle>

            {showCompleted ? (
              <div className="mt-4 space-y-3">
                {completedJobs.length > 0 ? (
                  completedJobs.map((job) => <JobCard key={job.id} job={job} />)
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
                    No completed fleet jobs match the current filters.
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Completed jobs are hidden. Click Show Completed to review close-outs.
              </div>
            )}
          </section>
        </>
      )}

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">New Fleet Job</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Add Fleet Job</h2>
                <p className="mt-1 text-sm text-slate-600">Create a manual fleet job for a vehicle or plant asset.</p>
              </div>

              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Asset Type
                <select
                  value={form.asset_type}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      asset_type: event.target.value as AssetType,
                      vehicle_id: "",
                      plant_id: "",
                    }))
                  }
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
                >
                  <option>Vehicle</option>
                  <option>Plant</option>
                </select>
              </label>

              {form.asset_type === "Vehicle" ? (
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Vehicle
                  <select
                    value={form.vehicle_id}
                    onChange={(event) => setForm((current) => ({ ...current, vehicle_id: event.target.value }))}
                    className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
                  >
                    <option value="">Select vehicle</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {[vehicle.vehicle_id, vehicle.vehicle_rego, vehicle.make, vehicle.model].map(clean).filter(Boolean).join(" · ")}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Plant
                  <select
                    value={form.plant_id}
                    onChange={(event) => setForm((current) => ({ ...current, plant_id: event.target.value }))}
                    className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
                  >
                    <option value="">Select plant</option>
                    {plantAssets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {[asset.asset_id, asset.rego, asset.make, asset.model, asset.plant_type].map(clean).filter(Boolean).join(" · ")}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                Title
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Example: Replace tyre / Service due / Repair reverse alarm"
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                Description
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  rows={4}
                  placeholder="Describe the issue or work required."
                  className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Source
                <select
                  value={form.source}
                  onChange={(event) => setForm((current) => ({ ...current, source: event.target.value as FleetJobSource }))}
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
                >
                  {sources.map((source) => (
                    <option key={source}>{source}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Priority
                <select
                  value={form.priority}
                  onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as FleetJobPriority }))}
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
                >
                  {priorities.map((priority) => (
                    <option key={priority}>{priority}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Status
                <select
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FleetJobStatus }))}
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
                >
                  {statuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Reported Date
                <input
                  type="date"
                  value={form.reported_date}
                  onChange={(event) => setForm((current) => ({ ...current, reported_date: event.target.value }))}
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Due Date
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))}
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Assigned To
                <input
                  value={form.assigned_to}
                  onChange={(event) => setForm((current) => ({ ...current, assigned_to: event.target.value }))}
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Vendor / Mechanic
                <input
                  value={form.vendor}
                  onChange={(event) => setForm((current) => ({ ...current, vendor: event.target.value }))}
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Cost Estimate / Cost
                <input
                  type="number"
                  value={form.cost}
                  onChange={(event) => setForm((current) => ({ ...current, cost: event.target.value }))}
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                Notes
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  rows={4}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
                />
              </label>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-white p-5">
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
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
                Create Fleet Job
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

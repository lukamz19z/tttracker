"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Calendar,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  KeyRound,
  Pencil,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";
import {
  ActionButton,
  DetailGrid,
  PageHeader,
  PageShell,
  StatusBadge,
} from "../../components";

type Tone = "emerald" | "amber" | "rose" | "blue" | "slate" | "violet";

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
  insurance_expiry: string | null;
  rego_expiry: string | null;
  cranesafe_expiry: string | null;
  last_service_date: string | null;
  last_service_hours: number | null;
  service_interval_hours: number | null;
  next_service_due: string | null;
  next_service_hours: number | null;
  next_inspection_due: string | null;
  hired: boolean | null;
  hired_from: string | null;
  hire_term: string | null;
  asset_status: string | null;
  off_hire_date: string | null;
  superseded_by: string | null;
  inactive_reason: string | null;
  risk_assessment: boolean | null;
  operators_manual: boolean | null;
  load_charts: boolean | null;
  logbook: boolean | null;
  fire_extinguisher: boolean | null;
  first_aid_kit: boolean | null;
  spill_kit: boolean | null;
  notes: string | null;
  header_photo_url: string | null;
  header_photo_document_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type PlantDocument = {
  id: string;
  plant_asset_id: string;
  document_type: string | null;
  file_name: string | null;
  file_url: string | null;
  storage_path?: string | null;
  notes: string | null;
  created_at: string | null;
};

type ServiceHistory = {
  id: string;
  service_date: string | null;
  hour_meter: number | null;
  service_provider: string | null;
  service_type: string | null;
  next_service_interval_hours: number | null;
  work_completed: string | null;
  defects_or_recommendations: string | null;
  invoice_number: string | null;
  invoice_cost: number | null;
  document_url: string | null;
  document_name: string | null;
  created_at: string | null;
};

type AssetHistory = {
  id: string;
  asset_type: string | null;
  vehicle_id: string | null;
  plant_id: string | null;
  fleet_job_id: string | null;
  history_type: string | null;
  history_date: string | null;
  title: string | null;
  description: string | null;
  vendor: string | null;
  cost: number | null;
  odometer_km: number | null;
  engine_hours: number | null;
  next_service_due_date: string | null;
  next_service_due_km: number | null;
  next_service_due_hours: number | null;
  document_url: string | null;
  created_at: string | null;
};

type ProjectHistory = {
  id: string;
  project: string | null;
  crew: string | null;
  project_onboard_date: string | null;
  project_offboard_date: string | null;
  notes: string | null;
  created_at: string | null;
};

type PlantPrestart = {
  id: string;
  plant_asset_id?: string | null;
  asset_id?: string | null;
  asset_label?: string | null;
  plant_label?: string | null;
  plant_type?: string | null;
  cab_hours?: number | null;
  hour_meter?: number | null;
  engine_hours?: number | null;
  hours?: number | null;
  project?: string | null;
  crew?: string | null;
  inspected_by_name?: string | null;
  operator_name?: string | null;
  overall_condition?: string | null;
  comments?: string | null;
  severity?: string | null;
  result?: string | null;
  fleet_job_id?: string | null;
  prestart_date?: string | null;
  created_at?: string | null;
};

type FleetJob = {
  id: string;
  job_number: string | null;
  title: string | null;
  description: string | null;
  priority: string | null;
  status: string | null;
  project: string | null;
  crew: string | null;
  reported_by: string | null;
  assigned_to: string | null;
  due_date: string | null;
  completed_date: string | null;
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

function clean(value: string | null | undefined) {
  return value?.trim() || "N/A";
}

function optional(value: string | null | undefined) {
  return value?.trim() || "";
}

function yesNo(value: boolean | null | undefined) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "N/A";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";

  return value.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
  });
}

function dateMillis(value: string | null | undefined) {
  if (!value) return 0;

  const date = new Date(value);
  const time = date.getTime();

  return Number.isNaN(time) ? 0 : time;
}

function daysBetween(dateValue: string | null | undefined, today: Date) {
  if (!dateValue) return null;

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;

  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - start.getTime()) / 86_400_000);
}

function isCrane(asset: PlantAsset | null) {
  return clean(asset?.plant_type).toLowerCase() === "crane";
}

function isTelehandler(asset: PlantAsset | null) {
  return clean(asset?.plant_type).toLowerCase() === "telehandler";
}

function getAssetStatus(asset: PlantAsset) {
  const manualStatus = clean(asset.asset_status);

  if (manualStatus === "Off Hire") return "Off Hire";
  if (manualStatus === "Superseded") return "Superseded";
  if (manualStatus === "Inactive") return "Inactive";
  if (manualStatus === "Retired") return "Retired";

  if (asset.hired && optional(asset.off_hire_date)) return "Off Hire";
  if (optional(asset.superseded_by)) return "Superseded";
  if (optional(asset.crew) || optional(asset.project)) return "In Use";

  return "Available";
}

function getTone(status: string | null | undefined): Tone {
  const value = clean(status);

  if (value === "Available" || value === "Active") return "emerald";
  if (value === "In Use" || value === "On Hire") return "blue";
  if (value === "Off Hire" || value === "Waiting Parts") return "amber";

  if (
    value === "Inactive" ||
    value === "Retired" ||
    value === "Superseded" ||
    value === "Not Hired"
  ) {
    return "rose";
  }

  return "slate";
}

function historyTone(type: string | null | undefined): Tone {
  const value = clean(type).toLowerCase();

  if (value.includes("service")) return "blue";
  if (value.includes("repair")) return "rose";
  if (value.includes("modification")) return "violet";
  if (value.includes("inspection")) return "amber";

  return "slate";
}

function fleetJobStatusTone(status: string | null | undefined): Tone {
  const value = clean(status).toLowerCase();

  if (["completed", "closed", "complete", "resolved"].includes(value)) {
    return "emerald";
  }

  if (value.includes("waiting")) return "amber";
  if (value.includes("progress") || value.includes("booked")) return "blue";
  if (value.includes("open") || value.includes("reopened")) return "rose";

  return "slate";
}

function isFleetJobClosed(status: string | null | undefined) {
  return ["completed", "closed", "complete", "resolved"].includes(
    clean(status).toLowerCase(),
  );
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
        id: row.id || `fault-${index}`,
        fault: optional(row.fault) || `Fault ${index + 1}`,
        prestart_comment:
          optional(row.prestart_comment) ||
          "No additional prestart comment provided.",
        correction: optional(row.correction),
      }))
      .filter((row) => row.fault);
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

function latestCloseOutForJob(
  updates: FleetJobUpdate[],
  fleetJobId: string | null | undefined,
) {
  if (!fleetJobId) return null;

  return (
    updates.find(
      (update) =>
        update.fleet_job_id === fleetJobId &&
        (update.update_type === "Close Out" ||
          update.update_type === "Close Out Edited"),
    ) || null
  );
}

function latestReopenForJob(
  updates: FleetJobUpdate[],
  fleetJobId: string | null | undefined,
) {
  if (!fleetJobId) return null;

  return (
    updates.find(
      (update) =>
        update.fleet_job_id === fleetJobId && update.update_type === "Reopened",
    ) || null
  );
}

function isFleetJobActiveForPlant(
  job: FleetJob,
  assetHistoryRows: AssetHistory[],
  updates: FleetJobUpdate[],
) {
  const closeOutUpdate = latestCloseOutForJob(updates, job.id);
  const reopenUpdate = latestReopenForJob(updates, job.id);

  const linkedAssetHistoryRows = assetHistoryRows.filter(
    (record) => record.fleet_job_id === job.id,
  );

  const latestAssetHistoryTime = Math.max(
    0,
    ...linkedAssetHistoryRows.map((record) =>
      Math.max(dateMillis(record.history_date), dateMillis(record.created_at)),
    ),
  );

  const latestCloseOutTime = dateMillis(closeOutUpdate?.created_at);
  const latestReopenTime = dateMillis(reopenUpdate?.created_at);

  const hasCloseOutProof =
    Boolean(closeOutUpdate) || linkedAssetHistoryRows.length > 0;

  const latestCloseOutProofTime = Math.max(
    latestCloseOutTime,
    latestAssetHistoryTime,
  );

  const reopenedAfterLatestCloseOut =
    latestReopenTime > 0 &&
    latestCloseOutProofTime > 0 &&
    latestReopenTime > latestCloseOutProofTime;

  if (isFleetJobClosed(job.status)) return false;
  if (reopenedAfterLatestCloseOut) return true;
  if (hasCloseOutProof) return false;

  return true;
}

function makeModel(asset: PlantAsset | null) {
  if (!asset) return "Plant Asset";

  return [asset.make, asset.model]
    .map(clean)
    .filter((value) => value !== "N/A")
    .join(" ");
}

function plantTitle(asset: PlantAsset | null) {
  if (!asset) return "Plant Asset";

  const id = clean(asset.asset_id);
  const model = makeModel(asset);

  if (id !== "N/A" && model) return `${id} - ${model}`;
  if (id !== "N/A") return id;
  return model || "Plant Asset";
}

function prestartHours(record: PlantPrestart | null | undefined) {
  if (!record) return null;

  return (
    record.cab_hours ??
    record.hour_meter ??
    record.engine_hours ??
    record.hours ??
    null
  );
}

function expiryTone(value: string | null | undefined, today: Date): Tone {
  const days = daysBetween(value, today);

  if (days === null) return "slate";
  if (days < 0) return "rose";
  if (days <= 30) return "amber";

  return "emerald";
}

function ImportantDateCard({
  label,
  value,
  helper,
  tone = "slate",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: Tone;
}) {
  const toneClass =
    tone === "rose"
      ? "border-rose-200 bg-rose-50"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : tone === "emerald"
          ? "border-emerald-200 bg-emerald-50"
          : tone === "blue"
            ? "border-blue-200 bg-blue-50"
            : "border-slate-200 bg-slate-50";

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{helper}</p>
    </div>
  );
}

function EmptyCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
      <div className="mb-3 inline-flex rounded-xl bg-white p-2 text-slate-500 shadow-sm">
        {icon}
      </div>
      <p className="font-bold text-slate-800">{title}</p>
      <p className="mt-1">{description}</p>
    </div>
  );
}

function SetupItem({
  label,
  value,
  addedDate,
}: {
  label: string;
  value: boolean | null | undefined;
  addedDate: string;
}) {
  const isFitted = value === true;

  return (
    <div
      className={`rounded-xl border p-3 ${
        isFitted
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-rose-200 bg-rose-50 text-rose-800"
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="mt-1 text-sm font-black">
        {isFitted ? "Fitted" : "Missing"}
      </p>
      <p className="mt-1 text-xs font-semibold opacity-75">
        {isFitted ? `Added: ${addedDate}` : "Requires update if fitted later"}
      </p>
    </div>
  );
}

function DocumentSetupItem({
  label,
  document,
}: {
  label: string;
  document: PlantDocument | undefined;
}) {
  const hasDocument = Boolean(document?.file_url);

  return (
    <div
      className={`rounded-xl border p-3 ${
        hasDocument
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-rose-200 bg-rose-50 text-rose-800"
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="mt-1 text-sm font-black">
        {hasDocument ? "Attached" : "Missing"}
      </p>
      <p className="mt-1 text-xs font-semibold opacity-75">
        {hasDocument
          ? `Uploaded: ${formatDate(document?.created_at)}`
          : "Upload via Update Asset"}
      </p>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
      />
    </label>
  );
}

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="rounded-xl bg-slate-100 p-2 text-slate-600">{icon}</div>
      <div>
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <p className="text-sm text-slate-600">{description}</p>
      </div>
    </div>
  );
}

export default function PlantViewPage() {
  const router = useRouter();
  const params = useParams<{ assetId: string }>();
  const assetId = params.assetId;

  const supabase = useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    return createClient(supabaseUrl, supabaseAnonKey);
  }, []);

  const [asset, setAsset] = useState<PlantAsset | null>(null);
  const [replacementAsset, setReplacementAsset] = useState<PlantAsset | null>(
    null,
  );
  const [documents, setDocuments] = useState<PlantDocument[]>([]);
  const [services, setServices] = useState<ServiceHistory[]>([]);
  const [assetHistory, setAssetHistory] = useState<AssetHistory[]>([]);
  const [projectHistory, setProjectHistory] = useState<ProjectHistory[]>([]);
  const [prestartHistory, setPrestartHistory] = useState<PlantPrestart[]>([]);
  const [fleetJobs, setFleetJobs] = useState<FleetJob[]>([]);
  const [allLinkedFleetJobs, setAllLinkedFleetJobs] = useState<FleetJob[]>([]);
  const [fleetJobUpdates, setFleetJobUpdates] = useState<FleetJobUpdate[]>([]);
  const [showPlantSetup, setShowPlantSetup] = useState(false);
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(
    null,
  );
  const [expandedAssetHistoryId, setExpandedAssetHistoryId] = useState<
    string | null
  >(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [today] = useState(() => new Date());

  async function loadData() {
    setLoading(true);
    setErrorMessage("");

    const assetResult = await supabase
      .from("plant_assets")
      .select("*")
      .eq("id", assetId)
      .single<PlantAsset>();

    if (assetResult.error || !assetResult.data) {
      setAsset(null);
      setReplacementAsset(null);
      setDocuments([]);
      setServices([]);
      setAssetHistory([]);
      setProjectHistory([]);
      setPrestartHistory([]);
      setFleetJobs([]);
      setAllLinkedFleetJobs([]);
      setFleetJobUpdates([]);
      setErrorMessage(assetResult.error?.message || "Plant asset not found.");
      setLoading(false);
      return;
    }

    const loadedAsset = assetResult.data;
    setAsset(loadedAsset);

    const [
      docsResult,
      serviceResult,
      assetHistoryResult,
      projectHistoryResult,
      prestartResult,
    ] = await Promise.all([
      supabase
        .from("plant_asset_documents")
        .select("*")
        .eq("plant_asset_id", assetId)
        .order("created_at", { ascending: false })
        .returns<PlantDocument[]>(),
      supabase
        .from("plant_service_history")
        .select("*")
        .eq("plant_asset_id", assetId)
        .order("service_date", { ascending: false })
        .order("created_at", { ascending: false })
        .returns<ServiceHistory[]>(),
      supabase
        .from("asset_history")
        .select("*")
        .eq("plant_id", assetId)
        .order("history_date", { ascending: false })
        .order("created_at", { ascending: false })
        .returns<AssetHistory[]>(),
      supabase
        .from("plant_project_history")
        .select("*")
        .eq("plant_asset_id", assetId)
        .order("project_onboard_date", { ascending: false })
        .returns<ProjectHistory[]>(),
      supabase
        .from("vehicle_prestarts")
        .select("*")
        .eq("asset_type", "Plant")
        .eq("plant_asset_id", assetId)
        .order("prestart_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    if (optional(loadedAsset.superseded_by)) {
      const replacementResult = await supabase
        .from("plant_assets")
        .select("*")
        .eq("id", loadedAsset.superseded_by)
        .single<PlantAsset>();

      setReplacementAsset(
        replacementResult.error ? null : replacementResult.data ?? null,
      );
    } else {
      setReplacementAsset(null);
    }

    const docs = docsResult.error ? [] : docsResult.data ?? [];
    const serviceRows = serviceResult.error ? [] : serviceResult.data ?? [];
    const assetHistoryRows = assetHistoryResult.error
      ? []
      : assetHistoryResult.data ?? [];
    const projectRows = projectHistoryResult.error
      ? []
      : projectHistoryResult.data ?? [];
    const prestarts = prestartResult.error
      ? []
      : ((prestartResult.data ?? []) as PlantPrestart[]);

    const linkedFleetJobIds = prestarts
      .map((prestart) => prestart.fleet_job_id)
      .filter((id): id is string => Boolean(id));

    const linkedPrestartIds = prestarts
      .map((prestart) => prestart.id)
      .filter((id): id is string => Boolean(id));

    const [
      plantFleetJobsResult,
      linkedFleetJobsResult,
      sourceFleetJobsResult,
    ] = await Promise.all([
      supabase
        .from("fleet_jobs")
        .select(
          "id, job_number, title, description, priority, status, project, crew, reported_by, assigned_to, due_date, completed_date, created_at, updated_at",
        )
        .eq("plant_id", assetId)
        .order("created_at", { ascending: false })
        .returns<FleetJob[]>(),

      linkedFleetJobIds.length > 0
        ? supabase
            .from("fleet_jobs")
            .select(
              "id, job_number, title, description, priority, status, project, crew, reported_by, assigned_to, due_date, completed_date, created_at, updated_at",
            )
            .in("id", linkedFleetJobIds)
            .order("created_at", { ascending: false })
            .returns<FleetJob[]>()
        : Promise.resolve({ data: [], error: null }),

      linkedPrestartIds.length > 0
        ? supabase
            .from("fleet_jobs")
            .select(
              "id, job_number, title, description, priority, status, project, crew, reported_by, assigned_to, due_date, completed_date, created_at, updated_at",
            )
            .in("source_id", linkedPrestartIds)
            .order("created_at", { ascending: false })
            .returns<FleetJob[]>()
        : Promise.resolve({ data: [], error: null }),
    ]);

    const assetHistoryFleetJobIds = assetHistoryRows
      .map((record) => record.fleet_job_id)
      .filter((id): id is string => Boolean(id));

    const assetHistoryFleetJobsResult =
      assetHistoryFleetJobIds.length > 0
        ? await supabase
            .from("fleet_jobs")
            .select(
              "id, job_number, title, description, priority, status, project, crew, reported_by, assigned_to, due_date, completed_date, created_at, updated_at",
            )
            .in("id", assetHistoryFleetJobIds)
            .order("created_at", { ascending: false })
            .returns<FleetJob[]>()
        : { data: [], error: null };

    const uniqueFleetJobs = Array.from(
      new Map(
        [
          ...(plantFleetJobsResult.data ?? []),
          ...(linkedFleetJobsResult.data ?? []),
          ...(sourceFleetJobsResult.data ?? []),
          ...(assetHistoryFleetJobsResult.data ?? []),
        ].map((job) => [job.id, job]),
      ).values(),
    );

    const uniqueFleetJobIds = uniqueFleetJobs.map((job) => job.id);

    const fleetJobUpdatesResult =
      uniqueFleetJobIds.length > 0
        ? await supabase
            .from("fleet_job_updates")
            .select("id, fleet_job_id, update_type, status, comment, created_at")
            .in("fleet_job_id", uniqueFleetJobIds)
            .order("created_at", { ascending: false })
            .returns<FleetJobUpdate[]>()
        : { data: [], error: null };

    const updates = fleetJobUpdatesResult.error
      ? []
      : fleetJobUpdatesResult.data ?? [];

    setDocuments(docs);
    setServices(serviceRows);
    setAssetHistory(assetHistoryRows);
    setProjectHistory(projectRows);
    setPrestartHistory(prestarts);
    setAllLinkedFleetJobs(uniqueFleetJobs);
    setFleetJobUpdates(updates);
    setFleetJobs(
      uniqueFleetJobs.filter((job) =>
        isFleetJobActiveForPlant(job, assetHistoryRows, updates),
      ),
    );

    setLoading(false);
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  const status = asset ? getAssetStatus(asset) : "N/A";
  const title = plantTitle(asset);
  const latestService = services[0] ?? null;
  const latestPrestart = prestartHistory[0] ?? null;
  const currentCabHours =
    prestartHours(latestPrestart) ?? asset?.last_service_hours ?? null;
  const serviceIntervalHours =
    latestService?.next_service_interval_hours ??
    asset?.service_interval_hours ??
    250;
  const lastServiceHours =
    latestService?.hour_meter ?? asset?.last_service_hours ?? null;
  const nextServiceDueHours =
    asset?.next_service_hours ??
    (lastServiceHours !== null && lastServiceHours !== undefined
      ? Number(lastServiceHours) + Number(serviceIntervalHours)
      : null);
  const remainingHours =
    currentCabHours !== null &&
    currentCabHours !== undefined &&
    nextServiceDueHours !== null &&
    nextServiceDueHours !== undefined
      ? Number(nextServiceDueHours) - Number(currentCabHours)
      : null;
  const daysUntilService = asset?.next_service_due
    ? daysBetween(asset.next_service_due, today)
    : null;
  const hasServiceTrigger = Boolean(
    asset?.next_service_due ||
      (nextServiceDueHours !== null && nextServiceDueHours !== undefined),
  );
  const serviceOverdue =
    hasServiceTrigger &&
    ((remainingHours !== null && remainingHours <= 0) ||
      (daysUntilService !== null && daysUntilService <= 0));
  const serviceDueSoon =
    hasServiceTrigger &&
    !serviceOverdue &&
    ((remainingHours !== null && remainingHours <= 25) ||
      (daysUntilService !== null && daysUntilService <= 30));
  const serviceStatusLabel = !hasServiceTrigger
    ? "Not Set"
    : serviceOverdue
      ? "Overdue"
      : serviceDueSoon
        ? "Due Soon"
        : "Compliant";
  const serviceStatusTone: Tone = !hasServiceTrigger
    ? "slate"
    : serviceOverdue
      ? "rose"
      : serviceDueSoon
        ? "amber"
        : "emerald";

  const fleetJobById = useMemo(() => {
    return new Map(allLinkedFleetJobs.map((job) => [job.id, job]));
  }, [allLinkedFleetJobs]);

  const fleetJobUpdatesById = useMemo(() => {
    return fleetJobUpdates.reduce<Record<string, FleetJobUpdate[]>>(
      (accumulator, update) => {
        accumulator[update.fleet_job_id] = accumulator[update.fleet_job_id] || [];
        accumulator[update.fleet_job_id].push(update);
        return accumulator;
      },
      {},
    );
  }, [fleetJobUpdates]);

  const photoDocuments = documents.filter(
    (document) => clean(document.document_type).toLowerCase() === "photo",
  );
  const registerDocuments = documents.filter((document) => {
    const type = clean(document.document_type).toLowerCase();
    return type !== "photo" && !type.includes("service");
  });

  const riskAssessment = documents.find((document) =>
    clean(document.document_type).toLowerCase().includes("risk"),
  );
  const insuranceDocument = documents.find((document) =>
    clean(document.document_type).toLowerCase().includes("insurance"),
  );
  const operatorsManual = documents.find((document) => {
    const type = clean(document.document_type).toLowerCase();
    return type.includes("manual") || type.includes("operator");
  });
  const loadCharts = documents.find((document) => {
    const type = clean(document.document_type).toLowerCase();
    return type.includes("load chart") || type.includes("loadcharts");
  });
  const craneSafeDocument = documents.find((document) =>
    clean(document.document_type).toLowerCase().includes("cranesafe"),
  );

  const assetServiceRecords = assetHistory.filter(
    (record) => clean(record.history_type).toLowerCase() === "service",
  );
  const assetRepairRecords = assetHistory.filter(
    (record) => clean(record.history_type).toLowerCase() === "repair",
  );
  const assetModificationRecords = assetHistory.filter(
    (record) => clean(record.history_type).toLowerCase() === "modification",
  );

  const basicDetailItems = asset
    ? [
        { label: "Asset ID", value: clean(asset.asset_id) },
        { label: "Type", value: clean(asset.plant_type) },
        { label: "Make / Model", value: makeModel(asset) || "N/A" },
        { label: "Serial Number", value: clean(asset.serial_number) },
        ...(isTelehandler(asset)
          ? []
          : [{ label: "Registration", value: clean(asset.rego) }]),
        {
          label: "Status",
          value: <StatusBadge label={status} tone={getTone(status)} />,
        },
      ]
    : [];

  const allocationItems = asset
    ? [
        { label: "Project", value: clean(asset.project) },
        { label: "Crew", value: clean(asset.crew) },
        { label: "Ownership", value: asset.hired ? "Hired Plant" : "Owned" },
        {
          label: "Hired From",
          value: asset.hired ? clean(asset.hired_from) : "N/A",
        },
        {
          label: "Hire Term",
          value: asset.hired ? clean(asset.hire_term) : "N/A",
        },
        ...(status === "Off Hire"
          ? [{ label: "Off Hire Date", value: formatDate(asset.off_hire_date) }]
          : []),
        ...(status === "Superseded"
          ? [
              {
                label: "Superseded By",
                value: replacementAsset
                  ? `${clean(replacementAsset.asset_id)} ${makeModel(
                      replacementAsset,
                    )}`
                  : clean(asset.superseded_by),
              },
            ]
          : []),
      ]
    : [];

  async function setHeaderPhoto(document: PlantDocument) {
    if (!document.file_url) return;

    const { error } = await supabase
      .from("plant_assets")
      .update({
        header_photo_url: document.file_url,
        header_photo_document_id: document.id,
      })
      .eq("id", assetId);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setAsset((current) =>
      current
        ? {
            ...current,
            header_photo_url: document.file_url,
            header_photo_document_id: document.id,
          }
        : current,
    );
  }

  async function deleteAssetHistoryRecord(record: AssetHistory) {
    const confirmed = window.confirm(
      "Delete this asset history record? This should only be used for incorrect duplicate entries.",
    );

    if (!confirmed) return;

    setErrorMessage("");

    const { error } = await supabase
      .from("asset_history")
      .delete()
      .eq("id", record.id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await loadData();
    router.refresh();
  }

  function AssetHistoryCard({ record }: { record: AssetHistory }) {
    const isExpanded = expandedAssetHistoryId === record.id;
    const linkedFleetJob = record.fleet_job_id
      ? fleetJobById.get(record.fleet_job_id) || null
      : null;
    const linkedUpdates = record.fleet_job_id
      ? fleetJobUpdatesById[record.fleet_job_id] || []
      : [];
    const closeOutUpdate = latestCloseOutForJob(
      linkedUpdates,
      record.fleet_job_id,
    );
    const reopenUpdate = latestReopenForJob(linkedUpdates, record.fleet_job_id);
    const correctionSource = closeOutUpdate?.comment || record.description;
    const correctionRows = parseFaultCorrectionsFromComment(correctionSource);
    const closeOutComment =
      extractGeneralCloseOutComment(closeOutUpdate?.comment) ||
      extractGeneralCloseOutComment(record.description);
    const cleanHistoryDescription =
      extractGeneralCloseOutComment(record.description) ||
      stripFaultCorrectionJson(record.description);
    const linkedStatus =
      linkedFleetJob?.status || (record.fleet_job_id ? "Unknown" : null);
    const reopenedAfterCloseOut = Boolean(
      reopenUpdate?.created_at &&
        closeOutUpdate?.created_at &&
        new Date(reopenUpdate.created_at).getTime() >
          new Date(closeOutUpdate.created_at).getTime(),
    );
    const reopenedAfterAssetRecord = Boolean(
      reopenUpdate?.created_at &&
        record.created_at &&
        new Date(reopenUpdate.created_at).getTime() >
          new Date(record.created_at).getTime(),
    );
    const jobIsCurrentlyReopened = Boolean(
      reopenUpdate && !isFleetJobClosed(linkedFleetJob?.status),
    );
    const shouldShowReopened =
      reopenedAfterCloseOut || reopenedAfterAssetRecord || jobIsCurrentlyReopened;
    const liveStatusLabel = shouldShowReopened
      ? "Reopened"
      : linkedStatus || "Asset History";

    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-slate-950">
                {clean(record.title)}
              </p>
              <StatusBadge
                label={clean(record.history_type)}
                tone={historyTone(record.history_type)}
              />
              {record.fleet_job_id ? (
                <StatusBadge
                  label={`Fleet Job: ${liveStatusLabel}`}
                  tone={
                    shouldShowReopened
                      ? "amber"
                      : fleetJobStatusTone(linkedFleetJob?.status)
                  }
                />
              ) : null}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {formatDate(record.history_date || record.created_at)}
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setExpandedAssetHistoryId(isExpanded ? null : record.id)
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            {isExpanded ? "Hide Details" : "View Details"}
          </button>
        </div>

        {shouldShowReopened ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
            This linked fleet job has been reopened after this close-out record.
            Check the Fleet Job before treating this record as final.
          </div>
        ) : null}

        <p className="mt-3 line-clamp-2 text-sm text-slate-700">
          {clean(closeOutComment || cleanHistoryDescription || record.description)}
        </p>

        {correctionRows.length > 0 ? (
          <div className="mt-3 rounded-xl border border-emerald-100 bg-white p-3">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
              Fault Corrections
            </p>
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {correctionRows
                .slice(0, isExpanded ? correctionRows.length : 3)
                .map((row) => (
                  <li key={row.id} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span>
                      <span className="font-bold text-slate-950">
                        {row.fault}:
                      </span>{" "}
                      {row.correction || "No correction recorded."}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        {isExpanded ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <p>
                <span className="font-bold">Type:</span>{" "}
                {clean(record.history_type)}
              </p>
              <p>
                <span className="font-bold">Date:</span>{" "}
                {formatDate(record.history_date)}
              </p>
              <p>
                <span className="font-bold">Vendor:</span>{" "}
                {clean(record.vendor)}
              </p>
              <p>
                <span className="font-bold">Cost:</span>{" "}
                {formatMoney(record.cost)}
              </p>
              <p>
                <span className="font-bold">Cab Hours:</span>{" "}
                {record.engine_hours !== null &&
                record.engine_hours !== undefined
                  ? `${record.engine_hours.toLocaleString()} hrs`
                  : "N/A"}
              </p>
              <p>
                <span className="font-bold">Next Service Hours:</span>{" "}
                {record.next_service_due_hours !== null &&
                record.next_service_due_hours !== undefined
                  ? `${record.next_service_due_hours.toLocaleString()} hrs`
                  : "N/A"}
              </p>
            </div>

            {record.fleet_job_id ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-black text-slate-950">
                      Linked Fleet Job
                    </p>
                    <p className="mt-1 text-slate-600">
                      {clean(linkedFleetJob?.job_number)} ·{" "}
                      {clean(linkedFleetJob?.title)}
                    </p>
                  </div>
                  <StatusBadge
                    label={liveStatusLabel}
                    tone={
                      shouldShowReopened
                        ? "amber"
                        : fleetJobStatusTone(linkedFleetJob?.status)
                    }
                  />
                </div>
              </div>
            ) : null}

            {correctionRows.length > 0 ? (
              <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                  Correction Details
                </p>
                <div className="mt-3 space-y-3">
                  {correctionRows.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-xl border border-emerald-100 bg-white p-3 text-sm"
                    >
                      <p className="font-black text-slate-950">{row.fault}</p>
                      <p className="mt-1 text-slate-500">
                        Prestart: {row.prestart_comment || "N/A"}
                      </p>
                      <p className="mt-2 text-emerald-800">
                        <span className="font-bold">Correction:</span>{" "}
                        {row.correction || "No correction recorded."}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <p>
                <span className="font-bold">Close-out Comment:</span>{" "}
                {clean(closeOutComment)}
              </p>
              <p>
                <span className="font-bold">Asset History Description:</span>{" "}
                {clean(cleanHistoryDescription || record.description)}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {record.fleet_job_id ? (
                <Link
                  href={`/assets/fleet-jobs/${record.fleet_job_id}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <ExternalLink size={13} />
                  Open Fleet Job
                </Link>
              ) : null}

              {record.document_url ? (
                <a
                  href={record.document_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <ExternalLink size={13} />
                  Open Attachment
                </a>
              ) : null}

              <button
                type="button"
                onClick={() => void deleteAssetHistoryRecord(record)}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"
              >
                Delete Record
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function ServiceHistoryCard({ record }: { record: ServiceHistory }) {
    const isExpanded = expandedServiceId === record.id;

    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-950">
              {clean(record.service_type)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {formatDate(record.service_date)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setExpandedServiceId(isExpanded ? null : record.id)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            {isExpanded ? "Hide Details" : "View Details"}
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-700">
          {record.hour_meter !== null && record.hour_meter !== undefined
            ? `${record.hour_meter.toLocaleString()} hrs`
            : "No cab hours recorded"}{" "}
          · {clean(record.service_provider)}
        </p>

        {isExpanded ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <p>
                <span className="font-bold">Service Date:</span>{" "}
                {formatDate(record.service_date)}
              </p>
              <p>
                <span className="font-bold">Cab Hours:</span>{" "}
                {record.hour_meter !== null && record.hour_meter !== undefined
                  ? `${record.hour_meter.toLocaleString()} hrs`
                  : "N/A"}
              </p>
              <p>
                <span className="font-bold">Provider:</span>{" "}
                {clean(record.service_provider)}
              </p>
              <p>
                <span className="font-bold">Invoice:</span>{" "}
                {clean(record.invoice_number)}
              </p>
              <p>
                <span className="font-bold">Cost:</span>{" "}
                {formatMoney(record.invoice_cost)}
              </p>
              <p>
                <span className="font-bold">Interval:</span>{" "}
                {record.next_service_interval_hours !== null &&
                record.next_service_interval_hours !== undefined
                  ? `${record.next_service_interval_hours.toLocaleString()} hrs`
                  : "N/A"}
              </p>
            </div>

            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <p>
                <span className="font-bold">Work Completed:</span>{" "}
                {clean(record.work_completed)}
              </p>
              <p>
                <span className="font-bold">Defects / Recommendations:</span>{" "}
                {clean(record.defects_or_recommendations)}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {record.document_url ? (
                <a
                  href={record.document_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <ExternalLink size={13} />
                  Open Attachment
                </a>
              ) : (
                <span className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-400">
                  No attachment
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (loading) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Plant Asset"
          title="Loading plant asset..."
          description="Please wait while the plant asset record loads."
          actions={
            <ActionButton
              href="/assets/plant"
              variant="secondary"
              icon={<ArrowLeft size={16} />}
            >
              Back to Plant
            </ActionButton>
          }
        />
      </PageShell>
    );
  }

  if (!asset) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Plant Asset"
          title="Plant asset not found"
          description="This plant asset could not be found in the register."
          actions={
            <ActionButton
              href="/assets/plant"
              variant="secondary"
              icon={<ArrowLeft size={16} />}
            >
              Back to Plant
            </ActionButton>
          }
        />

        {errorMessage ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {errorMessage}
          </div>
        ) : null}
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Plant Asset"
        title={title}
        description="A clean plant profile showing compliance, cab hours, prestarts, fleet jobs, documents and history."
        actions={
          <>
            <ActionButton
              href="/assets/plant"
              variant="secondary"
              icon={<ArrowLeft size={16} />}
            >
              Back
            </ActionButton>

            <ActionButton
              href={`/assets/plant/${assetId}/edit`}
              variant="secondary"
              icon={<Pencil size={16} />}
            >
              Edit Details
            </ActionButton>

            <ActionButton href={`/assets/plant/${assetId}/update`} icon={<Wrench size={16} />}>
              Update Asset
            </ActionButton>
          </>
        }
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          {asset.header_photo_url ? (
            <img
              src={asset.header_photo_url}
              alt={title}
              className="h-32 w-full rounded-2xl border border-slate-200 object-cover shadow-sm md:w-48"
            />
          ) : (
            <div className="flex h-32 w-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-400 md:w-48">
              No Plant Photo
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-black text-slate-950">{title}</h2>
              <StatusBadge label={status} tone={getTone(status)} />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {clean(asset.plant_type)} · {clean(asset.project)} · Crew{" "}
              {clean(asset.crew)}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Header image can be selected from photos uploaded through Update
              Asset.
            </p>
          </div>
        </div>
      </section>

      {errorMessage ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {errorMessage}
        </div>
      ) : null}

      <section className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionHeader
            icon={<Calendar size={18} />}
            title="Asset Snapshot"
            description="Key plant dates, allocation and basic details at a glance."
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ImportantDateCard
              label="Insurance Expiry"
              value={formatDate(asset.insurance_expiry)}
              helper="Insurance renewal"
              tone={expiryTone(asset.insurance_expiry, today)}
            />

            {!isTelehandler(asset) ? (
              <ImportantDateCard
                label="Rego Expiry"
                value={formatDate(asset.rego_expiry)}
                helper="Registration renewal"
                tone={expiryTone(asset.rego_expiry, today)}
              />
            ) : null}

            {isCrane(asset) ? (
              <ImportantDateCard
                label="CraneSafe Expiry"
                value={formatDate(asset.cranesafe_expiry)}
                helper="CraneSafe / major inspection"
                tone={expiryTone(asset.cranesafe_expiry, today)}
              />
            ) : (
              <ImportantDateCard
                label="Next Inspection"
                value={formatDate(asset.next_inspection_due)}
                helper="Inspection due"
                tone={expiryTone(asset.next_inspection_due, today)}
              />
            )}

            <ImportantDateCard
              label="Last Service"
              value={formatDate(latestService?.service_date || asset.last_service_date)}
              helper="Most recent service"
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-4 text-sm font-black uppercase tracking-wide text-slate-500">
                Basic Details
              </h3>
              <DetailGrid items={basicDetailItems} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-4 text-sm font-black uppercase tracking-wide text-slate-500">
                Allocation / Hire
              </h3>
              <DetailGrid items={allocationItems} />
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              icon={<Wrench size={18} />}
              title="Service Status"
              description="Whichever service trigger is reached first: date or cab hours from prestarts."
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <ImportantDateCard
                label="Current Cab Hours"
                value={
                  currentCabHours !== null && currentCabHours !== undefined
                    ? `${Number(currentCabHours).toLocaleString()} hrs`
                    : "N/A"
                }
                helper={
                  latestPrestart
                    ? `Latest prestart: ${formatDate(
                        latestPrestart.prestart_date || latestPrestart.created_at,
                      )}`
                    : "No plant prestart hours recorded"
                }
              />

              <ImportantDateCard
                label="Next Service Hours"
                value={
                  nextServiceDueHours !== null &&
                  nextServiceDueHours !== undefined
                    ? `${Number(nextServiceDueHours).toLocaleString()} hrs`
                    : "N/A"
                }
                helper={
                  lastServiceHours !== null && lastServiceHours !== undefined
                    ? `Based on last service at ${Number(
                        lastServiceHours,
                      ).toLocaleString()} hrs`
                    : `Based on ${Number(serviceIntervalHours).toLocaleString()} hr interval`
                }
              />

              <ImportantDateCard
                label="Hours Remaining"
                value={
                  remainingHours !== null && remainingHours !== undefined
                    ? `${Number(remainingHours).toLocaleString()} hrs`
                    : "N/A"
                }
                helper="Based on latest plant prestart cab hours"
              />

              <ImportantDateCard
                label="Date Trigger"
                value={formatDate(asset.next_service_due)}
                helper={
                  daysUntilService !== null
                    ? `${daysUntilService.toLocaleString()} days remaining`
                    : "No next service date"
                }
                tone={expiryTone(asset.next_service_due, today)}
              />

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Service Status
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      Triggered by cab hours or date, whichever comes first.
                    </p>
                  </div>

                  <StatusBadge label={serviceStatusLabel} tone={serviceStatusTone} />
                </div>
              </div>

              <ImportantDateCard
                label="Service Interval"
                value={`${Number(serviceIntervalHours).toLocaleString()} hrs`}
                helper="Configured service interval"
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <button
              type="button"
              onClick={() => setShowPlantSetup((current) => !current)}
              className="flex w-full items-start justify-between gap-4 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-950">
                    Plant Setup & Compliance
                  </h2>
                  <p className="text-sm text-slate-600">
                    Required documents and onboard safety equipment.
                  </p>
                </div>
              </div>

              <span className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                {showPlantSetup ? "Hide" : "Show"}
              </span>
            </button>

            {showPlantSetup ? (
              <div className="mt-5 space-y-5">
                <div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Compliance Documents
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <DocumentSetupItem label="Risk Assessment" document={riskAssessment} />
                    <DocumentSetupItem label="Insurance" document={insuranceDocument} />
                    <DocumentSetupItem label="Operator Manual" document={operatorsManual} />
                    <DocumentSetupItem label="Load Charts" document={loadCharts} />
                    {isCrane(asset) ? (
                      <DocumentSetupItem label="CraneSafe" document={craneSafeDocument} />
                    ) : null}
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Safety Equipment
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <SetupItem
                      label="Fire Extinguisher"
                      value={asset.fire_extinguisher}
                      addedDate={formatDate(asset.created_at)}
                    />
                    <SetupItem
                      label="First Aid Kit"
                      value={asset.first_aid_kit}
                      addedDate={formatDate(asset.created_at)}
                    />
                    <SetupItem
                      label="Spill Kit"
                      value={asset.spill_kit}
                      addedDate={formatDate(asset.created_at)}
                    />
                    <SetupItem
                      label="Logbook"
                      value={asset.logbook}
                      addedDate={formatDate(asset.created_at)}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-bold text-slate-800">
                  Compliance checklist collapsed
                </p>
                <p className="mt-1">
                  Click Show to review plant documents and onboard equipment.
                </p>
              </div>
            )}
          </section>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              icon={<Wrench size={18} />}
              title="Active Fleet Jobs"
              description="Open maintenance, defect or fleet jobs linked to this plant asset."
            />

            {fleetJobs.length > 0 ? (
              <div className="space-y-3">
                {fleetJobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/assets/fleet-jobs/${job.id}`}
                    className="block rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-amber-300 hover:bg-amber-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-950">
                          {clean(job.job_number)} · {clean(job.title)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Created {formatDate(job.created_at)}
                        </p>
                      </div>

                      <StatusBadge label={clean(job.status)} tone={fleetJobStatusTone(job.status)} />
                    </div>

                    <p className="mt-3 text-sm text-slate-700">
                      {clean(job.description)}
                    </p>

                    <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                      <p>
                        <span className="font-bold">Priority:</span>{" "}
                        {clean(job.priority)}
                      </p>
                      <p>
                        <span className="font-bold">Due:</span>{" "}
                        {formatDate(job.due_date)}
                      </p>
                      <p>
                        <span className="font-bold">Assigned:</span>{" "}
                        {clean(job.assigned_to)}
                      </p>
                      <p>
                        <span className="font-bold">Reported By:</span>{" "}
                        {clean(job.reported_by)}
                      </p>
                    </div>

                    <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-amber-700">
                      Open Fleet Job
                      <ExternalLink size={13} />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyCard
                icon={<Wrench size={18} />}
                title="No active fleet jobs"
                description="Open plant fleet jobs, defects or maintenance requests will appear here."
              />
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              icon={<ClipboardCheck size={18} />}
              title="Recent Plant Prestarts"
              description="Showing the 3 most recent prestarts for this plant asset."
            />

            {prestartHistory.length > 0 ? (
              <div className="space-y-3">
                {prestartHistory.map((record) => (
                  <Link
                    key={record.id}
                    href={`/assets/prestarts/${record.id}`}
                    className="block rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-sky-300 hover:bg-sky-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-950">
                          {formatDate(record.prestart_date || record.created_at)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Inspected by{" "}
                          {clean(record.inspected_by_name || record.operator_name)}
                        </p>
                      </div>

                      <StatusBadge
                        label={clean(record.result)}
                        tone={
                          clean(record.severity).toLowerCase() === "critical" ||
                          clean(record.severity).toLowerCase() === "major"
                            ? "rose"
                            : clean(record.severity).toLowerCase() === "minor"
                              ? "amber"
                              : "emerald"
                        }
                      />
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                      <p>
                        <span className="font-bold">Cab Hours:</span>{" "}
                        {prestartHours(record) !== null &&
                        prestartHours(record) !== undefined
                          ? `${Number(prestartHours(record)).toLocaleString()} hrs`
                          : "N/A"}
                      </p>
                      <p>
                        <span className="font-bold">Severity:</span>{" "}
                        {clean(record.severity)}
                      </p>
                      <p>
                        <span className="font-bold">Project:</span>{" "}
                        {clean(record.project)}
                      </p>
                      <p>
                        <span className="font-bold">Crew:</span>{" "}
                        {clean(record.crew)}
                      </p>
                    </div>

                    {record.comments ? (
                      <p className="mt-3 text-sm text-slate-600">
                        {record.comments}
                      </p>
                    ) : null}

                    <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-sky-700">
                      Open Prestart
                      <ExternalLink size={13} />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyCard
                icon={<ClipboardCheck size={18} />}
                title="No plant prestarts yet"
                description="The 3 most recent plant prestarts will appear here once submitted."
              />
            )}
          </section>
        </div>

        <section className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              icon={<Wrench size={18} />}
              title="Service History"
              description="Service records from Update Asset and fleet job close-outs."
            />

            {services.length > 0 || assetServiceRecords.length > 0 ? (
              <div className="space-y-3">
                {services.map((record) => (
                  <ServiceHistoryCard key={record.id} record={record} />
                ))}

                {assetServiceRecords.map((record) => (
                  <AssetHistoryCard key={record.id} record={record} />
                ))}
              </div>
            ) : (
              <EmptyCard
                icon={<Wrench size={18} />}
                title="No services yet"
                description="Plant service records will appear here."
              />
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              icon={<Truck size={18} />}
              title="Repair History"
              description="Repairs recorded from fleet job close-outs."
            />

            {assetRepairRecords.length > 0 ? (
              <div className="space-y-3">
                {assetRepairRecords.map((record) => (
                  <AssetHistoryCard key={record.id} record={record} />
                ))}
              </div>
            ) : (
              <EmptyCard
                icon={<Truck size={18} />}
                title="No repairs yet"
                description="Repairs closed out from fleet jobs will appear here."
              />
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              icon={<ShieldCheck size={18} />}
              title="Modification / Addition History"
              description="Equipment added, upgrades and plant modifications."
            />

            {assetModificationRecords.length > 0 ? (
              <div className="space-y-3">
                {assetModificationRecords.map((record) => (
                  <AssetHistoryCard key={record.id} record={record} />
                ))}
              </div>
            ) : (
              <EmptyCard
                icon={<ShieldCheck size={18} />}
                title="No modifications yet"
                description="Plant modification records will appear here."
              />
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              icon={<Truck size={18} />}
              title="Project History"
              description="Project onboarding, offboarding and movement history."
            />

            {projectHistory.length > 0 ? (
              <div className="space-y-3">
                {projectHistory.map((record) => {
                  const isExpanded = expandedProjectId === record.id;

                  return (
                    <div
                      key={record.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-950">
                            {clean(record.project)}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Onboarded: {formatDate(record.project_onboard_date)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedProjectId(isExpanded ? null : record.id)
                          }
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                          {isExpanded ? "Hide Details" : "View Details"}
                        </button>
                      </div>

                      {isExpanded ? (
                        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <p>
                              <span className="font-bold">Project:</span>{" "}
                              {clean(record.project)}
                            </p>
                            <p>
                              <span className="font-bold">Crew:</span>{" "}
                              {clean(record.crew)}
                            </p>
                            <p>
                              <span className="font-bold">Onboarded:</span>{" "}
                              {formatDate(record.project_onboard_date)}
                            </p>
                            <p>
                              <span className="font-bold">Offboarded:</span>{" "}
                              {record.project_offboard_date
                                ? formatDate(record.project_offboard_date)
                                : "Current / Not recorded"}
                            </p>
                          </div>

                          <p className="mt-4">
                            <span className="font-bold">Notes:</span>{" "}
                            {clean(record.notes)}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyCard
                icon={<Truck size={18} />}
                title="No project history yet"
                description="Project transfer and onboarding history will appear here once recorded."
              />
            )}
          </section>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              icon={<ImageIcon size={18} />}
              title="Asset Photos"
              description="Photos uploaded through Update Asset. Select one as the header photo."
            />

            {photoDocuments.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {photoDocuments.map((photo) => {
                  const isHeader = asset.header_photo_document_id === photo.id;

                  return (
                    <div
                      key={photo.id}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                    >
                      <img
                        src={photo.file_url ?? ""}
                        alt={photo.file_name ?? "Plant photo"}
                        className="h-40 w-full object-cover"
                      />

                      <div className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-bold text-slate-900">
                            {clean(photo.file_name)}
                          </p>

                          {isHeader ? (
                            <StatusBadge label="Header" tone="emerald" />
                          ) : null}
                        </div>

                        <p className="mt-1 text-xs text-slate-500">
                          Uploaded {formatDate(photo.created_at)}
                        </p>

                        <button
                          type="button"
                          onClick={() => void setHeaderPhoto(photo)}
                          className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                          {isHeader ? "Current Header Photo" : "Set as Header Photo"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyCard
                icon={<ImageIcon size={18} />}
                title="No photos uploaded"
                description="Upload plant photos through Update Asset."
              />
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              icon={<FileText size={18} />}
              title="Documents"
              description="Risk assessment, insurance, manuals, load charts and other non-service files."
            />

            {registerDocuments.length > 0 ? (
              <div className="space-y-3">
                {registerDocuments.map((document) => (
                  <a
                    key={document.id}
                    href={document.file_url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-xl border border-slate-200 bg-slate-50 p-3 hover:bg-white"
                  >
                    <p className="text-sm font-bold text-slate-900">
                      {clean(document.document_type)}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {clean(document.file_name)}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      Uploaded {formatDate(document.created_at)}
                    </p>
                  </a>
                ))}
              </div>
            ) : (
              <EmptyCard
                icon={<FileText size={18} />}
                title="No documents uploaded"
                description="Non-service documents will appear here once attached."
              />
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
            <SectionHeader
              icon={<KeyRound size={18} />}
              title="Notes"
              description="General plant asset notes."
            />

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {clean(asset.notes)}
            </div>
          </section>
        </div>
      </section>
    </PageShell>
  );
}

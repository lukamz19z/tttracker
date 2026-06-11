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
  X,
  Trash2,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import {
  DetailGrid,
  PageHeader,
  PageShell,
  StatusBadge,
} from "../../components";

type Tone = "slate" | "blue" | "emerald" | "amber" | "rose" | "violet";
type AssetHistoryType = "Repair" | "Modification" | "Service";

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

type FleetJobUpdate = {
  id: string;
  fleet_job_id: string;
  update_type: string;
  status: string | null;
  comment: string;
  created_at: string | null;
};

type AssetHistoryRecord = {
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

type CloseOutForm = {
  history_type: AssetHistoryType;
  history_date: string;
  title: string;
  description: string;
  vendor: string;
  cost: string;
  odometer_km: string;
  engine_hours: string;
  next_service_due_date: string;
  next_service_due_km: string;
  next_service_due_hours: string;
  close_out_comments: string;
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

function dateTimeDisplay(value: string | null | undefined) {
  if (!value) return "N/A";

  return new Date(value).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
    return value
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean);
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

function appendJobNote(
  existingNotes: string | null,
  heading: string,
  body: string,
) {
  const entry = `[${timestampDisplay()}] ${heading}\n${body.trim()}`;
  return [existingNotes?.trim(), entry].filter(Boolean).join("\n\n");
}

function extractCloseOutComment(comment: string | null | undefined) {
  if (!comment) return "";

  return comment
    .replace(/\n?Asset history recorded as:[\s\S]*$/, "")
    .replace(/\n?Asset update record:[\s\S]*$/, "")
    .trim();
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
  const [updates, setUpdates] = useState<FleetJobUpdate[]>([]);
  const [assetHistoryRecord, setAssetHistoryRecord] =
    useState<AssetHistoryRecord | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [jobModeOverride, setJobModeOverride] = useState<
    "open" | "closed" | null
  >(null);

  const [status, setStatus] = useState("Open");
  const [priority, setPriority] = useState("Medium");
  const [vendor, setVendor] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [completedDate, setCompletedDate] = useState("");
  const [cost, setCost] = useState("");
  const [progressUpdate, setProgressUpdate] = useState("");

  const [showCloseOutModal, setShowCloseOutModal] = useState(false);
  const [closeOutForm, setCloseOutForm] = useState<CloseOutForm>({
    history_type: "Repair",
    history_date: todayDate(),
    title: "",
    description: "",
    vendor: "",
    cost: "",
    odometer_km: "",
    engine_hours: "",
    next_service_due_date: "",
    next_service_due_km: "",
    next_service_due_hours: "",
    close_out_comments: "",
  });

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
      setUpdates([]);
      setAssetHistoryRecord(null);
      setLoading(false);
      return;
    }

    const loadedJob = data as FleetJob;

    setJob(loadedJob);
    setStatus(loadedJob.status || "Open");
    setPriority(loadedJob.priority || "Medium");
    setVendor(loadedJob.vendor || "");
    setAssignedTo(loadedJob.assigned_to || "");
    setCompletedDate(loadedJob.completed_date || "");
    setCost(
      loadedJob.cost !== null && loadedJob.cost !== undefined
        ? String(loadedJob.cost)
        : "",
    );
    setProgressUpdate("");

    const resolvedVehicleId =
      loadedJob.vehicle_id || loadedJob.vehicle_asset_id;
    const resolvedPrestartId = loadedJob.prestart_id || loadedJob.source_id;

    const { data: updatesData, error: updatesError } = await supabase
      .from("fleet_job_updates")
      .select("*")
      .eq("fleet_job_id", loadedJob.id)
      .order("created_at", { ascending: false });

    if (updatesError) {
      console.error("Failed to load fleet job updates:", updatesError.message);
      setUpdates([]);
    } else {
      setUpdates((updatesData ?? []) as FleetJobUpdate[]);
    }

    const { data: assetHistoryRows, error: assetHistoryError } = await supabase
      .from("asset_history")
      .select("*")
      .eq("fleet_job_id", loadedJob.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (assetHistoryError) {
      console.error(
        "Failed to load linked asset history:",
        assetHistoryError.message,
      );
      setAssetHistoryRecord(null);
    } else {
      setAssetHistoryRecord(
        assetHistoryRows && assetHistoryRows.length > 0
          ? (assetHistoryRows[0] as AssetHistoryRecord)
          : null,
      );
    }

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

    setCloseOutForm((current) => ({
      ...current,
      history_date: loadedJob.completed_date || todayDate(),
      title: loadedJob.title || "",
      description: loadedJob.description || "",
      vendor: loadedJob.vendor || "",
      cost:
        loadedJob.cost !== null && loadedJob.cost !== undefined
          ? String(loadedJob.cost)
          : "",
      close_out_comments: "",
    }));

    setLoading(false);
  }, [jobId, supabase]);

  useEffect(() => {
    void loadJob();
  }, [loadJob]);

  const assetType =
    job?.asset_type === "Plant" || job?.plant_id ? "Plant" : "Vehicle";

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

  const latestCloseOutUpdate = useMemo(() => {
    return updates.find(
      (update) =>
        update.update_type === "Close Out" ||
        update.update_type === "Close Out Edited",
    );
  }, [updates]);

  const normalisedJobStatus = clean(job?.status).toLowerCase();
  const jobStatusIsClosed = [
    "completed",
    "closed",
    "complete",
    "resolved",
  ].includes(normalisedJobStatus);

  // This local override fixes the UI immediately after Close Out / Reopen.
  // Without it, React can render the old fetched job.status for a moment and leave
  // the Action Job form visible even though the close-out has just succeeded.
  const isClosed =
    jobModeOverride === "closed"
      ? true
      : jobModeOverride === "open"
        ? false
        : jobStatusIsClosed;

  const closedWithoutAssetHistory = isClosed && !assetHistoryRecord;

  const displayStatus = isClosed ? "Completed" : job?.status || "Open";

  const visibleUpdates = useMemo(() => {
    const progressUpdates = updates.filter(
      (update) =>
        update.update_type !== "Close Out" &&
        update.update_type !== "Close Out Edited",
    );

    if (!assetHistoryRecord || !latestCloseOutUpdate) {
      return progressUpdates;
    }

    return [latestCloseOutUpdate, ...progressUpdates];
  }, [updates, assetHistoryRecord, latestCloseOutUpdate]);

  async function saveProgressUpdate(nextStatus?: string) {
    if (!job) return;

    if (isClosed) {
      alert(
        "This fleet job is closed. Reopen it before adding progress updates.",
      );
      return;
    }

    const finalStatus = nextStatus || status;

    if (!progressUpdate.trim() && finalStatus === job.status) {
      alert("Add a progress update or change the job status before saving.");
      return;
    }

    setSaving(true);

    let finalNotes = job.notes || null;

    if (progressUpdate.trim()) {
      finalNotes = appendJobNote(finalNotes, "Progress Update", progressUpdate);

      const { error: progressError } = await supabase
        .from("fleet_job_updates")
        .insert({
          fleet_job_id: job.id,
          update_type: "Progress",
          status: finalStatus,
          comment: progressUpdate.trim(),
        });

      if (progressError) {
        console.error("Failed to save progress update:", progressError.message);
        alert(progressError.message);
        setSaving(false);
        return;
      }
    }

    const { error } = await supabase
      .from("fleet_jobs")
      .update({
        status: finalStatus,
        priority,
        vendor: vendor.trim() || null,
        assigned_to: assignedTo.trim() || null,
        completed_date: completedDate || null,
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

  async function completeAndRecordAssetHistory() {
    if (!job) return;

    if (!closeOutForm.history_type) {
      alert("Select whether this was a repair, modification or service.");
      return;
    }

    if (!closeOutForm.history_date) {
      alert("Completed date is required.");
      return;
    }

    if (!closeOutForm.title.trim()) {
      alert("Asset history title is required.");
      return;
    }

    if (!closeOutForm.description.trim()) {
      alert("Asset history description is required.");
      return;
    }

    if (!closeOutForm.close_out_comments.trim()) {
      alert(
        "Close-out comments are required before completing or closing this job.",
      );
      return;
    }

    setSaving(true);

    const closeOutComment = `${closeOutForm.close_out_comments.trim()}

Asset history recorded as: ${closeOutForm.history_type}
Asset update record: ${assetTitle}`;

    const finalNotes = appendJobNote(
      job.notes || null,
      "Close Out",
      closeOutComment,
    );

    const assetHistoryPayload = {
      asset_type: assetType,
      vehicle_id: assetType === "Vehicle" ? resolvedVehicleId : null,
      plant_id: assetType === "Plant" ? job.plant_id : null,
      fleet_job_id: job.id,

      history_type: closeOutForm.history_type,
      history_date: closeOutForm.history_date,

      title: closeOutForm.title.trim(),
      description: closeOutForm.description.trim(),
      vendor: closeOutForm.vendor.trim() || null,
      cost: numberOrNull(closeOutForm.cost),

      odometer_km: numberOrNull(closeOutForm.odometer_km),
      engine_hours: numberOrNull(closeOutForm.engine_hours),

      next_service_due_date:
        closeOutForm.history_type === "Service" &&
        closeOutForm.next_service_due_date
          ? closeOutForm.next_service_due_date
          : null,
      next_service_due_km:
        closeOutForm.history_type === "Service"
          ? numberOrNull(closeOutForm.next_service_due_km)
          : null,
      next_service_due_hours:
        closeOutForm.history_type === "Service"
          ? numberOrNull(closeOutForm.next_service_due_hours)
          : null,

      document_url: null,
    };

    const historyResult = assetHistoryRecord
      ? await supabase
          .from("asset_history")
          .update(assetHistoryPayload)
          .eq("id", assetHistoryRecord.id)
          .select("*")
          .limit(1)
      : await supabase
          .from("asset_history")
          .insert(assetHistoryPayload)
          .select("*")
          .limit(1);

    const historyError = historyResult.error;

    if (historyError) {
      console.error("Failed to save asset history:", historyError.message);
      alert(historyError.message);
      setSaving(false);
      return;
    }

    const savedAssetHistoryRows = (historyResult.data ??
      []) as AssetHistoryRecord[];
    const savedAssetHistory =
      savedAssetHistoryRows.length > 0 ? savedAssetHistoryRows[0] : null;

    if (savedAssetHistory) {
      setAssetHistoryRecord(savedAssetHistory);
    }

    const closeOutUpdateResult =
      assetHistoryRecord && latestCloseOutUpdate
        ? await supabase
            .from("fleet_job_updates")
            .update({
              update_type: "Close Out Edited",
              status: "Completed",
              comment: closeOutComment,
              created_at: new Date().toISOString(),
            })
            .eq("id", latestCloseOutUpdate.id)
        : await supabase.from("fleet_job_updates").insert({
            fleet_job_id: job.id,
            update_type: assetHistoryRecord ? "Close Out Edited" : "Close Out",
            status: "Completed",
            comment: closeOutComment,
          });

    if (closeOutUpdateResult.error) {
      console.error(
        "Failed to save close-out update:",
        closeOutUpdateResult.error.message,
      );
      alert(closeOutUpdateResult.error.message);
      setSaving(false);
      return;
    }

    const { data: closedJobRows, error: jobError } = await supabase
      .from("fleet_jobs")
      .update({
        status: "Completed",
        priority,
        vendor: closeOutForm.vendor.trim() || vendor.trim() || null,
        assigned_to: assignedTo.trim() || null,
        completed_date: closeOutForm.history_date,
        cost: numberOrNull(closeOutForm.cost),
        notes: finalNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .select("*")
      .limit(1);

    if (jobError) {
      console.error("Failed to close fleet job:", jobError.message);
      alert(jobError.message);
      setSaving(false);
      return;
    }

    setShowCloseOutModal(false);
    setJobModeOverride("closed");
    setStatus("Completed");
    setCompletedDate(closeOutForm.history_date);
    const closedJob =
      closedJobRows && closedJobRows.length > 0
        ? (closedJobRows[0] as FleetJob)
        : null;

    setJob(
      closedJob || {
        ...job,
        status: "Completed",
        completed_date: closeOutForm.history_date,
        vendor: closeOutForm.vendor.trim() || vendor.trim() || null,
        cost: numberOrNull(closeOutForm.cost),
        updated_at: new Date().toISOString(),
      },
    );
    await loadJob();
    setSaving(false);
  }

  function openCloseOutModalFromExisting() {
    setShowCloseOutModal(true);
    setCloseOutForm((current) => ({
      ...current,
      history_date:
        assetHistoryRecord?.history_date || job?.completed_date || todayDate(),
      history_type:
        (assetHistoryRecord?.history_type as AssetHistoryType) ||
        current.history_type,
      title: assetHistoryRecord?.title || job?.title || current.title,
      description:
        assetHistoryRecord?.description ||
        job?.description ||
        current.description,
      vendor: assetHistoryRecord?.vendor || job?.vendor || current.vendor,
      cost:
        assetHistoryRecord?.cost !== null &&
        assetHistoryRecord?.cost !== undefined
          ? String(assetHistoryRecord.cost)
          : current.cost,
      odometer_km:
        assetHistoryRecord?.odometer_km !== null &&
        assetHistoryRecord?.odometer_km !== undefined
          ? String(assetHistoryRecord.odometer_km)
          : current.odometer_km,
      engine_hours:
        assetHistoryRecord?.engine_hours !== null &&
        assetHistoryRecord?.engine_hours !== undefined
          ? String(assetHistoryRecord.engine_hours)
          : current.engine_hours,
      next_service_due_date:
        assetHistoryRecord?.next_service_due_date ||
        current.next_service_due_date,
      next_service_due_km:
        assetHistoryRecord?.next_service_due_km !== null &&
        assetHistoryRecord?.next_service_due_km !== undefined
          ? String(assetHistoryRecord.next_service_due_km)
          : current.next_service_due_km,
      next_service_due_hours:
        assetHistoryRecord?.next_service_due_hours !== null &&
        assetHistoryRecord?.next_service_due_hours !== undefined
          ? String(assetHistoryRecord.next_service_due_hours)
          : current.next_service_due_hours,
      close_out_comments: extractCloseOutComment(latestCloseOutUpdate?.comment),
    }));
  }

  async function deleteCloseOutComment() {
    if (!job || !latestCloseOutUpdate) return;

    const confirmed = window.confirm(
      "Delete the close-out comment from this fleet job? This will not delete the asset history record.",
    );

    if (!confirmed) return;

    setSaving(true);

    const { error } = await supabase
      .from("fleet_job_updates")
      .delete()
      .eq("id", latestCloseOutUpdate.id);

    if (error) {
      console.error("Failed to delete close-out comment:", error.message);
      alert(error.message);
      setSaving(false);
      return;
    }

    await loadJob();
    setSaving(false);
  }

  async function reopenJob() {
    if (!job) return;

    const confirmed = window.confirm(
      "Reopen this fleet job? This will let you add progress updates or complete it again if the asset history record was deleted or needs correction.",
    );

    if (!confirmed) return;

    setSaving(true);

    const { data: reopenedJobRows, error: updateError } = await supabase
      .from("fleet_jobs")
      .update({
        status: "Open",
        completed_date: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .select("*")
      .limit(1);

    if (updateError) {
      console.error("Failed to reopen fleet job:", updateError.message);
      alert(updateError.message);
      setSaving(false);
      return;
    }

    if (latestCloseOutUpdate) {
      const { error: deleteCloseOutError } = await supabase
        .from("fleet_job_updates")
        .delete()
        .eq("id", latestCloseOutUpdate.id);

      if (deleteCloseOutError) {
        console.error(
          "Fleet job reopened, but old close-out comment could not be deleted:",
          deleteCloseOutError.message,
        );
      }
    }

    const { error: noteError } = await supabase
      .from("fleet_job_updates")
      .insert({
        fleet_job_id: job.id,
        update_type: "Reopened",
        status: "Open",
        comment: assetHistoryRecord
          ? "Fleet job reopened for further action."
          : "Fleet job reopened because the linked asset history record is missing or was deleted.",
      });

    if (noteError) {
      console.error(
        "Fleet job reopened, but update note failed:",
        noteError.message,
      );
    }

    const reopenedJob: FleetJob =
      reopenedJobRows && reopenedJobRows.length > 0
        ? (reopenedJobRows[0] as FleetJob)
        : {
            ...job,
            status: "Open",
            completed_date: null,
            updated_at: new Date().toISOString(),
          };

    setJobModeOverride("open");
    setJob(reopenedJob);
    setStatus("Open");
    setPriority(job.priority || "Medium");
    setVendor(job.vendor || "");
    setAssignedTo(job.assigned_to || "");
    setCompletedDate(job.completed_date || "");
    setCost(
      job.cost !== null && job.cost !== undefined ? String(job.cost) : "",
    );
    setProgressUpdate("");
    setShowCloseOutModal(false);

    await loadJob();
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
        <SummaryCard
          label="Status"
          value={displayStatus}
          icon={<ClipboardList size={20} />}
          tone={toneForStatus(job.status)}
        />
        <SummaryCard
          label="Priority"
          value={job.priority || "Medium"}
          icon={<Wrench size={20} />}
          tone={toneForPriority(job.priority)}
        />
        <SummaryCard
          label="Completed Date"
          value={dateDisplay(job.completed_date)}
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

      <section className="grid gap-5 lg:grid-cols-[1.35fr_0.9fr]">
        <div className="space-y-5">
          {isClosed ? (
            <>
              <section className="border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
                      Closed Out
                    </p>
                    <h2 className="mt-2 text-xl font-black text-slate-950">
                      {job.job_number || "Fleet Job"} ·{" "}
                      {job.title || "Closed Fleet Job"}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-emerald-900">
                      This job has been closed out. The prestart issue details
                      are hidden so the page stays focused on the correction and
                      close-out record.
                    </p>
                  </div>

                  <StatusBadge label="Completed" tone="emerald" />
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MiniInfo
                    label="Completed"
                    value={dateDisplay(
                      job.completed_date || assetHistoryRecord?.history_date,
                    )}
                  />
                  <MiniInfo
                    label="Correction Type"
                    value={assetHistoryRecord?.history_type || "Close Out"}
                  />
                  <MiniInfo
                    label="Vendor / Mechanic"
                    value={job.vendor || assetHistoryRecord?.vendor || "N/A"}
                  />
                  <MiniInfo
                    label="Cost"
                    value={moneyDisplay(job.cost ?? assetHistoryRecord?.cost)}
                  />
                </div>

                {latestCloseOutUpdate ? (
                  <div className="mt-5 rounded-2xl border border-emerald-200 bg-white p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                      Close-out Comment
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {extractCloseOutComment(latestCloseOutUpdate.comment) ||
                        latestCloseOutUpdate.comment}
                    </p>
                  </div>
                ) : null}
              </section>

              <section className="border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                      <Truck size={18} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-950">
                        Asset Summary
                      </h2>
                      <p className="text-sm text-slate-600">{assetTitle}</p>
                    </div>
                  </div>

                  <Link
                    href={assetHref}
                    className="inline-flex min-h-10 items-center gap-2 border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <ExternalLink size={16} />
                    Open Asset
                  </Link>
                </div>

                <DetailGrid
                  items={[
                    { label: "Asset Type", value: assetType },
                    {
                      label:
                        assetType === "Vehicle" ? "Vehicle ID" : "Asset ID",
                      value:
                        assetType === "Vehicle"
                          ? vehicle?.vehicle_id || "N/A"
                          : plant?.asset_id || "N/A",
                    },
                    {
                      label: "Rego",
                      value:
                        assetType === "Vehicle"
                          ? vehicle?.vehicle_rego || "N/A"
                          : plant?.rego || "N/A",
                    },
                    {
                      label: "Make / Model",
                      value:
                        assetType === "Vehicle"
                          ? [vehicle?.make, vehicle?.model]
                              .map(clean)
                              .filter(Boolean)
                              .join(" ") || "N/A"
                          : [plant?.make, plant?.model]
                              .map(clean)
                              .filter(Boolean)
                              .join(" ") || "N/A",
                    },
                    {
                      label: "Project",
                      value:
                        job.project ||
                        vehicle?.project ||
                        plant?.project ||
                        "N/A",
                    },
                    {
                      label: "Crew",
                      value: job.crew || vehicle?.crew || plant?.crew || "N/A",
                    },
                    { label: "Reported By", value: job.reported_by || "N/A" },
                    { label: "Assigned To", value: job.assigned_to || "N/A" },
                  ]}
                />
              </section>
            </>
          ) : (
            <>
              <section className="border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">
                      Job Details
                    </h2>
                    <p className="text-sm text-slate-600">
                      Fleet job notification, source details and linked asset
                      context.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <StatusBadge
                      label={displayStatus}
                      tone={toneForStatus(displayStatus)}
                    />
                    <StatusBadge
                      label={job.priority || "Medium"}
                      tone={toneForPriority(job.priority)}
                    />
                  </div>
                </div>

                <DetailGrid
                  items={[
                    { label: "Job Number", value: job.job_number || "N/A" },
                    {
                      label: "Source",
                      value: job.source || job.source_type || "N/A",
                    },
                    { label: "Asset Type", value: assetType },
                    {
                      label: "Reported",
                      value: dateDisplay(job.reported_date),
                    },
                    { label: "Created", value: dateDisplay(job.created_at) },
                    { label: "Updated", value: dateDisplay(job.updated_at) },
                    {
                      label: "Project",
                      value:
                        job.project ||
                        vehicle?.project ||
                        plant?.project ||
                        "N/A",
                    },
                    {
                      label: "Crew",
                      value: job.crew || vehicle?.crew || plant?.crew || "N/A",
                    },
                    { label: "Reported By", value: job.reported_by || "N/A" },
                    { label: "Assigned To", value: job.assigned_to || "N/A" },
                    { label: "Vendor", value: job.vendor || "N/A" },
                    {
                      label: "Completed",
                      value: dateDisplay(job.completed_date),
                    },
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
                    <h2 className="text-lg font-bold text-slate-950">
                      Linked Asset
                    </h2>
                    <p className="text-sm text-slate-600">{assetTitle}</p>
                  </div>
                </div>

                {assetType === "Vehicle" ? (
                  <DetailGrid
                    items={[
                      {
                        label: "Vehicle ID",
                        value: vehicle?.vehicle_id || "N/A",
                      },
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
                      {
                        label: "Project",
                        value: vehicle?.project || job.project || "N/A",
                      },
                      {
                        label: "Crew",
                        value: vehicle?.crew || job.crew || "N/A",
                      },
                      { label: "Status", value: vehicle?.status || "N/A" },
                      { label: "Asset Label", value: job.asset_label || "N/A" },
                    ]}
                  />
                ) : (
                  <DetailGrid
                    items={[
                      { label: "Asset ID", value: plant?.asset_id || "N/A" },
                      { label: "Rego", value: plant?.rego || "N/A" },
                      {
                        label: "Plant Type",
                        value: plant?.plant_type || "N/A",
                      },
                      { label: "Serial", value: plant?.serial_number || "N/A" },
                      {
                        label: "Make / Model",
                        value:
                          [plant?.make, plant?.model]
                            .map(clean)
                            .filter(Boolean)
                            .join(" ") || "N/A",
                      },
                      {
                        label: "Project",
                        value: plant?.project || job.project || "N/A",
                      },
                      {
                        label: "Crew",
                        value: plant?.crew || job.crew || "N/A",
                      },
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
                      label={
                        prestart?.severity
                          ? prestart.severity.toUpperCase()
                          : "PRESTART"
                      }
                      tone={prestart?.severity === "major" ? "rose" : "amber"}
                    />
                  </div>
                </div>

                {resolvedPrestartId ? (
                  <div className="p-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <MiniInfo
                        label="Date"
                        value={dateDisplay(
                          prestart?.prestart_date || prestart?.created_at,
                        )}
                      />
                      <MiniInfo
                        label="Operator"
                        value={
                          prestart?.employee_name ||
                          prestart?.operator_name ||
                          job.reported_by ||
                          "N/A"
                        }
                      />
                      <MiniInfo
                        label="Asset"
                        value={
                          prestart?.asset_label || job.asset_label || assetTitle
                        }
                      />
                      <MiniInfo label="Source" value="Prestart" />
                    </div>

                    <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-rose-500">
                            Flagged Items
                          </p>
                          <p className="mt-1 text-sm text-rose-700">
                            Items marked as failed or requiring attention during
                            the prestart.
                          </p>
                        </div>

                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-rose-700 shadow-sm">
                          {failedItems.length} issue
                          {failedItems.length === 1 ? "" : "s"}
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
                          No checklist item list was found, but this job is
                          linked to a prestart.
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
            </>
          )}
        </div>

        <aside className="space-y-5">
          <section className="border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">
              {isClosed ? "Job Closed" : "Action Job"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {isClosed
                ? "This job is closed. Progress controls are locked; use the actions below to reopen or edit the close-out record."
                : "Track progress here while the job is active. Once closed, progress updates are locked so the job record stays clean."}
            </p>

            {isClosed ? (
              <div className="mt-5 space-y-4">
                <div
                  className={`rounded-xl border p-4 text-sm leading-6 ${
                    closedWithoutAssetHistory
                      ? "border-rose-200 bg-rose-50 text-rose-800"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800"
                  }`}
                >
                  <p className="font-black">
                    {closedWithoutAssetHistory
                      ? "Closed job is missing its asset history record"
                      : "This fleet job is closed"}
                  </p>
                  <p className="mt-1">
                    {closedWithoutAssetHistory
                      ? "The linked repair, modification or service record appears to have been deleted from the asset view page. Reopen this job to record the asset history again."
                      : "Progress updates are locked. Reopen the job if further work is required, or open the linked Fleet Job close-out record below."}
                  </p>
                </div>

                {assetHistoryRecord ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                      Linked Asset History
                    </p>
                    <p className="mt-2 font-black text-slate-950">
                      {assetHistoryRecord.history_type || "Asset History"} ·{" "}
                      {assetHistoryRecord.title || "Untitled record"}
                    </p>
                    <p className="mt-1 text-slate-600">
                      {dateDisplay(
                        assetHistoryRecord.history_date ||
                          assetHistoryRecord.created_at,
                      )}
                    </p>
                    <p className="mt-3 whitespace-pre-wrap">
                      {assetHistoryRecord.description ||
                        "No description recorded."}
                    </p>
                  </div>
                ) : null}

                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={() => void reopenJob()}
                    disabled={saving}
                    className="inline-flex min-h-11 items-center justify-center gap-2 border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Wrench size={16} />
                    )}
                    Reopen Job
                  </button>

                  <button
                    type="button"
                    onClick={openCloseOutModalFromExisting}
                    disabled={saving}
                    className="inline-flex min-h-11 items-center justify-center gap-2 bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Settings size={16} />
                    {assetHistoryRecord
                      ? "Edit Close-out Record"
                      : "Record Asset History Again"}
                  </button>

                  {latestCloseOutUpdate ? (
                    <button
                      type="button"
                      onClick={() => void deleteCloseOutComment()}
                      disabled={saving}
                      className="inline-flex min-h-11 items-center justify-center gap-2 border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 size={16} />
                      Delete Close-out Comment
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
                  Fleet Jobs are for notification and progress tracking. Closing
                  this job will create a repair, modification or service record
                  against the asset.
                </div>

                <div className="mt-5 grid gap-4">
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Status
                    <select
                      value={status}
                      onChange={(event) => setStatus(event.target.value)}
                      className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                    >
                      {statuses
                        .filter(
                          (item) => item !== "Completed" && item !== "Closed",
                        )
                        .map((item) => (
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
                    Completed Date
                    <input
                      type="date"
                      value={completedDate}
                      onChange={(event) => setCompletedDate(event.target.value)}
                      className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Cost Estimate / Cost
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
                      onChange={(event) =>
                        setProgressUpdate(event.target.value)
                      }
                      rows={4}
                      placeholder="Example: Booked with mechanic, parts ordered, waiting on workshop availability..."
                      className="border border-slate-300 bg-white px-3 py-3 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => void saveProgressUpdate()}
                    disabled={saving}
                    className="inline-flex min-h-11 items-center justify-center gap-2 bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Save size={16} />
                    )}
                    Save Progress Update
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowCloseOutModal(true)}
                    disabled={saving}
                    className="inline-flex min-h-11 items-center justify-center gap-2 border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCircle2 size={16} />
                    Complete / Close Out Job
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
              <CheckCircle2 size={20} />
              Job Updates
            </h2>

            <div className="mt-4 space-y-3 text-sm">
              <InfoRow label="Current Status" value={displayStatus} />
              <InfoRow
                label="Completed Date"
                value={dateDisplay(job.completed_date)}
              />
              <InfoRow label="Vendor" value={job.vendor || "N/A"} />
              <InfoRow label="Cost" value={moneyDisplay(job.cost)} />
              <InfoRow
                label="Last Updated"
                value={dateDisplay(job.updated_at)}
              />
            </div>

            {closedWithoutAssetHistory ? (
              <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                <p className="font-black">Asset history record missing</p>
                <p className="mt-1">
                  This job is marked as closed, but the linked asset history
                  record has been deleted or cannot be found. The stale
                  close-out entry is hidden below. Reopen the job or record the
                  asset history again.
                </p>
              </div>
            ) : null}

            <div className="mt-5 border-t border-slate-200 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Progress / Close-out History
              </p>

              {visibleUpdates.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {visibleUpdates.map((update) => (
                    <div
                      key={update.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-950">
                            {update.update_type}
                          </p>

                          {update.status ? (
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              Status: {update.status}
                            </p>
                          ) : null}
                        </div>

                        <p className="text-right text-xs font-semibold text-slate-500">
                          {dateTimeDisplay(update.created_at)}
                        </p>
                      </div>

                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {update.comment}
                      </p>

                      {update.id === latestCloseOutUpdate?.id ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={openCloseOutModalFromExisting}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            <Settings size={13} />
                            Edit Close-out Comment
                          </button>

                          <button
                            type="button"
                            onClick={() => void deleteCloseOutComment()}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 size={13} />
                            Delete Close-out Comment
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : job.notes ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {job.notes}
                </p>
              ) : (
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  No progress or close-out comments recorded.
                </p>
              )}
            </div>
          </section>
        </aside>
      </section>

      {showCloseOutModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Close Out Fleet Job
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  Record Asset History
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  This will close the fleet job and create a repair,
                  modification or service record against {assetTitle}.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowCloseOutModal(false)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                What was completed?
                <select
                  value={closeOutForm.history_type}
                  onChange={(event) =>
                    setCloseOutForm((current) => ({
                      ...current,
                      history_type: event.target.value as AssetHistoryType,
                    }))
                  }
                  className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                >
                  <option>Repair</option>
                  <option>Modification</option>
                  <option>Service</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Completed Date
                <input
                  type="date"
                  value={closeOutForm.history_date}
                  onChange={(event) =>
                    setCloseOutForm((current) => ({
                      ...current,
                      history_date: event.target.value,
                    }))
                  }
                  className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
                Asset History Title
                <input
                  value={closeOutForm.title}
                  onChange={(event) =>
                    setCloseOutForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Example: Replaced damaged tyre / Completed 10,000 km service / Installed UHF"
                  className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
                What was done?
                <textarea
                  value={closeOutForm.description}
                  onChange={(event) =>
                    setCloseOutForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="Detailed repair, service or modification notes to show in the asset history."
                  className="border border-slate-300 bg-white px-3 py-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Vendor / Mechanic
                <input
                  value={closeOutForm.vendor}
                  onChange={(event) =>
                    setCloseOutForm((current) => ({
                      ...current,
                      vendor: event.target.value,
                    }))
                  }
                  className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Cost
                <input
                  type="number"
                  value={closeOutForm.cost}
                  onChange={(event) =>
                    setCloseOutForm((current) => ({
                      ...current,
                      cost: event.target.value,
                    }))
                  }
                  className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Odometer KM
                <input
                  type="number"
                  value={closeOutForm.odometer_km}
                  onChange={(event) =>
                    setCloseOutForm((current) => ({
                      ...current,
                      odometer_km: event.target.value,
                    }))
                  }
                  className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Engine / Plant Hours
                <input
                  type="number"
                  value={closeOutForm.engine_hours}
                  onChange={(event) =>
                    setCloseOutForm((current) => ({
                      ...current,
                      engine_hours: event.target.value,
                    }))
                  }
                  className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                />
              </label>

              {closeOutForm.history_type === "Service" ? (
                <>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Next Service Due Date
                    <input
                      type="date"
                      value={closeOutForm.next_service_due_date}
                      onChange={(event) =>
                        setCloseOutForm((current) => ({
                          ...current,
                          next_service_due_date: event.target.value,
                        }))
                      }
                      className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Next Service Due KM
                    <input
                      type="number"
                      value={closeOutForm.next_service_due_km}
                      onChange={(event) =>
                        setCloseOutForm((current) => ({
                          ...current,
                          next_service_due_km: event.target.value,
                        }))
                      }
                      className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Next Service Due Hours
                    <input
                      type="number"
                      value={closeOutForm.next_service_due_hours}
                      onChange={(event) =>
                        setCloseOutForm((current) => ({
                          ...current,
                          next_service_due_hours: event.target.value,
                        }))
                      }
                      className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                    />
                  </label>
                </>
              ) : null}

              <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
                Close-out Comments
                <textarea
                  value={closeOutForm.close_out_comments}
                  onChange={(event) =>
                    setCloseOutForm((current) => ({
                      ...current,
                      close_out_comments: event.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="Required. Summarise what happened, who confirmed it, and any follow-up notes."
                  className="border border-slate-300 bg-white px-3 py-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                />
              </label>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-white p-5">
              <button
                type="button"
                onClick={() => setShowCloseOutModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void completeAndRecordAssetHistory()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                {assetHistoryRecord
                  ? "Save Close-out Changes"
                  : "Complete Job & Save Asset History"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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

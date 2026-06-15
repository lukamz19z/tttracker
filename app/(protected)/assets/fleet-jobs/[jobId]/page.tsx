/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
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

type FaultCorrection = {
  id: string;
  fault: string;
  prestart_comment: string;
  correction: string;
};

const statuses = ["Open", "In Progress", "Waiting Parts", "Booked", "Completed", "Closed"];
const priorities = ["Low", "Medium", "High", "Critical"];

const faultCorrectionJsonStart = "[[FAULT_CORRECTIONS_JSON_START]]";
const faultCorrectionJsonEnd = "[[FAULT_CORRECTIONS_JSON_END]]";

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

function getPrestartFlaggedItems(prestart: VehiclePrestart | null, job: FleetJob) {
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
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
  const comment = commentParts.join(" - ");

  return { label, comment };
}

function correctionRowId(value: string, index: number) {
  return `${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}`;
}

function buildFaultCorrectionsFromFailedItems(items: string[]): FaultCorrection[] {
  return items.map((item, index) => {
    const { label, comment } = formatIssueLabel(item);

    return {
      id: correctionRowId(label, index),
      fault: label,
      prestart_comment: comment || "No additional prestart comment provided.",
      correction: "",
    };
  });
}

function stripFaultCorrectionJson(value: string) {
  const startIndex = value.indexOf(faultCorrectionJsonStart);
  const endIndex = value.indexOf(faultCorrectionJsonEnd);

  if (startIndex === -1 || endIndex === -1) return value;

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
        id: row.id || correctionRowId(row.fault || `fault-${index}`, index),
        fault: clean(row.fault) || `Fault ${index + 1}`,
        prestart_comment:
          clean(row.prestart_comment) || "No additional prestart comment provided.",
        correction: clean(row.correction),
      }))
      .filter((row) => row.fault);
  } catch {
    return [];
  }
}

function buildFaultCorrectionText(corrections: FaultCorrection[]) {
  if (corrections.length === 0) return "";

  const readable = corrections
    .map(
      (row, index) =>
        `${index + 1}. ${row.fault}
Prestart comment: ${row.prestart_comment || "N/A"}
Mechanic correction: ${row.correction || "N/A"}`,
    )
    .join("\n\n");

  return `Fault Corrections:\n${readable}\n\n${faultCorrectionJsonStart}\n${JSON.stringify(
    corrections,
  )}\n${faultCorrectionJsonEnd}`;
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

  const withoutJson = stripFaultCorrectionJson(comment);

  return withoutJson
    .replace(/\n?Fault Corrections:[\s\S]*$/, "")
    .replace(/\n?Asset history recorded as:[\s\S]*$/, "")
    .replace(/\n?Asset update record:[\s\S]*$/, "")
    .trim();
}

function correctionProgress(corrections: FaultCorrection[]) {
  const total = corrections.length;
  const done = corrections.filter((row) => row.correction.trim()).length;
  return { done, total };
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
  const [showCloseOutModal, setShowCloseOutModal] = useState(false);
  const [showJobDetails, setShowJobDetails] = useState(false);

  const [status, setStatus] = useState("Open");
  const [priority, setPriority] = useState("Medium");
  const [vendor, setVendor] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [cost, setCost] = useState("");
  const [progressUpdate, setProgressUpdate] = useState("");
  const [faultCorrections, setFaultCorrections] = useState<FaultCorrection[]>([]);

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

  const failedItems = useMemo(
    () => (job ? getPrestartFlaggedItems(prestart, job) : []),
    [job, prestart],
  );

  const latestCloseOutUpdate = useMemo(() => {
    return updates.find(
      (update) =>
        update.update_type === "Close Out" ||
        update.update_type === "Close Out Edited",
    );
  }, [updates]);

  const latestFaultCorrectionUpdate = useMemo(() => {
    return updates.find((update) => update.update_type === "Fault Corrections");
  }, [updates]);

  const closeOutFaultCorrections = useMemo(
    () => parseFaultCorrectionsFromComment(latestCloseOutUpdate?.comment),
    [latestCloseOutUpdate],
  );

  const savedFaultCorrections = useMemo(() => {
    const fromDedicatedUpdate = parseFaultCorrectionsFromComment(
      latestFaultCorrectionUpdate?.comment,
    );

    if (fromDedicatedUpdate.length > 0) return fromDedicatedUpdate;
    if (closeOutFaultCorrections.length > 0) return closeOutFaultCorrections;

    return buildFaultCorrectionsFromFailedItems(failedItems);
  }, [latestFaultCorrectionUpdate, closeOutFaultCorrections, failedItems]);

  useEffect(() => {
    setFaultCorrections(savedFaultCorrections);
  }, [savedFaultCorrections]);

  const normalisedJobStatus = clean(job?.status).toLowerCase();
  const jobStatusIsClosed = [
    "completed",
    "closed",
    "complete",
    "resolved",
  ].includes(normalisedJobStatus);

  const hasValidCloseOut = Boolean(assetHistoryRecord) && Boolean(latestCloseOutUpdate);

  const isClosed =
    jobModeOverride === "closed"
      ? true
      : jobModeOverride === "open"
        ? false
        : jobStatusIsClosed || hasValidCloseOut;

  const closedWithoutAssetHistory =
    (jobStatusIsClosed || Boolean(latestCloseOutUpdate)) && !assetHistoryRecord;

  const displayStatus = isClosed ? "Completed" : job?.status || "Open";

  const reopenedUpdates = useMemo(
    () => updates.filter((update) => update.update_type === "Reopened"),
    [updates],
  );

  const jobTimelineItems = useMemo(() => {
    const items: Array<{
      label: string;
      date: string | null;
      detail: string;
      tone: Tone;
    }> = [
      {
        label: "Job Created",
        date: job?.created_at || job?.reported_date || null,
        detail: job?.reported_by
          ? `Raised by ${job.reported_by}`
          : "Fleet job raised",
        tone: "blue",
      },
    ];

    reopenedUpdates.forEach((update) => {
      items.push({
        label: "Job Reopened",
        date: update.created_at,
        detail: "Returned to active workflow",
        tone: "amber",
      });
    });

    if (isClosed || latestCloseOutUpdate || job?.completed_date) {
      items.push({
        label: "Job Closed",
        date:
          job?.completed_date ||
          assetHistoryRecord?.history_date ||
          latestCloseOutUpdate?.created_at ||
          null,
        detail: assetHistoryRecord?.history_type
          ? `${assetHistoryRecord.history_type} recorded`
          : "Close-out recorded",
        tone: "emerald",
      });
    }

    return items;
  }, [
    assetHistoryRecord?.history_date,
    assetHistoryRecord?.history_type,
    isClosed,
    job?.completed_date,
    job?.created_at,
    job?.reported_by,
    job?.reported_date,
    latestCloseOutUpdate,
    reopenedUpdates,
  ]);

  const progress = correctionProgress(faultCorrections);

  async function saveProgressUpdate(nextStatus?: string) {
    if (!job) return;

    if (isClosed) {
      alert("This fleet job is closed. Reopen it before adding progress updates.");
      return;
    }

    const finalStatus = nextStatus || status;

    const jobFieldsChanged =
      finalStatus !== job.status ||
      priority !== (job.priority || "Medium") ||
      vendor.trim() !== (job.vendor || "") ||
      assignedTo.trim() !== (job.assigned_to || "") ||
      cost !==
        (job.cost !== null && job.cost !== undefined ? String(job.cost) : "");

    if (!progressUpdate.trim() && !jobFieldsChanged) {
      alert("Add a progress note or change the job details before saving.");
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

  async function saveFaultCorrections() {
    if (!job) return;

    if (isClosed) {
      alert("This fleet job is closed. Reopen it before editing fault corrections.");
      return;
    }

    if (faultCorrections.length === 0) {
      alert("No flagged faults were found to correct.");
      return;
    }

    setSaving(true);

    const cleanedCorrections = faultCorrections.map((row) => ({
      ...row,
      correction: row.correction.trim(),
    }));

    const correctionText = buildFaultCorrectionText(cleanedCorrections);

    const payload = {
      update_type: "Fault Corrections",
      status,
      comment: correctionText,
      created_at: new Date().toISOString(),
    };

    const result = latestFaultCorrectionUpdate
      ? await supabase
          .from("fleet_job_updates")
          .update(payload)
          .eq("id", latestFaultCorrectionUpdate.id)
      : await supabase.from("fleet_job_updates").insert({
          fleet_job_id: job.id,
          ...payload,
        });

    if (result.error) {
      console.error("Failed to save fault corrections:", result.error.message);
      alert(result.error.message);
      setSaving(false);
      return;
    }

    const { error: jobError } = await supabase
      .from("fleet_jobs")
      .update({
        status,
        priority,
        vendor: vendor.trim() || null,
        assigned_to: assignedTo.trim() || null,
        cost: cost ? Number(cost) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (jobError) {
      console.error("Fault corrections saved, but job update failed:", jobError.message);
    }

    await loadJob();
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
      alert("Close-out comments are required before completing or closing this job.");
      return;
    }

    const missingCorrection = faultCorrections.find(
      (row) => !row.correction.trim(),
    );

    if (faultCorrections.length > 0 && missingCorrection) {
      alert(`Add the mechanic correction for: ${missingCorrection.fault}`);
      return;
    }

    setSaving(true);

    const cleanedCorrections = faultCorrections.map((row) => ({
      ...row,
      correction: row.correction.trim(),
    }));

    const correctionText = buildFaultCorrectionText(cleanedCorrections);

    const closeOutComment = [
      closeOutForm.close_out_comments.trim(),
      correctionText,
      `Asset history recorded as: ${closeOutForm.history_type}`,
      `Asset update record: ${assetTitle}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const finalNotes = appendJobNote(job.notes || null, "Close Out", closeOutComment);

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

    if (historyResult.error) {
      console.error("Failed to save asset history:", historyResult.error.message);
      alert(historyResult.error.message);
      setSaving(false);
      return;
    }

    const savedAssetHistoryRows = (historyResult.data ?? []) as AssetHistoryRecord[];
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
    const parsedCorrections = parseFaultCorrectionsFromComment(
      latestCloseOutUpdate?.comment,
    );

    setFaultCorrections(
      parsedCorrections.length > 0
        ? parsedCorrections
        : savedFaultCorrections,
    );

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
      vendor: assetHistoryRecord?.vendor || job?.vendor || vendor || current.vendor,
      cost:
        assetHistoryRecord?.cost !== null &&
        assetHistoryRecord?.cost !== undefined
          ? String(assetHistoryRecord.cost)
          : cost || current.cost,
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
      "Reopen this fleet job? The existing fault corrections will stay on the job so you can continue updating them.",
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
        comment:
          "Fleet job reopened. Existing fault corrections were retained for continued tracking.",
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
    setCost(job.cost !== null && job.cost !== undefined ? String(job.cost) : "");
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
          </>
        }
      />

      <section className="grid gap-5 lg:grid-cols-[1.35fr_0.85fr]">
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
                      This view is condensed because the job is closed. The
                      correction table below shows what was flagged and how it was
                      answered.
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

                <FaultCorrectionTable
                  corrections={closeOutFaultCorrections}
                  editable={false}
                  title="Fault Corrections"
                  description="Original prestart faults with the recorded mechanic response."
                />

                {latestCloseOutUpdate ? (
                  <div className="mt-5 rounded-2xl border border-emerald-200 bg-white p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                      General Close-out Comment
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {extractCloseOutComment(latestCloseOutUpdate.comment) ||
                        "No general close-out comment recorded."}
                    </p>
                  </div>
                ) : null}
              </section>

              <CondensedAssetCard
                assetTitle={assetTitle}
                assetType={assetType}
                assetHref={assetHref}
                job={job}
                vehicle={vehicle}
                plant={plant}
              />
            </>
          ) : (
            <>
              <section className="overflow-hidden border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setShowJobDetails((current) => !current)}
                  className="flex w-full items-start justify-between gap-4 p-5 text-left transition hover:bg-slate-50"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-950">
                        Job Details & Issues Raised
                      </h2>
                      <StatusBadge
                        label={displayStatus}
                        tone={toneForStatus(displayStatus)}
                      />
                      <StatusBadge
                        label={job.priority || "Medium"}
                        tone={toneForPriority(job.priority)}
                      />
                      {prestart?.severity ? (
                        <StatusBadge
                          label={prestart.severity.toUpperCase()}
                          tone={prestart.severity === "major" ? "rose" : "amber"}
                        />
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {showJobDetails
                        ? "Hide the job context, original description and prestart source details."
                        : "Collapsed to keep the correction workflow front and centre. Open this for the original issue details."}
                    </p>
                  </div>

                  <div className="mt-1 shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-500">
                    {showJobDetails ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </div>
                </button>

                {showJobDetails ? (
                  <div className="border-t border-slate-200 p-5">
                    <DetailGrid
                      items={[
                        { label: "Job Number", value: job.job_number || "N/A" },
                        { label: "Source", value: job.source || job.source_type || "N/A" },
                        { label: "Reported", value: dateDisplay(job.reported_date || job.created_at) },
                        { label: "Reported By", value: job.reported_by || "N/A" },
                        { label: "Project", value: job.project || vehicle?.project || plant?.project || "N/A" },
                        { label: "Crew", value: job.crew || vehicle?.crew || plant?.crew || "N/A" },
                        { label: "Assigned To", value: job.assigned_to || "N/A" },
                        { label: "Vendor", value: job.vendor || "N/A" },
                      ]}
                    />

                    <div className="mt-5 grid gap-4 border-t border-slate-200 pt-5 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Issue Description
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {job.description || "No description provided."}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Prestart Context
                        </p>
                        <div className="mt-2 grid gap-2 text-sm text-slate-700">
                          <InfoRow
                            label="Prestart Date"
                            value={dateDisplay(prestart?.prestart_date || prestart?.created_at)}
                          />
                          <InfoRow
                            label="Operator"
                            value={prestart?.employee_name || prestart?.operator_name || job.reported_by || "N/A"}
                          />
                          <InfoRow
                            label="Asset"
                            value={prestart?.asset_label || job.asset_label || assetTitle}
                          />
                        </div>
                        {resolvedPrestartId ? (
                          <Link
                            href={prestartHref}
                            className="mt-4 inline-flex min-h-10 items-center gap-2 border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            <ExternalLink size={16} />
                            Open Prestart
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">
                      Action & Fault Corrections
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                      Update ownership and reply directly to each fault. Corrections can be saved progressively, then the job can be closed once the outstanding items are resolved.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={displayStatus}
                      tone={toneForStatus(displayStatus)}
                    />
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-700">
                      {progress.done}/{progress.total} corrected
                    </span>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label className="grid gap-2 text-sm font-semibold text-slate-700">
                      Status
                      <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500"
                      >
                        {statuses
                          .filter((item) => item !== "Completed" && item !== "Closed")
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
                        placeholder="Responsible person"
                        className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                      />
                    </label>

                    <label className="grid gap-2 text-sm font-semibold text-slate-700">
                      Vendor / Mechanic
                      <input
                        value={vendor}
                        onChange={(event) => setVendor(event.target.value)}
                        placeholder="Workshop or mechanic"
                        className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                      />
                    </label>

                    <label className="grid gap-2 text-sm font-semibold text-slate-700">
                      Cost Estimate / Cost
                      <input
                        type="number"
                        value={cost}
                        onChange={(event) => setCost(event.target.value)}
                        placeholder="0.00"
                        className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                      />
                    </label>

                    <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2 xl:col-span-1">
                      Progress Note
                      <textarea
                        value={progressUpdate}
                        onChange={(event) => setProgressUpdate(event.target.value)}
                        rows={3}
                        placeholder="Optional. Example: Two items corrected, waiting on part..."
                        className="border border-slate-300 bg-white px-3 py-3 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                      />
                    </label>
                  </div>
                </div>

                <div className="mt-5">
                  <FaultCorrectionTable
                    corrections={faultCorrections}
                    editable
                    onChange={setFaultCorrections}
                    title="Fault Correction Table"
                    description="Reply against each original fault so the correction record is easy to review."
                  />
                </div>

                <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={() => void saveProgressUpdate()}
                    disabled={saving}
                    className="inline-flex min-h-11 items-center justify-center gap-2 bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save Job
                  </button>

                  <button
                    type="button"
                    onClick={() => void saveFaultCorrections()}
                    disabled={saving || faultCorrections.length === 0}
                    className="inline-flex min-h-11 items-center justify-center gap-2 border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Save size={16} />
                    Save Corrections
                  </button>

                  <button
                    type="button"
                    onClick={openCloseOutModalFromExisting}
                    disabled={saving}
                    className="inline-flex min-h-11 items-center justify-center gap-2 border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCircle2 size={16} />
                    Close Job
                  </button>
                </div>
              </section>

              <CondensedAssetCard
                assetTitle={assetTitle}
                assetType={assetType}
                assetHref={assetHref}
                job={job}
                vehicle={vehicle}
                plant={plant}
              />
            </>
          )}
        </div>

        <aside className="space-y-5">
          {isClosed ? (
            <section className="border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">Job Closed</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Progress controls are locked. Reopen only if further action is
                required, or edit the close-out record if the final correction
                details need adjustment.
              </p>

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
                      ? "The linked repair, modification or service record appears to have been deleted from the asset view page."
                      : "The correction table and close-out record are saved against this job."}
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
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Wrench size={16} />}
                    Reopen Job
                  </button>

                  <button
                    type="button"
                    onClick={openCloseOutModalFromExisting}
                    disabled={saving}
                    className="inline-flex min-h-11 items-center justify-center gap-2 bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Settings size={16} />
                    {assetHistoryRecord ? "Edit Close-out Record" : "Record Asset History Again"}
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
            </section>
          ) : null}

          <section className="border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
              <CheckCircle2 size={20} />
              Job Timeline
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Simple audit view showing when the job was created, reopened and
              closed.
            </p>

            <div className="mt-5 space-y-3">
              {jobTimelineItems.map((item) => (
                <div
                  key={`${item.label}-${item.date || "na"}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {item.detail}
                      </p>
                    </div>
                    <StatusBadge label={item.label.replace("Job ", "")} tone={item.tone} />
                  </div>
                  <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-400">
                    {dateTimeDisplay(item.date)}
                  </p>
                </div>
              ))}
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
                  Finalise Asset History
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Close-out uses the fault correction table and creates a repair,
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

              {faultCorrections.length > 0 ? (
                <section className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <FaultCorrectionTable
                    corrections={faultCorrections}
                    editable
                    onChange={setFaultCorrections}
                    title="Final Fault Corrections"
                    description="Every row must have a correction before the job can be closed."
                  />
                </section>
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
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {assetHistoryRecord ? "Save Close-out Changes" : "Complete Job & Save Asset History"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

function FaultCorrectionTable({
  corrections,
  editable,
  onChange,
  title,
  description,
}: {
  corrections: FaultCorrection[];
  editable: boolean;
  onChange?: React.Dispatch<React.SetStateAction<FaultCorrection[]>>;
  title: string;
  description: string;
}) {
  if (corrections.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No flagged fault rows were found for this job.
      </div>
    );
  }

  return (
    <div className={title ? "mt-5" : "mt-4"}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              {title}
            </p>
            {description ? (
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {description}
              </p>
            ) : null}
          </div>

          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700 shadow-sm">
            {corrections.length} fault{corrections.length === 1 ? "" : "s"}
          </span>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse bg-white text-sm">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50">
              <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                Flagged fault
              </th>
              <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                Prestart comment
              </th>
              <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                Mechanic correction
              </th>
              <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                Status
              </th>
            </tr>
          </thead>

          <tbody>
            {corrections.map((row, index) => (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="w-[24%] px-3 py-3 align-top font-bold text-slate-950">
                  {row.fault}
                </td>
                <td className="w-[28%] px-3 py-3 align-top text-slate-600">
                  {row.prestart_comment}
                </td>
                <td className="px-3 py-3 align-top">
                  {editable ? (
                    <textarea
                      value={row.correction}
                      onChange={(event) =>
                        onChange?.((current) =>
                          current.map((item, currentIndex) =>
                            currentIndex === index
                              ? { ...item, correction: event.target.value }
                              : item,
                          ),
                        )
                      }
                      rows={3}
                      placeholder="Example: Replaced globe and tested OK..."
                      className="w-full border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                    />
                  ) : (
                    <p className="whitespace-pre-wrap font-semibold text-emerald-800">
                      {row.correction || "No correction recorded."}
                    </p>
                  )}
                </td>
                <td className="w-[120px] px-3 py-3 align-top">
                  {row.correction.trim() ? (
                    <StatusBadge label="Corrected" tone="emerald" />
                  ) : (
                    <StatusBadge label="Open" tone="amber" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CondensedAssetCard({
  assetTitle,
  assetType,
  assetHref,
  job,
  vehicle,
  plant,
}: {
  assetTitle: string;
  assetType: "Vehicle" | "Plant";
  assetHref: string;
  job: FleetJob;
  vehicle: VehicleAsset | null;
  plant: PlantAsset | null;
}) {
  return (
    <section className="border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
            <Truck size={18} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-950">Linked Asset</h2>
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
            label: assetType === "Vehicle" ? "Vehicle ID" : "Asset ID",
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
            label: "Project",
            value: job.project || vehicle?.project || plant?.project || "N/A",
          },
          {
            label: "Crew",
            value: job.crew || vehicle?.crew || plant?.crew || "N/A",
          },
          { label: "Assigned To", value: job.assigned_to || "N/A" },
          { label: "Vendor", value: job.vendor || "N/A" },
          { label: "Updated", value: dateDisplay(job.updated_at) },
        ]}
      />
    </section>
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

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Loader2,
  MessageSquareWarning,
  Pencil,
  RotateCcw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase";
import {
  calculateHours,
  calculateLabourRows,
  calculateProgressTotals,
  type DelayCalculationRow,
  type LabourCalculationRow,
  type LegacyProgressCalculationRow,
  type SectionV2CalculationRow,
} from "@/lib/dockets/calculations";

type DocketRow = {
  id: string;
  project_id: string;
  tower_id: string;
  docket_date: string | null;
  crew: string | null;
  leading_hand: string | null;
  weather: string | null;
  rate_type: string | null;
  approval_status: string | null;
  approval_revision: number | null;
  progress_model: string | null;
  assembly_percent: number | null;
  erection_percent: number | null;
  raw_manhours: number | null;
  production_manhours: number | null;
  prestart_minutes: number | null;
  lunch_break_minutes: number | null;
  travel_in_minutes: number | null;
  travel_out_minutes: number | null;
  mobilisation_hours: number | null;
  mobilisation_notes: string | null;
  delays_comments: string | null;
  daily_site_summary: string | null;
  rfi_references: string[] | null;
  weather_delay_hours: number | null;
  lightning_delay_hours: number | null;
  toolbox_delay_hours: number | null;
  other_delay_hours: number | null;
  other_delay_reason: string | null;
  missing_items_bolts: string | null;
  incident_occurred: boolean | null;
  incident_type: string | null;
  incident_notes: string | null;
  bc_rep_name: string | null;
  bc_signature_data_url: string | null;
  bc_signed_at: string | null;
  bc_submitted_at: string | null;
  bc_approved_at: string | null;
  bc_approved_name: string | null;
  bc_approved_email: string | null;
  client_rep_name: string | null;
  client_approved_at: string | null;
  sharepoint_web_url: string | null;
  draft_sharepoint_web_url: string | null;
  final_sharepoint_web_url: string | null;
};

type ProjectRow = {
  id: string;
  name: string | null;
  project_number: string | null;
};

type TowerRow = {
  id: string;
  name: string | null;
  line: string | null;
};

type LabourRow = {
  id?: string;
  worker_name: string | null;
  time_in: string | null;
  time_out: string | null;
  total_hours: number | null;
  prestart_minutes: number | null;
  lunch_minutes: number | null;
  travel_in_minutes: number | null;
  travel_out_minutes: number | null;
  mobilisation_hours: number | null;
  delay_hours: number | null;
  delay_reason: string | null;
  production_hours: number | null;
};

type PlantRow = {
  id?: string;
  plant_name: string | null;
  plant_type: string | null;
  asset_number: string | null;
  time_in: string | null;
  time_out: string | null;
  total_hours: number | null;
  notes: string | null;
};

type DelayRow = {
  id?: string;
  delay_type: string | null;
  delay_reason: string | null;
  delay_hours: number | null;
  applies_to: string | null;
  worker_names: string[] | null;
  delay_applies_mode: string | null;
  plant_names: string[] | null;
};

type ProgressRow = {
  id?: string;
  tower_id?: string | null;
  progress_model?: string | null;
  section_code?: string | null;
  section_label?: string | null;
  assembled_qty?: number | null;
  erected_qty?: number | null;
  assembly_today?: number | null;
  assembly_overall?: number | null;
  erection_today?: number | null;
  erection_overall?: number | null;
  assembly_weight?: number | null;
  erection_weight?: number | null;
};

type MaterialItemRow = {
  id?: string;
  item_reference: string | null;
  item_description: string | null;
  quantity: number | string | null;
  unit: string | null;
  issue_key?: string | null;
  source_issue_key?: string | null;
  bundle_id?: string | null;
  bundle_no?: string | null;
  bundle_section?: string | null;
};

type MaterialPersonRow = {
  id?: string;
  employee_name?: string | null;
  worker_name?: string | null;
  employee_id?: string | null;
  hours?: number | null;
};

type MaterialPlantRow = {
  id?: string;
  plant_name?: string | null;
  asset_number?: string | null;
  hours?: number | null;
};

type MaterialEventRow = {
  id: string;
  transfer_id?: string | null;
  event_type: string | null;
  occurred_at: string | null;
  source_tower_id: string | null;
  destination_tower_id: string | null;
  destination_location: string | null;
  work_outcome: string | null;
  notes: string | null;
  items: MaterialItemRow[] | null;
  people: MaterialPersonRow[] | null;
  plant: MaterialPlantRow[] | null;
};

type BundleTransferRow = {
  id: string;
  transfer_no: number | null;
  source_tower_id: string;
  destination_tower_id: string;
  source_bundle_id: string;
  destination_bundle_id: string | null;
  bundle_no: string;
  bundle_section: string | null;
  quantity: number;
  status: string;
  transferred_at: string | null;
  received_at: string | null;
  notes: string | null;
};

type ClientApprovalContactRow = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  receives_approval: boolean;
  active: boolean;
};

type RevisionAllocationRow = {
  id: string;
  source_tower_id: string;
  target_tower_id: string;
  hours: number | null;
  worker_names: string[] | null;
  reason: string | null;
  allocation_type?: string | null;
  activity?: string | null;
};



type WorkflowEventRow = {
  id: string;
  event_type: string;
  revision: number | null;
  performed_by_name: string | null;
  performed_by_email: string | null;
  comments: string | null;
  metadata: {
    change_requests?: Array<{ category?: string; detail?: string }>;
    action_required_by?: string;
    [key: string]: unknown;
  } | null;
  created_at: string;
};

type ReviewResponse = {
  success?: boolean;
  status?: string;
  error?: string;
};

type ChangeCategory =
  | "Progress"
  | "Labour"
  | "Mobilisation / Travel"
  | "Delays"
  | "Materials"
  | "Safety"
  | "Commercial"
  | "Other";

type ChangeRequest = {
  category: ChangeCategory;
  detail: string;
};

type ClientContentKey =
  | "daily_site_summary"
  | "rfi_references"
  | "progress"
  | "workforce"
  | "raw_manhours"
  | "plant"
  | "mobilisation"
  | "travel"
  | "delays"
  | "missing_materials"
  | "received_materials"
  | "bundle_transfers"
  | "safety";

type ClientContentConfigRow = {
  content_key: string;
  included_by_default: boolean;
};

type ClientContentSnapshotRow = {
  content_key: string;
  included: boolean;
  revision: number;
};

const CLIENT_CONTENT_OPTIONS: Array<{
  key: ClientContentKey;
  label: string;
  description: string;
}> = [
  { key: "daily_site_summary", label: "Daily Site Summary", description: "Leading Hand summary of the day’s work and site conditions." },
  { key: "rfi_references", label: "RFI References", description: "RFI numbers referenced on the Daily Docket." },
  { key: "progress", label: "Progress", description: "Assembly and erection progress for every tower worked on the crew-day docket." },
  { key: "workforce", label: "Workforce", description: "Personnel names and recorded site hours." },
  { key: "raw_manhours", label: "Raw Manhours", description: "Client-facing total raw manhours." },
  { key: "plant", label: "Plant & Equipment", description: "Plant and equipment recorded against the docket." },
  { key: "mobilisation", label: "Mobilisation", description: "Mobilisation details and recorded crew involvement." },
  { key: "travel", label: "Travel", description: "Recorded travel-in and travel-out information." },
  { key: "delays", label: "Delays / Disruptions", description: "Recorded delay events and affected work." },
  { key: "missing_materials", label: "Missing Materials", description: "Missing steel, bolts, washers and other recorded material impacts." },
  { key: "received_materials", label: "Materials Received", description: "Found and received material records." },
  { key: "bundle_transfers", label: "Bundle Transfers", description: "Bundles taken from another tower and whether the source tower replacement is still outstanding." },
  { key: "safety", label: "Safety / Incidents", description: "Recorded safety and incident information." },
];

function isClientContentKey(value: string): value is ClientContentKey {
  return CLIENT_CONTENT_OPTIONS.some((option) => option.key === value);
}

type MobilisationReview = {
  included: boolean;
  fromTowerId: string;
  toTowerId: string;
  status: string;
  percentComplete: string;
  startedDate: string;
  targetMoveDate: string;
  completedDate: string;
  minutes: number;
  hours: number;
  workerNames: string[];
  notes: string;
};

const CHANGE_CATEGORIES: ChangeCategory[] = [
  "Progress",
  "Labour",
  "Mobilisation / Travel",
  "Delays",
  "Materials",
  "Safety",
  "Commercial",
  "Other",
];

function formatDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;

  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatHours(value: number | null | undefined) {
  return Number(value || 0).toFixed(2);
}

function formatMinutes(value: number | null | undefined) {
  const minutes = Number(value || 0);
  if (minutes <= 0) return "0 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function formatPercent(value: number | null | undefined) {
  return `${Math.round(Number(value || 0))}%`;
}

function titleCase(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusLabel(value: string | null) {
  switch (value) {
    case "submitted_bc":
      return "Pending BC Approval";
    case "bc_changes_requested":
    case "client_changes_requested":
      return "Changes Required";
    case "client_pending":
      return "Pending Client Approval";
    case "final":
    case "legacy_final":
      return "Approved";
    default:
      return "In Progress";
  }
}

function parseMobilisation(
  docket: DocketRow,
  labour: LabourRow[],
): MobilisationReview {
  const comments = docket.delays_comments || "";
  const line = comments
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("MOBILISATION|"));

  const values: Record<string, string> = {};

  if (line) {
    for (const piece of line.split("|").slice(1)) {
      const index = piece.indexOf("=");
      if (index === -1) continue;
      values[piece.slice(0, index)] = piece.slice(index + 1);
    }
  }

  const docketHours = Number(docket.mobilisation_hours || 0);
  const parsedMinutes = Number(values.minutes || 0);
  const parsedHours = Number(values.hours || 0);
  const labourHasMob = labour.some(
    (row) => Number(row.mobilisation_hours || 0) > 0,
  );

  const included =
    Boolean(line) ||
    docketHours > 0 ||
    labourHasMob ||
    Boolean((docket.mobilisation_notes || "").trim());

  const hours =
    parsedHours > 0
      ? parsedHours
      : parsedMinutes > 0
        ? parsedMinutes / 60
        : docketHours;

  const minutes =
    parsedMinutes > 0 ? parsedMinutes : Math.round(hours * 60);

  return {
    included,
    fromTowerId: values.from || "",
    toTowerId: values.to || "",
    status: values.status || "",
    percentComplete: values.progress || "",
    startedDate: values.started || "",
    targetMoveDate: values.target || "",
    completedDate: values.completed || "",
    minutes,
    hours,
    workerNames: values.workers
      ? values.workers
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean)
      : [],
    notes: values.notes || docket.mobilisation_notes || "",
  };
}

function generalComments(value: string | null) {
  return (value || "")
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("MOBILISATION|"))
    .join("\n")
    .trim();
}

function eventLabel(value: string | null) {
  switch (value) {
    case "missing":
      return "Missing Material";
    case "found_received":
      return "Found / Received";
    case "taken_from_another_tower":
      return "Taken From Another Tower";
    case "sent_to_another_tower":
      return "Sent To Another Tower";
    case "excess":
      return "Excess Material";
    case "damaged_incorrect":
      return "Damaged / Incorrect Material";
    default:
      return titleCase(value);
  }
}

function workOutcomeLabel(value: string | null) {
  switch (value) {
    case "stopped_work":
      return "Stopped work";
    case "slowed_down":
      return "Slowed down work";
    case "changed_sequence":
      return "Changed work sequence";
    case "minor_impact":
      return "Minor impact";
    default:
      return value ? titleCase(value) : "No impact recorded";
  }
}

function allocationManhours(row: RevisionAllocationRow) {
  const workers = Array.isArray(row.worker_names) ? row.worker_names.length : 0;
  return Number(row.hours || 0) * Math.max(workers, 1);
}

function calculateProgressForRows(rows: ProgressRow[]) {
  if (!rows.length) {
    return {
      assemblyPercent: 0,
      erectionPercent: 0,
      totalProgressPercent: 0,
      applicableWeight: 0,
    };
  }

  const model =
    rows.some((row) => row.progress_model === "section_v2") ||
    rows.some(
      (row) =>
        Boolean(row.section_code) &&
        (row.assembly_today !== undefined || row.erection_today !== undefined),
    )
      ? "section_v2"
      : "legacy";

  const hasBodyExtension =
    model !== "section_v2" ||
    rows.some((row) => String(row.section_code || "").toUpperCase() === "BE");

  return calculateProgressTotals({
    progressModel: model,
    sectionV2Rows: rows.map((row) => ({
      section_code: row.section_code || "",
      section_label: row.section_label || row.section_code || "Section",
      assembly_today:
        row.assembly_today !== undefined
          ? row.assembly_today
          : row.assembled_qty,
      erection_today:
        row.erection_today !== undefined
          ? row.erection_today
          : row.erected_qty,
      assembly_weight: row.assembly_weight,
      erection_weight: row.erection_weight,
    })) as SectionV2CalculationRow[],
    legacyRows: rows.map((row) => ({
      section_label: row.section_label || row.section_code || "Section",
      assembled_qty: row.assembled_qty,
      erected_qty: row.erected_qty,
    })) as LegacyProgressCalculationRow[],
    hasBodyExtension,
  });
}

type MissingStatus = {
  originalQty: number;
  deliveredQty: number;
  remainingQty: number;
  status: "Open" | "Partially Delivered" | "Resolved";
};

function buildMissingStatusMap(events: MaterialEventRow[]) {
  const receipts = new Map<string, number>();

  events
    .filter((event) => event.event_type === "found_received")
    .forEach((event) => {
      (event.items || []).forEach((item) => {
        const key = String(item.source_issue_key || "").trim();
        if (!key) return;
        receipts.set(
          key,
          (receipts.get(key) || 0) + Number(item.quantity || 0),
        );
      });
    });

  const statuses = new Map<string, MissingStatus>();

  events
    .filter((event) => event.event_type === "missing")
    .forEach((event) => {
      (event.items || []).forEach((item) => {
        const key = String(item.issue_key || "").trim();
        if (!key) return;

        const originalQty = Math.max(Number(item.quantity || 0), 0);
        const deliveredQty = Math.max(receipts.get(key) || 0, 0);
        const remainingQty = Math.max(originalQty - deliveredQty, 0);

        statuses.set(key, {
          originalQty,
          deliveredQty,
          remainingQty,
          status:
            remainingQty <= 0
              ? "Resolved"
              : deliveredQty > 0
                ? "Partially Delivered"
                : "Open",
        });
      });
    });

  return statuses;
}

function missingStatusClasses(status: MissingStatus["status"]) {
  if (status === "Resolved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "Partially Delivered") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-rose-200 bg-rose-50 text-rose-700";
}

type TransferReplacementStatus = {
  originalQty: number;
  deliveredQty: number;
  remainingQty: number;
  status: "Outstanding" | "Partially Replaced" | "Replaced";
};

function buildTransferReplacementStatusMap(events: MaterialEventRow[]) {
  const missingByTransfer = new Map<
    string,
    { issueKey: string; quantity: number }
  >();
  const receiptsByIssue = new Map<string, number>();

  events.forEach((event) => {
    const transferId = String(event.transfer_id || "").trim();
    if (!transferId) return;

    if (event.event_type === "missing") {
      (event.items || []).forEach((item) => {
        const issueKey = String(item.issue_key || "").trim();
        if (!issueKey) return;

        missingByTransfer.set(transferId, {
          issueKey,
          quantity: Math.max(Number(item.quantity || 0), 0),
        });
      });
    }

    if (event.event_type === "found_received") {
      (event.items || []).forEach((item) => {
        const sourceIssueKey = String(item.source_issue_key || "").trim();
        if (!sourceIssueKey) return;

        receiptsByIssue.set(
          sourceIssueKey,
          (receiptsByIssue.get(sourceIssueKey) || 0) +
            Math.max(Number(item.quantity || 0), 0),
        );
      });
    }
  });

  const result = new Map<string, TransferReplacementStatus>();

  missingByTransfer.forEach((missing, transferId) => {
    const deliveredQty = Math.max(
      receiptsByIssue.get(missing.issueKey) || 0,
      0,
    );
    const remainingQty = Math.max(missing.quantity - deliveredQty, 0);

    result.set(transferId, {
      originalQty: missing.quantity,
      deliveredQty,
      remainingQty,
      status:
        remainingQty <= 0
          ? "Replaced"
          : deliveredQty > 0
            ? "Partially Replaced"
            : "Outstanding",
    });
  });

  return result;
}

function plantDelayHours(
  plantRow: PlantRow,
  delays: DelayRow[],
) {
  const names = new Set(
    [
      plantRow.plant_name,
      plantRow.asset_number,
    ]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase()),
  );

  if (names.size === 0) return 0;

  return delays.reduce((sum, delay) => {
    if (delay.delay_applies_mode !== "labour_and_plant") return sum;

    const selected = (delay.plant_names || []).some((name) =>
      names.has(String(name || "").trim().toLowerCase()),
    );

    return selected ? sum + Number(delay.delay_hours || 0) : sum;
  }, 0);
}

function signatureApproxBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

export default function DailyDocketBcReviewPage() {
  const params = useParams<{
    projectId: string;
    towerId: string;
    docketId: string;
  }>();

  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const projectId = params?.projectId ?? "";
  const towerId = params?.towerId ?? "";
  const docketId = params?.docketId ?? "";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [tower, setTower] = useState<TowerRow | null>(null);
  const [projectTowers, setProjectTowers] = useState<TowerRow[]>([]);
  const [docket, setDocket] = useState<DocketRow | null>(null);
  const [labour, setLabour] = useState<LabourRow[]>([]);
  const [plant, setPlant] = useState<PlantRow[]>([]);
  const [delays, setDelays] = useState<DelayRow[]>([]);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [materialEvents, setMaterialEvents] = useState<MaterialEventRow[]>([]);
  const [hourAllocations, setHourAllocations] = useState<
    RevisionAllocationRow[]
  >([]);
  const [materialHistory, setMaterialHistory] = useState<MaterialEventRow[]>([]);
  const [bundleTransfers, setBundleTransfers] = useState<BundleTransferRow[]>([]);
  const [transferEvents, setTransferEvents] = useState<MaterialEventRow[]>([]);
  const [clientApprovalContacts, setClientApprovalContacts] =
    useState<ClientApprovalContactRow[]>([]);
  const [workflowEvents, setWorkflowEvents] = useState<WorkflowEventRow[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [savingChanges, setSavingChanges] = useState(false);
  const [reviewerMadeChanges, setReviewerMadeChanges] = useState(false);
  const [clientContentKeys, setClientContentKeys] = useState<ClientContentKey[]>([]);
  const [clientContentLoaded, setClientContentLoaded] = useState(false);

  const [reviewerName, setReviewerName] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [allowedReviewer, setAllowedReviewer] = useState(false);

  const [approvalComments, setApprovalComments] = useState("");
  const [changeDetails, setChangeDetails] = useState<
    Partial<Record<ChangeCategory, string>>
  >({});
  const [selectedChangeCategories, setSelectedChangeCategories] = useState<
    ChangeCategory[]
  >([]);

  const [reviewerSignature, setReviewerSignature] = useState("");
  const [submitting, setSubmitting] = useState<
    "approve" | "request_changes" | null
  >(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<
    "approved" | "changes_requested" | null
  >(null);

  useEffect(() => {
    if (!projectId || !towerId || !docketId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw new Error("You must be signed in to review this Daily Docket.");
        }

        const [
          projectRes,
          towerRes,
          projectTowersRes,
          docketRes,
          labourRes,
          plantRes,
          delayRes,
          progressRes,
          materialRes,
          materialHistoryRes,
          revisionRes,
          workflowRes,
          reviewerConfigRes,
          clientContentDefaultsRes,
          clientContentSnapshotRes,
          clientContactsRes,
          bundleTransfersRes,
        ] = await Promise.all([
          supabase
            .from("projects")
            .select("id, name, project_number")
            .eq("id", projectId)
            .single(),
          supabase
            .from("towers")
            .select("id, name, line")
            .eq("id", towerId)
            .eq("project_id", projectId)
            .single(),
          supabase
            .from("towers")
            .select("id, name, line")
            .eq("project_id", projectId)
            .order("name"),
          supabase
            .from("tower_daily_dockets")
            .select(`
              id,
              project_id,
              tower_id,
              docket_date,
              crew,
              leading_hand,
              weather,
              rate_type,
              approval_status,
              approval_revision,
              progress_model,
              assembly_percent,
              erection_percent,
              raw_manhours,
              production_manhours,
              prestart_minutes,
              lunch_break_minutes,
              travel_in_minutes,
              travel_out_minutes,
              mobilisation_hours,
              mobilisation_notes,
              delays_comments,
              daily_site_summary,
              rfi_references,
              weather_delay_hours,
              lightning_delay_hours,
              toolbox_delay_hours,
              other_delay_hours,
              other_delay_reason,
              missing_items_bolts,
              incident_occurred,
              incident_type,
              incident_notes,
              bc_rep_name,
              bc_signature_data_url,
              bc_signed_at,
              bc_submitted_at,
              bc_approved_at,
              bc_approved_name,
              bc_approved_email,
              client_rep_name,
              client_approved_at,
              sharepoint_web_url,
              draft_sharepoint_web_url,
              final_sharepoint_web_url
            `)
            .eq("id", docketId)
            .eq("project_id", projectId)
            .eq("tower_id", towerId)
            .single(),
          supabase
            .from("tower_docket_labour")
            .select(`
              id,
              worker_name,
              time_in,
              time_out,
              total_hours,
              prestart_minutes,
              lunch_minutes,
              travel_in_minutes,
              travel_out_minutes,
              mobilisation_hours,
              delay_hours,
              delay_reason,
              production_hours
            `)
            .eq("docket_id", docketId)
            .order("worker_name"),
          supabase
            .from("tower_docket_plant")
            .select(`
              id,
              plant_name,
              plant_type,
              asset_number,
              time_in,
              time_out,
              total_hours,
              notes
            `)
            .eq("docket_id", docketId),
          supabase
            .from("tower_docket_delays")
            .select(`
              id,
              delay_type,
              delay_reason,
              delay_hours,
              applies_to,
              worker_names,
              delay_applies_mode,
              plant_names
            `)
            .eq("docket_id", docketId),
          supabase
            .from("tower_docket_progress")
            .select(`
              id,
              tower_id,
              progress_model,
              section_code,
              section_label,
              assembled_qty,
              erected_qty,
              assembly_today,
              assembly_overall,
              erection_today,
              erection_overall,
              assembly_weight,
              erection_weight
            `)
            .eq("docket_id", docketId),
          supabase
            .from("tower_material_events")
            .select(`
              id,
              transfer_id,
              event_type,
              occurred_at,
              source_tower_id,
              destination_tower_id,
              destination_location,
              work_outcome,
              notes,
              items:tower_material_event_items(
                id,
                item_reference,
                item_description,
                quantity,
                unit,
                issue_key,
                source_issue_key,
                bundle_id,
                bundle_no,
                bundle_section
              ),
              people:tower_material_event_people(*),
              plant:tower_material_event_plant(*)
            `)
            .eq("docket_id", docketId)
            .order("occurred_at", { ascending: true }),
          supabase
            .from("tower_material_events")
            .select(`
              id,
              transfer_id,
              event_type,
              occurred_at,
              source_tower_id,
              destination_tower_id,
              destination_location,
              work_outcome,
              notes,
              items:tower_material_event_items(
                id,
                item_reference,
                item_description,
                quantity,
                unit,
                issue_key,
                source_issue_key,
                bundle_id,
                bundle_no,
                bundle_section
              ),
              people:tower_material_event_people(*),
              plant:tower_material_event_plant(*)
            `)
            .eq("tower_id", towerId)
            .order("occurred_at", { ascending: true }),
          supabase
            .from("tower_docket_hour_allocations")
            .select(`
              id,
              source_tower_id,
              target_tower_id,
              hours,
              worker_names,
              reason,
              allocation_type,
              activity
            `)
            .eq("docket_id", docketId)
            .order("created_at", { ascending: true }),
          supabase
            .from("tower_docket_workflow_events")
            .select(`
              id,
              event_type,
              revision,
              performed_by_name,
              performed_by_email,
              comments,
              metadata,
              created_at
            `)
            .eq("docket_id", docketId)
            .order("created_at", { ascending: false }),
          supabase
            .from("project_docket_approval_users")
            .select("user_id, receives_bc_review")
            .eq("project_id", projectId)
            .eq("user_id", user.id)
            .eq("receives_bc_review", true)
            .maybeSingle(),
          supabase
            .from("project_docket_client_content")
            .select("content_key, included_by_default")
            .eq("project_id", projectId),
          supabase
            .from("tower_docket_client_content")
            .select("content_key, included, revision")
            .eq("docket_id", docketId),
          supabase
            .from("project_docket_contacts")
            .select("id,name,email,company,receives_approval,active")
            .eq("project_id", projectId)
            .eq("active", true)
            .eq("receives_approval", true)
            .order("name"),
          supabase
            .from("tower_material_transfers")
            .select(`
              id,
              transfer_no,
              source_tower_id,
              destination_tower_id,
              source_bundle_id,
              destination_bundle_id,
              bundle_no,
              bundle_section,
              quantity,
              status,
              transferred_at,
              received_at,
              notes
            `)
            .eq("destination_docket_id", docketId)
            .order("transferred_at", { ascending: true }),
        ]);

        if (projectRes.error || !projectRes.data) {
          throw new Error("Project could not be loaded.");
        }

        if (towerRes.error || !towerRes.data) {
          throw new Error("Tower could not be loaded.");
        }

        if (docketRes.error || !docketRes.data) {
          throw new Error("Daily Docket could not be loaded.");
        }

        if (materialHistoryRes.error) {
          throw new Error(
            "Material receipt history could not be loaded for this tower.",
          );
        }

        if (revisionRes.error) {
          throw new Error(
            "Tower revision allocations could not be loaded. Run the tower_docket_hour_allocations SQL migration before reviewing this docket.",
          );
        }

        if (workflowRes.error) {
          throw new Error(
            "Daily Docket review history could not be loaded. Run the Daily Docket approval revision migration before reviewing this docket.",
          );
        }

        if (reviewerConfigRes.error) {
          throw new Error(
            "Your Daily Docket reviewer assignment could not be checked. Run the individual reviewer migration / self-read policy before reviewing this docket.",
          );
        }

        if (clientContentDefaultsRes.error || clientContentSnapshotRes.error) {
          throw new Error(
            "Client docket content settings could not be loaded. Run the Daily Docket client-content migration before reviewing this docket.",
          );
        }

        if (clientContactsRes.error) {
          throw new Error(
            "Client approval recipients could not be loaded for this project.",
          );
        }

        if (bundleTransfersRes.error) {
          throw new Error(
            "Bundle transfers could not be loaded for this Daily Docket.",
          );
        }

        const defaultClientKeys = (
          (clientContentDefaultsRes.data || []) as ClientContentConfigRow[]
        )
          .filter((row) => row.included_by_default && isClientContentKey(row.content_key))
          .map((row) => row.content_key as ClientContentKey);

        const resolvedApprovalRevision = Math.max(
          1,
          Number(
            (docketRes.data as { approval_revision?: number | null } | null)
              ?.approval_revision ?? 1,
          ) || 1,
        );

        const snapshotRows = (
          (clientContentSnapshotRes.data || []) as ClientContentSnapshotRow[]
        ).filter(
          (row) => Number(row.revision) === resolvedApprovalRevision,
        );

        const snapshotClientKeys = snapshotRows
          .filter((row) => row.included && isClientContentKey(row.content_key))
          .map((row) => row.content_key as ClientContentKey);

        const resolvedClientKeys =
          snapshotRows.length > 0 ? snapshotClientKeys : defaultClientKeys;

        const reviewerIsConfigured = Boolean(
          (
            reviewerConfigRes.data as
              | { user_id?: string | null; receives_bc_review?: boolean | null }
              | null
          )?.user_id,
        );

        const loadedBundleTransfers =
          (bundleTransfersRes.data || []) as BundleTransferRow[];

        let loadedTransferEvents: MaterialEventRow[] = [];
        const transferIds = loadedBundleTransfers
          .map((row) => row.id)
          .filter(Boolean);

        if (transferIds.length > 0) {
          const transferHistoryRes = await supabase
            .from("tower_material_events")
            .select(`
              id,
              transfer_id,
              event_type,
              occurred_at,
              source_tower_id,
              destination_tower_id,
              destination_location,
              work_outcome,
              notes,
              items:tower_material_event_items(
                id,
                item_reference,
                item_description,
                quantity,
                unit,
                issue_key,
                source_issue_key,
                bundle_id,
                bundle_no,
                bundle_section
              ),
              people:tower_material_event_people(*),
              plant:tower_material_event_plant(*)
            `)
            .in("transfer_id", transferIds)
            .in("event_type", ["missing", "found_received"])
            .order("occurred_at", { ascending: true });

          if (transferHistoryRes.error) {
            throw new Error(
              "Bundle transfer replacement history could not be loaded.",
            );
          }

          loadedTransferEvents =
            (transferHistoryRes.data || []) as MaterialEventRow[];
        }

        if (!cancelled) {
          setProject(projectRes.data as ProjectRow);
          setTower(towerRes.data as TowerRow);
          setProjectTowers((projectTowersRes.data || []) as TowerRow[]);
          setDocket(docketRes.data as DocketRow);
          setLabour((labourRes.data || []) as LabourRow[]);
          setPlant((plantRes.data || []) as PlantRow[]);
          setDelays((delayRes.data || []) as DelayRow[]);
          setProgress((progressRes.data || []) as ProgressRow[]);
          setMaterialEvents((materialRes.data || []) as MaterialEventRow[]);
          setMaterialHistory(
            (materialHistoryRes.data || []) as MaterialEventRow[],
          );
          setHourAllocations(
            (revisionRes.data || []) as RevisionAllocationRow[],
          );
          setWorkflowEvents(
            (workflowRes.data || []) as WorkflowEventRow[],
          );
          setClientContentKeys(resolvedClientKeys);
          setClientContentLoaded(true);
          setAllowedReviewer(reviewerIsConfigured);
          setClientApprovalContacts(
            (clientContactsRes.data || []) as ClientApprovalContactRow[],
          );
          setBundleTransfers(loadedBundleTransfers);
          setTransferEvents(loadedTransferEvents);
          setReviewerName(
            String(
              user.user_metadata?.full_name ||
                user.user_metadata?.name ||
                user.email ||
                "",
            ),
          );
          setReviewerEmail(user.email || "");
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Daily Docket review could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [docketId, projectId, supabase, towerId]);

  const towerName = tower?.name || "Tower";

  const towerNameById = useMemo(() => {
    return new Map(
      projectTowers.map((row) => [row.id, row.name || "Unnamed tower"]),
    );
  }, [projectTowers]);

  const revisionAllocations = useMemo(
    () =>
      hourAllocations.filter((row) => {
        const type = String(row.allocation_type || "").trim().toLowerCase();
        return !type || type === "revision";
      }),
    [hourAllocations],
  );

  const productionAllocations = useMemo(
    () =>
      hourAllocations.filter(
        (row) =>
          String(row.allocation_type || "").trim().toLowerCase() ===
          "production",
      ),
    [hourAllocations],
  );

  const progressByTower = useMemo(() => {
    const groups = new Map<
      string,
      Array<{ row: ProgressRow; index: number }>
    >();

    progress.forEach((row, index) => {
      const rowTowerId = row.tower_id || docket?.tower_id || towerId;
      const current = groups.get(rowTowerId) || [];
      current.push({ row, index });
      groups.set(rowTowerId, current);
    });

    if (docket?.tower_id && !groups.has(docket.tower_id)) {
      groups.set(docket.tower_id, []);
    }

    return groups;
  }, [docket?.tower_id, progress, towerId]);

  const workedTowerIds = useMemo(() => {
    const ids = new Set<string>();
    if (docket?.tower_id) ids.add(docket.tower_id);

    productionAllocations.forEach((row) => {
      if (row.target_tower_id) ids.add(row.target_tower_id);
    });

    progress.forEach((row) => {
      if (row.tower_id) ids.add(row.tower_id);
    });

    return Array.from(ids);
  }, [docket?.tower_id, productionAllocations, progress]);

  const totalProgress = Math.round(
    Number(docket?.assembly_percent || 0) * 0.5 +
      Number(docket?.erection_percent || 0) * 0.5,
  );

  const totalPrestartManhours = useMemo(
    () =>
      labour.reduce(
        (sum, row) => sum + Number(row.prestart_minutes || 0) / 60,
        0,
      ),
    [labour],
  );

  const missingStatusMap = useMemo(
    () => buildMissingStatusMap(materialHistory),
    [materialHistory],
  );

  const transferReplacementStatusMap = useMemo(
    () => buildTransferReplacementStatusMap(transferEvents),
    [transferEvents],
  );

  const totalDelayHours = delays.reduce(
    (sum, row) => sum + Number(row.delay_hours || 0),
    0,
  );

  const mobilisation = useMemo(
    () => (docket ? parseMobilisation(docket, labour) : null),
    [docket, labour],
  );

  const siteComments = useMemo(
    () => generalComments(docket?.delays_comments || null),
    [docket?.delays_comments],
  );

  const revisionManhours = useMemo(
    () =>
      revisionAllocations.reduce(
        (sum, row) => sum + allocationManhours(row),
        0,
      ),
    [revisionAllocations],
  );

  const productionAllocatedManhours = useMemo(
    () =>
      productionAllocations.reduce(
        (sum, row) => sum + allocationManhours(row),
        0,
      ),
    [productionAllocations],
  );

  const productionAllocationVariance = Math.abs(
    productionAllocatedManhours -
      Math.max(Number(docket?.production_manhours || 0) - revisionManhours, 0),
  );

  const currentRevision = Math.max(
    1,
    Number(docket?.approval_revision ?? 1) || 1,
  );

  const reviewActionable =
    docket?.approval_status === "submitted_bc" ||
    docket?.approval_status === "client_changes_requested";

  const clientChangeEvent = useMemo(
    () =>
      workflowEvents.find(
        (event) => event.event_type === "client_changes_requested",
      ) || null,
    [workflowEvents],
  );

  const previousReviewEvents = useMemo(
    () =>
      workflowEvents.filter((event) =>
        [
          "bc_changes_requested",
          "client_changes_requested",
          "bc_reviewer_corrected_docket",
          "bc_corrected_client_changes",
          "bc_resubmitted",
        ].includes(event.event_type),
      ),
    [workflowEvents],
  );

  const changeRequests = useMemo<ChangeRequest[]>(
    () =>
      selectedChangeCategories.map((category) => ({
        category,
        detail: (changeDetails[category] || "").trim(),
      })),
    [changeDetails, selectedChangeCategories],
  );

  function toggleChangeCategory(category: ChangeCategory) {
    setSelectedChangeCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
    setSubmitError(null);
  }

  function toggleClientContent(key: ClientContentKey) {
    setClientContentKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
    setSubmitError(null);
  }

  async function saveReviewerChanges() {
    if (!docket || !allowedReviewer || !reviewActionable) return;

    setSavingChanges(true);
    setSubmitError(null);

    try {
      const labourWithRawHours = labour.map((row) => ({
        ...row,
        total_hours:
          calculateHours(row.time_in, row.time_out) ||
          String(row.total_hours || 0),
      }));

      const recalculatedLabour = calculateLabourRows(
        labourWithRawHours as unknown as LabourCalculationRow[],
        delays as unknown as DelayCalculationRow[],
        {
          enabled: Boolean(mobilisation?.included),
          durationMinutes: Number(mobilisation?.hours || 0) * 60,
          workerNames: mobilisation?.workerNames || [],
        },
      );

      const recalculatedRawManhours = recalculatedLabour.reduce(
        (sum, row) => sum + Number(row.total_hours || 0),
        0,
      );
      const recalculatedProductionManhours = recalculatedLabour.reduce(
        (sum, row) => sum + Number(row.production_hours || 0),
        0,
      );

      const docketUpdate = {
        crew: docket.crew,
        leading_hand: docket.leading_hand,
        weather: docket.weather,
        rate_type: docket.rate_type,
        raw_manhours: recalculatedRawManhours,
        production_manhours: recalculatedProductionManhours,
        incident_occurred: docket.incident_occurred,
        incident_type: docket.incident_type,
        incident_notes: docket.incident_notes,
        delays_comments: docket.delays_comments,
        daily_site_summary: docket.daily_site_summary,
        rfi_references: docket.rfi_references,
        missing_items_bolts: docket.missing_items_bolts,
      };

      const { error: docketError } = await supabase
        .from("tower_daily_dockets")
        .update(docketUpdate)
        .eq("id", docket.id);

      if (docketError) throw docketError;

      for (const row of progress) {
        if (!row.id) continue;
        const { error } = await supabase
          .from("tower_docket_progress")
          .update({
            assembly_today: row.assembly_today,
            assembly_overall: row.assembly_overall,
            erection_today: row.erection_today,
            erection_overall: row.erection_overall,
            assembled_qty: row.assembled_qty,
            erected_qty: row.erected_qty,
          })
          .eq("id", row.id)
          .eq("docket_id", docket.id);
        if (error) throw error;
      }

      for (const [index, row] of labour.entries()) {
        if (!row.id) continue;
        const recalculated = recalculatedLabour[index];
        const { error } = await supabase
          .from("tower_docket_labour")
          .update({
            time_in: row.time_in,
            time_out: row.time_out,
            total_hours: Number(recalculated?.total_hours || 0),
            prestart_minutes: row.prestart_minutes,
            lunch_minutes: row.lunch_minutes,
            travel_in_minutes: row.travel_in_minutes,
            travel_out_minutes: row.travel_out_minutes,
            mobilisation_hours: Number(recalculated?.mobilisation_hours || 0) / 60,
            delay_hours: Number(recalculated?.delay_hours || 0),
            delay_reason: recalculated?.delay_reason || null,
            production_hours: Number(recalculated?.production_hours || 0),
          })
          .eq("id", row.id)
          .eq("docket_id", docket.id);
        if (error) throw error;
      }

      setLabour(
        labour.map((row, index) => ({
          ...row,
          total_hours: Number(recalculatedLabour[index]?.total_hours || 0),
          mobilisation_hours:
            Number(recalculatedLabour[index]?.mobilisation_hours || 0) / 60,
          delay_hours: Number(recalculatedLabour[index]?.delay_hours || 0),
          delay_reason: recalculatedLabour[index]?.delay_reason || null,
          production_hours: Number(
            recalculatedLabour[index]?.production_hours || 0,
          ),
        })),
      );

      setDocket((current) =>
        current
          ? {
              ...current,
              raw_manhours: recalculatedRawManhours,
              production_manhours: recalculatedProductionManhours,
            }
          : current,
      );

      for (const row of delays) {
        if (!row.id) continue;
        const { error } = await supabase
          .from("tower_docket_delays")
          .update({
            delay_type: row.delay_type,
            delay_reason: row.delay_reason,
            delay_hours: row.delay_hours,
            applies_to: row.applies_to,
            worker_names: row.worker_names,
            delay_applies_mode: row.delay_applies_mode,
            plant_names: row.plant_names,
          })
          .eq("id", row.id)
          .eq("docket_id", docket.id);
        if (error) throw error;
      }

      setReviewerMadeChanges(true);
      setEditMode(false);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Reviewer changes could not be saved.",
      );
    } finally {
      setSavingChanges(false);
    }
  }

  async function submitReview(action: "approve" | "request_changes") {
    if (!docketId || !docket) return;

    if (!allowedReviewer) {
      setSubmitError("You are not configured as a BC reviewer for this project.");
      return;
    }

    if (!reviewActionable) {
      setSubmitError(
        "This Daily Docket is no longer awaiting action from a BC reviewer.",
      );
      return;
    }

    if (action === "approve") {
      if (clientApprovalContacts.length === 0) {
        setSubmitError(
          "No active client approval recipients are configured for this project.",
        );
        return;
      }

      if (!clientContentLoaded || clientContentKeys.length === 0) {
        setSubmitError(
          "Select at least one section to include in the client Daily Docket.",
        );
        return;
      }

      if (!reviewerSignature) {
        setSubmitError("Capture the BC reviewer signature before approving.");
        return;
      }

      if (signatureApproxBytes(reviewerSignature) > 400 * 1024) {
        setSubmitError("Reviewer signature is too large. Clear it and sign again.");
        return;
      }
    }

    if (action === "request_changes") {
      if (changeRequests.length === 0) {
        setSubmitError("Select at least one section that requires changes.");
        return;
      }

      const missingDetail = changeRequests.find((request) => !request.detail);
      if (missingDetail) {
        setSubmitError(
          `Enter the required change for ${missingDetail.category}.`,
        );
        return;
      }
    }

    const comments =
      action === "request_changes"
        ? changeRequests
            .map((request) => `${request.category}: ${request.detail}`)
            .join("\n")
        : approvalComments.trim();

    const confirmed = window.confirm(
      action === "approve"
        ? docket.approval_status === "client_changes_requested"
          ? "Approve the corrected Daily Docket as a new revision and resend it to the client?"
          : "Approve this Daily Docket, generate the draft PDF and send it to the client for approval?"
        : docket.approval_status === "client_changes_requested"
          ? "Send the client's requested changes back to the docket preparer?"
          : "Return this Daily Docket to the preparer with the selected changes?",
    );

    if (!confirmed) return;

    setSubmitting(action);
    setSubmitError(null);

    try {
      const response = await fetch(
        `/api/daily-dockets/${encodeURIComponent(docketId)}/bc-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            comments: comments || undefined,
            change_requests:
              action === "request_changes" ? changeRequests : undefined,
            reviewer_signature_data_url:
              action === "approve" ? reviewerSignature : undefined,
            reviewer_made_changes:
              action === "approve" ? reviewerMadeChanges : undefined,
            client_content_keys:
              action === "approve" ? clientContentKeys : undefined,
          }),
        },
      );

      const result = (await response.json().catch(() => null)) as
        | ReviewResponse
        | null;

      if (!response.ok) {
        throw new Error(
          result?.error || "The Daily Docket review could not be completed.",
        );
      }

      if (action === "approve") {
        setCompleted("approved");
        setDocket((prev) =>
          prev ? { ...prev, approval_status: "client_pending" } : prev,
        );
      } else {
        setCompleted("changes_requested");
        setDocket((prev) =>
          prev ? { ...prev, approval_status: "bc_changes_requested" } : prev,
        );
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "The Daily Docket review could not be completed.",
      );
    } finally {
      setSubmitting(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-700 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading Daily Docket review
          </div>
        </div>
      </main>
    );
  }

  if (loadError || !project || !tower || !docket) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">
            Review unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {loadError || "This Daily Docket could not be loaded."}
          </p>
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>
      </main>
    );
  }

  if (completed) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <p className="text-sm font-semibold text-slate-900">TTTracker</p>
            <p className="text-xs text-slate-500">Daily Docket Review</p>
          </div>

          <div className="px-6 py-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-7 w-7" />
            </div>

            <h1 className="mt-5 text-2xl font-bold text-slate-900">
              {completed === "approved"
                ? "Daily Docket approved"
                : "Changes requested"}
            </h1>

            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
              {completed === "approved"
                ? "The BC approval has been recorded. The draft Daily Docket has been published and the configured client contacts have been sent their approval link."
                : "The Daily Docket has been returned to the preparer with the requested changes."}
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(`/project/${projectId}/tower/${towerId}/dockets`)
              }
              className="mt-7 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Return to Daily Dockets
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() =>
                router.push(`/project/${projectId}/tower/${towerId}/dockets`)
              }
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              aria-label="Back to Daily Dockets"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Daily Docket Review
              </p>
              <h1 className="mt-1 text-2xl font-bold text-slate-950">
                {towerName} · {formatDate(docket.docket_date)}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {project.project_number ? `${project.project_number} · ` : ""}
                {project.name || "Project"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
              R{String(currentRevision).padStart(2, "0")}
            </span>
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              {statusLabel(docket.approval_status)}
            </span>
          </div>
        </div>
        {!allowedReviewer ? (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Review access not configured</p>
                <p className="mt-1">
                  Your TTTracker account has not been individually selected as a
                  BC Daily Docket reviewer for this project. An Administrator can
                  add you in Daily Docket Approval Settings.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {docket.approval_status === "client_changes_requested" ? (
          <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <MessageSquareWarning className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold text-red-950">
                    Client changes requested
                  </h2>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                    Action required by BC reviewer
                  </span>
                </div>
                <p className="mt-2 text-sm text-red-900">
                  {clientChangeEvent?.performed_by_name ||
                    clientChangeEvent?.performed_by_email ||
                    "Client representative"}
                  {" · "}
                  {formatDateTime(clientChangeEvent?.created_at || null)}
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-red-900">
                  {clientChangeEvent?.comments || "The client requested changes to this docket."}
                </p>
                <p className="mt-3 text-xs font-medium text-red-800">
                  Correct the docket here and approve the new revision, or return it to the preparer using Request Changes.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {previousReviewEvents.length ? (
          <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Previous Review History</h2>
            <div className="mt-4 space-y-3">
              {previousReviewEvents.slice(0, 6).map((event) => (
                <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">
                      {titleCase(event.event_type)}
                    </p>
                    <span className="text-xs text-slate-500">
                      R{String(Math.max(1, Number(event.revision || 1))).padStart(2, "0")} · {formatDateTime(event.created_at)}
                    </span>
                  </div>
                  {event.performed_by_name || event.performed_by_email ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {event.performed_by_name || event.performed_by_email}
                    </p>
                  ) : null}
                  {event.comments ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                      {event.comments}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-5">
                <p className="text-sm font-medium text-slate-500">
                  {project.project_number || "Project"}
                </p>
                <h1 className="mt-1 text-2xl font-bold text-slate-900">
                  {project.name || "Daily Docket"}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  {towerName} · {formatDate(docket.docket_date)}
                </p>
              </div>

              <div className="grid gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryBlock label="Crew" value={docket.crew || "—"} />
                <SummaryBlock
                  label="Leading Hand"
                  value={docket.leading_hand || "—"}
                />
                <SummaryBlock label="Weather" value={docket.weather || "—"} />
                <SummaryBlock
                  label="Rate Type"
                  value={
                    docket.rate_type === "schedule_of_rates"
                      ? "Schedule of Rates"
                      : "Tonnage Rate"
                  }
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Progress & Production Allocation
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    One crew-day docket can cover multiple towers. Production MH is
                    calculated once from labour and then attributed to the workfronts below.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  Internal BC review
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                <MetricCard
                  label="Primary Progress"
                  value={`${totalProgress}%`}
                />
                <MetricCard
                  label="Raw MH"
                  value={formatHours(docket.raw_manhours)}
                />
                <MetricCard
                  label="Production MH"
                  value={formatHours(docket.production_manhours)}
                  internal
                />
                <MetricCard
                  label="Prestart MH"
                  value={formatHours(totalPrestartManhours)}
                  internal
                />
                <MetricCard
                  label="Revision MH"
                  value={formatHours(revisionManhours)}
                  internal
                />
                <MetricCard
                  label="Towers Worked"
                  value={String(workedTowerIds.length)}
                />
                <MetricCard
                  label="Allocation"
                  value={
                    productionAllocationVariance <= 0.25
                      ? "Balanced"
                      : `${productionAllocationVariance.toFixed(2)} MH variance`
                  }
                  internal
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryBlockCompact
                  label="Prestart Default"
                  value={formatMinutes(docket.prestart_minutes)}
                />
                <SummaryBlockCompact
                  label="Lunch Default"
                  value={formatMinutes(docket.lunch_break_minutes)}
                />
                <SummaryBlockCompact
                  label="Travel In Default"
                  value={formatMinutes(docket.travel_in_minutes)}
                />
                <SummaryBlockCompact
                  label="Travel Out Default"
                  value={formatMinutes(docket.travel_out_minutes)}
                />
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Tower Work Split
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Production allocations exclude revision / rectification MH.
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      productionAllocationVariance <= 0.25
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                    }`}
                  >
                    {productionAllocatedManhours.toFixed(2)} MH allocated
                  </span>
                </div>

                {productionAllocations.length ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {productionAllocations.map((row) => {
                      const manhours = allocationManhours(row);
                      const workPool = Math.max(
                        Number(docket.production_manhours || 0) - revisionManhours,
                        0,
                      );
                      const share =
                        workPool > 0 ? (manhours / workPool) * 100 : 0;

                      return (
                        <div
                          key={row.id}
                          className="rounded-xl border border-blue-100 bg-blue-50/40 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900">
                                {towerNameById.get(row.target_tower_id) ||
                                  row.target_tower_id}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {titleCase(row.activity || "mixed")}
                                {row.target_tower_id === docket.tower_id
                                  ? " · Primary tower"
                                  : " · Additional tower"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-blue-900">
                                {manhours.toFixed(2)} MH
                              </p>
                              <p className="text-xs font-medium text-blue-700">
                                {share.toFixed(1)}%
                              </p>
                            </div>
                          </div>
                          {row.reason ? (
                            <p className="mt-3 text-sm text-slate-600">
                              {row.reason}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    No production allocation rows were saved. This is expected only
                    for legacy single-tower dockets created before the work-split update.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Progress by Tower Worked
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Progress is grouped by the actual tower stored on each progress row.
                </p>
              </div>

              <div className="mt-5 space-y-4">
                {workedTowerIds.map((workedTowerId) => {
                  const entries = progressByTower.get(workedTowerId) || [];
                  const rows = entries.map((entry) => entry.row);
                  const calculated = calculateProgressForRows(rows);
                  const allocation = productionAllocations.find(
                    (row) => row.target_tower_id === workedTowerId,
                  );
                  const allocatedMh = allocation
                    ? allocationManhours(allocation)
                    : 0;

                  return (
                    <div
                      key={workedTowerId}
                      className="overflow-hidden rounded-xl border border-slate-200"
                    >
                      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900">
                              {towerNameById.get(workedTowerId) || workedTowerId}
                            </p>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                              {workedTowerId === docket.tower_id
                                ? "Primary"
                                : "Additional"}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {allocation
                              ? `${titleCase(allocation.activity || "mixed")} · ${allocatedMh.toFixed(2)} production MH`
                              : "No production MH allocation stored"}
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <SummaryBlockCompact
                            label="Assembly"
                            value={formatPercent(calculated.assemblyPercent)}
                          />
                          <SummaryBlockCompact
                            label="Erection"
                            value={formatPercent(calculated.erectionPercent)}
                          />
                          <SummaryBlockCompact
                            label="Total"
                            value={formatPercent(calculated.totalProgressPercent)}
                          />
                        </div>
                      </div>

                      {entries.length ? (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-170 text-sm">
                            <thead className="bg-white text-slate-600">
                              <tr>
                                <th className="px-4 py-3 text-left font-semibold">
                                  Section
                                </th>
                                <th className="px-4 py-3 text-right font-semibold">
                                  Assembly Today
                                </th>
                                <th className="px-4 py-3 text-right font-semibold">
                                  Assembly Overall
                                </th>
                                <th className="px-4 py-3 text-right font-semibold">
                                  Erection Today
                                </th>
                                <th className="px-4 py-3 text-right font-semibold">
                                  Erection Overall
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {entries.map(({ row, index }) => {
                                const isV2 =
                                  row.progress_model === "section_v2" ||
                                  Boolean(row.section_code);
                                const assemblyToday = isV2
                                  ? Number(row.assembly_today || 0)
                                  : Number(row.assembled_qty || 0);
                                const erectionToday = isV2
                                  ? Number(row.erection_today || 0)
                                  : Number(row.erected_qty || 0);

                                return (
                                  <tr
                                    key={
                                      row.id ||
                                      `${workedTowerId}-${row.section_code}-${index}`
                                    }
                                    className="border-t border-slate-200"
                                  >
                                    <td className="px-4 py-3 font-medium text-slate-900">
                                      {row.section_label ||
                                        row.section_code ||
                                        `Section ${index + 1}`}
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-700">
                                      {editMode && isV2 ? (
                                        <PercentInput
                                          value={assemblyToday}
                                          onChange={(value) =>
                                            setProgress((current) =>
                                              current.map((item, itemIndex) =>
                                                itemIndex === index
                                                  ? {
                                                      ...item,
                                                      assembly_today: value,
                                                    }
                                                  : item,
                                              ),
                                            )
                                          }
                                        />
                                      ) : (
                                        formatPercent(assemblyToday)
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-700">
                                      {isV2
                                        ? formatPercent(row.assembly_overall)
                                        : "Legacy"}
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-700">
                                      {editMode && isV2 ? (
                                        <PercentInput
                                          value={erectionToday}
                                          onChange={(value) =>
                                            setProgress((current) =>
                                              current.map((item, itemIndex) =>
                                                itemIndex === index
                                                  ? {
                                                      ...item,
                                                      erection_today: value,
                                                    }
                                                  : item,
                                              ),
                                            )
                                          }
                                        />
                                      ) : (
                                        formatPercent(erectionToday)
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-700">
                                      {isV2
                                        ? formatPercent(row.erection_overall)
                                        : "Legacy"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="px-4 py-5 text-sm text-slate-500">
                          No progress rows were recorded for this workfront.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Labour
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Raw and internal production-hour calculation for each worker.
                  </p>
                </div>
                <span className="text-sm font-medium text-slate-500">
                  {labour.length} worker{labour.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-190 text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">
                        Worker
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Time
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Raw Hrs
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Prestart
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Lunch
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Travel
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Mob
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Delay
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Prod Hrs
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {labour.length ? (
                      labour.map((row, index) => (
                        <tr
                          key={row.id || `${row.worker_name}-${index}`}
                          className="border-t border-slate-200"
                        >
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {row.worker_name || "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {editMode ? (
                              <div className="flex items-center gap-1">
                                <TimeInput
                                  value={row.time_in || ""}
                                  onChange={(value) =>
                                    setLabour((current) =>
                                      current.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, time_in: value }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                                <span>-</span>
                                <TimeInput
                                  value={row.time_out || ""}
                                  onChange={(value) =>
                                    setLabour((current) =>
                                      current.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, time_out: value }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              </div>
                            ) : (
                              <>{row.time_in || "—"} - {row.time_out || "—"}</>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {formatHours(row.total_hours)}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {editMode ? (
                              <NumberInput
                                value={Number(row.prestart_minutes || 0)}
                                step={1}
                                onChange={(value) =>
                                  setLabour((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? { ...item, prestart_minutes: value }
                                        : item,
                                    ),
                                  )
                                }
                              />
                            ) : (
                              formatMinutes(row.prestart_minutes)
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {formatMinutes(row.lunch_minutes)}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {formatMinutes(
                              Number(row.travel_in_minutes || 0) +
                                Number(row.travel_out_minutes || 0),
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {formatHours(row.mobilisation_hours)}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {formatHours(row.delay_hours)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                            {formatHours(row.production_hours)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-4 py-5 text-center text-slate-500"
                        >
                          No labour rows recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-blue-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Mobilising / Demobilising
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    This section is always shown so the reviewer can confirm
                    whether mobilisation was included.
                  </p>
                </div>

                {mobilisation?.included ? (
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    Included
                  </span>
                ) : (
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    Not included
                  </span>
                )}
              </div>

              {!mobilisation?.included ? (
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="font-semibold text-slate-800">
                    No mobilisation or demobilisation recorded on this docket.
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    No production hours have been allocated to mobilisation from
                    the docket-level mobilisation section.
                  </p>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <SummaryBlockCompact
                      label="Moving From"
                      value={
                        towerNameById.get(mobilisation.fromTowerId) ||
                        "Project / laydown / other"
                      }
                    />
                    <SummaryBlockCompact
                      label="Moving To"
                      value={
                        towerNameById.get(mobilisation.toTowerId) ||
                        "Not specified"
                      }
                    />
                    <SummaryBlockCompact
                      label="Stage"
                      value={titleCase(mobilisation.status)}
                    />
                    <SummaryBlockCompact
                      label="Time Spent"
                      value={`${formatHours(mobilisation.hours)} hrs`}
                    />
                  </div>

                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                      Workers Included
                    </p>
                    {mobilisation.workerNames.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {mobilisation.workerNames.map((name) => (
                          <span
                            key={name}
                            className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm font-medium text-amber-800">
                        Legacy / crew-wide mobilisation record — individual
                        workers were not stored on this entry.
                      </p>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <SummaryBlockCompact
                      label="Started"
                      value={formatDate(
                        mobilisation.startedDate
                          ? mobilisation.startedDate
                          : null,
                      )}
                    />
                    <SummaryBlockCompact
                      label="Target Move"
                      value={formatDate(
                        mobilisation.targetMoveDate
                          ? mobilisation.targetMoveDate
                          : null,
                      )}
                    />
                    <SummaryBlockCompact
                      label="Completed"
                      value={formatDate(
                        mobilisation.completedDate
                          ? mobilisation.completedDate
                          : null,
                      )}
                    />
                  </div>

                  {mobilisation.notes ? (
                    <TextPanel label="Mobilisation Notes" value={mobilisation.notes} />
                  ) : null}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Tower Revision / Hour Reallocation
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Internal BC allocation of revision or rectification hours to
                    another tower.
                  </p>
                </div>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  Internal only
                </span>
              </div>

              {revisionAllocations.length ? (
                <div className="mt-5 space-y-3">
                  {revisionAllocations.map((row) => {
                    const workers = Array.isArray(row.worker_names)
                      ? row.worker_names
                      : [];
                    const manhours =
                      Number(row.hours || 0) * Math.max(1, workers.length);

                    return (
                      <div
                        key={row.id}
                        className="rounded-xl border border-amber-100 bg-amber-50/40 p-4"
                      >
                        <div className="grid gap-3 sm:grid-cols-3">
                          <SummaryBlockCompact
                            label="Tower"
                            value={
                              towerNameById.get(row.target_tower_id) ||
                              row.target_tower_id
                            }
                          />
                          <SummaryBlockCompact
                            label="Hours / Worker"
                            value={`${formatHours(row.hours)} hrs`}
                          />
                          <SummaryBlockCompact
                            label="Allocated MH"
                            value={`${manhours.toFixed(2)} MH`}
                          />
                        </div>

                        <div className="mt-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Workers
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-800">
                            {workers.length ? workers.join(", ") : "Not specified"}
                          </p>
                        </div>

                        {row.reason ? (
                          <p className="mt-3 text-sm text-slate-600">
                            {row.reason}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}

                  <div className="text-right text-sm font-semibold text-amber-900">
                    Total revision allocation: {revisionManhours.toFixed(2)} MH
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="font-semibold text-slate-800">
                    No tower revision or hour reallocation recorded.
                  </p>
                </div>
              )}
            </section>

            {docket.rate_type === "schedule_of_rates" ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Plant
                  </h2>
                  <span className="text-sm text-slate-500">
                    {plant.length} item{plant.length === 1 ? "" : "s"}
                  </span>
                </div>

                {plant.length ? (
                  <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-160 text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">
                            Plant
                          </th>
                          <th className="px-4 py-3 text-left font-semibold">
                            Asset
                          </th>
                          <th className="px-4 py-3 text-left font-semibold">
                            Time
                          </th>
                          <th className="px-4 py-3 text-right font-semibold">
                            Raw Hours
                          </th>
                          <th className="px-4 py-3 text-right font-semibold">
                            Delay Hrs
                          </th>
                          <th className="px-4 py-3 text-left font-semibold">
                            Notes
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {plant.map((row, index) => (
                          <tr
                            key={row.id || `${row.plant_name}-${index}`}
                            className="border-t border-slate-200"
                          >
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {row.plant_name || row.plant_type || "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {row.asset_number || "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {row.time_in || "—"} - {row.time_out || "—"}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-700">
                              {formatHours(row.total_hours)}
                            </td>
                            <td className="px-4 py-3 text-right text-amber-700">
                              {formatHours(plantDelayHours(row, delays))}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {row.notes || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">
                    No plant rows recorded.
                  </p>
                )}
              </section>
            ) : null}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  Delays
                </h2>
                <span className="text-sm font-medium text-slate-500">
                  {totalDelayHours.toFixed(2)} hrs recorded
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {delays.length ? (
                  delays.map((row, index) => (
                    <div
                      key={row.id || index}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {titleCase(row.delay_type || "Delay")}
                          </p>
                          {editMode ? (
                            <input
                              value={row.delay_reason || ""}
                              onChange={(event) =>
                                setDelays((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, delay_reason: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700"
                              placeholder="Delay reason"
                            />
                          ) : (
                            <p className="mt-1 text-sm text-slate-600">
                              {row.delay_reason || "No reason entered"}
                            </p>
                          )}

                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                            <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">
                              {row.applies_to === "selected_workers"
                                ? "Selected workers"
                                : "Entire crew"}
                            </span>
                            {row.worker_names?.length ? (
                              <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">
                                {row.worker_names.join(", ")}
                              </span>
                            ) : null}
                            {row.delay_applies_mode === "labour_and_plant" ? (
                              <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">
                                Labour + plant
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {editMode ? (
                          <NumberInput
                            value={Number(row.delay_hours || 0)}
                            step={0.25}
                            onChange={(value) =>
                              setDelays((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, delay_hours: value }
                                    : item,
                                ),
                              )
                            }
                          />
                        ) : (
                          <span className="shrink-0 text-sm font-semibold text-slate-700">
                            {formatHours(row.delay_hours)} hrs
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="font-semibold text-slate-800">
                      No delays recorded.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Materials
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Missing, excess, received, transferred and damaged material
                    events recorded on this docket.
                  </p>
                </div>
                <span className="text-sm text-slate-500">
                  {materialEvents.filter((event) => !event.transfer_id).length} event
                  {materialEvents.filter((event) => !event.transfer_id).length === 1 ? "" : "s"}
                </span>
              </div>

              {materialEvents.filter((event) => !event.transfer_id).length ? (
                <div className="mt-5 space-y-4">
                  {materialEvents
                    .filter((event) => !event.transfer_id)
                    .map((event) => (
                    <div
                      key={event.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {eventLabel(event.event_type)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {event.occurred_at
                              ? formatDateTime(event.occurred_at)
                              : "Time not recorded"}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                          {workOutcomeLabel(event.work_outcome)}
                        </span>
                      </div>

                      {event.items?.length ? (
                        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                          {event.items.map((item, index) => {
                            const issueKey =
                              item.issue_key || item.source_issue_key || "";
                            const status = issueKey
                              ? missingStatusMap.get(issueKey)
                              : undefined;

                            return (
                              <div
                                key={item.id || index}
                                className="border-t border-slate-100 px-3 py-3 first:border-t-0"
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-semibold text-slate-800">
                                        {item.item_reference || item.bundle_no || "Material item"}
                                      </p>
                                      {status ? (
                                        <span
                                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${missingStatusClasses(
                                            status.status,
                                          )}`}
                                        >
                                          {status.status}
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {[
                                        item.bundle_no
                                          ? `Bundle ${item.bundle_no}${
                                              item.bundle_section
                                                ? ` · ${item.bundle_section}`
                                                : ""
                                            }`
                                          : "",
                                        item.item_description || "",
                                      ]
                                        .filter(Boolean)
                                        .join(" · ") || "No additional item details"}
                                    </p>
                                  </div>
                                  <span className="shrink-0 text-sm font-medium text-slate-700">
                                    {item.quantity || "—"} {item.unit || ""}
                                  </span>
                                </div>

                                {status ? (
                                  <div className="mt-2 grid grid-cols-3 gap-2">
                                    <SummaryBlockCompact
                                      label="Missing"
                                      value={`${status.originalQty}`}
                                    />
                                    <SummaryBlockCompact
                                      label="Delivered"
                                      value={`${status.deliveredQty}`}
                                    />
                                    <SummaryBlockCompact
                                      label="Remaining"
                                      value={`${status.remainingQty}`}
                                    />
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {(event.source_tower_id ||
                        event.destination_tower_id ||
                        event.destination_location) && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {event.source_tower_id ? (
                            <SummaryBlockCompact
                              label="Source"
                              value={
                                towerNameById.get(event.source_tower_id) ||
                                event.source_tower_id
                              }
                            />
                          ) : null}
                          {event.destination_tower_id ? (
                            <SummaryBlockCompact
                              label="Destination"
                              value={
                                towerNameById.get(event.destination_tower_id) ||
                                event.destination_tower_id
                              }
                            />
                          ) : event.destination_location ? (
                            <SummaryBlockCompact
                              label="Destination"
                              value={titleCase(event.destination_location)}
                            />
                          ) : null}
                        </div>
                      )}

                      {event.people?.length ? (
                        <p className="mt-3 text-xs text-slate-600">
                          <strong>People:</strong>{" "}
                          {event.people
                            .map(
                              (person) =>
                                person.employee_name ||
                                person.worker_name ||
                                person.employee_id ||
                                "Worker",
                            )
                            .join(", ")}
                        </p>
                      ) : null}

                      {event.plant?.length ? (
                        <p className="mt-2 text-xs text-slate-600">
                          <strong>Plant:</strong>{" "}
                          {event.plant
                            .map(
                              (item) =>
                                item.plant_name ||
                                item.asset_number ||
                                "Plant item",
                            )
                            .join(", ")}
                        </p>
                      ) : null}

                      {event.notes ? (
                        <p className="mt-3 text-sm text-slate-600">
                          {event.notes}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="font-semibold text-slate-800">
                    No structured material events recorded.
                  </p>
                  {docket.missing_items_bolts ? (
                    <p className="mt-2 text-sm text-slate-600">
                      <strong>Legacy missing items:</strong>{" "}
                      {docket.missing_items_bolts}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-slate-500">
                      No missing or excess material has been recorded.
                    </p>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-blue-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Bundle Transfers
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Bundles taken from another tower for this workfront. The
                    source tower remains outstanding until its replacement is
                    confirmed delivered.
                  </p>
                </div>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {bundleTransfers.length} transfer
                  {bundleTransfers.length === 1 ? "" : "s"}
                </span>
              </div>

              {bundleTransfers.length ? (
                <div className="mt-5 space-y-3">
                  {bundleTransfers.map((transfer) => {
                    const replacement =
                      transferReplacementStatusMap.get(transfer.id) || {
                        originalQty: transfer.quantity,
                        deliveredQty: 0,
                        remainingQty: transfer.quantity,
                        status: "Outstanding" as const,
                      };

                    return (
                      <div
                        key={transfer.id}
                        className="rounded-xl border border-blue-100 bg-blue-50/40 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-semibold text-slate-900">
                              Bundle {transfer.bundle_no}
                              {transfer.bundle_section
                                ? ` · ${transfer.bundle_section}`
                                : ""}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              Taken from{" "}
                              <strong>
                                {towerNameById.get(transfer.source_tower_id) ||
                                  transfer.source_tower_id}
                              </strong>{" "}
                              · Qty {transfer.quantity}
                            </p>
                            {transfer.received_at || transfer.transferred_at ? (
                              <p className="mt-1 text-xs text-slate-500">
                                {formatDateTime(
                                  transfer.received_at ||
                                    transfer.transferred_at,
                                )}
                              </p>
                            ) : null}
                          </div>

                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                              replacement.status === "Replaced"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : replacement.status === "Partially Replaced"
                                  ? "border-amber-200 bg-amber-50 text-amber-800"
                                  : "border-rose-200 bg-rose-50 text-rose-700"
                            }`}
                          >
                            Source replacement: {replacement.status}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <SummaryBlockCompact
                            label="Taken"
                            value={String(replacement.originalQty)}
                          />
                          <SummaryBlockCompact
                            label="Replaced"
                            value={String(replacement.deliveredQty)}
                          />
                          <SummaryBlockCompact
                            label="Still Missing"
                            value={String(replacement.remainingQty)}
                          />
                        </div>

                        {transfer.notes ? (
                          <p className="mt-3 text-sm text-slate-600">
                            {transfer.notes}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                  No bundles were recorded as taken from another tower on this
                  Daily Docket.
                </div>
              )}
            </section>

            <section
              className={`rounded-2xl border bg-white p-6 shadow-sm ${
                docket.incident_occurred
                  ? "border-red-200"
                  : "border-emerald-200"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Safety / Incident
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Safety information declared on the Daily Docket.
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    docket.incident_occurred
                      ? "bg-red-50 text-red-700"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {docket.incident_occurred
                    ? "Incident / event recorded"
                    : "No incident recorded"}
                </span>
              </div>

              {docket.incident_occurred ? (
                <div className="mt-5 space-y-3">
                  <SummaryBlockCompact
                    label="Incident Type"
                    value={docket.incident_type || "Not specified"}
                  />
                  <TextPanel
                    label="Incident / Safety Details"
                    value={docket.incident_notes || "No details entered"}
                  />
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                  The docket records that no incident or safety event occurred.
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Daily Site Summary & References
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Standalone daily narrative and RFI references, separate from delay comments.
                  </p>
                </div>
                {editMode ? (
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                    Editable
                  </span>
                ) : null}
              </div>

              <div className="mt-4 space-y-4">
                {editMode ? (
                  <>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Daily Site Summary
                      </label>
                      <textarea
                        rows={5}
                        value={docket.daily_site_summary || ""}
                        onChange={(event) =>
                          setDocket((current) =>
                            current
                              ? {
                                  ...current,
                                  daily_site_summary: event.target.value,
                                }
                              : current,
                          )
                        }
                        className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        placeholder="Summarise the day's work, key outcomes and anything the next shift needs to know."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        RFI References
                      </label>
                      <input
                        value={(docket.rfi_references || []).join(", ")}
                        onChange={(event) =>
                          setDocket((current) =>
                            current
                              ? {
                                  ...current,
                                  rfi_references: event.target.value
                                    .split(",")
                                    .map((value) => value.trim())
                                    .filter(Boolean),
                                }
                              : current,
                          )
                        }
                        className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        placeholder="RFI-001, RFI-014"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {docket.daily_site_summary ? (
                      <TextPanel
                        label="Daily Site Summary"
                        value={docket.daily_site_summary}
                      />
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                        No Daily Site Summary recorded.
                      </div>
                    )}

                    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                        RFI References
                      </p>
                      <p className="mt-2 text-sm font-medium text-slate-800">
                        {docket.rfi_references?.length
                          ? docket.rfi_references.join(", ")
                          : "No RFI references recorded."}
                      </p>
                    </div>
                  </>
                )}

                {siteComments ? (
                  <TextPanel
                    label="Legacy / Delay Comments"
                    value={siteComments}
                  />
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Docket Prepared / BC Representative Sign-off
              </h2>

              <div className="mt-5 grid gap-5 md:grid-cols-[1fr_260px]">
                <div className="space-y-3">
                  <SummaryLine
                    label="Representative"
                    value={docket.bc_rep_name || "—"}
                  />
                  <SummaryLine
                    label="Signed"
                    value={formatDateTime(docket.bc_signed_at)}
                  />
                  <SummaryLine
                    label="Submitted for Approval"
                    value={formatDateTime(docket.bc_submitted_at)}
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  {docket.bc_signature_data_url ? (
                    <img
                      src={docket.bc_signature_data_url}
                      alt="BC Representative signature"
                      className="h-28 w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-28 items-center justify-center text-sm text-slate-500">
                      No preparer signature recorded
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    BC Reviewer Signature
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    This is the reviewing BC representative approving the docket
                    before it is issued to the client.
                  </p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Required to approve
                </span>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <SummaryBlockCompact
                  label="Reviewer"
                  value={reviewerName || "Signed-in user"}
                />
                <SummaryBlockCompact
                  label="Email"
                  value={reviewerEmail || "—"}
                />
              </div>

              <div className="mt-4">
                <SignaturePad
                  value={reviewerSignature}
                  disabled={
                    !allowedReviewer ||
                    !reviewActionable ||
                    submitting !== null
                  }
                  onChange={setReviewerSignature}
                />
              </div>
            </section>
          </div>

          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900">
                    BC Approval
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-slate-500">
                    Review every docket section before approving or returning it
                    for correction.
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Clock3 className="h-4 w-4" />
                  {statusLabel(docket.approval_status)}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Submitted {formatDateTime(docket.bc_submitted_at)}
                </p>
              </div>

              {reviewActionable && allowedReviewer ? (
                <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <p className="text-sm font-semibold text-blue-950">
                    Reviewer corrections
                  </p>
                  <p className="mt-1 text-xs leading-5 text-blue-800">
                    You can correct progress, labour times and delays before approving. Saving a reviewer correction means approval will create the next revision.
                  </p>
                  <div className="mt-3 flex gap-2">
                    {!editMode ? (
                      <button
                        type="button"
                        disabled={submitting !== null || savingChanges}
                        onClick={() => setEditMode(true)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit Docket
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={savingChanges}
                          onClick={() => setEditMode(false)}
                          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={savingChanges}
                          onClick={() => void saveReviewerChanges()}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                        >
                          {savingChanges ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          Save Changes
                        </button>
                      </>
                    )}
                  </div>
                  {reviewerMadeChanges ? (
                    <p className="mt-2 text-xs font-semibold text-emerald-700">
                      Reviewer corrections saved. Approval will issue the next revision.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Client Approval Email Recipients
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      These contacts are configured in Daily Docket Approval
                      Settings and will each receive their own secure approval
                      link when you approve this revision.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    {clientApprovalContacts.length}
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {clientApprovalContacts.length ? (
                    clientApprovalContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="rounded-lg border border-emerald-100 bg-white px-3 py-2"
                      >
                        <p className="text-sm font-semibold text-slate-900">
                          {contact.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {contact.email}
                          {contact.company ? ` · ${contact.company}` : ""}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                      No active client approval recipients are configured.
                      Approval cannot be sent until one is added in Approval
                      Settings.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Information to Include in Client Docket
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Project defaults are preselected. Change them for this revision before approving.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                    R{String(currentRevision).padStart(2, "0")}
                  </span>
                </div>

                <div className="mt-4 space-y-2">
                  {CLIENT_CONTENT_OPTIONS.map((option) => {
                    const checked = clientContentKeys.includes(option.key);
                    return (
                      <label
                        key={option.key}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition ${
                          checked
                            ? "border-blue-200 bg-blue-50"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={
                            !allowedReviewer ||
                            !reviewActionable ||
                            submitting !== null
                          }
                          onChange={() => toggleClientContent(option.key)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-900">
                            {option.label}
                          </span>
                          <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                            {option.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  The selection is saved against this approval revision so later project-setting changes do not alter the historical issue.
                </p>
              </div>

              <div className="mt-5">
                <label
                  htmlFor="approval-comments"
                  className="block text-sm font-semibold text-slate-700"
                >
                  Approval note
                </label>
                <textarea
                  id="approval-comments"
                  rows={3}
                  value={approvalComments}
                  disabled={
                    !allowedReviewer ||
                    !reviewActionable ||
                    submitting !== null
                  }
                  onChange={(event) => setApprovalComments(event.target.value)}
                  className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100"
                  placeholder="Optional note when approving."
                />
              </div>

              {submitError ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {submitError}
                </div>
              ) : null}

              <div className="mt-5">
                <button
                  type="button"
                  disabled={
                    !allowedReviewer ||
                    !reviewActionable ||
                    clientApprovalContacts.length === 0 ||
                    submitting !== null
                  }
                  onClick={() => void submitReview("approve")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting === "approve" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileCheck2 className="h-4 w-4" />
                  )}
                  {docket.approval_status === "client_changes_requested"
                    ? "Approve Correction & Resend to Client"
                    : "Approve & Send to Client"}
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <MessageSquareWarning className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Request Changes
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-slate-500">
                    Select exactly which docket sections need correction and
                    enter the required change for each one.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {CHANGE_CATEGORIES.map((category) => {
                  const selected =
                    selectedChangeCategories.includes(category);

                  return (
                    <button
                      key={category}
                      type="button"
                      disabled={
                        !allowedReviewer ||
                        !reviewActionable ||
                        submitting !== null
                      }
                      onClick={() => toggleChangeCategory(category)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                        selected
                          ? "border-amber-500 bg-amber-500 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-amber-300"
                      } disabled:opacity-50`}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>

              {selectedChangeCategories.length ? (
                <div className="mt-4 space-y-3">
                  {selectedChangeCategories.map((category) => (
                    <div key={category}>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                        {category}
                      </label>
                      <textarea
                        rows={3}
                        value={changeDetails[category] || ""}
                        disabled={
                          !allowedReviewer ||
                          !reviewActionable ||
                          submitting !== null
                        }
                        onChange={(event) =>
                          setChangeDetails((current) => ({
                            ...current,
                            [category]: event.target.value,
                          }))
                        }
                        className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-100"
                        placeholder={`What needs to change in ${category.toLowerCase()}?`}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-xs text-slate-500">
                  No changes selected.
                </p>
              )}

              <button
                type="button"
                disabled={
                  !allowedReviewer ||
                  !reviewActionable ||
                  submitting !== null
                }
                onClick={() => void submitReview("request_changes")}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting === "request_changes" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquareWarning className="h-4 w-4" />
                )}
                {docket.approval_status === "client_changes_requested"
                  ? "Send Back to Preparer"
                  : "Return for Changes"}
              </button>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">
                Review Checks
              </h3>

              <div className="mt-4 space-y-3 text-sm">
                <CheckItem
                  ok={Boolean(docket.bc_rep_name)}
                  label="BC representative recorded"
                />
                <CheckItem
                  ok={Boolean(docket.bc_signature_data_url)}
                  label="Preparer signature captured"
                />
                <CheckItem
                  ok={Boolean(docket.docket_date)}
                  label="Docket date recorded"
                />
                <CheckItem ok={labour.length > 0} label="Labour recorded" />
                <CheckItem
                  ok={workedTowerIds.length <= 1 || productionAllocationVariance <= 0.25}
                  label={
                    workedTowerIds.length <= 1
                      ? "Single-tower docket / allocation not required"
                      : "Multi-tower production MH balanced"
                  }
                />
                <CheckItem
                  ok={progressByTower.size >= 1}
                  label="Tower progress rows linked to a workfront"
                />
                <CheckItem
                  ok={allowedReviewer}
                  label="Signed-in user is an individually configured BC reviewer"
                />
                <CheckItem
                  ok={clientApprovalContacts.length > 0}
                  label="Client approval email recipients configured"
                />
                <CheckItem
                  ok={Boolean(reviewerSignature)}
                  label="Reviewer signature captured"
                />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function PercentInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="ml-auto flex w-24 items-center overflow-hidden rounded-lg border border-slate-300 bg-white">
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) =>
          onChange(
            Math.min(100, Math.max(0, Number(event.target.value || 0))),
          )
        }
        className="w-full px-2 py-1.5 text-right text-sm outline-none"
      />
      <span className="pr-2 text-xs text-slate-500">%</span>
    </div>
  );
}

function TimeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-25 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
    />
  );
}

function NumberInput({
  value,
  step,
  onChange,
}: {
  value: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      min={0}
      step={step}
      value={value}
      onChange={(event) => onChange(Math.max(0, Number(event.target.value || 0)))}
      className="w-24 shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right text-sm font-semibold text-slate-700"
    />
  );
}

function SignaturePad({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  function canvasPoint(
    canvas: HTMLCanvasElement,
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function startDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = canvasPoint(canvas, event);
  }

  function draw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled || !drawingRef.current) return;
    const canvas = canvasRef.current;
    const previous = lastPointRef.current;
    if (!canvas || !previous) return;

    const next = canvasPoint(canvas, event);
    const context = canvas.getContext("2d");
    if (!context) return;

    context.strokeStyle = "#0f172a";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(next.x, next.y);
    context.stroke();

    lastPointRef.current = next;
  }

  function finishDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;

    drawingRef.current = false;
    lastPointRef.current = null;

    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    if (canvas) {
      onChange(canvas.toDataURL("image/png"));
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }
    onChange("");
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-semibold text-slate-700">
          Reviewer signature
        </label>
        <button
          type="button"
          disabled={disabled || !value}
          onClick={clear}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>

      <div className="mt-2 overflow-hidden rounded-xl border border-slate-300 bg-white">
        <canvas
          ref={canvasRef}
          width={900}
          height={240}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={finishDrawing}
          onPointerCancel={finishDrawing}
          className={`h-40 w-full touch-none ${
            disabled ? "cursor-not-allowed bg-slate-100" : "cursor-crosshair"
          }`}
          aria-label="BC reviewer signature pad"
        />
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Sign above using the mouse, stylus or touchscreen. The signature is
        stored against the BC approval record.
      </p>
    </div>
  );
}

function SummaryBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function SummaryBlockCompact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  internal = false,
}: {
  label: string;
  value: string;
  internal?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        internal
          ? "border-emerald-200 bg-emerald-50"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
      {internal ? (
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
          Internal
        </p>
      ) : null}
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function TextPanel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
        {value}
      </p>
    </div>
  );
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex h-5 w-5 items-center justify-center rounded-full ${
          ok
            ? "bg-emerald-100 text-emerald-700"
            : "bg-slate-100 text-slate-400"
        }`}
      >
        {ok ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5" />
        )}
      </div>
      <span className={ok ? "text-slate-700" : "text-slate-500"}>
        {label}
      </span>
    </div>
  );
}

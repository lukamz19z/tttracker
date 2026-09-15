"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import TowerMemberFields, { type TowerMaterialMember } from "@/components/quality/TowerMemberFields";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import {
  SECTION_PROGRESS_WEIGHTS,
  SECTION_V2_DEFS,
  calculateHours,
  calculateProductionHours,
  delayHoursForWorker,
  calculateLabourRows,
  calculateLabourTotals,
  calculateMobilisationManhours,
  calculateMobilisationWorkerCount,
  calculateProgressTotals,
  calculateTotalPlantDelayHours,
  clampPercentString,
  hoursToMinutes,
  isBodyExtensionRow,
  minutesToHours,
  normalizeWorkerName,
  toNumber,
} from "@/lib/dockets/calculations";

type LabourRow = {
  worker_name: string;
  time_in: string;
  time_out: string;
  total_hours: string;
  prestart_minutes: string;
  lunch_minutes: string;
  travel_in_minutes: string;
  travel_out_minutes: string;
  mobilisation_hours: string;
  delay_hours: string;
  delay_reason: string;
  production_hours: string;
};

type DocketRateType = "tonnage_rate" | "schedule_of_rates";

type PlantRow = {
  plant_name: string;
  plant_type: string;
  asset_id: string;
  operator_name: string;
  time_in: string;
  time_out: string;
  total_hours: string;
  notes: string;
};

type DelayScope = "entire_crew" | "selected_workers";
type DelayAppliesMode = "labour_only" | "labour_and_plant";
type DelayType = "weather" | "lightning" | "toolbox" | "mobilisation" | "access" | "plant" | "materials" | "other";

type DelayRow = {
  ui_id: string;
  id?: string;
  delay_type: DelayType;
  delay_reason: string;
  delay_hours: string;
  applies_to: DelayScope;
  worker_names: string[];
  delay_applies_mode: DelayAppliesMode;
  plant_names: string[];
};


type MaterialEventType =
  | "missing"
  | "found_received"
  | "taken_from_another_tower"
  | "sent_to_another_tower"
  | "excess"
  | "damaged_incorrect";

type MaterialWorkOutcome =
  | ""
  | "stopped_work"
  | "slowed_down"
  | "changed_sequence"
  | "minor_impact";

type MaterialEventPersonDraft = {
  ui_id: string;
  employee_id: string;
  employee_name: string;
  employee_role: string;
  started_at: string;
  finished_at: string;
};

type MaterialEventPlantDraft = {
  ui_id: string;
  plant_name: string;
  asset_number: string;
  started_at: string;
  finished_at: string;
};

type MaterialSearchMode = "member" | "bundle";

type MaterialEventItemDraft = {
  ui_id: string;
  search_mode: MaterialSearchMode;
  source_table: string;
  source_record_id: string;
  issue_key: string;
  source_issue_key: string;
  bundle_id: string;
  bundle_no: string;
  bundle_section: string;
  material_kind: "registered" | "manual" | "manual_bolt";
  manual_category: string;
  bolt_size: string;
  search_query: string;
  search_loading: boolean;
  search_results: MaterialCatalogItem[];
  item_reference: string;
  item_description: string;
  quantity: string;
  unit: string;
};

type MaterialEventDraft = {
  ui_id: string;
  id?: string;
  event_type: MaterialEventType;
  source_tower_id: string;
  destination_tower_id: string;
  source_location: string;
  destination_location: string;
  occurred_time: string;
  affected_work: boolean;
  affected_activity: string;
  affected_section: string;
  work_outcome: MaterialWorkOutcome;
  impact_start_time: string;
  impact_finish_time: string;
  impact_ongoing: boolean;
  current_effect: string;
  mitigation_actions: string[];
  notes: string;
  items: MaterialEventItemDraft[];
  people: MaterialEventPersonDraft[];
  plant: MaterialEventPlantDraft[];
};

type MaterialCatalogItem = {
  source_table: string;
  source_record_id: string;
  bundle_id: string;
  bundle_no: string;
  bundle_section: string;
  item_reference: string;
  item_description: string;
  unit: string;
  tower_id: string;
};

type MissingMaterialIssue = {
  issue_key: string;
  source_table: string;
  source_record_id: string;
  bundle_id: string;
  bundle_no: string;
  bundle_section: string;
  item_reference: string;
  item_description: string;
  original_quantity: number;
  received_quantity: number;
  remaining_quantity: number;
  unit: string;
  first_reported_at: string;
  source_docket_id: string;
};


type BundleTransferStatus = "in_transit" | "received" | "cancelled";

type BundleTransferRecord = {
  id: string;
  transfer_no: number | null;
  project_id: string;
  source_tower_id: string;
  destination_tower_id: string;
  source_bundle_id: string;
  destination_bundle_id: string;
  bundle_no: string;
  bundle_section: string;
  quantity: number;
  status: BundleTransferStatus;
  transferred_by_name: string;
  transferred_at: string | null;
  received_by_name: string;
  received_at: string | null;
  source_docket_id: string;
  destination_docket_id: string;
  notes: string;
};

type BundleTransferReplacementStatus = {
  transfer_id: string;
  issue_key: string;
  original_quantity: number;
  delivered_quantity: number;
  remaining_quantity: number;
  first_reported_at: string | null;
  last_delivery_at: string | null;
};

type BundleTransferReplacementDraft = {
  quantity: string;
  occurred_time: string;
};

type BundleTransferDraft = {
  ui_id: string;
  source_tower_id: string;
  source_bundle_id: string;
  destination_bundle_id: string;
  quantity: string;
  occurred_time: string;
  replacement_quantity: string;
  replacement_time: string;
  notes: string;
};

type TowerOption = {
  id: string;
  name: string;
  has_body_extension: boolean;
};

type ProductionActivity =
  | "assembly"
  | "erection"
  | "mixed"
  | "rectification"
  | "other";

type AdditionalTowerWork = {
  id?: string;
  ui_id: string;
  target_tower_id: string;
  allocation_percent: string;
  saved_allocated_mh: number;
  activity: ProductionActivity;
  notes: string;
  has_body_extension: boolean;
  progress_rows: SectionV2ProgressRow[];
};

type MobilisationStatus =
  | "planning"
  | "packing"
  | "demobilising"
  | "in_transit"
  | "mobilising"
  | "setup"
  | "complete";

type TowerRevisionAllocation = {
  id?: string;
  ui_id: string;
  target_tower_id: string;
  hours: string;
  worker_names: string[];
  reason: string;
};

type DocketDefectSeverity = "Minor" | "Major" | "Critical";

type DocketDefectIssueType = {
  id: string;
  name: string;
  applies_to: "defect" | "revision" | "both";
  active: boolean;
  sort_order: number;
};

type DocketDefectAssignee = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type ExistingTowerDefect = {
  id: string;
  defect_number: string | null;
  issue_type_id: string | null;
  member_number: string | null;
  segment: string | null;
  drawing_number: string | null;
  description: string | null;
  severity: DocketDefectSeverity;
  status: "Open" | "In Progress" | "Fixed" | "Closed";
  assigned_to_user_id: string | null;
  assigned_to_label: string | null;
  created_at: string;
};

type LinkedDocketDefect = ExistingTowerDefect & {
  link_id: string;
  link_type: "raised" | "referenced";
};

type DocketDefectDraft = {
  ui_id: string;
  issue_type_id: string;
  other_issue_text: string;
  segment: string;
  member_number: string;
  drawing_number: string;
  description: string;
  severity: DocketDefectSeverity;
  assigned_to_user_id: string;
  photos: File[];
};

type MobilisationDraft = {
  enabled: boolean;
  from_tower_id: string;
  to_tower_id: string;
  status: MobilisationStatus;
  percent_complete: string;
  started_date: string;
  target_move_date: string;
  completed_date: string;
  notes: string;
  worker_names: string[];
};

type DbDelayRow = {
  id?: string;
  docket_id: string;
  delay_type: DelayType | string | null;
  delay_reason: string | null;
  delay_hours: number | null;
  applies_to: DelayScope | string | null;
  worker_names: string[] | null;
  delay_applies_mode?: DelayAppliesMode | string | null;
  plant_names?: string[] | null;
};

type ProgressRow = {
  section_label: string;
  assembled_qty: string;
  erected_qty: string;
};

type ProgressModel = "legacy" | "section_v2";
type SectionV2ProgressRow = {
  section_code: string;
  section_label: string;
  assembly_today: string;
  erection_today: string;
  assembly_weight: number;
  erection_weight: number;
};
function blankSectionV2Rows(): SectionV2ProgressRow[] {
  return SECTION_V2_DEFS.map(([section_code, section_label]) => ({
    section_code,
    section_label,
    assembly_today: "",
    erection_today: "",
    assembly_weight: SECTION_PROGRESS_WEIGHTS[section_code] ?? 0,
    erection_weight: SECTION_PROGRESS_WEIGHTS[section_code] ?? 0,
  }));
}

type DocketRecord = {
  id?: string;
  project_id: string;
  tower_id: string;
  docket_date: string | null;
  crew: string | null;
  leading_hand: string | null;
  weather: string | null;
  rate_type?: DocketRateType | string | null;
  assembly_percent?: number | null;
  erection_percent?: number | null;
  weather_delay_hours: number | null;
  lightning_delay_hours: number | null;
  toolbox_delay_hours: number | null;
  other_delay_hours: number | null;
  other_delay_reason: string | null;
  delays_comments: string | null;
  daily_site_summary?: string | null;
  rfi_references?: string[] | null;
  missing_items_bolts: string | null;
  bc_rep_name: string | null;
  client_rep_name: string | null;
  signed_date: string | null;
  docket_file_url: string | null;
  prestart_minutes?: number | null;
  lunch_break_minutes?: number | null;
  travel_in_minutes?: number | null;
  travel_out_minutes?: number | null;
  mobilisation_hours?: number | null;
  mobilisation_notes?: string | null;
  raw_manhours?: number | null;
  production_manhours?: number | null;
  incident_occurred?: boolean | null;
  incident_type?: string | null;
  incident_notes?: string | null;
  safety_check_completed?: "Y" | "N" | null;
  sharepoint_sync_status?: string | null;
  sharepoint_web_url?: string | null;
  pdf_file_name?: string | null;
  progress_model?: "legacy" | "section_v2" | string | null;
  approval_status?: string | null;
  bc_submitted_at?: string | null;
  bc_approved_at?: string | null;
  bc_approved_name?: string | null;
  bc_signature_data_url?: string | null;
  bc_signed_at?: string | null;
  client_approved_at?: string | null;
  client_approved_name?: string | null;
  draft_sharepoint_web_url?: string | null;
  final_sharepoint_web_url?: string | null;
};

type TowerRecord = {
  id: string;
  extra_data?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type CrewRecord = {
  id: string;
  crew_number: string | null;
  crew_name: string | null;
  leading_hand: string | null;
  active: boolean | null;
};

type EmployeeRecord = {
  id: string;
  full_name: string;
  role: string | null;
  crew_id: string | null;
  active: boolean | null;
};

type AssetAllocationRow = Record<string, unknown>;

const DEFAULT_PROGRESS_ROWS: ProgressRow[] = [
  { section_label: "Legs", assembled_qty: "", erected_qty: "" },
  { section_label: "Body Extensions", assembled_qty: "", erected_qty: "" },
  { section_label: "Common Body", assembled_qty: "", erected_qty: "" },
  { section_label: "Superstructure", assembled_qty: "", erected_qty: "" },
  { section_label: "Crossarms", assembled_qty: "", erected_qty: "" },
];

function toStringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function stripMobilisationMetadata(value: unknown) {
  return toStringValue(value)
    .split("\n")
    .filter((line) => !line.startsWith("MOBILISATION|"))
    .join("\n")
    .trim();
}

function isClientSignedDocket(docket: {
  client_rep_name?: string | null;
  signed_date?: string | null;
}) {
  return Boolean(docket.client_rep_name?.trim() && docket.signed_date?.trim());
}


function getDuplicateWorkerIndexes(rows: LabourRow[]) {
  const seen = new Map<string, number[]>();

  rows.forEach((row, index) => {
    const key = normalizeWorkerName(row.worker_name);
    if (!key) return;
    const existing = seen.get(key) || [];
    existing.push(index);
    seen.set(key, existing);
  });

  const duplicateIndexes = new Set<number>();
  seen.forEach((indexes) => {
    if (indexes.length > 1) indexes.forEach((i) => duplicateIndexes.add(i));
  });

  return duplicateIndexes;
}

function normaliseText(value: unknown) {
  return toStringValue(value)
    .trim()
    .toLowerCase()
    .replace(/[_\-.()/]+/g, " ")
    .replace(/\s+/g, " ");
}

function parsePositiveIndicator(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value > 0;

  const text = normaliseText(value);
  if (!text) return null;

  if (["yes", "y", "true", "included", "include", "required", "req", "body extension"].includes(text)) {
    return true;
  }

  if (["no", "n", "false", "none", "nil", "na", "n a", "not required", "not included"].includes(text)) {
    return false;
  }

  const match = text.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (match) {
    const n = Number(match[0]);
    if (Number.isFinite(n)) return n > 0;
  }

  return null;
}

function readExtraBodyExtensionValue(extra: Record<string, unknown>) {
  const bodyExtensionKeys = [
    "Body Extension",
    "Body Extensions",
    "Body Extension Height",
    "Body Extension Length",
    "Body Extension Qty",
    "Body Extension Required",
    "Body Ext (m)",
    "BODY EXT (M)",
    "Body Ext",
    "Body Ext.",
    "BE",
    "BE Height",
    "Extension",
    "Extension Height",
    "body_extension",
    "body_extensions",
    "body_extension_height",
    "body_ext_m",
    "body_ext",
  ].map(normaliseText);

  const normalisedExtra = Object.entries(extra).map(([key, value]) => ({
    key,
    normalisedKey: normaliseText(key),
    value,
  }));

  for (const expectedKey of bodyExtensionKeys) {
    const found = normalisedExtra.find((entry) => entry.normalisedKey === expectedKey);
    if (!found) continue;
    const parsed = parsePositiveIndicator(found.value);
    if (parsed !== null) return parsed;
  }

  for (const entry of normalisedExtra) {
    const key = entry.normalisedKey;
    const looksLikeBodyExtensionKey =
      (key.includes("body") && (key.includes("ext") || key.includes("extension"))) ||
      key === "be" ||
      key === "b e";

    if (!looksLikeBodyExtensionKey) continue;
    const parsed = parsePositiveIndicator(entry.value);
    if (parsed !== null) return parsed;
  }

  const joinedExtra = Object.values(extra).map(normaliseText).join(" ");
  if (/\bbody\s*(ext|extension)\b/.test(joinedExtra)) return true;

  return null;
}

function inferTowerHasBodyExtension(tower: TowerRecord | null) {
  const extra = tower?.extra_data || {};
  const value = readExtraBodyExtensionValue(extra);
  if (value !== null) return value;
  return true;
}

function makeUiId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ui-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function blankDocketDefectDraft(): DocketDefectDraft {
  return {
    ui_id: makeUiId(),
    issue_type_id: "",
    other_issue_text: "",
    segment: "",
    member_number: "",
    drawing_number: "",
    description: "",
    severity: "Minor",
    assigned_to_user_id: "",
    photos: [],
  };
}

function isQualityHeicFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

async function normaliseQualityPhoto(file: File) {
  if (!isQualityHeicFile(file)) return file;

  const heic2anyModule = await import("heic2any");
  const converted = await heic2anyModule.default({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;

  return new File(
    [blob],
    file.name.replace(/\.hei[cf]$/i, ".jpg"),
    {
      type: "image/jpeg",
      lastModified: Date.now(),
    },
  );
}

function rfiReferencesToText(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => toStringValue(item).trim()).filter(Boolean).join(", ");
  }
  return toStringValue(value);
}

function parseRfiReferences(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,;\n\r]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function makeLabourRow(
  row?: Partial<LabourRow> | any,
  options?: { mobilisationIsMinutes?: boolean }
): LabourRow {
  const mapped: LabourRow = {
    worker_name: toStringValue(row?.worker_name),
    time_in: toStringValue(row?.time_in),
    time_out: toStringValue(row?.time_out),
    total_hours: toStringValue(row?.total_hours),
    prestart_minutes: toStringValue(row?.prestart_minutes),
    lunch_minutes: toStringValue(row?.lunch_minutes),
    travel_in_minutes: toStringValue(row?.travel_in_minutes),
    travel_out_minutes: toStringValue(row?.travel_out_minutes),
    mobilisation_hours: options?.mobilisationIsMinutes
      ? toStringValue(row?.mobilisation_hours)
      : toStringValue(hoursToMinutes(row?.mobilisation_hours)),
    delay_hours: toStringValue(row?.delay_hours),
    delay_reason: toStringValue(row?.delay_reason),
    production_hours: toStringValue(row?.production_hours),
  };

  mapped.production_hours = calculateProductionHours(mapped);
  return mapped;
}

function blankLabourRow(defaults?: {
  prestartMinutes?: string;
  lunchBreakMinutes?: string;
  travelInMinutes?: string;
  travelOutMinutes?: string;
  mobilisationHours?: string;
}): LabourRow {
  return makeLabourRow(
    {
      worker_name: "",
      time_in: "",
      time_out: "",
      total_hours: "",
      prestart_minutes: defaults?.prestartMinutes || "",
      lunch_minutes: defaults?.lunchBreakMinutes || "",
      travel_in_minutes: defaults?.travelInMinutes || "",
      travel_out_minutes: defaults?.travelOutMinutes || "",
      mobilisation_hours: defaults?.mobilisationHours || "",
      delay_hours: "",
      delay_reason: "",
      production_hours: "",
    },
    { mobilisationIsMinutes: true }
  );
}

function makePlantRow(row?: Partial<PlantRow> | any): PlantRow {
  const mapped: PlantRow = {
    plant_name: toStringValue(row?.plant_name),
    plant_type: toStringValue(row?.plant_type),
    asset_id: toStringValue(row?.asset_id ?? row?.asset_number),
    operator_name: toStringValue(row?.operator_name),
    time_in: toStringValue(row?.time_in),
    time_out: toStringValue(row?.time_out),
    total_hours: toStringValue(row?.total_hours),
    notes: toStringValue(row?.notes),
  };

  if (!mapped.total_hours) mapped.total_hours = calculateHours(mapped.time_in, mapped.time_out);
  return mapped;
}

function blankPlantRow(): PlantRow {
  return makePlantRow({
    plant_name: "",
    plant_type: "",
    asset_id: "",
    operator_name: "",
    time_in: "",
    time_out: "",
    total_hours: "",
    notes: "",
  });
}

function firstAssetString(row: AssetAllocationRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function normaliseAssetText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}


function normaliseBundleRef(value: unknown) {
  return toStringValue(value).trim().toUpperCase().replace(/\s+/g, "");
}

function isoDateOnly(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return toStringValue(value).slice(0, 10);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function currentLocalTimeValue() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function deriveAutomaticPlantShift(rows: LabourRow[]) {
  const pairs = new Map<string, { count: number; time_in: string; time_out: string; total_hours: string }>();

  rows.forEach((row) => {
    if (!row.worker_name.trim()) return;
    if (!row.time_in || !row.time_out) return;
    const total = calculateHours(row.time_in, row.time_out);
    if (!total) return;
    const key = `${row.time_in}|${row.time_out}`;
    const existing = pairs.get(key);
    pairs.set(key, {
      count: (existing?.count || 0) + 1,
      time_in: row.time_in,
      time_out: row.time_out,
      total_hours: total,
    });
  });

  const common = Array.from(pairs.values()).sort((a, b) => b.count - a.count)[0];
  if (common) return common;

  const rawHours = rows
    .filter((row) => row.worker_name.trim())
    .map((row) => toNumber(row.total_hours))
    .filter((value) => value > 0);

  if (rawHours.length > 0) {
    const counts = new Map<number, number>();
    rawHours.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    const commonHours = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
    return { count: 0, time_in: "", time_out: "", total_hours: commonHours ? commonHours.toFixed(2) : "" };
  }

  return { count: 0, time_in: "", time_out: "", total_hours: "" };
}

function assetStatusIsUsable(row: AssetAllocationRow) {
  const rawStatus = firstAssetString(row, [
    "status",
    "asset_status",
    "availability_status",
    "fleet_status",
    "hire_status",
    "current_status",
  ]).toLowerCase();

  if (!rawStatus) return true;

  const blocked = [
    "retired",
    "superseded",
    "no longer hired",
    "no_longer_hired",
    "off hired",
    "off-hired",
    "inactive",
    "sold",
    "archived",
    "out of service",
  ];

  return !blocked.some((status) => rawStatus.includes(status));
}

function assetBelongsToCrew(
  row: AssetAllocationRow,
  crewIdValue: string,
  crewNumber: string,
  crewNameValue: string
) {
  const accepted = [crewIdValue, crewNumber, crewNameValue]
    .map((value) => normaliseAssetText(value))
    .filter(Boolean);

  if (accepted.length === 0) return false;

  const candidateKeys = [
    "crew_id",
    "assigned_crew_id",
    "allocated_crew_id",
    "current_crew_id",
    "crew",
    "crew_number",
    "crew_name",
    "assigned_crew",
    "allocated_crew",
    "current_crew",
    "project_crew",
  ];

  return candidateKeys.some((key) => {
    const raw = row[key];
    if (raw === null || raw === undefined) return false;

    if (Array.isArray(raw)) {
      return raw.some((value) => accepted.includes(normaliseAssetText(String(value))));
    }

    const text = normaliseAssetText(String(raw));
    if (!text) return false;

    return accepted.includes(text) || accepted.some((value) => text.includes(value));
  });
}

function buildAllocatedPlantRow(row: AssetAllocationRow, source: "plant" | "vehicle"): PlantRow | null {
  if (!assetStatusIsUsable(row)) return null;

  const assetCode = firstAssetString(row, [
    "asset_id",
    "asset_number",
    "plant_id",
    "vehicle_id",
    "fleet_number",
    "unit_number",
    "rego",
    "registration",
    "registration_number",
  ]);

  const makeModel = [
    firstAssetString(row, ["make_model", "make_and_model", "make", "model", "description", "name"]),
    firstAssetString(row, ["rego", "registration", "registration_number"]),
  ]
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index && value !== assetCode)
    .join(" ");

  const category = firstAssetString(row, [
    "category",
    "asset_category",
    "plant_category",
    "vehicle_type",
    "type",
  ]);

  const plantType = source === "vehicle" ? category || "Vehicle" : category || "Plant";
  const plantName = [assetCode, makeModel].filter(Boolean).join(" - ") || plantType;

  if (!plantName && !assetCode && !plantType) return null;

  return makePlantRow({
    plant_name: plantName,
    plant_type: plantType,
    asset_id: assetCode,
    operator_name: "",
    time_in: "",
    time_out: "",
    total_hours: "",
    notes: source === "vehicle"
      ? "Auto-added from crew vehicle allocation"
      : "Auto-added from crew plant allocation",
  });
}

function plantRowKey(row: PlantRow) {
  return normaliseAssetText(row.asset_id || row.plant_name || row.plant_type);
}

function rowHasPlantDetails(row: PlantRow) {
  return Boolean(
    row.plant_name.trim() ||
      row.asset_id.trim() ||
      row.plant_type.trim() ||
      row.operator_name.trim() ||
      row.notes.trim()
  );
}

function isAutoAllocatedPlantRow(row: PlantRow) {
  const notes = row.notes.trim().toLowerCase();
  return (
    notes === "auto-added from crew vehicle allocation" ||
    notes === "auto-added from crew plant allocation"
  );
}

function replaceAutoAllocatedPlantRows(existingRows: PlantRow[], allocatedRows: PlantRow[]) {
  const manualRows = existingRows.filter((row) => {
    if (!rowHasPlantDetails(row)) return false;
    return !isAutoAllocatedPlantRow(row);
  });

  const seen = new Set(manualRows.map(plantRowKey).filter(Boolean));
  const nextRows = [...manualRows];

  allocatedRows.forEach((row) => {
    const key = plantRowKey(row);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    nextRows.push(row);
  });

  return nextRows;
}

type DelayRowInput = {
  id?: string;
  delay_type?: DelayType | string | null;
  delay_reason?: unknown;
  delay_hours?: unknown;
  applies_to?: DelayScope | string | null;
  worker_names?: string[] | string | null;
  delay_applies_mode?: DelayAppliesMode | string | null;
  plant_names?: string[] | string | null;
};

function makeDelayRow(row?: DelayRowInput): DelayRow {
  const workerNamesValue = row?.worker_names;
  const plantNamesValue = row?.plant_names;

  const rawWorkers: string[] = Array.isArray(workerNamesValue)
    ? workerNamesValue
    : typeof workerNamesValue === "string"
    ? workerNamesValue.split(",")
    : [];

  const rawPlants: string[] = Array.isArray(plantNamesValue)
    ? plantNamesValue
    : typeof plantNamesValue === "string"
    ? plantNamesValue.split(",")
    : [];

  return {
    ui_id: makeUiId(),
    id: row?.id,
    delay_type: (row?.delay_type || "weather") as DelayType,
    delay_reason: toStringValue(row?.delay_reason),
    delay_hours: toStringValue(row?.delay_hours),
    applies_to: (row?.applies_to || "entire_crew") as DelayScope,
    worker_names: rawWorkers.map((name) => toStringValue(name).trim()).filter(Boolean),
    delay_applies_mode: (row?.delay_applies_mode || "labour_only") as DelayAppliesMode,
    plant_names: rawPlants.map((name) => toStringValue(name).trim()).filter(Boolean),
  };
}

function blankDelayRow(): DelayRow {
  return makeDelayRow({
    delay_type: "weather",
    delay_reason: "",
    delay_hours: "",
    applies_to: "entire_crew",
    worker_names: [],
    delay_applies_mode: "labour_only",
    plant_names: [],
  });
}

function uniqueWorkerNames(rows: LabourRow[]) {
  const seen = new Set<string>();
  const names: string[] = [];

  rows.forEach((row) => {
    const name = row.worker_name.trim();
    const key = normalizeWorkerName(name);
    if (!name || seen.has(key)) return;
    seen.add(key);
    names.push(name);
  });

  return names;
}

function delayDayworkMeta(type: DelayType) {
  switch (type) {
    case "weather": return { code: "WD", label: "Weather delay" };
    case "lightning": return { code: "WD", label: "Weather delay" };
    case "toolbox": return { code: "SB", label: "Standby" };
    case "mobilisation": return { code: "MOB", label: "Mobilisation" };
    case "access": return { code: "ACC", label: "Access / Bogged" };
    case "plant": return { code: "PI", label: "Plant issue" };
    case "materials": return { code: "MI", label: "Material issue" };
    case "other":
    default: return { code: "OTH", label: "Other" };
  }
}

function buildDayworkDocketNumber(projectNumber: string, sequenceNo: number) {
  return `${projectNumber}-DW-${String(sequenceNo).padStart(4, "0")}`;
}

function plantDisplayName(row: PlantRow, index: number) {
  const primary = row.plant_name.trim() || row.asset_id.trim() || row.plant_type.trim();
  const secondary = [row.plant_type.trim(), row.asset_id.trim()]
    .filter(Boolean)
    .filter((value, i, arr) => arr.indexOf(value) === i && value !== primary)
    .join(" / ");

  if (!primary) return `Plant ${index + 1}`;
  return secondary ? `${primary} (${secondary})` : primary;
}

function delayIncludesPlant(delay: DelayRow) {
  return delay.delay_applies_mode === "labour_and_plant";
}



function blankMaterialItem(): MaterialEventItemDraft {
  return {
    ui_id: makeUiId(),
    search_mode: "member",
    source_table: "",
    source_record_id: "",
    issue_key: "",
    source_issue_key: "",
    bundle_id: "",
    bundle_no: "",
    bundle_section: "",
    material_kind: "registered",
    manual_category: "",
    bolt_size: "",
    search_query: "",
    search_loading: false,
    search_results: [],
    item_reference: "",
    item_description: "",
    quantity: "1",
    unit: "ea",
  };
}

function blankMaterialEvent(): MaterialEventDraft {
  return {
    ui_id: makeUiId(),
    event_type: "missing",
    source_tower_id: "",
    destination_tower_id: "",
    source_location: "",
    destination_location: "",
    occurred_time: "",
    affected_work: false,
    affected_activity: "",
    affected_section: "",
    work_outcome: "",
    impact_start_time: "",
    impact_finish_time: "",
    impact_ongoing: false,
    current_effect: "",
    mitigation_actions: [],
    notes: "",
    items: [blankMaterialItem()],
    people: [],
    plant: [],
  };
}

function materialEventLabel(type: MaterialEventType) {
  switch (type) {
    case "missing": return "Missing material";
    case "found_received": return "Found / Received";
    case "taken_from_another_tower": return "Taken from another tower";
    case "sent_to_another_tower": return "Sent to another tower";
    case "excess": return "Excess material";
    case "damaged_incorrect": return "Damaged / Incorrect";
  }
}

function workOutcomeCommercialType(outcome: MaterialWorkOutcome) {
  switch (outcome) {
    case "stopped_work": return "Delayed";
    case "slowed_down": return "Disrupted";
    case "changed_sequence": return "Resequenced";
    case "minor_impact": return "No material impact";
    default: return null;
  }
}

function combineDocketDateTime(date: string, time: string) {
  if (!date || !time) return null;
  const value = new Date(`${date}T${time}:00`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function timeFromIso(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function DailyDocketForm({
  mode,
  projectId,
  towerId,
  docketId,
  initialDocket,
  initialLabourRows,
  initialProgressRows,
  initialDelayRows,
  initialPlantRows,
}: {
  mode: "create" | "edit" | "view";
  projectId: string;
  towerId: string;
  docketId?: string;
  initialDocket?: Partial<DocketRecord> | null;
  initialLabourRows?: LabourRow[];
  initialProgressRows?: ProgressRow[];
  initialDelayRows?: DelayRow[];
  initialPlantRows?: PlantRow[];
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowser();
  const isView = mode === "view";

  const [docketDate, setDocketDate] = useState(toStringValue(initialDocket?.docket_date));
  const [crewName, setCrewName] = useState(toStringValue(initialDocket?.crew));
  const [leadingHand, setLeadingHand] = useState(toStringValue(initialDocket?.leading_hand));
  const [towerLabel, setTowerLabel] = useState("");
  const [weather, setWeather] = useState(toStringValue(initialDocket?.weather));
  const [rateType, setRateType] = useState<DocketRateType>(
    initialDocket?.rate_type === "schedule_of_rates" ? "schedule_of_rates" : "tonnage_rate"
  );

  const [weatherDelayHours, setWeatherDelayHours] = useState(toStringValue(initialDocket?.weather_delay_hours));
  const [lightningDelayHours, setLightningDelayHours] = useState(toStringValue(initialDocket?.lightning_delay_hours));
  const [toolboxDelayHours, setToolboxDelayHours] = useState(toStringValue(initialDocket?.toolbox_delay_hours));
  const [otherDelayHours, setOtherDelayHours] = useState(toStringValue(initialDocket?.other_delay_hours));
  const [otherDelayReason, setOtherDelayReason] = useState(toStringValue(initialDocket?.other_delay_reason));
  const [missingItemsBolts, setMissingItemsBolts] = useState(toStringValue(initialDocket?.missing_items_bolts));
  const [delaysComments, setDelaysComments] = useState(toStringValue(initialDocket?.delays_comments));
  const [dailySiteSummary, setDailySiteSummary] = useState(
    toStringValue(initialDocket?.daily_site_summary) ||
      stripMobilisationMetadata(initialDocket?.delays_comments)
  );
  const [rfiReferencesText, setRfiReferencesText] = useState(
    rfiReferencesToText(initialDocket?.rfi_references)
  );
  const [bcRepName, setBcRepName] = useState(toStringValue(initialDocket?.bc_rep_name));
  const [bcSignatureDataUrl, setBcSignatureDataUrl] = useState(
    toStringValue(initialDocket?.bc_signature_data_url)
  );
  const [bcSignedAt, setBcSignedAt] = useState(toStringValue(initialDocket?.bc_signed_at));
  const [clientRepName, setClientRepName] = useState(toStringValue(initialDocket?.client_rep_name));
  const [signedDate, setSignedDate] = useState(toStringValue(initialDocket?.signed_date));
  const [docketFile, setDocketFile] = useState<File | null>(null);
  const [existingDocketFileUrl, setExistingDocketFileUrl] = useState(toStringValue(initialDocket?.docket_file_url));
  const [sharePointUrl, setSharePointUrl] = useState(toStringValue(initialDocket?.sharepoint_web_url));
  const [, setSharePointStatus] = useState(toStringValue(initialDocket?.sharepoint_sync_status));
  const [, setPublishedPdfName] = useState(toStringValue(initialDocket?.pdf_file_name));

  const [bulkTimeIn, setBulkTimeIn] = useState("");
  const [bulkTimeOut, setBulkTimeOut] = useState("");
  const [showPlantUsedSection, setShowPlantUsedSection] = useState(rateType === "schedule_of_rates");

  const [prestartMinutes, setPrestartMinutes] = useState(toStringValue(initialDocket?.prestart_minutes));
  const [lunchBreakMinutes, setLunchBreakMinutes] = useState(toStringValue(initialDocket?.lunch_break_minutes));
  const [travelInMinutes, setTravelInMinutes] = useState(toStringValue(initialDocket?.travel_in_minutes));
  const [travelOutMinutes, setTravelOutMinutes] = useState(toStringValue(initialDocket?.travel_out_minutes));
  const [mobilisationHours, setMobilisationHours] = useState(toStringValue(initialDocket?.mobilisation_hours));
  const [mobilisationNotes, setMobilisationNotes] = useState(toStringValue(initialDocket?.mobilisation_notes));
  const [incidentOccurred, setIncidentOccurred] = useState(Boolean(initialDocket?.incident_occurred));
  const [incidentType, setIncidentType] = useState(toStringValue(initialDocket?.incident_type));
  const [incidentNotes, setIncidentNotes] = useState(toStringValue(initialDocket?.incident_notes));

  const [labourRows, setLabourRows] = useState<LabourRow[]>(
    initialLabourRows && initialLabourRows.length > 0
      ? initialLabourRows.map((r) => makeLabourRow(r))
      : [blankLabourRow()]
  );

  const [plantRows, setPlantRows] = useState<PlantRow[]>(
    initialPlantRows && initialPlantRows.length > 0
      ? initialPlantRows.map((r) => makePlantRow(r))
      : []
  );

  const [delayRows, setDelayRows] = useState<DelayRow[]>(
    initialDelayRows && initialDelayRows.length > 0
      ? initialDelayRows.map((r) => makeDelayRow(r))
      : []
  );


  const [materialEvents, setMaterialEvents] = useState<MaterialEventDraft[]>([]);
  const [projectTowers, setProjectTowers] = useState<TowerOption[]>([]);
  const [towerRevisionAllocations, setTowerRevisionAllocations] = useState<TowerRevisionAllocation[]>([]);
  const [docketDefectDrafts, setDocketDefectDrafts] = useState<DocketDefectDraft[]>([]);
  const [linkedDocketDefects, setLinkedDocketDefects] = useState<LinkedDocketDefect[]>([]);
  const [pendingExistingDefectIds, setPendingExistingDefectIds] = useState<string[]>([]);
  const [removedLinkedDefectIds, setRemovedLinkedDefectIds] = useState<string[]>([]);
  const [defectIssueTypes, setDefectIssueTypes] = useState<DocketDefectIssueType[]>([]);
  const [defectAssignees, setDefectAssignees] = useState<DocketDefectAssignee[]>([]);
  const [defectMembers, setDefectMembers] = useState<TowerMaterialMember[]>([]);
  const [towerDefectOptions, setTowerDefectOptions] = useState<ExistingTowerDefect[]>([]);
  const [defectLinkSelection, setDefectLinkSelection] = useState("");
  const [primaryWorkActivity, setPrimaryWorkActivity] = useState<ProductionActivity>("mixed");
  const [primaryWorkNotes, setPrimaryWorkNotes] = useState("");
  const [additionalTowerWork, setAdditionalTowerWork] = useState<AdditionalTowerWork[]>([]);
  const [materialCatalog, setMaterialCatalog] = useState<MaterialCatalogItem[]>([]);
  const [missingMaterialIssues, setMissingMaterialIssues] = useState<MissingMaterialIssue[]>([]);
  const [bundleTransfers, setBundleTransfers] = useState<BundleTransferRecord[]>([]);
  const [towerTransferHistory, setTowerTransferHistory] = useState<BundleTransferRecord[]>([]);
  const [bundleCheckQtyById, setBundleCheckQtyById] = useState<Record<string, number>>({});
  const [bundleTransferDrafts, setBundleTransferDrafts] = useState<BundleTransferDraft[]>([]);
  const [bundleTransferReplacementById, setBundleTransferReplacementById] =
    useState<Record<string, BundleTransferReplacementStatus>>({});
  const [bundleTransferReplacementDrafts, setBundleTransferReplacementDrafts] =
    useState<Record<string, BundleTransferReplacementDraft>>({});
  const [transferBusyId, setTransferBusyId] = useState("");
  const [mobilisation, setMobilisation] = useState<MobilisationDraft>({
    enabled:
      toNumber(initialDocket?.mobilisation_hours) > 0 ||
      Boolean(toStringValue(initialDocket?.mobilisation_notes).trim()),
    from_tower_id: "",
    to_tower_id: towerId,
    status: "planning",
    percent_complete: "0",
    started_date: "",
    target_move_date: "",
    completed_date: "",
    notes: "",
    worker_names: [],
  });

  const [progressRows, setProgressRows] = useState<ProgressRow[]>(
    initialProgressRows && initialProgressRows.length > 0
      ? initialProgressRows.map((r) => ({
          section_label: toStringValue(r.section_label),
          assembled_qty: toStringValue(r.assembled_qty),
          erected_qty: toStringValue(r.erected_qty),
        }))
      : DEFAULT_PROGRESS_ROWS
  );

  const [progressModel, setProgressModel] = useState<ProgressModel>(
    initialDocket?.progress_model === "legacy" ? "legacy" : "section_v2"
  );
  const [sectionV2Rows, setSectionV2Rows] = useState<SectionV2ProgressRow[]>(blankSectionV2Rows());
  const [approvalStatus, setApprovalStatus] = useState(toStringValue(initialDocket?.approval_status) || (mode === "create" ? "draft" : "legacy"));
  const [hasBodyExtension, setHasBodyExtension] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [crews, setCrews] = useState<CrewRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [selectedCrewId, setSelectedCrewId] = useState("");
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(["header"])
  );

  function toggleSection(section: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  function expandAllSections() {
    setOpenSections(
      new Set([
        "header",
        "progress",
        "labour",
        "safety",
        "plant",
        "lafha",
        "defects",
        "revision",
        "mobilisation",
        "delays",
        "outstanding-missing",
        "summary",
        "defaults",
        "submission",
      ])
    );
  }

  function collapseAllSections() {
    setOpenSections(new Set());
  }

  const qualityApiFetch = useCallback(
    async (
      input: RequestInfo | URL,
      init: RequestInit = {},
    ) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${session.access_token}`);

      return fetch(input, {
        ...init,
        headers,
        cache: "no-store",
      });
    },
    [supabase],
  );

  useEffect(() => {
    async function loadCrewData() {
      const [{ data: crewData }, { data: employeeData }] = await Promise.all([
        supabase
          .from("crews")
          .select("id, crew_number, crew_name, leading_hand, active")
          .order("crew_number"),
        supabase
          .from("employees")
          .select("id, full_name, role, crew_id, active")
          .order("full_name"),
      ]);

      const nextCrews = ((crewData || []) as CrewRecord[]).filter((crew) => crew.active !== false);
      setCrews(nextCrews);
      setEmployees(((employeeData || []) as EmployeeRecord[]).filter((employee) => employee.active !== false));

      const savedCrewText = crewName.trim().toLowerCase();
      if (savedCrewText) {
        const matchedCrew = nextCrews.find((crew) => {
          const crewNumber = String(crew.crew_number || "").trim().toLowerCase();
          const crewNameValue = String(crew.crew_name || "").trim().toLowerCase();
          return crewNumber === savedCrewText || crewNameValue === savedCrewText;
        });

        if (matchedCrew) setSelectedCrewId(matchedCrew.id);
      }
    }

    const timer = window.setTimeout(() => void loadCrewData(), 0);
    return () => window.clearTimeout(timer);
  }, [crewName, supabase]);

  useEffect(() => {
    async function loadTowerBodyExtensionDefault() {
      const { data } = await supabase
        .from("towers")
        .select("id, name, line, extra_data")
        .eq("id", towerId)
        .single();

      const towerData = data as TowerRecord | null;
      const towerName = String(towerData?.name || "");
      const line = String(towerData?.line || "");

      setTowerLabel(line ? `${towerName} (${line})` : towerName);

      const hasBodyExtFromCsv = inferTowerHasBodyExtension(towerData);
      setHasBodyExtension(hasBodyExtFromCsv);

      if (!hasBodyExtFromCsv) {
        setProgressRows((prev) =>
          prev.map((row) =>
            isBodyExtensionRow(row)
              ? { ...row, assembled_qty: "", erected_qty: "" }
              : row
          )
        );
      }
    }

    const timer = window.setTimeout(() => void loadTowerBodyExtensionDefault(), 0);
    return () => window.clearTimeout(timer);
  }, [supabase, towerId]);


  useEffect(() => {
    async function loadMaterialContext() {
      const { data: towerData } = await supabase
        .from("towers")
        .select("id, name, line, extra_data")
        .eq("project_id", projectId)
        .order("name");

      const towersForProject = ((towerData || []) as any[]).map((tower) => ({
        id: String(tower.id),
        name: String(
          tower.name ||
          tower.extra_data?.tower_number ||
          tower.extra_data?.structure_number ||
          tower.extra_data?.tower_no ||
          "Tower"
        ),
        has_body_extension: inferTowerHasBodyExtension(tower as TowerRecord),
      }));

      setProjectTowers(towersForProject);

      const towerIds = towersForProject.map((tower) => tower.id);
      if (towerIds.length === 0) {
        setMaterialCatalog([]);
        return;
      }

      const [membersRes, bundlesRes] = await Promise.all([
        supabase
          .from("tower_material_members")
          .select("id, tower_id, bundle_id, bundle_reference, drawing_number, mark_no, pn_final, qty_per_tower, section, tower_segment")
          .in("tower_id", towerIds),
        supabase
          .from("tower_required_bundles")
          .select("id, tower_id, bundle_no, section, qty_required, total_weight, member_qty")
          .in("tower_id", towerIds),
      ]);

      const catalog: MaterialCatalogItem[] = [];

      if (!membersRes.error) {
        for (const row of membersRes.data || []) {
          catalog.push({
            source_table: "tower_material_members",
            source_record_id: String(row.id),
            bundle_id: toStringValue(row.bundle_id),
            bundle_no: toStringValue(row.bundle_reference),
            bundle_section: toStringValue(row.tower_segment),
            tower_id: String(row.tower_id),
            item_reference: String(row.mark_no || row.pn_final || row.bundle_reference || "Member"),
            item_description: [
              row.bundle_reference ? `Bundle ${row.bundle_reference}` : "",
              row.tower_segment ? `Bundle section ${row.tower_segment}` : "",
              row.drawing_number ? `Drawing ${row.drawing_number}` : "",
              row.section ? `Profile ${row.section}` : "",
              row.qty_per_tower != null ? `Qty/Tower ${row.qty_per_tower}` : "",
            ].filter(Boolean).join(" · "),
            unit: "ea",
          });
        }
      }


      if (!bundlesRes.error) {
        for (const row of bundlesRes.data || []) {
          catalog.push({
            source_table: "tower_required_bundles",
            source_record_id: String(row.id),
            bundle_id: String(row.id),
            bundle_no: toStringValue(row.bundle_no),
            bundle_section: toStringValue(row.section),
            tower_id: String(row.tower_id),
            item_reference: `Bundle ${String(row.bundle_no || "")}`.trim(),
            item_description: [
              row.section ? `Bundle section ${row.section}` : "",
              row.qty_required != null ? `Required ${row.qty_required}` : "",
            ].filter(Boolean).join(" · ") || "Bundle",
            unit: "bundle",
          });
        }
      }

      setMaterialCatalog(catalog);
    }

    const timer = window.setTimeout(() => void loadMaterialContext(), 0);
    return () => window.clearTimeout(timer);
  }, [projectId, supabase]);

  useEffect(() => {
    let cancelled = false;

    async function loadDefectContext() {
      if (!projectId || !towerId) return;

      const [
        issueResult,
        memberResult,
        defectsResult,
        linksResult,
      ] = await Promise.all([
        supabase
          .from("project_field_issue_types")
          .select("id,name,applies_to,active,sort_order")
          .eq("project_id", projectId)
          .eq("active", true)
          .in("applies_to", ["defect", "both"])
          .order("sort_order")
          .order("name"),
        supabase
          .from("tower_material_members")
          .select(
            "id,tower_id,bundle_reference,drawing_number,mark_no,qty_per_tower,section,tower_segment",
          )
          .eq("tower_id", towerId)
          .order("tower_segment")
          .order("mark_no"),
        supabase
          .from("tower_defects")
          .select(
            "id,defect_number,issue_type_id,member_number,segment,drawing_number,description,severity,status,assigned_to_user_id,assigned_to_label,created_at",
          )
          .eq("project_id", projectId)
          .eq("tower_id", towerId)
          .order("created_at", { ascending: false }),
        docketId
          ? supabase
              .from("tower_docket_defects")
              .select(
                "id,defect_id,link_type,defect:tower_defects(id,defect_number,issue_type_id,member_number,segment,drawing_number,description,severity,status,assigned_to_user_id,assigned_to_label,created_at)",
              )
              .eq("docket_id", docketId)
              .eq("project_id", projectId)
              .eq("tower_id", towerId)
              .order("created_at")
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (cancelled) return;

      if (issueResult.error) {
        console.warn("Defect issue types could not be loaded", issueResult.error);
      } else {
        setDefectIssueTypes(
          (issueResult.data ?? []) as DocketDefectIssueType[],
        );
      }

      if (memberResult.error) {
        console.warn("Defect member register could not be loaded", memberResult.error);
      } else {
        setDefectMembers(
          (memberResult.data ?? []) as TowerMaterialMember[],
        );
      }

      if (defectsResult.error) {
        console.warn("Tower Defects could not be loaded", defectsResult.error);
      } else {
        setTowerDefectOptions(
          (defectsResult.data ?? []) as ExistingTowerDefect[],
        );
      }

      if (linksResult.error) {
        console.warn("Daily Docket Defect links could not be loaded", linksResult.error);
      } else {
        const linkedRows: LinkedDocketDefect[] = [];

        for (const row of linksResult.data ?? []) {
          const defectValue = (row as any).defect;
          const defect = Array.isArray(defectValue)
            ? defectValue[0]
            : defectValue;

          if (!defect) continue;

          linkedRows.push({
            ...(defect as ExistingTowerDefect),
            link_id: String((row as any).id),
            link_type:
              (row as any).link_type === "raised"
                ? "raised"
                : "referenced",
          });
        }

        setLinkedDocketDefects(linkedRows);
      }

      try {
        const response = await qualityApiFetch(
          `/api/quality/defects/notification-settings?projectId=${encodeURIComponent(projectId)}`,
        );
        const payload = (await response.json()) as {
          users?: DocketDefectAssignee[];
          error?: string;
        };

        if (!cancelled && response.ok) {
          setDefectAssignees(payload.users ?? []);
        } else if (!response.ok) {
          console.warn(
            "Defect assignees could not be loaded",
            payload.error || response.statusText,
          );
        }
      } catch (error) {
        console.warn("Defect assignees could not be loaded", error);
      }
    }

    const timer = window.setTimeout(() => void loadDefectContext(), 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [docketId, projectId, qualityApiFetch, supabase, towerId]);

  useEffect(() => {
    async function loadMissingMaterialIssues() {
      const [missingEventsRes, receivedEventsRes] = await Promise.all([
        supabase
          .from("tower_material_events")
          .select(`
            id,
            docket_id,
            occurred_at,
            items:tower_material_event_items(
              id,
              issue_key,
              source_issue_key,
              source_table,
              source_record_id,
              bundle_id,
              bundle_no,
              bundle_section,
              material_type,
              bolt_size,
              item_reference,
              item_description,
              quantity,
              unit
            )
          `)
          .eq("tower_id", towerId)
          .eq("event_type", "missing")
          .order("occurred_at", { ascending: true }),
        supabase
          .from("tower_material_events")
          .select(`
            id,
            docket_id,
            occurred_at,
            items:tower_material_event_items(
              source_issue_key,
              quantity
            )
          `)
          .eq("tower_id", towerId)
          .eq("event_type", "found_received"),
      ]);

      if (missingEventsRes.error) {
        console.warn("Outstanding missing material could not be loaded", missingEventsRes.error);
        setMissingMaterialIssues([]);
        return;
      }

      if (receivedEventsRes.error) {
        console.warn("Material receipt history could not be loaded", receivedEventsRes.error);
      }

      const receivedByIssue = new Map<string, number>();

      for (const event of (receivedEventsRes.data || []) as any[]) {
        for (const item of event.items || []) {
          const sourceIssueKey = toStringValue(item.source_issue_key);
          if (!sourceIssueKey) continue;
          receivedByIssue.set(
            sourceIssueKey,
            (receivedByIssue.get(sourceIssueKey) || 0) + Math.max(toNumber(item.quantity), 0)
          );
        }
      }

      const issues: MissingMaterialIssue[] = [];

      for (const event of (missingEventsRes.data || []) as any[]) {
        for (const item of event.items || []) {
          const issueKey = toStringValue(item.issue_key);
          if (!issueKey) continue;

          const originalQuantity = Math.max(toNumber(item.quantity), 0);
          const receivedQuantity = Math.max(receivedByIssue.get(issueKey) || 0, 0);

          issues.push({
            issue_key: issueKey,
            source_table: toStringValue(item.source_table),
            source_record_id: toStringValue(item.source_record_id),
            bundle_id: toStringValue(item.bundle_id),
            bundle_no: toStringValue(item.bundle_no),
            bundle_section: toStringValue(item.bundle_section),
            item_reference:
              toStringValue(item.item_reference) ||
              toStringValue(item.bolt_size) ||
              "Material item",
            item_description: toStringValue(item.item_description),
            original_quantity: originalQuantity,
            received_quantity: receivedQuantity,
            remaining_quantity: Math.max(originalQuantity - receivedQuantity, 0),
            unit: toStringValue(item.unit) || "ea",
            first_reported_at: toStringValue(event.occurred_at),
            source_docket_id: toStringValue(event.docket_id),
          });
        }
      }

      setMissingMaterialIssues(issues);
    }

    const timer = window.setTimeout(() => void loadMissingMaterialIssues(), 0);
    return () => window.clearTimeout(timer);
  }, [supabase, towerId]);

  useEffect(() => {
    async function loadBundleTransferContext() {
      if (!projectId || !towerId) return;

      const projectBundleIds = materialCatalog
        .filter((item) => item.source_table === "tower_required_bundles")
        .map((item) => item.source_record_id)
        .filter(Boolean);

      const transferPromise = supabase
        .from("tower_material_transfers")
        .select("*")
        .eq("project_id", projectId)
        .order("transferred_at", { ascending: false });

      const checkPromise =
        projectBundleIds.length > 0
          ? supabase
              .from("tower_material_bundle_checks")
              .select("bundle_id, qty_received")
              .in("bundle_id", projectBundleIds)
          : Promise.resolve({ data: [], error: null } as any);

      const [transferRes, checkRes] = await Promise.all([
        transferPromise,
        checkPromise,
      ]);

      if (transferRes.error) {
        console.warn("Bundle transfers could not be loaded", transferRes.error);
        setBundleTransfers([]);
        setTowerTransferHistory([]);
        setBundleTransferReplacementById({});
      } else {
        const rows = ((transferRes.data || []) as any[]).map((row) => ({
          id: toStringValue(row.id),
          transfer_no: row.transfer_no == null ? null : Number(row.transfer_no),
          project_id: toStringValue(row.project_id),
          source_tower_id: toStringValue(row.source_tower_id),
          destination_tower_id: toStringValue(row.destination_tower_id),
          source_bundle_id: toStringValue(row.source_bundle_id),
          destination_bundle_id: toStringValue(row.destination_bundle_id),
          bundle_no: toStringValue(row.bundle_no),
          bundle_section: toStringValue(row.bundle_section),
          quantity: Math.max(toNumber(row.quantity), 0),
          status: (toStringValue(row.status) || "in_transit") as BundleTransferStatus,
          transferred_by_name: toStringValue(row.transferred_by_name),
          transferred_at: toStringValue(row.transferred_at) || null,
          received_by_name: toStringValue(row.received_by_name),
          received_at: toStringValue(row.received_at) || null,
          source_docket_id: toStringValue(row.source_docket_id),
          destination_docket_id: toStringValue(row.destination_docket_id),
          notes: toStringValue(row.notes),
        }));

        setTowerTransferHistory(rows);

        const transferIds = rows.map((row) => row.id).filter(Boolean);
        const replacementStatus: Record<string, BundleTransferReplacementStatus> = {};

        if (transferIds.length > 0) {
          const { data: transferEvents, error: transferEventsError } = await supabase
            .from("tower_material_events")
            .select(`
              id,
              transfer_id,
              tower_id,
              event_type,
              occurred_at,
              items:tower_material_event_items(
                id,
                issue_key,
                source_issue_key,
                quantity
              )
            `)
            .in("transfer_id", transferIds)
            .in("event_type", ["missing", "found_received"])
            .order("occurred_at", { ascending: true });

          if (transferEventsError) {
            console.warn(
              "Bundle transfer replacement status could not be loaded",
              transferEventsError
            );
          } else {
            const missingByTransfer = new Map<
              string,
              { issueKey: string; quantity: number; occurredAt: string | null }
            >();
            const receiptsByIssue = new Map<
              string,
              { quantity: number; occurredAt: string | null }[]
            >();

            for (const event of (transferEvents || []) as any[]) {
              const transferId = toStringValue(event.transfer_id);
              if (!transferId) continue;

              if (event.event_type === "missing") {
                for (const item of event.items || []) {
                  const issueKey = toStringValue(item.issue_key);
                  if (!issueKey) continue;
                  missingByTransfer.set(transferId, {
                    issueKey,
                    quantity: Math.max(toNumber(item.quantity), 0),
                    occurredAt: toStringValue(event.occurred_at) || null,
                  });
                }
              }

              if (event.event_type === "found_received") {
                for (const item of event.items || []) {
                  const sourceIssueKey = toStringValue(item.source_issue_key);
                  if (!sourceIssueKey) continue;
                  const list = receiptsByIssue.get(sourceIssueKey) || [];
                  list.push({
                    quantity: Math.max(toNumber(item.quantity), 0),
                    occurredAt: toStringValue(event.occurred_at) || null,
                  });
                  receiptsByIssue.set(sourceIssueKey, list);
                }
              }
            }

            for (const transfer of rows) {
              const missing = missingByTransfer.get(transfer.id);
              if (!missing) continue;

              const receipts = receiptsByIssue.get(missing.issueKey) || [];
              const delivered = receipts.reduce(
                (sum, row) => sum + row.quantity,
                0
              );

              replacementStatus[transfer.id] = {
                transfer_id: transfer.id,
                issue_key: missing.issueKey,
                original_quantity: missing.quantity,
                delivered_quantity: delivered,
                remaining_quantity: Math.max(missing.quantity - delivered, 0),
                first_reported_at: missing.occurredAt,
                last_delivery_at:
                  receipts.length > 0
                    ? receipts[receipts.length - 1].occurredAt
                    : null,
              };
            }
          }
        }

        setBundleTransferReplacementById(replacementStatus);

        const relevant = rows.filter((row) => {
          // Daily Dockets report bundle transfers from the CURRENT tower's
          // receiving perspective: "Taken from another tower". Outgoing
          // movements remain visible in Materials Control but are not
          // automatically presented to the client on this docket.
          if (row.destination_tower_id !== towerId) return false;

          if (docketId && row.destination_docket_id === docketId) {
            return true;
          }

          if (!docketDate) return false;
          return (
            isoDateOnly(row.received_at) === docketDate ||
            (row.status === "in_transit" &&
              isoDateOnly(row.transferred_at) === docketDate)
          );
        });

        setBundleTransfers(relevant);
      }

      if (checkRes.error) {
        console.warn("Bundle site-check quantities could not be loaded", checkRes.error);
        setBundleCheckQtyById({});
      } else {
        const next: Record<string, number> = {};
        for (const row of checkRes.data || []) {
          const bundleId = toStringValue((row as any).bundle_id);
          if (!bundleId) continue;
          next[bundleId] = Math.max(toNumber((row as any).qty_received), 0);
        }
        setBundleCheckQtyById(next);
      }
    }

    const timer = window.setTimeout(() => void loadBundleTransferContext(), 0);
    return () => window.clearTimeout(timer);
  }, [docketDate, docketId, materialCatalog, projectId, supabase, towerId]);

  useEffect(() => {
    async function loadV2ProgressConfig() {
      const { data } = await supabase
        .from("project_docket_progress_weights")
        .select("section_code,section_label,assembly_weight,erection_weight,sort_order,active")
        .eq("project_id", projectId)
        .eq("active", true)
        .order("sort_order");

      if (!data?.length) return;
      setSectionV2Rows((prev) => {
        const previous = new Map<string, SectionV2ProgressRow>(prev.map((r) => [r.section_code, r]));
        return data.map((r: any) => {
          const old = previous.get(String(r.section_code));
          return {
            section_code: String(r.section_code),
            section_label: String(r.section_label || r.section_code),
            assembly_today: old?.assembly_today || "",
            erection_today: old?.erection_today || "",
            assembly_weight: SECTION_PROGRESS_WEIGHTS[String(r.section_code)] ?? 0,
            erection_weight: SECTION_PROGRESS_WEIGHTS[String(r.section_code)] ?? 0,
          };
        });
      });
    }
    const timer = window.setTimeout(() => void loadV2ProgressConfig(), 0);
    return () => window.clearTimeout(timer);
  }, [projectId, supabase]);

  useEffect(() => {
    if (!docketId && !initialDocket) return;

    async function loadDocket() {
      if (initialDocket) {
        setDocketDate(toStringValue(initialDocket.docket_date));
        setCrewName(toStringValue(initialDocket.crew));
        setLeadingHand(toStringValue(initialDocket.leading_hand));
        setWeather(toStringValue(initialDocket.weather));
        setRateType(initialDocket.rate_type === "schedule_of_rates" ? "schedule_of_rates" : "tonnage_rate");
        setProgressModel(initialDocket.progress_model === "section_v2" ? "section_v2" : "legacy");
        setApprovalStatus(toStringValue(initialDocket.approval_status) || "legacy");

        setWeatherDelayHours(toStringValue(initialDocket.weather_delay_hours));
        setLightningDelayHours(toStringValue(initialDocket.lightning_delay_hours));
        setToolboxDelayHours(toStringValue(initialDocket.toolbox_delay_hours));
        setOtherDelayHours(toStringValue(initialDocket.other_delay_hours));
        setOtherDelayReason(toStringValue(initialDocket.other_delay_reason));
        setMissingItemsBolts(toStringValue(initialDocket.missing_items_bolts));
        const initialDelayComments = toStringValue(initialDocket.delays_comments);
        setDelaysComments(stripMobilisationMetadata(initialDelayComments));
        setDailySiteSummary(
          toStringValue(initialDocket.daily_site_summary) ||
            stripMobilisationMetadata(initialDelayComments)
        );
        setRfiReferencesText(rfiReferencesToText(initialDocket.rfi_references));

        const mobilisationLine = initialDelayComments
          .split("\n")
          .find((line) => line.startsWith("MOBILISATION|"));

        if (mobilisationLine) {
          const values = Object.fromEntries(
            mobilisationLine
              .split("|")
              .slice(1)
              .map((part) => {
                const [key, ...rest] = part.split("=");
                return [key, rest.join("=")];
              })
          );

          setMobilisation({
            enabled: true,
            from_tower_id: values.from || "",
            to_tower_id: values.to || towerId,
            status: (values.status || "planning") as MobilisationStatus,
            percent_complete: values.progress || "0",
            started_date: values.started || "",
            target_move_date: values.target || "",
            completed_date: values.completed || "",
            notes: values.notes || toStringValue(initialDocket.mobilisation_notes),
            worker_names: values.workers ? values.workers.split(",").map((name) => name.trim()).filter(Boolean) : [],
          });

          if (values.hours) {
            setMobilisationHours(values.hours);
          } else if (values.minutes) {
            setMobilisationHours(String(minutesToHours(values.minutes)));
          }
          if (values.notes) setMobilisationNotes(values.notes);
        }

        setPrestartMinutes(toStringValue(initialDocket.prestart_minutes));
        setLunchBreakMinutes(toStringValue(initialDocket.lunch_break_minutes));
        setTravelInMinutes(toStringValue(initialDocket.travel_in_minutes));
        setTravelOutMinutes(toStringValue(initialDocket.travel_out_minutes));
        setMobilisationHours(toStringValue(initialDocket.mobilisation_hours));
        setMobilisationNotes(toStringValue(initialDocket.mobilisation_notes));
        if (!mobilisationLine && (toNumber(initialDocket.mobilisation_hours) > 0 || toStringValue(initialDocket.mobilisation_notes).trim())) {
          setMobilisation((prev) => ({
            ...prev,
            enabled: true,
            notes: toStringValue(initialDocket.mobilisation_notes),
          }));
        }
        setIncidentOccurred(Boolean(initialDocket.incident_occurred));
        setIncidentType(toStringValue(initialDocket.incident_type));
        setIncidentNotes(toStringValue(initialDocket.incident_notes));

        setBcRepName(toStringValue(initialDocket.bc_rep_name));
        setBcSignatureDataUrl(toStringValue(initialDocket.bc_signature_data_url));
        setBcSignedAt(toStringValue(initialDocket.bc_signed_at));
        setClientRepName(toStringValue(initialDocket.client_rep_name));
        setSignedDate(toStringValue(initialDocket.signed_date));
        setExistingDocketFileUrl(toStringValue(initialDocket.docket_file_url));
        setSharePointUrl(toStringValue(initialDocket.sharepoint_web_url));
        setSharePointStatus(toStringValue(initialDocket.sharepoint_sync_status));
        setPublishedPdfName(toStringValue(initialDocket.pdf_file_name));

        if (initialLabourRows?.length) setLabourRows(initialLabourRows.map((r) => makeLabourRow(r)));

        if (initialDelayRows?.length) {
          setDelayRows(initialDelayRows.map((r) => makeDelayRow(r)));
        } else if (docketId) {
          const { data: delays } = await supabase
            .from("tower_docket_delays")
            .select("*")
            .eq("docket_id", docketId);

          if (delays && delays.length > 0) {
            setDelayRows((delays as DbDelayRow[]).map((r) => makeDelayRow(r)));
          } else if (initialLabourRows?.length) {
            setDelayRows(
              initialLabourRows
                .filter((r) => Number(r.delay_hours || 0) > 0)
                .map((r) =>
                  makeDelayRow({
                    delay_type: "other",
                    delay_reason: r.delay_reason || "Legacy labour delay",
                    delay_hours: r.delay_hours,
                    applies_to: "selected_workers",
                    worker_names: [r.worker_name],
                  })
                )
            );
          }
        }

        if (initialPlantRows?.length) setPlantRows(initialPlantRows.map((r) => makePlantRow(r)));

        if (initialProgressRows?.length) {
          const rawRows = (initialProgressRows as any[]).filter((row) => !row.tower_id || String(row.tower_id) === towerId);
          const isV2 = initialDocket.progress_model === "section_v2" || rawRows.some((r) => r.progress_model === "section_v2");
          if (isV2) {
            setProgressModel("section_v2");
            setSectionV2Rows((configured) => configured.map((cfg) => {
              const r = rawRows.find((x) => String(x.section_code || "") === cfg.section_code);
              return r ? {
                ...cfg,
                section_label: toStringValue(r.section_label || cfg.section_label),
                assembly_today: toStringValue(r.assembly_today ?? r.assembly_overall ?? r.assembled_qty),
                erection_today: toStringValue(r.erection_today ?? r.erection_overall ?? r.erected_qty),
                assembly_weight: SECTION_PROGRESS_WEIGHTS[cfg.section_code] ?? cfg.assembly_weight,
                erection_weight: SECTION_PROGRESS_WEIGHTS[cfg.section_code] ?? cfg.erection_weight,
              } : cfg;
            }));
          } else {
            setProgressRows(rawRows.map((r) => ({
              section_label: toStringValue(r.section_label),
              assembled_qty: toStringValue(r.assembled_qty),
              erected_qty: toStringValue(r.erected_qty),
            })));
          }
        }

        if (docketId) {
          const { data: events } = await supabase
            .from("tower_material_events")
            .select(`
              *,
              items:tower_material_event_items(*),
              people:tower_material_event_people(*),
              plant:tower_material_event_plant(*)
            `)
            .eq("docket_id", docketId)
            .eq("tower_id", towerId)
            .is("transfer_id", null)
            .order("occurred_at", { ascending: true });

          if (events?.length) {
            setMaterialEvents(events.map((event: any) => ({
              ui_id: makeUiId(),
              id: String(event.id),
              event_type: (event.event_type || "missing") as MaterialEventType,
              source_tower_id: toStringValue(event.source_tower_id),
              destination_tower_id: toStringValue(event.destination_tower_id),
              source_location: toStringValue(event.source_location),
              destination_location: toStringValue(event.destination_location),
              occurred_time: timeFromIso(event.occurred_at),
              affected_work: Boolean(event.affected_work),
              affected_activity: toStringValue(event.affected_activity),
              affected_section: toStringValue(event.affected_section),
              work_outcome: (event.work_outcome || "") as MaterialWorkOutcome,
              impact_start_time: timeFromIso(event.impact_started_at),
              impact_finish_time: timeFromIso(event.impact_finished_at),
              impact_ongoing: Boolean(event.impact_ongoing),
              current_effect: toStringValue(event.current_effect),
              mitigation_actions: Array.isArray(event.mitigation_actions) ? event.mitigation_actions : [],
              notes: toStringValue(event.notes),
              items: (event.items || []).map((item: any) => ({
                ui_id: makeUiId(),
                search_mode:
                  item.source_table === "tower_required_bundles" ? "bundle" : "member",
                source_table: toStringValue(item.source_table),
                source_record_id: toStringValue(item.source_record_id),
                issue_key: toStringValue(item.issue_key),
                source_issue_key: toStringValue(item.source_issue_key),
                bundle_id: toStringValue(item.bundle_id),
                bundle_no: toStringValue(item.bundle_no),
                bundle_section: toStringValue(item.bundle_section),
                material_kind:
                  item.material_type === "bolt" &&
                  !item.source_table &&
                  !item.source_record_id
                    ? "manual_bolt"
                    : item.source_table || item.source_record_id
                    ? "registered"
                    : "manual",
                manual_category:
                  !item.source_table &&
                  !item.source_record_id &&
                  item.material_type !== "bolt"
                    ? toStringValue(item.item_description).split(" · ")[0] || ""
                    : "",
                bolt_size:
                  item.material_type === "bolt"
                    ? toStringValue(item.bolt_size || item.item_reference)
                    : "",
                search_query: "",
                search_loading: false,
                search_results: [],
                item_reference:
                  item.material_type === "bolt" &&
                  !item.source_table &&
                  !item.source_record_id
                    ? ""
                    : toStringValue(item.item_reference),
                item_description: toStringValue(item.item_description),
                quantity: toStringValue(item.quantity || 1),
                unit: toStringValue(item.unit || "ea"),
              })),
              people: (event.people || []).map((person: any) => ({
                ui_id: makeUiId(),
                employee_id: toStringValue(person.employee_id),
                employee_name: toStringValue(person.employee_name),
                employee_role: toStringValue(person.employee_role),
                started_at: timeFromIso(person.started_at),
                finished_at: timeFromIso(person.finished_at),
              })),
              plant: (event.plant || []).map((plantRow: any) => ({
                ui_id: makeUiId(),
                plant_name: toStringValue(plantRow.plant_name),
                asset_number: toStringValue(plantRow.asset_number),
                started_at: timeFromIso(plantRow.started_at),
                finished_at: timeFromIso(plantRow.finished_at),
              })),
            })));
          }
        }

        return;
      }

      const { data } = await supabase
        .from("tower_daily_dockets")
        .select("*")
        .eq("id", docketId)
        .single();

      if (!data) return;

      setDocketDate(toStringValue(data.docket_date));
      setCrewName(toStringValue(data.crew));
      setLeadingHand(toStringValue(data.leading_hand));
      setWeather(toStringValue(data.weather));
      setRateType(data.rate_type === "schedule_of_rates" ? "schedule_of_rates" : "tonnage_rate");
      setProgressModel(data.progress_model === "section_v2" ? "section_v2" : "legacy");
      setApprovalStatus(toStringValue(data.approval_status) || "legacy");

      setWeatherDelayHours(toStringValue(data.weather_delay_hours));
      setLightningDelayHours(toStringValue(data.lightning_delay_hours));
      setToolboxDelayHours(toStringValue(data.toolbox_delay_hours));
      setOtherDelayHours(toStringValue(data.other_delay_hours));
      setOtherDelayReason(toStringValue(data.other_delay_reason));
      setMissingItemsBolts(toStringValue(data.missing_items_bolts));
      setDelaysComments(stripMobilisationMetadata(data.delays_comments));
      setDailySiteSummary(
        toStringValue(data.daily_site_summary) ||
          stripMobilisationMetadata(data.delays_comments)
      );
      setRfiReferencesText(rfiReferencesToText(data.rfi_references));

      setPrestartMinutes(toStringValue(data.prestart_minutes));
      setLunchBreakMinutes(toStringValue(data.lunch_break_minutes));
      setTravelInMinutes(toStringValue(data.travel_in_minutes));
      setTravelOutMinutes(toStringValue(data.travel_out_minutes));
      setMobilisationHours(toStringValue(data.mobilisation_hours));
      setMobilisationNotes(toStringValue(data.mobilisation_notes));
      if (toNumber(data.mobilisation_hours) > 0 || toStringValue(data.mobilisation_notes).trim()) {
        setMobilisation((prev) => ({
          ...prev,
          enabled: true,
          notes: toStringValue(data.mobilisation_notes),
        }));
      }
      setIncidentOccurred(Boolean(data.incident_occurred));
      setIncidentType(toStringValue(data.incident_type));
      setIncidentNotes(toStringValue(data.incident_notes));

      setBcRepName(toStringValue(data.bc_rep_name));
      setBcSignatureDataUrl(toStringValue(data.bc_signature_data_url));
      setBcSignedAt(toStringValue(data.bc_signed_at));
      setClientRepName(toStringValue(data.client_rep_name));
      setSignedDate(toStringValue(data.signed_date));
      setExistingDocketFileUrl(toStringValue(data.docket_file_url));
      setSharePointUrl(toStringValue(data.sharepoint_web_url));
      setSharePointStatus(toStringValue(data.sharepoint_sync_status));
      setPublishedPdfName(toStringValue(data.pdf_file_name));

      const [
        { data: labour },
        { data: delays },
        { data: plant },
        { data: progress },
        { data: structuredMaterialEvents },
        { data: revisionAllocations },
      ] = await Promise.all([
        supabase.from("tower_docket_labour").select("*").eq("docket_id", docketId),
        supabase.from("tower_docket_delays").select("*").eq("docket_id", docketId),
        supabase.from("tower_docket_plant").select("*").eq("docket_id", docketId),
        supabase.from("tower_docket_progress").select("*").eq("docket_id", docketId),
        supabase
          .from("tower_material_events")
          .select(`
            *,
            items:tower_material_event_items(*),
            people:tower_material_event_people(*),
            plant:tower_material_event_plant(*)
          `)
          .eq("docket_id", docketId)
          .eq("tower_id", towerId)
          .is("transfer_id", null)
          .order("occurred_at", { ascending: true }),
        supabase
          .from("tower_docket_hour_allocations")
          .select("*")
          .eq("docket_id", docketId)
          .order("created_at", { ascending: true }),
      ]);

      if (labour && labour.length > 0) setLabourRows(labour.map((r) => makeLabourRow(r)));

      setTowerRevisionAllocations(
        ((revisionAllocations || []) as any[])
          .filter(
            (row) =>
              !row.allocation_type ||
              String(row.allocation_type) === "revision"
          )
          .map((row) => ({
            id: row.id,
            ui_id: row.id || makeUiId(),
            target_tower_id: toStringValue(row.target_tower_id),
            hours: toStringValue(row.hours),
            worker_names: Array.isArray(row.worker_names) ? row.worker_names.map(String) : [],
            reason: toStringValue(row.reason),
          }))
      );

      if (delays && delays.length > 0) {
        setDelayRows((delays as DbDelayRow[]).map((r) => makeDelayRow(r)));
      } else if (labour && labour.length > 0) {
        setDelayRows(
          (labour as any[])
            .filter((r) => Number(r.delay_hours || 0) > 0)
            .map((r) =>
              makeDelayRow({
                delay_type: "other",
                delay_reason: r.delay_reason || "Legacy labour delay",
                delay_hours: r.delay_hours,
                applies_to: "selected_workers",
                worker_names: [r.worker_name],
              })
            )
        );
      }

      if (plant && plant.length > 0) setPlantRows(plant.map((r) => makePlantRow(r)));

      if (progress && progress.length > 0) {
        const rawRows = (progress as any[]).filter((row) => !row.tower_id || String(row.tower_id) === towerId);
        const isV2 = data.progress_model === "section_v2" || rawRows.some((r) => r.progress_model === "section_v2");
        if (isV2) {
          setProgressModel("section_v2");
          setSectionV2Rows((configured) => configured.map((cfg) => {
            const r = rawRows.find((x) => String(x.section_code || "") === cfg.section_code);
            return r ? {
              ...cfg,
              section_label: toStringValue(r.section_label || cfg.section_label),
              assembly_today: toStringValue(r.assembly_today ?? r.assembly_overall ?? r.assembled_qty),
              erection_today: toStringValue(r.erection_today ?? r.erection_overall ?? r.erected_qty),
              assembly_weight: SECTION_PROGRESS_WEIGHTS[cfg.section_code] ?? cfg.assembly_weight,
              erection_weight: SECTION_PROGRESS_WEIGHTS[cfg.section_code] ?? cfg.erection_weight,
            } : cfg;
          }));
        } else {
          setProgressRows(rawRows.map((r) => ({
            section_label: toStringValue(r.section_label),
            assembled_qty: toStringValue(r.assembled_qty),
            erected_qty: toStringValue(r.erected_qty),
          })));
        }
      }


      if (structuredMaterialEvents && structuredMaterialEvents.length > 0) {
        setMaterialEvents(structuredMaterialEvents.map((event: any) => ({
          ui_id: makeUiId(),
          id: String(event.id),
          event_type: (event.event_type || "missing") as MaterialEventType,
          source_tower_id: toStringValue(event.source_tower_id),
          destination_tower_id: toStringValue(event.destination_tower_id),
          source_location: toStringValue(event.source_location),
          destination_location: toStringValue(event.destination_location),
          occurred_time: timeFromIso(event.occurred_at),
          affected_work: Boolean(event.affected_work),
          affected_activity: toStringValue(event.affected_activity),
          affected_section: toStringValue(event.affected_section),
          work_outcome: (event.work_outcome || "") as MaterialWorkOutcome,
          impact_start_time: timeFromIso(event.impact_started_at),
          impact_finish_time: timeFromIso(event.impact_finished_at),
          impact_ongoing: Boolean(event.impact_ongoing),
          current_effect: toStringValue(event.current_effect),
          mitigation_actions: Array.isArray(event.mitigation_actions) ? event.mitigation_actions : [],
          notes: toStringValue(event.notes),
          items: (event.items || []).map((item: any) => ({
            ui_id: makeUiId(),
            search_mode:
              item.source_table === "tower_required_bundles" ? "bundle" : "member",
            source_table: toStringValue(item.source_table),
            source_record_id: toStringValue(item.source_record_id),
            issue_key: toStringValue(item.issue_key),
            source_issue_key: toStringValue(item.source_issue_key),
            bundle_id: toStringValue(item.bundle_id),
            bundle_no: toStringValue(item.bundle_no),
            bundle_section: toStringValue(item.bundle_section),
            material_kind:
              item.material_type === "bolt" &&
              !item.source_table &&
              !item.source_record_id
                ? "manual_bolt"
                : item.source_table || item.source_record_id
                ? "registered"
                : "manual",
            manual_category:
              !item.source_table &&
              !item.source_record_id &&
              item.material_type !== "bolt"
                ? toStringValue(item.item_description).split(" · ")[0] || ""
                : "",
            bolt_size:
              item.material_type === "bolt"
                ? toStringValue(item.bolt_size || item.item_reference)
                : "",
            search_query: "",
            search_loading: false,
            search_results: [],
            item_reference:
              item.material_type === "bolt" &&
              !item.source_table &&
              !item.source_record_id
                ? ""
                : toStringValue(item.item_reference),
            item_description: toStringValue(item.item_description),
            quantity: toStringValue(item.quantity || 1),
            unit: toStringValue(item.unit || "ea"),
          })),
          people: (event.people || []).map((person: any) => ({
            ui_id: makeUiId(),
            employee_id: toStringValue(person.employee_id),
            employee_name: toStringValue(person.employee_name),
            employee_role: toStringValue(person.employee_role),
            started_at: timeFromIso(person.started_at),
            finished_at: timeFromIso(person.finished_at),
          })),
          plant: (event.plant || []).map((plantRow: any) => ({
            ui_id: makeUiId(),
            plant_name: toStringValue(plantRow.plant_name),
            asset_number: toStringValue(plantRow.asset_number),
            started_at: timeFromIso(plantRow.started_at),
            finished_at: timeFromIso(plantRow.finished_at),
          })),
        })));
      }
    }

    const timer = window.setTimeout(() => void loadDocket(), 0);
    return () => window.clearTimeout(timer);
  }, [
    docketId,
    initialDocket,
    initialLabourRows,
    initialProgressRows,
    initialDelayRows,
    initialPlantRows,
    supabase,
    towerId,
  ]);

  useEffect(() => {
    if (!docketId) return;

    async function loadProductionAllocations() {
      const [{ data: allocationRows, error: allocationError }, { data: progressRowsData, error: progressError }] =
        await Promise.all([
          supabase
            .from("tower_docket_hour_allocations")
            .select("*")
            .eq("docket_id", docketId)
            .order("created_at", { ascending: true }),
          supabase
            .from("tower_docket_progress")
            .select("*")
            .eq("docket_id", docketId),
        ]);

      if (allocationError) {
        console.warn("Production tower allocations could not be loaded", allocationError);
        return;
      }

      if (progressError) {
        console.warn("Additional tower progress could not be loaded", progressError);
      }

      const allAllocationRows = (allocationRows || []) as any[];

      setTowerRevisionAllocations(
        allAllocationRows
          .filter(
            (row) =>
              !row.allocation_type ||
              String(row.allocation_type) === "revision"
          )
          .map((row) => ({
            id: row.id,
            ui_id: row.id || makeUiId(),
            target_tower_id: toStringValue(row.target_tower_id),
            hours: toStringValue(row.hours),
            worker_names: Array.isArray(row.worker_names)
              ? row.worker_names.map(String)
              : [],
            reason: toStringValue(row.reason),
          }))
      );

      const productionRows = allAllocationRows.filter(
        (row) => String(row.allocation_type || "") === "production"
      );
      const primary = productionRows.find(
        (row) => toStringValue(row.target_tower_id) === towerId
      );

      if (primary) {
        setPrimaryWorkActivity(
          (toStringValue(primary.activity) || "mixed") as ProductionActivity
        );
        setPrimaryWorkNotes(toStringValue(primary.reason));
      } else {
        setPrimaryWorkActivity("mixed");
        setPrimaryWorkNotes("");
      }

      const extraRows = productionRows.filter(
        (row) =>
          toStringValue(row.target_tower_id) &&
          toStringValue(row.target_tower_id) !== towerId
      );

      const allProgress = (progressRowsData || []) as any[];

      setAdditionalTowerWork(
        extraRows.map((row) => {
          const targetTowerId = toStringValue(row.target_tower_id);
          const towerOption = projectTowers.find((tower) => tower.id === targetTowerId);
          const savedProgress = allProgress.filter(
            (progressRow) => toStringValue(progressRow.tower_id) === targetTowerId
          );

          const progressRowsForTower = blankSectionV2Rows().map((cfg) => {
            const saved = savedProgress.find(
              (progressRow) =>
                toStringValue(progressRow.section_code).toUpperCase() ===
                cfg.section_code.toUpperCase()
            );

            return saved
              ? {
                  ...cfg,
                  section_label: toStringValue(saved.section_label) || cfg.section_label,
                  assembly_today: toStringValue(
                    saved.assembly_overall ??
                      saved.assembly_today ??
                      saved.assembled_qty
                  ),
                  erection_today: toStringValue(
                    saved.erection_overall ??
                      saved.erection_today ??
                      saved.erected_qty
                  ),
                  assembly_weight:
                    SECTION_PROGRESS_WEIGHTS[cfg.section_code] ?? cfg.assembly_weight,
                  erection_weight:
                    SECTION_PROGRESS_WEIGHTS[cfg.section_code] ?? cfg.erection_weight,
                }
              : cfg;
          });

          return {
            id: row.id,
            ui_id: row.id || makeUiId(),
            target_tower_id: targetTowerId,
            allocation_percent: "",
            saved_allocated_mh:
              toNumber(row.hours) *
              (Array.isArray(row.worker_names) ? row.worker_names.length : 0),
            activity:
              (toStringValue(row.activity) || "mixed") as ProductionActivity,
            notes: toStringValue(row.reason),
            has_body_extension: towerOption?.has_body_extension ?? true,
            progress_rows: progressRowsForTower,
          };
        })
      );
    }

    const timer = window.setTimeout(() => void loadProductionAllocations(), 0);
    return () => window.clearTimeout(timer);
  }, [docketId, projectTowers, supabase, towerId]);

  const locked = useMemo(() => {
    if (isClientSignedDocket({ client_rep_name: clientRepName, signed_date: signedDate })) return true;
    return ["submitted_bc","client_pending","final","legacy_final"].includes(approvalStatus);
  }, [clientRepName, signedDate, approvalStatus]);

  const duplicateWorkerIndexes = useMemo(() => getDuplicateWorkerIndexes(labourRows), [labourRows]);
  const hasDuplicateWorkers = duplicateWorkerIndexes.size > 0;

  const visibleProgressRows = useMemo(() => {
    return progressRows.filter((row) => !(!hasBodyExtension && isBodyExtensionRow(row)));
  }, [progressRows, hasBodyExtension]);

  const progressTotals = useMemo(
    () =>
      calculateProgressTotals({
        progressModel,
        sectionV2Rows,
        legacyRows: visibleProgressRows,
        hasBodyExtension,
      }),
    [progressModel, sectionV2Rows, visibleProgressRows, hasBodyExtension]
  );

  const totalAssemblyPercent = progressTotals.assemblyPercent;
  const totalErectionPercent = progressTotals.erectionPercent;
  const displayProgress = progressTotals.totalProgressPercent;

  function updateSectionV2(
    index: number,
    key: "assembly_today" | "erection_today",
    value: string
  ) {
    if (isView || locked) return;

    const nextValue =
      value.trim() === ""
        ? ""
        : clampPercentString(value);

    setSectionV2Rows((prev) =>
      prev.map((row, i) =>
        i === index
          ? { ...row, [key]: nextValue }
          : row
      )
    );
  }

  const availableWorkerNames = useMemo(() => uniqueWorkerNames(labourRows), [labourRows]);

  const labourTotals = useMemo(
    () =>
      calculateLabourTotals(labourRows, delayRows, {
        enabled: mobilisation.enabled,
        durationMinutes: hoursToMinutes(mobilisationHours),
        workerNames: mobilisation.worker_names,
      }),
    [labourRows, delayRows, mobilisation.enabled, mobilisation.worker_names, mobilisationHours]
  );

  const labourRowsWithProduction = labourTotals.rows as LabourRow[];
  const labourWorkerCount = labourTotals.workerCount;
  const totalLabourHours = labourTotals.rawManhours;
  const totalProductionHours = labourTotals.productionManhours;
  const totalPrestartHours = labourTotals.prestartManhours;

  const revisionAllocatedMH = towerRevisionAllocations.reduce(
    (sum, allocation) =>
      sum + toNumber(allocation.hours) * allocation.worker_names.length,
    0
  );

  // Labour remains the source of truth for productive hours. Normal tower work
  // only splits the production MH already calculated by the labour table.
  // Revision / rectification MH is removed first because it has its own explicit
  // worker-hour allocation below.
  const towerWorkProductionPoolMH = Math.max(
    totalProductionHours - revisionAllocatedMH,
    0
  );

  function additionalTowerAllocationPercent(work: AdditionalTowerWork) {
    if (work.allocation_percent.trim() !== "") {
      return Math.max(toNumber(work.allocation_percent), 0);
    }

    // Backward compatibility for multi-tower dockets saved by the previous
    // Hours / Worker UI. Convert their saved MH into an equivalent share.
    if (work.saved_allocated_mh > 0 && towerWorkProductionPoolMH > 0) {
      return (work.saved_allocated_mh / towerWorkProductionPoolMH) * 100;
    }

    return 0;
  }

  const additionalProductionAllocationPercent = additionalTowerWork.reduce(
    (sum, work) => sum + additionalTowerAllocationPercent(work),
    0
  );

  const primaryProductionAllocationPercent = Math.max(
    100 - additionalProductionAllocationPercent,
    0
  );

  const primaryProductionAllocationMH =
    towerWorkProductionPoolMH * (primaryProductionAllocationPercent / 100);

  const additionalProductionAllocationMH = additionalTowerWork.reduce(
    (sum, work) =>
      sum +
      towerWorkProductionPoolMH *
        (additionalTowerAllocationPercent(work) / 100),
    0
  );

  const productionAllocatedToTowersMH =
    primaryProductionAllocationMH + additionalProductionAllocationMH;

  const totalAttributedProductionMH =
    productionAllocatedToTowersMH + revisionAllocatedMH;

  const productionAllocationOverByMH = Math.max(
    totalAttributedProductionMH - totalProductionHours,
    0
  );


  const automaticPlantShift = useMemo(
    () => deriveAutomaticPlantShift(labourRows),
    [labourRows]
  );

  const plantRowsWithTotals = useMemo(() => {
    return plantRows.map((row, index) => {
      const displayName = plantDisplayName(row, index);
      const plantDelayHours = delayRows.reduce((sum, delay) => {
        if (delay.delay_applies_mode !== "labour_and_plant") return sum;
        if (toNumber(delay.delay_hours) <= 0) return sum;

        const appliesToThisPlant =
          delay.plant_names.length === 0 ||
          delay.plant_names.some(
            (name) => normalizeWorkerName(name) === normalizeWorkerName(displayName)
          );

        return appliesToThisPlant ? sum + toNumber(delay.delay_hours) : sum;
      }, 0);

      const timeIn = automaticPlantShift.time_in || row.time_in;
      const timeOut = automaticPlantShift.time_out || row.time_out;
      const totalHours =
        automaticPlantShift.total_hours ||
        calculateHours(timeIn, timeOut) ||
        row.total_hours;

      return {
        ...row,
        time_in: timeIn,
        time_out: timeOut,
        total_hours: totalHours,
        auto_delay_hours: plantDelayHours,
      };
    });
  }, [automaticPlantShift, delayRows, plantRows]);

  const availablePlantNames = useMemo(
    () => plantRowsWithTotals.map((row, index) => plantDisplayName(row, index)).filter((name) => name.trim()),
    [plantRowsWithTotals]
  );

  const totalPlantHours = useMemo(
    () => plantRowsWithTotals.reduce((sum, row) => sum + toNumber(row.total_hours), 0),
    [plantRowsWithTotals]
  );

  const plantItemCount = useMemo(
    () => plantRowsWithTotals.filter(rowHasPlantDetails).length,
    [plantRowsWithTotals]
  );

  const hasLabourAndPlantDelay = useMemo(
    () => delayRows.some((delay) => delay.delay_applies_mode === "labour_and_plant"),
    [delayRows]
  );

  const hasEnteredPlantRows = useMemo(() => plantRows.some(rowHasPlantDetails), [plantRows]);

  const shouldSavePlantRows =
    rateType === "schedule_of_rates" ||
    hasLabourAndPlantDelay ||
    hasEnteredPlantRows;

  const plantSectionOpen = showPlantUsedSection || rateType === "schedule_of_rates";

  const totalLunchHours = labourTotals.lunchManhours;

  const totalTravelHours = labourTotals.travelManhours;

  const totalMobilisationHours = labourTotals.mobilisationManhours;

  const mobilisationDurationHours = mobilisation.enabled ? toNumber(mobilisationHours) : 0;

  const mobilisationWorkerCount = calculateMobilisationWorkerCount({
    labourRows,
    mobilisation: {
      enabled: mobilisation.enabled,
      durationMinutes: hoursToMinutes(mobilisationHours),
      workerNames: mobilisation.worker_names,
    },
  });

  const mobilisationManhours = calculateMobilisationManhours({
    labourRows,
    mobilisation: {
      enabled: mobilisation.enabled,
      durationMinutes: hoursToMinutes(mobilisationHours),
      workerNames: mobilisation.worker_names,
    },
  });

  const totalDelayManhours = labourTotals.delayManhours;

  const totalPlantDelayHours = calculateTotalPlantDelayHours(delayRows);

  const totalDelayEvents = useMemo(
    () => delayRows.reduce((sum, row) => sum + toNumber(row.delay_hours), 0),
    [delayRows]
  );

  const delaySummaryByType = useMemo(() => {
    return delayRows.reduce(
      (acc, row) => {
        acc[row.delay_type] = (acc[row.delay_type] || 0) + toNumber(row.delay_hours);
        return acc;
      },
      {} as Record<DelayType, number>
    );
  }, [delayRows]);

  const outstandingMissingIssues = useMemo(
    () => missingMaterialIssues.filter((issue) => issue.remaining_quantity > 0),
    [missingMaterialIssues]
  );

  const missingIssueByKey = useMemo(
    () => new Map(missingMaterialIssues.map((issue) => [issue.issue_key, issue])),
    [missingMaterialIssues]
  );

  const linkedReceiptKeysInDraft = useMemo(() => {
    const keys = new Set<string>();
    materialEvents
      .filter((event) => event.event_type === "found_received")
      .forEach((event) =>
        event.items.forEach((item) => {
          if (item.source_issue_key) keys.add(item.source_issue_key);
        })
      );
    return keys;
  }, [materialEvents]);

  const crewOptions = useMemo(
    () =>
      crews.map((crew) => ({
        id: crew.id,
        label: `${crew.crew_number || "Crew"}${crew.crew_name ? ` - ${crew.crew_name}` : ""}`,
      })),
    [crews]
  );

  function crewMembersForCrew(crewId: string) {
    return employees.filter((employee) => employee.crew_id === crewId);
  }

  async function loadAssignedAssetsForCrew(crewIdValue: string) {
    if (!crewIdValue || isView || locked) return;

    try {
      const selectedCrew = crews.find((crew) => crew.id === crewIdValue);
      const crewNumber = toStringValue(selectedCrew?.crew_number);
      const crewNameValue = toStringValue(selectedCrew?.crew_name);

      const [plantResult, vehicleResult] = await Promise.all([
        supabase.from("plant_assets").select("*"),
        supabase.from("vehicle_assets").select("*"),
      ]);

      if (plantResult.error) console.warn("Crew plant allocation could not be loaded", plantResult.error);
      if (vehicleResult.error) console.warn("Crew vehicle allocation could not be loaded", vehicleResult.error);

      const allocatedRows = [
        ...(((plantResult.data || []) as AssetAllocationRow[])
          .filter((row) => assetBelongsToCrew(row, crewIdValue, crewNumber, crewNameValue))
          .map((row) => buildAllocatedPlantRow(row, "plant"))
          .filter(Boolean) as PlantRow[]),
        ...(((vehicleResult.data || []) as AssetAllocationRow[])
          .filter((row) => assetBelongsToCrew(row, crewIdValue, crewNumber, crewNameValue))
          .map((row) => buildAllocatedPlantRow(row, "vehicle"))
          .filter(Boolean) as PlantRow[]),
      ];

      const nextPlantRows = replaceAutoAllocatedPlantRows(plantRows, allocatedRows);
      const availableNames = new Set(
        nextPlantRows.map((row, index) => normaliseAssetText(plantDisplayName(row, index)))
      );

      setPlantRows(nextPlantRows);
      setDelayRows((prev) =>
        prev.map((delay) =>
          delay.delay_applies_mode === "labour_and_plant"
            ? {
                ...delay,
                plant_names: delay.plant_names.filter((name) =>
                  availableNames.has(normaliseAssetText(name))
                ),
              }
            : delay
        )
      );

      if (nextPlantRows.length > 0) setShowPlantUsedSection(true);
    } catch (error) {
      console.warn("Crew asset allocation could not be loaded", error);
    }
  }

  function handleCrewSelection(crewIdValue: string) {
    if (isView || locked) return;

    setSelectedCrewId(crewIdValue);

    if (!crewIdValue) {
      setPlantRows((prev) =>
        prev.filter((row) => rowHasPlantDetails(row) && !isAutoAllocatedPlantRow(row))
      );
      setDelayRows((prev) =>
        prev.map((delay) =>
          delay.delay_applies_mode === "labour_and_plant"
            ? { ...delay, plant_names: [] }
            : delay
        )
      );
      return;
    }

    void loadAssignedAssetsForCrew(crewIdValue);

    const selectedCrew = crews.find((crew) => crew.id === crewIdValue);
    if (!selectedCrew) return;

    const members = crewMembersForCrew(crewIdValue);
    const currentHasLabour = labourRows.some(
      (row) => row.worker_name.trim() || row.time_in || row.time_out || row.total_hours
    );

    if (currentHasLabour) {
      const confirmed = window.confirm(
        "Apply this crew to the labour section? This will replace the current worker names but you can still edit them afterwards."
      );

      if (!confirmed) {
        setCrewName(toStringValue(selectedCrew.crew_number));
        if (selectedCrew.leading_hand) setLeadingHand(selectedCrew.leading_hand);
        return;
      }
    }

    setCrewName(toStringValue(selectedCrew.crew_number));
    if (selectedCrew.leading_hand) setLeadingHand(selectedCrew.leading_hand);

    if (members.length > 0) {
      const mappedWorkers = members.map(() =>
        blankLabourRow({
          prestartMinutes,
          lunchBreakMinutes,
          travelInMinutes,
          travelOutMinutes,
        })
      );

      mappedWorkers.forEach((row, index) => {
        row.worker_name = members[index]?.full_name || "";
        row.production_hours = calculateProductionHours(row);
      });

      setLabourRows(mappedWorkers);
    }
  }



  const currentTowerBundleCatalog = useMemo(
    () =>
      materialCatalog.filter(
        (item) =>
          item.source_table === "tower_required_bundles" &&
          item.tower_id === towerId
      ),
    [materialCatalog, towerId]
  );

  function bundlesForTower(targetTowerId: string) {
    return materialCatalog.filter(
      (item) =>
        item.source_table === "tower_required_bundles" &&
        item.tower_id === targetTowerId
    );
  }

  function projectTowerName(id: string) {
    return projectTowers.find((tower) => tower.id === id)?.name || "Tower";
  }

  function transferOutQuantity(bundleId: string) {
    return towerTransferHistory
      .filter(
        (transfer) =>
          transfer.source_bundle_id === bundleId &&
          transfer.status !== "cancelled"
      )
      .reduce((sum, transfer) => sum + transfer.quantity, 0);
  }

  function availableBundleTransferQuantity(bundleId: string) {
    return Math.max(
      (bundleCheckQtyById[bundleId] || 0) - transferOutQuantity(bundleId),
      0
    );
  }

  function exactCurrentTowerBundle(sourceBundleId: string) {
    const source = materialCatalog.find(
      (bundle) =>
        bundle.source_table === "tower_required_bundles" &&
        bundle.source_record_id === sourceBundleId
    );
    if (!source) return "";

    const exact = currentTowerBundleCatalog.find(
      (item) =>
        normaliseBundleRef(item.bundle_no) === normaliseBundleRef(source.bundle_no) &&
        normaliseText(item.bundle_section) === normaliseText(source.bundle_section)
    );

    return exact?.source_record_id || "";
  }

  function addBundleTransferDraft() {
    if (isView || locked) return;
    setBundleTransferDrafts((prev) => [
      ...prev,
      {
        ui_id: makeUiId(),
        source_tower_id: "",
        source_bundle_id: "",
        destination_bundle_id: "",
        quantity: "1",
        occurred_time: currentLocalTimeValue(),
        replacement_quantity: "",
        replacement_time: currentLocalTimeValue(),
        notes: "",
      },
    ]);
    setOpenSections((prev) => new Set([...prev, "delays"]));
  }

  function updateBundleTransferDraft(
    index: number,
    patch: Partial<BundleTransferDraft>
  ) {
    if (isView || locked) return;

    setBundleTransferDrafts((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };

        if (patch.source_tower_id !== undefined) {
          next.source_bundle_id = "";
          next.destination_bundle_id = "";
        }

        if (patch.source_bundle_id !== undefined) {
          next.destination_bundle_id = exactCurrentTowerBundle(
            next.source_bundle_id
          );
        }

        return next;
      })
    );
  }

  function removeBundleTransferDraft(index: number) {
    if (isView || locked) return;
    setBundleTransferDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  function transferReplacementStatus(
    transfer: BundleTransferRecord
  ): BundleTransferReplacementStatus {
    return (
      bundleTransferReplacementById[transfer.id] || {
        transfer_id: transfer.id,
        issue_key: "",
        original_quantity: transfer.quantity,
        delivered_quantity: 0,
        remaining_quantity: transfer.quantity,
        first_reported_at: transfer.received_at || transfer.transferred_at,
        last_delivery_at: null,
      }
    );
  }

  function queueTransferReplacement(transfer: BundleTransferRecord) {
    if (isView || locked) return;
    const status = transferReplacementStatus(transfer);
    if (status.remaining_quantity <= 0) return;

    setBundleTransferReplacementDrafts((prev) => ({
      ...prev,
      [transfer.id]: prev[transfer.id] || {
        quantity: String(status.remaining_quantity),
        occurred_time: currentLocalTimeValue(),
      },
    }));
  }

  function updateQueuedTransferReplacement(
    transferId: string,
    patch: Partial<BundleTransferReplacementDraft>
  ) {
    if (isView || locked) return;

    setBundleTransferReplacementDrafts((prev) => ({
      ...prev,
      [transferId]: {
        quantity: prev[transferId]?.quantity || "",
        occurred_time:
          prev[transferId]?.occurred_time || currentLocalTimeValue(),
        ...patch,
      },
    }));
  }

  function cancelQueuedTransferReplacement(transferId: string) {
    if (isView || locked) return;
    setBundleTransferReplacementDrafts((prev) => {
      const next = { ...prev };
      delete next[transferId];
      return next;
    });
  }

  async function ensureTransferSourceShortage(
    transfer: BundleTransferRecord,
    recordedDocketId: string | null
  ) {
    const existing = bundleTransferReplacementById[transfer.id];
    if (existing?.issue_key) return existing;

    const { data: existingEvents, error: existingError } = await supabase
      .from("tower_material_events")
      .select(`
        id,
        occurred_at,
        items:tower_material_event_items(
          issue_key,
          quantity
        )
      `)
      .eq("transfer_id", transfer.id)
      .eq("event_type", "missing")
      .limit(1);

    if (existingError) throw existingError;

    const existingEvent = (existingEvents || [])[0] as any;
    const existingItem = existingEvent?.items?.[0];

    if (existingItem?.issue_key) {
      const resolved: BundleTransferReplacementStatus = {
        transfer_id: transfer.id,
        issue_key: toStringValue(existingItem.issue_key),
        original_quantity: Math.max(
          toNumber(existingItem.quantity),
          transfer.quantity
        ),
        delivered_quantity: 0,
        remaining_quantity: Math.max(
          toNumber(existingItem.quantity),
          transfer.quantity
        ),
        first_reported_at:
          toStringValue(existingEvent.occurred_at) || transfer.received_at,
        last_delivery_at: null,
      };

      setBundleTransferReplacementById((prev) => ({
        ...prev,
        [transfer.id]: resolved,
      }));

      return resolved;
    }

    const issueKey = makeUuid();
    const occurredAt =
      transfer.received_at ||
      transfer.transferred_at ||
      new Date().toISOString();

    const eventInsert = await supabase
      .from("tower_material_events")
      .insert({
        project_id: projectId,
        docket_id: recordedDocketId,
        tower_id: transfer.source_tower_id,
        transfer_id: transfer.id,
        event_type: "missing",
        source_tower_id: transfer.source_tower_id,
        destination_tower_id: transfer.destination_tower_id,
        occurred_at: occurredAt,
        affected_work: false,
        mitigation_actions: [],
        notes: `Bundle taken by ${projectTowerName(
          transfer.destination_tower_id
        )}; replacement required at ${projectTowerName(
          transfer.source_tower_id
        )}.`,
      })
      .select("id")
      .single();

    if (eventInsert.error || !eventInsert.data) {
      throw new Error(
        `The transfer was saved, but the source-tower replacement requirement could not be created: ${
          eventInsert.error?.message || "Unknown error"
        }`
      );
    }

    const itemInsert = await supabase
      .from("tower_material_event_items")
      .insert({
        event_id: eventInsert.data.id,
        issue_key: issueKey,
        source_issue_key: null,
        bundle_id: transfer.source_bundle_id,
        bundle_no: transfer.bundle_no,
        bundle_section: transfer.bundle_section || null,
        source_table: "tower_required_bundles",
        source_record_id: transfer.source_bundle_id,
        material_type: "other",
        bolt_size: null,
        item_reference: `Bundle ${transfer.bundle_no}`.trim(),
        item_description: [
          transfer.bundle_section
            ? `Bundle section ${transfer.bundle_section}`
            : "",
          `Taken by ${projectTowerName(transfer.destination_tower_id)}`,
          `Replacement required at ${projectTowerName(
            transfer.source_tower_id
          )}`,
        ]
          .filter(Boolean)
          .join(" · "),
        quantity: transfer.quantity,
        unit: "bundle",
      });

    if (itemInsert.error) {
      throw new Error(
        `The transfer was saved, but the source-tower replacement item could not be created: ${itemInsert.error.message}`
      );
    }

    const created: BundleTransferReplacementStatus = {
      transfer_id: transfer.id,
      issue_key: issueKey,
      original_quantity: transfer.quantity,
      delivered_quantity: 0,
      remaining_quantity: transfer.quantity,
      first_reported_at: occurredAt,
      last_delivery_at: null,
    };

    setBundleTransferReplacementById((prev) => ({
      ...prev,
      [transfer.id]: created,
    }));

    return created;
  }

  async function recordTransferReplacementDelivery({
    transfer,
    quantity,
    occurredTime,
    docketIdValue,
  }: {
    transfer: BundleTransferRecord;
    quantity: number;
    occurredTime: string;
    docketIdValue: string | null;
  }) {
    const shortage = await ensureTransferSourceShortage(
      transfer,
      docketIdValue
    );

    const currentStatus =
      bundleTransferReplacementById[transfer.id] || shortage;
    const remaining = Math.max(
      currentStatus.original_quantity -
        currentStatus.delivered_quantity,
      0
    );
    const cleanQty = Math.min(Math.max(quantity, 0), remaining);

    if (cleanQty <= 0) return;

    const occurredAt =
      combineDocketDateTime(docketDate, occurredTime) ||
      new Date().toISOString();

    const receiptInsert = await supabase
      .from("tower_material_events")
      .insert({
        project_id: projectId,
        docket_id: docketIdValue,
        tower_id: transfer.source_tower_id,
        transfer_id: transfer.id,
        event_type: "found_received",
        source_tower_id: transfer.source_tower_id,
        destination_tower_id: transfer.destination_tower_id,
        occurred_at: occurredAt,
        affected_work: false,
        mitigation_actions: [],
        notes: `Replacement delivery for Bundle ${
          transfer.bundle_no
        } after it was taken by ${projectTowerName(
          transfer.destination_tower_id
        )}.`,
      })
      .select("id")
      .single();

    if (receiptInsert.error || !receiptInsert.data) {
      throw new Error(
        `Replacement delivery could not be recorded: ${
          receiptInsert.error?.message || "Unknown error"
        }`
      );
    }

    const receiptItemInsert = await supabase
      .from("tower_material_event_items")
      .insert({
        event_id: receiptInsert.data.id,
        issue_key: null,
        source_issue_key: shortage.issue_key,
        bundle_id: transfer.source_bundle_id,
        bundle_no: transfer.bundle_no,
        bundle_section: transfer.bundle_section || null,
        source_table: "tower_required_bundles",
        source_record_id: transfer.source_bundle_id,
        material_type: "other",
        bolt_size: null,
        item_reference: `Bundle ${transfer.bundle_no}`.trim(),
        item_description: `Replacement delivered to ${projectTowerName(
          transfer.source_tower_id
        )}`,
        quantity: cleanQty,
        unit: "bundle",
      });

    if (receiptItemInsert.error) {
      throw new Error(
        `Replacement delivery item could not be recorded: ${receiptItemInsert.error.message}`
      );
    }

    const sourceBundle = materialCatalog.find(
      (item) =>
        item.source_table === "tower_required_bundles" &&
        item.source_record_id === transfer.source_bundle_id
    );

    const { data: existingCheck, error: existingCheckError } =
      await supabase
        .from("tower_material_bundle_checks")
        .select("qty_received, notes")
        .eq("bundle_id", transfer.source_bundle_id)
        .maybeSingle();

    if (existingCheckError) throw existingCheckError;

    const sourceCurrentQty = Math.max(
      toNumber((existingCheck as any)?.qty_received),
      0
    );
    const sourceNextQty = sourceCurrentQty + cleanQty;
    const sourceRequired = Math.max(
      toNumber(
        sourceBundle?.item_description.match(
          /Required\s+([0-9.]+)/i
        )?.[1]
      ),
      1
    );

    const sourceCheckSave = await supabase
      .from("tower_material_bundle_checks")
      .upsert(
        {
          tower_id: transfer.source_tower_id,
          bundle_id: transfer.source_bundle_id,
          bundle_no: transfer.bundle_no,
          status:
            sourceNextQty >= sourceRequired ? "arrived" : "partial",
          notes:
            toStringValue((existingCheck as any)?.notes) ||
            "Replacement delivery recorded from Daily Docket",
          checked_by: leadingHand.trim() || "Daily Docket",
          checked_at: occurredAt,
          qty_received: sourceNextQty,
        },
        { onConflict: "bundle_id" }
      );

    if (sourceCheckSave.error) {
      throw new Error(
        `Replacement was recorded, but the source tower bundle check could not be updated: ${sourceCheckSave.error.message}`
      );
    }

    const nextStatus: BundleTransferReplacementStatus = {
      ...shortage,
      delivered_quantity:
        currentStatus.delivered_quantity + cleanQty,
      remaining_quantity: Math.max(remaining - cleanQty, 0),
      last_delivery_at: occurredAt,
    };

    setBundleTransferReplacementById((prev) => ({
      ...prev,
      [transfer.id]: nextStatus,
    }));

    setBundleCheckQtyById((prev) => ({
      ...prev,
      [transfer.source_bundle_id]:
        (prev[transfer.source_bundle_id] || sourceCurrentQty) +
        cleanQty,
    }));
  }

  async function confirmIncomingBundleTransfer(transfer: BundleTransferRecord) {
    if (isView || locked || transfer.status !== "in_transit") return;
    if (transfer.destination_tower_id !== towerId) return;

    const confirmed = window.confirm(
      `Confirm Bundle ${transfer.bundle_no}${transfer.bundle_section ? ` · ${transfer.bundle_section}` : ""} was taken from ${projectTowerName(transfer.source_tower_id)} and received at ${projectTowerName(towerId)}?`
    );
    if (!confirmed) return;

    setTransferBusyId(transfer.id);
    try {
      const destinationBundle = materialCatalog.find(
        (item) =>
          item.source_table === "tower_required_bundles" &&
          item.source_record_id === transfer.destination_bundle_id
      );

      const { data: existingCheck, error: checkLoadError } = await supabase
        .from("tower_material_bundle_checks")
        .select("id, qty_received, notes")
        .eq("bundle_id", transfer.destination_bundle_id)
        .maybeSingle();

      if (checkLoadError) throw checkLoadError;

      const currentQty = Math.max(toNumber((existingCheck as any)?.qty_received), 0);
      const nextQty = currentQty + transfer.quantity;
      const required = Math.max(
        toNumber(
          destinationBundle?.item_description.match(/Required\s+([0-9.]+)/i)?.[1]
        ),
        1
      );

      const checkPayload = {
        tower_id: towerId,
        bundle_id: transfer.destination_bundle_id,
        bundle_no: transfer.bundle_no,
        status: nextQty >= required ? "arrived" : "partial",
        notes: toStringValue((existingCheck as any)?.notes),
        checked_by: leadingHand.trim() || "Daily Docket",
        checked_at:
          combineDocketDateTime(docketDate, currentLocalTimeValue()) ||
          new Date().toISOString(),
        qty_received: nextQty,
      };

      const checkSave = await supabase
        .from("tower_material_bundle_checks")
        .upsert(checkPayload, { onConflict: "bundle_id" });

      if (checkSave.error) throw checkSave.error;

      const receivedAt =
        combineDocketDateTime(docketDate, currentLocalTimeValue()) ||
        new Date().toISOString();

      const transferUpdate = await supabase
        .from("tower_material_transfers")
        .update({
          status: "received",
          received_by_name: leadingHand.trim() || null,
          received_at: receivedAt,
          destination_docket_id: docketId || transfer.destination_docket_id || null,
        })
        .eq("id", transfer.id);

      if (transferUpdate.error) throw transferUpdate.error;

      const patch: Partial<BundleTransferRecord> = {
        status: "received",
        received_by_name: leadingHand.trim(),
        received_at: receivedAt,
        destination_docket_id: docketId || transfer.destination_docket_id,
      };

      setBundleTransfers((prev) =>
        prev.map((row) => (row.id === transfer.id ? { ...row, ...patch } : row))
      );
      setTowerTransferHistory((prev) =>
        prev.map((row) => (row.id === transfer.id ? { ...row, ...patch } : row))
      );
      setBundleCheckQtyById((prev) => ({
        ...prev,
        [transfer.destination_bundle_id]: nextQty,
      }));

      await ensureTransferSourceShortage(
        {
          ...transfer,
          status: "received",
          received_at: receivedAt,
          destination_docket_id:
            docketId || transfer.destination_docket_id,
        },
        docketId || null
      );
    } catch (error) {
      console.error("Bundle transfer receipt error", error);
      alert(
        error instanceof Error
          ? `Bundle transfer could not be received: ${error.message}`
          : "Bundle transfer could not be received."
      );
    } finally {
      setTransferBusyId("");
    }
  }

  async function syncBundleTransfers(docketIdValue: string) {
    for (const transfer of bundleTransfers) {
      if (
        transfer.destination_tower_id === towerId &&
        transfer.status === "received"
      ) {
        if (
          !transfer.destination_docket_id &&
          isoDateOnly(transfer.received_at) === docketDate
        ) {
          const updateRes = await supabase
            .from("tower_material_transfers")
            .update({ destination_docket_id: docketIdValue })
            .eq("id", transfer.id);

          if (updateRes.error) {
            throw new Error(
              `Daily Docket saved, but bundle transfer ${transfer.bundle_no} could not be linked: ${updateRes.error.message}`
            );
          }
        }

        await ensureTransferSourceShortage(
          transfer,
          docketIdValue
        );
      }
    }

    for (const transfer of bundleTransfers) {
      const replacementDraft =
        bundleTransferReplacementDrafts[transfer.id];
      if (!replacementDraft) continue;

      const qty = Math.max(
        Math.round(toNumber(replacementDraft.quantity)),
        0
      );

      if (qty <= 0) continue;

      await recordTransferReplacementDelivery({
        transfer,
        quantity: qty,
        occurredTime: replacementDraft.occurred_time,
        docketIdValue,
      });
    }

    if (bundleTransferDrafts.length === 0) {
      setBundleTransferReplacementDrafts({});
      return;
    }

    const reservedBySourceBundle = new Map<string, number>();

    for (const draft of bundleTransferDrafts) {
      const source = materialCatalog.find(
        (bundle) =>
          bundle.source_table === "tower_required_bundles" &&
          bundle.tower_id === draft.source_tower_id &&
          bundle.source_record_id === draft.source_bundle_id
      );

      const destination = currentTowerBundleCatalog.find(
        (bundle) =>
          bundle.source_record_id === draft.destination_bundle_id
      );

      const quantity = Math.max(
        Math.round(toNumber(draft.quantity)),
        0
      );

      if (
        !draft.source_tower_id ||
        draft.source_tower_id === towerId ||
        !source ||
        !destination ||
        quantity <= 0
      ) {
        throw new Error(
          "Complete each bundle taken from another tower with a source tower, source bundle, matching current-tower bundle and quantity."
        );
      }

      const alreadyReserved =
        reservedBySourceBundle.get(draft.source_bundle_id) || 0;

      const available = Math.max(
        availableBundleTransferQuantity(
          draft.source_bundle_id
        ) - alreadyReserved,
        0
      );

      if (quantity > available) {
        throw new Error(
          `Bundle ${source.bundle_no}${
            source.bundle_section
              ? ` · ${source.bundle_section}`
              : ""
          } only has ${available} available at ${projectTowerName(
            draft.source_tower_id
          )} after earlier transfers, but ${quantity} is being recorded as taken.`
        );
      }

      reservedBySourceBundle.set(
        draft.source_bundle_id,
        alreadyReserved + quantity
      );

      const occurredAt =
        combineDocketDateTime(
          docketDate,
          draft.occurred_time
        ) || `${docketDate}T12:00:00`;

      const { data: insertedTransfer, error: insertError } =
        await supabase
          .from("tower_material_transfers")
          .insert({
            project_id: projectId,
            source_tower_id: draft.source_tower_id,
            destination_tower_id: towerId,
            source_bundle_id: draft.source_bundle_id,
            destination_bundle_id:
              draft.destination_bundle_id,
            bundle_no: source.bundle_no,
            bundle_section:
              source.bundle_section || "General",
            quantity,
            status: "received",
            transferred_by_name:
              leadingHand.trim() || null,
            transferred_at: occurredAt,
            received_by_name:
              leadingHand.trim() || null,
            received_at: occurredAt,
            destination_docket_id: docketIdValue,
            notes: draft.notes.trim() || null,
          })
          .select("*")
          .single();

      if (insertError || !insertedTransfer) {
        throw new Error(
          `Daily Docket saved, but Bundle ${
            source.bundle_no
          } taken from ${projectTowerName(
            draft.source_tower_id
          )} could not be saved: ${
            insertError?.message || "Unknown error"
          }`
        );
      }

      const transfer: BundleTransferRecord = {
        id: toStringValue(insertedTransfer.id),
        transfer_no:
          insertedTransfer.transfer_no == null
            ? null
            : Number(insertedTransfer.transfer_no),
        project_id: toStringValue(
          insertedTransfer.project_id
        ),
        source_tower_id: toStringValue(
          insertedTransfer.source_tower_id
        ),
        destination_tower_id: toStringValue(
          insertedTransfer.destination_tower_id
        ),
        source_bundle_id: toStringValue(
          insertedTransfer.source_bundle_id
        ),
        destination_bundle_id: toStringValue(
          insertedTransfer.destination_bundle_id
        ),
        bundle_no: toStringValue(
          insertedTransfer.bundle_no
        ),
        bundle_section: toStringValue(
          insertedTransfer.bundle_section
        ),
        quantity: Math.max(
          toNumber(insertedTransfer.quantity),
          0
        ),
        status: "received",
        transferred_by_name: toStringValue(
          insertedTransfer.transferred_by_name
        ),
        transferred_at:
          toStringValue(
            insertedTransfer.transferred_at
          ) || null,
        received_by_name: toStringValue(
          insertedTransfer.received_by_name
        ),
        received_at:
          toStringValue(insertedTransfer.received_at) ||
          null,
        source_docket_id: toStringValue(
          insertedTransfer.source_docket_id
        ),
        destination_docket_id: toStringValue(
          insertedTransfer.destination_docket_id
        ),
        notes: toStringValue(insertedTransfer.notes),
      };

      const currentQty = Math.max(
        bundleCheckQtyById[
          draft.destination_bundle_id
        ] || 0,
        0
      );
      const nextQty = currentQty + quantity;
      const required = Math.max(
        toNumber(
          destination.item_description.match(
            /Required\s+([0-9.]+)/i
          )?.[1]
        ),
        1
      );

      const destinationCheckSave = await supabase
        .from("tower_material_bundle_checks")
        .upsert(
          {
            tower_id: towerId,
            bundle_id: draft.destination_bundle_id,
            bundle_no: destination.bundle_no,
            status:
              nextQty >= required
                ? "arrived"
                : "partial",
            notes:
              "Received from another tower via Daily Docket",
            checked_by:
              leadingHand.trim() || "Daily Docket",
            checked_at: occurredAt,
            qty_received: nextQty,
          },
          { onConflict: "bundle_id" }
        );

      if (destinationCheckSave.error) {
        throw new Error(
          `Bundle transfer was recorded, but the current tower bundle check could not be updated: ${destinationCheckSave.error.message}`
        );
      }

      setBundleCheckQtyById((prev) => ({
        ...prev,
        [draft.destination_bundle_id]:
          (prev[draft.destination_bundle_id] ||
            currentQty) + quantity,
      }));

      await ensureTransferSourceShortage(
        transfer,
        docketIdValue
      );

      const replacementQty = Math.max(
        Math.round(
          toNumber(draft.replacement_quantity)
        ),
        0
      );

      if (replacementQty > 0) {
        await recordTransferReplacementDelivery({
          transfer,
          quantity: replacementQty,
          occurredTime:
            draft.replacement_time ||
            draft.occurred_time ||
            currentLocalTimeValue(),
          docketIdValue,
        });
      }
    }

    setBundleTransferDrafts([]);
    setBundleTransferReplacementDrafts({});
  }


  function addAdditionalTowerWork() {
    if (isView || locked) return;

    setAdditionalTowerWork((prev) => [
      ...prev,
      {
        ui_id: makeUiId(),
        target_tower_id: "",
        allocation_percent: "",
        saved_allocated_mh: 0,
        activity: "mixed",
        notes: "",
        has_body_extension: true,
        progress_rows: blankSectionV2Rows(),
      },
    ]);

    setOpenSections((prev) => new Set([...prev, "progress"]));
  }

  function updateAdditionalTowerWork(
    index: number,
    patch: Partial<AdditionalTowerWork>
  ) {
    if (isView || locked) return;

    setAdditionalTowerWork((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;

        if (patch.target_tower_id !== undefined) {
          const towerOption = projectTowers.find(
            (tower) => tower.id === patch.target_tower_id
          );

          return {
            ...row,
            ...patch,
            has_body_extension:
              towerOption?.has_body_extension ?? row.has_body_extension,
          };
        }

        return { ...row, ...patch };
      })
    );
  }

  function removeAdditionalTowerWork(index: number) {
    if (isView || locked) return;
    setAdditionalTowerWork((prev) => prev.filter((_, i) => i !== index));
  }


  function updateAdditionalTowerProgress(
    workIndex: number,
    sectionCode: string,
    key: "assembly_today" | "erection_today",
    value: string
  ) {
    if (isView || locked) return;

    const nextValue = value.trim() === "" ? "" : clampPercentString(value);

    setAdditionalTowerWork((prev) =>
      prev.map((work, index) =>
        index !== workIndex
          ? work
          : {
              ...work,
              progress_rows: work.progress_rows.map((row) =>
                row.section_code === sectionCode
                  ? { ...row, [key]: nextValue }
                  : row
              ),
            }
      )
    );
  }

  function additionalTowerProgressTotals(work: AdditionalTowerWork) {
    return calculateProgressTotals({
      progressModel: "section_v2",
      sectionV2Rows: work.progress_rows,
      legacyRows: [],
      hasBodyExtension: work.has_body_extension,
    });
  }

  function buildTowerStatus(progress: number) {
    if (progress >= 100) return "Complete";
    if (progress > 0) return "In Progress";
    return "Not Started";
  }

  async function recalcTowerProgressAndStatus() {
    const targetProgress = new Map<string, number>();
    targetProgress.set(towerId, displayProgress);

    additionalTowerWork.forEach((work) => {
      if (!work.target_tower_id) return;
      const totals = additionalTowerProgressTotals(work);
      const current = targetProgress.get(work.target_tower_id) || 0;
      targetProgress.set(
        work.target_tower_id,
        Math.max(current, totals.totalProgressPercent)
      );
    });

    for (const [targetTowerId, calculatedProgress] of targetProgress.entries()) {
      const { data: towerRow, error: towerLoadError } = await supabase
        .from("towers")
        .select("id, progress")
        .eq("id", targetTowerId)
        .single();

      if (towerLoadError) {
        throw new Error("Docket saved, but a worked tower could not be reloaded.");
      }

      // Progress rows are cumulative overall percentages. Keep the existing
      // tower value if an older docket is edited so historical edits cannot
      // accidentally move a tower backwards.
      const nextProgress = Math.max(
        toNumber(towerRow?.progress),
        calculatedProgress
      );

      const towerUpdateRes = await supabase
        .from("towers")
        .update({
          progress: Math.round(nextProgress),
          status: buildTowerStatus(nextProgress),
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetTowerId);

      if (towerUpdateRes.error) {
        throw new Error(
          "Docket saved, but a worked tower status/progress failed to update."
        );
      }
    }
  }

  function addLabourRow() {
    setLabourRows((prev) => {
      const previous = prev[prev.length - 1];

      if (!previous) {
        return [
          blankLabourRow({
            prestartMinutes,
            lunchBreakMinutes,
            travelInMinutes,
            travelOutMinutes,
            mobilisationHours: "",
          }),
        ];
      }

      const time_in = previous.time_in || "";
      const time_out = previous.time_out || "";
      const total_hours = calculateHours(time_in, time_out);

      const next = makeLabourRow(
        {
          worker_name: "",
          time_in,
          time_out,
          total_hours,
          prestart_minutes: previous.prestart_minutes || prestartMinutes,
          lunch_minutes: previous.lunch_minutes || lunchBreakMinutes,
          travel_in_minutes: previous.travel_in_minutes || travelInMinutes,
          travel_out_minutes: previous.travel_out_minutes || travelOutMinutes,
          mobilisation_hours: "",
          delay_hours: "",
          delay_reason: "",
          production_hours: "",
        },
        { mobilisationIsMinutes: true }
      );

      next.production_hours = calculateProductionHours(next);
      return [...prev, next];
    });
  }

  function removeLabourRow(index: number) {
    setLabourRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [blankLabourRow()];
    });
  }

  function focusById(id?: string) {
    if (!id) return;
    window.setTimeout(() => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      el?.focus();
      el?.select?.();
    }, 0);
  }

  function handleLabourKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    nextId?: string
  ) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    focusById(nextId);
  }

  function updateLabourRow(index: number, key: keyof LabourRow, value: string) {
    if (isView || locked) return;

    setLabourRows((prev) => {
      const updated = prev.map((row, i) =>
        i === index ? { ...row, [key]: value } : row
      );

      const current = updated[index];

      if (key === "time_in" || key === "time_out") {
        const autoHours = calculateHours(current.time_in, current.time_out);
        current.total_hours = autoHours || current.total_hours;
      }

      current.production_hours = calculateProductionHours(current);
      return updated;
    });
  }

  function updateProgressRow(index: number, key: keyof ProgressRow, value: string) {
    if (isView || locked) return;
    const nextValue = key === "section_label" ? value : clampPercentString(value);

    setProgressRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: nextValue } : row))
    );
  }

  function handleBodyExtensionToggle(checked: boolean) {
    if (isView || locked) return;

    setHasBodyExtension(checked);

    if (!checked) {
      setProgressRows((prev) =>
        prev.map((row) =>
          isBodyExtensionRow(row)
            ? { ...row, assembled_qty: "", erected_qty: "" }
            : row
        )
      );
    }
  }

  function applyProductionDefaultsToAll() {
    if (isView || locked) return;

    setLabourRows((prev) =>
      prev.map((row) => {
        if (!row.worker_name.trim() && !row.time_in && !row.time_out && !row.total_hours) {
          return row;
        }

        const next = {
          ...row,
          prestart_minutes: prestartMinutes,
          lunch_minutes: lunchBreakMinutes,
          travel_in_minutes: travelInMinutes,
          travel_out_minutes: travelOutMinutes,
        };

        return {
          ...next,
          production_hours: calculateProductionHours(
            next,
            delayHoursForWorker(next.worker_name, delayRows)
          ),
        };
      })
    );
  }

  function addDelayRow() {
    if (isView || locked) return;
    setDelayRows((prev) => [...prev, blankDelayRow()]);
  }

  function removeDelayRow(index: number) {
    if (isView || locked) return;
    setDelayRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateDelayRow(
    index: number,
    key: keyof DelayRow,
    value: string | string[]
  ) {
    if (isView || locked) return;

    setDelayRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;

        if (key === "delay_type") return { ...row, delay_type: value as DelayType };
        if (key === "delay_reason") return { ...row, delay_reason: String(value) };
        if (key === "delay_hours") return { ...row, delay_hours: String(value) };

        if (key === "applies_to") {
          const appliesTo = value as DelayScope;
          return {
            ...row,
            applies_to: appliesTo,
            worker_names: appliesTo === "entire_crew" ? [] : row.worker_names,
          };
        }

        if (key === "worker_names") {
          return { ...row, worker_names: Array.isArray(value) ? value : [] };
        }

        if (key === "delay_applies_mode") {
          const modeValue = value as DelayAppliesMode;
          return {
            ...row,
            delay_applies_mode: modeValue,
            plant_names: modeValue === "labour_only" ? [] : row.plant_names,
          };
        }

        if (key === "plant_names") {
          return { ...row, plant_names: Array.isArray(value) ? value : [] };
        }

        return row;
      })
    );
  }

  function toggleDelayWorker(index: number, workerName: string) {
    if (isView || locked) return;

    setDelayRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const exists = row.worker_names.some(
          (name) => normalizeWorkerName(name) === normalizeWorkerName(workerName)
        );

        return {
          ...row,
          worker_names: exists
            ? row.worker_names.filter(
                (name) => normalizeWorkerName(name) !== normalizeWorkerName(workerName)
              )
            : [...row.worker_names, workerName],
        };
      })
    );
  }

  function toggleDelayPlant(index: number, plantName: string) {
    if (isView || locked) return;

    setDelayRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const exists = row.plant_names.some(
          (name) => normalizeWorkerName(name) === normalizeWorkerName(plantName)
        );

        return {
          ...row,
          plant_names: exists
            ? row.plant_names.filter(
                (name) => normalizeWorkerName(name) !== normalizeWorkerName(plantName)
              )
            : [...row.plant_names, plantName],
        };
      })
    );
  }

  async function uploadFileIfNeeded() {
    if (!docketFile) return existingDocketFileUrl || null;

    const safeName = docketFile.name.replace(/\s+/g, "_");
    const path = `dockets/${projectId}/${towerId}/${Date.now()}_${safeName}`;

    const uploadRes = await supabase.storage
      .from("tower-files")
      .upload(path, docketFile, { upsert: true });

    if (uploadRes.error) throw new Error("Failed to upload docket file");

    const publicUrlRes = supabase.storage.from("tower-files").getPublicUrl(path);
    return publicUrlRes.data.publicUrl;
  }

  function buildDocketPayload(
    docketFileUrl: string | null,
    existingSignedDate: string | null = null
  ) {
    return {
      docket_date: docketDate,
      crew: crewName,
      leading_hand: leadingHand,
      weather,
      rate_type: rateType,
      progress_model: progressModel,
      approval_status: mode === "create" ? "draft" : approvalStatus,
      assembly_percent: totalAssemblyPercent,
      erection_percent: totalErectionPercent,
      weather_delay_hours: Number(weatherDelayHours || delaySummaryByType.weather || 0),
      lightning_delay_hours: Number(lightningDelayHours || delaySummaryByType.lightning || 0),
      toolbox_delay_hours: Number(toolboxDelayHours || delaySummaryByType.toolbox || 0),
      other_delay_hours: Number(otherDelayHours || delaySummaryByType.other || 0),
      other_delay_reason: otherDelayReason,
      daily_site_summary: dailySiteSummary.trim() || null,
      rfi_references: parseRfiReferences(rfiReferencesText),
      delays_comments: [
        delaysComments.trim(),
        mobilisation.enabled
          ? `MOBILISATION|from=${mobilisation.from_tower_id || ""}|to=${mobilisation.to_tower_id || ""}|status=${mobilisation.status}|progress=${mobilisation.percent_complete || "0"}|started=${mobilisation.started_date || ""}|target=${mobilisation.target_move_date || ""}|completed=${mobilisation.completed_date || ""}|minutes=${hoursToMinutes(mobilisationHours)}|hours=${mobilisationHours || "0"}|workers=${mobilisation.worker_names.map((name) => name.replace(/[|,]/g, " ")).join(",")}|notes=${mobilisation.notes.replace(/\|/g, "/")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      missing_items_bolts:
        materialEvents
          .filter((event) => event.event_type === "missing")
          .flatMap((event) =>
            event.items
              .filter(
                (item) =>
                  item.item_reference.trim() ||
                  (item.material_kind === "manual_bolt" && item.bolt_size.trim())
              )
              .map((item) => {
                const reference =
                  item.material_kind === "manual_bolt"
                    ? item.bolt_size.trim()
                    : item.item_reference.trim();

                return `${item.quantity || "1"} × ${reference}`;
              })
          )
          .join("; ") || missingItemsBolts,
      prestart_minutes: Number(prestartMinutes || 0),
      lunch_break_minutes: Number(lunchBreakMinutes || 0),
      travel_in_minutes: Number(travelInMinutes || 0),
      travel_out_minutes: Number(travelOutMinutes || 0),
      mobilisation_hours: mobilisation.enabled ? toNumber(mobilisationHours) : 0,
      mobilisation_notes: mobilisation.enabled ? mobilisation.notes || mobilisationNotes || null : null,
      incident_occurred: incidentOccurred,
      incident_type: incidentOccurred ? incidentType || null : null,
      incident_notes: incidentOccurred ? incidentNotes || null : null,
      raw_manhours: totalLabourHours,
      production_manhours: totalProductionHours,
      bc_rep_name: bcRepName.trim() || null,
      bc_signature_data_url: bcSignatureDataUrl || null,
      bc_signed_at: bcSignatureDataUrl
        ? bcSignedAt || new Date().toISOString()
        : null,
      client_rep_name: clientRepName,
      signed_date: existingSignedDate,
      docket_file_url: docketFileUrl,
    };
  }

  function buildLabourPayload(docketIdValue: string) {
    return labourRowsWithProduction
      .filter((row) => row.worker_name.trim())
      .map((row) => ({
        docket_id: docketIdValue,
        worker_name: row.worker_name.trim(),
        time_in: row.time_in || null,
        time_out: row.time_out || null,
        total_hours: Number(row.total_hours || 0),
        prestart_minutes: Number(row.prestart_minutes || 0),
        lunch_minutes: Number(row.lunch_minutes || 0),
        travel_in_minutes: Number(row.travel_in_minutes || 0),
        travel_out_minutes: Number(row.travel_out_minutes || 0),
        mobilisation_hours: minutesToHours(row.mobilisation_hours),
        delay_hours: Number(row.delay_hours || 0),
        delay_reason: row.delay_reason || null,
        production_hours: Number(row.production_hours || 0),
      }));
  }

  function buildProductionAllocationPayload(docketIdValue: string) {
    const rows: Array<Record<string, unknown>> = [];
    const workers = [...availableWorkerNames];

    // Persist an average hours/worker value only because the existing database
    // table stores hours + worker_names. The UI no longer asks users to repeat
    // labour hours here; MH is derived from the production total and the tower split.
    if (primaryProductionAllocationMH > 0 && workers.length > 0) {
      rows.push({
        docket_id: docketIdValue,
        project_id: projectId,
        source_tower_id: towerId,
        target_tower_id: towerId,
        allocation_type: "production",
        activity: primaryWorkActivity,
        hours: primaryProductionAllocationMH / workers.length,
        worker_names: workers,
        reason: primaryWorkNotes.trim() || null,
      });
    }

    additionalTowerWork
      .filter(
        (allocation) =>
          allocation.target_tower_id &&
          allocation.target_tower_id !== towerId &&
          additionalTowerAllocationPercent(allocation) > 0
      )
      .forEach((allocation) => {
        const allocatedMh =
          towerWorkProductionPoolMH *
          (additionalTowerAllocationPercent(allocation) / 100);

        rows.push({
          docket_id: docketIdValue,
          project_id: projectId,
          source_tower_id: towerId,
          target_tower_id: allocation.target_tower_id,
          allocation_type: "production",
          activity: allocation.activity,
          hours: workers.length > 0 ? allocatedMh / workers.length : 0,
          worker_names: workers,
          reason: allocation.notes.trim() || null,
        });
      });

    return rows;
  }

  function buildTowerRevisionAllocationPayload(docketIdValue: string) {
    return towerRevisionAllocations
      .filter(
        (allocation) =>
          allocation.target_tower_id &&
          allocation.target_tower_id !== towerId &&
          toNumber(allocation.hours) > 0 &&
          allocation.worker_names.length > 0
      )
      .map((allocation) => ({
        docket_id: docketIdValue,
        project_id: projectId,
        source_tower_id: towerId,
        target_tower_id: allocation.target_tower_id,
        allocation_type: "revision",
        activity: "rectification",
        hours: toNumber(allocation.hours),
        worker_names: allocation.worker_names,
        reason: allocation.reason.trim() || null,
      }));
  }

  async function syncTowerRevisionAllocations(docketIdValue: string) {
    const deleteRes = await supabase
      .from("tower_docket_hour_allocations")
      .delete()
      .eq("docket_id", docketIdValue)
      .is("transfer_id", null);

    if (deleteRes.error) {
      console.error("Daily Docket allocation delete error", deleteRes.error);
      throw new Error(
        `Daily docket saved, but existing tower work allocations could not be cleared: ${deleteRes.error.message}`
      );
    }

    const payload = [
      ...buildProductionAllocationPayload(docketIdValue),
      ...buildTowerRevisionAllocationPayload(docketIdValue),
    ];

    if (payload.length === 0) return;

    const insertRes = await supabase
      .from("tower_docket_hour_allocations")
      .insert(payload);

    if (insertRes.error) {
      console.error("Daily Docket allocation insert error", { error: insertRes.error, payload });
      throw new Error(
        `Daily docket saved, but tower work allocations could not be saved: ${insertRes.error.message}`
      );
    }
  }

  function buildPlantPayload(docketIdValue: string) {
    if (!shouldSavePlantRows) return [];

    return plantRowsWithTotals
      .filter(rowHasPlantDetails)
      .map((row) => ({
        docket_id: docketIdValue,
        plant_name: row.plant_name.trim() || null,
        plant_type: row.plant_type.trim() || null,
        asset_number: row.asset_id.trim() || null,
        time_in: row.time_in || null,
        time_out: row.time_out || null,
        total_hours: Number(row.total_hours || 0),
        notes: row.notes || null,
      }));
  }

  function buildDelayPayload(docketIdValue: string) {
    return delayRows
      .filter((row) => toNumber(row.delay_hours) > 0 || row.delay_reason.trim())
      .map((row) => ({
        docket_id: docketIdValue,
        delay_type: row.delay_type,
        delay_reason: row.delay_reason || null,
        delay_hours: Number(row.delay_hours || 0),
        applies_to: row.applies_to,
        worker_names: row.applies_to === "selected_workers" ? row.worker_names : [],
        delay_applies_mode: row.delay_applies_mode,
        plant_names:
          row.delay_applies_mode === "labour_and_plant" ? row.plant_names : [],
      }));
  }

  function buildProgressPayload(docketIdValue: string) {
    const primaryRows =
      progressModel === "section_v2"
        ? sectionV2Rows
            .filter((row) => hasBodyExtension || row.section_code !== "BE")
            .map((row) => ({
              docket_id: docketIdValue,
              tower_id: towerId,
              progress_model: "section_v2",
              section: row.section_code,
              section_code: row.section_code,
              section_label: row.section_label,
              assembly_today:
                row.assembly_today.trim() === ""
                  ? null
                  : toNumber(row.assembly_today),
              assembly_overall:
                row.assembly_today.trim() === ""
                  ? null
                  : toNumber(row.assembly_today),
              erection_today:
                row.erection_today.trim() === ""
                  ? null
                  : toNumber(row.erection_today),
              erection_overall:
                row.erection_today.trim() === ""
                  ? null
                  : toNumber(row.erection_today),
              assembly_weight: row.assembly_weight,
              erection_weight: row.erection_weight,
              assembled_qty:
                row.assembly_today.trim() === ""
                  ? 0
                  : toNumber(row.assembly_today),
              erected_qty:
                row.erection_today.trim() === ""
                  ? 0
                  : toNumber(row.erection_today),
            }))
        : progressRows.map((row) => ({
            docket_id: docketIdValue,
            tower_id: towerId,
            progress_model: "legacy",
            section: row.section_label,
            section_label: row.section_label,
            assembled_qty:
              !hasBodyExtension && isBodyExtensionRow(row)
                ? 0
                : Number(row.assembled_qty || 0),
            erected_qty:
              !hasBodyExtension && isBodyExtensionRow(row)
                ? 0
                : Number(row.erected_qty || 0),
          }));

    const additionalRows = additionalTowerWork.flatMap((work) => {
      if (!work.target_tower_id) return [];

      return work.progress_rows
        .filter(
          (row) => work.has_body_extension || row.section_code !== "BE"
        )
        .map((row) => ({
          docket_id: docketIdValue,
          tower_id: work.target_tower_id,
          progress_model: "section_v2",
          section: row.section_code,
          section_code: row.section_code,
          section_label: row.section_label,
          assembly_today:
            row.assembly_today.trim() === ""
              ? null
              : toNumber(row.assembly_today),
          assembly_overall:
            row.assembly_today.trim() === ""
              ? null
              : toNumber(row.assembly_today),
          erection_today:
            row.erection_today.trim() === ""
              ? null
              : toNumber(row.erection_today),
          erection_overall:
            row.erection_today.trim() === ""
              ? null
              : toNumber(row.erection_today),
          assembly_weight: row.assembly_weight,
          erection_weight: row.erection_weight,
          assembled_qty:
            row.assembly_today.trim() === ""
              ? 0
              : toNumber(row.assembly_today),
          erected_qty:
            row.erection_today.trim() === ""
              ? 0
              : toNumber(row.erection_today),
        }));
    });

    return [...primaryRows, ...additionalRows];
  }


  function addMaterialEvent(eventType: MaterialEventType = "missing") {
    if (isView || locked) return;
    setMaterialEvents((prev) => [
      ...prev,
      {
        ...blankMaterialEvent(),
        event_type: eventType,
        affected_work: eventType === "excess" ? false : false,
      },
    ]);
  }

  function removeMaterialEvent(index: number) {
    if (isView || locked) return;
    setMaterialEvents((prev) => prev.filter((_, i) => i !== index));
  }

  function updateMaterialEvent<K extends keyof MaterialEventDraft>(
    index: number,
    key: K,
    value: MaterialEventDraft[K]
  ) {
    if (isView || locked) return;
    setMaterialEvents((prev) =>
      prev.map((event, i) => (i === index ? { ...event, [key]: value } : event))
    );
  }

  function updateMaterialItem(
    eventIndex: number,
    itemIndex: number,
    patch: Partial<MaterialEventItemDraft>
  ) {
    if (isView || locked) return;

    setMaterialEvents((prev) =>
      prev.map((event, eIndex) =>
        eIndex !== eventIndex
          ? event
          : {
              ...event,
              items: event.items.map((item, iIndex) =>
                iIndex === itemIndex ? { ...item, ...patch } : item
              ),
            }
      )
    );
  }

  function setMaterialSearchMode(
    eventIndex: number,
    itemIndex: number,
    searchMode: MaterialSearchMode
  ) {
    if (isView || locked) return;

    updateMaterialItem(eventIndex, itemIndex, {
      search_mode: searchMode,
      source_table: "",
      source_record_id: "",
      bundle_id: "",
      bundle_no: "",
      bundle_section: "",
      source_issue_key: "",
      material_kind: "registered",
      manual_category: "",
      bolt_size: "",
      search_query: "",
      search_loading: false,
      search_results: [],
      item_reference: "",
      item_description: "",
      unit: searchMode === "bundle" ? "bundle" : "ea",
    });
  }

  async function searchProjectMaterial(
    eventIndex: number,
    itemIndex: number,
    query: string
  ) {
    const trimmed = query.trim();
    const currentEvent = materialEvents[eventIndex];
    const currentItem = currentEvent?.items[itemIndex];
    const searchMode = currentItem?.search_mode || "member";

    updateMaterialItem(eventIndex, itemIndex, {
      search_query: query,
      material_kind: "registered",
      search_loading: trimmed.length >= 2,
      search_results: [],
    });

    if (trimmed.length < 2 || !currentEvent) return;

    const searchTowerId =
      currentEvent.event_type === "taken_from_another_tower"
        ? currentEvent.source_tower_id
        : towerId;

    if (!searchTowerId) {
      updateMaterialItem(eventIndex, itemIndex, {
        search_loading: false,
        search_results: [],
      });
      return;
    }

    const safe = trimmed.replace(/[,%()]/g, " ").trim();
    const pattern = `%${safe}%`;
    const results: MaterialCatalogItem[] = [];
    let searchError = "";

    if (searchMode === "member") {
      const membersRes = await supabase
        .from("tower_material_members")
        .select(
          "id, tower_id, bundle_id, bundle_reference, drawing_number, mark_no, pn_final, qty_per_tower, section, tower_segment"
        )
        .eq("tower_id", searchTowerId)
        .or(
          [
            `mark_no.ilike.${pattern}`,
            `pn_final.ilike.${pattern}`,
            `bundle_reference.ilike.${pattern}`,
            `drawing_number.ilike.${pattern}`,
            `section.ilike.${pattern}`,
            `tower_segment.ilike.${pattern}`,
          ].join(",")
        )
        .limit(25);

      if (membersRes.error) {
        searchError = membersRes.error.message;
      } else {
        for (const row of membersRes.data || []) {
          results.push({
            source_table: "tower_material_members",
            source_record_id: String(row.id),
            bundle_id: toStringValue(row.bundle_id),
            bundle_no: toStringValue(row.bundle_reference),
            bundle_section: toStringValue(row.tower_segment),
            tower_id: String(row.tower_id),
            item_reference: String(
              row.mark_no || row.pn_final || row.bundle_reference || "Member"
            ),
            item_description: [
              row.bundle_reference ? `Bundle ${row.bundle_reference}` : "",
              row.tower_segment ? `Bundle section ${row.tower_segment}` : "",
              row.drawing_number ? `Drawing ${row.drawing_number}` : "",
              row.section ? `Profile ${row.section}` : "",
              row.qty_per_tower != null ? `Qty/Tower ${row.qty_per_tower}` : "",
            ]
              .filter(Boolean)
              .join(" · "),
            unit: "ea",
          });
        }
      }
    } else {
      const bundlesRes = await supabase
        .from("tower_required_bundles")
        .select(
          "id, tower_id, bundle_no, section, qty_required, total_weight, member_qty"
        )
        .eq("tower_id", searchTowerId)
        .or(
          [`bundle_no.ilike.${pattern}`, `section.ilike.${pattern}`].join(",")
        )
        .limit(25);

      if (bundlesRes.error) {
        searchError = bundlesRes.error.message;
      } else {
        for (const row of bundlesRes.data || []) {
          results.push({
            source_table: "tower_required_bundles",
            source_record_id: String(row.id),
            bundle_id: String(row.id),
            bundle_no: toStringValue(row.bundle_no),
            bundle_section: toStringValue(row.section),
            tower_id: String(row.tower_id),
            item_reference: `Bundle ${String(row.bundle_no || "")}`.trim(),
            item_description: [
              row.section ? `Bundle section ${row.section}` : "",
              row.qty_required != null ? `Required ${row.qty_required}` : "",
              row.member_qty != null ? `${row.member_qty} member lines` : "",
            ]
              .filter(Boolean)
              .join(" · "),
            unit: "bundle",
          });
        }
      }
    }

    updateMaterialItem(eventIndex, itemIndex, {
      search_loading: false,
      search_results: results,
      item_description:
        results.length === 0 && searchError
          ? `Search error: ${searchError}`
          : "",
    });
  }

  function chooseCatalogItem(
    eventIndex: number,
    itemIndex: number,
    catalogKey: string
  ) {
    const currentEvent = materialEvents[eventIndex];
    const currentItem = currentEvent?.items[itemIndex];

    const catalogItem = [
      ...(currentItem?.search_results || []),
      ...materialCatalog,
    ].find(
      (item) => `${item.source_table}:${item.source_record_id}` === catalogKey
    );

    if (!catalogItem) {
      updateMaterialItem(eventIndex, itemIndex, {
        source_table: "",
        source_record_id: "",
        bundle_id: "",
        bundle_no: "",
        bundle_section: "",
        source_issue_key: "",
        material_kind: "manual",
        manual_category: "",
        bolt_size: "",
        item_reference: "",
        item_description: "",
        unit: "ea",
      });
      return;
    }

    updateMaterialItem(eventIndex, itemIndex, {
      source_table: catalogItem.source_table,
      source_record_id: catalogItem.source_record_id,
      bundle_id: catalogItem.bundle_id,
      bundle_no: catalogItem.bundle_no,
      bundle_section: catalogItem.bundle_section,
      source_issue_key: "",
      material_kind: "registered",
      manual_category: "",
      bolt_size: "",
      search_query: "",
      search_loading: false,
      search_results: [],
      item_reference: catalogItem.item_reference,
      item_description: catalogItem.item_description,
      unit: catalogItem.unit,
    });
  }

  function setManualBoltItem(eventIndex: number, itemIndex: number) {
    if (isView || locked) return;

    updateMaterialItem(eventIndex, itemIndex, {
      material_kind: "manual_bolt",
      source_table: "",
      source_record_id: "",
      bundle_id: "",
      bundle_no: "",
      bundle_section: "",
      source_issue_key: "",
      manual_category: "",
      bolt_size: "",
      search_query: "",
      search_loading: false,
      search_results: [],
      item_reference: "",
      item_description: "",
      unit: "ea",
    });
  }

  function setManualUnlistedItem(eventIndex: number, itemIndex: number) {
    if (isView || locked) return;

    updateMaterialItem(eventIndex, itemIndex, {
      material_kind: "manual",
      source_table: "",
      source_record_id: "",
      bundle_id: "",
      bundle_no: "",
      bundle_section: "",
      source_issue_key: "",
      manual_category: "",
      bolt_size: "",
      search_query: "",
      search_loading: false,
      search_results: [],
      item_reference: "",
      item_description: "",
      unit: "ea",
    });
  }

  function addMaterialItem(eventIndex: number) {
    setMaterialEvents((prev) =>
      prev.map((event, index) =>
        index === eventIndex
          ? {
              ...event,
              items: [
                ...event.items,
                {
                  ...blankMaterialItem(),
                  issue_key: event.event_type === "missing" ? makeUuid() : "",
                },
              ],
            }
          : event
      )
    );
  }

  function removeMaterialItem(eventIndex: number, itemIndex: number) {
    setMaterialEvents((prev) =>
      prev.map((event, index) => {
        if (index !== eventIndex) return event;
        const nextItems = event.items.filter((_, i) => i !== itemIndex);
        return { ...event, items: nextItems.length ? nextItems : [blankMaterialItem()] };
      })
    );
  }

  function recordMissingDelivery(issue: MissingMaterialIssue) {
    if (isView || locked || issue.remaining_quantity <= 0) return;

    const receiptEvent: MaterialEventDraft = {
      ...blankMaterialEvent(),
      event_type: "found_received" as MaterialEventType,
      occurred_time: "",
      affected_work: false,
      notes: `Delivery against missing material first reported ${
        issue.first_reported_at ? new Date(issue.first_reported_at).toLocaleDateString() : ""
      }`.trim(),
      items: [
        {
          ...blankMaterialItem(),
          search_mode:
            issue.source_table === "tower_required_bundles" ? "bundle" : "member",
          source_table: issue.source_table,
          source_record_id: issue.source_record_id,
          source_issue_key: issue.issue_key,
          bundle_id: issue.bundle_id,
          bundle_no: issue.bundle_no,
          bundle_section: issue.bundle_section,
          material_kind: issue.source_record_id ? "registered" as const : "manual" as const,
          search_query: issue.item_reference,
          item_reference: issue.item_reference,
          item_description: issue.item_description,
          quantity: String(issue.remaining_quantity),
          unit: issue.unit,
        },
      ],
    };

    setMaterialEvents((prev) => [...prev, receiptEvent]);
  }

  function addMaterialPerson(eventIndex: number, employeeName: string) {
    const employee = employees.find(
      (row) => normalizeWorkerName(row.full_name) === normalizeWorkerName(employeeName)
    );

    if (!employee) return;

    setMaterialEvents((prev) =>
      prev.map((event, index) => {
        if (index !== eventIndex) return event;
        if (event.people.some((person) => person.employee_id === employee.id)) return event;

        return {
          ...event,
          people: [
            ...event.people,
            {
              ui_id: makeUiId(),
              employee_id: employee.id,
              employee_name: employee.full_name,
              employee_role: employee.role || "",
              started_at: event.impact_start_time,
              finished_at: event.impact_finish_time,
            },
          ],
        };
      })
    );
  }

  function updateMaterialPerson(
    eventIndex: number,
    personIndex: number,
    patch: Partial<MaterialEventPersonDraft>
  ) {
    setMaterialEvents((prev) =>
      prev.map((event, index) =>
        index !== eventIndex
          ? event
          : {
              ...event,
              people: event.people.map((person, i) =>
                i === personIndex ? { ...person, ...patch } : person
              ),
            }
      )
    );
  }

  function removeMaterialPerson(eventIndex: number, personIndex: number) {
    setMaterialEvents((prev) =>
      prev.map((event, index) =>
        index !== eventIndex
          ? event
          : { ...event, people: event.people.filter((_, i) => i !== personIndex) }
      )
    );
  }

  function addMaterialPlant(eventIndex: number, plantName: string) {
    const sourceIndex = availablePlantNames.findIndex(
      (name) => normalizeWorkerName(name) === normalizeWorkerName(plantName)
    );
    if (sourceIndex < 0) return;

    const source = plantRowsWithTotals[sourceIndex];
    setMaterialEvents((prev) =>
      prev.map((event, index) => {
        if (index !== eventIndex) return event;
        if (event.plant.some((row) => normalizeWorkerName(row.plant_name) === normalizeWorkerName(plantName))) {
          return event;
        }

        return {
          ...event,
          plant: [
            ...event.plant,
            {
              ui_id: makeUiId(),
              plant_name: plantName,
              asset_number: source?.asset_id || "",
              started_at: event.impact_start_time,
              finished_at: event.impact_finish_time,
            },
          ],
        };
      })
    );
  }

  function updateMaterialPlant(
    eventIndex: number,
    plantIndex: number,
    patch: Partial<MaterialEventPlantDraft>
  ) {
    setMaterialEvents((prev) =>
      prev.map((event, index) =>
        index !== eventIndex
          ? event
          : {
              ...event,
              plant: event.plant.map((row, i) =>
                i === plantIndex ? { ...row, ...patch } : row
              ),
            }
      )
    );
  }

  function removeMaterialPlant(eventIndex: number, plantIndex: number) {
    setMaterialEvents((prev) =>
      prev.map((event, index) =>
        index !== eventIndex
          ? event
          : { ...event, plant: event.plant.filter((_, i) => i !== plantIndex) }
      )
    );
  }

  function toggleMitigation(eventIndex: number, action: string) {
    setMaterialEvents((prev) =>
      prev.map((event, index) => {
        if (index !== eventIndex) return event;
        const exists = event.mitigation_actions.includes(action);
        return {
          ...event,
          mitigation_actions: exists
            ? event.mitigation_actions.filter((item) => item !== action)
            : [...event.mitigation_actions, action],
        };
      })
    );
  }

  async function syncMaterialEvents(docketIdValue: string) {
    const { error: deleteError } = await supabase
      .from("tower_material_events")
      .delete()
      .eq("docket_id", docketIdValue);

    if (deleteError) {
      throw new Error(`Daily Docket saved, but material events could not be refreshed: ${deleteError.message}`);
    }

    for (const event of materialEvents) {
      const meaningfulItems = event.items.filter(
        (item) =>
          item.item_reference.trim() ||
          (item.material_kind === "manual_bolt" && item.bolt_size.trim())
      );
      if (meaningfulItems.length === 0) continue;

      const eventInsert = await supabase
        .from("tower_material_events")
        .insert({
          project_id: projectId,
          docket_id: docketIdValue,
          tower_id: towerId,
          event_type: event.event_type,
          source_tower_id: event.source_tower_id || null,
          destination_tower_id: event.destination_tower_id || null,
          source_location: event.source_location || null,
          destination_location: event.destination_location || null,
          occurred_at: combineDocketDateTime(docketDate, event.occurred_time) || `${docketDate}T12:00:00`,
          affected_work: event.affected_work,
          work_outcome: event.affected_work ? event.work_outcome || null : null,
          affected_activity: event.affected_work ? event.affected_activity || null : null,
          affected_section: event.affected_work ? event.affected_section || null : null,
          impact_started_at:
            event.affected_work && event.work_outcome !== "changed_sequence"
              ? combineDocketDateTime(docketDate, event.impact_start_time)
              : null,
          impact_finished_at:
            event.affected_work &&
            event.work_outcome !== "changed_sequence" &&
            !event.impact_ongoing
              ? combineDocketDateTime(docketDate, event.impact_finish_time)
              : null,
          impact_ongoing: event.affected_work ? event.impact_ongoing : false,
          current_effect: event.affected_work ? event.current_effect || null : null,
          mitigation_actions: event.affected_work ? event.mitigation_actions : [],
          commercial_impact_type: event.affected_work
            ? workOutcomeCommercialType(event.work_outcome)
            : null,
          notes: event.notes || null,
        })
        .select("id")
        .single();

      if (eventInsert.error || !eventInsert.data) {
        throw new Error(`Daily Docket saved, but a material event could not be saved: ${eventInsert.error?.message || "Unknown error"}`);
      }

      const eventId = eventInsert.data.id;

      const itemInsert = await supabase.from("tower_material_event_items").insert(
        meaningfulItems.map((item) => {
          const isManualBolt = item.material_kind === "manual_bolt";

          return {
            event_id: eventId,
            issue_key:
              event.event_type === "missing"
                ? item.issue_key || makeUuid()
                : null,
            source_issue_key:
              event.event_type === "found_received"
                ? item.source_issue_key || null
                : null,
            bundle_id: item.bundle_id || null,
            bundle_no: item.bundle_no || null,
            bundle_section: item.bundle_section || null,
            source_table: isManualBolt ? null : item.source_table || null,
            source_record_id: isManualBolt ? null : item.source_record_id || null,
            material_type: isManualBolt
              ? "bolt"
              : item.source_table === "tower_material_members"
              ? "steel_member"
              : "other",
            bolt_size: isManualBolt ? item.bolt_size.trim() || null : null,
            item_reference: isManualBolt ? null : item.item_reference.trim() || null,
            item_description:
              isManualBolt
                ? item.item_description.trim() || null
                : item.material_kind === "manual"
                ? [item.manual_category, item.item_description]
                    .filter(Boolean)
                    .join(" · ") || null
                : item.item_description || null,
            quantity: Number(item.quantity || 1),
            unit: isManualBolt ? "ea" : item.unit || null,
          };
        })
      );

      if (itemInsert.error) {
        throw new Error(`Daily Docket saved, but material event items could not be saved: ${itemInsert.error.message}`);
      }

      if (event.people.length) {
        const peopleInsert = await supabase.from("tower_material_event_people").insert(
          event.people.map((person) => ({
            event_id: eventId,
            employee_id: person.employee_id || null,
            employee_name: person.employee_name,
            employee_role: person.employee_role || null,
            involvement_type: "search_verify",
            started_at: combineDocketDateTime(docketDate, person.started_at),
            finished_at: combineDocketDateTime(docketDate, person.finished_at),
          }))
        );

        if (peopleInsert.error) {
          throw new Error(`Daily Docket saved, but material event personnel could not be saved: ${peopleInsert.error.message}`);
        }
      }

      if (event.plant.length) {
        const plantInsert = await supabase.from("tower_material_event_plant").insert(
          event.plant.map((row) => ({
            event_id: eventId,
            plant_asset_id: null,
            plant_name: row.plant_name,
            asset_number: row.asset_number || null,
            involvement_type: "affected",
            started_at: combineDocketDateTime(docketDate, row.started_at),
            finished_at: combineDocketDateTime(docketDate, row.finished_at),
          }))
        );

        if (plantInsert.error) {
          throw new Error(`Daily Docket saved, but material event plant could not be saved: ${plantInsert.error.message}`);
        }
      }
    }
  }

  function addDocketDefectDraft() {
    if (isView || locked) return;

    setDocketDefectDrafts((current) => [
      ...current,
      blankDocketDefectDraft(),
    ]);
    setOpenSections((current) => new Set([...current, "defects"]));
  }

  function updateDocketDefectDraft(
    index: number,
    patch: Partial<DocketDefectDraft>,
  ) {
    if (isView || locked) return;

    setDocketDefectDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, ...patch } : draft,
      ),
    );
  }

  function removeDocketDefectDraft(index: number) {
    if (isView || locked) return;
    setDocketDefectDrafts((current) =>
      current.filter((_, draftIndex) => draftIndex !== index),
    );
  }

  function queueExistingDefectLink() {
    if (isView || locked || !defectLinkSelection) return;

    const alreadyLinked = linkedDocketDefects.some(
      (row) => row.id === defectLinkSelection,
    );
    const alreadyQueued = pendingExistingDefectIds.includes(
      defectLinkSelection,
    );

    if (!alreadyLinked && !alreadyQueued) {
      setPendingExistingDefectIds((current) => [
        ...current,
        defectLinkSelection,
      ]);
    }

    setDefectLinkSelection("");
  }

  function removeLinkedDocketDefect(defect: LinkedDocketDefect) {
    if (isView || locked) return;

    if (!window.confirm(
      `Remove ${defect.defect_number || "this Defect"} from this Daily Docket?\n\nThe Defect itself will remain in the tower Defect Register.`,
    )) {
      return;
    }

    setLinkedDocketDefects((current) =>
      current.filter((row) => row.id !== defect.id),
    );
    setRemovedLinkedDefectIds((current) =>
      current.includes(defect.id)
        ? current
        : [...current, defect.id],
    );
  }

  function removeQueuedExistingDefect(defectId: string) {
    if (isView || locked) return;
    setPendingExistingDefectIds((current) =>
      current.filter((id) => id !== defectId),
    );
  }

  async function uploadDocketDefectPhotos(
    defectId: string,
    photos: File[],
  ) {
    for (const original of photos) {
      const file = await normaliseQualityPhoto(original);

      const body = new FormData();
      body.set("projectId", projectId);
      body.set("towerId", towerId);
      body.set("defectId", defectId);
      body.set("fileRole", "defect_photo");
      body.set("capturedAt", new Date().toISOString());
      body.set("file", file);

      const response = await qualityApiFetch(
        "/api/quality/files/upload",
        {
          method: "POST",
          body,
        },
      );

      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error || `Failed to upload ${original.name}.`,
        );
      }
    }
  }

  async function syncDocketDefects(docketIdValue: string) {
    // Remove only the Daily Docket association. Never delete the controlled
    // Defect record from the Defect Register.
    for (const defectId of removedLinkedDefectIds) {
      const response = await qualityApiFetch(
        "/api/quality/defects/docket-links",
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            towerId,
            docketId: docketIdValue,
            defectId,
          }),
        },
      );

      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error || "A Defect could not be unlinked from the Daily Docket.",
        );
      }
    }

    setRemovedLinkedDefectIds([]);

    for (const defectId of pendingExistingDefectIds) {
      const response = await qualityApiFetch(
        "/api/quality/defects/docket-links",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            towerId,
            docketId: docketIdValue,
            defectId,
            linkType: "referenced",
          }),
        },
      );

      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error || "An existing Defect could not be linked to the Daily Docket.",
        );
      }
    }

    setPendingExistingDefectIds([]);

    // New Defects are created through the central Quality API so the same
    // numbering, assignment and notification workflow is used by Website,
    // Daily Docket and the future mobile Defects module.
    for (const draft of [...docketDefectDrafts]) {
      const description = draft.description.trim();
      const otherIssue = draft.other_issue_text.trim();

      if (!draft.issue_type_id) {
        throw new Error(
          "Select a Common Issue or choose Other for every new Defect.",
        );
      }

      if (
        draft.issue_type_id === "__other__" &&
        !otherIssue
      ) {
        throw new Error(
          "Enter the issue details when Common Issue is set to Other.",
        );
      }

      if (!description && !otherIssue) {
        throw new Error(
          "Enter a description for every Defect raised from this Daily Docket.",
        );
      }

      const finalDescription =
        draft.issue_type_id === "__other__"
          ? [otherIssue, description]
              .filter(Boolean)
              .join(" — ")
          : description;

      const response = await qualityApiFetch(
        "/api/quality/defects",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            towerId,
            issueTypeId:
              draft.issue_type_id === "__other__"
                ? null
                : draft.issue_type_id,
            memberNumber: draft.member_number.trim() || null,
            segment: draft.segment.trim() || null,
            drawingNumber: draft.drawing_number.trim() || null,
            description: finalDescription,
            severity: draft.severity,
            assignedToUserId:
              draft.assigned_to_user_id || null,
            source: "daily_docket",
            sourceDocketId: docketIdValue,
          }),
        },
      );

      const payload = (await response.json()) as {
        defect?: ExistingTowerDefect;
        error?: string;
        warning?: string | null;
      };

      if (!response.ok || !payload.defect) {
        throw new Error(
          payload.error || "A Defect could not be created from the Daily Docket.",
        );
      }

      if (draft.photos.length > 0) {
        await uploadDocketDefectPhotos(
          payload.defect.id,
          draft.photos,
        );
      }

      // Remove each successfully-created draft immediately. If a later item
      // fails, retrying the docket cannot accidentally create this one twice.
      setDocketDefectDrafts((current) =>
        current.filter((row) => row.ui_id !== draft.ui_id),
      );

      setLinkedDocketDefects((current) => [
        ...current.filter((row) => row.id !== payload.defect!.id),
        {
          ...payload.defect!,
          link_id: `created-${payload.defect!.id}`,
          link_type: "raised",
        },
      ]);
      setTowerDefectOptions((current) => [
        payload.defect!,
        ...current.filter((row) => row.id !== payload.defect!.id),
      ]);
    }
  }

  async function getNextDayworkSequence() {
    const { data, error } = await supabase
      .from("dayworks")
      .select("sequence_no")
      .eq("project_id", projectId)
      .order("sequence_no", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error("Daily docket saved, but failed to get next daywork number.");
    }

    return data?.sequence_no ? Number(data.sequence_no) + 1 : 1;
  }

  async function syncDelayDayworks(docketIdValue: string) {
    const { data: towerData } = await supabase
      .from("towers")
      .select("id, name, line, extra_data")
      .eq("id", towerId)
      .single();

    const towerLocation =
      String(
        towerData?.name ||
          towerData?.extra_data?.tower_number ||
          towerData?.extra_data?.structure_number ||
          towerData?.extra_data?.tower_no ||
          ""
      ) || "Tower related works";

    const activeDelays = delayRows.filter((delay) => toNumber(delay.delay_hours) > 0);

    const { data: existingLinkedDayworks, error: existingDayworksError } = await supabase
      .from("dayworks")
      .select("id, source_delay_key")
      .eq("source_docket_id", docketIdValue)
      .eq("source_type", "daily_docket_delay");

    if (existingDayworksError) {
      throw new Error("Daily docket saved, but linked dayworks could not be checked.");
    }

    const existingByKey = new Map(
      ((existingLinkedDayworks || []) as { id: string; source_delay_key: string | null }[])
        .filter((row) => row.source_delay_key)
        .map((row) => [row.source_delay_key as string, row.id])
    );

    const activeKeys = new Set<string>();
    let nextSequence = await getNextDayworkSequence();

    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select("project_number")
      .eq("id", projectId)
      .single();

    if (projectError || !projectData?.project_number) {
      throw new Error("Daily docket saved, but project number is missing for linked dayworks.");
    }

    for (const [index, delay] of activeDelays.entries()) {
      const meta = delayDayworkMeta(delay.delay_type);
      const sourceDelayKey = `${delay.delay_type}-${index + 1}`;
      activeKeys.add(sourceDelayKey);

      const affectedLabour =
        delay.applies_to === "entire_crew"
          ? labourRowsWithProduction.filter((row) => row.worker_name.trim())
          : labourRowsWithProduction.filter((row) =>
              delay.worker_names.some(
                (name) => normalizeWorkerName(name) === normalizeWorkerName(row.worker_name)
              )
            );

      const affectedPlant =
        delay.delay_applies_mode === "labour_and_plant"
          ? delay.plant_names.length > 0
            ? plantRowsWithTotals.filter((row, plantIndex) => {
                const displayName = plantDisplayName(row, plantIndex);
                return delay.plant_names.some(
                  (name) => normalizeWorkerName(name) === normalizeWorkerName(displayName)
                );
              })
            : plantRowsWithTotals.filter(
                (row) =>
                  row.plant_name.trim() ||
                  row.asset_id.trim() ||
                  row.plant_type.trim()
              )
          : [];

      const descriptionText = [
        `${meta.label} recorded from daily docket.`,
        delay.delay_reason ? `Reason: ${delay.delay_reason}` : "",
        `Delay duration: ${toNumber(delay.delay_hours).toFixed(2)} hours.`,
        `Labour affected: ${
          delay.applies_to === "entire_crew"
            ? "Entire crew"
            : delay.worker_names.join(", ") || "Selected workers"
        }.`,
        delay.delay_applies_mode === "labour_and_plant"
          ? `Plant affected: ${delay.plant_names.join(", ") || "Selected plant"}.`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const existingDayworkId = existingByKey.get(sourceDelayKey);
      let dayworkIdForRows = existingDayworkId;

      if (existingDayworkId) {
        const { error: updateDayworkError } = await supabase
          .from("dayworks")
          .update({
            tower_id: towerId,
            source_tower_id: towerId,
            daywork_date: docketDate,
            work_type: meta.label,
            work_type_code: meta.code,
            delay_code: meta.code,
            delay_hours: toNumber(delay.delay_hours),
            location: towerLocation,
            description: descriptionText,
            completed_by: leadingHand || null,
            comments: delaysComments || null,
            status: "Draft",
            commercial_status: "Pending Review",
          })
          .eq("id", existingDayworkId);

        if (updateDayworkError) {
          throw new Error("Daily docket saved, but linked daywork update failed.");
        }
      } else {
        const docketNumber = buildDayworkDocketNumber(projectData.project_number, nextSequence);

        const { data: newDaywork, error: insertDayworkError } = await supabase
          .from("dayworks")
          .insert({
            project_id: projectId,
            tower_id: towerId,
            source_tower_id: towerId,
            source_type: "daily_docket_delay",
            source_docket_id: docketIdValue,
            source_delay_key: sourceDelayKey,
            docket_number: docketNumber,
            sequence_no: nextSequence,
            daywork_date: docketDate,
            work_type: meta.label,
            work_type_code: meta.code,
            delay_code: meta.code,
            delay_hours: toNumber(delay.delay_hours),
            location: towerLocation,
            description: descriptionText,
            completed_by: leadingHand || null,
            comments: delaysComments || null,
            status: "Draft",
            commercial_status: "Pending Review",
          })
          .select("id")
          .single();

        if (insertDayworkError || !newDaywork) {
          throw new Error("Daily docket saved, but linked daywork creation failed.");
        }

        dayworkIdForRows = newDaywork.id;
        nextSequence += 1;
      }

      if (!dayworkIdForRows) continue;

      await supabase.from("daywork_people").delete().eq("daywork_id", dayworkIdForRows);
      await supabase.from("daywork_resources").delete().eq("daywork_id", dayworkIdForRows);

      if (affectedLabour.length > 0) {
        const { error: peopleError } = await supabase.from("daywork_people").insert(
          affectedLabour.map((row) => ({
            daywork_id: dayworkIdForRows,
            employee_id: null,
            employee_name: row.worker_name.trim(),
            start_time: row.time_in || null,
            finish_time: row.time_out || null,
            total_hours: toNumber(delay.delay_hours),
            activity: `${meta.label}${delay.delay_reason ? ` - ${delay.delay_reason}` : ""}`,
          }))
        );

        if (peopleError) {
          throw new Error("Daily docket saved, but linked daywork personnel failed.");
        }
      }

      if (affectedPlant.length > 0) {
        const { error: resourceError } = await supabase.from("daywork_resources").insert(
          affectedPlant.map((row, plantIndex) => ({
            daywork_id: dayworkIdForRows,
            resource_name: plantDisplayName(row, plantIndex),
            hours: toNumber(delay.delay_hours),
            activity: meta.label,
            notes: delay.delay_reason || null,
          }))
        );

        if (resourceError) {
          throw new Error("Daily docket saved, but linked daywork resources failed.");
        }
      }
    }

    const staleDayworks = (
      (existingLinkedDayworks || []) as { id: string; source_delay_key: string | null }[]
    )
      .filter((row) => row.source_delay_key && !activeKeys.has(row.source_delay_key))
      .map((row) => row.id);

    if (staleDayworks.length > 0) {
      const { error: staleDeleteError } = await supabase
        .from("dayworks")
        .delete()
        .in("id", staleDayworks);

      if (staleDeleteError) {
        throw new Error("Daily docket saved, but stale linked dayworks could not be removed.");
      }
    }
  }

  async function handleCreate(options?: { navigate?: boolean }) {
    const docketFileUrl = await uploadFileIfNeeded();

    const { data: docket, error: docketError } = await supabase
      .from("tower_daily_dockets")
      .insert({
        project_id: projectId,
        tower_id: towerId,
        ...buildDocketPayload(docketFileUrl, null),
      })
      .select()
      .single();

    if (docketError || !docket) throw new Error("Failed to save daily docket");

    const labourPayload = buildLabourPayload(docket.id);
    if (labourPayload.length > 0) {
      const labourRes = await supabase.from("tower_docket_labour").insert(labourPayload);
      if (labourRes.error) {
        throw new Error(
          "Daily docket saved, but labour rows failed. Check that the production hour columns exist on tower_docket_labour."
        );
      }
    }

    const plantPayload = buildPlantPayload(docket.id);
    if (plantPayload.length > 0) {
      const plantRes = await supabase.from("tower_docket_plant").insert(plantPayload);
      if (plantRes.error) {
        throw new Error(
          "Daily docket saved, but plant rows failed. Create the tower_docket_plant table before using Schedule of Rates plant tracking."
        );
      }
    }

    const delayPayload = buildDelayPayload(docket.id);
    if (delayPayload.length > 0) {
      const delayRes = await supabase.from("tower_docket_delays").insert(delayPayload);
      if (delayRes.error) {
        throw new Error(
          "Daily docket saved, but delay rows failed. Check that tower_docket_delays exists."
        );
      }
    }

    const progressPayload = buildProgressPayload(docket.id);
    if (progressPayload.length > 0) {
      const progressRes = await supabase.from("tower_docket_progress").insert(progressPayload);
      if (progressRes.error) {
        throw new Error("Daily docket saved, but progress rows failed.");
      }
    }

    await syncTowerRevisionAllocations(docket.id);
    await syncMaterialEvents(docket.id);
    await syncBundleTransfers(docket.id);
    await syncDelayDayworks(docket.id);
    await recalcTowerProgressAndStatus();
    await syncDocketDefects(String(docket.id));

    if (options?.navigate !== false) {
      router.push(`/project/${projectId}/tower/${towerId}/dockets`);
      router.refresh();
    }

    return String(docket.id);
  }

  async function handleUpdate(options?: { navigate?: boolean }) {
    if (!docketId) throw new Error("Missing docket id");

    const { data: existing, error: existingError } = await supabase
      .from("tower_daily_dockets")
      .select("id, client_rep_name, signed_date, approval_status, progress_model")
      .eq("id", docketId)
      .single();

    if (existingError || !existing) {
      throw new Error("Could not load docket for editing.");
    }

    if (isClientSignedDocket(existing) || ["submitted_bc","client_pending","final","legacy_final"].includes(String(existing.approval_status || ""))) {
      throw new Error("This docket is locked by its approval status and cannot be edited.");
    }

    const docketFileUrl = await uploadFileIfNeeded();

    const updateRes = await supabase
      .from("tower_daily_dockets")
      .update(buildDocketPayload(docketFileUrl, existing.signed_date))
      .eq("id", docketId);

    if (updateRes.error) {
      throw new Error(
        "Failed to update docket. Check that the production manhour columns exist on tower_daily_dockets."
      );
    }

    const [deleteLabourRes, deleteDelayRes, deletePlantRes, deleteProgressRes] =
      await Promise.all([
        supabase.from("tower_docket_labour").delete().eq("docket_id", docketId),
        supabase.from("tower_docket_delays").delete().eq("docket_id", docketId),
        supabase.from("tower_docket_plant").delete().eq("docket_id", docketId),
        supabase.from("tower_docket_progress").delete().eq("docket_id", docketId),
      ]);

    if (deleteLabourRes.error) throw new Error("Failed to refresh labour rows.");
    if (deleteDelayRes.error) throw new Error("Failed to refresh delay rows.");
    if (deletePlantRes.error && shouldSavePlantRows) {
      throw new Error("Failed to refresh plant rows. Check that tower_docket_plant exists.");
    }
    if (deleteProgressRes.error) throw new Error("Failed to refresh progress rows.");

    const labourPayload = buildLabourPayload(docketId);
    if (labourPayload.length > 0) {
      const labourInsertRes = await supabase.from("tower_docket_labour").insert(labourPayload);
      if (labourInsertRes.error) {
        throw new Error(
          "Failed to save labour rows. Check that the production hour columns exist on tower_docket_labour."
        );
      }
    }

    const plantPayload = buildPlantPayload(docketId);
    if (plantPayload.length > 0) {
      const plantInsertRes = await supabase.from("tower_docket_plant").insert(plantPayload);
      if (plantInsertRes.error) {
        throw new Error(
          "Failed to save plant rows. Create the tower_docket_plant table before using Schedule of Rates plant tracking."
        );
      }
    }

    const delayPayload = buildDelayPayload(docketId);
    if (delayPayload.length > 0) {
      const delayInsertRes = await supabase.from("tower_docket_delays").insert(delayPayload);
      if (delayInsertRes.error) {
        throw new Error("Failed to save delay rows. Check that tower_docket_delays exists.");
      }
    }

    const progressPayload = buildProgressPayload(docketId);
    if (progressPayload.length > 0) {
      const progressInsertRes = await supabase
        .from("tower_docket_progress")
        .insert(progressPayload);

      if (progressInsertRes.error) throw new Error("Failed to save progress rows.");
    }

    await syncTowerRevisionAllocations(docketId);
    await syncMaterialEvents(docketId);
    await syncBundleTransfers(docketId);
    await syncDelayDayworks(docketId);
    await recalcTowerProgressAndStatus();
    await syncDocketDefects(docketId);

    if (options?.navigate !== false) {
      router.push(`/project/${projectId}/tower/${towerId}/dockets`);
      router.refresh();
    }
  }

  function handleBcSignatureChange(value: string) {
    if (isView || locked) return;

    setBcSignatureDataUrl(value);
    setBcSignedAt(value ? new Date().toISOString() : "");
  }

  function validateTowerWorkAllocations() {
    const usedTowerIds = new Set<string>();

    for (const work of additionalTowerWork) {
      const share = additionalTowerAllocationPercent(work);
      const hasAnyEntry =
        Boolean(work.target_tower_id) ||
        share > 0 ||
        work.progress_rows.some(
          (row) =>
            row.assembly_today.trim() !== "" ||
            row.erection_today.trim() !== ""
        );

      if (!hasAnyEntry) continue;

      if (!work.target_tower_id) {
        return "Select the additional tower worked before saving the docket.";
      }

      if (work.target_tower_id === towerId) {
        return "The primary tower is already shown above. Do not add it again as an additional tower.";
      }

      if (usedTowerIds.has(work.target_tower_id)) {
        return "The same additional tower has been added more than once. Combine its work into one tower allocation.";
      }
      usedTowerIds.add(work.target_tower_id);

      if (share <= 0) {
        return "Each additional tower worked needs a Production Share greater than 0%.";
      }
    }

    if (additionalProductionAllocationPercent > 100.01) {
      return `Additional tower production shares total ${additionalProductionAllocationPercent.toFixed(
        1
      )}%. Reduce them to 100% or less. The primary tower automatically receives the balance.`;
    }

    if (revisionAllocatedMH > totalProductionHours + 0.01) {
      return `Revision / rectification allocations exceed available Production MH by ${(
        revisionAllocatedMH - totalProductionHours
      ).toFixed(2)} MH.`;
    }

    if (productionAllocationOverByMH > 0.01) {
      return `Tower/revision allocation exceeds available Production MH by ${productionAllocationOverByMH.toFixed(2)} MH.`;
    }

    return "";
  }

  async function handleSaveDraft() {
    if (!projectId || !towerId) {
      alert("Invalid route");
      return;
    }

    if (!docketDate) {
      alert("Please enter docket date");
      return;
    }

    if (!leadingHand.trim()) {
      alert("Please enter leading hand name");
      return;
    }

    if (hasDuplicateWorkers) {
      alert("Duplicate worker names found. Each worker can only appear once in a daily docket.");
      return;
    }

    if (incidentOccurred && !incidentType) {
      alert("Please select the incident type.");
      return;
    }

    if (incidentOccurred && !incidentNotes.trim()) {
      alert("Please enter incident notes/action required.");
      return;
    }

    const allocationError = validateTowerWorkAllocations();
    if (allocationError) {
      alert(allocationError);
      setOpenSections((prev) => new Set([...prev, "progress"]));
      return;
    }

    setSaving(true);

    try {
      if (mode === "create") {
        await handleCreate();
      } else if (mode === "edit") {
        await handleUpdate();
      }
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitForApproval() {
    if (locked || isView) return;

    if (mode !== "create" && mode !== "edit") return;

    if (!docketDate) {
      alert("Please enter docket date");
      return;
    }

    if (!leadingHand.trim()) {
      alert("Please enter leading hand name");
      return;
    }

    if (hasDuplicateWorkers) {
      alert(
        "Duplicate worker names found. Each worker can only appear once in a daily docket."
      );
      return;
    }

    if (incidentOccurred && !incidentType) {
      alert("Please select the incident type.");
      return;
    }

    if (incidentOccurred && !incidentNotes.trim()) {
      alert("Please enter incident notes/action required.");
      return;
    }

    const allocationError = validateTowerWorkAllocations();
    if (allocationError) {
      alert(allocationError);
      setOpenSections((prev) => new Set([...prev, "progress"]));
      return;
    }

    if (!bcRepName.trim()) {
      alert(
        "Please enter the BC Representative before submitting for approval."
      );
      return;
    }

    if (!bcSignatureDataUrl) {
      alert(
        "Please capture the BC Representative signature before submitting for approval."
      );
      return;
    }

    const confirmed = window.confirm(
      "Submit this Daily Docket for BC approval? Your latest changes will be saved first, then the docket will be locked while it is under review."
    );

    if (!confirmed) return;

    setSubmittingApproval(true);

    try {
      let savedDocketId = docketId || "";

      if (mode === "create") {
        savedDocketId = await handleCreate({ navigate: false });
      } else {
        if (!docketId) {
          throw new Error("Missing docket id.");
        }

        await handleUpdate({ navigate: false });
        savedDocketId = docketId;
      }

      if (!savedDocketId) {
        throw new Error(
          "The Daily Docket was saved but its docket ID could not be resolved."
        );
      }

      const response = await fetch(
        `/api/daily-dockets/${encodeURIComponent(savedDocketId)}/submit-bc`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const result = (await response.json().catch(() => null)) as
        | {
            success?: boolean;
            error?: string;
            status?: string;
            revision?: number;
          }
        | null;

      if (!response.ok) {
        throw new Error(
          result?.error ||
            "The Daily Docket could not be submitted for BC approval."
        );
      }

      setApprovalStatus("submitted_bc");

      alert("Daily Docket saved and submitted for BC approval.");

      router.push(`/project/${projectId}/tower/${towerId}/dockets`);
      router.refresh();
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "The Daily Docket could not be submitted for BC approval."
      );
    } finally {
      setSubmittingApproval(false);
    }
  }

  async function prefillFromLastDocket() {
    try {
      const { data: lastDocket } = await supabase
        .from("tower_daily_dockets")
        .select("*")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false })
        .limit(1)
        .single();

      if (!lastDocket) {
        alert("No previous docket found");
        return;
      }

      const [{ data: labour }, { data: plant }, { data: progress }] = await Promise.all([
        supabase.from("tower_docket_labour").select("*").eq("docket_id", lastDocket.id),
        supabase.from("tower_docket_plant").select("*").eq("docket_id", lastDocket.id),
        supabase.from("tower_docket_progress").select("*").eq("docket_id", lastDocket.id),
      ]);

      const nextDate = lastDocket.docket_date
        ? (() => {
            const d = new Date(lastDocket.docket_date);
            d.setDate(d.getDate() + 1);
            return d.toISOString().slice(0, 10);
          })()
        : "";

      setDocketDate(nextDate);
      setCrewName(toStringValue(lastDocket.crew));
      setLeadingHand(toStringValue(lastDocket.leading_hand));
      setWeather(toStringValue(lastDocket.weather));
      setRateType(lastDocket.rate_type === "schedule_of_rates" ? "schedule_of_rates" : "tonnage_rate");
      setProgressModel("section_v2");
      setApprovalStatus("draft");

      setWeatherDelayHours(toStringValue(lastDocket.weather_delay_hours));
      setLightningDelayHours(toStringValue(lastDocket.lightning_delay_hours));
      setToolboxDelayHours(toStringValue(lastDocket.toolbox_delay_hours));
      setOtherDelayHours(toStringValue(lastDocket.other_delay_hours));
      setOtherDelayReason(toStringValue(lastDocket.other_delay_reason));
      setMissingItemsBolts(toStringValue(lastDocket.missing_items_bolts));
      setDelaysComments("");
      setDailySiteSummary("");
      setRfiReferencesText("");

      setPrestartMinutes(toStringValue(lastDocket.prestart_minutes));
      setLunchBreakMinutes(toStringValue(lastDocket.lunch_break_minutes));
      setTravelInMinutes(toStringValue(lastDocket.travel_in_minutes));
      setTravelOutMinutes(toStringValue(lastDocket.travel_out_minutes));
      setMobilisationHours(toStringValue(lastDocket.mobilisation_hours));
      setMobilisationNotes(toStringValue(lastDocket.mobilisation_notes));
      setIncidentOccurred(false);
      setIncidentType("");
      setIncidentNotes("");

      setBcRepName("");
      setBcSignatureDataUrl("");
      setBcSignedAt("");
      setClientRepName("");
      setSignedDate("");
      setDocketFile(null);
      setExistingDocketFileUrl("");
      setSharePointUrl("");
      setSharePointStatus("");
      setPublishedPdfName("");

      if (labour && labour.length > 0) {
        const mappedLabour = labour.map((r) => makeLabourRow(r));
        const dedupedLabour: LabourRow[] = [];
        const seen = new Set<string>();

        mappedLabour.forEach((row) => {
          const key = normalizeWorkerName(row.worker_name);
          if (!key || seen.has(key)) return;
          seen.add(key);
          dedupedLabour.push(row);
        });

        setLabourRows(dedupedLabour);
      } else {
        setLabourRows([
          blankLabourRow({
            prestartMinutes: toStringValue(lastDocket.prestart_minutes),
            lunchBreakMinutes: toStringValue(lastDocket.lunch_break_minutes),
            travelInMinutes: toStringValue(lastDocket.travel_in_minutes),
            travelOutMinutes: toStringValue(lastDocket.travel_out_minutes),
          }),
        ]);
      }

      if (plant && plant.length > 0) {
        setPlantRows([...plant.map((r) => makePlantRow(r)), blankPlantRow()]);
      } else {
        setPlantRows([]);
      }

      setDelayRows([]);
      setMaterialEvents([]);
      setBundleTransferDrafts([]);
      setBundleTransfers([]);
      setTowerRevisionAllocations([]);
      setDocketDefectDrafts([]);
      setLinkedDocketDefects([]);
      setPendingExistingDefectIds([]);
      setRemovedLinkedDefectIds([]);
      setDefectLinkSelection("");
      setPrimaryWorkActivity("mixed");
      setPrimaryWorkNotes("");
      setAdditionalTowerWork([]);
      setMobilisation({
        enabled: false,
        from_tower_id: "",
        to_tower_id: towerId,
        status: "planning",
        percent_complete: "0",
        started_date: "",
        target_move_date: "",
        completed_date: "",
        notes: "",
        worker_names: [],
      });
      setMobilisationHours("");
      setMobilisationNotes("");

      if (progress && progress.length > 0 && lastDocket.progress_model === "section_v2") {
        const rawRows = (progress as any[]).filter((row) => !row.tower_id || String(row.tower_id) === towerId);

        // A section_v2 docket only stores the BE row when Body Extension was included.
        // Carry that exact choice forward instead of re-applying the tower CSV default.
        const previousHasBodyExtension = rawRows.some(
          (row) => String(row.section_code || "").trim().toUpperCase() === "BE"
        );
        setHasBodyExtension(previousHasBodyExtension);

        // Prefill the previous docket's closing section percentages as today's opening values.
        // Prefer the explicit overall columns, then fall back to the compatibility/today columns
        // for older section_v2 records.
        setSectionV2Rows((configured) =>
          configured.map((cfg) => {
            const previous = rawRows.find(
              (row) =>
                String(row.section_code || "").trim().toUpperCase() ===
                cfg.section_code
            );

            if (!previous) {
              return {
                ...cfg,
                assembly_today: "",
                erection_today: "",
                assembly_weight:
                  SECTION_PROGRESS_WEIGHTS[cfg.section_code] ??
                  cfg.assembly_weight,
                erection_weight:
                  SECTION_PROGRESS_WEIGHTS[cfg.section_code] ??
                  cfg.erection_weight,
              };
            }

            return {
              ...cfg,
              section_label: toStringValue(
                previous.section_label || cfg.section_label
              ),
              assembly_today: toStringValue(
                previous.assembly_overall ??
                  previous.assembly_today ??
                  previous.assembled_qty
              ),
              erection_today: toStringValue(
                previous.erection_overall ??
                  previous.erection_today ??
                  previous.erected_qty
              ),
              assembly_weight:
                SECTION_PROGRESS_WEIGHTS[cfg.section_code] ??
                cfg.assembly_weight,
              erection_weight:
                SECTION_PROGRESS_WEIGHTS[cfg.section_code] ??
                cfg.erection_weight,
            };
          })
        );
      } else {
        // Legacy history is intentionally not converted into v2 section percentages.
        // Keep the tower's configured Body Extension default for the first section_v2 docket.
        const { data: tower } = await supabase
          .from("towers")
          .select("id, name, line, extra_data")
          .eq("id", towerId)
          .single();

        setHasBodyExtension(
          inferTowerHasBodyExtension((tower as TowerRecord | null) || null)
        );

        setSectionV2Rows((configured) =>
          configured.map((row) => ({
            ...row,
            assembly_today: "",
            erection_today: "",
          }))
        );
      }
    } catch (err) {
      console.error(err);
      alert("Failed to prefill docket");
    }
  }

  function applyBulkTimes() {
    setLabourRows((prev) =>
      prev.map((row) => {
        const time_in = bulkTimeIn || row.time_in;
        const time_out = bulkTimeOut || row.time_out;
        const total_hours = calculateHours(time_in, time_out) || row.total_hours;

        const next = { ...row, time_in, time_out, total_hours };

        return {
          ...next,
          production_hours: calculateProductionHours(
            next,
            delayHoursForWorker(next.worker_name, delayRows)
          ),
        };
      })
    );
  }

  function addPlantRow() {
    if (isView || locked) return;
    setPlantRows((prev) => [...prev, blankPlantRow()]);
  }

  function removePlantRow(index: number) {
    if (isView || locked) return;
    setPlantRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updatePlantRow(index: number, key: keyof PlantRow, value: string) {
    if (isView || locked) return;

    setPlantRows((prev) => {
      const updated = prev.map((row, i) =>
        i === index ? { ...row, [key]: value } : row
      );

      const current = updated[index];
      if (key === "time_in" || key === "time_out") {
        current.total_hours =
          calculateHours(current.time_in, current.time_out) || current.total_hours;
      }

      return updated;
    });
  }


  return (
    <div className="p-4 md:p-8 max-w-7xl space-y-6 bg-slate-50 min-h-screen">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {mode === "create"
              ? "Add Daily Docket"
              : mode === "edit"
              ? "Edit Daily Docket"
              : "View Daily Docket"}
          </h1>
          <p className="text-slate-500 mt-1">
            Enter section quantities, labour, rate type, plant usage, delays, production deductions, and sign-off.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {mode === "create" && !isView && !locked && (
            <button
              type="button"
              onClick={prefillFromLastDocket}
              className="bg-slate-800 text-white px-5 py-3 rounded-xl shadow-sm hover:bg-slate-900"
            >
              Prefill Yesterday
            </button>
          )}

          <div className="inline-flex overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
            <button
              type="button"
              onClick={expandAllSections}
              className="px-3 py-3 text-xs font-black text-slate-700 hover:bg-slate-50"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAllSections}
              className="border-l border-slate-200 px-3 py-3 text-xs font-black text-slate-700 hover:bg-slate-50"
            >
              Collapse All
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push(`/project/${projectId}/tower/${towerId}/dockets`)
            }
            className="border border-slate-300 bg-white px-5 py-3 rounded-xl shadow-sm hover:bg-slate-100"
          >
            ← Back
          </button>
        </div>
      </div>

      {locked && mode === "edit" && (
        <div className="border border-blue-200 bg-blue-50 text-blue-800 rounded-2xl p-4">
          {approvalStatus === "submitted_bc"
            ? "This docket is pending BC approval and is locked for editing."
            : approvalStatus === "client_pending"
            ? "This docket is pending client approval and is locked for editing."
            : "This docket has been approved and is locked for editing."}
        </div>
      )}

      {hasDuplicateWorkers && !locked && !isView && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-2xl p-4">
          Duplicate worker names detected. Each worker can only appear once in this daily docket.
        </div>
      )}

      <CollapsibleSection
        id="header"
        title="Docket Header"
        subtitle="Crew, date, weather and commercial rate type."
        open={openSections.has("header")}
        onToggle={() => toggleSection("header")}
        badge={rateType === "schedule_of_rates" ? "Schedule of Rates" : "Tonnage Rate"}
        tone="slate"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="sr-only">Docket Header</h2>
            <p className="text-sm text-slate-500 mt-1">
              Select whether this docket is claimed under tonnage rate or schedule of rates.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 flex gap-2">
            <button
              type="button"
              disabled={locked || isView}
              onClick={() => setRateType("tonnage_rate")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                rateType === "tonnage_rate"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white text-slate-700 border border-slate-200"
              } disabled:opacity-60`}
            >
              Tonnage Rate
            </button>

            <button
              type="button"
              disabled={locked || isView}
              onClick={() => setRateType("schedule_of_rates")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                rateType === "schedule_of_rates"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "bg-white text-slate-700 border border-slate-200"
              } disabled:opacity-60`}
            >
              Schedule of Rates
            </button>
          </div>
        </div>

        {towerLabel && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Tower:</span> {towerLabel}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <Input
            label="Date"
            type="date"
            value={docketDate}
            onChange={setDocketDate}
            disabled={locked || isView}
          />

          <div>
            <label className="block text-sm font-medium mb-1">Crew Number</label>
            <select
              className="border rounded-lg p-2 w-full disabled:bg-slate-100 bg-white"
              value={selectedCrewId}
              disabled={locked || isView}
              onChange={(e) => handleCrewSelection(e.target.value)}
            >
              <option value="">Select crew...</option>
              {crewOptions.map((crew) => (
                <option key={crew.id} value={crew.id}>
                  {crew.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Selecting a crew auto-fills labour from Admin → Crews. You can still edit workers below.
            </p>
          </div>

          <Input
            label="Crew Number / Manual Override"
            value={crewName}
            onChange={setCrewName}
            disabled={locked || isView}
          />
          <Input
            label="Leading Hand Name"
            value={leadingHand}
            onChange={setLeadingHand}
            disabled={locked || isView}
          />
          <Input
            label="Weather"
            value={weather}
            onChange={setWeather}
            disabled={locked || isView}
          />
        </div>

        {rateType === "schedule_of_rates" && (
          <div className="rounded-2xl border border-purple-200 bg-purple-50 text-purple-800 p-4 text-sm">
            Schedule of Rates selected. The docket will include a Plant & Equipment section for cranes, telehandlers, EWP, trucks, or other hired plant used that day.
          </div>
        )}
            </CollapsibleSection>

      <CollapsibleSection
        id="progress"
        title="Tower Progress & Work Split"
        subtitle="Track every tower worked by this crew on the same day and attribute production MH without creating a second docket."
        open={openSections.has("progress")}
        onToggle={() => toggleSection("progress")}
        badge={`${1 + additionalTowerWork.length} tower${additionalTowerWork.length === 0 ? "" : "s"}`}
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <AllocationMetric
            label="Production MH"
            value={totalProductionHours.toFixed(2)}
            tone="emerald"
          />
          <AllocationMetric
            label="Tower Work Pool"
            value={towerWorkProductionPoolMH.toFixed(2)}
            tone="blue"
          />
          <AllocationMetric
            label="Primary Tower"
            value={`${primaryProductionAllocationPercent.toFixed(1)}%`}
            tone="emerald"
          />
          <AllocationMetric
            label="Revision MH"
            value={revisionAllocatedMH.toFixed(2)}
            tone="amber"
          />
        </div>

        {additionalProductionAllocationPercent > 100 && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            Additional towers currently total {additionalProductionAllocationPercent.toFixed(1)}%. Reduce them to 100% or less.
          </div>
        )}

        {additionalTowerWork.length > 0 && additionalProductionAllocationPercent <= 100 && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Labour calculates {totalProductionHours.toFixed(2)} Production MH once. After {revisionAllocatedMH.toFixed(2)} MH of revision work, the remaining {towerWorkProductionPoolMH.toFixed(2)} MH is split by production share. The primary tower automatically receives the {primaryProductionAllocationPercent.toFixed(1)}% balance.
          </div>
        )}

        <div className="rounded-2xl border border-blue-200 bg-blue-50/30 p-4 space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="rounded-full bg-blue-700 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-white">
                  Primary Tower
                </span>
                <h3 className="text-lg font-black text-slate-950">
                  {towerLabel || "Current Tower"}
                </h3>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Labour is the source of truth for hours. This tower automatically receives the production-share balance after any additional towers and revision work.
              </p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-right">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Allocated
              </div>
              <div className="text-lg font-black text-blue-800">
                {primaryProductionAllocationMH.toFixed(2)} MH
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[200px_1fr]">
            <div>
              <label className="block text-xs font-black uppercase tracking-wide text-slate-500 mb-1">
                Work Type
              </label>
              <select
                value={primaryWorkActivity}
                disabled={locked || isView}
                onChange={(e) => setPrimaryWorkActivity(e.target.value as ProductionActivity)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100"
              >
                <option value="mixed">Mixed Assembly / Erection</option>
                <option value="assembly">Assembly</option>
                <option value="erection">Erection</option>
                <option value="rectification">Rectification</option>
                <option value="other">Other</option>
              </select>
            </div>

            <Input
              label="Work Notes (optional)"
              value={primaryWorkNotes}
              onChange={setPrimaryWorkNotes}
              disabled={locked || isView}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <AllocationMetric
              label="Production Share"
              value={`${primaryProductionAllocationPercent.toFixed(1)}%`}
              tone="blue"
            />
            <AllocationMetric
              label="Allocated MH"
              value={primaryProductionAllocationMH.toFixed(2)}
              tone="emerald"
            />
            <AllocationMetric
              label="Workers"
              value={String(availableWorkerNames.length)}
              tone="slate"
            />
          </div>

          <div className="border-t border-blue-100 pt-4">
            {progressModel === "section_v2" ? (
              <>
                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div>
                    <div className="text-sm font-black text-slate-900">Body Extension</div>
                    <div className="text-xs text-slate-500">Controls whether the BE progress row is included.</div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={hasBodyExtension}
                      disabled={locked || isView}
                      onChange={(e) => setHasBodyExtension(e.target.checked)}
                      className="h-4 w-4"
                    />
                    {hasBodyExtension ? "Included" : "Excluded"}
                  </label>
                </div>

                <SectionProgressTable
                  rows={sectionV2Rows}
                  hasBodyExtension={hasBodyExtension}
                  disabled={locked || isView}
                  totals={{
                    assemblyPercent: totalAssemblyPercent,
                    erectionPercent: totalErectionPercent,
                    totalProgressPercent: displayProgress,
                  }}
                  onChange={(sectionCode, key, value) => {
                    const actualIndex = sectionV2Rows.findIndex(
                      (row) => row.section_code === sectionCode
                    );
                    if (actualIndex >= 0) updateSectionV2(actualIndex, key, value);
                  }}
                />
              </>
            ) : (
              <>
                <label className="mb-3 inline-flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={hasBodyExtension}
                    disabled={locked || isView}
                    onChange={(e) => handleBodyExtensionToggle(e.target.checked)}
                    className="h-4 w-4"
                  />
                  This tower has body extensions
                </label>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <table className="w-full">
                    <thead className="bg-slate-100 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="p-3">Section</th>
                        <th className="p-3">Assembly %</th>
                        <th className="p-3">Erection %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleProgressRows.map((row) => {
                        const actualIndex = progressRows.findIndex(
                          (r) => r.section_label === row.section_label
                        );
                        return (
                          <tr key={row.section_label} className="border-t border-slate-100">
                            <td className="p-3 font-bold">{row.section_label}</td>
                            <td className="p-3">
                              <input
                                className="w-full rounded-lg border p-2 disabled:bg-slate-100"
                                type="number"
                                min="0"
                                max="100"
                                value={row.assembled_qty}
                                disabled={locked || isView}
                                onChange={(e) =>
                                  updateProgressRow(actualIndex, "assembled_qty", e.target.value)
                                }
                              />
                            </td>
                            <td className="p-3">
                              <input
                                className="w-full rounded-lg border p-2 disabled:bg-slate-100"
                                type="number"
                                min="0"
                                max="100"
                                value={row.erected_qty}
                                disabled={locked || isView}
                                onChange={(e) =>
                                  updateProgressRow(actualIndex, "erected_qty", e.target.value)
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="grid gap-2 border-t bg-slate-50 p-3 sm:grid-cols-3">
                    <KpiPill label="Total Assembly" value={`${totalAssemblyPercent}%`} tone="blue" />
                    <KpiPill label="Total Erection" value={`${totalErectionPercent}%`} tone="emerald" />
                    <KpiPill label="Tower Progress" value={`${displayProgress}%`} tone="purple" />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {additionalTowerWork.map((work, workIndex) => {
          const workTower = projectTowers.find(
            (tower) => tower.id === work.target_tower_id
          );
          const workTotals = additionalTowerProgressTotals(work);
          const workPercent = additionalTowerAllocationPercent(work);
          const workMh = towerWorkProductionPoolMH * (workPercent / 100);

          return (
            <div
              key={work.ui_id}
              className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-4"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-full bg-emerald-700 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-white">
                      Additional Tower
                    </span>
                    <h3 className="text-lg font-black text-slate-950">
                      {workTower?.name || "Select tower"}
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Enter only this tower’s share of productive crew time. Labour hours are not entered again here.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-right">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Allocated
                    </div>
                    <div className="text-lg font-black text-emerald-800">
                      {workMh.toFixed(2)} MH
                    </div>
                  </div>
                  {!locked && !isView && (
                    <button
                      type="button"
                      onClick={() => removeAdditionalTowerWork(workIndex)}
                      className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-black text-red-700 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_150px_minmax(220px,1fr)]">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wide text-slate-500 mb-1">
                    Tower Worked
                  </label>
                  <select
                    value={work.target_tower_id}
                    disabled={locked || isView}
                    onChange={(e) =>
                      updateAdditionalTowerWork(workIndex, {
                        target_tower_id: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100"
                  >
                    <option value="">Select tower...</option>
                    {projectTowers
                      .filter(
                        (tower) =>
                          tower.id !== towerId &&
                          (!additionalTowerWork.some(
                            (other, otherIndex) =>
                              otherIndex !== workIndex &&
                              other.target_tower_id === tower.id
                          ) ||
                            tower.id === work.target_tower_id)
                      )
                      .map((tower) => (
                        <option key={tower.id} value={tower.id}>
                          {tower.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wide text-slate-500 mb-1">
                    Work Type
                  </label>
                  <select
                    value={work.activity}
                    disabled={locked || isView}
                    onChange={(e) =>
                      updateAdditionalTowerWork(workIndex, {
                        activity: e.target.value as ProductionActivity,
                      })
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100"
                  >
                    <option value="mixed">Mixed Assembly / Erection</option>
                    <option value="assembly">Assembly</option>
                    <option value="erection">Erection</option>
                    <option value="rectification">Rectification</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wide text-slate-500 mb-1">
                    Production Share %
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={
                      work.allocation_percent.trim() !== ""
                        ? work.allocation_percent
                        : work.saved_allocated_mh > 0 && towerWorkProductionPoolMH > 0
                        ? workPercent.toFixed(1)
                        : ""
                    }
                    disabled={locked || isView}
                    placeholder="e.g. 65"
                    onChange={(e) =>
                      updateAdditionalTowerWork(workIndex, {
                        allocation_percent: e.target.value,
                        saved_allocated_mh: 0,
                      })
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100"
                  />
                </div>

                <Input
                  label="Work Notes (optional)"
                  value={work.notes}
                  onChange={(value) =>
                    updateAdditionalTowerWork(workIndex, { notes: value })
                  }
                  disabled={locked || isView}
                />
              </div>


              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div>
                  <div className="text-sm font-black text-slate-900">Body Extension</div>
                  <div className="text-xs text-slate-500">
                    Loaded from the selected tower where available.
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={work.has_body_extension}
                    disabled={locked || isView}
                    onChange={(e) =>
                      updateAdditionalTowerWork(workIndex, {
                        has_body_extension: e.target.checked,
                      })
                    }
                    className="h-4 w-4"
                  />
                  {work.has_body_extension ? "Included" : "Excluded"}
                </label>
              </div>

              <SectionProgressTable
                rows={work.progress_rows}
                hasBodyExtension={work.has_body_extension}
                disabled={locked || isView}
                totals={{
                  assemblyPercent: workTotals.assemblyPercent,
                  erectionPercent: workTotals.erectionPercent,
                  totalProgressPercent: workTotals.totalProgressPercent,
                }}
                onChange={(sectionCode, key, value) =>
                  updateAdditionalTowerProgress(
                    workIndex,
                    sectionCode,
                    key,
                    value
                  )
                }
              />
            </div>
          );
        })}

        {!locked && !isView && (
          <button
            type="button"
            onClick={addAdditionalTowerWork}
            className="w-full rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 px-4 py-4 text-sm font-black text-emerald-800 hover:bg-emerald-50"
          >
            + Add Another Tower Worked Today
          </button>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
          <strong className="text-slate-900">How allocation works:</strong> Raw MH is stored once for this crew/day docket.
          Prestart, lunch, travel, mobilisation and delays reduce it to Production MH. Production/revision work is then attributed to the
          tower where it was actually performed, so a morning mobilisation and afternoon start on another tower does not skew either tower&apos;s MH/T.
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="labour"
        title="Labour"
        subtitle="Enter crew times once; TTTracker calculates raw and productive manhours."
        open={openSections.has("labour")}
        onToggle={() => toggleSection("labour")}
        badge={`${labourWorkerCount} workers · ${totalProductionHours.toFixed(1)} Prod MH`}
        tone="slate"
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="sr-only">Labour</h2>
            <p className="text-sm text-slate-500 mt-1">
              Keep the daily times quick to enter. Prestart, lunch and travel can be adjusted per worker; mobilisation and delays are applied from their sections below.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 text-right">
            <MiniSummary label="Workers" value={String(labourWorkerCount)} />
            <MiniSummary label="Raw MH" value={totalLabourHours.toFixed(2)} />
            <MiniSummary label="Production MH" value={totalProductionHours.toFixed(2)} />
            <MiniSummary label="Prestart MH" value={totalPrestartHours.toFixed(2)} />
            <MiniSummary label="Lunch MH" value={totalLunchHours.toFixed(2)} />
            <MiniSummary label="Travel MH" value={totalTravelHours.toFixed(2)} />
            <MiniSummary label="Delay / Mob MH" value={(totalDelayManhours + totalMobilisationHours).toFixed(2)} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <div className="hidden lg:grid grid-cols-[minmax(240px,1.5fr)_105px_105px_95px_105px_minmax(220px,1fr)_70px] gap-2 px-3 py-2 bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <div>Worker</div>
            <div>Time In</div>
            <div>Time Out</div>
            <div>Raw Hrs</div>
            <div>Prod Hrs</div>
            <div>Deductions</div>
            <div></div>
          </div>

          <div className="divide-y divide-slate-200">
            {labourRowsWithProduction.map((row, index) => {
              const isDuplicate = duplicateWorkerIndexes.has(index);
              const travelMinutes = toNumber(row.travel_in_minutes) + toNumber(row.travel_out_minutes);
              const mobHours = minutesToHours(row.mobilisation_hours);
              const deductionParts = [
                toNumber(row.prestart_minutes) > 0 ? `Prestart ${toNumber(row.prestart_minutes)}m` : "",
                toNumber(row.lunch_minutes) > 0 ? `Lunch ${toNumber(row.lunch_minutes)}m` : "",
                travelMinutes > 0 ? `Travel ${travelMinutes}m` : "",
                mobHours > 0 ? `Mob ${mobHours.toFixed(2)}h` : "",
                toNumber(row.delay_hours) > 0 ? `Delay ${toNumber(row.delay_hours).toFixed(2)}h` : "",
              ].filter(Boolean);

              return (
                <div
                  key={index}
                  className={`p-3 ${isDuplicate ? "bg-red-50" : "bg-white"}`}
                >
                  <div className="grid grid-cols-2 lg:grid-cols-[minmax(240px,1.5fr)_105px_105px_95px_105px_minmax(220px,1fr)_70px] gap-2 items-end">
                    <div className="col-span-2 lg:col-span-1">
                      <label className="block lg:hidden text-xs font-semibold text-slate-500 mb-1">Worker</label>
                      <EmployeeSearchInput
                        id={`labour-name-${index}`}
                        value={row.worker_name}
                        employees={employees}
                        selectedCrewId={selectedCrewId}
                        disabled={locked || isView}
                        invalid={isDuplicate}
                        onChange={(value) => updateLabourRow(index, "worker_name", value)}
                        onCommit={() => focusById(`labour-timein-${index}`)}
                      />
                      {isDuplicate && row.worker_name.trim() && (
                        <p className="text-xs text-red-600 mt-1">Already entered on this docket.</p>
                      )}
                    </div>

                    <LabourInput
                      label="Time In"
                      id={`labour-timein-${index}`}
                      type="time"
                      value={row.time_in}
                      disabled={locked || isView}
                      onKeyDown={(e) => handleLabourKeyDown(e, `labour-timeout-${index}`)}
                      onChange={(v) => updateLabourRow(index, "time_in", v)}
                    />
                    <LabourInput
                      label="Time Out"
                      id={`labour-timeout-${index}`}
                      type="time"
                      value={row.time_out}
                      disabled={locked || isView}
                      onKeyDown={(e) => handleLabourKeyDown(e, `labour-hours-${index}`)}
                      onChange={(v) => updateLabourRow(index, "time_out", v)}
                    />
                    <LabourInput
                      label="Raw Hrs"
                      id={`labour-hours-${index}`}
                      type="number"
                      value={row.total_hours}
                      disabled={locked || isView}
                      onKeyDown={(e) => handleLabourKeyDown(e, `labour-name-${index + 1}`)}
                      onChange={(v) => updateLabourRow(index, "total_hours", v)}
                    />

                    <div>
                      <label className="block text-sm font-medium mb-1 lg:hidden">Prod Hrs</label>
                      <div className="border border-emerald-200 rounded-lg px-2 py-2 text-sm bg-emerald-50 text-emerald-800 font-bold h-10 flex items-center">
                        {row.production_hours || "0.00"}
                      </div>
                    </div>

                    <div className="col-span-2 lg:col-span-1">
                      <label className="block text-sm font-medium mb-1 lg:hidden">Deductions</label>
                      <div className="min-h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 flex items-center">
                        {deductionParts.length ? deductionParts.join(" · ") : "No deductions"}
                      </div>
                    </div>

                    {!locked && !isView ? (
                      <button
                        type="button"
                        onClick={() => removeLabourRow(index)}
                        className="border border-slate-300 px-2 py-2 rounded-lg h-10 text-xs font-semibold hover:bg-slate-50"
                      >
                        Remove
                      </button>
                    ) : (
                      <div />
                    )}
                  </div>

                  <details className="mt-2 group">
                    <summary className="cursor-pointer select-none text-xs font-semibold text-slate-500 hover:text-slate-800 w-fit">
                      Adjust production deductions
                    </summary>
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 items-end rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <LabourInput
                        label="Prestart Min"
                        id={`labour-prestart-${index}`}
                        type="number"
                        value={row.prestart_minutes}
                        disabled={locked || isView}
                        onChange={(v) => updateLabourRow(index, "prestart_minutes", v)}
                      />
                      <LabourInput
                        label="Lunch Min"
                        id={`labour-lunch-${index}`}
                        type="number"
                        value={row.lunch_minutes}
                        disabled={locked || isView}
                        onChange={(v) => updateLabourRow(index, "lunch_minutes", v)}
                      />
                      <LabourInput
                        label="Travel In Min"
                        id={`labour-travelin-${index}`}
                        type="number"
                        value={row.travel_in_minutes}
                        disabled={locked || isView}
                        onChange={(v) => updateLabourRow(index, "travel_in_minutes", v)}
                      />
                      <LabourInput
                        label="Travel Out Min"
                        id={`labour-travelout-${index}`}
                        type="number"
                        value={row.travel_out_minutes}
                        disabled={locked || isView}
                        onChange={(v) => updateLabourRow(index, "travel_out_minutes", v)}
                      />
                      <div>
                        <label className="block text-sm font-medium mb-1">Mob / Delay</label>
                        <div className="border rounded-lg p-2 text-sm bg-white h-10">
                          {mobHours.toFixed(2)}h / {toNumber(row.delay_hours).toFixed(2)}h
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Delay Reason</label>
                        <div className="border rounded-lg p-2 text-sm bg-white min-h-10 text-slate-700">
                          {row.delay_reason || "—"}
                        </div>
                      </div>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        </div>

        {!locked && !isView && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 flex flex-col md:flex-row md:items-end gap-2">
            <button
              type="button"
              onClick={addLabourRow}
              className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-black h-10"
            >
              Add Worker
            </button>

            <div className="grid grid-cols-2 md:grid-cols-[160px_160px_auto] gap-2 items-end flex-1">
              <LabourInput label="Bulk Time In" type="time" value={bulkTimeIn} onChange={setBulkTimeIn} />
              <LabourInput label="Bulk Time Out" type="time" value={bulkTimeOut} onChange={setBulkTimeOut} />
              <button
                type="button"
                onClick={applyBulkTimes}
                className="bg-slate-800 text-white rounded-xl px-4 py-2 text-sm font-semibold h-10 hover:bg-slate-900"
              >
                Apply Times to All
              </button>
            </div>
          </div>
        )}
            </CollapsibleSection>

      <CollapsibleSection
        id="safety"
        title="Safety / Incident"
        subtitle="Confirm whether any incident occurred during the shift."
        open={openSections.has("safety")}
        onToggle={() => toggleSection("safety")}
        badge={incidentOccurred ? "Incident recorded" : "No incident"}
        tone="slate"
      >
        <div>
          <h2 className="sr-only">Safety / Incident Check</h2>
          <p className="text-sm text-slate-500 mt-1">
            Confirm whether an incident occurred during this docket shift.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Has an incident occurred?
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={locked || isView}
              onClick={() => {
                setIncidentOccurred(false);
                setIncidentType("");
                setIncidentNotes("");
              }}
              className={`rounded-xl border px-5 py-3 text-sm font-semibold ${
                !incidentOccurred
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-700"
              } disabled:opacity-60`}
            >
              No
            </button>

            <button
              type="button"
              disabled={locked || isView}
              onClick={() => setIncidentOccurred(true)}
              className={`rounded-xl border px-5 py-3 text-sm font-semibold ${
                incidentOccurred
                  ? "border-red-300 bg-red-50 text-red-800"
                  : "border-slate-200 bg-white text-slate-700"
              } disabled:opacity-60`}
            >
              Yes
            </button>
          </div>
        </div>

        {incidentOccurred && (
          <div className="grid md:grid-cols-2 gap-4 rounded-2xl border border-red-200 bg-red-50 p-4">
            <div>
              <label className="block text-sm font-medium mb-1">Incident Type</label>
              <select
                className="border rounded-lg p-2 w-full disabled:bg-slate-100 bg-white"
                value={incidentType}
                disabled={locked || isView}
                onChange={(e) => setIncidentType(e.target.value)}
              >
                <option value="">Select incident type...</option>
                <option value="injury">Injury</option>
                <option value="near_miss">Near Miss</option>
                <option value="property_damage">Property / Plant Damage</option>
                <option value="environmental">Environmental</option>
                <option value="safety_observation">Safety Observation</option>
                <option value="other">Other</option>
              </select>
            </div>

            <Input
              label="Incident Notes / Action Required"
              value={incidentNotes}
              onChange={setIncidentNotes}
              disabled={locked || isView}
            />
          </div>
        )}
            </CollapsibleSection>


      <CollapsibleSection
        id="plant"
        title="Plant & Vehicles"
        subtitle="Crew-assigned assets and Schedule of Rates plant usage."
        open={openSections.has("plant")}
        onToggle={() => toggleSection("plant")}
        badge={`${plantItemCount} item${plantItemCount === 1 ? "" : "s"}`}
        tone="purple"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="sr-only">Plant & Vehicles Used</h2>
            <p className="text-sm text-slate-500 mt-1">
              Crew-assigned assets are auto-added. Plant time automatically follows the most common personnel shift. If a delay includes selected plant, the same delay duration is attributed to that plant.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <MiniSummary
              label="Plant Hrs"
              value={totalPlantHours.toFixed(2)}
            />

            <button
              type="button"
              disabled={rateType === "schedule_of_rates"}
              onClick={() => {
                if (rateType === "schedule_of_rates") return;
                setShowPlantUsedSection((prev) => !prev);
              }}
              className="border border-purple-200 bg-white text-purple-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-purple-50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {rateType === "schedule_of_rates"
                ? "Required for SOR"
                : plantSectionOpen
                ? "Hide Plant / Vehicles"
                : "Show Plant / Vehicles"}
            </button>
          </div>
        </div>

        {plantItemCount === 0 && !plantSectionOpen && (
          <div className="rounded-xl border border-dashed border-purple-200 bg-purple-50/40 p-4 text-sm text-slate-600">
            No plant or vehicles have been added yet. Expand this section to add them manually, or select a crew with assigned assets.
          </div>
        )}

        {plantSectionOpen && (
          <>

            <div className="rounded-xl border border-purple-200 bg-purple-50/60 px-4 py-3 text-sm text-purple-900">
              <strong>Automatic plant time:</strong>{" "}
              {automaticPlantShift.time_in && automaticPlantShift.time_out
                ? `${automaticPlantShift.time_in}–${automaticPlantShift.time_out} (${toNumber(automaticPlantShift.total_hours).toFixed(2)} hrs) from the most common personnel shift.`
                : automaticPlantShift.total_hours
                ? `${toNumber(automaticPlantShift.total_hours).toFixed(2)} hrs from the most common personnel raw hours.`
                : "Enter personnel times in Labour and plant hours will follow automatically."}
              {hasLabourAndPlantDelay && " Selected plant delays are shown separately and follow the same delay duration entered for personnel."}
            </div>

            <div className="space-y-3">
              {plantRowsWithTotals.map((row, index) => (
                <div
                  key={index}
                  className="border border-purple-100 bg-purple-50/40 rounded-xl p-3 space-y-3"
                >
                  <div className="grid grid-cols-2 md:grid-cols-[1.3fr_1fr_1fr] gap-2 items-end">
                    <LabourInput
                      label="Plant / Vehicle Name"
                      value={row.plant_name}
                      disabled={locked || isView}
                      onChange={(v) => updatePlantRow(index, "plant_name", v)}
                    />
                    <LabourInput
                      label="Type"
                      value={row.plant_type}
                      disabled={locked || isView}
                      onChange={(v) => updatePlantRow(index, "plant_type", v)}
                    />
                    <LabourInput
                      label="Asset ID / Rego"
                      value={row.asset_id}
                      disabled={locked || isView}
                      onChange={(v) => updatePlantRow(index, "asset_id", v)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <PlantAutoMetric label="Time In" value={row.time_in || "—"} />
                    <PlantAutoMetric label="Time Out" value={row.time_out || "—"} />
                    <PlantAutoMetric label="Raw Hrs" value={toNumber(row.total_hours).toFixed(2)} />
                    <PlantAutoMetric
                      label="Delay Hrs"
                      value={toNumber((row as any).auto_delay_hours).toFixed(2)}
                      tone={toNumber((row as any).auto_delay_hours) > 0 ? "amber" : "slate"}
                    />
                  </div>

                  {!locked && !isView && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => removePlantRow(index)}
                        className="border px-3 py-1.5 rounded-lg bg-white text-sm hover:bg-slate-50"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {!locked && !isView && (
              <button
                type="button"
                onClick={addPlantRow}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-purple-700"
              >
                Add Plant / Vehicle
              </button>
            )}
          </>
        )}
      </CollapsibleSection>

      {rateType === "schedule_of_rates" && (
        <CollapsibleSection
        id="lafha"
        title="LAFHA"
        subtitle="Automatically calculated from the workers recorded on this docket."
        open={openSections.has("lafha")}
        onToggle={() => toggleSection("lafha")}
        badge={`${labourWorkerCount} workers`}
        tone="purple"
      >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="sr-only">LAFHA</h2>
              <p className="text-sm text-slate-500 mt-1">
                Automatically calculated from workers on this docket.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MiniSummary label="Workers on Docket" value={String(labourWorkerCount)} />
              <MiniSummary label="LAFHA Required" value={String(labourWorkerCount)} />
            </div>
          </div>
              </CollapsibleSection>
      )}

      <CollapsibleSection
        id="defects"
        title="Defects / Site Issues"
        subtitle="Raise a controlled Defect or link an existing tower Defect to this Daily Docket."
        open={openSections.has("defects")}
        onToggle={() => toggleSection("defects")}
        badge={`${linkedDocketDefects.length + pendingExistingDefectIds.length + docketDefectDrafts.length} linked / pending`}
        tone="amber"
      >
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
          Defects raised here use the same controlled <strong>DEF</strong> register,
          SharePoint photo storage, assignment and project notification rules as the
          tower Defects page. Saving the Daily Docket creates the Defect and links it
          back to this docket for traceability.
        </div>

        {(linkedDocketDefects.length > 0 ||
          pendingExistingDefectIds.length > 0) && (
          <div className="space-y-2">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">
              Defects linked to this docket
            </div>

            {linkedDocketDefects.map((defect) => (
              <div
                key={defect.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-slate-950">
                      {defect.defect_number || "Defect"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                        defect.severity === "Critical"
                          ? "bg-rose-100 text-rose-700"
                          : defect.severity === "Major"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {defect.severity}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">
                      {defect.status}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-black text-blue-700">
                      {defect.link_type === "raised"
                        ? "Raised on docket"
                        : "Referenced"}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-700">
                    {defect.description || "No description"}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {[
                      defect.segment,
                      defect.member_number
                        ? `Member ${defect.member_number}`
                        : "",
                      defect.assigned_to_label
                        ? `Assigned: ${defect.assigned_to_label}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>

                {!locked && !isView && (
                  <button
                    type="button"
                    onClick={() => removeLinkedDocketDefect(defect)}
                    className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100"
                  >
                    Unlink
                  </button>
                )}
              </div>
            ))}

            {pendingExistingDefectIds.map((defectId) => {
              const defect = towerDefectOptions.find(
                (row) => row.id === defectId,
              );
              if (!defect) return null;

              return (
                <div
                  key={`pending-${defectId}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-blue-300 bg-blue-50/40 px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-black text-slate-900">
                      {defect.defect_number || "Existing Defect"}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      Will be linked when this Daily Docket is saved.
                    </div>
                  </div>
                  {!locked && !isView && (
                    <button
                      type="button"
                      onClick={() =>
                        removeQueuedExistingDefect(defectId)
                      }
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!locked && !isView && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-black text-slate-900">
              Link an existing Defect
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Use this when the issue already exists in the tower Defect Register
              but needs to be referenced against this shift.
            </p>

            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <label>
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
                  Existing tower Defect
                </span>
                <select
                  value={defectLinkSelection}
                  onChange={(event) =>
                    setDefectLinkSelection(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="">Select Defect...</option>
                  {towerDefectOptions
                    .filter(
                      (defect) =>
                        !linkedDocketDefects.some(
                          (linked) => linked.id === defect.id,
                        ) &&
                        !pendingExistingDefectIds.includes(defect.id) &&
                        !removedLinkedDefectIds.includes(defect.id),
                    )
                    .map((defect) => (
                      <option key={defect.id} value={defect.id}>
                        {defect.defect_number || "Defect"} · {defect.status} ·{" "}
                        {defect.description || "No description"}
                      </option>
                    ))}
                </select>
              </label>

              <button
                type="button"
                onClick={queueExistingDefectLink}
                disabled={!defectLinkSelection}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-800 hover:bg-slate-100 disabled:opacity-50"
              >
                Link Defect
              </button>
            </div>
          </div>
        )}

        {docketDefectDrafts.map((draft, defectIndex) => (
          <div
            key={draft.ui_id}
            className="rounded-2xl border border-amber-200 bg-amber-50/30 p-4 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-black text-slate-950">
                  New Defect {defectIndex + 1}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  A controlled DEF number is assigned when the Daily Docket is saved.
                </div>
              </div>

              {!locked && !isView && (
                <button
                  type="button"
                  onClick={() =>
                    removeDocketDefectDraft(defectIndex)
                  }
                  className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-700 hover:bg-red-50"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
                  Common Issue
                </span>
                <select
                  value={draft.issue_type_id}
                  disabled={locked || isView}
                  onChange={(event) =>
                    updateDocketDefectDraft(defectIndex, {
                      issue_type_id: event.target.value,
                      other_issue_text:
                        event.target.value === "__other__"
                          ? draft.other_issue_text
                          : "",
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100"
                >
                  <option value="">Select common issue...</option>
                  {defectIssueTypes.map((issue) => (
                    <option key={issue.id} value={issue.id}>
                      {issue.name}
                    </option>
                  ))}
                  <option value="__other__">Other</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
                  Severity
                </span>
                <select
                  value={draft.severity}
                  disabled={locked || isView}
                  onChange={(event) =>
                    updateDocketDefectDraft(defectIndex, {
                      severity: event.target.value as DocketDefectSeverity,
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100"
                >
                  <option value="Minor">Minor</option>
                  <option value="Major">Major</option>
                  <option value="Critical">Critical</option>
                </select>
              </label>

              {draft.issue_type_id === "__other__" && (
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
                    Other issue details
                  </span>
                  <input
                    value={draft.other_issue_text}
                    disabled={locked || isView}
                    onChange={(event) =>
                      updateDocketDefectDraft(defectIndex, {
                        other_issue_text: event.target.value,
                      })
                    }
                    placeholder="Describe the issue type"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100"
                  />
                </label>
              )}

              <TowerMemberFields
                members={defectMembers}
                segment={draft.segment}
                memberNumber={draft.member_number}
                disabled={locked || isView}
                onSegmentChange={(segment) =>
                  updateDocketDefectDraft(defectIndex, {
                    segment,
                    member_number:
                      draft.segment === segment
                        ? draft.member_number
                        : "",
                    drawing_number:
                      draft.segment === segment
                        ? draft.drawing_number
                        : "",
                  })
                }
                onMemberNumberChange={(memberNumber) =>
                  updateDocketDefectDraft(defectIndex, {
                    member_number: memberNumber,
                  })
                }
                onSelectMember={(member) =>
                  updateDocketDefectDraft(defectIndex, {
                    member_number: member.mark_no,
                    segment:
                      member.tower_segment || draft.segment,
                    drawing_number:
                      member.drawing_number || "",
                  })
                }
              />

              <Input
                label="Drawing Number"
                value={draft.drawing_number}
                onChange={(value) =>
                  updateDocketDefectDraft(defectIndex, {
                    drawing_number: value,
                  })
                }
                disabled={locked || isView}
              />

              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
                  Assigned To (optional)
                </span>
                <select
                  value={draft.assigned_to_user_id}
                  disabled={locked || isView}
                  onChange={(event) =>
                    updateDocketDefectDraft(defectIndex, {
                      assigned_to_user_id: event.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100"
                >
                  <option value="">Not assigned</option>
                  {defectAssignees.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                      {user.email ? ` · ${user.email}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="md:col-span-2">
                <TextArea
                  label="Defect Description / Details"
                  value={draft.description}
                  onChange={(value) =>
                    updateDocketDefectDraft(defectIndex, {
                      description: value,
                    })
                  }
                  disabled={locked || isView}
                  rows={4}
                  placeholder="Describe what was found, where it is, and any immediate action taken."
                />
              </div>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
                  Photos (optional)
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
                  multiple
                  disabled={locked || isView}
                  onChange={(event) =>
                    updateDocketDefectDraft(defectIndex, {
                      photos: Array.from(event.target.files ?? []),
                    })
                  }
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-bold disabled:bg-slate-100"
                />
                {draft.photos.length > 0 && (
                  <div className="mt-2 text-xs text-slate-500">
                    {draft.photos.length} photo
                    {draft.photos.length === 1 ? "" : "s"} ready to upload
                    to SharePoint when saved.
                  </div>
                )}
              </label>
            </div>
          </div>
        ))}

        {!locked && !isView && (
          <button
            type="button"
            onClick={addDocketDefectDraft}
            className="w-full rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/50 px-4 py-4 text-sm font-black text-amber-900 hover:bg-amber-50"
          >
            + Raise Defect
          </button>
        )}

        {locked &&
          linkedDocketDefects.length === 0 &&
          docketDefectDrafts.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
              No Defects are linked to this Daily Docket.
            </div>
          )}
      </CollapsibleSection>

      <CollapsibleSection
        id="revision"
        title="Tower Revision / Reallocation"
        subtitle="Attribute revision or rectification worker-hours to another tower."
        open={openSections.has("revision")}
        onToggle={() => toggleSection("revision")}
        badge={`${towerRevisionAllocations.length} allocation${towerRevisionAllocations.length === 1 ? "" : "s"}`}
        tone="amber"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="sr-only">Tower Revision / Reallocation</h2>
            <p className="text-sm text-slate-500 mt-1">
              Allocate specific worker-hours from this docket to revision or rectification work on another tower. These hours remain traceable to this docket but can be attributed to the selected tower for internal production reporting.
            </p>
          </div>
          {!locked && !isView && (
            <button
              type="button"
              onClick={() =>
                setTowerRevisionAllocations((prev) => [
                  ...prev,
                  {
                    ui_id: makeUiId(),
                    target_tower_id: "",
                    hours: "",
                    worker_names: [],
                    reason: "",
                  },
                ])
              }
              className="shrink-0 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
            >
              + Add Revision
            </button>
          )}
        </div>

        {towerRevisionAllocations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
            No tower revision or hour reallocation recorded.
          </div>
        ) : (
          <div className="space-y-3">
            {towerRevisionAllocations.map((allocation, allocationIndex) => (
              <div key={allocation.ui_id} className="rounded-xl border border-amber-100 bg-amber-50/30 p-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto] items-end">
                  <div>
                    <label className="block text-sm font-semibold mb-1">Tower being revised</label>
                    <select
                      className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm disabled:bg-slate-100"
                      value={allocation.target_tower_id}
                      disabled={locked || isView}
                      onChange={(e) =>
                        setTowerRevisionAllocations((prev) =>
                          prev.map((row, i) =>
                            i === allocationIndex ? { ...row, target_tower_id: e.target.value } : row
                          )
                        )
                      }
                    >
                      <option value="">Select tower...</option>
                      {projectTowers
                        .filter((tower) => tower.id !== towerId)
                        .map((tower) => (
                          <option key={tower.id} value={tower.id}>{tower.name}</option>
                        ))}
                    </select>
                  </div>
                  <Input
                    label="Hours per worker"
                    type="number"
                    value={allocation.hours}
                    onChange={(value) =>
                      setTowerRevisionAllocations((prev) =>
                        prev.map((row, i) => i === allocationIndex ? { ...row, hours: value } : row)
                      )
                    }
                    disabled={locked || isView}
                  />
                  {!locked && !isView && (
                    <button
                      type="button"
                      onClick={() =>
                        setTowerRevisionAllocations((prev) => prev.filter((_, i) => i !== allocationIndex))
                      }
                      className="rounded-lg border border-red-200 bg-white px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-800 mb-2">Workers completing the revision</p>
                  <div className="flex flex-wrap gap-2">
                    {labourRowsWithProduction.filter((row) => row.worker_name.trim()).map((row) => {
                      const selected = allocation.worker_names.some(
                        (name) => normalizeWorkerName(name) === normalizeWorkerName(row.worker_name)
                      );
                      return (
                        <button
                          key={row.worker_name}
                          type="button"
                          disabled={locked || isView}
                          onClick={() =>
                            setTowerRevisionAllocations((prev) =>
                              prev.map((item, i) =>
                                i === allocationIndex
                                  ? {
                                      ...item,
                                      worker_names: selected
                                        ? item.worker_names.filter(
                                            (name) => normalizeWorkerName(name) !== normalizeWorkerName(row.worker_name)
                                          )
                                        : [...item.worker_names, row.worker_name],
                                    }
                                  : item
                              )
                            )
                          }
                          className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                            selected
                              ? "border-amber-500 bg-amber-600 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:border-amber-300"
                          } disabled:opacity-60`}
                        >
                          {row.worker_name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Input
                  label="Revision / rectification details"
                  value={allocation.reason}
                  onChange={(value) =>
                    setTowerRevisionAllocations((prev) =>
                      prev.map((row, i) => i === allocationIndex ? { ...row, reason: value } : row)
                    )
                  }
                  disabled={locked || isView}
                />

                <div className="text-xs font-semibold text-amber-800">
                  Internal allocation: {(toNumber(allocation.hours) * allocation.worker_names.length).toFixed(2)} manhours
                </div>
              </div>
            ))}
          </div>
        )}
            </CollapsibleSection>

      <CollapsibleSection
        id="mobilisation"
        title="Mobilising / Demobilising"
        subtitle="Record movement between workfronts and deduct only the workers involved."
        open={openSections.has("mobilisation")}
        onToggle={() => toggleSection("mobilisation")}
        badge={mobilisation.enabled ? `${mobilisationDurationHours.toFixed(2)} hrs · ${mobilisationManhours.toFixed(2)} MH` : "None"}
        tone="blue"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="sr-only">Mobilising / Demobilising</h2>
            <p className="text-sm text-slate-500 mt-1">
              Record the crew move and the time spent on it. This time is deducted from production hours in the same way as a delay, while remaining visible as mobilisation on the docket.
            </p>
          </div>

          <label className="inline-flex items-center gap-2 text-sm font-semibold rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
            <input
              type="checkbox"
              checked={mobilisation.enabled}
              disabled={locked || isView}
              onChange={(e) => {
                const enabled = e.target.checked;
                setMobilisation((prev) => ({ ...prev, enabled }));
                if (!enabled) {
                  setMobilisationHours("");
                  setMobilisationNotes("");
                  setMobilisation((prev) => ({ ...prev, enabled: false, worker_names: [] }));
                }
              }}
            />
            Crew is mobilising / demobilising
          </label>
        </div>

        {mobilisation.enabled ? (
          <div className="space-y-4">
            <div className="grid md:grid-cols-[1fr_1fr_180px] gap-3 items-end">
              <div>
                <label className="block text-sm font-medium mb-1">Moving from</label>
                <select
                  className="border rounded-lg p-2 w-full bg-white disabled:bg-slate-100"
                  value={mobilisation.from_tower_id}
                  disabled={locked || isView}
                  onChange={(e) => setMobilisation((prev) => ({ ...prev, from_tower_id: e.target.value }))}
                >
                  <option value="">Project / laydown / other location</option>
                  {projectTowers.map((tower) => (
                    <option key={tower.id} value={tower.id}>{tower.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Moving to</label>
                <select
                  className="border rounded-lg p-2 w-full bg-white disabled:bg-slate-100"
                  value={mobilisation.to_tower_id}
                  disabled={locked || isView}
                  onChange={(e) => setMobilisation((prev) => ({ ...prev, to_tower_id: e.target.value }))}
                >
                  <option value="">Select destination...</option>
                  {projectTowers.map((tower) => (
                    <option key={tower.id} value={tower.id}>{tower.name}</option>
                  ))}
                </select>
              </div>

              <Input
                label="Time spent (hours)"
                type="number"
                value={mobilisationHours}
                onChange={setMobilisationHours}
                disabled={locked || isView}
              />
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Workers mobilising / demobilising</p>
                  <p className="text-xs text-slate-500">Select only the workers involved. Their mobilisation time will be deducted from their production hours.</p>
                </div>
                <span className="text-xs font-semibold text-blue-700">{mobilisationWorkerCount} worker{mobilisationWorkerCount === 1 ? "" : "s"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {labourRowsWithProduction.filter((row) => row.worker_name.trim()).map((row) => {
                  const selected = mobilisation.worker_names.some(
                    (name) => normalizeWorkerName(name) === normalizeWorkerName(row.worker_name)
                  );
                  return (
                    <button
                      key={row.worker_name}
                      type="button"
                      disabled={locked || isView}
                      onClick={() =>
                        setMobilisation((prev) => ({
                          ...prev,
                          worker_names: selected
                            ? prev.worker_names.filter(
                                (name) => normalizeWorkerName(name) !== normalizeWorkerName(row.worker_name)
                              )
                            : [...prev.worker_names, row.worker_name],
                        }))
                      }
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                        selected
                          ? "border-blue-500 bg-blue-600 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"
                      } disabled:opacity-60`}
                    >
                      {row.worker_name}
                    </button>
                  );
                })}
              </div>
              {mobilisation.worker_names.length === 0 && (
                <p className="mt-2 text-xs text-amber-700">No workers selected — select the workers actually involved in the move.</p>
              )}
            </div>

            <div className="grid md:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Current stage</label>
                <select
                  className="border rounded-lg p-2 w-full bg-white disabled:bg-slate-100"
                  value={mobilisation.status}
                  disabled={locked || isView}
                  onChange={(e) => setMobilisation((prev) => ({ ...prev, status: e.target.value as MobilisationStatus }))}
                >
                  <option value="planning">Planning / preparing</option>
                  <option value="packing">Packing / breaking down</option>
                  <option value="demobilising">Demobilising current tower</option>
                  <option value="in_transit">Moving between towers</option>
                  <option value="mobilising">Mobilising destination tower</option>
                  <option value="setup">Setting up / readying workfront</option>
                  <option value="complete">Complete / ready to work</option>
                </select>
              </div>

              <Input
                label="Progress %"
                type="number"
                value={mobilisation.percent_complete}
                onChange={(v) => setMobilisation((prev) => ({ ...prev, percent_complete: clampPercentString(v) }))}
                disabled={locked || isView}
              />

              <Input
                label="Started"
                type="date"
                value={mobilisation.started_date}
                onChange={(v) => setMobilisation((prev) => ({ ...prev, started_date: v }))}
                disabled={locked || isView}
              />

              <Input
                label="Target move / ready date"
                type="date"
                value={mobilisation.target_move_date}
                onChange={(v) => setMobilisation((prev) => ({ ...prev, target_move_date: v }))}
                disabled={locked || isView}
              />
            </div>

            {mobilisation.status === "complete" && (
              <Input
                label="Completed"
                type="date"
                value={mobilisation.completed_date}
                onChange={(v) => setMobilisation((prev) => ({ ...prev, completed_date: v }))}
                disabled={locked || isView}
              />
            )}

            <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
              <Input
                label="Mobilisation / demobilisation notes"
                value={mobilisation.notes}
                onChange={(v) => {
                  setMobilisation((prev) => ({ ...prev, notes: v }));
                  setMobilisationNotes(v);
                }}
                disabled={locked || isView}
              />

              <div className="grid grid-cols-2 gap-2">
                <MiniSummary label="Crew Duration" value={`${mobilisationDurationHours.toFixed(2)} hrs`} />
                <MiniSummary label="Production Deduction" value={`${mobilisationManhours.toFixed(2)} MH`} />
              </div>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              The entered mobilisation duration is applied only to the workers selected above. For {mobilisationWorkerCount} worker{mobilisationWorkerCount === 1 ? "" : "s"}, {mobilisationDurationHours.toFixed(2)} hours produces a {mobilisationManhours.toFixed(2)} manhour production deduction.
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
            No mobilisation or demobilisation recorded for this docket.
          </div>
        )}
            </CollapsibleSection>

      <CollapsibleSection
        id="delays"
        title="Delays & Materials"
        subtitle="General delays, missing materials, receipts, movements and excess material."
        open={openSections.has("delays")}
        onToggle={() => toggleSection("delays")}
        badge={`${delayRows.length} delays · ${outstandingMissingIssues.length} missing · ${bundleTransfers.length + bundleTransferDrafts.length} transfers`}
        tone="amber"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="sr-only">Delays & Materials</h2>
            <p className="text-sm text-slate-500 mt-1">
              Record what happened on site. TTTracker calculates the affected labour/plant time and keeps the formal commercial wording out of the site form.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <MiniSummary label="General Delay Hrs" value={totalDelayEvents.toFixed(2)} />
            <MiniSummary label="Delay MH" value={totalDelayManhours.toFixed(2)} />
            <MiniSummary
              label="Open Missing"
              value={String(outstandingMissingIssues.length)}
            />
            <MiniSummary label="Plant Delay Hrs" value={totalPlantDelayHours.toFixed(2)} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold text-slate-900">General Site Delays</h3>
              <p className="text-sm text-slate-500">
                Use this for weather, lightning, toolbox, access, plant breakdowns and other non-material delays.
              </p>
            </div>
            {!locked && !isView && (
              <button
                type="button"
                onClick={addDelayRow}
                className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-semibold"
              >
                + Add General Delay
              </button>
            )}
          </div>

          {delayRows.length === 0 ? (
            <div className="text-sm text-slate-500">No general delays recorded.</div>
          ) : (
            <div className="space-y-3">
              {delayRows.map((delay, index) => (
                <div key={delay.ui_id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                  <div className="grid md:grid-cols-[180px_120px_1fr_170px_auto] gap-3 items-end">
                    <div>
                      <label className="block text-sm font-medium mb-1">What happened?</label>
                      <select
                        className="border rounded-lg p-2 w-full bg-white disabled:bg-slate-100"
                        value={delay.delay_type}
                        disabled={locked || isView}
                        onChange={(e) => updateDelayRow(index, "delay_type", e.target.value)}
                      >
                        <option value="weather">Weather</option>
                        <option value="lightning">Lightning</option>
                        <option value="toolbox">Toolbox</option>
                        <option value="mobilisation" disabled>Mobilisation (use section above)</option>
                        <option value="access">Access / Bogged</option>
                        <option value="plant">Plant / Equipment</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <Input
                      label="How long? (hrs)"
                      type="number"
                      value={delay.delay_hours}
                      onChange={(v) => updateDelayRow(index, "delay_hours", v)}
                      disabled={locked || isView}
                    />
                    <Input
                      label="What caused it?"
                      value={delay.delay_reason}
                      onChange={(v) => updateDelayRow(index, "delay_reason", v)}
                      disabled={locked || isView}
                    />
                    <div>
                      <label className="block text-sm font-medium mb-1">Who was affected?</label>
                      <select
                        className="border rounded-lg p-2 w-full bg-white disabled:bg-slate-100"
                        value={delay.applies_to}
                        disabled={locked || isView}
                        onChange={(e) => updateDelayRow(index, "applies_to", e.target.value)}
                      >
                        <option value="entire_crew">Entire crew</option>
                        <option value="selected_workers">Selected workers</option>
                      </select>
                    </div>
                    {!locked && !isView && (
                      <button
                        type="button"
                        onClick={() => removeDelayRow(index)}
                        className="border px-3 py-2 rounded-lg hover:bg-slate-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {delay.applies_to === "selected_workers" && (
                    <div className="flex flex-wrap gap-2">
                      {availableWorkerNames.map((name) => {
                        const checked = delay.worker_names.some(
                          (worker) => normalizeWorkerName(worker) === normalizeWorkerName(name)
                        );
                        return (
                          <button
                            type="button"
                            key={`${delay.ui_id}-${name}`}
                            disabled={locked || isView}
                            onClick={() => toggleDelayWorker(index, name)}
                            className={`rounded-full border px-3 py-2 text-sm ${
                              checked
                                ? "bg-slate-900 text-white border-slate-900"
                                : "bg-white text-slate-700 border-slate-300"
                            }`}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={delay.delay_applies_mode === "labour_and_plant"}
                        disabled={locked || isView}
                        onChange={(e) =>
                          updateDelayRow(
                            index,
                            "delay_applies_mode",
                            e.target.checked ? "labour_and_plant" : "labour_only"
                          )
                        }
                      />
                      Plant was also affected
                    </label>

                    {delayIncludesPlant(delay) &&
                      availablePlantNames.map((name) => {
                        const checked = delay.plant_names.some(
                          (plant) => normalizeWorkerName(plant) === normalizeWorkerName(name)
                        );
                        return (
                          <button
                            type="button"
                            key={`${delay.ui_id}-plant-${name}`}
                            disabled={locked || isView}
                            onClick={() => toggleDelayPlant(index, name)}
                            className={`rounded-full border px-3 py-2 text-sm ${
                              checked
                                ? "bg-purple-700 text-white border-purple-700"
                                : "bg-white text-slate-700 border-slate-300"
                            }`}
                          >
                            {name}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Input
            label="Delay notes (optional)"
            value={delaysComments}
            onChange={setDelaysComments}
            disabled={locked || isView}
          />
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold text-slate-900">Bundles Taken From Other Towers</h3>
              <p className="text-sm text-slate-600">
                Record bundles used at this tower that were taken from another tower. This is the client-facing movement record for the current tower and uses the same physical transfer stored in Materials Control.
              </p>
            </div>

            {!locked && !isView && (
              <button
                type="button"
                onClick={addBundleTransferDraft}
                className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800"
              >
                + Record Bundle Taken
              </button>
            )}
          </div>

          {bundleTransfers.length === 0 && bundleTransferDrafts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-blue-300 bg-white/80 p-4 text-sm text-slate-600">
              No bundles taken from another tower have been detected or entered for this docket date.
            </div>
          ) : (
            <div className="space-y-3">
              {bundleTransfers.map((transfer) => {
                const incoming = transfer.destination_tower_id === towerId;
                const linkedToThisDocket =
                  transfer.source_docket_id === docketId ||
                  transfer.destination_docket_id === docketId;
                const replacementStatus =
                  transferReplacementStatus(transfer);
                const replacementDraft =
                  bundleTransferReplacementDrafts[transfer.id];
                const previewReplacementQty = Math.min(
                  Math.max(
                    toNumber(replacementDraft?.quantity),
                    0
                  ),
                  replacementStatus.remaining_quantity
                );
                const previewRemaining = Math.max(
                  replacementStatus.remaining_quantity -
                    previewReplacementQty,
                  0
                );

                return (
                  <div key={transfer.id} className="rounded-xl border border-blue-200 bg-white p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-slate-950">
                            Bundle {transfer.bundle_no}{transfer.bundle_section ? ` · ${transfer.bundle_section}` : ""}
                          </span>
                          <TransferStatusPill status={transfer.status} />
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${incoming ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
                            {incoming ? "TAKEN FROM ANOTHER TOWER" : "TRANSFER"}
                          </span>
                          {linkedToThisDocket && (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black text-slate-600">
                              LINKED TO DOCKET
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Taken from {projectTowerName(transfer.source_tower_id)} · Qty {transfer.quantity}
                          {transfer.received_at
                            ? ` · Received ${new Date(transfer.received_at).toLocaleString("en-AU")}`
                            : transfer.transferred_at
                            ? ` · Transfer started ${new Date(transfer.transferred_at).toLocaleString("en-AU")}`
                            : ""}
                        </div>
                        {transfer.notes && <div className="mt-1 text-xs text-slate-600">{transfer.notes}</div>}
                      </div>

                      {!locked && !isView && incoming && transfer.status === "in_transit" && (
                        <button
                          type="button"
                          disabled={transferBusyId === transfer.id}
                          onClick={() => void confirmIncomingBundleTransfer(transfer)}
                          className="shrink-0 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-60"
                        >
                          {transferBusyId === transfer.id ? "Confirming…" : "Confirm Taken / Received"}
                        </button>
                      )}
                    </div>

                    {transfer.status === "received" && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="text-xs font-black uppercase tracking-wide text-amber-700">
                              Source Tower Replacement
                            </div>
                            <div className="mt-1 text-sm font-black text-slate-950">
                              {projectTowerName(transfer.source_tower_id)}
                            </div>
                            <div className="mt-1 text-xs text-slate-600">
                              Taking this bundle leaves a replacement requirement at the source tower until replacement material is confirmed delivered.
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <TinyTransferQty
                              label="Taken"
                              value={replacementStatus.original_quantity}
                            />
                            <TinyTransferQty
                              label="Replaced"
                              value={
                                replacementStatus.delivered_quantity +
                                previewReplacementQty
                              }
                              tone="green"
                            />
                            <TinyTransferQty
                              label="Still Missing"
                              value={previewRemaining}
                              tone={
                                previewRemaining > 0 ? "red" : "green"
                              }
                            />
                          </div>
                        </div>

                        {replacementStatus.remaining_quantity > 0 &&
                          !replacementDraft &&
                          !locked &&
                          !isView && (
                            <button
                              type="button"
                              onClick={() =>
                                queueTransferReplacement(transfer)
                              }
                              className="mt-3 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-50"
                            >
                              + Record Replacement Delivered
                            </button>
                          )}

                        {replacementDraft && (
                          <div className="mt-3 grid gap-2 md:grid-cols-[150px_160px_1fr_auto] md:items-end">
                            <Input
                              label="Replacement Qty"
                              type="number"
                              value={replacementDraft.quantity}
                              onChange={(value) =>
                                updateQueuedTransferReplacement(
                                  transfer.id,
                                  { quantity: value }
                                )
                              }
                              disabled={locked || isView}
                            />
                            <Input
                              label="Delivery Time"
                              type="time"
                              value={replacementDraft.occurred_time}
                              onChange={(value) =>
                                updateQueuedTransferReplacement(
                                  transfer.id,
                                  { occurred_time: value }
                                )
                              }
                              disabled={locked || isView}
                            />
                            <div className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                              This records the replacement against <strong>{projectTowerName(transfer.source_tower_id)}</strong>. Once the remaining quantity reaches zero, that tower will no longer show this transfer-created bundle as missing.
                            </div>
                            {!locked && !isView && (
                              <button
                                type="button"
                                onClick={() =>
                                  cancelQueuedTransferReplacement(
                                    transfer.id
                                  )
                                }
                                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        )}

                        {replacementStatus.remaining_quantity <= 0 &&
                          !replacementDraft && (
                            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">
                              Replacement complete — {projectTowerName(
                                transfer.source_tower_id
                              )} will not show this transferred bundle as outstanding.
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}

              {bundleTransferDrafts.map((draft, index) => {
                const sourceBundles = bundlesForTower(draft.source_tower_id);
                const sourceBundle = sourceBundles.find(
                  (bundle) => bundle.source_record_id === draft.source_bundle_id
                );
                const destinationBundle = currentTowerBundleCatalog.find(
                  (bundle) => bundle.source_record_id === draft.destination_bundle_id
                );
                const available = draft.source_bundle_id
                  ? availableBundleTransferQuantity(draft.source_bundle_id)
                  : 0;

                return (
                  <div key={draft.ui_id} className="rounded-xl border border-blue-300 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-black text-blue-950">Bundle Taken From Another Tower</div>
                      <button
                        type="button"
                        onClick={() => removeBundleTransferDraft(index)}
                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-black text-red-700 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-semibold text-slate-800">Taken From Tower</label>
                        <select
                          value={draft.source_tower_id}
                          disabled={locked || isView}
                          onChange={(e) =>
                            updateBundleTransferDraft(index, {
                              source_tower_id: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100"
                        >
                          <option value="">Select source tower…</option>
                          {projectTowers
                            .filter((tower) => tower.id !== towerId)
                            .map((tower) => (
                              <option key={tower.id} value={tower.id}>
                                {tower.name}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-semibold text-slate-800">Bundle Taken</label>
                        <select
                          value={draft.source_bundle_id}
                          disabled={locked || isView || !draft.source_tower_id}
                          onChange={(e) =>
                            updateBundleTransferDraft(index, {
                              source_bundle_id: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100"
                        >
                          <option value="">Select bundle from source tower…</option>
                          {sourceBundles.map((bundle) => (
                            <option key={bundle.source_record_id} value={bundle.source_record_id}>
                              {bundle.bundle_no}
                              {bundle.bundle_section ? ` · ${bundle.bundle_section}` : ""}
                              {` · ${availableBundleTransferQuantity(bundle.source_record_id)} available`}
                            </option>
                          ))}
                        </select>
                        {sourceBundle && (
                          <p className="mt-1 text-xs text-slate-500">
                            Available at {projectTowerName(draft.source_tower_id)} after earlier transfers: <strong>{available}</strong>
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-semibold text-slate-800">Bundle at Current Tower</label>
                        <select
                          value={draft.destination_bundle_id}
                          disabled={locked || isView || !draft.source_bundle_id}
                          onChange={(e) =>
                            updateBundleTransferDraft(index, {
                              destination_bundle_id: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100"
                        >
                          <option value="">Select matching current-tower bundle…</option>
                          {currentTowerBundleCatalog.map((bundle) => (
                            <option key={bundle.source_record_id} value={bundle.source_record_id}>
                              {bundle.bundle_no}{bundle.bundle_section ? ` · ${bundle.bundle_section}` : ""}
                            </option>
                          ))}
                        </select>
                        {draft.destination_bundle_id && sourceBundle && destinationBundle && (
                          <p className="mt-1 text-xs text-emerald-700">
                            Matched to this tower&apos;s {destinationBundle.bundle_no}{destinationBundle.bundle_section ? ` · ${destinationBundle.bundle_section}` : ""} bundle record.
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          label="Quantity Taken"
                          type="number"
                          value={draft.quantity}
                          onChange={(value) => updateBundleTransferDraft(index, { quantity: value })}
                          disabled={locked || isView}
                        />
                        <Input
                          label="Time Taken / Received"
                          type="time"
                          value={draft.occurred_time}
                          onChange={(value) => updateBundleTransferDraft(index, { occurred_time: value })}
                          disabled={locked || isView}
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                      <div className="text-xs font-black uppercase tracking-wide text-amber-700">
                        Replacement for Source Tower
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        The bundle will automatically become outstanding at {draft.source_tower_id ? projectTowerName(draft.source_tower_id) : "the source tower"}. If its replacement has already arrived, record it here and the source tower will not show it as missing later.
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2 md:max-w-md">
                        <Input
                          label="Replacement Delivered Qty"
                          type="number"
                          value={draft.replacement_quantity}
                          onChange={(value) =>
                            updateBundleTransferDraft(index, {
                              replacement_quantity: value,
                            })
                          }
                          disabled={locked || isView}
                        />
                        <Input
                          label="Replacement Delivery Time"
                          type="time"
                          value={draft.replacement_time}
                          onChange={(value) =>
                            updateBundleTransferDraft(index, {
                              replacement_time: value,
                            })
                          }
                          disabled={locked || isView}
                        />
                      </div>
                      <p className="mt-2 text-[11px] text-slate-500">
                        Leave Replacement Delivered Qty blank / 0 if the source tower is still waiting for replacement material.
                      </p>
                    </div>

                    <Input
                      label="Transfer / Usage Notes (optional)"
                      value={draft.notes}
                      onChange={(value) => updateBundleTransferDraft(index, { notes: value })}
                      disabled={locked || isView}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold text-slate-900">Steel / Material Issues & Movements</h3>
              <p className="text-sm text-slate-600">
                Record missing or incorrect steel, material received, and material moved between towers. Excess material is recorded separately below.
              </p>
            </div>

            {!locked && !isView && (
              <button
                type="button"
                onClick={() => addMaterialEvent("missing")}
                className="bg-amber-500 text-slate-950 px-4 py-2 rounded-xl text-sm font-black hover:bg-amber-400"
              >
                + Record Issue / Movement
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-amber-300 bg-amber-100/60">
            <button
              type="button"
              onClick={() => toggleSection("outstanding-missing")}
              aria-expanded={openSections.has("outstanding-missing")}
              className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition hover:bg-amber-100"
            >
              <div className="min-w-0">
                <div className="text-sm font-black text-amber-950">Outstanding Missing Material</div>
                <div className="mt-0.5 hidden text-xs text-amber-800 sm:block">
                  Missing items remain open across dockets until delivered quantities bring the remaining quantity to zero.
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[10px] font-black text-amber-900 md:text-xs">
                  {outstandingMissingIssues.length} open · {outstandingMissingIssues
                    .reduce((sum, issue) => sum + issue.remaining_quantity, 0)
                    .toFixed(0)} qty left
                </span>
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full border border-amber-300 bg-white text-base font-black text-amber-800 transition-transform ${
                    openSections.has("outstanding-missing") ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                >
                  ↓
                </span>
              </div>
            </button>

            {openSections.has("outstanding-missing") && (
              <div className="border-t border-amber-300 p-3">
                {outstandingMissingIssues.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-amber-300 bg-white/80 px-3 py-3 text-sm text-slate-600">
                    No outstanding missing material for this tower.
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {outstandingMissingIssues.map((issue) => {
                      const alreadyAdded = linkedReceiptKeysInDraft.has(issue.issue_key);
                      return (
                        <div
                          key={issue.issue_key}
                          className="rounded-xl border border-amber-200 bg-white p-3"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-black text-slate-900">{issue.item_reference}</span>
                                {issue.bundle_no && (
                                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-800">
                                    Bundle {issue.bundle_no}
                                    {issue.bundle_section ? ` · ${issue.bundle_section}` : ""}
                                  </span>
                                )}
                              </div>
                              {issue.item_description && (
                                <div className="mt-1 text-xs text-slate-500">{issue.item_description}</div>
                              )}
                              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                <span className="rounded-lg bg-slate-100 px-2 py-1">
                                  Missing <strong>{issue.original_quantity}</strong>
                                </span>
                                <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-800">
                                  Delivered <strong>{issue.received_quantity}</strong>
                                </span>
                                <span className="rounded-lg bg-rose-50 px-2 py-1 text-rose-800">
                                  Remaining <strong>{issue.remaining_quantity}</strong>
                                </span>
                              </div>
                            </div>

                            {!locked && !isView && (
                              <button
                                type="button"
                                disabled={alreadyAdded}
                                onClick={() => recordMissingDelivery(issue)}
                                className="shrink-0 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {alreadyAdded ? "Added to this docket" : "Record Delivery"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {materialEvents.filter((event) => event.event_type !== "excess").length === 0 ? (
            <div className="rounded-xl border border-dashed border-amber-300 bg-white/70 p-4 text-sm text-slate-600">
              No steel/material issues or movements recorded for this docket.
            </div>
          ) : (
            <div className="space-y-4">
              {materialEvents
                .map((event, eventIndex) => ({ event, eventIndex }))
                .filter(({ event }) => event.event_type !== "excess")
                .map(({ event, eventIndex }) => {
                return (
                  <div
                    key={event.ui_id}
                    className="rounded-2xl border border-amber-200 bg-white p-4 md:p-5 space-y-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="grid md:grid-cols-[minmax(240px,420px)_1fr] gap-3 items-end">
                          <div>
                            <label className="block text-sm font-semibold text-slate-900 mb-1">
                              What happened?
                            </label>
                            <select
                              className="border rounded-xl p-2.5 w-full bg-white disabled:bg-slate-100"
                              value={event.event_type}
                              disabled={
                                locked ||
                                isView ||
                                event.items.some((item) => Boolean(item.source_issue_key))
                              }
                              onChange={(e) =>
                                updateMaterialEvent(
                                  eventIndex,
                                  "event_type",
                                  e.target.value as MaterialEventType
                                )
                              }
                            >
                              <option value="missing">Missing material</option>
                              <option value="found_received">Found / Received / Delivered</option>
                              <option value="taken_from_another_tower">Taken from another tower</option>
                              <option value="sent_to_another_tower">Sent to another tower</option>
                              <option value="damaged_incorrect">Damaged / Incorrect</option>
                            </select>
                          </div>

                          <div className="pb-2 text-sm font-semibold text-amber-800">
                            {materialEventLabel(event.event_type)}
                          </div>
                        </div>
                      </div>

                      {!locked && !isView && (
                        <button
                          type="button"
                          onClick={() => removeMaterialEvent(eventIndex)}
                          className="border border-red-200 text-red-700 px-3 py-2 rounded-xl hover:bg-red-50 text-sm font-semibold"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {(event.event_type === "taken_from_another_tower" ||
                      event.event_type === "sent_to_another_tower") && (
                      <div className="grid md:grid-cols-2 gap-3">
                        {event.event_type === "taken_from_another_tower" && (
                          <div>
                            <label className="block text-sm font-semibold mb-1">Taken from tower</label>
                            <select
                              className="border rounded-xl p-2.5 w-full bg-white disabled:bg-slate-100"
                              value={event.source_tower_id}
                              disabled={locked || isView}
                              onChange={(e) =>
                                updateMaterialEvent(eventIndex, "source_tower_id", e.target.value)
                              }
                            >
                              <option value="">Select tower...</option>
                              {projectTowers
                                .filter((tower) => tower.id !== towerId)
                                .map((tower) => (
                                  <option key={tower.id} value={tower.id}>{tower.name}</option>
                                ))}
                            </select>
                          </div>
                        )}

                        {event.event_type === "sent_to_another_tower" && (
                          <div>
                            <label className="block text-sm font-semibold mb-1">Sent to tower</label>
                            <select
                              className="border rounded-xl p-2.5 w-full bg-white disabled:bg-slate-100"
                              value={event.destination_tower_id}
                              disabled={locked || isView}
                              onChange={(e) =>
                                updateMaterialEvent(eventIndex, "destination_tower_id", e.target.value)
                              }
                            >
                              <option value="">Select tower...</option>
                              {projectTowers
                                .filter((tower) => tower.id !== towerId)
                                .map((tower) => (
                                  <option key={tower.id} value={tower.id}>{tower.name}</option>
                                ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="border-t border-slate-200 pt-4 space-y-4">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">What material?</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Search the live steel/member register, or enter a bolt manually when no bolt list is available.
                        </div>
                      </div>

                      {event.items.map((item, itemIndex) => {
                        return (
                          <div
                            key={item.ui_id}
                            className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 md:p-4 space-y-3"
                          >
                            <div className="grid lg:grid-cols-[minmax(320px,1.4fr)_minmax(220px,1fr)_100px_100px_auto] gap-3 items-end">
                              <div className="relative">
                                <label className="block text-sm font-semibold mb-1">
                                  {item.source_issue_key
                                    ? "Missing item being delivered"
                                    : item.search_mode === "member"
                                    ? "Search Member Register"
                                    : "Search Bundle Register"}
                                </label>

                                {!item.source_issue_key &&
                                  item.material_kind === "registered" && (
                                    <div className="mb-2 inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
                                      <button
                                        type="button"
                                        disabled={locked || isView}
                                        onClick={() =>
                                          setMaterialSearchMode(
                                            eventIndex,
                                            itemIndex,
                                            "member"
                                          )
                                        }
                                        className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                                          item.search_mode === "member"
                                            ? "bg-white text-slate-950 shadow-sm"
                                            : "text-slate-500 hover:text-slate-800"
                                        } disabled:opacity-60`}
                                      >
                                        Members
                                      </button>
                                      <button
                                        type="button"
                                        disabled={locked || isView}
                                        onClick={() =>
                                          setMaterialSearchMode(
                                            eventIndex,
                                            itemIndex,
                                            "bundle"
                                          )
                                        }
                                        className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                                          item.search_mode === "bundle"
                                            ? "bg-white text-slate-950 shadow-sm"
                                            : "text-slate-500 hover:text-slate-800"
                                        } disabled:opacity-60`}
                                      >
                                        Bundles
                                      </button>
                                    </div>
                                  )}

                                {item.source_issue_key ? (
                                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                                    <div className="text-sm font-black text-emerald-950">
                                      {item.item_reference || "Missing material"}
                                    </div>
                                    <div className="mt-0.5 text-xs text-emerald-800">
                                      {item.bundle_no
                                        ? `Bundle ${item.bundle_no}${item.bundle_section ? ` · ${item.bundle_section}` : ""}`
                                        : "Linked to original missing-material record"}
                                    </div>
                                  </div>
                                ) : (
                                  <input
                                    className="border rounded-xl p-2.5 w-full bg-white disabled:bg-slate-100"
                                    value={item.search_query}
                                    disabled={locked || isView}
                                    placeholder={
                                      item.search_mode === "member"
                                        ? "Member no, drawing, profile, bundle ref..."
                                        : "Bundle no or bundle section..."
                                    }
                                    onChange={(e) =>
                                      void searchProjectMaterial(
                                        eventIndex,
                                        itemIndex,
                                        e.target.value
                                      )
                                    }
                                  />
                                )}

                                {!item.source_issue_key &&
                                  !locked &&
                                  !isView &&
                                  item.search_query.trim().length > 0 &&
                                  !item.source_record_id &&
                                  item.material_kind !== "manual" && (
                                    <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                                      {item.search_loading && (
                                        <div className="p-3 text-sm text-slate-500">
                                          Searching project material...
                                        </div>
                                      )}

                                      {!item.search_loading &&
                                        item.search_results.slice(0, 20).map((catalogItem) => (
                                          <button
                                            type="button"
                                            key={`${catalogItem.source_table}:${catalogItem.source_record_id}`}
                                            onClick={() =>
                                              chooseCatalogItem(
                                                eventIndex,
                                                itemIndex,
                                                `${catalogItem.source_table}:${catalogItem.source_record_id}`
                                              )
                                            }
                                            className="block w-full border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-blue-50"
                                          >
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <div className="text-sm font-semibold text-slate-900">
                                                {catalogItem.item_reference}
                                              </div>
                                              {catalogItem.bundle_no && (
                                                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                                                  Bundle {catalogItem.bundle_no}
                                                  {catalogItem.bundle_section ? ` · ${catalogItem.bundle_section}` : ""}
                                                </span>
                                              )}
                                            </div>
                                            {catalogItem.item_description && (
                                              <div className="text-xs text-slate-500 mt-0.5">
                                                {catalogItem.item_description}
                                              </div>
                                            )}
                                          </button>
                                        ))}

                                      {!item.search_loading &&
                                        item.search_results.length === 0 && (
                                          <div className="p-3 text-sm text-slate-500">
                                            {item.item_description.startsWith("Search error:")
                                              ? item.item_description
                                              : item.search_mode === "member" ? "No registered members matched this search." : "No registered bundles matched this search."}
                                          </div>
                                        )}
                                    </div>
                                  )}
                              </div>

                              {item.material_kind === "manual_bolt" ? (
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    label="Bolt Size"
                                    value={item.bolt_size}
                                    onChange={(v) =>
                                      updateMaterialItem(eventIndex, itemIndex, {
                                        bolt_size: v,
                                      })
                                    }
                                    disabled={locked || isView}
                                  />
                                  <Input
                                    label="Description / Notes"
                                    value={item.item_description}
                                    onChange={(v) =>
                                      updateMaterialItem(eventIndex, itemIndex, {
                                        item_description: v,
                                      })
                                    }
                                    disabled={locked || isView}
                                  />
                                </div>
                              ) : item.material_kind === "manual" ? (
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    label="Item type"
                                    value={item.manual_category}
                                    onChange={(v) =>
                                      updateMaterialItem(eventIndex, itemIndex, { manual_category: v })
                                    }
                                    disabled={locked || isView}
                                  />
                                  <Input
                                    label="Item"
                                    value={item.item_reference}
                                    onChange={(v) =>
                                      updateMaterialItem(eventIndex, itemIndex, { item_reference: v })
                                    }
                                    disabled={locked || isView}
                                  />
                                </div>
                              ) : (
                                <Input
                                  label="Selected item"
                                  value={item.item_reference}
                                  onChange={(v) =>
                                    updateMaterialItem(eventIndex, itemIndex, {
                                      item_reference: v,
                                    })
                                  }
                                  disabled={locked || isView || Boolean(item.source_record_id)}
                                />
                              )}

                              <Input
                                label={item.source_issue_key ? "Delivered Qty" : "Qty"}
                                type="number"
                                value={item.quantity}
                                onChange={(v) =>
                                  updateMaterialItem(eventIndex, itemIndex, { quantity: v })
                                }
                                disabled={locked || isView}
                              />

                              <Input
                                label="Unit"
                                value={item.unit}
                                onChange={(v) =>
                                  updateMaterialItem(eventIndex, itemIndex, { unit: v })
                                }
                                disabled={locked || isView || item.material_kind === "manual_bolt"}
                              />

                              {!locked && !isView && (
                                <button
                                  type="button"
                                  onClick={() => removeMaterialItem(eventIndex, itemIndex)}
                                  className="border px-3 py-2.5 rounded-xl bg-white text-sm hover:bg-slate-50"
                                >
                                  Remove
                                </button>
                              )}
                            </div>

                            {item.bundle_no && !item.source_issue_key && (
                              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">
                                Bundle {item.bundle_no}
                                {item.bundle_section ? ` · ${item.bundle_section}` : ""}
                              </div>
                            )}

                            {item.source_issue_key && (() => {
                              const sourceIssue = missingIssueByKey.get(item.source_issue_key);
                              if (!sourceIssue) return null;
                              const receiptQty = Math.max(toNumber(item.quantity), 0);
                              const remainingAfter = Math.max(
                                sourceIssue.remaining_quantity - receiptQty,
                                0
                              );
                              return (
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                                  <strong>Delivery Qty:</strong> {receiptQty} {item.unit || "ea"} ·{" "}
                                  <strong>Remaining after this docket:</strong> {remainingAfter} {item.unit || "ea"}
                                  {remainingAfter === 0 ? " · Resolved" : " · Partially received"}
                                </div>
                              );
                            })()}

                            {!locked && !isView && !item.source_issue_key && (
                              <div className="flex items-center gap-3 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => setManualBoltItem(eventIndex, itemIndex)}
                                  className="text-xs font-semibold text-blue-700"
                                >
                                  + Enter bolt manually
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setManualUnlistedItem(eventIndex, itemIndex)}
                                  className="text-xs font-semibold text-blue-700"
                                >
                                  + Add another unlisted item
                                </button>

                                <button
                                  type="button"
                                  onClick={() => addMaterialItem(eventIndex)}
                                  className="text-xs font-semibold text-blue-700"
                                >
                                  + Add another item
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="border-t border-slate-200 pt-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                        <div>
                          <label className="block text-sm font-semibold mb-2">Did this affect the work?</label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={locked || isView}
                              onClick={() => updateMaterialEvent(eventIndex, "affected_work", false)}
                              className={`px-4 py-2 rounded-xl border font-semibold ${
                                !event.affected_work
                                  ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                                  : "bg-white border-slate-300"
                              }`}
                            >
                              No
                            </button>
                            <button
                              type="button"
                              disabled={locked || isView}
                              onClick={() => updateMaterialEvent(eventIndex, "affected_work", true)}
                              className={`px-4 py-2 rounded-xl border font-semibold ${
                                event.affected_work
                                  ? "bg-red-50 border-red-300 text-red-800"
                                  : "bg-white border-slate-300"
                              }`}
                            >
                              Yes
                            </button>
                          </div>
                        </div>

                        {event.affected_work && (
                          <>
                            <div className="grid md:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-semibold mb-1">What were you trying to do?</label>
                                <select
                                  className="border rounded-xl p-2.5 w-full bg-white disabled:bg-slate-100"
                                  value={event.affected_activity}
                                  disabled={locked || isView}
                                  onChange={(e) =>
                                    updateMaterialEvent(eventIndex, "affected_activity", e.target.value)
                                  }
                                >
                                  <option value="">Select...</option>
                                  <option value="Assembly">Assembly</option>
                                  <option value="Erection">Erection</option>
                                  <option value="Bolting">Bolting</option>
                                  <option value="Fit-off">Fit-off</option>
                                  <option value="Other">Other</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-sm font-semibold mb-1">What section was affected?</label>
                                <select
                                  className="border rounded-xl p-2.5 w-full bg-white disabled:bg-slate-100"
                                  value={event.affected_section}
                                  disabled={locked || isView}
                                  onChange={(e) =>
                                    updateMaterialEvent(eventIndex, "affected_section", e.target.value)
                                  }
                                >
                                  <option value="">Select section...</option>
                                  {visibleProgressRows.map((row) => (
                                    <option key={row.section_label} value={row.section_label}>
                                      {row.section_label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-semibold mb-1">What happened to the planned work?</label>
                                <select
                                  className="border rounded-xl p-2.5 w-full bg-white disabled:bg-slate-100"
                                  value={event.work_outcome}
                                  disabled={locked || isView}
                                  onChange={(e) =>
                                    updateMaterialEvent(
                                      eventIndex,
                                      "work_outcome",
                                      e.target.value as MaterialWorkOutcome
                                    )
                                  }
                                >
                                  <option value="">Select...</option>
                                  <option value="stopped_work">Couldn’t continue</option>
                                  <option value="slowed_down">Could continue but slower</option>
                                  <option value="changed_sequence">Moved onto another section / task</option>
                                  <option value="minor_impact">No meaningful effect</option>
                                </select>
                              </div>

                              {event.work_outcome === "changed_sequence" ? (
                                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 self-end">
                                  No delay start/finish is required because the crew resequenced the works.
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    label="Impact started"
                                    type="time"
                                    value={event.impact_start_time}
                                    onChange={(v) =>
                                      updateMaterialEvent(eventIndex, "impact_start_time", v)
                                    }
                                    disabled={locked || isView}
                                  />
                                  <Input
                                    label="Impact finished"
                                    type="time"
                                    value={event.impact_finish_time}
                                    onChange={(v) =>
                                      updateMaterialEvent(eventIndex, "impact_finish_time", v)
                                    }
                                    disabled={locked || isView || event.impact_ongoing}
                                  />
                                </div>
                              )}
                            </div>

                            {event.work_outcome !== "changed_sequence" && (
                              <label className="inline-flex items-center gap-2 text-sm font-medium">
                                <input
                                  type="checkbox"
                                  checked={event.impact_ongoing}
                                  disabled={locked || isView}
                                  onChange={(e) =>
                                    updateMaterialEvent(eventIndex, "impact_ongoing", e.target.checked)
                                  }
                                />
                                Still affecting the tower / work is ongoing
                              </label>
                            )}

                            <div className="space-y-2">
                              <div className="text-sm font-semibold">Who spent time searching / checking?</div>
                              <div className="flex flex-wrap gap-2">
                                {availableWorkerNames.map((name) => {
                                  const selected = event.people.some(
                                    (person) => normalizeWorkerName(person.employee_name) === normalizeWorkerName(name)
                                  );
                                  return (
                                    <button
                                      key={`${event.ui_id}-person-${name}`}
                                      type="button"
                                      disabled={locked || isView || selected}
                                      onClick={() => addMaterialPerson(eventIndex, name)}
                                      className={`rounded-full border px-3 py-2 text-sm ${
                                        selected
                                          ? "bg-blue-600 text-white border-blue-600"
                                          : "bg-white border-slate-300"
                                      }`}
                                    >
                                      {selected ? "✓ " : "+ "}{name}
                                    </button>
                                  );
                                })}
                              </div>

                              {event.people.map((person, personIndex) => (
                                <div
                                  key={person.ui_id}
                                  className="grid md:grid-cols-[1fr_140px_140px_auto] gap-2 items-end"
                                >
                                  <div className="text-sm font-medium py-2">{person.employee_name}</div>
                                  <Input
                                    label="Started"
                                    type="time"
                                    value={person.started_at}
                                    onChange={(v) =>
                                      updateMaterialPerson(eventIndex, personIndex, { started_at: v })
                                    }
                                    disabled={locked || isView}
                                  />
                                  <Input
                                    label="Finished"
                                    type="time"
                                    value={person.finished_at}
                                    onChange={(v) =>
                                      updateMaterialPerson(eventIndex, personIndex, { finished_at: v })
                                    }
                                    disabled={locked || isView}
                                  />
                                  {!locked && !isView && (
                                    <button
                                      type="button"
                                      onClick={() => removeMaterialPerson(eventIndex, personIndex)}
                                      className="border px-3 py-2 rounded-lg"
                                    >
                                      Remove
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>

                            <div className="space-y-2">
                              <div className="text-sm font-semibold">Was any plant tied up?</div>
                              <div className="flex flex-wrap gap-2">
                                {availablePlantNames.map((name) => {
                                  const selected = event.plant.some(
                                    (row) => normalizeWorkerName(row.plant_name) === normalizeWorkerName(name)
                                  );
                                  return (
                                    <button
                                      key={`${event.ui_id}-event-plant-${name}`}
                                      type="button"
                                      disabled={locked || isView || selected}
                                      onClick={() => addMaterialPlant(eventIndex, name)}
                                      className={`rounded-full border px-3 py-2 text-sm ${
                                        selected
                                          ? "bg-purple-700 text-white border-purple-700"
                                          : "bg-white border-slate-300"
                                      }`}
                                    >
                                      {selected ? "✓ " : "+ "}{name}
                                    </button>
                                  );
                                })}
                              </div>

                              {event.plant.map((row, plantIndex) => (
                                <div
                                  key={row.ui_id}
                                  className="grid md:grid-cols-[1fr_140px_140px_auto] gap-2 items-end"
                                >
                                  <div className="text-sm font-medium py-2">{row.plant_name}</div>
                                  <Input
                                    label="Started"
                                    type="time"
                                    value={row.started_at}
                                    onChange={(v) =>
                                      updateMaterialPlant(eventIndex, plantIndex, { started_at: v })
                                    }
                                    disabled={locked || isView}
                                  />
                                  <Input
                                    label="Finished"
                                    type="time"
                                    value={row.finished_at}
                                    onChange={(v) =>
                                      updateMaterialPlant(eventIndex, plantIndex, { finished_at: v })
                                    }
                                    disabled={locked || isView}
                                  />
                                  {!locked && !isView && (
                                    <button
                                      type="button"
                                      onClick={() => removeMaterialPlant(eventIndex, plantIndex)}
                                      className="border px-3 py-2 rounded-lg"
                                    >
                                      Remove
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>

                            <div>
                              <div className="text-sm font-semibold mb-2">What did you do instead / to reduce the impact?</div>
                              <div className="flex flex-wrap gap-2">
                                {[
                                  "Moved personnel to another activity",
                                  "Assembled another section",
                                  "Checked other bundles",
                                  "Resequenced planned work",
                                  "Assisted client to locate / verify material",
                                ].map((action) => {
                                  const checked = event.mitigation_actions.includes(action);
                                  return (
                                    <button
                                      type="button"
                                      key={`${event.ui_id}-${action}`}
                                      disabled={locked || isView}
                                      onClick={() => toggleMitigation(eventIndex, action)}
                                      className={`rounded-full border px-3 py-2 text-sm ${
                                        checked
                                          ? "bg-emerald-700 text-white border-emerald-700"
                                          : "bg-white border-slate-300"
                                      }`}
                                    >
                                      {checked ? "✓ " : ""}{action}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div>
                              <label className="block text-sm font-semibold mb-1">What is happening now?</label>
                              <select
                                className="border rounded-xl p-2.5 w-full bg-white disabled:bg-slate-100"
                                value={event.current_effect}
                                disabled={locked || isView}
                                onChange={(e) =>
                                  updateMaterialEvent(eventIndex, "current_effect", e.target.value)
                                }
                              >
                                <option value="">Select...</option>
                                <option value="Waiting for material">Waiting for material</option>
                                <option value="Erection stopped">Erection stopped</option>
                                <option value="Working on another section">Working on another section</option>
                                <option value="Resolved">Resolved</option>
                                <option value="Unknown / awaiting confirmation">Unknown / awaiting confirmation</option>
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-4">
                      <Input
                        label="Extra notes"
                        value={event.notes}
                        onChange={(v) => updateMaterialEvent(eventIndex, "notes", v)}
                        disabled={locked || isView}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold text-slate-900">Excess Steel / Materials</h3>
              <p className="text-sm text-slate-600">
                Record material left over at this tower separately from delays or missing-steel issues.
              </p>
            </div>

            {!locked && !isView && (
              <button
                type="button"
                onClick={() => addMaterialEvent("excess")}
                className="bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-800"
              >
                + Add Excess Material
              </button>
            )}
          </div>

          {materialEvents.filter((event) => event.event_type === "excess").length === 0 ? (
            <div className="rounded-xl border border-dashed border-emerald-300 bg-white/70 p-4 text-sm text-slate-600">
              No excess material recorded.
            </div>
          ) : (
            <div className="space-y-4">
              {materialEvents
                .map((event, eventIndex) => ({ event, eventIndex }))
                .filter(({ event }) => event.event_type === "excess")
                .map(({ event, eventIndex }) => (
                  <div
                    key={event.ui_id}
                    className="rounded-2xl border border-emerald-200 bg-white p-4 md:p-5 space-y-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-emerald-900">
                          Excess material record
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Search a registered steel/member item, or enter a bolt manually.
                        </div>
                      </div>

                      {!locked && !isView && (
                        <button
                          type="button"
                          onClick={() => removeMaterialEvent(eventIndex)}
                          className="border border-red-200 text-red-700 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-red-50"
                        >
                          Remove Record
                        </button>
                      )}
                    </div>

                    <div className="border-t border-slate-200 pt-4 space-y-4">
                      {event.items.map((item, itemIndex) => (
                        <div
                          key={item.ui_id}
                          className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 md:p-4 space-y-3"
                        >
                          <div className="grid lg:grid-cols-[minmax(320px,1.4fr)_minmax(220px,1fr)_100px_100px_auto] gap-3 items-end">
                            <div className="relative">
                              <label className="block text-sm font-semibold mb-1">
                                {item.search_mode === "member"
                                  ? "Search Member Register"
                                  : "Search Bundle Register"}
                              </label>

                              {item.material_kind === "registered" && (
                                <div className="mb-2 inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
                                  <button
                                    type="button"
                                    disabled={locked || isView}
                                    onClick={() =>
                                      setMaterialSearchMode(
                                        eventIndex,
                                        itemIndex,
                                        "member"
                                      )
                                    }
                                    className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                                      item.search_mode === "member"
                                        ? "bg-white text-slate-950 shadow-sm"
                                        : "text-slate-500 hover:text-slate-800"
                                    } disabled:opacity-60`}
                                  >
                                    Members
                                  </button>
                                  <button
                                    type="button"
                                    disabled={locked || isView}
                                    onClick={() =>
                                      setMaterialSearchMode(
                                        eventIndex,
                                        itemIndex,
                                        "bundle"
                                      )
                                    }
                                    className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                                      item.search_mode === "bundle"
                                        ? "bg-white text-slate-950 shadow-sm"
                                        : "text-slate-500 hover:text-slate-800"
                                    } disabled:opacity-60`}
                                  >
                                    Bundles
                                  </button>
                                </div>
                              )}

                              <input
                                className="border rounded-xl p-2.5 w-full bg-white disabled:bg-slate-100"
                                value={item.search_query}
                                disabled={locked || isView}
                                placeholder={
                                  item.search_mode === "member"
                                    ? "Member no, drawing, profile, bundle ref..."
                                    : "Bundle no or bundle section..."
                                }
                                onChange={(e) =>
                                  void searchProjectMaterial(
                                    eventIndex,
                                    itemIndex,
                                    e.target.value
                                  )
                                }
                              />

                              {!locked &&
                                !isView &&
                                item.search_query.trim().length > 0 &&
                                item.material_kind !== "manual" && (
                                  <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                                    {item.search_loading && (
                                      <div className="p-3 text-sm text-slate-500">
                                        Searching project material...
                                      </div>
                                    )}

                                    {!item.search_loading &&
                                      item.search_results.slice(0, 20).map((catalogItem) => (
                                        <button
                                          type="button"
                                          key={`${catalogItem.source_table}:${catalogItem.source_record_id}`}
                                          onClick={() =>
                                            chooseCatalogItem(
                                              eventIndex,
                                              itemIndex,
                                              `${catalogItem.source_table}:${catalogItem.source_record_id}`
                                            )
                                          }
                                          className="block w-full border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-emerald-50"
                                        >
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <div className="text-sm font-semibold text-slate-900">
                                              {catalogItem.item_reference}
                                            </div>
                                            {catalogItem.bundle_no && (
                                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                                Bundle {catalogItem.bundle_no}
                                                {catalogItem.bundle_section ? ` · ${catalogItem.bundle_section}` : ""}
                                              </span>
                                            )}
                                          </div>
                                          {catalogItem.item_description && (
                                            <div className="text-xs text-slate-500 mt-0.5">
                                              {catalogItem.item_description}
                                            </div>
                                          )}
                                        </button>
                                      ))}

                                    {!item.search_loading &&
                                      item.search_results.length === 0 && (
                                        <div className="p-3 text-sm text-slate-500">
                                          {item.item_description.startsWith("Search error:")
                                            ? item.item_description
                                            : item.search_mode === "member" ? "No registered members matched this search." : "No registered bundles matched this search."}
                                        </div>
                                      )}
                                  </div>
                                )}
                            </div>

                            {item.material_kind === "manual_bolt" ? (
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  label="Bolt Size"
                                  value={item.bolt_size}
                                  onChange={(v) =>
                                    updateMaterialItem(eventIndex, itemIndex, {
                                      bolt_size: v,
                                    })
                                  }
                                  disabled={locked || isView}
                                />
                                <Input
                                  label="Description / Notes"
                                  value={item.item_description}
                                  onChange={(v) =>
                                    updateMaterialItem(eventIndex, itemIndex, {
                                      item_description: v,
                                    })
                                  }
                                  disabled={locked || isView}
                                />
                              </div>
                            ) : item.material_kind === "manual" ? (
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  label="Item type"
                                  value={item.manual_category}
                                  onChange={(v) =>
                                    updateMaterialItem(eventIndex, itemIndex, {
                                      manual_category: v,
                                    })
                                  }
                                  disabled={locked || isView}
                                />
                                <Input
                                  label="Item"
                                  value={item.item_reference}
                                  onChange={(v) =>
                                    updateMaterialItem(eventIndex, itemIndex, {
                                      item_reference: v,
                                    })
                                  }
                                  disabled={locked || isView}
                                />
                              </div>
                            ) : (
                              <Input
                                label="Selected item"
                                value={item.item_reference}
                                onChange={(v) =>
                                  updateMaterialItem(eventIndex, itemIndex, {
                                    item_reference: v,
                                  })
                                }
                                disabled={locked || isView || Boolean(item.source_record_id)}
                              />
                            )}

                            <Input
                              label="Qty"
                              type="number"
                              value={item.quantity}
                              onChange={(v) =>
                                updateMaterialItem(eventIndex, itemIndex, { quantity: v })
                              }
                              disabled={locked || isView}
                            />

                            <Input
                              label="Unit"
                              value={item.unit}
                              onChange={(v) =>
                                updateMaterialItem(eventIndex, itemIndex, { unit: v })
                              }
                              disabled={locked || isView}
                            />

                            {!locked && !isView && (
                              <button
                                type="button"
                                onClick={() => removeMaterialItem(eventIndex, itemIndex)}
                                className="border px-3 py-2.5 rounded-xl bg-white text-sm hover:bg-slate-50"
                              >
                                Remove
                              </button>
                            )}
                          </div>

                          {item.bundle_no && (
                            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                              Bundle {item.bundle_no}
                              {item.bundle_section ? ` · ${item.bundle_section}` : ""}
                            </div>
                          )}

                          {!locked && !isView && (
                            <div className="flex items-center gap-3 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setManualBoltItem(eventIndex, itemIndex)}
                                className="text-xs font-semibold text-emerald-800"
                              >
                                + Enter bolt manually
                              </button>

                              <button
                                type="button"
                                onClick={() => setManualUnlistedItem(eventIndex, itemIndex)}
                                className="text-xs font-semibold text-emerald-800"
                              >
                                + Add another unlisted item
                              </button>

                              <button
                                type="button"
                                onClick={() => addMaterialItem(eventIndex)}
                                className="text-xs font-semibold text-emerald-800"
                              >
                                + Add another excess item
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-slate-200 pt-4">
                      <div className="grid md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-semibold mb-1">
                            Where is the excess now?
                          </label>
                          <select
                            className="border rounded-xl p-2.5 w-full bg-white disabled:bg-slate-100"
                            value={event.destination_location}
                            disabled={locked || isView}
                            onChange={(e) =>
                              updateMaterialEvent(
                                eventIndex,
                                "destination_location",
                                e.target.value
                              )
                            }
                          >
                            <option value="">At current tower</option>
                            <option value="laydown">Returned / returning to laydown</option>
                            <option value="other_tower">Sent / sending to another tower</option>
                            <option value="other">Other location</option>
                          </select>
                        </div>

                        {event.destination_location === "other_tower" && (
                          <div>
                            <label className="block text-sm font-semibold mb-1">
                              Destination tower
                            </label>
                            <select
                              className="border rounded-xl p-2.5 w-full bg-white disabled:bg-slate-100"
                              value={event.destination_tower_id}
                              disabled={locked || isView}
                              onChange={(e) =>
                                updateMaterialEvent(
                                  eventIndex,
                                  "destination_tower_id",
                                  e.target.value
                                )
                              }
                            >
                              <option value="">Select tower...</option>
                              {projectTowers
                                .filter((tower) => tower.id !== towerId)
                                .map((tower) => (
                                  <option key={tower.id} value={tower.id}>
                                    {tower.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-4">
                      <Input
                        label="Notes (optional)"
                        value={event.notes}
                        onChange={(v) =>
                          updateMaterialEvent(eventIndex, "notes", v)
                        }
                        disabled={locked || isView}
                      />
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

            </CollapsibleSection>

      <CollapsibleSection
        id="summary"
        title="Daily Site Summary"
        subtitle="Short shift summary and RFI references for the formal docket record."
        open={openSections.has("summary")}
        onToggle={() => toggleSection("summary")}
        badge={dailySiteSummary.trim() ? "Completed" : "Not entered"}
        tone="slate"
      >
        <div>
          <h2 className="sr-only">Daily Site Summary</h2>
          <p className="text-sm text-slate-500 mt-1">
            Summarise the work completed, site conditions, key coordination points and anything the next shift should know. Keep delay details in the delay section above.
          </p>
        </div>

        <TextArea
          label="Daily Site Summary"
          value={dailySiteSummary}
          onChange={setDailySiteSummary}
          disabled={locked || isView}
          rows={5}
          placeholder="Example: Completed lower body assembly, commenced crossarm pre-assembly, coordinated access with client..."
        />

        <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
          <Input
            label="RFI References"
            value={rfiReferencesText}
            onChange={setRfiReferencesText}
            disabled={locked || isView}
          />

          <div className="flex flex-wrap gap-1.5 pb-0.5">
            {parseRfiReferences(rfiReferencesText).map((reference) => (
              <span
                key={reference}
                className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800"
              >
                {reference}
              </span>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Enter multiple RFIs separated by commas, semicolons or new lines. These references can be linked to the project RFI Register when that module is enabled.
        </p>
            </CollapsibleSection>

      <CollapsibleSection
        id="defaults"
        title="Production Defaults"
        subtitle="Default lunch and travel deductions applied to labour rows."
        open={openSections.has("defaults")}
        onToggle={() => toggleSection("defaults")}
        badge={`${prestartMinutes || "0"}m prestart · ${lunchBreakMinutes || "0"}m lunch`}
        tone="slate"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="sr-only">
              Docket Production Defaults
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Prestart, lunch and travel are production deductions. Set the normal crew defaults here, then apply them to all workers. Mobilisation remains in the Mobilising / Demobilising section.
            </p>
          </div>

        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
              <Input
                label="Prestart Minutes"
                type="number"
                value={prestartMinutes}
                onChange={setPrestartMinutes}
                disabled={locked || isView}
              />
              <Input
                label="Lunch Break Minutes"
                type="number"
                value={lunchBreakMinutes}
                onChange={setLunchBreakMinutes}
                disabled={locked || isView}
              />
              <Input
                label="Travel In Minutes"
                type="number"
                value={travelInMinutes}
                onChange={setTravelInMinutes}
                disabled={locked || isView}
              />
              <Input
                label="Travel Out Minutes"
                type="number"
                value={travelOutMinutes}
                onChange={setTravelOutMinutes}
                disabled={locked || isView}
              />
            </div>

            {!locked && !isView && (
              <button
                type="button"
                onClick={applyProductionDefaultsToAll}
                className="bg-amber-400 text-slate-950 border-2 border-amber-600 px-5 py-3 rounded-xl text-sm font-black shadow-md hover:bg-amber-300"
              >
                ⚠ Apply Defaults to Workers
              </button>
            )}
      </CollapsibleSection>

      <CollapsibleSection
        id="submission"
        title="Submission"
        subtitle="BC representative signature, approval status and supporting files."
        open={openSections.has("submission")}
        onToggle={() => toggleSection("submission")}
        badge={approvalStatus || "draft"}
        tone="emerald"
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="sr-only">Submission</h2>
            <p className="mt-1 text-sm text-slate-500">
              Save the docket as an editable draft, or sign and submit it into the BC approval workflow.
            </p>
          </div>

          {mode !== "create" && (
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${
                approvalStatus === "final" || approvalStatus === "legacy_final"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : approvalStatus === "submitted_bc" || approvalStatus === "client_pending"
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : approvalStatus === "bc_changes_requested" ||
                    approvalStatus === "client_changes_requested"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {approvalStatus === "final" || approvalStatus === "legacy_final"
                ? "Approved"
                : approvalStatus === "submitted_bc"
                ? "Pending BC Approval"
                : approvalStatus === "client_pending"
                ? "Pending Client Approval"
                : approvalStatus === "bc_changes_requested" ||
                  approvalStatus === "client_changes_requested"
                ? "Changes Required"
                : "In Progress"}
            </span>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Input
            label="BC Representative"
            value={bcRepName}
            onChange={setBcRepName}
            disabled={locked || isView}
          />

          <div>
            <label className="block text-sm font-medium mb-1">
              Supporting Docket File
            </label>
            <input
              type="file"
              disabled={locked || isView}
              onChange={(e) => setDocketFile(e.target.files?.[0] || null)}
              className="border rounded-lg p-2 w-full disabled:bg-slate-100 bg-white"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-5 space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-semibold text-slate-900">BC Representative Sign-off</h3>
              <p className="text-sm text-slate-500 mt-1">
                Sign below to confirm the Daily Docket is an accurate record of the shift.
              </p>
            </div>

            {bcSignatureDataUrl && (
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                Signed
              </div>
            )}
          </div>

          <SignaturePad
            value={bcSignatureDataUrl}
            onChange={handleBcSignatureChange}
            disabled={locked || isView}
          />

          {bcSignatureDataUrl && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>
                Signed by <strong className="text-slate-700">{bcRepName.trim() || "BC Representative"}</strong>
              </span>
              {bcSignedAt && (
                <span>
                  {new Date(bcSignedAt).toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>

        {(clientRepName || signedDate) && (
          <div className="grid md:grid-cols-2 gap-4">
            <Input
              label="Client Representative"
              value={clientRepName}
              onChange={setClientRepName}
              disabled
            />
            <Input
              label="Approval Date"
              type="date"
              value={signedDate}
              onChange={setSignedDate}
              disabled
            />
          </div>
        )}

        {(sharePointUrl || existingDocketFileUrl) && (
          <div className="flex flex-wrap gap-3 pt-1">
            {sharePointUrl && (
              <a
                href={sharePointUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-blue-700 hover:text-blue-800"
              >
                View Daily Docket PDF
              </a>
            )}

            {existingDocketFileUrl && (
              <a
                href={existingDocketFileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-blue-700 hover:text-blue-800"
              >
                View Supporting File
              </a>
            )}
          </div>
        )}
            </CollapsibleSection>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        {!locked && !isView && (
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving || submittingApproval}
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving Draft..." : "Save Draft"}
          </button>
        )}

        {!locked &&
          !isView &&
          (mode === "create" ||
            (mode === "edit" &&
              [
                "draft",
                "legacy",
                "bc_changes_requested",
                "client_changes_requested",
              ].includes(approvalStatus))) && (
            <button
              type="button"
              onClick={handleSubmitForApproval}
              disabled={saving || submittingApproval}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submittingApproval
                ? "Saving & Submitting..."
                : "Submit for Approval"}
            </button>
          )}

        {!locked && !isView && (
          <div className="min-w-55 flex-1 text-xs leading-5 text-slate-500">
            <strong className="text-slate-700">Save Draft</strong> keeps the
            docket editable and does not send approval emails.{" "}
            <strong className="text-slate-700">Submit for Approval</strong>{" "}
            saves the latest changes first, then starts the BC approval
            workflow.
          </div>
        )}

        <button
          type="button"
          onClick={() =>
            router.push(`/project/${projectId}/tower/${towerId}/dockets`)
          }
          disabled={saving || submittingApproval}
          className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {locked || isView ? "Back" : "Cancel"}
        </button>
      </div>
    </div>
  );
}


function CollapsibleSection({
  id,
  title,
  subtitle,
  open,
  onToggle,
  badge,
  tone = "slate",
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  badge?: string;
  tone?: "slate" | "purple" | "amber" | "blue" | "emerald";
  children: React.ReactNode;
}) {
  const toneClasses = {
    slate: "border-slate-200",
    purple: "border-purple-200",
    amber: "border-amber-200",
    blue: "border-blue-200",
    emerald: "border-emerald-200",
  };

  const badgeClasses = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    purple: "border-purple-200 bg-purple-50 text-purple-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };

  return (
    <div
      id={`docket-section-${id}`}
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${toneClasses[tone]}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition hover:bg-slate-50 md:px-5"
      >
        <div className="min-w-0">
          <div className="text-base font-black text-slate-950 md:text-lg">
            {title}
          </div>
          <div className="mt-0.5 hidden text-xs text-slate-500 sm:block">
            {subtitle}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {badge && (
            <span
              className={`max-w-60 truncate rounded-full border px-2.5 py-1 text-[10px] font-black md:text-xs ${badgeClasses[tone]}`}
            >
              {badge}
            </span>
          )}
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-black text-slate-500 transition ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          >
            ⌄
          </span>
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-100 p-4 md:p-5">
          {children}
        </div>
      )}
    </div>
  );
}

function AllocationMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "slate" | "blue" | "amber" | "emerald" | "red";
}) {
  const classes = {
    slate: "border-slate-200 bg-white text-slate-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    red: "border-red-200 bg-red-50 text-red-900",
  };

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${classes[tone]}`}>
      <div className="text-[9px] font-black uppercase tracking-wide opacity-50">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-black">{value}</div>
    </div>
  );
}

function WorkerAllocationPicker({
  workers,
  selected,
  disabled,
  onToggle,
  onSelectAll,
  onClear,
}: {
  workers: string[];
  selected: string[];
  disabled: boolean;
  onToggle: (workerName: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">
            Workers on this tower
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            Production MH is calculated once from Labour. Additional towers only split that productive total by percentage; the primary tower receives the balance automatically.
          </div>
        </div>

        {!disabled && workers.length > 0 && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onSelectAll}
              className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-black text-slate-700 hover:bg-slate-200"
            >
              All
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-black text-slate-700 hover:bg-slate-200"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {workers.length === 0 ? (
        <div className="mt-2 text-xs text-slate-500">
          Add workers in the Labour section first.
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {workers.map((workerName) => {
            const isSelected = selected.some(
              (name) =>
                normalizeWorkerName(name) === normalizeWorkerName(workerName)
            );

            return (
              <button
                key={workerName}
                type="button"
                disabled={disabled}
                onClick={() => onToggle(workerName)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                  isSelected
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                } disabled:opacity-60`}
              >
                {isSelected ? "✓ " : ""}
                {workerName}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SectionProgressTable({
  rows,
  hasBodyExtension,
  disabled,
  totals,
  onChange,
}: {
  rows: SectionV2ProgressRow[];
  hasBodyExtension: boolean;
  disabled: boolean;
  totals: {
    assemblyPercent: number;
    erectionPercent: number;
    totalProgressPercent: number;
  };
  onChange: (
    sectionCode: string,
    key: "assembly_today" | "erection_today",
    value: string
  ) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-155">
          <thead className="bg-slate-100 text-xs font-black uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-3 text-left">Section</th>
              <th className="border-l p-3 text-center">Assembly %</th>
              <th className="border-l p-3 text-center">Erection %</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter(
                (row) => hasBodyExtension || row.section_code !== "BE"
              )
              .map((row) => (
                <tr key={row.section_code} className="border-t border-slate-100">
                  <td className="p-3 font-bold text-slate-900">
                    {row.section_label}
                  </td>
                  <td className="border-l p-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      placeholder="—"
                      className="w-full rounded-lg border border-slate-300 p-2 text-center font-semibold disabled:bg-slate-100"
                      value={row.assembly_today}
                      disabled={disabled}
                      onChange={(e) =>
                        onChange(
                          row.section_code,
                          "assembly_today",
                          e.target.value
                        )
                      }
                    />
                  </td>
                  <td className="border-l p-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      placeholder="—"
                      className="w-full rounded-lg border border-slate-300 p-2 text-center font-semibold disabled:bg-slate-100"
                      value={row.erection_today}
                      disabled={disabled}
                      onChange={(e) =>
                        onChange(
                          row.section_code,
                          "erection_today",
                          e.target.value
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 border-t bg-slate-50 p-3 sm:grid-cols-3">
        <KpiPill
          label="Overall Assembly"
          value={`${totals.assemblyPercent}%`}
          tone="blue"
        />
        <KpiPill
          label="Overall Erection"
          value={`${totals.erectionPercent}%`}
          tone="emerald"
        />
        <KpiPill
          label="Total Progress"
          value={`${totals.totalProgressPercent}%`}
          tone="purple"
        />
      </div>
    </div>
  );
}

function SignaturePad({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  function prepareCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const targetWidth = Math.max(1, Math.round(rect.width * ratio));
    const targetHeight = Math.max(1, Math.round(rect.height * ratio));

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    const context = canvas.getContext("2d");
    if (!context) return null;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.2;
    context.strokeStyle = "#0f172a";

    return { canvas, context, rect };
  }

  useEffect(() => {
    const prepared = prepareCanvas();
    if (!prepared) return;

    const { context, rect } = prepared;
    context.clearRect(0, 0, rect.width, rect.height);

    if (!value) return;

    const image = new Image();
    image.onload = () => {
      const current = prepareCanvas();
      if (!current) return;
      current.context.clearRect(0, 0, current.rect.width, current.rect.height);
      current.context.drawImage(
        image,
        0,
        0,
        current.rect.width,
        current.rect.height
      );
    };
    image.src = value;

    const handleResize = () => {
      const current = prepareCanvas();
      if (!current || !value) return;
      const resizedImage = new Image();
      resizedImage.onload = () => {
        const latest = prepareCanvas();
        if (!latest) return;
        latest.context.clearRect(0, 0, latest.rect.width, latest.rect.height);
        latest.context.drawImage(
          resizedImage,
          0,
          0,
          latest.rect.width,
          latest.rect.height
        );
      };
      resizedImage.src = value;
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [value]);

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;

    const prepared = prepareCanvas();
    const point = pointFromEvent(event);
    if (!prepared || !point) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = point;

    prepared.context.beginPath();
    prepared.context.moveTo(point.x, point.y);
    prepared.context.lineTo(point.x + 0.01, point.y + 0.01);
    prepared.context.stroke();
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || !drawingRef.current) return;

    const prepared = prepareCanvas();
    const point = pointFromEvent(event);
    const lastPoint = lastPointRef.current;
    if (!prepared || !point || !lastPoint) return;

    event.preventDefault();

    prepared.context.beginPath();
    prepared.context.moveTo(lastPoint.x, lastPoint.y);
    prepared.context.lineTo(point.x, point.y);
    prepared.context.stroke();

    lastPointRef.current = point;
  }

  function finishDrawing(event?: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || !drawingRef.current) return;

    if (event) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already have been released.
      }
    }

    drawingRef.current = false;
    lastPointRef.current = null;

    const canvas = canvasRef.current;
    if (!canvas) return;

    onChange(canvas.toDataURL("image/png"));
  }

  function clearSignature() {
    if (disabled) return;

    const prepared = prepareCanvas();
    if (prepared) {
      prepared.context.clearRect(
        0,
        0,
        prepared.rect.width,
        prepared.rect.height
      );
    }

    drawingRef.current = false;
    lastPointRef.current = null;
    onChange("");
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-slate-300 bg-white">
        <canvas
          ref={canvasRef}
          className={`block h-40 w-full touch-none ${
            disabled ? "cursor-default bg-slate-50" : "cursor-crosshair"
          }`}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={finishDrawing}
          onPointerCancel={finishDrawing}
          onPointerLeave={(event) => {
            if (drawingRef.current && event.buttons === 0) {
              finishDrawing(event);
            }
          }}
          aria-label="BC representative signature pad"
        />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-slate-500">
          Use a mouse, touchscreen or stylus to sign.
        </p>

        {!disabled && (
          <button
            type="button"
            onClick={clearSignature}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Clear Signature
          </button>
        )}
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        className="border rounded-lg p-2 w-full disabled:bg-slate-100"
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  disabled = false,
  rows = 4,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <textarea
        className="border rounded-lg p-3 w-full disabled:bg-slate-100"
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function EmployeeSearchInput({
  id,
  value,
  employees,
  selectedCrewId,
  disabled,
  invalid,
  onChange,
  onCommit,
}: {
  id: string;
  value: string;
  employees: EmployeeRecord[];
  selectedCrewId: string;
  disabled: boolean;
  invalid: boolean;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const matches = useMemo(() => {
    const query = normaliseText(value);
    const queryParts = query.split(" ").filter(Boolean);

    return employees
      .filter((employee) => employee.active !== false && employee.full_name?.trim())
      .map((employee) => {
        const name = employee.full_name.trim();
        const role = toStringValue(employee.role).trim();
        const haystack = normaliseText(`${name} ${role}`);
        const crewPriority = selectedCrewId && employee.crew_id === selectedCrewId ? 0 : 1;
        const exactName = normalizeWorkerName(name) === normalizeWorkerName(value) ? 0 : 1;
        const startsWith = query && normaliseText(name).startsWith(query) ? 0 : 1;
        return { employee, name, role, haystack, crewPriority, exactName, startsWith };
      })
      .filter((item) => queryParts.length === 0 || queryParts.every((part) => item.haystack.includes(part)))
      .sort((a, b) =>
        a.exactName - b.exactName ||
        a.crewPriority - b.crewPriority ||
        a.startsWith - b.startsWith ||
        a.name.localeCompare(b.name)
      )
      .slice(0, 10);
  }, [employees, selectedCrewId, value]);

  function selectEmployee(employee: EmployeeRecord) {
    onChange(employee.full_name.trim());
    setOpen(false);
    window.setTimeout(onCommit, 0);
  }

  return (
    <div className="relative">
      <input
        id={id}
        autoComplete="off"
        className={`border rounded-lg p-2 text-sm w-full disabled:bg-slate-100 ${
          invalid ? "border-red-500 bg-white" : "border-slate-300"
        }`}
        value={value}
        disabled={disabled}
        placeholder="Search employee..."
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          onChange(e.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && matches.length > 0) {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((current) => Math.min(current + 1, matches.length - 1));
            return;
          }
          if (e.key === "ArrowUp" && matches.length > 0) {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((current) => Math.max(current - 1, 0));
            return;
          }
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (open && matches[activeIndex]) {
              selectEmployee(matches[activeIndex].employee);
            } else {
              onCommit();
            }
          }
        }}
      />

      {open && !disabled && (
        <div className="z-40 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-md">
          {matches.length > 0 ? (
            matches.map((item, matchIndex) => {
              const isCurrentCrew = Boolean(selectedCrewId && item.employee.crew_id === selectedCrewId);
              return (
                <button
                  key={item.employee.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(matchIndex)}
                  onClick={() => selectEmployee(item.employee)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${
                    activeIndex === matchIndex ? "bg-blue-50" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">{item.name}</span>
                    {item.role && <span className="block truncate text-xs text-slate-500">{item.role}</span>}
                  </span>
                  {isCurrentCrew && (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                      Current crew
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <div className="px-3 py-3 text-sm text-slate-500">No active employees match this search.</div>
          )}
        </div>
      )}
    </div>
  );
}

function LabourInput({
  label,
  id,
  value,
  onChange,
  onKeyDown,
  type = "text",
  disabled = false,
}: {
  label: string;
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        id={id}
        className="border rounded-lg p-2 text-sm w-full disabled:bg-slate-100"
        type={type}
        step={type === "number" ? "0.01" : undefined}
        value={value}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function KpiPill({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "blue" | "emerald" | "purple" | "slate";
}) {
  const classes = {
    blue: "bg-blue-50 border-blue-200 text-blue-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    purple: "bg-purple-50 border-purple-200 text-purple-800",
    slate: "bg-slate-50 border-slate-200 text-slate-800",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${classes}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-75">{label}</p>
      <p className="text-2xl font-black mt-1">{value}</p>
    </div>
  );
}

function PlantAutoMetric({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "amber";
}) {
  const classes =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-slate-200 bg-white text-slate-900";

  return (
    <div className={`rounded-xl border px-3 py-2 ${classes}`}>
      <div className="text-[10px] font-black uppercase tracking-wide opacity-50">{label}</div>
      <div className="mt-0.5 text-sm font-black">{value}</div>
    </div>
  );
}

function TinyTransferQty({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "green" | "red";
}) {
  const classes =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "red"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-slate-200 bg-white text-slate-800";

  return (
    <div className={`min-w-20 rounded-xl border px-3 py-2 text-center ${classes}`}>
      <div className="text-[8px] font-black uppercase tracking-wide opacity-60">
        {label}
      </div>
      <div className="text-lg font-black">{value}</div>
    </div>
  );
}

function TransferStatusPill({ status }: { status: BundleTransferStatus }) {
  const classes =
    status === "received"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "cancelled"
      ? "border-slate-200 bg-slate-100 text-slate-600"
      : "border-amber-200 bg-amber-50 text-amber-700";

  const label =
    status === "received"
      ? "RECEIVED"
      : status === "cancelled"
      ? "CANCELLED"
      : "IN TRANSIT";

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${classes}`}>
      {label}
    </span>
  );
}

function MiniSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-100 px-3 py-2 min-w-22.5">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

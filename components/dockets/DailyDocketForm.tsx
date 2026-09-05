"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useState, useEffect, useRef } from "react";
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

type MaterialEventItemDraft = {
  ui_id: string;
  source_table: string;
  source_record_id: string;
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
  item_reference: string;
  item_description: string;
  unit: string;
  tower_id: string;
};

type TowerOption = {
  id: string;
  name: string;
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
  missing_items_bolts: string | null;
  bc_rep_name: string | null;
  client_rep_name: string | null;
  signed_date: string | null;
  docket_file_url: string | null;
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

function makeLabourRow(
  row?: Partial<LabourRow> | any,
  options?: { mobilisationIsMinutes?: boolean }
): LabourRow {
  const mapped: LabourRow = {
    worker_name: toStringValue(row?.worker_name),
    time_in: toStringValue(row?.time_in),
    time_out: toStringValue(row?.time_out),
    total_hours: toStringValue(row?.total_hours),
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
    source_table: "",
    source_record_id: "",
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
  const [bulkPlantTimeIn, setBulkPlantTimeIn] = useState("");
  const [bulkPlantTimeOut, setBulkPlantTimeOut] = useState("");
  const [showPlantUsedSection, setShowPlantUsedSection] = useState(rateType === "schedule_of_rates");

  const [lunchBreakMinutes, setLunchBreakMinutes] = useState(toStringValue(initialDocket?.lunch_break_minutes));
  const [travelInMinutes, setTravelInMinutes] = useState(toStringValue(initialDocket?.travel_in_minutes));
  const [travelOutMinutes, setTravelOutMinutes] = useState(toStringValue(initialDocket?.travel_out_minutes));
  const [mobilisationHours, setMobilisationHours] = useState(hoursToMinutes(initialDocket?.mobilisation_hours));
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
  const [materialCatalog, setMaterialCatalog] = useState<MaterialCatalogItem[]>([]);
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
  const [showProductionDefaults, setShowProductionDefaults] = useState(false);

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
          .select("id, tower_id, bundle_reference, drawing_number, mark_no, pn_final, qty_per_tower, section")
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
            tower_id: String(row.tower_id),
            item_reference: String(row.mark_no || row.pn_final || row.bundle_reference || "Member"),
            item_description: [
              row.drawing_number ? `Drawing ${row.drawing_number}` : "",
              row.bundle_reference ? `Bundle ${row.bundle_reference}` : "",
              row.section ? `Section ${row.section}` : "",
              row.pn_final ? `Profile ${row.pn_final}` : "",
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
            tower_id: String(row.tower_id),
            item_reference: `Bundle ${String(row.bundle_no || "")}`.trim(),
            item_description: row.section ? `Section ${row.section}` : "Bundle",
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
    async function loadV2ProgressConfig() {
      const { data } = await supabase
        .from("project_docket_progress_weights")
        .select("section_code,section_label,assembly_weight,erection_weight,sort_order,active")
        .eq("project_id", projectId)
        .eq("active", true)
        .order("sort_order");

      if (!data?.length) return;
      setSectionV2Rows((prev) => {
        const previous = new Map(prev.map((r) => [r.section_code, r]));
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

          if (values.minutes) {
            setMobilisationHours(values.minutes);
          } else if (values.hours) {
            setMobilisationHours(hoursToMinutes(values.hours));
          }
          if (values.notes) setMobilisationNotes(values.notes);
        }

        setLunchBreakMinutes(toStringValue(initialDocket.lunch_break_minutes));
        setTravelInMinutes(toStringValue(initialDocket.travel_in_minutes));
        setTravelOutMinutes(toStringValue(initialDocket.travel_out_minutes));
        setMobilisationHours(hoursToMinutes(initialDocket.mobilisation_hours));
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
          const rawRows = initialProgressRows as any[];
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
                source_table: toStringValue(item.source_table),
                source_record_id: toStringValue(item.source_record_id),
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

      setLunchBreakMinutes(toStringValue(data.lunch_break_minutes));
      setTravelInMinutes(toStringValue(data.travel_in_minutes));
      setTravelOutMinutes(toStringValue(data.travel_out_minutes));
      setMobilisationHours(hoursToMinutes(data.mobilisation_hours));
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
          .order("occurred_at", { ascending: true }),
        supabase
          .from("tower_docket_hour_allocations")
          .select("*")
          .eq("docket_id", docketId)
          .order("created_at", { ascending: true }),
      ]);

      if (labour && labour.length > 0) setLabourRows(labour.map((r) => makeLabourRow(r)));

      setTowerRevisionAllocations(
        ((revisionAllocations || []) as any[]).map((row) => ({
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
        const rawRows = progress as any[];
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
            source_table: toStringValue(item.source_table),
            source_record_id: toStringValue(item.source_record_id),
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

  const labourRowsWithProduction = useMemo(
    () =>
      calculateLabourRows(labourRows, delayRows, {
        enabled: mobilisation.enabled,
        durationMinutes: mobilisationHours,
        workerNames: mobilisation.worker_names,
      }) as LabourRow[],
    [labourRows, delayRows, mobilisation.enabled, mobilisation.worker_names, mobilisationHours]
  );

  const labourTotals = useMemo(
    () =>
      calculateLabourTotals(labourRows, delayRows, {
        enabled: mobilisation.enabled,
        durationMinutes: mobilisationHours,
        workerNames: mobilisation.worker_names,
      }),
    [labourRows, delayRows, mobilisation.enabled, mobilisation.worker_names, mobilisationHours]
  );

  const labourWorkerCount = labourTotals.workerCount;
  const totalLabourHours = labourTotals.rawManhours;
  const totalProductionHours = labourTotals.productionManhours;

  const plantRowsWithTotals = useMemo(() => {
    return plantRows.map((row) => ({
      ...row,
      total_hours: calculateHours(row.time_in, row.time_out) || row.total_hours,
    }));
  }, [plantRows]);

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

  const mobilisationDurationHours = mobilisation.enabled ? minutesToHours(mobilisationHours) : 0;

  const mobilisationWorkerCount = calculateMobilisationWorkerCount({
    labourRows,
    mobilisation: {
      enabled: mobilisation.enabled,
      durationMinutes: mobilisationHours,
      workerNames: mobilisation.worker_names,
    },
  });

  const mobilisationManhours = calculateMobilisationManhours({
    labourRows,
    mobilisation: {
      enabled: mobilisation.enabled,
      durationMinutes: mobilisationHours,
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

  function buildTowerStatus(progress: number) {
    if (progress >= 100) return "Complete";
    if (progress > 0) return "In Progress";
    return "Not Started";
  }

  async function recalcTowerProgressAndStatus() {
    const { data, error } = await supabase
      .from("tower_daily_dockets")
      .select("assembly_percent, erection_percent")
      .eq("tower_id", towerId);

    if (error) throw new Error("Failed to recalculate tower progress.");

    const maxProgress =
      data?.reduce((max, d) => {
        const assembly = Number(d.assembly_percent || 0);
        const erection = Number(d.erection_percent || 0);
        return Math.max(max, Math.max(assembly, erection));
      }, 0) ?? 0;

    const towerUpdateRes = await supabase
      .from("towers")
      .update({
        progress: Math.round(maxProgress),
        status: buildTowerStatus(maxProgress),
        updated_at: new Date().toISOString(),
      })
      .eq("id", towerId);

    if (towerUpdateRes.error) {
      throw new Error("Docket saved, but tower status/progress failed to update.");
    }
  }


  function addLabourRow() {
    setLabourRows((prev) => {
      const previous = prev[prev.length - 1];

      if (!previous) {
        return [
          blankLabourRow({
            lunchBreakMinutes,
            travelInMinutes,
            travelOutMinutes,
            mobilisationHours,
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
      delays_comments: [
        delaysComments.trim(),
        mobilisation.enabled
          ? `MOBILISATION|from=${mobilisation.from_tower_id || ""}|to=${mobilisation.to_tower_id || ""}|status=${mobilisation.status}|progress=${mobilisation.percent_complete || "0"}|started=${mobilisation.started_date || ""}|target=${mobilisation.target_move_date || ""}|completed=${mobilisation.completed_date || ""}|minutes=${mobilisationHours || "0"}|hours=${minutesToHours(mobilisationHours)}|workers=${mobilisation.worker_names.map((name) => name.replace(/[|,]/g, " ")).join(",")}|notes=${mobilisation.notes.replace(/\|/g, "/")}`
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
      lunch_break_minutes: Number(lunchBreakMinutes || 0),
      travel_in_minutes: Number(travelInMinutes || 0),
      travel_out_minutes: Number(travelOutMinutes || 0),
      mobilisation_hours: mobilisation.enabled ? minutesToHours(mobilisationHours) : 0,
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
        lunch_minutes: Number(row.lunch_minutes || 0),
        travel_in_minutes: Number(row.travel_in_minutes || 0),
        travel_out_minutes: Number(row.travel_out_minutes || 0),
        mobilisation_hours: minutesToHours(row.mobilisation_hours),
        delay_hours: Number(row.delay_hours || 0),
        delay_reason: row.delay_reason || null,
        production_hours: Number(row.production_hours || 0),
      }));
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
        hours: toNumber(allocation.hours),
        worker_names: allocation.worker_names,
        reason: allocation.reason.trim() || null,
      }));
  }

  async function syncTowerRevisionAllocations(docketIdValue: string) {
    const deleteRes = await supabase
      .from("tower_docket_hour_allocations")
      .delete()
      .eq("docket_id", docketIdValue);

    if (deleteRes.error) {
      throw new Error(
        "Daily docket saved, but tower revision allocations could not be refreshed. Run the tower_docket_hour_allocations SQL migration."
      );
    }

    const payload = buildTowerRevisionAllocationPayload(docketIdValue);
    if (payload.length === 0) return;

    const insertRes = await supabase.from("tower_docket_hour_allocations").insert(payload);
    if (insertRes.error) {
      throw new Error(
        "Daily docket saved, but tower revision allocations could not be saved. Run the tower_docket_hour_allocations SQL migration."
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
        time_in: rateType === "schedule_of_rates" ? row.time_in || null : null,
        time_out: rateType === "schedule_of_rates" ? row.time_out || null : null,
        total_hours: rateType === "schedule_of_rates" ? Number(row.total_hours || 0) : 0,
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
    if (progressModel === "section_v2") {
      return sectionV2Rows.map((row) => ({
        docket_id: docketIdValue,
        progress_model: "section_v2",
        section: row.section_code,
        section_code: row.section_code,
        section_label: row.section_label,
        assembly_today: row.assembly_today.trim() === "" ? null : toNumber(row.assembly_today),
        assembly_overall: row.assembly_today.trim() === "" ? null : toNumber(row.assembly_today),
        erection_today: row.erection_today.trim() === "" ? null : toNumber(row.erection_today),
        erection_overall: row.erection_today.trim() === "" ? null : toNumber(row.erection_today),
        assembly_weight: row.assembly_weight,
        erection_weight: row.erection_weight,
        assembled_qty: row.assembly_today.trim() === "" ? 0 : toNumber(row.assembly_today),
        erected_qty: row.erection_today.trim() === "" ? 0 : toNumber(row.erection_today),
      }));
    }
    return progressRows.map((row) => ({
      docket_id: docketIdValue,
      progress_model: "legacy",
      section: row.section_label,
      section_label: row.section_label,
      assembled_qty: !hasBodyExtension && isBodyExtensionRow(row) ? 0 : Number(row.assembled_qty || 0),
      erected_qty: !hasBodyExtension && isBodyExtensionRow(row) ? 0 : Number(row.erected_qty || 0),
    }));
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

  async function searchProjectMaterial(
    eventIndex: number,
    itemIndex: number,
    query: string
  ) {
    const trimmed = query.trim();

    updateMaterialItem(eventIndex, itemIndex, {
      search_query: query,
      material_kind: "registered",
      search_loading: trimmed.length >= 2,
      search_results: trimmed.length >= 2 ? [] : [],
    });

    if (trimmed.length < 2) return;

    const event = materialEvents[eventIndex];
    if (!event) return;

    const searchTowerId =
      event.event_type === "taken_from_another_tower"
        ? event.source_tower_id
        : towerId;

    if (!searchTowerId) {
      updateMaterialItem(eventIndex, itemIndex, {
        search_loading: false,
        search_results: [],
      });
      return;
    }

    // Keep the search scoped to the relevant tower and query live material registers.
    // This avoids depending on a large project-wide preload and mirrors the existing
    // tower-linked material data model.
    const safe = trimmed.replace(/[,%()]/g, " ").trim();
    const pattern = `%${safe}%`;

    const [membersRes, bundlesRes] = await Promise.all([
      supabase
        .from("tower_material_members")
        .select(
          "id, tower_id, bundle_reference, drawing_number, mark_no, pn_final, qty_per_tower, section"
        )
        .eq("tower_id", searchTowerId)
        .or(
          [
            `mark_no.ilike.${pattern}`,
            `pn_final.ilike.${pattern}`,
            `bundle_reference.ilike.${pattern}`,
            `drawing_number.ilike.${pattern}`,
            `section.ilike.${pattern}`,
          ].join(",")
        )
        .limit(20),
      supabase
        .from("tower_required_bundles")
        .select("id, tower_id, bundle_no, section, qty_required, total_weight, member_qty")
        .eq("tower_id", searchTowerId)
        .or([`bundle_no.ilike.${pattern}`, `section.ilike.${pattern}`].join(","))
        .limit(12),
    ]);

    const results: MaterialCatalogItem[] = [];

    if (!membersRes.error) {
      for (const row of membersRes.data || []) {
        results.push({
          source_table: "tower_material_members",
          source_record_id: String(row.id),
          tower_id: String(row.tower_id),
          item_reference: String(
            row.mark_no || row.pn_final || row.bundle_reference || "Member"
          ),
          item_description: [
            row.drawing_number ? `Drawing ${row.drawing_number}` : "",
            row.bundle_reference ? `Bundle ${row.bundle_reference}` : "",
            row.section ? `Section ${row.section}` : "",
            row.pn_final ? `Profile ${row.pn_final}` : "",
            row.qty_per_tower != null ? `Qty/Tower ${row.qty_per_tower}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
          unit: "ea",
        });
      }
    }


    if (!bundlesRes.error) {
      for (const row of bundlesRes.data || []) {
        results.push({
          source_table: "tower_required_bundles",
          source_record_id: String(row.id),
          tower_id: String(row.tower_id),
          item_reference: `Bundle ${String(row.bundle_no || "")}`.trim(),
          item_description: [
            row.section ? `Section ${row.section}` : "",
            row.qty_required != null ? `Required ${row.qty_required}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
          unit: "bundle",
        });
      }
    }

    const searchError =
      membersRes.error?.message || bundlesRes.error?.message;

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
      material_kind: "registered",
      manual_category: "",
      bolt_size: "",
      search_query: catalogItem.item_reference,
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
          ? { ...event, items: [...event.items, blankMaterialItem()] }
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
    await syncDelayDayworks(docket.id);
    await recalcTowerProgressAndStatus();

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
    await syncDelayDayworks(docketId);
    await recalcTowerProgressAndStatus();

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
      setDelaysComments(stripMobilisationMetadata(lastDocket.delays_comments));

      setLunchBreakMinutes(toStringValue(lastDocket.lunch_break_minutes));
      setTravelInMinutes(toStringValue(lastDocket.travel_in_minutes));
      setTravelOutMinutes(toStringValue(lastDocket.travel_out_minutes));
      setMobilisationHours(hoursToMinutes(lastDocket.mobilisation_hours));
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
        const rawRows = progress as any[];

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

  function applyBulkPlantTimes() {
    if (isView || locked || rateType !== "schedule_of_rates") return;

    setPlantRows((prev) =>
      prev.map((row) => {
        if (!row.plant_name.trim() && !row.asset_id.trim() && !row.plant_type.trim()) {
          return row;
        }

        const time_in = bulkPlantTimeIn || row.time_in;
        const time_out = bulkPlantTimeOut || row.time_out;
        const total_hours = calculateHours(time_in, time_out) || row.total_hours;

        return { ...row, time_in, time_out, total_hours };
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

      <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 space-y-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Docket Header</h2>
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
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Tower Progress</h2>
        </div>

        {progressModel === "section_v2" ? (
          <>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">
                Body Extension
              </div>

              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
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

            <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white">
              <table className="w-full min-w-155">
                <thead className="bg-slate-100 text-sm text-slate-600">
                  <tr>
                    <th className="p-3 text-left">Section</th>
                    <th className="p-3 text-center border-l">Assembly Progress Today</th>
                    <th className="p-3 text-center border-l">Erection Progress Today</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionV2Rows
                    .filter((row) => hasBodyExtension || row.section_code !== "BE")
                    .map((row) => {
                      const actualIndex = sectionV2Rows.findIndex((r) => r.section_code === row.section_code);
                      return (
                        <tr key={row.section_code} className="border-t">
                          <td className="p-3 font-bold">{row.section_label}</td>
                          <td className="p-2 border-l">
                            <input type="number" min="0" max="100" step="1" placeholder="—"
                              className="border rounded-lg p-2 w-full disabled:bg-slate-100"
                              value={row.assembly_today} disabled={locked || isView}
                              onChange={(e) => updateSectionV2(actualIndex, "assembly_today", e.target.value)} />
                          </td>
                          <td className="p-2 border-l">
                            <input type="number" min="0" max="100" step="1" placeholder="—"
                              className="border rounded-lg p-2 w-full disabled:bg-slate-100"
                              value={row.erection_today} disabled={locked || isView}
                              onChange={(e) => updateSectionV2(actualIndex, "erection_today", e.target.value)} />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              <div className="grid sm:grid-cols-3 gap-3 p-4 bg-slate-50 border-t">
                <KpiPill label="Overall Assembly" value={`${totalAssemblyPercent}%`} tone="blue" />
                <KpiPill label="Overall Erection" value={`${totalErectionPercent}%`} tone="emerald" />
                <KpiPill label="Total Progress" value={`${displayProgress}%`} tone="purple" />
              </div>
            </div>
          </>
        ) : (
          <>
            <label className="inline-flex items-center gap-3 text-sm font-medium rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input type="checkbox" checked={hasBodyExtension} disabled={locked || isView}
                onChange={(e) => handleBodyExtensionToggle(e.target.checked)} className="h-4 w-4" />
              This tower has body extensions
            </label>
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full">
                <thead className="bg-slate-100 text-left text-sm text-slate-600">
                  <tr><th className="p-3">Section</th><th className="p-3">Assembly %</th><th className="p-3">Erection %</th></tr>
                </thead>
                <tbody>
                  {visibleProgressRows.map((row) => {
                    const actualIndex = progressRows.findIndex((r) => r.section_label === row.section_label);
                    return <tr key={row.section_label} className="border-t">
                      <td className="p-3 font-medium">{row.section_label}</td>
                      <td className="p-3"><input className="border rounded-lg p-2 w-full disabled:bg-slate-100" type="number" min="0" max="100" value={row.assembled_qty} disabled={locked || isView} onChange={(e)=>updateProgressRow(actualIndex,"assembled_qty",e.target.value)} /></td>
                      <td className="p-3"><input className="border rounded-lg p-2 w-full disabled:bg-slate-100" type="number" min="0" max="100" value={row.erected_qty} disabled={locked || isView} onChange={(e)=>updateProgressRow(actualIndex,"erected_qty",e.target.value)} /></td>
                    </tr>
                  })}
                </tbody>
              </table>
              <div className="grid sm:grid-cols-3 gap-3 p-4 bg-slate-50 border-t">
                <KpiPill label="Total Assembly" value={`${totalAssemblyPercent}%`} tone="blue" />
                <KpiPill label="Total Erection" value={`${totalErectionPercent}%`} tone="emerald" />
                <KpiPill label="Tower Progress Used" value={`${displayProgress}%`} tone="purple" />
              </div>
            </div>
          </>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Labour</h2>
            <p className="text-sm text-slate-500 mt-1">
              Keep the daily times quick to enter. Lunch and travel can be adjusted per worker; mobilisation and delays are applied from their sections below.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-right">
            <MiniSummary label="Workers" value={String(labourWorkerCount)} />
            <MiniSummary label="Raw MH" value={totalLabourHours.toFixed(2)} />
            <MiniSummary label="Production MH" value={totalProductionHours.toFixed(2)} />
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
                      Adjust lunch / travel
                    </summary>
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-[120px_120px_120px_140px_1fr] gap-2 items-end rounded-xl border border-slate-200 bg-slate-50 p-3">
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
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Safety / Incident Check</h2>
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
      </section>


      <section className="bg-white border border-purple-200 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Plant & Vehicles Used</h2>
            <p className="text-sm text-slate-500 mt-1">
              Crew-assigned assets are auto-added. Keep this as a quick register of what was used; hours are only required for Schedule of Rates.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <MiniSummary
              label={rateType === "schedule_of_rates" ? "Plant Hrs" : "Plant Items"}
              value={
                rateType === "schedule_of_rates"
                  ? totalPlantHours.toFixed(2)
                  : String(plantItemCount)
              }
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
            {rateType === "schedule_of_rates" && !locked && !isView && (
              <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-3 flex flex-col md:flex-row md:items-end gap-2">
                <div className="grid grid-cols-2 md:grid-cols-[160px_160px_auto] gap-2 items-end flex-1">
                  <LabourInput
                    label="Bulk Plant Time In"
                    type="time"
                    value={bulkPlantTimeIn}
                    onChange={setBulkPlantTimeIn}
                  />
                  <LabourInput
                    label="Bulk Plant Time Out"
                    type="time"
                    value={bulkPlantTimeOut}
                    onChange={setBulkPlantTimeOut}
                  />
                  <button
                    type="button"
                    onClick={applyBulkPlantTimes}
                    className="bg-purple-700 text-white rounded-xl px-4 py-2 text-sm font-semibold h-10 hover:bg-purple-800"
                  >
                    Apply Times to Plant
                  </button>
                </div>
              </div>
            )}

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

                  {rateType === "schedule_of_rates" && (
                    <div className="grid grid-cols-3 md:grid-cols-[120px_120px_110px] gap-2 items-end">
                      <LabourInput
                        label="Time In"
                        type="time"
                        value={row.time_in}
                        disabled={locked || isView}
                        onChange={(v) => updatePlantRow(index, "time_in", v)}
                      />
                      <LabourInput
                        label="Time Out"
                        type="time"
                        value={row.time_out}
                        disabled={locked || isView}
                        onChange={(v) => updatePlantRow(index, "time_out", v)}
                      />
                      <LabourInput
                        label="Total Hrs"
                        type="number"
                        value={row.total_hours}
                        disabled={locked || isView}
                        onChange={(v) => updatePlantRow(index, "total_hours", v)}
                      />
                    </div>
                  )}

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
      </section>

      {rateType === "schedule_of_rates" && (
        <section className="bg-white border border-purple-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">LAFHA</h2>
              <p className="text-sm text-slate-500 mt-1">
                Automatically calculated from workers on this docket.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MiniSummary label="Workers on Docket" value={String(labourWorkerCount)} />
              <MiniSummary label="LAFHA Required" value={String(labourWorkerCount)} />
            </div>
          </div>
        </section>
      )}

      <section className="bg-white border border-amber-200 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Tower Revision / Reallocation</h2>
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
      </section>

      <section className="bg-white border border-blue-200 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Mobilising / Demobilising</h2>
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
                label="Time spent (minutes)"
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
              The entered mobilisation duration is applied to every worker currently on this docket. For {labourWorkerCount} worker{labourWorkerCount === 1 ? "" : "s"}, {mobilisationDurationHours.toFixed(2)} hours produces a {mobilisationManhours.toFixed(2)} manhour production deduction.
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
            No mobilisation or demobilisation recorded for this docket.
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 space-y-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Delays, Missing Steel & Material Movements</h2>
            <p className="text-sm text-slate-500 mt-1">
              Record what happened on site. TTTracker calculates the affected labour/plant time and keeps the formal commercial wording out of the site form.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <MiniSummary label="General Delay Hrs" value={totalDelayEvents.toFixed(2)} />
            <MiniSummary label="Delay MH" value={totalDelayManhours.toFixed(2)} />
            <MiniSummary
              label="Material Issues"
              value={String(materialEvents.filter((event) => event.event_type !== "excess").length)}
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
                              disabled={locked || isView}
                              onChange={(e) =>
                                updateMaterialEvent(
                                  eventIndex,
                                  "event_type",
                                  e.target.value as MaterialEventType
                                )
                              }
                            >
                              <option value="missing">Missing material</option>
                              <option value="found_received">Found / Received</option>
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
                                  Search member / bundle
                                </label>
                                <input
                                  className="border rounded-xl p-2.5 w-full bg-white disabled:bg-slate-100"
                                  value={item.search_query}
                                  disabled={locked || isView}
                                  placeholder="Type 2+ characters: M1278, 23-04..."
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
                                            className="block w-full border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-blue-50"
                                          >
                                            <div className="text-sm font-semibold text-slate-900">
                                              {catalogItem.item_reference}
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
                                              : "No registered member or bundle matched this search."}
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

                            {!locked && !isView && (
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
                                Search member / bundle
                              </label>
                              <input
                                className="border rounded-xl p-2.5 w-full bg-white disabled:bg-slate-100"
                                value={item.search_query}
                                disabled={locked || isView}
                                placeholder="Type 2+ characters: M1278, 23-04..."
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
                                          <div className="text-sm font-semibold text-slate-900">
                                            {catalogItem.item_reference}
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
                                            : "No registered member or bundle matched this search."}
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

        <Input
          label="General Site Comment"
          value={delaysComments}
          onChange={setDelaysComments}
          disabled={locked || isView}
        />
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Docket Production Defaults
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Lunch and travel defaults used to calculate production hours. Mobilisation is entered in the Mobilising / Demobilising section above.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowProductionDefaults((prev) => !prev)}
            className="border border-slate-300 bg-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-50"
          >
            {showProductionDefaults ? "Hide Defaults" : "Show Defaults"}
          </button>
        </div>

        {showProductionDefaults && (
          <>
            <div className="grid md:grid-cols-3 gap-4">
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
          </>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 space-y-5 shadow-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Submission</h2>
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
      </section>

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
          <div className="min-w-[220px] flex-1 text-xs leading-5 text-slate-500">
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

function MiniSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-100 px-3 py-2 min-w-22.5">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

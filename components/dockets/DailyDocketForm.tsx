"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

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

const DEFAULT_PROGRESS_ROWS: ProgressRow[] = [
  { section_label: "Legs", assembled_qty: "", erected_qty: "" },
  { section_label: "Body Extensions", assembled_qty: "", erected_qty: "" },
  { section_label: "Common Body", assembled_qty: "", erected_qty: "" },
  { section_label: "Superstructure", assembled_qty: "", erected_qty: "" },
  { section_label: "Crossarms", assembled_qty: "", erected_qty: "" },
];

const BODY_EXTENSION_LABEL = "Body Extensions";

function toStringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function toNumber(value: string | number | null | undefined) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function hoursToMinutes(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const minutes = n * 60;
  return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(2);
}

function minutesToHours(value: string | number | null | undefined) {
  return toNumber(value) / 60;
}

function clampPercent(value: string) {
  if (value === "") return "";
  const n = Number(value);
  if (Number.isNaN(n)) return "";
  return String(Math.max(0, Math.min(100, n)));
}

function isClientSignedDocket(docket: {
  client_rep_name?: string | null;
  signed_date?: string | null;
}) {
  return Boolean(docket.client_rep_name?.trim() && docket.signed_date?.trim());
}

function calculateHours(timeIn: string, timeOut: string) {
  if (!timeIn || !timeOut) return "";

  const [h1, m1] = timeIn.split(":").map(Number);
  const [h2, m2] = timeOut.split(":").map(Number);

  if (
    Number.isNaN(h1) ||
    Number.isNaN(m1) ||
    Number.isNaN(h2) ||
    Number.isNaN(m2)
  ) {
    return "";
  }

  let diffMinutes = h2 * 60 + m2 - (h1 * 60 + m1);
  if (diffMinutes < 0) diffMinutes += 24 * 60;

  return (diffMinutes / 60).toFixed(2);
}

function calculateProductionHours(row: LabourRow, appliedDelayHours?: number) {
  const raw = toNumber(row.total_hours);
  const lunch = toNumber(row.lunch_minutes) / 60;
  const travelIn = toNumber(row.travel_in_minutes) / 60;
  const travelOut = toNumber(row.travel_out_minutes) / 60;
  const mobilisation = minutesToHours(row.mobilisation_hours);
  const delay = appliedDelayHours ?? toNumber(row.delay_hours);

  return Math.max(0, raw - lunch - travelIn - travelOut - mobilisation - delay).toFixed(2);
}

function normalizeWorkerName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
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
    if (indexes.length > 1) {
      indexes.forEach((i) => duplicateIndexes.add(i));
    }
  });

  return duplicateIndexes;
}

function isBodyExtensionRow(row: ProgressRow) {
  return row.section_label.trim().toLowerCase() === BODY_EXTENSION_LABEL.toLowerCase();
}

function readExtraNumber(extra: Record<string, unknown>, keys: string[]) {
  const normalisedExtra = Object.fromEntries(
    Object.entries(extra).map(([key, value]) => [
      key.trim().toLowerCase(),
      value,
    ])
  );

  for (const key of keys) {
    const value = normalisedExtra[key.trim().toLowerCase()];
    if (value === null || value === undefined || value === "") continue;

    if (typeof value === "number" && Number.isFinite(value)) return value;

    const text = String(value).trim().toLowerCase();

    if (["yes", "y", "true", "included", "include"].includes(text)) return 1;
    if (["no", "n", "false", "none", "nil", "na", "n/a"].includes(text)) return 0;

    const match = text.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    if (match) {
      const n = Number(match[0]);
      if (Number.isFinite(n)) return n;
    }
  }

  return null;
}

function inferTowerHasBodyExtension(tower: TowerRecord | null) {
  const extra = tower?.extra_data || {};

const value = readExtraNumber(extra, [
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
]);

  if (value === null) return false;
  return value > 0;
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

  if (!mapped.total_hours) {
    mapped.total_hours = calculateHours(mapped.time_in, mapped.time_out);
  }

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

  const delayRow: DelayRow = {
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

  return delayRow;
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

function delayAppliesToWorker(delay: DelayRow, workerName: string) {
  if (delay.applies_to === "entire_crew") return true;
  const target = normalizeWorkerName(workerName);
  return delay.worker_names.some((name) => normalizeWorkerName(name) === target);
}

function delayTypeLabel(type: DelayType) {
  switch (type) {
    case "weather":
      return "Weather";
    case "lightning":
      return "Lightning";
    case "toolbox":
      return "Toolbox";
    case "mobilisation":
      return "Mobilisation";
    case "access":
      return "Access / Bogged";
    case "plant":
      return "Plant / Equipment";
    case "materials":
      return "Materials";
    case "other":
    default:
      return "Other";
  }
}

function delayDayworkMeta(type: DelayType) {
  switch (type) {
    case "weather":
      return { code: "WD", label: "Weather delay" };
    case "lightning":
      return { code: "WD", label: "Weather delay" };
    case "toolbox":
      return { code: "SB", label: "Standby" };
    case "mobilisation":
      return { code: "MOB", label: "Mobilisation" };
    case "access":
      return { code: "ACC", label: "Access / Bogged" };
    case "plant":
      return { code: "PI", label: "Plant issue" };
    case "materials":
      return { code: "MI", label: "Material issue" };
    case "other":
    default:
      return { code: "OTH", label: "Other" };
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

  const [docketDate, setDocketDate] = useState(
    toStringValue(initialDocket?.docket_date)
  );
  const [crewName, setCrewName] = useState(toStringValue(initialDocket?.crew));
  const [leadingHand, setLeadingHand] = useState(
    toStringValue(initialDocket?.leading_hand)
  );
  const [towerLabel, setTowerLabel] = useState("");
  const [weather, setWeather] = useState(toStringValue(initialDocket?.weather));
  const [rateType, setRateType] = useState<DocketRateType>(
    initialDocket?.rate_type === "schedule_of_rates" ? "schedule_of_rates" : "tonnage_rate"
  );
  const [weatherDelayHours, setWeatherDelayHours] = useState(
    toStringValue(initialDocket?.weather_delay_hours)
  );
  const [lightningDelayHours, setLightningDelayHours] = useState(
    toStringValue(initialDocket?.lightning_delay_hours)
  );
  const [toolboxDelayHours, setToolboxDelayHours] = useState(
    toStringValue(initialDocket?.toolbox_delay_hours)
  );
  const [otherDelayHours, setOtherDelayHours] = useState(
    toStringValue(initialDocket?.other_delay_hours)
  );
  const [otherDelayReason, setOtherDelayReason] = useState(
    toStringValue(initialDocket?.other_delay_reason)
  );
  const [missingItemsBolts, setMissingItemsBolts] = useState(
    toStringValue(initialDocket?.missing_items_bolts)
  );
  const [delaysComments, setDelaysComments] = useState(
    toStringValue(initialDocket?.delays_comments)
  );
  const [bcRepName, setBcRepName] = useState(
    toStringValue(initialDocket?.bc_rep_name)
  );
  const [clientRepName, setClientRepName] = useState(
    toStringValue(initialDocket?.client_rep_name)
  );
  const [signedDate, setSignedDate] = useState(
    toStringValue(initialDocket?.signed_date)
  );
  const [docketFile, setDocketFile] = useState<File | null>(null);
  const [existingDocketFileUrl, setExistingDocketFileUrl] = useState(
    toStringValue(initialDocket?.docket_file_url)
  );
  const [bulkTimeIn, setBulkTimeIn] = useState("");
  const [bulkTimeOut, setBulkTimeOut] = useState("");
  const [bulkPlantTimeIn, setBulkPlantTimeIn] = useState("");
  const [bulkPlantTimeOut, setBulkPlantTimeOut] = useState("");

  const [lunchBreakMinutes, setLunchBreakMinutes] = useState(
    toStringValue(initialDocket?.lunch_break_minutes)
  );
  const [travelInMinutes, setTravelInMinutes] = useState(
    toStringValue(initialDocket?.travel_in_minutes)
  );
  const [travelOutMinutes, setTravelOutMinutes] = useState(
    toStringValue(initialDocket?.travel_out_minutes)
  );
  const [mobilisationHours, setMobilisationHours] = useState(
    hoursToMinutes(initialDocket?.mobilisation_hours)
  );
  const [mobilisationNotes, setMobilisationNotes] = useState(
    toStringValue(initialDocket?.mobilisation_notes)
  );
  const [incidentOccurred, setIncidentOccurred] = useState(
    Boolean(initialDocket?.incident_occurred)
  );
  const [incidentType, setIncidentType] = useState(
    toStringValue(initialDocket?.incident_type)
  );
  const [incidentNotes, setIncidentNotes] = useState(
    toStringValue(initialDocket?.incident_notes)
  );



  const [labourRows, setLabourRows] = useState<LabourRow[]>(
    initialLabourRows && initialLabourRows.length > 0
      ? initialLabourRows.map((r) => makeLabourRow(r))
      : [blankLabourRow()]
  );

  const [plantRows, setPlantRows] = useState<PlantRow[]>(
    initialPlantRows && initialPlantRows.length > 0
      ? initialPlantRows.map((r) => makePlantRow(r))
      : [blankPlantRow()]
  );

  const [delayRows, setDelayRows] = useState<DelayRow[]>(
    initialDelayRows && initialDelayRows.length > 0
      ? initialDelayRows.map((r) => makeDelayRow(r))
      : []
  );

  const [progressRows, setProgressRows] = useState<ProgressRow[]>(
    initialProgressRows && initialProgressRows.length > 0
      ? initialProgressRows.map((r) => ({
          section_label: toStringValue(r.section_label),
          assembled_qty: toStringValue(r.assembled_qty),
          erected_qty: toStringValue(r.erected_qty),
        }))
      : DEFAULT_PROGRESS_ROWS
  );

  const [hasBodyExtension, setHasBodyExtension] = useState(true);
  const [saving, setSaving] = useState(false);

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

    const nextCrews = ((crewData || []) as CrewRecord[]).filter(
      (crew) => crew.active !== false,
    );

    setCrews(nextCrews);
    setEmployees(((employeeData || []) as EmployeeRecord[]).filter(
      (employee) => employee.active !== false,
    ));

    const savedCrewText = crewName.trim().toLowerCase();
    if (savedCrewText) {
      const matchedCrew = nextCrews.find((crew) => {
        const crewNumber = String(crew.crew_number || "").trim().toLowerCase();
        const crewNameValue = String(crew.crew_name || "").trim().toLowerCase();
        return crewNumber === savedCrewText || crewNameValue === savedCrewText;
      });

      if (matchedCrew) {
        setSelectedCrewId(matchedCrew.id);
      }
    }
  }

  const timer = window.setTimeout(() => {
    void loadCrewData();
  }, 0);

  return () => window.clearTimeout(timer);
}, [crewName, supabase]);

useEffect(() => {
  async function loadTowerBodyExtensionDefault() {
    const { data } = await supabase
      .from("towers")
      .select(`
        id,
        name,
        tower_number,
        structure_number,
        line,
        extra_data
      `)
      .eq("id", towerId)
      .single();

    const towerData = data as TowerRecord | null;

    const towerName =
      String(
        towerData?.tower_number ||
        towerData?.structure_number ||
        towerData?.name ||
        ""
      );

    const line =
      String(
        towerData?.line ||
        ""
      );

    setTowerLabel(
      line
        ? `${towerName} (${line})`
        : towerName
    );

    const hasBodyExtFromCsv =
      inferTowerHasBodyExtension(towerData);

    setHasBodyExtension(hasBodyExtFromCsv);

    if (!hasBodyExtFromCsv) {
      setProgressRows((prev) =>
        prev.map((row) =>
          isBodyExtensionRow(row)
            ? {
                ...row,
                assembled_qty: "",
                erected_qty: "",
              }
            : row
        )
      );
    }
  }

  const timer = window.setTimeout(() => {
    void loadTowerBodyExtensionDefault();
  }, 0);

  return () => window.clearTimeout(timer);
}, [supabase, towerId]);

  useEffect(() => {
    if (!docketId && !initialDocket) return;

    async function loadDocket() {
      if (initialDocket) {
        setDocketDate(toStringValue(initialDocket.docket_date));
        setCrewName(toStringValue(initialDocket.crew));
        setLeadingHand(toStringValue(initialDocket.leading_hand));
        setWeather(toStringValue(initialDocket.weather));
        setRateType(initialDocket.rate_type === "schedule_of_rates" ? "schedule_of_rates" : "tonnage_rate");

        setWeatherDelayHours(toStringValue(initialDocket.weather_delay_hours));
        setLightningDelayHours(
          toStringValue(initialDocket.lightning_delay_hours)
        );
        setToolboxDelayHours(toStringValue(initialDocket.toolbox_delay_hours));
        setOtherDelayHours(toStringValue(initialDocket.other_delay_hours));
        setOtherDelayReason(toStringValue(initialDocket.other_delay_reason));
        setMissingItemsBolts(toStringValue(initialDocket.missing_items_bolts));
        setDelaysComments(toStringValue(initialDocket.delays_comments));

        setLunchBreakMinutes(toStringValue(initialDocket.lunch_break_minutes));
        setTravelInMinutes(toStringValue(initialDocket.travel_in_minutes));
        setTravelOutMinutes(toStringValue(initialDocket.travel_out_minutes));
        setMobilisationHours(hoursToMinutes(initialDocket.mobilisation_hours));
        setMobilisationNotes(toStringValue(initialDocket.mobilisation_notes));
        setIncidentOccurred(Boolean(initialDocket.incident_occurred));
        setIncidentType(toStringValue(initialDocket.incident_type));
        setIncidentNotes(toStringValue(initialDocket.incident_notes));


        setBcRepName(toStringValue(initialDocket.bc_rep_name));
        setClientRepName(toStringValue(initialDocket.client_rep_name));
        setSignedDate(toStringValue(initialDocket.signed_date));
        setExistingDocketFileUrl(toStringValue(initialDocket.docket_file_url));

        if (initialLabourRows?.length) {
          setLabourRows(initialLabourRows.map((r) => makeLabourRow(r)));
        }

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
            const legacyDelayRows = initialLabourRows
              .filter((r) => Number(r.delay_hours || 0) > 0)
              .map((r) =>
                makeDelayRow({
                  delay_type: "other",
                  delay_reason: r.delay_reason || "Legacy labour delay",
                  delay_hours: r.delay_hours,
                  applies_to: "selected_workers",
                  worker_names: [r.worker_name],
                }),
              );

            setDelayRows(legacyDelayRows);
          }
        }

        if (initialPlantRows?.length) {
          setPlantRows(initialPlantRows.map((r) => makePlantRow(r)));
        }

        if (initialProgressRows?.length) {
          const mappedRows = initialProgressRows.map((r) => ({
            section_label: toStringValue(r.section_label),
            assembled_qty: toStringValue(r.assembled_qty),
            erected_qty: toStringValue(r.erected_qty),
          }));

          setProgressRows(mappedRows);
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

      setWeatherDelayHours(toStringValue(data.weather_delay_hours));
      setLightningDelayHours(toStringValue(data.lightning_delay_hours));
      setToolboxDelayHours(toStringValue(data.toolbox_delay_hours));
      setOtherDelayHours(toStringValue(data.other_delay_hours));
      setOtherDelayReason(toStringValue(data.other_delay_reason));
      setMissingItemsBolts(toStringValue(data.missing_items_bolts));
      setDelaysComments(toStringValue(data.delays_comments));

      setLunchBreakMinutes(toStringValue(data.lunch_break_minutes));
      setTravelInMinutes(toStringValue(data.travel_in_minutes));
      setTravelOutMinutes(toStringValue(data.travel_out_minutes));
      setMobilisationHours(hoursToMinutes(data.mobilisation_hours));
      setMobilisationNotes(toStringValue(data.mobilisation_notes));
      setIncidentOccurred(Boolean(data.incident_occurred));
      setIncidentType(toStringValue(data.incident_type));
      setIncidentNotes(toStringValue(data.incident_notes));


      setBcRepName(toStringValue(data.bc_rep_name));
      setClientRepName(toStringValue(data.client_rep_name));
      setSignedDate(toStringValue(data.signed_date));
      setExistingDocketFileUrl(toStringValue(data.docket_file_url));

      const { data: labour } = await supabase
        .from("tower_docket_labour")
        .select("*")
        .eq("docket_id", docketId);

      if (labour && labour.length > 0) {
        setLabourRows(labour.map((r) => makeLabourRow(r)));
      }

      const { data: delays } = await supabase
        .from("tower_docket_delays")
        .select("*")
        .eq("docket_id", docketId);

      if (delays && delays.length > 0) {
        setDelayRows((delays as DbDelayRow[]).map((r) => makeDelayRow(r)));
      } else if (labour && labour.length > 0) {
        const legacyDelayRows = (labour as any[])
          .filter((r) => Number(r.delay_hours || 0) > 0)
          .map((r) =>
            makeDelayRow({
              delay_type: "other",
              delay_reason: r.delay_reason || "Legacy labour delay",
              delay_hours: r.delay_hours,
              applies_to: "selected_workers",
              worker_names: [r.worker_name],
            }),
          );
        setDelayRows(legacyDelayRows);
      }

      const { data: plant } = await supabase
        .from("tower_docket_plant")
        .select("*")
        .eq("docket_id", docketId);

      if (plant && plant.length > 0) {
        setPlantRows(plant.map((r) => makePlantRow(r)));
      }

      const { data: progress } = await supabase
        .from("tower_docket_progress")
        .select("*")
        .eq("docket_id", docketId);


      if (progress && progress.length > 0) {
        const mappedRows = progress.map((r) => ({
          section_label: toStringValue(r.section_label),
          assembled_qty: toStringValue(r.assembled_qty),
          erected_qty: toStringValue(r.erected_qty),
        }));

        setProgressRows(mappedRows);
      }
    }

    const timer = window.setTimeout(() => {
      void loadDocket();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    docketId,
    initialDocket,
    initialLabourRows,
    initialProgressRows,
    initialDelayRows,
    initialPlantRows,
    supabase,
  ]);

  const locked = useMemo(
    () =>
      isClientSignedDocket({
        client_rep_name: clientRepName,
        signed_date: signedDate,
      }),
    [clientRepName, signedDate]
  );

  const duplicateWorkerIndexes = useMemo(() => {
    return getDuplicateWorkerIndexes(labourRows);
  }, [labourRows]);

  const hasDuplicateWorkers = duplicateWorkerIndexes.size > 0;

  const visibleProgressRows = useMemo(() => {
    return progressRows.filter((row) => {
      if (!hasBodyExtension && isBodyExtensionRow(row)) return false;
      return true;
    });
  }, [progressRows, hasBodyExtension]);

  const totalAssemblyPercent = useMemo(() => {
    if (visibleProgressRows.length === 0) return 0;
    const weight = 100 / visibleProgressRows.length;

    const total = visibleProgressRows.reduce((sum, row) => {
      const rowPercent = Math.max(
        0,
        Math.min(100, Number(row.assembled_qty || 0))
      );
      return sum + (rowPercent / 100) * weight;
    }, 0);

    return Math.round(total);
  }, [visibleProgressRows]);

  const totalErectionPercent = useMemo(() => {
    if (visibleProgressRows.length === 0) return 0;
    const weight = 100 / visibleProgressRows.length;

    const total = visibleProgressRows.reduce((sum, row) => {
      const rowPercent = Math.max(
        0,
        Math.min(100, Number(row.erected_qty || 0))
      );
      return sum + (rowPercent / 100) * weight;
    }, 0);

    return Math.round(total);
  }, [visibleProgressRows]);

  const displayProgress = useMemo(() => {
    return Math.round(totalAssemblyPercent * 0.5 + totalErectionPercent * 0.5);
  }, [totalAssemblyPercent, totalErectionPercent]);

  const availableWorkerNames = useMemo(() => uniqueWorkerNames(labourRows), [labourRows]);

  function delayHoursForWorker(workerName: string) {
    if (!workerName.trim()) return 0;
    return delayRows.reduce((sum, delay) => {
      if (!delayAppliesToWorker(delay, workerName)) return sum;
      return sum + toNumber(delay.delay_hours);
    }, 0);
  }

  function delayReasonsForWorker(workerName: string) {
    if (!workerName.trim()) return "";
    return delayRows
      .filter((delay) => delayAppliesToWorker(delay, workerName) && toNumber(delay.delay_hours) > 0)
      .map((delay) => `${delayTypeLabel(delay.delay_type)}: ${delay.delay_reason || "Delay"}`)
      .join("; ");
  }

const labourRowsWithProduction = labourRows.map((row) => {
  const appliedDelayHours = delayHoursForWorker(row.worker_name);

  const next: LabourRow = {
    ...row,
    delay_hours: appliedDelayHours ? appliedDelayHours.toFixed(2) : "",
    delay_reason: delayReasonsForWorker(row.worker_name),
  };

  return {
    ...next,
    production_hours: calculateProductionHours(next, appliedDelayHours),
  };
});

  const labourWorkerCount = useMemo(() => {
    return labourRowsWithProduction.filter((row) => row.worker_name.trim()).length;
  }, [labourRowsWithProduction]);

  const totalLabourHours = useMemo(() => {
    return labourRowsWithProduction.reduce((sum, row) => {
      return sum + (Number(row.total_hours) || 0);
    }, 0);
  }, [labourRowsWithProduction]);

  const totalProductionHours = useMemo(() => {
    return labourRowsWithProduction.reduce((sum, row) => {
      return sum + (Number(row.production_hours) || 0);
    }, 0);
  }, [labourRowsWithProduction]);

  const plantRowsWithTotals = useMemo(() => {
    return plantRows.map((row) => {
      const total_hours = calculateHours(row.time_in, row.time_out) || row.total_hours;
      return { ...row, total_hours };
    });
  }, [plantRows]);

  const availablePlantNames = useMemo(() => {
    return plantRowsWithTotals
      .map((row, index) => plantDisplayName(row, index))
      .filter((name) => name.trim());
  }, [plantRowsWithTotals]);

  const totalPlantHours = useMemo(() => {
    return plantRowsWithTotals.reduce((sum, row) => sum + toNumber(row.total_hours), 0);
  }, [plantRowsWithTotals]);

  const plantItemCount = useMemo(() => {
    return plantRowsWithTotals.filter((row) =>
      row.plant_name.trim() || row.asset_id.trim() || row.plant_type.trim()
    ).length;
  }, [plantRowsWithTotals]);

  const hasLabourAndPlantDelay = useMemo(() => {
    return delayRows.some((delay) => delay.delay_applies_mode === "labour_and_plant");
  }, [delayRows]);

  const shouldShowPlantSection = rateType === "schedule_of_rates" || hasLabourAndPlantDelay;

  const totalLunchHours = useMemo(() => {
    return labourRowsWithProduction.reduce((sum, row) => {
      return sum + toNumber(row.lunch_minutes) / 60;
    }, 0);
  }, [labourRowsWithProduction]);

  const totalTravelHours = useMemo(() => {
    return labourRowsWithProduction.reduce((sum, row) => {
      return sum + (toNumber(row.travel_in_minutes) + toNumber(row.travel_out_minutes)) / 60;
    }, 0);
  }, [labourRowsWithProduction]);

  const totalMobilisationHours = useMemo(() => {
    return labourRowsWithProduction.reduce((sum, row) => {
      return sum + minutesToHours(row.mobilisation_hours);
    }, 0);
  }, [labourRowsWithProduction]);

  const totalDelayManhours = useMemo(() => {
    return labourRowsWithProduction.reduce((sum, row) => {
      return sum + toNumber(row.delay_hours);
    }, 0);
  }, [labourRowsWithProduction]);

  const totalPlantDelayHours = useMemo(() => {
    return delayRows.reduce((sum, row) => {
      if (!delayIncludesPlant(row)) return sum;
      return sum + toNumber(row.delay_hours) * row.plant_names.length;
    }, 0);
  }, [delayRows]);

  const totalDelayEvents = useMemo(() => {
    return delayRows.reduce((sum, row) => sum + toNumber(row.delay_hours), 0);
  }, [delayRows]);

  const delaySummaryByType = useMemo(() => {
    return delayRows.reduce(
      (acc, row) => {
        const value = toNumber(row.delay_hours);
        acc[row.delay_type] = (acc[row.delay_type] || 0) + value;
        return acc;
      },
      {} as Record<DelayType, number>,
    );
  }, [delayRows]);

  const crewOptions = useMemo(() => {
    return crews.map((crew) => ({
      id: crew.id,
      label: `${crew.crew_number || "Crew"}${crew.crew_name ? ` - ${crew.crew_name}` : ""}`,
    }));
  }, [crews]);

  const employeeNameOptions = useMemo(() => {
    const seen = new Set<string>();
    return employees
      .map((employee) => employee.full_name.trim())
      .filter((name) => {
        const key = normalizeWorkerName(name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [employees]);

  function crewMembersForCrew(crewId: string) {
    return employees.filter((employee) => employee.crew_id === crewId);
  }

  function handleCrewSelection(crewIdValue: string) {
    if (isView || locked) return;

    setSelectedCrewId(crewIdValue);

    if (!crewIdValue) {
      return;
    }

    const selectedCrew = crews.find((crew) => crew.id === crewIdValue);
    if (!selectedCrew) return;

    const members = crewMembersForCrew(crewIdValue);
    const currentHasLabour = labourRows.some((row) =>
      row.worker_name.trim() || row.time_in || row.time_out || row.total_hours,
    );

    if (currentHasLabour) {
      const confirmed = window.confirm(
        "Apply this crew to the labour section? This will replace the current worker names but you can still edit them afterwards.",
      );

      if (!confirmed) {
        setCrewName(toStringValue(selectedCrew.crew_number));
        if (selectedCrew.leading_hand) setLeadingHand(selectedCrew.leading_hand);
        return;
      }
    }

    setCrewName(toStringValue(selectedCrew.crew_number));
    if (selectedCrew.leading_hand) {
      setLeadingHand(selectedCrew.leading_hand);
    }

    if (members.length > 0) {
      const mappedWorkers = members.map(() =>
        blankLabourRow({
          lunchBreakMinutes,
          travelInMinutes,
          travelOutMinutes,
          mobilisationHours,
        }),
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

    if (error) {
      throw new Error("Failed to recalculate tower progress.");
    }

    const maxProgress =
      data?.reduce((max, d) => {
        const assembly = Number(d.assembly_percent || 0);
        const erection = Number(d.erection_percent || 0);
        const docketProgress = Math.max(assembly, erection);
        return Math.max(max, docketProgress);
      }, 0) ?? 0;

    const status = buildTowerStatus(maxProgress);

    const towerUpdateRes = await supabase
      .from("towers")
      .update({
        progress: Math.round(maxProgress),
        status,
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
          mobilisation_hours: previous.mobilisation_hours || mobilisationHours,
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
    const nextValue = key === "section_label" ? value : clampPercent(value);

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
          mobilisation_hours: mobilisationHours,
        };

        return {
          ...next,
          production_hours: calculateProductionHours(next, delayHoursForWorker(next.worker_name)),
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

  function updateDelayRow(index: number, key: keyof DelayRow, value: string | string[]) {
    if (isView || locked) return;

    setDelayRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;

        if (key === "delay_type") {
          return { ...row, delay_type: value as DelayType };
        }

        if (key === "delay_reason") {
          return { ...row, delay_reason: String(value) };
        }

        if (key === "delay_hours") {
          return { ...row, delay_hours: String(value) };
        }

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
      }),
    );
  }

  function toggleDelayWorker(index: number, workerName: string) {
    if (isView || locked) return;

    setDelayRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const exists = row.worker_names.some(
          (name) => normalizeWorkerName(name) === normalizeWorkerName(workerName),
        );
        return {
          ...row,
          worker_names: exists
            ? row.worker_names.filter(
                (name) => normalizeWorkerName(name) !== normalizeWorkerName(workerName),
              )
            : [...row.worker_names, workerName],
        };
      }),
    );
  }

  function toggleDelayPlant(index: number, plantName: string) {
    if (isView || locked) return;

    setDelayRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const exists = row.plant_names.some(
          (name) => normalizeWorkerName(name) === normalizeWorkerName(plantName),
        );
        return {
          ...row,
          plant_names: exists
            ? row.plant_names.filter(
                (name) => normalizeWorkerName(name) !== normalizeWorkerName(plantName),
              )
            : [...row.plant_names, plantName],
        };
      }),
    );
  }

  async function uploadFileIfNeeded() {
    if (!docketFile) return existingDocketFileUrl || null;

    const safeName = docketFile.name.replace(/\s+/g, "_");
    const path = `dockets/${projectId}/${towerId}/${Date.now()}_${safeName}`;

    const uploadRes = await supabase.storage
      .from("tower-files")
      .upload(path, docketFile, { upsert: true });

    if (uploadRes.error) {
      throw new Error("Failed to upload docket file");
    }

    const publicUrlRes = supabase.storage.from("tower-files").getPublicUrl(path);
    return publicUrlRes.data.publicUrl;
  }

  function buildDocketPayload(docketFileUrl: string | null, existingSignedDate: string | null = null) {
    return {
      docket_date: docketDate,
      crew: crewName,
      leading_hand: leadingHand,
      weather,
      rate_type: rateType,
      assembly_percent: totalAssemblyPercent,
      erection_percent: totalErectionPercent,
      weather_delay_hours: Number(weatherDelayHours || delaySummaryByType.weather || 0),
      lightning_delay_hours: Number(lightningDelayHours || delaySummaryByType.lightning || 0),
      toolbox_delay_hours: Number(toolboxDelayHours || delaySummaryByType.toolbox || 0),
      other_delay_hours: Number(otherDelayHours || delaySummaryByType.other || 0),
      other_delay_reason: otherDelayReason,
      delays_comments: delaysComments,
      missing_items_bolts: missingItemsBolts,
      lunch_break_minutes: Number(lunchBreakMinutes || 0),
      travel_in_minutes: Number(travelInMinutes || 0),
      travel_out_minutes: Number(travelOutMinutes || 0),
      mobilisation_hours: minutesToHours(mobilisationHours),
      mobilisation_notes: mobilisationNotes,
      incident_occurred: incidentOccurred,
      incident_type: incidentOccurred ? incidentType || null : null,
      incident_notes: incidentOccurred ? incidentNotes || null : null,

      raw_manhours: totalLabourHours,
      production_manhours: totalProductionHours,
      bc_rep_name: bcRepName,
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

  function buildPlantPayload(docketIdValue: string) {
    if (!shouldShowPlantSection) return [];

    return plantRowsWithTotals
      .filter((row) => row.plant_name.trim() || row.asset_id.trim() || row.plant_type.trim())
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
        plant_names: row.delay_applies_mode === "labour_and_plant" ? row.plant_names : [],
      }));
  }

  function buildProgressPayload(docketIdValue: string) {
    return progressRows.map((row) => ({
      docket_id: docketIdValue,
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
          ? plantRowsWithTotals.filter((row, plantIndex) => {
              const displayName = plantDisplayName(row, plantIndex);
              return delay.plant_names.some(
                (name) => normalizeWorkerName(name) === normalizeWorkerName(displayName)
              );
            })
          : [];

const locationText = towerLocation;
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
        .join("\\n");

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
            location: locationText,
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
            location: locationText,
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

    const staleDayworks = ((existingLinkedDayworks || []) as { id: string; source_delay_key: string | null }[])
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

  async function handleCreate() {
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

    if (docketError || !docket) {
      throw new Error("Failed to save daily docket");
    }

    const labourPayload = buildLabourPayload(docket.id);

    if (labourPayload.length > 0) {
      const labourRes = await supabase.from("tower_docket_labour").insert(labourPayload);
      if (labourRes.error) {
        throw new Error("Daily docket saved, but labour rows failed. Check that the production hour columns exist on tower_docket_labour.");
      }
    }

    const plantPayload = buildPlantPayload(docket.id);

    if (plantPayload.length > 0) {
      const plantRes = await supabase.from("tower_docket_plant").insert(plantPayload);
      if (plantRes.error) {
        throw new Error("Daily docket saved, but plant rows failed. Create the tower_docket_plant table before using Schedule of Rates plant tracking.");
      }
    }

    const delayPayload = buildDelayPayload(docket.id);

    if (delayPayload.length > 0) {
      const delayRes = await supabase.from("tower_docket_delays").insert(delayPayload);
      if (delayRes.error) {
        throw new Error("Daily docket saved, but delay rows failed. Check that tower_docket_delays exists.");
      }
    }

    const progressPayload = buildProgressPayload(docket.id);

    if (progressPayload.length > 0) {
      const progressRes = await supabase
        .from("tower_docket_progress")
        .insert(progressPayload);

      if (progressRes.error) {
        throw new Error("Daily docket saved, but progress rows failed.");
      }
    }

    await syncDelayDayworks(docket.id);

    await recalcTowerProgressAndStatus();

    router.push(`/project/${projectId}/tower/${towerId}/dockets`);
  }

  async function handleUpdate() {
    if (!docketId) throw new Error("Missing docket id");

    const { data: existing, error: existingError } = await supabase
      .from("tower_daily_dockets")
      .select("id, client_rep_name, signed_date")
      .eq("id", docketId)
      .single();

    if (existingError || !existing) {
      throw new Error("Could not load docket for editing.");
    }

    if (isClientSignedDocket(existing)) {
      throw new Error("This docket is client signed and cannot be edited.");
    }

    const docketFileUrl = await uploadFileIfNeeded();

    const updateRes = await supabase
      .from("tower_daily_dockets")
      .update(buildDocketPayload(docketFileUrl, existing.signed_date))
      .eq("id", docketId);

    if (updateRes.error) {
      throw new Error("Failed to update docket. Check that the production manhour columns exist on tower_daily_dockets.");
    }

    const deleteLabourRes = await supabase
      .from("tower_docket_labour")
      .delete()
      .eq("docket_id", docketId);

    if (deleteLabourRes.error) {
      throw new Error("Failed to refresh labour rows.");
    }

    const deleteDelayRes = await supabase
      .from("tower_docket_delays")
      .delete()
      .eq("docket_id", docketId);

    if (deleteDelayRes.error) {
      throw new Error("Failed to refresh delay rows.");
    }

    const deletePlantRes = await supabase
      .from("tower_docket_plant")
      .delete()
      .eq("docket_id", docketId);

    if (deletePlantRes.error && shouldShowPlantSection) {
      throw new Error("Failed to refresh plant rows. Check that tower_docket_plant exists.");
    }

    const deleteProgressRes = await supabase
      .from("tower_docket_progress")
      .delete()
      .eq("docket_id", docketId);

    if (deleteProgressRes.error) {
      throw new Error("Failed to refresh progress rows.");
    }

    const labourPayload = buildLabourPayload(docketId);

    if (labourPayload.length > 0) {
      const labourInsertRes = await supabase
        .from("tower_docket_labour")
        .insert(labourPayload);

      if (labourInsertRes.error) {
        throw new Error("Failed to save labour rows. Check that the production hour columns exist on tower_docket_labour.");
      }
    }

    const plantPayload = buildPlantPayload(docketId);

    if (plantPayload.length > 0) {
      const plantInsertRes = await supabase
        .from("tower_docket_plant")
        .insert(plantPayload);

      if (plantInsertRes.error) {
        throw new Error("Failed to save plant rows. Create the tower_docket_plant table before using Schedule of Rates plant tracking.");
      }
    }

    const delayPayload = buildDelayPayload(docketId);

    if (delayPayload.length > 0) {
      const delayInsertRes = await supabase
        .from("tower_docket_delays")
        .insert(delayPayload);

      if (delayInsertRes.error) {
        throw new Error("Failed to save delay rows. Check that tower_docket_delays exists.");
      }
    }

    const progressPayload = buildProgressPayload(docketId);

    if (progressPayload.length > 0) {
      const progressInsertRes = await supabase
        .from("tower_docket_progress")
        .insert(progressPayload);

      if (progressInsertRes.error) {
        throw new Error("Failed to save progress rows.");
      }
    }

    await syncDelayDayworks(docketId);

    await recalcTowerProgressAndStatus();

    router.push(`/project/${projectId}/tower/${towerId}/dockets`);
    router.refresh();
  }

  async function handleSubmit() {
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
      setSaving(false);
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

      const { data: labour } = await supabase
        .from("tower_docket_labour")
        .select("*")
        .eq("docket_id", lastDocket.id);

      const { data: plant } = await supabase
        .from("tower_docket_plant")
        .select("*")
        .eq("docket_id", lastDocket.id);

      const { data: progress } = await supabase
        .from("tower_docket_progress")
        .select("*")
        .eq("docket_id", lastDocket.id);

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

      setWeatherDelayHours(toStringValue(lastDocket.weather_delay_hours));
      setLightningDelayHours(toStringValue(lastDocket.lightning_delay_hours));
      setToolboxDelayHours(toStringValue(lastDocket.toolbox_delay_hours));
      setOtherDelayHours(toStringValue(lastDocket.other_delay_hours));
      setOtherDelayReason(toStringValue(lastDocket.other_delay_reason));
      setMissingItemsBolts(toStringValue(lastDocket.missing_items_bolts));
      setDelaysComments(toStringValue(lastDocket.delays_comments));

      setLunchBreakMinutes(toStringValue(lastDocket.lunch_break_minutes));
      setTravelInMinutes(toStringValue(lastDocket.travel_in_minutes));
      setTravelOutMinutes(toStringValue(lastDocket.travel_out_minutes));
      setMobilisationHours(hoursToMinutes(lastDocket.mobilisation_hours));
      setMobilisationNotes(toStringValue(lastDocket.mobilisation_notes));
      setIncidentOccurred(false);
      setIncidentType("");
      setIncidentNotes("");


      setBcRepName("");
      setClientRepName("");
      setSignedDate("");
      setDocketFile(null);
      setExistingDocketFileUrl("");

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
            mobilisationHours: hoursToMinutes(lastDocket.mobilisation_hours),
          }),
        ]);
      }

      if (plant && plant.length > 0) {
        setPlantRows([...plant.map((r) => makePlantRow(r)), blankPlantRow()]);
      } else {
        setPlantRows([blankPlantRow()]);
      }

      // Do not carry previous day delay events by default. Delays should be entered for the actual day.
      setDelayRows([]);

      if (progress && progress.length > 0) {
        const mappedRows = progress.map((r) => ({
          section_label: toStringValue(r.section_label),
          assembled_qty: toStringValue(r.assembled_qty),
          erected_qty: toStringValue(r.erected_qty),
        }));

        setProgressRows(mappedRows);
      } else {
        setProgressRows(DEFAULT_PROGRESS_ROWS);

        const { data: tower } = await supabase
          .from("towers")
          .select("*")
          .eq("id", towerId)
          .single();

        setHasBodyExtension(inferTowerHasBodyExtension((tower as TowerRecord | null) || null));
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

        const next = {
          ...row,
          time_in,
          time_out,
          total_hours,
        };

        return {
          ...next,
          production_hours: calculateProductionHours(next, delayHoursForWorker(next.worker_name)),
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

        return {
          ...row,
          time_in,
          time_out,
          total_hours,
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
    setPlantRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [blankPlantRow()];
    });
  }

  function updatePlantRow(index: number, key: keyof PlantRow, value: string) {
    if (isView || locked) return;

    setPlantRows((prev) => {
      const updated = prev.map((row, i) =>
        i === index ? { ...row, [key]: value } : row
      );

      const current = updated[index];
      if (key === "time_in" || key === "time_out") {
        current.total_hours = calculateHours(current.time_in, current.time_out) || current.total_hours;
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
        <div className="border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-2xl p-4">
          This docket has been client signed and is now locked.
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

        <div className="grid md:grid-cols-2 gap-4">
          <Input label="Date" type="date" value={docketDate} onChange={setDocketDate} disabled={locked || isView} />

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

          <Input label="Crew Number / Manual Override" value={crewName} onChange={setCrewName} disabled={locked || isView} />
          <Input label="Leading Hand Name" value={leadingHand} onChange={setLeadingHand} disabled={locked || isView} />
          <Input label="Weather" value={weather} onChange={setWeather} disabled={locked || isView} />
        </div>

        {rateType === "schedule_of_rates" && (
          <div className="rounded-2xl border border-purple-200 bg-purple-50 text-purple-800 p-4 text-sm">
            Schedule of Rates selected. The docket will include a Plant & Equipment section for cranes, telehandlers, EWP, trucks, or other hired plant used that day.
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Section Quantities</h2>
            <p className="text-sm text-slate-500 mt-1">
              This drives assembly, erection and tower progress. Body extension is auto-detected but can be overridden.
            </p>
          </div>

          <label className="inline-flex items-center gap-3 text-sm font-medium rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <input
              type="checkbox"
              checked={hasBodyExtension}
              disabled={locked || isView}
              onChange={(e) => handleBodyExtensionToggle(e.target.checked)}
              className="h-4 w-4"
            />
            This tower has body extensions
          </label>
        </div>

        {!hasBodyExtension && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
            Body Extensions are excluded from the progress calculation for this docket.
          </div>
        )}

        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <table className="w-full">
            <thead className="bg-slate-100 text-left text-sm text-slate-600">
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
                    <td className="p-3 font-medium text-slate-800">{row.section_label}</td>
                    <td className="p-3">
                      <input
                        className="border rounded-lg p-2 w-full disabled:bg-slate-100"
                        type="number"
                        min="0"
                        max="100"
                        value={row.assembled_qty}
                        disabled={locked || isView}
                        onChange={(e) => updateProgressRow(actualIndex, "assembled_qty", e.target.value)}
                      />
                    </td>
                    <td className="p-3">
                      <input
                        className="border rounded-lg p-2 w-full disabled:bg-slate-100"
                        type="number"
                        min="0"
                        max="100"
                        value={row.erected_qty}
                        disabled={locked || isView}
                        onChange={(e) => updateProgressRow(actualIndex, "erected_qty", e.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border-t border-slate-200">
            <KpiPill label="Total Assembly" value={`${totalAssemblyPercent}%`} tone="blue" />
            <KpiPill label="Total Erection" value={`${totalErectionPercent}%`} tone="emerald" />
            <KpiPill label="Tower Progress Used" value={`${displayProgress}%`} tone="purple" />
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Labour</h2>
            <p className="text-sm text-slate-500 mt-1">
              Raw hours are captured for the docket. Production hours are calculated from defaults and delay events.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-7 gap-2 text-right">
            <MiniSummary label="Workers" value={String(labourWorkerCount)} />
            <MiniSummary label="Raw" value={totalLabourHours.toFixed(2)} />
            <MiniSummary label="Production" value={totalProductionHours.toFixed(2)} />
            <MiniSummary label="Lunch" value={totalLunchHours.toFixed(2)} />
            <MiniSummary label="Travel" value={totalTravelHours.toFixed(2)} />
            <MiniSummary label="Prestart Hrs" value={totalMobilisationHours.toFixed(2)} />
            <MiniSummary label="Delay" value={totalDelayManhours.toFixed(2)} />
          </div>
        </div>


        <datalist id="employee-name-options">
          {employeeNameOptions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <div className="space-y-3">
          {labourRowsWithProduction.map((row, index) => {
            const isDuplicate = duplicateWorkerIndexes.has(index);

            return (
              <div key={index} className={`border rounded-xl p-3 space-y-3 bg-white ${isDuplicate ? "border-red-300 bg-red-50" : "border-slate-200"}`}>
                <div className="grid grid-cols-2 md:grid-cols-[1.4fr_110px_110px_100px_100px] gap-2 items-end">
                  <div>
                    <label className="block text-sm font-medium mb-1">Worker Name</label>
                    <input
                      id={`labour-name-${index}`}
                      list="employee-name-options"
                      className={`border rounded-lg p-2 text-sm w-full disabled:bg-slate-100 ${isDuplicate ? "border-red-500 bg-white" : ""}`}
                      value={row.worker_name}
                      disabled={locked || isView}
                      placeholder="Start typing or select employee"
                      onKeyDown={(e) => handleLabourKeyDown(e, `labour-timein-${index}`)}
                      onChange={(e) => updateLabourRow(index, "worker_name", e.target.value)}
                    />
                    {isDuplicate && row.worker_name.trim() && <p className="text-xs text-red-600 mt-1">This worker name is already entered in this docket.</p>}
                  </div>

                  <LabourInput label="Time In" id={`labour-timein-${index}`} type="time" value={row.time_in} disabled={locked || isView} onKeyDown={(e) => handleLabourKeyDown(e, `labour-timeout-${index}`)} onChange={(v) => updateLabourRow(index, "time_in", v)} />
                  <LabourInput label="Time Out" id={`labour-timeout-${index}`} type="time" value={row.time_out} disabled={locked || isView} onKeyDown={(e) => handleLabourKeyDown(e, `labour-hours-${index}`)} onChange={(v) => updateLabourRow(index, "time_out", v)} />
                  <LabourInput label="Raw Hrs" id={`labour-hours-${index}`} type="number" value={row.total_hours} disabled={locked || isView} onKeyDown={(e) => handleLabourKeyDown(e, `labour-lunch-${index}`)} onChange={(v) => updateLabourRow(index, "total_hours", v)} />

                  <div>
                    <label className="block text-sm font-medium mb-1">Prod Hrs</label>
                    <div className="border rounded-lg p-2 text-sm w-full bg-emerald-50 text-emerald-800 font-semibold">{row.production_hours || "0.00"}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-[110px_110px_110px_110px_110px_1fr_auto] gap-2 items-end">
                  <LabourInput label="Lunch Min" id={`labour-lunch-${index}`} type="number" value={row.lunch_minutes} disabled={locked || isView} onKeyDown={(e) => handleLabourKeyDown(e, `labour-travelin-${index}`)} onChange={(v) => updateLabourRow(index, "lunch_minutes", v)} />
                  <LabourInput label="Travel In" id={`labour-travelin-${index}`} type="number" value={row.travel_in_minutes} disabled={locked || isView} onKeyDown={(e) => handleLabourKeyDown(e, `labour-travelout-${index}`)} onChange={(v) => updateLabourRow(index, "travel_in_minutes", v)} />
                  <LabourInput label="Travel Out" id={`labour-travelout-${index}`} type="number" value={row.travel_out_minutes} disabled={locked || isView} onKeyDown={(e) => handleLabourKeyDown(e, `labour-mob-${index}`)} onChange={(v) => updateLabourRow(index, "travel_out_minutes", v)} />
                  <LabourInput label="Prestart Min" id={`labour-mob-${index}`} type="number" value={row.mobilisation_hours} disabled={locked || isView} onKeyDown={(e) => handleLabourKeyDown(e, `labour-name-${index + 1}`)} onChange={(v) => updateLabourRow(index, "mobilisation_hours", v)} />

                  <div>
                    <label className="block text-sm font-medium mb-1">Delay Hrs</label>
                    <div className="border rounded-lg p-2 text-sm w-full bg-amber-50 text-amber-800 font-semibold">{row.delay_hours || "0.00"}</div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Delay Reason</label>
                    <div className="border rounded-lg p-2 text-sm w-full bg-slate-50 text-slate-700 min-h-10 truncate">{row.delay_reason || "—"}</div>
                  </div>

                  {!locked && !isView ? <button type="button" onClick={() => removeLabourRow(index)} className="border px-4 py-2 rounded-lg h-10 hover:bg-slate-50">Remove</button> : <div />}
                </div>
              </div>
            );
          })}
        </div>

        {!locked && !isView && (
          <div className="pt-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 flex flex-col md:flex-row md:items-end gap-2">
            <button type="button" onClick={addLabourRow} className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-black h-10">
              Add Worker
            </button>
            <div className="grid grid-cols-2 md:grid-cols-[160px_160px_auto] gap-2 items-end flex-1">
              <LabourInput label="Bulk Time In" type="time" value={bulkTimeIn} onChange={setBulkTimeIn} />
              <LabourInput label="Bulk Time Out" type="time" value={bulkTimeOut} onChange={setBulkTimeOut} />
              <button type="button" onClick={applyBulkTimes} className="bg-slate-800 text-white rounded-xl px-4 py-2 text-sm font-semibold h-10 hover:bg-slate-900">
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

      {shouldShowPlantSection && (
        <section className="bg-white border border-purple-200 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Plant & Equipment</h2>
              <p className="text-sm text-slate-500 mt-1">
                {rateType === "schedule_of_rates"
                  ? "Used for Schedule of Rates dockets and commercial delay tracking. This can later link to the Assets page."
                  : "Manual plant used for commercial delay tracking only. This does not affect production MH/t."}
              </p>
            </div>
            <MiniSummary label={rateType === "schedule_of_rates" ? "Plant Hrs" : "Plant Items"} value={rateType === "schedule_of_rates" ? totalPlantHours.toFixed(2) : String(plantItemCount)} />
          </div>

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
              <div key={index} className="border border-purple-100 bg-purple-50/40 rounded-xl p-3 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-[1.2fr_1fr_1fr_1fr] gap-2 items-end">
                  <LabourInput label="Plant / Asset Name" value={row.plant_name} disabled={locked || isView} onChange={(v) => updatePlantRow(index, "plant_name", v)} />
                  <LabourInput label="Plant Type" value={row.plant_type} disabled={locked || isView} onChange={(v) => updatePlantRow(index, "plant_type", v)} />
                  <LabourInput label="Asset ID / Rego" value={row.asset_id} disabled={locked || isView} onChange={(v) => updatePlantRow(index, "asset_id", v)} />
                  <LabourInput label="Operator" value={row.operator_name} disabled={locked || isView} onChange={(v) => updatePlantRow(index, "operator_name", v)} />
                </div>

                {rateType === "schedule_of_rates" ? (
                  <div className="grid grid-cols-2 md:grid-cols-[120px_120px_110px_1fr_auto] gap-2 items-end">
                    <LabourInput label="Time In" type="time" value={row.time_in} disabled={locked || isView} onChange={(v) => updatePlantRow(index, "time_in", v)} />
                    <LabourInput label="Time Out" type="time" value={row.time_out} disabled={locked || isView} onChange={(v) => updatePlantRow(index, "time_out", v)} />
                    <LabourInput label="Total Hrs" type="number" value={row.total_hours} disabled={locked || isView} onChange={(v) => updatePlantRow(index, "total_hours", v)} />
                    <LabourInput label="Notes" value={row.notes} disabled={locked || isView} onChange={(v) => updatePlantRow(index, "notes", v)} />
                    {!locked && !isView ? <button type="button" onClick={() => removePlantRow(index)} className="border px-4 py-2 rounded-lg h-10 bg-white hover:bg-slate-50">Remove</button> : <div />}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
                    <LabourInput label="Notes" value={row.notes} disabled={locked || isView} onChange={(v) => updatePlantRow(index, "notes", v)} />
                    {!locked && !isView ? <button type="button" onClick={() => removePlantRow(index)} className="border px-4 py-2 rounded-lg h-10 bg-white hover:bg-slate-50">Remove</button> : <div />}
                  </div>
                )}
              </div>
            ))}
          </div>

          {!locked && !isView && (
            <button type="button" onClick={addPlantRow} className="bg-purple-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-purple-700">
              Add Plant / Equipment
            </button>
          )}
        </section>
      )}

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
              <MiniSummary
                label="Workers on Docket"
                value={String(labourWorkerCount)}
              />

              <MiniSummary
                label="LAFHA Required"
                value={String(labourWorkerCount)}
              />
            </div>
          </div>
        </section>
      )}

      <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Delays & Issues</h2>
            <p className="text-sm text-slate-500 mt-1">
              Add delay events for commercial tracking. Choose labour only or labour + plant for items such as moving blocks, access issues, bogged plant, or standby.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-right">
            <MiniSummary label="Delay Events" value={totalDelayEvents.toFixed(2)} />
            <MiniSummary label="Delay MH" value={totalDelayManhours.toFixed(2)} />
            <MiniSummary label="Plant Delay" value={totalPlantDelayHours.toFixed(2)} />
            <MiniSummary label="Rows" value={String(delayRows.length)} />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Input label="Missing Items / Bolts" value={missingItemsBolts} onChange={setMissingItemsBolts} disabled={locked || isView} />
          <Input label="General Delay / Site Comment" value={delaysComments} onChange={setDelaysComments} disabled={locked || isView} />
        </div>

        <div className="space-y-3">
          {delayRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              No delay events added. Add one if weather, access, plant, materials, or selected workers were delayed.
            </div>
          ) : (
            delayRows.map((delay, index) => {
              const affectedCount = delay.applies_to === "entire_crew" ? availableWorkerNames.length : delay.worker_names.length;
              const delayManhours = toNumber(delay.delay_hours) * affectedCount;
              const plantDelayHours = delayIncludesPlant(delay)
                ? toNumber(delay.delay_hours) * delay.plant_names.length
                : 0;

              return (
                <div key={delay.ui_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="grid md:grid-cols-[150px_150px_120px_1fr_170px_auto] gap-3 items-end">
                    <div>
                      <label className="block text-sm font-medium mb-1">Delay Type</label>
                      <select className="border rounded-lg p-2 w-full text-sm disabled:bg-slate-100" value={delay.delay_type} disabled={locked || isView} onChange={(e) => updateDelayRow(index, "delay_type", e.target.value)}>
                        <option value="weather">Weather</option>
                        <option value="lightning">Lightning</option>
                        <option value="toolbox">Toolbox</option>
                        <option value="mobilisation">Mobilisation</option>
                        <option value="access">Access / Bogged</option>
                        <option value="plant">Plant / Equipment</option>
                        <option value="materials">Materials</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Commercial Tracking</label>
                      <select className="border rounded-lg p-2 w-full text-sm disabled:bg-slate-100" value={delay.delay_applies_mode} disabled={locked || isView} onChange={(e) => updateDelayRow(index, "delay_applies_mode", e.target.value)}>
                        <option value="labour_only">Labour Only</option>
                        <option value="labour_and_plant">Labour + Plant</option>
                      </select>
                    </div>

                    <Input label="Delay Hrs" type="number" value={delay.delay_hours} onChange={(v) => updateDelayRow(index, "delay_hours", v)} disabled={locked || isView} />
                    <Input label="Reason" value={delay.delay_reason} onChange={(v) => updateDelayRow(index, "delay_reason", v)} disabled={locked || isView} />

                    <div>
                      <label className="block text-sm font-medium mb-1">Labour Applies To</label>
                      <select className="border rounded-lg p-2 w-full text-sm disabled:bg-slate-100" value={delay.applies_to} disabled={locked || isView} onChange={(e) => updateDelayRow(index, "applies_to", e.target.value)}>
                        <option value="entire_crew">Entire Crew</option>
                        <option value="selected_workers">Selected Workers</option>
                      </select>
                    </div>

                    {!locked && !isView ? <button type="button" onClick={() => removeDelayRow(index)} className="border px-4 py-2 rounded-lg h-10 bg-white hover:bg-slate-50">Remove</button> : <div />}
                  </div>

                  {delay.applies_to === "selected_workers" && (
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="text-sm font-medium mb-2">Affected Workers</div>
                      {availableWorkerNames.length === 0 ? (
                        <div className="text-sm text-slate-500">Add workers in the labour section first.</div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {availableWorkerNames.map((name) => {
                            const checked = delay.worker_names.some((worker) => normalizeWorkerName(worker) === normalizeWorkerName(name));
                            return (
                              <label key={`${delay.ui_id}-${name}`} className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm cursor-pointer ${checked ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"}`}>
                                <input type="checkbox" className="hidden" checked={checked} disabled={locked || isView} onChange={() => toggleDelayWorker(index, name)} />
                                {name}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {delayIncludesPlant(delay) && (
                    <div className="rounded-xl border border-purple-200 bg-white p-3">
                      <div className="text-sm font-medium mb-2 text-purple-900">Affected Plant</div>
                      {availablePlantNames.length === 0 ? (
                        <div className="text-sm text-slate-500">Add plant or equipment above first. This can be manual for now and linked to Assets later.</div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {availablePlantNames.map((name) => {
                            const checked = delay.plant_names.some((plant) => normalizeWorkerName(plant) === normalizeWorkerName(name));
                            return (
                              <label key={`${delay.ui_id}-plant-${name}`} className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm cursor-pointer ${checked ? "bg-purple-700 text-white border-purple-700" : "bg-white text-slate-700 border-slate-300"}`}>
                                <input type="checkbox" className="hidden" checked={checked} disabled={locked || isView} onChange={() => toggleDelayPlant(index, name)} />
                                {name}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-xs text-slate-500 space-y-1">
                    <div>Labour delay tracking: {toNumber(delay.delay_hours).toFixed(2)} hrs × {affectedCount} people = {delayManhours.toFixed(2)} delay manhours.</div>
                    {delayIncludesPlant(delay) && (
                      <div>Plant delay tracking: {toNumber(delay.delay_hours).toFixed(2)} hrs × {delay.plant_names.length} plant item(s) = {plantDelayHours.toFixed(2)} plant delay hours.</div>
                    )}
                    <div className="font-medium text-slate-600">Plant delay is commercial tracking only and does not change production MH/t.</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!locked && !isView && (
          <button type="button" onClick={addDelayRow} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-black">
            Add Delay Event
          </button>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Docket Production Defaults</h2>
            <p className="text-sm text-slate-500 mt-1">
              Prestart, lunch and travel defaults used to calculate production hours.
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
            <div className="grid md:grid-cols-4 gap-4">
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

              <Input
                label="Prestart Minutes"
                type="number"
                value={mobilisationHours}
                onChange={setMobilisationHours}
                disabled={locked || isView}
              />
            </div>

            <Input
              label="Prestart Notes"
              value={mobilisationNotes}
              onChange={setMobilisationNotes}
              disabled={locked || isView}
            />

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

      <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Sign-Off & Upload</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Input label="BC Rep Name" value={bcRepName} onChange={setBcRepName} disabled={locked || isView} />
          <Input label="Client Rep Name" value={clientRepName} onChange={setClientRepName} disabled={locked || isView} />
          <Input label="Signed Date" type="date" value={signedDate} onChange={setSignedDate} disabled />
          <div>
            <label className="block text-sm font-medium mb-1">Upload Docket Scan</label>
            <input type="file" disabled={locked || isView} onChange={(e) => setDocketFile(e.target.files?.[0] || null)} className="border rounded-lg p-2 w-full disabled:bg-slate-100 bg-white" />
            {existingDocketFileUrl && (
              <a href={existingDocketFileUrl} target="_blank" rel="noreferrer" className="text-blue-600 text-sm font-medium mt-2 inline-block">
                Open current uploaded docket
              </a>
            )}
          </div>
        </div>
      </section>

      <div className="sticky bottom-4 z-10 flex gap-3 bg-white/90 backdrop-blur border border-slate-200 rounded-2xl p-3 shadow-lg w-fit">
        {!locked && !isView && (
          <button onClick={handleSubmit} disabled={saving} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60">
            {saving ? (mode === "create" ? "Saving..." : "Updating...") : mode === "create" ? "Save Daily Docket" : "Update Daily Docket"}
          </button>
        )}

        <button type="button" onClick={() => router.push(`/project/${projectId}/tower/${towerId}/dockets`)} className="border border-slate-300 bg-white px-6 py-3 rounded-xl hover:bg-slate-100">
          {locked || isView ? "Back" : "Cancel"}
        </button>
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

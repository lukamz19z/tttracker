import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

type DocketMode = "create" | "edit" | "view";
type RateType = "tonnage_rate" | "schedule_of_rates";
type DelayType =
  | "weather"
  | "lightning"
  | "toolbox"
  | "mobilisation"
  | "access"
  | "plant"
  | "materials"
  | "other";
type DelayScope = "entire_crew" | "selected_workers";
type DelayMode = "labour_only" | "labour_and_plant";

type ProfileRecord = {
  projectId?: string | null;
  projectName?: string | null;
  projectNumber?: string | null;
  crew?: string | null;
};

type Tower = {
  id: string;
  project_id: string;
  name: string | null;
  tower_number?: string | null;
  structure_number?: string | null;
  line: string | null;
  status: string | null;
  progress: number | null;
  extra_data: Record<string, unknown> | null;
};

type Crew = {
  id: string;
  crew_number: string | null;
  crew_name: string | null;
  leading_hand: string | null;
  active: boolean | null;
};

type Employee = {
  id: string;
  full_name: string;
  role: string | null;
  crew_id: string | null;
  active: boolean | null;
};

type Docket = {
  id: string;
  project_id: string;
  tower_id: string;
  docket_date: string | null;
  crew: string | null;
  leading_hand: string | null;
  weather: string | null;
  rate_type: string | null;
  assembly_percent: number | null;
  erection_percent: number | null;
  lunch_break_minutes: number | null;
  travel_in_minutes: number | null;
  travel_out_minutes: number | null;
  mobilisation_hours: number | null;
  mobilisation_notes: string | null;
  missing_items_bolts: string | null;
  delays_comments: string | null;
  raw_manhours: number | null;
  production_manhours: number | null;
  incident_occurred: boolean | null;
  incident_type: string | null;
  incident_notes: string | null;
  bc_rep_name: string | null;
  client_rep_name: string | null;
  signed_date: string | null;
  status?: string | null;
};

type LabourDb = {
  docket_id: string;
  worker_name: string | null;
  time_in: string | null;
  time_out: string | null;
  total_hours: number | null;
  lunch_minutes: number | null;
  travel_in_minutes: number | null;
  travel_out_minutes: number | null;
  mobilisation_hours: number | null;
  delay_hours: number | null;
  delay_reason: string | null;
  production_hours: number | null;
};

type ProgressDb = {
  docket_id: string;
  section?: string | null;
  section_label: string | null;
  assembled_qty: number | null;
  erected_qty: number | null;
};

type DelayDb = {
  docket_id: string;
  delay_type: string | null;
  delay_reason: string | null;
  delay_hours: number | null;
  applies_to: string | null;
  worker_names: string[] | null;
  delay_applies_mode?: string | null;
  plant_names?: string[] | null;
};

type PlantDb = {
  docket_id: string;
  plant_name: string | null;
  plant_type: string | null;
  asset_number: string | null;
  operator_name?: string | null;
  time_in: string | null;
  time_out: string | null;
  total_hours: number | null;
  notes: string | null;
};

type LabourRow = {
  worker_name: string;
  time_in: string;
  time_out: string;
  total_hours: string;
  lunch_minutes: string;
  travel_in_minutes: string;
  travel_out_minutes: string;
  mobilisation_minutes: string;
};

type ProgressRow = {
  section_label: string;
  assembled_qty: string;
  erected_qty: string;
};

type DelayRow = {
  ui_id: string;
  delay_type: DelayType;
  delay_reason: string;
  delay_hours: string;
  applies_to: DelayScope;
  worker_names: string[];
  delay_mode: DelayMode;
  plant_names: string[];
};

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

type Bundle = {
  docket: Docket;
  labour: LabourDb[];
  progress: ProgressDb[];
  delays: DelayDb[];
  plant: PlantDb[];
};

type FormState = {
  mode: DocketMode;
  docketId: string | null;
  towerId: string;
  docketDate: string;
  selectedCrewId: string;
  crewName: string;
  leadingHand: string;
  weather: string;
  rateType: RateType;
  status: string;
  lunchBreakMinutes: string;
  travelInMinutes: string;
  travelOutMinutes: string;
  mobilisationMinutes: string;
  mobilisationNotes: string;
  missingItemsBolts: string;
  delaysComments: string;
  incidentOccurred: boolean;
  incidentType: string;
  incidentNotes: string;
  bcRepName: string;
  clientRepName: string;
  signedDate: string;
  hasBodyExtension: boolean;
  labourRows: LabourRow[];
  progressRows: ProgressRow[];
  delayRows: DelayRow[];
  plantRows: PlantRow[];
};

const DEFAULT_PROGRESS: ProgressRow[] = [
  { section_label: "Legs", assembled_qty: "", erected_qty: "" },
  { section_label: "Body Extensions", assembled_qty: "", erected_qty: "" },
  { section_label: "Common Body", assembled_qty: "", erected_qty: "" },
  { section_label: "Superstructure", assembled_qty: "", erected_qty: "" },
  { section_label: "Crossarms", assembled_qty: "", erected_qty: "" },
];

const DELAY_OPTIONS: { value: DelayType; label: string }[] = [
  { value: "weather", label: "Weather" },
  { value: "lightning", label: "Lightning" },
  { value: "toolbox", label: "Toolbox" },
  { value: "mobilisation", label: "Mobilisation" },
  { value: "access", label: "Access" },
  { value: "plant", label: "Plant" },
  { value: "materials", label: "Materials" },
  { value: "other", label: "Other" },
];

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function today(): string {
  return localDateString();
}

function formatDate(value?: string | null): string {
  if (!value) return "No date";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const row = error as Record<string, unknown>;
    return [clean(row.message), clean(row.details), clean(row.hint)]
      .filter(Boolean)
      .join("\n");
  }
  return clean(error) || "Unknown error";
}

function calculateHours(timeIn: string, timeOut: string): string {
  if (!timeIn || !timeOut) return "";
  const [h1, m1] = timeIn.split(":").map(Number);
  const [h2, m2] = timeOut.split(":").map(Number);
  if ([h1, m1, h2, m2].some(Number.isNaN)) return "";
  let minutes = h2 * 60 + m2 - (h1 * 60 + m1);
  if (minutes < 0) minutes += 1440;
  return (minutes / 60).toFixed(2);
}

function normaliseName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function crewLabel(crew: Crew): string {
  return [crew.crew_number, crew.crew_name]
    .map(clean)
    .filter(Boolean)
    .join(" - ");
}

function towerLabel(tower: Tower): string {
  const number =
    clean(tower.tower_number) ||
    clean(tower.structure_number) ||
    clean(tower.name) ||
    "Unnamed Tower";
  return tower.line ? `${number} · ${tower.line}` : number;
}

function isSigned(docket: Docket): boolean {
  return Boolean(clean(docket.client_rep_name) && clean(docket.signed_date));
}

function docketStatus(docket: Docket): string {
  if (isSigned(docket)) return "Closed";
  if (clean(docket.status)) return clean(docket.status);
  if (clean(docket.bc_rep_name)) return "BC Signed";
  return "Draft";
}

function inferBodyExtension(tower: Tower | null): boolean {
  const extra = tower?.extra_data ?? {};
  for (const [key, value] of Object.entries(extra)) {
    const normalised = key.toLowerCase().replace(/[_\-.()/]+/g, " ");
    const relevant =
      (normalised.includes("body") &&
        (normalised.includes("ext") || normalised.includes("extension"))) ||
      normalised.trim() === "be";
    if (!relevant) continue;
    if (typeof value === "number") return value > 0;
    const text = clean(value).toLowerCase();
    if (["no", "false", "none", "0", "not required"].includes(text)) {
      return false;
    }
    if (text) return true;
  }
  return true;
}

function blankLabour(defaults?: {
  lunch?: string;
  travelIn?: string;
  travelOut?: string;
  mobilisation?: string;
}): LabourRow {
  return {
    worker_name: "",
    time_in: "",
    time_out: "",
    total_hours: "",
    lunch_minutes: defaults?.lunch ?? "",
    travel_in_minutes: defaults?.travelIn ?? "",
    travel_out_minutes: defaults?.travelOut ?? "",
    mobilisation_minutes: defaults?.mobilisation ?? "",
  };
}

function blankPlant(): PlantRow {
  return {
    plant_name: "",
    plant_type: "",
    asset_id: "",
    operator_name: "",
    time_in: "",
    time_out: "",
    total_hours: "",
    notes: "",
  };
}

function blankDelay(): DelayRow {
  return {
    ui_id: `delay-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    delay_type: "weather",
    delay_reason: "",
    delay_hours: "",
    applies_to: "entire_crew",
    worker_names: [],
    delay_mode: "labour_only",
    plant_names: [],
  };
}

function blankForm(towerId: string): FormState {
  return {
    mode: "create",
    docketId: null,
    towerId,
    docketDate: today(),
    selectedCrewId: "",
    crewName: "",
    leadingHand: "",
    weather: "",
    rateType: "tonnage_rate",
    status: "Draft",
    lunchBreakMinutes: "30",
    travelInMinutes: "",
    travelOutMinutes: "",
    mobilisationMinutes: "",
    mobilisationNotes: "",
    missingItemsBolts: "",
    delaysComments: "",
    incidentOccurred: false,
    incidentType: "",
    incidentNotes: "",
    bcRepName: "",
    clientRepName: "",
    signedDate: "",
    hasBodyExtension: true,
    labourRows: [blankLabour({ lunch: "30" })],
    progressRows: DEFAULT_PROGRESS.map((row) => ({ ...row })),
    delayRows: [],
    plantRows: [],
  };
}

function delayForWorker(row: LabourRow, delays: DelayRow[]): number {
  const worker = normaliseName(row.worker_name);
  if (!worker) return 0;
  return delays.reduce((sum, delay) => {
    if (delay.applies_to === "entire_crew") {
      return sum + toNumber(delay.delay_hours);
    }
    const applies = delay.worker_names.some(
      (name) => normaliseName(name) === worker,
    );
    return applies ? sum + toNumber(delay.delay_hours) : sum;
  }, 0);
}

function productionHours(row: LabourRow, delays: DelayRow[]): string {
  const raw = toNumber(row.total_hours);
  const lunch = toNumber(row.lunch_minutes) / 60;
  const travel =
    (toNumber(row.travel_in_minutes) + toNumber(row.travel_out_minutes)) / 60;
  const mobilisation = toNumber(row.mobilisation_minutes) / 60;
  const delay = delayForWorker(row, delays);
  return Math.max(0, raw - lunch - travel - mobilisation - delay).toFixed(2);
}

function progressTotals(form: FormState) {
  const rows = form.progressRows.filter(
    (row) =>
      form.hasBodyExtension ||
      row.section_label.toLowerCase() !== "body extensions",
  );
  if (!rows.length) return { assembly: 0, erection: 0, overall: 0 };
  const assembly = Math.round(
    rows.reduce(
      (sum, row) => sum + Math.max(0, Math.min(100, toNumber(row.assembled_qty))),
      0,
    ) / rows.length,
  );
  const erection = Math.round(
    rows.reduce(
      (sum, row) => sum + Math.max(0, Math.min(100, toNumber(row.erected_qty))),
      0,
    ) / rows.length,
  );
  return {
    assembly,
    erection,
    overall: Math.round(assembly * 0.5 + erection * 0.5),
  };
}

function plantDisplay(row: PlantRow): string {
  return (
    [row.plant_name, row.asset_id, row.plant_type]
      .map(clean)
      .filter(Boolean)
      .join(" · ") || "Plant / Vehicle"
  );
}

function dbLabour(row: LabourDb): LabourRow {
  return {
    worker_name: clean(row.worker_name),
    time_in: clean(row.time_in),
    time_out: clean(row.time_out),
    total_hours: row.total_hours == null ? "" : String(row.total_hours),
    lunch_minutes: row.lunch_minutes == null ? "" : String(row.lunch_minutes),
    travel_in_minutes:
      row.travel_in_minutes == null ? "" : String(row.travel_in_minutes),
    travel_out_minutes:
      row.travel_out_minutes == null ? "" : String(row.travel_out_minutes),
    mobilisation_minutes:
      row.mobilisation_hours == null ? "" : String(row.mobilisation_hours * 60),
  };
}

function dbProgress(row: ProgressDb): ProgressRow {
  return {
    section_label: clean(row.section_label) || clean(row.section) || "Section",
    assembled_qty: row.assembled_qty == null ? "" : String(row.assembled_qty),
    erected_qty: row.erected_qty == null ? "" : String(row.erected_qty),
  };
}

function dbDelay(row: DelayDb): DelayRow {
  return {
    ui_id: `delay-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    delay_type: (clean(row.delay_type) || "weather") as DelayType,
    delay_reason: clean(row.delay_reason),
    delay_hours: row.delay_hours == null ? "" : String(row.delay_hours),
    applies_to:
      clean(row.applies_to) === "selected_workers"
        ? "selected_workers"
        : "entire_crew",
    worker_names: Array.isArray(row.worker_names) ? row.worker_names : [],
    delay_mode:
      clean(row.delay_applies_mode) === "labour_and_plant"
        ? "labour_and_plant"
        : "labour_only",
    plant_names: Array.isArray(row.plant_names) ? row.plant_names : [],
  };
}

function dbPlant(row: PlantDb): PlantRow {
  return {
    plant_name: clean(row.plant_name),
    plant_type: clean(row.plant_type),
    asset_id: clean(row.asset_number),
    operator_name: clean(row.operator_name),
    time_in: clean(row.time_in),
    time_out: clean(row.time_out),
    total_hours: row.total_hours == null ? "" : String(row.total_hours),
    notes: clean(row.notes),
  };
}

export default function DailyDocketScreen() {
  const { profile } = useAuth();
  const profileRecord = profile as unknown as ProfileRecord | null;
  const projectId = clean(profileRecord?.projectId);
  const projectName = clean(profileRecord?.projectName);
  const projectNumber = clean(profileRecord?.projectNumber);

  const [towers, setTowers] = useState<Tower[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [selectedTowerId, setSelectedTowerId] = useState("");
  const [towerPickerOpen, setTowerPickerOpen] = useState(false);
  const [towerSearch, setTowerSearch] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prefilling, setPrefilling] = useState(false);

  const loadData = useCallback(
    async (showLoader = true) => {
      if (!projectId) {
        setLoading(false);
        return;
      }
      if (showLoader) setLoading(true);

      const [towerRes, crewRes, employeeRes, docketRes] = await Promise.all([
        supabase.from("towers").select("*").eq("project_id", projectId).order("name"),
        supabase
          .from("crews")
          .select("id, crew_number, crew_name, leading_hand, active")
          .order("crew_number"),
        supabase
          .from("employees")
          .select("id, full_name, role, crew_id, active")
          .order("full_name"),
        supabase
          .from("tower_daily_dockets")
          .select("*")
          .eq("project_id", projectId)
          .order("docket_date", { ascending: false }),
      ]);

      if (towerRes.error) Alert.alert("Could not load towers", errorMessage(towerRes.error));
      if (docketRes.error) Alert.alert("Could not load dockets", errorMessage(docketRes.error));

      const dockets = (docketRes.data ?? []) as Docket[];
      const ids = dockets.map((row) => row.id);
      let labour: LabourDb[] = [];
      let progress: ProgressDb[] = [];
      let delays: DelayDb[] = [];
      let plant: PlantDb[] = [];

      if (ids.length) {
        const [labourRes, progressRes, delayRes, plantRes] = await Promise.all([
          supabase.from("tower_docket_labour").select("*").in("docket_id", ids),
          supabase.from("tower_docket_progress").select("*").in("docket_id", ids),
          supabase.from("tower_docket_delays").select("*").in("docket_id", ids),
          supabase.from("tower_docket_plant").select("*").in("docket_id", ids),
        ]);
        labour = (labourRes.data ?? []) as LabourDb[];
        progress = (progressRes.data ?? []) as ProgressDb[];
        delays = (delayRes.data ?? []) as DelayDb[];
        plant = (plantRes.data ?? []) as PlantDb[];
      }

      const loadedTowers = (towerRes.data ?? []) as Tower[];
      setTowers(loadedTowers);
      setCrews(((crewRes.data ?? []) as Crew[]).filter((row) => row.active !== false));
      setEmployees(
        ((employeeRes.data ?? []) as Employee[]).filter((row) => row.active !== false),
      );
      setBundles(
        dockets.map((docket) => ({
          docket,
          labour: labour.filter((row) => row.docket_id === docket.id),
          progress: progress.filter((row) => row.docket_id === docket.id),
          delays: delays.filter((row) => row.docket_id === docket.id),
          plant: plant.filter((row) => row.docket_id === docket.id),
        })),
      );
      if (!selectedTowerId && loadedTowers.length) {
        setSelectedTowerId(loadedTowers[0].id);
      }
      if (showLoader) setLoading(false);
    },
    [projectId, selectedTowerId],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedTower = towers.find((row) => row.id === selectedTowerId) ?? null;

  const visibleTowers = useMemo(() => {
    const term = towerSearch.trim().toLowerCase();
    return towers.filter((tower) =>
      [towerLabel(tower), tower.status, tower.progress, tower.line]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [towers, towerSearch]);

  const visibleBundles = useMemo(() => {
    const term = search.trim().toLowerCase();
    return bundles.filter((bundle) => {
      if (bundle.docket.tower_id !== selectedTowerId) return false;
      return [
        bundle.docket.docket_date,
        bundle.docket.crew,
        bundle.docket.leading_hand,
        bundle.docket.weather,
        docketStatus(bundle.docket),
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [bundles, selectedTowerId, search]);

  const summary = useMemo(
    () =>
      visibleBundles.reduce(
        (acc, bundle) => {
          acc.count += 1;
          acc.raw +=
            bundle.docket.raw_manhours ??
            bundle.labour.reduce((sum, row) => sum + toNumber(row.total_hours), 0);
          acc.production +=
            bundle.docket.production_manhours ??
            bundle.labour.reduce(
              (sum, row) => sum + toNumber(row.production_hours),
              0,
            );
          return acc;
        },
        { count: 0, raw: 0, production: 0 },
      ),
    [visibleBundles],
  );

  async function refresh() {
    setRefreshing(true);
    await loadData(false);
    setRefreshing(false);
  }

  function applyCrew(target: FormState, crew: Crew) {
    target.selectedCrewId = crew.id;
    target.crewName = clean(crew.crew_number) || clean(crew.crew_name);
    target.leadingHand = clean(crew.leading_hand);
    const members = employees.filter((employee) => employee.crew_id === crew.id);
    if (members.length) {
      target.labourRows = members.map((employee) => ({
        ...blankLabour({
          lunch: target.lunchBreakMinutes,
          travelIn: target.travelInMinutes,
          travelOut: target.travelOutMinutes,
          mobilisation: target.mobilisationMinutes,
        }),
        worker_name: employee.full_name,
      }));
    }
  }

  async function loadCrewAssets(crew: Crew): Promise<PlantRow[]> {
    const [plantRes, vehicleRes] = await Promise.all([
      supabase.from("plant_assets").select("*"),
      supabase.from("vehicle_assets").select("*"),
    ]);
    const accepted = [crew.id, clean(crew.crew_number), clean(crew.crew_name)]
      .map((value) => value.toLowerCase())
      .filter(Boolean);

    function belongs(row: Record<string, unknown>) {
      return [row.crew_id, row.crew, row.crew_number, row.crew_name, row.assigned_crew_id].some(
        (value) => {
          const text = clean(value).toLowerCase();
          return accepted.some(
            (candidate) => text === candidate || Boolean(candidate && text.includes(candidate)),
          );
        },
      );
    }

    const rows: PlantRow[] = [];
    for (const row of (plantRes.data ?? []) as Record<string, unknown>[]) {
      if (!belongs(row)) continue;
      rows.push({
        plant_name: [clean(row.asset_id), clean(row.make), clean(row.model)]
          .filter(Boolean)
          .join(" - "),
        plant_type: clean(row.plant_type) || "Plant",
        asset_id: clean(row.asset_id),
        operator_name: "",
        time_in: "",
        time_out: "",
        total_hours: "",
        notes: "Auto-added from crew allocation",
      });
    }
    for (const row of (vehicleRes.data ?? []) as Record<string, unknown>[]) {
      if (!belongs(row)) continue;
      rows.push({
        plant_name: [clean(row.vehicle_id), clean(row.make), clean(row.model)]
          .filter(Boolean)
          .join(" - "),
        plant_type: clean(row.category) || "Vehicle",
        asset_id: clean(row.vehicle_id) || clean(row.vehicle_rego) || clean(row.rego),
        operator_name: "",
        time_in: "",
        time_out: "",
        total_hours: "",
        notes: "Auto-added from crew allocation",
      });
    }
    return rows;
  }

  function openCreate() {
    if (!selectedTower) {
      Alert.alert("Select a tower", "Choose a tower first.");
      return;
    }
    const next = blankForm(selectedTower.id);
    next.hasBodyExtension = inferBodyExtension(selectedTower);
    const profileCrew = clean(profileRecord?.crew);
    const matchedCrew = crews.find(
      (crew) =>
        clean(crew.crew_number) === profileCrew || clean(crew.crew_name) === profileCrew,
    );
    if (matchedCrew) applyCrew(next, matchedCrew);
    setForm(next);
  }

  async function selectCrew(crewId: string) {
    const crew = crews.find((row) => row.id === crewId);
    if (!crew || !form) return;
    const updated = { ...form };
    applyCrew(updated, crew);
    updated.plantRows = await loadCrewAssets(crew);
    setForm(updated);
  }

  function openBundle(bundle: Bundle, mode: DocketMode) {
    const docket = bundle.docket;
    const tower = towers.find((row) => row.id === docket.tower_id) ?? null;
    const matchedCrew = crews.find(
      (crew) =>
        clean(crew.crew_number) === clean(docket.crew) ||
        clean(crew.crew_name) === clean(docket.crew),
    );
    setForm({
      mode,
      docketId: docket.id,
      towerId: docket.tower_id,
      docketDate: clean(docket.docket_date),
      selectedCrewId: matchedCrew?.id ?? "",
      crewName: clean(docket.crew),
      leadingHand: clean(docket.leading_hand),
      weather: clean(docket.weather),
      rateType:
        docket.rate_type === "schedule_of_rates" ? "schedule_of_rates" : "tonnage_rate",
      status: docketStatus(docket),
      lunchBreakMinutes:
        docket.lunch_break_minutes == null ? "" : String(docket.lunch_break_minutes),
      travelInMinutes:
        docket.travel_in_minutes == null ? "" : String(docket.travel_in_minutes),
      travelOutMinutes:
        docket.travel_out_minutes == null ? "" : String(docket.travel_out_minutes),
      mobilisationMinutes:
        docket.mobilisation_hours == null ? "" : String(docket.mobilisation_hours * 60),
      mobilisationNotes: clean(docket.mobilisation_notes),
      missingItemsBolts: clean(docket.missing_items_bolts),
      delaysComments: clean(docket.delays_comments),
      incidentOccurred: Boolean(docket.incident_occurred),
      incidentType: clean(docket.incident_type),
      incidentNotes: clean(docket.incident_notes),
      bcRepName: clean(docket.bc_rep_name),
      clientRepName: clean(docket.client_rep_name),
      signedDate: clean(docket.signed_date),
      hasBodyExtension: inferBodyExtension(tower),
      labourRows: bundle.labour.length ? bundle.labour.map(dbLabour) : [blankLabour()],
      progressRows: bundle.progress.length
        ? bundle.progress.map(dbProgress)
        : DEFAULT_PROGRESS.map((row) => ({ ...row })),
      delayRows: bundle.delays.map(dbDelay),
      plantRows: bundle.plant.map(dbPlant),
    });
  }

  function updateLabour(index: number, key: keyof LabourRow, value: string) {
    setForm((current) => {
      if (!current) return current;
      const rows = current.labourRows.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const next = { ...row, [key]: value };
        if (key === "time_in" || key === "time_out") {
          next.total_hours = calculateHours(next.time_in, next.time_out) || next.total_hours;
        }
        return next;
      });
      return { ...current, labourRows: rows };
    });
  }

  function updateProgress(index: number, key: keyof ProgressRow, value: string) {
    setForm((current) => {
      if (!current) return current;
      const nextValue =
        key === "section_label"
          ? value
          : value === ""
            ? ""
            : String(Math.max(0, Math.min(100, Number(value))));
      return {
        ...current,
        progressRows: current.progressRows.map((row, rowIndex) =>
          rowIndex === index ? { ...row, [key]: nextValue } : row,
        ),
      };
    });
  }

  function updatePlant(index: number, key: keyof PlantRow, value: string) {
    setForm((current) => {
      if (!current) return current;
      const rows = current.plantRows.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const next = { ...row, [key]: value };
        if (key === "time_in" || key === "time_out") {
          next.total_hours = calculateHours(next.time_in, next.time_out) || next.total_hours;
        }
        return next;
      });
      return { ...current, plantRows: rows };
    });
  }

  function updateDelay(index: number, patch: Partial<DelayRow>) {
    setForm((current) =>
      current
        ? {
            ...current,
            delayRows: current.delayRows.map((row, rowIndex) =>
              rowIndex === index ? { ...row, ...patch } : row,
            ),
          }
        : current,
    );
  }

  async function prefillPreviousDay() {
    if (!form || !projectId) return;
    setPrefilling(true);
    try {
      let query = supabase
        .from("tower_daily_dockets")
        .select("*")
        .eq("project_id", projectId)
        .eq("tower_id", form.towerId)
        .lt("docket_date", form.docketDate || today())
        .order("docket_date", { ascending: false })
        .limit(1);

      if (form.crewName.trim()) {
        query = query.eq("crew", form.crewName.trim());
      }

      let { data: docketRows, error: docketError } = await query;

      if (!docketError && (!docketRows || docketRows.length === 0) && form.crewName.trim()) {
        const fallback = await supabase
          .from("tower_daily_dockets")
          .select("*")
          .eq("project_id", projectId)
          .eq("tower_id", form.towerId)
          .lt("docket_date", form.docketDate || today())
          .order("docket_date", { ascending: false })
          .limit(1);
        docketRows = fallback.data;
        docketError = fallback.error;
      }

      if (docketError) throw docketError;
      const previous = (docketRows?.[0] ?? null) as Docket | null;
      if (!previous) {
        Alert.alert(
          "No previous docket",
          "No earlier docket was found for this tower before the selected date.",
        );
        return;
      }

      const [labourRes, progressRes, delayRes, plantRes] = await Promise.all([
        supabase.from("tower_docket_labour").select("*").eq("docket_id", previous.id),
        supabase.from("tower_docket_progress").select("*").eq("docket_id", previous.id),
        supabase.from("tower_docket_delays").select("*").eq("docket_id", previous.id),
        supabase.from("tower_docket_plant").select("*").eq("docket_id", previous.id),
      ]);

      const firstError = [labourRes.error, progressRes.error, delayRes.error, plantRes.error].find(Boolean);
      if (firstError) throw firstError;

      const copiedLabour = ((labourRes.data ?? []) as LabourDb[]).map(dbLabour).map((row) => ({
        ...row,
        lunch_minutes:
          previous.lunch_break_minutes == null
            ? row.lunch_minutes
            : String(previous.lunch_break_minutes),
        travel_in_minutes:
          previous.travel_in_minutes == null
            ? row.travel_in_minutes
            : String(previous.travel_in_minutes),
        travel_out_minutes:
          previous.travel_out_minutes == null
            ? row.travel_out_minutes
            : String(previous.travel_out_minutes),
        mobilisation_minutes:
          previous.mobilisation_hours == null
            ? row.mobilisation_minutes
            : String(previous.mobilisation_hours * 60),
      }));

      const matchedCrew = crews.find(
        (crew) =>
          clean(crew.crew_number) === clean(previous.crew) ||
          clean(crew.crew_name) === clean(previous.crew),
      );

      setForm((current) => {
        if (!current) return current;
        return {
          ...current,
          selectedCrewId: matchedCrew?.id ?? current.selectedCrewId,
          crewName: clean(previous.crew) || current.crewName,
          leadingHand: clean(previous.leading_hand) || current.leadingHand,
          weather: "",
          rateType:
            previous.rate_type === "schedule_of_rates"
              ? "schedule_of_rates"
              : "tonnage_rate",
          lunchBreakMinutes:
            previous.lunch_break_minutes == null
              ? current.lunchBreakMinutes
              : String(previous.lunch_break_minutes),
          travelInMinutes:
            previous.travel_in_minutes == null
              ? current.travelInMinutes
              : String(previous.travel_in_minutes),
          travelOutMinutes:
            previous.travel_out_minutes == null
              ? current.travelOutMinutes
              : String(previous.travel_out_minutes),
          mobilisationMinutes:
            previous.mobilisation_hours == null
              ? current.mobilisationMinutes
              : String(previous.mobilisation_hours * 60),
          mobilisationNotes: clean(previous.mobilisation_notes),
          labourRows: copiedLabour.length
            ? copiedLabour
            : current.labourRows,
          progressRows: ((progressRes.data ?? []) as ProgressDb[]).length
            ? ((progressRes.data ?? []) as ProgressDb[]).map(dbProgress)
            : current.progressRows,
          plantRows: ((plantRes.data ?? []) as PlantDb[]).map(dbPlant),
          delayRows: [],
          missingItemsBolts: "",
          delaysComments: "",
          incidentOccurred: false,
          incidentType: "",
          incidentNotes: "",
          bcRepName: "",
          clientRepName: "",
          signedDate: "",
          status: "Draft",
        };
      });

      Alert.alert(
        "Previous day loaded",
        `${formatDate(previous.docket_date)} was copied. The selected docket date was kept as ${formatDate(form.docketDate)}.`,
      );
    } catch (error) {
      Alert.alert("Could not prefill previous day", errorMessage(error));
    } finally {
      setPrefilling(false);
    }
  }

  function computed(formState: FormState) {
    const labour = formState.labourRows.map((row) => ({
      ...row,
      production_hours: productionHours(row, formState.delayRows),
      delay_hours: delayForWorker(row, formState.delayRows),
    }));
    return {
      labour,
      progress: progressTotals(formState),
      raw: labour.reduce((sum, row) => sum + toNumber(row.total_hours), 0),
      production: labour.reduce(
        (sum, row) => sum + toNumber(row.production_hours),
        0,
      ),
    };
  }

  async function recalcTower(towerId: string) {
    const { data, error } = await supabase
      .from("tower_daily_dockets")
      .select("assembly_percent, erection_percent")
      .eq("tower_id", towerId);
    if (error) throw error;
    const progress = (data ?? []).reduce((current, row) => {
      const overall = Math.round(
        toNumber(row.assembly_percent) * 0.5 + toNumber(row.erection_percent) * 0.5,
      );
      return Math.max(current, overall);
    }, 0);
    const status = progress >= 100 ? "Complete" : progress > 0 ? "In Progress" : "Not Started";
    const { error: updateError } = await supabase
      .from("towers")
      .update({ progress, status, updated_at: new Date().toISOString() })
      .eq("id", towerId);
    if (updateError) throw updateError;
  }

  async function saveDocket() {
    if (!form || !projectId) return;
    if (!form.docketDate) {
      Alert.alert("Date required", "Enter the docket date.");
      return;
    }
    if (!form.leadingHand.trim()) {
      Alert.alert("Leading Hand required", "Enter the leading hand.");
      return;
    }
    const names = form.labourRows.map((row) => normaliseName(row.worker_name)).filter(Boolean);
    if (new Set(names).size !== names.length) {
      Alert.alert("Duplicate workers", "Each worker can only appear once in the docket.");
      return;
    }
    if (form.incidentOccurred && (!form.incidentType || !form.incidentNotes.trim())) {
      Alert.alert("Incident details required", "Select an incident type and enter notes.");
      return;
    }

    setSaving(true);
    try {
      const values = computed(form);
      const payload = {
        project_id: projectId,
        tower_id: form.towerId,
        docket_date: form.docketDate,
        crew: form.crewName.trim() || null,
        leading_hand: form.leadingHand.trim(),
        weather: form.weather.trim() || null,
        rate_type: form.rateType,
        assembly_percent: values.progress.assembly,
        erection_percent: values.progress.erection,
        weather_delay_hours: form.delayRows
          .filter((row) => row.delay_type === "weather")
          .reduce((sum, row) => sum + toNumber(row.delay_hours), 0),
        lightning_delay_hours: form.delayRows
          .filter((row) => row.delay_type === "lightning")
          .reduce((sum, row) => sum + toNumber(row.delay_hours), 0),
        toolbox_delay_hours: form.delayRows
          .filter((row) => row.delay_type === "toolbox")
          .reduce((sum, row) => sum + toNumber(row.delay_hours), 0),
        other_delay_hours: form.delayRows
          .filter((row) => row.delay_type === "other")
          .reduce((sum, row) => sum + toNumber(row.delay_hours), 0),
        other_delay_reason:
          form.delayRows
            .filter((row) => row.delay_type === "other")
            .map((row) => row.delay_reason)
            .filter(Boolean)
            .join("; ") || null,
        delays_comments: form.delaysComments.trim() || null,
        missing_items_bolts: form.missingItemsBolts.trim() || null,
        lunch_break_minutes: toNumber(form.lunchBreakMinutes),
        travel_in_minutes: toNumber(form.travelInMinutes),
        travel_out_minutes: toNumber(form.travelOutMinutes),
        mobilisation_hours: toNumber(form.mobilisationMinutes) / 60,
        mobilisation_notes: form.mobilisationNotes.trim() || null,
        raw_manhours: values.raw,
        production_manhours: values.production,
        incident_occurred: form.incidentOccurred,
        incident_type: form.incidentOccurred ? form.incidentType : null,
        incident_notes: form.incidentOccurred ? form.incidentNotes.trim() : null,
        bc_rep_name: form.bcRepName.trim() || null,
        client_rep_name: form.clientRepName.trim() || null,
        signed_date: form.signedDate || null,
        status: form.status,
        updated_at: new Date().toISOString(),
      };

      let docketId = form.docketId;
      if (form.mode === "create") {
        const { data, error } = await supabase
          .from("tower_daily_dockets")
          .insert(payload)
          .select("id")
          .single();
        if (error || !data) throw error;
        docketId = data.id;
      } else {
        const currentBundle = bundles.find((bundle) => bundle.docket.id === form.docketId);
        if (currentBundle && isSigned(currentBundle.docket)) {
          throw new Error("This docket is client signed and cannot be edited.");
        }
        const { error } = await supabase
          .from("tower_daily_dockets")
          .update(payload)
          .eq("id", form.docketId);
        if (error) throw error;
      }
      if (!docketId) throw new Error("Missing docket ID.");

      await Promise.all([
        supabase.from("tower_docket_labour").delete().eq("docket_id", docketId),
        supabase.from("tower_docket_progress").delete().eq("docket_id", docketId),
        supabase.from("tower_docket_delays").delete().eq("docket_id", docketId),
        supabase.from("tower_docket_plant").delete().eq("docket_id", docketId),
      ]);

      const labourPayload = values.labour
        .filter((row) => row.worker_name.trim())
        .map((row) => ({
          docket_id: docketId,
          worker_name: row.worker_name.trim(),
          time_in: row.time_in || null,
          time_out: row.time_out || null,
          total_hours: toNumber(row.total_hours),
          lunch_minutes: toNumber(row.lunch_minutes),
          travel_in_minutes: toNumber(row.travel_in_minutes),
          travel_out_minutes: toNumber(row.travel_out_minutes),
          mobilisation_hours: toNumber(row.mobilisation_minutes) / 60,
          delay_hours: toNumber(row.delay_hours),
          delay_reason: null,
          production_hours: toNumber(row.production_hours),
        }));

      const progressPayload = form.progressRows.map((row) => {
        const bodyExtension = row.section_label.toLowerCase() === "body extensions";
        return {
          docket_id: docketId,
          section: row.section_label,
          section_label: row.section_label,
          assembled_qty:
            !form.hasBodyExtension && bodyExtension ? 0 : toNumber(row.assembled_qty),
          erected_qty:
            !form.hasBodyExtension && bodyExtension ? 0 : toNumber(row.erected_qty),
        };
      });

      const delayPayload = form.delayRows
        .filter((row) => toNumber(row.delay_hours) > 0 || row.delay_reason.trim())
        .map((row) => ({
          docket_id: docketId,
          delay_type: row.delay_type,
          delay_reason: row.delay_reason.trim() || null,
          delay_hours: toNumber(row.delay_hours),
          applies_to: row.applies_to,
          worker_names: row.applies_to === "selected_workers" ? row.worker_names : [],
          delay_applies_mode: row.delay_mode,
          plant_names: row.delay_mode === "labour_and_plant" ? row.plant_names : [],
        }));

      const plantPayload = form.plantRows
        .filter((row) => row.plant_name.trim() || row.asset_id.trim() || row.plant_type.trim())
        .map((row) => ({
          docket_id: docketId,
          plant_name: row.plant_name.trim() || null,
          plant_type: row.plant_type.trim() || null,
          asset_number: row.asset_id.trim() || null,
          operator_name: row.operator_name.trim() || null,
          time_in: form.rateType === "schedule_of_rates" ? row.time_in || null : null,
          time_out: form.rateType === "schedule_of_rates" ? row.time_out || null : null,
          total_hours:
            form.rateType === "schedule_of_rates" ? toNumber(row.total_hours) : 0,
          notes: row.notes.trim() || null,
        }));

      const results = await Promise.all([
        labourPayload.length
          ? supabase.from("tower_docket_labour").insert(labourPayload)
          : Promise.resolve({ error: null }),
        progressPayload.length
          ? supabase.from("tower_docket_progress").insert(progressPayload)
          : Promise.resolve({ error: null }),
        delayPayload.length
          ? supabase.from("tower_docket_delays").insert(delayPayload)
          : Promise.resolve({ error: null }),
        plantPayload.length
          ? supabase.from("tower_docket_plant").insert(plantPayload)
          : Promise.resolve({ error: null }),
      ]);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;

      await recalcTower(form.towerId);
      setForm(null);
      setSelectedTowerId(form.towerId);
      await loadData(false);
      Alert.alert(
        form.mode === "create" ? "Daily docket saved" : "Daily docket updated",
        `${formatDate(form.docketDate)} · Crew ${form.crewName || "—"}`,
      );
    } catch (error) {
      Alert.alert("Could not save daily docket", errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function deleteDocket(bundle: Bundle) {
    if (isSigned(bundle.docket)) {
      Alert.alert("Docket locked", "Client-signed dockets cannot be deleted.");
      return;
    }
    Alert.alert(
      "Delete daily docket?",
      "This removes the docket and its linked labour, progress, delay and plant rows.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void performDelete(bundle),
        },
      ],
    );
  }

  async function performDelete(bundle: Bundle) {
    try {
      await Promise.all([
        supabase.from("tower_docket_labour").delete().eq("docket_id", bundle.docket.id),
        supabase.from("tower_docket_progress").delete().eq("docket_id", bundle.docket.id),
        supabase.from("tower_docket_delays").delete().eq("docket_id", bundle.docket.id),
        supabase.from("tower_docket_plant").delete().eq("docket_id", bundle.docket.id),
      ]);
      const { error } = await supabase
        .from("tower_daily_dockets")
        .delete()
        .eq("id", bundle.docket.id);
      if (error) throw error;
      await recalcTower(bundle.docket.tower_id);
      await loadData(false);
    } catch (error) {
      Alert.alert("Could not delete docket", errorMessage(error));
    }
  }

  function renderDocket({ item }: { item: Bundle }) {
    const progress = Math.round(
      toNumber(item.docket.assembly_percent) * 0.5 +
        toNumber(item.docket.erection_percent) * 0.5,
    );
    const raw =
      item.docket.raw_manhours ??
      item.labour.reduce((sum, row) => sum + toNumber(row.total_hours), 0);
    const production =
      item.docket.production_manhours ??
      item.labour.reduce((sum, row) => sum + toNumber(row.production_hours), 0);
    const closed = isSigned(item.docket);

    return (
      <View style={styles.docketCard}>
        <Pressable onPress={() => openBundle(item, "view")}>
          <View style={styles.docketTop}>
            <View style={styles.docketText}>
              <Text style={styles.docketDate}>{formatDate(item.docket.docket_date)}</Text>
              <Text style={styles.docketMeta}>
                {item.docket.leading_hand || "No leading hand"} · Crew {item.docket.crew || "—"}
              </Text>
            </View>
            <StatusPill label={docketStatus(item.docket)} />
          </View>
          <View style={styles.progressLine}>
            <View style={styles.progressTextRow}>
              <Text style={styles.progressLabel}>Progress</Text>
              <Text style={styles.progressValue}>{progress}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, progress))}%` }]} />
            </View>
          </View>
          <View style={styles.metricRow}>
            <Metric label="Workers" value={String(item.labour.length)} />
            <Metric label="Raw" value={raw.toFixed(1)} />
            <Metric label="Prod" value={production.toFixed(1)} />
          </View>
        </Pressable>
        <View style={styles.cardActions}>
          <ActionButton icon="eye-outline" label="View" onPress={() => openBundle(item, "view")} />
          {!closed ? (
            <ActionButton
              icon="create-outline"
              label="Edit"
              primary
              onPress={() => openBundle(item, "edit")}
            />
          ) : null}
          {!closed ? (
            <Pressable style={styles.deleteButton} onPress={() => void deleteDocket(item)}>
              <Ionicons name="trash-outline" size={18} color="#BE123C" />
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading daily dockets…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Daily Dockets</Text>
              <Text style={styles.subtitle}>
                {projectNumber ? `${projectNumber} · ${projectName}` : projectName || "No project selected"}
              </Text>
            </View>
            <Pressable style={styles.addButton} onPress={openCreate}>
              <Ionicons name="add" size={23} color="#FFFFFF" />
            </Pressable>
            <Pressable style={styles.refreshButton} onPress={() => void refresh()}>
              {refreshing ? (
                <ActivityIndicator size="small" color="#334155" />
              ) : (
                <Ionicons name="refresh" size={20} color="#334155" />
              )}
            </Pressable>
          </View>
        </View>

        {!projectId ? (
          <Empty title="No project selected" text="Select a project from Home first." />
        ) : (
          <FlatList
            data={visibleBundles}
            keyExtractor={(item) => item.docket.id}
            renderItem={renderDocket}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
            }
            ListHeaderComponent={
              <View>
                <Pressable style={styles.towerSelector} onPress={() => setTowerPickerOpen(true)}>
                  <View style={styles.towerText}>
                    <Text style={styles.towerLabel}>SELECTED TOWER</Text>
                    <Text style={styles.towerValue}>
                      {selectedTower ? towerLabel(selectedTower) : "Choose a tower"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={19} color="#64748B" />
                </Pressable>
                <View style={styles.summaryGrid}>
                  <Summary label="Dockets" value={String(summary.count)} />
                  <Summary label="Raw Hrs" value={summary.raw.toFixed(1)} />
                  <Summary label="Prod Hrs" value={summary.production.toFixed(1)} />
                </View>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={18} color="#64748B" />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    style={styles.searchInput}
                    placeholder="Search dockets…"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>
            }
            ListEmptyComponent={
              <Empty title="No dockets for this tower" text="Tap + to create the first docket." />
            }
          />
        )}

        <TowerPicker
          visible={towerPickerOpen}
          towers={visibleTowers}
          search={towerSearch}
          onSearch={setTowerSearch}
          onClose={() => setTowerPickerOpen(false)}
          onSelect={(tower) => {
            setSelectedTowerId(tower.id);
            setTowerPickerOpen(false);
            setSearch("");
          }}
        />

        <DocketEditor
          form={form}
          tower={towers.find((row) => row.id === form?.towerId) ?? null}
          crews={crews}
          saving={saving}
          prefilling={prefilling}
          onClose={() => setForm(null)}
          onChange={setForm}
          onSelectCrew={(crewId) => void selectCrew(crewId)}
          onPrefill={() => void prefillPreviousDay()}
          onUpdateLabour={updateLabour}
          onUpdateProgress={updateProgress}
          onUpdatePlant={updatePlant}
          onUpdateDelay={updateDelay}
          onSave={() => void saveDocket()}
        />
      </View>
    </SafeAreaView>
  );
}

function DocketEditor({
  form,
  tower,
  crews,
  saving,
  prefilling,
  onClose,
  onChange,
  onSelectCrew,
  onPrefill,
  onUpdateLabour,
  onUpdateProgress,
  onUpdatePlant,
  onUpdateDelay,
  onSave,
}: {
  form: FormState | null;
  tower: Tower | null;
  crews: Crew[];
  saving: boolean;
  prefilling: boolean;
  onClose: () => void;
  onChange: React.Dispatch<React.SetStateAction<FormState | null>>;
  onSelectCrew: (crewId: string) => void;
  onPrefill: () => void;
  onUpdateLabour: (index: number, key: keyof LabourRow, value: string) => void;
  onUpdateProgress: (index: number, key: keyof ProgressRow, value: string) => void;
  onUpdatePlant: (index: number, key: keyof PlantRow, value: string) => void;
  onUpdateDelay: (index: number, patch: Partial<DelayRow>) => void;
  onSave: () => void;
}) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    details: true,
    progress: true,
    labour: true,
    defaults: false,
    delays: false,
    plant: false,
    safety: false,
    signoff: false,
  });
  const [bulkIn, setBulkIn] = useState("");
  const [bulkOut, setBulkOut] = useState("");

  if (!form) return null;

  const activeForm: FormState = form;
  const readOnly = activeForm.mode === "view" || Boolean(activeForm.clientRepName && activeForm.signedDate);
  const values = form.labourRows.map((row) => ({
    ...row,
    delay_hours: delayForWorker(row, form.delayRows),
    production_hours: productionHours(row, form.delayRows),
  }));
  const totals = {
    workers: values.filter((row) => row.worker_name.trim()).length,
    raw: values.reduce((sum, row) => sum + toNumber(row.total_hours), 0),
    production: values.reduce((sum, row) => sum + toNumber(row.production_hours), 0),
    delay: values.reduce((sum, row) => sum + toNumber(row.delay_hours), 0),
  };
  const progress = progressTotals(form);
  const workerNames = form.labourRows.map((row) => row.worker_name.trim()).filter(Boolean);
  const plantNames = form.plantRows.map(plantDisplay);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    onChange((current) => (current ? { ...current, [key]: value } : current));
  }

  function toggleSection(key: string) {
    setOpenSections((current) => ({ ...current, [key]: !current[key] }));
  }

  function addLabour() {
    update("labourRows", [
      ...activeForm.labourRows,
      blankLabour({
        lunch: activeForm.lunchBreakMinutes,
        travelIn: activeForm.travelInMinutes,
        travelOut: activeForm.travelOutMinutes,
        mobilisation: activeForm.mobilisationMinutes,
      }),
    ]);
  }

  function removeLabour(index: number) {
    const rows = activeForm.labourRows.filter((_, rowIndex) => rowIndex !== index);
    update("labourRows", rows.length ? rows : [blankLabour()]);
  }

  function applyTimesToAll() {
    update(
      "labourRows",
      activeForm.labourRows.map((row) => {
        const timeIn = bulkIn || row.time_in;
        const timeOut = bulkOut || row.time_out;
        return {
          ...row,
          time_in: timeIn,
          time_out: timeOut,
          total_hours: calculateHours(timeIn, timeOut) || row.total_hours,
        };
      }),
    );
  }

  function applyDefaultsToAll() {
    update(
      "labourRows",
      activeForm.labourRows.map((row) => ({
        ...row,
        lunch_minutes: activeForm.lunchBreakMinutes,
        travel_in_minutes: activeForm.travelInMinutes,
        travel_out_minutes: activeForm.travelOutMinutes,
        mobilisation_minutes: activeForm.mobilisationMinutes,
      })),
    );
  }

  function addDelay() {
    update("delayRows", [...activeForm.delayRows, blankDelay()]);
  }

  function addPlant() {
    update("plantRows", [...activeForm.plantRows, blankPlant()]);
  }

  function toggleWorker(index: number, name: string) {
    const row = activeForm.delayRows[index];
    const exists = row.worker_names.some(
      (worker) => normaliseName(worker) === normaliseName(name),
    );
    onUpdateDelay(index, {
      worker_names: exists
        ? row.worker_names.filter(
            (worker) => normaliseName(worker) !== normaliseName(name),
          )
        : [...row.worker_names, name],
    });
  }

  function togglePlant(index: number, name: string) {
    const row = activeForm.delayRows[index];
    const exists = row.plant_names.some(
      (plant) => normaliseName(plant) === normaliseName(name),
    );
    onUpdateDelay(index, {
      plant_names: exists
        ? row.plant_names.filter(
            (plant) => normaliseName(plant) !== normaliseName(name),
          )
        : [...row.plant_names, name],
    });
  }

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalHeader}>
            <Pressable style={styles.backButton} onPress={onClose}>
              <Ionicons name="arrow-back" size={22} color="#334155" />
            </Pressable>
            <View style={styles.modalTitleWrap}>
              <Text style={styles.modalTitle}>
                {form.mode === "create" ? "New Daily Docket" : form.mode === "edit" ? "Edit Docket" : "View Docket"}
              </Text>
              <Text style={styles.modalSubtitle}>{tower ? towerLabel(tower) : "Tower docket"}</Text>
            </View>
            {!readOnly ? (
              <Pressable style={[styles.headerSave, saving && styles.disabled]} disabled={saving} onPress={onSave}>
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="save-outline" size={20} color="#FFFFFF" />}
              </Pressable>
            ) : (
              <View style={styles.modalSpacer} />
            )}
          </View>

          <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
            {form.mode === "create" && !readOnly ? (
              <Pressable
                style={[styles.prefillButton, prefilling && styles.disabled]}
                disabled={prefilling}
                onPress={onPrefill}
              >
                {prefilling ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="copy-outline" size={18} color="#FFFFFF" />
                )}
                <Text style={styles.prefillText}>
                  {prefilling ? "Loading previous docket…" : "Copy Previous Docket"}
                </Text>
              </Pressable>
            ) : null}

            <View style={styles.quickSummary}>
              <Kpi label="Workers" value={String(totals.workers)} />
              <Kpi label="Raw" value={totals.raw.toFixed(1)} />
              <Kpi label="Prod" value={totals.production.toFixed(1)} />
              <Kpi label="Progress" value={`${progress.overall}%`} />
            </View>

            <CollapsibleSection title="Docket details" open={openSections.details} onToggle={() => toggleSection("details")}>
              <View style={styles.twoColumns}>
                <SmallField label="Date" value={form.docketDate} onChangeText={(value) => update("docketDate", value)} editable={!readOnly} keyboard="default" />
                <SmallField label="Weather" value={form.weather} onChangeText={(value) => update("weather", value)} editable={!readOnly} keyboard="default" />
              </View>
              <SelectButtons
                label="Crew"
                value={form.selectedCrewId}
                options={crews.map((crew) => ({ value: crew.id, label: crewLabel(crew) }))}
                onChange={onSelectCrew}
                disabled={readOnly}
              />
              <Field label="Leading Hand" value={form.leadingHand} onChangeText={(value) => update("leadingHand", value)} editable={!readOnly} />
              <Choice
                label="Rate"
                value={form.rateType}
                options={[
                  ["tonnage_rate", "Tonnage"],
                  ["schedule_of_rates", "Schedule of Rates"],
                ]}
                onChange={(value) => update("rateType", value as RateType)}
                disabled={readOnly}
              />
              <Choice
                label="Status"
                value={form.status}
                options={[["Draft", "Draft"], ["Submitted", "Submitted"]]}
                onChange={(value) => update("status", value)}
                disabled={readOnly}
              />
            </CollapsibleSection>

            <CollapsibleSection title="Tower progress" open={openSections.progress} onToggle={() => toggleSection("progress")} badge={`${progress.overall}%`}>
              {form.progressRows
                .filter((row) => form.hasBodyExtension || row.section_label.toLowerCase() !== "body extensions")
                .map((row) => {
                  const index = form.progressRows.findIndex((item) => item.section_label === row.section_label);
                  return (
                    <View key={row.section_label} style={styles.compactProgressRow}>
                      <Text style={styles.compactProgressLabel}>{row.section_label}</Text>
                      <CompactPercent label="A" value={row.assembled_qty} onChange={(value) => onUpdateProgress(index, "assembled_qty", value)} editable={!readOnly} />
                      <CompactPercent label="E" value={row.erected_qty} onChange={(value) => onUpdateProgress(index, "erected_qty", value)} editable={!readOnly} />
                    </View>
                  );
                })}
            </CollapsibleSection>

            <CollapsibleSection title="Labour" open={openSections.labour} onToggle={() => toggleSection("labour")} badge={`${totals.workers}`}>
              {!readOnly ? (
                <View style={styles.bulkCompact}>
                  <SmallField label="Time In" value={bulkIn} onChangeText={setBulkIn} keyboard="default" />
                  <SmallField label="Time Out" value={bulkOut} onChangeText={setBulkOut} keyboard="default" />
                  <Pressable style={styles.applyButton} onPress={applyTimesToAll}>
                    <Text style={styles.applyButtonText}>Apply</Text>
                  </Pressable>
                </View>
              ) : null}

              {values.map((row, index) => (
                <View key={`worker-${index}`} style={styles.workerRow}>
                  <View style={styles.workerTopRow}>
                    <TextInput
                      value={row.worker_name}
                      onChangeText={(value) => onUpdateLabour(index, "worker_name", value)}
                      editable={!readOnly}
                      style={[styles.workerNameInput, readOnly && styles.inputDisabled]}
                      placeholder="Worker name"
                      placeholderTextColor="#94A3B8"
                    />
                    {!readOnly ? (
                      <Pressable onPress={() => removeLabour(index)} style={styles.iconDelete}>
                        <Ionicons name="trash-outline" size={17} color="#BE123C" />
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={styles.workerTimeRow}>
                    <MiniInput label="In" value={row.time_in} onChange={(value) => onUpdateLabour(index, "time_in", value)} editable={!readOnly} />
                    <MiniInput label="Out" value={row.time_out} onChange={(value) => onUpdateLabour(index, "time_out", value)} editable={!readOnly} />
                    <MiniInput label="Raw" value={row.total_hours} onChange={(value) => onUpdateLabour(index, "total_hours", value)} editable={!readOnly} numeric />
                    <MiniStat label="Prod" value={row.production_hours} />
                  </View>
                </View>
              ))}

              {!readOnly ? (
                <Pressable style={styles.secondaryButton} onPress={addLabour}>
                  <Ionicons name="person-add-outline" size={17} color="#0F172A" />
                  <Text style={styles.secondaryButtonText}>Add worker</Text>
                </Pressable>
              ) : null}
            </CollapsibleSection>

            <CollapsibleSection title="Work time defaults" open={openSections.defaults} onToggle={() => toggleSection("defaults")}>
              <View style={styles.twoColumns}>
                <SmallField label="Lunch min" value={form.lunchBreakMinutes} onChangeText={(value) => update("lunchBreakMinutes", value)} editable={!readOnly} />
                <SmallField label="Prestart min" value={form.mobilisationMinutes} onChangeText={(value) => update("mobilisationMinutes", value)} editable={!readOnly} />
              </View>
              <View style={styles.twoColumns}>
                <SmallField label="Travel in" value={form.travelInMinutes} onChangeText={(value) => update("travelInMinutes", value)} editable={!readOnly} />
                <SmallField label="Travel out" value={form.travelOutMinutes} onChangeText={(value) => update("travelOutMinutes", value)} editable={!readOnly} />
              </View>
              {!readOnly ? (
                <Pressable style={styles.secondaryButton} onPress={applyDefaultsToAll}>
                  <Ionicons name="checkmark-done-outline" size={17} color="#0F172A" />
                  <Text style={styles.secondaryButtonText}>Apply defaults to all workers</Text>
                </Pressable>
              ) : null}
            </CollapsibleSection>

            <CollapsibleSection title="Delays & issues" open={openSections.delays} onToggle={() => toggleSection("delays")} badge={form.delayRows.length ? String(form.delayRows.length) : undefined}>
              <Field label="Missing items / bolts" value={form.missingItemsBolts} onChangeText={(value) => update("missingItemsBolts", value)} editable={!readOnly} />
              <TextArea label="General comments" value={form.delaysComments} onChangeText={(value) => update("delaysComments", value)} editable={!readOnly} />
              {form.delayRows.map((delay, index) => (
                <View key={delay.ui_id} style={styles.delayCard}>
                  <View style={styles.rowHeader}>
                    <Text style={styles.rowTitle}>Delay {index + 1}</Text>
                    {!readOnly ? (
                      <Pressable onPress={() => update("delayRows", form.delayRows.filter((_, i) => i !== index))}>
                        <Ionicons name="trash-outline" size={17} color="#BE123C" />
                      </Pressable>
                    ) : null}
                  </View>
                  <SelectButtons
                    label="Type"
                    value={delay.delay_type}
                    options={DELAY_OPTIONS}
                    onChange={(value) => onUpdateDelay(index, { delay_type: value as DelayType })}
                    disabled={readOnly}
                  />
                  <SmallField label="Hours" value={delay.delay_hours} onChangeText={(value) => onUpdateDelay(index, { delay_hours: value })} editable={!readOnly} />
                  <TextArea label="Reason" value={delay.delay_reason} onChangeText={(value) => onUpdateDelay(index, { delay_reason: value })} editable={!readOnly} />
                  <Choice
                    label="Applies to"
                    value={delay.applies_to}
                    options={[["entire_crew", "Entire Crew"], ["selected_workers", "Selected Workers"]]}
                    onChange={(value) => onUpdateDelay(index, { applies_to: value as DelayScope, worker_names: value === "entire_crew" ? [] : delay.worker_names })}
                    disabled={readOnly}
                  />
                  {delay.applies_to === "selected_workers" ? (
                    <ChipSelector label="Workers" values={workerNames} selected={delay.worker_names} disabled={readOnly} onToggle={(name) => toggleWorker(index, name)} />
                  ) : null}
                  {delay.delay_mode === "labour_and_plant" ? (
                    <ChipSelector label="Plant" values={plantNames} selected={delay.plant_names} disabled={readOnly} onToggle={(name) => togglePlant(index, name)} />
                  ) : null}
                </View>
              ))}
              {!readOnly ? (
                <Pressable style={styles.secondaryButton} onPress={addDelay}>
                  <Ionicons name="timer-outline" size={17} color="#0F172A" />
                  <Text style={styles.secondaryButtonText}>Add delay</Text>
                </Pressable>
              ) : null}
            </CollapsibleSection>

            <CollapsibleSection title="Plant & vehicles" open={openSections.plant} onToggle={() => toggleSection("plant")} badge={form.plantRows.length ? String(form.plantRows.length) : undefined}>
              {form.plantRows.map((row, index) => (
                <View key={`plant-${index}`} style={styles.plantCard}>
                  <View style={styles.rowHeader}>
                    <Text style={styles.rowTitle}>{plantDisplay(row)}</Text>
                    {!readOnly ? (
                      <Pressable onPress={() => update("plantRows", form.plantRows.filter((_, i) => i !== index))}>
                        <Ionicons name="trash-outline" size={17} color="#BE123C" />
                      </Pressable>
                    ) : null}
                  </View>
                  <Field label="Plant / vehicle" value={row.plant_name} onChangeText={(value) => onUpdatePlant(index, "plant_name", value)} editable={!readOnly} />
                  <View style={styles.twoColumns}>
                    <SmallField label="Asset ID" value={row.asset_id} onChangeText={(value) => onUpdatePlant(index, "asset_id", value)} editable={!readOnly} keyboard="default" />
                    <SmallField label="Operator" value={row.operator_name} onChangeText={(value) => onUpdatePlant(index, "operator_name", value)} editable={!readOnly} keyboard="default" />
                  </View>
                  {form.rateType === "schedule_of_rates" ? (
                    <View style={styles.workerTimeRow}>
                      <MiniInput label="In" value={row.time_in} onChange={(value) => onUpdatePlant(index, "time_in", value)} editable={!readOnly} />
                      <MiniInput label="Out" value={row.time_out} onChange={(value) => onUpdatePlant(index, "time_out", value)} editable={!readOnly} />
                      <MiniInput label="Hours" value={row.total_hours} onChange={(value) => onUpdatePlant(index, "total_hours", value)} editable={!readOnly} numeric />
                    </View>
                  ) : null}
                </View>
              ))}
              {!readOnly ? (
                <Pressable style={styles.secondaryButton} onPress={addPlant}>
                  <Ionicons name="add-circle-outline" size={17} color="#0F172A" />
                  <Text style={styles.secondaryButtonText}>Add plant / vehicle</Text>
                </Pressable>
              ) : null}
            </CollapsibleSection>

            <CollapsibleSection title="Safety" open={openSections.safety} onToggle={() => toggleSection("safety")} badge={form.incidentOccurred ? "Incident" : undefined}>
              <Choice
                label="Incident occurred?"
                value={form.incidentOccurred ? "yes" : "no"}
                options={[["no", "No"], ["yes", "Yes"]]}
                onChange={(value) => {
                  const occurred = value === "yes";
                  update("incidentOccurred", occurred);
                  if (!occurred) {
                    update("incidentType", "");
                    update("incidentNotes", "");
                  }
                }}
                disabled={readOnly}
              />
              {form.incidentOccurred ? (
                <>
                  <SelectButtons
                    label="Type"
                    value={form.incidentType}
                    options={[
                      { value: "injury", label: "Injury" },
                      { value: "near_miss", label: "Near Miss" },
                      { value: "property_damage", label: "Damage" },
                      { value: "environmental", label: "Environmental" },
                      { value: "other", label: "Other" },
                    ]}
                    onChange={(value) => update("incidentType", value)}
                    disabled={readOnly}
                  />
                  <TextArea label="Incident notes" value={form.incidentNotes} onChangeText={(value) => update("incidentNotes", value)} editable={!readOnly} />
                </>
              ) : null}
            </CollapsibleSection>

            <CollapsibleSection title="Sign-off" open={openSections.signoff} onToggle={() => toggleSection("signoff")}>
              <Field label="BC Rep" value={form.bcRepName} onChangeText={(value) => update("bcRepName", value)} editable={!readOnly} />
              <Field label="Client Rep" value={form.clientRepName} onChangeText={(value) => update("clientRepName", value)} editable={!readOnly} />
              <Field label="Signed Date" value={form.signedDate} onChangeText={(value) => update("signedDate", value)} editable={!readOnly} placeholder="YYYY-MM-DD" />
            </CollapsibleSection>

            {!readOnly ? (
              <Pressable style={[styles.saveButton, saving && styles.disabled]} disabled={saving} onPress={onSave}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <>
                  <Ionicons name="save-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.saveText}>{form.mode === "create" ? "Save Daily Docket" : "Update Daily Docket"}</Text>
                </>}
              </Pressable>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function TowerPicker({ visible, towers, search, onSearch, onClose, onSelect }: {
  visible: boolean;
  towers: Tower[];
  search: string;
  onSearch: (value: string) => void;
  onClose: () => void;
  onSelect: (tower: Tower) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.modalHeader}>
          <Pressable style={styles.backButton} onPress={onClose}>
            <Ionicons name="close" size={22} color="#334155" />
          </Pressable>
          <View style={styles.modalTitleWrap}>
            <Text style={styles.modalTitle}>Select Tower</Text>
          </View>
          <View style={styles.modalSpacer} />
        </View>
        <View style={styles.pickerContent}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#64748B" />
            <TextInput value={search} onChangeText={onSearch} style={styles.searchInput} placeholder="Search towers…" placeholderTextColor="#94A3B8" />
          </View>
          <FlatList
            data={towers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.towerList}
            renderItem={({ item }) => (
              <Pressable style={styles.towerOption} onPress={() => onSelect(item)}>
                <View style={styles.towerOptionText}>
                  <Text style={styles.towerOptionTitle}>{towerLabel(item)}</Text>
                  <Text style={styles.towerOptionMeta}>{item.status || "Not Started"} · {toNumber(item.progress)}%</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </Pressable>
            )}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function CollapsibleSection({ title, open, onToggle, badge, children }: {
  title: string;
  open: boolean;
  onToggle: () => void;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Pressable style={styles.sectionHeader} onPress={onToggle}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {badge ? <View style={styles.sectionBadge}><Text style={styles.sectionBadgeText}>{badge}</Text></View> : null}
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={19} color="#64748B" />
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

function Field({ label, value, onChangeText, editable = true, placeholder }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  editable?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} style={[styles.input, !editable && styles.inputDisabled]} editable={editable} placeholder={placeholder || label} placeholderTextColor="#94A3B8" />
    </View>
  );
}

function SmallField({ label, value, onChangeText, editable = true, keyboard = "decimal-pad" }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  editable?: boolean;
  keyboard?: "decimal-pad" | "default";
}) {
  return (
    <View style={styles.smallField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} style={[styles.input, !editable && styles.inputDisabled]} editable={editable} keyboardType={keyboard} />
    </View>
  );
}

function TextArea({ label, value, onChangeText, editable = true }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  editable?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} style={[styles.textArea, !editable && styles.inputDisabled]} editable={editable} multiline textAlignVertical="top" />
    </View>
  );
}

function Choice({ label, value, options, onChange, disabled = false }: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choiceGrid}>
        {options.map(([optionValue, optionLabel]) => (
          <Pressable key={optionValue} style={[styles.choiceButton, value === optionValue && styles.choiceActive, disabled && styles.disabled]} disabled={disabled} onPress={() => onChange(optionValue)}>
            <Text style={[styles.choiceText, value === optionValue && styles.choiceTextActive]}>{optionLabel}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SelectButtons({ label, value, options, onChange, disabled = false }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectRow}>
        {options.map((option) => (
          <Pressable key={option.value} style={[styles.selectButton, value === option.value && styles.selectActive, disabled && styles.disabled]} disabled={disabled} onPress={() => onChange(option.value)}>
            <Text style={[styles.selectText, value === option.value && styles.selectTextActive]}>{option.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function CompactPercent({ label, value, onChange, editable }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  editable: boolean;
}) {
  return (
    <View style={styles.compactPercent}>
      <Text style={styles.compactPercentLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} editable={editable} keyboardType="number-pad" style={[styles.compactPercentInput, !editable && styles.inputDisabled]} placeholder="0" placeholderTextColor="#94A3B8" />
      <Text style={styles.percentSymbol}>%</Text>
    </View>
  );
}

function MiniInput({ label, value, onChange, editable, numeric = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  editable: boolean;
  numeric?: boolean;
}) {
  return (
    <View style={styles.miniField}>
      <Text style={styles.miniLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} editable={editable} keyboardType={numeric ? "decimal-pad" : "default"} style={[styles.miniInput, !editable && styles.inputDisabled]} />
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={styles.miniStatValue}>{value || "0.00"}</Text>
    </View>
  );
}

function ChipSelector({ label, values, selected, disabled, onToggle }: {
  label: string;
  values: string[];
  selected: string[];
  disabled: boolean;
  onToggle: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipGrid}>
        {values.map((value) => {
          const active = selected.some((row) => normaliseName(row) === normaliseName(value));
          return (
            <Pressable key={value} style={[styles.chip, active && styles.chipActive, disabled && styles.disabled]} disabled={disabled} onPress={() => onToggle(value)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{value}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <View style={styles.summaryCard}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <View style={styles.kpi}><Text style={styles.kpiLabel}>{label}</Text><Text style={styles.kpiValue}>{value}</Text></View>;
}

function StatusPill({ label }: { label: string }) {
  const value = label.toLowerCase();
  const style = value === "closed" ? styles.statusClosed : value.includes("submitted") || value.includes("signed") ? styles.statusSubmitted : styles.statusDraft;
  return <View style={[styles.statusPill, style]}><Text style={styles.statusText}>{label}</Text></View>;
}

function ActionButton({ icon, label, primary = false, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  primary?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.actionButton, primary && styles.actionPrimary]} onPress={onPress}>
      <Ionicons name={icon} size={17} color={primary ? "#FFFFFF" : "#334155"} />
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name="document-text-outline" size={29} color="#64748B" /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: "#64748B", fontSize: 12, fontWeight: "700", marginTop: 10 },
  header: { backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#E2E8F0", padding: 12 },
  headerRow: { flexDirection: "row", alignItems: "center" },
  headerText: { flex: 1 },
  title: { color: "#0F172A", fontSize: 21, fontWeight: "900" },
  subtitle: { color: "#64748B", fontSize: 11, marginTop: 3 },
  addButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center", marginRight: 7 },
  refreshButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  listContent: { padding: 12, paddingBottom: 100 },
  towerSelector: { minHeight: 60, borderRadius: 15, borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: "#EFF6FF", flexDirection: "row", alignItems: "center", padding: 12, marginBottom: 10 },
  towerText: { flex: 1 },
  towerLabel: { color: "#64748B", fontSize: 8, fontWeight: "900" },
  towerValue: { color: "#0F172A", fontSize: 13, fontWeight: "900", marginTop: 3 },
  summaryGrid: { flexDirection: "row", gap: 7, marginBottom: 10 },
  summaryCard: { flex: 1, minHeight: 60, borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", padding: 10 },
  summaryLabel: { color: "#64748B", fontSize: 8, fontWeight: "900", textTransform: "uppercase" },
  summaryValue: { color: "#0F172A", fontSize: 18, fontWeight: "900", marginTop: 4 },
  searchBox: { minHeight: 44, flexDirection: "row", alignItems: "center", borderRadius: 13, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", paddingHorizontal: 11, marginBottom: 10 },
  searchInput: { flex: 1, color: "#0F172A", fontSize: 13, marginLeft: 8 },
  docketCard: { borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", padding: 12, marginBottom: 9 },
  docketTop: { flexDirection: "row", alignItems: "flex-start" },
  docketText: { flex: 1, marginRight: 8 },
  docketDate: { color: "#0F172A", fontSize: 14, fontWeight: "900" },
  docketMeta: { color: "#64748B", fontSize: 10, marginTop: 4 },
  progressLine: { marginTop: 10 },
  progressTextRow: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { color: "#475569", fontSize: 9, fontWeight: "900" },
  progressValue: { color: "#0F172A", fontSize: 11, fontWeight: "900" },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: "#E2E8F0", overflow: "hidden", marginTop: 6 },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: "#2563EB" },
  metricRow: { flexDirection: "row", gap: 7, marginTop: 10 },
  metric: { flex: 1, minHeight: 48, borderRadius: 11, backgroundColor: "#F1F5F9", padding: 8 },
  metricLabel: { color: "#64748B", fontSize: 7, fontWeight: "900", textTransform: "uppercase" },
  metricValue: { color: "#0F172A", fontSize: 11, fontWeight: "900", marginTop: 4 },
  cardActions: { flexDirection: "row", gap: 7, marginTop: 10 },
  actionButton: { flex: 1, minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "center" },
  actionPrimary: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  actionText: { color: "#334155", fontSize: 10, fontWeight: "900", marginLeft: 6 },
  actionTextPrimary: { color: "#FFFFFF" },
  deleteButton: { width: 42, height: 42, borderRadius: 11, borderWidth: 1, borderColor: "#FECDD3", backgroundColor: "#FFF1F2", alignItems: "center", justifyContent: "center" },
  modalHeader: { minHeight: 58, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#E2E8F0", backgroundColor: "#FFFFFF", paddingHorizontal: 12 },
  backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" },
  modalTitleWrap: { flex: 1, marginHorizontal: 8 },
  modalTitle: { color: "#0F172A", fontSize: 17, fontWeight: "900", textAlign: "center" },
  modalSubtitle: { color: "#64748B", fontSize: 9, textAlign: "center", marginTop: 2 },
  modalSpacer: { width: 40 },
  headerSave: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" },
  editorContent: { padding: 12, paddingBottom: 60 },
  prefillButton: { minHeight: 46, borderRadius: 13, backgroundColor: "#334155", flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  prefillText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900", marginLeft: 7 },
  quickSummary: { flexDirection: "row", gap: 7, marginBottom: 10 },
  kpi: { flex: 1, minHeight: 58, borderRadius: 12, backgroundColor: "#F1F5F9", padding: 9 },
  kpiLabel: { color: "#64748B", fontSize: 7, fontWeight: "900", textTransform: "uppercase" },
  kpiValue: { color: "#0F172A", fontSize: 13, fontWeight: "900", marginTop: 5 },
  section: { borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", marginBottom: 9, overflow: "hidden" },
  sectionHeader: { minHeight: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 13 },
  sectionTitle: { flex: 1, color: "#0F172A", fontSize: 14, fontWeight: "900" },
  sectionBadge: { borderRadius: 999, backgroundColor: "#E2E8F0", paddingHorizontal: 8, paddingVertical: 4, marginRight: 8 },
  sectionBadgeText: { color: "#334155", fontSize: 8, fontWeight: "900" },
  sectionBody: { borderTopWidth: 1, borderTopColor: "#E2E8F0", padding: 12 },
  field: { marginBottom: 10 },
  smallField: { flex: 1 },
  fieldLabel: { color: "#475569", fontSize: 10, fontWeight: "800", marginBottom: 5 },
  input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", color: "#0F172A", fontSize: 13, paddingHorizontal: 11 },
  inputDisabled: { backgroundColor: "#F1F5F9", color: "#64748B" },
  textArea: { minHeight: 84, borderRadius: 12, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", color: "#0F172A", fontSize: 12, padding: 11 },
  twoColumns: { flexDirection: "row", gap: 8, marginBottom: 10 },
  choiceGrid: { flexDirection: "row", gap: 7 },
  choiceButton: { flex: 1, minHeight: 40, borderRadius: 11, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingHorizontal: 7 },
  choiceActive: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  choiceText: { color: "#475569", fontSize: 9, fontWeight: "900", textAlign: "center" },
  choiceTextActive: { color: "#FFFFFF" },
  selectRow: { gap: 6 },
  selectButton: { minHeight: 38, borderRadius: 999, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  selectActive: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  selectText: { color: "#475569", fontSize: 9, fontWeight: "800" },
  selectTextActive: { color: "#FFFFFF" },
  compactProgressRow: { flexDirection: "row", alignItems: "center", minHeight: 52, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  compactProgressLabel: { flex: 1, color: "#334155", fontSize: 11, fontWeight: "800" },
  compactPercent: { width: 84, flexDirection: "row", alignItems: "center", marginLeft: 6 },
  compactPercentLabel: { width: 16, color: "#64748B", fontSize: 9, fontWeight: "900" },
  compactPercentInput: { flex: 1, height: 38, borderRadius: 10, borderWidth: 1, borderColor: "#CBD5E1", color: "#0F172A", textAlign: "center", fontSize: 12, fontWeight: "900" },
  percentSymbol: { color: "#64748B", fontSize: 10, marginLeft: 3 },
  bulkCompact: { flexDirection: "row", gap: 8, alignItems: "flex-end", marginBottom: 10 },
  applyButton: { minHeight: 44, borderRadius: 11, backgroundColor: "#334155", alignItems: "center", justifyContent: "center", paddingHorizontal: 15 },
  applyButtonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  workerRow: { borderRadius: 13, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", padding: 9, marginBottom: 8 },
  workerTopRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  workerNameInput: { flex: 1, minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: "#CBD5E1", paddingHorizontal: 10, color: "#0F172A", fontSize: 12, fontWeight: "800" },
  iconDelete: { width: 36, height: 36, alignItems: "center", justifyContent: "center", marginLeft: 6 },
  workerTimeRow: { flexDirection: "row", gap: 6 },
  miniField: { flex: 1 },
  miniLabel: { color: "#64748B", fontSize: 8, fontWeight: "900", marginBottom: 4 },
  miniInput: { minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: "#CBD5E1", color: "#0F172A", fontSize: 11, textAlign: "center" },
  miniStat: { flex: 1, minHeight: 40, borderRadius: 10, backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#86EFAC", padding: 6 },
  miniStatValue: { color: "#166534", fontSize: 11, fontWeight: "900", textAlign: "center", marginTop: 2 },
  secondaryButton: { minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#F8FAFC", flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 4 },
  secondaryButtonText: { color: "#0F172A", fontSize: 10, fontWeight: "900", marginLeft: 7 },
  delayCard: { borderRadius: 13, borderWidth: 1, borderColor: "#FCD34D", backgroundColor: "#FFFBEB", padding: 10, marginBottom: 9 },
  plantCard: { borderRadius: 13, borderWidth: 1, borderColor: "#C4B5FD", backgroundColor: "#F5F3FF", padding: 10, marginBottom: 9 },
  rowHeader: { flexDirection: "row", alignItems: "center", marginBottom: 9 },
  rowTitle: { flex: 1, color: "#0F172A", fontSize: 11, fontWeight: "900" },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", paddingHorizontal: 10, paddingVertical: 7 },
  chipActive: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  chipText: { color: "#475569", fontSize: 9, fontWeight: "800" },
  chipTextActive: { color: "#FFFFFF" },
  saveButton: { minHeight: 50, borderRadius: 14, backgroundColor: "#2563EB", flexDirection: "row", alignItems: "center", justifyContent: "center" },
  saveText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900", marginLeft: 7 },
  statusPill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  statusDraft: { backgroundColor: "#FEF3C7" },
  statusSubmitted: { backgroundColor: "#DBEAFE" },
  statusClosed: { backgroundColor: "#DCFCE7" },
  statusText: { color: "#334155", fontSize: 8, fontWeight: "900" },
  pickerContent: { flex: 1, padding: 12 },
  towerList: { paddingTop: 10, paddingBottom: 30 },
  towerOption: { minHeight: 58, borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", padding: 10, marginBottom: 8 },
  towerOptionText: { flex: 1 },
  towerOptionTitle: { color: "#0F172A", fontSize: 12, fontWeight: "900" },
  towerOptionMeta: { color: "#64748B", fontSize: 9, marginTop: 3 },
  disabled: { opacity: 0.45 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 50, paddingHorizontal: 30 },
  emptyIcon: { width: 60, height: 60, borderRadius: 20, backgroundColor: "#E2E8F0", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: "#0F172A", fontSize: 16, fontWeight: "900", marginTop: 12 },
  emptyText: { color: "#64748B", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 5 },
});

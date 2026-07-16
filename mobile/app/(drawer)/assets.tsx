import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
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

type RegisterKey =
  | "Vehicles"
  | "Plant"
  | "Torque Wrenches"
  | "Lifting Gear"
  | "Ladders";

type AssetKind =
  | "Vehicle"
  | "Plant"
  | "Torque Wrench"
  | "Lifting Gear"
  | "Ladder";

type Tone = "green" | "amber" | "rose" | "blue" | "slate" | "violet";

type ProfileRecord = {
  projectId?: string | null;
  projectName?: string | null;
  projectNumber?: string | null;
  fullName?: string | null;
  name?: string | null;
  crew?: string | null;
};

type Crew = {
  id: string;
  crew_number: string | null;
  crew_name: string | null;
  leading_hand?: string | null;
  active?: boolean | null;
};

type Project = {
  id: string;
  name: string;
};

type VehicleAsset = {
  id: string;
  vehicle_id: string | null;
  vehicle_rego: string | null;
  rego?: string | null;
  make: string | null;
  model: string | null;
  category: string | null;
  project: string | null;
  crew: string | null;
  status: string | null;
  year: string | null;
  style: string | null;
  owner: string | null;
  vin_number: string | null;
  company_onboard_date: string | null;
  last_service: string | null;
  rego_expiry: string | null;
  insurance_expiry: string | null;
  next_service_due: string | null;
  next_service_km: number | null;
  service_interval_km: number | null;
  next_inspection_due: string | null;
  hired: boolean | null;
  hired_from: string | null;
  hire_term: string | null;
  off_hire_date: string | null;
  superseded_by: string | null;
  inactive_reason: string | null;
  spare_key_provided: boolean | null;
  spare_key_location: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at?: string | null;
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
  created_at: string | null;
  updated_at: string | null;
};

type Prestart = {
  id: string;
  asset_type: string | null;
  vehicle_asset_id: string | null;
  plant_asset_id: string | null;
  kilometres: number | null;
  cab_hours: number | null;
  hour_meter?: number | null;
  engine_hours?: number | null;
  hours?: number | null;
  prestart_date: string | null;
  created_at: string | null;
};

type FleetJob = {
  id: string;
  vehicle_id: string | null;
  vehicle_asset_id: string | null;
  plant_id: string | null;
  plant_asset_id: string | null;
  status: string | null;
};

type TorqueWrench = {
  id: string;
  torque_wrench_number: string;
  serial_number: string | null;
  expiry_date: string | null;
  crew_id: string | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type LiftingGear = {
  id: string;
  serial_id: string;
  equipment_type: string | null;
  description: string | null;
  inspected_on: string | null;
  next_inspection_due: string | null;
  event_type: string | null;
  comment: string | null;
  status: string | null;
  crew_id: string | null;
  crew_label: string | null;
  tag: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type Ladder = {
  id: string;
  ladder_number: string;
  make: string | null;
  ladder_type: string | null;
  height: string | null;
  crew_id: string | null;
  status: string | null;
  last_internal_inspection: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type VehicleForm = {
  id: string;
  vehicle_id: string;
  vehicle_rego: string;
  make: string;
  model: string;
  category: string;
  project: string;
  crew: string;
  status: string;
  year: string;
  style: string;
  owner: string;
  vin_number: string;
  company_onboard_date: string;
  last_service: string;
  rego_expiry: string;
  insurance_expiry: string;
  next_service_due: string;
  next_service_km: string;
  service_interval_km: string;
  next_inspection_due: string;
  hired: boolean;
  hired_from: string;
  hire_term: string;
  off_hire_date: string;
  inactive_reason: string;
  spare_key_provided: boolean;
  spare_key_location: string;
  notes: string;
};

type PlantForm = {
  id: string;
  asset_id: string;
  make: string;
  model: string;
  plant_type: string;
  serial_number: string;
  rego: string;
  crew: string;
  project: string;
  asset_status: string;
  insurance_expiry: string;
  rego_expiry: string;
  cranesafe_expiry: string;
  last_service_date: string;
  last_service_hours: string;
  service_interval_hours: string;
  next_service_due: string;
  next_service_hours: string;
  next_inspection_due: string;
  hired: boolean;
  hired_from: string;
  hire_term: string;
  off_hire_date: string;
  inactive_reason: string;
  risk_assessment: boolean;
  operators_manual: boolean;
  load_charts: boolean;
  logbook: boolean;
  fire_extinguisher: boolean;
  first_aid_kit: boolean;
  spill_kit: boolean;
  notes: string;
};

type EquipmentForm = {
  id: string;
  kind: "Torque Wrench" | "Lifting Gear" | "Ladder";
  asset_number: string;
  serial_number: string;
  equipment_type: string;
  description: string;
  make: string;
  height: string;
  crew_id: string;
  status: string;
  expiry_date: string;
  inspected_on: string;
  next_inspection_due: string;
  last_internal_inspection: string;
  event_type: string;
  tag: string;
  notes: string;
};

type DetailTarget =
  | { kind: "Vehicle"; id: string }
  | { kind: "Plant"; id: string }
  | { kind: "Torque Wrench"; id: string }
  | { kind: "Lifting Gear"; id: string }
  | { kind: "Ladder"; id: string };

const registers: RegisterKey[] = [
  "Vehicles",
  "Plant",
  "Torque Wrenches",
  "Lifting Gear",
  "Ladders",
];

const vehicleCategories = ["Light Vehicle", "Heavy Vehicle", "Trailer"];
const vehicleStatuses = [
  "Available",
  "In Use",
  "Under Maintenance",
  "Off Site",
  "Off Hire",
  "Superseded",
  "Inactive",
];
const plantTypes = ["Crane", "Telehandler", "Other"];
const plantStatuses = [
  "Available",
  "In Use",
  "Under Maintenance",
  "Off Site",
  "Off Hire",
  "Superseded",
  "Inactive",
];
const torqueStatuses = ["Active", "Out of Service", "Missing", "Retired"];
const gearStatuses = ["Passed", "Failed", "Out of Service", "Missing", "Retired"];
const ladderStatuses = ["Active", "Out of Service", "Missing", "Retired"];
const tagOptions = ["Blue", "Red", "Yellow", "Green"];
const liftingTypes = [
  "Round Sling",
  "Chain Sling",
  "Shackle",
  "Lifting Eye",
  "Snatch Block",
  "Lever Hoist (Block)",
  "Harness (Fall Arrest)",
  "Rescue Kit",
  "Wire Rope Assembly / Sling",
  "Lifting Device",
  "Other",
];
const ladderTypes = [
  "Step Ladder",
  "Extension Ladder",
  "Platform Ladder",
  "Fibreglass Ladder",
  "Other",
];

function clean(value: unknown): string {
  return String(value ?? "").trim();
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

function dateInput(value?: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function toNumber(value: string): number | null {
  const parsed = Number(value.trim());
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value?: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(value?: string | null): number | null {
  if (!value) return null;
  const due = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

function expiryState(value?: string | null): {
  label: string;
  tone: Tone;
  detail: string;
} {
  const days = daysUntil(value);
  if (days === null) return { label: "Not Set", tone: "slate", detail: "No date recorded" };
  if (days < 0) return { label: "Expired", tone: "rose", detail: `${Math.abs(days)} days overdue` };
  if (days === 0) return { label: "Due Today", tone: "rose", detail: "Expires today" };
  if (days <= 30) return { label: "Due Soon", tone: "amber", detail: `${days} days remaining` };
  return { label: "Current", tone: "green", detail: `${days} days remaining` };
}

function serviceState(
  remainingReading: number | null,
  dueDate?: string | null,
  unit = "",
): { label: string; tone: Tone; detail: string } {
  const dateDays = daysUntil(dueDate);
  const hasReading = remainingReading !== null;
  const hasDate = dateDays !== null;

  if (!hasReading && !hasDate) {
    return { label: "Not Set", tone: "slate", detail: "No service trigger recorded" };
  }

  if (
    (remainingReading !== null && remainingReading <= 0) ||
    (dateDays !== null && dateDays <= 0)
  ) {
    return {
      label: "Overdue",
      tone: "rose",
      detail:
        remainingReading !== null
          ? `${Math.abs(remainingReading).toLocaleString()} ${unit} overdue`
          : `${Math.abs(dateDays ?? 0)} days overdue`,
    };
  }

  if (
    (remainingReading !== null &&
      remainingReading <= (unit === "km" ? 1000 : 50)) ||
    (dateDays !== null && dateDays <= 30)
  ) {
    return {
      label: "Due Soon",
      tone: "amber",
      detail:
        remainingReading !== null
          ? `${remainingReading.toLocaleString()} ${unit} remaining`
          : `${dateDays} days remaining`,
    };
  }

  return {
    label: "Current",
    tone: "green",
    detail:
      remainingReading !== null
        ? `${remainingReading.toLocaleString()} ${unit} remaining`
        : `${dateDays} days remaining`,
  };
}

function crewLabel(crew: Crew): string {
  return [crew.crew_number, crew.crew_name].map(clean).filter(Boolean).join(" - ");
}

function projectMatches(
  value: string | null,
  projectName: string,
  projectNumber: string,
): boolean {
  const source = clean(value).toLowerCase();
  const name = projectName.toLowerCase();
  const number = projectNumber.toLowerCase();
  if (!source) return true;
  return (
    source === name ||
    source === number ||
    Boolean(name && source.includes(name)) ||
    Boolean(number && source.includes(number))
  );
}

function isFleetJobActive(status?: string | null): boolean {
  return !["completed", "closed", "complete", "resolved"].includes(
    clean(status).toLowerCase(),
  );
}

function vehicleLabel(row: VehicleAsset): string {
  return [
    row.vehicle_id,
    row.vehicle_rego || row.rego,
    row.make,
    row.model,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" · ");
}

function plantLabel(row: PlantAsset): string {
  return [row.asset_id, row.rego, row.make, row.model]
    .map(clean)
    .filter(Boolean)
    .join(" · ");
}

function latestPrestart(
  rows: Prestart[],
  kind: "Vehicle" | "Plant",
  id: string,
): Prestart | null {
  return (
    rows
      .filter((row) =>
        kind === "Vehicle"
          ? row.vehicle_asset_id === id
          : row.plant_asset_id === id,
      )
      .sort((a, b) => {
        const aValue = a.prestart_date || a.created_at || "";
        const bValue = b.prestart_date || b.created_at || "";
        return bValue.localeCompare(aValue);
      })[0] ?? null
  );
}

function plantHours(row: Prestart | null): number | null {
  if (!row) return null;
  return row.cab_hours ?? row.hour_meter ?? row.engine_hours ?? row.hours ?? null;
}

function nextNumber(values: string[], prefix: string): string {
  const highest = values.reduce((current, value) => {
    const match = clean(value).match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
    if (!match) return current;
    const number = Number(match[1]);
    return Number.isFinite(number) ? Math.max(current, number) : current;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}

function emptyVehicle(project = "", crew = ""): VehicleForm {
  return {
    id: "",
    vehicle_id: "",
    vehicle_rego: "",
    make: "",
    model: "",
    category: "Light Vehicle",
    project,
    crew,
    status: "Available",
    year: "",
    style: "",
    owner: "",
    vin_number: "",
    company_onboard_date: "",
    last_service: "",
    rego_expiry: "",
    insurance_expiry: "",
    next_service_due: "",
    next_service_km: "",
    service_interval_km: "10000",
    next_inspection_due: "",
    hired: false,
    hired_from: "",
    hire_term: "",
    off_hire_date: "",
    inactive_reason: "",
    spare_key_provided: false,
    spare_key_location: "",
    notes: "",
  };
}

function vehicleToForm(row: VehicleAsset): VehicleForm {
  return {
    id: row.id,
    vehicle_id: clean(row.vehicle_id),
    vehicle_rego: clean(row.vehicle_rego || row.rego),
    make: clean(row.make),
    model: clean(row.model),
    category: clean(row.category) || "Light Vehicle",
    project: clean(row.project),
    crew: clean(row.crew),
    status: clean(row.status) || "Available",
    year: clean(row.year),
    style: clean(row.style),
    owner: clean(row.owner),
    vin_number: clean(row.vin_number),
    company_onboard_date: dateInput(row.company_onboard_date),
    last_service: dateInput(row.last_service),
    rego_expiry: dateInput(row.rego_expiry),
    insurance_expiry: dateInput(row.insurance_expiry),
    next_service_due: dateInput(row.next_service_due),
    next_service_km: row.next_service_km == null ? "" : String(row.next_service_km),
    service_interval_km:
      row.service_interval_km == null ? "10000" : String(row.service_interval_km),
    next_inspection_due: dateInput(row.next_inspection_due),
    hired: Boolean(row.hired),
    hired_from: clean(row.hired_from),
    hire_term: clean(row.hire_term),
    off_hire_date: dateInput(row.off_hire_date),
    inactive_reason: clean(row.inactive_reason),
    spare_key_provided: Boolean(row.spare_key_provided),
    spare_key_location: clean(row.spare_key_location),
    notes: clean(row.notes),
  };
}

function emptyPlant(project = "", crew = ""): PlantForm {
  return {
    id: "",
    asset_id: "",
    make: "",
    model: "",
    plant_type: "Crane",
    serial_number: "",
    rego: "",
    crew,
    project,
    asset_status: "Available",
    insurance_expiry: "",
    rego_expiry: "",
    cranesafe_expiry: "",
    last_service_date: "",
    last_service_hours: "",
    service_interval_hours: "500",
    next_service_due: "",
    next_service_hours: "",
    next_inspection_due: "",
    hired: false,
    hired_from: "",
    hire_term: "",
    off_hire_date: "",
    inactive_reason: "",
    risk_assessment: false,
    operators_manual: false,
    load_charts: false,
    logbook: false,
    fire_extinguisher: false,
    first_aid_kit: false,
    spill_kit: false,
    notes: "",
  };
}

function plantToForm(row: PlantAsset): PlantForm {
  return {
    id: row.id,
    asset_id: clean(row.asset_id),
    make: clean(row.make),
    model: clean(row.model),
    plant_type: clean(row.plant_type) || "Crane",
    serial_number: clean(row.serial_number),
    rego: clean(row.rego),
    crew: clean(row.crew),
    project: clean(row.project),
    asset_status: clean(row.asset_status) || "Available",
    insurance_expiry: dateInput(row.insurance_expiry),
    rego_expiry: dateInput(row.rego_expiry),
    cranesafe_expiry: dateInput(row.cranesafe_expiry),
    last_service_date: dateInput(row.last_service_date),
    last_service_hours:
      row.last_service_hours == null ? "" : String(row.last_service_hours),
    service_interval_hours:
      row.service_interval_hours == null ? "500" : String(row.service_interval_hours),
    next_service_due: dateInput(row.next_service_due),
    next_service_hours:
      row.next_service_hours == null ? "" : String(row.next_service_hours),
    next_inspection_due: dateInput(row.next_inspection_due),
    hired: Boolean(row.hired),
    hired_from: clean(row.hired_from),
    hire_term: clean(row.hire_term),
    off_hire_date: dateInput(row.off_hire_date),
    inactive_reason: clean(row.inactive_reason),
    risk_assessment: Boolean(row.risk_assessment),
    operators_manual: Boolean(row.operators_manual),
    load_charts: Boolean(row.load_charts),
    logbook: Boolean(row.logbook),
    fire_extinguisher: Boolean(row.fire_extinguisher),
    first_aid_kit: Boolean(row.first_aid_kit),
    spill_kit: Boolean(row.spill_kit),
    notes: clean(row.notes),
  };
}

function emptyEquipment(kind: EquipmentForm["kind"], assetNumber = ""): EquipmentForm {
  return {
    id: "",
    kind,
    asset_number: assetNumber,
    serial_number: "",
    equipment_type:
      kind === "Lifting Gear"
        ? "Round Sling"
        : kind === "Ladder"
          ? "Step Ladder"
          : "",
    description: "",
    make: "",
    height: "",
    crew_id: "",
    status: kind === "Lifting Gear" ? "Passed" : "Active",
    expiry_date: "",
    inspected_on: "",
    next_inspection_due: "",
    last_internal_inspection: "",
    event_type: "Visual Inspection",
    tag: "Blue",
    notes: "",
  };
}

export default function AssetsScreen() {
  const { profile } = useAuth();
  const profileRecord = profile as unknown as ProfileRecord | null;

  const projectId = clean(profileRecord?.projectId);
  const projectName = clean(profileRecord?.projectName);
  const projectNumber = clean(profileRecord?.projectNumber);
  const profileCrew = clean(profileRecord?.crew);

  const [register, setRegister] = useState<RegisterKey>("Vehicles");
  const [allProjects, setAllProjects] = useState(false);
  const [search, setSearch] = useState("");

  const [vehicles, setVehicles] = useState<VehicleAsset[]>([]);
  const [plant, setPlant] = useState<PlantAsset[]>([]);
  const [prestarts, setPrestarts] = useState<Prestart[]>([]);
  const [fleetJobs, setFleetJobs] = useState<FleetJob[]>([]);
  const [torqueWrenches, setTorqueWrenches] = useState<TorqueWrench[]>([]);
  const [liftingGear, setLiftingGear] = useState<LiftingGear[]>([]);
  const [ladders, setLadders] = useState<Ladder[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [addVisible, setAddVisible] = useState(false);
  const [addKind, setAddKind] = useState<AssetKind | null>(null);
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [editVehicle, setEditVehicle] = useState<VehicleForm | null>(null);
  const [editPlant, setEditPlant] = useState<PlantForm | null>(null);
  const [editEquipment, setEditEquipment] = useState<EquipmentForm | null>(null);

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);

    const [
      vehicleResult,
      plantResult,
      prestartResult,
      fleetResult,
      torqueResult,
      gearResult,
      ladderResult,
      crewResult,
      projectResult,
    ] = await Promise.all([
      supabase.from("vehicle_assets").select("*").order("vehicle_id"),
      supabase.from("plant_assets").select("*").order("asset_id"),
      supabase
        .from("vehicle_prestarts")
        .select(
          "id, asset_type, vehicle_asset_id, plant_asset_id, kilometres, cab_hours, hour_meter, engine_hours, hours, prestart_date, created_at",
        )
        .order("prestart_date", { ascending: false }),
      supabase
        .from("fleet_jobs")
        .select(
          "id, vehicle_id, vehicle_asset_id, plant_id, plant_asset_id, status",
        ),
      supabase
        .from("equipment_torque_wrenches")
        .select("*")
        .order("torque_wrench_number"),
      supabase
        .from("equipment_lifting_gear")
        .select("*")
        .order("serial_id"),
      supabase.from("equipment_ladders").select("*").order("ladder_number"),
      supabase
        .from("crews")
        .select("id, crew_number, crew_name, leading_hand, active")
        .order("crew_number"),
      supabase.from("projects").select("id, name").order("name"),
    ]);

    if (vehicleResult.error) {
      Alert.alert("Vehicle register error", errorMessage(vehicleResult.error));
    }
    if (plantResult.error) {
      Alert.alert("Plant register error", errorMessage(plantResult.error));
    }

    setVehicles((vehicleResult.data ?? []) as VehicleAsset[]);
    setPlant((plantResult.data ?? []) as PlantAsset[]);
    setPrestarts((prestartResult.data ?? []) as Prestart[]);
    setFleetJobs((fleetResult.data ?? []) as FleetJob[]);
    setTorqueWrenches((torqueResult.data ?? []) as TorqueWrench[]);
    setLiftingGear((gearResult.data ?? []) as LiftingGear[]);
    setLadders((ladderResult.data ?? []) as Ladder[]);
    setCrews(
      ((crewResult.data ?? []) as Crew[]).filter((row) => row.active !== false),
    );
    setProjects((projectResult.data ?? []) as Project[]);

    if (showLoader) setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel("mobile-assets-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicle_assets" }, () => void loadData(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "plant_assets" }, () => void loadData(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicle_prestarts" }, () => void loadData(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "fleet_jobs" }, () => void loadData(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_torque_wrenches" }, () => void loadData(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_lifting_gear" }, () => void loadData(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_ladders" }, () => void loadData(false))
      .subscribe();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void loadData(false);
    });

    return () => {
      subscription.remove();
      void supabase.removeChannel(channel);
    };
  }, [loadData]);

  const crewById = useMemo(
    () => new Map(crews.map((row) => [row.id, row])),
    [crews],
  );

  const visibleVehicles = useMemo(() => {
    const term = search.trim().toLowerCase();
    return vehicles.filter((row) => {
      if (
        !allProjects &&
        projectId &&
        !projectMatches(row.project, projectName, projectNumber)
      ) {
        return false;
      }
      return [
        row.vehicle_id,
        row.vehicle_rego,
        row.make,
        row.model,
        row.category,
        row.project,
        row.crew,
        row.status,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [vehicles, search, allProjects, projectId, projectName, projectNumber]);

  const visiblePlant = useMemo(() => {
    const term = search.trim().toLowerCase();
    return plant.filter((row) => {
      if (
        !allProjects &&
        projectId &&
        !projectMatches(row.project, projectName, projectNumber)
      ) {
        return false;
      }
      return [
        row.asset_id,
        row.rego,
        row.make,
        row.model,
        row.plant_type,
        row.serial_number,
        row.project,
        row.crew,
        row.asset_status,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [plant, search, allProjects, projectId, projectName, projectNumber]);

  const visibleTorque = useMemo(() => {
    const term = search.trim().toLowerCase();
    return torqueWrenches.filter((row) =>
      [
        row.torque_wrench_number,
        row.serial_number,
        row.status,
        row.notes,
        row.crew_id ? crewLabel(crewById.get(row.crew_id) ?? ({ id: "", crew_number: "", crew_name: "" } as Crew)) : "",
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [torqueWrenches, search, crewById]);

  const visibleGear = useMemo(() => {
    const term = search.trim().toLowerCase();
    return liftingGear.filter((row) =>
      [
        row.serial_id,
        row.equipment_type,
        row.description,
        row.status,
        row.tag,
        row.crew_label,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [liftingGear, search]);

  const visibleLadders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return ladders.filter((row) =>
      [
        row.ladder_number,
        row.make,
        row.ladder_type,
        row.height,
        row.status,
        row.notes,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [ladders, search]);

  const counts = useMemo(
    () => ({
      vehicles: vehicles.length,
      plant: plant.length,
      torque: torqueWrenches.length,
      gear: liftingGear.length,
      ladders: ladders.length,
      alerts:
        vehicles.filter((row) => {
          const prestart = latestPrestart(prestarts, "Vehicle", row.id);
          const remaining =
            prestart?.kilometres != null && row.next_service_km != null
              ? row.next_service_km - prestart.kilometres
              : null;
          return (
            expiryState(row.rego_expiry).tone === "rose" ||
            expiryState(row.insurance_expiry).tone === "rose" ||
            serviceState(remaining, row.next_service_due, "km").tone === "rose"
          );
        }).length +
        plant.filter((row) => {
          const prestart = latestPrestart(prestarts, "Plant", row.id);
          const hours = plantHours(prestart);
          const remaining =
            hours != null && row.next_service_hours != null
              ? row.next_service_hours - hours
              : null;
          return (
            expiryState(row.insurance_expiry).tone === "rose" ||
            expiryState(row.rego_expiry).tone === "rose" ||
            expiryState(row.cranesafe_expiry).tone === "rose" ||
            serviceState(remaining, row.next_service_due, "h").tone === "rose"
          );
        }).length,
    }),
    [vehicles, plant, torqueWrenches, liftingGear, ladders, prestarts],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(false);
    setRefreshing(false);
  }, [loadData]);

  function openAdd(kind: AssetKind) {
    setAddKind(kind);
    setAddVisible(false);

    if (kind === "Vehicle") {
      setEditVehicle(emptyVehicle(projectName, profileCrew));
    } else if (kind === "Plant") {
      setEditPlant(emptyPlant(projectName, profileCrew));
    } else if (kind === "Torque Wrench") {
      setEditEquipment(
        emptyEquipment(
          "Torque Wrench",
          nextNumber(
            torqueWrenches.map((row) => row.torque_wrench_number),
            "TW",
          ),
        ),
      );
    } else if (kind === "Ladder") {
      setEditEquipment(
        emptyEquipment(
          "Ladder",
          nextNumber(ladders.map((row) => row.ladder_number), "LAD"),
        ),
      );
    } else {
      setEditEquipment(emptyEquipment("Lifting Gear"));
    }
  }

  function openDetail(target: DetailTarget) {
    setDetailTarget(target);
  }

  function closeEditors() {
    setEditVehicle(null);
    setEditPlant(null);
    setEditEquipment(null);
    setAddKind(null);
  }

  async function saveVehicle() {
    if (!editVehicle) return;
    if (!editVehicle.vehicle_id.trim()) {
      Alert.alert("Vehicle ID required", "Enter the vehicle asset ID.");
      return;
    }

    setSaving(true);
    try {
      const trailer = editVehicle.category === "Trailer";
      const payload = {
        vehicle_id: editVehicle.vehicle_id.trim(),
        vehicle_rego: editVehicle.vehicle_rego.trim() || null,
        make: editVehicle.make.trim() || null,
        model: editVehicle.model.trim() || null,
        category: editVehicle.category || null,
        project: editVehicle.project.trim() || null,
        crew: editVehicle.crew.trim() || null,
        status: editVehicle.status || "Available",
        year: editVehicle.year.trim() || null,
        style: trailer ? null : editVehicle.style.trim() || null,
        owner: editVehicle.owner.trim() || null,
        vin_number: editVehicle.vin_number.trim() || null,
        company_onboard_date: editVehicle.company_onboard_date || null,
        last_service: trailer ? null : editVehicle.last_service || null,
        rego_expiry: editVehicle.rego_expiry || null,
        insurance_expiry: trailer ? null : editVehicle.insurance_expiry || null,
        next_service_due: trailer ? null : editVehicle.next_service_due || null,
        next_service_km: trailer ? null : toNumber(editVehicle.next_service_km),
        service_interval_km: trailer
          ? null
          : toNumber(editVehicle.service_interval_km),
        next_inspection_due: editVehicle.next_inspection_due || null,
        hired: editVehicle.hired,
        hired_from: editVehicle.hired
          ? editVehicle.hired_from.trim() || null
          : null,
        hire_term: editVehicle.hired
          ? editVehicle.hire_term.trim() || null
          : null,
        off_hire_date:
          editVehicle.status === "Off Hire"
            ? editVehicle.off_hire_date || null
            : null,
        inactive_reason: ["Off Hire", "Inactive"].includes(editVehicle.status)
          ? editVehicle.inactive_reason.trim() || null
          : null,
        spare_key_provided: editVehicle.spare_key_provided,
        spare_key_location: editVehicle.spare_key_provided
          ? editVehicle.spare_key_location.trim() || "Site Office"
          : null,
        notes: editVehicle.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const result = editVehicle.id
        ? await supabase
            .from("vehicle_assets")
            .update(payload)
            .eq("id", editVehicle.id)
            .select("*")
            .single()
        : await supabase
            .from("vehicle_assets")
            .insert(payload)
            .select("*")
            .single();

      if (result.error) throw result.error;

      const saved = result.data as VehicleAsset;
      setVehicles((current) =>
        editVehicle.id
          ? current.map((row) => (row.id === saved.id ? saved : row))
          : [saved, ...current],
      );
      closeEditors();
      Alert.alert(
        editVehicle.id ? "Vehicle updated" : "Vehicle added",
        `${clean(saved.vehicle_id)} has been saved.`,
      );
    } catch (error) {
      Alert.alert("Could not save vehicle", errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function savePlant() {
    if (!editPlant) return;
    if (!editPlant.asset_id.trim()) {
      Alert.alert("Asset ID required", "Enter the plant asset ID.");
      return;
    }

    setSaving(true);
    try {
      const crane = editPlant.plant_type === "Crane";
      const telehandler = editPlant.plant_type === "Telehandler";
      const payload = {
        asset_id: editPlant.asset_id.trim(),
        make: editPlant.make.trim() || null,
        model: editPlant.model.trim() || null,
        plant_type: editPlant.plant_type || null,
        serial_number: editPlant.serial_number.trim() || null,
        rego: telehandler ? null : editPlant.rego.trim() || null,
        crew: editPlant.crew.trim() || null,
        project: editPlant.project.trim() || null,
        asset_status: editPlant.asset_status || "Available",
        insurance_expiry: editPlant.insurance_expiry || null,
        rego_expiry: telehandler ? null : editPlant.rego_expiry || null,
        cranesafe_expiry: crane ? editPlant.cranesafe_expiry || null : null,
        last_service_date: editPlant.last_service_date || null,
        last_service_hours: toNumber(editPlant.last_service_hours),
        service_interval_hours: toNumber(editPlant.service_interval_hours),
        next_service_due: editPlant.next_service_due || null,
        next_service_hours: toNumber(editPlant.next_service_hours),
        next_inspection_due: editPlant.next_inspection_due || null,
        hired: editPlant.hired,
        hired_from: editPlant.hired
          ? editPlant.hired_from.trim() || null
          : null,
        hire_term: editPlant.hired
          ? editPlant.hire_term.trim() || null
          : null,
        off_hire_date:
          editPlant.asset_status === "Off Hire"
            ? editPlant.off_hire_date || null
            : null,
        inactive_reason: ["Off Hire", "Inactive"].includes(editPlant.asset_status)
          ? editPlant.inactive_reason.trim() || null
          : null,
        risk_assessment: editPlant.risk_assessment,
        operators_manual: editPlant.operators_manual,
        load_charts: editPlant.load_charts,
        logbook: editPlant.logbook,
        fire_extinguisher: editPlant.fire_extinguisher,
        first_aid_kit: editPlant.first_aid_kit,
        spill_kit: editPlant.spill_kit,
        notes: editPlant.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const result = editPlant.id
        ? await supabase
            .from("plant_assets")
            .update(payload)
            .eq("id", editPlant.id)
            .select("*")
            .single()
        : await supabase.from("plant_assets").insert(payload).select("*").single();

      if (result.error) throw result.error;

      const saved = result.data as PlantAsset;
      setPlant((current) =>
        editPlant.id
          ? current.map((row) => (row.id === saved.id ? saved : row))
          : [saved, ...current],
      );
      closeEditors();
      Alert.alert(
        editPlant.id ? "Plant updated" : "Plant added",
        `${clean(saved.asset_id)} has been saved.`,
      );
    } catch (error) {
      Alert.alert("Could not save plant", errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function saveEquipment() {
    if (!editEquipment) return;

    setSaving(true);
    try {
      if (editEquipment.kind === "Torque Wrench") {
        const payload = {
          torque_wrench_number: editEquipment.asset_number,
          serial_number: editEquipment.serial_number.trim() || null,
          expiry_date: editEquipment.expiry_date || null,
          crew_id: editEquipment.crew_id || null,
          status: editEquipment.status || "Active",
          notes: editEquipment.notes.trim() || null,
          updated_at: new Date().toISOString(),
        };
        const result = editEquipment.id
          ? await supabase
              .from("equipment_torque_wrenches")
              .update(payload)
              .eq("id", editEquipment.id)
              .select("*")
              .single()
          : await supabase
              .from("equipment_torque_wrenches")
              .insert(payload)
              .select("*")
              .single();
        if (result.error) throw result.error;
        const saved = result.data as TorqueWrench;
        setTorqueWrenches((current) =>
          editEquipment.id
            ? current.map((row) => (row.id === saved.id ? saved : row))
            : [saved, ...current],
        );
      } else if (editEquipment.kind === "Ladder") {
        const payload = {
          ladder_number: editEquipment.asset_number,
          make: editEquipment.make.trim() || null,
          ladder_type: editEquipment.equipment_type || null,
          height: editEquipment.height.trim() || null,
          crew_id: editEquipment.crew_id || null,
          status: editEquipment.status || "Active",
          last_internal_inspection:
            editEquipment.last_internal_inspection || null,
          notes: editEquipment.notes.trim() || null,
          updated_at: new Date().toISOString(),
        };
        const result = editEquipment.id
          ? await supabase
              .from("equipment_ladders")
              .update(payload)
              .eq("id", editEquipment.id)
              .select("*")
              .single()
          : await supabase
              .from("equipment_ladders")
              .insert(payload)
              .select("*")
              .single();
        if (result.error) throw result.error;
        const saved = result.data as Ladder;
        setLadders((current) =>
          editEquipment.id
            ? current.map((row) => (row.id === saved.id ? saved : row))
            : [saved, ...current],
        );
      } else {
        if (!editEquipment.asset_number.trim()) {
          Alert.alert("Serial ID required", "Enter the lifting gear serial ID.");
          return;
        }
        const selectedCrew = editEquipment.crew_id
          ? crewById.get(editEquipment.crew_id)
          : null;
        const payload = {
          serial_id: editEquipment.asset_number.trim(),
          equipment_type: editEquipment.equipment_type || null,
          description: editEquipment.description.trim() || null,
          inspected_on: editEquipment.inspected_on || null,
          next_inspection_due: editEquipment.next_inspection_due || null,
          event_type: editEquipment.event_type || "Visual Inspection",
          comment: editEquipment.notes.trim() || null,
          status: editEquipment.status || "Passed",
          crew_id: editEquipment.crew_id || null,
          crew_label: selectedCrew ? crewLabel(selectedCrew) : null,
          tag: editEquipment.tag || null,
          updated_at: new Date().toISOString(),
        };
        const result = editEquipment.id
          ? await supabase
              .from("equipment_lifting_gear")
              .update(payload)
              .eq("id", editEquipment.id)
              .select("*")
              .single()
          : await supabase
              .from("equipment_lifting_gear")
              .insert(payload)
              .select("*")
              .single();
        if (result.error) throw result.error;
        const saved = result.data as LiftingGear;
        setLiftingGear((current) =>
          editEquipment.id
            ? current.map((row) => (row.id === saved.id ? saved : row))
            : [saved, ...current],
        );
      }

      const wasEditing = Boolean(editEquipment.id);
      const label = editEquipment.asset_number;
      closeEditors();
      Alert.alert(
        wasEditing ? "Asset updated" : "Asset added",
        `${label || editEquipment.kind} has been saved.`,
      );
    } catch (error) {
      Alert.alert("Could not save asset", errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function renderVehicle({ item }: { item: VehicleAsset }) {
    const latest = latestPrestart(prestarts, "Vehicle", item.id);
    const currentKm = latest?.kilometres ?? null;
    const remainingKm =
      currentKm != null && item.next_service_km != null
        ? item.next_service_km - currentKm
        : null;
    const service = serviceState(remainingKm, item.next_service_due, "km");
    const rego = expiryState(item.rego_expiry);
    const insurance = expiryState(item.insurance_expiry);
    const openJobs = fleetJobs.filter(
      (job) =>
        isFleetJobActive(job.status) &&
        (job.vehicle_id === item.id || job.vehicle_asset_id === item.id),
    ).length;

    return (
      <AssetCard
        icon="car-outline"
        title={clean(item.vehicle_id) || "Unnamed Vehicle"}
        subtitle={vehicleLabel(item)}
        status={clean(item.status) || "Available"}
        onPress={() => openDetail({ kind: "Vehicle", id: item.id })}
      >
        <View style={styles.metricGrid}>
          <MiniMetric
            label="Current KM"
            value={currentKm == null ? "No prestart" : currentKm.toLocaleString()}
            tone="blue"
          />
          <MiniMetric label="Service" value={service.label} tone={service.tone} />
          <MiniMetric label="Rego" value={rego.label} tone={rego.tone} />
          <MiniMetric
            label="Insurance"
            value={insurance.label}
            tone={insurance.tone}
          />
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardFooterText}>
            {service.detail} · {openJobs} open Fleet Job{openJobs === 1 ? "" : "s"}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </View>
      </AssetCard>
    );
  }

  function renderPlant({ item }: { item: PlantAsset }) {
    const latest = latestPrestart(prestarts, "Plant", item.id);
    const currentHours = plantHours(latest);
    const remaining =
      currentHours != null && item.next_service_hours != null
        ? item.next_service_hours - currentHours
        : null;
    const service = serviceState(remaining, item.next_service_due, "h");
    const insurance = expiryState(item.insurance_expiry);
    const compliance =
      item.plant_type === "Crane"
        ? expiryState(item.cranesafe_expiry)
        : expiryState(item.rego_expiry);
    const openJobs = fleetJobs.filter(
      (job) =>
        isFleetJobActive(job.status) &&
        (job.plant_id === item.id || job.plant_asset_id === item.id),
    ).length;

    return (
      <AssetCard
        icon="construct-outline"
        title={clean(item.asset_id) || "Unnamed Plant"}
        subtitle={plantLabel(item)}
        status={clean(item.asset_status) || "Available"}
        onPress={() => openDetail({ kind: "Plant", id: item.id })}
      >
        <View style={styles.metricGrid}>
          <MiniMetric
            label="Current Hours"
            value={
              currentHours == null ? "No prestart" : currentHours.toLocaleString()
            }
            tone="violet"
          />
          <MiniMetric label="Service" value={service.label} tone={service.tone} />
          <MiniMetric
            label={item.plant_type === "Crane" ? "CraneSafe" : "Rego"}
            value={compliance.label}
            tone={compliance.tone}
          />
          <MiniMetric
            label="Insurance"
            value={insurance.label}
            tone={insurance.tone}
          />
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardFooterText}>
            {service.detail} · {openJobs} open Fleet Job{openJobs === 1 ? "" : "s"}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </View>
      </AssetCard>
    );
  }

  function renderTorque({ item }: { item: TorqueWrench }) {
    const expiry = expiryState(item.expiry_date);
    const crew = item.crew_id ? crewById.get(item.crew_id) : null;
    return (
      <AssetCard
        icon="build-outline"
        title={item.torque_wrench_number}
        subtitle={clean(item.serial_number) || "No serial number"}
        status={clean(item.status) || "Active"}
        onPress={() => openDetail({ kind: "Torque Wrench", id: item.id })}
      >
        <View style={styles.metricGrid}>
          <MiniMetric label="Calibration" value={expiry.label} tone={expiry.tone} />
          <MiniMetric
            label="Crew"
            value={crew ? crewLabel(crew) : "Unallocated"}
            tone="slate"
          />
        </View>
      </AssetCard>
    );
  }

  function renderGear({ item }: { item: LiftingGear }) {
    const due = expiryState(item.next_inspection_due);
    return (
      <AssetCard
        icon="link-outline"
        title={item.serial_id}
        subtitle={[item.equipment_type, item.description].map(clean).filter(Boolean).join(" · ")}
        status={clean(item.status) || "Passed"}
        onPress={() => openDetail({ kind: "Lifting Gear", id: item.id })}
      >
        <View style={styles.metricGrid}>
          <MiniMetric label="Inspection" value={due.label} tone={due.tone} />
          <MiniMetric label="Tag" value={clean(item.tag) || "Not set"} tone="blue" />
        </View>
      </AssetCard>
    );
  }

  function renderLadder({ item }: { item: Ladder }) {
    const days = item.last_internal_inspection
      ? Math.floor(
          (Date.now() -
            new Date(`${item.last_internal_inspection}T00:00:00`).getTime()) /
            86_400_000,
        )
      : null;
    const inspection =
      days == null
        ? { label: "Not Set", tone: "slate" as Tone }
        : days > 90
          ? { label: "Review", tone: "rose" as Tone }
          : days > 60
            ? { label: "Ageing", tone: "amber" as Tone }
            : { label: "Current", tone: "green" as Tone };

    return (
      <AssetCard
        icon="podium-outline"
        title={item.ladder_number}
        subtitle={[item.make, item.ladder_type, item.height]
          .map(clean)
          .filter(Boolean)
          .join(" · ")}
        status={clean(item.status) || "Active"}
        onPress={() => openDetail({ kind: "Ladder", id: item.id })}
      >
        <View style={styles.metricGrid}>
          <MiniMetric
            label="Inspection"
            value={inspection.label}
            tone={inspection.tone}
          />
          <MiniMetric
            label="Last Checked"
            value={formatDate(item.last_internal_inspection)}
            tone="slate"
          />
        </View>
      </AssetCard>
    );
  }

  const listProps = useMemo(() => {
    if (register === "Vehicles") {
      return {
        data: visibleVehicles,
        renderItem: renderVehicle,
        key: "vehicles",
      };
    }
    if (register === "Plant") {
      return { data: visiblePlant, renderItem: renderPlant, key: "plant" };
    }
    if (register === "Torque Wrenches") {
      return { data: visibleTorque, renderItem: renderTorque, key: "torque" };
    }
    if (register === "Lifting Gear") {
      return { data: visibleGear, renderItem: renderGear, key: "gear" };
    }
    return { data: visibleLadders, renderItem: renderLadder, key: "ladders" };
  }, [
    register,
    visibleVehicles,
    visiblePlant,
    visibleTorque,
    visibleGear,
    visibleLadders,
  ]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading asset registers…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerIcon}>
              <Ionicons name="cube-outline" size={23} color="#FFFFFF" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.pageTitle}>Assets</Text>
              <Text style={styles.pageSubtitle}>
                Fleet, plant and equipment register
              </Text>
            </View>
            <Pressable style={styles.addButton} onPress={() => setAddVisible(true)}>
              <Ionicons name="add" size={22} color="#FFFFFF" />
            </Pressable>
            <Pressable style={styles.refreshButton} onPress={() => void refresh()}>
              {refreshing ? (
                <ActivityIndicator size="small" color="#334155" />
              ) : (
                <Ionicons name="refresh" size={20} color="#334155" />
              )}
            </Pressable>
          </View>

          <View style={styles.projectStrip}>
            <View style={styles.projectText}>
              <Text style={styles.projectLabel}>REGISTER SCOPE</Text>
              <Text style={styles.projectValue}>
                {allProjects
                  ? "All projects"
                  : projectNumber
                    ? `${projectNumber} — ${projectName}`
                    : projectName || "Current project"}
              </Text>
            </View>
            <Pressable
              style={[styles.scopeButton, allProjects && styles.scopeButtonActive]}
              onPress={() => setAllProjects((current) => !current)}
            >
              <Text
                style={[
                  styles.scopeButtonText,
                  allProjects && styles.scopeButtonTextActive,
                ]}
              >
                {allProjects ? "All" : "Current"}
              </Text>
            </Pressable>
          </View>
        </View>

        <FlatList
          key={listProps.key}
          data={listProps.data as never[]}
          renderItem={listProps.renderItem as never}
          keyExtractor={(item: { id: string }) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
          }
          ListHeaderComponent={
            <View>
              <View style={styles.summaryGrid}>
                <SummaryCard label="Vehicles" value={counts.vehicles} icon="car-outline" />
                <SummaryCard label="Plant" value={counts.plant} icon="construct-outline" />
                <SummaryCard
                  label="Equipment"
                  value={counts.torque + counts.gear + counts.ladders}
                  icon="build-outline"
                />
                <SummaryCard
                  label="Overdue"
                  value={counts.alerts}
                  icon="warning-outline"
                  alert={counts.alerts > 0}
                />
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.registerTabs}
              >
                {registers.map((item) => (
                  <Pressable
                    key={item}
                    style={[
                      styles.registerTab,
                      register === item && styles.registerTabActive,
                    ]}
                    onPress={() => {
                      setRegister(item);
                      setSearch("");
                    }}
                  >
                    <Text
                      style={[
                        styles.registerTabText,
                        register === item && styles.registerTabTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.searchBox}>
                <Ionicons name="search" size={19} color="#64748B" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  style={styles.searchInput}
                  placeholder={`Search ${register.toLowerCase()}…`}
                  placeholderTextColor="#94A3B8"
                />
                {search ? (
                  <Pressable onPress={() => setSearch("")}>
                    <Ionicons name="close-circle" size={19} color="#94A3B8" />
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.registerHeading}>
                <Text style={styles.registerTitle}>{register} Register</Text>
                <Text style={styles.registerCount}>
                  {listProps.data.length} shown
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <Empty
              title={`No ${register.toLowerCase()} found`}
              text="Try a different search or add a new asset."
            />
          }
        />

        <AddChooser
          visible={addVisible}
          onClose={() => setAddVisible(false)}
          onChoose={openAdd}
        />

        <DetailModal
          target={detailTarget}
          vehicles={vehicles}
          plant={plant}
          torqueWrenches={torqueWrenches}
          liftingGear={liftingGear}
          ladders={ladders}
          prestarts={prestarts}
          fleetJobs={fleetJobs}
          crewById={crewById}
          onClose={() => setDetailTarget(null)}
          onEditVehicle={(row) => {
            setDetailTarget(null);
            setEditVehicle(vehicleToForm(row));
          }}
          onEditPlant={(row) => {
            setDetailTarget(null);
            setEditPlant(plantToForm(row));
          }}
          onEditEquipment={(form) => {
            setDetailTarget(null);
            setEditEquipment(form);
          }}
        />

        <VehicleEditor
          form={editVehicle}
          projects={projects}
          crews={crews}
          saving={saving}
          onChange={setEditVehicle}
          onClose={closeEditors}
          onSave={() => void saveVehicle()}
        />

        <PlantEditor
          form={editPlant}
          projects={projects}
          crews={crews}
          saving={saving}
          onChange={setEditPlant}
          onClose={closeEditors}
          onSave={() => void savePlant()}
        />

        <EquipmentEditor
          form={editEquipment}
          crews={crews}
          saving={saving}
          onChange={setEditEquipment}
          onClose={closeEditors}
          onSave={() => void saveEquipment()}
        />
      </View>
    </SafeAreaView>
  );
}

function DetailModal({
  target,
  vehicles,
  plant,
  torqueWrenches,
  liftingGear,
  ladders,
  prestarts,
  fleetJobs,
  crewById,
  onClose,
  onEditVehicle,
  onEditPlant,
  onEditEquipment,
}: {
  target: DetailTarget | null;
  vehicles: VehicleAsset[];
  plant: PlantAsset[];
  torqueWrenches: TorqueWrench[];
  liftingGear: LiftingGear[];
  ladders: Ladder[];
  prestarts: Prestart[];
  fleetJobs: FleetJob[];
  crewById: Map<string, Crew>;
  onClose: () => void;
  onEditVehicle: (row: VehicleAsset) => void;
  onEditPlant: (row: PlantAsset) => void;
  onEditEquipment: (form: EquipmentForm) => void;
}) {
  if (!target) return null;

  const vehicle =
    target.kind === "Vehicle"
      ? vehicles.find((row) => row.id === target.id) ?? null
      : null;
  const plantAsset =
    target.kind === "Plant"
      ? plant.find((row) => row.id === target.id) ?? null
      : null;
  const torque =
    target.kind === "Torque Wrench"
      ? torqueWrenches.find((row) => row.id === target.id) ?? null
      : null;
  const gear =
    target.kind === "Lifting Gear"
      ? liftingGear.find((row) => row.id === target.id) ?? null
      : null;
  const ladder =
    target.kind === "Ladder"
      ? ladders.find((row) => row.id === target.id) ?? null
      : null;

  const title = vehicle
    ? clean(vehicle.vehicle_id)
    : plantAsset
      ? clean(plantAsset.asset_id)
      : torque
        ? torque.torque_wrench_number
        : gear
          ? gear.serial_id
          : ladder?.ladder_number || "Asset";

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.modalHeader}>
          <Pressable style={styles.backButton} onPress={onClose}>
            <Ionicons name="arrow-back" size={22} color="#334155" />
          </Pressable>
          <View style={styles.modalTitleWrap}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Text style={styles.modalSubtitle}>{target.kind}</Text>
          </View>
          <View style={styles.modalSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.detailContent}>
          {vehicle ? (
            <VehicleDetail
              row={vehicle}
              prestarts={prestarts}
              fleetJobs={fleetJobs}
              onEdit={() => onEditVehicle(vehicle)}
            />
          ) : null}

          {plantAsset ? (
            <PlantDetail
              row={plantAsset}
              prestarts={prestarts}
              fleetJobs={fleetJobs}
              onEdit={() => onEditPlant(plantAsset)}
            />
          ) : null}

          {torque ? (
            <EquipmentDetail
              title={torque.torque_wrench_number}
              status={clean(torque.status) || "Active"}
              fields={[
                ["Serial Number", clean(torque.serial_number) || "Not recorded"],
                ["Calibration Expiry", formatDate(torque.expiry_date)],
                [
                  "Crew",
                  torque.crew_id && crewById.get(torque.crew_id)
                    ? crewLabel(crewById.get(torque.crew_id)!)
                    : "Unallocated",
                ],
                ["Notes", clean(torque.notes) || "None"],
              ]}
              onEdit={() =>
                onEditEquipment({
                  ...emptyEquipment("Torque Wrench"),
                  id: torque.id,
                  asset_number: torque.torque_wrench_number,
                  serial_number: clean(torque.serial_number),
                  crew_id: clean(torque.crew_id),
                  status: clean(torque.status) || "Active",
                  expiry_date: dateInput(torque.expiry_date),
                  notes: clean(torque.notes),
                })
              }
            />
          ) : null}

          {gear ? (
            <EquipmentDetail
              title={gear.serial_id}
              status={clean(gear.status) || "Passed"}
              fields={[
                ["Type", clean(gear.equipment_type) || "Not recorded"],
                ["Description", clean(gear.description) || "Not recorded"],
                ["Inspected", formatDate(gear.inspected_on)],
                ["Next Due", formatDate(gear.next_inspection_due)],
                ["Tag", clean(gear.tag) || "Not set"],
                ["Crew", clean(gear.crew_label) || "Unallocated"],
                ["Comment", clean(gear.comment) || "None"],
              ]}
              onEdit={() =>
                onEditEquipment({
                  ...emptyEquipment("Lifting Gear"),
                  id: gear.id,
                  asset_number: gear.serial_id,
                  equipment_type: clean(gear.equipment_type) || "Round Sling",
                  description: clean(gear.description),
                  inspected_on: dateInput(gear.inspected_on),
                  next_inspection_due: dateInput(gear.next_inspection_due),
                  event_type: clean(gear.event_type) || "Visual Inspection",
                  notes: clean(gear.comment),
                  status: clean(gear.status) || "Passed",
                  crew_id: clean(gear.crew_id),
                  tag: clean(gear.tag) || "Blue",
                })
              }
            />
          ) : null}

          {ladder ? (
            <EquipmentDetail
              title={ladder.ladder_number}
              status={clean(ladder.status) || "Active"}
              fields={[
                ["Make", clean(ladder.make) || "Not recorded"],
                ["Type", clean(ladder.ladder_type) || "Not recorded"],
                ["Height", clean(ladder.height) || "Not recorded"],
                ["Last Inspection", formatDate(ladder.last_internal_inspection)],
                [
                  "Crew",
                  ladder.crew_id && crewById.get(ladder.crew_id)
                    ? crewLabel(crewById.get(ladder.crew_id)!)
                    : "Unallocated",
                ],
                ["Notes", clean(ladder.notes) || "None"],
              ]}
              onEdit={() =>
                onEditEquipment({
                  ...emptyEquipment("Ladder"),
                  id: ladder.id,
                  asset_number: ladder.ladder_number,
                  make: clean(ladder.make),
                  equipment_type: clean(ladder.ladder_type) || "Step Ladder",
                  height: clean(ladder.height),
                  crew_id: clean(ladder.crew_id),
                  status: clean(ladder.status) || "Active",
                  last_internal_inspection: dateInput(
                    ladder.last_internal_inspection,
                  ),
                  notes: clean(ladder.notes),
                })
              }
            />
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function VehicleDetail({
  row,
  prestarts,
  fleetJobs,
  onEdit,
}: {
  row: VehicleAsset;
  prestarts: Prestart[];
  fleetJobs: FleetJob[];
  onEdit: () => void;
}) {
  const latest = latestPrestart(prestarts, "Vehicle", row.id);
  const currentKm = latest?.kilometres ?? null;
  const remaining =
    currentKm != null && row.next_service_km != null
      ? row.next_service_km - currentKm
      : null;
  const service = serviceState(remaining, row.next_service_due, "km");
  const openJobs = fleetJobs.filter(
    (job) =>
      isFleetJobActive(job.status) &&
      (job.vehicle_id === row.id || job.vehicle_asset_id === row.id),
  ).length;

  return (
    <>
      <DetailHero
        icon="car-outline"
        title={vehicleLabel(row)}
        status={clean(row.status) || "Available"}
        onEdit={onEdit}
      />

      <StatusGrid
        items={[
          {
            label: "Rego Expiry",
            value: formatDate(row.rego_expiry),
            state: expiryState(row.rego_expiry),
          },
          {
            label: "Insurance",
            value: formatDate(row.insurance_expiry),
            state: expiryState(row.insurance_expiry),
          },
          {
            label: "Service",
            value: service.label,
            state: service,
          },
          {
            label: "Fleet Jobs",
            value: String(openJobs),
            state: {
              label: openJobs ? "Action Required" : "Clear",
              tone: openJobs ? "amber" : "green",
              detail: `${openJobs} active`,
            },
          },
        ]}
      />

      <DetailSection title="Current Service Position">
        <DetailRows
          rows={[
            ["Latest Prestart KM", currentKm == null ? "No reading" : `${currentKm.toLocaleString()} km`],
            ["Next Service KM", row.next_service_km == null ? "Not set" : `${row.next_service_km.toLocaleString()} km`],
            ["Remaining", remaining == null ? "Not calculated" : `${remaining.toLocaleString()} km`],
            ["Next Service Date", formatDate(row.next_service_due)],
            ["Last Service", formatDate(row.last_service)],
            ["Service Interval", row.service_interval_km == null ? "Not set" : `${row.service_interval_km.toLocaleString()} km`],
          ]}
        />
      </DetailSection>

      <DetailSection title="Vehicle Details">
        <DetailRows
          rows={[
            ["Vehicle ID", clean(row.vehicle_id) || "Not recorded"],
            ["Rego", clean(row.vehicle_rego || row.rego) || "Not recorded"],
            ["Category", clean(row.category) || "Not recorded"],
            ["Make / Model", [row.make, row.model].map(clean).filter(Boolean).join(" ") || "Not recorded"],
            ["Year", clean(row.year) || "Not recorded"],
            ["VIN / Chassis", clean(row.vin_number) || "Not recorded"],
            ["Owner", clean(row.owner) || "Not recorded"],
            ["Project", clean(row.project) || "Unallocated"],
            ["Crew", clean(row.crew) || "Unallocated"],
          ]}
        />
      </DetailSection>
    </>
  );
}

function PlantDetail({
  row,
  prestarts,
  fleetJobs,
  onEdit,
}: {
  row: PlantAsset;
  prestarts: Prestart[];
  fleetJobs: FleetJob[];
  onEdit: () => void;
}) {
  const latest = latestPrestart(prestarts, "Plant", row.id);
  const currentHours = plantHours(latest);
  const remaining =
    currentHours != null && row.next_service_hours != null
      ? row.next_service_hours - currentHours
      : null;
  const service = serviceState(remaining, row.next_service_due, "h");
  const openJobs = fleetJobs.filter(
    (job) =>
      isFleetJobActive(job.status) &&
      (job.plant_id === row.id || job.plant_asset_id === row.id),
  ).length;

  return (
    <>
      <DetailHero
        icon="construct-outline"
        title={plantLabel(row)}
        status={clean(row.asset_status) || "Available"}
        onEdit={onEdit}
      />

      <StatusGrid
        items={[
          {
            label: "Insurance",
            value: formatDate(row.insurance_expiry),
            state: expiryState(row.insurance_expiry),
          },
          {
            label: row.plant_type === "Crane" ? "CraneSafe" : "Rego",
            value: formatDate(
              row.plant_type === "Crane"
                ? row.cranesafe_expiry
                : row.rego_expiry,
            ),
            state: expiryState(
              row.plant_type === "Crane"
                ? row.cranesafe_expiry
                : row.rego_expiry,
            ),
          },
          {
            label: "Service",
            value: service.label,
            state: service,
          },
          {
            label: "Fleet Jobs",
            value: String(openJobs),
            state: {
              label: openJobs ? "Action Required" : "Clear",
              tone: openJobs ? "amber" : "green",
              detail: `${openJobs} active`,
            },
          },
        ]}
      />

      <DetailSection title="Current Service Position">
        <DetailRows
          rows={[
            ["Latest Prestart Hours", currentHours == null ? "No reading" : `${currentHours.toLocaleString()} h`],
            ["Next Service Hours", row.next_service_hours == null ? "Not set" : `${row.next_service_hours.toLocaleString()} h`],
            ["Remaining", remaining == null ? "Not calculated" : `${remaining.toLocaleString()} h`],
            ["Next Service Date", formatDate(row.next_service_due)],
            ["Last Service", formatDate(row.last_service_date)],
            ["Service Interval", row.service_interval_hours == null ? "Not set" : `${row.service_interval_hours.toLocaleString()} h`],
          ]}
        />
      </DetailSection>

      <DetailSection title="Plant Details">
        <DetailRows
          rows={[
            ["Asset ID", clean(row.asset_id) || "Not recorded"],
            ["Type", clean(row.plant_type) || "Not recorded"],
            ["Make / Model", [row.make, row.model].map(clean).filter(Boolean).join(" ") || "Not recorded"],
            ["Serial Number", clean(row.serial_number) || "Not recorded"],
            ["Rego", clean(row.rego) || "Not applicable"],
            ["Project", clean(row.project) || "Unallocated"],
            ["Crew", clean(row.crew) || "Unallocated"],
          ]}
        />
      </DetailSection>

      <DetailSection title="Required Setup">
        <View style={styles.setupGrid}>
          <SetupFlag label="Risk Assessment" value={row.risk_assessment} />
          <SetupFlag label="Operator Manual" value={row.operators_manual} />
          <SetupFlag label="Load Charts" value={row.load_charts} />
          <SetupFlag label="Logbook" value={row.logbook} />
          <SetupFlag label="Fire Extinguisher" value={row.fire_extinguisher} />
          <SetupFlag label="First Aid Kit" value={row.first_aid_kit} />
          <SetupFlag label="Spill Kit" value={row.spill_kit} />
        </View>
      </DetailSection>
    </>
  );
}

function EquipmentDetail({
  title,
  status,
  fields,
  onEdit,
}: {
  title: string;
  status: string;
  fields: Array<[string, string]>;
  onEdit: () => void;
}) {
  return (
    <>
      <DetailHero
        icon="build-outline"
        title={title}
        status={status}
        onEdit={onEdit}
      />
      <DetailSection title="Asset Details">
        <DetailRows rows={fields} />
      </DetailSection>
    </>
  );
}

function VehicleEditor({
  form,
  projects,
  crews,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  form: VehicleForm | null;
  projects: Project[];
  crews: Crew[];
  saving: boolean;
  onChange: React.Dispatch<React.SetStateAction<VehicleForm | null>>;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!form) return null;
  const trailer = form.category === "Trailer";

  function update<K extends keyof VehicleForm>(key: K, value: VehicleForm[K]) {
    onChange((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <EditorShell
      visible
      title={form.id ? "Edit Vehicle" : "Add Vehicle"}
      subtitle={form.vehicle_id || "Vehicle register"}
      saving={saving}
      onClose={onClose}
      onSave={onSave}
    >
      <FormSection title="Vehicle Details">
        <Field label="Vehicle ID" value={form.vehicle_id} onChangeText={(v) => update("vehicle_id", v)} />
        <Choice label="Category" options={vehicleCategories} value={form.category} onChange={(v) => update("category", v)} />
        <Field label="Rego" value={form.vehicle_rego} onChangeText={(v) => update("vehicle_rego", v)} />
        <Field label="Make" value={form.make} onChangeText={(v) => update("make", v)} />
        <Field label="Model" value={form.model} onChangeText={(v) => update("model", v)} />
        <Field label="Year" value={form.year} onChangeText={(v) => update("year", v)} keyboardType="number-pad" />
        {!trailer ? <Field label="Style" value={form.style} onChangeText={(v) => update("style", v)} /> : null}
        <Field label="VIN / Chassis" value={form.vin_number} onChangeText={(v) => update("vin_number", v)} />
        <Field label="Owner" value={form.owner} onChangeText={(v) => update("owner", v)} />
      </FormSection>

      <FormSection title="Allocation & Status">
        <SelectButtons
          label="Project"
          options={projects.map((row) => row.name)}
          value={form.project}
          onChange={(v) => update("project", v)}
          allowEmpty
        />
        <SelectButtons
          label="Crew"
          options={crews.map(crewLabel)}
          value={form.crew}
          onChange={(v) => update("crew", v)}
          allowEmpty
        />
        <Choice label="Status" options={vehicleStatuses} value={form.status} onChange={(v) => update("status", v)} />
        {form.status === "Off Hire" ? (
          <Field label="Off Hire Date" value={form.off_hire_date} onChangeText={(v) => update("off_hire_date", v)} placeholder="YYYY-MM-DD" />
        ) : null}
        {["Off Hire", "Inactive"].includes(form.status) ? (
          <TextArea label="Reason" value={form.inactive_reason} onChangeText={(v) => update("inactive_reason", v)} />
        ) : null}
      </FormSection>

      <FormSection title="Compliance & Service">
        <Field label="Rego Expiry" value={form.rego_expiry} onChangeText={(v) => update("rego_expiry", v)} placeholder="YYYY-MM-DD" />
        {!trailer ? (
          <Field label="Insurance Expiry" value={form.insurance_expiry} onChangeText={(v) => update("insurance_expiry", v)} placeholder="YYYY-MM-DD" />
        ) : null}
        {!trailer ? (
          <>
            <Field label="Last Service Date" value={form.last_service} onChangeText={(v) => update("last_service", v)} placeholder="YYYY-MM-DD" />
            <Field label="Next Service Date" value={form.next_service_due} onChangeText={(v) => update("next_service_due", v)} placeholder="YYYY-MM-DD" />
            <Field label="Next Service KM" value={form.next_service_km} onChangeText={(v) => update("next_service_km", v)} keyboardType="number-pad" />
            <Field label="Service Interval KM" value={form.service_interval_km} onChangeText={(v) => update("service_interval_km", v)} keyboardType="number-pad" />
          </>
        ) : null}
        <Field label="Next Inspection Due" value={form.next_inspection_due} onChangeText={(v) => update("next_inspection_due", v)} placeholder="YYYY-MM-DD" />
      </FormSection>

      <FormSection title="Hire & Other">
        <Toggle label="Hired Asset" value={form.hired} onChange={(v) => update("hired", v)} />
        {form.hired ? (
          <>
            <Field label="Hired From" value={form.hired_from} onChangeText={(v) => update("hired_from", v)} />
            <Field label="Hire Term" value={form.hire_term} onChangeText={(v) => update("hire_term", v)} />
          </>
        ) : null}
        <Toggle label="Spare Key Provided" value={form.spare_key_provided} onChange={(v) => update("spare_key_provided", v)} />
        {form.spare_key_provided ? (
          <Field label="Spare Key Location" value={form.spare_key_location} onChangeText={(v) => update("spare_key_location", v)} />
        ) : null}
        <TextArea label="Notes" value={form.notes} onChangeText={(v) => update("notes", v)} />
      </FormSection>
    </EditorShell>
  );
}

function PlantEditor({
  form,
  projects,
  crews,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  form: PlantForm | null;
  projects: Project[];
  crews: Crew[];
  saving: boolean;
  onChange: React.Dispatch<React.SetStateAction<PlantForm | null>>;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!form) return null;
  const crane = form.plant_type === "Crane";
  const telehandler = form.plant_type === "Telehandler";

  function update<K extends keyof PlantForm>(key: K, value: PlantForm[K]) {
    onChange((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <EditorShell
      visible
      title={form.id ? "Edit Plant" : "Add Plant"}
      subtitle={form.asset_id || "Plant register"}
      saving={saving}
      onClose={onClose}
      onSave={onSave}
    >
      <FormSection title="Plant Details">
        <Field label="Asset ID" value={form.asset_id} onChangeText={(v) => update("asset_id", v)} />
        <Choice label="Plant Type" options={plantTypes} value={form.plant_type} onChange={(v) => update("plant_type", v)} />
        <Field label="Make" value={form.make} onChangeText={(v) => update("make", v)} />
        <Field label="Model" value={form.model} onChangeText={(v) => update("model", v)} />
        <Field label="Serial Number" value={form.serial_number} onChangeText={(v) => update("serial_number", v)} />
        {!telehandler ? <Field label="Rego" value={form.rego} onChangeText={(v) => update("rego", v)} /> : null}
      </FormSection>

      <FormSection title="Allocation & Status">
        <SelectButtons label="Project" options={projects.map((row) => row.name)} value={form.project} onChange={(v) => update("project", v)} allowEmpty />
        <SelectButtons label="Crew" options={crews.map(crewLabel)} value={form.crew} onChange={(v) => update("crew", v)} allowEmpty />
        <Choice label="Status" options={plantStatuses} value={form.asset_status} onChange={(v) => update("asset_status", v)} />
        {form.asset_status === "Off Hire" ? (
          <Field label="Off Hire Date" value={form.off_hire_date} onChangeText={(v) => update("off_hire_date", v)} placeholder="YYYY-MM-DD" />
        ) : null}
        {["Off Hire", "Inactive"].includes(form.asset_status) ? (
          <TextArea label="Reason" value={form.inactive_reason} onChangeText={(v) => update("inactive_reason", v)} />
        ) : null}
      </FormSection>

      <FormSection title="Compliance & Service">
        <Field label="Insurance Expiry" value={form.insurance_expiry} onChangeText={(v) => update("insurance_expiry", v)} placeholder="YYYY-MM-DD" />
        {!telehandler ? <Field label="Rego Expiry" value={form.rego_expiry} onChangeText={(v) => update("rego_expiry", v)} placeholder="YYYY-MM-DD" /> : null}
        {crane ? <Field label="CraneSafe Expiry" value={form.cranesafe_expiry} onChangeText={(v) => update("cranesafe_expiry", v)} placeholder="YYYY-MM-DD" /> : null}
        <Field label="Last Service Date" value={form.last_service_date} onChangeText={(v) => update("last_service_date", v)} placeholder="YYYY-MM-DD" />
        <Field label="Last Service Hours" value={form.last_service_hours} onChangeText={(v) => update("last_service_hours", v)} keyboardType="number-pad" />
        <Field label="Service Interval Hours" value={form.service_interval_hours} onChangeText={(v) => update("service_interval_hours", v)} keyboardType="number-pad" />
        <Field label="Next Service Date" value={form.next_service_due} onChangeText={(v) => update("next_service_due", v)} placeholder="YYYY-MM-DD" />
        <Field label="Next Service Hours" value={form.next_service_hours} onChangeText={(v) => update("next_service_hours", v)} keyboardType="number-pad" />
        <Field label="Next Inspection Due" value={form.next_inspection_due} onChangeText={(v) => update("next_inspection_due", v)} placeholder="YYYY-MM-DD" />
      </FormSection>

      <FormSection title="Required Setup">
        <Toggle label="Risk Assessment" value={form.risk_assessment} onChange={(v) => update("risk_assessment", v)} />
        <Toggle label="Operator Manual" value={form.operators_manual} onChange={(v) => update("operators_manual", v)} />
        <Toggle label="Load Charts" value={form.load_charts} onChange={(v) => update("load_charts", v)} />
        <Toggle label="Logbook" value={form.logbook} onChange={(v) => update("logbook", v)} />
        <Toggle label="Fire Extinguisher" value={form.fire_extinguisher} onChange={(v) => update("fire_extinguisher", v)} />
        <Toggle label="First Aid Kit" value={form.first_aid_kit} onChange={(v) => update("first_aid_kit", v)} />
        <Toggle label="Spill Kit" value={form.spill_kit} onChange={(v) => update("spill_kit", v)} />
      </FormSection>

      <FormSection title="Hire & Notes">
        <Toggle label="Hired Asset" value={form.hired} onChange={(v) => update("hired", v)} />
        {form.hired ? (
          <>
            <Field label="Hired From" value={form.hired_from} onChangeText={(v) => update("hired_from", v)} />
            <Field label="Hire Term" value={form.hire_term} onChangeText={(v) => update("hire_term", v)} />
          </>
        ) : null}
        <TextArea label="Notes" value={form.notes} onChangeText={(v) => update("notes", v)} />
      </FormSection>
    </EditorShell>
  );
}

function EquipmentEditor({
  form,
  crews,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  form: EquipmentForm | null;
  crews: Crew[];
  saving: boolean;
  onChange: React.Dispatch<React.SetStateAction<EquipmentForm | null>>;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!form) return null;

  function update<K extends keyof EquipmentForm>(
    key: K,
    value: EquipmentForm[K],
  ) {
    onChange((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <EditorShell
      visible
      title={form.id ? `Edit ${form.kind}` : `Add ${form.kind}`}
      subtitle={form.asset_number || "Equipment register"}
      saving={saving}
      onClose={onClose}
      onSave={onSave}
    >
      <FormSection title="Asset Details">
        <Field
          label={
            form.kind === "Lifting Gear"
              ? "Serial ID"
              : form.kind === "Ladder"
                ? "Ladder Number"
                : "Torque Wrench Number"
          }
          value={form.asset_number}
          onChangeText={(v) => update("asset_number", v)}
          editable={form.kind === "Lifting Gear"}
        />

        {form.kind === "Torque Wrench" ? (
          <>
            <Field label="Serial Number" value={form.serial_number} onChangeText={(v) => update("serial_number", v)} />
            <Field label="Calibration Expiry" value={form.expiry_date} onChangeText={(v) => update("expiry_date", v)} placeholder="YYYY-MM-DD" />
            <Choice label="Status" options={torqueStatuses} value={form.status} onChange={(v) => update("status", v)} />
          </>
        ) : null}

        {form.kind === "Lifting Gear" ? (
          <>
            <Choice label="Equipment Type" options={liftingTypes} value={form.equipment_type} onChange={(v) => update("equipment_type", v)} />
            <TextArea label="Description" value={form.description} onChangeText={(v) => update("description", v)} />
            <Field label="Inspected On" value={form.inspected_on} onChangeText={(v) => update("inspected_on", v)} placeholder="YYYY-MM-DD" />
            <Field label="Next Inspection Due" value={form.next_inspection_due} onChangeText={(v) => update("next_inspection_due", v)} placeholder="YYYY-MM-DD" />
            <Choice label="Status" options={gearStatuses} value={form.status} onChange={(v) => update("status", v)} />
            <Choice label="Tag" options={tagOptions} value={form.tag} onChange={(v) => update("tag", v)} />
          </>
        ) : null}

        {form.kind === "Ladder" ? (
          <>
            <Field label="Make" value={form.make} onChangeText={(v) => update("make", v)} />
            <Choice label="Ladder Type" options={ladderTypes} value={form.equipment_type} onChange={(v) => update("equipment_type", v)} />
            <Field label="Height" value={form.height} onChangeText={(v) => update("height", v)} />
            <Field label="Last Internal Inspection" value={form.last_internal_inspection} onChangeText={(v) => update("last_internal_inspection", v)} placeholder="YYYY-MM-DD" />
            <Choice label="Status" options={ladderStatuses} value={form.status} onChange={(v) => update("status", v)} />
          </>
        ) : null}

        <SelectButtons label="Crew" options={crews.map((row) => row.id)} labels={new Map(crews.map((row) => [row.id, crewLabel(row)]))} value={form.crew_id} onChange={(v) => update("crew_id", v)} allowEmpty />
        <TextArea label="Notes / Comment" value={form.notes} onChangeText={(v) => update("notes", v)} />
      </FormSection>
    </EditorShell>
  );
}

function AddChooser({
  visible,
  onClose,
  onChoose,
}: {
  visible: boolean;
  onClose: () => void;
  onChoose: (kind: AssetKind) => void;
}) {
  const options: Array<{
    kind: AssetKind;
    icon: keyof typeof Ionicons.glyphMap;
    detail: string;
  }> = [
    { kind: "Vehicle", icon: "car-outline", detail: "Light vehicle, heavy vehicle or trailer" },
    { kind: "Plant", icon: "construct-outline", detail: "Crane, telehandler or other plant" },
    { kind: "Torque Wrench", icon: "build-outline", detail: "Calibration-controlled torque wrench" },
    { kind: "Lifting Gear", icon: "link-outline", detail: "Sling, shackle, harness or lifting device" },
    { kind: "Ladder", icon: "podium-outline", detail: "Step, extension or platform ladder" },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.chooser}>
          <View style={styles.chooserHeader}>
            <View>
              <Text style={styles.chooserTitle}>Add Asset</Text>
              <Text style={styles.chooserSubtitle}>Select the register type</Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={21} color="#334155" />
            </Pressable>
          </View>

          {options.map((option) => (
            <Pressable
              key={option.kind}
              style={styles.addOption}
              onPress={() => onChoose(option.kind)}
            >
              <View style={styles.addOptionIcon}>
                <Ionicons name={option.icon} size={23} color="#1D4ED8" />
              </View>
              <View style={styles.addOptionText}>
                <Text style={styles.addOptionTitle}>{option.kind}</Text>
                <Text style={styles.addOptionDetail}>{option.detail}</Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color="#94A3B8" />
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function EditorShell({
  visible,
  title,
  subtitle,
  saving,
  onClose,
  onSave,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalHeader}>
            <Pressable style={styles.backButton} onPress={onClose}>
              <Ionicons name="close" size={22} color="#334155" />
            </Pressable>
            <View style={styles.modalTitleWrap}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Text style={styles.modalSubtitle}>{subtitle}</Text>
            </View>
            <Pressable
              style={[styles.headerSave, saving && styles.disabled]}
              disabled={saving}
              onPress={onSave}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="save-outline" size={20} color="#FFFFFF" />
              )}
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.editorContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
            <Pressable
              style={[styles.saveButton, saving && styles.disabled]}
              disabled={saving}
              onPress={onSave}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.saveButtonText}>Save Asset</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function AssetCard({
  icon,
  title,
  subtitle,
  status,
  onPress,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  status: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable style={styles.assetCard} onPress={onPress}>
      <View style={styles.assetCardHeader}>
        <View style={styles.assetIcon}>
          <Ionicons name={icon} size={22} color="#1D4ED8" />
        </View>
        <View style={styles.assetCardText}>
          <Text style={styles.assetTitle}>{title}</Text>
          <Text numberOfLines={2} style={styles.assetSubtitle}>
            {subtitle || "No asset details recorded"}
          </Text>
        </View>
        <StatusPill label={status} tone={statusTone(status)} />
      </View>
      {children}
    </Pressable>
  );
}

function statusTone(status: string): Tone {
  const value = status.toLowerCase();
  if (["available", "active", "passed"].includes(value)) return "green";
  if (value.includes("maintenance") || value.includes("waiting")) return "amber";
  if (
    value.includes("failed") ||
    value.includes("out of service") ||
    value.includes("inactive") ||
    value.includes("off hire")
  ) {
    return "rose";
  }
  return "blue";
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}) {
  return (
    <View style={[styles.miniMetric, toneBackground(tone)]}>
      <Text style={styles.miniMetricLabel}>{label}</Text>
      <Text style={[styles.miniMetricValue, toneText(tone)]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  alert = false,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  alert?: boolean;
}) {
  return (
    <View style={[styles.summaryCard, alert && styles.summaryAlert]}>
      <Ionicons name={icon} size={19} color={alert ? "#BE123C" : "#1D4ED8"} />
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, alert && styles.summaryValueAlert]}>
        {value}
      </Text>
    </View>
  );
}

function DetailHero({
  icon,
  title,
  status,
  onEdit,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  status: string;
  onEdit: () => void;
}) {
  return (
    <View style={styles.detailHero}>
      <View style={styles.detailHeroTop}>
        <View style={styles.detailHeroIcon}>
          <Ionicons name={icon} size={27} color="#1D4ED8" />
        </View>
        <View style={styles.detailHeroText}>
          <Text style={styles.detailHeroTitle}>{title}</Text>
          <StatusPill label={status} tone={statusTone(status)} />
        </View>
      </View>
      <Pressable style={styles.editButton} onPress={onEdit}>
        <Ionicons name="create-outline" size={18} color="#FFFFFF" />
        <Text style={styles.editButtonText}>Edit on Phone</Text>
      </Pressable>
    </View>
  );
}

function StatusGrid({
  items,
}: {
  items: Array<{
    label: string;
    value: string;
    state: { label: string; tone: Tone; detail: string };
  }>;
}) {
  return (
    <View style={styles.statusGrid}>
      {items.map((item) => (
        <View
          key={item.label}
          style={[styles.statusCard, toneBackground(item.state.tone)]}
        >
          <Text style={styles.statusCardLabel}>{item.label}</Text>
          <Text style={styles.statusCardValue}>{item.value}</Text>
          <StatusPill label={item.state.label} tone={item.state.tone} />
          <Text style={styles.statusCardDetail}>{item.state.detail}</Text>
        </View>
      ))}
    </View>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.detailSection}>
      <Text style={styles.detailSectionTitle}>{title}</Text>
      <View style={styles.detailSectionBody}>{children}</View>
    </View>
  );
}

function DetailRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <View>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.detailRow}>
          <Text style={styles.detailRowLabel}>{label}</Text>
          <Text style={styles.detailRowValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function SetupFlag({
  label,
  value,
}: {
  label: string;
  value?: boolean | null;
}) {
  return (
    <View
      style={[
        styles.setupFlag,
        value ? styles.setupFlagGood : styles.setupFlagMissing,
      ]}
    >
      <Ionicons
        name={value ? "checkmark-circle-outline" : "close-circle-outline"}
        size={18}
        color={value ? "#15803D" : "#BE123C"}
      />
      <Text style={styles.setupFlagText}>{label}</Text>
    </View>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.formSection}>
      <Text style={styles.formSectionTitle}>{title}</Text>
      <View style={styles.formSectionBody}>{children}</View>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "decimal-pad";
  editable?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={[styles.input, !editable && styles.inputDisabled]}
        placeholder={placeholder || label}
        placeholderTextColor="#94A3B8"
        keyboardType={keyboardType}
        editable={editable}
      />
    </View>
  );
}

function TextArea({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={styles.textArea}
        multiline
        textAlignVertical="top"
        placeholder={label}
        placeholderTextColor="#94A3B8"
      />
    </View>
  );
}

function Choice({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choiceGrid}>
        {options.map((option) => (
          <Pressable
            key={option}
            style={[
              styles.choiceButton,
              value === option && styles.choiceButtonActive,
            ]}
            onPress={() => onChange(option)}
          >
            <Text
              style={[
                styles.choiceText,
                value === option && styles.choiceTextActive,
              ]}
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SelectButtons({
  label,
  options,
  labels,
  value,
  onChange,
  allowEmpty = false,
}: {
  label: string;
  options: string[];
  labels?: Map<string, string>;
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.selectButtons}
      >
        {allowEmpty ? (
          <Pressable
            style={[
              styles.selectButton,
              !value && styles.selectButtonActive,
            ]}
            onPress={() => onChange("")}
          >
            <Text
              style={[
                styles.selectButtonText,
                !value && styles.selectButtonTextActive,
              ]}
            >
              Unallocated
            </Text>
          </Pressable>
        ) : null}
        {options.map((option) => (
          <Pressable
            key={option}
            style={[
              styles.selectButton,
              value === option && styles.selectButtonActive,
            ]}
            onPress={() => onChange(option)}
          >
            <Text
              style={[
                styles.selectButtonText,
                value === option && styles.selectButtonTextActive,
              ]}
            >
              {labels?.get(option) || option}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      style={[styles.toggleRow, value && styles.toggleRowActive]}
      onPress={() => onChange(!value)}
    >
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={[styles.toggle, value && styles.toggleActive]}>
        <View style={[styles.toggleKnob, value && styles.toggleKnobActive]} />
      </View>
    </Pressable>
  );
}

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <View style={[styles.pill, toneBackground(tone)]}>
      <Text style={[styles.pillText, toneText(tone)]}>{label}</Text>
    </View>
  );
}

function toneBackground(tone: Tone) {
  if (tone === "green") return { backgroundColor: "#F0FDF4", borderColor: "#86EFAC" };
  if (tone === "amber") return { backgroundColor: "#FFFBEB", borderColor: "#FCD34D" };
  if (tone === "rose") return { backgroundColor: "#FFF1F2", borderColor: "#FDA4AF" };
  if (tone === "blue") return { backgroundColor: "#EFF6FF", borderColor: "#93C5FD" };
  if (tone === "violet") return { backgroundColor: "#F5F3FF", borderColor: "#C4B5FD" };
  return { backgroundColor: "#F8FAFC", borderColor: "#CBD5E1" };
}

function toneText(tone: Tone) {
  if (tone === "green") return { color: "#166534" };
  if (tone === "amber") return { color: "#92400E" };
  if (tone === "rose") return { color: "#BE123C" };
  if (tone === "blue") return { color: "#1D4ED8" };
  if (tone === "violet") return { color: "#6D28D9" };
  return { color: "#475569" };
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="cube-outline" size={29} color="#64748B" />
      </View>
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
  headerIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, marginLeft: 10 },
  pageTitle: { color: "#0F172A", fontSize: 20, fontWeight: "900" },
  pageSubtitle: { color: "#64748B", fontSize: 11, marginTop: 2 },
  addButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center", marginRight: 7 },
  refreshButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  projectStrip: { flexDirection: "row", alignItems: "center", borderRadius: 12, backgroundColor: "#F1F5F9", padding: 9, marginTop: 9 },
  projectText: { flex: 1 },
  projectLabel: { color: "#64748B", fontSize: 8, fontWeight: "900" },
  projectValue: { color: "#0F172A", fontSize: 11, fontWeight: "800", marginTop: 2 },
  scopeButton: { borderRadius: 999, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", paddingHorizontal: 12, paddingVertical: 7 },
  scopeButtonActive: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  scopeButtonText: { color: "#475569", fontSize: 9, fontWeight: "900" },
  scopeButtonTextActive: { color: "#FFFFFF" },

  listContent: { padding: 12, paddingBottom: 100 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 10 },
  summaryCard: { width: "48.7%", minHeight: 72, borderRadius: 14, borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: "#EFF6FF", padding: 10 },
  summaryAlert: { borderColor: "#FECDD3", backgroundColor: "#FFF1F2" },
  summaryLabel: { color: "#64748B", fontSize: 8, fontWeight: "900", marginTop: 5, textTransform: "uppercase" },
  summaryValue: { color: "#1E3A8A", fontSize: 20, fontWeight: "900", marginTop: 2 },
  summaryValueAlert: { color: "#9F1239" },

  registerTabs: { gap: 6, paddingVertical: 7 },
  registerTab: { minHeight: 36, borderRadius: 999, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  registerTabActive: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  registerTabText: { color: "#64748B", fontSize: 10, fontWeight: "900" },
  registerTabTextActive: { color: "#FFFFFF" },

  searchBox: { minHeight: 44, flexDirection: "row", alignItems: "center", borderRadius: 13, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", paddingHorizontal: 11 },
  searchInput: { flex: 1, color: "#0F172A", fontSize: 13, marginHorizontal: 8 },
  registerHeading: { flexDirection: "row", alignItems: "center", marginVertical: 10 },
  registerTitle: { flex: 1, color: "#0F172A", fontSize: 16, fontWeight: "900" },
  registerCount: { color: "#64748B", fontSize: 10, fontWeight: "800" },

  assetCard: { borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", padding: 12, marginBottom: 9 },
  assetCardHeader: { flexDirection: "row", alignItems: "flex-start" },
  assetIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" },
  assetCardText: { flex: 1, marginHorizontal: 9 },
  assetTitle: { color: "#0F172A", fontSize: 13, fontWeight: "900" },
  assetSubtitle: { color: "#64748B", fontSize: 9, lineHeight: 14, marginTop: 3 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  miniMetric: { width: "48.7%", minHeight: 58, borderRadius: 11, borderWidth: 1, padding: 8 },
  miniMetricLabel: { color: "#64748B", fontSize: 7, fontWeight: "900", textTransform: "uppercase" },
  miniMetricValue: { fontSize: 10, fontWeight: "900", marginTop: 4 },
  cardFooter: { flexDirection: "row", alignItems: "center", marginTop: 9 },
  cardFooterText: { flex: 1, color: "#64748B", fontSize: 9, fontWeight: "700" },

  pill: { alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  pillText: { fontSize: 8, fontWeight: "900" },

  modalHeader: { minHeight: 58, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#E2E8F0", backgroundColor: "#FFFFFF", paddingHorizontal: 12 },
  backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" },
  modalTitleWrap: { flex: 1, marginHorizontal: 8 },
  modalTitle: { color: "#0F172A", fontSize: 17, fontWeight: "900", textAlign: "center" },
  modalSubtitle: { color: "#64748B", fontSize: 9, textAlign: "center", marginTop: 2 },
  modalSpacer: { width: 40 },
  headerSave: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" },

  detailContent: { padding: 12, paddingBottom: 60 },
  detailHero: { borderRadius: 17, borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: "#EFF6FF", padding: 13, marginBottom: 10 },
  detailHeroTop: { flexDirection: "row", alignItems: "center" },
  detailHeroIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" },
  detailHeroText: { flex: 1, marginLeft: 10, gap: 6 },
  detailHeroTitle: { color: "#0F172A", fontSize: 15, fontWeight: "900" },
  editButton: { minHeight: 45, borderRadius: 12, backgroundColor: "#0F172A", flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 12 },
  editButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900", marginLeft: 7 },

  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 10 },
  statusCard: { width: "48.7%", minHeight: 130, borderRadius: 14, borderWidth: 1, padding: 10 },
  statusCardLabel: { color: "#64748B", fontSize: 8, fontWeight: "900", textTransform: "uppercase" },
  statusCardValue: { color: "#0F172A", fontSize: 13, fontWeight: "900", marginVertical: 7 },
  statusCardDetail: { color: "#64748B", fontSize: 8, fontWeight: "700", marginTop: 6 },

  detailSection: { borderRadius: 17, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", padding: 13, marginBottom: 10 },
  detailSectionTitle: { color: "#0F172A", fontSize: 14, fontWeight: "900" },
  detailSectionBody: { marginTop: 10 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", borderBottomWidth: 1, borderBottomColor: "#F1F5F9", paddingVertical: 9 },
  detailRowLabel: { width: "42%", color: "#64748B", fontSize: 9, fontWeight: "800" },
  detailRowValue: { flex: 1, color: "#0F172A", fontSize: 10, fontWeight: "800", textAlign: "right" },
  setupGrid: { gap: 7 },
  setupFlag: { minHeight: 42, borderRadius: 11, borderWidth: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 10 },
  setupFlagGood: { borderColor: "#86EFAC", backgroundColor: "#F0FDF4" },
  setupFlagMissing: { borderColor: "#FDA4AF", backgroundColor: "#FFF1F2" },
  setupFlagText: { color: "#334155", fontSize: 10, fontWeight: "800", marginLeft: 7 },

  editorContent: { padding: 12, paddingBottom: 60 },
  formSection: { borderRadius: 17, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", padding: 13, marginBottom: 10 },
  formSectionTitle: { color: "#0F172A", fontSize: 14, fontWeight: "900" },
  formSectionBody: { marginTop: 11 },
  field: { marginBottom: 11 },
  fieldLabel: { color: "#475569", fontSize: 10, fontWeight: "800", marginBottom: 5 },
  input: { minHeight: 47, borderRadius: 13, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", color: "#0F172A", fontSize: 13, paddingHorizontal: 12 },
  inputDisabled: { backgroundColor: "#F1F5F9", color: "#64748B" },
  textArea: { minHeight: 100, borderRadius: 13, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", color: "#0F172A", fontSize: 12, padding: 11 },

  choiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choiceButton: { width: "48.7%", minHeight: 40, borderRadius: 11, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  choiceButtonActive: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  choiceText: { color: "#475569", fontSize: 9, fontWeight: "900", textAlign: "center" },
  choiceTextActive: { color: "#FFFFFF" },

  selectButtons: { gap: 6 },
  selectButton: { minHeight: 38, borderRadius: 999, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  selectButtonActive: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  selectButtonText: { color: "#475569", fontSize: 9, fontWeight: "800" },
  selectButtonTextActive: { color: "#FFFFFF" },

  toggleRow: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", paddingHorizontal: 11, marginBottom: 8 },
  toggleRowActive: { borderColor: "#86EFAC", backgroundColor: "#F0FDF4" },
  toggleLabel: { flex: 1, color: "#334155", fontSize: 10, fontWeight: "800" },
  toggle: { width: 42, height: 24, borderRadius: 999, backgroundColor: "#CBD5E1", padding: 3 },
  toggleActive: { backgroundColor: "#22C55E" },
  toggleKnob: { width: 18, height: 18, borderRadius: 999, backgroundColor: "#FFFFFF" },
  toggleKnobActive: { marginLeft: 18 },

  saveButton: { minHeight: 50, borderRadius: 14, backgroundColor: "#0F172A", flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 2 },
  saveButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900", marginLeft: 7 },
  disabled: { opacity: 0.45 },

  overlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.55)", justifyContent: "flex-end" },
  chooser: { borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: "#FFFFFF", padding: 16, paddingBottom: 32 },
  chooserHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  chooserTitle: { color: "#0F172A", fontSize: 19, fontWeight: "900" },
  chooserSubtitle: { color: "#64748B", fontSize: 10, marginTop: 2 },
  closeButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center", marginLeft: "auto" },
  addOption: { minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", flexDirection: "row", alignItems: "center", padding: 10, marginTop: 8 },
  addOptionIcon: { width: 43, height: 43, borderRadius: 13, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" },
  addOptionText: { flex: 1, marginHorizontal: 9 },
  addOptionTitle: { color: "#0F172A", fontSize: 12, fontWeight: "900" },
  addOptionDetail: { color: "#64748B", fontSize: 9, marginTop: 3 },

  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 50, paddingHorizontal: 30 },
  emptyIcon: { width: 60, height: 60, borderRadius: 20, backgroundColor: "#E2E8F0", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: "#0F172A", fontSize: 16, fontWeight: "900", marginTop: 12 },
  emptyText: { color: "#64748B", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 5 },
});

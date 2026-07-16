import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

type AssetType = "Vehicle" | "Plant";
type FormStep = "details" | "checklist" | "review";
type HistoryFilter = "All" | "Vehicle" | "Plant" | "Passed" | "Issues";

type RawVehicleAsset = {
  id: string;
  vehicle_id?: string | null;
  vehicle_rego?: string | null;
  rego?: string | null;
  make?: string | null;
  model?: string | null;
  category?: string | null;
  project?: string | null;
  crew?: string | null;
  status?: string | null;
};

type RawPlantAsset = {
  id: string;
  asset_id?: string | null;
  make?: string | null;
  model?: string | null;
  plant_type?: string | null;
  serial_number?: string | null;
  rego?: string | null;
  crew?: string | null;
  project?: string | null;
  asset_status?: string | null;
};

type PrestartAsset = {
  id: string;
  assetType: AssetType;
  assetId: string;
  rego: string;
  makeModel: string;
  category: string;
  project: string;
  crew: string;
  status: string;
  serialNumber: string;
};

type ChecklistValue = {
  answer: "yes" | "no" | "na";
  severity: "minor" | "moderate" | "major" | "do_not_use";
  comment: string;
};

type ChecklistAnswer =
  | string
  | {
      answer?: string;
      severity?: string;
      comment?: string;
    };

type PrestartRecord = {
  id: string;
  docket_number: string | null;
  asset_type: string | null;
  vehicle_asset_id: string | null;
  plant_asset_id: string | null;
  asset_label: string | null;
  vehicle_rego: string | null;
  asset_category: string | null;
  kilometres: number | null;
  cab_hours: number | null;
  project: string | null;
  crew: string | null;
  inspected_by_name: string | null;
  checklist: Record<string, ChecklistAnswer> | null;
  overall_condition: string | null;
  comments: string | null;
  severity: string | null;
  result: string | null;
  fleet_job_id: string | null;
  fleet_job_number: string | null;
  prestart_date: string | null;
  created_at: string | null;
  updated_at?: string | null;
};

type Employee = {
  id: string;
  full_name: string;
  role?: string | null;
  active?: boolean | null;
  email?: string | null;
  user_id?: string | null;
};

type FleetJobInsertResult = {
  id: string;
  job_number: string | null;
};

type SelectorOption = {
  id: string;
  label: string;
  subtitle?: string;
};

type ChecklistSection = {
  title: string;
  items: readonly string[];
};

const ASSIGNED_VEHICLE_KEY = "tttracker.mobile.assigned_vehicle_id";
const ASSIGNED_PLANT_KEY = "tttracker.mobile.assigned_plant_id";
const REMINDER_ENABLED_KEY = "tttracker.mobile.prestart_reminder";
const REMINDER_NOTIFICATION_KEY = "tttracker.mobile.prestart_notification_ids";

const vehicleChecklistSections: readonly ChecklistSection[] = [
  {
    title: "Vehicle Condition",
    items: ["Tyres", "Doors", "Windows", "Mirrors", "Wipers"],
  },
  {
    title: "Lights & Alarms",
    items: [
      "Park lights",
      "Head lights",
      "Reverse lights",
      "Indicators",
      "Brake lights",
      "Beacon lights",
      "Reverse alarm",
      "Horn",
    ],
  },
  {
    title: "Driver Controls",
    items: [
      "Steering",
      "Foot brake",
      "Reverse camera",
      "Seats and seat belts",
      "AC / Heater",
      "Instruments",
    ],
  },
  {
    title: "Safety Equipment",
    items: ["Fire extinguisher", "First aid kit", "Wheel chocks"],
  },
  {
    title: "Communications",
    items: ["UHF radio working", "IVMS working"],
  },
  {
    title: "Mechanical",
    items: ["Battery", "Engine oil", "Coolant"],
  },
  {
    title: "Transport Compliance",
    items: ["Spare wheel"],
  },
];

const plantChecklistSections: readonly ChecklistSection[] = [
  {
    title: "Engine",
    items: [
      "Engine oil level",
      "Coolant level",
      "Fuel water drain",
      "Brake fluid level",
      "Battery condition",
      "Air filter",
      "V-belts",
    ],
  },
  {
    title: "Carrier",
    items: [
      "Tyres",
      "Wheel nuts",
      "Fuel level",
      "Air tank drain",
      "Steering function",
      "Brake function",
      "Carrier lubrication",
      "Lights horn and gauges",
    ],
  },
  {
    title: "Crane / Plant Functions",
    items: [
      "Slew function",
      "Boom raise and lower",
      "Boom extend and retract",
      "Winches",
      "Wire ropes",
      "Sheaves",
      "Anti-two-block",
      "Load indicator",
      "Outriggers",
      "Plant lubrication",
      "Structural components",
    ],
  },
  {
    title: "Hydraulics",
    items: [
      "Hydraulic oil level",
      "Hydraulic line leaks",
      "Hydraulic cylinder leaks",
    ],
  },
];

const severityOptions = [
  { value: "minor", label: "Minor" },
  { value: "moderate", label: "Moderate" },
  { value: "major", label: "Major" },
  { value: "do_not_use", label: "Do Not Use" },
] as const;

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function checklistKey(label: string): string {
  return label
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("/", "_")
    .replaceAll("-", "_");
}

function makeModel(make?: string | null, model?: string | null): string {
  return [clean(make), clean(model)].filter(Boolean).join(" ");
}

function mapVehicle(vehicle: RawVehicleAsset): PrestartAsset {
  return {
    id: vehicle.id,
    assetType: "Vehicle",
    assetId: clean(vehicle.vehicle_id) || "Vehicle",
    rego: clean(vehicle.vehicle_rego) || clean(vehicle.rego),
    makeModel: makeModel(vehicle.make, vehicle.model),
    category: clean(vehicle.category) || "Vehicle",
    project: clean(vehicle.project),
    crew: clean(vehicle.crew),
    status: clean(vehicle.status),
    serialNumber: "",
  };
}

function mapPlant(asset: RawPlantAsset): PrestartAsset {
  return {
    id: asset.id,
    assetType: "Plant",
    assetId: clean(asset.asset_id) || "Plant",
    rego: clean(asset.rego),
    makeModel: makeModel(asset.make, asset.model),
    category: clean(asset.plant_type) || "Plant",
    project: clean(asset.project),
    crew: clean(asset.crew),
    status: clean(asset.asset_status),
    serialNumber: clean(asset.serial_number),
  };
}

function getAssetLabel(asset?: PrestartAsset | null): string {
  if (!asset) return "No asset selected";

  return [asset.assetId, asset.rego, asset.makeModel]
    .filter(Boolean)
    .join(" · ");
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function prestartDateValue(prestart: PrestartRecord): string | null {
  return prestart.prestart_date || prestart.created_at;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isToday(value?: string | null): boolean {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return date.toISOString().slice(0, 10) === todayDate();
}

function daysSince(value?: string | null): number | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

function severityLabel(value?: string | null): string {
  if (value === "none") return "No Issues";
  if (value === "minor") return "Minor";
  if (value === "moderate") return "Moderate";
  if (value === "major") return "Major";
  if (value === "do_not_use") return "Do Not Use";
  return "Unknown";
}

function severityToPriority(value: string): string {
  if (value === "minor") return "Low";
  if (value === "moderate") return "Medium";
  if (value === "major") return "High";
  if (value === "do_not_use") return "Critical";
  return "Low";
}

function severityToResult(value: string): string {
  if (value === "none") return "Passed";
  if (value === "do_not_use") return "Do Not Use";
  return "Issue Raised";
}

function highestSeverity(values: string[]): string {
  const rank: Record<string, number> = {
    none: 0,
    minor: 1,
    moderate: 2,
    major: 3,
    do_not_use: 4,
  };

  return values.reduce(
    (highest, current) =>
      (rank[current] ?? 0) > (rank[highest] ?? 0) ? current : highest,
    "none",
  );
}

function getChecklistAnswer(value: ChecklistAnswer | undefined): string {
  if (!value) return "na";
  if (typeof value === "string") return value;
  return value.answer || "na";
}

function getChecklistSeverity(
  value: ChecklistAnswer | undefined,
): string | null {
  if (!value || typeof value === "string") return null;
  return value.severity || null;
}

function getChecklistComment(value: ChecklistAnswer | undefined): string {
  if (!value || typeof value === "string") return "";
  return value.comment || "";
}

function matchesText(...values: unknown[]): string {
  return values
    .map((value) => clean(value))
    .join(" ")
    .toLowerCase();
}

function getChecklistSections(assetType: AssetType): readonly ChecklistSection[] {
  return assetType === "Plant"
    ? plantChecklistSections
    : vehicleChecklistSections;
}

function createDefaultChecklist(
  assetType: AssetType,
): Record<string, ChecklistValue> {
  return getChecklistSections(assetType)
    .flatMap((section) => [...section.items])
    .reduce<Record<string, ChecklistValue>>((accumulator, item) => {
      accumulator[checklistKey(item)] = {
        answer: "yes",
        severity: "minor",
        comment: "",
      };
      return accumulator;
    }, {});
}

function projectMatches(
  assetProject: string,
  projectName: string,
  projectNumber: string,
): boolean {
  const value = assetProject.toLowerCase();
  const name = projectName.toLowerCase();
  const number = projectNumber.toLowerCase();

  if (!value) return true;

  return (
    value === name ||
    value === number ||
    Boolean(name && value.includes(name)) ||
    Boolean(number && value.includes(number))
  );
}

async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();

  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function getStoredNotificationIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(REMINDER_NOTIFICATION_KEY);

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function cancelScheduledReminders(): Promise<void> {
  const ids = await getStoredNotificationIds();

  await Promise.all(
    ids.map(async (id) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch {
        // Reminder may already have fired or been removed.
      }
    }),
  );

  await AsyncStorage.removeItem(REMINDER_NOTIFICATION_KEY);
}

async function scheduleDailyReminders(
  assignedAssets: PrestartAsset[],
): Promise<boolean> {
  const permissionGranted = await requestNotificationPermission();

  if (!permissionGranted) return false;

  await cancelScheduledReminders();

  const notificationIds: string[] = [];

  for (const asset of assignedAssets) {
    const notificationId =
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${asset.assetType} prestart reminder`,
          body: `Complete today's prestart for ${getAssetLabel(asset)}.`,
          data: {
            screen: "vehicle-prestart",
            assetType: asset.assetType,
            assetId: asset.id,
          },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 6,
          minute: asset.assetType === "Vehicle" ? 0 : 2,
        },
      });

    notificationIds.push(notificationId);
  }

  await AsyncStorage.setItem(
    REMINDER_NOTIFICATION_KEY,
    JSON.stringify(notificationIds),
  );

  return true;
}

export default function VehiclePrestartScreen() {
  const { profile } = useAuth();

  const profileRecord = profile as unknown as
    | {
        fullName?: string | null;
        name?: string | null;
        email?: string | null;
        employeeId?: string | null;
        crew?: string | null;
        projectId?: string | null;
        projectName?: string | null;
        projectNumber?: string | null;
      }
    | null;

  const projectId = clean(profileRecord?.projectId);
  const projectName = clean(profileRecord?.projectName);
  const projectNumber = clean(profileRecord?.projectNumber);

  const [vehicles, setVehicles] = useState<PrestartAsset[]>([]);
  const [plantAssets, setPlantAssets] = useState<PrestartAsset[]>([]);
  const [myPrestarts, setMyPrestarts] = useState<PrestartRecord[]>([]);

  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [inspectorName, setInspectorName] = useState("");

  const [assignedVehicleId, setAssignedVehicleId] = useState("");
  const [assignedPlantId, setAssignedPlantId] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(true);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [historySearch, setHistorySearch] = useState("");
  const [historyFilter, setHistoryFilter] =
    useState<HistoryFilter>("All");

  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorTitle, setSelectorTitle] = useState("");
  const [selectorOptions, setSelectorOptions] =
    useState<SelectorOption[]>([]);
  const [selectorAction, setSelectorAction] = useState<
    ((option: SelectorOption) => void) | null
  >(null);

  const [formVisible, setFormVisible] = useState(false);
  const [formStep, setFormStep] = useState<FormStep>("details");
  const [selectedAssetType, setSelectedAssetType] =
    useState<AssetType>("Vehicle");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [meterReading, setMeterReading] = useState("");
  const [prestartDate, setPrestartDate] = useState(todayDate());
  const [overallCondition, setOverallCondition] = useState("Good");
  const [generalComments, setGeneralComments] = useState("");
  const [checklist, setChecklist] = useState<
    Record<string, ChecklistValue>
  >(createDefaultChecklist("Vehicle"));

  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedPrestart, setSelectedPrestart] =
    useState<PrestartRecord | null>(null);

  const allAssets = useMemo(
    () => [...vehicles, ...plantAssets],
    [plantAssets, vehicles],
  );

  const assignedVehicle = vehicles.find(
    (asset) => asset.id === assignedVehicleId,
  );
  const assignedPlant = plantAssets.find(
    (asset) => asset.id === assignedPlantId,
  );

  const selectedAssets = selectedAssetType === "Vehicle"
    ? vehicles
    : plantAssets;

  const selectedAsset = selectedAssets.find(
    (asset) => asset.id === selectedAssetId,
  );

  const checklistSections = useMemo(
    () => getChecklistSections(selectedAssetType),
    [selectedAssetType],
  );

  const loadIdentity = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    setCurrentUserId(user?.id ?? "");
    setCurrentUserEmail(user?.email ?? "");

    const profileName =
      clean(profileRecord?.fullName) ||
      clean(profileRecord?.name);

    if (profileName) setInspectorName(profileName);
  }, [profileRecord?.fullName, profileRecord?.name]);

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);

    const [
      vehicleResponse,
      plantResponse,
      employeeResponse,
      prestartResponse,
      assignedVehicle,
      assignedPlant,
      reminderValue,
    ] = await Promise.all([
      supabase
        .from("vehicle_assets")
        .select("*")
        .order("vehicle_id", { ascending: true }),

      supabase
        .from("plant_assets")
        .select("*")
        .order("asset_id", { ascending: true }),

      supabase
        .from("employees")
        .select("*")
        .order("full_name", { ascending: true }),

      supabase
        .from("vehicle_prestarts")
        .select("*")
        .order("prestart_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500),

      AsyncStorage.getItem(ASSIGNED_VEHICLE_KEY),
      AsyncStorage.getItem(ASSIGNED_PLANT_KEY),
      AsyncStorage.getItem(REMINDER_ENABLED_KEY),
    ]);

    const mappedVehicles = (
      (vehicleResponse.data ?? []) as RawVehicleAsset[]
    )
      .filter(
        (vehicle) =>
          clean(vehicle.category).toLowerCase() !== "trailer",
      )
      .filter(
        (vehicle) =>
          !["retired", "disposed", "no longer hired"].includes(
            clean(vehicle.status).toLowerCase(),
          ),
      )
      .map(mapVehicle)
      .filter((asset) =>
        projectId
          ? projectMatches(asset.project, projectName, projectNumber)
          : false,
      );

    const mappedPlant = (
      (plantResponse.data ?? []) as RawPlantAsset[]
    )
      .filter(
        (asset) =>
          !["retired", "disposed", "no longer hired"].includes(
            clean(asset.asset_status).toLowerCase(),
          ),
      )
      .map(mapPlant)
      .filter((asset) =>
        projectId
          ? projectMatches(asset.project, projectName, projectNumber)
          : false,
      );

    const activeEmployees = (
      (employeeResponse.data ?? []) as Employee[]
    ).filter(
      (employee) =>
        employee.active !== false &&
        clean(employee.full_name).length > 0,
    );

    setVehicles(mappedVehicles);
    setPlantAssets(mappedPlant);
    setAssignedVehicleId(
      assignedVehicle &&
        mappedVehicles.some((asset) => asset.id === assignedVehicle)
        ? assignedVehicle
        : "",
    );
    setAssignedPlantId(
      assignedPlant &&
        mappedPlant.some((asset) => asset.id === assignedPlant)
        ? assignedPlant
        : "",
    );
    setReminderEnabled(reminderValue !== "false");

    const identityName =
      clean(profileRecord?.fullName) ||
      clean(profileRecord?.name);

    const email =
      currentUserEmail ||
      clean(profileRecord?.email);

    const matchingEmployee = activeEmployees.find((employee) => {
      if (
        currentUserId &&
        clean(employee.user_id) === currentUserId
      ) {
        return true;
      }

      if (
        email &&
        clean(employee.email).toLowerCase() === email.toLowerCase()
      ) {
        return true;
      }

      if (
        identityName &&
        clean(employee.full_name).toLowerCase() ===
          identityName.toLowerCase()
      ) {
        return true;
      }

      return false;
    });

    const resolvedInspectorName =
      identityName ||
      matchingEmployee?.full_name ||
      inspectorName;

    if (resolvedInspectorName) {
      setInspectorName(resolvedInspectorName);
    }

    const allPrestarts =
      (prestartResponse.data ?? []) as PrestartRecord[];

    const filtered = resolvedInspectorName
      ? allPrestarts.filter((prestart) => {
          const inspectorMatches =
            clean(prestart.inspected_by_name).toLowerCase() ===
            resolvedInspectorName.toLowerCase();

          if (!inspectorMatches || !projectId) return false;

          return projectMatches(
            clean(prestart.project),
            projectName,
            projectNumber,
          );
        })
      : [];

    setMyPrestarts(filtered);

    if (showLoader) setLoading(false);
  }, [
    currentUserEmail,
    currentUserId,
    inspectorName,
    profileRecord?.email,
    profileRecord?.fullName,
    profileRecord?.name,
    projectId,
    projectName,
    projectNumber,
  ]);

  useEffect(() => {
    void loadIdentity();
  }, [loadIdentity]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel("mobile-prestarts-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicle_prestarts",
        },
        () => {
          void loadData(false);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fleet_jobs",
        },
        () => {
          void loadData(false);
        },
      )
      .subscribe();

    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") {
          void loadData(false);
        }
      },
    );

    return () => {
      appStateSubscription.remove();
      void supabase.removeChannel(channel);
    };
  }, [loadData]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(false);
    setRefreshing(false);
  }, [loadData]);

  const assignedVehiclePrestart = useMemo(() => {
    if (!assignedVehicleId) return null;

    return myPrestarts.find(
      (prestart) =>
        prestart.asset_type === "Vehicle" &&
        prestart.vehicle_asset_id === assignedVehicleId,
    ) ?? null;
  }, [assignedVehicleId, myPrestarts]);

  const assignedPlantPrestart = useMemo(() => {
    if (!assignedPlantId) return null;

    return myPrestarts.find(
      (prestart) =>
        prestart.asset_type === "Plant" &&
        prestart.plant_asset_id === assignedPlantId,
    ) ?? null;
  }, [assignedPlantId, myPrestarts]);

  const assignedReminderItems = useMemo(() => {
    return [
      assignedVehicle
        ? {
            asset: assignedVehicle,
            latest: assignedVehiclePrestart,
          }
        : null,
      assignedPlant
        ? {
            asset: assignedPlant,
            latest: assignedPlantPrestart,
          }
        : null,
    ].filter(
      (
        item,
      ): item is {
        asset: PrestartAsset;
        latest: PrestartRecord | null;
      } => Boolean(item),
    );
  }, [
    assignedPlant,
    assignedPlantPrestart,
    assignedVehicle,
    assignedVehiclePrestart,
  ]);

  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase();

    return myPrestarts.filter((prestart) => {
      const assetType =
        clean(prestart.asset_type) === "Plant" ? "Plant" : "Vehicle";
      const hasIssues =
        clean(prestart.severity) !== "none" &&
        clean(prestart.severity) !== "";

      if (historyFilter === "Vehicle" && assetType !== "Vehicle") {
        return false;
      }

      if (historyFilter === "Plant" && assetType !== "Plant") {
        return false;
      }

      if (historyFilter === "Passed" && hasIssues) return false;
      if (historyFilter === "Issues" && !hasIssues) return false;

      if (!query) return true;

      return matchesText(
        prestart.docket_number,
        prestart.asset_type,
        prestart.asset_label,
        prestart.vehicle_rego,
        prestart.asset_category,
        prestart.result,
        prestart.severity,
        prestart.comments,
        prestart.fleet_job_number,
        prestart.prestart_date,
      ).includes(query);
    });
  }, [historyFilter, historySearch, myPrestarts]);

  const weeklyStats = useMemo(() => {
    const thisWeek = myPrestarts.filter((prestart) => {
      const days = daysSince(prestartDateValue(prestart));
      return days !== null && days <= 7;
    });

    return {
      submitted: thisWeek.length,
      vehicle: thisWeek.filter(
        (prestart) => clean(prestart.asset_type) !== "Plant",
      ).length,
      plant: thisWeek.filter(
        (prestart) => clean(prestart.asset_type) === "Plant",
      ).length,
      issues: thisWeek.filter(
        (prestart) =>
          clean(prestart.severity) !== "none" &&
          clean(prestart.severity) !== "",
      ).length,
    };
  }, [myPrestarts]);

  const failedItems = useMemo(() => {
    return checklistSections
      .flatMap((section) => [...section.items])
      .filter(
        (item) =>
          checklist[checklistKey(item)]?.answer === "no",
      );
  }, [checklist, checklistSections]);

  const formSeverity = useMemo(() => {
    if (failedItems.length === 0) return "none";

    return highestSeverity(
      failedItems.map(
        (item) =>
          checklist[checklistKey(item)]?.severity || "minor",
      ),
    );
  }, [checklist, failedItems]);

  function openSelector(
    title: string,
    options: SelectorOption[],
    onSelect: (option: SelectorOption) => void,
  ) {
    setSelectorTitle(title);
    setSelectorOptions(options);
    setSelectorAction(() => onSelect);
    setSelectorVisible(true);
  }

  function openAssignmentSelector(assetType: AssetType) {
    if (!projectId) {
      Alert.alert(
        "No project selected",
        "Return to Home and select a current project first.",
      );
      return;
    }

    const assets = assetType === "Vehicle" ? vehicles : plantAssets;

    openSelector(
      `Assign ${assetType}`,
      assets.map((asset) => ({
        id: asset.id,
        label: getAssetLabel(asset),
        subtitle: [
          asset.category,
          asset.project,
          asset.crew,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
      (option) => {
        void assignAsset(assetType, option.id);
      },
    );
  }

  function openFormAssetSelector() {
    const assets = selectedAssetType === "Vehicle"
      ? vehicles
      : plantAssets;

    openSelector(
      `Select ${selectedAssetType}`,
      assets.map((asset) => ({
        id: asset.id,
        label: getAssetLabel(asset),
        subtitle: [
          asset.category,
          asset.project,
          asset.crew,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
      (option) => {
        setSelectedAssetId(option.id);
      },
    );
  }

  async function rescheduleAssignedAssets(
    nextVehicleId = assignedVehicleId,
    nextPlantId = assignedPlantId,
  ) {
    if (!reminderEnabled) return;

    const nextAssignedAssets = allAssets.filter(
      (asset) =>
        asset.id === nextVehicleId ||
        asset.id === nextPlantId,
    );

    const scheduled = await scheduleDailyReminders(nextAssignedAssets);

    if (!scheduled) {
      Alert.alert(
        "Notification permission required",
        "The assignment was saved, but notifications were not enabled. The reminder will still appear inside the app.",
      );
    }
  }

  async function assignAsset(assetType: AssetType, assetId: string) {
    const asset = allAssets.find(
      (item) =>
        item.assetType === assetType &&
        item.id === assetId,
    );

    if (!asset) return;

    if (assetType === "Vehicle") {
      setAssignedVehicleId(assetId);
      await AsyncStorage.setItem(ASSIGNED_VEHICLE_KEY, assetId);
      await rescheduleAssignedAssets(assetId, assignedPlantId);
    } else {
      setAssignedPlantId(assetId);
      await AsyncStorage.setItem(ASSIGNED_PLANT_KEY, assetId);
      await rescheduleAssignedAssets(assignedVehicleId, assetId);
    }

    Alert.alert(
      `${assetType} assigned`,
      `${getAssetLabel(asset)} is now assigned to you.`,
    );
  }

  async function clearAssignment(assetType: AssetType) {
    if (assetType === "Vehicle") {
      setAssignedVehicleId("");
      await AsyncStorage.removeItem(ASSIGNED_VEHICLE_KEY);
      await rescheduleAssignedAssets("", assignedPlantId);
    } else {
      setAssignedPlantId("");
      await AsyncStorage.removeItem(ASSIGNED_PLANT_KEY);
      await rescheduleAssignedAssets(assignedVehicleId, "");
    }
  }

  async function updateReminderEnabled(value: boolean) {
    setReminderEnabled(value);
    await AsyncStorage.setItem(REMINDER_ENABLED_KEY, String(value));

    if (!value) {
      await cancelScheduledReminders();
      return;
    }

    const assignedAssets = [assignedVehicle, assignedPlant].filter(
      (asset): asset is PrestartAsset => Boolean(asset),
    );

    const scheduled = await scheduleDailyReminders(assignedAssets);

    if (!scheduled) {
      setReminderEnabled(false);
      await AsyncStorage.setItem(REMINDER_ENABLED_KEY, "false");

      Alert.alert(
        "Notifications unavailable",
        "Notification permission was not granted.",
      );
    }
  }

  function setFormAssetType(assetType: AssetType) {
    setSelectedAssetType(assetType);
    setSelectedAssetId("");
    setMeterReading("");
    setChecklist(createDefaultChecklist(assetType));
  }

  function openNewPrestart(
    assetType: AssetType = "Vehicle",
    assetId?: string,
  ) {
    if (!projectId) {
      Alert.alert(
        "No project selected",
        "Return to Home and select a current project first.",
      );
      return;
    }

    const defaultAssetId =
      assetId ||
      (assetType === "Vehicle"
        ? assignedVehicleId
        : assignedPlantId) ||
      "";

    setSelectedAssetType(assetType);
    setSelectedAssetId(defaultAssetId);
    setMeterReading("");
    setPrestartDate(todayDate());
    setOverallCondition("Good");
    setGeneralComments("");
    setChecklist(createDefaultChecklist(assetType));
    setFormStep("details");
    setFormVisible(true);
  }

  function closeForm() {
    if (!saving) setFormVisible(false);
  }

  function setChecklistAnswer(
    item: string,
    answer: ChecklistValue["answer"],
  ) {
    const key = checklistKey(item);

    setChecklist((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? {
          answer: "yes",
          severity: "minor",
          comment: "",
        }),
        answer,
        comment:
          answer === "no"
            ? current[key]?.comment ?? ""
            : "",
      },
    }));
  }

  function setChecklistSeverity(
    item: string,
    severity: ChecklistValue["severity"],
  ) {
    const key = checklistKey(item);

    setChecklist((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? {
          answer: "no",
          severity: "minor",
          comment: "",
        }),
        answer: "no",
        severity,
      },
    }));
  }

  function setChecklistComment(item: string, comment: string) {
    const key = checklistKey(item);

    setChecklist((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? {
          answer: "no",
          severity: "minor",
          comment: "",
        }),
        answer: "no",
        comment,
      },
    }));
  }

  function validateDetails(): boolean {
    if (!selectedAsset) {
      Alert.alert(
        `Select a ${selectedAssetType.toLowerCase()}`,
        `Choose the ${selectedAssetType.toLowerCase()} being checked.`,
      );
      return false;
    }

    if (!inspectorName) {
      Alert.alert(
        "Profile name missing",
        "Your account could not be matched to an employee. Ask an administrator to link the account.",
      );
      return false;
    }

    if (!prestartDate) {
      Alert.alert("Date required", "Enter the prestart date.");
      return false;
    }

    if (safeNumber(meterReading, 0) < 0) {
      Alert.alert(
        selectedAssetType === "Vehicle"
          ? "Kilometres required"
          : "Hours required",
        selectedAssetType === "Vehicle"
          ? "Enter the current odometer kilometres."
          : "Enter the current upper cab / plant hours.",
      );
      return false;
    }

    if (!meterReading.trim()) {
      Alert.alert(
        selectedAssetType === "Vehicle"
          ? "Kilometres required"
          : "Hours required",
        selectedAssetType === "Vehicle"
          ? "Enter the current odometer kilometres."
          : "Enter the current upper cab / plant hours.",
      );
      return false;
    }

    return true;
  }

  function validateChecklist(): boolean {
    const incomplete = checklistSections
      .flatMap((section) => [...section.items])
      .filter(
        (item) =>
          !checklist[checklistKey(item)]?.answer,
      );

    if (incomplete.length > 0) {
      Alert.alert(
        "Checklist incomplete",
        "Answer every checklist item.",
      );
      return false;
    }

    const missingComments = failedItems.filter(
      (item) =>
        !checklist[checklistKey(item)]?.comment.trim(),
    );

    if (missingComments.length > 0) {
      Alert.alert(
        "Comments required",
        `Add a defect comment for: ${missingComments.join(", ")}.`,
      );
      return false;
    }

    return true;
  }

  function goToChecklist() {
    if (validateDetails()) setFormStep("checklist");
  }

  function goToReview() {
    if (validateChecklist()) setFormStep("review");
  }

  async function generateDocketNumber(
    assetType: AssetType,
  ): Promise<string> {
    const { data, error } = await supabase.rpc(
      "next_prestart_docket_number",
      {
        p_asset_type: assetType,
      },
    );

    if (!error && typeof data === "string" && data) {
      return data;
    }

    const prefix = assetType === "Plant" ? "PPS" : "VPS";

    const { data: latestRows } = await supabase
      .from("vehicle_prestarts")
      .select("docket_number")
      .eq("asset_type", assetType)
      .like("docket_number", `${prefix}-%`)
      .order("created_at", { ascending: false })
      .limit(100);

    const maxNumber = (
      (latestRows ?? []) as { docket_number: string | null }[]
    ).reduce((maximum, row) => {
      const match = clean(row.docket_number).match(/(\d+)$/);
      return match
        ? Math.max(maximum, Number(match[1]))
        : maximum;
    }, 0);

    return `${prefix}-${String(maxNumber + 1).padStart(6, "0")}`;
  }

  async function createFleetJob(
    prestart: PrestartRecord,
    asset: PrestartAsset,
    severity: string,
    docketNumber: string,
  ): Promise<FleetJobInsertResult | null> {
    const failedDetails = failedItems.map((item) => {
      const value = checklist[checklistKey(item)];

      return [
        item,
        `Severity: ${severityLabel(value?.severity)}`,
        `Comment: ${value?.comment || "No comment provided"}`,
      ].join("\n");
    });

    const meterText =
      asset.assetType === "Vehicle"
        ? `Kilometres: ${safeNumber(meterReading, 0)}`
        : `Plant hours: ${safeNumber(meterReading, 0)}`;

    const description = [
      `${asset.assetType} prestart defect(s):\n\n${failedDetails.join(
        "\n\n",
      )}`,
      generalComments.trim()
        ? `General comments:\n${generalComments.trim()}`
        : "",
      meterText,
    ]
      .filter(Boolean)
      .join("\n\n");

    const title =
      failedItems.length === 1
        ? `${severityLabel(severity)} issue - ${failedItems[0]} - ${asset.assetId}`
        : `${severityLabel(severity)} prestart issues - ${asset.assetId}`;

    /*
     * Do not create a timestamp-based job number here.
     * The website and database should use the same fleet_jobs sequence/trigger.
     * Omitting job_number lets Supabase return the authoritative number.
     */
    const { data, error } = await supabase
      .from("fleet_jobs")
      .insert({
        asset_type: asset.assetType,
        vehicle_id:
          asset.assetType === "Vehicle" ? asset.id : null,
        vehicle_asset_id:
          asset.assetType === "Vehicle" ? asset.id : null,
        plant_id:
          asset.assetType === "Plant" ? asset.id : null,
        plant_asset_id:
          asset.assetType === "Plant" ? asset.id : null,
        prestart_id: prestart.id,
        source_type:
          asset.assetType === "Plant"
            ? "plant_prestart"
            : "vehicle_prestart",
        source_id: prestart.id,
        asset_label: [
          asset.assetId,
          asset.rego,
          asset.makeModel,
          asset.category,
        ]
          .filter(Boolean)
          .join(" · "),
        source: "Prestart",
        title,
        description,
        priority: severityToPriority(severity),
        status: "Open",
        project: projectName || asset.project || null,
        crew: asset.crew || clean(profileRecord?.crew) || null,
        reported_by: inspectorName,
        assigned_to: null,
        vendor: null,
        reported_date: prestartDate,
        due_date: null,
        completed_date: null,
        cost: null,
        notes: `Created automatically from ${asset.assetType.toLowerCase()} prestart ${docketNumber}.`,
      })
      .select("id, job_number")
      .single();

    if (error || !data) {
      Alert.alert(
        "Prestart saved, Fleet Job failed",
        error?.message ??
          "The prestart was saved but the Fleet Job could not be created.",
      );
      return null;
    }

    return data as FleetJobInsertResult;
  }

  async function savePrestart() {
    if (
      !validateDetails() ||
      !validateChecklist() ||
      !selectedAsset
    ) {
      return;
    }

    setSaving(true);

    try {
      const docketNumber = await generateDocketNumber(
        selectedAssetType,
      );
      const severity = formSeverity;
      const result = severityToResult(severity);

      const assetLabel = [
        selectedAsset.assetId,
        selectedAsset.makeModel,
        selectedAsset.category,
      ]
        .filter(Boolean)
        .join(" ");

      const payload = {
        docket_number: docketNumber,
        asset_type: selectedAssetType,
        vehicle_asset_id:
          selectedAssetType === "Vehicle"
            ? selectedAsset.id
            : null,
        plant_asset_id:
          selectedAssetType === "Plant"
            ? selectedAsset.id
            : null,
        asset_label: assetLabel,
        vehicle_rego:
          selectedAssetType === "Vehicle"
            ? selectedAsset.rego || null
            : null,
        asset_category: selectedAsset.category,
        prestart_date: prestartDate,
        kilometres:
          selectedAssetType === "Vehicle"
            ? safeNumber(meterReading, 0)
            : null,
        cab_hours:
          selectedAssetType === "Plant"
            ? safeNumber(meterReading, 0)
            : null,
        project: projectName || selectedAsset.project || null,
        crew:
          selectedAsset.crew ||
          clean(profileRecord?.crew) ||
          null,
        inspected_by_name: inspectorName,
        checklist,
        overall_condition: overallCondition,
        comments: generalComments.trim(),
        severity,
        result,
      };

      const { data: newPrestart, error } = await supabase
        .from("vehicle_prestarts")
        .insert(payload)
        .select("*")
        .single();

      if (error || !newPrestart) {
        Alert.alert(
          "Could not save prestart",
          error?.message ??
            "The prestart could not be created.",
        );
        return;
      }

      let fleetJob: FleetJobInsertResult | null = null;

      if (severity !== "none") {
        fleetJob = await createFleetJob(
          newPrestart as PrestartRecord,
          selectedAsset,
          severity,
          docketNumber,
        );

        if (fleetJob?.id) {
          await supabase
            .from("vehicle_prestarts")
            .update({
              fleet_job_id: fleetJob.id,
              fleet_job_number:
                fleetJob.job_number || null,
            })
            .eq("id", newPrestart.id);
        }
      }

      const currentAssignedId =
        selectedAssetType === "Vehicle"
          ? assignedVehicleId
          : assignedPlantId;

      if (selectedAsset.id !== currentAssignedId) {
        await new Promise<void>((resolve) => {
          Alert.alert(
            `Assign this ${selectedAssetType.toLowerCase()}?`,
            `Make ${getAssetLabel(
              selectedAsset,
            )} your assigned ${selectedAssetType.toLowerCase()} for future reminders?`,
            [
              {
                text: "Not now",
                style: "cancel",
                onPress: () => resolve(),
              },
              {
                text: "Assign",
                onPress: () => {
                  void assignAsset(
                    selectedAssetType,
                    selectedAsset.id,
                  ).finally(resolve);
                },
              },
            ],
            {
              cancelable: false,
            },
          );
        });
      }

      setFormVisible(false);
      await loadData(false);

      Alert.alert(
        severity === "none"
          ? "Prestart submitted"
          : "Prestart submitted with issues",
        severity === "none"
          ? `${docketNumber} has been saved.`
          : fleetJob?.job_number
            ? `${docketNumber} has been saved and Fleet Job ${fleetJob.job_number} was raised.`
            : `${docketNumber} has been saved and a Fleet Job was raised.`,
      );
    } finally {
      setSaving(false);
    }
  }

  function openPrestartDetail(prestart: PrestartRecord) {
    setSelectedPrestart(prestart);
    setDetailVisible(true);
  }

  function renderHistoryItem({
    item,
  }: {
    item: PrestartRecord;
  }) {
    const assetType: AssetType =
      clean(item.asset_type) === "Plant"
        ? "Plant"
        : "Vehicle";
    const hasIssue =
      clean(item.severity) !== "none" &&
      clean(item.severity) !== "";

    const meterValue =
      assetType === "Plant"
        ? item.cab_hours == null
          ? "—"
          : `${item.cab_hours.toLocaleString()} h`
        : item.kilometres == null
          ? "—"
          : `${item.kilometres.toLocaleString()} km`;

    return (
      <Pressable
        style={styles.historyCard}
        onPress={() => openPrestartDetail(item)}
      >
        <View style={styles.historyHeader}>
          <View
            style={[
              styles.historyIcon,
              hasIssue
                ? styles.historyIconIssue
                : styles.historyIconPassed,
            ]}
          >
            <Ionicons
              name={
                assetType === "Plant"
                  ? "construct-outline"
                  : "car-outline"
              }
              size={21}
              color={hasIssue ? "#B45309" : "#15803D"}
            />
          </View>

          <View style={styles.historyTitleWrap}>
            <View style={styles.historyTitleLine}>
              <Text style={styles.historyTitle}>
                {clean(item.asset_label) ||
                  `${assetType} Prestart`}
              </Text>

              <View style={styles.assetTypeBadge}>
                <Text style={styles.assetTypeBadgeText}>
                  {assetType}
                </Text>
              </View>
            </View>

            <Text style={styles.historySubtitle}>
              {[
                clean(item.vehicle_rego),
                clean(item.docket_number),
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>

          <SeverityBadge severity={item.severity} />
        </View>

        <View style={styles.historyDetails}>
          <HistoryDetail
            label="Date"
            value={formatDate(prestartDateValue(item))}
          />

          <HistoryDetail
            label={assetType === "Plant" ? "Hours" : "Kilometres"}
            value={meterValue}
          />

          <HistoryDetail
            label="Result"
            value={clean(item.result) || "—"}
          />
        </View>

        {item.fleet_job_number ? (
          <View style={styles.fleetJobStrip}>
            <Ionicons
              name="construct-outline"
              size={16}
              color="#B45309"
            />

            <Text style={styles.fleetJobStripText}>
              Fleet Job {item.fleet_job_number}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Loading text="Loading prestarts…" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerIcon}>
              <Ionicons
                name="clipboard-outline"
                size={23}
                color="#FFFFFF"
              />
            </View>

            <View style={styles.headerText}>
              <Text style={styles.pageTitle}>Prestarts</Text>
              <Text style={styles.pageSubtitle}>
                Vehicle and plant checks for your project
              </Text>
            </View>

            <Pressable
              style={styles.refreshButton}
              disabled={refreshing}
              onPress={() => void refresh()}
            >
              {refreshing ? (
                <ActivityIndicator
                  size="small"
                  color="#334155"
                />
              ) : (
                <Ionicons
                  name="refresh"
                  size={20}
                  color="#334155"
                />
              )}
            </Pressable>
          </View>

          <View style={styles.projectContext}>
            <Text style={styles.projectContextLabel}>
              CURRENT PROJECT
            </Text>
            <Text
              numberOfLines={1}
              style={styles.projectContextValue}
            >
              {projectNumber
                ? `${projectNumber} — ${projectName}`
                : projectName || "No project selected"}
            </Text>
          </View>
        </View>

        {!projectId ? (
          <Empty
            title="No project selected"
            text="Return to Home and select a current project before completing a prestart."
          />
        ) : (
          <FlatList
            data={filteredHistory}
            keyExtractor={(item) => item.id}
            renderItem={renderHistoryItem}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void refresh()}
              />
            }
            ListHeaderComponent={
              <View>
                <AssignmentPanel
                  assignedVehicle={assignedVehicle}
                  assignedPlant={assignedPlant}
                  reminderEnabled={reminderEnabled}
                  reminderItems={assignedReminderItems}
                  onReminderChange={(value) =>
                    void updateReminderEnabled(value)
                  }
                  onAssignVehicle={() =>
                    openAssignmentSelector("Vehicle")
                  }
                  onAssignPlant={() =>
                    openAssignmentSelector("Plant")
                  }
                  onClearVehicle={() =>
                    void clearAssignment("Vehicle")
                  }
                  onClearPlant={() =>
                    void clearAssignment("Plant")
                  }
                  onStartVehicle={() =>
                    openNewPrestart(
                      "Vehicle",
                      assignedVehicleId,
                    )
                  }
                  onStartPlant={() =>
                    openNewPrestart(
                      "Plant",
                      assignedPlantId,
                    )
                  }
                />

                <View style={styles.summaryGrid}>
                  <SummaryCard
                    label="This Week"
                    value={weeklyStats.submitted}
                    tone="blue"
                  />
                  <SummaryCard
                    label="Vehicles"
                    value={weeklyStats.vehicle}
                    tone="green"
                  />
                  <SummaryCard
                    label="Plant"
                    value={weeklyStats.plant}
                    tone="purple"
                  />
                  <SummaryCard
                    label="Issues"
                    value={weeklyStats.issues}
                    tone="amber"
                  />
                </View>

                <View style={styles.startButtons}>
                  <Pressable
                    style={styles.vehicleStartButton}
                    onPress={() =>
                      openNewPrestart("Vehicle")
                    }
                  >
                    <Ionicons
                      name="car-outline"
                      size={21}
                      color="#FFFFFF"
                    />
                    <Text style={styles.startButtonText}>
                      Vehicle Prestart
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.plantStartButton}
                    onPress={() =>
                      openNewPrestart("Plant")
                    }
                  >
                    <Ionicons
                      name="construct-outline"
                      size={21}
                      color="#FFFFFF"
                    />
                    <Text style={styles.startButtonText}>
                      Plant Prestart
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.historyHeading}>
                  <Text style={styles.historyHeadingTitle}>
                    My Prestart History
                  </Text>
                  <Text style={styles.historyHeadingSubtitle}>
                    {filteredHistory.length} of {myPrestarts.length} shown
                  </Text>
                </View>

                <View style={styles.searchBox}>
                  <Ionicons
                    name="search"
                    size={19}
                    color="#64748B"
                  />
                  <TextInput
                    value={historySearch}
                    onChangeText={setHistorySearch}
                    style={styles.searchInput}
                    placeholder="Search asset, docket or Fleet Job…"
                    placeholderTextColor="#94A3B8"
                    autoCorrect={false}
                  />
                  {historySearch.length > 0 && (
                    <Pressable
                      onPress={() => setHistorySearch("")}
                    >
                      <Ionicons
                        name="close-circle"
                        size={19}
                        color="#94A3B8"
                      />
                    </Pressable>
                  )}
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterTabs}
                >
                  {(
                    [
                      "All",
                      "Vehicle",
                      "Plant",
                      "Passed",
                      "Issues",
                    ] as HistoryFilter[]
                  ).map((filter) => (
                    <Pressable
                      key={filter}
                      style={[
                        styles.filterTab,
                        historyFilter === filter &&
                          styles.filterTabActive,
                      ]}
                      onPress={() =>
                        setHistoryFilter(filter)
                      }
                    >
                      <Text
                        style={[
                          styles.filterTabText,
                          historyFilter === filter &&
                            styles.filterTabTextActive,
                        ]}
                      >
                        {filter}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            }
            ListEmptyComponent={
              <Empty
                title="No prestarts found"
                text={
                  myPrestarts.length === 0
                    ? "Your submitted vehicle and plant prestarts will appear here."
                    : "No prestarts match the current search or filter."
                }
              />
            }
          />
        )}

        <OptionSelector
          visible={selectorVisible}
          title={selectorTitle}
          options={selectorOptions}
          onClose={() => setSelectorVisible(false)}
          onSelect={(option) => {
            selectorAction?.(option);
            setSelectorVisible(false);
          }}
        />

        <Modal
          visible={formVisible}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={closeForm}
        >
          <SafeAreaView style={styles.modalSafe}>
            <KeyboardAvoidingView
              style={styles.modalScreen}
              behavior={
                Platform.OS === "ios" ? "padding" : undefined
              }
            >
              <View style={styles.modalHeader}>
                <Pressable
                  style={styles.modalClose}
                  onPress={closeForm}
                >
                  <Ionicons
                    name="close"
                    size={22}
                    color="#334155"
                  />
                </Pressable>

                <View style={styles.modalHeaderText}>
                  <Text style={styles.modalTitle}>
                    {selectedAssetType} Prestart
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    {formStep === "details"
                      ? "1 of 3 · Details"
                      : formStep === "checklist"
                        ? "2 of 3 · Checklist"
                        : "3 of 3 · Review"}
                  </Text>
                </View>

                <View style={styles.modalHeaderSpacer} />
              </View>

              <View style={styles.stepTrack}>
                {(
                  ["details", "checklist", "review"] as FormStep[]
                ).map((step, index) => {
                  const currentIndex = [
                    "details",
                    "checklist",
                    "review",
                  ].indexOf(formStep);

                  return (
                    <View
                      key={step}
                      style={[
                        styles.stepSegment,
                        index <= currentIndex &&
                          styles.stepSegmentActive,
                      ]}
                    />
                  );
                })}
              </View>

              <View style={styles.modalBody}>
                {formStep === "details" && (
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.formContent}
                  >
                    <SectionCard title="Asset Type">
                      <View style={styles.assetTypeSwitch}>
                        {(["Vehicle", "Plant"] as AssetType[]).map(
                          (assetType) => (
                            <Pressable
                              key={assetType}
                              style={[
                                styles.assetTypeSwitchButton,
                                selectedAssetType === assetType &&
                                  styles.assetTypeSwitchButtonActive,
                              ]}
                              onPress={() =>
                                setFormAssetType(assetType)
                              }
                            >
                              <Ionicons
                                name={
                                  assetType === "Vehicle"
                                    ? "car-outline"
                                    : "construct-outline"
                                }
                                size={19}
                                color={
                                  selectedAssetType === assetType
                                    ? "#FFFFFF"
                                    : "#475569"
                                }
                              />
                              <Text
                                style={[
                                  styles.assetTypeSwitchText,
                                  selectedAssetType === assetType &&
                                    styles.assetTypeSwitchTextActive,
                                ]}
                              >
                                {assetType}
                              </Text>
                            </Pressable>
                          ),
                        )}
                      </View>
                    </SectionCard>

                    <SectionCard title={selectedAssetType}>
                      <Pressable
                        style={styles.assetSelector}
                        onPress={openFormAssetSelector}
                      >
                        <View style={styles.assetSelectorIcon}>
                          <Ionicons
                            name={
                              selectedAssetType === "Vehicle"
                                ? "car-outline"
                                : "construct-outline"
                            }
                            size={22}
                            color="#1D4ED8"
                          />
                        </View>

                        <View style={styles.assetSelectorText}>
                          <Text style={styles.assetSelectorLabel}>
                            {selectedAssetType}
                          </Text>
                          <Text
                            numberOfLines={2}
                            style={styles.assetSelectorValue}
                          >
                            {selectedAsset
                              ? getAssetLabel(selectedAsset)
                              : `Select ${selectedAssetType.toLowerCase()}`}
                          </Text>
                        </View>

                        <Ionicons
                          name="chevron-down"
                          size={19}
                          color="#64748B"
                        />
                      </Pressable>

                      {selectedAsset ? (
                        <View style={styles.assetInfoGrid}>
                          <DetailMetric
                            label="Category"
                            value={
                              selectedAsset.category || "—"
                            }
                          />
                          <DetailMetric
                            label="Project"
                            value={
                              selectedAsset.project || "—"
                            }
                          />
                          <DetailMetric
                            label="Crew"
                            value={selectedAsset.crew || "—"}
                          />
                          <DetailMetric
                            label="Status"
                            value={
                              selectedAsset.status || "—"
                            }
                          />
                        </View>
                      ) : null}
                    </SectionCard>

                    <SectionCard title="Prestart Details">
                      <FormField
                        label="Prestart Date"
                        value={prestartDate}
                        onChangeText={setPrestartDate}
                        placeholder="YYYY-MM-DD"
                        keyboardType="default"
                      />

                      <FormField
                        label={
                          selectedAssetType === "Vehicle"
                            ? "Current Kilometres"
                            : "Upper Cab / Plant Hours"
                        }
                        value={meterReading}
                        onChangeText={setMeterReading}
                        placeholder={
                          selectedAssetType === "Vehicle"
                            ? "Enter odometer reading"
                            : "Enter current hours"
                        }
                        keyboardType="decimal-pad"
                      />

                      <View style={styles.readOnlyField}>
                        <Text style={styles.readOnlyLabel}>
                          Inspected By
                        </Text>
                        <Text style={styles.readOnlyValue}>
                          {inspectorName ||
                            "No employee linked to this account"}
                        </Text>
                      </View>

                      <Text style={styles.fieldLabel}>
                        Overall Condition
                      </Text>

                      <View style={styles.conditionGrid}>
                        {["Good", "Fair", "Poor", "Unsafe"].map(
                          (condition) => (
                            <Pressable
                              key={condition}
                              style={[
                                styles.conditionButton,
                                overallCondition === condition &&
                                  styles.conditionButtonActive,
                                condition === "Unsafe" &&
                                  overallCondition === condition &&
                                  styles.conditionButtonUnsafe,
                              ]}
                              onPress={() =>
                                setOverallCondition(condition)
                              }
                            >
                              <Text
                                style={[
                                  styles.conditionButtonText,
                                  overallCondition === condition &&
                                    styles.conditionButtonTextActive,
                                ]}
                              >
                                {condition}
                              </Text>
                            </Pressable>
                          ),
                        )}
                      </View>
                    </SectionCard>
                  </ScrollView>
                )}

                {formStep === "checklist" && (
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.formContent}
                  >
                    <View style={styles.checklistHelp}>
                      <Ionicons
                        name="information-circle-outline"
                        size={20}
                        color="#1D4ED8"
                      />
                      <Text style={styles.checklistHelpText}>
                        Every item must be marked Y, N or N/A.
                        Selecting N requires a severity and comment.
                      </Text>
                    </View>

                    {checklistSections.map((section) => (
                      <SectionCard
                        key={section.title}
                        title={section.title}
                      >
                        {section.items.map((item) => (
                          <ChecklistRow
                            key={item}
                            item={item}
                            value={
                              checklist[checklistKey(item)] ?? {
                                answer: "yes",
                                severity: "minor",
                                comment: "",
                              }
                            }
                            onAnswer={(answer) =>
                              setChecklistAnswer(item, answer)
                            }
                            onSeverity={(severity) =>
                              setChecklistSeverity(item, severity)
                            }
                            onComment={(comment) =>
                              setChecklistComment(item, comment)
                            }
                          />
                        ))}
                      </SectionCard>
                    ))}
                  </ScrollView>
                )}

                {formStep === "review" && (
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.formContent}
                  >
                    <View
                      style={[
                        styles.reviewResult,
                        formSeverity === "none"
                          ? styles.reviewResultPassed
                          : styles.reviewResultIssue,
                      ]}
                    >
                      <Ionicons
                        name={
                          formSeverity === "none"
                            ? "checkmark-circle-outline"
                            : "warning-outline"
                        }
                        size={27}
                        color={
                          formSeverity === "none"
                            ? "#15803D"
                            : "#B45309"
                        }
                      />

                      <View style={styles.reviewResultText}>
                        <Text style={styles.reviewResultTitle}>
                          {formSeverity === "none"
                            ? "Ready to submit"
                            : `${failedItems.length} issue${
                                failedItems.length === 1
                                  ? ""
                                  : "s"
                              } will be raised`}
                        </Text>
                        <Text style={styles.reviewResultSubtitle}>
                          Highest severity:{" "}
                          {severityLabel(formSeverity)}
                        </Text>
                      </View>
                    </View>

                    <SectionCard title="Review Details">
                      <View style={styles.assetInfoGrid}>
                        <DetailMetric
                          label={selectedAssetType}
                          value={
                            selectedAsset
                              ? getAssetLabel(selectedAsset)
                              : "—"
                          }
                        />
                        <DetailMetric
                          label={
                            selectedAssetType === "Vehicle"
                              ? "Kilometres"
                              : "Plant Hours"
                          }
                          value={
                            meterReading
                              ? `${Number(
                                  meterReading,
                                ).toLocaleString()} ${
                                  selectedAssetType === "Vehicle"
                                    ? "km"
                                    : "h"
                                }`
                              : "—"
                          }
                        />
                        <DetailMetric
                          label="Date"
                          value={formatDate(prestartDate)}
                        />
                        <DetailMetric
                          label="Condition"
                          value={overallCondition}
                        />
                      </View>
                    </SectionCard>

                    {failedItems.length > 0 && (
                      <SectionCard title="Failed Items">
                        {failedItems.map((item) => {
                          const value =
                            checklist[checklistKey(item)];

                          return (
                            <View
                              key={item}
                              style={styles.failedItem}
                            >
                              <View
                                style={styles.failedItemHeader}
                              >
                                <Text
                                  style={styles.failedItemTitle}
                                >
                                  {item}
                                </Text>
                                <SeverityBadge
                                  severity={value?.severity}
                                />
                              </View>
                              <Text
                                style={
                                  styles.failedItemComment
                                }
                              >
                                {value?.comment}
                              </Text>
                            </View>
                          );
                        })}
                      </SectionCard>
                    )}

                    <SectionCard title="General Comments">
                      <TextInput
                        value={generalComments}
                        onChangeText={setGeneralComments}
                        style={styles.commentsInput}
                        placeholder="Add any other comments…"
                        placeholderTextColor="#94A3B8"
                        multiline
                        textAlignVertical="top"
                      />
                    </SectionCard>
                  </ScrollView>
                )}
              </View>

              <View style={styles.modalFooter}>
                {formStep !== "details" ? (
                  <Pressable
                    style={styles.secondaryButton}
                    disabled={saving}
                    onPress={() =>
                      setFormStep(
                        formStep === "review"
                          ? "checklist"
                          : "details",
                      )
                    }
                  >
                    <Ionicons
                      name="arrow-back"
                      size={18}
                      color="#334155"
                    />
                    <Text style={styles.secondaryButtonText}>
                      Back
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={styles.secondaryButton}
                    disabled={saving}
                    onPress={closeForm}
                  >
                    <Text style={styles.secondaryButtonText}>
                      Cancel
                    </Text>
                  </Pressable>
                )}

                {formStep === "details" ? (
                  <Pressable
                    style={styles.nextButton}
                    onPress={goToChecklist}
                  >
                    <Text style={styles.nextButtonText}>
                      Checklist
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color="#FFFFFF"
                    />
                  </Pressable>
                ) : formStep === "checklist" ? (
                  <Pressable
                    style={styles.nextButton}
                    onPress={goToReview}
                  >
                    <Text style={styles.nextButtonText}>
                      Review
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color="#FFFFFF"
                    />
                  </Pressable>
                ) : (
                  <Pressable
                    style={[
                      styles.submitButton,
                      saving && styles.buttonDisabled,
                    ]}
                    disabled={saving}
                    onPress={() => void savePrestart()}
                  >
                    {saving ? (
                      <ActivityIndicator
                        size="small"
                        color="#FFFFFF"
                      />
                    ) : (
                      <>
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={20}
                          color="#FFFFFF"
                        />
                        <Text style={styles.submitButtonText}>
                          Submit Prestart
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        <PrestartDetailModal
          visible={detailVisible}
          prestart={selectedPrestart}
          onClose={() => setDetailVisible(false)}
        />
      </View>
    </SafeAreaView>
  );
}

function AssignmentPanel({
  assignedVehicle,
  assignedPlant,
  reminderEnabled,
  reminderItems,
  onReminderChange,
  onAssignVehicle,
  onAssignPlant,
  onClearVehicle,
  onClearPlant,
  onStartVehicle,
  onStartPlant,
}: {
  assignedVehicle?: PrestartAsset;
  assignedPlant?: PrestartAsset;
  reminderEnabled: boolean;
  reminderItems: {
    asset: PrestartAsset;
    latest: PrestartRecord | null;
  }[];
  onReminderChange: (value: boolean) => void;
  onAssignVehicle: () => void;
  onAssignPlant: () => void;
  onClearVehicle: () => void;
  onClearPlant: () => void;
  onStartVehicle: () => void;
  onStartPlant: () => void;
}) {
  return (
    <View style={styles.assignmentPanel}>
      <View style={styles.assignmentPanelHeader}>
        <View style={styles.assignmentPanelIcon}>
          <Ionicons
            name="notifications-outline"
            size={22}
            color="#1D4ED8"
          />
        </View>
        <View style={styles.assignmentPanelTitleWrap}>
          <Text style={styles.assignmentPanelTitle}>
            My Assigned Assets
          </Text>
          <Text style={styles.assignmentPanelSubtitle}>
            Assign the vehicle and plant you operate for daily reminders.
          </Text>
        </View>
      </View>

      <AssignedAssetRow
        label="Vehicle"
        asset={assignedVehicle}
        latest={reminderItems.find(
          (item) => item.asset.assetType === "Vehicle",
        )?.latest}
        onAssign={onAssignVehicle}
        onClear={onClearVehicle}
        onStart={onStartVehicle}
      />

      <AssignedAssetRow
        label="Plant"
        asset={assignedPlant}
        latest={reminderItems.find(
          (item) => item.asset.assetType === "Plant",
        )?.latest}
        onAssign={onAssignPlant}
        onClear={onClearPlant}
        onStart={onStartPlant}
      />

      <View style={styles.reminderControls}>
        <View style={styles.reminderSwitchText}>
          <Text style={styles.reminderSwitchLabel}>
            Daily 6:00 am notifications
          </Text>
          <Text style={styles.reminderSwitchHelper}>
            Website edits and deletions refresh automatically in this page.
          </Text>
        </View>
        <Switch
          value={reminderEnabled}
          disabled={!assignedVehicle && !assignedPlant}
          onValueChange={onReminderChange}
        />
      </View>
    </View>
  );
}

function AssignedAssetRow({
  label,
  asset,
  latest,
  onAssign,
  onClear,
  onStart,
}: {
  label: AssetType;
  asset?: PrestartAsset;
  latest?: PrestartRecord | null;
  onAssign: () => void;
  onClear: () => void;
  onStart: () => void;
}) {
  const completedToday = isToday(
    prestartDateValue(latest ?? ({} as PrestartRecord)),
  );
  const days = daysSince(
    prestartDateValue(latest ?? ({} as PrestartRecord)),
  );

  const statusText = !asset
    ? `No ${label.toLowerCase()} assigned`
    : completedToday
      ? "Today's prestart complete"
      : days === null
        ? "Prestart required"
        : `Last prestart ${days} day${days === 1 ? "" : "s"} ago`;

  return (
    <View style={styles.assignedAssetRow}>
      <View
        style={[
          styles.assignedAssetIcon,
          completedToday
            ? styles.assignedAssetIconComplete
            : styles.assignedAssetIconPending,
        ]}
      >
        <Ionicons
          name={
            label === "Vehicle"
              ? "car-outline"
              : "construct-outline"
          }
          size={21}
          color={completedToday ? "#15803D" : "#B45309"}
        />
      </View>

      <View style={styles.assignedAssetText}>
        <Text style={styles.assignedAssetLabel}>
          {label}
        </Text>
        <Text
          numberOfLines={2}
          style={styles.assignedAssetValue}
        >
          {asset
            ? getAssetLabel(asset)
            : statusText}
        </Text>
        {asset ? (
          <Text
            style={[
              styles.assignedAssetStatus,
              completedToday
                ? styles.assignedAssetStatusComplete
                : styles.assignedAssetStatusPending,
            ]}
          >
            {statusText}
          </Text>
        ) : null}
      </View>

      <View style={styles.assignedAssetActions}>
        <Pressable onPress={onAssign}>
          <Text style={styles.assignedAssetChange}>
            {asset ? "Change" : "Assign"}
          </Text>
        </Pressable>

        {asset && !completedToday ? (
          <Pressable
            style={styles.assignedAssetStart}
            onPress={onStart}
          >
            <Text style={styles.assignedAssetStartText}>
              Start
            </Text>
          </Pressable>
        ) : null}

        {asset ? (
          <Pressable onPress={onClear}>
            <Ionicons
              name="close-circle-outline"
              size={18}
              color="#94A3B8"
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "green" | "purple" | "amber";
}) {
  const colours =
    tone === "green"
      ? {
          backgroundColor: "#F0FDF4",
          borderColor: "#BBF7D0",
          valueColour: "#166534",
        }
      : tone === "purple"
        ? {
            backgroundColor: "#F5F3FF",
            borderColor: "#DDD6FE",
            valueColour: "#6D28D9",
          }
        : tone === "amber"
          ? {
              backgroundColor: "#FFFBEB",
              borderColor: "#FDE68A",
              valueColour: "#92400E",
            }
          : {
              backgroundColor: "#EFF6FF",
              borderColor: "#BFDBFE",
              valueColour: "#1E3A8A",
            };

  return (
    <View
      style={[
        styles.summaryCard,
        {
          backgroundColor: colours.backgroundColor,
          borderColor: colours.borderColor,
        },
      ]}
    >
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          { color: colours.valueColour },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function HistoryDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.historyDetail}>
      <Text style={styles.historyDetailLabel}>
        {label}
      </Text>
      <Text style={styles.historyDetailValue}>
        {value}
      </Text>
    </View>
  );
}

function SeverityBadge({
  severity,
}: {
  severity?: string | null;
}) {
  const value = clean(severity);

  const colours =
    value === "none"
      ? {
          backgroundColor: "#DCFCE7",
          borderColor: "#86EFAC",
          textColour: "#166534",
        }
      : value === "minor"
        ? {
            backgroundColor: "#DBEAFE",
            borderColor: "#93C5FD",
            textColour: "#1D4ED8",
          }
        : value === "moderate"
          ? {
              backgroundColor: "#FEF3C7",
              borderColor: "#FCD34D",
              textColour: "#92400E",
            }
          : {
              backgroundColor: "#FFE4E6",
              borderColor: "#FDA4AF",
              textColour: "#BE123C",
            };

  return (
    <View
      style={[
        styles.severityBadge,
        {
          backgroundColor: colours.backgroundColor,
          borderColor: colours.borderColor,
        },
      ]}
    >
      <Text
        style={[
          styles.severityBadgeText,
          { color: colours.textColour },
        ]}
      >
        {severityLabel(value)}
      </Text>
    </View>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function DetailMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailMetric}>
      <Text style={styles.detailMetricLabel}>
        {label}
      </Text>
      <Text style={styles.detailMetricValue}>
        {value}
      </Text>
    </View>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType: "default" | "decimal-pad";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={styles.fieldInput}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        keyboardType={keyboardType}
      />
    </View>
  );
}

function ChecklistRow({
  item,
  value,
  onAnswer,
  onSeverity,
  onComment,
}: {
  item: string;
  value: ChecklistValue;
  onAnswer: (answer: ChecklistValue["answer"]) => void;
  onSeverity: (
    severity: ChecklistValue["severity"],
  ) => void;
  onComment: (comment: string) => void;
}) {
  return (
    <View
      style={[
        styles.checklistRow,
        value.answer === "no" &&
          styles.checklistRowFailed,
      ]}
    >
      <Text style={styles.checklistItem}>{item}</Text>

      <View style={styles.answerRow}>
        {[
          { value: "yes", label: "Y" },
          { value: "no", label: "N" },
          { value: "na", label: "N/A" },
        ].map((option) => {
          const active = value.answer === option.value;

          return (
            <Pressable
              key={option.value}
              style={[
                styles.answerButton,
                active &&
                  option.value === "yes" &&
                  styles.answerButtonYes,
                active &&
                  option.value === "no" &&
                  styles.answerButtonNo,
                active &&
                  option.value === "na" &&
                  styles.answerButtonNa,
              ]}
              onPress={() =>
                onAnswer(
                  option.value as ChecklistValue["answer"],
                )
              }
            >
              <Text
                style={[
                  styles.answerButtonText,
                  active &&
                    styles.answerButtonTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {value.answer === "no" && (
        <View style={styles.failedChecklistDetails}>
          <Text style={styles.failedChecklistLabel}>
            Severity
          </Text>

          <View style={styles.severityOptionGrid}>
            {severityOptions.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.severityOption,
                  value.severity === option.value &&
                    styles.severityOptionActive,
                  value.severity === "do_not_use" &&
                    option.value === "do_not_use" &&
                    styles.severityOptionCritical,
                ]}
                onPress={() =>
                  onSeverity(option.value)
                }
              >
                <Text
                  style={[
                    styles.severityOptionText,
                    value.severity === option.value &&
                      styles.severityOptionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={value.comment}
            onChangeText={onComment}
            style={styles.defectCommentInput}
            placeholder="Required: explain the defect…"
            placeholderTextColor="#94A3B8"
            multiline
            textAlignVertical="top"
          />
        </View>
      )}
    </View>
  );
}

function PrestartDetailModal({
  visible,
  prestart,
  onClose,
}: {
  visible: boolean;
  prestart: PrestartRecord | null;
  onClose: () => void;
}) {
  const checklist = prestart?.checklist ?? {};
  const assetType: AssetType =
    clean(prestart?.asset_type) === "Plant"
      ? "Plant"
      : "Vehicle";
  const sections = getChecklistSections(assetType);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Pressable
            style={styles.modalClose}
            onPress={onClose}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color="#334155"
            />
          </Pressable>

          <View style={styles.modalHeaderText}>
            <Text style={styles.modalTitle}>
              {clean(prestart?.docket_number) ||
                "Prestart"}
            </Text>
            <Text style={styles.modalSubtitle}>
              Live submitted prestart details
            </Text>
          </View>

          <View style={styles.modalHeaderSpacer} />
        </View>

        {!prestart ? (
          <Empty
            title="Prestart not found"
            text="This prestart may have been deleted on the website."
          />
        ) : (
          <ScrollView
            contentContainerStyle={styles.detailContent}
          >
            <View
              style={[
                styles.detailResultCard,
                clean(prestart.severity) === "none"
                  ? styles.detailResultPassed
                  : styles.detailResultIssue,
              ]}
            >
              <Ionicons
                name={
                  clean(prestart.severity) === "none"
                    ? "checkmark-circle-outline"
                    : "warning-outline"
                }
                size={28}
                color={
                  clean(prestart.severity) === "none"
                    ? "#15803D"
                    : "#B45309"
                }
              />

              <View style={styles.detailResultText}>
                <Text style={styles.detailResultTitle}>
                  {clean(prestart.result) ||
                    "Prestart"}
                </Text>
                <Text style={styles.detailResultSubtitle}>
                  {assetType} ·{" "}
                  {severityLabel(prestart.severity)}
                </Text>
              </View>
            </View>

            <SectionCard title="Prestart Details">
              <View style={styles.assetInfoGrid}>
                <DetailMetric
                  label={assetType}
                  value={
                    clean(prestart.asset_label) ||
                    clean(prestart.vehicle_rego) ||
                    "—"
                  }
                />
                <DetailMetric
                  label="Date"
                  value={formatDate(
                    prestartDateValue(prestart),
                  )}
                />
                <DetailMetric
                  label="Submitted"
                  value={formatDateTime(
                    prestart.created_at,
                  )}
                />
                <DetailMetric
                  label={
                    assetType === "Plant"
                      ? "Plant Hours"
                      : "Kilometres"
                  }
                  value={
                    assetType === "Plant"
                      ? prestart.cab_hours == null
                        ? "—"
                        : `${prestart.cab_hours.toLocaleString()} h`
                      : prestart.kilometres == null
                        ? "—"
                        : `${prestart.kilometres.toLocaleString()} km`
                  }
                />
                <DetailMetric
                  label="Condition"
                  value={
                    clean(
                      prestart.overall_condition,
                    ) || "—"
                  }
                />
                <DetailMetric
                  label="Project"
                  value={
                    clean(prestart.project) || "—"
                  }
                />
                <DetailMetric
                  label="Crew"
                  value={
                    clean(prestart.crew) || "—"
                  }
                />
                <DetailMetric
                  label="Inspected By"
                  value={
                    clean(
                      prestart.inspected_by_name,
                    ) || "—"
                  }
                />
              </View>
            </SectionCard>

            {prestart.fleet_job_number ? (
              <SectionCard title="Fleet Job">
                <View style={styles.linkedFleetJob}>
                  <Ionicons
                    name="construct-outline"
                    size={21}
                    color="#B45309"
                  />
                  <View style={styles.linkedFleetJobText}>
                    <Text
                      style={
                        styles.linkedFleetJobTitle
                      }
                    >
                      {prestart.fleet_job_number}
                    </Text>
                    <Text
                      style={
                        styles.linkedFleetJobSubtitle
                      }
                    >
                      Linked to the live Fleet Job register
                    </Text>
                  </View>
                </View>
              </SectionCard>
            ) : null}

            {sections.map((section) => (
              <SectionCard
                key={section.title}
                title={section.title}
              >
                {section.items.map((item) => {
                  const key = checklistKey(item);
                  const value = checklist[key];
                  const answer =
                    getChecklistAnswer(value);
                  const severity =
                    getChecklistSeverity(value);
                  const comment =
                    getChecklistComment(value);

                  return (
                    <View
                      key={key}
                      style={[
                        styles.detailChecklistRow,
                        answer === "no" &&
                          styles.detailChecklistRowFailed,
                      ]}
                    >
                      <View
                        style={
                          styles.detailChecklistHeader
                        }
                      >
                        <Text
                          style={
                            styles.detailChecklistItem
                          }
                        >
                          {item}
                        </Text>

                        <View
                          style={[
                            styles.answerBadge,
                            answer === "yes"
                              ? styles.answerBadgeYes
                              : answer === "no"
                                ? styles.answerBadgeNo
                                : styles.answerBadgeNa,
                          ]}
                        >
                          <Text
                            style={
                              styles.answerBadgeText
                            }
                          >
                            {answer === "yes"
                              ? "Y"
                              : answer === "no"
                                ? "N"
                                : "N/A"}
                          </Text>
                        </View>
                      </View>

                      {answer === "no" ? (
                        <View
                          style={
                            styles.detailFailure
                          }
                        >
                          <SeverityBadge
                            severity={severity}
                          />
                          <Text
                            style={
                              styles.detailFailureComment
                            }
                          >
                            {comment ||
                              "No comment recorded."}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </SectionCard>
            ))}

            <SectionCard title="General Comments">
              <Text
                style={styles.generalCommentsText}
              >
                {clean(prestart.comments) ||
                  "No general comments provided."}
              </Text>
            </SectionCard>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function OptionSelector({
  visible,
  title,
  options,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  options: SelectorOption[];
  onClose: () => void;
  onSelect: (option: SelectorOption) => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (visible) setQuery("");
  }, [visible]);

  const filtered = useMemo(() => {
    const searchValue =
      query.trim().toLowerCase();

    if (!searchValue) return options;

    return options.filter((option) =>
      matchesText(
        option.label,
        option.subtitle,
      ).includes(searchValue),
    );
  }, [options, query]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <Pressable
          style={styles.sheetBackdrop}
          onPress={onClose}
        />

        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {title}
            </Text>
            <Pressable
              style={styles.sheetClose}
              onPress={onClose}
            >
              <Ionicons
                name="close"
                size={21}
                color="#334155"
              />
            </Pressable>
          </View>

          <View style={styles.sheetSearch}>
            <Ionicons
              name="search"
              size={18}
              color="#64748B"
            />
            <TextInput
              value={query}
              onChangeText={setQuery}
              style={styles.sheetSearchInput}
              placeholder="Search asset…"
              placeholderTextColor="#94A3B8"
              autoCorrect={false}
              autoCapitalize="characters"
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetList}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.sheetOption,
                  pressed &&
                    styles.sheetOptionPressed,
                ]}
                onPress={() => onSelect(item)}
              >
                <View style={styles.sheetOptionIcon}>
                  <Ionicons
                    name="cube-outline"
                    size={19}
                    color="#1D4ED8"
                  />
                </View>
                <View style={styles.sheetOptionText}>
                  <Text
                    style={styles.sheetOptionLabel}
                  >
                    {item.label}
                  </Text>
                  {item.subtitle ? (
                    <Text
                      style={
                        styles.sheetOptionSubtitle
                      }
                    >
                      {item.subtitle}
                    </Text>
                  ) : null}
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color="#94A3B8"
                />
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.sheetEmpty}>
                No assets found.
              </Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

function Empty({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons
          name="clipboard-outline"
          size={29}
          color="#64748B"
        />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator
        size="large"
        color="#2563EB"
      />
      <Text style={styles.loadingText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 10,
  },
  header: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    padding: 12,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, marginLeft: 10 },
  pageTitle: {
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "900",
  },
  pageSubtitle: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 2,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  projectContext: {
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginTop: 9,
  },
  projectContextLabel: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  projectContextValue: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  listContent: {
    padding: 12,
    paddingBottom: 100,
  },
  assignmentPanel: {
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    padding: 13,
    marginBottom: 10,
  },
  assignmentPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  assignmentPanelIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  assignmentPanelTitleWrap: {
    flex: 1,
    marginLeft: 9,
  },
  assignmentPanelTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
  },
  assignmentPanelSubtitle: {
    color: "#475569",
    fontSize: 9,
    lineHeight: 14,
    marginTop: 2,
  },
  assignedAssetRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    padding: 9,
    marginBottom: 7,
  },
  assignedAssetIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  assignedAssetIconComplete: {
    backgroundColor: "#DCFCE7",
  },
  assignedAssetIconPending: {
    backgroundColor: "#FEF3C7",
  },
  assignedAssetText: {
    flex: 1,
    marginLeft: 9,
  },
  assignedAssetLabel: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  assignedAssetValue: {
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 2,
  },
  assignedAssetStatus: {
    fontSize: 8,
    fontWeight: "800",
    marginTop: 2,
  },
  assignedAssetStatusComplete: {
    color: "#15803D",
  },
  assignedAssetStatusPending: {
    color: "#B45309",
  },
  assignedAssetActions: {
    alignItems: "flex-end",
    gap: 5,
    marginLeft: 8,
  },
  assignedAssetChange: {
    color: "#1D4ED8",
    fontSize: 9,
    fontWeight: "900",
  },
  assignedAssetStart: {
    borderRadius: 8,
    backgroundColor: "#0F172A",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  assignedAssetStartText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "900",
  },
  reminderControls: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#BFDBFE",
    paddingTop: 10,
    marginTop: 3,
  },
  reminderSwitchText: { flex: 1 },
  reminderSwitchLabel: {
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "800",
  },
  reminderSwitchHelper: {
    color: "#64748B",
    fontSize: 8,
    lineHeight: 13,
    marginTop: 2,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginBottom: 10,
  },
  summaryCard: {
    width: "48.7%",
    minHeight: 70,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
  },
  summaryLabel: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  summaryValue: {
    fontSize: 21,
    fontWeight: "900",
    marginTop: 4,
  },
  startButtons: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 15,
  },
  vehicleStartButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#1D4ED8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  plantStartButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#6D28D9",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  startButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    marginLeft: 6,
  },
  historyHeading: { marginBottom: 8 },
  historyHeadingTitle: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "900",
  },
  historyHeadingSubtitle: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 2,
  },
  searchBox: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 11,
  },
  searchInput: {
    flex: 1,
    color: "#0F172A",
    fontSize: 13,
    paddingVertical: 8,
    marginHorizontal: 8,
  },
  filterTabs: {
    gap: 6,
    paddingVertical: 8,
    marginBottom: 2,
  },
  filterTab: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  filterTabActive: {
    borderColor: "#0F172A",
    backgroundColor: "#0F172A",
  },
  filterTabText: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "800",
  },
  filterTabTextActive: { color: "#FFFFFF" },
  historyCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 13,
    marginBottom: 9,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  historyIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  historyIconPassed: { backgroundColor: "#DCFCE7" },
  historyIconIssue: { backgroundColor: "#FEF3C7" },
  historyTitleWrap: {
    flex: 1,
    marginLeft: 10,
  },
  historyTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  historyTitle: {
    flex: 1,
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "900",
  },
  assetTypeBadge: {
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  assetTypeBadgeText: {
    color: "#475569",
    fontSize: 7,
    fontWeight: "900",
  },
  historySubtitle: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 3,
  },
  severityBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  severityBadgeText: {
    fontSize: 8,
    fontWeight: "900",
  },
  historyDetails: {
    flexDirection: "row",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    padding: 9,
    marginTop: 10,
  },
  historyDetail: { flex: 1 },
  historyDetailLabel: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  historyDetailValue: {
    color: "#0F172A",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3,
  },
  fleetJobStrip: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#FFFBEB",
    paddingHorizontal: 9,
    marginTop: 9,
  },
  fleetJobStripText: {
    color: "#92400E",
    fontSize: 10,
    fontWeight: "800",
    marginLeft: 6,
  },
  modalSafe: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  modalScreen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  modalHeader: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  modalClose: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  modalHeaderText: {
    flex: 1,
    marginHorizontal: 8,
  },
  modalTitle: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },
  modalSubtitle: {
    color: "#64748B",
    fontSize: 9,
    textAlign: "center",
    marginTop: 2,
  },
  modalHeaderSpacer: { width: 40 },
  stepTrack: {
    flexDirection: "row",
    gap: 5,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingBottom: 9,
  },
  stepSegment: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
  },
  stepSegmentActive: { backgroundColor: "#2563EB" },
  modalBody: { flex: 1 },
  formContent: {
    padding: 12,
    paddingBottom: 30,
  },
  modalFooter: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  sectionCard: {
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 13,
    marginBottom: 10,
  },
  sectionTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
  },
  sectionBody: { marginTop: 10 },
  assetTypeSwitch: {
    flexDirection: "row",
    gap: 8,
  },
  assetTypeSwitchButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  assetTypeSwitchButtonActive: {
    borderColor: "#0F172A",
    backgroundColor: "#0F172A",
  },
  assetTypeSwitchText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900",
    marginLeft: 6,
  },
  assetTypeSwitchTextActive: { color: "#FFFFFF" },
  assetSelector: {
    minHeight: 61,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 11,
  },
  assetSelectorIcon: {
    width: 41,
    height: 41,
    borderRadius: 13,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  assetSelectorText: {
    flex: 1,
    marginHorizontal: 10,
  },
  assetSelectorLabel: {
    color: "#1D4ED8",
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  assetSelectorValue: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 3,
  },
  assetInfoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 10,
  },
  detailMetric: {
    width: "48.7%",
    minHeight: 68,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    padding: 9,
  },
  detailMetricLabel: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  detailMetricValue: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 4,
  },
  field: { marginBottom: 10 },
  fieldLabel: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 5,
  },
  fieldInput: {
    minHeight: 47,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    color: "#0F172A",
    fontSize: 13,
    paddingHorizontal: 12,
  },
  readOnlyField: {
    minHeight: 54,
    borderRadius: 13,
    backgroundColor: "#F1F5F9",
    padding: 11,
    marginBottom: 10,
  },
  readOnlyLabel: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  readOnlyValue: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 4,
  },
  conditionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  conditionButton: {
    width: "48.7%",
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  conditionButtonActive: {
    borderColor: "#2563EB",
    backgroundColor: "#2563EB",
  },
  conditionButtonUnsafe: {
    borderColor: "#DC2626",
    backgroundColor: "#DC2626",
  },
  conditionButtonText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900",
  },
  conditionButtonTextActive: { color: "#FFFFFF" },
  checklistHelp: {
    flexDirection: "row",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    padding: 11,
    marginBottom: 10,
  },
  checklistHelpText: {
    flex: 1,
    color: "#1E40AF",
    fontSize: 10,
    lineHeight: 16,
    marginLeft: 8,
  },
  checklistRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 10,
  },
  checklistRowFailed: {
    borderRadius: 12,
    borderBottomWidth: 0,
    backgroundColor: "#FFF1F2",
    padding: 10,
    marginBottom: 7,
  },
  checklistItem: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 8,
  },
  answerRow: {
    flexDirection: "row",
    gap: 6,
  },
  answerButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  answerButtonYes: {
    borderColor: "#16A34A",
    backgroundColor: "#16A34A",
  },
  answerButtonNo: {
    borderColor: "#DC2626",
    backgroundColor: "#DC2626",
  },
  answerButtonNa: {
    borderColor: "#475569",
    backgroundColor: "#475569",
  },
  answerButtonText: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "900",
  },
  answerButtonTextActive: { color: "#FFFFFF" },
  failedChecklistDetails: { marginTop: 10 },
  failedChecklistLabel: {
    color: "#BE123C",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  severityOptionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  severityOption: {
    width: "48.7%",
    minHeight: 35,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#FDA4AF",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  severityOptionActive: {
    borderColor: "#D97706",
    backgroundColor: "#D97706",
  },
  severityOptionCritical: {
    borderColor: "#BE123C",
    backgroundColor: "#BE123C",
  },
  severityOptionText: {
    color: "#9F1239",
    fontSize: 9,
    fontWeight: "900",
  },
  severityOptionTextActive: { color: "#FFFFFF" },
  defectCommentInput: {
    minHeight: 78,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#FDA4AF",
    backgroundColor: "#FFFFFF",
    color: "#0F172A",
    fontSize: 12,
    padding: 10,
    marginTop: 8,
  },
  reviewResult: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 15,
    borderWidth: 1,
    padding: 13,
    marginBottom: 10,
  },
  reviewResultPassed: {
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
  },
  reviewResultIssue: {
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
  },
  reviewResultText: {
    flex: 1,
    marginLeft: 10,
  },
  reviewResultTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
  },
  reviewResultSubtitle: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 3,
  },
  failedItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECDD3",
    backgroundColor: "#FFF1F2",
    padding: 10,
    marginBottom: 7,
  },
  failedItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  failedItemTitle: {
    flex: 1,
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "900",
    marginRight: 8,
  },
  failedItemComment: {
    color: "#881337",
    fontSize: 10,
    lineHeight: 16,
    marginTop: 7,
  },
  commentsInput: {
    minHeight: 110,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    color: "#0F172A",
    fontSize: 12,
    padding: 10,
  },
  secondaryButton: {
    minWidth: 94,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
  },
  secondaryButtonText: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "900",
    marginLeft: 4,
  },
  nextButton: {
    minWidth: 135,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: "#0F172A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  nextButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    marginRight: 6,
  },
  submitButton: {
    minWidth: 166,
    minHeight: 47,
    borderRadius: 13,
    backgroundColor: "#16A34A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    marginLeft: 6,
  },
  buttonDisabled: { opacity: 0.5 },
  detailContent: {
    padding: 12,
    paddingBottom: 40,
  },
  detailResultCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    padding: 13,
    marginBottom: 10,
  },
  detailResultPassed: {
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
  },
  detailResultIssue: {
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
  },
  detailResultText: {
    flex: 1,
    marginLeft: 10,
  },
  detailResultTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
  },
  detailResultSubtitle: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 2,
  },
  linkedFleetJob: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#FFFBEB",
    padding: 11,
  },
  linkedFleetJobText: {
    flex: 1,
    marginLeft: 8,
  },
  linkedFleetJobTitle: {
    color: "#92400E",
    fontSize: 12,
    fontWeight: "900",
  },
  linkedFleetJobSubtitle: {
    color: "#B45309",
    fontSize: 9,
    marginTop: 2,
  },
  detailChecklistRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 9,
  },
  detailChecklistRowFailed: {
    borderRadius: 11,
    borderBottomWidth: 0,
    backgroundColor: "#FFF1F2",
    padding: 9,
    marginBottom: 6,
  },
  detailChecklistHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailChecklistItem: {
    flex: 1,
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "800",
  },
  answerBadge: {
    minWidth: 36,
    borderRadius: 999,
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  answerBadgeYes: { backgroundColor: "#DCFCE7" },
  answerBadgeNo: { backgroundColor: "#FFE4E6" },
  answerBadgeNa: { backgroundColor: "#E2E8F0" },
  answerBadgeText: {
    color: "#334155",
    fontSize: 9,
    fontWeight: "900",
  },
  detailFailure: {
    alignItems: "flex-start",
    marginTop: 8,
  },
  detailFailureComment: {
    color: "#881337",
    fontSize: 10,
    lineHeight: 16,
    marginTop: 6,
  },
  generalCommentsText: {
    color: "#475569",
    fontSize: 11,
    lineHeight: 18,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.48)",
  },
  sheet: {
    maxHeight: "82%",
    minHeight: 330,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 9,
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  sheetTitle: {
    flex: 1,
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900",
  },
  sheetClose: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetSearch: {
    minHeight: 45,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    marginHorizontal: 15,
    marginBottom: 8,
    paddingHorizontal: 11,
  },
  sheetSearchInput: {
    flex: 1,
    color: "#0F172A",
    fontSize: 13,
    paddingVertical: 8,
    marginLeft: 8,
  },
  sheetList: {
    paddingHorizontal: 13,
    paddingBottom: 35,
  },
  sheetOption: {
    minHeight: 63,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingHorizontal: 5,
  },
  sheetOptionPressed: {
    backgroundColor: "#F8FAFC",
  },
  sheetOptionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },
  sheetOptionText: { flex: 1 },
  sheetOptionLabel: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "900",
  },
  sheetOptionSubtitle: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 3,
  },
  sheetEmpty: {
    color: "#64748B",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 35,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 52,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 12,
  },
  emptyText: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 5,
  },
});

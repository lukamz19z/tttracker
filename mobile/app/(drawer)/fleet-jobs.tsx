import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
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
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type AssetType = "Vehicle" | "Plant";
type FleetJobStatus =
  | "Open"
  | "In Progress"
  | "Waiting Parts"
  | "Booked"
  | "Completed"
  | "Closed";
type FleetJobPriority = "Low" | "Medium" | "High" | "Critical";
type JobFilter =
  | "Active"
  | "Open"
  | "In Progress"
  | "Waiting Parts"
  | "Booked"
  | "Completed";
type AssetHistoryType = "Repair" | "Modification" | "Service";

type NotificationPreferences = {
  fleet_enabled: boolean;
  phone_enabled: boolean;
  email_enabled: boolean;
  remind_after_3_days: boolean;
  remind_after_7_days: boolean;
  high_priority_immediate: boolean;
};

type NotificationPreferenceRow = NotificationPreferences & {
  id?: string;
  user_id: string;
  email: string | null;
  expo_push_token: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

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
  plant_asset_id?: string | null;
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

type FleetJobUpdate = {
  id: string;
  fleet_job_id: string;
  update_type: string | null;
  status: string | null;
  comment: string | null;
  created_at: string | null;
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

type ChecklistAnswer =
  | string
  | { answer?: string; severity?: string; comment?: string };

type VehiclePrestart = {
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

type FaultCorrection = {
  id: string;
  fault: string;
  prestart_comment: string;
  severity: string;
  correction: string;
};

type ManualJobForm = {
  asset_type: AssetType;
  asset_id: string;
  title: string;
  description: string;
  priority: FleetJobPriority;
  status: FleetJobStatus;
  reported_by: string;
  assigned_to: string;
  vendor: string;
  due_date: string;
  cost: string;
  notes: string;
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

type JobBundle = {
  job: FleetJob;
  vehicle: VehicleAsset | null;
  plant: PlantAsset | null;
  prestart: VehiclePrestart | null;
  updates: FleetJobUpdate[];
  assetHistory: AssetHistoryRecord | null;
};

const statuses: FleetJobStatus[] = [
  "Open",
  "In Progress",
  "Waiting Parts",
  "Booked",
  "Completed",
  "Closed",
];

const activeStatuses: FleetJobStatus[] = [
  "Open",
  "In Progress",
  "Waiting Parts",
  "Booked",
];

const priorities: FleetJobPriority[] = [
  "Low",
  "Medium",
  "High",
  "Critical",
];

const filters: JobFilter[] = [
  "Active",
  "Open",
  "In Progress",
  "Waiting Parts",
  "Booked",
  "Completed",
];

const faultJsonStart = "[[FAULT_CORRECTIONS_JSON_START]]";
const faultJsonEnd = "[[FAULT_CORRECTIONS_JSON_END]]";

const defaultNotificationPreferences: NotificationPreferences = {
  fleet_enabled: false,
  phone_enabled: false,
  email_enabled: false,
  remind_after_3_days: true,
  remind_after_7_days: true,
  high_priority_immediate: true,
};

const fleetNotificationChannelId = "fleet-jobs";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const message = clean(record.message);
    const details = clean(record.details);
    const hint = clean(record.hint);
    const code = clean(record.code);

    return [message, details, hint, code ? `Code: ${code}` : ""]
      .filter(Boolean)
      .join("\n");
  }

  return clean(error) || "Unknown error";
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function projectMatches(
  value: string,
  projectName: string,
  projectNumber: string,
): boolean {
  const project = value.toLowerCase();
  const name = projectName.toLowerCase();
  const number = projectNumber.toLowerCase();
  if (!project) return true;
  return (
    project === name ||
    project === number ||
    Boolean(name && project.includes(name)) ||
    Boolean(number && project.includes(number))
  );
}

function toStatus(value?: string | null): FleetJobStatus {
  return statuses.includes(value as FleetJobStatus)
    ? (value as FleetJobStatus)
    : "Open";
}

function toPriority(value?: string | null): FleetJobPriority {
  return priorities.includes(value as FleetJobPriority)
    ? (value as FleetJobPriority)
    : "Medium";
}

function isClosedStatus(value?: string | null): boolean {
  return ["Completed", "Closed"].includes(toStatus(value));
}

function assetTypeForJob(job: FleetJob): AssetType {
  return job.asset_type === "Plant" || job.plant_id || job.plant_asset_id
    ? "Plant"
    : "Vehicle";
}

function assetLabelForJob(bundle: JobBundle): string {
  if (assetTypeForJob(bundle.job) === "Plant") {
    return [
      bundle.plant?.asset_id,
      bundle.plant?.rego,
      bundle.plant?.make,
      bundle.plant?.model,
      bundle.plant?.plant_type,
    ]
      .map(clean)
      .filter(Boolean)
      .join(" · ") || clean(bundle.job.asset_label) || "Plant not linked";
  }

  return [
    bundle.vehicle?.vehicle_id,
    bundle.vehicle?.vehicle_rego || bundle.vehicle?.rego,
    bundle.vehicle?.make,
    bundle.vehicle?.model,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" · ") || clean(bundle.job.asset_label) || "Vehicle not linked";
}


function statusFromBundle(bundle: JobBundle): FleetJobStatus {
  const jobStatus = toStatus(bundle.job.status);

  /*
   * fleet_jobs.status is the live source of truth for the register.
   * Progress notes and fault-correction updates preserve their historical
   * status, but they must never override a newer status saved on the job.
   */
  if (bundle.assetHistory && isClosedStatus(jobStatus)) {
    return "Completed";
  }

  return jobStatus;
}

function getAnswer(value: ChecklistAnswer | undefined): string {
  if (!value) return "";
  return typeof value === "string" ? value : clean(value.answer);
}

function getComment(value: ChecklistAnswer | undefined): string {
  return !value || typeof value === "string" ? "" : clean(value.comment);
}

function getSeverity(value: ChecklistAnswer | undefined): string {
  return !value || typeof value === "string" ? "" : clean(value.severity);
}

function labelFromKey(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normaliseFaults(bundle: JobBundle): FaultCorrection[] {
  const checklist = bundle.prestart?.checklist ?? {};
  const rows = Object.entries(checklist)
    .filter(([, value]) =>
      ["no", "fail", "failed", "defect"].includes(
        getAnswer(value).toLowerCase(),
      ),
    )
    .map(([key, value], index) => ({
      id: `${key}-${index}`,
      fault: labelFromKey(key),
      prestart_comment:
        getComment(value) || "No additional prestart comment provided.",
      severity: getSeverity(value),
      correction: "",
    }));

  if (rows.length > 0) return rows;

  return clean(bundle.job.description)
    .split(/\n|•|;/)
    .map((item) => item.trim())
    .filter((item) => item.length > 3)
    .filter(
      (item) =>
        !item.toLowerCase().startsWith("severity:") &&
        !item.toLowerCase().startsWith("comment:") &&
        !item.toLowerCase().startsWith("kilometres:") &&
        !item.toLowerCase().startsWith("plant hours:"),
    )
    .slice(0, 12)
    .map((item, index) => ({
      id: `fault-${index}`,
      fault: item,
      prestart_comment: "No additional prestart comment provided.",
      severity: "",
      correction: "",
    }));
}

function parseCorrections(comment?: string | null): FaultCorrection[] {
  if (!comment) return [];
  const start = comment.indexOf(faultJsonStart);
  const end = comment.indexOf(faultJsonEnd);
  if (start === -1 || end === -1 || end <= start) return [];

  try {
    const parsed = JSON.parse(
      comment.slice(start + faultJsonStart.length, end).trim(),
    ) as FaultCorrection[];
    return Array.isArray(parsed)
      ? parsed.map((row, index) => ({
          id: clean(row.id) || `fault-${index}`,
          fault: clean(row.fault) || `Fault ${index + 1}`,
          prestart_comment:
            clean(row.prestart_comment) ||
            "No additional prestart comment provided.",
          severity: clean(row.severity),
          correction: clean(row.correction),
        }))
      : [];
  } catch {
    return [];
  }
}

function buildCorrectionText(corrections: FaultCorrection[]): string {
  const readable = corrections
    .map(
      (row, index) =>
        `${index + 1}. ${row.fault}\nPrestart comment: ${row.prestart_comment || "N/A"}\nMechanic correction: ${row.correction || "N/A"}`,
    )
    .join("\n\n");

  return `Fault Corrections:\n${readable}\n\n${faultJsonStart}\n${JSON.stringify(
    corrections,
  )}\n${faultJsonEnd}`;
}

function extractCloseOut(comment?: string | null): string {
  if (!comment) return "";
  const start = comment.indexOf(faultJsonStart);
  const cleaned = start === -1 ? comment : comment.slice(0, start);
  return cleaned
    .replace(/\n?Fault Corrections:[\s\S]*$/, "")
    .replace(/\n?Asset history recorded as:[\s\S]*$/, "")
    .replace(/\n?Asset update record:[\s\S]*$/, "")
    .trim();
}


function reminderBaseDate(job: FleetJob): Date | null {
  const value = job.reported_date || job.created_at;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function reminderIdentifier(
  jobId: string,
  userId: string,
  days: 3 | 7,
): string {
  return `fleet-job:${userId}:${jobId}:${days}`;
}

function reminderBody(job: FleetJob, days: 3 | 7): string {
  const jobNumber = clean(job.job_number) || "Fleet Job";
  const title = clean(job.title) || "Unresolved fault";
  return `${jobNumber} has remained active for ${days} days: ${title}`;
}

function futureReminderDate(
  job: FleetJob,
  days: 3 | 7,
): Date | null {
  const base = reminderBaseDate(job);
  if (!base) return null;

  const trigger = new Date(base);
  trigger.setDate(trigger.getDate() + days);
  trigger.setHours(8, 0, 0, 0);

  return trigger.getTime() > Date.now() ? trigger : null;
}


type FleetNotificationKind =
  | "created"
  | "updated"
  | "completed"
  | "reopened";

type DispatchFleetNotificationResult = {
  recipient_count?: number | null;
  notification_count?: number | null;
  push_count?: number | null;
};

export default function FleetJobsScreen() {
  const { profile } = useAuth();
  const profileRecord = profile as unknown as
    | {
        fullName?: string | null;
        name?: string | null;
        crew?: string | null;
        projectId?: string | null;
        projectName?: string | null;
        projectNumber?: string | null;
      }
    | null;

  const projectId = clean(profileRecord?.projectId);
  const projectName = clean(profileRecord?.projectName);
  const projectNumber = clean(profileRecord?.projectNumber);

  const [bundles, setBundles] = useState<JobBundle[]>([]);
  const [vehicleAssets, setVehicleAssets] = useState<VehicleAsset[]>([]);
  const [plantAssets, setPlantAssets] = useState<PlantAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<JobFilter>("Active");
  const [selectedId, setSelectedId] = useState("");
  const [detailVisible, setDetailVisible] = useState(false);
  const [closeOutVisible, setCloseOutVisible] = useState(false);
  const [manualVisible, setManualVisible] = useState(false);
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationUserId, setNotificationUserId] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>(defaultNotificationPreferences);
  const [status, setStatus] = useState<FleetJobStatus>("Open");
  const [priority, setPriority] = useState<FleetJobPriority>("Medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [vendor, setVendor] = useState("");
  const [cost, setCost] = useState("");
  const [progressNote, setProgressNote] = useState("");
  const [faultCorrections, setFaultCorrections] = useState<FaultCorrection[]>([]);
  const [manualForm, setManualForm] = useState<ManualJobForm>({
    asset_type: "Vehicle",
    asset_id: "",
    title: "",
    description: "",
    priority: "Medium",
    status: "Open",
    reported_by: clean(profileRecord?.fullName) || clean(profileRecord?.name),
    assigned_to: "",
    vendor: "",
    due_date: "",
    cost: "",
    notes: "",
  });
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



  const dispatchFleetJobNotification = useCallback(
    async (
      fleetJobId: string,
      kind: FleetNotificationKind,
      detail?: string,
    ): Promise<DispatchFleetNotificationResult | null> => {
      const { data, error } = await supabase.rpc(
        "dispatch_fleet_job_notification",
        {
          p_fleet_job_id: fleetJobId,
          p_event_type: `fleet_job_${kind}`,
          p_detail: detail?.trim() || null,
        },
      );

      if (error) {
        console.error(
          "Fleet Job notification dispatch failed:",
          errorMessage(error),
        );
        return null;
      }

      if (Array.isArray(data)) {
        return (data[0] as DispatchFleetNotificationResult | undefined) ?? null;
      }

      return (data as DispatchFleetNotificationResult | null) ?? null;
    },
    [],
  );

  const loadNotificationPreferences = useCallback(async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setNotificationUserId("");
      setNotificationEmail("");
      setNotificationPreferences(defaultNotificationPreferences);
      return;
    }

    setNotificationUserId(user.id);
    setNotificationEmail(user.email ?? "");

    const { data, error } = await supabase
      .from("fleet_job_notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.warn(
        "Could not load Fleet Job notification preferences:",
        errorMessage(error),
      );
      return;
    }

    if (data) {
      const row = data as NotificationPreferenceRow;
      setNotificationPreferences({
        fleet_enabled: Boolean(row.fleet_enabled),
        phone_enabled: Boolean(row.phone_enabled),
        email_enabled: Boolean(row.email_enabled),
        remind_after_3_days: row.remind_after_3_days !== false,
        remind_after_7_days: row.remind_after_7_days !== false,
        high_priority_immediate: row.high_priority_immediate !== false,
      });
    }
  }, []);

  const ensureNotificationPermission = useCallback(async () => {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(
        fleetNotificationChannelId,
        {
          name: "Fleet Job reminders",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#2563EB",
        },
      );
    }

    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;

    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  }, []);

  const cancelFleetReminderNotifications = useCallback(
    async (userId: string) => {
      const scheduled =
        await Notifications.getAllScheduledNotificationsAsync();

      const fleetIds = scheduled
        .map((notification) => notification.identifier)
        .filter((identifier) =>
          identifier.startsWith(`fleet-job:${userId}:`),
        );

      await Promise.all(
        fleetIds.map((identifier) =>
          Notifications.cancelScheduledNotificationAsync(identifier),
        ),
      );
    },
    [],
  );

  const schedulePhoneReminders = useCallback(
    async (
      userId: string,
      preferences: NotificationPreferences,
      currentBundles: JobBundle[],
    ) => {
      await cancelFleetReminderNotifications(userId);

      if (!preferences.phone_enabled) return;

      const allowed = await ensureNotificationPermission();
      if (!allowed) {
        throw new Error(
          "Phone notification permission was not granted. Enable notifications for this app in your phone settings.",
        );
      }

      const activeJobs = currentBundles.filter(
        (bundle) => !isClosedStatus(statusFromBundle(bundle)),
      );

      const reminders: { job: FleetJob; days: 3 | 7; date: Date }[] = [];

      for (const bundle of activeJobs) {
        if (preferences.remind_after_3_days) {
          const date = futureReminderDate(bundle.job, 3);
          if (date) reminders.push({ job: bundle.job, days: 3, date });
        }

        if (preferences.remind_after_7_days) {
          const date = futureReminderDate(bundle.job, 7);
          if (date) reminders.push({ job: bundle.job, days: 7, date });
        }
      }

      await Promise.all(
        reminders.map(({ job, days, date }) =>
          Notifications.scheduleNotificationAsync({
            identifier: reminderIdentifier(job.id, userId, days),
            content: {
              title: `Fleet Job ${days}-day reminder`,
              body: reminderBody(job, days),
              sound: true,
              data: {
                screen: "fleet-jobs",
                fleet_job_id: job.id,
                job_number: job.job_number,
              },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date,
              channelId:
                Platform.OS === "android"
                  ? fleetNotificationChannelId
                  : undefined,
            },
          }),
        ),
      );
    },
    [cancelFleetReminderNotifications, ensureNotificationPermission],
  );

  const queueEmailReminders = useCallback(
    async (
      userId: string,
      email: string,
      preferences: NotificationPreferences,
      currentBundles: JobBundle[],
    ) => {
      const { error: deleteError } = await supabase
        .from("fleet_job_notification_queue")
        .delete()
        .eq("user_id", userId)
        .eq("channel", "email")
        .eq("status", "pending");

      if (deleteError) throw deleteError;

      if (!preferences.email_enabled || !email) return;

      const rows: {
        user_id: string;
        email: string;
        fleet_job_id: string;
        channel: "email";
        reminder_stage: "3_day" | "7_day";
        send_at: string;
        status: "pending";
        subject: string;
        message: string;
      }[] = [];

      for (const bundle of currentBundles) {
        if (isClosedStatus(statusFromBundle(bundle))) continue;

        if (preferences.remind_after_3_days) {
          const date = futureReminderDate(bundle.job, 3);
          if (date) {
            rows.push({
              user_id: userId,
              email,
              fleet_job_id: bundle.job.id,
              channel: "email",
              reminder_stage: "3_day",
              send_at: date.toISOString(),
              status: "pending",
              subject: `Fleet Job 3-day reminder: ${
                clean(bundle.job.job_number) || "Fleet Job"
              }`,
              message: reminderBody(bundle.job, 3),
            });
          }
        }

        if (preferences.remind_after_7_days) {
          const date = futureReminderDate(bundle.job, 7);
          if (date) {
            rows.push({
              user_id: userId,
              email,
              fleet_job_id: bundle.job.id,
              channel: "email",
              reminder_stage: "7_day",
              send_at: date.toISOString(),
              status: "pending",
              subject: `Fleet Job 7-day reminder: ${
                clean(bundle.job.job_number) || "Fleet Job"
              }`,
              message: reminderBody(bundle.job, 7),
            });
          }
        }
      }

      if (rows.length) {
        const { error } = await supabase
          .from("fleet_job_notification_queue")
          .insert(rows);

        if (error) throw error;
      }
    },
    [],
  );

  async function saveNotificationPreferences() {
    if (!notificationUserId) {
      Alert.alert(
        "Sign-in required",
        "The logged-in user could not be identified.",
      );
      return;
    }

    if (
      !notificationPreferences.fleet_enabled &&
      (notificationPreferences.phone_enabled ||
        notificationPreferences.email_enabled)
    ) {
      Alert.alert(
        "Fleet Job notifications disabled",
        "Enable Fleet Job notifications before enabling phone or email delivery.",
      );
      return;
    }

    if (
      notificationPreferences.email_enabled &&
      !notificationEmail.trim()
    ) {
      Alert.alert(
        "Email unavailable",
        "The logged-in account does not have an email address.",
      );
      return;
    }

    setNotificationSaving(true);

    try {
      let expoPushToken: string | null = null;

      if (notificationPreferences.phone_enabled) {
        const allowed = await ensureNotificationPermission();
        if (!allowed) {
          throw new Error(
            "Phone notification permission was not granted.",
          );
        }

        const isExpoGo =
          Constants.executionEnvironment ===
          Constants.ExecutionEnvironment.StoreClient;

        if (!isExpoGo) {
          try {
            const projectId =
              Constants.expoConfig?.extra?.eas?.projectId ??
              Constants.easConfig?.projectId;

            const token = await Notifications.getExpoPushTokenAsync(
              projectId ? { projectId } : undefined,
            );
            expoPushToken = token.data;
          } catch (tokenError) {
            console.warn(
              "Expo push token registration failed:",
              errorMessage(tokenError),
            );
            expoPushToken = null;
          }
        } else {
          // Remote Android push notifications do not work in Expo Go.
          // Local scheduled reminders still work during Expo Go testing.
          expoPushToken = null;
        }
      }

      const preferenceRow: NotificationPreferenceRow = {
        user_id: notificationUserId,
        email: notificationEmail.trim() || null,
        expo_push_token: expoPushToken,
        ...notificationPreferences,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("fleet_job_notification_preferences")
        .upsert(preferenceRow, {
          onConflict: "user_id",
        });

      if (error) throw error;

      await schedulePhoneReminders(
        notificationUserId,
        notificationPreferences,
        bundles,
      );

      await queueEmailReminders(
        notificationUserId,
        notificationEmail.trim(),
        notificationPreferences,
        bundles,
      );

      setNotificationVisible(false);

      Alert.alert(
        "Notification preferences saved",
        [
          notificationPreferences.fleet_enabled
            ? "Fleet Job Notification Centre alerts enabled"
            : "Fleet Job Notification Centre alerts disabled",
          notificationPreferences.phone_enabled
            ? "Phone reminders enabled"
            : "Phone reminders disabled",
          notificationPreferences.email_enabled
            ? `Email reminders enabled for ${notificationEmail}`
            : "Email reminders disabled",
          notificationPreferences.remind_after_3_days
            ? "3-day reminders enabled"
            : "3-day reminders disabled",
          notificationPreferences.remind_after_7_days
            ? "7-day reminders enabled"
            : "7-day reminders disabled",
        ].join("\n"),
      );
    } catch (error) {
      Alert.alert(
        "Could not save notification preferences",
        errorMessage(error),
      );
    } finally {
      setNotificationSaving(false);
    }
  }

  const loadData = useCallback(
    async (showLoader = true) => {
      if (showLoader) setLoading(true);

      const [jobs, updates, vehicles, plant, prestarts, history] =
        await Promise.all([
          supabase.from("fleet_jobs").select("*").order("created_at", { ascending: false }),
          supabase.from("fleet_job_updates").select("*").order("created_at", { ascending: false }),
          supabase.from("vehicle_assets").select("*"),
          supabase.from("plant_assets").select("*"),
          supabase.from("vehicle_prestarts").select("*").order("created_at", { ascending: false }),
          supabase.from("asset_history").select("*").order("created_at", { ascending: false }),
        ]);

      if (jobs.error) {
        Alert.alert("Could not load Fleet Jobs", jobs.error.message);
        setBundles([]);
        setLoading(false);
        return;
      }

      const vehicleRows = (vehicles.data ?? []) as VehicleAsset[];
      const plantRows = (plant.data ?? []) as PlantAsset[];
      setVehicleAssets(vehicleRows);
      setPlantAssets(plantRows);
      const prestartRows = (prestarts.data ?? []) as VehiclePrestart[];
      const updateRows = (updates.data ?? []) as FleetJobUpdate[];
      const historyRows = (history.data ?? []) as AssetHistoryRecord[];

      const vehicleMap = new Map(vehicleRows.map((row) => [row.id, row]));
      const plantMap = new Map(plantRows.map((row) => [row.id, row]));
      const prestartMap = new Map(prestartRows.map((row) => [row.id, row]));

      const nextBundles = ((jobs.data ?? []) as FleetJob[])
        .filter((job) =>
          projectId
            ? projectMatches(clean(job.project), projectName, projectNumber)
            : false,
        )
        .map<JobBundle>((job) => {
          const vehicleId = job.vehicle_id || job.vehicle_asset_id || "";
          const plantId = job.plant_id || job.plant_asset_id || "";
          const prestartId = job.prestart_id || job.source_id || "";
          return {
            job,
            vehicle: vehicleId ? vehicleMap.get(vehicleId) ?? null : null,
            plant: plantId ? plantMap.get(plantId) ?? null : null,
            prestart: prestartId ? prestartMap.get(prestartId) ?? null : null,
            updates: updateRows.filter((row) => row.fleet_job_id === job.id),
            assetHistory:
              historyRows.find((row) => row.fleet_job_id === job.id) ?? null,
          };
        });

      setBundles(nextBundles);
      if (showLoader) setLoading(false);
    },
    [projectId, projectName, projectNumber],
  );

  useEffect(() => {
    void loadData();
    void loadNotificationPreferences();
  }, [loadData, loadNotificationPreferences]);

  useEffect(() => {
    const channel = supabase
      .channel("mobile-fleet-jobs-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "fleet_jobs" }, () => void loadData(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "fleet_job_updates" }, () => void loadData(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicle_prestarts" }, () => void loadData(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "asset_history" }, () => void loadData(false))
      .subscribe();

    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void loadData(false);
    });

    return () => {
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [loadData]);

  const selected = useMemo(
    () => bundles.find((bundle) => bundle.job.id === selectedId) ?? null,
    [bundles, selectedId],
  );

  const stats = useMemo(
    () => ({
      open: bundles.filter((item) => statusFromBundle(item) === "Open").length,
      progress: bundles.filter((item) =>
        ["In Progress", "Booked"].includes(statusFromBundle(item)),
      ).length,
      waiting: bundles.filter((item) => statusFromBundle(item) === "Waiting Parts").length,
      completed: bundles.filter((item) => isClosedStatus(statusFromBundle(item))).length,
    }),
    [bundles],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return bundles.filter((bundle) => {
      const currentStatus = statusFromBundle(bundle);
      if (filter === "Active" && !activeStatuses.includes(currentStatus)) return false;
      if (filter === "Completed" && !isClosedStatus(currentStatus)) return false;
      if (filter !== "Active" && filter !== "Completed" && currentStatus !== filter) return false;
      if (!query) return true;
      return [
        bundle.job.job_number,
        bundle.job.title,
        bundle.job.description,
        bundle.job.source,
        bundle.job.priority,
        currentStatus,
        bundle.job.crew,
        bundle.job.assigned_to,
        bundle.job.vendor,
        assetLabelForJob(bundle),
        bundle.prestart?.docket_number,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [bundles, filter, search]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(false);
    setRefreshing(false);
  }, [loadData]);

  function openJob(bundle: JobBundle) {
    const saved = parseCorrections(
      bundle.updates.find((row) => row.update_type === "Fault Corrections")?.comment,
    );
    const closed = parseCorrections(
      bundle.updates.find((row) =>
        ["Close Out", "Close Out Edited"].includes(clean(row.update_type)),
      )?.comment,
    );

    setSelectedId(bundle.job.id);
    setStatus(statusFromBundle(bundle));
    setPriority(toPriority(bundle.job.priority));
    setAssignedTo(clean(bundle.job.assigned_to));
    setVendor(clean(bundle.job.vendor));
    setCost(bundle.job.cost == null ? "" : String(bundle.job.cost));
    setProgressNote("");
    setFaultCorrections(
      saved.length ? saved : closed.length ? closed : normaliseFaults(bundle),
    );
    setDetailVisible(true);
  }

  async function saveJob() {
    if (!selected) return;

    if (isClosedStatus(statusFromBundle(selected))) {
      Alert.alert(
        "Job is closed",
        "Reopen this Fleet Job before saving another mechanic update.",
      );
      return;
    }

    const originalStatus = toStatus(selected.job.status);
    const originalPriority = toPriority(selected.job.priority);
    const originalAssignedTo = clean(selected.job.assigned_to);
    const originalVendor = clean(selected.job.vendor);
    const originalCost =
      selected.job.cost == null ? "" : String(selected.job.cost);

    const changes: string[] = [];
    if (status !== originalStatus) {
      changes.push(`Status: ${originalStatus} → ${status}`);
    }
    if (priority !== originalPriority) {
      changes.push(`Priority: ${originalPriority} → ${priority}`);
    }
    if (assignedTo.trim() !== originalAssignedTo) {
      changes.push(
        `Assigned to: ${originalAssignedTo || "Unassigned"} → ${
          assignedTo.trim() || "Unassigned"
        }`,
      );
    }
    if (vendor.trim() !== originalVendor) {
      changes.push(
        `Vendor / mechanic: ${originalVendor || "Not set"} → ${
          vendor.trim() || "Not set"
        }`,
      );
    }
    if (cost !== originalCost) {
      changes.push(
        `Cost: ${originalCost || "Not set"} → ${cost || "Not set"}`,
      );
    }
    if (progressNote.trim()) {
      changes.push("Progress note added");
    }

    if (changes.length === 0) {
      Alert.alert(
        "Nothing to save",
        "Change a job field or enter a progress note first.",
      );
      return;
    }

    setSaving(true);

    try {
      const updatePayload = {
        status,
        priority,
        assigned_to: assignedTo.trim() || null,
        vendor: vendor.trim() || null,
        cost: numberOrNull(cost),
        updated_at: new Date().toISOString(),
      };

      const { data: updatedJob, error: jobError } = await supabase
        .from("fleet_jobs")
        .update(updatePayload)
        .eq("id", selected.job.id)
        .select("*")
        .single();

      if (jobError) {
        Alert.alert(
          "Could not save Fleet Job",
          errorMessage(jobError),
        );
        return;
      }

      setBundles((current) =>
        current.map((bundle) =>
          bundle.job.id === selected.job.id
            ? { ...bundle, job: updatedJob as FleetJob }
            : bundle,
        ),
      );

      let progressWarning = "";

      if (progressNote.trim()) {
        const { data: savedUpdate, error: progressError } = await supabase
          .from("fleet_job_updates")
          .insert({
            fleet_job_id: selected.job.id,
            update_type: "Progress",
            status,
            comment: progressNote.trim(),
          })
          .select("*")
          .single();

        if (progressError) {
          progressWarning = errorMessage(progressError);
        } else if (savedUpdate) {
          setBundles((current) =>
            current.map((bundle) =>
              bundle.job.id === selected.job.id
                ? {
                    ...bundle,
                    updates: [
                      savedUpdate as FleetJobUpdate,
                      ...bundle.updates,
                    ],
                  }
                : bundle,
            ),
          );
        }
      }

      setProgressNote("");

      await dispatchFleetJobNotification(
        (updatedJob as FleetJob).id,
        "updated",
        changes.join(" · "),
      );

      await loadData(false);

      if (progressWarning) {
        Alert.alert(
          "Job saved, progress note failed",
          `The Fleet Job fields were saved, but the progress note could not be added.

${progressWarning}`,
        );
        return;
      }

      Alert.alert(
        "Fleet Job updated",
        changes.map((item) => `• ${item}`).join("\n"),
      );
    } catch (error) {
      Alert.alert("Could not save Fleet Job", errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function saveCorrections() {
    if (!selected || isClosedStatus(statusFromBundle(selected))) return;
    setSaving(true);
    try {
      const cleaned = faultCorrections.map((row) => ({
        ...row,
        correction: row.correction.trim(),
      }));
      const existing = selected.updates.find((row) => row.update_type === "Fault Corrections");
      const payload = {
        status,
        comment: buildCorrectionText(cleaned),
        created_at: new Date().toISOString(),
      };
      const result = existing
        ? await supabase
            .from("fleet_job_updates")
            .update(payload)
            .eq("id", existing.id)
            .select("*")
        : await supabase
            .from("fleet_job_updates")
            .insert({
              fleet_job_id: selected.job.id,
              update_type: "Fault Corrections",
              ...payload,
            })
            .select("*");
      if (result.error) throw result.error;

      const savedUpdate = result.data?.[0] as FleetJobUpdate | undefined;
      setFaultCorrections(cleaned);
      if (savedUpdate) {
        setBundles((current) =>
          current.map((bundle) =>
            bundle.job.id === selected.job.id
              ? {
                  ...bundle,
                  updates: existing
                    ? bundle.updates.map((row) =>
                        row.id === existing.id ? savedUpdate : row,
                      )
                    : [savedUpdate, ...bundle.updates],
                }
              : bundle,
          ),
        );
      }

      await loadData(false);
      const addressed = cleaned.filter((row) => row.correction.length > 0).length;
      Alert.alert(
        "Corrections saved",
        `${addressed} of ${cleaned.length} fault${cleaned.length === 1 ? "" : "s"} marked as addressed.`,
      );
    } catch (error) {
      Alert.alert("Could not save corrections", errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function openManualJob() {
    setManualForm({
      asset_type: "Vehicle",
      asset_id: "",
      title: "",
      description: "",
      priority: "Medium",
      status: "Open",
      reported_by:
        clean(profileRecord?.fullName) || clean(profileRecord?.name),
      assigned_to: "",
      vendor: "",
      due_date: "",
      cost: "",
      notes: "",
    });
    setManualVisible(true);
  }

  async function createManualJob() {
    if (!manualForm.asset_id) {
      Alert.alert("Asset required", "Select the vehicle or plant item for this job.");
      return;
    }
    if (!manualForm.title.trim()) {
      Alert.alert("Title required", "Enter a short title for the Fleet Job.");
      return;
    }
    if (!manualForm.description.trim()) {
      Alert.alert("Description required", "Describe the fault or work required.");
      return;
    }

    const selectedVehicle =
      manualForm.asset_type === "Vehicle"
        ? vehicleAssets.find((asset) => asset.id === manualForm.asset_id) ?? null
        : null;
    const selectedPlant =
      manualForm.asset_type === "Plant"
        ? plantAssets.find((asset) => asset.id === manualForm.asset_id) ?? null
        : null;

    const assetLabel =
      manualForm.asset_type === "Vehicle"
        ? [
            selectedVehicle?.vehicle_id,
            selectedVehicle?.vehicle_rego || selectedVehicle?.rego,
            selectedVehicle?.make,
            selectedVehicle?.model,
          ]
            .map(clean)
            .filter(Boolean)
            .join(" · ")
        : [
            selectedPlant?.asset_id,
            selectedPlant?.rego,
            selectedPlant?.make,
            selectedPlant?.model,
            selectedPlant?.plant_type,
          ]
            .map(clean)
            .filter(Boolean)
            .join(" · ");

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("fleet_jobs")
        .insert({
          asset_type: manualForm.asset_type,
          vehicle_id:
            manualForm.asset_type === "Vehicle" ? manualForm.asset_id : null,
          vehicle_asset_id:
            manualForm.asset_type === "Vehicle" ? manualForm.asset_id : null,
          plant_id:
            manualForm.asset_type === "Plant" ? manualForm.asset_id : null,
          plant_asset_id:
            manualForm.asset_type === "Plant" ? manualForm.asset_id : null,
          asset_label: assetLabel || null,
          source: "Manual",
          source_type: "Manual",
          title: manualForm.title.trim(),
          description: manualForm.description.trim(),
          priority: manualForm.priority,
          status: manualForm.status,
          project:
            projectName ||
            selectedVehicle?.project ||
            selectedPlant?.project ||
            null,
          crew:
            selectedVehicle?.crew ||
            selectedPlant?.crew ||
            clean(profileRecord?.crew) ||
            null,
          reported_by: manualForm.reported_by.trim() || null,
          assigned_to: manualForm.assigned_to.trim() || null,
          vendor: manualForm.vendor.trim() || null,
          reported_date: todayDate(),
          due_date: manualForm.due_date || null,
          completed_date: null,
          cost: numberOrNull(manualForm.cost),
          notes: manualForm.notes.trim() || null,
        })
        .select("*")
        .single();

      if (error) throw error;

      const createdJob = data as FleetJob;

      await dispatchFleetJobNotification(
        createdJob.id,
        "created",
      );

      setManualVisible(false);
      await loadData(false);
      Alert.alert(
        "Fleet Job created",
        `${clean(data?.job_number) || "The new job"} has been added to the active register.`,
      );
    } catch (error) {
      Alert.alert("Could not create Fleet Job", errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function openCloseOut() {
    if (!selected) return;
    const closeOutUpdate = selected.updates.find((row) =>
      ["Close Out", "Close Out Edited"].includes(clean(row.update_type)),
    );
    setCloseOutForm({
      history_type: (selected.assetHistory?.history_type as AssetHistoryType) || "Repair",
      history_date: selected.assetHistory?.history_date || selected.job.completed_date || todayDate(),
      title: selected.assetHistory?.title || selected.job.title || "",
      description: selected.assetHistory?.description || selected.job.description || "",
      vendor: selected.assetHistory?.vendor || selected.job.vendor || vendor,
      cost: selected.assetHistory?.cost == null ? cost : String(selected.assetHistory.cost),
      odometer_km: selected.assetHistory?.odometer_km == null
        ? selected.prestart?.kilometres == null ? "" : String(selected.prestart.kilometres)
        : String(selected.assetHistory.odometer_km),
      engine_hours: selected.assetHistory?.engine_hours == null
        ? selected.prestart?.cab_hours == null ? "" : String(selected.prestart.cab_hours)
        : String(selected.assetHistory.engine_hours),
      next_service_due_date: selected.assetHistory?.next_service_due_date || "",
      next_service_due_km: selected.assetHistory?.next_service_due_km == null ? "" : String(selected.assetHistory.next_service_due_km),
      next_service_due_hours: selected.assetHistory?.next_service_due_hours == null ? "" : String(selected.assetHistory.next_service_due_hours),
      close_out_comments: extractCloseOut(closeOutUpdate?.comment),
    });
    setCloseOutVisible(true);
  }

  async function completeJob() {
    if (!selected) return;
    const missing = faultCorrections.find((row) => !row.correction.trim());
    if (!closeOutForm.history_date || !closeOutForm.title.trim() || !closeOutForm.description.trim() || !closeOutForm.close_out_comments.trim()) {
      Alert.alert("Close-out incomplete", "Date, title, description and close-out comments are required.");
      return;
    }
    if (missing) {
      Alert.alert("Correction required", `Add the mechanic correction for: ${missing.fault}`);
      return;
    }

    setSaving(true);
    try {
      const assetType = assetTypeForJob(selected.job);
      const corrections = faultCorrections.map((row) => ({ ...row, correction: row.correction.trim() }));
      const closeOutComment = [
        closeOutForm.close_out_comments.trim(),
        buildCorrectionText(corrections),
        `Asset history recorded as: ${closeOutForm.history_type}`,
        `Asset update record: ${assetLabelForJob(selected)}`,
      ].join("\n\n");

      const historyPayload = {
        asset_type: assetType,
        vehicle_id: assetType === "Vehicle" ? selected.job.vehicle_id || selected.job.vehicle_asset_id || null : null,
        plant_id: assetType === "Plant" ? selected.job.plant_id || selected.job.plant_asset_id || null : null,
        fleet_job_id: selected.job.id,
        history_type: closeOutForm.history_type,
        history_date: closeOutForm.history_date,
        title: closeOutForm.title.trim(),
        description: closeOutForm.description.trim(),
        vendor: closeOutForm.vendor.trim() || null,
        cost: numberOrNull(closeOutForm.cost),
        odometer_km: numberOrNull(closeOutForm.odometer_km),
        engine_hours: numberOrNull(closeOutForm.engine_hours),
        next_service_due_date: closeOutForm.history_type === "Service" ? closeOutForm.next_service_due_date || null : null,
        next_service_due_km: closeOutForm.history_type === "Service" ? numberOrNull(closeOutForm.next_service_due_km) : null,
        next_service_due_hours: closeOutForm.history_type === "Service" ? numberOrNull(closeOutForm.next_service_due_hours) : null,
        document_url: null,
      };

      const historyResult = selected.assetHistory
        ? await supabase.from("asset_history").update(historyPayload).eq("id", selected.assetHistory.id)
        : await supabase.from("asset_history").insert(historyPayload);
      if (historyResult.error) throw historyResult.error;

      const existing = selected.updates.find((row) =>
        ["Close Out", "Close Out Edited"].includes(clean(row.update_type)),
      );
      const closeResult = existing
        ? await supabase.from("fleet_job_updates").update({
            update_type: "Close Out Edited",
            status: "Completed",
            comment: closeOutComment,
            created_at: new Date().toISOString(),
          }).eq("id", existing.id)
        : await supabase.from("fleet_job_updates").insert({
            fleet_job_id: selected.job.id,
            update_type: "Close Out",
            status: "Completed",
            comment: closeOutComment,
          });
      if (closeResult.error) throw closeResult.error;

      const jobResult = await supabase.from("fleet_jobs").update({
        status: "Completed",
        completed_date: closeOutForm.history_date,
        priority,
        assigned_to: assignedTo.trim() || null,
        vendor: closeOutForm.vendor.trim() || vendor.trim() || null,
        cost: numberOrNull(closeOutForm.cost),
        updated_at: new Date().toISOString(),
      }).eq("id", selected.job.id);
      if (jobResult.error) throw jobResult.error;

      await dispatchFleetJobNotification(
        selected.job.id,
        "completed",
        closeOutForm.close_out_comments.trim(),
      );

      setCloseOutVisible(false);
      setStatus("Completed");
      await loadData(false);
      Alert.alert("Fleet Job completed", "The job was closed and added to the asset history.");
    } catch (error) {
      Alert.alert("Could not close job", errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function confirmReopen() {
    if (!selected) return;
    Alert.alert("Reopen Fleet Job?", "Existing fault corrections will be retained.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reopen", onPress: () => void reopenJob() },
    ]);
  }

  async function reopenJob() {
    if (!selected) return;
    setSaving(true);
    try {
      const jobResult = await supabase.from("fleet_jobs").update({
        status: "Open",
        completed_date: null,
        updated_at: new Date().toISOString(),
      }).eq("id", selected.job.id);
      if (jobResult.error) throw jobResult.error;

      const closeOutIds = selected.updates
        .filter((row) => ["Close Out", "Close Out Edited"].includes(clean(row.update_type)))
        .map((row) => row.id);
      if (closeOutIds.length) {
        await supabase.from("fleet_job_updates").delete().in("id", closeOutIds);
      }
      await supabase.from("fleet_job_updates").insert({
        fleet_job_id: selected.job.id,
        update_type: "Reopened",
        status: "Open",
        comment: "Fleet job reopened. Existing fault corrections were retained.",
      });
      await dispatchFleetJobNotification(
        selected.job.id,
        "reopened",
      );

      setStatus("Open");
      await loadData(false);
      Alert.alert("Fleet Job reopened", "The job is active again.");
    } catch (error) {
      Alert.alert("Could not reopen job", errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function renderJob({ item }: { item: JobBundle }) {
    const currentStatus = statusFromBundle(item);
    const faults = normaliseFaults(item).length;
    return (
      <Pressable style={styles.jobCard} onPress={() => openJob(item)}>
        <View style={styles.jobTop}>
          <View style={styles.jobIcon}>
            <Ionicons
              name={assetTypeForJob(item.job) === "Plant" ? "construct-outline" : "car-outline"}
              size={21}
              color="#1D4ED8"
            />
          </View>
          <View style={styles.jobText}>
            <Text style={styles.jobNumber}>{clean(item.job.job_number) || "No job number"}</Text>
            <Text style={styles.jobTitle}>{clean(item.job.title) || "Untitled Fleet Job"}</Text>
            <Text style={styles.jobAsset}>{assetLabelForJob(item)}</Text>
          </View>
          <StatusBadge status={currentStatus} />
        </View>
        <View style={styles.jobMeta}>
          <Meta label="Priority" value={toPriority(item.job.priority)} />
          <Meta label="Crew" value={clean(item.job.crew) || "—"} />
          <Meta label="Reported" value={formatDate(item.job.reported_date || item.job.created_at)} />
          <Meta label="Assigned" value={clean(item.job.assigned_to) || "Unassigned"} />
        </View>
        {item.prestart ? (
          <View style={styles.prestartStrip}>
            <Ionicons name="clipboard-outline" size={16} color="#B45309" />
            <Text style={styles.prestartStripText}>
              {clean(item.prestart.docket_number) || "Linked prestart"} · {faults} fault{faults === 1 ? "" : "s"}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}><ActivityIndicator size="large" color="#2563EB" /><Text style={styles.loadingText}>Loading Fleet Jobs…</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerIcon}><Ionicons name="construct-outline" size={23} color="#FFFFFF" /></View>
            <View style={styles.headerText}><Text style={styles.pageTitle}>Fleet Jobs</Text><Text style={styles.pageSubtitle}>Action vehicle and plant faults</Text></View>
            <Pressable
              style={[
                styles.notificationButton,
                notificationPreferences.fleet_enabled &&
                  styles.notificationButtonActive,
              ]}
              onPress={() => setNotificationVisible(true)}
            >
              <Ionicons
                name={
                  notificationPreferences.fleet_enabled
                    ? "notifications"
                    : "notifications-outline"
                }
                size={20}
                color={
                  notificationPreferences.fleet_enabled
                    ? "#FFFFFF"
                    : "#334155"
                }
              />
            </Pressable>
            <Pressable style={styles.addButton} onPress={openManualJob}>
              <Ionicons name="add" size={22} color="#FFFFFF" />
            </Pressable>
            <Pressable style={styles.refreshButton} onPress={() => void refresh()}>
              {refreshing ? <ActivityIndicator size="small" color="#334155" /> : <Ionicons name="refresh" size={20} color="#334155" />}
            </Pressable>
          </View>
          <View style={styles.projectContext}>
            <Text style={styles.projectContextLabel}>CURRENT PROJECT</Text>
            <Text style={styles.projectContextValue} numberOfLines={1}>
              {projectNumber ? `${projectNumber} — ${projectName}` : projectName || "No project selected"}
            </Text>
          </View>
        </View>

        {!projectId ? (
          <Empty title="No project selected" text="Return to Home and select a current project before opening Fleet Jobs." />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.job.id}
            renderItem={renderJob}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
            ListHeaderComponent={
              <View>
                <View style={styles.summaryGrid}>
                  <Summary label="Open" value={stats.open} />
                  <Summary label="In Progress" value={stats.progress} />
                  <Summary label="Waiting Parts" value={stats.waiting} />
                  <Summary label="Completed" value={stats.completed} />
                </View>
                <Text style={styles.sectionHeading}>Mechanic Register</Text>
                <Text style={styles.sectionSubheading}>{filtered.length} of {bundles.length} jobs shown</Text>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={19} color="#64748B" />
                  <TextInput value={search} onChangeText={setSearch} style={styles.searchInput} placeholder="Search job, asset, fault or mechanic…" placeholderTextColor="#94A3B8" />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterTabs}>
                  {filters.map((item) => (
                    <Pressable key={item} style={[styles.filterTab, filter === item && styles.filterTabActive]} onPress={() => setFilter(item)}>
                      <Text style={[styles.filterTabText, filter === item && styles.filterTabTextActive]}>{item}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            }
            ListEmptyComponent={<Empty title="No Fleet Jobs found" text="No jobs match the current search or filter." />}
          />
        )}



        <Modal
          visible={notificationVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setNotificationVisible(false)}
        >
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.modalHeader}>
              <Pressable
                style={styles.backButton}
                onPress={() => setNotificationVisible(false)}
              >
                <Ionicons name="close" size={22} color="#334155" />
              </Pressable>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle}>Fleet Job Notifications</Text>
                <Text style={styles.modalSubtitle}>
                  Notification Centre, push and reminder preferences
                </Text>
              </View>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView
              contentContainerStyle={styles.detailContent}
              keyboardShouldPersistTaps="handled"
            >
              <Card title="Your Notification Channels">
                <View style={styles.notificationAccount}>
                  <Ionicons
                    name="person-circle-outline"
                    size={24}
                    color="#2563EB"
                  />
                  <View style={{ flex: 1, marginLeft: 9 }}>
                    <Text style={styles.notificationAccountLabel}>
                      LOGGED-IN ACCOUNT
                    </Text>
                    <Text style={styles.notificationAccountValue}>
                      {notificationEmail || "No email on this account"}
                    </Text>
                  </View>
                </View>

                <NotificationToggle
                  icon="construct-outline"
                  title="Fleet Job notifications"
                  description="Receive Fleet Job activity in the TTTracker Notification Centre."
                  value={notificationPreferences.fleet_enabled}
                  onChange={(value) =>
                    setNotificationPreferences((current) => ({
                      ...current,
                      fleet_enabled: value,
                      phone_enabled: value
                        ? current.phone_enabled
                        : false,
                      email_enabled: value
                        ? current.email_enabled
                        : false,
                    }))
                  }
                />

                <NotificationToggle
                  icon="phone-portrait-outline"
                  title="Phone notifications"
                  description="Schedule reminders on this phone for unresolved Fleet Jobs."
                  value={notificationPreferences.phone_enabled}
                  onChange={(value) => {
                    if (!notificationPreferences.fleet_enabled) {
                      Alert.alert(
                        "Enable Fleet Job notifications",
                        "Turn on Fleet Job notifications first.",
                      );
                      return;
                    }

                    setNotificationPreferences((current) => ({
                      ...current,
                      phone_enabled: value,
                    }));
                  }}
                />

                <NotificationToggle
                  icon="mail-outline"
                  title="Email notifications"
                  description="Queue reminder emails to the logged-in account."
                  value={notificationPreferences.email_enabled}
                  onChange={(value) => {
                    if (!notificationPreferences.fleet_enabled) {
                      Alert.alert(
                        "Enable Fleet Job notifications",
                        "Turn on Fleet Job notifications first.",
                      );
                      return;
                    }

                    setNotificationPreferences((current) => ({
                      ...current,
                      email_enabled: value,
                    }));
                  }}
                />
              </Card>

              <Card title="Reminder Timing">
                <NotificationToggle
                  icon="time-outline"
                  title="Reminder after 3 days"
                  description="Remind you when a Fleet Job is still active three days after it was reported."
                  value={notificationPreferences.remind_after_3_days}
                  onChange={(value) =>
                    setNotificationPreferences((current) => ({
                      ...current,
                      remind_after_3_days: value,
                    }))
                  }
                />

                <NotificationToggle
                  icon="calendar-outline"
                  title="Reminder after 7 days"
                  description="Send a second reminder if the job remains unresolved for one week."
                  value={notificationPreferences.remind_after_7_days}
                  onChange={(value) =>
                    setNotificationPreferences((current) => ({
                      ...current,
                      remind_after_7_days: value,
                    }))
                  }
                />

                <NotificationToggle
                  icon="warning-outline"
                  title="Immediate critical-job alerts"
                  description="Store your preference for immediate alerts when a Critical Fleet Job is raised."
                  value={notificationPreferences.high_priority_immediate}
                  onChange={(value) =>
                    setNotificationPreferences((current) => ({
                      ...current,
                      high_priority_immediate: value,
                    }))
                  }
                />
              </Card>

              <View style={styles.notificationInfo}>
                <Ionicons
                  name="information-circle-outline"
                  size={20}
                  color="#1D4ED8"
                />
                <Text style={styles.notificationInfoText}>
                  When Fleet Job notifications are enabled, the secure
                  Supabase dispatcher creates Notification Centre entries for
                  opted-in mechanics and administrators. Phone delivery uses
                  the saved Expo push token when running a development or
                  production build. Expo Go can still test the Notification
                  Centre and local scheduled reminders.
                </Text>
              </View>

              <Pressable
                style={[
                  styles.primaryButton,
                  notificationSaving && styles.disabledButton,
                ]}
                disabled={notificationSaving}
                onPress={() => void saveNotificationPreferences()}
              >
                {notificationSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons
                      name="notifications-outline"
                      size={20}
                      color="#FFFFFF"
                    />
                    <Text style={styles.primaryButtonText}>
                      Save Notification Preferences
                    </Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </Modal>

        <Modal
          visible={manualVisible}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setManualVisible(false)}
        >
          <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView
              style={styles.screen}
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              <View style={styles.modalHeader}>
                <Pressable
                  style={styles.backButton}
                  onPress={() => setManualVisible(false)}
                >
                  <Ionicons name="close" size={22} color="#334155" />
                </Pressable>
                <View style={styles.modalTitleWrap}>
                  <Text style={styles.modalTitle}>New Fleet Job</Text>
                  <Text style={styles.modalSubtitle}>
                    Manually raise a vehicle or plant fault
                  </Text>
                </View>
                <View style={{ width: 40 }} />
              </View>

              <ScrollView
                contentContainerStyle={styles.detailContent}
                keyboardShouldPersistTaps="handled"
              >
                <Card title="Asset">
                  <ChoiceGroup
                    label="Asset Type"
                    options={["Vehicle", "Plant"]}
                    value={manualForm.asset_type}
                    onChange={(value) =>
                      setManualForm((current) => ({
                        ...current,
                        asset_type: value as AssetType,
                        asset_id: "",
                      }))
                    }
                  />

                  <Text style={styles.fieldLabel}>Select Asset</Text>
                  <View style={styles.assetChoiceList}>
                    {(manualForm.asset_type === "Vehicle"
                      ? vehicleAssets.filter((asset) =>
                          projectMatches(
                            clean(asset.project),
                            projectName,
                            projectNumber,
                          ),
                        )
                      : plantAssets.filter((asset) =>
                          projectMatches(
                            clean(asset.project),
                            projectName,
                            projectNumber,
                          ),
                        )
                    ).map((asset) => {
                      const isVehicle = manualForm.asset_type === "Vehicle";
                      const id = asset.id;
                      const label = isVehicle
                        ? [
                            (asset as VehicleAsset).vehicle_id,
                            (asset as VehicleAsset).vehicle_rego ||
                              (asset as VehicleAsset).rego,
                            (asset as VehicleAsset).make,
                            (asset as VehicleAsset).model,
                          ]
                            .map(clean)
                            .filter(Boolean)
                            .join(" · ")
                        : [
                            (asset as PlantAsset).asset_id,
                            (asset as PlantAsset).rego,
                            (asset as PlantAsset).make,
                            (asset as PlantAsset).model,
                          ]
                            .map(clean)
                            .filter(Boolean)
                            .join(" · ");

                      return (
                        <Pressable
                          key={id}
                          style={[
                            styles.assetChoice,
                            manualForm.asset_id === id &&
                              styles.assetChoiceActive,
                          ]}
                          onPress={() =>
                            setManualForm((current) => ({
                              ...current,
                              asset_id: id,
                            }))
                          }
                        >
                          <Ionicons
                            name={isVehicle ? "car-outline" : "construct-outline"}
                            size={19}
                            color={
                              manualForm.asset_id === id ? "#FFFFFF" : "#1D4ED8"
                            }
                          />
                          <Text
                            style={[
                              styles.assetChoiceText,
                              manualForm.asset_id === id &&
                                styles.assetChoiceTextActive,
                            ]}
                          >
                            {label || "Unnamed asset"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Card>

                <Card title="Job Details">
                  <Field
                    label="Title"
                    value={manualForm.title}
                    onChangeText={(value) =>
                      setManualForm((current) => ({ ...current, title: value }))
                    }
                    placeholder="Example: Repair reverse alarm"
                  />
                  <Text style={styles.fieldLabel}>Issue Description</Text>
                  <TextInput
                    value={manualForm.description}
                    onChangeText={(value) =>
                      setManualForm((current) => ({
                        ...current,
                        description: value,
                      }))
                    }
                    style={styles.largeTextArea}
                    multiline
                    textAlignVertical="top"
                    placeholder="Describe the fault or work required…"
                    placeholderTextColor="#94A3B8"
                  />
                  <ChoiceGroup
                    label="Priority"
                    options={priorities}
                    value={manualForm.priority}
                    onChange={(value) =>
                      setManualForm((current) => ({
                        ...current,
                        priority: value as FleetJobPriority,
                      }))
                    }
                  />
                  <ChoiceGroup
                    label="Status"
                    options={activeStatuses}
                    value={manualForm.status}
                    onChange={(value) =>
                      setManualForm((current) => ({
                        ...current,
                        status: value as FleetJobStatus,
                      }))
                    }
                  />
                  <Field
                    label="Reported By"
                    value={manualForm.reported_by}
                    onChangeText={(value) =>
                      setManualForm((current) => ({
                        ...current,
                        reported_by: value,
                      }))
                    }
                    placeholder="Reporter name"
                  />
                  <Field
                    label="Assigned To"
                    value={manualForm.assigned_to}
                    onChangeText={(value) =>
                      setManualForm((current) => ({
                        ...current,
                        assigned_to: value,
                      }))
                    }
                    placeholder="Responsible mechanic"
                  />
                  <Field
                    label="Vendor / Mechanic"
                    value={manualForm.vendor}
                    onChangeText={(value) =>
                      setManualForm((current) => ({ ...current, vendor: value }))
                    }
                    placeholder="Workshop or mechanic"
                  />
                  <Field
                    label="Due Date"
                    value={manualForm.due_date}
                    onChangeText={(value) =>
                      setManualForm((current) => ({ ...current, due_date: value }))
                    }
                    placeholder="YYYY-MM-DD"
                  />
                  <Field
                    label="Cost Estimate"
                    value={manualForm.cost}
                    onChangeText={(value) =>
                      setManualForm((current) => ({ ...current, cost: value }))
                    }
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.fieldLabel}>Notes</Text>
                  <TextInput
                    value={manualForm.notes}
                    onChangeText={(value) =>
                      setManualForm((current) => ({ ...current, notes: value }))
                    }
                    style={styles.textArea}
                    multiline
                    textAlignVertical="top"
                    placeholder="Optional notes…"
                    placeholderTextColor="#94A3B8"
                  />
                </Card>

                <Pressable
                  style={[styles.primaryButton, saving && styles.disabledButton]}
                  disabled={saving}
                  onPress={() => void createManualJob()}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
                      <Text style={styles.primaryButtonText}>Create Fleet Job</Text>
                    </>
                  )}
                </Pressable>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        <Modal visible={detailVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setDetailVisible(false)}>
          <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
              <View style={styles.modalHeader}>
                <Pressable style={styles.backButton} onPress={() => setDetailVisible(false)}><Ionicons name="arrow-back" size={22} color="#334155" /></Pressable>
                <View style={styles.modalTitleWrap}><Text style={styles.modalTitle}>{clean(selected?.job.job_number) || "Fleet Job"}</Text><Text style={styles.modalSubtitle} numberOfLines={1}>{selected ? assetLabelForJob(selected) : ""}</Text></View>
                {selected ? <StatusBadge status={statusFromBundle(selected)} /> : <View style={{ width: 40 }} />}
              </View>

              {selected ? (
                <ScrollView contentContainerStyle={styles.detailContent} keyboardShouldPersistTaps="handled">
                  <Card title={clean(selected.job.title) || "Untitled Fleet Job"}>
                    <Text style={styles.bodyText}>{clean(selected.job.description) || "No description provided."}</Text>
                    <View style={styles.jobMeta}>
                      <Meta label="Source" value={clean(selected.job.source) || clean(selected.job.source_type) || "—"} />
                      <Meta label="Reported" value={formatDate(selected.job.reported_date || selected.job.created_at)} />
                      <Meta label="Reported By" value={clean(selected.job.reported_by) || "—"} />
                      <Meta label="Crew" value={clean(selected.job.crew) || "—"} />
                    </View>
                  </Card>

                  {selected.prestart ? (
                    <Card title="Linked Prestart">
                      <View style={styles.linkedPrestart}>
                        <Ionicons name="clipboard-outline" size={22} color="#B45309" />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={styles.linkedTitle}>{clean(selected.prestart.docket_number) || "Prestart"}</Text>
                          <Text style={styles.linkedSubtitle}>{formatDate(selected.prestart.prestart_date || selected.prestart.created_at)} · {clean(selected.prestart.inspected_by_name) || "Unknown inspector"}</Text>
                        </View>
                      </View>
                    </Card>
                  ) : null}

                  {!isClosedStatus(statusFromBundle(selected)) ? (
                    <Card title="Job Action">
                      <ChoiceGroup label="Status" options={activeStatuses} value={status} onChange={(value) => setStatus(value as FleetJobStatus)} />
                      <ChoiceGroup label="Priority" options={priorities} value={priority} onChange={(value) => setPriority(value as FleetJobPriority)} />
                      <Field label="Assigned To" value={assignedTo} onChangeText={setAssignedTo} placeholder="Responsible mechanic or person" />
                      <Field label="Vendor / Mechanic" value={vendor} onChangeText={setVendor} placeholder="Workshop or mechanic" />
                      <Field label="Cost" value={cost} onChangeText={setCost} placeholder="0.00" keyboardType="decimal-pad" />
                      <Text style={styles.fieldLabel}>Progress Note</Text>
                      <TextInput value={progressNote} onChangeText={setProgressNote} style={styles.textArea} multiline textAlignVertical="top" placeholder="Add progress update…" placeholderTextColor="#94A3B8" />
                      <Pressable style={styles.primaryButton} onPress={() => void saveJob()} disabled={saving}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <><Ionicons name="save-outline" size={18} color="#FFFFFF" /><Text style={styles.primaryButtonText}>Save Job Update</Text></>}</Pressable>
                    </Card>
                  ) : (
                    <Card title="Job Completed"><Text style={styles.bodyText}>Progress controls are locked. Reopen the job if further work is required.</Text></Card>
                  )}

                  <Card title={`Fault Corrections (${faultCorrections.filter((row) => row.correction.trim()).length}/${faultCorrections.length})`}>
                    {faultCorrections.length ? (
                      <View
                        style={[
                          styles.correctionBanner,
                          faultCorrections.every((row) => row.correction.trim())
                            ? styles.correctionBannerReady
                            : styles.correctionBannerPending,
                        ]}
                      >
                        <Ionicons
                          name={
                            faultCorrections.every((row) => row.correction.trim())
                              ? "checkmark-circle-outline"
                              : "warning-outline"
                          }
                          size={20}
                          color={
                            faultCorrections.every((row) => row.correction.trim())
                              ? "#15803D"
                              : "#B45309"
                          }
                        />
                        <Text style={styles.correctionBannerText}>
                          {faultCorrections.every((row) => row.correction.trim())
                            ? "All faults addressed — ready for close-out."
                            : `${faultCorrections.filter((row) => !row.correction.trim()).length} fault${faultCorrections.filter((row) => !row.correction.trim()).length === 1 ? "" : "s"} still require a mechanic correction.`}
                        </Text>
                      </View>
                    ) : null}
                    {faultCorrections.length ? faultCorrections.map((row, index) => (
                      <View
                        key={row.id}
                        style={[
                          styles.faultCard,
                          row.correction.trim()
                            ? styles.faultCardAddressed
                            : styles.faultCardOutstanding,
                        ]}
                      >
                        <View style={styles.faultHeaderRow}>
                          <Text style={styles.faultTitle}>{row.fault}</Text>
                          <View
                            style={[
                              styles.faultStateBadge,
                              row.correction.trim()
                                ? styles.faultStateAddressed
                                : styles.faultStateOutstanding,
                            ]}
                          >
                            <Text
                              style={[
                                styles.faultStateText,
                                row.correction.trim()
                                  ? styles.faultStateTextAddressed
                                  : styles.faultStateTextOutstanding,
                              ]}
                            >
                              {row.correction.trim() ? "ADDRESSED" : "OUTSTANDING"}
                            </Text>
                          </View>
                        </View>
                        {row.severity ? <Text style={styles.faultSeverity}>Severity: {row.severity}</Text> : null}
                        <Text style={styles.prestartComment}>{row.prestart_comment}</Text>
                        {isClosedStatus(statusFromBundle(selected)) ? (
                          <Text style={styles.correctionReadOnly}>{row.correction || "No correction recorded."}</Text>
                        ) : (
                          <TextInput
                            value={row.correction}
                            onChangeText={(value) => setFaultCorrections((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, correction: value } : item))}
                            style={styles.textArea}
                            multiline
                            textAlignVertical="top"
                            placeholder="Mechanic correction…"
                            placeholderTextColor="#94A3B8"
                          />
                        )}
                      </View>
                    )) : <Text style={styles.bodyText}>No individual fault rows were found.</Text>}
                    {!isClosedStatus(statusFromBundle(selected)) && faultCorrections.length ? (
                      <Pressable style={styles.secondaryButton} onPress={() => void saveCorrections()} disabled={saving}><Ionicons name="save-outline" size={18} color="#334155" /><Text style={styles.secondaryButtonText}>Save Fault Corrections</Text></Pressable>
                    ) : null}
                  </Card>

                  {isClosedStatus(statusFromBundle(selected)) ? (
                    <View style={styles.actionStack}>
                      <Pressable style={styles.secondaryButton} onPress={confirmReopen}><Ionicons name="refresh" size={18} color="#334155" /><Text style={styles.secondaryButtonText}>Reopen Job</Text></Pressable>
                      <Pressable style={styles.primaryButton} onPress={openCloseOut}><Ionicons name="create-outline" size={18} color="#FFFFFF" /><Text style={styles.primaryButtonText}>Edit Close-out</Text></Pressable>
                    </View>
                  ) : (
                    <Pressable
                      style={[
                        styles.completeButton,
                        faultCorrections.some((row) => !row.correction.trim()) &&
                          styles.disabledButton,
                      ]}
                      disabled={faultCorrections.some((row) => !row.correction.trim())}
                      onPress={openCloseOut}
                    >
                      <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                      <Text style={styles.completeButtonText}>
                        {faultCorrections.some((row) => !row.correction.trim())
                          ? "Address All Faults Before Closing"
                          : "Close Job & Record Asset History"}
                      </Text>
                    </Pressable>
                  )}
                </ScrollView>
              ) : null}
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        <Modal visible={closeOutVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setCloseOutVisible(false)}>
          <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
              <View style={styles.modalHeader}>
                <Pressable style={styles.backButton} onPress={() => setCloseOutVisible(false)}><Ionicons name="close" size={22} color="#334155" /></Pressable>
                <View style={styles.modalTitleWrap}><Text style={styles.modalTitle}>Close Fleet Job</Text><Text style={styles.modalSubtitle}>Save asset history and final corrections</Text></View>
                <View style={{ width: 40 }} />
              </View>
              <ScrollView contentContainerStyle={styles.detailContent} keyboardShouldPersistTaps="handled">
                <Card title="Asset History Record">
                  <ChoiceGroup label="What was completed?" options={["Repair", "Modification", "Service"]} value={closeOutForm.history_type} onChange={(value) => setCloseOutForm((current) => ({ ...current, history_type: value as AssetHistoryType }))} />
                  <Field label="Completed Date" value={closeOutForm.history_date} onChangeText={(value) => setCloseOutForm((current) => ({ ...current, history_date: value }))} placeholder="YYYY-MM-DD" />
                  <Field label="History Title" value={closeOutForm.title} onChangeText={(value) => setCloseOutForm((current) => ({ ...current, title: value }))} placeholder="Example: Replaced damaged tyre" />
                  <Text style={styles.fieldLabel}>What was done?</Text>
                  <TextInput value={closeOutForm.description} onChangeText={(value) => setCloseOutForm((current) => ({ ...current, description: value }))} style={styles.largeTextArea} multiline textAlignVertical="top" placeholder="Detailed repair, service or modification notes…" placeholderTextColor="#94A3B8" />
                  <Field label="Vendor / Mechanic" value={closeOutForm.vendor} onChangeText={(value) => setCloseOutForm((current) => ({ ...current, vendor: value }))} placeholder="Workshop or mechanic" />
                  <Field label="Cost" value={closeOutForm.cost} onChangeText={(value) => setCloseOutForm((current) => ({ ...current, cost: value }))} placeholder="0.00" keyboardType="decimal-pad" />
                  <Field label="Odometer KM" value={closeOutForm.odometer_km} onChangeText={(value) => setCloseOutForm((current) => ({ ...current, odometer_km: value }))} placeholder="Current kilometres" keyboardType="decimal-pad" />
                  <Field label="Engine / Plant Hours" value={closeOutForm.engine_hours} onChangeText={(value) => setCloseOutForm((current) => ({ ...current, engine_hours: value }))} placeholder="Current hours" keyboardType="decimal-pad" />
                  {closeOutForm.history_type === "Service" ? (
                    <>
                      <Field label="Next Service Due Date" value={closeOutForm.next_service_due_date} onChangeText={(value) => setCloseOutForm((current) => ({ ...current, next_service_due_date: value }))} placeholder="YYYY-MM-DD" />
                      <Field label="Next Service Due KM" value={closeOutForm.next_service_due_km} onChangeText={(value) => setCloseOutForm((current) => ({ ...current, next_service_due_km: value }))} placeholder="Next service kilometres" keyboardType="decimal-pad" />
                      <Field label="Next Service Due Hours" value={closeOutForm.next_service_due_hours} onChangeText={(value) => setCloseOutForm((current) => ({ ...current, next_service_due_hours: value }))} placeholder="Next service hours" keyboardType="decimal-pad" />
                    </>
                  ) : null}
                </Card>

                <Card title="Final Fault Corrections">
                  {faultCorrections.map((row, index) => (
                    <View key={row.id} style={styles.faultCard}>
                      <Text style={styles.faultTitle}>{row.fault}</Text>
                      <Text style={styles.prestartComment}>{row.prestart_comment}</Text>
                      <TextInput value={row.correction} onChangeText={(value) => setFaultCorrections((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, correction: value } : item))} style={styles.textArea} multiline textAlignVertical="top" placeholder="Required mechanic correction…" placeholderTextColor="#94A3B8" />
                    </View>
                  ))}
                </Card>

                <Card title="Close-out Comments">
                  <TextInput value={closeOutForm.close_out_comments} onChangeText={(value) => setCloseOutForm((current) => ({ ...current, close_out_comments: value }))} style={styles.largeTextArea} multiline textAlignVertical="top" placeholder="Required: summarise what happened and any follow-up actions…" placeholderTextColor="#94A3B8" />
                </Card>

                <Pressable style={styles.completeButton} onPress={() => void completeJob()} disabled={saving}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <><Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" /><Text style={styles.completeButtonText}>Complete Job & Save History</Text></>}</Pressable>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <View style={styles.summaryCard}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>;
}

function StatusBadge({ status }: { status: string }) {
  const closed = isClosedStatus(status);
  const waiting = status === "Waiting Parts";
  const progress = status === "In Progress" || status === "Booked";
  return (
    <View style={[styles.statusBadge, closed ? styles.statusClosed : waiting ? styles.statusWaiting : progress ? styles.statusProgress : styles.statusOpen]}>
      <Text style={styles.statusText}>{status}</Text>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <View style={styles.meta}><Text style={styles.metaLabel}>{label}</Text><Text style={styles.metaValue}>{value}</Text></View>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text><View style={styles.cardBody}>{children}</View></View>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType = "default" }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: "default" | "decimal-pad" }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} style={styles.fieldInput} placeholder={placeholder} placeholderTextColor="#94A3B8" keyboardType={keyboardType} /></View>;
}

function ChoiceGroup({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string; onChange: (value: string) => void }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.choiceGrid}>{options.map((option) => <Pressable key={option} style={[styles.choiceButton, value === option && styles.choiceButtonActive]} onPress={() => onChange(option)}><Text style={[styles.choiceText, value === option && styles.choiceTextActive]}>{option}</Text></Pressable>)}</View></View>;
}


function NotificationToggle({
  icon,
  title,
  description,
  value,
  onChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      style={[
        styles.notificationToggle,
        value && styles.notificationToggleActive,
      ]}
      onPress={() => onChange(!value)}
    >
      <View
        style={[
          styles.notificationToggleIcon,
          value && styles.notificationToggleIconActive,
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={value ? "#FFFFFF" : "#2563EB"}
        />
      </View>
      <View style={styles.notificationToggleText}>
        <Text style={styles.notificationToggleTitle}>{title}</Text>
        <Text style={styles.notificationToggleDescription}>
          {description}
        </Text>
      </View>
      <Ionicons
        name={value ? "checkmark-circle" : "ellipse-outline"}
        size={23}
        color={value ? "#15803D" : "#94A3B8"}
      />
    </Pressable>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="construct-outline" size={29} color="#64748B" /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 10, color: "#64748B", fontWeight: "700" },
  header: { backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#E2E8F0", padding: 12 },
  headerTop: { flexDirection: "row", alignItems: "center" },
  headerIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, marginLeft: 10 },
  pageTitle: { color: "#0F172A", fontSize: 20, fontWeight: "900" },
  pageSubtitle: { color: "#64748B", fontSize: 11, marginTop: 2 },
  notificationButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", marginRight: 7 },
  notificationButtonActive: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  addButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center", marginRight: 7 },
  refreshButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center", justifyContent: "center" },
  projectContext: { borderRadius: 12, backgroundColor: "#F1F5F9", padding: 10, marginTop: 9 },
  projectContextLabel: { color: "#64748B", fontSize: 8, fontWeight: "900" },
  projectContextValue: { color: "#0F172A", fontSize: 12, fontWeight: "800", marginTop: 2 },
  listContent: { padding: 12, paddingBottom: 100 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 12 },
  summaryCard: { width: "48.7%", minHeight: 70, borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", padding: 10 },
  summaryLabel: { color: "#64748B", fontSize: 8, fontWeight: "800", textTransform: "uppercase" },
  summaryValue: { color: "#0F172A", fontSize: 21, fontWeight: "900", marginTop: 4 },
  sectionHeading: { color: "#0F172A", fontSize: 17, fontWeight: "900" },
  sectionSubheading: { color: "#64748B", fontSize: 10, marginTop: 2, marginBottom: 8 },
  searchBox: { minHeight: 44, flexDirection: "row", alignItems: "center", borderRadius: 13, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", paddingHorizontal: 11 },
  searchInput: { flex: 1, color: "#0F172A", fontSize: 13, marginLeft: 8 },
  filterTabs: { gap: 6, paddingVertical: 8 },
  filterTab: { minHeight: 34, borderRadius: 999, borderWidth: 1, borderColor: "#CBD5E1", paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  filterTabActive: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  filterTabText: { color: "#64748B", fontSize: 10, fontWeight: "800" },
  filterTabTextActive: { color: "#FFFFFF" },
  jobCard: { borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", padding: 13, marginBottom: 9 },
  jobTop: { flexDirection: "row", alignItems: "flex-start" },
  jobIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" },
  jobText: { flex: 1, marginLeft: 10, marginRight: 8 },
  jobNumber: { color: "#475569", fontSize: 9, fontWeight: "900" },
  jobTitle: { color: "#0F172A", fontSize: 13, fontWeight: "900", marginTop: 3 },
  jobAsset: { color: "#64748B", fontSize: 9, marginTop: 3 },
  jobMeta: { flexDirection: "row", flexWrap: "wrap", backgroundColor: "#F8FAFC", borderRadius: 12, padding: 9, marginTop: 10 },
  meta: { width: "50%", marginBottom: 7 },
  metaLabel: { color: "#64748B", fontSize: 7, fontWeight: "900", textTransform: "uppercase" },
  metaValue: { color: "#0F172A", fontSize: 9, fontWeight: "800", marginTop: 2 },
  prestartStrip: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFBEB", borderRadius: 10, padding: 9, marginTop: 8 },
  prestartStripText: { color: "#92400E", fontSize: 10, fontWeight: "800", marginLeft: 6 },
  statusBadge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
  statusOpen: { backgroundColor: "#FFE4E6", borderColor: "#FDA4AF" },
  statusProgress: { backgroundColor: "#DBEAFE", borderColor: "#93C5FD" },
  statusWaiting: { backgroundColor: "#FEF3C7", borderColor: "#FCD34D" },
  statusClosed: { backgroundColor: "#DCFCE7", borderColor: "#86EFAC" },
  statusText: { color: "#334155", fontSize: 8, fontWeight: "900" },
  modalHeader: { minHeight: 58, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#E2E8F0", backgroundColor: "#FFFFFF", paddingHorizontal: 12 },
  backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" },
  modalTitleWrap: { flex: 1, marginHorizontal: 8 },
  modalTitle: { color: "#0F172A", fontSize: 17, fontWeight: "900", textAlign: "center" },
  modalSubtitle: { color: "#64748B", fontSize: 9, textAlign: "center", marginTop: 2 },
  detailContent: { padding: 12, paddingBottom: 60 },
  card: { borderRadius: 17, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", padding: 13, marginBottom: 10 },
  cardTitle: { color: "#0F172A", fontSize: 15, fontWeight: "900" },
  cardBody: { marginTop: 10 },
  bodyText: { color: "#475569", fontSize: 11, lineHeight: 18 },
  linkedPrestart: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFBEB", borderRadius: 12, padding: 10 },
  linkedTitle: { color: "#92400E", fontSize: 12, fontWeight: "900" },
  linkedSubtitle: { color: "#B45309", fontSize: 9, marginTop: 2 },
  field: { marginBottom: 11 },
  fieldLabel: { color: "#475569", fontSize: 10, fontWeight: "800", marginBottom: 5 },
  fieldInput: { minHeight: 47, borderRadius: 13, borderWidth: 1, borderColor: "#CBD5E1", color: "#0F172A", fontSize: 13, paddingHorizontal: 12 },
  textArea: { minHeight: 88, borderRadius: 13, borderWidth: 1, borderColor: "#CBD5E1", color: "#0F172A", fontSize: 12, padding: 10, marginBottom: 10 },
  largeTextArea: { minHeight: 120, borderRadius: 13, borderWidth: 1, borderColor: "#CBD5E1", color: "#0F172A", fontSize: 12, padding: 10, marginBottom: 10 },
  choiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choiceButton: { width: "48.7%", minHeight: 40, borderRadius: 11, borderWidth: 1, borderColor: "#CBD5E1", alignItems: "center", justifyContent: "center", padding: 7 },
  choiceButtonActive: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  choiceText: { color: "#475569", fontSize: 10, fontWeight: "900", textAlign: "center" },
  choiceTextActive: { color: "#FFFFFF" },
  primaryButton: { minHeight: 48, borderRadius: 13, backgroundColor: "#0F172A", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900", marginLeft: 7 },
  secondaryButton: { minHeight: 47, borderRadius: 13, borderWidth: 1, borderColor: "#CBD5E1", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  secondaryButtonText: { color: "#334155", fontSize: 11, fontWeight: "900", marginLeft: 7 },
  completeButton: { minHeight: 50, borderRadius: 14, backgroundColor: "#15803D", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 14, marginBottom: 10 },
  completeButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900", marginLeft: 7 },
  faultCard: { borderRadius: 14, borderWidth: 1, padding: 11, marginBottom: 9 },
  faultCardOutstanding: { borderColor: "#FDE68A", backgroundColor: "#FFFBEB" },
  faultCardAddressed: { borderColor: "#86EFAC", backgroundColor: "#F0FDF4" },
  faultHeaderRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  faultStateBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  faultStateOutstanding: { backgroundColor: "#FEF3C7" },
  faultStateAddressed: { backgroundColor: "#DCFCE7" },
  faultStateText: { fontSize: 7, fontWeight: "900" },
  faultStateTextOutstanding: { color: "#92400E" },
  faultStateTextAddressed: { color: "#166534" },
  correctionBanner: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 10, marginBottom: 9 },
  correctionBannerReady: { borderColor: "#86EFAC", backgroundColor: "#F0FDF4" },
  correctionBannerPending: { borderColor: "#FDE68A", backgroundColor: "#FFFBEB" },
  correctionBannerText: { flex: 1, color: "#334155", fontSize: 10, fontWeight: "800", marginLeft: 7 },
  assetChoiceList: { gap: 7 },
  assetChoice: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", paddingHorizontal: 11 },
  assetChoiceActive: { borderColor: "#0F172A", backgroundColor: "#0F172A" },
  assetChoiceText: { flex: 1, color: "#334155", fontSize: 10, fontWeight: "800", marginLeft: 8 },
  assetChoiceTextActive: { color: "#FFFFFF" },
  notificationAccount: { minHeight: 58, borderRadius: 13, borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: "#EFF6FF", flexDirection: "row", alignItems: "center", padding: 10, marginBottom: 10 },
  notificationAccountLabel: { color: "#64748B", fontSize: 8, fontWeight: "900" },
  notificationAccountValue: { color: "#0F172A", fontSize: 11, fontWeight: "800", marginTop: 3 },
  notificationToggle: { minHeight: 78, borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", padding: 10, marginBottom: 8 },
  notificationToggleActive: { borderColor: "#86EFAC", backgroundColor: "#F0FDF4" },
  notificationToggleIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" },
  notificationToggleIconActive: { backgroundColor: "#2563EB" },
  notificationToggleText: { flex: 1, marginHorizontal: 9 },
  notificationToggleTitle: { color: "#0F172A", fontSize: 11, fontWeight: "900" },
  notificationToggleDescription: { color: "#64748B", fontSize: 9, lineHeight: 14, marginTop: 3 },
  notificationInfo: { borderRadius: 13, borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: "#EFF6FF", flexDirection: "row", alignItems: "flex-start", padding: 11, marginBottom: 10 },
  notificationInfoText: { flex: 1, color: "#1E3A8A", fontSize: 10, lineHeight: 16, marginLeft: 7 },
  disabledButton: { opacity: 0.45 },
  faultTitle: { color: "#0F172A", fontSize: 12, fontWeight: "900" },
  faultSeverity: { color: "#92400E", fontSize: 8, fontWeight: "800", marginTop: 4 },
  prestartComment: { color: "#475569", fontSize: 10, lineHeight: 16, backgroundColor: "#FFFFFF", borderRadius: 10, padding: 8, marginVertical: 8 },
  correctionReadOnly: { color: "#166534", fontSize: 11, fontWeight: "700" },
  actionStack: { gap: 8 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyIcon: { width: 60, height: 60, borderRadius: 20, backgroundColor: "#E2E8F0", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: "#0F172A", fontSize: 16, fontWeight: "900", marginTop: 12 },
  emptyText: { color: "#64748B", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 5 },
});
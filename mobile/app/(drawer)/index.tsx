import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Redirect,
  router,
  useFocusEffect,
  type Href,
} from "expo-router";
import {
  AlertTriangle,
  Bell,
  CarFront,
  CheckCircle2,
  ChevronRight,
  Clock3,
  GraduationCap,
  PackageCheck,
  RadioTower,
  ShieldAlert,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ProjectSelector } from "@/components/ProjectSelector";
import { useAuth } from "@/contexts/AuthContext";
import { useAccess } from "@/lib/access";
import { getMyTraining } from "@/lib/api/training";
import { supabase } from "@/lib/supabase";
import type { TrainingRecord } from "@/types/training";

type Tone = "green" | "amber" | "red" | "blue" | "slate";

type Tower = {
  id: string;
  project_id: string;
  progress: number | null;
};

type DocketRow = {
  id: string;
  tower_id: string | null;
  project_id: string | null;
  docket_date: string | null;
  assembly_percent: number | null;
  erection_percent: number | null;
};

type DefectRow = {
  id: string;
  status: string | null;
};

type DeliveryRow = {
  id: string;
  tower_id: string | null;
};

type DeliveryItemRow = {
  delivery_id: string | null;
  qty_delivered?: number | null;
  quantity_delivered?: number | null;
  delivered_qty?: number | null;
  qty?: number | null;
};

type MaterialBundleRow = {
  tower_id: string | null;
  qty_required?: number | null;
  required_qty?: number | null;
};

type UserNotification = {
  id: string;
  event_type: string;
  title: string;
  message: string;
  severity: "info" | "success" | "warning" | "critical" | string;
  read_at: string | null;
  archived_at: string | null;
  action_route: string | null;
  action_params: Record<string, unknown> | null;
  created_at: string;
};

type NotificationSummary = {
  unreadCount: number;
  criticalCount: number;
  warningCount: number;
  recent: UserNotification[];
};

type VehicleAsset = {
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

type VehiclePrestart = {
  id: string;
  vehicle_asset_id: string | null;
  asset_type: string | null;
  asset_label: string | null;
  vehicle_rego: string | null;
  inspected_by_name: string | null;
  prestart_date: string | null;
  created_at: string | null;
  severity: string | null;
  result: string | null;
  fleet_job_number: string | null;
};

type PersonalDashboard = {
  training: TrainingRecord[];
  assignedVehicleId: string;
  vehicle: VehicleAsset | null;
  latestVehiclePrestart: VehiclePrestart | null;
};

type ProjectDashboardData = {
  totalTowers: number;
  completedTowers: number;
  towersInProgress: number;
  notStartedTowers: number;
  overallProgress: number;
  deliveryProgress: number | null;
  openDefects: number | null;
  latestDocketDate: string | null;
};

const ASSIGNED_VEHICLE_KEY = "tttracker.mobile.assigned_vehicle_id";

const EMPTY_NOTIFICATIONS: NotificationSummary = {
  unreadCount: 0,
  criticalCount: 0,
  warningCount: 0,
  recent: [],
};

const EMPTY_PERSONAL: PersonalDashboard = {
  training: [],
  assignedVehicleId: "",
  vehicle: null,
  latestVehiclePrestart: null,
};

const EMPTY_PROJECT: ProjectDashboardData = {
  totalTowers: 0,
  completedTowers: 0,
  towersInProgress: 0,
  notStartedTowers: 0,
  overallProgress: 0,
  deliveryProgress: null,
  openDefects: null,
  latestDocketDate: null,
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;

  const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatAuDate(value: string | null | undefined, fallback = "—") {
  const date = parseDateOnly(value);
  if (!date) return fallback;

  return [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getFullYear()),
  ].join("-");
}

function daysUntil(value: string | null | undefined) {
  const date = parseDateOnly(value);
  if (!date) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function daysSince(value: string | null | undefined) {
  const date = parseDateOnly(value);
  if (!date) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.floor((today.getTime() - date.getTime()) / 86_400_000);
}

function formatPercent(value: number) {
  return `${Math.round(clampPercent(value))}%`;
}

function getDocketProgress(docket: DocketRow) {
  return clampPercent(
    safeNumber(docket.assembly_percent) * 0.5 +
      safeNumber(docket.erection_percent) * 0.5,
  );
}

function getTowerProgress(tower: Tower, dockets: DocketRow[]) {
  const related = dockets.filter((docket) => docket.tower_id === tower.id);

  if (!related.length) {
    return clampPercent(safeNumber(tower.progress));
  }

  return related.reduce(
    (maximum, docket) => Math.max(maximum, getDocketProgress(docket)),
    clampPercent(safeNumber(tower.progress)),
  );
}

function getDeliveredQty(row: DeliveryItemRow) {
  return safeNumber(
    row.qty_delivered ??
      row.quantity_delivered ??
      row.delivered_qty ??
      row.qty,
  );
}

function getRequiredQty(row: MaterialBundleRow) {
  return safeNumber(row.qty_required ?? row.required_qty);
}

function crewDisplay(
  crewNumber: string | null,
  crewName: string | null,
) {
  if (crewNumber && crewName) return `Crew ${crewNumber} — ${crewName}`;
  if (crewNumber) return `Crew ${crewNumber}`;
  if (crewName) return crewName;
  return "No crew allocated";
}

function vehicleLabel(vehicle: VehicleAsset | null) {
  if (!vehicle) return "Assigned vehicle";

  const identifier =
    clean(vehicle.vehicle_id) ||
    clean(vehicle.vehicle_rego) ||
    clean(vehicle.rego);
  const makeModel = [clean(vehicle.make), clean(vehicle.model)]
    .filter(Boolean)
    .join(" ");

  return [identifier, makeModel].filter(Boolean).join(" · ") || "Assigned vehicle";
}

function trainingTone(days: number | null): Tone {
  if (days === null) return "slate";
  if (days < 0) return "red";
  if (days <= 30) return "red";
  if (days <= 60) return "amber";
  return "blue";
}

function trainingCountdown(days: number | null) {
  if (days === null) return "No expiry";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Expires today";
  return `${days}d remaining`;
}

function prestartState(
  vehicle: VehicleAsset | null,
  prestart: VehiclePrestart | null,
) {
  if (!vehicle) {
    return {
      tone: "slate" as Tone,
      title: "No vehicle assigned",
      detail: "Open Vehicle Prestart to assign the vehicle you normally drive.",
    };
  }

  if (!prestart) {
    return {
      tone: "red" as Tone,
      title: "Prestart required",
      detail: `${vehicleLabel(vehicle)} has no prestart in your history.`,
    };
  }

  const severity = clean(prestart.severity).toLowerCase();
  const hasIssue = Boolean(severity && severity !== "none");
  const age = daysSince(prestart.prestart_date);

  if (hasIssue) {
    return {
      tone: "red" as Tone,
      title: "Last prestart had an issue",
      detail: [
        `Completed ${formatAuDate(prestart.prestart_date)}`,
        prestart.fleet_job_number
          ? `Fleet Job ${prestart.fleet_job_number}`
          : clean(prestart.result),
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }

  if (age === 0) {
    return {
      tone: "green" as Tone,
      title: "Today's prestart is complete",
      detail: `${vehicleLabel(vehicle)} was checked today.`,
    };
  }

  if (age === null) {
    return {
      tone: "amber" as Tone,
      title: "Prestart due today",
      detail: `Open Vehicle Prestart to complete today's check for ${vehicleLabel(vehicle)}.`,
    };
  }

  if (age >= 7) {
    return {
      tone: "red" as Tone,
      title: "Prestart overdue",
      detail: `Your last prestart was ${age} days ago on ${formatAuDate(prestart.prestart_date)}.`,
    };
  }

  return {
    tone: "amber" as Tone,
    title: "Today's prestart is still required",
    detail: `Your last prestart was ${age} day${age === 1 ? "" : "s"} ago on ${formatAuDate(prestart.prestart_date)}.`,
  };
}

function tonePalette(tone: Tone) {
  switch (tone) {
    case "green":
      return {
        bg: "#ecfdf5",
        border: "#a7f3d0",
        fg: "#047857",
      };
    case "amber":
      return {
        bg: "#fffbeb",
        border: "#fde68a",
        fg: "#b45309",
      };
    case "red":
      return {
        bg: "#fff1f2",
        border: "#fecdd3",
        fg: "#be123c",
      };
    case "blue":
      return {
        bg: "#eff6ff",
        border: "#bfdbfe",
        fg: "#1d4ed8",
      };
    default:
      return {
        bg: "#f8fafc",
        border: "#e2e8f0",
        fg: "#475569",
      };
  }
}

export default function HomeScreen() {
  const {
    session,
    loading,
    profile,
    profileLoading,
    profileError,
    refreshProfile,
  } = useAuth();
  const { can, roles } = useAccess();

  const canUseProjects = can("mobile.projects");
  const canUseTowerProgress = can("mobile.tower_progress");
  const canUseDockets = can("mobile.daily_dockets");
  const canUseDeliveries = can("mobile.deliveries");
  const canUseDefects = can("mobile.defects");
  const canUseTraining = can("mobile.training");
  const canUseVehiclePrestarts = can("mobile.vehicle_prestarts");
  const canUseNotifications = can("mobile.notifications");

  const canSeeProjectSnapshot = canUseProjects || canUseTowerProgress;
  const canSeeMyDay = canUseTraining || canUseVehiclePrestarts;

  const [notifications, setNotifications] =
    useState<NotificationSummary>(EMPTY_NOTIFICATIONS);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  const [personal, setPersonal] = useState<PersonalDashboard>(EMPTY_PERSONAL);
  const [personalLoading, setPersonalLoading] = useState(false);
  const [personalError, setPersonalError] = useState<string | null>(null);

  const [projectDashboard, setProjectDashboard] =
    useState<ProjectDashboardData>(EMPTY_PROJECT);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  const selectedProject =
    profile?.availableProjects.find(
      (project) => project.id === profile.projectId,
    ) ?? null;

  const roleLabel =
    roles.length > 0
      ? roles.map((assignedRole) => assignedRole.name).join(" + ")
      : profile?.employeeRole || "TTTracker User";

  const fullName =
    profile?.fullName ??
    session?.user.email?.split("@")[0] ??
    "User";

  const expiringTraining = useMemo(() => {
    return personal.training
      .filter(
        (record) =>
          record.current_version !== false &&
          !record.superseded_at &&
          !record.revoked_at &&
          !record.does_not_expire &&
          Boolean(record.expiry_date) &&
          record.workflow_status !== "rejected" &&
          record.record_status !== "rejected",
      )
      .map((record) => ({
        record,
        days: daysUntil(record.expiry_date),
      }))
      .sort((a, b) => {
        const left = a.days ?? Number.MAX_SAFE_INTEGER;
        const right = b.days ?? Number.MAX_SAFE_INTEGER;
        return left - right;
      })
      .slice(0, 3);
  }, [personal.training]);

  const vehicleState = useMemo(
    () => prestartState(personal.vehicle, personal.latestVehiclePrestart),
    [personal.latestVehiclePrestart, personal.vehicle],
  );

  const loadNotifications = useCallback(async () => {
    if (!canUseNotifications || !session?.user.id) {
      setNotifications(EMPTY_NOTIFICATIONS);
      setNotificationsError(null);
      return;
    }

    setNotificationsLoading(true);
    setNotificationsError(null);

    try {
      const { data, error } = await supabase
        .from("user_notifications")
        .select(
          "id,event_type,title,message,severity,read_at,archived_at,action_route,action_params,created_at",
        )
        .eq("user_id", session.user.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      const rows = (data ?? []) as UserNotification[];
      const unreadRows = rows.filter((row) => !row.read_at);

      setNotifications({
        unreadCount: unreadRows.length,
        criticalCount: unreadRows.filter(
          (row) => row.severity === "critical",
        ).length,
        warningCount: unreadRows.filter(
          (row) => row.severity === "warning",
        ).length,
        recent: rows.slice(0, 2),
      });
    } catch (error) {
      setNotifications(EMPTY_NOTIFICATIONS);
      setNotificationsError(
        error instanceof Error
          ? error.message
          : "Notifications could not be loaded.",
      );
    } finally {
      setNotificationsLoading(false);
    }
  }, [canUseNotifications, session?.user.id]);

  const loadPersonalDashboard = useCallback(async () => {
    if (!canSeeMyDay) {
      setPersonal(EMPTY_PERSONAL);
      setPersonalError(null);
      return;
    }

    setPersonalLoading(true);
    setPersonalError(null);

    const next: PersonalDashboard = { ...EMPTY_PERSONAL };
    const errors: string[] = [];

    if (canUseTraining) {
      try {
        const training = await getMyTraining();
        next.training = training.records ?? [];
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error.message
            : "Training could not be loaded.",
        );
      }
    }

    if (canUseVehiclePrestarts) {
      try {
        const assignedVehicleId =
          (await AsyncStorage.getItem(ASSIGNED_VEHICLE_KEY)) ?? "";
        next.assignedVehicleId = assignedVehicleId;

        if (assignedVehicleId) {
          const [vehicleResult, prestartResult] = await Promise.all([
            supabase
              .from("vehicle_assets")
              .select(
                "id,vehicle_id,vehicle_rego,rego,make,model,category,project,crew,status",
              )
              .eq("id", assignedVehicleId)
              .maybeSingle(),
            supabase
              .from("vehicle_prestarts")
              .select(
                "id,vehicle_asset_id,asset_type,asset_label,vehicle_rego,inspected_by_name,prestart_date,created_at,severity,result,fleet_job_number",
              )
              .eq("asset_type", "Vehicle")
              .eq("vehicle_asset_id", assignedVehicleId)
              .order("prestart_date", { ascending: false })
              .order("created_at", { ascending: false })
              .limit(50),
          ]);

          if (vehicleResult.error) throw vehicleResult.error;
          if (prestartResult.error) throw prestartResult.error;

          next.vehicle = (vehicleResult.data as VehicleAsset | null) ?? null;

          const identity = clean(fullName).toLowerCase();
          const prestarts = (prestartResult.data ?? []) as VehiclePrestart[];
          next.latestVehiclePrestart =
            prestarts.find(
              (row) =>
                clean(row.inspected_by_name).toLowerCase() === identity,
            ) ?? null;
        }
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error.message
            : "Vehicle prestart summary could not be loaded.",
        );
      }
    }

    setPersonal(next);
    setPersonalError(errors.length ? errors.join(" · ") : null);
    setPersonalLoading(false);
  }, [canSeeMyDay, canUseTraining, canUseVehiclePrestarts, fullName]);

  const loadProjectDashboard = useCallback(async () => {
    const projectId = profile?.projectId;

    if (!canSeeProjectSnapshot || !projectId) {
      setProjectDashboard(EMPTY_PROJECT);
      setProjectError(null);
      return;
    }

    setProjectLoading(true);
    setProjectError(null);

    try {
      const towersResult = await supabase
        .from("towers")
        .select("id,project_id,progress")
        .eq("project_id", projectId);

      if (towersResult.error) throw towersResult.error;

      const towers = (towersResult.data ?? []) as Tower[];
      const towerIds = towers.map((tower) => tower.id);

      let dockets: DocketRow[] = [];

      if (canUseTowerProgress || canUseDockets) {
        const docketResult = await supabase
          .from("tower_daily_dockets")
          .select(
            "id,tower_id,project_id,docket_date,assembly_percent,erection_percent",
          )
          .eq("project_id", projectId);

        if (!docketResult.error) {
          dockets = (docketResult.data ?? []) as DocketRow[];
        }
      }

      const progressValues = towers.map((tower) =>
        getTowerProgress(tower, dockets),
      );

      const completedTowers = progressValues.filter(
        (progress) => progress >= 100,
      ).length;
      const towersInProgress = progressValues.filter(
        (progress) => progress > 0 && progress < 100,
      ).length;
      const notStartedTowers = progressValues.filter(
        (progress) => progress <= 0,
      ).length;
      const overallProgress =
        progressValues.length > 0
          ? progressValues.reduce((sum, progress) => sum + progress, 0) /
            progressValues.length
          : 0;

      let openDefects: number | null = null;

      if (canUseDefects && towerIds.length > 0) {
        const defectResult = await supabase
          .from("tower_defects")
          .select("id,status")
          .in("tower_id", towerIds);

        if (!defectResult.error) {
          openDefects = ((defectResult.data ?? []) as DefectRow[]).filter(
            (row) =>
              !["closed", "complete", "completed"].includes(
                clean(row.status).toLowerCase(),
              ),
          ).length;
        }
      }

      let deliveryProgress: number | null = null;

      if (canUseDeliveries && towerIds.length > 0) {
        const bundleResult = await supabase
          .from("tower_required_bundles")
          .select("tower_id,qty_required,required_qty")
          .in("tower_id", towerIds);

        let deliveries: DeliveryRow[] = [];
        let deliveryItems: DeliveryItemRow[] = [];

        for (const table of ["tower_bundle_deliveries", "tower_deliveries"]) {
          const result = await supabase
            .from(table)
            .select("id,tower_id")
            .in("tower_id", towerIds);

          if (!result.error) {
            deliveries = (result.data ?? []) as DeliveryRow[];
            break;
          }
        }

        const deliveryIds = deliveries.map((row) => row.id);

        if (deliveryIds.length > 0) {
          for (const table of [
            "tower_bundle_delivery_items",
            "tower_delivery_items",
            "tower_delivered_items",
          ]) {
            const result = await supabase
              .from(table)
              .select("*")
              .in("delivery_id", deliveryIds);

            if (!result.error) {
              deliveryItems = (result.data ?? []) as DeliveryItemRow[];
              break;
            }
          }
        }

        if (!bundleResult.error) {
          const bundles =
            (bundleResult.data ?? []) as MaterialBundleRow[];
          const totalRequired = bundles.reduce(
            (sum, row) => sum + getRequiredQty(row),
            0,
          );
          const totalDelivered = deliveryItems.reduce(
            (sum, row) => sum + getDeliveredQty(row),
            0,
          );

          deliveryProgress =
            totalRequired > 0
              ? clampPercent((totalDelivered / totalRequired) * 100)
              : 0;
        }
      }

      const latestDocketDate = canUseDockets
        ? dockets
            .map((docket) => docket.docket_date)
            .filter((value): value is string => Boolean(value))
            .sort((a, b) => {
              const left = parseDateOnly(a)?.getTime() ?? 0;
              const right = parseDateOnly(b)?.getTime() ?? 0;
              return right - left;
            })[0] ?? null
        : null;

      setProjectDashboard({
        totalTowers: towers.length,
        completedTowers,
        towersInProgress,
        notStartedTowers,
        overallProgress,
        deliveryProgress,
        openDefects,
        latestDocketDate,
      });
    } catch (error) {
      setProjectDashboard(EMPTY_PROJECT);
      setProjectError(
        error instanceof Error
          ? error.message
          : "Project summary could not be loaded.",
      );
    } finally {
      setProjectLoading(false);
    }
  }, [
    canSeeProjectSnapshot,
    canUseDefects,
    canUseDeliveries,
    canUseDockets,
    canUseTowerProgress,
    profile?.projectId,
  ]);

  useFocusEffect(
    useCallback(() => {
      void loadPersonalDashboard();
      void loadProjectDashboard();
      void loadNotifications();
    }, [loadNotifications, loadPersonalDashboard, loadProjectDashboard]),
  );

  useEffect(() => {
    if (!canUseNotifications || !session?.user.id) return;

    const userId = session.user.id;
    const channel = supabase
      .channel(`home-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadNotifications();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [canUseNotifications, loadNotifications, session?.user.id]);

  if (!loading && !session) {
    return <Redirect href="/login" />;
  }

  async function refreshAll() {
    try {
      await refreshProfile();
      await Promise.all([
        loadPersonalDashboard(),
        loadProjectDashboard(),
        loadNotifications(),
      ]);
    } catch (error) {
      Alert.alert(
        "Unable to refresh",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  }

  if (loading || profileLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color="#0f172a" />
          <Text style={styles.loadingText}>Loading TTTracker...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={
              profileLoading ||
              personalLoading ||
              projectLoading ||
              notificationsLoading
            }
            onRefresh={() => void refreshAll()}
          />
        }
      >
        <View style={styles.welcomeBlock}>
          <Text style={styles.eyebrow}>TTTRACKER</Text>
          <Text style={styles.heading}>Welcome, {fullName}</Text>
          <Text style={styles.role}>{roleLabel}</Text>
          <Text style={styles.crew}>
            {crewDisplay(profile?.crewNumber ?? null, profile?.crewName ?? null)}
          </Text>
        </View>

        {profileError ? (
          <ErrorCard title="Profile could not be loaded" message={profileError} />
        ) : null}

        {canUseProjects ? (
          <View style={styles.projectSelectorWrapper}>
            <ProjectSelector />
          </View>
        ) : (
          <View style={styles.allocationCard}>
            <Text style={styles.smallEyebrow}>CURRENT PROJECT</Text>
            <Text style={styles.allocationTitle}>
              {profile?.projectNumber || "Project"}
            </Text>
            <Text style={styles.allocationText}>
              {profile?.projectName || "No project allocated"}
            </Text>
          </View>
        )}

        {canSeeMyDay ? (
          <>
            <SectionHeader
              title="My day"
              subtitle="The things that matter to you personally."
            />

            {personalError ? (
              <ErrorCard title="Personal summary partly unavailable" message={personalError} />
            ) : null}

            {personalLoading ? (
              <LoadingCard text="Updating your records..." />
            ) : (
              <View style={styles.stack}>
                {canUseTraining ? (
                  <View style={styles.panel}>
                    <View style={styles.panelHeader}>
                      <View style={styles.panelTitleRow}>
                        <View style={[styles.iconBox, styles.iconBoxBlue]}>
                          <GraduationCap size={20} color="#1d4ed8" />
                        </View>
                        <View style={styles.panelTitleBlock}>
                          <Text style={styles.panelTitle}>Training & licences</Text>
                          <Text style={styles.panelSubtitle}>
                            Your next records to expire.
                          </Text>
                        </View>
                      </View>

                      <Pressable
                        onPress={() => router.push("/training" as Href)}
                        style={styles.textButton}
                      >
                        <Text style={styles.textButtonText}>Open</Text>
                        <ChevronRight size={15} color="#2563eb" />
                      </Pressable>
                    </View>

                    {expiringTraining.length === 0 ? (
                      <View style={styles.goodRow}>
                        <CheckCircle2 size={18} color="#047857" />
                        <Text style={styles.goodRowText}>
                          No dated training records are currently listed for expiry.
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.compactList}>
                        {expiringTraining.map(({ record, days }) => (
                          <Pressable
                            key={record.id}
                            onPress={() =>
                              router.push(
                                `/training/${encodeURIComponent(record.id)}` as Href,
                              )
                            }
                            style={styles.trainingRow}
                          >
                            <View style={styles.trainingMain}>
                              <Text style={styles.trainingName} numberOfLines={1}>
                                {record.training_name}
                              </Text>
                              <Text style={styles.trainingMeta} numberOfLines={1}>
                                {[
                                  record.training_short_code,
                                  record.certificate_number
                                    ? `No. ${record.certificate_number}`
                                    : null,
                                  `Expiry ${formatAuDate(record.expiry_date)}`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </Text>
                            </View>
                            <TonePill
                              tone={trainingTone(days)}
                              label={trainingCountdown(days)}
                            />
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                ) : null}

                {canUseVehiclePrestarts ? (
                  <Pressable
                    onPress={() => router.push("/vehicle-prestart" as Href)}
                    style={styles.panel}
                  >
                    <View style={styles.panelHeader}>
                      <View style={styles.panelTitleRow}>
                        <View style={[styles.iconBox, styles.iconBoxSlate]}>
                          <CarFront size={20} color="#334155" />
                        </View>
                        <View style={styles.panelTitleBlock}>
                          <Text style={styles.panelTitle}>My vehicle</Text>
                          <Text style={styles.panelSubtitle} numberOfLines={1}>
                            {personal.vehicle
                              ? vehicleLabel(personal.vehicle)
                              : "Vehicle prestart"}
                          </Text>
                        </View>
                      </View>
                      <ChevronRight size={18} color="#94a3b8" />
                    </View>

                    <StatusStrip
                      tone={vehicleState.tone}
                      title={vehicleState.title}
                      detail={vehicleState.detail}
                    />
                  </Pressable>
                ) : null}
              </View>
            )}
          </>
        ) : null}

        {canUseNotifications ? (
          <>
            <SectionHeader
              title="Notifications"
              subtitle="Only the items currently needing your attention."
              action={
                <Pressable
                  onPress={() => router.push("/notifications" as Href)}
                  style={styles.textButton}
                >
                  <Text style={styles.textButtonText}>Open</Text>
                  <ChevronRight size={15} color="#2563eb" />
                </Pressable>
              }
            />

            <View style={styles.panel}>
              {notificationsLoading ? (
                <LoadingInline text="Checking notifications..." />
              ) : notificationsError ? (
                <Text style={styles.inlineError}>{notificationsError}</Text>
              ) : notifications.unreadCount === 0 ? (
                <View style={styles.goodRow}>
                  <CheckCircle2 size={18} color="#047857" />
                  <Text style={styles.goodRowText}>You are all caught up.</Text>
                </View>
              ) : (
                <>
                  <View style={styles.notificationSummary}>
                    <View style={styles.notificationCountIcon}>
                      <Bell size={19} color="#1d4ed8" />
                    </View>
                    <View style={styles.notificationSummaryText}>
                      <Text style={styles.notificationCountTitle}>
                        {notifications.unreadCount} unread notification
                        {notifications.unreadCount === 1 ? "" : "s"}
                      </Text>
                      <Text style={styles.notificationCountMeta}>
                        {notifications.criticalCount > 0
                          ? `${notifications.criticalCount} critical`
                          : notifications.warningCount > 0
                            ? `${notifications.warningCount} warning`
                            : "No critical items"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.compactList}>
                    {notifications.recent.map((notification) => (
                      <Pressable
                        key={notification.id}
                        onPress={() => router.push("/notifications" as Href)}
                        style={styles.notificationRow}
                      >
                        <View
                          style={[
                            styles.notificationDot,
                            notification.severity === "critical" &&
                              styles.notificationDotCritical,
                            notification.severity === "warning" &&
                              styles.notificationDotWarning,
                          ]}
                        />
                        <View style={styles.notificationText}>
                          <Text style={styles.notificationTitle} numberOfLines={1}>
                            {notification.title}
                          </Text>
                          <Text style={styles.notificationMessage} numberOfLines={2}>
                            {notification.message}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </View>
          </>
        ) : null}

        {canSeeProjectSnapshot ? (
          <>
            <SectionHeader
              title="Project snapshot"
              subtitle="A simple view of the project — only information your permissions allow."
              action={
                canUseTowerProgress && selectedProject ? (
                  <Pressable
                    onPress={() => router.push("/project-progress" as Href)}
                    style={styles.textButton}
                  >
                    <Text style={styles.textButtonText}>Open</Text>
                    <ChevronRight size={15} color="#2563eb" />
                  </Pressable>
                ) : undefined
              }
            />

            {projectError ? (
              <ErrorCard title="Project snapshot unavailable" message={projectError} />
            ) : null}

            {projectLoading ? (
              <LoadingCard text="Updating project snapshot..." />
            ) : (
              <View style={styles.panel}>
                <View style={styles.projectProgressHeader}>
                  <View>
                    <Text style={styles.progressValue}>
                      {formatPercent(projectDashboard.overallProgress)}
                    </Text>
                    <Text style={styles.progressLabel}>Overall progress</Text>
                  </View>
                  <RadioTower size={25} color="#2563eb" />
                </View>

                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${clampPercent(
                          projectDashboard.overallProgress,
                        )}%`,
                      },
                    ]}
                  />
                </View>

                <View style={styles.towerStats}>
                  <TowerStat
                    value={projectDashboard.completedTowers}
                    label="Complete"
                    tone="green"
                  />
                  <TowerStat
                    value={projectDashboard.towersInProgress}
                    label="In progress"
                    tone="blue"
                  />
                  <TowerStat
                    value={projectDashboard.notStartedTowers}
                    label="Not started"
                    tone="slate"
                  />
                </View>

                {(canUseDeliveries || canUseDefects || canUseDockets) ? (
                  <View style={styles.permissionMetrics}>
                    {canUseDeliveries && projectDashboard.deliveryProgress !== null ? (
                      <SmallMetric
                        icon={<PackageCheck size={17} color="#047857" />}
                        label="Delivery"
                        value={formatPercent(projectDashboard.deliveryProgress)}
                      />
                    ) : null}

                    {canUseDefects && projectDashboard.openDefects !== null ? (
                      <SmallMetric
                        icon={<ShieldAlert size={17} color="#be123c" />}
                        label="Open defects"
                        value={String(projectDashboard.openDefects)}
                      />
                    ) : null}

                    {canUseDockets ? (
                      <SmallMetric
                        icon={<Clock3 size={17} color="#475569" />}
                        label="Latest docket"
                        value={formatAuDate(
                          projectDashboard.latestDocketDate,
                          "None",
                        )}
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      {action}
    </View>
  );
}

function TonePill({ tone, label }: { tone: Tone; label: string }) {
  const palette = tonePalette(tone);
  return (
    <View
      style={[
        styles.tonePill,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
      ]}
    >
      <Text style={[styles.tonePillText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

function StatusStrip({
  tone,
  title,
  detail,
}: {
  tone: Tone;
  title: string;
  detail: string;
}) {
  const palette = tonePalette(tone);

  return (
    <View
      style={[
        styles.statusStrip,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
      ]}
    >
      {tone === "green" ? (
        <CheckCircle2 size={19} color={palette.fg} />
      ) : tone === "red" ? (
        <AlertTriangle size={19} color={palette.fg} />
      ) : (
        <Clock3 size={19} color={palette.fg} />
      )}
      <View style={styles.statusStripText}>
        <Text style={[styles.statusStripTitle, { color: palette.fg }]}>
          {title}
        </Text>
        <Text style={styles.statusStripDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function TowerStat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: Tone;
}) {
  const palette = tonePalette(tone);

  return (
    <View style={styles.towerStat}>
      <Text style={[styles.towerStatValue, { color: palette.fg }]}>{value}</Text>
      <Text style={styles.towerStatLabel}>{label}</Text>
    </View>
  );
}

function SmallMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.smallMetric}>
      {icon}
      <View style={styles.smallMetricText}>
        <Text style={styles.smallMetricLabel}>{label}</Text>
        <Text style={styles.smallMetricValue}>{value}</Text>
      </View>
    </View>
  );
}

function ErrorCard({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <View style={styles.errorCard}>
      <AlertTriangle size={18} color="#be123c" />
      <View style={styles.errorCardText}>
        <Text style={styles.errorTitle}>{title}</Text>
        <Text style={styles.errorMessage}>{message}</Text>
      </View>
    </View>
  );
}

function LoadingCard({ text }: { text: string }) {
  return (
    <View style={styles.loadingCard}>
      <ActivityIndicator color="#2563eb" />
      <Text style={styles.loadingCardText}>{text}</Text>
    </View>
  );
}

function LoadingInline({ text }: { text: string }) {
  return (
    <View style={styles.loadingInline}>
      <ActivityIndicator size="small" color="#2563eb" />
      <Text style={styles.loadingInlineText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 16,
    paddingBottom: 42,
    gap: 12,
  },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    color: "#64748b",
    fontSize: 13,
  },
  welcomeBlock: {
    paddingTop: 4,
    paddingBottom: 2,
  },
  eyebrow: {
    color: "#2563eb",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  heading: {
    color: "#0f172a",
    fontSize: 26,
    fontWeight: "900",
    marginTop: 4,
  },
  role: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
  },
  crew: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3,
  },
  projectSelectorWrapper: {
    marginBottom: 2,
  },
  allocationCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    backgroundColor: "#ffffff",
    padding: 14,
  },
  smallEyebrow: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  allocationTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4,
  },
  allocationText: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 7,
    marginBottom: 1,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
  },
  sectionSubtitle: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  textButton: {
    minHeight: 34,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  textButtonText: {
    color: "#2563eb",
    fontSize: 11,
    fontWeight: "900",
  },
  stack: {
    gap: 10,
  },
  panel: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    backgroundColor: "#ffffff",
    padding: 14,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  panelTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  panelTitleBlock: {
    flex: 1,
  },
  panelTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
  },
  panelSubtitle: {
    color: "#64748b",
    fontSize: 10,
    marginTop: 2,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBoxBlue: {
    backgroundColor: "#eff6ff",
  },
  iconBoxSlate: {
    backgroundColor: "#f1f5f9",
  },
  compactList: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    marginTop: 12,
  },
  trainingRow: {
    minHeight: 57,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 9,
  },
  trainingMain: {
    flex: 1,
  },
  trainingName: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "900",
  },
  trainingMeta: {
    color: "#64748b",
    fontSize: 9,
    marginTop: 3,
  },
  tonePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  tonePillText: {
    fontSize: 8,
    fontWeight: "900",
  },
  goodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
  },
  goodRowText: {
    flex: 1,
    color: "#047857",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  statusStrip: {
    borderWidth: 1,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 11,
    marginTop: 12,
  },
  statusStripText: {
    flex: 1,
  },
  statusStripTitle: {
    fontSize: 11,
    fontWeight: "900",
  },
  statusStripDetail: {
    color: "#64748b",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },
  notificationSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  notificationCountIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationSummaryText: {
    flex: 1,
  },
  notificationCountTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },
  notificationCountMeta: {
    color: "#64748b",
    fontSize: 10,
    marginTop: 2,
  },
  notificationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  notificationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563eb",
    marginTop: 4,
  },
  notificationDotCritical: {
    backgroundColor: "#dc2626",
  },
  notificationDotWarning: {
    backgroundColor: "#d97706",
  },
  notificationText: {
    flex: 1,
  },
  notificationTitle: {
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "900",
  },
  notificationMessage: {
    color: "#64748b",
    fontSize: 9,
    lineHeight: 14,
    marginTop: 2,
  },
  inlineError: {
    color: "#be123c",
    fontSize: 11,
  },
  projectProgressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressValue: {
    color: "#0f172a",
    fontSize: 26,
    fontWeight: "900",
  },
  progressLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 1,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e2e8f0",
    overflow: "hidden",
    marginTop: 13,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#3b82f6",
  },
  towerStats: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    marginTop: 14,
    paddingTop: 13,
  },
  towerStat: {
    flex: 1,
    alignItems: "center",
  },
  towerStatValue: {
    fontSize: 19,
    fontWeight: "900",
  },
  towerStatLabel: {
    color: "#64748b",
    fontSize: 9,
    marginTop: 2,
  },
  permissionMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    marginTop: 13,
    paddingTop: 13,
  },
  smallMetric: {
    minWidth: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    padding: 10,
  },
  smallMetricText: {
    flex: 1,
  },
  smallMetricLabel: {
    color: "#64748b",
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  smallMetricValue: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 2,
  },
  errorCard: {
    flexDirection: "row",
    gap: 9,
    borderWidth: 1,
    borderColor: "#fecdd3",
    borderRadius: 14,
    backgroundColor: "#fff1f2",
    padding: 12,
  },
  errorCardText: {
    flex: 1,
  },
  errorTitle: {
    color: "#be123c",
    fontSize: 11,
    fontWeight: "900",
  },
  errorMessage: {
    color: "#9f1239",
    fontSize: 9,
    lineHeight: 14,
    marginTop: 2,
  },
  loadingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    backgroundColor: "#ffffff",
    padding: 14,
  },
  loadingCardText: {
    color: "#64748b",
    fontSize: 11,
  },
  loadingInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingInlineText: {
    color: "#64748b",
    fontSize: 11,
  },
});

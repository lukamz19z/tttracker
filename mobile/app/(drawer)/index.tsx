import { Redirect, router, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
import {
  AlertTriangle,
  Bell,
  Boxes,
  CircleCheck,
  CircleDot,
  ClipboardCheck,
  FileText,
  Gauge,
  HardHat,
  PackageCheck,
  RadioTower,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react-native";

import { ProjectSelector } from "@/components/ProjectSelector";
import { type MobileRole, useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

type Tower = {
  id: string;
  project_id: string;
  name: string | null;
  line: string | null;
  status: string | null;
  progress: number | null;
  tower_number: string | null;
  structure_number: string | null;
  tower_no: string | null;
  extra_data: Record<string, unknown> | null;
};

type DocketRow = {
  id: string;
  tower_id: string | null;
  project_id: string | null;
  docket_date: string | null;
  assembly_percent: number | null;
  erection_percent: number | null;
  raw_manhours: number | null;
  production_manhours: number | null;
};

type DefectRow = {
  id: string;
  tower_id: string | null;
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

type TowerSummary = Tower & {
  computedProgress: number;
  computedWeight: number | null;
  completedTonnes: number | null;
  rawManhours: number;
  productionManhours: number;
  rawMhPerTonne: number | null;
  productionMhPerTonne: number | null;
};

type DeliverySummary = {
  requiredQty: number;
  deliveredQty: number;
  outstandingQty: number;
  deliveryPercent: number;
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

const EMPTY_NOTIFICATIONS: NotificationSummary = {
  unreadCount: 0,
  criticalCount: 0,
  warningCount: 0,
  recent: [],
};

type ProjectDashboardData = {
  totalTowers: number;
  completedTowers: number;
  towersInProgress: number;
  notStartedTowers: number;
  overallProgress: number;
  deliveryProgress: number;
  totalDeliveries: number;
  openDefects: number;
  completedTonnes: number | null;
  rawMhPerTonne: number | null;
  productionMhPerTonne: number | null;
  latestDocketDate: string | null;
  inProgressTowers: TowerSummary[];
  deliveryTowers: (TowerSummary & DeliverySummary)[];
};

const EMPTY_DASHBOARD: ProjectDashboardData = {
  totalTowers: 0,
  completedTowers: 0,
  towersInProgress: 0,
  notStartedTowers: 0,
  overallProgress: 0,
  deliveryProgress: 0,
  totalDeliveries: 0,
  openDefects: 0,
  completedTonnes: null,
  rawMhPerTonne: null,
  productionMhPerTonne: null,
  latestDocketDate: null,
  inProgressTowers: [],
  deliveryTowers: [],
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function extractNumericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const match = String(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getTowerWeight(extraData?: Record<string, unknown> | null) {
  if (!extraData) return null;

  const entries = Object.entries(extraData);

  const exactEntry = entries.find(([key]) => {
    const value = key.trim().toLowerCase();
    return (
      value === "tower weight" ||
      value === "tower weight (t)" ||
      value === "tower_weight" ||
      value === "towerweight" ||
      value === "structure total weights" ||
      value === "structure total weight"
    );
  });

  if (exactEntry) return extractNumericValue(exactEntry[1]);

  const similarEntry = entries.find(([key]) => {
    const value = key.trim().toLowerCase();
    return (
      (value.includes("tower") || value.includes("structure")) &&
      value.includes("weight")
    );
  });

  if (similarEntry) return extractNumericValue(similarEntry[1]);

  const genericEntry = entries.find(([key]) =>
    key.trim().toLowerCase().includes("weight"),
  );

  return genericEntry ? extractNumericValue(genericEntry[1]) : null;
}

function getTowerDisplayName(tower: Tower) {
  return (
    tower.tower_number ||
    tower.structure_number ||
    tower.tower_no ||
    tower.name ||
    "Unnamed Tower"
  );
}

function getTowerType(tower: Tower) {
  if (tower.extra_data) {
    const entry = Object.entries(tower.extra_data).find(([key]) =>
      ["tower type", "tower_type", "structure type", "structure_type", "type"].includes(
        key.trim().toLowerCase(),
      ),
    );

    if (entry) {
      const value = safeString(entry[1]).trim();
      if (value) return value.toUpperCase();
    }
  }

  const text = [
    getTowerDisplayName(tower),
    tower.name,
    tower.structure_number,
    tower.tower_number,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  return text.match(/\b\d+[A-Z]{2}\b/)?.[0] ?? "Type not set";
}

function getDocketProgress(docket: DocketRow) {
  return clampPercent(
    Math.round(
      safeNumber(docket.assembly_percent) * 0.5 +
        safeNumber(docket.erection_percent) * 0.5,
    ),
  );
}

function getTowerProgress(tower: Tower, dockets: DocketRow[]) {
  const related = dockets.filter((docket) => docket.tower_id === tower.id);

  if (related.length === 0) {
    return clampPercent(safeNumber(tower.progress));
  }

  return related.reduce(
    (maximum, docket) => Math.max(maximum, getDocketProgress(docket)),
    0,
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

function formatNumber(value: number | null, decimals = 0) {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(decimals);
}

function formatDate(value: string | null) {
  if (!value) return "No dockets yet";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No dockets yet";

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatRole(role: MobileRole) {
  switch (role) {
    case "admin":
      return "Administrator";
    case "leading_hand":
      return "Leading Hand";
    case "mechanic":
      return "Mechanic";
    default:
      return "Crew Member";
  }
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

export default function HomeScreen() {
  const {
    session,
    loading,
    profile,
    profileLoading,
    profileError,
    refreshProfile,
  } = useAuth();

  const [dashboard, setDashboard] =
    useState<ProjectDashboardData>(EMPTY_DASHBOARD);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [notifications, setNotifications] =
    useState<NotificationSummary>(EMPTY_NOTIFICATIONS);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] =
    useState<string | null>(null);

  const role = profile?.mobileRole ?? "crew";
  const isCrew = role === "crew";
  const isLeadingHand = role === "leading_hand";
  const isMechanic = role === "mechanic";
  const isAdmin = role === "admin";

  const canSeePerformance = isAdmin || isLeadingHand;
  const canUseTowerOperations = isAdmin || isLeadingHand;
  const canUseAssets = isAdmin || isMechanic;

  const selectedProject =
    profile?.availableProjects.find(
      (project) => project.id === profile.projectId,
    ) ?? null;

  const loadNotifications = useCallback(async () => {
    if (!session?.user.id) {
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
        .limit(25);

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
        recent: rows.slice(0, 4),
      });
    } catch (error) {
      console.error("Notification summary load failed:", error);

      setNotifications(EMPTY_NOTIFICATIONS);
      setNotificationsError(
        error instanceof Error
          ? error.message
          : "Unable to load notifications.",
      );
    } finally {
      setNotificationsLoading(false);
    }
  }, [session?.user.id]);

  const loadProjectDashboard = useCallback(async () => {
    const projectId = profile?.projectId;

    if (!projectId) {
      setDashboard(EMPTY_DASHBOARD);
      setDashboardError(null);
      return;
    }

    setDashboardLoading(true);
    setDashboardError(null);

    try {
      const [towersResult, docketsResult] = await Promise.all([
        supabase
          .from("towers")
          .select("*")
          .eq("project_id", projectId),

        supabase
          .from("tower_daily_dockets")
          .select(
            "id,tower_id,project_id,docket_date,assembly_percent,erection_percent,raw_manhours,production_manhours",
          )
          .eq("project_id", projectId),
      ]);

      if (towersResult.error) throw towersResult.error;
      if (docketsResult.error) throw docketsResult.error;

      const towers = (towersResult.data ?? []) as Tower[];
      const dockets = (docketsResult.data ?? []) as DocketRow[];
      const towerIds = towers.map((tower) => tower.id);

      let defects: DefectRow[] = [];
      let bundles: MaterialBundleRow[] = [];

      if (towerIds.length > 0) {
        const [defectsResult, bundlesResult] = await Promise.all([
          supabase
            .from("tower_defects")
            .select("id,tower_id,status")
            .in("tower_id", towerIds),
          supabase
            .from("tower_required_bundles")
            .select("*")
            .in("tower_id", towerIds),
        ]);

        if (!defectsResult.error) {
          defects = (defectsResult.data ?? []) as DefectRow[];
        }

        if (!bundlesResult.error) {
          bundles = (bundlesResult.data ?? []) as MaterialBundleRow[];
        }
      }

      let deliveries: DeliveryRow[] = [];
      let deliveryItems: DeliveryItemRow[] = [];

      if (towerIds.length > 0) {
        for (const table of [
          "tower_bundle_deliveries",
          "tower_deliveries",
        ]) {
          const { data, error } = await supabase
            .from(table)
            .select("id,tower_id")
            .in("tower_id", towerIds);

          if (!error && data) {
            deliveries = data as DeliveryRow[];
            break;
          }
        }

        const deliveryIds = deliveries.map((delivery) => delivery.id);

        if (deliveryIds.length > 0) {
          for (const table of [
            "tower_bundle_delivery_items",
            "tower_delivery_items",
            "tower_delivered_items",
          ]) {
            const { data, error } = await supabase
              .from(table)
              .select("*")
              .in("delivery_id", deliveryIds);

            if (!error && data) {
              deliveryItems = data as DeliveryItemRow[];
              break;
            }
          }
        }
      }

      const deliverySummaryByTower = new Map<string, DeliverySummary>();

      for (const tower of towers) {
        const requiredQty = bundles
          .filter((bundle) => bundle.tower_id === tower.id)
          .reduce((sum, bundle) => sum + getRequiredQty(bundle), 0);

        const towerDeliveryIds = new Set(
          deliveries
            .filter((delivery) => delivery.tower_id === tower.id)
            .map((delivery) => delivery.id),
        );

        const deliveredQty = deliveryItems
          .filter(
            (item) =>
              item.delivery_id &&
              towerDeliveryIds.has(item.delivery_id),
          )
          .reduce((sum, item) => sum + getDeliveredQty(item), 0);

        const outstandingQty = Math.max(0, requiredQty - deliveredQty);

        const deliveryPercent =
          requiredQty > 0
            ? clampPercent((deliveredQty / requiredQty) * 100)
            : 0;

        deliverySummaryByTower.set(tower.id, {
          requiredQty,
          deliveredQty,
          outstandingQty,
          deliveryPercent,
        });
      }

      const towerSummaries: TowerSummary[] = towers.map((tower) => {
        const computedProgress = getTowerProgress(tower, dockets);
        const computedWeight = getTowerWeight(tower.extra_data);
        const completedTonnes =
          computedWeight && computedWeight > 0
            ? computedWeight * (computedProgress / 100)
            : null;

        const towerDockets = dockets.filter(
          (docket) => docket.tower_id === tower.id,
        );

        const rawManhours = towerDockets.reduce(
          (sum, docket) => sum + safeNumber(docket.raw_manhours),
          0,
        );

        const productionManhours = towerDockets.reduce(
          (sum, docket) =>
            sum +
            safeNumber(
              docket.production_manhours,
              safeNumber(docket.raw_manhours),
            ),
          0,
        );

        return {
          ...tower,
          computedProgress,
          computedWeight,
          completedTonnes,
          rawManhours,
          productionManhours,
          rawMhPerTonne:
            completedTonnes && completedTonnes > 0
              ? rawManhours / completedTonnes
              : null,
          productionMhPerTonne:
            completedTonnes && completedTonnes > 0
              ? productionManhours / completedTonnes
              : null,
        };
      });

      const totalTowerWeight = towerSummaries.reduce(
        (sum, tower) => sum + safeNumber(tower.computedWeight),
        0,
      );

      const completedTonnes = towerSummaries.reduce(
        (sum, tower) => sum + safeNumber(tower.completedTonnes),
        0,
      );

      const totalRawManhours = towerSummaries.reduce(
        (sum, tower) => sum + tower.rawManhours,
        0,
      );

      const totalProductionManhours = towerSummaries.reduce(
        (sum, tower) => sum + tower.productionManhours,
        0,
      );

      const completedTowers = towerSummaries.filter(
        (tower) => tower.computedProgress >= 100,
      ).length;

      const towersInProgress = towerSummaries.filter(
        (tower) =>
          tower.computedProgress > 0 &&
          tower.computedProgress < 100,
      ).length;

      const notStartedTowers = towerSummaries.filter(
        (tower) => tower.computedProgress <= 0,
      ).length;

      const overallProgress =
        totalTowerWeight > 0
          ? clampPercent((completedTonnes / totalTowerWeight) * 100)
          : towerSummaries.length > 0
            ? clampPercent(
                towerSummaries.reduce(
                  (sum, tower) => sum + tower.computedProgress,
                  0,
                ) / towerSummaries.length,
              )
            : 0;

      const totalRequiredQty = Array.from(
        deliverySummaryByTower.values(),
      ).reduce((sum, row) => sum + row.requiredQty, 0);

      const deliveredQty = Array.from(
        deliverySummaryByTower.values(),
      ).reduce((sum, row) => sum + row.deliveredQty, 0);

      const deliveryProgress =
        totalRequiredQty > 0
          ? clampPercent((deliveredQty / totalRequiredQty) * 100)
          : 0;

      const openDefects = defects.filter((defect) => {
        const status = safeString(defect.status).trim().toLowerCase();
        return !["closed", "complete", "completed"].includes(status);
      }).length;

      const latestDocketDate =
        dockets
          .map((docket) => docket.docket_date)
          .filter((date): date is string => Boolean(date))
          .sort(
            (a, b) =>
              new Date(b).getTime() - new Date(a).getTime(),
          )[0] ?? null;

      setDashboard({
        totalTowers: towerSummaries.length,
        completedTowers,
        towersInProgress,
        notStartedTowers,
        overallProgress,
        deliveryProgress,
        totalDeliveries: deliveries.length,
        openDefects,
        completedTonnes: completedTonnes > 0 ? completedTonnes : null,
        rawMhPerTonne:
          completedTonnes > 0
            ? totalRawManhours / completedTonnes
            : null,
        productionMhPerTonne:
          completedTonnes > 0
            ? totalProductionManhours / completedTonnes
            : null,
        latestDocketDate,
        inProgressTowers: towerSummaries
          .filter(
            (tower) =>
              tower.computedProgress > 0 &&
              tower.computedProgress < 100,
          )
          .sort((a, b) => b.computedProgress - a.computedProgress)
          .slice(0, 6),
        deliveryTowers: towerSummaries
          .map((tower) => ({
            ...tower,
            ...(deliverySummaryByTower.get(tower.id) ?? {
              requiredQty: 0,
              deliveredQty: 0,
              outstandingQty: 0,
              deliveryPercent: 0,
            }),
          }))
          .filter(
            (tower) =>
              tower.deliveryPercent > 0 &&
              tower.deliveryPercent < 100,
          )
          .sort((a, b) => b.deliveryPercent - a.deliveryPercent)
          .slice(0, 4),
      });
    } catch (error) {
      console.error("Project dashboard load failed:", error);

      const message =
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to load the project dashboard.";

      setDashboard(EMPTY_DASHBOARD);
      setDashboardError(message);
    } finally {
      setDashboardLoading(false);
    }
  }, [profile?.projectId]);

  useEffect(() => {
    void loadProjectDashboard();
  }, [loadProjectDashboard]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;

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
  }, [loadNotifications, session?.user.id]);

  if (!loading && !session) {
    return <Redirect href="/login" />;
  }

  const fullName =
    profile?.fullName ??
    session?.user.email?.split("@")[0] ??
    "User";

  async function refreshAll() {
    try {
      await refreshProfile();
      await Promise.all([
        loadProjectDashboard(),
        loadNotifications(),
      ]);
    } catch (error) {
      Alert.alert(
        "Unable to refresh",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    }
  }

  if (loading || profileLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color="#0f172a" />
          <Text style={styles.loadingText}>
            Loading TTTracker...
          </Text>
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
              dashboardLoading ||
              notificationsLoading
            }
            onRefresh={() => void refreshAll()}
          />
        }
      >
        <View style={styles.welcomeBlock}>
          <Text style={styles.eyebrow}>TTTRACKER MOBILE</Text>
          <Text style={styles.heading}>Welcome, {fullName}</Text>
          <Text style={styles.role}>
            {formatRole(role)}
            {profile?.employeeRole ? ` · ${profile.employeeRole}` : ""}
          </Text>
          <Text style={styles.crew}>
            {crewDisplay(
              profile?.crewNumber ?? null,
              profile?.crewName ?? null,
            )}
          </Text>
        </View>

        {profileError ? (
          <ErrorCard
            title="Profile could not be loaded"
            message={profileError}
          />
        ) : null}

        {isAdmin || isLeadingHand ? (
          <View style={styles.projectSelectorWrapper}>
            <ProjectSelector />
          </View>
        ) : (
          <View style={styles.allocationCard}>
            <Text style={styles.allocationEyebrow}>CURRENT ALLOCATION</Text>
            <Text style={styles.allocationTitle}>
              {profile?.projectNumber || "Project"}
            </Text>
            <Text style={styles.allocationText}>
              {profile?.projectName || "No project allocated"}
            </Text>
          </View>
        )}

        <View
          style={[
            styles.notificationHero,
            notifications.criticalCount > 0 &&
              styles.notificationHeroCritical,
          ]}
        >
          <View style={styles.notificationHeroTop}>
            <View
              style={[
                styles.notificationHeroIcon,
                notifications.criticalCount > 0 &&
                  styles.notificationHeroIconCritical,
              ]}
            >
              <Bell
                size={24}
                color={
                  notifications.criticalCount > 0
                    ? "#ffffff"
                    : "#1d4ed8"
                }
                strokeWidth={2.4}
              />
            </View>

            <View style={styles.notificationHeroTitleBlock}>
              <Text style={styles.notificationHeroEyebrow}>
                ATTENTION REQUIRED
              </Text>
              <Text style={styles.notificationHeroTitle}>
                {notifications.unreadCount > 0
                  ? `${notifications.unreadCount} unread notification${
                      notifications.unreadCount === 1 ? "" : "s"
                    }`
                  : "You're all caught up"}
              </Text>
              <Text style={styles.notificationHeroSubtitle}>
                {notifications.criticalCount > 0
                  ? `${notifications.criticalCount} critical item${
                      notifications.criticalCount === 1 ? "" : "s"
                    } need immediate attention.`
                  : notifications.warningCount > 0
                    ? `${notifications.warningCount} warning${
                        notifications.warningCount === 1 ? "" : "s"
                      } still require review.`
                    : "No unread critical or warning items."}
              </Text>
            </View>
          </View>

          {notificationsLoading ? (
            <View style={styles.notificationLoadingRow}>
              <ActivityIndicator color="#2563eb" />
              <Text style={styles.notificationLoadingText}>
                Checking notifications...
              </Text>
            </View>
          ) : notificationsError ? (
            <Text style={styles.notificationErrorText}>
              {notificationsError}
            </Text>
          ) : notifications.recent.length > 0 ? (
            <View style={styles.notificationPreviewList}>
              {notifications.recent.slice(0, 3).map((notification) => (
                <Pressable
                  key={notification.id}
                  onPress={() =>
                    router.push("/notifications" as Href)
                  }
                  style={({ pressed }) => [
                    styles.notificationPreview,
                    !notification.read_at &&
                      styles.notificationPreviewUnread,
                    pressed && styles.pressed,
                  ]}
                >
                  <View
                    style={[
                      styles.notificationSeverityDot,
                      notification.severity === "critical" &&
                        styles.notificationSeverityCritical,
                      notification.severity === "warning" &&
                        styles.notificationSeverityWarning,
                      notification.severity === "success" &&
                        styles.notificationSeveritySuccess,
                    ]}
                  />
                  <View style={styles.notificationPreviewText}>
                    <Text
                      style={styles.notificationPreviewTitle}
                      numberOfLines={1}
                    >
                      {notification.title}
                    </Text>
                    <Text
                      style={styles.notificationPreviewMessage}
                      numberOfLines={2}
                    >
                      {notification.message}
                    </Text>
                  </View>
                  {!notification.read_at ? (
                    <View style={styles.unreadDot} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          <Pressable
            onPress={() =>
              router.push("/notifications" as Href)
            }
            style={({ pressed }) => [
              styles.notificationOpenButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.notificationOpenButtonText}>
              Open Notification Centre
            </Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              {isCrew
                ? "Today"
                : isMechanic
                  ? "Maintenance workspace"
                  : isLeadingHand
                    ? "Field control"
                    : "Management workspace"}
            </Text>
            <Text style={styles.sectionSubtitle}>
              {isCrew
                ? "Your home page is intentionally limited to reminders, notifications and current towers."
                : "Only actions available to your current role are shown here."}
            </Text>
          </View>
        </View>

        {isCrew ? (
          <View style={styles.roleMessageCard}>
            <View style={styles.roleMessageIcon}>
              <CircleCheck size={22} color="#166534" strokeWidth={2.3} />
            </View>
            <View style={styles.roleMessageContent}>
              <Text style={styles.roleMessageTitle}>Ready for today</Text>
              <Text style={styles.roleMessageText}>
                Use the sidebar when you need to open an available field feature. This page will keep you updated without duplicating the full menu.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.quickActionGrid}>
            {canUseTowerOperations ? (
              <QuickAction
                label="Daily Dockets"
                icon={FileText}
                onPress={() => router.push("/daily-dockets" as Href)}
              />
            ) : null}

            {canUseTowerOperations ? (
              <QuickAction
                label="Tower Progress"
                icon={HardHat}
                onPress={() => router.push("/tower-progress" as Href)}
              />
            ) : null}

            {isLeadingHand ? (
              <QuickAction
                label="Truck Delivery"
                icon={Truck}
                onPress={() => router.push("/truck-delivery" as Href)}
              />
            ) : null}

            {canUseAssets ? (
              <QuickAction
                label="Fleet Jobs"
                icon={Wrench}
                onPress={() => router.push("/fleet-jobs" as Href)}
              />
            ) : null}

            {canUseAssets ? (
              <QuickAction
                label="Assets"
                icon={Boxes}
                onPress={() => router.push("/assets" as Href)}
              />
            ) : null}

            {isMechanic ? (
              <QuickAction
                label="Vehicle Prestarts"
                icon={ClipboardCheck}
                onPress={() => router.push("/vehicle-prestart" as Href)}
              />
            ) : null}

            {isAdmin ? (
              <QuickAction
                label="Compliance"
                icon={ShieldCheck}
                onPress={() => router.push("/compliance" as Href)}
              />
            ) : null}
          </View>
        )}

        {isAdmin || isLeadingHand ? (
          <>
        {dashboardError ? (
          <ErrorCard
            title="Project summary unavailable"
            message={dashboardError}
          />
        ) : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Project summary</Text>
            <Text style={styles.sectionSubtitle}>
              Live overview for the selected project.
            </Text>
          </View>

          <Pressable
            disabled={!selectedProject}
            onPress={() =>
              router.push("/project-progress" as Href)
            }
            style={({ pressed }) => [
              styles.openButton,
              !selectedProject && styles.disabledButton,
              pressed && selectedProject && styles.pressed,
            ]}
          >
            <Text style={styles.openButtonText}>Open</Text>
          </Pressable>
        </View>

        {dashboardLoading ? (
          <View style={styles.dashboardLoading}>
            <ActivityIndicator color="#0f172a" />
            <Text style={styles.dashboardLoadingText}>
              Updating project summary...
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.progressCard}>
              <ProgressCircle
                value={dashboard.overallProgress}
                label="Overall"
              />

              <View style={styles.progressDetails}>
                <Text style={styles.progressTitle}>
                  Project completion
                </Text>
                <Text style={styles.progressDescription}>
                  {dashboard.completedTowers} completed ·{" "}
                  {dashboard.towersInProgress} in progress ·{" "}
                  {dashboard.notStartedTowers} not started
                </Text>

                <View style={styles.miniProgressTrack}>
                  <View
                    style={[
                      styles.miniProgressFill,
                      {
                        width: `${clampPercent(
                          dashboard.overallProgress,
                        )}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>

            <View style={styles.metricsGrid}>
              <MetricCard
                label="Total towers"
                value={String(dashboard.totalTowers)}
                detail={`${dashboard.completedTowers} complete`}
                icon={RadioTower}
              />
              <MetricCard
                label="In progress"
                value={String(dashboard.towersInProgress)}
                detail={`${dashboard.notStartedTowers} not started`}
                icon={CircleDot}
              />
              <MetricCard
                label="Delivery"
                value={`${formatNumber(
                  dashboard.deliveryProgress,
                )}%`}
                detail={`${dashboard.totalDeliveries} delivery records`}
                icon={PackageCheck}
              />
              <MetricCard
                label="Open defects"
                value={String(dashboard.openDefects)}
                detail={`Latest docket: ${formatDate(
                  dashboard.latestDocketDate,
                )}`}
                icon={AlertTriangle}
              />
            </View>

            {canSeePerformance ? (
              <View style={styles.performanceCard}>
                <View style={styles.performanceHeading}>
                  <Gauge
                    size={20}
                    color="#6d28d9"
                    strokeWidth={2.4}
                  />
                  <Text style={styles.performanceTitle}>
                    Performance
                  </Text>
                </View>

                <View style={styles.performanceGrid}>
                  <PerformanceMetric
                    label="Production MH/T"
                    value={formatNumber(
                      dashboard.productionMhPerTonne,
                      2,
                    )}
                  />
                  <PerformanceMetric
                    label="Raw MH/T"
                    value={formatNumber(
                      dashboard.rawMhPerTonne,
                      2,
                    )}
                  />
                  <PerformanceMetric
                    label="Completed tonnes"
                    value={formatNumber(
                      dashboard.completedTonnes,
                      1,
                    )}
                  />
                </View>
              </View>
            ) : null}
          </>
        )}

          </>
        ) : null}

        {!isMechanic ? (
          <>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Current towers in progress
            </Text>
            <Text style={styles.sectionSubtitle}>
              The most advanced live towers on this project.
            </Text>
          </View>
        </View>

        {dashboard.inProgressTowers.length === 0 ? (
          <EmptyCard message="No towers are currently in progress." />
        ) : (
          <View style={styles.list}>
            {dashboard.inProgressTowers.map((tower) => (
              <View key={tower.id} style={styles.towerCard}>
                <View style={styles.towerHeader}>
                  <View style={styles.towerTitleBlock}>
                    <Text style={styles.towerName}>
                      {getTowerDisplayName(tower)}
                    </Text>
                    <Text style={styles.towerMeta}>
                      {getTowerType(tower)}
                      {tower.line ? ` · ${tower.line}` : ""}
                    </Text>
                  </View>

                  <Text style={styles.towerPercent}>
                    {formatNumber(tower.computedProgress)}%
                  </Text>
                </View>

                <View style={styles.towerProgressTrack}>
                  <View
                    style={[
                      styles.towerProgressFill,
                      {
                        width: `${clampPercent(
                          tower.computedProgress,
                        )}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

          </>
        ) : null}

        {(isAdmin || isLeadingHand) && dashboard.deliveryTowers.length > 0 ? (
          <>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>
                  Deliveries in progress
                </Text>
                <Text style={styles.sectionSubtitle}>
                  Towers with started but incomplete deliveries.
                </Text>
              </View>
            </View>

            <View style={styles.list}>
              {dashboard.deliveryTowers.map((tower) => (
                <View key={tower.id} style={styles.deliveryCard}>
                  <View style={styles.towerHeader}>
                    <View style={styles.towerTitleBlock}>
                      <Text style={styles.towerName}>
                        {getTowerDisplayName(tower)}
                      </Text>
                      <Text style={styles.towerMeta}>
                        {formatNumber(tower.deliveredQty)} of{" "}
                        {formatNumber(tower.requiredQty)} delivered
                      </Text>
                    </View>

                    <Text style={styles.deliveryPercent}>
                      {formatNumber(tower.deliveryPercent)}%
                    </Text>
                  </View>

                  <View style={styles.deliveryProgressTrack}>
                    <View
                      style={[
                        styles.deliveryProgressFill,
                        {
                          width: `${clampPercent(
                            tower.deliveryPercent,
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.statusCard}>
          <View style={styles.statusDot} />
          <View style={styles.statusContent}>
            <Text style={styles.statusTitle}>
              All changes uploaded
            </Text>
            <Text style={styles.statusText}>
              No items are currently waiting to sync.
            </Text>
          </View>
        </View>
      </ScrollView>

    </SafeAreaView>
  );
}

function ProgressCircle({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <View style={styles.progressCircle}>
      <Text style={styles.progressCircleValue}>
        {formatNumber(value)}%
      </Text>
      <Text style={styles.progressCircleLabel}>{label}</Text>
    </View>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{
    size?: number;
    color?: string;
    strokeWidth?: number;
  }>;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIcon}>
        <Icon size={19} color="#0f172a" strokeWidth={2.2} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

function PerformanceMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.performanceMetric}>
      <Text style={styles.performanceLabel}>{label}</Text>
      <Text style={styles.performanceValue}>{value}</Text>
    </View>
  );
}

function QuickAction({
  label,
  icon: Icon,
  onPress,
}: {
  label: string;
  icon: React.ComponentType<{
    size?: number;
    color?: string;
    strokeWidth?: number;
  }>;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.quickActionIcon}>
        <Icon
          size={22}
          color="#0f172a"
          strokeWidth={2.2}
        />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
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
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorMessage}>{message}</Text>
    </View>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20, paddingBottom: 48 },
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 12, color: "#64748b", fontSize: 14 },
  welcomeBlock: { marginBottom: 20 },
  eyebrow: { color: "#64748b", fontSize: 11, fontWeight: "800", letterSpacing: 1.3 },
  heading: { color: "#0f172a", fontSize: 28, fontWeight: "900", marginTop: 5 },
  role: { color: "#2563eb", fontSize: 13, fontWeight: "800", marginTop: 5 },
  crew: { color: "#64748b", fontSize: 13, marginTop: 4 },
  projectSelectorWrapper: {
    marginBottom: 16,
  },

  allocationCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    backgroundColor: "#ffffff",
    padding: 16,
    marginBottom: 16,
  },

  allocationEyebrow: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },

  allocationTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 5,
  },

  allocationText: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 4,
  },

  roleMessageCard: {
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 18,
    backgroundColor: "#f0fdf4",
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    marginBottom: 22,
  },

  roleMessageIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center",
  },

  roleMessageContent: {
    flex: 1,
    marginLeft: 12,
  },

  roleMessageTitle: {
    color: "#166534",
    fontSize: 14,
    fontWeight: "900",
  },

  roleMessageText: {
    color: "#15803d",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },

  notificationHero: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 22,
    backgroundColor: "#eff6ff",
    padding: 17,
    marginBottom: 22,
  },

  notificationHeroCritical: {
    borderColor: "#fecaca",
    backgroundColor: "#fff1f2",
  },

  notificationHeroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  notificationHeroIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },

  notificationHeroIconCritical: {
    backgroundColor: "#dc2626",
  },

  notificationHeroTitleBlock: {
    flex: 1,
    marginLeft: 12,
  },

  notificationHeroEyebrow: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  notificationHeroTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 3,
  },

  notificationHeroSubtitle: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },

  notificationLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
  },

  notificationLoadingText: {
    color: "#64748b",
    fontSize: 12,
    marginLeft: 9,
  },

  notificationErrorText: {
    color: "#b91c1c",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 13,
  },

  notificationPreviewList: {
    gap: 8,
    marginTop: 14,
  },

  notificationPreview: {
    minHeight: 62,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
  },

  notificationPreviewUnread: {
    borderColor: "#93c5fd",
  },

  notificationSeverityDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#2563eb",
    marginRight: 10,
  },

  notificationSeverityCritical: {
    backgroundColor: "#dc2626",
  },

  notificationSeverityWarning: {
    backgroundColor: "#d97706",
  },

  notificationSeveritySuccess: {
    backgroundColor: "#16a34a",
  },

  notificationPreviewText: {
    flex: 1,
  },

  notificationPreviewTitle: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "900",
  },

  notificationPreviewMessage: {
    color: "#64748b",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },

  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#2563eb",
    marginLeft: 8,
  },

  notificationOpenButton: {
    minHeight: 45,
    borderRadius: 13,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },

  notificationOpenButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },

  quickActionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 22,
  },

  quickAction: {
    width: "48%",
    minHeight: 104,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    backgroundColor: "#ffffff",
    padding: 14,
    justifyContent: "space-between",
  },

  quickActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },

  quickActionLabel: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 13,
  },
  sectionHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginTop: 6, marginBottom: 13 },
  sectionTitle: { color: "#0f172a", fontSize: 20, fontWeight: "900" },
  sectionSubtitle: { color: "#64748b", fontSize: 13, lineHeight: 18, marginTop: 3 },
  openButton: { borderRadius: 10, backgroundColor: "#0f172a", paddingHorizontal: 14, paddingVertical: 9 },
  openButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  disabledButton: { opacity: 0.4 },
  dashboardLoading: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 18, backgroundColor: "#ffffff", padding: 18, marginBottom: 18 },
  dashboardLoadingText: { color: "#64748b", fontSize: 13 },
  progressCard: { flexDirection: "row", alignItems: "center", gap: 16, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 22, backgroundColor: "#ffffff", padding: 18, marginBottom: 14 },
  progressCircle: { width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center", borderWidth: 9, borderColor: "#3b82f6", backgroundColor: "#eff6ff" },
  progressCircleValue: { color: "#0f172a", fontSize: 21, fontWeight: "900" },
  progressCircleLabel: { color: "#64748b", fontSize: 10, fontWeight: "700", marginTop: 2 },
  progressDetails: { flex: 1 },
  progressTitle: { color: "#0f172a", fontSize: 17, fontWeight: "900" },
  progressDescription: { color: "#64748b", fontSize: 13, lineHeight: 19, marginTop: 5 },
  miniProgressTrack: { height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: "#e2e8f0", marginTop: 13 },
  miniProgressFill: { height: "100%", borderRadius: 4, backgroundColor: "#3b82f6" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  metricCard: { width: "48%", minHeight: 142, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 18, backgroundColor: "#ffffff", padding: 15 },
  metricIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#f1f5f9" },
  metricLabel: { color: "#64748b", fontSize: 12, fontWeight: "700", marginTop: 12 },
  metricValue: { color: "#0f172a", fontSize: 24, fontWeight: "900", marginTop: 4 },
  metricDetail: { color: "#94a3b8", fontSize: 11, lineHeight: 16, marginTop: 5 },
  performanceCard: { borderWidth: 1, borderColor: "#ddd6fe", borderRadius: 20, backgroundColor: "#f5f3ff", padding: 17, marginBottom: 20 },
  performanceHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  performanceTitle: { color: "#5b21b6", fontSize: 16, fontWeight: "900" },
  performanceGrid: { flexDirection: "row", gap: 8, marginTop: 15 },
  performanceMetric: { flex: 1, borderRadius: 14, backgroundColor: "#ffffff", padding: 12 },
  performanceLabel: { color: "#7c3aed", fontSize: 10, fontWeight: "700" },
  performanceValue: { color: "#4c1d95", fontSize: 19, fontWeight: "900", marginTop: 7 },
  list: { gap: 10, marginBottom: 18 },
  towerCard: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 18, backgroundColor: "#ffffff", padding: 16 },
  deliveryCard: { borderWidth: 1, borderColor: "#bbf7d0", borderRadius: 18, backgroundColor: "#f0fdf4", padding: 16 },
  towerHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  towerTitleBlock: { flex: 1 },
  towerName: { color: "#0f172a", fontSize: 16, fontWeight: "900" },
  towerMeta: { color: "#64748b", fontSize: 12, marginTop: 4 },
  towerPercent: { color: "#2563eb", fontSize: 17, fontWeight: "900" },
  deliveryPercent: { color: "#15803d", fontSize: 17, fontWeight: "900" },
  towerProgressTrack: { height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: "#e2e8f0", marginTop: 14 },
  towerProgressFill: { height: "100%", borderRadius: 4, backgroundColor: "#3b82f6" },
  deliveryProgressTrack: { height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: "#dcfce7", marginTop: 14 },
  deliveryProgressFill: { height: "100%", borderRadius: 4, backgroundColor: "#22c55e" },
  emptyCard: { borderWidth: 1, borderStyle: "dashed", borderColor: "#cbd5e1", borderRadius: 18, backgroundColor: "#ffffff", padding: 20, marginBottom: 18 },
  emptyText: { color: "#64748b", fontSize: 14, textAlign: "center" },
  errorCard: { borderWidth: 1, borderColor: "#fecaca", borderRadius: 18, backgroundColor: "#fef2f2", padding: 17, marginBottom: 18 },
  errorTitle: { color: "#991b1b", fontSize: 15, fontWeight: "900" },
  errorMessage: { color: "#b91c1c", fontSize: 13, lineHeight: 19, marginTop: 5 },
  statusCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#bbf7d0", borderRadius: 18, backgroundColor: "#f0fdf4", padding: 16, marginTop: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#16a34a", marginRight: 12 },
  statusContent: { flex: 1 },
  statusTitle: { color: "#166534", fontSize: 14, fontWeight: "800" },
  statusText: { color: "#15803d", fontSize: 12, marginTop: 3 },
  pressed: { opacity: 0.72 },
});
import {
  Redirect,
  router,
  type Href,
} from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AlertTriangle,
  Archive,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Filter,
  Info,
  Search,
  Settings,
  ShieldAlert,
  Trash2,
  Wrench,
  X,
} from "lucide-react-native";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

type NotificationSeverity =
  | "info"
  | "success"
  | "warning"
  | "critical"
  | string;

type NotificationTab = "all" | "unread" | "archived";

type SeverityFilter =
  | "all"
  | "critical"
  | "warning"
  | "info"
  | "success";

type UserNotification = {
  id: string;
  user_id: string;
  event_type?: string | null;
  title: string;
  message: string;
  severity: NotificationSeverity;
  read_at: string | null;
  archived_at: string | null;
  action_route?: string | null;
  action_params?: Record<string, unknown> | null;
  source_table?: string | null;
  source_record_id?: string | null;
  asset_type?: string | null;
  docket_id?: string | null;
  created_at: string;
};

type NotificationStats = {
  total: number;
  unread: number;
  critical: number;
  warning: number;
  archived: number;
};

const EMPTY_STATS: NotificationStats = {
  total: 0,
  unread: 0,
  critical: 0,
  warning: 0,
  archived: 0,
};

function safeString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function normaliseSeverity(
  severity: NotificationSeverity | null | undefined,
): SeverityFilter {
  const value = safeString(severity, "info")
    .trim()
    .toLowerCase();

  if (value === "critical") return "critical";
  if (value === "warning") return "warning";
  if (value === "success") return "success";
  return "info";
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  const now = new Date();
  const differenceMs = now.getTime() - date.getTime();
  const differenceMinutes = Math.floor(differenceMs / 60000);

  if (differenceMinutes < 1) return "Just now";
  if (differenceMinutes < 60) {
    return `${differenceMinutes} min ago`;
  }

  const differenceHours = Math.floor(differenceMinutes / 60);

  if (differenceHours < 24) {
    return `${differenceHours} hr${
      differenceHours === 1 ? "" : "s"
    } ago`;
  }

  const differenceDays = Math.floor(differenceHours / 24);

  if (differenceDays < 7) {
    return `${differenceDays} day${
      differenceDays === 1 ? "" : "s"
    } ago`;
  }

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatEventType(value: string | null) {
  if (!value) return "General";

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getNotificationIcon(
  notification: UserNotification,
) {
  const eventType = safeString(notification.event_type)
    .toLowerCase();

  if (
    eventType.includes("fleet") ||
    eventType.includes("defect") ||
    eventType.includes("maintenance")
  ) {
    return Wrench;
  }

  if (
    eventType.includes("training") ||
    eventType.includes("certificate") ||
    eventType.includes("compliance")
  ) {
    return ShieldAlert;
  }

  const severity = normaliseSeverity(notification.severity);

  if (severity === "critical") return CircleAlert;
  if (severity === "warning") return AlertTriangle;
  if (severity === "success") return CircleCheck;

  return Info;
}

function resolveNotificationHref(
  notification: UserNotification,
): Href | null {
  const route = notification.action_route?.trim();

  if (!route) return null;

  const params = notification.action_params ?? {};
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== null &&
      value !== undefined &&
      typeof value !== "object"
    ) {
      query.set(key, String(value));
    }
  }

  const queryText = query.toString();
  const routeWithSlash = route.startsWith("/")
    ? route
    : `/${route}`;

  return (
    queryText
      ? `${routeWithSlash}?${queryText}`
      : routeWithSlash
  ) as Href;
}

function getSeverityLabel(severity: NotificationSeverity) {
  switch (normaliseSeverity(severity)) {
    case "critical":
      return "Critical";
    case "warning":
      return "Warning";
    case "success":
      return "Success";
    default:
      return "Information";
  }
}

export default function NotificationsScreen() {
  const {
    session,
    loading,
    profileLoading,
  } = useAuth();

  const [notifications, setNotifications] = useState<
    UserNotification[]
  >([]);
  const [stats, setStats] =
    useState<NotificationStats>(EMPTY_STATS);

  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(
    null,
  );

  const [activeTab, setActiveTab] =
    useState<NotificationTab>("all");
  const [severityFilter, setSeverityFilter] =
    useState<SeverityFilter>("all");
  const [searchText, setSearchText] = useState("");

  const [selectedNotification, setSelectedNotification] =
    useState<UserNotification | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<
    string | null
  >(null);

  const userId = session?.user.id ?? null;

  const loadNotifications = useCallback(
    async (showRefresh = false) => {
      if (!userId) {
        setNotifications([]);
        setStats(EMPTY_STATS);
        setPageLoading(false);
        return;
      }

      if (showRefresh) {
        setRefreshing(true);
      } else {
        setPageLoading(true);
      }

      setPageError(null);

      try {
        const { data, error } = await supabase
          .from("user_notifications")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(250);

        if (error) throw error;

        const rows = (data ?? []) as UserNotification[];
        const activeRows = rows.filter(
          (notification) => !notification.archived_at,
        );
        const unreadRows = activeRows.filter(
          (notification) => !notification.read_at,
        );

        setNotifications(rows);
        setStats({
          total: activeRows.length,
          unread: unreadRows.length,
          critical: unreadRows.filter(
            (notification) =>
              normaliseSeverity(notification.severity) ===
              "critical",
          ).length,
          warning: unreadRows.filter(
            (notification) =>
              normaliseSeverity(notification.severity) ===
              "warning",
          ).length,
          archived: rows.filter(
            (notification) =>
              Boolean(notification.archived_at),
          ).length,
        });
      } catch (error) {
        console.error("Notifications load failed:", error);

        const message =
          error &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to load notifications.";

        setPageError(message);
      } finally {
        setPageLoading(false);
        setRefreshing(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notification-centre-${userId}`)
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
  }, [loadNotifications, userId]);

  const filteredNotifications = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return notifications.filter((notification) => {
      if (
        activeTab === "archived" &&
        !notification.archived_at
      ) {
        return false;
      }

      if (
        activeTab !== "archived" &&
        notification.archived_at
      ) {
        return false;
      }

      if (
        activeTab === "unread" &&
        notification.read_at
      ) {
        return false;
      }

      if (
        severityFilter !== "all" &&
        normaliseSeverity(notification.severity) !==
          severityFilter
      ) {
        return false;
      }

      if (!query) return true;

      const haystack = [
        notification.title,
        notification.message,
        notification.event_type,
        notification.source_table,
        notification.asset_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [
    activeTab,
    notifications,
    searchText,
    severityFilter,
  ]);

  async function markAsRead(
    notification: UserNotification,
  ) {
    if (notification.read_at) return;

    setActionLoadingId(notification.id);

    try {
      const readAt = new Date().toISOString();

      const { error } = await supabase
        .from("user_notifications")
        .update({ read_at: readAt })
        .eq("id", notification.id)
        .eq("user_id", userId);

      if (error) throw error;

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, read_at: readAt }
            : item,
        ),
      );

      setStats((current) => ({
        ...current,
        unread: Math.max(0, current.unread - 1),
        critical:
          normaliseSeverity(notification.severity) ===
          "critical"
            ? Math.max(0, current.critical - 1)
            : current.critical,
        warning:
          normaliseSeverity(notification.severity) ===
          "warning"
            ? Math.max(0, current.warning - 1)
            : current.warning,
      }));

      setSelectedNotification((current) =>
        current?.id === notification.id
          ? { ...current, read_at: readAt }
          : current,
      );
    } catch (error) {
      Alert.alert(
        "Unable to mark as read",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  async function markAllAsRead() {
    if (!userId || stats.unread === 0) return;

    Alert.alert(
      "Mark all as read?",
      "This will mark every active notification as read.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Mark all read",
          onPress: () => {
            void performMarkAllAsRead();
          },
        },
      ],
    );
  }

  async function performMarkAllAsRead() {
    if (!userId) return;

    setActionLoadingId("mark-all");

    try {
      const readAt = new Date().toISOString();

      const { error } = await supabase
        .from("user_notifications")
        .update({ read_at: readAt })
        .eq("user_id", userId)
        .is("read_at", null)
        .is("archived_at", null);

      if (error) throw error;

      setNotifications((current) =>
        current.map((notification) =>
          notification.archived_at || notification.read_at
            ? notification
            : { ...notification, read_at: readAt },
        ),
      );

      setStats((current) => ({
        ...current,
        unread: 0,
        critical: 0,
        warning: 0,
      }));
    } catch (error) {
      Alert.alert(
        "Unable to mark all as read",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  async function archiveNotification(
    notification: UserNotification,
  ) {
    setActionLoadingId(notification.id);

    try {
      const archivedAt = new Date().toISOString();

      const { error } = await supabase
        .from("user_notifications")
        .update({ archived_at: archivedAt })
        .eq("id", notification.id)
        .eq("user_id", userId);

      if (error) throw error;

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, archived_at: archivedAt }
            : item,
        ),
      );

      setStats((current) => ({
        ...current,
        total: Math.max(0, current.total - 1),
        archived: current.archived + 1,
        unread: notification.read_at
          ? current.unread
          : Math.max(0, current.unread - 1),
        critical:
          !notification.read_at &&
          normaliseSeverity(notification.severity) ===
            "critical"
            ? Math.max(0, current.critical - 1)
            : current.critical,
        warning:
          !notification.read_at &&
          normaliseSeverity(notification.severity) ===
            "warning"
            ? Math.max(0, current.warning - 1)
            : current.warning,
      }));

      setDetailVisible(false);
      setSelectedNotification(null);
    } catch (error) {
      Alert.alert(
        "Unable to archive notification",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  async function restoreNotification(
    notification: UserNotification,
  ) {
    setActionLoadingId(notification.id);

    try {
      const { error } = await supabase
        .from("user_notifications")
        .update({ archived_at: null })
        .eq("id", notification.id)
        .eq("user_id", userId);

      if (error) throw error;

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, archived_at: null }
            : item,
        ),
      );

      setStats((current) => ({
        ...current,
        total: current.total + 1,
        archived: Math.max(0, current.archived - 1),
        unread: notification.read_at
          ? current.unread
          : current.unread + 1,
        critical:
          !notification.read_at &&
          normaliseSeverity(notification.severity) ===
            "critical"
            ? current.critical + 1
            : current.critical,
        warning:
          !notification.read_at &&
          normaliseSeverity(notification.severity) ===
            "warning"
            ? current.warning + 1
            : current.warning,
      }));

      setDetailVisible(false);
      setSelectedNotification(null);
    } catch (error) {
      Alert.alert(
        "Unable to restore notification",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  async function deleteArchivedNotification(
    notification: UserNotification,
  ) {
    Alert.alert(
      "Delete notification?",
      "This permanently removes the archived notification.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void performDeleteNotification(notification);
          },
        },
      ],
    );
  }

  async function performDeleteNotification(
    notification: UserNotification,
  ) {
    setActionLoadingId(notification.id);

    try {
      const { error } = await supabase
        .from("user_notifications")
        .delete()
        .eq("id", notification.id)
        .eq("user_id", userId);

      if (error) throw error;

      setNotifications((current) =>
        current.filter(
          (item) => item.id !== notification.id,
        ),
      );

      setStats((current) => ({
        ...current,
        archived: Math.max(0, current.archived - 1),
      }));

      setDetailVisible(false);
      setSelectedNotification(null);
    } catch (error) {
      Alert.alert(
        "Unable to delete notification",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  async function openNotification(
    notification: UserNotification,
  ) {
    setSelectedNotification(notification);
    setDetailVisible(true);

    if (!notification.read_at) {
      await markAsRead(notification);
    }
  }

  async function openNotificationAction(
    notification: UserNotification,
  ) {
    const href = resolveNotificationHref(notification);

    if (!notification.read_at) {
      await markAsRead(notification);
    }

    if (!href) {
      Alert.alert(
        "No linked page",
        "This notification does not have a linked action.",
      );
      return;
    }

    setDetailVisible(false);
    router.push(href);
  }

  if (!loading && !session) {
    return <Redirect href="/login" />;
  }

  if (loading || profileLoading || pageLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator
            size="large"
            color="#0f172a"
          />
          <Text style={styles.loadingText}>
            Loading notifications...
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
            refreshing={refreshing}
            onRefresh={() =>
              void loadNotifications(true)
            }
          />
        }
      >
        <View style={styles.headerBlock}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.eyebrow}>
              TTTRACKER
            </Text>
            <Text style={styles.heading}>
              Notification Centre
            </Text>
            <Text style={styles.subtitle}>
              Review alerts, updates and required actions
              across your work.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notification settings"
            onPress={() =>
              router.push(
                "/notifications-settings" as Href,
              )
            }
            style={({ pressed }) => [
              styles.settingsButton,
              pressed && styles.pressed,
            ]}
          >
            <Settings
              size={21}
              color="#0f172a"
              strokeWidth={2.2}
            />
          </Pressable>
        </View>

        {pageError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>
              Notifications unavailable
            </Text>
            <Text style={styles.errorMessage}>
              {pageError}
            </Text>
          </View>
        ) : null}

        <View style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <View>
              <Text style={styles.summaryEyebrow}>
                CURRENT STATUS
              </Text>
              <Text style={styles.summaryTitle}>
                {stats.unread > 0
                  ? `${stats.unread} unread notification${
                      stats.unread === 1 ? "" : "s"
                    }`
                  : "You are all caught up"}
              </Text>
            </View>

            <View
              style={[
                styles.summaryIcon,
                stats.critical > 0 &&
                  styles.summaryIconCritical,
              ]}
            >
              {stats.unread > 0 ? (
                <Bell
                  size={25}
                  color={
                    stats.critical > 0
                      ? "#ffffff"
                      : "#1d4ed8"
                  }
                  strokeWidth={2.4}
                />
              ) : (
                <BellOff
                  size={25}
                  color="#15803d"
                  strokeWidth={2.4}
                />
              )}
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <SummaryMetric
              label="Unread"
              value={stats.unread}
              tone="blue"
            />
            <SummaryMetric
              label="Critical"
              value={stats.critical}
              tone="red"
            />
            <SummaryMetric
              label="Warnings"
              value={stats.warning}
              tone="amber"
            />
            <SummaryMetric
              label="Archived"
              value={stats.archived}
              tone="slate"
            />
          </View>

          {stats.unread > 0 ? (
            <Pressable
              disabled={actionLoadingId === "mark-all"}
              onPress={() => void markAllAsRead()}
              style={({ pressed }) => [
                styles.markAllButton,
                pressed && styles.pressed,
              ]}
            >
              {actionLoadingId === "mark-all" ? (
                <ActivityIndicator
                  size="small"
                  color="#ffffff"
                />
              ) : (
                <CheckCheck
                  size={18}
                  color="#ffffff"
                  strokeWidth={2.3}
                />
              )}
              <Text style={styles.markAllButtonText}>
                Mark all as read
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.searchFilterRow}>
          <View style={styles.searchBox}>
            <Search
              size={18}
              color="#64748b"
              strokeWidth={2.1}
            />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search notifications"
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchText ? (
              <Pressable
                onPress={() => setSearchText("")}
                style={({ pressed }) => [
                  styles.clearSearchButton,
                  pressed && styles.pressed,
                ]}
              >
                <X
                  size={16}
                  color="#64748b"
                  strokeWidth={2.2}
                />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={() => setFilterVisible(true)}
            style={({ pressed }) => [
              styles.filterButton,
              severityFilter !== "all" &&
                styles.filterButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <Filter
              size={19}
              color={
                severityFilter !== "all"
                  ? "#ffffff"
                  : "#0f172a"
              }
              strokeWidth={2.2}
            />
          </Pressable>
        </View>

        <View style={styles.tabs}>
          <TabButton
            label="All"
            count={stats.total}
            active={activeTab === "all"}
            onPress={() => setActiveTab("all")}
          />
          <TabButton
            label="Unread"
            count={stats.unread}
            active={activeTab === "unread"}
            onPress={() => setActiveTab("unread")}
          />
          <TabButton
            label="Archived"
            count={stats.archived}
            active={activeTab === "archived"}
            onPress={() => setActiveTab("archived")}
          />
        </View>

        {severityFilter !== "all" ? (
          <View style={styles.activeFilterRow}>
            <Text style={styles.activeFilterLabel}>
              Showing {severityFilter} notifications
            </Text>
            <Pressable
              onPress={() =>
                setSeverityFilter("all")
              }
              style={({ pressed }) => [
                styles.removeFilterButton,
                pressed && styles.pressed,
              ]}
            >
              <X
                size={15}
                color="#475569"
                strokeWidth={2.2}
              />
              <Text style={styles.removeFilterText}>
                Clear
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              {activeTab === "archived"
                ? "Archived notifications"
                : activeTab === "unread"
                  ? "Unread notifications"
                  : "All notifications"}
            </Text>
            <Text style={styles.sectionSubtitle}>
              {filteredNotifications.length} result
              {filteredNotifications.length === 1
                ? ""
                : "s"}
            </Text>
          </View>
        </View>

        {filteredNotifications.length === 0 ? (
          <EmptyState
            activeTab={activeTab}
            hasSearch={Boolean(searchText.trim())}
            severityFilter={severityFilter}
          />
        ) : (
          <View style={styles.notificationList}>
            {filteredNotifications.map(
              (notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  loading={
                    actionLoadingId === notification.id
                  }
                  onOpen={() =>
                    void openNotification(notification)
                  }
                  onMarkRead={() =>
                    void markAsRead(notification)
                  }
                  onArchive={() =>
                    void archiveNotification(
                      notification,
                    )
                  }
                  onRestore={() =>
                    void restoreNotification(
                      notification,
                    )
                  }
                />
              ),
            )}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={detailVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setDetailVisible(false);
          setSelectedNotification(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.detailSheet}>
            <View style={styles.sheetHandle} />

            {selectedNotification ? (
              <>
                <View style={styles.detailHeader}>
                  <View
                    style={[
                      styles.detailSeverityIcon,
                      normaliseSeverity(
                        selectedNotification.severity,
                      ) === "critical" &&
                        styles.detailSeverityIconCritical,
                      normaliseSeverity(
                        selectedNotification.severity,
                      ) === "warning" &&
                        styles.detailSeverityIconWarning,
                      normaliseSeverity(
                        selectedNotification.severity,
                      ) === "success" &&
                        styles.detailSeverityIconSuccess,
                    ]}
                  >
                    {(() => {
                      const Icon =
                        getNotificationIcon(
                          selectedNotification,
                        );

                      return (
                        <Icon
                          size={23}
                          color="#ffffff"
                          strokeWidth={2.3}
                        />
                      );
                    })()}
                  </View>

                  <View style={styles.detailTitleBlock}>
                    <Text style={styles.detailSeverityLabel}>
                      {getSeverityLabel(
                        selectedNotification.severity,
                      )}
                    </Text>
                    <Text style={styles.detailTitle}>
                      {selectedNotification.title}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => {
                      setDetailVisible(false);
                      setSelectedNotification(null);
                    }}
                    style={({ pressed }) => [
                      styles.closeButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <X
                      size={20}
                      color="#475569"
                      strokeWidth={2.2}
                    />
                  </Pressable>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={
                    styles.detailContent
                  }
                >
                  <Text style={styles.detailMessage}>
                    {selectedNotification.message}
                  </Text>

                  <View style={styles.detailMetaCard}>
                    <DetailRow
                      label="Category"
                      value={formatEventType(selectedNotification.source_table ?? null)}
                    />
                    <DetailRow
                      label="Received"
                      value={formatDateTime(
                        selectedNotification.created_at,
                      )}
                    />
                    <DetailRow
                      label="Status"
                      value={
                        selectedNotification.read_at
                          ? "Read"
                          : "Unread"
                      }
                    />
                    {selectedNotification.source_table ? (
                      <DetailRow
                        label="Source"
                        value={formatEventType(
                          selectedNotification.source_table,
                        )}
                      />
                    ) : null}
                  </View>

                  {selectedNotification.action_route ? (
                    <Pressable
                      onPress={() =>
                        void openNotificationAction(
                          selectedNotification,
                        )
                      }
                      style={({ pressed }) => [
                        styles.primaryDetailButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={
                          styles.primaryDetailButtonText
                        }
                      >
                        Open linked item
                      </Text>
                      <ChevronRight
                        size={19}
                        color="#ffffff"
                        strokeWidth={2.3}
                      />
                    </Pressable>
                  ) : null}

                  {selectedNotification.archived_at ? (
                    <View style={styles.detailActionRow}>
                      <Pressable
                        disabled={
                          actionLoadingId ===
                          selectedNotification.id
                        }
                        onPress={() =>
                          void restoreNotification(
                            selectedNotification,
                          )
                        }
                        style={({ pressed }) => [
                          styles.secondaryDetailButton,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Archive
                          size={18}
                          color="#0f172a"
                          strokeWidth={2.2}
                        />
                        <Text
                          style={
                            styles.secondaryDetailButtonText
                          }
                        >
                          Restore
                        </Text>
                      </Pressable>

                      <Pressable
                        disabled={
                          actionLoadingId ===
                          selectedNotification.id
                        }
                        onPress={() =>
                          void deleteArchivedNotification(
                            selectedNotification,
                          )
                        }
                        style={({ pressed }) => [
                          styles.deleteDetailButton,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Trash2
                          size={18}
                          color="#b91c1c"
                          strokeWidth={2.2}
                        />
                        <Text
                          style={
                            styles.deleteDetailButtonText
                          }
                        >
                          Delete
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      disabled={
                        actionLoadingId ===
                        selectedNotification.id
                      }
                      onPress={() =>
                        void archiveNotification(
                          selectedNotification,
                        )
                      }
                      style={({ pressed }) => [
                        styles.archiveDetailButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Archive
                        size={18}
                        color="#475569"
                        strokeWidth={2.2}
                      />
                      <Text
                        style={
                          styles.archiveDetailButtonText
                        }
                      >
                        Archive notification
                      </Text>
                    </Pressable>
                  )}
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={filterVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterVisible(false)}
      >
        <Pressable
          style={styles.filterModalBackdrop}
          onPress={() => setFilterVisible(false)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={styles.filterSheet}
          >
            <View style={styles.filterSheetHeader}>
              <Text style={styles.filterSheetTitle}>
                Filter by severity
              </Text>
              <Pressable
                onPress={() => setFilterVisible(false)}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.pressed,
                ]}
              >
                <X
                  size={20}
                  color="#475569"
                  strokeWidth={2.2}
                />
              </Pressable>
            </View>

            {(
              [
                "all",
                "critical",
                "warning",
                "info",
                "success",
              ] as SeverityFilter[]
            ).map((filter) => (
              <Pressable
                key={filter}
                onPress={() => {
                  setSeverityFilter(filter);
                  setFilterVisible(false);
                }}
                style={({ pressed }) => [
                  styles.filterOption,
                  severityFilter === filter &&
                    styles.filterOptionActive,
                  pressed && styles.pressed,
                ]}
              >
                <View>
                  <Text style={styles.filterOptionLabel}>
                    {filter === "all"
                      ? "All severities"
                      : filter.charAt(0).toUpperCase() +
                        filter.slice(1)}
                  </Text>
                  <Text style={styles.filterOptionDescription}>
                    {filter === "all"
                      ? "Show every notification"
                      : `Show only ${filter} notifications`}
                  </Text>
                </View>

                {severityFilter === filter ? (
                  <Check
                    size={19}
                    color="#2563eb"
                    strokeWidth={2.4}
                  />
                ) : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function SummaryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "red" | "amber" | "slate";
}) {
  return (
    <View
      style={[
        styles.summaryMetric,
        tone === "blue" && styles.summaryMetricBlue,
        tone === "red" && styles.summaryMetricRed,
        tone === "amber" && styles.summaryMetricAmber,
        tone === "slate" && styles.summaryMetricSlate,
      ]}
    >
      <Text style={styles.summaryMetricValue}>
        {value}
      </Text>
      <Text style={styles.summaryMetricLabel}>
        {label}
      </Text>
    </View>
  );
}

function TabButton({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tabButton,
        active && styles.tabButtonActive,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.tabButtonText,
          active && styles.tabButtonTextActive,
        ]}
      >
        {label}
      </Text>

      <View
        style={[
          styles.tabCount,
          active && styles.tabCountActive,
        ]}
      >
        <Text
          style={[
            styles.tabCountText,
            active && styles.tabCountTextActive,
          ]}
        >
          {count > 99 ? "99+" : count}
        </Text>
      </View>
    </Pressable>
  );
}

function NotificationCard({
  notification,
  loading,
  onOpen,
  onMarkRead,
  onArchive,
  onRestore,
}: {
  notification: UserNotification;
  loading: boolean;
  onOpen: () => void;
  onMarkRead: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const severity = normaliseSeverity(
    notification.severity,
  );
  const Icon = getNotificationIcon(notification);
  const unread = !notification.read_at;
  const archived = Boolean(notification.archived_at);

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [
        styles.notificationCard,
        unread && styles.notificationCardUnread,
        severity === "critical" &&
          styles.notificationCardCritical,
        severity === "warning" &&
          styles.notificationCardWarning,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.notificationCardIcon,
          severity === "critical" &&
            styles.notificationCardIconCritical,
          severity === "warning" &&
            styles.notificationCardIconWarning,
          severity === "success" &&
            styles.notificationCardIconSuccess,
        ]}
      >
        <Icon
          size={21}
          color="#ffffff"
          strokeWidth={2.3}
        />
      </View>

      <View style={styles.notificationCardContent}>
        <View style={styles.notificationCardTopRow}>
          <Text
            style={[
              styles.notificationCardTitle,
              unread &&
                styles.notificationCardTitleUnread,
            ]}
            numberOfLines={2}
          >
            {notification.title}
          </Text>

          {unread ? <View style={styles.unreadDot} /> : null}
        </View>

        <Text
          style={styles.notificationCardMessage}
          numberOfLines={3}
        >
          {notification.message}
        </Text>

        <View style={styles.notificationCardMeta}>
          <Text style={styles.notificationCardType}>
            {formatEventType(notification.event_type ?? null)}
          </Text>
          <Text style={styles.notificationCardDivider}>
            ·
          </Text>
          <Text style={styles.notificationCardTime}>
            {formatDateTime(notification.created_at)}
          </Text>
        </View>

        <View style={styles.notificationActions}>
          {!archived && unread ? (
            <Pressable
              disabled={loading}
              onPress={(event) => {
                event.stopPropagation();
                onMarkRead();
              }}
              style={({ pressed }) => [
                styles.cardActionButton,
                pressed && styles.pressed,
              ]}
            >
              <Check
                size={15}
                color="#2563eb"
                strokeWidth={2.3}
              />
              <Text style={styles.cardActionText}>
                Mark read
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            disabled={loading}
            onPress={(event) => {
              event.stopPropagation();

              if (archived) {
                onRestore();
              } else {
                onArchive();
              }
            }}
            style={({ pressed }) => [
              styles.cardActionButton,
              pressed && styles.pressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator
                size="small"
                color="#475569"
              />
            ) : (
              <Archive
                size={15}
                color="#475569"
                strokeWidth={2.3}
              />
            )}
            <Text style={styles.cardActionTextMuted}>
              {archived ? "Restore" : "Archive"}
            </Text>
          </Pressable>

          <View style={styles.cardOpenLink}>
            <Text style={styles.cardOpenLinkText}>
              View
            </Text>
            <ChevronRight
              size={15}
              color="#64748b"
              strokeWidth={2.2}
            />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailRowLabel}>
        {label}
      </Text>
      <Text style={styles.detailRowValue}>
        {value}
      </Text>
    </View>
  );
}

function EmptyState({
  activeTab,
  hasSearch,
  severityFilter,
}: {
  activeTab: NotificationTab;
  hasSearch: boolean;
  severityFilter: SeverityFilter;
}) {
  let title = "No notifications";
  let message =
    "There are no notifications to display.";

  if (hasSearch) {
    title = "No matching notifications";
    message =
      "Try a different search term or clear the search.";
  } else if (severityFilter !== "all") {
    title = `No ${severityFilter} notifications`;
    message =
      "Clear the severity filter to see other notifications.";
  } else if (activeTab === "unread") {
    title = "All caught up";
    message =
      "You have no unread notifications.";
  } else if (activeTab === "archived") {
    title = "No archived notifications";
    message =
      "Archived notifications will appear here.";
  }

  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <BellOff
          size={28}
          color="#64748b"
          strokeWidth={2.1}
        />
      </View>
      <Text style={styles.emptyTitle}>
        {title}
      </Text>
      <Text style={styles.emptyMessage}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  content: {
    padding: 20,
    paddingBottom: 48,
  },

  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: "#64748b",
    fontSize: 14,
    marginTop: 12,
  },

  headerBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 20,
  },

  headerTextBlock: {
    flex: 1,
    paddingRight: 12,
  },

  eyebrow: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  heading: {
    color: "#0f172a",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 4,
  },

  subtitle: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },

  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },

  errorCard: {
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 18,
    backgroundColor: "#fef2f2",
    padding: 16,
    marginBottom: 16,
  },

  errorTitle: {
    color: "#991b1b",
    fontSize: 14,
    fontWeight: "900",
  },

  errorMessage: {
    color: "#b91c1c",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  summaryCard: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 22,
    backgroundColor: "#eff6ff",
    padding: 17,
    marginBottom: 18,
  },

  summaryTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  summaryEyebrow: {
    color: "#2563eb",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },

  summaryTitle: {
    color: "#0f172a",
    fontSize: 19,
    fontWeight: "900",
    marginTop: 4,
  },

  summaryIcon: {
    width: 49,
    height: 49,
    borderRadius: 16,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },

  summaryIconCritical: {
    backgroundColor: "#dc2626",
  },

  summaryGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },

  summaryMetric: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 7,
    alignItems: "center",
  },

  summaryMetricBlue: {
    backgroundColor: "#dbeafe",
  },

  summaryMetricRed: {
    backgroundColor: "#fee2e2",
  },

  summaryMetricAmber: {
    backgroundColor: "#fef3c7",
  },

  summaryMetricSlate: {
    backgroundColor: "#e2e8f0",
  },

  summaryMetricValue: {
    color: "#0f172a",
    fontSize: 19,
    fontWeight: "900",
  },

  summaryMetricLabel: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 3,
  },

  markAllButton: {
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: "#0f172a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 15,
  },

  markAllButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },

  searchFilterRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 13,
  },

  searchBox: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 15,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },

  searchInput: {
    flex: 1,
    color: "#0f172a",
    fontSize: 13,
    marginLeft: 9,
  },

  clearSearchButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },

  filterButton: {
    width: 48,
    height: 48,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 15,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },

  filterButtonActive: {
    borderColor: "#2563eb",
    backgroundColor: "#2563eb",
  },

  tabs: {
    flexDirection: "row",
    borderRadius: 15,
    backgroundColor: "#e2e8f0",
    padding: 4,
    marginBottom: 12,
  },

  tabButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  tabButtonActive: {
    backgroundColor: "#ffffff",
  },

  tabButtonText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
  },

  tabButtonTextActive: {
    color: "#0f172a",
  },

  tabCount: {
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },

  tabCountActive: {
    backgroundColor: "#dbeafe",
  },

  tabCountText: {
    color: "#475569",
    fontSize: 8,
    fontWeight: "900",
  },

  tabCountTextActive: {
    color: "#1d4ed8",
  },

  activeFilterRow: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 13,
    backgroundColor: "#eff6ff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginBottom: 12,
  },

  activeFilterLabel: {
    color: "#1e40af",
    fontSize: 11,
    fontWeight: "800",
  },

  removeFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  removeFilterText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "800",
  },

  sectionHeader: {
    marginTop: 5,
    marginBottom: 12,
  },

  sectionTitle: {
    color: "#0f172a",
    fontSize: 19,
    fontWeight: "900",
  },

  sectionSubtitle: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3,
  },

  notificationList: {
    gap: 10,
  },

  notificationCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    padding: 14,
  },

  notificationCardUnread: {
    borderColor: "#93c5fd",
    backgroundColor: "#f8fbff",
  },

  notificationCardCritical: {
    borderLeftWidth: 4,
    borderLeftColor: "#dc2626",
  },

  notificationCardWarning: {
    borderLeftWidth: 4,
    borderLeftColor: "#d97706",
  },

  notificationCardIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  notificationCardIconCritical: {
    backgroundColor: "#dc2626",
  },

  notificationCardIconWarning: {
    backgroundColor: "#d97706",
  },

  notificationCardIconSuccess: {
    backgroundColor: "#16a34a",
  },

  notificationCardContent: {
    flex: 1,
  },

  notificationCardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  notificationCardTitle: {
    flex: 1,
    color: "#334155",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
  },

  notificationCardTitleUnread: {
    color: "#0f172a",
    fontWeight: "900",
  },

  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#2563eb",
    marginLeft: 8,
    marginTop: 4,
  },

  notificationCardMessage: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  notificationCardMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 9,
  },

  notificationCardType: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  notificationCardDivider: {
    color: "#94a3b8",
    fontSize: 10,
    marginHorizontal: 5,
  },

  notificationCardTime: {
    color: "#94a3b8",
    fontSize: 10,
  },

  notificationActions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 11,
    gap: 8,
  },

  cardActionButton: {
    minHeight: 32,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
  },

  cardActionText: {
    color: "#2563eb",
    fontSize: 9,
    fontWeight: "900",
  },

  cardActionTextMuted: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "900",
  },

  cardOpenLink: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
  },

  cardOpenLinkText: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "800",
  },

  emptyCard: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    borderRadius: 20,
    backgroundColor: "#ffffff",
    alignItems: "center",
    paddingVertical: 34,
    paddingHorizontal: 20,
  },

  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 13,
  },

  emptyMessage: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 5,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    justifyContent: "flex-end",
  },

  detailSheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: "#ffffff",
    paddingTop: 9,
  },

  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#cbd5e1",
    alignSelf: "center",
    marginBottom: 14,
  },

  detailHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },

  detailSeverityIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },

  detailSeverityIconCritical: {
    backgroundColor: "#dc2626",
  },

  detailSeverityIconWarning: {
    backgroundColor: "#d97706",
  },

  detailSeverityIconSuccess: {
    backgroundColor: "#16a34a",
  },

  detailTitleBlock: {
    flex: 1,
    marginLeft: 12,
    paddingRight: 10,
  },

  detailSeverityLabel: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  detailTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24,
    marginTop: 3,
  },

  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },

  detailContent: {
    padding: 20,
    paddingBottom: 36,
  },

  detailMessage: {
    color: "#334155",
    fontSize: 14,
    lineHeight: 22,
  },

  detailMetaCard: {
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    padding: 14,
    marginTop: 18,
  },

  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 7,
  },

  detailRowLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
  },

  detailRowValue: {
    flex: 1,
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "right",
  },

  primaryDetailButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#0f172a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 18,
  },

  primaryDetailButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },

  archiveDetailButton: {
    minHeight: 47,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },

  archiveDetailButtonText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "900",
  },

  detailActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },

  secondaryDetailButton: {
    flex: 1,
    minHeight: 47,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  secondaryDetailButtonText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "900",
  },

  deleteDetailButton: {
    flex: 1,
    minHeight: 47,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  deleteDetailButtonText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "900",
  },

  filterModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    justifyContent: "center",
    padding: 22,
  },

  filterSheet: {
    borderRadius: 22,
    backgroundColor: "#ffffff",
    padding: 17,
  },

  filterSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  filterSheetTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
  },

  filterOption: {
    minHeight: 62,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 13,
    paddingVertical: 10,
  },

  filterOptionActive: {
    backgroundColor: "#eff6ff",
  },

  filterOptionLabel: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },

  filterOptionDescription: {
    color: "#64748b",
    fontSize: 10,
    marginTop: 3,
  },

  pressed: {
    opacity: 0.72,
  },
});

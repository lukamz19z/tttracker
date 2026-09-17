import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import {
  AlertTriangle,
  Bell,
  BellOff,
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
  HardHat,
  RefreshCw,
  Save,
  ShieldCheck,
  Truck,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { useAccess } from "@/lib/access";
import { registerDevicePushToken } from "@/lib/notifications/register-device-push-token";
import { supabase } from "@/lib/supabase";

type Preferences = {
  notifications_enabled: boolean;
  expenses_enabled: boolean;
  invoices_enabled: boolean;
  training_enabled: boolean;
  prestarts_enabled: boolean;
  fleet_jobs_enabled: boolean;
  daily_dockets_enabled: boolean;
  defects_enabled: boolean;
  rectifications_enabled: boolean;
  deliveries_enabled: boolean;
  materials_enabled: boolean;
  projects_enabled: boolean;
  general_enabled: boolean;
};

type PreferenceKey = Exclude<
  keyof Preferences,
  "notifications_enabled"
>;

type PreferenceDefinition = {
  key: PreferenceKey;
  title: string;
  description: string;
  permissions?: string[];
  icon: ComponentType<{
    size?: number;
    color?: string;
    strokeWidth?: number;
  }>;
};

const DEFAULT_PREFERENCES: Preferences = {
  notifications_enabled: true,
  expenses_enabled: true,
  invoices_enabled: true,
  training_enabled: true,
  prestarts_enabled: true,
  fleet_jobs_enabled: true,
  daily_dockets_enabled: true,
  defects_enabled: true,
  rectifications_enabled: true,
  deliveries_enabled: true,
  materials_enabled: true,
  projects_enabled: true,
  general_enabled: true,
};

const PREFERENCE_ROWS: PreferenceDefinition[] = [
  {
    key: "expenses_enabled",
    title: "Expenses",
    description:
      "Expense Claim submissions, approvals, changes and outcomes.",
    permissions: ["mobile.expenses"],
    icon: BriefcaseBusiness,
  },
  {
    key: "invoices_enabled",
    title: "Invoices",
    description:
      "Supplier Invoice approvals, changes, denials and outcomes.",
    permissions: ["mobile.invoices"],
    icon: FileText,
  },
  {
    key: "training_enabled",
    title: "Training",
    description:
      "Training reviews, approvals, changes, expiry reminders and updates.",
    permissions: ["mobile.training"],
    icon: ShieldCheck,
  },
  {
    key: "prestarts_enabled",
    title: "Prestarts",
    description:
      "Vehicle, plant and site prestart alerts that apply to your access.",
    permissions: [
      "mobile.vehicle_prestarts",
      "mobile.plant_prestarts",
      "mobile.site_prestarts",
    ],
    icon: HardHat,
  },
  {
    key: "fleet_jobs_enabled",
    title: "Fleet Jobs",
    description:
      "New Fleet Jobs, updates, close-outs and Fleet reminders.",
    permissions: ["mobile.fleet_jobs"],
    icon: Truck,
  },
  {
    key: "daily_dockets_enabled",
    title: "Daily Dockets",
    description:
      "Daily Docket workflow, review and approval notifications.",
    permissions: ["mobile.daily_dockets"],
    icon: FileText,
  },
  {
    key: "defects_enabled",
    title: "Defects",
    description:
      "Defect assignments, status changes and close-out activity.",
    permissions: ["mobile.defects"],
    icon: AlertTriangle,
  },
  {
    key: "rectifications_enabled",
    title: "Rectifications",
    description:
      "Revision and rectification actions, updates and completion.",
    permissions: ["mobile.rectifications"],
    icon: RefreshCw,
  },
  {
    key: "deliveries_enabled",
    title: "Deliveries",
    description:
      "Delivery-related alerts and project delivery activity.",
    permissions: ["mobile.deliveries"],
    icon: Truck,
  },
  {
    key: "materials_enabled",
    title: "Materials",
    description:
      "Material, bundle and member-related alerts.",
    permissions: ["mobile.materials"],
    icon: HardHat,
  },
  {
    key: "projects_enabled",
    title: "Projects & Progress",
    description:
      "Project and tower-progress alerts available to your role.",
    permissions: [
      "mobile.projects",
      "mobile.tower_progress",
    ],
    icon: BriefcaseBusiness,
  },
  {
    key: "general_enabled",
    title: "General & System",
    description:
      "Important TTTracker account, system and uncategorised alerts.",
    icon: Bell,
  },
];

function preferenceValuesEqual(
  left: Preferences,
  right: Preferences,
) {
  return (
    left.notifications_enabled === right.notifications_enabled &&
    left.expenses_enabled === right.expenses_enabled &&
    left.invoices_enabled === right.invoices_enabled &&
    left.training_enabled === right.training_enabled &&
    left.prestarts_enabled === right.prestarts_enabled &&
    left.fleet_jobs_enabled === right.fleet_jobs_enabled &&
    left.daily_dockets_enabled === right.daily_dockets_enabled &&
    left.defects_enabled === right.defects_enabled &&
    left.rectifications_enabled === right.rectifications_enabled &&
    left.deliveries_enabled === right.deliveries_enabled &&
    left.materials_enabled === right.materials_enabled &&
    left.projects_enabled === right.projects_enabled &&
    left.general_enabled === right.general_enabled
  );
}

function normalisePreferences(
  value: Partial<Preferences> | null | undefined,
): Preferences {
  return {
    notifications_enabled:
      value?.notifications_enabled !== false,
    expenses_enabled: value?.expenses_enabled !== false,
    invoices_enabled: value?.invoices_enabled !== false,
    training_enabled: value?.training_enabled !== false,
    prestarts_enabled: value?.prestarts_enabled !== false,
    fleet_jobs_enabled:
      value?.fleet_jobs_enabled !== false,
    daily_dockets_enabled:
      value?.daily_dockets_enabled !== false,
    defects_enabled: value?.defects_enabled !== false,
    rectifications_enabled:
      value?.rectifications_enabled !== false,
    deliveries_enabled:
      value?.deliveries_enabled !== false,
    materials_enabled: value?.materials_enabled !== false,
    projects_enabled: value?.projects_enabled !== false,
    general_enabled: value?.general_enabled !== false,
  };
}

export default function NotificationSettingsScreen() {
  const { can, loading: accessLoading } = useAccess();

  const [userId, setUserId] = useState("");
  const [preferences, setPreferences] =
    useState<Preferences>(DEFAULT_PREFERENCES);
  const [savedPreferences, setSavedPreferences] =
    useState<Preferences>(DEFAULT_PREFERENCES);
  const [phonePermission, setPhonePermission] =
    useState<"granted" | "denied" | "undetermined">(
      "undetermined",
    );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] =
    useState(false);
  const [saving, setSaving] = useState(false);

  const hasChanges = useMemo(
    () =>
      !preferenceValuesEqual(
        preferences,
        savedPreferences,
      ),
    [preferences, savedPreferences],
  );

  const visibleRows = useMemo(
    () =>
      PREFERENCE_ROWS.filter((row) => {
        if (!row.permissions?.length) return true;

        // A grouped preference (e.g. Prestarts) is visible when the
        // current dynamic RBAC grants ANY of its related mobile modules.
        return row.permissions.some((permission) =>
          can(permission),
        );
      }),
    [can],
  );

  const enabledVisibleCount = useMemo(
    () =>
      visibleRows.filter(
        (row) =>
          preferences.notifications_enabled &&
          preferences[row.key],
      ).length,
    [preferences, visibleRows],
  );

  const loadPreferences = useCallback(async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) {
      throw new Error(
        "No signed-in TTTracker user was found.",
      );
    }

    setUserId(user.id);

    const [preferenceResult, permissionResult] =
      await Promise.all([
        supabase
          .from("user_notification_preferences")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        Notifications.getPermissionsAsync(),
      ]);

    if (preferenceResult.error) {
      throw new Error(
        `Could not load notification preferences: ${preferenceResult.error.message}`,
      );
    }

    const loaded = preferenceResult.data
      ? normalisePreferences(
          preferenceResult.data as Partial<Preferences>,
        )
      : DEFAULT_PREFERENCES;

    setPreferences(loaded);
    setSavedPreferences(loaded);

    setPhonePermission(
      permissionResult.granted
        ? "granted"
        : permissionResult.canAskAgain
          ? "undetermined"
          : "denied",
    );
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await loadPreferences();
      } catch (error) {
        Alert.alert(
          "Unable to load notification preferences",
          error instanceof Error
            ? error.message
            : "Please try again.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [loadPreferences]);

  async function refresh() {
    setRefreshing(true);

    try {
      await loadPreferences();
    } catch (error) {
      Alert.alert(
        "Unable to refresh",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  function setCategory(
    key: PreferenceKey,
    value: boolean,
  ) {
    setPreferences((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function enableVisibleCategories() {
    setPreferences((current) => {
      const next = {
        ...current,
        notifications_enabled: true,
      };

      for (const row of visibleRows) {
        next[row.key] = true;
      }

      return next;
    });
  }

  async function cancelLegacyFleetReminders(
    currentUserId: string,
  ) {
    const scheduled =
      await Notifications.getAllScheduledNotificationsAsync();

    const fleetReminderIds = scheduled
      .map((notification) => notification.identifier)
      .filter((identifier) =>
        identifier.startsWith(
          `fleet-job:${currentUserId}:`,
        ),
      );

    await Promise.all(
      fleetReminderIds.map((identifier) =>
        Notifications.cancelScheduledNotificationAsync(
          identifier,
        ),
      ),
    );
  }

  async function save() {
    if (!userId) {
      Alert.alert(
        "Unable to save",
        "The signed-in user could not be identified.",
      );
      return;
    }

    setSaving(true);

    try {
      const updatedAt = new Date().toISOString();

      const { error } = await supabase
        .from("user_notification_preferences")
        .upsert(
          {
            user_id: userId,
            ...preferences,
            updated_at: updatedAt,
          },
          {
            onConflict: "user_id",
          },
        );

      if (error) throw error;

      /*
       * Master OFF:
       * deactivate generic device tokens as an additional safety layer.
       *
       * Master ON:
       * register/reactivate this device. Category-level filtering happens
       * server-side, so one token can still receive enabled categories.
       */
      if (preferences.notifications_enabled) {
        const registration =
          await registerDevicePushToken();

        if (
          !registration.registered &&
          registration.reason ===
            "permission_not_granted"
        ) {
          setPhonePermission("denied");
        } else if (registration.registered) {
          setPhonePermission("granted");
        }
      } else {
        const { error: tokenError } = await supabase
          .from("user_push_tokens")
          .update({
            active: false,
            last_seen_at: updatedAt,
          })
          .eq("user_id", userId);

        if (tokenError) throw tokenError;
      }

      /*
       * Keep the older Fleet preference aligned while Fleet Jobs is being
       * migrated into the central preference system.
       */
      const fleetPhoneEnabled =
        preferences.notifications_enabled &&
        preferences.fleet_jobs_enabled;

      const { error: fleetPreferenceError } =
        await supabase
          .from("fleet_job_notification_preferences")
          .update({
            phone_enabled: fleetPhoneEnabled,
            updated_at: updatedAt,
          })
          .eq("user_id", userId);

      if (fleetPreferenceError) {
        console.warn(
          "Legacy Fleet notification preference could not be synchronised:",
          fleetPreferenceError.message,
        );
      }

      if (!fleetPhoneEnabled) {
        await cancelLegacyFleetReminders(userId);
      }

      setSavedPreferences(preferences);

      Alert.alert(
        "Notification preferences saved",
        preferences.notifications_enabled
          ? "TTTracker will only send app notifications for the categories you have enabled."
          : "TTTracker app notifications are turned off for your account.",
      );
    } catch (error) {
      Alert.alert(
        "Could not save notification preferences",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading || accessLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen
          options={{ title: "Notification Preferences" }}
        />
        <View style={styles.loadingScreen}>
          <ActivityIndicator
            size="large"
            color="#2563eb"
          />
          <Text style={styles.loadingText}>
            Loading notification preferences...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen
        options={{ title: "Notification Preferences" }}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
          />
        }
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            {preferences.notifications_enabled ? (
              <Bell
                size={27}
                color="#ffffff"
                strokeWidth={2.3}
              />
            ) : (
              <BellOff
                size={27}
                color="#ffffff"
                strokeWidth={2.3}
              />
            )}
          </View>

          <View style={styles.heroText}>
            <Text style={styles.eyebrow}>
              MY TTRACKER ALERTS
            </Text>
            <Text style={styles.heading}>
              Notification Preferences
            </Text>
            <Text style={styles.subtitle}>
              Choose which TTTracker app alerts you want
              to receive. Only modules available through
              your current role and permissions are shown.
            </Text>
          </View>
        </View>

        <View style={styles.masterCard}>
          <View style={styles.masterCopy}>
            <Text style={styles.masterTitle}>
              App notifications
            </Text>
            <Text style={styles.masterDescription}>
              Master control for your TTTracker
              Notification Centre and phone push alerts.
            </Text>
          </View>

          <Switch
            value={preferences.notifications_enabled}
            onValueChange={(value) =>
              setPreferences((current) => ({
                ...current,
                notifications_enabled: value,
              }))
            }
          />
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusIcon}>
            {phonePermission === "granted" ? (
              <CheckCircle2
                size={20}
                color="#15803d"
                strokeWidth={2.3}
              />
            ) : (
              <AlertTriangle
                size={20}
                color="#b45309"
                strokeWidth={2.3}
              />
            )}
          </View>

          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>
              Phone notification permission
            </Text>
            <Text style={styles.statusText}>
              {phonePermission === "granted"
                ? "This device currently allows TTTracker push notifications."
                : "Your phone is not currently allowing TTTracker push notifications. Your in-app preferences can still be saved."}
            </Text>
          </View>

          {phonePermission !== "granted" ? (
            <Pressable
              onPress={() =>
                void Linking.openSettings()
              }
              style={({ pressed }) => [
                styles.settingsButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.settingsButtonText}>
                Settings
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Notification categories
          </Text>
          <Text style={styles.sectionSubtitle}>
            {preferences.notifications_enabled
              ? `${enabledVisibleCount} of ${visibleRows.length} available categories enabled.`
              : "Categories are preserved, but the master notification switch is off."}
          </Text>
        </View>

        <View style={styles.preferenceCard}>
          {visibleRows.map((row, index) => {
            const Icon = row.icon;
            const enabled =
              preferences.notifications_enabled;
            const checked = preferences[row.key];

            return (
              <View key={row.key}>
                {index > 0 ? (
                  <View style={styles.divider} />
                ) : null}

                <View
                  style={[
                    styles.preferenceRow,
                    !enabled &&
                      styles.preferenceRowDisabled,
                  ]}
                >
                  <View style={styles.rowIcon}>
                    <Icon
                      size={20}
                      color={
                        enabled
                          ? "#334155"
                          : "#94a3b8"
                      }
                      strokeWidth={2.1}
                    />
                  </View>

                  <View style={styles.rowCopy}>
                    <Text
                      style={[
                        styles.rowTitle,
                        !enabled &&
                          styles.disabledText,
                      ]}
                    >
                      {row.title}
                    </Text>
                    <Text style={styles.rowDescription}>
                      {row.description}
                    </Text>
                  </View>

                  <Switch
                    value={checked}
                    disabled={!enabled}
                    onValueChange={(value) =>
                      setCategory(row.key, value)
                    }
                  />
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.roleNotice}>
          <ShieldCheck
            size={20}
            color="#2563eb"
            strokeWidth={2.2}
          />
          <View style={styles.roleNoticeCopy}>
            <Text style={styles.roleNoticeTitle}>
              Role-aware settings
            </Text>
            <Text style={styles.roleNoticeText}>
              These options come from your live TTTracker
              permissions. If Admin adds or removes access
              from your role, this page changes automatically
              without hard-coded role rules.
            </Text>
          </View>
        </View>

        <Pressable
          onPress={enableVisibleCategories}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.pressed,
          ]}
        >
          <RefreshCw
            size={18}
            color="#334155"
            strokeWidth={2.2}
          />
          <Text style={styles.secondaryButtonText}>
            Enable all available categories
          </Text>
        </Pressable>

        <Pressable
          disabled={!hasChanges || saving}
          onPress={() => void save()}
          style={({ pressed }) => [
            styles.saveButton,
            (!hasChanges || saving) &&
              styles.saveButtonDisabled,
            pressed &&
              hasChanges &&
              !saving &&
              styles.pressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator
              size="small"
              color="#ffffff"
            />
          ) : (
            <Save
              size={19}
              color="#ffffff"
              strokeWidth={2.3}
            />
          )}

          <Text style={styles.saveButtonText}>
            {saving
              ? "Saving..."
              : hasChanges
                ? "Save notification preferences"
                : "Notification preferences are up to date"}
          </Text>
        </Pressable>

        <Text style={styles.footerNote}>
          These switches control TTTracker app notifications.
          Workflow email settings remain separate.
        </Text>
      </ScrollView>
    </SafeAreaView>
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
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    backgroundColor: "#0f172a",
    padding: 18,
    marginBottom: 16,
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
  },
  heroText: {
    flex: 1,
    marginLeft: 14,
  },
  eyebrow: {
    color: "#93c5fd",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  heading: {
    color: "#ffffff",
    fontSize: 21,
    fontWeight: "900",
    marginTop: 3,
  },
  subtitle: {
    color: "#cbd5e1",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
  masterCard: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 19,
    backgroundColor: "#eff6ff",
    padding: 16,
    marginBottom: 12,
  },
  masterCopy: {
    flex: 1,
    paddingRight: 12,
  },
  masterTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },
  masterDescription: {
    color: "#475569",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 17,
    backgroundColor: "#ffffff",
    padding: 14,
    marginBottom: 22,
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  statusCopy: {
    flex: 1,
    marginLeft: 11,
    marginRight: 8,
  },
  statusTitle: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "900",
  },
  statusText: {
    color: "#64748b",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  settingsButton: {
    minHeight: 36,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 11,
    paddingHorizontal: 11,
    backgroundColor: "#ffffff",
  },
  settingsButtonText: {
    color: "#334155",
    fontSize: 10,
    fontWeight: "900",
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
  },
  sectionSubtitle: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
  },
  preferenceCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 19,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  preferenceRow: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  preferenceRowDisabled: {
    opacity: 0.58,
  },
  rowIcon: {
    width: 41,
    height: 41,
    borderRadius: 13,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: {
    flex: 1,
    marginHorizontal: 11,
  },
  rowTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },
  rowDescription: {
    color: "#64748b",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  disabledText: {
    color: "#64748b",
  },
  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
  },
  roleNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 17,
    backgroundColor: "#eff6ff",
    padding: 14,
    marginBottom: 14,
  },
  roleNoticeCopy: {
    flex: 1,
    marginLeft: 10,
  },
  roleNoticeTitle: {
    color: "#1e3a8a",
    fontSize: 12,
    fontWeight: "900",
  },
  roleNoticeText: {
    color: "#475569",
    fontSize: 10,
    lineHeight: 16,
    marginTop: 3,
  },
  secondaryButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    marginBottom: 10,
  },
  secondaryButtonText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900",
  },
  saveButton: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 15,
    backgroundColor: "#2563eb",
  },
  saveButtonDisabled: {
    backgroundColor: "#94a3b8",
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  footerNote: {
    color: "#94a3b8",
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 13,
  },
  pressed: {
    opacity: 0.72,
  },
});

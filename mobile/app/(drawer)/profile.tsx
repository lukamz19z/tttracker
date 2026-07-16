import {
  Redirect,
  router,
  type Href,
} from "expo-router";
import Constants from "expo-constants";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
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
import {
  Bell,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  FileBadge,
  HardHat,
  LogOut,
  Mail,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react-native";

import {
  type MobileRole,
  useAuth,
} from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

type SelectOption = {
  label: string;
  value: string;
};

type EmployeeProfileRow = {
  id: string;
  user_id: string | null;
  full_name: string;
  role: string | null;
  crew_id: string | null;
  active: boolean | null;
  shirt_size: string | null;
  jacket_size: string | null;
  glove_size: string | null;
  pants_size: string | null;
};

type WorkwearPreferences = {
  preferredName: string;
  gloveSize: string;
  shirtSize: string;
  jacketSize: string;
  pantsSize: string;
};

type ProfileMetadata = {
  preferred_name?: unknown;
  full_name?: unknown;
};

const GLOVE_OPTIONS: SelectOption[] = [
  { label: "Not set", value: "" },
  { label: "S", value: "S" },
  { label: "M", value: "M" },
  { label: "L", value: "L" },
  { label: "XL", value: "XL" },
  { label: "2XL", value: "2XL" },
];

const CLOTHING_OPTIONS: SelectOption[] = [
  { label: "Not set", value: "" },
  { label: "XS", value: "XS" },
  { label: "S", value: "S" },
  { label: "M", value: "M" },
  { label: "L", value: "L" },
  { label: "XL", value: "XL" },
  { label: "2XL", value: "2XL" },
  { label: "3XL", value: "3XL" },
  { label: "4XL", value: "4XL" },
  { label: "5XL", value: "5XL" },
];

const EMPTY_PREFERENCES: WorkwearPreferences = {
  preferredName: "",
  gloveSize: "",
  shirtSize: "",
  jacketSize: "",
  pantsSize: "",
};

function safeString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function nullableTrimmed(value: string) {
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
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

function formatCrew(
  crewNumber: string | null | undefined,
  crewName: string | null | undefined,
) {
  if (crewNumber && crewName) {
    return `Crew ${crewNumber} — ${crewName}`;
  }

  if (crewNumber) return `Crew ${crewNumber}`;
  if (crewName) return crewName;

  return "No crew allocated";
}

function formatProject(
  projectNumber: string | null | undefined,
  projectName: string | null | undefined,
) {
  if (projectNumber && projectName) {
    return `${projectNumber} — ${projectName}`;
  }

  return projectNumber ?? projectName ?? "No project allocated";
}

function initialsFromName(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "TT";

  return parts
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function hasPreferenceChanges(
  current: WorkwearPreferences,
  saved: WorkwearPreferences,
) {
  return (
    current.preferredName.trim() !== saved.preferredName.trim() ||
    current.gloveSize !== saved.gloveSize ||
    current.shirtSize !== saved.shirtSize ||
    current.jacketSize !== saved.jacketSize ||
    current.pantsSize.trim() !== saved.pantsSize.trim()
  );
}

export default function ProfileScreen() {
  const {
    session,
    loading,
    profile,
    profileLoading,
    profileError,
    refreshProfile,
    signOut,
  } = useAuth();

  const [employee, setEmployee] = useState<EmployeeProfileRow | null>(null);
  const [preferences, setPreferences] =
    useState<WorkwearPreferences>(EMPTY_PREFERENCES);
  const [savedPreferences, setSavedPreferences] =
    useState<WorkwearPreferences>(EMPTY_PREFERENCES);
  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [employeeLinkError, setEmployeeLinkError] = useState<string | null>(
    null,
  );

  const user = session?.user ?? null;
  const role = profile?.mobileRole ?? "crew";

  const fullName =
    employee?.full_name ||
    profile?.fullName ||
    safeString(user?.user_metadata?.full_name) ||
    user?.email?.split("@")[0] ||
    "TTTracker User";

  const displayName = preferences.preferredName.trim() || fullName;
  const initials = initialsFromName(displayName);

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const buildNumber =
    Platform.OS === "ios"
      ? Constants.expoConfig?.ios?.buildNumber
      : Constants.expoConfig?.android?.versionCode;

  const hasChanges = useMemo(
    () => hasPreferenceChanges(preferences, savedPreferences),
    [preferences, savedPreferences],
  );

  const workwearCompleteCount = useMemo(
    () =>
      [
        preferences.gloveSize,
        preferences.shirtSize,
        preferences.jacketSize,
        preferences.pantsSize.trim(),
      ].filter(Boolean).length,
    [preferences],
  );

  const loadProfilePreferences = useCallback(async () => {
    setPageLoading(true);
    setEmployeeLinkError(null);

    try {
      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!currentUser) throw new Error("No signed-in user was found.");

      const { data: employeeData, error: employeeError } = await supabase
        .from("employees")
        .select(
          "id, user_id, full_name, role, crew_id, active, shirt_size, jacket_size, glove_size, pants_size",
        )
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (employeeError) throw employeeError;

      const metadata =
        (currentUser.user_metadata ?? {}) as ProfileMetadata;

      const loaded: WorkwearPreferences = {
        preferredName: safeString(metadata.preferred_name),
        gloveSize: safeString(employeeData?.glove_size),
        shirtSize: safeString(employeeData?.shirt_size),
        jacketSize: safeString(employeeData?.jacket_size),
        pantsSize: safeString(employeeData?.pants_size),
      };

      setEmployee((employeeData ?? null) as EmployeeProfileRow | null);
      setPreferences(loaded);
      setSavedPreferences(loaded);

      if (!employeeData) {
        setEmployeeLinkError(
          "Your account is not linked to an employee profile. An administrator must link your user account before workwear sizes can be updated.",
        );
      }
    } catch (error) {
      Alert.alert(
        "Unable to load profile",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfilePreferences();
  }, [loadProfilePreferences]);

  async function refreshAll() {
    setRefreshing(true);

    try {
      await Promise.all([
        refreshProfile(),
        loadProfilePreferences(),
      ]);
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

  async function savePreferences() {
    if (!user) return;

    const preferredName = preferences.preferredName.trim();

    if (preferredName.length > 50) {
      Alert.alert(
        "Preferred name is too long",
        "Please keep it under 50 characters.",
      );
      return;
    }

    if (!employee) {
      Alert.alert(
        "Employee profile not linked",
        "Ask an administrator to link your TTTracker account to your employee profile.",
      );
      return;
    }

    setSaving(true);

    try {
      const { error: employeeError } = await supabase
        .from("employees")
        .update({
          glove_size: nullableTrimmed(preferences.gloveSize),
          shirt_size: nullableTrimmed(preferences.shirtSize),
          jacket_size: nullableTrimmed(preferences.jacketSize),
          pants_size: nullableTrimmed(preferences.pantsSize),
        })
        .eq("id", employee.id)
        .eq("user_id", user.id);

      if (employeeError) throw employeeError;

      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          preferred_name: preferredName,
        },
      });

      if (metadataError) throw metadataError;

      const updated: WorkwearPreferences = {
        ...preferences,
        preferredName,
        pantsSize: preferences.pantsSize.trim(),
      };

      setPreferences(updated);
      setSavedPreferences(updated);
      setEmployee((current) =>
        current
          ? {
              ...current,
              glove_size: nullableTrimmed(updated.gloveSize),
              shirt_size: nullableTrimmed(updated.shirtSize),
              jacket_size: nullableTrimmed(updated.jacketSize),
              pants_size: nullableTrimmed(updated.pantsSize),
            }
          : current,
      );

      await refreshProfile();

      Alert.alert(
        "Profile updated",
        "Your workwear sizes have been saved to the same employee record used by the TTTracker website.",
      );
    } catch (error) {
      Alert.alert(
        "Unable to save profile",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleSignOut() {
    Alert.alert(
      "Sign out?",
      "You will need to sign in again to access TTTracker.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => void performSignOut(),
        },
      ],
    );
  }

  async function performSignOut() {
    try {
      await signOut();
    } catch (error) {
      Alert.alert(
        "Unable to sign out",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    }
  }

  if (!loading && !session) {
    return <Redirect href="/login" />;
  }

  if (loading || profileLoading || pageLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color="#0f172a" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refreshAll()}
            />
          }
        >
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>TTTRACKER ACCOUNT</Text>
              <Text style={styles.heading}>My Profile</Text>
              <Text style={styles.subtitle}>
                View your current work allocation and manage approved profile
                preferences.
              </Text>
            </View>

            <Pressable
              onPress={() => void refreshAll()}
              style={({ pressed }) => [
                styles.refreshButton,
                pressed && styles.pressed,
              ]}
            >
              <RefreshCw size={20} color="#0f172a" strokeWidth={2.2} />
            </Pressable>
          </View>

          {profileError ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>
                Profile information unavailable
              </Text>
              <Text style={styles.errorMessage}>{profileError}</Text>
            </View>
          ) : null}

          {employeeLinkError ? (
            <View style={styles.warningCard}>
              <Text style={styles.warningTitle}>
                Employee profile not linked
              </Text>
              <Text style={styles.warningMessage}>{employeeLinkError}</Text>
            </View>
          ) : null}

          <View style={styles.identityCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>

            <View style={styles.identityContent}>
              <Text style={styles.identityName}>{displayName}</Text>
              <Text style={styles.identityRole}>
                {formatRole(role)}
                {(employee?.role ?? profile?.employeeRole)
                  ? ` · ${employee?.role ?? profile?.employeeRole}`
                  : ""}
              </Text>

              <View style={styles.identityStatusRow}>
                <View
                  style={[
                    styles.activeDot,
                    employee?.active === false && styles.inactiveDot,
                  ]}
                />
                <Text style={styles.identityStatus}>
                  {employee?.active === false
                    ? "Inactive employee profile"
                    : "Active TTTracker account"}
                </Text>
              </View>
            </View>
          </View>

          <SectionHeader
            title="Work allocation"
            subtitle="Read-only information managed by the business."
          />

          <View style={styles.infoCard}>
            <InfoRow
              icon={BriefcaseBusiness}
              label="Current project"
              value={formatProject(
                profile?.projectNumber,
                profile?.projectName,
              )}
            />
            <InfoDivider />
            <InfoRow
              icon={HardHat}
              label="Current crew"
              value={formatCrew(
                profile?.crewNumber,
                profile?.crewName,
              )}
            />
            <InfoDivider />
            <InfoRow
              icon={UserRound}
              label="App access"
              value={formatRole(role)}
            />
            <InfoDivider />
            <InfoRow
              icon={Mail}
              label="Account email"
              value={user?.email ?? "Not available"}
            />
          </View>

          <SectionHeader
            title="Personal display"
            subtitle="Your official employee name remains controlled by the business."
          />

          <View style={styles.formCard}>
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>Preferred name</Text>
              <Pencil size={15} color="#64748b" strokeWidth={2.1} />
            </View>

            <TextInput
              value={preferences.preferredName}
              onChangeText={(value) =>
                setPreferences((current) => ({
                  ...current,
                  preferredName: value,
                }))
              }
              placeholder={fullName}
              placeholderTextColor="#94a3b8"
              maxLength={50}
              style={styles.textInput}
              autoCapitalize="words"
            />

            <Text style={styles.fieldHelp}>
              This changes how your name appears in the mobile profile. Your
              official employee name remains unchanged.
            </Text>
          </View>

          <SectionHeader
            title="Workwear sizing"
            subtitle={`${workwearCompleteCount} of 4 sizes completed. These values are shared with the website employee register.`}
          />

          <View style={styles.formCard}>
            <SelectField
              label="Glove size"
              value={preferences.gloveSize}
              options={GLOVE_OPTIONS}
              disabled={!employee}
              onChange={(value) =>
                setPreferences((current) => ({
                  ...current,
                  gloveSize: value,
                }))
              }
            />
            <FieldDivider />
            <SelectField
              label="Shirt size"
              value={preferences.shirtSize}
              options={CLOTHING_OPTIONS}
              disabled={!employee}
              onChange={(value) =>
                setPreferences((current) => ({
                  ...current,
                  shirtSize: value,
                }))
              }
            />
            <FieldDivider />
            <SelectField
              label="Jacket size"
              value={preferences.jacketSize}
              options={CLOTHING_OPTIONS}
              disabled={!employee}
              onChange={(value) =>
                setPreferences((current) => ({
                  ...current,
                  jacketSize: value,
                }))
              }
            />
            <FieldDivider />

            <View style={styles.pantsField}>
              <Text style={styles.selectLabel}>Pants size</Text>
              <TextInput
                value={preferences.pantsSize}
                editable={Boolean(employee)}
                onChangeText={(value) =>
                  setPreferences((current) => ({
                    ...current,
                    pantsSize: value,
                  }))
                }
                placeholder="e.g. 87R, 92, 97L"
                placeholderTextColor="#94a3b8"
                maxLength={20}
                autoCapitalize="characters"
                style={[
                  styles.pantsInput,
                  !employee && styles.disabledInput,
                ]}
              />
              <Text style={styles.fieldHelp}>
                Enter the same pants-size format used by your workwear
                supplier.
              </Text>
            </View>
          </View>

          <Pressable
            disabled={!employee || !hasChanges || saving}
            onPress={() => void savePreferences()}
            style={({ pressed }) => [
              styles.saveButton,
              (!employee || !hasChanges || saving) &&
                styles.saveButtonDisabled,
              pressed &&
                employee &&
                hasChanges &&
                !saving &&
                styles.pressed,
            ]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Save size={19} color="#ffffff" strokeWidth={2.3} />
            )}
            <Text style={styles.saveButtonText}>
              {saving
                ? "Saving..."
                : !employee
                  ? "Employee profile not linked"
                  : hasChanges
                    ? "Save profile changes"
                    : "Profile is up to date"}
            </Text>
          </Pressable>

          <SectionHeader
            title="Certificates and competency"
            subtitle="This area is ready for the future training module."
          />

          <View style={styles.comingSoonCard}>
            <View style={styles.comingSoonIcon}>
              <FileBadge size={26} color="#6d28d9" strokeWidth={2.2} />
            </View>

            <View style={styles.comingSoonContent}>
              <View style={styles.comingSoonTopRow}>
                <Text style={styles.comingSoonTitle}>My Certificates</Text>
                <View style={styles.comingSoonBadge}>
                  <Text style={styles.comingSoonBadgeText}>COMING SOON</Text>
                </View>
              </View>

              <Text style={styles.comingSoonText}>
                Licences, VOCs, competencies and expiry reminders will appear
                here from the same live records used by the website.
              </Text>
            </View>
          </View>

          <SectionHeader
            title="Account options"
            subtitle="Manage notifications and review app information."
          />

          <View style={styles.optionCard}>
            <ProfileOption
              icon={Bell}
              title="Notification preferences"
              description="Choose how optional alerts are delivered."
              onPress={() =>
                router.push("/notifications-settings" as Href)
              }
            />
            <InfoDivider />
            <ProfileOption
              icon={ShieldCheck}
              title="Privacy and data"
              description="TTTracker stores work information and approved non-sensitive preferences."
              onPress={() =>
                Alert.alert(
                  "Privacy and data",
                  "This page reads your linked employee record for workwear sizing. Official role, crew and project details remain controlled by authorised administrators.",
                )
              }
            />
          </View>

          <View style={styles.appInfoCard}>
            <View style={styles.appInfoIcon}>
              <CircleUserRound
                size={23}
                color="#334155"
                strokeWidth={2.1}
              />
            </View>

            <View style={styles.appInfoContent}>
              <Text style={styles.appInfoTitle}>TTTracker Mobile</Text>
              <Text style={styles.appInfoText}>
                Version {appVersion}
                {buildNumber ? ` · Build ${buildNumber}` : ""}
              </Text>
              <Text style={styles.appInfoText}>
                BC Contracting Australia
              </Text>
            </View>
          </View>

          <Pressable
            onPress={handleSignOut}
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && styles.pressed,
            ]}
          >
            <LogOut size={19} color="#b91c1c" strokeWidth={2.2} />
            <Text style={styles.signOutButtonText}>Sign out</Text>
          </Pressable>

          <Text style={styles.footerNote}>
            Project, crew, official name and role changes are managed by an
            administrator.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{
    size?: number;
    color?: string;
    strokeWidth?: number;
  }>;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Icon size={19} color="#334155" strokeWidth={2.1} />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function InfoDivider() {
  return <View style={styles.infoDivider} />;
}

function FieldDivider() {
  return <View style={styles.fieldDivider} />;
}

function ProfileOption({
  icon: Icon,
  title,
  description,
  onPress,
}: {
  icon: React.ComponentType<{
    size?: number;
    color?: string;
    strokeWidth?: number;
  }>;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.profileOption,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.optionIcon}>
        <Icon size={20} color="#334155" strokeWidth={2.1} />
      </View>
      <View style={styles.optionContent}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDescription}>{description}</Text>
      </View>
      <ChevronRight size={19} color="#94a3b8" strokeWidth={2.2} />
    </Pressable>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  const selectedLabel =
    options.find((option) => option.value === value)?.label ??
    (value || "Not set");

  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.selectField,
          disabled && styles.disabledField,
          pressed && !disabled && styles.pressed,
        ]}
      >
        <View>
          <Text style={styles.selectLabel}>{label}</Text>
          <Text
            style={[
              styles.selectValue,
              !value && styles.selectPlaceholder,
              disabled && styles.disabledText,
            ]}
          >
            {selectedLabel}
          </Text>
        </View>
        <ChevronDown
          size={20}
          color={disabled ? "#cbd5e1" : "#64748b"}
          strokeWidth={2.2}
        />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.selectSheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.selectSheetHeader}>
              <View>
                <Text style={styles.selectSheetTitle}>{label}</Text>
                <Text style={styles.selectSheetSubtitle}>
                  Select your recorded size.
                </Text>
              </View>

              <Pressable
                onPress={() => setVisible(false)}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.pressed,
                ]}
              >
                <X size={20} color="#475569" strokeWidth={2.2} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.selectOptions}
            >
              {options.map((option) => {
                const selected = option.value === value;

                return (
                  <Pressable
                    key={option.value || `${label}-not-set`}
                    onPress={() => {
                      onChange(option.value);
                      setVisible(false);
                    }}
                    style={({ pressed }) => [
                      styles.selectOption,
                      selected && styles.selectOptionActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.selectOptionText,
                        selected && styles.selectOptionTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {selected ? (
                      <Check size={19} color="#2563eb" strokeWidth={2.4} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f8fafc" },
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: { color: "#64748b", fontSize: 14, marginTop: 12 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerText: { flex: 1, paddingRight: 12 },
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
  refreshButton: {
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
  errorTitle: { color: "#991b1b", fontSize: 14, fontWeight: "900" },
  errorMessage: {
    color: "#b91c1c",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  warningCard: {
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 18,
    backgroundColor: "#fffbeb",
    padding: 16,
    marginBottom: 16,
  },
  warningTitle: { color: "#92400e", fontSize: 14, fontWeight: "900" },
  warningMessage: {
    color: "#a16207",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  identityCard: {
    borderRadius: 22,
    backgroundColor: "#0f172a",
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    marginBottom: 22,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#ffffff", fontSize: 23, fontWeight: "900" },
  identityContent: { flex: 1, marginLeft: 15 },
  identityName: { color: "#ffffff", fontSize: 20, fontWeight: "900" },
  identityRole: {
    color: "#93c5fd",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  identityStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 9,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22c55e",
    marginRight: 7,
  },
  inactiveDot: { backgroundColor: "#f59e0b" },
  identityStatus: { color: "#cbd5e1", fontSize: 10, fontWeight: "700" },
  sectionHeader: { marginTop: 4, marginBottom: 11 },
  sectionTitle: { color: "#0f172a", fontSize: 19, fontWeight: "900" },
  sectionSubtitle: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  infoCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 19,
    backgroundColor: "#ffffff",
    paddingHorizontal: 15,
    marginBottom: 22,
  },
  infoRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  infoContent: { flex: 1, marginLeft: 12 },
  infoLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  infoValue: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 3,
  },
  infoDivider: { height: 1, backgroundColor: "#e2e8f0" },
  formCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 19,
    backgroundColor: "#ffffff",
    padding: 15,
    marginBottom: 14,
  },
  fieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldLabel: { color: "#334155", fontSize: 12, fontWeight: "900" },
  textInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 13,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700",
    paddingHorizontal: 13,
    marginTop: 9,
  },
  fieldHelp: {
    color: "#64748b",
    fontSize: 10,
    lineHeight: 16,
    marginTop: 8,
  },
  fieldDivider: { height: 1, backgroundColor: "#e2e8f0" },
  selectField: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  selectLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  selectValue: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4,
  },
  selectPlaceholder: { color: "#94a3b8", fontWeight: "700" },
  disabledField: { opacity: 0.55 },
  disabledText: { color: "#94a3b8" },
  pantsField: { paddingVertical: 12 },
  pantsInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 13,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800",
    paddingHorizontal: 13,
    marginTop: 8,
  },
  disabledInput: {
    backgroundColor: "#f8fafc",
    color: "#94a3b8",
  },
  saveButton: {
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: "#2563eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginBottom: 23,
  },
  saveButtonDisabled: { backgroundColor: "#94a3b8" },
  saveButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  comingSoonCard: {
    borderWidth: 1,
    borderColor: "#ddd6fe",
    borderRadius: 19,
    backgroundColor: "#f5f3ff",
    flexDirection: "row",
    padding: 16,
    marginBottom: 22,
  },
  comingSoonIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#ede9fe",
    alignItems: "center",
    justifyContent: "center",
  },
  comingSoonContent: { flex: 1, marginLeft: 12 },
  comingSoonTopRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  comingSoonTitle: { color: "#4c1d95", fontSize: 15, fontWeight: "900" },
  comingSoonBadge: {
    borderRadius: 8,
    backgroundColor: "#7c3aed",
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  comingSoonBadgeText: {
    color: "#ffffff",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  comingSoonText: {
    color: "#6d28d9",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 7,
  },
  optionCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 19,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  profileOption: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  optionIcon: {
    width: 41,
    height: 41,
    borderRadius: 13,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  optionContent: { flex: 1, marginHorizontal: 11 },
  optionTitle: { color: "#0f172a", fontSize: 13, fontWeight: "900" },
  optionDescription: {
    color: "#64748b",
    fontSize: 10,
    lineHeight: 16,
    marginTop: 3,
  },
  appInfoCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 17,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    marginBottom: 14,
  },
  appInfoIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  appInfoContent: { flex: 1, marginLeft: 12 },
  appInfoTitle: { color: "#0f172a", fontSize: 13, fontWeight: "900" },
  appInfoText: { color: "#64748b", fontSize: 10, marginTop: 3 },
  signOutButton: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 15,
    backgroundColor: "#fef2f2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  signOutButtonText: { color: "#b91c1c", fontSize: 13, fontWeight: "900" },
  footerNote: {
    color: "#94a3b8",
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    justifyContent: "flex-end",
  },
  selectSheet: {
    maxHeight: "75%",
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
  selectSheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  selectSheetTitle: { color: "#0f172a", fontSize: 19, fontWeight: "900" },
  selectSheetSubtitle: { color: "#64748b", fontSize: 11, marginTop: 4 },
  closeButton: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  selectOptions: { padding: 15, paddingBottom: 34 },
  selectOption: {
    minHeight: 52,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 13,
  },
  selectOptionActive: { backgroundColor: "#eff6ff" },
  selectOptionText: { color: "#334155", fontSize: 13, fontWeight: "800" },
  selectOptionTextActive: { color: "#1d4ed8", fontWeight: "900" },
  pressed: { opacity: 0.72 },
});

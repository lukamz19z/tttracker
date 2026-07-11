import { Redirect, type Href } from "expo-router";
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
  type MobileRole,
  useAuth,
} from "@/contexts/AuthContext";

function formatMobileRole(role: MobileRole): string {
  switch (role) {
    case "leading_hand":
      return "Leading Hand";

    case "mechanic":
      return "Mechanic";

    case "admin":
      return "Administrator";

    default:
      return "Crew Member";
  }
}

function getCrewDisplay(
  crewNumber: string | null,
  crewName: string | null,
): string {
  if (crewNumber && crewName) {
    return `Crew ${crewNumber} — ${crewName}`;
  }

  if (crewNumber) {
    return `Crew ${crewNumber}`;
  }

  if (crewName) {
    return crewName;
  }

  return "No crew allocated";
}

export default function HomeScreen() {
  const {
    session,
    loading,
    profile,
    profileLoading,
    profileError,
    signOut,
    refreshProfile,
  } = useAuth();

  if (!loading && !session) {
    return <Redirect href={"/login" as Href} />;
  }

  async function handleSignOut() {
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

  if (loading || profileLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>
            Loading your TTTracker profile...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const fullName =
    profile?.fullName ??
    session?.user.email?.split("@")[0] ??
    "User";

  const projectDisplay = profile?.projectName
    ? profile.projectNumber
      ? `${profile.projectNumber} — ${profile.projectName}`
      : profile.projectName
    : "No project allocated";

  const crewDisplay = getCrewDisplay(
    profile?.crewNumber ?? null,
    profile?.crewName ?? null,
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={profileLoading}
            onRefresh={() => void refreshProfile()}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>
              TTTRACKER MOBILE
            </Text>

            <Text style={styles.heading}>
              Welcome, {fullName}
            </Text>

            <Text style={styles.roleText}>
              {profile
                ? formatMobileRole(profile.mobileRole)
                : "No mobile role"}
            </Text>
          </View>

          <Pressable
            onPress={() => void handleSignOut()}
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.signOutText}>
              Sign out
            </Text>
          </Pressable>
        </View>

        {profileError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>
              Profile could not be loaded
            </Text>

            <Text style={styles.errorText}>
              {profileError}
            </Text>

            <Pressable
              onPress={() => void refreshProfile()}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>
                Try again
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.allocationCard}>
          <Text style={styles.allocationEyebrow}>
            CURRENT ALLOCATION
          </Text>

          <View style={styles.allocationSection}>
            <Text style={styles.allocationLabel}>
              Project
            </Text>

            <Text style={styles.allocationValue}>
              {projectDisplay}
            </Text>

            {profile?.projectStatus ? (
              <Text style={styles.allocationMeta}>
                Status: {profile.projectStatus}
              </Text>
            ) : null}
          </View>

          <View style={styles.divider} />

          <View style={styles.allocationSection}>
            <Text style={styles.allocationLabel}>
              Crew
            </Text>

            <Text style={styles.allocationValue}>
              {crewDisplay}
            </Text>

            {profile?.employeeRole ? (
              <Text style={styles.allocationMeta}>
                Position: {profile.employeeRole}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.noticeCard}>
          <Text style={styles.noticeEyebrow}>
            PROJECT NOTICE
          </Text>

          <Text style={styles.noticeTitle}>
            No current notices
          </Text>

          <Text style={styles.noticeText}>
            Project notices and important field updates
            will appear here.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>
          Quick actions
        </Text>

        <View style={styles.actions}>
          <Pressable style={styles.actionCard}>
            <Text style={styles.actionTitle}>
              Search Materials
            </Text>

            <Text style={styles.actionDescription}>
              Search bundles, members, part numbers and
              bolts.
            </Text>
          </Pressable>

          <Pressable style={styles.actionCard}>
            <Text style={styles.actionTitle}>
              Vehicle Prestart
            </Text>

            <Text style={styles.actionDescription}>
              Complete a vehicle inspection and report
              faults.
            </Text>
          </Pressable>

          <Pressable style={styles.actionCard}>
            <Text style={styles.actionTitle}>
              Truck Delivery
            </Text>

            <Text style={styles.actionDescription}>
              Record deliveries, bundles and received
              quantities.
            </Text>
          </Pressable>

          <Pressable style={styles.actionCard}>
            <Text style={styles.actionTitle}>
              Project Progress
            </Text>

            <Text style={styles.actionDescription}>
              View completion percentages and MH/T
              performance.
            </Text>
          </Pressable>

          {profile?.mobileRole === "leading_hand" ||
          profile?.mobileRole === "admin" ? (
            <>
              <Pressable style={styles.actionCard}>
                <Text style={styles.actionTitle}>
                  Update Tower Progress
                </Text>

                <Text style={styles.actionDescription}>
                  Record assembly and erection progress.
                </Text>
              </Pressable>

              <Pressable style={styles.actionCard}>
                <Text style={styles.actionTitle}>
                  Create Daily Docket
                </Text>

                <Text style={styles.actionDescription}>
                  Record personnel, plant, delays and
                  project progress.
                </Text>
              </Pressable>
            </>
          ) : null}

          {profile?.mobileRole === "mechanic" ||
          profile?.mobileRole === "admin" ? (
            <>
              <Pressable style={styles.actionCard}>
                <Text style={styles.actionTitle}>
                  All Assets
                </Text>

                <Text style={styles.actionDescription}>
                  View vehicles, cranes, telehandlers and
                  maintenance information.
                </Text>
              </Pressable>

              <Pressable style={styles.actionCard}>
                <Text style={styles.actionTitle}>
                  Fleet Jobs
                </Text>

                <Text style={styles.actionDescription}>
                  View and update active maintenance jobs.
                </Text>
              </Pressable>
            </>
          ) : null}
        </View>
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
    paddingBottom: 50,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    color: "#64748b",
    fontSize: 14,
    marginTop: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 22,
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  heading: {
    color: "#0f172a",
    fontSize: 27,
    fontWeight: "900",
    marginTop: 5,
  },
  roleText: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 5,
  },
  signOutButton: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  signOutText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.75,
  },
  errorCard: {
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 18,
    backgroundColor: "#fef2f2",
    padding: 18,
    marginBottom: 18,
  },
  errorTitle: {
    color: "#991b1b",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: "flex-start",
    borderRadius: 10,
    backgroundColor: "#991b1b",
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 12,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  allocationCard: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 22,
    backgroundColor: "#eff6ff",
    padding: 19,
    marginBottom: 18,
  },
  allocationEyebrow: {
    color: "#2563eb",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 14,
  },
  allocationSection: {
    paddingVertical: 5,
  },
  allocationLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  allocationValue: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900",
  },
  allocationMeta: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#bfdbfe",
    marginVertical: 14,
  },
  noticeCard: {
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 20,
    backgroundColor: "#fffbeb",
    padding: 18,
    marginBottom: 25,
  },
  noticeEyebrow: {
    color: "#b45309",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 7,
  },
  noticeTitle: {
    color: "#92400e",
    fontSize: 16,
    fontWeight: "800",
  },
  noticeText: {
    color: "#a16207",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 13,
  },
  actions: {
    gap: 12,
  },
  actionCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    backgroundColor: "#ffffff",
    padding: 18,
  },
  actionTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 5,
  },
  actionDescription: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 20,
  },
});
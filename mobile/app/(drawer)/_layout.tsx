import {
  DrawerContentScrollView,
  DrawerItem,
  type DrawerContentComponentProps,
} from "@react-navigation/drawer";
import { useRouter, type Href } from "expo-router";
import { Drawer } from "expo-router/drawer";
import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
} from "react";
import {
  Bell,
  Boxes,
  ClipboardCheck,
  FileText,
  Gauge,
  HardHat,
  Home,
  LogOut,
  PackageSearch,
  Truck,
  UserCircle,
  Wrench,
} from "lucide-react-native";
import {
  Alert,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  type MobileRole,
  useAuth,
} from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

type DrawerIcon = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

type DrawerItemDefinition = {
  label: string;
  screen: string;
  icon: DrawerIcon;
  roles: MobileRole[];
  notificationItem?: boolean;
};

type DrawerSectionDefinition = {
  title: string;
  items: DrawerItemDefinition[];
};

const ALL_ROLES: MobileRole[] = [
  "crew",
  "leading_hand",
  "mechanic",
  "admin",
];

const DRAWER_SECTIONS: DrawerSectionDefinition[] = [
  {
    title: "OVERVIEW",
    items: [
      {
        label: "Home",
        screen: "index",
        icon: Home,
        roles: ALL_ROLES,
      },
      {
        label: "Notifications",
        screen: "notifications",
        icon: Bell,
        roles: ALL_ROLES,
        notificationItem: true,
      },
      {
        label: "Project Progress",
        screen: "project-progress",
        icon: Gauge,
        roles: ["leading_hand", "admin"],
      },
    ],
  },
  {
    title: "FIELD OPERATIONS",
    items: [
      {
        label: "Search Materials",
        screen: "materials",
        icon: PackageSearch,
        roles: ["crew", "leading_hand", "admin"],
      },
      {
        label: "Vehicle Prestart",
        screen: "vehicle-prestart",
        icon: ClipboardCheck,
        roles: ALL_ROLES,
      },
      {
        label: "Truck Delivery",
        screen: "truck-delivery",
        icon: Truck,
        roles: ["crew", "leading_hand", "admin"],
      },
    ],
  },
  {
    title: "TOWER OPERATIONS",
    items: [
      {
        label: "Tower Progress",
        screen: "tower-progress",
        icon: HardHat,
        roles: ["leading_hand", "admin"],
      },
      {
        label: "Daily Dockets",
        screen: "daily-dockets",
        icon: FileText,
        roles: ["leading_hand", "admin"],
      },
    ],
  },
  {
    title: "ASSETS",
    items: [
      {
        label: "All Assets",
        screen: "assets",
        icon: Boxes,
        roles: ["mechanic", "admin"],
      },
      {
        label: "Fleet Jobs",
        screen: "fleet-jobs",
        icon: Wrench,
        roles: ["mechanic", "admin"],
      },
    ],
  },
  {
    title: "ACCOUNT",
    items: [
      {
        label: "My Profile",
        screen: "profile",
        icon: UserCircle,
        roles: ALL_ROLES,
      },
    ],
  },
];

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

function formatUnreadCount(count: number) {
  return count > 99 ? "99+" : String(count);
}

function useUnreadNotificationCount(channelScope: string) {
  const [count, setCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setCount(0);
      return;
    }

    const { count: unreadCount, error } = await supabase
      .from("user_notifications")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("user_id", user.id)
      .is("read_at", null)
      .is("archived_at", null);

    if (error) {
      console.warn(
        "Unable to load unread notification count:",
        error.message,
      );
      return;
    }

    setCount(unreadCount ?? 0);
  }, []);

  useEffect(() => {
    let mounted = true;
    let channel:
      | ReturnType<typeof supabase.channel>
      | null = null;

    async function subscribe() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      await loadUnreadCount();

      if (!user) return;

      channel = supabase
        .channel(`layout-notifications-${channelScope}-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            void loadUnreadCount();
          },
        )
        .subscribe();
    }

    void subscribe();

    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") {
          void loadUnreadCount();
        }
      },
    );

    return () => {
      mounted = false;
      appStateSubscription.remove();

      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [channelScope, loadUnreadCount]);

  return {
    unreadCount: count,
    refreshUnreadCount: loadUnreadCount,
  };
}

function NotificationHeaderButton() {
  const router = useRouter();
  const { unreadCount } = useUnreadNotificationCount("header");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        unreadCount > 0
          ? `${unreadCount} unread notifications`
          : "Open notifications"
      }
      onPress={() => router.push("/notifications" as Href)}
      style={({ pressed }) => [
        styles.headerNotificationButton,
        pressed && styles.pressed,
      ]}
    >
      <Bell size={21} color="#0f172a" strokeWidth={2.2} />

      {unreadCount > 0 ? (
        <View style={styles.headerNotificationBadge}>
          <Text style={styles.headerNotificationBadgeText}>
            {formatUnreadCount(unreadCount)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function CustomDrawerContent(
  props: DrawerContentComponentProps,
) {
  const { profile, signOut } = useAuth();
  const { unreadCount } = useUnreadNotificationCount("drawer");

  const role = profile?.mobileRole ?? "crew";

  const activeRouteName =
    props.state.routes[props.state.index]?.name ?? "index";

  const visibleSections = DRAWER_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) =>
      item.roles.includes(role),
    ),
  })).filter((section) => section.items.length > 0);

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

  return (
    <View style={styles.drawer}>
      <View style={styles.profileHeader}>
        <View style={styles.profileTopRow}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>TT</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              unreadCount > 0
                ? `${unreadCount} unread notifications`
                : "Open notifications"
            }
            onPress={() => {
              props.navigation.navigate("notifications");
              props.navigation.closeDrawer();
            }}
            style={({ pressed }) => [
              styles.profileNotificationButton,
              unreadCount > 0 &&
                styles.profileNotificationButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <Bell
              size={21}
              color={unreadCount > 0 ? "#ffffff" : "#334155"}
              strokeWidth={2.2}
            />

            {unreadCount > 0 ? (
              <View style={styles.profileNotificationBadge}>
                <Text style={styles.profileNotificationBadgeText}>
                  {formatUnreadCount(unreadCount)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <Text style={styles.userName}>
          {profile?.fullName ?? "TTTracker User"}
        </Text>

        <Text style={styles.userRole}>
          {formatRole(role)}
          {profile?.employeeRole
            ? ` · ${profile.employeeRole}`
            : ""}
        </Text>

        <View style={styles.contextCard}>
          <Text style={styles.contextLabel}>CURRENT PROJECT</Text>
          <Text style={styles.contextValue} numberOfLines={2}>
            {profile?.projectNumber
              ? `${profile.projectNumber} — ${profile.projectName ?? ""}`
              : profile?.projectName ?? "No project allocated"}
          </Text>

          <Text style={styles.contextCrew}>
            {profile?.crewNumber
              ? `Crew ${profile.crewNumber}${
                  profile.crewName
                    ? ` — ${profile.crewName}`
                    : ""
                }`
              : profile?.crewName ?? "No crew allocated"}
          </Text>
        </View>
      </View>

      <DrawerContentScrollView
        {...props}
        contentContainerStyle={styles.scrollContent}
      >
        {visibleSections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>
              {section.title}
            </Text>

            {section.items.map((item) => {
              const Icon = item.icon;
              const focused = activeRouteName === item.screen;

              return (
                <DrawerItem
                  key={item.screen}
                  label={({ color }) => (
                    <View style={styles.drawerLabelRow}>
                      <Text
                        style={[
                          styles.drawerLabel,
                          { color },
                        ]}
                      >
                        {item.label}
                      </Text>

                      {item.notificationItem &&
                      unreadCount > 0 ? (
                        <View style={styles.drawerBadge}>
                          <Text style={styles.drawerBadgeText}>
                            {formatUnreadCount(unreadCount)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                  focused={focused}
                  onPress={() => {
                    props.navigation.navigate(item.screen);
                    props.navigation.closeDrawer();
                  }}
                  icon={({
                    color,
                    size,
                  }: {
                    color: string;
                    size: number;
                  }) => (
                    <Icon
                      color={color}
                      size={size}
                      strokeWidth={2.2}
                    />
                  )}
                  activeTintColor="#0f172a"
                  inactiveTintColor="#475569"
                  activeBackgroundColor="#e2e8f0"
                  style={styles.drawerItem}
                />
              );
            })}
          </View>
        ))}
      </DrawerContentScrollView>

      <View style={styles.footer}>
        <View style={styles.syncRow}>
          <View style={styles.syncDot} />
          <Text style={styles.syncText}>All changes uploaded</Text>
        </View>

        <Pressable
          onPress={() => void handleSignOut()}
          style={({ pressed }) => [
            styles.signOutButton,
            pressed && styles.pressed,
          ]}
        >
          <LogOut size={18} color="#b91c1c" />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function DrawerLayout() {
  return (
    <Drawer
      drawerContent={(
        props: DrawerContentComponentProps,
      ) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: "#ffffff",
        },
        headerTintColor: "#0f172a",
        headerTitleStyle: {
          fontWeight: "800",
        },
        headerRight: () => <NotificationHeaderButton />,
        headerRightContainerStyle: {
          paddingRight: 14,
        },
        drawerType: "front",
        swipeEnabled: true,
        drawerStyle: {
          width: 316,
          backgroundColor: "#ffffff",
        },
        sceneStyle: {
          backgroundColor: "#f8fafc",
        },
      }}
    >
      <Drawer.Screen name="index" options={{ title: "Home" }} />

      <Drawer.Screen
        name="notifications"
        options={{
          title: "Notification Centre",
          headerRight: () => null,
        }}
      />

      <Drawer.Screen
        name="project-progress"
        options={{ title: "Project Progress" }}
      />

      <Drawer.Screen
        name="materials"
        options={{ title: "Search Materials" }}
      />

      <Drawer.Screen
        name="vehicle-prestart"
        options={{ title: "Vehicle Prestart" }}
      />

      <Drawer.Screen
        name="truck-delivery"
        options={{ title: "Truck Delivery" }}
      />

      <Drawer.Screen
        name="tower-progress"
        options={{ title: "Tower Progress" }}
      />

      <Drawer.Screen
        name="daily-dockets"
        options={{ title: "Daily Dockets" }}
      />

      <Drawer.Screen
        name="assets"
        options={{ title: "Assets" }}
      />

      <Drawer.Screen
        name="fleet-jobs"
        options={{ title: "Fleet Jobs" }}
      />

      <Drawer.Screen
        name="profile"
        options={{ title: "My Profile" }}
      />
    </Drawer>
  );
}

const styles = StyleSheet.create({
  drawer: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  profileHeader: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },

  profileTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  logo: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
    marginBottom: 13,
  },

  logoText: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
  },

  profileNotificationButton: {
    width: 43,
    height: 43,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },

  profileNotificationButtonActive: {
    borderColor: "#2563eb",
    backgroundColor: "#2563eb",
  },

  profileNotificationBadge: {
    position: "absolute",
    top: -7,
    right: -7,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#ffffff",
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },

  profileNotificationBadgeText: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "900",
  },

  userName: {
    color: "#0f172a",
    fontSize: 19,
    fontWeight: "900",
  },

  userRole: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },

  contextCard: {
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 16,
    backgroundColor: "#eff6ff",
    padding: 13,
    marginTop: 15,
  },

  contextLabel: {
    color: "#2563eb",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },

  contextValue: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 5,
  },

  contextCrew: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 5,
  },

  scrollContent: {
    paddingTop: 10,
    paddingBottom: 18,
  },

  section: {
    marginBottom: 12,
  },

  sectionTitle: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    paddingHorizontal: 22,
    marginBottom: 4,
  },

  drawerItem: {
    borderRadius: 12,
    marginHorizontal: 10,
    marginVertical: 1,
  },

  drawerLabelRow: {
    flex: 1,
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
  },

  drawerLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
  },

  drawerBadge: {
    minWidth: 26,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    marginLeft: 8,
  },

  drawerBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },

  footer: {
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    padding: 17,
  },

  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#16a34a",
    marginRight: 8,
  },

  syncText: {
    color: "#15803d",
    fontSize: 11,
    fontWeight: "700",
  },

  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  signOutText: {
    color: "#b91c1c",
    fontSize: 14,
    fontWeight: "800",
  },

  headerNotificationButton: {
    width: 41,
    height: 41,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },

  headerNotificationBadge: {
    position: "absolute",
    top: -6,
    right: -7,
    minWidth: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#ffffff",
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },

  headerNotificationBadgeText: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "900",
  },

  pressed: {
    opacity: 0.72,
  },
});
import {
  DrawerContentScrollView,
  DrawerItem,
  type DrawerContentComponentProps,
} from "@react-navigation/drawer";
import { Drawer } from "expo-router/drawer";
import { useRouter, type Href } from "expo-router";
import {
  BadgeCheck,
  Bell,
  Boxes,
  Circle,
  ClipboardCheck,
  Construction,
  FilePenLine,
  ReceiptText,
  FileText,
  Gauge,
  GraduationCap,
  HardHat,
  Home,
  LogOut,
  PackageSearch,
  Receipt,
  TriangleAlert,
  Truck,
  UserCircle,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { Alert, AppState, Pressable, StyleSheet, Text, View } from "react-native";

import { AppFooter } from "@/components/common/AppFooter";
import { SyncStatus } from "@/components/sync/SyncStatus";
import { useAuth } from "@/contexts/AuthContext";
import { useAccess, type DynamicNavigationItem } from "@/lib/access";
import { supabase } from "@/lib/supabase";

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  bell: Bell,
  "badge-check": BadgeCheck,
  gauge: Gauge,
  "graduation-cap": GraduationCap,
  receipt: Receipt,
  "package-search": PackageSearch,
  "clipboard-check": ClipboardCheck,
  construction: Construction,
  truck: Truck,
  "users-round": UsersRound,
  "file-pen-line": FilePenLine,
  "triangle-alert": TriangleAlert,
  "hard-hat": HardHat,
  "file-text": FileText,
  "file-receipt": ReceiptText,
  boxes: Boxes,
  wrench: Wrench,
  "user-circle": UserCircle,
};

function formatUnreadCount(count: number) {
  return count > 99 ? "99+" : String(count);
}

type NotificationBadgeState = {
  count: number;
  refresh: () => Promise<void>;
};

const NotificationBadgeContext = createContext<NotificationBadgeState | null>(null);
const NOTIFICATION_BADGE_STALE_MS = 2 * 60_000;

function NotificationBadgeProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [count, setCount] = useState(0);
  const lastLoadedRef = useRef(0);
  const requestRef = useRef<Promise<void> | null>(null);

  const runLoad = useCallback(async () => {
    if (!userId) {
      setCount(0);
      lastLoadedRef.current = Date.now();
      return;
    }

    const { count: unreadCount, error } = await supabase
      .from("user_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
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
    lastLoadedRef.current = Date.now();
  }, [userId]);

  const refresh = useCallback((): Promise<void> => {
    if (requestRef.current) return requestRef.current;

    const task = runLoad();
    const tracked = task.finally(() => {
      if (requestRef.current === tracked) {
        requestRef.current = null;
      }
    });

    requestRef.current = tracked;
    return tracked;
  }, [runLoad]);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }

    void refresh();

    const channel = supabase
      .channel(`mobile-notification-badge-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    const appListener = AppState.addEventListener("change", (state) => {
      if (
        state === "active" &&
        Date.now() - lastLoadedRef.current >= NOTIFICATION_BADGE_STALE_MS
      ) {
        void refresh();
      }
    });

    return () => {
      appListener.remove();
      void supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  const value = useMemo(() => ({ count, refresh }), [count, refresh]);

  return (
    <NotificationBadgeContext.Provider value={value}>
      {children}
    </NotificationBadgeContext.Provider>
  );
}

function useUnreadNotificationCount() {
  return useContext(NotificationBadgeContext)?.count ?? 0;
}

function navScreenName(route: string) {
  const withoutQuery = route.split("?")[0] ?? route;
  const parts = withoutQuery.split("/").filter(Boolean);
  const drawerIndex = parts.indexOf("(drawer)");
  if (drawerIndex >= 0) return parts[drawerIndex + 1] ?? "index";
  return parts.at(-1) ?? "index";
}

function HeaderNotifications() {
  const router = useRouter();
  const count = useUnreadNotificationCount();

  return (
    <Pressable
      onPress={() => router.push("/(drawer)/notifications" as Href)}
      style={styles.headerBell}
    >
      <Bell size={21} color="#0f172a" />
      {count > 0 ? (
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{formatUnreadCount(count)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function navigationDisplayLabel(code: string, label: string) {
  return code === "training" ? "License and Certificates" : label;
}

function DynamicTitle({ code, fallback }: { code: string; fallback: string }) {
  const { navigation } = useAccess();
  const item = navigation.find((row) => row.code === code);
  const label = navigationDisplayLabel(code, item?.label ?? fallback);
  return <Text style={styles.headerTitle}>{label}</Text>;
}

function CustomDrawerContent(props: DrawerContentComponentProps) {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { navigation, roles, can, hasCapability, appConfig, approvalCounts } = useAccess();
  const unreadCount = useUnreadNotificationCount();

  const visibleItems = useMemo(() => {
    const permitted = navigation.filter(
      (item) =>
        item.active !== false &&
        can(item.permission_code) &&
        hasCapability(item.capability_key) &&
        (!item.requires_project || Boolean(profile?.projectId)),
    );

    const vehiclePrestart = permitted.find(
      (item) => item.code === "vehicle-prestart",
    );
    const plantPrestart = permitted.find(
      (item) => item.code === "plant-prestart",
    );

    const withoutSeparatePrestarts = permitted.filter(
      (item) =>
        item.code !== "vehicle-prestart" &&
        item.code !== "plant-prestart",
    );

    const prestartBase = vehiclePrestart ?? plantPrestart;
    if (!prestartBase) return withoutSeparatePrestarts;

    return [
      ...withoutSeparatePrestarts,
      {
        ...prestartBase,
        code: "prestarts",
        label: "Prestarts",
        route: "/(drawer)/prestarts",
        icon_key: "clipboard-check",
        sort_order: Math.min(
          vehiclePrestart?.sort_order ?? prestartBase.sort_order,
          plantPrestart?.sort_order ?? prestartBase.sort_order,
        ),
      },
    ];
  }, [navigation, can, hasCapability, profile?.projectId]);

  const sections = useMemo(() => {
    const map = new Map<
      string,
      { code: string; label: string; sort: number; items: DynamicNavigationItem[] }
    >();

    for (const item of visibleItems) {
      const current = map.get(item.section_code) ?? {
        code: item.section_code,
        label: item.section_label,
        sort: item.section_sort_order,
        items: [],
      };
      current.items.push(item);
      map.set(item.section_code, current);
    }

    return Array.from(map.values())
      .map((section) => ({ ...section, items: [...section.items].sort((a, b) => a.sort_order - b.sort_order) }))
      .sort((a, b) => a.sort - b.sort);
  }, [visibleItems]);

  const activeRouteName = props.state.routes[props.state.index]?.name ?? "index";
  const roleText = roles.length ? roles.map((role) => role.name).join(" + ") : profile?.employeeRole || "TTTracker User";
  const approvalTotal = approvalCounts.dailyDockets + approvalCounts.expenseClaims + approvalCounts.invoices;

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      Alert.alert("Unable to sign out", error instanceof Error ? error.message : "Please try again.");
    }
  }

  return (
    <View style={styles.drawer}>
      <View style={styles.profileHeader}>
        <View style={styles.profileTopRow}>
          <View style={styles.logo}><Text style={styles.logoText}>TT</Text></View>

        </View>

        <Text style={styles.product}>{appConfig.product_name || "TTTracker"}</Text>
        <Text style={styles.userName}>{profile?.fullName ?? "TTTracker User"}</Text>
        <Text style={styles.userRole}>{roleText}</Text>

        <View style={styles.contextCard}>
          <Text style={styles.contextLabel}>CURRENT PROJECT</Text>
          <Text style={styles.contextValue} numberOfLines={2}>
            {profile?.projectNumber
              ? `${profile.projectNumber} — ${profile.projectName ?? ""}`
              : profile?.projectName ?? "No project selected"}
          </Text>
          <Text style={styles.contextCrew}>
            {profile?.crewNumber
              ? `Crew ${profile.crewNumber}${profile.crewName ? ` — ${profile.crewName}` : ""}`
              : profile?.crewName ?? "No crew allocated"}
          </Text>
        </View>
      </View>

      <DrawerContentScrollView {...props} contentContainerStyle={styles.scrollContent}>
        {sections.map((section) => (
          <View key={section.code} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.label}</Text>
            {section.items.map((item) => {
              const Icon = ICONS[item.icon_key] ?? Circle;
              const screenName = navScreenName(item.route);
              const focused = activeRouteName === screenName;
              const badgeCount =
                item.code === "notifications"
                  ? unreadCount
                  : item.code === "approvals"
                    ? approvalTotal
                    : 0;

              return (
                <DrawerItem
                  key={item.code}
                  focused={focused}
                  label={({ color }) => (
                    <View style={styles.drawerLabelRow}>
                      <Text style={[styles.drawerLabel, { color }]}>
                        {navigationDisplayLabel(item.code, item.label)}
                      </Text>
                      {badgeCount > 0 ? (
                        <View style={styles.drawerBadge}>
                          <Text style={styles.drawerBadgeText}>{formatUnreadCount(badgeCount)}</Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                  onPress={() => {
                    router.push(item.route as Href);
                    props.navigation.closeDrawer();
                  }}
                  icon={({ color, size }) => <Icon color={color} size={size} strokeWidth={2.2} />}
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
        <SyncStatus />
        <Pressable onPress={() => void handleSignOut()} style={styles.signOutButton}>
          <LogOut size={18} color="#b91c1c" />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
        <AppFooter compact />
      </View>
    </View>
  );
}

export default function DrawerLayout() {
  return (
    <NotificationBadgeProvider>
      <Drawer
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: "#fff" },
        headerTintColor: "#0f172a",
        headerTitleStyle: { fontWeight: "800" },
        headerRight: () => <HeaderNotifications />,
        headerRightContainerStyle: { paddingRight: 14 },
        drawerType: "front",
        swipeEnabled: true,
        drawerStyle: { width: 316, backgroundColor: "#fff" },
        sceneStyle: { backgroundColor: "#f8fafc" },
      }}
    >
      <Drawer.Screen name="index" options={{ headerTitle: () => <DynamicTitle code="home" fallback="Home" /> }} />
      <Drawer.Screen name="notifications" options={{ headerTitle: () => <DynamicTitle code="notifications" fallback="Notifications" />, headerRight: () => null }} />
      <Drawer.Screen name="approvals" options={{ headerTitle: () => <DynamicTitle code="approvals" fallback="My Approvals" /> }} />
      <Drawer.Screen name="project-progress" options={{ headerTitle: () => <DynamicTitle code="project-progress" fallback="Project Progress" /> }} />
      <Drawer.Screen name="training" options={{ headerTitle: () => <DynamicTitle code="training" fallback="License and Certificates" /> }} />
      <Drawer.Screen name="expenses" options={{ headerTitle: () => <DynamicTitle code="expenses" fallback="Expense Claims" /> }} />
      <Drawer.Screen name="materials" options={{ headerTitle: () => <DynamicTitle code="materials" fallback="Materials" /> }} />
      <Drawer.Screen name="prestarts" options={{ headerTitle: () => <DynamicTitle code="prestarts" fallback="Prestarts" /> }} />
      <Drawer.Screen name="vehicle-prestart" options={{ headerTitle: "Vehicle Prestart" }} />
      <Drawer.Screen name="plant-prestart" options={{ headerTitle: "Plant Prestart" }} />
      <Drawer.Screen name="site-prestart" options={{ headerTitle: () => <DynamicTitle code="site-prestart" fallback="Site Prestart" /> }} />
      <Drawer.Screen name="truck-delivery" options={{ headerTitle: () => <DynamicTitle code="deliveries" fallback="Deliveries" /> }} />
      <Drawer.Screen name="revisions" options={{ headerTitle: () => <DynamicTitle code="revisions" fallback="Revisions / Rectifications" /> }} />
      <Drawer.Screen name="defects" options={{ headerTitle: () => <DynamicTitle code="defects" fallback="Defects" /> }} />
      <Drawer.Screen name="tower-progress" options={{ headerTitle: () => <DynamicTitle code="tower-progress" fallback="Tower Progress" /> }} />
      <Drawer.Screen name="daily-dockets" options={{ headerTitle: () => <DynamicTitle code="daily-dockets" fallback="Daily Dockets" /> }} />
      <Drawer.Screen name="invoices" options={{ headerTitle: () => <DynamicTitle code="invoices" fallback="Invoices" /> }} />
      <Drawer.Screen name="assets" options={{ headerTitle: () => <DynamicTitle code="assets" fallback="Assets" /> }} />
      <Drawer.Screen name="fleet-jobs" options={{ headerTitle: () => <DynamicTitle code="fleet-jobs" fallback="Fleet Jobs" /> }} />
      <Drawer.Screen name="profile" options={{ headerTitle: () => <DynamicTitle code="profile" fallback="My Profile" /> }} />
      </Drawer>
    </NotificationBadgeProvider>
  );
}

const styles = StyleSheet.create({
  drawer: { flex: 1, backgroundColor: "#fff" },
  profileHeader: { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  profileTopRow: { flexDirection: "row", alignItems: "flex-start" },
  logo: { width: 50, height: 50, borderRadius: 16, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontWeight: "900", fontSize: 19 },
  product: { marginTop: 10, color: "#64748b", fontSize: 10, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  userName: { color: "#0f172a", fontWeight: "900", fontSize: 19, marginTop: 2 },
  userRole: { color: "#2563eb", fontSize: 11, fontWeight: "800", marginTop: 4 },
  contextCard: { borderWidth: 1, borderColor: "#dbeafe", backgroundColor: "#eff6ff", borderRadius: 16, padding: 13, marginTop: 15 },
  contextLabel: { color: "#2563eb", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  contextValue: { color: "#0f172a", fontSize: 13, fontWeight: "800", lineHeight: 18, marginTop: 5 },
  contextCrew: { color: "#64748b", fontSize: 11, marginTop: 5 },
  scrollContent: { paddingTop: 10, paddingBottom: 18 },
  section: { marginBottom: 12 },
  sectionTitle: { color: "#94a3b8", fontSize: 10, fontWeight: "900", letterSpacing: 1.25, marginHorizontal: 20, marginTop: 8, marginBottom: 5 },
  drawerItem: { borderRadius: 12, marginHorizontal: 10, marginVertical: 1 },
  drawerLabelRow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  drawerLabel: { fontSize: 13, fontWeight: "800" },
  drawerBadge: { minWidth: 22, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#dc2626" },
  drawerBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  footer: { borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10, gap: 10 },
  signOutButton: { flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 12, backgroundColor: "#fff1f2", paddingVertical: 10, paddingHorizontal: 12 },
  signOutText: { color: "#b91c1c", fontWeight: "800", fontSize: 12 },
  headerBell: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0", alignItems: "center", justifyContent: "center" },
  headerBadge: { position: "absolute", top: -5, right: -5, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: "#dc2626", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  headerBadgeText: { color: "#fff", fontSize: 8, fontWeight: "900" },
  headerTitle: { color: "#0f172a", fontWeight: "900", fontSize: 17 },
});

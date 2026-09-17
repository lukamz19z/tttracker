import { router, type Href } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  ArrowRightLeft,
  Boxes,
  CheckCircle2,
  PackageOpen,
  Search,
  ShieldAlert,
  Truck,
  Wrench,
  Wifi,
  WifiOff,
} from "lucide-react-native";

import { MaterialsShell } from "@/components/materials/MaterialsShell";
import { MaterialsProvider, useMaterials } from "@/contexts/MaterialsContext";

const clean = (value: unknown) => String(value ?? "").trim();

const links = [
  {
    title: "Search",
    description: "Find members, bundles and bolts fast.",
    href: "/materials/search",
    Icon: Search,
    tone: "blue" as const,
  },
  {
    title: "Bundles",
    description: "Check off bundles and open pack contents.",
    href: "/materials/bundles",
    Icon: Boxes,
    tone: "amber" as const,
  },
  {
    title: "Members",
    description: "Review members by bundle, tower or segment.",
    href: "/materials/members",
    Icon: PackageOpen,
    tone: "violet" as const,
  },
  {
    title: "Bolts",
    description: "Search the bolt register by tower.",
    href: "/materials/bolts",
    Icon: Wrench,
    tone: "slate" as const,
  },
  {
    title: "Missing & Excess",
    description: "Track outstanding material and close-outs.",
    href: "/materials/missing",
    Icon: ShieldAlert,
    tone: "rose" as const,
  },
  {
    title: "Transfers",
    description: "Move bundles between towers with search.",
    href: "/materials/transfers",
    Icon: ArrowRightLeft,
    tone: "emerald" as const,
  },
  {
    title: "Deliveries",
    description: "Open the existing mobile delivery workflow.",
    href: "/(drawer)/truck-delivery",
    Icon: Truck,
    tone: "cyan" as const,
  },
] as const;

function MaterialsHomeContent() {
  const { data, loading, deriveBundleStatus, pendingSyncCount, online } =
    useMaterials();

  const checkedBundles =
    data?.bundles.filter(
      (bundle) => deriveBundleStatus(bundle) !== "not_checked",
    ).length ?? 0;

  const inTransit =
    data?.transfers.filter(
      (transfer) => clean(transfer.status) === "in_transit",
    ).length ?? 0;

  const outstanding =
    data?.bundles.reduce((sum, bundle) => {
      const required = Number(bundle.qty_required ?? 0) || 0;
      const status = deriveBundleStatus(bundle);
      if (status === "arrived" || status === "transferred") return sum;
      return sum + Math.max(required, 0);
    }, 0) ?? 0;

  return (
    <MaterialsShell
      root
      title="Materials"
      subtitle="Search, check off and action materials fast on site."
    >
      <View style={styles.hero}>
        <View style={styles.heroHeader}>
          <View style={styles.heroBadge}>
            {online ? (
              <Wifi size={14} color="#166534" />
            ) : (
              <WifiOff size={14} color="#9a3412" />
            )}
            <Text
              style={[
                styles.heroBadgeText,
                online ? styles.onlineText : styles.offlineText,
              ]}
            >
              {online ? "Online" : "Offline mode"}
            </Text>
          </View>

          <View
            style={[
              styles.syncBadge,
              pendingSyncCount > 0 && styles.syncBadgeWarning,
            ]}
          >
            <Text
              style={[
                styles.syncBadgeText,
                pendingSyncCount > 0 && styles.syncBadgeTextWarning,
              ]}
            >
              {pendingSyncCount > 0
                ? `${pendingSyncCount} pending sync`
                : "All synced"}
            </Text>
          </View>
        </View>

        <Text style={styles.heroTitle}>Site-ready material controls</Text>
        <Text style={styles.heroText}>
          Search-first tools, quick bundle check-off and action-focused
          registers for crews working under time pressure.
        </Text>
      </View>

      {loading && !data ? (
        <ActivityIndicator />
      ) : (
        <View style={styles.statsGrid}>
          <SummaryCard
            label="Bundles"
            value={data?.bundles.length ?? 0}
            note="Project register"
            tone="blue"
            icon={<Boxes size={18} color="#1d4ed8" />}
          />
          <SummaryCard
            label="Checked"
            value={checkedBundles}
            note="Site reviewed"
            tone="emerald"
            icon={<CheckCircle2 size={18} color="#15803d" />}
          />
          <SummaryCard
            label="In Transit"
            value={inTransit}
            note="Tower to tower"
            tone="amber"
            icon={<ArrowRightLeft size={18} color="#b45309" />}
          />
          <SummaryCard
            label="Pending Sync"
            value={pendingSyncCount}
            note={pendingSyncCount > 0 ? "Stored on device" : "Up to date"}
            tone={pendingSyncCount > 0 ? "rose" : "slate"}
            icon={
              pendingSyncCount > 0 ? (
                <WifiOff size={18} color="#be123c" />
              ) : (
                <Wifi size={18} color="#334155" />
              )
            }
          />
        </View>
      )}

      <View style={styles.stripRow}>
        <MiniStrip
          label="Outstanding"
          value={outstanding}
          accent="#be123c"
        />
        <MiniStrip
          label="Available Tools"
          value={links.length}
          accent="#1d4ed8"
        />
      </View>

      <Text style={styles.sectionLabel}>QUICK ACCESS</Text>

      <View style={styles.linksWrap}>
        {links.map(({ title, description, href, Icon, tone }) => (
          <Pressable
            key={title}
            style={styles.linkCard}
            onPress={() => router.push(href as Href)}
          >
            <View style={[styles.iconWrap, toneStyles[tone].iconWrap]}>
              <Icon size={18} color={toneStyles[tone].iconColor} />
            </View>

            <View style={styles.linkTextWrap}>
              <Text style={styles.linkTitle}>{title}</Text>
              <Text style={styles.linkDescription}>{description}</Text>
            </View>

            <Text style={styles.linkChevron}>›</Text>
          </Pressable>
        ))}
      </View>
    </MaterialsShell>
  );
}


export default function MaterialsHome() {
  return (
    <MaterialsProvider>
      <MaterialsHomeContent />
    </MaterialsProvider>
  );
}

function SummaryCard({
  label,
  value,
  note,
  tone,
  icon,
}: {
  label: string;
  value: number;
  note: string;
  tone: keyof typeof toneStyles;
  icon: React.ReactNode;
}) {
  return (
    <View style={[styles.summaryCard, toneStyles[tone].summaryCard]}>
      <View style={styles.summaryTop}>
        <View style={[styles.summaryIcon, toneStyles[tone].iconWrap]}>{icon}</View>
        <Text style={styles.summaryLabel}>{label}</Text>
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryNote}>{note}</Text>
    </View>
  );
}

function MiniStrip({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <View style={styles.miniStrip}>
      <View style={[styles.miniAccent, { backgroundColor: accent }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.miniLabel}>{label}</Text>
        <Text style={styles.miniValue}>{value}</Text>
      </View>
    </View>
  );
}

const toneStyles = {
  blue: {
    summaryCard: { backgroundColor: "#eff6ff", borderColor: "#bfdbfe" },
    iconWrap: { backgroundColor: "#dbeafe" },
    iconColor: "#1d4ed8",
  },
  emerald: {
    summaryCard: { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" },
    iconWrap: { backgroundColor: "#d1fae5" },
    iconColor: "#15803d",
  },
  amber: {
    summaryCard: { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
    iconWrap: { backgroundColor: "#fef3c7" },
    iconColor: "#b45309",
  },
  rose: {
    summaryCard: { backgroundColor: "#fff1f2", borderColor: "#fecdd3" },
    iconWrap: { backgroundColor: "#ffe4e6" },
    iconColor: "#be123c",
  },
  violet: {
    summaryCard: { backgroundColor: "#f5f3ff", borderColor: "#ddd6fe" },
    iconWrap: { backgroundColor: "#ede9fe" },
    iconColor: "#7c3aed",
  },
  cyan: {
    summaryCard: { backgroundColor: "#ecfeff", borderColor: "#a5f3fc" },
    iconWrap: { backgroundColor: "#cffafe" },
    iconColor: "#0891b2",
  },
  slate: {
    summaryCard: { backgroundColor: "#f8fafc", borderColor: "#cbd5e1" },
    iconWrap: { backgroundColor: "#e2e8f0" },
    iconColor: "#334155",
  },
} as const;

const styles = StyleSheet.create({
  hero: {
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#eff6ff",
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#ffffffcc",
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: "900",
  },
  onlineText: {
    color: "#166534",
  },
  offlineText: {
    color: "#9a3412",
  },
  syncBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  syncBadgeWarning: {
    backgroundColor: "#ffe4e6",
  },
  syncBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#334155",
  },
  syncBadgeTextWarning: {
    color: "#be123c",
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
  },
  heroText: {
    color: "#475569",
    lineHeight: 19,
    fontSize: 12,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryCard: {
    minWidth: "47%",
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
    gap: 4,
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
    textTransform: "uppercase",
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
  },
  summaryNote: {
    fontSize: 11,
    color: "#64748b",
  },
  stripRow: {
    flexDirection: "row",
    gap: 8,
  },
  miniStrip: {
    flex: 1,
    minHeight: 62,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  miniAccent: {
    width: 4,
    alignSelf: "stretch",
    borderRadius: 999,
  },
  miniLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
  },
  miniValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
    color: "#64748b",
  },
  linksWrap: {
    gap: 10,
  },
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  linkTextWrap: {
    flex: 1,
  },
  linkTitle: {
    fontWeight: "900",
    color: "#0f172a",
  },
  linkDescription: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
    lineHeight: 16,
  },
  linkChevron: {
    fontSize: 24,
    color: "#94a3b8",
  },
});

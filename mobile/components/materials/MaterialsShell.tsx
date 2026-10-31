import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { SyncStatus } from "@/components/sync/SyncStatus";
import { useAuth } from "@/contexts/AuthContext";
import { useMaterials } from "@/contexts/MaterialsContext";

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  back: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingRight: 12,
  },
  backText: {
    color: "#334155",
    fontWeight: "800",
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
    color: "#2563eb",
  },
  heading: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
  },
  muted: {
    color: "#64748b",
    lineHeight: 20,
  },
  cache: {
    fontSize: 11,
    color: "#64748b",
  },
  error: {
    padding: 11,
    borderRadius: 11,
    backgroundColor: "#fff7ed",
    color: "#9a3412",
    fontWeight: "700",
  },
  pending: {
    padding: 11,
    borderRadius: 11,
    backgroundColor: "#eff6ff",
    color: "#1d4ed8",
    fontWeight: "800",
  },
  card: {
    padding: 15,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 15,
  },
  cardTitle: {
    fontWeight: "900",
    color: "#0f172a",
  },
  cardSubtitle: {
    color: "#475569",
    marginTop: 4,
  },
  meta: {
    color: "#94a3b8",
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
  },
});

export const materialStyles = styles;

export function MaterialsShell({
  title,
  subtitle,
  children,
  root = false,
  items,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  root?: boolean;
  items?: ReactNode[];
}) {
  const { refreshing, refresh, cachedAt, error, pendingSyncCount } = useMaterials();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  const header = <>
        {!root ? (
          <Pressable
            onPress={() => router.back()}
            style={styles.back}
            hitSlop={8}
          >
            <ArrowLeft size={16} color="#334155" />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : null}

        <Text style={styles.eyebrow}>
          MATERIALS ·{" "}
          {profile?.projectNumber ||
            profile?.projectName ||
            "PROJECT"}
        </Text>

        <Text style={styles.heading}>{title}</Text>

        {subtitle ? (
          <Text style={styles.muted}>{subtitle}</Text>
        ) : null}

        <SyncStatus compact />

        {cachedAt ? (
          <Text style={styles.cache}>
            Project cache updated{" "}
            {new Date(cachedAt).toLocaleString("en-AU")}
          </Text>
        ) : null}

        {error && pendingSyncCount === 0 ? <Text style={styles.error}>{error}</Text> : null}

        {children}
  </>;

  return (
    <SafeAreaView
      style={styles.safe}
      edges={["top", "left", "right"]}
    >
      {items ? <FlatList data={items} keyExtractor={(_, index) => String(index)} renderItem={({ item }) => <>{item}</>} ListHeaderComponent={header} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 12) }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />} keyboardShouldPersistTaps="handled" initialNumToRender={10} windowSize={5} /> : <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 12) }]}>{header}</ScrollView>}
    </SafeAreaView>
  );
}

export function MaterialCard({
  title,
  subtitle,
  meta,
  onPress,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
}) {
  const content = (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle ? (
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      ) : null}
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    </View>
  );

  return onPress ? (
    <Pressable onPress={onPress}>{content}</Pressable>
  ) : (
    content
  );
}

import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import type { PropsWithChildren } from "react";
import {
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
} from "react-native";

import { AppFooter } from "@/components/common/AppFooter";
import { PermissionScreen } from "@/components/common/PermissionScreen";
import { SyncStatus } from "@/components/sync/SyncStatus";
import { useAuth } from "@/contexts/AuthContext";
import { useQuality } from "@/contexts/QualityContext";

export function QualityShell({
  permission,
  title,
  subtitle,
  root = false,
  children,
}: PropsWithChildren<{
  permission: "mobile.defects" | "mobile.rectifications";
  title: string;
  subtitle?: string;
  root?: boolean;
}>) {
  const { profile } = useAuth();
  const { refreshing, refresh, cachedAt, error } = useQuality();

  return (
    <PermissionScreen permission={permission}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          keyboardShouldPersistTaps="handled"
        >
          {!root ? (
            <Pressable style={styles.back} onPress={() => router.back()}>
              <ArrowLeft size={16} color="#334155" />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          ) : null}

          <Text style={styles.eyebrow}>
            QUALITY · {profile?.projectNumber || profile?.projectName || "PROJECT"}
          </Text>
          <Text style={styles.heading}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <SyncStatus compact />
          {cachedAt ? (
            <Text style={styles.cache}>Quality cache updated {new Date(cachedAt).toLocaleString("en-AU")}</Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {children}
          <AppFooter />
        </ScrollView>
      </SafeAreaView>
    </PermissionScreen>
  );
}

export const qualityStyles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 16, padding: 15, gap: 8 },
  cardTitle: { color: "#0f172a", fontWeight: "900", fontSize: 15 },
  muted: { color: "#64748b", fontSize: 12, lineHeight: 18 },
  fieldLabel: { color: "#334155", fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, backgroundColor: "#fff", paddingHorizontal: 12, minHeight: 46, color: "#0f172a" },
  select: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, backgroundColor: "#fff", padding: 12 },
  selectText: { color: "#0f172a", fontWeight: "800" },
  primary: { backgroundColor: "#2563eb", borderRadius: 13, paddingHorizontal: 15, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#fff", fontWeight: "900" },
  secondary: { backgroundColor: "#f1f5f9", borderRadius: 13, paddingHorizontal: 15, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: "#334155", fontWeight: "900" },
  danger: { backgroundColor: "#fff1f2", borderRadius: 13, paddingHorizontal: 15, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  dangerText: { color: "#be123c", fontWeight: "900" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  grow: { flex: 1 },
  error: { backgroundColor: "#fff1f2", color: "#be123c", padding: 11, borderRadius: 11, fontWeight: "700" },
  success: { backgroundColor: "#ecfdf5", color: "#047857", padding: 11, borderRadius: 11, fontWeight: "700" },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 18, gap: 12, paddingBottom: 42 },
  back: { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", paddingVertical: 5 },
  backText: { color: "#334155", fontWeight: "800" },
  eyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 1.1, color: "#2563eb" },
  heading: { fontSize: 28, fontWeight: "900", color: "#0f172a" },
  subtitle: { color: "#64748b", lineHeight: 20 },
  cache: { fontSize: 11, color: "#64748b" },
  error: { padding: 11, borderRadius: 11, backgroundColor: "#fff7ed", color: "#9a3412", fontWeight: "700" },
});

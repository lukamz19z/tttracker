import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { PropsWithChildren } from "react";
import { ShieldX } from "lucide-react-native";

import { useAccess } from "@/lib/access";

export function PermissionScreen({ permission, children }: PropsWithChildren<{ permission: string }>) {
  const { loading, can } = useAccess();
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.hint}>Checking access…</Text>
      </View>
    );
  }
  if (!can(permission)) {
    return (
      <View style={styles.center}>
        <ShieldX size={38} color="#94a3b8" />
        <Text style={styles.title}>Access not available</Text>
        <Text style={styles.hint}>Your TTTracker permissions do not include this mobile feature.</Text>
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: "#f8fafc" },
  title: { marginTop: 14, color: "#0f172a", fontSize: 18, fontWeight: "900" },
  hint: { marginTop: 7, color: "#64748b", fontSize: 13, textAlign: "center", lineHeight: 19 },
});

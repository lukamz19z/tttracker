import { Cloud, CloudOff, RefreshCw } from "lucide-react-native";
import { Pressable, StyleSheet, Text } from "react-native";

import { useSync } from "@/contexts/SyncContext";

export function SyncStatus({ compact = false }: { compact?: boolean }) {
  const { online, syncing, pendingCount, failedCount, syncNow } = useSync();
  const label = !online
    ? pendingCount ? `${pendingCount} saved offline` : "Offline"
    : syncing ? "Syncing..."
      : failedCount ? `${failedCount} sync issue${failedCount === 1 ? "" : "s"}`
        : pendingCount ? `${pendingCount} waiting to sync` : "All changes uploaded";

  return (
    <Pressable onPress={() => void syncNow()} style={[styles.wrap, compact && styles.compact]}>
      {online ? <Cloud size={compact ? 13 : 15} color="#64748b" /> : <CloudOff size={compact ? 13 : 15} color="#d97706" />}
      <Text style={[styles.text, compact && styles.compactText, !online && styles.offline]}>{label}</Text>
      {syncing ? <RefreshCw size={compact ? 11 : 13} color="#64748b" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 7 },
  compact: { gap: 5 },
  text: { color: "#64748b", fontSize: 11, fontWeight: "700" },
  compactText: { fontSize: 10 },
  offline: { color: "#b45309" },
});

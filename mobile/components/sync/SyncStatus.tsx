import { Circle, CloudOff, RefreshCw, TriangleAlert } from "lucide-react-native";
import { Pressable, StyleSheet, Text } from "react-native";

import { useSync } from "@/contexts/SyncContext";

export function SyncStatus({ compact = false }: { compact?: boolean }) {
  const {
    forcedOffline, networkOnline, lastError,
    online,
    syncing,
    pendingCount,
    failedCount,
    syncNow,
  } = useSync();

  const label = !networkOnline ? `No Connection - ${pendingCount} pending` : forcedOffline ? `Offline Mode - ${pendingCount} pending` : !online
    ? pendingCount
      ? `Offline · ${pendingCount} saved locally`
      : "Offline"
    : syncing
      ? pendingCount
        ? `Syncing ${pendingCount} change${pendingCount === 1 ? "" : "s"}…`
        : "Syncing…"
      : failedCount
        ? `${failedCount} sync issue${failedCount === 1 ? "" : "s"}`
        : pendingCount ? `${pendingCount} waiting to sync` : "Online";

  const Icon = !online
    ? CloudOff
    : failedCount > 0
      ? TriangleAlert
      : syncing ? RefreshCw : Circle;

  return (
    <Pressable
      onPress={() => void syncNow()}
      style={[styles.wrap, compact && styles.compact]}
    >
      <Icon
        size={compact ? 13 : 15}
        color={failedCount > 0 || !online ? "#b45309" : "#15803d"}
      />
      <Text
        style={[
          styles.text,
          compact && styles.compactText,
          !online && styles.offline,
          failedCount > 0 && styles.warning,
        ]}
      >
        {label}{lastError ? ` ? ${lastError} ? Tap to retry` : ""}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  compact: {
    gap: 5,
  },
  text: {
    flexShrink: 1,
    minWidth: 0,
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
  },
  compactText: {
    fontSize: 10,
  },
  offline: {
    color: "#b45309",
  },
  warning: {
    color: "#b45309",
  },
});

export function OfflineModeButton() {
  const { forcedOffline, setForcedOffline } = useSync();
  return <Pressable style={{ minHeight: 44, justifyContent: "center", backgroundColor: "#f1f5f9", paddingHorizontal: 12, borderRadius: 10 }} onPress={() => void setForcedOffline(!forcedOffline)}><Text style={{ fontWeight: "800", color: forcedOffline ? "#b45309" : "#15803d" }}>{forcedOffline ? "Go Online" : "Work Offline"}</Text></Pressable>;
}

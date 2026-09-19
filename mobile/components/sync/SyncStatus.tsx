import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react-native";
import { Pressable, StyleSheet, Text } from "react-native";

import { useSync } from "@/contexts/SyncContext";

export function SyncStatus({ compact = false }: { compact?: boolean }) {
  const {
    online,
    syncing,
    pendingCount,
    failedCount,
    syncNow,
  } = useSync();

  /* Healthy sync is intentionally silent. */
  if (online && !syncing && pendingCount === 0 && failedCount === 0) {
    return null;
  }

  const label = !online
    ? pendingCount
      ? `Offline · ${pendingCount} saved locally`
      : "Offline"
    : syncing
      ? pendingCount
        ? `Syncing ${pendingCount} change${pendingCount === 1 ? "" : "s"}…`
        : "Syncing…"
      : failedCount
        ? `${failedCount} sync issue${failedCount === 1 ? "" : "s"}`
        : `${pendingCount} waiting to sync`;

  const Icon = !online
    ? CloudOff
    : failedCount > 0
      ? TriangleAlert
      : RefreshCw;

  return (
    <Pressable
      onPress={() => void syncNow()}
      style={[styles.wrap, compact && styles.compact]}
    >
      <Icon
        size={compact ? 13 : 15}
        color={failedCount > 0 ? "#b45309" : "#64748b"}
      />
      <Text
        style={[
          styles.text,
          compact && styles.compactText,
          !online && styles.offline,
          failedCount > 0 && styles.warning,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  compact: {
    gap: 5,
  },
  text: {
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

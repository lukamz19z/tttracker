import { StyleSheet, Text, View } from "react-native";

import { useAccess } from "@/lib/access";

export function AppFooter({ compact = false }: { compact?: boolean }) {
  const { appConfig } = useAccess();
  const footer = appConfig.footer_text?.trim() || `${appConfig.product_name} · ${appConfig.software_owner_name}`;

  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      <Text style={styles.text}>{footer}</Text>
      {appConfig.software_owner_abn ? (
        <Text style={styles.subtext}>ABN {appConfig.software_owner_abn}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingHorizontal: 20, paddingVertical: 18 },
  compact: { paddingVertical: 10 },
  text: { color: "#94a3b8", fontSize: 11, fontWeight: "700", textAlign: "center" },
  subtext: { color: "#cbd5e1", fontSize: 10, marginTop: 3 },
});

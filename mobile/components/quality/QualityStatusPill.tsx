import { StyleSheet, Text, View } from "react-native";

function palette(value: string) {
  const status = value.trim().toLowerCase();
  if (["closed", "verified", "current", "approved"].includes(status)) {
    return { backgroundColor: "#dcfce7", color: "#166534" };
  }
  if (["critical", "rejected"].includes(status)) {
    return { backgroundColor: "#ffe4e6", color: "#be123c" };
  }
  if (["major", "rectified", "ready for review", "in progress"].includes(status)) {
    return { backgroundColor: "#fef3c7", color: "#92400e" };
  }
  return { backgroundColor: "#e2e8f0", color: "#475569" };
}

export function QualityStatusPill({ value }: { value: string }) {
  const colours = palette(value);
  return (
    <View style={[styles.pill, { backgroundColor: colours.backgroundColor }]}>
      <Text style={[styles.text, { color: colours.color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  text: { fontSize: 10, fontWeight: "900" },
});

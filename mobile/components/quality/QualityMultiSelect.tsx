import { Check, Search, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export type QualityMultiSelectOption = { id: string; label: string; subtitle?: string | null };

export function QualityMultiSelect({
  visible,
  title,
  options,
  selectedIds,
  onToggle,
  onClose,
  emptyMessage = "No notification users configured.",
}: {
  visible: boolean;
  title: string;
  options: QualityMultiSelectOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
  emptyMessage?: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter(option => `${option.label} ${option.subtitle || ""}`.toLowerCase().includes(term));
  }, [options, query]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.heading}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.count}>{selectedIds.length} selected</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Done selecting recipients" style={styles.close} onPress={onClose}>
            <X size={20} color="#334155" />
          </Pressable>
        </View>
        <View style={styles.search}>
          <Search size={16} color="#64748b" />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search name or role" style={styles.searchInput} autoCorrect={false} />
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.empty}>{emptyMessage}</Text>}
          renderItem={({ item }) => {
            const checked = selectedIds.includes(item.id);
            return (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onToggle(item.id)} style={styles.option}>
                <View style={[styles.checkbox, checked && styles.checked]}>{checked ? <Check size={15} color="#fff" /> : null}</View>
                <View style={styles.labelGroup}>
                  <Text style={styles.optionTitle}>{item.label}</Text>
                  {item.subtitle ? <Text style={styles.subtitle}>{item.subtitle}</Text> : null}
                </View>
              </Pressable>
            );
          }}
        />
        <Pressable style={styles.done} onPress={onClose}><Text style={styles.doneText}>Done</Text></Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", padding: 18, borderBottomWidth: 1, borderColor: "#e2e8f0" },
  heading: { flex: 1 },
  title: { fontSize: 19, fontWeight: "900", color: "#0f172a" },
  count: { marginTop: 3, fontSize: 12, color: "#64748b" },
  close: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#f1f5f9" },
  search: { height: 44, flexDirection: "row", alignItems: "center", gap: 8, margin: 16, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, color: "#0f172a" },
  list: { paddingHorizontal: 16, paddingBottom: 18 },
  option: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderColor: "#f1f5f9" },
  checkbox: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 6, borderWidth: 1.5, borderColor: "#94a3b8" },
  checked: { borderColor: "#0f172a", backgroundColor: "#0f172a" },
  labelGroup: { flex: 1 },
  optionTitle: { fontWeight: "800", color: "#0f172a" },
  subtitle: { color: "#64748b", fontSize: 12, marginTop: 2 },
  empty: { padding: 22, textAlign: "center", color: "#64748b" },
  done: { margin: 16, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#0f172a" },
  doneText: { color: "#fff", fontWeight: "900" },
});

import { Search, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export type QualitySelectorOption = {
  id: string;
  label: string;
  subtitle?: string | null;
};

export function QualitySelector({
  visible,
  title,
  options,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  options: QualitySelectorOption[];
  onClose: () => void;
  onSelect: (option: QualitySelectorOption) => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (visible) setQuery("");
  }, [visible]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) =>
      `${option.label} ${option.subtitle ?? ""}`.toLowerCase().includes(term),
    );
  }, [options, query]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable style={styles.close} onPress={onClose}>
            <X size={20} color="#334155" />
          </Pressable>
        </View>
        <View style={styles.search}>
          <Search size={17} color="#64748b" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search…"
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
            autoCorrect={false}
          />
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              style={styles.option}
              onPress={() => {
                onSelect(item);
                onClose();
              }}
            >
              <Text style={styles.optionTitle}>{item.label}</Text>
              {item.subtitle ? <Text style={styles.optionSubtitle}>{item.subtitle}</Text> : null}
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No matching options.</Text>}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", padding: 18, borderBottomWidth: 1, borderColor: "#e2e8f0" },
  title: { flex: 1, fontSize: 19, fontWeight: "900", color: "#0f172a" },
  close: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#f1f5f9" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, margin: 16, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 13, paddingHorizontal: 12 },
  searchInput: { flex: 1, height: 46, color: "#0f172a" },
  list: { paddingHorizontal: 16, paddingBottom: 30 },
  option: { paddingVertical: 13, borderBottomWidth: 1, borderColor: "#f1f5f9" },
  optionTitle: { fontWeight: "900", color: "#0f172a" },
  optionSubtitle: { color: "#64748b", fontSize: 12, marginTop: 3 },
  empty: { padding: 22, textAlign: "center", color: "#94a3b8" },
});

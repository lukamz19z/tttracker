import { ChevronDown, Search, X } from "lucide-react-native";
import { useDeferredValue, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { TowerMaterialRecord } from "@/types/materials";

const clean = (value: unknown) => String(value ?? "").trim();

type IndexedTower = {
  tower: TowerMaterialRecord;
  id: string;
  label: string;
  line: string;
  search: string;
};

export function TowerPicker({
  towers,
  value,
  onChange,
  towerName,
  label = "Tower",
  allowAll = true,
  excludeIds = [],
}: {
  towers: TowerMaterialRecord[];
  value: string;
  onChange: (towerId: string) => void;
  towerName: (towerId: unknown) => string;
  label?: string;
  allowAll?: boolean;
  excludeIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const excluded = useMemo(
    () => new Set(excludeIds.map(clean).filter(Boolean)),
    [excludeIds],
  );

  const indexed = useMemo<IndexedTower[]>(() => {
    return towers
      .map((tower) => {
        const id = clean(tower.id);
        const towerLabel = towerName(tower.id) || clean(tower.name) || "Tower";
        const line = clean(tower.line);

        return {
          tower,
          id,
          label: towerLabel,
          line,
          search: [towerLabel, clean(tower.name), line]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        };
      })
      .filter((row) => row.id && !excluded.has(row.id))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [excluded, towerName, towers]);

  const matches = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return indexed;
    return indexed.filter((row) => row.search.includes(q));
  }, [deferredQuery, indexed]);

  const selectedLabel = value
    ? towerName(value)
    : allowAll
      ? "All Towers"
      : "Select Tower";

  function close() {
    setQuery("");
    setOpen(false);
  }

  function choose(next: string) {
    onChange(next);
    close();
  }

  return (
    <>
      <View style={styles.wrapper}>
        <Text style={styles.label}>{label.toUpperCase()}</Text>
        <Pressable style={styles.button} onPress={() => setOpen(true)}>
          <Text style={styles.buttonText} numberOfLines={1}>
            {selectedLabel || "Select Tower"}
          </Text>
          <ChevronDown size={17} color="#64748b" />
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.modalTitle}>{label}</Text>
                <Text style={styles.modalSubtitle}>
                  Search by tower name or number.
                </Text>
              </View>

              <Pressable style={styles.close} onPress={close} hitSlop={8}>
                <X size={20} color="#475569" />
              </Pressable>
            </View>

            <View style={styles.searchBox}>
              <Search size={17} color="#64748b" />
              <TextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="Search tower…"
                placeholderTextColor="#94a3b8"
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {query ? (
                <Pressable onPress={() => setQuery("")} hitSlop={8}>
                  <X size={17} color="#94a3b8" />
                </Pressable>
              ) : null}
            </View>

            <FlatList
              data={matches}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={5}
              removeClippedSubviews
              style={styles.list}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={
                allowAll ? (
                  <Pressable
                    style={[styles.option, !value && styles.optionActive]}
                    onPress={() => choose("")}
                  >
                    <Text style={styles.optionTitle}>All Towers</Text>
                    <Text style={styles.optionMeta}>Show the whole project</Text>
                  </Pressable>
                ) : null
              }
              ListEmptyComponent={
                <Text style={styles.empty}>No towers match that search.</Text>
              }
              renderItem={({ item }) => {
                const active = item.id === value;

                return (
                  <Pressable
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => choose(item.id)}
                  >
                    <Text style={styles.optionTitle} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {item.line ? (
                      <Text style={styles.optionMeta} numberOfLines={1}>
                        {item.line}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              }}
            />

            <Text style={styles.resultText}>
              {matches.length} {matches.length === 1 ? "tower" : "towers"}
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  label: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    color: "#64748b",
  },
  button: {
    height: 42,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    borderRadius: 11,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  buttonText: {
    flex: 1,
    minWidth: 0,
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
  },
  modal: {
    maxHeight: "82%",
    borderRadius: 20,
    backgroundColor: "#f8fafc",
    padding: 15,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
  },
  modalSubtitle: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 11,
  },
  close: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    borderRadius: 11,
    paddingHorizontal: 11,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: "#0f172a",
    paddingVertical: 10,
    fontSize: 13,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: 7,
    paddingBottom: 2,
  },
  option: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
    justifyContent: "center",
  },
  optionActive: {
    borderColor: "#60a5fa",
    backgroundColor: "#eff6ff",
  },
  optionTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0f172a",
  },
  optionMeta: {
    marginTop: 2,
    fontSize: 10,
    color: "#64748b",
  },
  empty: {
    paddingVertical: 24,
    textAlign: "center",
    color: "#64748b",
    fontSize: 12,
  },
  resultText: {
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "800",
    textAlign: "right",
  },
});

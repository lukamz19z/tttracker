import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { TowerMaterialRecord } from "@/types/materials";

const clean = (value: unknown) => String(value ?? "").trim();

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

  const excluded = useMemo(
    () => new Set(excludeIds.map(clean).filter(Boolean)),
    [excludeIds],
  );

  const available = useMemo(
    () =>
      towers
        .filter((tower) => !excluded.has(clean(tower.id)))
        .sort((a, b) => towerName(a.id).localeCompare(towerName(b.id))),
    [excluded, towerName, towers],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = !q
      ? available
      : available.filter((tower) =>
          [
            towerName(tower.id),
            clean(tower.name),
            clean(tower.line),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q),
        );

    return filtered.slice(0, 8);
  }, [available, query, towerName]);

  const selectedLabel = value
    ? towerName(value)
    : allowAll
      ? "All Towers"
      : "Select Tower";

  function choose(next: string) {
    onChange(next);
    setQuery("");
    setOpen(false);
  }

  return (
    <>
      <View style={styles.wrapper}>
        <Text style={styles.label}>{label.toUpperCase()}</Text>
        <Pressable style={styles.button} onPress={() => setOpen(true)}>
          <Text style={styles.buttonText}>{selectedLabel}</Text>
          <Text style={styles.chevron}>⌄</Text>
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{label}</Text>
                <Text style={styles.modalSubtitle}>
                  Search by tower name or number.
                </Text>
              </View>
              <Pressable
                style={styles.close}
                onPress={() => {
                  setQuery("");
                  setOpen(false);
                }}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Search tower…"
              style={styles.searchInput}
              autoCapitalize="none"
            />

            {allowAll ? (
              <Pressable
                style={[
                  styles.option,
                  !value && styles.optionActive,
                ]}
                onPress={() => choose("")}
              >
                <Text style={styles.optionTitle}>All Towers</Text>
              </Pressable>
            ) : null}

            {matches.map((tower) => {
              const id = clean(tower.id);
              const active = id === value;

              return (
                <Pressable
                  key={id}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => choose(id)}
                >
                  <Text style={styles.optionTitle}>{towerName(tower.id)}</Text>
                  {clean(tower.line) ? (
                    <Text style={styles.optionMeta}>{clean(tower.line)}</Text>
                  ) : null}
                </Pressable>
              );
            })}

            {!matches.length ? (
              <Text style={styles.empty}>No towers match that search.</Text>
            ) : available.length > matches.length ? (
              <Text style={styles.hint}>
                Type more of the tower name or number to narrow the results.
              </Text>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    color: "#64748b",
  },
  button: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    borderRadius: 13,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  buttonText: {
    flex: 1,
    color: "#0f172a",
    fontWeight: "900",
  },
  chevron: {
    fontSize: 22,
    color: "#64748b",
  },
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
  },
  modal: {
    borderRadius: 18,
    backgroundColor: "#f8fafc",
    padding: 16,
    gap: 8,
    maxHeight: "86%",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 3,
  },
  modalTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: "#0f172a",
  },
  modalSubtitle: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 12,
  },
  close: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    fontSize: 28,
    lineHeight: 30,
    color: "#475569",
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#0f172a",
  },
  option: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  optionActive: {
    borderColor: "#60a5fa",
    backgroundColor: "#eff6ff",
  },
  optionTitle: {
    fontWeight: "900",
    color: "#0f172a",
  },
  optionMeta: {
    marginTop: 2,
    fontSize: 10,
    color: "#64748b",
  },
  empty: {
    paddingVertical: 18,
    textAlign: "center",
    color: "#64748b",
  },
  hint: {
    paddingTop: 3,
    fontSize: 10,
    color: "#64748b",
    textAlign: "center",
  },
});

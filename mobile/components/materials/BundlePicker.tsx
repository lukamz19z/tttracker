import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { BundleRecord } from "@/types/materials";

const clean = (value: unknown) => String(value ?? "").trim();

export function BundlePicker({
  bundles,
  value,
  onChange,
  towerName,
  currentQty,
  label,
  placeholder = "Search bundle number or section",
}: {
  bundles: BundleRecord[];
  value: string;
  onChange: (bundleId: string) => void;
  towerName: (towerId: unknown) => string;
  currentQty?: (bundle: BundleRecord) => number;
  label: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = bundles.find((bundle) => clean(bundle.id) === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = !q
      ? bundles
      : bundles.filter((bundle) =>
          [
            clean(bundle.bundle_no),
            clean(bundle.section),
            towerName(bundle.tower_id),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q),
        );

    return filtered.slice(0, 8);
  }, [bundles, query, towerName]);

  const choose = (bundleId: string) => {
    onChange(bundleId);
    setQuery("");
    setOpen(false);
  };

  return (
    <>
      <View style={styles.wrapper}>
        <Text style={styles.label}>{label.toUpperCase()}</Text>
        <Pressable style={styles.button} onPress={() => setOpen(true)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.buttonText}>
              {selected
                ? `Bundle ${clean(selected.bundle_no)}`
                : `Select ${label.toLowerCase()}`}
            </Text>
            {selected ? (
              <Text style={styles.buttonMeta}>
                {towerName(selected.tower_id)}
                {clean(selected.section) ? ` · ${clean(selected.section)}` : ""}
              </Text>
            ) : null}
          </View>
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
                  Search instead of scrolling through the register.
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setQuery("");
                  setOpen(false);
                }}
                style={styles.close}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder={placeholder}
              autoCapitalize="none"
              style={styles.search}
            />

            {matches.map((bundle) => {
              const id = clean(bundle.id);
              const active = id === value;

              return (
                <Pressable
                  key={id}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => choose(id)}
                >
                  <Text style={styles.optionTitle}>
                    Bundle {clean(bundle.bundle_no) || "—"}
                  </Text>
                  <Text style={styles.optionMeta}>
                    {towerName(bundle.tower_id)}
                    {clean(bundle.section) ? ` · ${clean(bundle.section)}` : ""}
                    {currentQty
                      ? ` · Available ${currentQty(bundle)}`
                      : ""}
                  </Text>
                </Pressable>
              );
            })}

            {!matches.length ? (
              <Text style={styles.empty}>No bundles match that search.</Text>
            ) : bundles.length > matches.length ? (
              <Text style={styles.hint}>
                Type more of the bundle number or section to narrow the results.
              </Text>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    color: "#64748b",
  },
  button: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 13,
    backgroundColor: "#fff",
    paddingHorizontal: 13,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  buttonText: {
    color: "#0f172a",
    fontWeight: "900",
  },
  buttonMeta: {
    marginTop: 2,
    fontSize: 10,
    color: "#64748b",
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
  },
  modalTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: "#0f172a",
  },
  modalSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748b",
  },
  close: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    fontSize: 28,
    color: "#475569",
    lineHeight: 30,
  },
  search: {
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
    padding: 11,
  },
  optionActive: {
    borderColor: "#60a5fa",
    backgroundColor: "#eff6ff",
  },
  optionTitle: {
    color: "#0f172a",
    fontWeight: "900",
  },
  optionMeta: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 10,
  },
  empty: {
    textAlign: "center",
    color: "#64748b",
    paddingVertical: 16,
  },
  hint: {
    textAlign: "center",
    fontSize: 10,
    color: "#64748b",
    paddingTop: 3,
  },
});

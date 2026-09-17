import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export type FinancePickerOption = {
  value: string;
  label: string;
  subtitle?: string;
};

export function FinancePicker({
  label,
  value,
  options,
  onChange,
  placeholder = "Select…",
  allowNone = true,
  noneLabel = "None",
}: {
  label: string;
  value: string;
  options: FinancePickerOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((option) => option.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const rows = !q
      ? options
      : options.filter((option) =>
          `${option.label} ${option.subtitle ?? ""}`
            .toLowerCase()
            .includes(q),
        );

    return rows.slice(0, 10);
  }, [options, query]);

  function choose(next: string) {
    onChange(next);
    setQuery("");
    setOpen(false);
  }

  return (
    <>
      <View style={styles.wrapper}>
        <Text style={styles.label}>{label}</Text>
        <Pressable style={styles.button} onPress={() => setOpen(true)}>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.buttonText,
                !selected && !value && styles.placeholder,
              ]}
              numberOfLines={1}
            >
              {selected?.label || (value ? value : placeholder)}
            </Text>
            {selected?.subtitle ? (
              <Text style={styles.buttonMeta} numberOfLines={1}>
                {selected.subtitle}
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
                <Text style={styles.title}>{label}</Text>
                <Text style={styles.subtitle}>
                  Search instead of scrolling through the full register.
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
              placeholder={`Search ${label.toLowerCase()}…`}
              autoCapitalize="none"
              style={styles.search}
            />

            {allowNone ? (
              <Pressable
                style={[
                  styles.option,
                  !value && styles.optionActive,
                ]}
                onPress={() => choose("")}
              >
                <Text style={styles.optionTitle}>{noneLabel}</Text>
              </Pressable>
            ) : null}

            {filtered.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.option,
                  option.value === value && styles.optionActive,
                ]}
                onPress={() => choose(option.value)}
              >
                <Text style={styles.optionTitle}>{option.label}</Text>
                {option.subtitle ? (
                  <Text style={styles.optionMeta}>
                    {option.subtitle}
                  </Text>
                ) : null}
              </Pressable>
            ))}

            {!filtered.length ? (
              <Text style={styles.empty}>No matches.</Text>
            ) : options.length > filtered.length ? (
              <Text style={styles.hint}>
                Type more to narrow the results.
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
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
  },
  button: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  buttonText: {
    color: "#0f172a",
    fontWeight: "800",
  },
  placeholder: {
    color: "#94a3b8",
    fontWeight: "600",
  },
  buttonMeta: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 10,
  },
  chevron: {
    fontSize: 22,
    color: "#64748b",
  },
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    backgroundColor: "rgba(15,23,42,0.48)",
  },
  modal: {
    borderRadius: 18,
    backgroundColor: "#f8fafc",
    padding: 16,
    gap: 8,
    maxHeight: "88%",
  },
  header: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  title: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900",
  },
  subtitle: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 2,
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
  search: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 11,
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
    color: "#64748b",
    fontSize: 10,
    marginTop: 2,
  },
  empty: {
    paddingVertical: 18,
    textAlign: "center",
    color: "#64748b",
  },
  hint: {
    color: "#64748b",
    textAlign: "center",
    fontSize: 10,
    paddingTop: 4,
  },
});

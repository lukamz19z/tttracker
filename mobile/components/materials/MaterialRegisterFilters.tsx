import { Search, X } from "lucide-react-native";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { TowerPicker } from "@/components/materials/TowerPicker";
import type { TowerMaterialRecord } from "@/types/materials";

export type MaterialFilterOption = {
  value: string;
  label: string;
  count?: number;
};

export function MaterialRegisterFilters({
  towers,
  towerId,
  onTowerChange,
  towerName,
  query,
  onQueryChange,
  placeholder,
  filterLabel,
  options = [],
  filterValue = "",
  onFilterChange,
  resultCount,
}: {
  towers: TowerMaterialRecord[];
  towerId: string;
  onTowerChange: (towerId: string) => void;
  towerName: (towerId: unknown) => string;
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  filterLabel?: string;
  options?: MaterialFilterOption[];
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  resultCount?: number;
}) {
  return (
    <View style={styles.card}>
      <TowerPicker
        towers={towers}
        value={towerId}
        onChange={onTowerChange}
        towerName={towerName}
        label="Tower"
        allowAll
      />

      <View style={styles.searchBox}>
        <Search size={17} color="#64748b" />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={styles.searchInput}
        />
        {query ? (
          <Pressable onPress={() => onQueryChange("")} hitSlop={8}>
            <X size={17} color="#94a3b8" />
          </Pressable>
        ) : null}
      </View>

      {options.length && onFilterChange ? (
        <View style={styles.filterBlock}>
          {filterLabel ? (
            <Text style={styles.filterLabel}>{filterLabel.toUpperCase()}</Text>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.chips}
          >
            {options.map((option) => {
              const active = option.value === filterValue;
              return (
                <Pressable
                  key={option.value || "all"}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => onFilterChange(option.value)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      active && styles.chipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {option.label}
                    {typeof option.count === "number" ? ` ${option.count}` : ""}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {typeof resultCount === "number" ? (
        <Text style={styles.results}>
          {resultCount} {resultCount === 1 ? "result" : "results"}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 11,
    gap: 9,
  },
  searchBox: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    borderRadius: 11,
    paddingHorizontal: 11,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: "#0f172a",
    paddingVertical: 9,
    fontSize: 13,
  },
  filterBlock: {
    gap: 5,
  },
  filterLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
    color: "#64748b",
  },
  chips: {
    gap: 6,
    paddingRight: 8,
  },
  chip: {
    height: 32,
    maxWidth: 190,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dbe3ee",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    borderColor: "#60a5fa",
    backgroundColor: "#eff6ff",
  },
  chipText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "800",
  },
  chipTextActive: {
    color: "#1d4ed8",
  },
  results: {
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "800",
    textAlign: "right",
  },
});

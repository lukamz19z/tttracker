import { router, type Href } from "expo-router";
import { ClipboardCheck, Plus, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { QualityShell } from "@/components/quality/QualityShell";
import { QualityStatusPill } from "@/components/quality/QualityStatusPill";
import { useQuality } from "@/contexts/QualityContext";

export default function RevisionsScreen() {
  const { data, loading } = useQuality();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const towerById = useMemo(() => new Map((data?.towers ?? []).map((row) => [row.id, row.name || row.id])), [data?.towers]);
  const itemCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of data?.items ?? []) map.set(item.revision_id, (map.get(item.revision_id) ?? 0) + 1);
    return map;
  }, [data?.items]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.revisions ?? []).filter((row) => {
      if (status !== "All" && row.status !== status) return false;
      if (!q) return true;
      return [row.fli_number, row.inspection_stage, row.client_inspector, row.client_company, row.client_reference, row.notes, towerById.get(row.tower_id)].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [data?.revisions, query, status, towerById]);

  return (
    <QualityShell permission="mobile.rectifications" root title="Revisions / Rectifications" subtitle="Capture flags, before evidence and rectification evidence against the same Revision register used on the website.">
      <View style={styles.topRow}>
        <View style={styles.search}><Search size={17} color="#64748b" /><TextInput value={query} onChangeText={setQuery} placeholder="Search revision, tower, reference…" placeholderTextColor="#94a3b8" style={styles.searchInput} /></View>
        <Pressable style={styles.newButton} onPress={() => router.push("/revisions/new" as Href)}><Plus size={18} color="#fff" /><Text style={styles.newText}>New</Text></Pressable>
      </View>
      <View style={styles.filters}>{["All", ...(data?.workflow.revisionStatuses ?? [])].map((value) => <Pressable key={value} style={[styles.filter, status === value && styles.filterActive]} onPress={() => setStatus(value)}><Text style={[styles.filterText, status === value && styles.filterTextActive]}>{value}</Text></Pressable>)}</View>
      {loading && !data ? <ActivityIndicator /> : null}
      {!loading && rows.length === 0 ? <View style={styles.empty}><ClipboardCheck size={30} color="#94a3b8" /><Text style={styles.emptyTitle}>No matching Revisions</Text></View> : null}
      {rows.map((row) => <Pressable key={row.id} style={styles.card} onPress={() => router.push(`/revisions/${encodeURIComponent(row.id)}` as Href)}>
        <View style={styles.cardHead}><View style={{ flex: 1 }}><Text style={styles.number}>{row.fli_number || "Revision"}</Text><Text style={styles.tower}>{towerById.get(row.tower_id) || "Tower"} · {row.inspection_stage}</Text></View><QualityStatusPill value={row.status} /></View>
        <Text style={styles.meta}>{row.inspection_date} · {itemCounts.get(row.id) ?? 0} finding{(itemCounts.get(row.id) ?? 0) === 1 ? "" : "s"}</Text>
        {row.client_reference ? <Text style={styles.meta}>Client ref: {row.client_reference}</Text> : null}
      </Pressable>)}
    </QualityShell>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", gap: 8 }, search: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#fff", borderRadius: 13, paddingHorizontal: 12 }, searchInput: { flex: 1, minHeight: 44, color: "#0f172a" }, newButton: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#2563eb", borderRadius: 13, paddingHorizontal: 14 }, newText: { color: "#fff", fontWeight: "900" }, filters: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, filter: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: "#e2e8f0" }, filterActive: { backgroundColor: "#0f172a" }, filterText: { color: "#475569", fontSize: 11, fontWeight: "800" }, filterTextActive: { color: "#fff" }, card: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 16, padding: 15, gap: 7 }, cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 }, number: { color: "#0f172a", fontWeight: "900", fontSize: 15 }, tower: { color: "#64748b", fontSize: 11, marginTop: 3, fontWeight: "700" }, meta: { color: "#64748b", fontSize: 11 }, empty: { alignItems: "center", padding: 30, backgroundColor: "#fff", borderRadius: 16 }, emptyTitle: { marginTop: 9, color: "#64748b", fontWeight: "800" },
});

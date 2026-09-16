import { useFocusEffect, useRouter, type Href } from "expo-router";
import { AlertTriangle, CheckCircle2, Clock3, Plus, RefreshCw, ShieldAlert } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { PermissionScreen } from "@/components/common/PermissionScreen";
import { getMyTraining } from "@/lib/api/training";
import type { TrainingPayload, TrainingRecord } from "@/types/training";

function daysUntil(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function status(record: TrainingRecord) {
  if (record.workflow_status === "pending_review") return { key: "pending", label: "Pending Review", tone: "amber" };
  if (record.workflow_status === "changes_required") return { key: "changes", label: "Changes Required", tone: "orange" };
  if (record.workflow_status === "rejected" || record.record_status === "rejected") return { key: "rejected", label: "Rejected", tone: "red" };
  if (record.revoked_at || record.record_status === "revoked") return { key: "rejected", label: "Revoked", tone: "red" };
  if (record.superseded_at || record.current_version === false) return { key: "history", label: "Superseded", tone: "slate" };
  if (record.does_not_expire) return { key: "current", label: "Current", tone: "green" };
  const days = daysUntil(record.expiry_date);
  if (days !== null && days < 0) return { key: "expired", label: "Expired", tone: "red" };
  if (days !== null && days <= 60) return { key: "expiring", label: `Expires in ${days}d`, tone: "amber" };
  return { key: "current", label: "Current", tone: "green" };
}

export default function TrainingScreen() {
  const router = useRouter();
  const [data, setData] = useState<TrainingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setData(await getMyTraining());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Training could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const currentRecords = useMemo(
    () => (data?.records ?? []).filter((record) => record.current_version !== false && !record.superseded_at),
    [data?.records],
  );
  const summary = useMemo(() => {
    const rows = currentRecords.map(status);
    return {
      current: rows.filter((row) => row.key === "current").length,
      expiring: rows.filter((row) => row.key === "expiring").length,
      pending: rows.filter((row) => row.key === "pending").length,
      issues: rows.filter((row) => ["expired", "changes", "rejected"].includes(row.key)).length,
    };
  }, [currentRecords]);

  return (
    <PermissionScreen permission="mobile.training">
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>MY RECORDS</Text>
            <Text style={styles.title}>Training, Tickets & Licences</Text>
            <Text style={styles.subtitle}>Your requirements and upload fields come from the same Training Configuration used by TTTracker web.</Text>
          </View>
          <Pressable style={styles.primary} onPress={() => router.push("/training/upload" as Href)}>
            <Plus size={18} color="#fff" />
            <Text style={styles.primaryText}>Upload</Text>
          </Pressable>
        </View>

        <View style={styles.metrics}>
          <Metric label="Current" value={summary.current} icon={<CheckCircle2 size={18} color="#047857" />} />
          <Metric label="Expiring" value={summary.expiring} icon={<Clock3 size={18} color="#b45309" />} />
          <Metric label="Pending" value={summary.pending} icon={<RefreshCw size={18} color="#2563eb" />} />
          <Metric label="Action" value={summary.issues} icon={<ShieldAlert size={18} color="#be123c" />} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {data?.message ? <Text style={styles.notice}>{data.message}</Text> : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Training</Text>
          <Pressable onPress={() => void load(true)} disabled={refreshing}>
            {refreshing ? <ActivityIndicator /> : <RefreshCw size={18} color="#475569" />}
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 40 }} />
        ) : currentRecords.length === 0 ? (
          <View style={styles.empty}>
            <AlertTriangle size={28} color="#94a3b8" />
            <Text style={styles.emptyTitle}>No Training records yet</Text>
            <Text style={styles.emptyText}>Use Upload to add your first ticket, licence, VOC or certificate.</Text>
          </View>
        ) : (
          currentRecords.map((record) => {
            const state = status(record);
            return (
              <Pressable key={record.id} style={styles.card} onPress={() => router.push(`/training/${encodeURIComponent(record.id)}` as Href)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{record.training_name}</Text>
                  <Text style={styles.cardMeta}>
                    {[record.training_short_code, record.certificate_number ? `No. ${record.certificate_number}` : null]
                      .filter(Boolean)
                      .join(" · ") || "Training record"}
                  </Text>
                  {record.expiry_date ? <Text style={styles.cardMeta}>Expiry: {record.expiry_date}</Text> : null}
                </View>
                <StatusPill label={state.label} tone={state.tone} />
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </PermissionScreen>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <View style={styles.metric}><View style={styles.metricTop}>{icon}<Text style={styles.metricValue}>{value}</Text></View><Text style={styles.metricLabel}>{label}</Text></View>;
}

function StatusPill({ label, tone }: { label: string; tone: string }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    green: { bg: "#ecfdf5", fg: "#047857" }, amber: { bg: "#fffbeb", fg: "#b45309" }, orange: { bg: "#fff7ed", fg: "#c2410c" }, red: { bg: "#fff1f2", fg: "#be123c" }, slate: { bg: "#f1f5f9", fg: "#475569" },
  };
  const c = palette[tone] ?? palette.slate;
  return <View style={[styles.pill, { backgroundColor: c.bg }]}><Text style={[styles.pillText, { color: c.fg }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc" }, content: { padding: 16, paddingBottom: 40, gap: 14 },
  hero: { flexDirection: "row", gap: 12, alignItems: "flex-start", backgroundColor: "#fff", borderRadius: 22, padding: 18, borderWidth: 1, borderColor: "#e2e8f0" },
  kicker: { color: "#2563eb", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 }, title: { color: "#0f172a", fontSize: 23, fontWeight: "900", marginTop: 4 }, subtitle: { color: "#64748b", fontSize: 12, lineHeight: 18, marginTop: 6 },
  primary: { backgroundColor: "#2563eb", borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, flexDirection: "row", gap: 6, alignItems: "center" }, primaryText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 9 }, metric: { width: "48%", flexGrow: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 16, padding: 13 }, metricTop: { flexDirection: "row", alignItems: "center", gap: 8 }, metricValue: { color: "#0f172a", fontSize: 20, fontWeight: "900" }, metricLabel: { color: "#64748b", fontSize: 11, fontWeight: "700", marginTop: 5 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }, sectionTitle: { color: "#0f172a", fontSize: 17, fontWeight: "900" },
  card: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "#fff", borderRadius: 17, padding: 15, borderWidth: 1, borderColor: "#e2e8f0" }, cardTitle: { color: "#0f172a", fontSize: 15, fontWeight: "900" }, cardMeta: { color: "#64748b", fontSize: 11, marginTop: 4 },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, maxWidth: 110 }, pillText: { fontSize: 9, fontWeight: "900", textAlign: "center" },
  empty: { alignItems: "center", padding: 30, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 18 }, emptyTitle: { marginTop: 8, color: "#0f172a", fontWeight: "900" }, emptyText: { marginTop: 5, color: "#64748b", fontSize: 12, textAlign: "center" },
  error: { backgroundColor: "#fff1f2", color: "#be123c", borderRadius: 12, padding: 12, fontSize: 12, fontWeight: "700" }, notice: { backgroundColor: "#fffbeb", color: "#92400e", borderRadius: 12, padding: 12, fontSize: 12, fontWeight: "700" },
});

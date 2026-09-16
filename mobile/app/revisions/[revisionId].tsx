import { router, type Href, useLocalSearchParams } from "expo-router";
import { Camera, Plus } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { QualitySelector, type QualitySelectorOption } from "@/components/quality/QualitySelector";
import { QualityShell, qualityStyles as q } from "@/components/quality/QualityShell";
import { QualityStatusPill } from "@/components/quality/QualityStatusPill";
import { useQuality } from "@/contexts/QualityContext";
import { useSync } from "@/contexts/SyncContext";
import { shareQualityFile, updateRevision } from "@/lib/api/quality";
import type { RevisionStatus } from "@/types/quality";

export default function RevisionDetailScreen() {
  const { revisionId } = useLocalSearchParams<{ revisionId: string }>();
  const { data, refresh } = useQuality();
  const { online } = useSync();
  const revision = data?.revisions.find((row) => row.id === revisionId) ?? null;
  const tower = data?.towers.find((row) => row.id === revision?.tower_id) ?? null;
  const items = useMemo(() => (data?.items ?? []).filter((row) => row.revision_id === revisionId).sort((a, b) => (a.item_number ?? 0) - (b.item_number ?? 0)), [data?.items, revisionId]);
  const files = useMemo(() => (data?.files ?? []).filter((row) => row.revision_id === revisionId), [data?.files, revisionId]);
  const issueById = useMemo(() => new Map((data?.issueTypes ?? []).map((row) => [row.id, row.name])), [data?.issueTypes]);
  const [statusSelector, setStatusSelector] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!revision) return <QualityShell permission="mobile.rectifications" title="Revision"><Text style={q.error}>Revision not found in the current project cache. Pull to refresh.</Text></QualityShell>;

  async function changeStatus(status: RevisionStatus) {
    if (!online) return Alert.alert("Connection required", "Revision status changes require a connection.");
    setBusy(true);
    try { await updateRevision(revision!.id, { status }); await refresh(); }
    catch (error) { Alert.alert("Update failed", error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(false); }
  }

  const statusOptions: QualitySelectorOption[] = (data?.workflow.revisionStatuses ?? []).map((value) => ({ id: value, label: value }));

  return <QualityShell permission="mobile.rectifications" title={revision.fli_number || "Revision"} subtitle={`${tower?.name || "Tower"} · ${revision.inspection_stage}`}>
    <View style={q.card}>
      <View style={q.row}><QualityStatusPill value={revision.status} /><Text style={[q.muted, { flex: 1, textAlign: "right" }]}>{revision.inspection_date}</Text></View>
      {revision.client_inspector ? <Text style={q.muted}>Inspector: {revision.client_inspector}{revision.client_company ? ` · ${revision.client_company}` : ""}</Text> : null}
      {revision.client_reference ? <Text style={q.muted}>Client reference: {revision.client_reference}</Text> : null}
      {revision.notes ? <Text style={q.muted}>{revision.notes}</Text> : null}
      <Pressable disabled={busy} style={q.secondary} onPress={() => setStatusSelector(true)}><Text style={q.secondaryText}>Update Revision Status</Text></Pressable>
    </View>

    <View style={styles.headingRow}><Text style={styles.sectionTitle}>Findings</Text><Pressable style={styles.add} onPress={() => router.push(`/revisions/${encodeURIComponent(revision.id)}/new-finding` as Href)}><Plus size={16} color="#fff" /><Text style={styles.addText}>Add Finding</Text></Pressable></View>
    {items.length === 0 ? <Text style={q.muted}>No findings recorded.</Text> : null}
    {items.map((item) => {
      const itemFiles = files.filter((file) => file.revision_item_id === item.id && ["before_photo", "after_photo"].includes(file.file_role));
      return <Pressable key={item.id} style={q.card} onPress={() => router.push(`/revisions/${encodeURIComponent(revision.id)}/items/${encodeURIComponent(item.id)}` as Href)}>
        <View style={q.row}><Text style={[q.cardTitle, { flex: 1 }]}>Finding {String(item.item_number ?? "").padStart(3, "0")}</Text><QualityStatusPill value={item.status} /></View>
        <Text style={q.muted}>{issueById.get(item.issue_type_id ?? "") || item.other_issue_text || "Other"}</Text>
        <Text style={{ color: "#334155", lineHeight: 19 }}>{item.finding || "No finding description"}</Text>
        <View style={q.row}><Camera size={14} color="#64748b" /><Text style={q.muted}>{itemFiles.length} evidence file{itemFiles.length === 1 ? "" : "s"}</Text></View>
      </Pressable>;
    })}

    {files.filter((file) => file.file_role === "revision_pdf").length ? <View style={q.card}><Text style={q.cardTitle}>Generated Revision PDFs</Text>{files.filter((file) => file.file_role === "revision_pdf").map((file) => <Pressable key={file.id} style={styles.file} onPress={() => void shareQualityFile(file.id, file.file_name)}><Text style={styles.fileName}>{file.file_name}</Text><Text style={styles.open}>Open</Text></Pressable>)}</View> : null}
    <QualitySelector visible={statusSelector} title="Revision Status" options={statusOptions} onClose={() => setStatusSelector(false)} onSelect={(option) => void changeStatus(option.id as RevisionStatus)} />
  </QualityShell>;
}

const styles = StyleSheet.create({ headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, sectionTitle: { fontSize: 18, fontWeight: "900", color: "#0f172a" }, add: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#2563eb", borderRadius: 11, paddingHorizontal: 11, paddingVertical: 8 }, addText: { color: "#fff", fontWeight: "900", fontSize: 11 }, file: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }, fileName: { flex: 1, color: "#334155", fontWeight: "700", fontSize: 12 }, open: { color: "#2563eb", fontWeight: "900", fontSize: 12 } });

import { router, type Href, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { QualityPhotoPicker } from "@/components/quality/QualityPhotoPicker";
import { QualityShell, qualityStyles as q } from "@/components/quality/QualityShell";
import { QualityStatusPill } from "@/components/quality/QualityStatusPill";
import { useQuality } from "@/contexts/QualityContext";
import { useSync } from "@/contexts/SyncContext";
import { shareQualityFile } from "@/lib/api/quality";
import { enqueueRevisionItemUpdate } from "@/lib/offline/quality-sync";
import type { LocalQualityPhoto } from "@/types/quality";

export default function RevisionItemScreen() {
  const { revisionId, itemId } = useLocalSearchParams<{ revisionId: string; itemId: string }>();
  const { data, refresh } = useQuality(); const { online, syncNow } = useSync();
  const revision = data?.revisions.find((row) => row.id === revisionId) ?? null; const item = data?.items.find((row) => row.id === itemId && row.revision_id === revisionId) ?? null; const tower = data?.towers.find((row) => row.id === revision?.tower_id) ?? null; const issue = data?.issueTypes.find((row) => row.id === item?.issue_type_id) ?? null;
  const files = useMemo(() => (data?.files ?? []).filter((row) => row.revision_item_id === itemId && ["before_photo", "after_photo"].includes(row.file_role)), [data?.files, itemId]);
  const beforeFiles = files.filter((row) => row.file_role === "before_photo"); const afterFiles = files.filter((row) => row.file_role === "after_photo");
  const [comment, setComment] = useState(item?.rectification_comment ?? ""); const [afterPhotos, setAfterPhotos] = useState<LocalQualityPhoto[]>([]); const [saving, setSaving] = useState(false);
  if (!revision || !item) return <QualityShell permission="mobile.rectifications" title="Finding"><Text style={q.error}>Finding not found in the current project cache.</Text></QualityShell>;
  async function rectify() { if (!comment.trim()) return Alert.alert("Comment required", "Describe the rectification completed."); if (afterPhotos.length === 0 && afterFiles.length === 0) return Alert.alert("After photo required", "Capture evidence after rectification."); setSaving(true); try { await enqueueRevisionItemUpdate({ revisionId: revision!.id, itemId: item!.id, projectId: revision!.project_id, towerId: revision!.tower_id, rectificationComment: comment.trim(), status: "Rectified", afterPhotos }); if (online) { await syncNow(); await refresh(); } Alert.alert(online ? "Rectification saved" : "Saved offline", online ? "The finding has been marked Rectified." : "The rectification will sync automatically when TTTracker reconnects.", [{ text: "OK", onPress: () => router.replace(`/revisions/${encodeURIComponent(revision!.id)}` as Href) }]); } catch (error) { Alert.alert("Could not save", error instanceof Error ? error.message : "Please try again."); } finally { setSaving(false); } }
  return <QualityShell permission="mobile.rectifications" title={`Finding ${String(item.item_number ?? "").padStart(3, "0")}`} subtitle={`${revision.fli_number || "Revision"} · ${tower?.name || "Tower"}`}>
    <View style={q.card}><View style={q.row}><QualityStatusPill value={item.status} /><Text style={[q.muted, { flex: 1, textAlign: "right" }]}>{issue?.name || item.other_issue_text || "Other"}</Text></View><Text style={q.cardTitle}>{item.finding || "No finding description"}</Text><Text style={q.muted}>{[item.tower_segment, item.member_number ? `Member ${item.member_number}` : "", item.drawing_number ? `Drawing ${item.drawing_number}` : ""].filter(Boolean).join(" · ") || "No steel reference"}</Text></View>
    <View style={q.card}><Text style={q.cardTitle}>Before Evidence</Text>{beforeFiles.map((file) => <Pressable key={file.id} style={styles.file} onPress={() => void shareQualityFile(file.id, file.file_name)}><Text style={styles.fileName}>{file.file_name}</Text><Text style={styles.open}>Open</Text></Pressable>)}{!beforeFiles.length ? <Text style={q.muted}>No synced before evidence.</Text> : null}</View>
    <View style={q.card}><Text style={q.cardTitle}>After Evidence</Text>{afterFiles.map((file) => <Pressable key={file.id} style={styles.file} onPress={() => void shareQualityFile(file.id, file.file_name)}><Text style={styles.fileName}>{file.file_name}</Text><Text style={styles.open}>Open</Text></Pressable>)}<Text style={q.fieldLabel}>Rectification Comment *</Text><TextInput value={comment} onChangeText={setComment} multiline style={[q.input, styles.textarea]} /><QualityPhotoPicker label="Add after photos" photos={afterPhotos} onChange={setAfterPhotos} prefix="revision-after" /><Pressable disabled={saving} style={q.primary} onPress={() => void rectify()}><Text style={q.primaryText}>{saving ? "Saving…" : online ? "Mark Rectified" : "Save Rectification Offline"}</Text></Pressable></View>
  </QualityShell>;
}
const styles = StyleSheet.create({ textarea: { minHeight: 90, textAlignVertical: "top", paddingTop: 12 }, file: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }, fileName: { flex: 1, color: "#334155", fontWeight: "700", fontSize: 12 }, open: { color: "#2563eb", fontWeight: "900", fontSize: 12 } });

import { router, type Href, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { QualityPhotoPicker } from "@/components/quality/QualityPhotoPicker";
import { QualitySelector, type QualitySelectorOption } from "@/components/quality/QualitySelector";
import { QualityShell, qualityStyles as q } from "@/components/quality/QualityShell";
import { useQuality } from "@/contexts/QualityContext";
import { useSync } from "@/contexts/SyncContext";
import { enqueueRevisionItemCreate } from "@/lib/offline/quality-sync";
import type { LocalQualityPhoto } from "@/types/quality";

export default function NewFindingScreen() {
  const { revisionId } = useLocalSearchParams<{ revisionId: string }>();
  const { data, refresh } = useQuality();
  const { online, syncNow } = useSync();
  const revision = data?.revisions.find((row) => row.id === revisionId) ?? null;
  const tower = data?.towers.find((row) => row.id === revision?.tower_id) ?? null;
  const [issueTypeId, setIssueTypeId] = useState(""); const [otherIssue, setOtherIssue] = useState(""); const [memberId, setMemberId] = useState(""); const [finding, setFinding] = useState(""); const [rectification, setRectification] = useState(""); const [beforePhotos, setBeforePhotos] = useState<LocalQualityPhoto[]>([]); const [afterPhotos, setAfterPhotos] = useState<LocalQualityPhoto[]>([]); const [selector, setSelector] = useState<"issue" | "member" | null>(null); const [saving, setSaving] = useState(false);
  const issue = data?.issueTypes.find((row) => row.id === issueTypeId) ?? null; const member = data?.members.find((row) => row.id === memberId) ?? null;
  const options = useMemo<QualitySelectorOption[]>(() => selector === "issue" ? [...(data?.issueTypes ?? []).filter((row) => row.active && (row.applies_to === "revision" || row.applies_to === "both")).map((row) => ({ id: row.id, label: row.name })), { id: "__other__", label: "Other / unlisted issue" }] : (data?.members ?? []).filter((row) => row.tower_id === revision?.tower_id).map((row) => ({ id: row.id, label: row.mark_no || "Member", subtitle: [row.tower_segment, row.drawing_number, row.bundle_reference].filter(Boolean).join(" · ") })), [data, revision?.tower_id, selector]);
  if (!revision) return <QualityShell permission="mobile.rectifications" title="New Finding"><Text style={q.error}>Revision not found in the current project cache.</Text></QualityShell>;
  async function save() {
    if (!issueTypeId) return Alert.alert("Issue required", "Select a common issue or Other."); if (issueTypeId === "__other__" && !otherIssue.trim()) return Alert.alert("Issue details required", "Enter the issue details."); if (!finding.trim()) return Alert.alert("Finding required", "Describe the finding."); if (!beforePhotos.length) return Alert.alert("Before photo required", "Capture the before condition before removing the flag.");
    setSaving(true); try { await enqueueRevisionItemCreate({ revisionId: revision!.id, projectId: revision!.project_id, towerId: revision!.tower_id, issueTypeId: issueTypeId === "__other__" ? null : issueTypeId, otherIssueText: issueTypeId === "__other__" ? otherIssue.trim() : null, towerSegment: member?.tower_segment ?? null, memberNumber: member?.mark_no ?? null, drawingNumber: member?.drawing_number ?? null, finding: finding.trim(), rectificationComment: rectification.trim() || null, status: afterPhotos.length ? "Rectified" : "Open", beforePhotos, afterPhotos }); if (online) { await syncNow(); await refresh(); } Alert.alert(online ? "Finding saved" : "Saved offline", online ? "The finding has been added." : "It will sync automatically when TTTracker reconnects.", [{ text: "OK", onPress: () => router.replace(`/revisions/${encodeURIComponent(revision!.id)}` as Href) }]); } catch (error) { Alert.alert("Could not save finding", error instanceof Error ? error.message : "Please try again."); } finally { setSaving(false); }
  }
  return <QualityShell permission="mobile.rectifications" title="Add Finding" subtitle={`${revision.fli_number || "Revision"} · ${tower?.name || "Tower"}`}>
    <Field label="Common Issue" value={issueTypeId === "__other__" ? "Other / unlisted issue" : issue?.name || "Select issue"} onPress={() => setSelector("issue")} />{issueTypeId === "__other__" ? <><Text style={q.fieldLabel}>Other Issue</Text><TextInput value={otherIssue} onChangeText={setOtherIssue} style={q.input} /></> : null}<Field label="Member (optional)" value={member ? [member.mark_no, member.tower_segment, member.drawing_number].filter(Boolean).join(" · ") : "Select member"} onPress={() => setSelector("member")} /><Text style={q.fieldLabel}>Finding *</Text><TextInput value={finding} onChangeText={setFinding} multiline style={[q.input, styles.textarea]} /><QualityPhotoPicker label="Before photos" required photos={beforePhotos} onChange={setBeforePhotos} prefix="revision-before" /><Text style={q.fieldLabel}>Rectification Comment</Text><TextInput value={rectification} onChangeText={setRectification} multiline style={[q.input, styles.textarea]} placeholder="Optional until rectified" /><QualityPhotoPicker label="After photos (if rectified now)" photos={afterPhotos} onChange={setAfterPhotos} prefix="revision-after" /><Pressable disabled={saving} style={q.primary} onPress={() => void save()}><Text style={q.primaryText}>{saving ? "Saving…" : online ? "Save Finding" : "Save Finding Offline"}</Text></Pressable><QualitySelector visible={selector !== null} title={`Select ${selector ?? "option"}`} options={options} onClose={() => setSelector(null)} onSelect={(option) => selector === "issue" ? setIssueTypeId(option.id) : setMemberId(option.id)} />
  </QualityShell>;
}
function Field({ label, value, onPress }: { label: string; value: string; onPress: () => void }) { return <View style={{ gap: 6 }}><Text style={q.fieldLabel}>{label}</Text><Pressable style={q.select} onPress={onPress}><Text style={q.selectText}>{value}</Text></Pressable></View>; }
const styles = StyleSheet.create({ textarea: { minHeight: 90, textAlignVertical: "top", paddingTop: 12 } });

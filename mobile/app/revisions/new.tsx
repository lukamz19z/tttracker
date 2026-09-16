import { router, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { QualityPhotoPicker } from "@/components/quality/QualityPhotoPicker";
import { QualitySelector, type QualitySelectorOption } from "@/components/quality/QualitySelector";
import { QualityShell, qualityStyles as q } from "@/components/quality/QualityShell";
import { useAuth } from "@/contexts/AuthContext";
import { useQuality } from "@/contexts/QualityContext";
import { useSync } from "@/contexts/SyncContext";
import { enqueueRevisionCreate } from "@/lib/offline/quality-sync";
import type { InspectionStage, LocalQualityPhoto } from "@/types/quality";

function today() { return new Date().toISOString().slice(0, 10); }

export default function NewRevisionScreen() {
  const { profile } = useAuth();
  const { data, refresh } = useQuality();
  const { online, syncNow } = useSync();
  const [towerId, setTowerId] = useState("");
  const [stage, setStage] = useState<InspectionStage>("Post Assembly");
  const [inspectionDate, setInspectionDate] = useState(today());
  const [clientInspector, setClientInspector] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientReference, setClientReference] = useState("");
  const [notes, setNotes] = useState("");
  const [issueTypeId, setIssueTypeId] = useState("");
  const [otherIssue, setOtherIssue] = useState("");
  const [memberId, setMemberId] = useState("");
  const [finding, setFinding] = useState("");
  const [rectification, setRectification] = useState("");
  const [beforePhotos, setBeforePhotos] = useState<LocalQualityPhoto[]>([]);
  const [afterPhotos, setAfterPhotos] = useState<LocalQualityPhoto[]>([]);
  const [selector, setSelector] = useState<"tower" | "stage" | "issue" | "member" | null>(null);
  const [saving, setSaving] = useState(false);

  const tower = data?.towers.find((row) => row.id === towerId) ?? null;
  const issue = data?.issueTypes.find((row) => row.id === issueTypeId) ?? null;
  const member = data?.members.find((row) => row.id === memberId) ?? null;
  const options = useMemo<QualitySelectorOption[]>(() => {
    if (selector === "tower") return (data?.towers ?? []).map((row) => ({ id: row.id, label: row.name || row.id }));
    if (selector === "stage") return (data?.workflow.inspectionStages ?? []).map((value) => ({ id: value, label: value }));
    if (selector === "issue") return [...(data?.issueTypes ?? []).filter((row) => row.active && (row.applies_to === "revision" || row.applies_to === "both")).map((row) => ({ id: row.id, label: row.name })), { id: "__other__", label: "Other / unlisted issue" }];
    if (selector === "member") return (data?.members ?? []).filter((row) => row.tower_id === towerId).map((row) => ({ id: row.id, label: row.mark_no || "Member", subtitle: [row.tower_segment, row.drawing_number, row.bundle_reference].filter(Boolean).join(" · ") }));
    return [];
  }, [data, selector, towerId]);

  async function save() {
    const projectId = profile?.projectId;
    if (!projectId) return Alert.alert("Project required", "Select your current project first.");
    if (!towerId) return Alert.alert("Tower required", "Select the tower.");
    if (!issueTypeId) return Alert.alert("Issue required", "Select a common issue or Other.");
    if (issueTypeId === "__other__" && !otherIssue.trim()) return Alert.alert("Issue details required", "Enter the issue details for Other.");
    if (!finding.trim()) return Alert.alert("Finding required", "Describe the finding / flag.");
    if (beforePhotos.length === 0) return Alert.alert("Before photo required", "Capture the before condition before the physical flag is removed.");
    setSaving(true);
    try {
      await enqueueRevisionCreate({
        projectId, towerId, inspectionStage: stage, inspectionDate,
        clientInspector: clientInspector.trim() || null, clientCompany: clientCompany.trim() || null,
        clientReference: clientReference.trim() || null, notes: notes.trim() || null,
        firstFinding: {
          issueTypeId: issueTypeId === "__other__" ? null : issueTypeId,
          otherIssueText: issueTypeId === "__other__" ? otherIssue.trim() : null,
          towerSegment: member?.tower_segment ?? null, memberNumber: member?.mark_no ?? null,
          drawingNumber: member?.drawing_number ?? null, finding: finding.trim(),
          rectificationComment: rectification.trim() || null,
          status: afterPhotos.length ? "Rectified" : "Open",
          beforePhotos, afterPhotos,
        },
      });
      if (online) { await syncNow(); await refresh(); }
      Alert.alert(online ? "Revision saved" : "Saved offline", online ? "The Revision and first finding have been added." : "They will sync automatically when TTTracker reconnects.", [{ text: "OK", onPress: () => router.replace("/(drawer)/revisions" as Href) }]);
    } catch (error) { Alert.alert("Could not save Revision", error instanceof Error ? error.message : "Please try again."); }
    finally { setSaving(false); }
  }

  return <QualityShell permission="mobile.rectifications" title="New Revision" subtitle="Create the Revision and capture its first field finding in one workflow.">
    <Field label="Tower" value={tower?.name || "Select tower"} onPress={() => setSelector("tower")} />
    <Field label="Inspection Stage" value={stage} onPress={() => setSelector("stage")} />
    <Text style={q.fieldLabel}>Inspection Date</Text><TextInput value={inspectionDate} onChangeText={setInspectionDate} style={q.input} placeholder="YYYY-MM-DD" />
    <Text style={q.fieldLabel}>Client Inspector</Text><TextInput value={clientInspector} onChangeText={setClientInspector} style={q.input} placeholder="Optional" />
    <Text style={q.fieldLabel}>Client Company</Text><TextInput value={clientCompany} onChangeText={setClientCompany} style={q.input} placeholder="Optional" />
    <Text style={q.fieldLabel}>Client Reference</Text><TextInput value={clientReference} onChangeText={setClientReference} style={q.input} placeholder="Optional" />
    <Text style={q.fieldLabel}>Revision Notes</Text><TextInput value={notes} onChangeText={setNotes} multiline style={[q.input, styles.textarea]} placeholder="Optional" />
    <View style={styles.divider} /><Text style={styles.sectionTitle}>First Finding</Text>
    <Field label="Common Issue" value={issueTypeId === "__other__" ? "Other / unlisted issue" : issue?.name || "Select issue"} onPress={() => setSelector("issue")} />
    {issueTypeId === "__other__" ? <><Text style={q.fieldLabel}>Other Issue</Text><TextInput value={otherIssue} onChangeText={setOtherIssue} style={q.input} /></> : null}
    {towerId ? <Field label="Member (optional)" value={member ? [member.mark_no, member.tower_segment, member.drawing_number].filter(Boolean).join(" · ") : "Select member"} onPress={() => setSelector("member")} /> : null}
    <Text style={q.fieldLabel}>Finding *</Text><TextInput value={finding} onChangeText={setFinding} multiline style={[q.input, styles.textarea]} placeholder="Describe the condition / flag…" />
    <QualityPhotoPicker label="Before photos" required photos={beforePhotos} onChange={setBeforePhotos} prefix="revision-before" />
    <Text style={q.fieldLabel}>Rectification Comment</Text><TextInput value={rectification} onChangeText={setRectification} multiline style={[q.input, styles.textarea]} placeholder="Leave blank if not yet rectified" />
    <QualityPhotoPicker label="After photos (if already rectified)" photos={afterPhotos} onChange={setAfterPhotos} prefix="revision-after" />
    <Pressable disabled={saving} style={q.primary} onPress={() => void save()}><Text style={q.primaryText}>{saving ? "Saving…" : online ? "Save Revision" : "Save Revision Offline"}</Text></Pressable>
    <QualitySelector visible={selector !== null} title={`Select ${selector ?? "option"}`} options={options} onClose={() => setSelector(null)} onSelect={(option) => {
      if (selector === "tower") { setTowerId(option.id); setMemberId(""); }
      if (selector === "stage") setStage(option.id as InspectionStage);
      if (selector === "issue") setIssueTypeId(option.id);
      if (selector === "member") setMemberId(option.id);
    }} />
  </QualityShell>;
}

function Field({ label, value, onPress }: { label: string; value: string; onPress: () => void }) { return <View style={{ gap: 6 }}><Text style={q.fieldLabel}>{label}</Text><Pressable style={q.select} onPress={onPress}><Text style={q.selectText}>{value}</Text></Pressable></View>; }
const styles = StyleSheet.create({ textarea: { minHeight: 90, textAlignVertical: "top", paddingTop: 12 }, divider: { height: 1, backgroundColor: "#cbd5e1", marginVertical: 4 }, sectionTitle: { fontSize: 18, fontWeight: "900", color: "#0f172a" } });

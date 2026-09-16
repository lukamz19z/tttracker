import { router, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { QualityPhotoPicker } from "@/components/quality/QualityPhotoPicker";
import { QualitySelector, type QualitySelectorOption } from "@/components/quality/QualitySelector";
import { QualityShell, qualityStyles as q } from "@/components/quality/QualityShell";
import { useAuth } from "@/contexts/AuthContext";
import { useQuality } from "@/contexts/QualityContext";
import { useSync } from "@/contexts/SyncContext";
import { getDefectAssignees } from "@/lib/api/quality";
import { enqueueDefectCreate } from "@/lib/offline/quality-sync";
import type { DefectAssignee, DefectSeverity, LocalQualityPhoto } from "@/types/quality";

export default function NewDefectScreen() {
  const { profile } = useAuth();
  const { data, refresh } = useQuality();
  const { online, syncNow } = useSync();
  const [towerId, setTowerId] = useState("");
  const [issueTypeId, setIssueTypeId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [description, setDescription] = useState("");
  const [responsibility, setResponsibility] = useState("");
  const [clientReference, setClientReference] = useState("");
  const [severity, setSeverity] = useState<DefectSeverity>("Minor");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [photos, setPhotos] = useState<LocalQualityPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [selector, setSelector] = useState<"tower" | "issue" | "member" | "severity" | "assignee" | null>(null);
  const [assignees, setAssignees] = useState<DefectAssignee[]>([]);

  const tower = data?.towers.find((row) => row.id === towerId) ?? null;
  const issue = data?.issueTypes.find((row) => row.id === issueTypeId) ?? null;
  const member = data?.members.find((row) => row.id === memberId) ?? null;
  const assignee = assignees.find((row) => row.id === assignedToUserId) ?? null;

  useEffect(() => {
    if (!profile?.projectId || !online) return;
    void getDefectAssignees(profile.projectId).then(setAssignees).catch(() => setAssignees([]));
  }, [online, profile?.projectId]);

  const options = useMemo<QualitySelectorOption[]>(() => {
    if (selector === "tower") return (data?.towers ?? []).map((row) => ({ id: row.id, label: row.name || row.id }));
    if (selector === "issue") {
      return [
        ...(data?.issueTypes ?? []).filter((row) => row.active && (row.applies_to === "defect" || row.applies_to === "both")).map((row) => ({ id: row.id, label: row.name })),
        { id: "__other__", label: "Other / unlisted issue" },
      ];
    }
    if (selector === "member") return (data?.members ?? []).filter((row) => row.tower_id === towerId).map((row) => ({ id: row.id, label: row.mark_no || "Member", subtitle: [row.tower_segment, row.drawing_number, row.bundle_reference].filter(Boolean).join(" · ") }));
    if (selector === "severity") return (data?.workflow.defectSeverities ?? []).map((value) => ({ id: value, label: value }));
    if (selector === "assignee") return [{ id: "", label: "Unassigned" }, ...assignees.map((row) => ({ id: row.id, label: row.name, subtitle: [row.role, row.email].filter(Boolean).join(" · ") }))];
    return [];
  }, [assignees, data, selector, towerId]);

  function choose(option: QualitySelectorOption) {
    if (selector === "tower") {
      setTowerId(option.id);
      setMemberId("");
    }
    if (selector === "issue") setIssueTypeId(option.id);
    if (selector === "member") setMemberId(option.id);
    if (selector === "severity") setSeverity(option.id as DefectSeverity);
    if (selector === "assignee") setAssignedToUserId(option.id);
  }

  async function save() {
    const projectId = profile?.projectId;
    if (!projectId) return Alert.alert("Project required", "Select your current project first.");
    if (!towerId) return Alert.alert("Tower required", "Select the affected tower.");
    if (!issueTypeId) return Alert.alert("Issue required", "Select a common issue or Other.");
    if (!description.trim()) return Alert.alert("Description required", "Describe the Defect.");

    setSaving(true);
    try {
      await enqueueDefectCreate({
        projectId,
        towerId,
        issueTypeId: issueTypeId === "__other__" ? null : issueTypeId,
        memberNumber: member?.mark_no ?? null,
        segment: member?.tower_segment ?? null,
        drawingNumber: member?.drawing_number ?? null,
        description: description.trim(),
        responsibility: responsibility.trim() || null,
        clientReference: clientReference.trim() || null,
        severity,
        assignedToUserId: assignedToUserId || null,
        photos,
      });
      if (online) {
        await syncNow();
        await refresh();
      }
      Alert.alert(online ? "Defect saved" : "Saved offline", online ? "The Defect has been added to the controlled register." : "The Defect will upload automatically when TTTracker reconnects.", [
        { text: "OK", onPress: () => router.replace("/(drawer)/defects" as Href) },
      ]);
    } catch (error) {
      Alert.alert("Could not save Defect", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <QualityShell permission="mobile.defects" title="New Defect" subtitle="Issue types and material references come from the current project configuration.">
      <Field label="Tower" value={tower?.name || "Select tower"} onPress={() => setSelector("tower")} />
      <Field label="Common Issue" value={issueTypeId === "__other__" ? "Other / unlisted issue" : issue?.name || "Select issue"} onPress={() => setSelector("issue")} />
      {towerId ? <Field label="Member (optional)" value={member ? [member.mark_no, member.tower_segment, member.drawing_number].filter(Boolean).join(" · ") : "Select member"} onPress={() => setSelector("member")} /> : null}
      <Text style={q.fieldLabel}>Description *</Text>
      <TextInput value={description} onChangeText={setDescription} multiline placeholder="Describe what was found…" style={[q.input, styles.textarea]} />
      <Text style={q.fieldLabel}>Responsibility</Text>
      <TextInput value={responsibility} onChangeText={setResponsibility} placeholder="Optional" style={q.input} />
      <Text style={q.fieldLabel}>Client Reference</Text>
      <TextInput value={clientReference} onChangeText={setClientReference} placeholder="Optional" style={q.input} />
      <Field label="Severity" value={severity} onPress={() => setSelector("severity")} />
      <Field label="Assigned To" value={assignee?.name || "Unassigned"} onPress={() => setSelector("assignee")} />
      <QualityPhotoPicker label="Evidence photos" photos={photos} onChange={setPhotos} prefix="defect" />
      <Pressable disabled={saving} style={[q.primary, saving && styles.disabled]} onPress={() => void save()}>
        <Text style={q.primaryText}>{saving ? "Saving…" : online ? "Save Defect" : "Save Defect Offline"}</Text>
      </Pressable>
      <QualitySelector visible={selector !== null} title={`Select ${selector ?? "option"}`} options={options} onClose={() => setSelector(null)} onSelect={choose} />
    </QualityShell>
  );
}

function Field({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return <View style={{ gap: 6 }}><Text style={q.fieldLabel}>{label}</Text><Pressable style={q.select} onPress={onPress}><Text style={q.selectText}>{value}</Text></Pressable></View>;
}

const styles = StyleSheet.create({ textarea: { minHeight: 110, textAlignVertical: "top", paddingTop: 12 }, disabled: { opacity: 0.55 } });

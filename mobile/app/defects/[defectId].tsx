import { useLocalSearchParams } from "expo-router";
import { Camera, MessageSquarePlus } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { QualityPhotoPicker } from "@/components/quality/QualityPhotoPicker";
import { QualitySelector, type QualitySelectorOption } from "@/components/quality/QualitySelector";
import { QualityShell, qualityStyles as q } from "@/components/quality/QualityShell";
import { QualityStatusPill } from "@/components/quality/QualityStatusPill";
import { useAuth } from "@/contexts/AuthContext";
import { useQuality } from "@/contexts/QualityContext";
import { useSync } from "@/contexts/SyncContext";
import { addDefectAction, getDefectAssignees, shareQualityFile, updateDefect, uploadQualityPhoto } from "@/lib/api/quality";
import { removeOfflineFile } from "@/lib/offline/files";
import type { DefectAssignee, DefectSeverity, DefectStatus, LocalQualityPhoto } from "@/types/quality";

export default function DefectDetailScreen() {
  const { defectId } = useLocalSearchParams<{ defectId: string }>();
  const { profile } = useAuth();
  const { data, refresh } = useQuality();
  const { online } = useSync();
  const defect = data?.defects.find((row) => row.id === defectId) ?? null;
  const tower = data?.towers.find((row) => row.id === defect?.tower_id) ?? null;
  const issue = data?.issueTypes.find((row) => row.id === defect?.issue_type_id) ?? null;
  const files = useMemo(() => (data?.files ?? []).filter((row) => row.defect_id === defectId && row.file_role === "defect_photo"), [data?.files, defectId]);
  const [status, setStatus] = useState<DefectStatus | null>(null);
  const [severity, setSeverity] = useState<DefectSeverity | null>(null);
  const [resolution, setResolution] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<DefectAssignee[]>([]);
  const [selector, setSelector] = useState<"status" | "severity" | "assignee" | null>(null);
  const [action, setAction] = useState("");
  const [photos, setPhotos] = useState<LocalQualityPhoto[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!defect) return;
    setStatus(defect.status);
    setSeverity(defect.severity);
    setResolution(defect.resolution_notes ?? "");
    setAssignedToUserId(defect.assigned_to_user_id);
  }, [defect]);

  useEffect(() => {
    if (!profile?.projectId || !online) return;
    void getDefectAssignees(profile.projectId).then(setAssignees).catch(() => setAssignees([]));
  }, [online, profile?.projectId]);

  if (!defect) {
    return <QualityShell permission="mobile.defects" title="Defect" subtitle="This Defect is not in the current project cache."><Text style={q.error}>Pull to refresh the Quality cache. If it still does not appear, confirm your current project.</Text></QualityShell>;
  }

  const currentDefect = defect;

  const selectorOptions: QualitySelectorOption[] = selector === "status"
    ? (data?.workflow.defectStatuses ?? []).map((value) => ({ id: value, label: value }))
    : selector === "severity"
      ? (data?.workflow.defectSeverities ?? []).map((value) => ({ id: value, label: value }))
      : [{ id: "", label: "Unassigned" }, ...assignees.map((row) => ({ id: row.id, label: row.name, subtitle: [row.role, row.email].filter(Boolean).join(" · ") }))];

  async function save() {
    if (!online) return Alert.alert("Connection required", "Existing controlled Defects can only be edited while online. New Defects can still be captured offline.");
    setBusy(true);
    try {
      await updateDefect(currentDefect.id, {
        status: status ?? currentDefect.status,
        severity: severity ?? currentDefect.severity,
        resolutionNotes: resolution.trim() || null,
        assignedToUserId: assignedToUserId || null,
      });
      await refresh();
    } catch (error) {
      Alert.alert("Update failed", error instanceof Error ? error.message : "Please try again.");
    } finally { setBusy(false); }
  }

  async function addActionNote() {
    if (!action.trim()) return;
    setBusy(true);
    try {
      await addDefectAction(currentDefect.id, action.trim());
      setAction("");
      Alert.alert("Action added", "The action has been added to the controlled Defect history.");
    } catch (error) { Alert.alert("Action failed", error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(false); }
  }

  async function uploadPhotos() {
    if (!online || photos.length === 0) return;
    setBusy(true);
    try {
      for (const photo of photos) {
        await uploadQualityPhoto({ projectId: currentDefect.project_id, towerId: currentDefect.tower_id, defectId: currentDefect.id, fileRole: "defect_photo", uri: photo.uri, name: photo.name, mimeType: photo.mimeType, capturedAt: photo.capturedAt });
        await removeOfflineFile(photo.uri);
      }
      setPhotos([]);
      await refresh();
    } catch (error) { Alert.alert("Upload failed", error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <QualityShell permission="mobile.defects" title={defect.defect_number || "Defect"} subtitle={`${tower?.name || "Tower"} · ${issue?.name || "Other"}`}>
      <View style={q.card}>
        <View style={q.row}><QualityStatusPill value={defect.severity} /><QualityStatusPill value={defect.status} /></View>
        <Text style={q.cardTitle}>{defect.description}</Text>
        <Text style={q.muted}>{[defect.segment, defect.member_number ? `Member ${defect.member_number}` : "", defect.drawing_number ? `Drawing ${defect.drawing_number}` : ""].filter(Boolean).join(" · ") || "No steel reference"}</Text>
        {defect.client_reference ? <Text style={q.muted}>Client reference: {defect.client_reference}</Text> : null}
        {defect.identified_by_label ? <Text style={q.muted}>Identified by {defect.identified_by_label}</Text> : null}
      </View>

      <Text style={q.fieldLabel}>Status</Text>
      <Pressable style={q.select} onPress={() => setSelector("status")}><Text style={q.selectText}>{status || defect.status}</Text></Pressable>
      <Text style={q.fieldLabel}>Severity</Text>
      <Pressable style={q.select} onPress={() => setSelector("severity")}><Text style={q.selectText}>{severity || defect.severity}</Text></Pressable>
      <Text style={q.fieldLabel}>Assigned To</Text>
      <Pressable style={q.select} onPress={() => setSelector("assignee")}><Text style={q.selectText}>{assignees.find((row) => row.id === assignedToUserId)?.name || defect.assigned_to_label || "Unassigned"}</Text></Pressable>
      <Text style={q.fieldLabel}>Resolution Notes</Text>
      <TextInput value={resolution} onChangeText={setResolution} multiline style={[q.input, styles.textarea]} placeholder="Resolution / close-out notes" />
      <Pressable disabled={busy} style={q.primary} onPress={() => void save()}><Text style={q.primaryText}>{busy ? "Saving…" : "Save Changes"}</Text></Pressable>

      <View style={q.card}>
        <View style={q.row}><Camera size={18} color="#2563eb" /><Text style={q.cardTitle}>Evidence ({files.length})</Text></View>
        {files.map((file) => <Pressable key={file.id} style={styles.file} onPress={() => void shareQualityFile(file.id, file.file_name)}><Text style={styles.fileName}>{file.file_name}</Text><Text style={styles.open}>Open</Text></Pressable>)}
        <QualityPhotoPicker label="Add photos" photos={photos} onChange={setPhotos} prefix={`defect-${defect.id}`} />
        {photos.length ? <Pressable disabled={busy || !online} style={q.secondary} onPress={() => void uploadPhotos()}><Text style={q.secondaryText}>{online ? "Upload Evidence" : "Reconnect to upload"}</Text></Pressable> : null}
      </View>

      <View style={q.card}>
        <View style={q.row}><MessageSquarePlus size={18} color="#2563eb" /><Text style={q.cardTitle}>Add Action</Text></View>
        <TextInput value={action} onChangeText={setAction} multiline style={[q.input, styles.textarea]} placeholder="Record an action / site update…" />
        <Pressable disabled={busy || !online || !action.trim()} style={q.secondary} onPress={() => void addActionNote()}><Text style={q.secondaryText}>Add to History</Text></Pressable>
      </View>

      <QualitySelector visible={selector !== null} title={`Select ${selector ?? "option"}`} options={selectorOptions} onClose={() => setSelector(null)} onSelect={(option) => {
        if (selector === "status") setStatus(option.id as DefectStatus);
        if (selector === "severity") setSeverity(option.id as DefectSeverity);
        if (selector === "assignee") setAssignedToUserId(option.id || null);
      }} />
    </QualityShell>
  );
}

const styles = StyleSheet.create({
  textarea: { minHeight: 90, textAlignVertical: "top", paddingTop: 12 },
  file: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  fileName: { flex: 1, color: "#334155", fontWeight: "700", fontSize: 12 },
  open: { color: "#2563eb", fontWeight: "900", fontSize: 12 },
});

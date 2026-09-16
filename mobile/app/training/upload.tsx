import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Camera, Check, ChevronDown, FileUp, ImagePlus, Save, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  completeChangesRequiredResubmission,
  getMyTraining,
  uploadTraining,
  type PickedTrainingFile,
} from "@/lib/api/training";
import { PermissionScreen } from "@/components/common/PermissionScreen";
import type { TrainingField, TrainingPayload, TrainingType } from "@/types/training";

function clean(value: unknown) { return String(value ?? "").trim(); }

function addInterval(issueDate: string, value: number | null, unit: string | null) {
  if (!issueDate || !value || !unit) return "";
  const date = new Date(`${issueDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  if (unit === "days") date.setDate(date.getDate() + value);
  if (unit === "weeks") date.setDate(date.getDate() + value * 7);
  if (unit === "months") date.setMonth(date.getMonth() + value);
  if (unit === "years") date.setFullYear(date.getFullYear() + value);
  return date.toISOString().slice(0, 10);
}

function fieldOptions(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

export default function TrainingUploadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ trainingTypeId?: string; replaceRecordId?: string; changesRecordId?: string }>();
  const [data, setData] = useState<TrainingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [typePicker, setTypePicker] = useState(false);

  const [trainingTypeId, setTrainingTypeId] = useState(String(params.trainingTypeId ?? ""));
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");
  const [issuer, setIssuer] = useState("");
  const [certificateNumber, setCertificateNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [metadata, setMetadata] = useState<Record<string, unknown>>({});
  const [singleFile, setSingleFile] = useState<PickedTrainingFile | null>(null);
  const [frontFile, setFrontFile] = useState<PickedTrainingFile | null>(null);
  const [backFile, setBackFile] = useState<PickedTrainingFile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await getMyTraining();
      setData(payload);

      const changesId = String(params.changesRecordId ?? "");
      const changesRecord = payload.records.find((record) => record.id === changesId);
      if (changesRecord) {
        setTrainingTypeId(changesRecord.training_type_id ?? "");
        setSelectedOptionIds(changesRecord.option_ids ?? []);
        setProjectId(changesRecord.project_id ?? "");
        setIssuer(changesRecord.provider ?? changesRecord.issuing_authority ?? "");
        setCertificateNumber(changesRecord.certificate_number ?? "");
        setIssueDate(changesRecord.issue_date ?? "");
        setExpiryDate(changesRecord.expiry_date ?? "");
        setNotes(changesRecord.notes ?? "");
        setMetadata(changesRecord.metadata ?? {});
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Training configuration could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [params.changesRecordId]);

  useEffect(() => { void load(); }, [load]);

  const selectedType = data?.types.find((type) => type.id === trainingTypeId) ?? null;
  const typeOptions = (data?.options ?? []).filter((option) => option.training_type_id === trainingTypeId);
  const typeFields = (data?.fields ?? []).filter((field) => field.training_type_id === trainingTypeId);
  const selectedOptions = typeOptions.filter((option) => selectedOptionIds.includes(option.id));

  const approvedCurrentRecords = useMemo(
    () =>
      (data?.records ?? []).filter(
        (record) =>
          record.training_type_id === trainingTypeId &&
          record.workflow_status === "approved" &&
          record.current_version !== false &&
          !record.superseded_at &&
          !record.revoked_at,
      ),
    [data?.records, trainingTypeId],
  );

  useEffect(() => {
    if (!selectedType) return;
    if (selectedType.validity_mode === "never") setExpiryDate("");
    if (selectedType.validity_mode === "automatic" && issueDate) {
      setExpiryDate(addInterval(issueDate, selectedType.validity_interval_value, selectedType.validity_interval_unit));
    }
  }, [issueDate, selectedType]);

  const explicitReplaceId = String(params.replaceRecordId ?? "");
  const changesRecordId = String(params.changesRecordId ?? "");
  const changesRecord = data?.records.find((record) => record.id === changesRecordId) ?? null;
  const replacementId =
    changesRecord?.supersedes_record_id ??
    explicitReplaceId ??
    (selectedType?.allows_multiple_current === false && approvedCurrentRecords.length === 1 ? approvedCurrentRecords[0]?.id : "") ??
    "";

  function validate(type: TrainingType) {
    if (!data?.employee?.id) return "Your login is not linked to an employee profile.";
    if (type.requires_project && !projectId) return "Select the project.";
    if (type.requires_issuer && !issuer.trim()) return "Enter the provider / issuing organisation.";
    if (type.requires_certificate_number && !certificateNumber.trim()) return "Enter the certificate or licence number.";
    if (type.requires_issue_date && !issueDate) return "Enter the issue date.";
    if (type.validity_mode !== "never" && type.requires_expiry_date && !expiryDate) return "Enter the expiry date.";
    for (const field of typeFields) {
      const value = metadata[field.field_key];
      if (field.required && (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0) || (field.field_type === "checkbox" && value !== true))) return `Enter ${field.label}.`;
    }
    if (type.requires_document) {
      if (type.document_upload_type === "front_back" && (!frontFile || !backFile)) return "Add both the front and back evidence.";
      if (type.document_upload_type !== "front_back" && !singleFile) return "Add the required certificate / licence evidence.";
    }
    return null;
  }

  async function submit() {
    if (!selectedType) return;
    const validation = validate(selectedType);
    if (validation) { Alert.alert("Check Training record", validation); return; }
    if (!data?.employee?.id) return;

    setSubmitting(true);
    setMessage(null);
    try {
      const result = await uploadTraining({
        employeeId: data.employee.id,
        trainingTypeId: selectedType.id,
        projectId,
        issuer,
        certificateNumber,
        issueDate,
        expiryDate,
        notes,
        metadata,
        selectedOptionIds,
        selectedOptionCodes: selectedOptions.map((option) => option.code),
        documentUploadType: selectedType.document_upload_type || (selectedType.requires_document ? "single" : "none"),
        replacementMode: replacementId ? "replace" : approvedCurrentRecords.length > 0 && selectedType.allows_multiple_current ? "add" : "none",
        supersedesRecordId: replacementId || undefined,
        file: singleFile,
        frontFile,
        backFile,
      });

      if (changesRecordId && result.recordId) {
        await completeChangesRequiredResubmission(changesRecordId, result.recordId);
      }

      Alert.alert(
        result.workflowStatus === "approved" ? "Training saved" : "Submitted for review",
        result.workflowStatus === "approved"
          ? "Your Training record is current and has been published through the controlled workflow."
          : "Your evidence is now waiting for a Training reviewer. You will be notified when it is approved, rejected or needs changes.",
        [{ text: "OK", onPress: () => router.replace("/(drawer)/training" as Href) }],
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Training record could not be uploaded.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <PermissionScreen permission="mobile.training"><View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View></PermissionScreen>;

  return (
    <PermissionScreen permission="mobile.training">
      <>
      <Stack.Screen options={{ headerShown: true, title: changesRecordId ? "Fix Training Submission" : "Upload Training" }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {message ? <Text style={styles.error}>{message}</Text> : null}

        <Card title="1. Training Type" hint="This configuration is shared with TTTracker web.">
          <Pressable style={styles.select} onPress={() => setTypePicker(true)}>
            <Text style={[styles.selectText, !selectedType && styles.placeholder]}>{selectedType ? `${selectedType.name}${selectedType.short_code ? ` (${selectedType.short_code})` : ""}` : "Select Training type"}</Text>
            <ChevronDown size={18} color="#64748b" />
          </Pressable>
        </Card>

        {selectedType ? (
          <>
            {typeOptions.length ? (
              <Card title="2. Classes / Endorsements">
                <View style={styles.chips}>
                  {typeOptions.map((option) => {
                    const checked = selectedOptionIds.includes(option.id);
                    const single = selectedType.subtype_mode === "single";
                    return (
                      <Pressable
                        key={option.id}
                        style={[styles.chip, checked && styles.chipActive]}
                        onPress={() => setSelectedOptionIds((current) => single ? [option.id] : checked ? current.filter((id) => id !== option.id) : [...current, option.id])}
                      >
                        {checked ? <Check size={14} color="#1d4ed8" /> : null}
                        <Text style={[styles.chipText, checked && styles.chipTextActive]}>{option.code || option.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            ) : null}

            <Card title="3. Details">
              {selectedType.requires_project ? <PickerField label="Project" value={data?.projects.find((p) => p.id === projectId)?.name ?? "Select project"} options={(data?.projects ?? []).map((p) => ({ id: p.id, label: `${p.projectNumber ? `${p.projectNumber} — ` : ""}${p.name}` }))} onSelect={setProjectId} /> : null}
              {selectedType.requires_issuer ? <TextField label="Provider / Issuer" value={issuer} onChangeText={setIssuer} /> : null}
              {selectedType.requires_certificate_number ? <TextField label="Certificate / Licence Number" value={certificateNumber} onChangeText={setCertificateNumber} /> : null}
              {(selectedType.requires_issue_date || selectedType.validity_mode === "automatic") ? <TextField label="Issue Date (YYYY-MM-DD)" value={issueDate} onChangeText={setIssueDate} keyboardType="numbers-and-punctuation" /> : null}
              {selectedType.validity_mode !== "never" && selectedType.requires_expiry_date ? <TextField label={selectedType.validity_mode === "automatic" ? "Expiry Date (automatic)" : "Expiry Date (YYYY-MM-DD)"} value={expiryDate} onChangeText={setExpiryDate} editable={selectedType.validity_mode !== "automatic"} /> : null}
              {selectedType.validity_mode === "never" ? <Text style={styles.helper}>This Training type is configured to not expire.</Text> : null}
              {typeFields.map((field) => <DynamicField key={field.id} field={field} value={metadata[field.field_key]} onChange={(value) => setMetadata((current) => ({ ...current, [field.field_key]: value }))} />)}
              <TextField label="Notes" value={notes} onChangeText={setNotes} multiline />
            </Card>

            {selectedType.requires_document ? (
              <Card title="4. Evidence" hint="Evidence stays in TTTracker staging until it is approved, then the server publishes it to SharePoint.">
                {selectedType.document_upload_type === "front_back" ? (
                  <>
                    <FileField label="Front" value={frontFile} onChange={setFrontFile} />
                    <FileField label="Back" value={backFile} onChange={setBackFile} />
                  </>
                ) : (
                  <FileField label="Certificate / Licence / Evidence" value={singleFile} onChange={setSingleFile} />
                )}
              </Card>
            ) : null}

            {changesRecord?.review_comment ? (
              <View style={styles.reviewNotice}><Text style={styles.reviewTitle}>Reviewer requested changes</Text><Text style={styles.reviewText}>{changesRecord.review_comment}</Text></View>
            ) : null}

            {replacementId ? <Text style={styles.helper}>This submission will replace the existing approved record only after the new evidence is approved.</Text> : null}

            <Pressable style={[styles.submit, submitting && styles.disabled]} onPress={() => void submit()} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Save size={19} color="#fff" />}
              <Text style={styles.submitText}>{submitting ? "Submitting…" : selectedType.requires_review === false ? "Save Training Record" : "Submit for Review"}</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>

      <Modal visible={typePicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setTypePicker(false)}>
        <View style={styles.modalHeader}><Text style={styles.modalTitle}>Training Type</Text><Pressable onPress={() => setTypePicker(false)}><X size={22} color="#334155" /></Pressable></View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          {(data?.types ?? []).map((type) => (
            <Pressable key={type.id} style={styles.modalRow} onPress={() => { setTrainingTypeId(type.id); setSelectedOptionIds([]); setMetadata({}); setSingleFile(null); setFrontFile(null); setBackFile(null); setTypePicker(false); }}>
              <Text style={styles.modalRowTitle}>{type.name}</Text>
              <Text style={styles.helper}>{type.short_code || type.category || "Training"}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Modal>
      </>
    </PermissionScreen>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{hint ? <Text style={styles.helper}>{hint}</Text> : null}<View style={{ gap: 13, marginTop: 12 }}>{children}</View></View>;
}
function TextField(props: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean; editable?: boolean; keyboardType?: "default" | "numbers-and-punctuation" }) {
  return <View><Text style={styles.label}>{props.label}</Text><TextInput style={[styles.input, props.multiline && { minHeight: 90, textAlignVertical: "top" }]} value={props.value} onChangeText={props.onChangeText} multiline={props.multiline} editable={props.editable !== false} keyboardType={props.keyboardType ?? "default"} placeholderTextColor="#94a3b8" /></View>;
}
function PickerField({ label, value, options, onSelect }: { label: string; value: string; options: Array<{ id: string; label: string }>; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return <View><Text style={styles.label}>{label}</Text><Pressable style={styles.select} onPress={() => setOpen(true)}><Text style={styles.selectText}>{value}</Text><ChevronDown size={18} color="#64748b" /></Pressable><Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}><View style={styles.modalHeader}><Text style={styles.modalTitle}>{label}</Text><Pressable onPress={() => setOpen(false)}><X size={22} color="#334155" /></Pressable></View><ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>{options.map((option) => <Pressable key={option.id} style={styles.modalRow} onPress={() => { onSelect(option.id); setOpen(false); }}><Text style={styles.modalRowTitle}>{option.label}</Text></Pressable>)}</ScrollView></Modal></View>;
}
function DynamicField({ field, value, onChange }: { field: TrainingField; value: unknown; onChange: (value: unknown) => void }) {
  const options = fieldOptions(field.options);
  if (field.field_type === "checkbox") return <View style={styles.switchRow}><View style={{ flex: 1 }}><Text style={styles.label}>{field.label}{field.required ? " *" : ""}</Text>{field.help_text ? <Text style={styles.helper}>{field.help_text}</Text> : null}</View><Switch value={Boolean(value)} onValueChange={onChange} /></View>;
  if (["select", "dropdown"].includes(field.field_type) && options.length) return <PickerField label={`${field.label}${field.required ? " *" : ""}`} value={clean(value) || field.placeholder || "Select"} options={options.map((option) => ({ id: option, label: option }))} onSelect={onChange} />;
  return <TextField label={`${field.label}${field.required ? " *" : ""}`} value={clean(value)} onChangeText={onChange} multiline={field.field_type === "textarea"} keyboardType={field.field_type === "number" ? "numbers-and-punctuation" : "default"} />;
}
function FileField({ label, value, onChange }: { label: string; value: PickedTrainingFile | null; onChange: (value: PickedTrainingFile | null) => void }) {
  async function camera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 });
    const asset = result.assets?.[0];
    if (asset) onChange({ uri: asset.uri, name: asset.fileName || `training-${Date.now()}.jpg`, mimeType: asset.mimeType || "image/jpeg" });
  }
  async function document() {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    const asset = result.assets?.[0];
    if (asset) onChange({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType || "application/octet-stream" });
  }
  return <View><Text style={styles.label}>{label}</Text>{value ? <View style={styles.fileSelected}><FileUp size={18} color="#2563eb" /><Text style={styles.fileName} numberOfLines={1}>{value.name}</Text><Pressable onPress={() => onChange(null)}><X size={18} color="#be123c" /></Pressable></View> : null}<View style={styles.fileActions}><Pressable style={styles.fileButton} onPress={() => void camera()}><Camera size={17} color="#2563eb" /><Text style={styles.fileButtonText}>Take Photo</Text></Pressable><Pressable style={styles.fileButton} onPress={() => void document()}><ImagePlus size={17} color="#2563eb" /><Text style={styles.fileButtonText}>Choose File</Text></Pressable></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc" }, content: { padding: 16, paddingBottom: 44, gap: 14 }, center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc" },
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 20, padding: 16 }, cardTitle: { color: "#0f172a", fontSize: 16, fontWeight: "900" }, helper: { color: "#64748b", fontSize: 11, lineHeight: 17, marginTop: 3 },
  label: { color: "#334155", fontWeight: "800", fontSize: 12, marginBottom: 6 }, input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 11, color: "#0f172a", fontSize: 13 },
  select: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, selectText: { color: "#0f172a", fontSize: 13, fontWeight: "700", flex: 1 }, placeholder: { color: "#94a3b8" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 }, chipActive: { borderColor: "#93c5fd", backgroundColor: "#eff6ff" }, chipText: { color: "#475569", fontWeight: "800", fontSize: 11 }, chipTextActive: { color: "#1d4ed8" },
  fileSelected: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#eff6ff", borderRadius: 12, padding: 10, marginBottom: 8 }, fileName: { flex: 1, color: "#1e3a8a", fontSize: 11, fontWeight: "800" }, fileActions: { flexDirection: "row", gap: 8 }, fileButton: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#bfdbfe", backgroundColor: "#eff6ff", borderRadius: 12, padding: 11 }, fileButtonText: { color: "#1d4ed8", fontSize: 11, fontWeight: "900" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 10 }, reviewNotice: { borderWidth: 1, borderColor: "#fed7aa", backgroundColor: "#fff7ed", borderRadius: 16, padding: 14 }, reviewTitle: { color: "#9a3412", fontWeight: "900" }, reviewText: { color: "#9a3412", fontSize: 12, lineHeight: 18, marginTop: 5 },
  submit: { backgroundColor: "#2563eb", borderRadius: 16, padding: 15, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 }, submitText: { color: "#fff", fontWeight: "900", fontSize: 13 }, disabled: { opacity: 0.6 }, error: { backgroundColor: "#fff1f2", color: "#be123c", borderRadius: 12, padding: 12, fontSize: 12, fontWeight: "700" },
  modalHeader: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#e2e8f0", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, modalTitle: { color: "#0f172a", fontSize: 19, fontWeight: "900" }, modalRow: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 13, padding: 14, backgroundColor: "#fff" }, modalRowTitle: { color: "#0f172a", fontWeight: "800", fontSize: 13 },
});

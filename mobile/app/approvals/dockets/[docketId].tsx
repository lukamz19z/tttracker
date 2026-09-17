import { useLocalSearchParams } from "expo-router";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Pencil,
  RotateCcw,
  Save,
  X,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PngSignaturePad } from "@/components/signatures/PngSignaturePad";
import {
  getApprovalDetail,
  reviewDocket,
  saveDocketReviewerCorrections,
} from "@/lib/api/approvals";

type Row = Record<string, unknown>;

type Detail = {
  kind: "docket";
  docket: Row;
  project: Row | null;
  tower: Row | null;
  labour: Row[];
  plant: Row[];
  delays: Row[];
  progress: Row[];
  allocations: Row[];
  materialEvents: Row[];
  transfers: Row[];
  reviewActionable?: boolean;
  selectedClientContentKeys?: string[];
  clientContentOptions: Array<{ key: string; label: string }>;
};

const clean = (value: unknown) => String(value ?? "").trim();
const numberValue = (value: unknown) => Number(value ?? 0) || 0;

function dateLabel(value: unknown) {
  const raw = clean(value);
  if (!raw) return "—";
  const date = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(date.getTime())) return raw;
  return `${String(date.getDate()).padStart(2, "0")}/${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}/${date.getFullYear()}`;
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(clean).filter(Boolean).join(", ")
    : "";
}

function parseList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function signatureApproxBytes(value: string | null) {
  if (!value) return 0;
  const base64 = value.split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

export default function DocketApprovalPage() {
  const { docketId } = useLocalSearchParams<{ docketId: string }>();
  const id = String(docketId || "");

  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [comments, setComments] = useState("");
  const [selectedContent, setSelectedContent] = useState<string[]>([]);
  const [changeDetails, setChangeDetails] = useState<Record<string, string>>({});
  const [editMode, setEditMode] = useState(false);
  const [reviewerMadeChanges, setReviewerMadeChanges] = useState(false);
  const [showProgress, setShowProgress] = useState(true);
  const [showLabour, setShowLabour] = useState(false);
  const [showDelays, setShowDelays] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const payload = await getApprovalDetail<Detail>("docket", id);
      setData(payload);
      setSelectedContent(
        payload.selectedClientContentKeys?.length
          ? payload.selectedClientContentKeys
          : payload.clientContentOptions.map((item) => item.key),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Docket could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const requests = useMemo(
    () =>
      Object.entries(changeDetails)
        .map(([category, detail]) => ({
          category,
          detail: detail.trim(),
        }))
        .filter((row) => row.detail),
    [changeDetails],
  );

  const actionable = data?.reviewActionable !== false;

  function patchDocket(field: string, value: unknown) {
    setData((current) =>
      current
        ? {
            ...current,
            docket: { ...current.docket, [field]: value },
          }
        : current,
    );
  }

  function patchArrayRow(
    key: "progress" | "labour" | "delays",
    index: number,
    field: string,
    value: unknown,
  ) {
    setData((current) => {
      if (!current) return current;
      const next = [...current[key]];
      next[index] = { ...next[index], [field]: value };
      return { ...current, [key]: next };
    });
  }

  async function saveCorrections() {
    if (!data || !actionable) return;

    setBusy("save-corrections");
    setError(null);

    try {
      await saveDocketReviewerCorrections({
        docketId: id,
        docket: {
          crew: data.docket.crew,
          leading_hand: data.docket.leading_hand,
          weather: data.docket.weather,
          rate_type: data.docket.rate_type,
          incident_occurred: data.docket.incident_occurred,
          incident_type: data.docket.incident_type,
          incident_notes: data.docket.incident_notes,
          delays_comments: data.docket.delays_comments,
          missing_items_bolts: data.docket.missing_items_bolts,
        },
        progress: data.progress,
        labour: data.labour,
        delays: data.delays,
      });

      setReviewerMadeChanges(true);
      setEditMode(false);
      Alert.alert(
        "Corrections saved",
        "Reviewer corrections are saved. Approving this docket will issue the next revision.",
      );
      await load();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Reviewer corrections could not be saved.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function submit(action: "approve" | "request_changes") {
    if (!data || !actionable) {
      Alert.alert(
        "Review unavailable",
        "This Daily Docket is no longer awaiting BC review.",
      );
      return;
    }

    if (action === "approve") {
      if (!signature) {
        Alert.alert(
          "Signature required",
          "Sign before approving the Daily Docket.",
        );
        return;
      }

      if (signatureApproxBytes(signature) > 400 * 1024) {
        Alert.alert(
          "Signature too large",
          "Clear the signature and sign again.",
        );
        return;
      }

      if (selectedContent.length === 0) {
        Alert.alert(
          "Client content required",
          "Select at least one section to include in the client Daily Docket.",
        );
        return;
      }
    }

    if (
      action === "request_changes" &&
      requests.length === 0 &&
      !comments.trim()
    ) {
      Alert.alert(
        "Changes required",
        "Enter the required correction against at least one section or add a general reviewer comment.",
      );
      return;
    }

    setBusy(action);
    setError(null);

    try {
      const result = await reviewDocket({
        docketId: id,
        action,
        comments: comments.trim(),
        changeRequests: requests,
        reviewerSignatureDataUrl: signature || undefined,
        reviewerMadeChanges,
        clientContentKeys: selectedContent,
      });

      const warning = clean(result.warning);
      Alert.alert(
        action === "approve" ? "Daily Docket approved" : "Changes requested",
        warning ||
          (action === "approve"
            ? "The controlled draft was generated and the docket was sent into the existing client approval workflow."
            : "The Daily Docket was returned to the preparer for correction."),
      );

      setSignature(null);
      setComments("");
      setChangeDetails({});
      setReviewerMadeChanges(false);
      setEditMode(false);
      await load();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Review failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator
          size="large"
          color="#2563eb"
          style={{ marginTop: 80 }}
        />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.error}>{error || "Not found"}</Text>
      </SafeAreaView>
    );
  }

  const docket = data.docket;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>BC DAILY DOCKET REVIEW</Text>
        <Text style={styles.heading}>{clean(data.tower?.name) || "Tower"}</Text>
        <Text style={styles.muted}>
          {[
            clean(data.project?.project_number),
            clean(data.project?.name),
            dateLabel(docket.docket_date),
            `R${String(Number(docket.approval_revision ?? 1)).padStart(2, "0")}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>

        {!actionable ? (
          <View style={styles.completeBanner}>
            <CheckCircle2 size={19} color="#047857" />
            <Text style={styles.completeText}>
              This docket is no longer waiting for BC review.
            </Text>
          </View>
        ) : null}

        <Card title="Site Summary">
          <Text style={styles.body}>
            {clean(docket.daily_site_summary) || "No site summary."}
          </Text>
          {Array.isArray(docket.rfi_references) && docket.rfi_references.length ? (
            <Text style={styles.muted}>
              RFIs: {(docket.rfi_references as unknown[]).map(clean).join(", ")}
            </Text>
          ) : null}
        </Card>

        <Card title="Workforce">
          <Text style={styles.metric}>
            {data.labour.length} personnel · {numberValue(docket.raw_manhours).toFixed(2)} raw MH · {numberValue(docket.production_manhours).toFixed(2)} production MH
          </Text>
          {data.labour.slice(0, 30).map((row, index) => (
            <Text key={clean(row.id) || String(index)} style={styles.row}>
              {clean(row.worker_name) || "Worker"} · {clean(row.total_hours) || "0"} h
            </Text>
          ))}
        </Card>

        <Card title="Progress">
          {data.progress.length ? (
            data.progress.map((row, index) => (
              <Text key={clean(row.id) || String(index)} style={styles.row}>
                {clean(row.section_label || row.section_code) || `Row ${index + 1}`} · Assembly {clean(row.assembly_today ?? row.assembled_qty ?? 0)} · Erection {clean(row.erection_today ?? row.erected_qty ?? 0)}
              </Text>
            ))
          ) : (
            <Text style={styles.muted}>No progress rows.</Text>
          )}
        </Card>

        <Card title="Plant / Delays">
          <Text style={styles.metric}>
            {data.plant.length} plant items · {data.delays.length} delays
          </Text>
          {data.delays.map((row, index) => (
            <Text key={clean(row.id) || String(index)} style={styles.row}>
              {clean(row.delay_type) || "Delay"} · {numberValue(row.delay_hours).toFixed(2)} h · {clean(row.delay_reason)}
            </Text>
          ))}
        </Card>

        <Card title="Materials">
          <Text style={styles.metric}>
            {data.materialEvents.length} events · {data.transfers.length} bundle transfers
          </Text>
          {data.materialEvents.map((row, index) => (
            <Text key={clean(row.id) || String(index)} style={styles.row}>
              {clean(row.event_type).replaceAll("_", " ")} · {clean(row.affected_section || row.notes)}
            </Text>
          ))}
        </Card>

        {actionable ? (
          <Card title="Reviewer Corrections">
            <Text style={styles.muted}>
              This matches the website BC review page. You can correct docket details, progress, labour times/hours and delays before approving. Saving corrections means approval will issue the next revision.
            </Text>

            {!editMode ? (
              <Pressable
                disabled={Boolean(busy)}
                onPress={() => setEditMode(true)}
                style={[styles.button, styles.editButton]}
              >
                <Pencil size={17} color="#1d4ed8" />
                <Text style={styles.editButtonText}>Edit Docket</Text>
              </Pressable>
            ) : (
              <>
                <Text style={styles.subheading}>General</Text>
                <Field label="Crew" value={textValue(docket.crew)} onChange={(value) => patchDocket("crew", value)} />
                <Field label="Leading Hand" value={textValue(docket.leading_hand)} onChange={(value) => patchDocket("leading_hand", value)} />
                <Field label="Weather" value={textValue(docket.weather)} onChange={(value) => patchDocket("weather", value)} />
                <Field label="Rate Type" value={textValue(docket.rate_type)} onChange={(value) => patchDocket("rate_type", value)} />

                <Text style={styles.label}>Incident occurred</Text>
                <View style={styles.chips}>
                  {[false, true].map((value) => {
                    const on = Boolean(docket.incident_occurred) === value;
                    return (
                      <Pressable
                        key={String(value)}
                        onPress={() => patchDocket("incident_occurred", value)}
                        style={[styles.chip, on && styles.chipOn]}
                      >
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>
                          {value ? "Yes" : "No"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Field label="Incident Type" value={textValue(docket.incident_type)} onChange={(value) => patchDocket("incident_type", value)} />
                <Field label="Incident Notes" value={textValue(docket.incident_notes)} onChange={(value) => patchDocket("incident_notes", value)} multiline />
                <Field label="Delay Comments" value={textValue(docket.delays_comments)} onChange={(value) => patchDocket("delays_comments", value)} multiline />
                <Field label="Missing Items / Bolts" value={textValue(docket.missing_items_bolts)} onChange={(value) => patchDocket("missing_items_bolts", value)} multiline />

                <EditorSection
                  title={`Progress (${data.progress.length})`}
                  open={showProgress}
                  onToggle={() => setShowProgress((value) => !value)}
                >
                  {data.progress.map((row, index) => {
                    const isV2 = clean(row.progress_model) === "section_v2";
                    return (
                      <View key={clean(row.id) || String(index)} style={styles.editRow}>
                        <Text style={styles.editRowTitle}>
                          {clean(row.section_label || row.section_code) || `Section ${index + 1}`}
                        </Text>
                        <TwoColumns>
                          <Field
                            compact
                            label="Assembly Today"
                            value={textValue(isV2 ? row.assembly_today : row.assembled_qty)}
                            onChange={(value) =>
                              patchArrayRow(
                                "progress",
                                index,
                                isV2 ? "assembly_today" : "assembled_qty",
                                value,
                              )
                            }
                            keyboard="decimal-pad"
                          />
                          <Field
                            compact
                            label="Erection Today"
                            value={textValue(isV2 ? row.erection_today : row.erected_qty)}
                            onChange={(value) =>
                              patchArrayRow(
                                "progress",
                                index,
                                isV2 ? "erection_today" : "erected_qty",
                                value,
                              )
                            }
                            keyboard="decimal-pad"
                          />
                        </TwoColumns>
                        {isV2 ? (
                          <TwoColumns>
                            <Field compact label="Assembly Overall" value={textValue(row.assembly_overall)} onChange={(value) => patchArrayRow("progress", index, "assembly_overall", value)} keyboard="decimal-pad" />
                            <Field compact label="Erection Overall" value={textValue(row.erection_overall)} onChange={(value) => patchArrayRow("progress", index, "erection_overall", value)} keyboard="decimal-pad" />
                          </TwoColumns>
                        ) : null}
                      </View>
                    );
                  })}
                </EditorSection>

                <EditorSection
                  title={`Labour (${data.labour.length})`}
                  open={showLabour}
                  onToggle={() => setShowLabour((value) => !value)}
                >
                  {data.labour.map((row, index) => (
                    <View key={clean(row.id) || String(index)} style={styles.editRow}>
                      <Text style={styles.editRowTitle}>{clean(row.worker_name) || `Worker ${index + 1}`}</Text>
                      <TwoColumns>
                        <Field compact label="Time In" value={textValue(row.time_in)} onChange={(value) => patchArrayRow("labour", index, "time_in", value)} />
                        <Field compact label="Time Out" value={textValue(row.time_out)} onChange={(value) => patchArrayRow("labour", index, "time_out", value)} />
                      </TwoColumns>
                      <TwoColumns>
                        <Field compact label="Total Hours" value={textValue(row.total_hours)} onChange={(value) => patchArrayRow("labour", index, "total_hours", value)} keyboard="decimal-pad" />
                        <Field compact label="Production Hours" value={textValue(row.production_hours)} onChange={(value) => patchArrayRow("labour", index, "production_hours", value)} keyboard="decimal-pad" />
                      </TwoColumns>
                      <TwoColumns>
                        <Field compact label="Lunch Minutes" value={textValue(row.lunch_minutes)} onChange={(value) => patchArrayRow("labour", index, "lunch_minutes", value)} keyboard="number-pad" />
                        <Field compact label="Mobilisation Hours" value={textValue(row.mobilisation_hours)} onChange={(value) => patchArrayRow("labour", index, "mobilisation_hours", value)} keyboard="decimal-pad" />
                      </TwoColumns>
                      <TwoColumns>
                        <Field compact label="Travel In Min" value={textValue(row.travel_in_minutes)} onChange={(value) => patchArrayRow("labour", index, "travel_in_minutes", value)} keyboard="number-pad" />
                        <Field compact label="Travel Out Min" value={textValue(row.travel_out_minutes)} onChange={(value) => patchArrayRow("labour", index, "travel_out_minutes", value)} keyboard="number-pad" />
                      </TwoColumns>
                      <TwoColumns>
                        <Field compact label="Delay Hours" value={textValue(row.delay_hours)} onChange={(value) => patchArrayRow("labour", index, "delay_hours", value)} keyboard="decimal-pad" />
                        <Field compact label="Delay Reason" value={textValue(row.delay_reason)} onChange={(value) => patchArrayRow("labour", index, "delay_reason", value)} />
                      </TwoColumns>
                    </View>
                  ))}
                </EditorSection>

                <EditorSection
                  title={`Delays (${data.delays.length})`}
                  open={showDelays}
                  onToggle={() => setShowDelays((value) => !value)}
                >
                  {data.delays.map((row, index) => (
                    <View key={clean(row.id) || String(index)} style={styles.editRow}>
                      <Text style={styles.editRowTitle}>Delay {index + 1}</Text>
                      <Field label="Delay Type" value={textValue(row.delay_type)} onChange={(value) => patchArrayRow("delays", index, "delay_type", value)} />
                      <Field label="Reason" value={textValue(row.delay_reason)} onChange={(value) => patchArrayRow("delays", index, "delay_reason", value)} multiline />
                      <Field label="Delay Hours" value={textValue(row.delay_hours)} onChange={(value) => patchArrayRow("delays", index, "delay_hours", value)} keyboard="decimal-pad" />
                      <Field label="Applies To" value={textValue(row.applies_to)} onChange={(value) => patchArrayRow("delays", index, "applies_to", value)} />
                      <Field label="Delay Mode" value={textValue(row.delay_applies_mode)} onChange={(value) => patchArrayRow("delays", index, "delay_applies_mode", value)} />
                      <Field label="Workers (comma separated)" value={stringList(row.worker_names)} onChange={(value) => patchArrayRow("delays", index, "worker_names", parseList(value))} />
                      <Field label="Plant (comma separated)" value={stringList(row.plant_names)} onChange={(value) => patchArrayRow("delays", index, "plant_names", parseList(value))} />
                    </View>
                  ))}
                </EditorSection>

                <View style={styles.actionRow}>
                  <Pressable
                    disabled={Boolean(busy)}
                    onPress={() => {
                      setEditMode(false);
                      void load();
                    }}
                    style={[styles.button, styles.cancelButton]}
                  >
                    <X size={17} color="#475569" />
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    disabled={Boolean(busy)}
                    onPress={() => void saveCorrections()}
                    style={[styles.button, styles.saveButton]}
                  >
                    {busy === "save-corrections" ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Save size={17} color="#fff" />
                    )}
                    <Text style={styles.buttonText}>Save Changes</Text>
                  </Pressable>
                </View>
              </>
            )}

            {reviewerMadeChanges ? (
              <View style={styles.savedBanner}>
                <CheckCircle2 size={17} color="#047857" />
                <Text style={styles.savedText}>
                  Reviewer corrections saved. Approval will issue the next revision.
                </Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        <Card title="Client Docket Sections">
          <Text style={styles.muted}>
            Select the information that will be included in the controlled client docket. These selections are passed to the same PDF/client workflow used by the website.
          </Text>
          <View style={styles.chips}>
            {data.clientContentOptions.map((option) => {
              const on = selectedContent.includes(option.key);
              return (
                <Pressable
                  key={option.key}
                  disabled={!actionable || Boolean(busy)}
                  onPress={() =>
                    setSelectedContent((current) =>
                      on
                        ? current.filter((key) => key !== option.key)
                        : [...current, option.key],
                    )
                  }
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {actionable ? (
          <Card title="Request Changes">
            <Text style={styles.muted}>
              Enter a correction against any section that needs work. The submitter will receive the change request through the normal workflow.
            </Text>
            {data.clientContentOptions.map((option) => (
              <View key={option.key} style={{ gap: 5 }}>
                <Text style={styles.label}>{option.label}</Text>
                <TextInput
                  value={changeDetails[option.label] ?? ""}
                  onChangeText={(value) =>
                    setChangeDetails((current) => ({
                      ...current,
                      [option.label]: value,
                    }))
                  }
                  placeholder="Leave blank if no change required"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                />
              </View>
            ))}
            <TextInput
              value={comments}
              onChangeText={setComments}
              placeholder="General reviewer comments"
              placeholderTextColor="#94a3b8"
              multiline
              style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
            />
            <Pressable
              disabled={Boolean(busy)}
              onPress={() => void submit("request_changes")}
              style={[styles.button, styles.warn]}
            >
              <Text style={styles.buttonText}>
                {busy === "request_changes" ? "Sending…" : "Request Changes"}
              </Text>
            </Pressable>
          </Card>
        ) : null}

        {actionable ? (
          <Card title="Approve">
            <Text style={styles.muted}>
              A BC reviewer signature is required. Approval uses the same server workflow as the website: revision handling, controlled PDF generation, SharePoint draft publication and client approval emails.
            </Text>
            <PngSignaturePad onChange={setSignature} disabled={Boolean(busy)} />
            {error ? <Text style={styles.errorInline}>{error}</Text> : null}
            <Pressable
              disabled={Boolean(busy)}
              onPress={() => void submit("approve")}
              style={[styles.button, styles.good]}
            >
              <Text style={styles.buttonText}>
                {busy === "approve" ? "Approving…" : "Approve Daily Docket"}
              </Text>
            </Pressable>
          </Card>
        ) : null}

        {!actionable && error ? <Text style={styles.errorInline}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
  keyboard = "default",
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  keyboard?: "default" | "number-pad" | "decimal-pad";
  compact?: boolean;
}) {
  return (
    <View style={[styles.field, compact && { flex: 1 }]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={keyboard}
        placeholderTextColor="#94a3b8"
        style={[
          styles.input,
          multiline && { minHeight: 72, textAlignVertical: "top" },
        ]}
      />
    </View>
  );
}

function TwoColumns({ children }: { children: React.ReactNode }) {
  return <View style={styles.twoColumns}>{children}</View>;
}

function EditorSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.editorSection}>
      <Pressable onPress={onToggle} style={styles.editorSectionHeader}>
        <Text style={styles.editorSectionTitle}>{title}</Text>
        {open ? (
          <ChevronUp size={18} color="#475569" />
        ) : (
          <ChevronDown size={18} color="#475569" />
        )}
      </Pressable>
      {open ? <View style={styles.editorSectionBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 18, gap: 14, paddingBottom: 40 },
  eyebrow: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: "#2563eb",
  },
  heading: { fontSize: 29, fontWeight: "900", color: "#0f172a" },
  muted: { color: "#64748b", lineHeight: 20 },
  body: { color: "#334155", lineHeight: 22 },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  cardTitle: { fontSize: 17, fontWeight: "900", color: "#0f172a" },
  subheading: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 4,
  },
  metric: { fontWeight: "900", color: "#0f172a" },
  row: { paddingVertical: 5, color: "#475569" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 99,
  },
  chipOn: { backgroundColor: "#dbeafe", borderColor: "#60a5fa" },
  chipText: { fontWeight: "700", color: "#475569", fontSize: 12 },
  chipTextOn: { color: "#1d4ed8" },
  field: { gap: 5 },
  label: { fontWeight: "800", color: "#334155", fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 11,
    padding: 11,
    backgroundColor: "#fff",
    color: "#0f172a",
  },
  button: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  warn: { backgroundColor: "#d97706" },
  good: { backgroundColor: "#047857" },
  buttonText: { color: "#fff", fontWeight: "900" },
  editButton: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  editButtonText: { color: "#1d4ed8", fontWeight: "900" },
  cancelButton: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  cancelButtonText: { color: "#475569", fontWeight: "900" },
  saveButton: { flex: 1, backgroundColor: "#1d4ed8" },
  actionRow: { flexDirection: "row", gap: 8 },
  error: { margin: 18, padding: 12, color: "#be123c" },
  errorInline: { color: "#be123c", fontWeight: "700" },
  completeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    backgroundColor: "#ecfdf5",
    borderRadius: 14,
    padding: 12,
  },
  completeText: { flex: 1, color: "#047857", fontWeight: "800" },
  savedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    backgroundColor: "#ecfdf5",
    borderRadius: 12,
    padding: 10,
  },
  savedText: { flex: 1, color: "#047857", fontSize: 12, fontWeight: "800" },
  editorSection: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    overflow: "hidden",
  },
  editorSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#f8fafc",
  },
  editorSectionTitle: { color: "#0f172a", fontWeight: "900" },
  editorSectionBody: { padding: 10, gap: 10 },
  editRow: {
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  editRowTitle: { color: "#0f172a", fontWeight: "900" },
  twoColumns: { flexDirection: "row", gap: 8 },
});

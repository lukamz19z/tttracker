import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PngSignaturePad } from "@/components/signatures/PngSignaturePad";
import {
  calculateDelaySummaryByType,
  calculateLabourTotals,
  calculateProgressTotals,
  calculateTotalPlantDelayHours,
  toNumber,
} from "@/lib/dockets/calculations";
import type {
  DailyDocketDraft,
  DailyDocketEditorPayload,
} from "@/types/daily-dockets";

type Props = {
  payload: DailyDocketEditorPayload;
  draft: DailyDocketDraft;
  onChange: (next: DailyDocketDraft) => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  saving?: boolean;
  submitting?: boolean;
  disabled?: boolean;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.cardSub}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export function DailyDocketReviewSubmit({
  payload,
  draft,
  onChange,
  onSaveDraft,
  onSubmit,
  saving = false,
  submitting = false,
  disabled = false,
}: Props) {
  const locked =
    disabled ||
    ["submitted_bc", "client_pending", "final", "legacy_final"].includes(
      clean(draft.approvalStatus),
    );

  const setDraft = (patch: Partial<DailyDocketDraft>) => {
    if (locked) return;
    onChange({ ...draft, ...patch });
  };

  const labour = useMemo(
    () =>
      calculateLabourTotals(draft.labourRows, draft.delayRows, {
        enabled: draft.mobilisation.enabled,
        durationMinutes:
          Math.max(0, toNumber(draft.mobilisationHours)) * 60,
        workerNames: draft.mobilisation.worker_names,
      }),
    [
      draft.delayRows,
      draft.labourRows,
      draft.mobilisation.enabled,
      draft.mobilisation.worker_names,
      draft.mobilisationHours,
    ],
  );

  const progress = useMemo(
    () =>
      calculateProgressTotals({
        progressModel: draft.progressModel,
        sectionV2Rows: draft.sectionV2Rows,
        legacyRows: draft.legacyProgressRows,
        hasBodyExtension: draft.hasBodyExtension,
      }),
    [
      draft.hasBodyExtension,
      draft.legacyProgressRows,
      draft.progressModel,
      draft.sectionV2Rows,
    ],
  );

  const delaySummary = useMemo(
    () => calculateDelaySummaryByType(draft.delayRows),
    [draft.delayRows],
  );

  const revisionMh = useMemo(
    () =>
      draft.towerRevisionAllocations.reduce(
        (sum, row) =>
          sum +
          Math.max(0, toNumber(row.hours)) * row.worker_names.length,
        0,
      ),
    [draft.towerRevisionAllocations],
  );

  const additionalShare = useMemo(
    () =>
      draft.additionalTowerWork.reduce(
        (sum, row) => sum + Math.max(0, toNumber(row.allocation_percent)),
        0,
      ),
    [draft.additionalTowerWork],
  );

  const materialCount = draft.materialEvents.reduce(
    (sum, event) => sum + event.items.length,
    0,
  );

  const rfiText = draft.rfiReferences.join(", ");

  const canSubmit = Boolean(
    !locked &&
      !saving &&
      !submitting &&
      clean(draft.leadingHand) &&
      labour.workerCount > 0 &&
      clean(draft.bcRepName) &&
      clean(draft.bcSignatureDataUrl),
  );

  return (
    <View style={styles.stack}>
      <View style={styles.metricRow}>
        <Metric label="Workers" value={String(labour.workerCount)} />
        <Metric label="Raw MH" value={labour.rawManhours.toFixed(1)} />
        <Metric
          label="Prod MH"
          value={labour.productionManhours.toFixed(1)}
        />
      </View>

      <View style={styles.metricRow}>
        <Metric
          label="Assembly"
          value={`${progress.assemblyPercent.toFixed(1)}%`}
        />
        <Metric
          label="Erection"
          value={`${progress.erectionPercent.toFixed(1)}%`}
        />
        <Metric
          label="Overall"
          value={`${progress.totalProgressPercent.toFixed(1)}%`}
        />
      </View>

      <Card
        title="Daily Site Summary"
        subtitle="This is the general site narrative. It is intentionally separate from delay reasons."
      >
        <TextInput
          editable={!locked}
          multiline
          textAlignVertical="top"
          value={draft.dailySiteSummary}
          onChangeText={(dailySiteSummary) =>
            setDraft({ dailySiteSummary })
          }
          placeholder="Summarise the work completed, major site conditions, coordination and anything the client should know."
          placeholderTextColor="#94a3b8"
          style={styles.textArea}
        />

        <Text style={styles.label}>RFI references</Text>
        <TextInput
          editable={!locked}
          value={rfiText}
          onChangeText={(value) =>
            setDraft({
              rfiReferences: value
                .split(/[,;\n]/)
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
          placeholder="RFI-001, RFI-014"
          placeholderTextColor="#94a3b8"
          style={styles.input}
        />
      </Card>

      <Card title="Operational Review">
        <SummaryRow
          label="Primary tower"
          value={
            payload.towers.find((tower) => tower.id === draft.towerId)?.name ||
            "Tower"
          }
        />
        <SummaryRow
          label="Crew / Leading Hand"
          value={[draft.crewName, draft.leadingHand]
            .filter(Boolean)
            .join(" · ") || "—"}
        />
        <SummaryRow
          label="Revision / Rectification"
          value={`${revisionMh.toFixed(2)} MH`}
        />
        <SummaryRow
          label="Additional tower allocation"
          value={`${additionalShare.toFixed(1)}%`}
        />
        <SummaryRow
          label="Delay events"
          value={`${draft.delayRows.length} · ${draft.delayRows
            .reduce((sum, row) => sum + Math.max(0, toNumber(row.delay_hours)), 0)
            .toFixed(2)} event-hours`}
        />
        <SummaryRow
          label="Plant delay"
          value={`${calculateTotalPlantDelayHours(
            draft.delayRows,
          ).toFixed(2)} h`}
        />
        <SummaryRow
          label="Material events / items"
          value={`${draft.materialEvents.length} / ${materialCount}`}
        />
        <SummaryRow
          label="Bundle transfers"
          value={String(
            draft.bundleTransfers.length + draft.activeBundleTransfers.length,
          )}
        />
        <SummaryRow
          label="Linked Defects"
          value={String(draft.linkedDefects.length)}
        />
        <SummaryRow
          label="Incident / Safety"
          value={
            draft.incidentOccurred
              ? draft.incidentType.replace(/_/g, " ") || "Recorded"
              : "None"
          }
        />

        {Object.entries(delaySummary).some(([, value]) => value > 0) ? (
          <View style={styles.delayBreakdown}>
            <Text style={styles.label}>Delay breakdown</Text>
            <View style={styles.pills}>
              {Object.entries(delaySummary)
                .filter(([, value]) => value > 0)
                .map(([key, value]) => (
                  <View key={key} style={styles.pill}>
                    <Text style={styles.pillText}>
                      {key.replace(/_/g, " ")} · {value.toFixed(2)}h
                    </Text>
                  </View>
                ))}
            </View>
          </View>
        ) : null}
      </Card>

      <Card
        title="BC Representative"
        subtitle="The signer is the logged-in TTTracker account. It is not a free-text representative field."
      >
        <View style={styles.identity}>
          <View style={styles.identityIcon}>
            <Ionicons name="person" size={20} color="#1d4ed8" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.identityName}>
              {draft.bcRepName || payload.identity.name}
            </Text>
            <Text style={styles.identityEmail}>
              {draft.bcRepEmail || payload.identity.email}
            </Text>
          </View>
          <Ionicons
            name="shield-checkmark"
            size={22}
            color="#15803d"
          />
        </View>

        {draft.bcSignatureDataUrl ? (
          <View style={styles.signatureCaptured}>
            <Ionicons
              name="checkmark-circle"
              size={18}
              color="#15803d"
            />
            <Text style={styles.signatureCapturedText}>
              Signature captured. Sign again below only if it needs replacing.
            </Text>
          </View>
        ) : null}

        <PngSignaturePad
          disabled={locked}
          onChange={(dataUrl) =>
            setDraft({
              bcSignatureDataUrl: dataUrl || "",
              bcSignedAt: dataUrl ? new Date().toISOString() : "",
            })
          }
        />
      </Card>

      {!locked ? (
        <View style={styles.actions}>
          <Pressable
            disabled={saving || submitting}
            onPress={onSaveDraft}
            style={[
              styles.saveButton,
              (saving || submitting) && styles.disabled,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#1d4ed8" />
            ) : (
              <Ionicons
                name="save-outline"
                size={19}
                color="#1d4ed8"
              />
            )}
            <Text style={styles.saveText}>Save Draft</Text>
          </Pressable>

          <Pressable
            disabled={!canSubmit}
            onPress={onSubmit}
            style={[
              styles.submitButton,
              !canSubmit && styles.disabled,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons
                name="send"
                size={19}
                color="#fff"
              />
            )}
            <Text style={styles.submitText}>
              Submit for BC Approval
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.locked}>
          <Ionicons name="lock-closed" size={19} color="#9a3412" />
          <Text style={styles.lockedText}>
            This Daily Docket is locked at{" "}
            {draft.approvalStatus.replace(/_/g, " ")}.
          </Text>
        </View>
      )}

      {!canSubmit && !locked ? (
        <Text style={styles.submitHelper}>
          Submit requires a Leading Hand, at least one worker, the logged-in BC
          representative and a signature.
        </Text>
      ) : null}
    </View>
  );
}

export default DailyDocketReviewSubmit;

const styles = StyleSheet.create({
  stack: { gap: 14 },
  card: {
    padding: 15,
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  cardTitle: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900",
  },
  cardSub: {
    marginTop: -6,
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
  },
  metricRow: {
    flexDirection: "row",
    gap: 8,
  },
  metric: {
    flex: 1,
    minHeight: 82,
    justifyContent: "center",
    padding: 11,
    borderRadius: 14,
    backgroundColor: "#0f172a",
  },
  metricValue: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },
  metricLabel: {
    marginTop: 3,
    color: "#cbd5e1",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  label: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  textArea: {
    minHeight: 118,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    color: "#0f172a",
    fontSize: 14,
    backgroundColor: "#fff",
  },
  input: {
    minHeight: 45,
    paddingHorizontal: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    color: "#0f172a",
    fontSize: 14,
    backgroundColor: "#fff",
  },
  summaryRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  summaryLabel: {
    flex: 1,
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
  },
  summaryValue: {
    flex: 1.25,
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "right",
  },
  delayBreakdown: { gap: 7 },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  pill: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
  },
  pillText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 13,
    backgroundColor: "#eff6ff",
  },
  identityIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#dbeafe",
  },
  identityName: {
    color: "#172554",
    fontWeight: "900",
    fontSize: 13,
  },
  identityEmail: {
    marginTop: 2,
    color: "#475569",
    fontSize: 11,
  },
  signatureCaptured: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 10,
    borderRadius: 11,
    backgroundColor: "#ecfdf5",
  },
  signatureCapturedText: {
    flex: 1,
    color: "#166534",
    fontSize: 10,
    fontWeight: "800",
  },
  actions: {
    flexDirection: "row",
    gap: 9,
  },
  saveButton: {
    flex: 1,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#93c5fd",
    backgroundColor: "#eff6ff",
  },
  saveText: {
    color: "#1d4ed8",
    fontWeight: "900",
    fontSize: 12,
  },
  submitButton: {
    flex: 1.35,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 13,
    backgroundColor: "#2563eb",
  },
  submitText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
  },
  disabled: { opacity: 0.45 },
  submitHelper: {
    color: "#64748b",
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
  },
  locked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  lockedText: {
    flex: 1,
    color: "#9a3412",
    fontSize: 11,
    fontWeight: "800",
  },
});
